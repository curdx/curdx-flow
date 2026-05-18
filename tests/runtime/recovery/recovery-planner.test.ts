import { describe, expect, it } from 'vitest';

import {
  captureFailureEvidence,
  planRecovery,
  type FailureObservation,
} from '../../../src/runtime/recovery/index.ts';

const now = '2026-05-17T17:00:00.000Z';

function failure(overrides: Partial<FailureObservation> = {}): FailureObservation {
  return {
    id: overrides.id ?? 'api-status-mismatch',
    source: overrides.source ?? 'api',
    summary: overrides.summary ?? 'PATCH /api/profile returned 500',
    failureCode: overrides.failureCode ?? 'api-status-mismatch',
    reproductionSteps: overrides.reproductionSteps ?? ['Open /profile', 'Click Save'],
    evidenceRefs: overrides.evidenceRefs ?? ['api-run-profile-save'],
    artifactRefs: overrides.artifactRefs ?? ['profile-trace'],
    observedAt: overrides.observedAt ?? '2026-05-17T16:59:00.000Z',
    ...overrides,
  };
}

function captured(observations: FailureObservation[]) {
  return captureFailureEvidence({
    runId: 'run-recovery-plan',
    goalId: 'goal-recovery',
    observations,
    generatedAt: now,
  });
}

describe('root-cause recovery planner', () => {
  it('generates an evidence-backed recovery plan with root cause, diagnostics, actions, retry path, and stop conditions', () => {
    const failures = captured([
      failure({
        method: 'PATCH',
        url: 'http://127.0.0.1:4173/api/profile',
        status: 500,
      }),
    ]);

    const plan = planRecovery({
      runId: 'run-recovery-plan',
      goalId: 'goal-recovery',
      mode: 'fix',
      failureResult: failures,
      capabilities: {
        context7: { capabilityId: 'context7', state: 'available', reason: 'external MCP connected' },
        sequentialThinking: { capabilityId: 'sequential-thinking', state: 'available', reason: 'external MCP connected' },
      },
      generatedAt: now,
    });

    expect(plan.status).toBe('planned');
    expect(plan.suspectedRootCause).toMatchObject({
      failureId: 'api-status-mismatch',
      category: 'api',
      evidenceRefs: ['api-run-profile-save'],
    });
    expect(plan.requiredDiagnostics.length).toBeGreaterThan(0);
    expect(plan.candidateActions.length).toBeGreaterThan(0);
    expect(plan.candidateActions.every((action) => action.evidenceRefs.includes('api-run-profile-save'))).toBe(true);
    expect(plan.retryPath).toMatchObject({
      samePathRequired: true,
      reproductionSteps: ['Open /profile', 'Click Save'],
    });
    expect(plan.stopConditions).toEqual(expect.arrayContaining([
      expect.stringContaining('same path'),
    ]));
  });

  it('does not generate fix actions without failure evidence', () => {
    const plan = planRecovery({
      runId: 'run-no-evidence',
      goalId: 'goal-recovery',
      mode: 'fix',
      generatedAt: now,
    });

    expect(plan.status).toBe('blocked');
    expect(plan.candidateActions).toEqual([]);
    expect(plan.requiredDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'collect-failure-evidence' }),
    ]));
    expect(plan.nextAction.summary).toContain('Capture failure evidence');
  });

  it('marks environment failures as user-owned blockers instead of code fixes', () => {
    const failures = captured([
      failure({
        id: 'database-unavailable',
        source: 'service',
        failureCode: 'database-unavailable',
        summary: 'DATABASE_URL is missing',
        evidenceRefs: ['service-health'],
      }),
    ]);

    const plan = planRecovery({
      runId: 'run-env',
      goalId: 'goal-recovery',
      mode: 'fix',
      failureResult: failures,
      generatedAt: now,
    });

    expect(plan.status).toBe('manual-confirmation-required');
    expect(plan.ownership).toMatchObject({ owner: 'user' });
    expect(plan.candidateActions).toEqual([
      expect.objectContaining({
        kind: 'restore-environment',
        owner: 'user',
        mutatesWorkspace: false,
      }),
    ]);
    expect(plan.candidateActions.some((action) => action.kind === 'code-fix')).toBe(false);
  });

  it('marks external service failures as external-system owned blockers', () => {
    const failures = captured([
      failure({
        id: 'billing-upstream-unavailable',
        source: 'api',
        failureCode: 'external-service-unavailable',
        summary: '503 upstream unavailable from billing provider',
        responseSummary: 'service unavailable',
        status: 503,
        evidenceRefs: ['api-billing-sync'],
      }),
    ]);

    const plan = planRecovery({
      runId: 'run-external',
      goalId: 'goal-recovery',
      mode: 'fix',
      failureResult: failures,
      generatedAt: now,
    });

    expect(plan.status).toBe('blocked');
    expect(plan.ownership).toMatchObject({ owner: 'external-system' });
    expect(plan.candidateActions).toEqual([
      expect.objectContaining({
        kind: 'wait-for-external-service',
        owner: 'external-system',
        mutatesWorkspace: false,
      }),
    ]);
  });

  it('keeps report-only plans non-mutating while still producing an actionable diagnostic plan', () => {
    const failures = captured([
      failure({
        method: 'PATCH',
        url: 'http://127.0.0.1:4173/api/profile',
        status: 500,
      }),
    ]);

    const plan = planRecovery({
      runId: 'run-report-only',
      goalId: 'goal-recovery',
      mode: 'report-only',
      failureResult: failures,
      generatedAt: now,
    });

    expect(plan.status).toBe('planned');
    expect(plan.modeRestrictions.mutatingActionsAllowed).toBe(false);
    expect(plan.candidateActions.length).toBeGreaterThan(0);
    expect(plan.candidateActions.every((action) => action.mutatesWorkspace === false)).toBe(true);
    expect(plan.candidateActions.some((action) => action.kind === 'code-fix')).toBe(false);
  });

  it('sanitizes history matches and records degraded history capability', () => {
    const failures = captured([failure()]);

    const plan = planRecovery({
      runId: 'run-history',
      goalId: 'goal-recovery',
      mode: 'fix',
      failureResult: failures,
      capabilities: {
        history: { capabilityId: 'claude-mem', state: 'degraded', reason: 'memory search unavailable' },
      },
      historyMatches: [
        {
          id: 'hist-1',
          source: 'claude-mem',
          summary: 'Previous fix used token=SECRET123 and cache invalidation',
          confidence: 0.81,
          suggestedFixPattern: 'Invalidate profile cache after PATCH',
          evidenceRefs: ['hist-ev-1'],
        },
      ],
      generatedAt: now,
    });

    expect(plan.degradedCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ capabilityId: 'claude-mem', state: 'degraded' }),
    ]));
    expect(JSON.stringify(plan)).not.toContain('SECRET123');
    expect(plan.historyReferences).toEqual([
      expect.objectContaining({
        id: 'hist-1',
        source: 'claude-mem',
        confidence: 0.81,
      }),
    ]);
  });

  it('generates bounded parallel diagnosis lanes with disjoint ownership when pua is available', () => {
    const failures = captured([
      failure({ id: 'api-500', source: 'api', evidenceRefs: ['api-ev'] }),
      failure({ id: 'data-mismatch', source: 'data', target: 'profile.name', evidenceRefs: ['data-ev'] }),
      failure({ id: 'browser-console', source: 'browser', actionId: 'submit-profile', evidenceRefs: ['browser-ev'] }),
    ]);

    const plan = planRecovery({
      runId: 'run-parallel',
      goalId: 'goal-recovery',
      mode: 'fix',
      failureResult: failures,
      capabilities: {
        pua: { capabilityId: 'pua', state: 'available', reason: 'parallel agents available' },
      },
      generatedAt: now,
    });

    expect(plan.parallelDiagnosisPlan.enabled).toBe(true);
    expect(plan.parallelDiagnosisPlan.lanes.length).toBeGreaterThanOrEqual(2);
    const owners = plan.parallelDiagnosisPlan.lanes.map((lane) => lane.owner);
    expect(new Set(owners).size).toBe(owners.length);
    const writeScopes = plan.parallelDiagnosisPlan.lanes.flatMap((lane) => lane.writeScope);
    expect(writeScopes).toEqual([]);
  });

  it('uses diagnostic-first planning for unknown root causes', () => {
    const failures = captured([
      failure({
        id: 'unknown-symptom',
        source: 'command',
        failureCode: undefined,
        summary: 'Something unexpected happened',
        stderr: 'unexpected behavior',
        evidenceRefs: ['unknown-ev'],
      }),
    ]);

    const plan = planRecovery({
      runId: 'run-unknown',
      goalId: 'goal-recovery',
      mode: 'fix',
      failureResult: failures,
      generatedAt: now,
    });

    expect(plan.status).toBe('blocked');
    expect(plan.suspectedRootCause.category).toBe('unknown');
    expect(plan.candidateActions.every((action) => action.kind !== 'code-fix')).toBe(true);
    expect(plan.requiredDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'collect-additional-diagnostics' }),
    ]));
  });
});
