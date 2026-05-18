import type {
  BuildDefaultRecoveryPolicyInput,
  BuildRecoveryBlockerReportInput,
  FailureCategory,
  FixAttemptRecord,
  RecoveryAttemptSummary,
  RecoveryBlockerReport,
  RecoveryFinalVerdict,
  RecoveryNextPlan,
  RecoveryOwner,
  RecoveryPolicy,
  RecoveryRiskLevel,
  RetryEvidenceChain,
  SamePathRetryBlocker,
  SamePathRetryResult,
} from './types.ts';

export function buildDefaultRecoveryPolicy(input: BuildDefaultRecoveryPolicyInput = {}): RecoveryPolicy {
  return {
    schemaVersion: 1,
    maxFixAttempts: input.maxFixAttempts ?? 2,
    maxRetries: input.maxRetries ?? 2,
    noFalseCompletion: true,
    manualConfirmationCategories: ['permission', 'environment', 'dependency'],
    externalBlockerCategories: ['externalService'],
  };
}

export function buildRecoveryBlockerReport(input: BuildRecoveryBlockerReportInput): RecoveryBlockerReport {
  const policy = normalizeRecoveryPolicy(input.policy);
  const retryResults = input.retryResults ?? [];
  const fixAttempts = input.fixAttempts ?? [];
  const latestRetry = retryResults.at(-1);
  const category = input.recoveryPlan.suspectedRootCause.category;
  const decision = decideReport(input, policy, latestRetry);
  const evidenceChain = buildReportEvidenceChain(input, latestRetry);
  const attemptedActions = fixAttempts.map(toAttemptSummary);
  const blockers = buildBlockers(input, decision, evidenceChain);
  const nextAction = nextActionFor(decision, category);
  const nextPlan = nextPlanFor(decision, category, evidenceChain, blockers);

  return {
    schemaVersion: 1,
    runId: input.runId,
    goalId: input.goalId,
    generatedAt: toIso(input.generatedAt),
    status: decision.finalVerdict,
    finalVerdict: decision.finalVerdict,
    failureReason: decision.failureReason,
    reproductionPath: input.recoveryPlan.retryPath.reproductionSteps,
    attemptedActions,
    evidenceChain,
    remainingRisk: decision.remainingRisk,
    owner: decision.owner,
    riskLevel: decision.riskLevel,
    nextAction,
    nextPlan,
    blockers,
    noFalseCompletion: true,
  };
}

interface ReportDecision {
  code: string;
  finalVerdict: RecoveryFinalVerdict;
  failureReason: string;
  remainingRisk: string;
  owner: RecoveryOwner;
  riskLevel: RecoveryRiskLevel;
}

function decideReport(
  input: BuildRecoveryBlockerReportInput,
  policy: RecoveryPolicy,
  latestRetry: SamePathRetryResult | undefined,
): ReportDecision {
  const category = input.recoveryPlan.suspectedRootCause.category;

  if (latestRetry?.verdictTransition.to === 'complete') {
    return {
      code: 'recovery-complete',
      finalVerdict: 'complete',
      failureReason: 'Same-path retry passed and verdict evaluator returned complete.',
      remainingRisk: 'low: recovery evidence supports completion.',
      owner: 'agent',
      riskLevel: 'low',
    };
  }

  if (latestRetry?.verdictTransition.to === 'partial' || latestRetry?.status === 'degraded') {
    return {
      code: 'recovery-degraded',
      finalVerdict: 'partial',
      failureReason: 'Recovery evidence is degraded or path changed; complete verdict is not allowed.',
      remainingRisk: 'medium: original failure path is not fully proven after recovery.',
      owner: 'agent',
      riskLevel: 'medium',
    };
  }

  if (policy.externalBlockerCategories.includes(category)) {
    return {
      code: 'external-service-blocker',
      finalVerdict: 'blocked',
      failureReason: 'External service failure cannot be automatically fixed inside this workspace.',
      remainingRisk: 'high: upstream availability is outside agent control.',
      owner: 'external-system',
      riskLevel: 'high',
    };
  }

  if (policy.manualConfirmationCategories.includes(category)) {
    return {
      code: `${category}-manual-confirmation`,
      finalVerdict: 'manual-confirmation-required',
      failureReason: `${category} recovery requires user confirmation before another automatic fix.`,
      remainingRisk: 'high: user-owned blocker is unresolved.',
      owner: 'user',
      riskLevel: 'high',
    };
  }

  const unsafeAttempt = (input.fixAttempts ?? []).find(isUnsafeAttempt);
  if (unsafeAttempt !== undefined) {
    return {
      code: 'high-risk-attempt-blocker',
      finalVerdict: 'blocked',
      failureReason: `high-risk ${unsafeAttempt.actionType} attempt requires explicit user authorization before recovery can continue.`,
      remainingRisk: 'high: destructive, global, release, or production-data actions cannot continue automatically.',
      owner: 'user',
      riskLevel: 'high',
    };
  }

  if ((input.fixAttempts?.length ?? 0) >= policy.maxFixAttempts) {
    return {
      code: 'fix-cap-reached',
      finalVerdict: 'blocked',
      failureReason: `Fix attempt cap reached after ${input.fixAttempts?.length ?? 0} attempt(s).`,
      remainingRisk: 'high: repeated automatic edits risk churn or user worktree damage.',
      owner: 'user',
      riskLevel: 'high',
    };
  }

  const failedRetries = (input.retryResults ?? []).filter((retry) => retry.status === 'failed' || retry.status === 'blocked');
  if (failedRetries.length >= policy.maxRetries || latestRetry?.blockers.some((blocker) => blocker.code === 'retry-cap-reached') === true) {
    return {
      code: 'retry-cap-reached',
      finalVerdict: 'blocked',
      failureReason: `Retry cap reached after ${failedRetries.length} failed retry result(s).`,
      remainingRisk: 'high: same-path retry did not recover the original failure.',
      owner: 'user',
      riskLevel: 'high',
    };
  }

  return {
    code: 'recovery-blocked',
    finalVerdict: 'blocked',
    failureReason: 'Recovery has not produced same-path completion evidence or an actionable success verdict.',
    remainingRisk: 'medium: more diagnostics are required before another fix attempt.',
    owner: 'agent',
    riskLevel: 'medium',
  };
}

function isUnsafeAttempt(attempt: FixAttemptRecord): boolean {
  return attempt.riskLevel === 'critical'
    || attempt.actionType === 'delete-file'
    || attempt.actionType === 'destructive-migration'
    || attempt.actionType === 'global-config-change'
    || attempt.actionType === 'production-data-access';
}

function buildReportEvidenceChain(
  input: BuildRecoveryBlockerReportInput,
  latestRetry: SamePathRetryResult | undefined,
): RetryEvidenceChain {
  if (latestRetry !== undefined) return latestRetry.evidenceChain;
  const fixAttempt = input.fixAttempts?.at(-1);
  return {
    beforeEvidenceRefs: input.recoveryPlan.suspectedRootCause.evidenceRefs,
    fixAttemptId: fixAttempt?.attemptId ?? 'no-fix-attempt',
    fixEvidenceRefs: fixAttempt?.generatedEvidenceRefs ?? [],
    retryAttemptId: 'no-retry-attempt',
    retryEvidenceRefs: [],
  };
}

function toAttemptSummary(attempt: FixAttemptRecord): RecoveryAttemptSummary {
  return {
    attemptId: attempt.attemptId,
    actionId: attempt.actionId,
    result: attempt.result,
    riskLevel: toRecoveryRisk(attempt.riskLevel),
    targetFiles: attempt.targetFiles,
    evidenceRefs: attempt.generatedEvidenceRefs,
  };
}

function buildBlockers(
  input: BuildRecoveryBlockerReportInput,
  decision: ReportDecision,
  evidenceChain: RetryEvidenceChain,
): SamePathRetryBlocker[] {
  if (decision.finalVerdict === 'complete') return [];
  return [
    {
      code: decision.code,
      message: decision.failureReason,
      owner: decision.owner,
      riskLevel: decision.riskLevel,
      evidenceRefs: [
        ...evidenceChain.beforeEvidenceRefs,
        ...evidenceChain.fixEvidenceRefs,
        ...evidenceChain.retryEvidenceRefs,
      ],
      nextAction: nextActionFor(decision, input.recoveryPlan.suspectedRootCause.category),
    },
  ];
}

function nextActionFor(decision: ReportDecision, category: FailureCategory): RecoveryBlockerReport['nextAction'] {
  if (decision.finalVerdict === 'complete') {
    return { owner: 'agent', summary: 'Report the successful same-path recovery evidence and final verdict.' };
  }
  if (decision.owner === 'external-system') {
    return { owner: 'external-system', summary: 'Wait for or restore the external service, then rerun the original same-path verification.' };
  }
  if (decision.finalVerdict === 'manual-confirmation-required') {
    return { owner: 'user', summary: `Resolve or authorize the ${category} blocker, then rerun the same failure path.` };
  }
  if (decision.code.includes('cap')) {
    return { owner: 'user', summary: 'Review the recovery chain and explicitly decide whether another fix attempt is safe.' };
  }
  return { owner: 'agent', summary: 'Create a narrower recovery plan with additional diagnostics before attempting another fix.' };
}

function nextPlanFor(
  decision: ReportDecision,
  category: FailureCategory,
  evidenceChain: RetryEvidenceChain,
  blockers: SamePathRetryBlocker[],
): RecoveryNextPlan {
  const requiredEvidenceRefs = [
    ...evidenceChain.beforeEvidenceRefs,
    ...evidenceChain.fixEvidenceRefs,
    ...evidenceChain.retryEvidenceRefs,
  ];
  return {
    owner: decision.owner,
    summary: nextPlanSummary(decision, category),
    steps: nextPlanSteps(decision, category),
    requiredEvidenceRefs,
    blockedBy: blockers.map((blocker) => blocker.code),
    riskLevel: decision.riskLevel,
  };
}

function nextPlanSummary(decision: ReportDecision, category: FailureCategory): string {
  if (decision.finalVerdict === 'complete') return 'Document recovered same-path evidence and close recovery.';
  if (decision.owner === 'external-system') return 'Track external service restoration and retry original path after provider recovery.';
  if (decision.finalVerdict === 'manual-confirmation-required') return `Resolve ${category} blocker with user confirmation before any further automatic fix.`;
  if (decision.code.includes('cap')) return 'Stop automatic recovery and escalate with the full before/fix/retry evidence chain.';
  return 'Collect narrower diagnostics and generate a new evidence-backed recovery plan.';
}

function nextPlanSteps(decision: ReportDecision, category: FailureCategory): string[] {
  if (decision.finalVerdict === 'complete') {
    return ['Publish the before/fix/retry evidence chain in the report.', 'Update final verdict using the verified same-path retry evidence.'];
  }
  if (decision.owner === 'external-system') {
    return ['Confirm external service health or provider incident resolution.', 'Rerun the original same-path verification after the external service is healthy.'];
  }
  if (decision.finalVerdict === 'manual-confirmation-required') {
    return [`Ask the user to resolve or authorize the ${category} blocker.`, 'Capture confirmation evidence before retrying the original failure path.'];
  }
  if (decision.code.includes('cap')) {
    return ['Stop automatic edits immediately.', 'Review attempted actions and retry evidence with the user.', 'Create a new story or manual task if another recovery attempt is justified.'];
  }
  return ['Collect additional diagnostics for the unresolved failure.', 'Generate a new root-cause recovery plan before editing files again.'];
}

function normalizeRecoveryPolicy(policy: Partial<RecoveryPolicy> | undefined): RecoveryPolicy {
  return {
    ...buildDefaultRecoveryPolicy(),
    ...(policy ?? {}),
    schemaVersion: 1,
    noFalseCompletion: true,
    manualConfirmationCategories: policy?.manualConfirmationCategories ?? ['permission', 'environment', 'dependency'],
    externalBlockerCategories: policy?.externalBlockerCategories ?? ['externalService'],
  };
}

function toRecoveryRisk(value: string): RecoveryRiskLevel {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') return value;
  return 'medium';
}

function toIso(value?: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}
