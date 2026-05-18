import type { AdapterResult, EvidenceBlock } from '../../contracts/index.ts';
import type { JourneyPlanMode, UserJourney } from '../../planner/index.ts';
import type { BrowserActionOutcome } from './types.ts';

export type UiDiagnosticSeverity = 'low' | 'medium' | 'high' | 'critical';

export type UiStateObservationStatus = EvidenceBlock['status'];

export interface UiStateObservation extends Record<string, unknown> {
  actionId: string;
  state: string;
  status: UiStateObservationStatus;
  summary: string;
  reason?: string;
  evidenceRefs: string[];
}

export interface BrowserConsoleIssue extends Record<string, unknown> {
  actionId?: string;
  level: 'error' | 'warning' | 'info';
  severity: UiDiagnosticSeverity;
  message: string;
  source?: string;
  evidenceRefs: string[];
}

export interface BrowserNetworkIssue extends Record<string, unknown> {
  actionId?: string;
  method?: string;
  url: string;
  status?: number;
  severity: UiDiagnosticSeverity;
  failureSummary: string;
  evidenceRefs: string[];
}

export type BrowserVisualIssueType =
  | 'blank-page'
  | 'overlap'
  | 'text-truncation'
  | 'horizontal-overflow'
  | 'non-clickable'
  | 'fixed-obscures'
  | 'mobile-flow-blocked';

export interface BrowserVisualIssue extends Record<string, unknown> {
  actionId?: string;
  type: BrowserVisualIssueType;
  severity: UiDiagnosticSeverity;
  summary: string;
  viewport?: string;
  evidenceRefs: string[];
}

export interface BrowserViewportEvidence extends Record<string, unknown> {
  id: string;
  width: number;
  height: number;
  evidenceRefs: string[];
}

export interface UxCapabilityStatus extends Record<string, unknown> {
  capabilityId: string;
  state: 'available' | 'unavailable' | 'degraded';
  reason: string;
}

export interface UiStateMatrixEntry extends Record<string, unknown> {
  actionId: string;
  expectedState: string;
  assertion: string;
  status: EvidenceBlock['status'];
  observedSummary?: string;
  reason?: string;
  evidenceRefs: string[];
}

export interface UiDiagnosticsDiagnostic extends Record<string, unknown> {
  code: string;
  message: string;
  actionId?: string;
  severity?: UiDiagnosticSeverity;
  evidenceRefs: string[];
}

export interface UiDiagnosticsBlocker extends Record<string, unknown> {
  code: string;
  category: 'ui' | 'console' | 'network' | 'visual' | 'viewport' | 'capability';
  message: string;
  actionId: string;
  severity: UiDiagnosticSeverity;
  evidenceRefs: string[];
  capabilityId?: string;
  viewport?: string;
  nextAction: {
    owner: 'agent' | 'user' | 'external-system';
    summary: string;
  };
  owner: 'agent' | 'user' | 'external-system';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  retryable: boolean;
}

export interface EvaluateUiDiagnosticsEvidenceInput {
  runId: string;
  goalId: string;
  mode: JourneyPlanMode;
  journey: UserJourney;
  capabilityId: string;
  actionResults: BrowserActionOutcome[];
  stateObservations: UiStateObservation[];
  consoleIssues: BrowserConsoleIssue[];
  networkIssues: BrowserNetworkIssue[];
  visualIssues: BrowserVisualIssue[];
  checkedViewports: BrowserViewportEvidence[];
  requiredViewports: string[];
  uxCapability?: UxCapabilityStatus;
  generatedAt?: Date | string;
}

export interface UiDiagnosticsEvidenceResult extends AdapterResult {
  status: EvidenceBlock['status'];
  capabilityId: string;
  inputs: {
    runId: string;
    goalId: string;
    mode: JourneyPlanMode;
    journeyId: string;
  };
  evidence: EvidenceBlock[];
  blockers: UiDiagnosticsBlocker[];
  artifacts: [];
  diagnostics: UiDiagnosticsDiagnostic[];
  stateMatrix: UiStateMatrixEntry[];
  missingViewports: string[];
}
