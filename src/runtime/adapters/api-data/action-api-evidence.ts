import { redactSensitiveText } from '../../evidence/index.ts';
import type { EvidenceBlock } from '../../contracts/index.ts';
import type { ExpectedApiInteraction } from '../../planner/index.ts';
import type {
  ActionApiEvidenceResult,
  ApiEvidenceBlocker,
  ApiEvidenceDiagnostic,
  ApiEvidenceMatch,
  EvaluateActionApiEvidenceInput,
  ObservedApiEvent,
} from './types.ts';

interface RedactedSummary {
  summary: string;
  redacted: boolean;
  truncated: boolean;
}

interface EvaluationState {
  matches: ApiEvidenceMatch[];
  blockers: ApiEvidenceBlocker[];
  diagnostics: ApiEvidenceDiagnostic[];
  redacted: boolean;
  truncated: boolean;
}

export function evaluateActionApiEvidence(input: EvaluateActionApiEvidenceInput): ActionApiEvidenceResult {
  const generatedAt = toIso(input.generatedAt);
  const state: EvaluationState = {
    matches: [],
    blockers: [],
    diagnostics: [],
    redacted: false,
    truncated: false,
  };

  for (const expectation of input.journey.expectedApi) {
    evaluateExpectation(input, expectation, state);
  }

  if (input.journey.expectedApi.length === 0) {
    state.diagnostics.push({
      code: 'api-expectation-missing',
      message: `Journey ${input.journey.id} does not define expected API interactions.`,
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
  input: EvaluateActionApiEvidenceInput,
  expectation: ExpectedApiInteraction,
  state: EvaluationState,
): void {
  const exactMatch = input.observedEvents.find((event) =>
    event.actionId === expectation.actionId &&
    sameMethod(event.method, expectation.method) &&
    urlMatches(event.url, expectation.urlPattern)
  );

  if (!exactMatch) {
    const unbound = input.observedEvents.find((event) =>
      (event.actionId === undefined || event.actionId.length === 0) &&
      sameMethod(event.method, expectation.method) &&
      urlMatches(event.url, expectation.urlPattern)
    );
    if (unbound && isDegradedSource(unbound)) {
      const match = matchFromEvent(expectation, unbound, state);
      state.matches.push(match);
      state.blockers.push(blocker({
        code: 'api-unbound-degraded',
        category: 'api',
        message: `Observed ${expectation.method} ${expectation.urlPattern} from ${unbound.source}, but it is not bound to action ${expectation.actionId}.`,
        expectation,
        observedStatus: unbound.status,
        observedSummary: match.responseSummary,
        possibleLayer: 'mock-or-fixture',
        nextAction: 'Capture the API request from browser/network execution of the same user action before using it as journey evidence.',
        retryable: true,
      }));
      return;
    }

    state.blockers.push(blocker({
      code: 'api-request-missing',
      category: 'api',
      message: `Expected ${expectation.method} ${expectation.urlPattern} for action ${expectation.actionId}, but no matching request was observed.`,
      expectation,
      possibleLayer: 'frontend-or-network',
      nextAction: 'Rerun the user action with network capture and verify the frontend triggers the expected API request.',
      retryable: true,
    }));
    return;
  }

  const match = matchFromEvent(expectation, exactMatch, state);
  state.matches.push(match);

  if (isDegradedSource(exactMatch)) {
    state.blockers.push(blocker({
      code: 'api-mock-degraded',
      category: 'api',
      message: `API event ${exactMatch.id} came from ${exactMatch.source}; it cannot alone prove real frontend/backend integration.`,
      expectation,
      observedStatus: exactMatch.status,
      observedSummary: match.responseSummary,
      possibleLayer: 'mock-or-fixture',
      nextAction: 'Capture browser-network evidence from the real user action, or mark this scope as manually confirmed.',
      retryable: true,
    }));
  }

  if (!statusMatches(exactMatch.status, expectation.expectedStatus)) {
    state.blockers.push(blocker({
      code: 'api-status-mismatch',
      category: 'api',
      message: `Expected status ${formatExpectedStatus(expectation.expectedStatus)} but observed ${exactMatch.status}.`,
      expectation,
      observedStatus: exactMatch.status,
      observedSummary: match.responseSummary,
      possibleLayer: 'backend',
      nextAction: 'Inspect the API handler and backend logs, then rerun the same user action.',
      retryable: true,
    }));
  }

  if (expectation.responseShape) {
    if (exactMatch.responseShapeValid === false) {
      state.blockers.push(blocker({
        code: 'api-schema-mismatch',
        category: 'api',
        message: `Response did not match expected shape: ${expectation.responseShape}.`,
        expectation,
        observedStatus: exactMatch.status,
        observedSummary: [...(exactMatch.schemaIssues ?? []), match.responseSummary].join('; '),
        possibleLayer: 'contract',
        nextAction: 'Check response schema/contract and update the API or expectation before completion.',
        retryable: true,
      }));
    } else if (exactMatch.responseShapeValid !== true) {
      state.blockers.push(blocker({
        code: 'api-schema-unverified',
        category: 'api',
        message: `Response shape was required but no schema/contract validation result was recorded: ${expectation.responseShape}.`,
        expectation,
        observedStatus: exactMatch.status,
        observedSummary: match.responseSummary,
        possibleLayer: 'contract',
        nextAction: 'Record schema/contract validation for this response before using it as completion evidence.',
        retryable: true,
      }));
    }
  }

  if (exactMatch.uiConsistent === false || exactMatch.dataConsistent === false) {
    state.blockers.push(blocker({
      code: exactMatch.uiConsistent === false ? 'ui-api-inconsistent' : 'data-api-inconsistent',
      category: exactMatch.uiConsistent === false ? 'frontend' : 'data',
      message: 'API response succeeded but does not close with observed UI or data state.',
      expectation,
      observedStatus: exactMatch.status,
      observedSummary: match.responseSummary,
      possibleLayer: 'ui-api-closure',
      nextAction: 'Resolve UI/API/data closure before final verdict; Story 4.4 owns data readback verification.',
      retryable: true,
    }));
  }
}

function matchFromEvent(
  expectation: ExpectedApiInteraction,
  event: ObservedApiEvent,
  state: EvaluationState,
): ApiEvidenceMatch {
  const request = redactApiSummary(event.requestSummary);
  const response = redactApiSummary(event.responseSummary);
  state.redacted = state.redacted || request.redacted || response.redacted;
  state.truncated = state.truncated || request.truncated || response.truncated;
  return {
    eventId: event.id,
    actionId: expectation.actionId,
    method: event.method.toUpperCase(),
    url: event.url,
    status: event.status,
    source: event.source,
    requestSummary: request.summary,
    responseSummary: response.summary,
    timing: {
      startedAt: event.startedAt,
      completedAt: event.completedAt,
    },
    schemaIssues: event.schemaIssues ?? [],
  };
}

function buildEvidence(
  input: EvaluateActionApiEvidenceInput,
  state: EvaluationState,
  status: EvidenceBlock['status'],
  generatedAt: string,
): EvidenceBlock {
  const actionIds = unique(state.matches.map((match) => match.actionId));
  const trustLevel = state.matches.length > 0 && state.matches.every((match) => !isDegradedSource({ source: match.source } as ObservedApiEvent))
    ? 'verified'
    : 'degraded';
  const timing = evidenceTiming(state.matches, generatedAt);
  return {
    schemaVersion: 1,
    id: `api-${safePathSegment(input.runId)}-${safePathSegment(input.journey.id)}`,
    runId: input.runId,
    goalId: input.goalId,
    source: 'api',
    capabilityId: input.capabilityId,
    trustLevel,
    status,
    summary: apiSummary(input, state, status),
    artifacts: [],
    startedAt: timing.startedAt,
    completedAt: timing.completedAt,
    freshness: {
      validatedAt: generatedAt,
      targetSummary: `${input.journey.id} API expectations`,
    },
    privacy: {
      classification: 'local-only',
      containsSensitiveData: state.redacted,
      redacted: state.redacted,
      summaryTruncated: state.truncated,
    },
    redactions: state.redacted ? [{ reason: 'api-sensitive-summary-redacted' }] : [],
    journeyId: input.journey.id,
    actionIds,
    apiMatches: state.matches,
    unverifiedScope: status === 'passed' ? [] : state.blockers.map((entry) => entry.message),
  };
}

function determineStatus(state: EvaluationState): EvidenceBlock['status'] {
  if (state.blockers.some((entry) =>
    entry.code === 'api-request-missing' ||
    entry.code === 'api-schema-unverified'
  )) {
    return 'blocked';
  }
  if (state.blockers.some((entry) =>
    entry.code === 'api-status-mismatch' ||
    entry.code === 'api-schema-mismatch' ||
    entry.code === 'ui-api-inconsistent' ||
    entry.code === 'data-api-inconsistent'
  )) {
    return 'failed';
  }
  if (state.blockers.some((entry) => entry.code === 'api-unbound-degraded' || entry.code === 'api-mock-degraded')) {
    return 'degraded';
  }
  if (state.matches.length === 0) return 'blocked';
  return 'passed';
}

function blocker(input: {
  code: string;
  category: ApiEvidenceBlocker['category'];
  message: string;
  expectation: ExpectedApiInteraction;
  observedStatus?: number;
  observedSummary?: string;
  possibleLayer: ApiEvidenceBlocker['possibleLayer'];
  nextAction: string;
  retryable: boolean;
}): ApiEvidenceBlocker {
  return {
    code: input.code,
    category: input.category,
    message: input.message,
    actionId: input.expectation.actionId,
    expectedMethod: input.expectation.method.toUpperCase(),
    expectedUrlPattern: input.expectation.urlPattern,
    observedStatus: input.observedStatus,
    observedSummary: input.observedSummary,
    possibleLayer: input.possibleLayer,
    nextAction: {
      owner: 'agent',
      summary: input.nextAction,
    },
    owner: 'agent',
    riskLevel: 'high',
    evidenceRefs: [],
    retryable: input.retryable,
  };
}

function redactApiSummary(value: string): RedactedSummary {
  const jsonRedacted = value.replace(
    /(["']?)([A-Za-z0-9_-]*(?:token|api[_-]?key|secret|password|session|cookie)[A-Za-z0-9_-]*)\1\s*:\s*("[^"]*"|'[^']*'|[^,\s}]+)/gi,
    '$1$2$1:"[REDACTED]"',
  );
  const redacted = redactSensitiveText(jsonRedacted);
  const summaryTruncated = redacted.text.length > 500;
  const truncated = summaryTruncated ? `${redacted.text.slice(0, 497)}...` : redacted.text;
  return {
    summary: truncated,
    redacted: redacted.redacted || jsonRedacted !== value,
    truncated: summaryTruncated,
  };
}

function isDegradedSource(event: Pick<ObservedApiEvent, 'source'>): boolean {
  return event.source === 'curl' || event.source === 'mock' || event.source === 'fixture' || event.source === 'manual';
}

function sameMethod(actual: string, expected: string): boolean {
  return actual.toUpperCase() === expected.toUpperCase();
}

function urlMatches(url: string, pattern: string): boolean {
  const expected = pattern.trim();
  if (expected.length === 0) return false;
  if (url === expected) return true;

  const observed = parseUrl(url);
  if (observed) {
    const pathAndSearch = `${observed.pathname}${observed.search}`;
    if (observed.href === expected || observed.pathname === expected || pathAndSearch === expected) return true;
    if (isSimpleLiteralUrlPattern(expected)) return false;
    if (isSimpleLiteralPathPattern(expected)) return pathAndSearch.startsWith(`${expected}?`);
  }

  if (isSimpleLiteralPathPattern(expected)) return false;

  try {
    const regex = new RegExp(expected);
    return regex.test(url) || (observed ? regex.test(`${observed.pathname}${observed.search}`) : false);
  } catch {
    return false;
  }
}

function parseUrl(value: string): URL | null {
  try {
    return value.startsWith('/') ? new URL(value, 'http://curdx.local') : new URL(value);
  } catch {
    return null;
  }
}

function isSimpleLiteralPathPattern(value: string): boolean {
  return value.startsWith('/') && !/[\\^$*+()[\]{}|]/.test(value);
}

function isSimpleLiteralUrlPattern(value: string): boolean {
  return /^https?:\/\//i.test(value) && !/[\\^$*+()[\]{}|]/.test(value);
}

function statusMatches(actual: number, expected: number | number[]): boolean {
  return Array.isArray(expected) ? expected.includes(actual) : actual === expected;
}

function formatExpectedStatus(expected: number | number[]): string {
  return Array.isArray(expected) ? expected.join(', ') : String(expected);
}

function apiSummary(
  input: EvaluateActionApiEvidenceInput,
  state: EvaluationState,
  status: EvidenceBlock['status'],
): string {
  return `API evidence for journey ${input.journey.id} ${status}; matches: ${state.matches.length}; blockers: ${state.blockers.length}.`;
}

function durationMsFromMatches(matches: ApiEvidenceMatch[]): number {
  return matches.reduce((total, match) => {
    const start = Date.parse(match.timing.startedAt);
    const end = Date.parse(match.timing.completedAt);
    if (Number.isNaN(start) || Number.isNaN(end)) return total;
    return total + Math.max(0, end - start);
  }, 0);
}

function evidenceTiming(matches: ApiEvidenceMatch[], fallback: string): ApiTimingRange {
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

interface ApiTimingRange {
  startedAt: string;
  completedAt: string;
}

function confidenceFor(status: EvidenceBlock['status']): number {
  if (status === 'passed') return 0.92;
  if (status === 'degraded') return 0.5;
  if (status === 'failed') return 0.35;
  return 0.2;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function safePathSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]/g, '_');
  return cleaned.length > 0 ? cleaned : 'api';
}

function toIso(value?: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}
