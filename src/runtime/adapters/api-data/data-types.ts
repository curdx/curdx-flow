import type { AdapterResult, EvidenceBlock } from '../../contracts/index.ts';
import type { JourneyPlanMode, UserJourney } from '../../planner/index.ts';
import type { ApiEvidenceMatch } from './types.ts';

export type DataReadbackStrategy =
  | 'page-refresh'
  | 'api-query'
  | 'database-read'
  | 'file-read'
  | 'queue-check'
  | 'state-store'
  | 'project-command'
  | 'manual';

export type DataReadbackSource = 'real' | 'mock' | 'fixture' | 'stub' | 'dev-only' | 'manual';

export type DataCreatedBy = 'user-action' | 'api-response' | 'fixture' | 'manual' | 'unknown';

export type DataReadbackFailureCode =
  | 'database-unavailable'
  | 'missing-secret'
  | 'external-service-unavailable'
  | 'readback-command-failed'
  | 'readback-not-executed';

export interface DataPrivacySummary extends Record<string, unknown> {
  classification: 'public' | 'internal' | 'confidential' | 'secret' | 'local-only';
  containsSensitiveData: boolean;
  redacted: boolean;
  summaryTruncated?: boolean;
}

export interface ObservedDataReadback extends Record<string, unknown> {
  id: string;
  actionId?: string;
  apiEventId?: string;
  apiEvidenceId?: string;
  strategy: DataReadbackStrategy;
  target: string;
  expectedSummary: string;
  observedSummary: string;
  consistent?: boolean;
  source: DataReadbackSource;
  dataIdSummary?: string;
  createdBy: DataCreatedBy;
  cleanupStrategy?: string;
  privacy?: DataPrivacySummary;
  uiState?: string;
  apiStatus?: number;
  failureCode?: DataReadbackFailureCode;
  failureSummary?: string;
  startedAt: string;
  completedAt: string;
}

export interface DataReadbackTiming extends Record<string, unknown> {
  startedAt: string;
  completedAt: string;
}

export interface DataReadbackMatch extends Record<string, unknown> {
  readbackId: string;
  actionId: string;
  apiEventId?: string;
  apiEvidenceId?: string;
  strategy: DataReadbackStrategy;
  target: string;
  expectedSummary: string;
  observedSummary: string;
  consistent: boolean | null;
  source: DataReadbackSource;
  dataIdSummary?: string;
  createdBy: DataCreatedBy;
  cleanupStrategy?: string;
  privacy: DataPrivacySummary;
  uiState?: string;
  apiStatus?: number;
  timing: DataReadbackTiming;
}

export interface DataReadbackDiagnostic extends Record<string, unknown> {
  code: string;
  message: string;
  actionId?: string;
}

export type DataReadbackBlockerLayer =
  | 'backend'
  | 'cache'
  | 'transaction'
  | 'database'
  | 'state-sync'
  | 'frontend-render'
  | 'external-service'
  | 'mock-or-fixture'
  | 'api-evidence'
  | 'environment';

export interface DataReadbackBlocker extends Record<string, unknown> {
  code: string;
  category: 'data' | 'api' | 'backend' | 'frontend' | 'environment' | 'external-service' | 'unknown';
  message: string;
  actionId: string;
  target: string;
  readback?: string;
  apiEvidenceRef?: string;
  observedSummary?: string;
  possibleLayer: DataReadbackBlockerLayer;
  nextAction: {
    owner: 'agent' | 'user' | 'external-system';
    summary: string;
  };
  owner: 'agent' | 'user' | 'external-system';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  evidenceRefs: string[];
  retryable: boolean;
}

export interface EvaluateDataReadbackEvidenceInput {
  runId: string;
  goalId: string;
  mode: JourneyPlanMode;
  journey: UserJourney;
  capabilityId: string;
  apiMatches: ApiEvidenceMatch[];
  observedReadbacks: ObservedDataReadback[];
  generatedAt?: Date | string;
}

export interface DataReadbackEvidenceResult extends AdapterResult {
  status: EvidenceBlock['status'];
  capabilityId: string;
  inputs: {
    runId: string;
    goalId: string;
    mode: JourneyPlanMode;
    journeyId: string;
  };
  evidence: EvidenceBlock[];
  blockers: DataReadbackBlocker[];
  artifacts: [];
  diagnostics: DataReadbackDiagnostic[];
  matches: DataReadbackMatch[];
}
