import {
  evaluateActionApiEvidence,
  evaluateDataReadbackEvidence,
  evaluateUiDiagnosticsEvidence,
  executeBrowserJourney,
  type ActionApiEvidenceResult,
  type BrowserActionOutcome,
  type BrowserAdapterResult,
  type BrowserAutomationPort,
  type BrowserConsoleIssue,
  type BrowserNetworkIssue,
  type BrowserViewportEvidence,
  type BrowserVisualIssue,
  type DataReadbackEvidenceResult,
  type EvaluateActionApiEvidenceInput,
  type EvaluateDataReadbackEvidenceInput,
  type EvaluateUiDiagnosticsEvidenceInput,
  type ObservedApiEvent,
  type ObservedDataReadback,
  type UiDiagnosticsEvidenceResult,
  type UiStateObservation,
  type UxCapabilityStatus,
} from '../../adapters/index.ts';
import type { ArtifactIndexEntry, CompletionVerdict, EvidenceBlock, StateLedger } from '../../contracts/index.ts';
import { normalizeArtifactIndexEntry } from '../../evidence/index.ts';
import type { JourneyPlanMode, UserJourney } from '../../planner/index.ts';
import { renderVerificationReport, type RenderedReport, type ReportVerifier } from '../../reports/index.ts';
import { evaluateCompletionVerdict, type BlockerInput } from '../../verdict/index.ts';

export interface FullStackUiDiagnosticsInput {
  actionResults?: BrowserActionOutcome[];
  stateObservations: UiStateObservation[];
  consoleIssues: BrowserConsoleIssue[];
  networkIssues: BrowserNetworkIssue[];
  visualIssues: BrowserVisualIssue[];
  checkedViewports: BrowserViewportEvidence[];
  requiredViewports: string[];
  uxCapability?: UxCapabilityStatus;
}

export interface EvaluateFullStackJourneyInput {
  workspaceRoot: string;
  fixtureRoot?: string;
  runId: string;
  goalId: string;
  mode: JourneyPlanMode;
  journey: UserJourney;
  browserPort: BrowserAutomationPort;
  apiCapabilityId: string;
  observedApiEvents: ObservedApiEvent[];
  dataCapabilityId: string;
  observedDataReadbacks: ObservedDataReadback[];
  uiCapabilityId: string;
  uiDiagnostics: FullStackUiDiagnosticsInput;
  generatedAt?: Date | string;
  verifier?: ReportVerifier;
}

export interface FullStackJourneyResult {
  schemaVersion: 1;
  ok: boolean;
  status: EvidenceBlock['status'];
  capabilityId: string;
  inputs: {
    runId: string;
    goalId: string;
    mode: JourneyPlanMode;
    journeyId: string;
    fixtureRoot?: string;
  };
  evidence: EvidenceBlock[];
  blockers: BlockerInput[];
  artifacts: ArtifactIndexEntry[];
  artifactIndex: ArtifactIndexEntry[];
  diagnostics: Record<string, unknown>[];
  retryable: boolean;
  confidence: number;
  durationMs: number;
  browser: BrowserAdapterResult;
  api: ActionApiEvidenceResult;
  data: DataReadbackEvidenceResult;
  ui: UiDiagnosticsEvidenceResult;
  state: StateLedger;
  verdict: CompletionVerdict;
  report: RenderedReport;
}

export async function evaluateFullStackJourney(
  input: EvaluateFullStackJourneyInput,
): Promise<FullStackJourneyResult> {
  const generatedAt = toIso(input.generatedAt);
  const browser = await executeBrowserJourney({
    workspaceRoot: input.workspaceRoot,
    runId: input.runId,
    goalId: input.goalId,
    mode: input.mode,
    journey: input.journey,
    port: input.browserPort,
    generatedAt,
  });

  const api = evaluateActionApiEvidence({
    runId: input.runId,
    goalId: input.goalId,
    mode: input.mode,
    journey: input.journey,
    capabilityId: input.apiCapabilityId,
    observedEvents: input.observedApiEvents,
    generatedAt,
  } satisfies EvaluateActionApiEvidenceInput);

  const data = evaluateDataReadbackEvidence({
    runId: input.runId,
    goalId: input.goalId,
    mode: input.mode,
    journey: input.journey,
    capabilityId: input.dataCapabilityId,
    apiMatches: api.matches,
    observedReadbacks: input.observedDataReadbacks,
    generatedAt,
  } satisfies EvaluateDataReadbackEvidenceInput);

  const ui = evaluateUiDiagnosticsEvidence({
    runId: input.runId,
    goalId: input.goalId,
    mode: input.mode,
    journey: input.journey,
    capabilityId: input.uiCapabilityId,
    actionResults: input.uiDiagnostics.actionResults ?? browser.actionResults,
    stateObservations: input.uiDiagnostics.stateObservations,
    consoleIssues: input.uiDiagnostics.consoleIssues,
    networkIssues: input.uiDiagnostics.networkIssues,
    visualIssues: input.uiDiagnostics.visualIssues,
    checkedViewports: input.uiDiagnostics.checkedViewports,
    requiredViewports: input.uiDiagnostics.requiredViewports,
    uxCapability: input.uiDiagnostics.uxCapability,
    generatedAt,
  } satisfies EvaluateUiDiagnosticsEvidenceInput);

  const evidence = [...browser.evidence, ...api.evidence, ...data.evidence, ...ui.evidence] as EvidenceBlock[];
  const artifactIndex = buildArtifactIndex(browser, generatedAt);
  const blockers = [
    ...browser.blockers.map((entry) => normalizeBlocker(entry, 'browser')),
    ...api.blockers.map((entry) => normalizeBlocker(entry, 'api')),
    ...data.blockers.map((entry) => normalizeBlocker(entry, 'data')),
    ...ui.blockers.map((entry) => normalizeBlocker(entry, 'ui')),
  ];
  const diagnostics = [
    ...browser.diagnostics,
    ...api.diagnostics,
    ...data.diagnostics,
    ...ui.diagnostics,
  ];
  const state = buildState(input, evidence, generatedAt);
  const verdict = evaluateCompletionVerdict({
    state,
    evidence,
    blockers,
    taskType: 'fullstack',
    now: generatedAt,
    claimedComplete: true,
  }).verdict;
  const reportState: StateLedger = {
    ...state,
    status: stateStatusFor(verdict),
    verdictStatus: verdict.verdict,
    evidenceIds: evidence.map((entry) => entry.id),
  };
  const report = renderVerificationReport({
    state: reportState,
    evidence,
    artifactIndex,
    verdict,
    blockers,
    verifier: input.verifier,
    generatedAt,
  });

  return {
    schemaVersion: 1,
    ok: verdict.verdict === 'complete',
    status: statusFor(verdict),
    capabilityId: 'fullstack-journey',
    inputs: {
      runId: input.runId,
      goalId: input.goalId,
      mode: input.mode,
      journeyId: input.journey.id,
      ...(input.fixtureRoot === undefined ? {} : { fixtureRoot: input.fixtureRoot }),
    },
    evidence,
    blockers,
    artifacts: artifactIndex,
    artifactIndex,
    diagnostics,
    retryable: browser.retryable || api.retryable || data.retryable || ui.retryable,
    confidence: verdict.confidence,
    durationMs: browser.durationMs + api.durationMs + data.durationMs + ui.durationMs,
    browser,
    api,
    data,
    ui,
    state: reportState,
    verdict,
    report,
  };
}

function buildArtifactIndex(browser: BrowserAdapterResult, createdAt: string): ArtifactIndexEntry[] {
  const evidence = browser.evidence[0];
  if (evidence === undefined) return [];
  return browser.artifacts.flatMap((artifact) => {
    const normalized = normalizeArtifactIndexEntry(artifact, evidence as EvidenceBlock, createdAt);
    return normalized.ok ? [normalized.entry] : [];
  });
}

function buildState(
  input: EvaluateFullStackJourneyInput,
  evidence: EvidenceBlock[],
  generatedAt: string,
): StateLedger {
  return {
    schemaVersion: 1,
    runId: input.runId,
    goalId: input.goalId,
    workspaceRoot: input.workspaceRoot,
    mode: input.mode,
    policy: {
      noFalseCompletion: true,
    },
    scope: {
      summary: `Evaluate full-stack journey fixture ${input.journey.id}`,
      fixtureRoot: input.fixtureRoot,
    },
    expectedJourney: {
      summary: input.journey.title,
      journeyId: input.journey.id,
      entryUrl: input.journey.entry.url,
    },
    status: 'running',
    verdictStatus: 'pending',
    phase: 'full-stack-verdict',
    startedAt: generatedAt,
    updatedAt: generatedAt,
    evidenceIds: evidence.map((entry) => entry.id),
    missingEvidence: [],
    artifactIndexPath: `.curdx/artifacts/${safePathSegment(input.runId)}/index.jsonl`,
    dirtyBaseline: {
      capturedAt: generatedAt,
      files: [],
    },
    generatedFiles: [],
    nextAction: {
      owner: 'agent',
      summary: 'Resolve blockers and rerun the same full-stack journey.',
    },
  };
}

function normalizeBlocker(value: Record<string, unknown>, category: string): BlockerInput {
  const code = stringField(value.code) ?? `${category}-blocker`;
  const message = stringField(value.message) ?? `${category} blocker`;
  const nextAction = isRecord(value.nextAction)
    ? value.nextAction
    : {
      owner: 'agent',
      summary: 'Resolve the blocker and rerun the same full-stack journey.',
    };
  return {
    code,
    category: stringField(value.category) ?? category,
    message,
    nextAction,
    owner: stringField(value.owner) ?? 'agent',
    riskLevel: riskLevelField(value.riskLevel) ?? 'high',
    evidenceRefs: stringArrayField(value.evidenceRefs),
    core: value.core === false ? false : true,
  };
}

function statusFor(verdict: CompletionVerdict): EvidenceBlock['status'] {
  if (verdict.verdict === 'complete' || verdict.verdict === 'release-ready') return 'passed';
  if (verdict.verdict === 'partial' || verdict.verdict === 'manual-confirmation-required') return 'degraded';
  return 'blocked';
}

function stateStatusFor(verdict: CompletionVerdict): StateLedger['status'] {
  if (verdict.verdict === 'complete') return 'complete';
  if (verdict.verdict === 'partial' || verdict.verdict === 'manual-confirmation-required') return 'partial';
  return 'blocked';
}

function toIso(value?: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function safePathSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]/g, '_');
  return cleaned.length > 0 ? cleaned : 'fullstack';
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function stringArrayField(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

function riskLevelField(value: unknown): BlockerInput['riskLevel'] | undefined {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') return value;
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
