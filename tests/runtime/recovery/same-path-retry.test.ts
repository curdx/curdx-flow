import { describe, expect, it } from 'vitest';

import type { EvidenceBlock, StateLedger } from '../../../src/runtime/contracts/index.ts';
import {
  captureFailureEvidence,
  planFixAttempt,
  planRecovery,
  planSamePathRetry,
  type FailureObservation,
  type FixAttemptRecord,
  type RecoveryPlan,
} from '../../../src/runtime/recovery/index.ts';

const now = '2026-05-17T19:00:00.000Z';
const workspaceRoot = process.cwd();

function failure(overrides: Partial<FailureObservation> = {}): FailureObservation {
  return {
    id: overrides.id ?? 'api-status-mismatch',
    source: overrides.source ?? 'api',
    summary: overrides.summary ?? 'PATCH /api/profile returned 500',
    failureCode: overrides.failureCode ?? 'api-status-mismatch',
    reproductionSteps: overrides.reproductionSteps ?? ['Open /profile', 'Click Save'],
    evidenceRefs: overrides.evidenceRefs ?? ['api-run-profile-save'],
    artifactRefs: overrides.artifactRefs ?? ['profile-trace'],
    observedAt: overrides.observedAt ?? '2026-05-17T18:59:00.000Z',
    ...overrides,
  };
}

function buildRecoveryPlan(): RecoveryPlan {
  const failureResult = captureFailureEvidence({
    runId: 'run-same-path',
    goalId: 'goal-same-path',
    observations: [
      failure({
        actionId: 'submit-profile',
        method: 'PATCH',
        url: 'http://127.0.0.1:4173/api/profile',
        status: 500,
      }),
    ],
    generatedAt: now,
  });

  return planRecovery({
    runId: 'run-same-path',
    goalId: 'goal-same-path',
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

function fixAttempt(plan: RecoveryPlan): FixAttemptRecord {
  return planFixAttempt({
    runId: 'run-same-path',
    goalId: 'goal-same-path',
    workspaceRoot,
    mode: 'fix',
    recoveryPlan: plan,
    candidateActionId: firstCandidateId(plan),
    action: {
      id: 'fix-profile-api',
      actionType: 'source-edit',
      targetFiles: ['src/app/profile-api.ts'],
      intent: 'Fix profile API 500',
      mutatesWorkspace: true,
    },
    dirtyBaseline: { capturedAt: now, files: [] },
    execution: {
      result: 'success',
      executedActions: ['source-edit'],
      skippedActions: [],
      modifiedFiles: ['src/app/profile-api.ts'],
      generatedEvidenceRefs: ['ev-fix-profile-api'],
    },
    generatedAt: now,
  }).attempt;
}

function state(overrides: Partial<StateLedger> = {}): StateLedger {
  return {
    schemaVersion: 1,
    runId: 'run-same-path',
    goalId: 'goal-same-path',
    workspaceRoot,
    mode: 'verification',
    policy: { noFalseCompletion: true },
    scope: { summary: 'verify fixed profile save' },
    expectedJourney: { summary: 'profile save succeeds' },
    status: 'running',
    verdictStatus: 'blocked',
    phase: 'retry',
    startedAt: '2026-05-17T18:50:00.000Z',
    updatedAt: now,
    evidenceIds: [],
    missingEvidence: [],
    artifactIndexPath: '.curdx/artifacts/index.jsonl',
    dirtyBaseline: { capturedAt: now, files: [] },
    generatedFiles: [],
    nextAction: { owner: 'agent', summary: 'run same-path retry' },
    ...overrides,
  };
}

function evidence(overrides: Partial<EvidenceBlock> = {}): EvidenceBlock {
  return {
    schemaVersion: 1,
    id: overrides.id ?? 'ev-retry-profile-save',
    runId: 'run-same-path',
    goalId: 'goal-same-path',
    source: overrides.source ?? 'api',
    capabilityId: overrides.capabilityId ?? 'api-probe',
    trustLevel: overrides.trustLevel ?? 'verified',
    status: overrides.status ?? 'passed',
    summary: overrides.summary ?? 'PATCH /api/profile returned 200 on same path',
    artifacts: [],
    startedAt: '2026-05-17T18:59:30.000Z',
    completedAt: '2026-05-17T19:00:00.000Z',
    freshness: {
      validatedAt: '2026-05-17T19:00:00.000Z',
      targetHash: 'sha256:profile-api',
    },
    privacy: {
      classification: 'local-only',
      containsSecrets: false,
    },
    redactions: [],
    ...overrides,
  };
}

describe('same-path retry and before/after verdict', () => {
  it('transitions to complete only when same-path retry evidence passes requirements', () => {
    const plan = buildRecoveryPlan();
    const attempt = fixAttempt(plan);
    const retryEvidence = evidence();

    const result = planSamePathRetry({
      runId: 'run-same-path',
      goalId: 'goal-same-path',
      recoveryPlan: plan,
      fixAttempt: attempt,
      state: state(),
      previousVerdict: 'blocked',
      retry: {
        retryAttemptId: 'retry-1',
        path: {
          actionId: 'submit-profile',
          method: 'PATCH',
          url: 'http://127.0.0.1:4173/api/profile',
          reproductionSteps: ['Open /profile', 'Click Save'],
        },
        evidence: [retryEvidence],
        status: 'passed',
      },
      requirements: [
        { id: 'retry-api', source: 'api', description: 'same-path API retry', core: true },
      ],
      generatedAt: now,
    });

    expect(result.status).toBe('passed');
    expect(result.samePath).toBe(true);
    expect(result.evidenceChain).toMatchObject({
      beforeEvidenceRefs: ['api-run-profile-save'],
      fixAttemptId: attempt.attemptId,
      fixEvidenceRefs: ['ev-fix-profile-api'],
      retryAttemptId: 'retry-1',
      retryEvidenceRefs: ['ev-retry-profile-save'],
    });
    expect(result.verdictTransition).toMatchObject({
      from: 'blocked',
      to: 'complete',
      supportingEvidenceRefs: ['ev-retry-profile-save'],
    });
    expect(result.report.summary).toContain('before');
    expect(result.report.summary).toContain('retry');
  });

  it('keeps verdict blocked when same-path retry still fails with the same cause', () => {
    const plan = buildRecoveryPlan();
    const attempt = fixAttempt(plan);
    const retryFailure = captureFailureEvidence({
      runId: 'run-same-path',
      goalId: 'goal-same-path',
      observations: [failure({ evidenceRefs: ['api-retry-profile-save'] })],
      generatedAt: now,
    });

    const result = planSamePathRetry({
      runId: 'run-same-path',
      goalId: 'goal-same-path',
      recoveryPlan: plan,
      fixAttempt: attempt,
      state: state(),
      retry: {
        retryAttemptId: 'retry-failed',
        path: plan.retryPath,
        evidence: [evidence({ id: 'ev-retry-failed', status: 'failed', summary: 'PATCH /api/profile still returned 500' })],
        status: 'failed',
        failureResult: retryFailure,
      },
      generatedAt: now,
    });

    expect(result.status).toBe('failed');
    expect(result.samePath).toBe(true);
    expect(result.failureClassification).toBe('same-cause');
    expect(result.verdictTransition.to).toBe('blocked');
    expect(result.nextAction.summary).toContain('diagnostics');
  });

  it('marks path changes as degraded and never complete', () => {
    const plan = buildRecoveryPlan();
    const attempt = fixAttempt(plan);

    const result = planSamePathRetry({
      runId: 'run-path-changed',
      goalId: 'goal-same-path',
      recoveryPlan: plan,
      fixAttempt: attempt,
      state: state(),
      retry: {
        retryAttemptId: 'retry-path-changed',
        path: {
          actionId: 'submit-profile',
          method: 'GET',
          url: 'http://127.0.0.1:4173/api/profile?mock=true',
          reproductionSteps: ['Call mock profile API'],
          usedMock: true,
        },
        evidence: [evidence({ id: 'ev-mock-retry', trustLevel: 'degraded', status: 'degraded' })],
        status: 'passed',
      },
      generatedAt: now,
    });

    expect(result.status).toBe('degraded');
    expect(result.samePath).toBe(false);
    expect(result.pathComparison.mismatches).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'method' }),
      expect.objectContaining({ field: 'url' }),
      expect.objectContaining({ field: 'mock' }),
    ]));
    expect(result.verdictTransition.to).not.toBe('complete');
    expect(result.report.status).toBe('degraded');
    expect(result.retryEvidence).toEqual([
      expect.objectContaining({ id: 'ev-mock-retry', status: 'degraded', trustLevel: 'degraded' }),
    ]);
  });

  it('classifies a different retry failure category as a new failure', () => {
    const plan = buildRecoveryPlan();
    const attempt = fixAttempt(plan);
    const retryFailure = captureFailureEvidence({
      runId: 'run-same-path',
      goalId: 'goal-same-path',
      observations: [
        failure({
          id: 'data-readback-mismatch',
          source: 'data',
          failureCode: 'data-readback-mismatch',
          target: 'profile.name',
          summary: 'Data readback returned stale profile name',
          evidenceRefs: ['data-retry-profile-save'],
        }),
      ],
      generatedAt: now,
    });

    const result = planSamePathRetry({
      runId: 'run-new-failure',
      goalId: 'goal-same-path',
      recoveryPlan: plan,
      fixAttempt: attempt,
      state: state(),
      retry: {
        retryAttemptId: 'retry-new-failure',
        path: plan.retryPath,
        evidence: [evidence({ id: 'ev-data-retry-failed', source: 'data', status: 'failed' })],
        status: 'failed',
        failureResult: retryFailure,
      },
      generatedAt: now,
    });

    expect(result.failureClassification).toBe('new-failure');
    expect(result.nextAction.summary).toContain('new recovery plan');
  });

  it('returns a retry-cap blocker instead of continuing automatic fixes', () => {
    const plan = buildRecoveryPlan();
    const attempt = fixAttempt(plan);

    const result = planSamePathRetry({
      runId: 'run-retry-cap',
      goalId: 'goal-same-path',
      recoveryPlan: plan,
      fixAttempt: attempt,
      state: state(),
      retry: {
        retryAttemptId: 'retry-cap',
        path: plan.retryPath,
        evidence: [evidence({ id: 'ev-retry-cap-failed', status: 'failed' })],
        status: 'failed',
      },
      retryCount: 3,
      retryLimit: 3,
      generatedAt: now,
    });

    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual([
      expect.objectContaining({ code: 'retry-cap-reached', owner: 'user' }),
    ]);
    expect(result.verdictTransition.to).toBe('blocked');
  });
});
