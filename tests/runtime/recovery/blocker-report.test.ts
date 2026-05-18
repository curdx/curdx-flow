import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EvidenceBlock, StateLedger } from '../../../src/runtime/contracts/index.ts';
import {
  buildDefaultRecoveryPolicy,
  buildRecoveryBlockerReport,
  captureFailureEvidence,
  planFixAttempt,
  planRecovery,
  planSamePathRetry,
  type FailureObservation,
  type FixAttemptRecord,
  type RecoveryPlan,
  type SamePathRetryResult,
} from '../../../src/runtime/recovery/index.ts';

const now = '2026-05-17T20:00:00.000Z';
const workspaceRoot = process.cwd();
const fixturePath = join(process.cwd(), 'tests/fixtures/recovery-scenarios/recovery-fixtures.json');

function failure(overrides: Partial<FailureObservation> = {}): FailureObservation {
  return {
    id: overrides.id ?? 'api-status-mismatch',
    source: overrides.source ?? 'api',
    summary: overrides.summary ?? 'PATCH /api/profile returned 500',
    failureCode: overrides.failureCode ?? 'api-status-mismatch',
    reproductionSteps: overrides.reproductionSteps ?? ['Open /profile', 'Click Save'],
    evidenceRefs: overrides.evidenceRefs ?? ['api-run-profile-save'],
    artifactRefs: overrides.artifactRefs ?? ['profile-trace'],
    observedAt: overrides.observedAt ?? '2026-05-17T19:59:00.000Z',
    ...overrides,
  };
}

function recoveryPlan(observation: FailureObservation = failure()): RecoveryPlan {
  const failureResult = captureFailureEvidence({
    runId: 'run-blocker-report',
    goalId: 'goal-blocker-report',
    observations: [observation],
    generatedAt: now,
  });

  return planRecovery({
    runId: 'run-blocker-report',
    goalId: 'goal-blocker-report',
    mode: 'fix',
    failureResult,
    generatedAt: now,
  });
}

function firstCandidateId(plan: RecoveryPlan): string {
  const [candidate] = plan.candidateActions;
  if (candidate === undefined) throw new Error('test recovery plan did not produce a candidate action');
  return candidate.id;
}

function fixAttempt(plan: RecoveryPlan, id = 'fix-profile-api'): FixAttemptRecord {
  return planFixAttempt({
    runId: 'run-blocker-report',
    goalId: 'goal-blocker-report',
    workspaceRoot,
    mode: 'fix',
    recoveryPlan: plan,
    candidateActionId: firstCandidateId(plan),
    action: {
      id,
      actionType: 'source-edit',
      targetFiles: ['src/app/profile-api.ts'],
      intent: 'Fix profile API failure',
      mutatesWorkspace: true,
    },
    dirtyBaseline: { capturedAt: now, files: [] },
    execution: {
      result: 'success',
      executedActions: ['source-edit'],
      skippedActions: [],
      modifiedFiles: ['src/app/profile-api.ts'],
      generatedEvidenceRefs: [`ev-${id}`],
    },
    generatedAt: now,
  }).attempt;
}

function state(overrides: Partial<StateLedger> = {}): StateLedger {
  return {
    schemaVersion: 1,
    runId: 'run-blocker-report',
    goalId: 'goal-blocker-report',
    workspaceRoot,
    mode: 'verification',
    policy: { noFalseCompletion: true },
    scope: { summary: 'verify fixed profile save' },
    expectedJourney: { summary: 'profile save succeeds' },
    status: 'running',
    verdictStatus: 'blocked',
    phase: 'retry',
    startedAt: '2026-05-17T19:50:00.000Z',
    updatedAt: now,
    evidenceIds: [],
    missingEvidence: [],
    artifactIndexPath: '.curdx/artifacts/index.jsonl',
    dirtyBaseline: { capturedAt: now, files: [] },
    generatedFiles: [],
    nextAction: { owner: 'agent', summary: 'recover failure' },
    ...overrides,
  };
}

function evidence(overrides: Partial<EvidenceBlock> = {}): EvidenceBlock {
  return {
    schemaVersion: 1,
    id: overrides.id ?? 'ev-retry-profile-save',
    runId: 'run-blocker-report',
    goalId: 'goal-blocker-report',
    source: overrides.source ?? 'api',
    capabilityId: overrides.capabilityId ?? 'api-probe',
    trustLevel: overrides.trustLevel ?? 'verified',
    status: overrides.status ?? 'passed',
    summary: overrides.summary ?? 'same-path retry evidence',
    artifacts: [],
    startedAt: '2026-05-17T19:59:30.000Z',
    completedAt: now,
    freshness: { validatedAt: now },
    privacy: { classification: 'local-only', containsSecrets: false },
    redactions: [],
    ...overrides,
  };
}

function retry(plan: RecoveryPlan, attempt: FixAttemptRecord, status: 'passed' | 'failed' | 'degraded' = 'failed'): SamePathRetryResult {
  return planSamePathRetry({
    runId: 'run-blocker-report',
    goalId: 'goal-blocker-report',
    recoveryPlan: plan,
    fixAttempt: attempt,
    state: state(),
    previousVerdict: 'blocked',
    retry: {
      retryAttemptId: `retry-${status}`,
      path: plan.retryPath,
      evidence: [evidence({ id: `ev-retry-${status}`, status })],
      status,
    },
    requirements: [{ id: 'retry-api', source: 'api', description: 'same-path API retry', core: true }],
    retryCount: status === 'failed' ? 2 : 1,
    retryLimit: 2,
    generatedAt: now,
  });
}

describe('recovery blocker reports and fixtures', () => {
  it('builds a retry cap blocker report with attempted actions, evidence chain, owner, risk, and next plan', () => {
    const plan = recoveryPlan();
    const attempt = fixAttempt(plan);
    const retryResult = retry(plan, attempt, 'failed');

    const report = buildRecoveryBlockerReport({
      runId: 'run-blocker-report',
      goalId: 'goal-blocker-report',
      recoveryPlan: plan,
      fixAttempts: [attempt],
      retryResults: [retryResult],
      generatedAt: now,
    });

    expect(report.finalVerdict).toBe('blocked');
    expect(report.owner).toBe('user');
    expect(report.riskLevel).toBe('high');
    expect(report.failureReason).toContain('Retry cap');
    expect(report.reproductionPath).toEqual(['Open /profile', 'Click Save']);
    expect(report.attemptedActions).toEqual([expect.objectContaining({ actionId: 'fix-profile-api' })]);
    expect(report.evidenceChain.beforeEvidenceRefs).toContain('api-run-profile-save');
    expect(report.evidenceChain.retryEvidenceRefs).toContain('ev-retry-failed');
    expect(report.nextPlan.steps.length).toBeGreaterThan(1);
    expect(report.nextPlan.summary.toLowerCase()).not.toBe('check logs');
  });

  it('uses manual confirmation for permission blockers without allowing false completion', () => {
    const plan = recoveryPlan(failure({
      id: 'permission-denied',
      source: 'command',
      failureCode: 'permission-denied',
      summary: 'EACCES permission denied while writing config',
      evidenceRefs: ['permission-ev'],
    }));

    const report = buildRecoveryBlockerReport({
      runId: 'run-permission',
      goalId: 'goal-blocker-report',
      recoveryPlan: plan,
      generatedAt: now,
    });

    expect(report.finalVerdict).toBe('manual-confirmation-required');
    expect(report.owner).toBe('user');
    expect(report.noFalseCompletion).toBe(true);
    expect(report.nextAction.summary).toContain('permission');
  });

  it('marks external service failures as external-system blockers with actionable next plan', () => {
    const plan = recoveryPlan(failure({
      id: 'billing-upstream-unavailable',
      source: 'api',
      failureCode: 'external-service-unavailable',
      summary: '503 upstream unavailable from billing provider',
      responseSummary: 'service unavailable',
      status: 503,
      evidenceRefs: ['billing-ev'],
    }));

    const report = buildRecoveryBlockerReport({
      runId: 'run-external',
      goalId: 'goal-blocker-report',
      recoveryPlan: plan,
      generatedAt: now,
    });

    expect(report.finalVerdict).toBe('blocked');
    expect(report.owner).toBe('external-system');
    expect(report.nextPlan.steps).toEqual(expect.arrayContaining([
      expect.stringContaining('external service'),
    ]));
  });

  it('preserves no false completion when policy input tries to disable it', () => {
    const policy = buildDefaultRecoveryPolicy({ noFalseCompletion: false, maxFixAttempts: 0, maxRetries: 0 });

    expect(policy).toMatchObject({
      noFalseCompletion: true,
      maxFixAttempts: 0,
      maxRetries: 0,
    });
  });

  it('blocks destructive or global high-risk attempts instead of continuing automatic recovery', () => {
    const plan = recoveryPlan();
    const highRiskAttempt = planFixAttempt({
      runId: 'run-high-risk-report',
      goalId: 'goal-blocker-report',
      workspaceRoot,
      mode: 'fix',
      recoveryPlan: plan,
      candidateActionId: firstCandidateId(plan),
      action: {
        id: 'delete-output',
        actionType: 'delete-file',
        targetFiles: ['src/generated/output.ts'],
        intent: 'Delete generated output to recover',
        mutatesWorkspace: true,
        destructive: true,
      },
      dirtyBaseline: { capturedAt: now, files: [] },
      generatedAt: now,
    }).attempt;

    const report = buildRecoveryBlockerReport({
      runId: 'run-high-risk-report',
      goalId: 'goal-blocker-report',
      recoveryPlan: plan,
      fixAttempts: [highRiskAttempt],
      generatedAt: now,
    });

    expect(report.finalVerdict).toBe('blocked');
    expect(report.owner).toBe('user');
    expect(report.riskLevel).toBe('high');
    expect(report.failureReason).toContain('high-risk');
  });

  it('keeps recovery fixtures aligned with expected final verdicts', async () => {
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as {
      scenarios: Array<{ id: string; expectedFinalVerdict: string; expectedOwner: string; expectedRiskLevel: string }>;
    };

    expect(fixture.scenarios.map((scenario) => scenario.id)).toEqual([
      'successful-recovery',
      'repeat-failure-cap',
      'permission-blocker',
      'external-service-blocker',
      'path-changed-degraded',
    ]);
    expect(fixture.scenarios).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'repeat-failure-cap', expectedFinalVerdict: 'blocked' }),
      expect.objectContaining({ id: 'path-changed-degraded', expectedFinalVerdict: 'partial' }),
    ]));
  });
});
