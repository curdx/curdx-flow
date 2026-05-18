import type { AdapterResult, EvidenceBlock } from '../../contracts/index.ts';
import type { JourneyPlanMode, UserJourney } from '../../planner/index.ts';

export type ApiObservationSource = 'browser-network' | 'curl' | 'mock' | 'fixture' | 'manual';

export interface ObservedApiEvent extends Record<string, unknown> {
  id: string;
  actionId?: string;
  method: string;
  url: string;
  status: number;
  source: ApiObservationSource;
  requestSummary: string;
  responseSummary: string;
  responseShapeValid?: boolean;
  schemaIssues?: string[];
  uiConsistent?: boolean;
  dataConsistent?: boolean;
  startedAt: string;
  completedAt: string;
}

export interface ApiTiming extends Record<string, unknown> {
  startedAt: string;
  completedAt: string;
}

export interface ApiEvidenceMatch extends Record<string, unknown> {
  eventId: string;
  actionId: string;
  method: string;
  url: string;
  status: number;
  source: ApiObservationSource;
  requestSummary: string;
  responseSummary: string;
  timing: ApiTiming;
  schemaIssues: string[];
}

export interface ApiEvidenceDiagnostic extends Record<string, unknown> {
  code: string;
  message: string;
  actionId?: string;
}

export interface ApiEvidenceBlocker extends Record<string, unknown> {
  code: string;
  category: 'api' | 'frontend' | 'backend' | 'data' | 'unknown';
  message: string;
  actionId: string;
  expectedMethod: string;
  expectedUrlPattern: string;
  observedStatus?: number;
  observedSummary?: string;
  possibleLayer: 'frontend-or-network' | 'backend' | 'contract' | 'ui-api-closure' | 'mock-or-fixture';
  nextAction: {
    owner: 'agent' | 'user' | 'external-system';
    summary: string;
  };
  owner: 'agent' | 'user' | 'external-system';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  evidenceRefs: string[];
  retryable: boolean;
}

export interface EvaluateActionApiEvidenceInput {
  runId: string;
  goalId: string;
  mode: JourneyPlanMode;
  journey: UserJourney;
  capabilityId: string;
  observedEvents: ObservedApiEvent[];
  generatedAt?: Date | string;
}

export interface ActionApiEvidenceResult extends AdapterResult {
  status: EvidenceBlock['status'];
  capabilityId: string;
  inputs: {
    runId: string;
    goalId: string;
    mode: JourneyPlanMode;
    journeyId: string;
  };
  evidence: EvidenceBlock[];
  blockers: ApiEvidenceBlocker[];
  artifacts: [];
  diagnostics: ApiEvidenceDiagnostic[];
  matches: ApiEvidenceMatch[];
}
