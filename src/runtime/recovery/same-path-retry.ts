import { evaluateCompletionVerdict } from '../verdict/index.ts';
import type {
  CompletionVerdict,
  EvidenceBlock,
} from '../contracts/index.ts';
import type {
  PlanSamePathRetryInput,
  RetryEvidenceChain,
  RetryFailureClassification,
  RetryVerdictTransition,
  SamePathComparison,
  SamePathMismatch,
  SamePathRetryBlocker,
  SamePathRetryPath,
  SamePathRetryReport,
  SamePathRetryResult,
  SamePathRetryStatus,
} from './types.ts';

export function planSamePathRetry(input: PlanSamePathRetryInput): SamePathRetryResult {
  const pathComparison = compareRetryPath(input.recoveryPlan.retryPath, input.retry.path);
  const retryEvidence = normalizeRetryEvidence(input.retry.evidence, pathComparison);
  const evidenceChain = buildEvidenceChain(input);
  const retryCapBlocker = retryCapBlockerFor(input, evidenceChain);
  const status = statusFor(input, pathComparison, retryCapBlocker);
  const failureClassification = classifyRetryFailure(input);
  const verdictResult = status === 'passed'
    ? evaluateCompletionVerdict({
      state: input.state,
      evidence: retryEvidence,
      requirements: input.requirements,
      now: input.generatedAt,
      claimedComplete: true,
    })
    : undefined;
  const verdictTransition = buildVerdictTransition(input, status, evidenceChain, pathComparison, verdictResult);
  const blockers = retryCapBlocker === undefined ? [] : [retryCapBlocker];
  const nextAction = nextActionFor(status, failureClassification, blockers);
  const report = buildReport({
    input,
    status,
    pathComparison,
    evidenceChain,
    retryEvidence,
    failureClassification,
    verdictTransition,
    blockers,
    nextAction,
  });

  return {
    ok: status === 'passed' && verdictTransition.to === 'complete',
    status,
    samePath: pathComparison.samePath,
    pathComparison,
    evidenceChain,
    retryEvidence,
    failureClassification,
    verdictTransition,
    blockers,
    ...(verdictResult === undefined ? {} : { verdictResult }),
    report,
    nextAction,
  };
}

function normalizeRetryEvidence(evidence: EvidenceBlock[], pathComparison: SamePathComparison): EvidenceBlock[] {
  if (pathComparison.samePath) return evidence;
  return evidence.map((entry) => ({
    ...entry,
    trustLevel: 'degraded',
    status: 'degraded',
    summary: entry.summary.includes('degraded same-path')
      ? entry.summary
      : `degraded same-path retry: ${entry.summary}`,
  }));
}

function compareRetryPath(expected: SamePathRetryPath, actual: SamePathRetryPath): SamePathComparison {
  const mismatches: SamePathMismatch[] = [];
  const matchedFields: string[] = [];

  compareField('actionId', expected.actionId, actual.actionId, mismatches, matchedFields);
  compareField('method', expected.method, actual.method, mismatches, matchedFields);
  compareField('url', expected.url, actual.url, mismatches, matchedFields);
  compareField('target', expected.target, actual.target, mismatches, matchedFields);
  compareCommand(expected, actual, mismatches, matchedFields);
  compareReproductionSteps(expected.reproductionSteps, actual.reproductionSteps, mismatches, matchedFields);

  if (actual.usedMock === true) {
    mismatches.push({
      field: 'mock',
      expected: false,
      actual: true,
      reason: 'Retry used a mock path, which cannot prove the original failure path.',
    });
  }

  if ((actual.skippedSteps?.length ?? 0) > 0) {
    mismatches.push({
      field: 'skippedSteps',
      expected: [],
      actual: actual.skippedSteps,
      reason: 'Retry skipped one or more original reproduction steps.',
    });
  }

  return {
    samePath: mismatches.length === 0,
    matchedFields,
    mismatches,
    degraded: mismatches.length > 0,
  };
}

function compareField(
  field: string,
  expected: unknown,
  actual: unknown,
  mismatches: SamePathMismatch[],
  matchedFields: string[],
): void {
  if (expected === undefined) return;
  if (actual === undefined && expected !== undefined) {
    mismatches.push({ field, expected, actual, reason: `${field} was required by the original retry path but missing from retry input.` });
    return;
  }
  if (expected !== actual) {
    mismatches.push({ field, expected, actual, reason: `${field} changed from the original failure path.` });
    return;
  }
  matchedFields.push(field);
}

function compareCommand(
  expected: SamePathRetryPath,
  actual: SamePathRetryPath,
  mismatches: SamePathMismatch[],
  matchedFields: string[],
): void {
  if (expected.command === undefined) return;
  const expectedCommand = JSON.stringify(expected.command);
  const actualCommand = JSON.stringify(actual.command);
  if (expectedCommand !== actualCommand) {
    mismatches.push({
      field: 'command',
      expected: expected.command,
      actual: actual.command,
      reason: 'Retry command differs from the original failing command.',
    });
    return;
  }
  matchedFields.push('command');
}

function compareReproductionSteps(
  expected: string[] | undefined,
  actual: string[] | undefined,
  mismatches: SamePathMismatch[],
  matchedFields: string[],
): void {
  if (expected === undefined || expected.length === 0) return;
  if (actual === undefined || actual.length !== expected.length || actual.some((step, index) => step !== expected[index])) {
    mismatches.push({
      field: 'reproductionSteps',
      expected,
      actual,
      reason: 'Retry reproduction steps differ from the original failure path.',
    });
    return;
  }
  matchedFields.push('reproductionSteps');
}

function buildEvidenceChain(input: PlanSamePathRetryInput): RetryEvidenceChain {
  return {
    beforeEvidenceRefs: input.fixAttempt.parentFailureEvidenceIds,
    fixAttemptId: input.fixAttempt.attemptId,
    fixEvidenceRefs: input.fixAttempt.generatedEvidenceRefs,
    retryAttemptId: input.retry.retryAttemptId,
    retryEvidenceRefs: input.retry.evidence.map((entry) => entry.id),
  };
}

function statusFor(
  input: PlanSamePathRetryInput,
  pathComparison: SamePathComparison,
  retryCapBlocker: SamePathRetryBlocker | undefined,
): SamePathRetryStatus {
  if (retryCapBlocker !== undefined) return 'blocked';
  if (!pathComparison.samePath) return 'degraded';
  if (input.retry.status === 'passed') return 'passed';
  if (input.retry.status === 'degraded') return 'degraded';
  if (input.retry.status === 'blocked') return 'blocked';
  return 'failed';
}

function classifyRetryFailure(input: PlanSamePathRetryInput): RetryFailureClassification {
  if (input.retry.status === 'passed') return 'none';
  const retryPrimary = input.retry.failureResult?.primary;
  if (retryPrimary === undefined) return input.retry.status === 'failed' ? 'unknown' : 'none';
  const original = input.recoveryPlan.suspectedRootCause;
  if (retryPrimary.category !== original.category) return 'new-failure';
  if (retryPrimary.id !== original.failureId) return 'changed-cause';
  return 'same-cause';
}

function retryCapBlockerFor(
  input: PlanSamePathRetryInput,
  evidenceChain: RetryEvidenceChain,
): SamePathRetryBlocker | undefined {
  if (input.retry.status !== 'failed') return undefined;
  if (input.retryLimit === undefined || input.retryCount === undefined) return undefined;
  if (input.retryCount < input.retryLimit) return undefined;
  return {
    code: 'retry-cap-reached',
    message: `Retry cap reached after ${input.retryCount} attempt(s); stop automatic fixes and surface a blocker report.`,
    owner: 'user',
    riskLevel: 'high',
    evidenceRefs: [...evidenceChain.beforeEvidenceRefs, ...evidenceChain.retryEvidenceRefs],
    nextAction: {
      owner: 'user',
      summary: 'Review the failed recovery chain and decide whether to authorize another attempt or handle manually.',
    },
  };
}

function buildVerdictTransition(
  input: PlanSamePathRetryInput,
  status: SamePathRetryStatus,
  evidenceChain: RetryEvidenceChain,
  pathComparison: SamePathComparison,
  verdictResult: ReturnType<typeof evaluateCompletionVerdict> | undefined,
): RetryVerdictTransition {
  const from = input.previousVerdict ?? input.state.verdictStatus;
  if (status === 'passed' && verdictResult !== undefined) {
    return {
      from,
      to: verdictResult.verdict.verdict,
      supportingEvidenceRefs: verdictResult.verdict.evidenceRefs,
      why: verdictResult.verdict.why,
      verdict: verdictResult.verdict,
    };
  }

  if (!pathComparison.samePath) {
    return {
      from,
      to: 'partial',
      supportingEvidenceRefs: evidenceChain.retryEvidenceRefs,
      why: 'Retry path changed, so the result is degraded and cannot support complete verdict.',
    };
  }

  return {
    from,
    to: 'blocked',
    supportingEvidenceRefs: evidenceChain.retryEvidenceRefs,
    why: status === 'blocked'
      ? 'Retry is blocked; completion remains blocked.'
      : 'Same-path retry did not pass, so completion remains blocked.',
  };
}

function nextActionFor(
  status: SamePathRetryStatus,
  failureClassification: RetryFailureClassification,
  blockers: SamePathRetryBlocker[],
): SamePathRetryResult['nextAction'] {
  const [blocker] = blockers;
  if (blocker !== undefined) return blocker.nextAction;

  if (status === 'passed') {
    return {
      owner: 'agent',
      summary: 'Use the same-path retry evidence to update the completion verdict and report the before/fix/retry chain.',
    };
  }

  if (status === 'degraded') {
    return {
      owner: 'agent',
      summary: 'Rerun the original path or request manual confirmation; degraded retry evidence cannot complete the task.',
    };
  }

  if (failureClassification === 'new-failure') {
    return {
      owner: 'agent',
      summary: 'Create a new recovery plan for the new failure before attempting another fix.',
    };
  }

  return {
    owner: 'agent',
    summary: 'Use retry diagnostics to decide whether to refine diagnostics, create a new recovery plan, or stop with a blocker.',
  };
}

interface BuildReportInput {
  input: PlanSamePathRetryInput;
  status: SamePathRetryStatus;
  pathComparison: SamePathComparison;
  evidenceChain: RetryEvidenceChain;
  retryEvidence: EvidenceBlock[];
  failureClassification: RetryFailureClassification;
  verdictTransition: RetryVerdictTransition;
  blockers: SamePathRetryBlocker[];
  nextAction: SamePathRetryResult['nextAction'];
}

function buildReport(input: BuildReportInput): SamePathRetryReport {
  return {
    retryAttemptId: input.input.retry.retryAttemptId,
    status: input.status,
    summary: `Retry ${input.input.retry.retryAttemptId} ${input.status}; before ${input.evidenceChain.beforeEvidenceRefs.join(', ') || 'none'}; fix ${input.evidenceChain.fixAttemptId}; retry ${input.evidenceChain.retryEvidenceRefs.join(', ') || 'none'}.`,
    samePath: input.pathComparison.samePath,
    pathComparison: input.pathComparison,
    evidenceChain: input.evidenceChain,
    retryEvidence: input.retryEvidence,
    failureClassification: input.failureClassification,
    verdictTransition: input.verdictTransition,
    blockers: input.blockers,
    nextAction: input.nextAction,
  };
}
