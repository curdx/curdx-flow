import type {
  CompletionVerdict,
  EvidenceBlock,
  StateLedger,
} from '../contracts/index.ts';
import type {
  EvidenceRequirement,
  VerdictEvaluationResult,
} from '../verdict/index.ts';
import type {
  ActionAuthorizationContext,
  ActionLogEntry,
  ActionPolicyAction,
  ActionPolicyDecision,
  ActionRiskLevel,
  RuntimeActionRiskPolicy,
} from '../policy/index.ts';
import type {
  DirtyFileStatus,
  DirtyWorktreeBaseline,
} from '../state/index.ts';

export type FailureSource =
  | 'command'
  | 'service'
  | 'browser'
  | 'api'
  | 'data'
  | 'capability'
  | 'release';

export type FailureCategory =
  | 'environment'
  | 'dependency'
  | 'frontend'
  | 'backend'
  | 'api'
  | 'data'
  | 'browser'
  | 'externalService'
  | 'releaseGate'
  | 'permission'
  | 'unknown';

export interface FailureCommandSummary extends Record<string, unknown> {
  executable: string;
  argv: string[];
  exitCode: number | null;
  cwd?: string;
}

export interface FailurePrivacySummary extends Record<string, unknown> {
  classification: 'local-only' | 'internal' | 'confidential' | 'secret';
  containsSensitiveData: boolean;
  redacted: boolean;
  summaryTruncated: boolean;
}

export interface FailureObservation extends Record<string, unknown> {
  id?: string;
  source: FailureSource;
  summary: string;
  failureCode?: string;
  reproductionSteps: string[];
  evidenceRefs: string[];
  artifactRefs: string[];
  observedAt?: string;
  startedAt?: string;
  completedAt?: string;
  command?: FailureCommandSummary;
  actionId?: string;
  method?: string;
  url?: string;
  status?: number;
  target?: string;
  capabilityId?: string;
  capabilityState?: string;
  stdout?: string;
  stderr?: string;
  responseSummary?: string;
  dataSummary?: string;
  possibleLayer?: string;
  category?: FailureCategory;
}

export interface CapturedFailureRecord extends Record<string, unknown> {
  id: string;
  source: FailureSource;
  category: FailureCategory;
  confidence: number;
  reason: string;
  signals: string[];
  summary: string;
  reproductionSteps: string[];
  evidenceRefs: string[];
  artifactRefs: string[];
  observedAt: string;
  privacy: FailurePrivacySummary;
  command?: FailureCommandSummary;
  actionId?: string;
  method?: string;
  url?: string;
  status?: number;
  target?: string;
  capabilityId?: string;
  capabilityState?: string;
}

export interface FailureTaxonomySummary extends Record<string, unknown> {
  categories: FailureCategory[];
  primaryCategory: FailureCategory;
  primaryFailureId: string;
  secondarySymptomIds: string[];
  confidence: number;
  reason: string;
}

export interface FailureNextAction extends Record<string, unknown> {
  owner: 'agent' | 'user' | 'external-system';
  summary: string;
}

export interface CaptureFailureEvidenceInput {
  runId: string;
  goalId: string;
  observations: FailureObservation[];
  generatedAt?: Date | string;
}

export interface FailureEvidenceCaptureResult extends Record<string, unknown> {
  schemaVersion: 1;
  ok: true;
  runId: string;
  goalId: string;
  generatedAt: string;
  failures: CapturedFailureRecord[];
  taxonomy: FailureTaxonomySummary;
  primary: CapturedFailureRecord;
  secondarySymptoms: CapturedFailureRecord[];
  diagnostics: Array<Record<string, unknown>>;
  nextAction: FailureNextAction;
}

export type RecoveryPlanMode = 'report-only' | 'fix' | 'release';

export type RecoveryPlanStatus = 'planned' | 'blocked' | 'manual-confirmation-required';

export type RecoveryOwner = 'agent' | 'user' | 'external-system';

export type RecoveryRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type RecoveryCapabilityState = 'available' | 'degraded' | 'unavailable' | 'unknown';

export interface RecoveryCapabilityStatus extends Record<string, unknown> {
  capabilityId: string;
  state: RecoveryCapabilityState;
  reason?: string;
  impact?: string;
  evidenceRefs?: string[];
}

export interface RecoveryPlannerCapabilities extends Record<string, RecoveryCapabilityStatus | undefined> {
  context7?: RecoveryCapabilityStatus;
  sequentialThinking?: RecoveryCapabilityStatus;
  history?: RecoveryCapabilityStatus;
  pua?: RecoveryCapabilityStatus;
}

export interface RecoveryHistoryMatch extends Record<string, unknown> {
  id: string;
  source: string;
  summary: string;
  confidence: number;
  suggestedFixPattern?: string;
  evidenceRefs?: string[];
}

export interface RecoveryHistoryReference extends Record<string, unknown> {
  id: string;
  source: string;
  sourceSummary: string;
  confidence: number;
  suggestedFixPattern?: string;
  evidenceRefs: string[];
}

export interface PlanRecoveryInput {
  runId: string;
  goalId: string;
  mode: RecoveryPlanMode;
  failureResult?: FailureEvidenceCaptureResult;
  failures?: CapturedFailureRecord[];
  capabilities?: RecoveryPlannerCapabilities;
  historyMatches?: RecoveryHistoryMatch[];
  generatedAt?: Date | string;
}

export interface SuspectedRootCause extends Record<string, unknown> {
  failureId: string;
  category: FailureCategory;
  summary: string;
  reason: string;
  confidence: number;
  evidenceRefs: string[];
  artifactRefs: string[];
  secondarySymptomIds: string[];
}

export interface RecoveryDiagnostic extends Record<string, unknown> {
  id: string;
  kind: string;
  summary: string;
  owner: RecoveryOwner;
  evidenceRefs: string[];
  capabilityId?: string;
  degraded?: boolean;
}

export type RecoveryCandidateActionKind =
  | 'code-fix'
  | 'restore-environment'
  | 'restore-dependency'
  | 'request-permission'
  | 'wait-for-external-service'
  | 'inspect-release-gate'
  | 'collect-diagnostics'
  | 'manual-confirmation';

export interface RecoveryCandidateAction extends Record<string, unknown> {
  id: string;
  kind: RecoveryCandidateActionKind;
  summary: string;
  owner: RecoveryOwner;
  riskLevel: RecoveryRiskLevel;
  mutatesWorkspace: boolean;
  requiresAuthorization: boolean;
  allowedModes: RecoveryPlanMode[];
  evidenceRefs: string[];
}

export interface RecoveryModeRestrictions extends Record<string, unknown> {
  mode: RecoveryPlanMode;
  mutatingActionsAllowed: boolean;
  notes: string[];
}

export interface RecoveryRetryPath extends Record<string, unknown> {
  samePathRequired: true;
  reproductionSteps: string[];
  evidenceRefs: string[];
  artifactRefs: string[];
  command?: FailureCommandSummary;
  actionId?: string;
  method?: string;
  url?: string;
  status?: number;
  target?: string;
}

export interface RecoveryOwnership extends Record<string, unknown> {
  owner: RecoveryOwner;
  reason: string;
  blocker?: string;
}

export interface ParallelDiagnosisLane extends Record<string, unknown> {
  id: string;
  owner: string;
  scope: string;
  summary: string;
  evidenceRefs: string[];
  writeScope: string[];
}

export interface ParallelDiagnosisPlan extends Record<string, unknown> {
  enabled: boolean;
  reason: string;
  lanes: ParallelDiagnosisLane[];
}

export interface RecoveryPlan extends Record<string, unknown> {
  schemaVersion: 1;
  status: RecoveryPlanStatus;
  runId: string;
  goalId: string;
  mode: RecoveryPlanMode;
  generatedAt: string;
  suspectedRootCause: SuspectedRootCause;
  requiredDiagnostics: RecoveryDiagnostic[];
  candidateActions: RecoveryCandidateAction[];
  riskLevel: RecoveryRiskLevel;
  modeRestrictions: RecoveryModeRestrictions;
  retryPath: RecoveryRetryPath;
  stopConditions: string[];
  ownership: RecoveryOwnership;
  degradedCapabilities: RecoveryCapabilityStatus[];
  historyReferences: RecoveryHistoryReference[];
  parallelDiagnosisPlan: ParallelDiagnosisPlan;
  nextAction: FailureNextAction;
}

export type FixAttemptExecutionResult = 'success' | 'failed' | 'partial' | 'skipped';

export type FixAttemptRecordResult = FixAttemptExecutionResult | 'planned' | 'blocked';

export type FixAttemptStatus = 'planned' | 'executed' | 'blocked' | 'failed' | 'partial' | 'skipped';

export interface FixAttemptExecutionInput extends Record<string, unknown> {
  result: FixAttemptExecutionResult;
  executedActions: string[];
  skippedActions: string[];
  modifiedFiles?: string[];
  generatedEvidenceRefs?: string[];
  failureReason?: string;
  diffSummary?: string;
}

export interface PlanFixAttemptInput {
  runId: string;
  goalId: string;
  workspaceRoot: string;
  mode: RecoveryPlanMode;
  recoveryPlan: RecoveryPlan;
  candidateActionId: string;
  action: ActionPolicyAction;
  policy?: RuntimeActionRiskPolicy;
  authorization?: ActionAuthorizationContext;
  dirtyBaseline?: DirtyWorktreeBaseline;
  allowedDirtyFiles?: string[];
  validationCommands?: string[];
  execution?: FixAttemptExecutionInput;
  generatedAt?: Date | string;
}

export interface FixAttemptBlocker extends Record<string, unknown> {
  code: string;
  category: 'policy' | 'dirty-worktree' | 'lineage';
  message: string;
  owner: RecoveryOwner;
  riskLevel: ActionRiskLevel;
  evidenceRefs: string[];
  nextAction: string;
  path?: string;
  dirtyStatus?: DirtyFileStatus;
}

export interface FixAttemptRecord extends Record<string, unknown> {
  schemaVersion: 1;
  attemptId: string;
  runId: string;
  goalId: string;
  mode: RecoveryPlanMode;
  candidateActionId: string;
  actionId: string;
  actionType: ActionPolicyAction['actionType'];
  parentFailureEvidenceIds: string[];
  targetFiles: string[];
  modifiedFiles: string[];
  intent: string;
  riskLevel: ActionRiskLevel;
  policyDecision: ActionPolicyDecision['decision'];
  actionLog?: ActionLogEntry;
  blockers: FixAttemptBlocker[];
  executedActions: string[];
  skippedActions: string[];
  result: FixAttemptRecordResult;
  generatedEvidenceRefs: string[];
  retryPath: RecoveryRetryPath;
  validationCommands: string[];
  failureReason?: string;
  diffSummary?: string;
  createdAt: string;
}

export interface FixAttemptReport extends Record<string, unknown> {
  attemptId: string;
  status: FixAttemptStatus;
  summary: string;
  targetFiles: string[];
  modifiedFiles: string[];
  intent: string;
  riskLevel: ActionRiskLevel;
  policyDecision: ActionPolicyDecision['decision'];
  validationCommands: string[];
  evidenceRefs: string[];
  blockerCodes: string[];
  samePathRetryRequired: boolean;
  verdictEligible: false;
  nextAction: FailureNextAction;
}

export interface FixAttemptResult extends Record<string, unknown> {
  ok: boolean;
  status: FixAttemptStatus;
  attempt: FixAttemptRecord;
  policyDecision: ActionPolicyDecision;
  blockers: FixAttemptBlocker[];
  report: FixAttemptReport;
  nextAction: FailureNextAction;
}

export interface SamePathRetryPath extends Partial<RecoveryRetryPath>, Record<string, unknown> {
  reproductionSteps?: string[];
  usedMock?: boolean;
  skippedSteps?: string[];
  equivalenceReason?: string;
}

export type SamePathRetryExecutionStatus = 'passed' | 'failed' | 'blocked' | 'degraded';

export interface SamePathRetryExecutionInput extends Record<string, unknown> {
  retryAttemptId: string;
  path: SamePathRetryPath;
  evidence: EvidenceBlock[];
  status: SamePathRetryExecutionStatus;
  failureResult?: FailureEvidenceCaptureResult;
}

export interface PlanSamePathRetryInput {
  runId: string;
  goalId: string;
  recoveryPlan: RecoveryPlan;
  fixAttempt: FixAttemptRecord;
  state: StateLedger;
  retry: SamePathRetryExecutionInput;
  requirements?: EvidenceRequirement[];
  previousVerdict?: CompletionVerdict['verdict'];
  retryCount?: number;
  retryLimit?: number;
  generatedAt?: Date | string;
}

export interface SamePathMismatch extends Record<string, unknown> {
  field: string;
  expected?: unknown;
  actual?: unknown;
  reason: string;
}

export interface SamePathComparison extends Record<string, unknown> {
  samePath: boolean;
  matchedFields: string[];
  mismatches: SamePathMismatch[];
  degraded: boolean;
}

export type RetryFailureClassification = 'none' | 'same-cause' | 'changed-cause' | 'new-failure' | 'unknown';

export type SamePathRetryStatus = 'passed' | 'failed' | 'blocked' | 'degraded';

export interface RetryEvidenceChain extends Record<string, unknown> {
  beforeEvidenceRefs: string[];
  fixAttemptId: string;
  fixEvidenceRefs: string[];
  retryAttemptId: string;
  retryEvidenceRefs: string[];
}

export interface RetryVerdictTransition extends Record<string, unknown> {
  from: CompletionVerdict['verdict'] | 'failed' | 'pending' | 'not-releasable';
  to: CompletionVerdict['verdict'] | 'failed';
  supportingEvidenceRefs: string[];
  why: string;
  verdict?: CompletionVerdict;
}

export interface SamePathRetryBlocker extends Record<string, unknown> {
  code: string;
  message: string;
  owner: RecoveryOwner;
  riskLevel: RecoveryRiskLevel;
  evidenceRefs: string[];
  nextAction: FailureNextAction;
}

export interface SamePathRetryReport extends Record<string, unknown> {
  retryAttemptId: string;
  status: SamePathRetryStatus;
  summary: string;
  samePath: boolean;
  pathComparison: SamePathComparison;
  evidenceChain: RetryEvidenceChain;
  retryEvidence: EvidenceBlock[];
  failureClassification: RetryFailureClassification;
  verdictTransition: RetryVerdictTransition;
  blockers: SamePathRetryBlocker[];
  nextAction: FailureNextAction;
}

export interface SamePathRetryResult extends Record<string, unknown> {
  ok: boolean;
  status: SamePathRetryStatus;
  samePath: boolean;
  pathComparison: SamePathComparison;
  evidenceChain: RetryEvidenceChain;
  retryEvidence: EvidenceBlock[];
  failureClassification: RetryFailureClassification;
  verdictTransition: RetryVerdictTransition;
  blockers: SamePathRetryBlocker[];
  verdictResult?: VerdictEvaluationResult;
  report: SamePathRetryReport;
  nextAction: FailureNextAction;
}

export interface BuildDefaultRecoveryPolicyInput extends Record<string, unknown> {
  maxFixAttempts?: number;
  maxRetries?: number;
  noFalseCompletion?: boolean;
}

export interface RecoveryPolicy extends Record<string, unknown> {
  schemaVersion: 1;
  maxFixAttempts: number;
  maxRetries: number;
  noFalseCompletion: true;
  manualConfirmationCategories: FailureCategory[];
  externalBlockerCategories: FailureCategory[];
}

export interface RecoveryAttemptSummary extends Record<string, unknown> {
  attemptId: string;
  actionId: string;
  result: FixAttemptRecordResult;
  riskLevel: RecoveryRiskLevel;
  targetFiles: string[];
  evidenceRefs: string[];
}

export interface RecoveryNextPlan extends Record<string, unknown> {
  owner: RecoveryOwner;
  summary: string;
  steps: string[];
  requiredEvidenceRefs: string[];
  blockedBy: string[];
  riskLevel: RecoveryRiskLevel;
}

export type RecoveryFinalVerdict = 'complete' | 'partial' | 'blocked' | 'manual-confirmation-required';

export interface BuildRecoveryBlockerReportInput {
  runId: string;
  goalId: string;
  recoveryPlan: RecoveryPlan;
  failureResult?: FailureEvidenceCaptureResult;
  fixAttempts?: FixAttemptRecord[];
  retryResults?: SamePathRetryResult[];
  policy?: Partial<RecoveryPolicy>;
  generatedAt?: Date | string;
}

export interface RecoveryBlockerReport extends Record<string, unknown> {
  schemaVersion: 1;
  runId: string;
  goalId: string;
  generatedAt: string;
  status: RecoveryFinalVerdict;
  finalVerdict: RecoveryFinalVerdict;
  failureReason: string;
  reproductionPath: string[];
  attemptedActions: RecoveryAttemptSummary[];
  evidenceChain: RetryEvidenceChain;
  remainingRisk: string;
  owner: RecoveryOwner;
  riskLevel: RecoveryRiskLevel;
  nextAction: FailureNextAction;
  nextPlan: RecoveryNextPlan;
  blockers: SamePathRetryBlocker[];
  noFalseCompletion: true;
}
