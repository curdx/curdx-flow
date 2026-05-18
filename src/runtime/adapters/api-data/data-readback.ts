import { summarizeArtifactText } from '../../evidence/index.ts';
import type { EvidenceBlock } from '../../contracts/index.ts';
import type { ExpectedDataOutcome } from '../../planner/index.ts';
import type { ApiEvidenceMatch } from './types.ts';
import type {
  DataPrivacySummary,
  DataReadbackBlocker,
  DataReadbackBlockerLayer,
  DataReadbackDiagnostic,
  DataReadbackEvidenceResult,
  DataReadbackMatch,
  EvaluateDataReadbackEvidenceInput,
  ObservedDataReadback,
} from './data-types.ts';

interface RedactedSummary {
  summary: string;
  redacted: boolean;
  truncated: boolean;
}

interface EvaluationState {
  matches: DataReadbackMatch[];
  blockers: DataReadbackBlocker[];
  diagnostics: DataReadbackDiagnostic[];
  redacted: boolean;
  truncated: boolean;
  containsSensitiveData: boolean;
}

export function evaluateDataReadbackEvidence(
  input: EvaluateDataReadbackEvidenceInput,
): DataReadbackEvidenceResult {
  const generatedAt = toIso(input.generatedAt);
  const state: EvaluationState = {
    matches: [],
    blockers: [],
    diagnostics: [],
    redacted: false,
    truncated: false,
    containsSensitiveData: false,
  };

  for (const expectation of input.journey.expectedData) {
    evaluateExpectation(input, expectation, state);
  }

  if (input.journey.expectedData.length === 0) {
    state.diagnostics.push({
      code: 'data-expectation-missing',
      message: `Journey ${input.journey.id} does not define expected data outcomes.`,
    });
  }

  const status = determineStatus(state);
  const evidence = buildEvidence(input, state, status, generatedAt);

  return {
    schemaVersion: 1,
    ok: status === 'passed',
    status,
    capabilityId: input.capabilityId,
    inputs: {
      runId: input.runId,
      goalId: input.goalId,
      mode: input.mode,
      journeyId: input.journey.id,
    },
    evidence: [evidence],
    blockers: state.blockers,
    artifacts: [],
    diagnostics: state.diagnostics,
    retryable: state.blockers.some((blocker) => blocker.retryable),
    confidence: confidenceFor(status),
    durationMs: durationMsFromMatches(state.matches),
    matches: state.matches,
  };
}

function evaluateExpectation(
  input: EvaluateDataReadbackEvidenceInput,
  expectation: ExpectedDataOutcome,
  state: EvaluationState,
): void {
  const readback = input.observedReadbacks.find((entry) =>
    entry.actionId === expectation.actionId &&
    targetMatches(entry.target, expectation.target)
  );

  if (!readback) {
    const degraded = input.observedReadbacks.find((entry) =>
      (entry.actionId === undefined || entry.actionId.length === 0) &&
      targetMatches(entry.target, expectation.target) &&
      isDegradedSource(entry)
    );
    if (degraded) {
      const match = matchFromReadback(expectation, degraded, state);
      state.matches.push(match);
      state.blockers.push(blocker({
        code: 'data-unbound-degraded',
        category: 'data',
        message: `Observed ${expectation.target} readback from ${degraded.source}, but it is not bound to action ${expectation.actionId}.`,
        expectation,
        observedSummary: match.observedSummary,
        possibleLayer: 'mock-or-fixture',
        nextAction: 'Capture data readback from the same user action and API evidence before using it as journey evidence.',
        retryable: true,
      }));
      return;
    }

    state.blockers.push(blocker({
      code: 'data-readback-missing',
      category: 'data',
      message: `Expected readback for ${expectation.target} after action ${expectation.actionId}, but no matching data observation was recorded.`,
      expectation,
      possibleLayer: 'database',
      nextAction: 'Run a page refresh, API query, database/file/state read, queue check, or project verification command for this action.',
      retryable: true,
    }));
    return;
  }

  const match = matchFromReadback(expectation, readback, state);
  state.matches.push(match);

  const apiEvidence = matchingApiEvidence(input.apiMatches, expectation.actionId, readback);
  if (!apiEvidence) {
    state.blockers.push(blocker({
      code: input.apiMatches.some((entry) => entry.actionId === expectation.actionId)
        ? 'data-api-evidence-unbound'
        : 'data-api-evidence-missing',
      category: 'api',
      message: `Data readback for ${expectation.target} is not linked to matching API evidence for action ${expectation.actionId}.`,
      expectation,
      observedSummary: match.observedSummary,
      possibleLayer: 'api-evidence',
      apiEvidenceRef: readback.apiEventId ?? readback.apiEvidenceId,
      nextAction: 'Bind the readback to the API event produced by the same user action, then rerun closure verification.',
      retryable: true,
    }));
  } else if (isDegradedApiSource(apiEvidence)) {
    state.blockers.push(blocker({
      code: 'data-api-evidence-degraded',
      category: 'api',
      message: `Data readback is linked to degraded API evidence ${apiEvidence.eventId}; it cannot close a real full-stack journey alone.`,
      expectation,
      observedSummary: match.observedSummary,
      possibleLayer: 'api-evidence',
      apiEvidenceRef: apiEvidence.eventId,
      nextAction: 'Capture browser-network API evidence from the real user action before claiming full-stack persistence.',
      retryable: true,
    }));
  } else if (!isSuccessfulApiStatus(apiEvidence.status)) {
    state.blockers.push(blocker({
      code: 'data-api-evidence-failed',
      category: 'api',
      message: `Data readback is linked to API evidence ${apiEvidence.eventId}, but that API status was ${apiEvidence.status}.`,
      expectation,
      observedSummary: match.observedSummary,
      possibleLayer: 'api-evidence',
      apiEvidenceRef: apiEvidence.eventId,
      nextAction: 'Fix the API request/response failure before using data readback as full-stack closure evidence.',
      retryable: true,
    }));
  }

  if (isDegradedSource(readback)) {
    state.blockers.push(blocker({
      code: 'data-mock-degraded',
      category: 'data',
      message: `Data readback ${readback.id} came from ${readback.source}; it cannot prove real persistence.`,
      expectation,
      observedSummary: match.observedSummary,
      possibleLayer: 'mock-or-fixture',
      apiEvidenceRef: match.apiEventId ?? match.apiEvidenceId,
      nextAction: 'Use a real readback path such as refresh, API query, database/file/state read, queue check, or project verification command.',
      retryable: true,
    }));
  }

  const missingMetadata = missingDataMetadata(readback);
  if (missingMetadata.length > 0) {
    state.blockers.push(blocker({
      code: 'data-test-metadata-missing',
      category: 'data',
      message: `Data readback metadata is incomplete: ${missingMetadata.join(', ')}.`,
      expectation,
      observedSummary: match.observedSummary,
      possibleLayer: 'database',
      apiEvidenceRef: match.apiEventId ?? match.apiEvidenceId,
      nextAction: 'Record data identifier summary, creation method, privacy classification, and cleanup strategy before using readback as completion evidence.',
      retryable: true,
    }));
  }

  if (match.privacy.containsSensitiveData && !match.privacy.redacted) {
    state.blockers.push(blocker({
      code: 'data-sensitive-summary-unredacted',
      category: 'data',
      message: 'Data readback is marked sensitive but no redaction was recorded.',
      expectation,
      observedSummary: match.observedSummary,
      possibleLayer: 'database',
      apiEvidenceRef: match.apiEventId ?? match.apiEvidenceId,
      nextAction: 'Replace the readback with a redacted safe summary before using it as evidence.',
      retryable: true,
    }));
  }

  if (readback.failureCode) {
    const failureSummary = readback.failureSummary ? redactDataSummary(readback.failureSummary) : null;
    if (failureSummary) {
      state.redacted = state.redacted || failureSummary.redacted;
      state.truncated = state.truncated || failureSummary.truncated;
      state.containsSensitiveData = state.containsSensitiveData || failureSummary.redacted;
    }
    state.blockers.push(blocker({
      code: 'data-source-unavailable',
      category: failureCategory(readback.failureCode),
      message: failureSummary?.summary ?? `Data readback failed with ${readback.failureCode}.`,
      expectation,
      observedSummary: [failureSummary?.summary, match.observedSummary].filter(Boolean).join('; '),
      possibleLayer: failureLayer(readback.failureCode),
      apiEvidenceRef: match.apiEventId ?? match.apiEvidenceId,
      nextAction: 'Restore the required data source, secret, external service, or readback command and rerun the same user journey.',
      retryable: true,
    }));
    return;
  }

  if (readback.consistent === false) {
    state.blockers.push(blocker({
      code: 'data-readback-mismatch',
      category: 'data',
      message: 'UI/API appeared successful but the data readback did not match the expected persisted state.',
      expectation,
      observedSummary: match.observedSummary,
      possibleLayer: 'database',
      apiEvidenceRef: match.apiEventId ?? match.apiEvidenceId,
      nextAction: 'Inspect backend handling, cache invalidation, transaction commit, database writes, state synchronization, and frontend render read paths.',
      retryable: true,
    }));
  } else if (readback.consistent !== true) {
    state.blockers.push(blocker({
      code: 'data-readback-unverified',
      category: 'data',
      message: `Readback for ${expectation.target} did not record a consistency result.`,
      expectation,
      observedSummary: match.observedSummary,
      possibleLayer: 'database',
      apiEvidenceRef: match.apiEventId ?? match.apiEvidenceId,
      nextAction: 'Record an explicit readback consistency result before using data evidence for completion.',
      retryable: true,
    }));
  }
}

function matchFromReadback(
  expectation: ExpectedDataOutcome,
  readback: ObservedDataReadback,
  state: EvaluationState,
): DataReadbackMatch {
  const expectedSummary = redactDataSummary(readback.expectedSummary);
  const observedSummary = redactDataSummary(readback.observedSummary);
  const dataId = readback.dataIdSummary ? redactDataSummary(readback.dataIdSummary) : null;
  const privacy = readback.privacy;

  state.redacted = state.redacted || expectedSummary.redacted || observedSummary.redacted || dataId?.redacted === true || privacy?.redacted === true;
  state.truncated = state.truncated || expectedSummary.truncated || observedSummary.truncated || dataId?.truncated === true || privacy?.summaryTruncated === true;
  state.containsSensitiveData = state.containsSensitiveData || state.redacted || privacy?.containsSensitiveData === true;

  return {
    readbackId: readback.id,
    actionId: expectation.actionId,
    apiEventId: readback.apiEventId,
    apiEvidenceId: readback.apiEvidenceId,
    strategy: readback.strategy,
    target: readback.target,
    expectedSummary: expectedSummary.summary,
    observedSummary: observedSummary.summary,
    consistent: typeof readback.consistent === 'boolean' ? readback.consistent : null,
    source: readback.source,
    dataIdSummary: dataId?.summary,
    createdBy: readback.createdBy,
    cleanupStrategy: readback.cleanupStrategy,
    privacy: {
      classification: privacy?.classification ?? 'local-only',
      containsSensitiveData: privacy?.containsSensitiveData === true || expectedSummary.redacted || observedSummary.redacted || dataId?.redacted === true,
      redacted: privacy?.redacted === true || expectedSummary.redacted || observedSummary.redacted || dataId?.redacted === true,
      summaryTruncated: privacy?.summaryTruncated === true || expectedSummary.truncated || observedSummary.truncated || dataId?.truncated === true,
    },
    uiState: readback.uiState,
    apiStatus: readback.apiStatus,
    timing: {
      startedAt: readback.startedAt,
      completedAt: readback.completedAt,
    },
  };
}

function buildEvidence(
  input: EvaluateDataReadbackEvidenceInput,
  state: EvaluationState,
  status: EvidenceBlock['status'],
  generatedAt: string,
): EvidenceBlock {
  const actionIds = unique(state.matches.map((match) => match.actionId));
  const trustLevel = state.matches.length > 0 && state.matches.every((match) => !isDegradedReadbackMatch(match))
    ? 'verified'
    : 'degraded';
  const timing = evidenceTiming(state.matches, generatedAt);
  return {
    schemaVersion: 1,
    id: `data-${safePathSegment(input.runId)}-${safePathSegment(input.journey.id)}`,
    runId: input.runId,
    goalId: input.goalId,
    source: 'data',
    capabilityId: input.capabilityId,
    trustLevel,
    status,
    summary: dataSummary(input, state, status),
    artifacts: [],
    startedAt: timing.startedAt,
    completedAt: timing.completedAt,
    freshness: {
      validatedAt: generatedAt,
      targetSummary: `${input.journey.id} data expectations`,
    },
    privacy: {
      classification: privacyClassification(state.matches),
      containsSensitiveData: state.containsSensitiveData,
      redacted: state.redacted,
      summaryTruncated: state.truncated,
    },
    redactions: state.redacted ? [{ reason: 'data-sensitive-summary-redacted' }] : [],
    journeyId: input.journey.id,
    actionIds,
    dataMatches: state.matches,
    unverifiedScope: status === 'passed' ? [] : state.blockers.map((entry) => entry.message),
  };
}

function matchingApiEvidence(
  apiMatches: ApiEvidenceMatch[],
  actionId: string,
  readback: ObservedDataReadback,
): ApiEvidenceMatch | null {
  if (!readback.apiEventId && !readback.apiEvidenceId) return null;
  return apiMatches.find((entry) =>
    entry.actionId === actionId &&
    (entry.eventId === readback.apiEventId || entry.eventId === readback.apiEvidenceId)
  ) ?? null;
}

function determineStatus(state: EvaluationState): EvidenceBlock['status'] {
  if (state.blockers.some((entry) =>
    entry.code === 'data-readback-missing' ||
    entry.code === 'data-readback-unverified' ||
    entry.code === 'data-source-unavailable' ||
    entry.code === 'data-api-evidence-missing' ||
    entry.code === 'data-api-evidence-unbound' ||
    entry.code === 'data-test-metadata-missing' ||
    entry.code === 'data-sensitive-summary-unredacted'
  )) {
    return 'blocked';
  }
  if (state.blockers.some((entry) =>
    entry.code === 'data-readback-mismatch' ||
    entry.code === 'data-api-evidence-failed'
  )) {
    return 'failed';
  }
  if (state.blockers.some((entry) =>
    entry.code === 'data-mock-degraded' ||
    entry.code === 'data-unbound-degraded' ||
    entry.code === 'data-api-evidence-degraded'
  )) {
    return 'degraded';
  }
  if (state.matches.length === 0) return 'blocked';
  return 'passed';
}

function blocker(input: {
  code: string;
  category: DataReadbackBlocker['category'];
  message: string;
  expectation: ExpectedDataOutcome;
  observedSummary?: string;
  possibleLayer: DataReadbackBlockerLayer;
  apiEvidenceRef?: string;
  nextAction: string;
  retryable: boolean;
}): DataReadbackBlocker {
  return {
    code: input.code,
    category: input.category,
    message: input.message,
    actionId: input.expectation.actionId,
    target: input.expectation.target,
    readback: input.expectation.readback,
    apiEvidenceRef: input.apiEvidenceRef,
    observedSummary: input.observedSummary,
    possibleLayer: input.possibleLayer,
    nextAction: {
      owner: 'agent',
      summary: input.nextAction,
    },
    owner: 'agent',
    riskLevel: input.code === 'data-source-unavailable' ? 'critical' : 'high',
    evidenceRefs: [],
    retryable: input.retryable,
  };
}

function redactDataSummary(value: string): RedactedSummary {
  const jsonRedacted = value.replace(
    /(["']?)([A-Za-z0-9_-]*(?:token|api[_-]?key|secret|password|session|cookie)[A-Za-z0-9_-]*)\1\s*:\s*("[^"]*"|'[^']*'|[^,\s}]+)/gi,
    '$1$2$1:"[REDACTED]"',
  );
  const summary = summarizeArtifactText(jsonRedacted);
  return {
    summary: summary.summary,
    redacted: summary.redacted || jsonRedacted !== value,
    truncated: summary.truncated,
  };
}

function isDegradedSource(readback: Pick<ObservedDataReadback, 'source' | 'createdBy'>): boolean {
  return isDegradedReadbackSource(readback.source) || readback.createdBy === 'fixture' || readback.createdBy === 'manual';
}

function isDegradedReadbackSource(source: string): boolean {
  return source === 'mock' || source === 'fixture' || source === 'stub' || source === 'dev-only' || source === 'manual';
}

function isDegradedReadbackMatch(match: Pick<DataReadbackMatch, 'source' | 'createdBy'>): boolean {
  return isDegradedReadbackSource(match.source) || match.createdBy === 'fixture' || match.createdBy === 'manual';
}

function isDegradedApiSource(match: Pick<ApiEvidenceMatch, 'source'>): boolean {
  return match.source === 'curl' || match.source === 'mock' || match.source === 'fixture' || match.source === 'manual';
}

function isSuccessfulApiStatus(status: number): boolean {
  return status >= 200 && status < 400;
}

function targetMatches(actual: string, expected: string): boolean {
  return actual === expected;
}

function missingDataMetadata(readback: ObservedDataReadback): string[] {
  const missing: string[] = [];
  if (!readback.dataIdSummary || readback.dataIdSummary.trim().length === 0) missing.push('dataIdSummary');
  if (readback.createdBy === 'unknown') missing.push('createdBy');
  if (!readback.cleanupStrategy || readback.cleanupStrategy.trim().length === 0) missing.push('cleanupStrategy');
  if (!readback.privacy) missing.push('privacy');
  return missing;
}

function failureCategory(code: string): DataReadbackBlocker['category'] {
  if (code === 'external-service-unavailable') return 'external-service';
  if (code === 'missing-secret' || code === 'database-unavailable') return 'environment';
  return 'data';
}

function failureLayer(code: string): DataReadbackBlockerLayer {
  if (code === 'external-service-unavailable') return 'external-service';
  if (code === 'missing-secret') return 'environment';
  if (code === 'database-unavailable') return 'database';
  return 'state-sync';
}

function privacyClassification(matches: DataReadbackMatch[]): DataPrivacySummary['classification'] {
  const order: DataPrivacySummary['classification'][] = ['public', 'internal', 'local-only', 'confidential', 'secret'];
  return matches.reduce<DataPrivacySummary['classification']>((highest, match) => {
    const current = match.privacy.classification;
    return order.indexOf(current) > order.indexOf(highest) ? current : highest;
  }, 'local-only');
}

function dataSummary(
  input: EvaluateDataReadbackEvidenceInput,
  state: EvaluationState,
  status: EvidenceBlock['status'],
): string {
  return `Data readback evidence for journey ${input.journey.id} ${status}; matches: ${state.matches.length}; blockers: ${state.blockers.length}.`;
}

function durationMsFromMatches(matches: DataReadbackMatch[]): number {
  return matches.reduce((total, match) => {
    const start = Date.parse(match.timing.startedAt);
    const end = Date.parse(match.timing.completedAt);
    if (Number.isNaN(start) || Number.isNaN(end)) return total;
    return total + Math.max(0, end - start);
  }, 0);
}

function evidenceTiming(matches: DataReadbackMatch[], fallback: string): DataReadbackTimingRange {
  const ranges = matches
    .map((match) => ({
      start: Date.parse(match.timing.startedAt),
      end: Date.parse(match.timing.completedAt),
    }))
    .filter((range) => !Number.isNaN(range.start) && !Number.isNaN(range.end));

  if (ranges.length === 0) {
    return { startedAt: fallback, completedAt: fallback };
  }

  return {
    startedAt: new Date(Math.min(...ranges.map((range) => range.start))).toISOString(),
    completedAt: new Date(Math.max(...ranges.map((range) => range.end))).toISOString(),
  };
}

interface DataReadbackTimingRange {
  startedAt: string;
  completedAt: string;
}

function confidenceFor(status: EvidenceBlock['status']): number {
  if (status === 'passed') return 0.9;
  if (status === 'degraded') return 0.5;
  if (status === 'failed') return 0.35;
  return 0.2;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function safePathSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]/g, '_');
  return cleaned.length > 0 ? cleaned : 'data';
}

function toIso(value?: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}
