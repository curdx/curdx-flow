import {
  buildActionLogEntry,
  buildDefaultActionRiskPolicy,
  evaluateActionPolicy,
} from '../policy/index.ts';
import { summarizeArtifactText } from '../evidence/index.ts';
import type {
  ActionLogEntry,
  ActionLogResult,
  ActionPolicyAction,
  PolicyBlocker,
} from '../policy/index.ts';
import type {
  DirtyFileRecord,
} from '../state/index.ts';
import type {
  FixAttemptBlocker,
  FixAttemptExecutionInput,
  FixAttemptRecord,
  FixAttemptRecordResult,
  FixAttemptReport,
  FixAttemptResult,
  FixAttemptStatus,
  PlanFixAttemptInput,
  RecoveryCandidateAction,
  RecoveryOwner,
} from './types.ts';

export function planFixAttempt(input: PlanFixAttemptInput): FixAttemptResult {
  const createdAt = toIso(input.generatedAt);
  const candidate = input.recoveryPlan.candidateActions.find((entry) => entry.id === input.candidateActionId);
  const parentFailureEvidenceIds = candidate === undefined
    ? input.recoveryPlan.suspectedRootCause.evidenceRefs
    : unique([...input.recoveryPlan.suspectedRootCause.evidenceRefs, ...candidate.evidenceRefs]);
  const action = normalizePolicyAction(input.action, input.mode, parentFailureEvidenceIds);
  const policy = input.policy ?? buildDefaultActionRiskPolicy({ mode: input.mode });
  const policyDecision = evaluateActionPolicy({
    policy,
    workspaceRoot: input.workspaceRoot,
    action,
    authorization: input.authorization,
    now: createdAt,
    runId: input.runId,
    goalId: input.goalId,
  });
  const policyBlockers = policyDecision.blockers.map((blocker) => fromPolicyBlocker(blocker));
  const lineageBlockers = candidate === undefined ? [missingCandidateBlocker(input)] : [];
  const dirtyBlockers = dirtyBaselineBlockers(input, action, policyDecision.riskLevel);
  const blockers = [...lineageBlockers, ...policyBlockers, ...dirtyBlockers];
  const status = statusFor(blockers, input.execution);
  const recordResult = recordResultFor(status, input.execution);
  const execution = normalizeExecution(input.execution, blockers.length > 0);
  const generatedEvidenceRefs = blockers.length > 0 ? [] : execution.generatedEvidenceRefs;
  const modifiedFiles = blockers.length > 0 ? [] : execution.modifiedFiles;
  const attempt = buildAttempt({
    input,
    action,
    candidate,
    parentFailureEvidenceIds,
    blockers,
    status,
    recordResult,
    execution,
    generatedEvidenceRefs,
    modifiedFiles,
    createdAt,
    policyDecision,
  });
  const nextAction = nextActionFor(status, blockers);
  const report = buildReport(attempt, status, nextAction);

  return {
    ok: status === 'executed',
    status,
    attempt,
    policyDecision,
    blockers,
    report,
    nextAction,
  };
}

export function appendFixAttemptLineage(
  existing: readonly FixAttemptRecord[],
  attempt: FixAttemptRecord,
): FixAttemptRecord[] {
  return [...existing, attempt];
}

interface BuildAttemptInput {
  input: PlanFixAttemptInput;
  action: ActionPolicyAction;
  candidate: RecoveryCandidateAction | undefined;
  parentFailureEvidenceIds: string[];
  blockers: FixAttemptBlocker[];
  status: FixAttemptStatus;
  recordResult: FixAttemptRecordResult;
  execution: NormalizedExecution;
  generatedEvidenceRefs: string[];
  modifiedFiles: string[];
  createdAt: string;
  policyDecision: ReturnType<typeof evaluateActionPolicy>;
}

function buildAttempt(input: BuildAttemptInput): FixAttemptRecord {
  const actionLog = buildAttemptActionLog(input);
  return {
    schemaVersion: 1,
    attemptId: buildAttemptId(input.input, input.createdAt),
    runId: input.input.runId,
    goalId: input.input.goalId,
    mode: input.input.mode,
    candidateActionId: input.input.candidateActionId,
    actionId: input.action.id,
    actionType: input.action.actionType,
    parentFailureEvidenceIds: input.parentFailureEvidenceIds,
    targetFiles: input.action.targetFiles ?? [],
    modifiedFiles: input.modifiedFiles,
    intent: summarize(input.action.intent, 260),
    riskLevel: input.policyDecision.riskLevel,
    policyDecision: input.policyDecision.decision,
    ...(actionLog === undefined ? {} : { actionLog }),
    blockers: input.blockers,
    executedActions: input.blockers.length > 0 ? [] : input.execution.executedActions,
    skippedActions: input.blockers.length > 0 ? plannedSkippedActions(input.action, input.candidate) : input.execution.skippedActions,
    result: input.recordResult,
    generatedEvidenceRefs: input.generatedEvidenceRefs,
    retryPath: input.input.recoveryPlan.retryPath,
    validationCommands: input.input.validationCommands ?? [],
    ...(input.execution.failureReason === undefined ? {} : { failureReason: summarize(input.execution.failureReason, 260) }),
    ...(input.execution.diffSummary === undefined ? {} : { diffSummary: summarize(input.execution.diffSummary, 320) }),
    createdAt: input.createdAt,
  };
}

function normalizePolicyAction(
  action: ActionPolicyAction,
  mode: PlanFixAttemptInput['mode'],
  evidenceRefs: string[],
): ActionPolicyAction {
  return {
    ...action,
    mode,
    evidenceRefs: unique([...(action.evidenceRefs ?? []), ...evidenceRefs]),
  };
}

interface NormalizedExecution {
  result: FixAttemptExecutionInput['result'] | 'planned';
  executedActions: string[];
  skippedActions: string[];
  modifiedFiles: string[];
  generatedEvidenceRefs: string[];
  failureReason?: string;
  diffSummary?: string;
}

function normalizeExecution(
  execution: FixAttemptExecutionInput | undefined,
  blocked: boolean,
): NormalizedExecution {
  if (blocked) {
    return {
      result: 'planned',
      executedActions: [],
      skippedActions: [],
      modifiedFiles: [],
      generatedEvidenceRefs: [],
    };
  }

  if (execution === undefined) {
    return {
      result: 'planned',
      executedActions: [],
      skippedActions: [],
      modifiedFiles: [],
      generatedEvidenceRefs: [],
    };
  }

  return {
    result: execution.result,
    executedActions: [...execution.executedActions],
    skippedActions: [...execution.skippedActions],
    modifiedFiles: execution.modifiedFiles ?? [],
    generatedEvidenceRefs: execution.generatedEvidenceRefs ?? [],
    ...(execution.failureReason === undefined ? {} : { failureReason: execution.failureReason }),
    ...(execution.diffSummary === undefined ? {} : { diffSummary: execution.diffSummary }),
  };
}

function statusFor(
  blockers: FixAttemptBlocker[],
  execution: FixAttemptExecutionInput | undefined,
): FixAttemptStatus {
  if (blockers.length > 0) return 'blocked';
  if (execution === undefined) return 'planned';
  if (execution.result === 'success') return 'executed';
  return execution.result;
}

function recordResultFor(
  status: FixAttemptStatus,
  execution: FixAttemptExecutionInput | undefined,
): FixAttemptRecordResult {
  if (status === 'executed') return 'success';
  if (status === 'blocked') return 'blocked';
  if (execution !== undefined) return execution.result;
  return 'planned';
}

function fromPolicyBlocker(blocker: PolicyBlocker): FixAttemptBlocker {
  return {
    code: blocker.code,
    category: 'policy',
    message: blocker.message,
    owner: toRecoveryOwner(blocker.owner),
    riskLevel: blocker.riskLevel,
    evidenceRefs: blocker.evidenceRefs ?? [],
    nextAction: policyNextActionSummary(blocker.nextAction),
  };
}

function missingCandidateBlocker(input: PlanFixAttemptInput): FixAttemptBlocker {
  return {
    code: 'candidate-action-missing',
    category: 'lineage',
    message: `Recovery candidate action ${input.candidateActionId} was not found in the recovery plan.`,
    owner: 'agent',
    riskLevel: 'medium',
    evidenceRefs: input.recoveryPlan.suspectedRootCause.evidenceRefs,
    nextAction: 'Regenerate the recovery plan or choose an existing candidate action.',
  };
}

function dirtyBaselineBlockers(
  input: PlanFixAttemptInput,
  action: ActionPolicyAction,
  riskLevel: FixAttemptBlocker['riskLevel'],
): FixAttemptBlocker[] {
  if (action.mutatesWorkspace !== true) return [];
  const dirtyFiles = input.dirtyBaseline?.files ?? [];
  if (dirtyFiles.length === 0) return [];

  const allowedDirtyFiles = new Set(input.allowedDirtyFiles ?? []);
  const targetFiles = new Set(action.targetFiles ?? []);
  return dirtyFiles
    .filter((dirtyFile) => targetFiles.has(dirtyFile.path) && !allowedDirtyFiles.has(dirtyFile.path))
    .map((dirtyFile) => dirtyBlocker(dirtyFile, action.evidenceRefs ?? [], riskLevel));
}

function dirtyBlocker(
  dirtyFile: DirtyFileRecord,
  evidenceRefs: string[],
  riskLevel: FixAttemptBlocker['riskLevel'],
): FixAttemptBlocker {
  return {
    code: 'dirty-worktree-conflict',
    category: 'dirty-worktree',
    message: `Target file ${dirtyFile.path} already has ${dirtyFile.status} user changes and cannot be overwritten by this fix attempt.`,
    owner: 'user',
    riskLevel,
    evidenceRefs,
    nextAction: 'Review or isolate the existing user change before attempting this fix.',
    path: dirtyFile.path,
    dirtyStatus: dirtyFile.status,
  };
}

function buildReport(
  attempt: FixAttemptRecord,
  status: FixAttemptStatus,
  nextAction: FixAttemptReport['nextAction'],
): FixAttemptReport {
  const evidenceRefs = unique([...attempt.parentFailureEvidenceIds, ...attempt.generatedEvidenceRefs]);
  return {
    attemptId: attempt.attemptId,
    status,
    summary: `${attempt.actionId} ${status}: ${attempt.intent}; targets ${attempt.targetFiles.join(', ') || 'none'}; risk ${attempt.riskLevel}.`,
    targetFiles: attempt.targetFiles,
    modifiedFiles: attempt.modifiedFiles,
    intent: attempt.intent,
    riskLevel: attempt.riskLevel,
    policyDecision: attempt.policyDecision,
    validationCommands: attempt.validationCommands,
    evidenceRefs,
    blockerCodes: attempt.blockers.map((blocker) => blocker.code),
    samePathRetryRequired: attempt.retryPath.samePathRequired,
    verdictEligible: false,
    nextAction,
  };
}

function nextActionFor(status: FixAttemptStatus, blockers: FixAttemptBlocker[]): FixAttemptReport['nextAction'] {
  if (status === 'blocked') {
    const [firstBlocker] = blockers;
    return {
      owner: firstBlocker?.owner ?? 'agent',
      summary: firstBlocker?.nextAction ?? 'Resolve the blocker before executing this fix attempt.',
    };
  }

  if (status === 'failed' || status === 'partial') {
    return {
      owner: 'agent',
      summary: 'Record the failed or partial attempt, then run same-path retry or regenerate diagnostics before any success verdict.',
    };
  }

  if (status === 'executed') {
    return {
      owner: 'agent',
      summary: 'Run same-path retry before updating any completion verdict.',
    };
  }

  return {
    owner: 'agent',
    summary: 'Execute the policy-allowed fix attempt, then record evidence and run same-path retry.',
  };
}

function plannedSkippedActions(
  action: ActionPolicyAction,
  candidate: RecoveryCandidateAction | undefined,
): string[] {
  const skipped: string[] = [action.actionType];
  if (candidate?.kind !== undefined) skipped.push(candidate.kind);
  return skipped;
}

function buildAttemptActionLog(input: BuildAttemptInput): ActionLogEntry | undefined {
  if (input.policyDecision.requiresActionLog !== true) return undefined;
  return buildActionLogEntry({
    id: input.action.id,
    runId: input.input.runId,
    goalId: input.input.goalId,
    mode: input.input.mode,
    actionType: input.action.actionType,
    targetFiles: input.action.targetFiles ?? [],
    riskLevel: input.policyDecision.riskLevel,
    intent: input.action.intent,
    result: actionLogResultFor(input.status),
    command: input.action.command,
    diffSummary: input.execution.diffSummary ?? input.action.diffSummary,
    evidenceRefs: input.parentFailureEvidenceIds,
    requiresSamePathRetry: input.policyDecision.requiresSamePathRetry,
    createdAt: input.createdAt,
  });
}

function actionLogResultFor(status: FixAttemptStatus): ActionLogResult {
  switch (status) {
    case 'executed':
      return 'success';
    case 'blocked':
      return 'blocked';
    case 'skipped':
    case 'planned':
      return 'skipped';
    case 'failed':
    case 'partial':
      return 'failed';
  }
}

function policyNextActionSummary(value: PolicyBlocker['nextAction']): string {
  if (isRecord(value) && typeof value.summary === 'string') return value.summary;
  return 'Resolve the policy blocker before executing this fix attempt.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildAttemptId(input: PlanFixAttemptInput, createdAt: string): string {
  const safeActionId = input.action.id.replace(/[^a-zA-Z0-9._-]+/g, '-');
  return `${input.runId}-${safeActionId}-${createdAt.replace(/[^0-9]/g, '').slice(0, 14)}`;
}

function toRecoveryOwner(owner: string): RecoveryOwner {
  if (owner === 'user' || owner === 'external-system') return owner;
  return 'agent';
}

function summarize(value: string, maxLength: number): string {
  return summarizeArtifactText(value, maxLength).summary;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function toIso(value?: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}
