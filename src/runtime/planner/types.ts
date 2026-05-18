import type { CapabilityMatrix, CapabilityStatus } from '../capabilities/types.ts';
import type { RuntimeTopology } from '../discovery/types.ts';
import type { RuntimeReadinessResult } from '../readiness/types.ts';
import type { EvidenceRequirement, TaskType } from '../verdict/types.ts';

export type CapabilityRouteDecisionKind =
  | 'selected'
  | 'fallback'
  | 'blocked'
  | 'degraded'
  | 'manual-confirmation-required';

export type CapabilityRouteTrustLevel =
  | 'verified'
  | 'degraded'
  | 'manual-confirmed'
  | 'blocked'
  | 'unverified';

export interface CapabilityRouteDecision extends Record<string, unknown> {
  id: string;
  requirementId: string;
  requirementSource: EvidenceRequirement['source'];
  description: string;
  decision: CapabilityRouteDecisionKind;
  primaryCapabilityId: string;
  selectedCapabilityId: string | null;
  fallbackCapabilityIds: string[];
  reason: string;
  trustLevel: CapabilityRouteTrustLevel;
  degradedReason?: string;
  manualConfirmationRequired: boolean;
  blocksCompletion: boolean;
  core: boolean;
  remediationRefs: string[];
  evidenceImpact: string[];
  capabilityState?: CapabilityStatus['state'];
}

export interface CapabilityRoutingPlan extends Record<string, unknown> {
  schemaVersion: 1;
  generatedAt: string;
  taskType: TaskType;
  routes: CapabilityRouteDecision[];
  blockers: CapabilityRouteDecision[];
  degraded: CapabilityRouteDecision[];
  summary: {
    selected: number;
    fallback: number;
    blocked: number;
    degraded: number;
    manualConfirmationRequired: number;
  };
}

export interface PlanCapabilityRoutesInput {
  taskType: TaskType;
  capabilityMatrix: CapabilityMatrix;
  requirements: EvidenceRequirement[];
  generatedAt?: Date | string;
}

export type JourneyPlanMode = 'report-only' | 'fix' | 'verification' | 'release';
export type JourneyPlanningStatus = 'ready' | 'partial' | 'needs-human-input' | 'blocked';

export type JourneyStepType =
  | 'navigate'
  | 'click'
  | 'fill'
  | 'select'
  | 'submit'
  | 'observe'
  | 'run-check'
  | 'capture-screenshot'
  | 'capture-trace'
  | 'reproduce-before-fix'
  | 'handoff-to-recovery'
  | 'same-path-retry'
  | 'edit-source'
  | 'generate-test'
  | 'migration'
  | 'execute-recovery';

export interface JourneyEntryPoint extends Record<string, unknown> {
  url: string;
  serviceId?: string;
  root?: string;
  inferred: boolean;
  confidence: number;
}

export interface JourneyStep extends Record<string, unknown> {
  id: string;
  type: JourneyStepType;
  description: string;
  target?: string;
  value?: string;
  originalType?: JourneyStepType;
  allowedInReportOnly: boolean;
  executes: false;
}

export interface JourneyActionHint extends Record<string, unknown> {
  id: string;
  type: JourneyStepType;
  description: string;
  target?: string;
  value?: string;
}

export interface ExpectedUiState extends Record<string, unknown> {
  actionId: string;
  state: 'loading' | 'success' | 'empty' | 'error' | 'disabled' | 'validation-failed' | 'submitting' | 'success-after-submit' | string;
  assertion: string;
}

export interface ExpectedApiInteraction extends Record<string, unknown> {
  actionId: string;
  method: string;
  urlPattern: string;
  expectedStatus: number | number[];
  responseShape?: string;
}

export interface ExpectedDataOutcome extends Record<string, unknown> {
  actionId: string;
  target: string;
  expectedState: string;
  readback?: string;
}

export interface JourneyArtifactRequirement extends Record<string, unknown> {
  id: string;
  type: 'screenshot' | 'trace' | 'api-response' | 'data-readback' | 'report' | 'console' | 'network';
  requirementId: string;
  summary: string;
  required: boolean;
}

export interface JourneyMissingEvidence extends Record<string, unknown> {
  id: string;
  source: EvidenceRequirement['source'];
  description: string;
  reason: string;
  core: boolean;
  blocksCompletion: boolean;
}

export interface JourneyRemainingRisk extends Record<string, unknown> {
  id: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  mitigation: string;
}

export interface UserJourneyHint extends Record<string, unknown> {
  id: string;
  title: string;
  entry: {
    url: string;
    serviceId?: string;
    root?: string;
  };
  actions: JourneyActionHint[];
  expectedUi?: ExpectedUiState[];
  expectedApi?: ExpectedApiInteraction[];
  expectedData?: ExpectedDataOutcome[];
}

export interface UserJourney extends Record<string, unknown> {
  id: string;
  title: string;
  entry: JourneyEntryPoint;
  actions: JourneyStep[];
  expectedUi: ExpectedUiState[];
  expectedApi: ExpectedApiInteraction[];
  expectedData: ExpectedDataOutcome[];
  inferred: boolean;
  confidence: number;
  missingEvidence: JourneyMissingEvidence[];
  remainingRisks: JourneyRemainingRisk[];
}

export interface JourneyPlanningVerdict extends Record<string, unknown> {
  status: JourneyPlanningStatus;
  complete: false;
  reason: string;
  blocksCompletion: boolean;
}

export interface JourneyRecoveryPlan extends Record<string, unknown> {
  handoffRequired: boolean;
  owner: 'recovery' | 'none';
  reason: string;
  samePathRetryRequired: boolean;
}

export interface UserJourneyVerificationPlan extends Record<string, unknown> {
  schemaVersion: 1;
  generatedAt: string;
  userIntent: string;
  taskType: TaskType;
  mode: JourneyPlanMode;
  status: JourneyPlanningStatus;
  verdict: JourneyPlanningVerdict;
  topologySummary: {
    overallType: RuntimeTopology['overallType'];
    status: RuntimeTopology['status'];
    confidence: number;
  };
  journeys: UserJourney[];
  evidenceRequirements: EvidenceRequirement[];
  capabilityRoutes?: CapabilityRoutingPlan;
  requiredArtifacts: JourneyArtifactRequirement[];
  missingEvidence: JourneyMissingEvidence[];
  remainingRisks: JourneyRemainingRisk[];
  recovery: JourneyRecoveryPlan;
  readiness?: Pick<RuntimeReadinessResult, 'status'>;
}

export interface PlanUserJourneyVerificationInput {
  userIntent: string;
  taskType: TaskType;
  mode: JourneyPlanMode;
  topology: RuntimeTopology;
  capabilityMatrix?: CapabilityMatrix;
  capabilityRoutes?: CapabilityRoutingPlan;
  runtimeReadiness?: RuntimeReadinessResult;
  evidenceRequirements?: EvidenceRequirement[];
  journeys?: UserJourneyHint[];
  changedPaths?: string[];
  generatedAt?: Date | string;
}
