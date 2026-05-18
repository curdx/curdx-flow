import { summarizeArtifactText } from '../../evidence/index.ts';
import type { EvidenceBlock } from '../../contracts/index.ts';
import type {
  BrowserConsoleIssue,
  BrowserNetworkIssue,
  BrowserVisualIssue,
  EvaluateUiDiagnosticsEvidenceInput,
  UiDiagnosticSeverity,
  UiDiagnosticsBlocker,
  UiDiagnosticsDiagnostic,
  UiDiagnosticsEvidenceResult,
  UiStateMatrixEntry,
  UiStateObservation,
} from './ui-diagnostics-types.ts';

interface RedactedSummary {
  summary: string;
  redacted: boolean;
  truncated: boolean;
}

interface EvaluationState {
  blockers: UiDiagnosticsBlocker[];
  diagnostics: UiDiagnosticsDiagnostic[];
  stateMatrix: UiStateMatrixEntry[];
  missingViewports: string[];
  redacted: boolean;
  truncated: boolean;
}

export function evaluateUiDiagnosticsEvidence(
  input: EvaluateUiDiagnosticsEvidenceInput,
): UiDiagnosticsEvidenceResult {
  const generatedAt = toIso(input.generatedAt);
  const state: EvaluationState = {
    blockers: [],
    diagnostics: [],
    stateMatrix: [],
    missingViewports: [],
    redacted: false,
    truncated: false,
  };

  evaluateStateMatrix(input, state);
  evaluateConsoleIssues(input, state);
  evaluateNetworkIssues(input, state);
  evaluateVisualIssues(input, state);
  evaluateViewports(input, state);
  evaluateUxCapability(input, state);

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
    durationMs: durationMsFromActions(input.actionResults),
    stateMatrix: state.stateMatrix,
    missingViewports: state.missingViewports,
  };
}

function evaluateStateMatrix(input: EvaluateUiDiagnosticsEvidenceInput, state: EvaluationState): void {
  for (const expected of input.journey.expectedUi) {
    const observation = input.stateObservations.find((entry) =>
      entry.actionId === expected.actionId &&
      entry.state === expected.state
    );

    if (!observation) {
      const entry: UiStateMatrixEntry = {
        actionId: expected.actionId,
        expectedState: expected.state,
        assertion: expected.assertion,
        status: 'blocked',
        reason: 'No UI state observation was recorded for this expected state.',
        evidenceRefs: [],
      };
      state.stateMatrix.push(entry);
      state.blockers.push(blocker({
        code: 'ui-state-missing',
        category: 'ui',
        actionId: expected.actionId,
        message: `Expected UI state ${expected.state} was not observed for action ${expected.actionId}.`,
        severity: 'high',
        evidenceRefs: [],
        nextAction: 'Capture the expected UI state or record why it cannot be triggered before using UI evidence for completion.',
        retryable: true,
      }));
      continue;
    }

    const summary = redactUiSummary(observation.summary);
    updatePrivacyState(state, summary);
    const matrixEntry: UiStateMatrixEntry = {
      actionId: expected.actionId,
      expectedState: expected.state,
      assertion: expected.assertion,
      status: observation.status,
      observedSummary: summary.summary,
      reason: observation.reason,
      evidenceRefs: observation.evidenceRefs,
    };
    state.stateMatrix.push(matrixEntry);

    if (observation.status === 'failed' || observation.status === 'blocked') {
      state.blockers.push(blocker({
        code: `ui-state-${observation.status}`,
        category: 'ui',
        actionId: expected.actionId,
        message: observation.reason ?? `UI state ${expected.state} returned ${observation.status}.`,
        severity: 'high',
        evidenceRefs: observation.evidenceRefs,
        nextAction: 'Fix or recapture this UI state before claiming the journey is usable.',
        retryable: true,
      }));
    } else if (observation.status === 'degraded' || observation.status === 'skipped') {
      const explained = typeof observation.reason === 'string' && observation.reason.trim().length > 0;
      state.blockers.push(blocker({
        code: explained ? 'ui-state-degraded' : 'ui-state-unexplained',
        category: 'ui',
        actionId: expected.actionId,
        message: observation.reason ?? `UI state ${expected.state} was not fully verified.`,
        severity: explained ? 'medium' : 'high',
        evidenceRefs: observation.evidenceRefs,
        nextAction: explained
          ? 'Provide stronger UI evidence when possible, or keep this state listed as a remaining risk.'
          : 'Record why the state cannot be triggered and capture the remaining risk before using UI evidence for completion.',
        retryable: true,
      }));
    }
  }
}

function evaluateConsoleIssues(input: EvaluateUiDiagnosticsEvidenceInput, state: EvaluationState): void {
  for (const issue of input.consoleIssues) {
    const message = redactUiSummary(issue.message);
    updatePrivacyState(state, message);
    const failed = issue.level === 'error' || issue.severity === 'high' || issue.severity === 'critical';
    const code = failed ? 'ui-console-error' : 'ui-console-warning';
    state.diagnostics.push(diagnostic({
      code,
      actionId: issue.actionId,
      message: message.summary,
      severity: issue.severity,
      evidenceRefs: issue.evidenceRefs,
    }));
    state.blockers.push(blocker({
      code,
      category: 'console',
      actionId: issue.actionId ?? input.journey.id,
      message: message.summary,
      severity: issue.severity,
      evidenceRefs: issue.evidenceRefs,
      nextAction: failed
        ? 'Fix the runtime console error or uncaught exception, then rerun the same browser journey.'
        : 'Review the console warning and record whether it affects the user journey.',
      retryable: true,
    }));
  }
}

function evaluateNetworkIssues(input: EvaluateUiDiagnosticsEvidenceInput, state: EvaluationState): void {
  for (const issue of input.networkIssues) {
    const summary = redactUiSummary(issue.failureSummary);
    updatePrivacyState(state, summary);
    state.diagnostics.push(diagnostic({
      code: 'ui-network-failure',
      actionId: issue.actionId,
      message: summary.summary,
      severity: issue.severity,
      evidenceRefs: issue.evidenceRefs,
    }));
    state.blockers.push(blocker({
      code: 'ui-network-failure',
      category: 'network',
      actionId: issue.actionId ?? input.journey.id,
      message: summary.summary,
      severity: issue.severity,
      evidenceRefs: issue.evidenceRefs,
      nextAction: 'Fix the failed request or explain the expected degraded network behavior, then rerun the browser journey.',
      retryable: true,
    }));
  }
}

function evaluateVisualIssues(input: EvaluateUiDiagnosticsEvidenceInput, state: EvaluationState): void {
  for (const issue of input.visualIssues) {
    const summary = redactUiSummary(issue.summary);
    updatePrivacyState(state, summary);
    const code = `ui-visual-${issue.type}`;
    state.diagnostics.push(diagnostic({
      code,
      actionId: issue.actionId,
      message: summary.summary,
      severity: issue.severity,
      evidenceRefs: issue.evidenceRefs,
    }));
    state.blockers.push(blocker({
      code,
      category: 'visual',
      actionId: issue.actionId ?? input.journey.id,
      message: summary.summary,
      severity: issue.severity,
      viewport: issue.viewport,
      evidenceRefs: issue.evidenceRefs,
      nextAction: 'Fix the visual defect or capture a stronger screenshot/trace proving the main user flow remains usable.',
      retryable: true,
    }));
  }
}

function evaluateViewports(input: EvaluateUiDiagnosticsEvidenceInput, state: EvaluationState): void {
  const checked = new Map(input.checkedViewports.map((viewport) => [viewport.id, viewport]));
  for (const viewport of input.requiredViewports) {
    const evidence = checked.get(viewport);
    if (evidence && evidence.evidenceRefs.length > 0) continue;
    if (evidence && evidence.evidenceRefs.length === 0) {
      state.blockers.push(blocker({
        code: 'ui-viewport-evidence-missing',
        category: 'viewport',
        actionId: input.journey.id,
        message: `Required viewport ${viewport} was checked but has no screenshot or trace evidence reference.`,
        severity: 'medium',
        viewport,
        evidenceRefs: [],
        nextAction: 'Attach screenshot or trace evidence for this viewport before considering responsive UI evidence complete.',
        retryable: true,
      }));
      continue;
    }
    state.missingViewports.push(viewport);
    state.blockers.push(blocker({
      code: 'ui-viewport-missing',
      category: 'viewport',
      actionId: input.journey.id,
      message: `Required viewport ${viewport} was not checked.`,
      severity: 'medium',
      viewport,
      evidenceRefs: [],
      nextAction: 'Capture screenshot or trace evidence for the missing viewport before considering responsive UI evidence complete.',
      retryable: true,
    }));
  }
}

function evaluateUxCapability(input: EvaluateUiDiagnosticsEvidenceInput, state: EvaluationState): void {
  const capability = input.uxCapability;
  if (!capability) {
    state.blockers.push(blocker({
      code: 'ui-ux-capability-unavailable',
      category: 'capability',
      actionId: input.journey.id,
      message: 'ui-ux-pro-max capability status was not recorded for UI diagnostics.',
      severity: 'medium',
      capabilityId: 'ui-ux-pro-max',
      evidenceRefs: [],
      nextAction: 'Record ui-ux-pro-max availability or explicitly mark visual/interaction quality evidence as degraded.',
      retryable: true,
    }));
    return;
  }
  if (capability.state === 'available') return;
  state.blockers.push(blocker({
    code: 'ui-ux-capability-unavailable',
    category: 'capability',
    actionId: input.journey.id,
    message: `${capability.capabilityId} is ${capability.state}: ${capability.reason}`,
    severity: 'medium',
    capabilityId: capability.capabilityId,
    evidenceRefs: [],
    nextAction: 'Install or restore ui-ux-pro-max, or clearly mark visual/interaction quality evidence as degraded.',
    retryable: true,
  }));
}

function buildEvidence(
  input: EvaluateUiDiagnosticsEvidenceInput,
  state: EvaluationState,
  status: EvidenceBlock['status'],
  generatedAt: string,
): EvidenceBlock {
  return {
    schemaVersion: 1,
    id: `ui-${safePathSegment(input.runId)}-${safePathSegment(input.journey.id)}`,
    runId: input.runId,
    goalId: input.goalId,
    source: 'browser',
    capabilityId: input.capabilityId,
    trustLevel: status === 'degraded' ? 'degraded' : 'verified',
    status,
    summary: `UI diagnostics evidence for journey ${input.journey.id} ${status}; states: ${state.stateMatrix.length}; blockers: ${state.blockers.length}.`,
    artifacts: [],
    startedAt: generatedAt,
    completedAt: generatedAt,
    freshness: {
      validatedAt: generatedAt,
      targetSummary: `${input.journey.id} UI diagnostics`,
    },
    privacy: {
      classification: 'local-only',
      containsSensitiveData: state.redacted,
      redacted: state.redacted,
      summaryTruncated: state.truncated,
    },
    redactions: state.redacted ? [{ reason: 'ui-diagnostics-sensitive-summary-redacted' }] : [],
    journeyId: input.journey.id,
    actionIds: unique([
      ...input.actionResults.map((action) => action.actionId),
      ...state.stateMatrix.map((entry) => entry.actionId),
    ]),
    stateMatrix: state.stateMatrix,
    checkedViewports: input.checkedViewports.map((viewport) => viewport.id),
    missingViewports: state.missingViewports,
    consoleIssues: input.consoleIssues.length,
    networkIssues: input.networkIssues.length,
    visualIssues: input.visualIssues.length,
    unverifiedScope: status === 'passed' ? [] : state.blockers.map((entry) => entry.message),
  };
}

function determineStatus(state: EvaluationState): EvidenceBlock['status'] {
  if (state.blockers.some((entry) =>
    entry.code === 'ui-state-missing' ||
    entry.code === 'ui-state-blocked' ||
    entry.code === 'ui-state-unexplained'
  )) {
    return 'blocked';
  }
  if (state.blockers.some((entry) =>
    entry.code === 'ui-console-error' ||
    entry.code === 'ui-network-failure' ||
    entry.code.startsWith('ui-visual-') ||
    entry.code === 'ui-state-failed'
  )) {
    return 'failed';
  }
  if (state.blockers.length > 0) return 'degraded';
  return 'passed';
}

function blocker(input: {
  code: string;
  category: UiDiagnosticsBlocker['category'];
  actionId: string;
  message: string;
  severity: UiDiagnosticSeverity;
  evidenceRefs: string[];
  nextAction: string;
  retryable: boolean;
  capabilityId?: string;
  viewport?: string;
}): UiDiagnosticsBlocker {
  return {
    code: input.code,
    category: input.category,
    message: input.message,
    actionId: input.actionId,
    severity: input.severity,
    evidenceRefs: input.evidenceRefs,
    capabilityId: input.capabilityId,
    viewport: input.viewport,
    nextAction: {
      owner: 'agent',
      summary: input.nextAction,
    },
    owner: 'agent',
    riskLevel: severityToRisk(input.severity),
    retryable: input.retryable,
  };
}

function diagnostic(input: {
  code: string;
  message: string;
  actionId?: string;
  severity: UiDiagnosticSeverity;
  evidenceRefs: string[];
}): UiDiagnosticsDiagnostic {
  return {
    code: input.code,
    message: input.message,
    actionId: input.actionId,
    severity: input.severity,
    evidenceRefs: input.evidenceRefs,
  };
}

function redactUiSummary(value: string): RedactedSummary {
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

function updatePrivacyState(state: EvaluationState, summary: RedactedSummary): void {
  state.redacted = state.redacted || summary.redacted;
  state.truncated = state.truncated || summary.truncated;
}

function severityToRisk(severity: UiDiagnosticSeverity): UiDiagnosticsBlocker['riskLevel'] {
  if (severity === 'critical') return 'critical';
  if (severity === 'high') return 'high';
  if (severity === 'medium') return 'medium';
  return 'low';
}

function durationMsFromActions(actions: Array<{ durationMs?: number }>): number {
  return actions.reduce((total, action) => total + Math.max(0, action.durationMs ?? 0), 0);
}

function confidenceFor(status: EvidenceBlock['status']): number {
  if (status === 'passed') return 0.88;
  if (status === 'degraded') return 0.5;
  if (status === 'failed') return 0.35;
  return 0.2;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function safePathSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]/g, '_');
  return cleaned.length > 0 ? cleaned : 'ui';
}

function toIso(value?: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}
