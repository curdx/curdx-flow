import { describe, expect, it } from 'vitest';

import { buildDefaultActionRiskPolicy } from '../../../src/runtime/policy/index.ts';
import {
  appendFixAttemptLineage,
  captureFailureEvidence,
  planFixAttempt,
  planRecovery,
  type FailureObservation,
  type FixAttemptRecord,
  type RecoveryPlan,
} from '../../../src/runtime/recovery/index.ts';
import type { DirtyWorktreeBaseline } from '../../../src/runtime/state/index.ts';

const now = '2026-05-17T18:00:00.000Z';
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
    observedAt: overrides.observedAt ?? '2026-05-17T17:59:00.000Z',
    ...overrides,
  };
}

function recoveryPlan(mode: 'fix' | 'report-only' | 'release' = 'fix'): RecoveryPlan {
  const failureResult = captureFailureEvidence({
    runId: 'run-fix-lineage',
    goalId: 'goal-fix-lineage',
    observations: [
      failure({
        method: 'PATCH',
        url: 'http://127.0.0.1:4173/api/profile',
        status: 500,
      }),
    ],
    generatedAt: now,
  });

  return planRecovery({
    runId: 'run-fix-lineage',
    goalId: 'goal-fix-lineage',
    mode,
    failureResult,
    generatedAt: now,
  });
}

function firstCandidateId(plan: RecoveryPlan): string {
  const [candidate] = plan.candidateActions;
  if (candidate === undefined) throw new Error('test recovery plan did not produce a candidate action');
  return candidate.id;
}

function dirtyBaseline(files: DirtyWorktreeBaseline['files']): DirtyWorktreeBaseline {
  return {
    capturedAt: now,
    files,
  };
}

describe('fix attempt lineage and risk-aware execution', () => {
  it('records an allowed fix-mode source edit with policy action log, evidence lineage, report, and same-path retry', () => {
    const plan = recoveryPlan('fix');
    const result = planFixAttempt({
      runId: 'run-fix-lineage',
      goalId: 'goal-fix-lineage',
      workspaceRoot,
      mode: 'fix',
      recoveryPlan: plan,
      candidateActionId: firstCandidateId(plan),
      action: {
        id: 'edit-profile-api',
        actionType: 'source-edit',
        targetFiles: ['src/app/profile-api.ts'],
        intent: 'Handle profile API database error without returning 500',
        mutatesWorkspace: true,
        diffSummary: 'Add guarded database unavailable branch',
      },
      validationCommands: ['npm run test:recovery'],
      dirtyBaseline: dirtyBaseline([]),
      execution: {
        result: 'success',
        executedActions: ['source-edit'],
        skippedActions: [],
        modifiedFiles: ['src/app/profile-api.ts'],
        generatedEvidenceRefs: ['ev-fix-profile-api'],
        diffSummary: 'Add guarded database unavailable branch',
      },
      generatedAt: now,
    });

    expect(result.status).toBe('executed');
    expect(result.ok).toBe(true);
    expect(result.attempt).toMatchObject({
      parentFailureEvidenceIds: ['api-run-profile-save'],
      targetFiles: ['src/app/profile-api.ts'],
      modifiedFiles: ['src/app/profile-api.ts'],
      riskLevel: 'medium',
      result: 'success',
      generatedEvidenceRefs: ['ev-fix-profile-api'],
      retryPath: { samePathRequired: true },
    });
    expect(result.policyDecision).toMatchObject({
      decision: 'allowed',
      requiresActionLog: true,
      actionLog: expect.objectContaining({
        actionType: 'source-edit',
        requiresSamePathRetry: true,
      }),
    });
    expect(result.report).toMatchObject({
      riskLevel: 'medium',
      targetFiles: ['src/app/profile-api.ts'],
      modifiedFiles: ['src/app/profile-api.ts'],
      validationCommands: ['npm run test:recovery'],
      evidenceRefs: ['api-run-profile-save', 'ev-fix-profile-api'],
      samePathRetryRequired: true,
      verdictEligible: false,
    });
    expect(result.report.summary).toContain('edit-profile-api');
    expect(result.report.summary).not.toBe('fixed');
  });

  it('blocks unauthorized high-risk actions before recording them as executed', () => {
    const plan = recoveryPlan('fix');
    const result = planFixAttempt({
      runId: 'run-high-risk',
      goalId: 'goal-fix-lineage',
      workspaceRoot,
      mode: 'fix',
      recoveryPlan: plan,
      candidateActionId: firstCandidateId(plan),
      policy: buildDefaultActionRiskPolicy({ mode: 'fix' }),
      action: {
        id: 'delete-generated-output',
        actionType: 'delete-file',
        targetFiles: ['src/generated/output.ts'],
        intent: 'Delete generated output while repairing API failure',
        mutatesWorkspace: true,
        destructive: true,
      },
      dirtyBaseline: dirtyBaseline([]),
      generatedAt: now,
    });

    expect(result.status).toBe('blocked');
    expect(result.ok).toBe(false);
    expect(result.policyDecision.decision).toBe('blocked');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'authorization-required', owner: 'user' }),
    ]));
    expect(result.nextAction.summary).toContain('authorization');
    expect(result.attempt).toMatchObject({
      riskLevel: 'critical',
      result: 'blocked',
      executedActions: [],
    });
  });

  it('blocks report-only source mutations through the policy gate', () => {
    const plan = recoveryPlan('report-only');
    const result = planFixAttempt({
      runId: 'run-report-only-blocked',
      goalId: 'goal-fix-lineage',
      workspaceRoot,
      mode: 'report-only',
      recoveryPlan: plan,
      candidateActionId: firstCandidateId(plan),
      action: {
        id: 'edit-in-report-only',
        actionType: 'source-edit',
        targetFiles: ['src/app/profile-api.ts'],
        intent: 'Try to mutate source while report-only is active',
        mutatesWorkspace: true,
      },
      dirtyBaseline: dirtyBaseline([]),
      generatedAt: now,
    });

    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'report-only-write-boundary' }),
    ]));
    expect(result.attempt.modifiedFiles).toEqual([]);
  });

  it('blocks writes that would overlap unrelated dirty user files', () => {
    const plan = recoveryPlan('fix');
    const result = planFixAttempt({
      runId: 'run-dirty-blocked',
      goalId: 'goal-fix-lineage',
      workspaceRoot,
      mode: 'fix',
      recoveryPlan: plan,
      candidateActionId: firstCandidateId(plan),
      action: {
        id: 'edit-dirty-file',
        actionType: 'source-edit',
        targetFiles: ['src/app/profile-api.ts'],
        intent: 'Edit file that already has user changes',
        mutatesWorkspace: true,
      },
      dirtyBaseline: dirtyBaseline([
        { path: 'src/app/profile-api.ts', status: 'modified', source: 'user-existing' },
      ]),
      generatedAt: now,
    });

    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual([
      expect.objectContaining({
        code: 'dirty-worktree-conflict',
        path: 'src/app/profile-api.ts',
        owner: 'user',
      }),
    ]);
    expect(result.attempt.executedActions).toEqual([]);
    expect(result.attempt.modifiedFiles).toEqual([]);
    expect(result.attempt.actionLog).toEqual(expect.objectContaining({ result: 'blocked' }));
  });

  it('records partial failures without allowing a success verdict', () => {
    const plan = recoveryPlan('fix');
    const result = planFixAttempt({
      runId: 'run-partial',
      goalId: 'goal-fix-lineage',
      workspaceRoot,
      mode: 'fix',
      recoveryPlan: plan,
      candidateActionId: firstCandidateId(plan),
      action: {
        id: 'partial-edit',
        actionType: 'source-edit',
        targetFiles: ['src/app/profile-api.ts'],
        intent: 'Attempt profile API recovery',
        mutatesWorkspace: true,
      },
      dirtyBaseline: dirtyBaseline([]),
      execution: {
        result: 'partial',
        executedActions: ['source-edit'],
        skippedActions: ['verification-rerun'],
        modifiedFiles: ['src/app/profile-api.ts'],
        generatedEvidenceRefs: ['ev-partial-fix'],
        failureReason: 'verification command failed before same-path retry',
      },
      generatedAt: now,
    });

    expect(result.status).toBe('partial');
    expect(result.ok).toBe(false);
    expect(result.attempt).toMatchObject({
      result: 'partial',
      executedActions: ['source-edit'],
      skippedActions: ['verification-rerun'],
      failureReason: 'verification command failed before same-path retry',
    });
    expect(result.report.verdictEligible).toBe(false);
    expect(result.nextAction.summary).toContain('same-path retry');
  });

  it('appends attempts without mutating or overwriting existing lineage records', () => {
    const plan = recoveryPlan('fix');
    const first = planFixAttempt({
      runId: 'run-lineage-append',
      goalId: 'goal-fix-lineage',
      workspaceRoot,
      mode: 'fix',
      recoveryPlan: plan,
      candidateActionId: firstCandidateId(plan),
      action: {
        id: 'first-attempt',
        actionType: 'source-edit',
        targetFiles: ['src/app/profile-api.ts'],
        intent: 'First bounded fix',
        mutatesWorkspace: true,
      },
      dirtyBaseline: dirtyBaseline([]),
      generatedAt: now,
    }).attempt;
    const second = {
      ...first,
      attemptId: 'attempt-second',
      actionId: 'second-attempt',
    } satisfies FixAttemptRecord;
    const existing = [first];

    const next = appendFixAttemptLineage(existing, second);

    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(first);
    expect(next[1]).toEqual(second);
    expect(existing).toHaveLength(1);
  });
});
