import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  captureFailureEvidence,
  type FailureObservation,
} from '../../../src/runtime/recovery/index.ts';

const now = '2026-05-17T16:00:00.000Z';
const fixturePath = join(process.cwd(), 'tests/fixtures/broken-app/failures.json');

function base(overrides: Partial<FailureObservation> = {}): FailureObservation {
  return {
    id: overrides.id ?? 'failure-1',
    source: overrides.source ?? 'command',
    summary: overrides.summary ?? 'npm run test failed',
    reproductionSteps: overrides.reproductionSteps ?? ['npm run test'],
    evidenceRefs: overrides.evidenceRefs ?? ['ev-command-1'],
    artifactRefs: overrides.artifactRefs ?? ['artifact-command-log'],
    observedAt: overrides.observedAt ?? '2026-05-17T15:59:00.000Z',
    ...overrides,
  };
}

describe('failure evidence capture and taxonomy', () => {
  it('keeps command failure evidence structured and classifies missing commands as dependency failures', () => {
    const result = captureFailureEvidence({
      runId: 'run-failure-1',
      goalId: 'goal-failure',
      observations: [
        base({
          source: 'command',
          command: {
            executable: 'npm',
            argv: ['run', 'build'],
            exitCode: 127,
          },
          failureCode: 'command-not-found',
          stderr: 'sh: vite: command not found',
        }),
      ],
      generatedAt: now,
    });

    expect(result.ok).toBe(true);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({
      source: 'command',
      category: 'dependency',
      confidence: expect.any(Number),
      command: {
        executable: 'npm',
        argv: ['run', 'build'],
        exitCode: 127,
      },
      evidenceRefs: ['ev-command-1'],
      artifactRefs: ['artifact-command-log'],
      reproductionSteps: ['npm run test'],
    });
    expect(result.primary).toMatchObject({ category: 'dependency' });
    expect(result.failures[0]?.reason).toContain('command-not-found');
  });

  it('classifies browser failures without losing action and artifact context', () => {
    const result = captureFailureEvidence({
      runId: 'run-browser-failure',
      goalId: 'goal-failure',
      observations: [
        base({
          id: 'browser-open-failed',
          source: 'browser',
          actionId: 'open-profile',
          failureCode: 'page-open-failed',
          summary: 'Browser could not open http://127.0.0.1:4173/profile',
          reproductionSteps: ['Open /profile', 'Run profile-save journey'],
          artifactRefs: ['profile-save-trace'],
        }),
      ],
      generatedAt: now,
    });

    expect(result.failures[0]).toMatchObject({
      source: 'browser',
      category: 'browser',
      actionId: 'open-profile',
      artifactRefs: ['profile-save-trace'],
    });
    expect(result.taxonomy.categories).toContain('browser');
  });

  it('classifies API failures with request status and evidence refs', () => {
    const result = captureFailureEvidence({
      runId: 'run-api-failure',
      goalId: 'goal-failure',
      observations: [
        base({
          id: 'api-status-mismatch',
          source: 'api',
          actionId: 'submit-profile',
          method: 'PATCH',
          url: 'http://127.0.0.1:4173/api/profile',
          status: 500,
          failureCode: 'api-status-mismatch',
          responseSummary: '500 {"error":"database unavailable"}',
          evidenceRefs: ['api-run-profile-save'],
        }),
      ],
      generatedAt: now,
    });

    expect(result.failures[0]).toMatchObject({
      category: 'api',
      method: 'PATCH',
      status: 500,
      evidenceRefs: ['api-run-profile-save'],
    });
  });

  it('classifies upstream API dependency failures as external service failures', () => {
    const result = captureFailureEvidence({
      runId: 'run-external-api-failure',
      goalId: 'goal-failure',
      observations: [
        base({
          id: 'billing-api-rate-limit',
          source: 'api',
          actionId: 'submit-profile',
          method: 'POST',
          url: 'https://billing.example.test/api/sync',
          status: 503,
          failureCode: 'external-service-unavailable',
          responseSummary: '503 upstream unavailable from billing provider',
          evidenceRefs: ['api-billing-sync'],
        }),
      ],
      generatedAt: now,
    });

    expect(result.failures[0]).toMatchObject({
      category: 'externalService',
      status: 503,
      evidenceRefs: ['api-billing-sync'],
    });
    expect(result.nextAction.owner).toBe('external-system');
  });

  it('classifies data readback failures and keeps the data target', () => {
    const result = captureFailureEvidence({
      runId: 'run-data-failure',
      goalId: 'goal-failure',
      observations: [
        base({
          id: 'data-readback-mismatch',
          source: 'data',
          target: 'profile.name',
          failureCode: 'data-readback-mismatch',
          summary: 'UI saved Ada but data readback returned Grace',
          evidenceRefs: ['data-run-profile-save'],
        }),
      ],
      generatedAt: now,
    });

    expect(result.failures[0]).toMatchObject({
      category: 'data',
      target: 'profile.name',
      evidenceRefs: ['data-run-profile-save'],
    });
  });

  it('classifies unavailable capabilities with capability id and next action', () => {
    const result = captureFailureEvidence({
      runId: 'run-capability-failure',
      goalId: 'goal-failure',
      observations: [
        base({
          id: 'chrome-devtools-missing',
          source: 'capability',
          capabilityId: 'chrome-devtools-mcp',
          capabilityState: 'unavailable',
          failureCode: 'capability-unavailable',
          summary: 'chrome-devtools-mcp is not installed',
          evidenceRefs: ['capability-matrix'],
        }),
      ],
      generatedAt: now,
    });

    expect(result.failures[0]).toMatchObject({
      category: 'dependency',
      capabilityId: 'chrome-devtools-mcp',
    });
    expect(result.nextAction.summary).toContain('Restore dependency');
  });

  it('keeps all failure layers and selects the most likely primary root layer', () => {
    const result = captureFailureEvidence({
      runId: 'run-multi-layer',
      goalId: 'goal-failure',
      observations: [
        base({
          id: 'database-unavailable',
          source: 'service',
          failureCode: 'database-unavailable',
          summary: 'DATABASE_URL missing while starting backend',
          evidenceRefs: ['service-health'],
        }),
        base({
          id: 'api-500',
          source: 'api',
          status: 500,
          failureCode: 'api-status-mismatch',
          summary: 'PATCH /api/profile returned 500',
          evidenceRefs: ['api-run-profile-save'],
        }),
        base({
          id: 'data-mismatch',
          source: 'data',
          target: 'profile.name',
          failureCode: 'data-readback-mismatch',
          summary: 'Data readback could not confirm profile.name',
          evidenceRefs: ['data-run-profile-save'],
        }),
      ],
      generatedAt: now,
    });

    expect(result.failures).toHaveLength(3);
    expect(result.primary).toMatchObject({
      id: 'database-unavailable',
      category: 'environment',
    });
    expect(result.secondarySymptoms.map((entry) => entry.id)).toEqual(['api-500', 'data-mismatch']);
  });

  it('redacts sensitive and oversized failure logs while retaining artifact refs', () => {
    const sensitive = [
      'Authorization: Bearer SECRET_TOKEN_123',
      'cookie=session=secret-cookie',
      'api_key=plain-secret',
      'password=hunter2',
      'x'.repeat(1200),
    ].join('\n');

    const result = captureFailureEvidence({
      runId: 'run-sensitive-failure',
      goalId: 'goal-failure',
      observations: [
        base({
          source: 'command',
          failureCode: 'command-exit-nonzero',
          command: {
            executable: 'curl',
            argv: ['https://example.test?api_key=plain-secret', '--token=SECRET_TOKEN_123'],
            exitCode: 1,
          },
          reproductionSteps: ['curl https://example.test?cookie=secret-cookie'],
          url: 'https://example.test?api_key=plain-secret',
          stdout: sensitive,
          stderr: sensitive,
          artifactRefs: ['artifact-large-log'],
        }),
      ],
      generatedAt: now,
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('SECRET_TOKEN_123');
    expect(serialized).not.toContain('secret-cookie');
    expect(serialized).not.toContain('plain-secret');
    expect(serialized).not.toContain('hunter2');
    expect(serialized).toContain('[REDACTED]');
    expect(result.failures[0]?.summary.length).toBeLessThanOrEqual(700);
    expect(result.failures[0]?.artifactRefs).toEqual(['artifact-large-log']);
    expect(result.failures[0]?.privacy).toMatchObject({
      containsSensitiveData: true,
      redacted: true,
      summaryTruncated: true,
    });
  });

  it('returns unknown with a diagnostic evidence next action instead of guessing a fix', () => {
    const result = captureFailureEvidence({
      runId: 'run-unknown-failure',
      goalId: 'goal-failure',
      observations: [
        base({
          id: 'unknown-symptom',
          source: 'command',
          summary: 'Something unexpected happened',
          stderr: 'unexpected behavior',
          failureCode: undefined,
          evidenceRefs: [],
          artifactRefs: [],
        }),
      ],
      generatedAt: now,
    });

    expect(result.primary).toMatchObject({
      category: 'unknown',
      confidence: expect.any(Number),
    });
    expect(result.nextAction.summary).toContain('Collect more diagnostic evidence');
    expect(result.nextAction.summary).not.toContain('fix the code');
  });

  it('keeps broken-app fixture inputs available for recovery tests', async () => {
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as { failures: FailureObservation[] };
    const result = captureFailureEvidence({
      runId: 'run-fixture',
      goalId: 'goal-failure',
      observations: fixture.failures,
      generatedAt: now,
    });

    expect(result.failures.length).toBeGreaterThanOrEqual(4);
    expect(result.taxonomy.categories).toEqual(expect.arrayContaining(['environment', 'api', 'data', 'browser']));
  });
});
