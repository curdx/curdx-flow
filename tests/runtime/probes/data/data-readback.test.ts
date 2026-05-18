import { describe, expect, it } from 'vitest';

import {
  evaluateDataReadbackEvidence,
  type ObservedDataReadback,
} from '../../../../src/runtime/adapters/api-data/index.ts';
import type { ApiEvidenceMatch } from '../../../../src/runtime/adapters/api-data/index.ts';
import type { UserJourney } from '../../../../src/runtime/planner/index.ts';

const now = '2026-05-17T14:00:00.000Z';

function journey(): UserJourney {
  return {
    id: 'profile-save',
    title: 'Profile save flow',
    entry: {
      url: 'http://127.0.0.1:3000/profile',
      serviceId: 'frontend',
      inferred: false,
      confidence: 1,
    },
    actions: [
      { id: 'open-profile', type: 'navigate', description: 'Open profile page', allowedInReportOnly: true, executes: false },
      { id: 'submit-profile', type: 'click', target: 'button[type="submit"]', description: 'Save profile', allowedInReportOnly: false, executes: false },
    ],
    expectedUi: [
      { actionId: 'submit-profile', state: 'success', assertion: 'Saved appears' },
    ],
    expectedApi: [
      { actionId: 'submit-profile', method: 'PATCH', urlPattern: '/api/profile', expectedStatus: 200, responseShape: 'updated profile JSON' },
    ],
    expectedData: [
      { actionId: 'submit-profile', target: 'profile.name', expectedState: 'updated name persists', readback: 'GET /api/profile returns updated name' },
    ],
    inferred: false,
    confidence: 1,
    missingEvidence: [],
    remainingRisks: [],
  };
}

function apiMatch(overrides: Partial<ApiEvidenceMatch> = {}): ApiEvidenceMatch {
  return {
    eventId: overrides.eventId ?? 'api-profile-save',
    actionId: overrides.actionId ?? 'submit-profile',
    method: overrides.method ?? 'PATCH',
    url: overrides.url ?? 'http://127.0.0.1:3000/api/profile',
    status: overrides.status ?? 200,
    source: overrides.source ?? 'browser-network',
    requestSummary: overrides.requestSummary ?? 'PATCH /api/profile {"name":"Ada"}',
    responseSummary: overrides.responseSummary ?? '200 {"name":"Ada","updated":true}',
    timing: overrides.timing ?? {
      startedAt: '2026-05-17T14:00:01.000Z',
      completedAt: '2026-05-17T14:00:01.100Z',
    },
    schemaIssues: overrides.schemaIssues ?? [],
  };
}

function readback(overrides: Partial<ObservedDataReadback> = {}): ObservedDataReadback {
  return {
    id: overrides.id ?? 'read-profile',
    actionId: Object.hasOwn(overrides, 'actionId') ? overrides.actionId : 'submit-profile',
    apiEventId: Object.hasOwn(overrides, 'apiEventId') ? overrides.apiEventId : 'api-profile-save',
    strategy: overrides.strategy ?? 'api-query',
    target: overrides.target ?? 'profile.name',
    expectedSummary: overrides.expectedSummary ?? 'profile.name should equal Ada',
    observedSummary: overrides.observedSummary ?? 'GET /api/profile returned profile.name=Ada',
    consistent: Object.hasOwn(overrides, 'consistent') ? overrides.consistent : true,
    source: overrides.source ?? 'real',
    dataIdSummary: Object.hasOwn(overrides, 'dataIdSummary') ? overrides.dataIdSummary : 'profile id profile-123',
    createdBy: overrides.createdBy ?? 'user-action',
    cleanupStrategy: Object.hasOwn(overrides, 'cleanupStrategy') ? overrides.cleanupStrategy : 'reuse existing profile fixture and restore name after run',
    privacy: Object.hasOwn(overrides, 'privacy') ? overrides.privacy : { classification: 'local-only', containsSensitiveData: false, redacted: false },
    uiState: overrides.uiState ?? 'success',
    apiStatus: overrides.apiStatus ?? 200,
    failureCode: overrides.failureCode,
    failureSummary: overrides.failureSummary,
    startedAt: overrides.startedAt ?? '2026-05-17T14:00:02.000Z',
    completedAt: overrides.completedAt ?? '2026-05-17T14:00:02.090Z',
  };
}

describe('data persistence readback evidence', () => {
  it('creates verified data evidence when a saved value is read back through the same user action and API evidence', () => {
    const result = evaluateDataReadbackEvidence({
      runId: 'run-data-1',
      goalId: 'goal-data',
      mode: 'verification',
      journey: journey(),
      capabilityId: 'data.readback',
      apiMatches: [apiMatch()],
      observedReadbacks: [readback()],
      generatedAt: now,
    });

    expect(result).toMatchObject({
      ok: true,
      status: 'passed',
      capabilityId: 'data.readback',
    });
    expect(result.evidence[0]).toMatchObject({
      source: 'data',
      trustLevel: 'verified',
      status: 'passed',
      journeyId: 'profile-save',
      actionIds: ['submit-profile'],
      startedAt: '2026-05-17T14:00:02.000Z',
      completedAt: '2026-05-17T14:00:02.090Z',
    });
    expect(result.matches).toEqual([
      expect.objectContaining({
        actionId: 'submit-profile',
        apiEventId: 'api-profile-save',
        target: 'profile.name',
        consistent: true,
      }),
    ]);
  });

  it('fails evidence when UI reports success but data readback disagrees', () => {
    const result = evaluateDataReadbackEvidence({
      runId: 'run-data-2',
      goalId: 'goal-data',
      mode: 'verification',
      journey: journey(),
      capabilityId: 'data.readback',
      apiMatches: [apiMatch()],
      observedReadbacks: [readback({ consistent: false, uiState: 'success', observedSummary: 'UI says saved but readback still returns Grace' })],
      generatedAt: now,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'data-readback-mismatch',
        actionId: 'submit-profile',
        possibleLayer: 'database',
        nextAction: expect.objectContaining({ summary: expect.stringContaining('backend') }),
      }),
    ]));
  });

  it('fails evidence when API succeeds but refresh or query readback is inconsistent', () => {
    const result = evaluateDataReadbackEvidence({
      runId: 'run-data-3',
      goalId: 'goal-data',
      mode: 'verification',
      journey: journey(),
      capabilityId: 'data.readback',
      apiMatches: [apiMatch({ status: 200 })],
      observedReadbacks: [readback({ consistent: false, strategy: 'page-refresh', observedSummary: 'After refresh profile.name reverted to Grace' })],
      generatedAt: now,
    });

    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'data-readback-mismatch',
        observedSummary: expect.stringContaining('Grace'),
        nextAction: expect.objectContaining({ summary: expect.stringContaining('cache') }),
      }),
    ]));
  });

  it('marks mock or fixture data readbacks as degraded instead of passed', () => {
    const result = evaluateDataReadbackEvidence({
      runId: 'run-data-4',
      goalId: 'goal-data',
      mode: 'verification',
      journey: journey(),
      capabilityId: 'fixture',
      apiMatches: [apiMatch()],
      observedReadbacks: [readback({ source: 'fixture', createdBy: 'fixture', observedSummary: 'fixture row contains Ada' })],
      generatedAt: now,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('degraded');
    expect(result.evidence[0]).toMatchObject({ trustLevel: 'degraded', status: 'degraded' });
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'data-mock-degraded', actionId: 'submit-profile' }),
    ]));
  });

  it('marks fixture-created data readbacks as degraded even when the read path looks real', () => {
    const result = evaluateDataReadbackEvidence({
      runId: 'run-data-4b',
      goalId: 'goal-data',
      mode: 'verification',
      journey: journey(),
      capabilityId: 'data.readback',
      apiMatches: [apiMatch()],
      observedReadbacks: [readback({ source: 'real', createdBy: 'fixture', observedSummary: 'real DB read returned preseeded fixture row' })],
      generatedAt: now,
    });

    expect(result.status).toBe('degraded');
    expect(result.evidence[0]).toMatchObject({ trustLevel: 'degraded' });
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'data-mock-degraded', actionId: 'submit-profile' }),
    ]));
  });

  it('blocks passed evidence when data identifier, cleanup, or privacy metadata is missing', () => {
    const result = evaluateDataReadbackEvidence({
      runId: 'run-data-4c',
      goalId: 'goal-data',
      mode: 'verification',
      journey: journey(),
      capabilityId: 'data.readback',
      apiMatches: [apiMatch()],
      observedReadbacks: [readback({ dataIdSummary: undefined, cleanupStrategy: undefined, privacy: undefined })],
      generatedAt: now,
    });

    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'data-test-metadata-missing',
        message: expect.stringContaining('dataIdSummary'),
      }),
    ]));
  });

  it('blocks sensitive readback metadata when the source marks it sensitive but no redaction is recorded', () => {
    const result = evaluateDataReadbackEvidence({
      runId: 'run-data-4d',
      goalId: 'goal-data',
      mode: 'verification',
      journey: journey(),
      capabilityId: 'data.readback',
      apiMatches: [apiMatch()],
      observedReadbacks: [readback({
        observedSummary: 'safe pre-summarized row id profile-123',
        privacy: { classification: 'confidential', containsSensitiveData: true, redacted: false },
      })],
      generatedAt: now,
    });

    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'data-sensitive-summary-unredacted', actionId: 'submit-profile' }),
    ]));
  });

  it('blocks completion when the data source needed for readback is unavailable', () => {
    const result = evaluateDataReadbackEvidence({
      runId: 'run-data-5',
      goalId: 'goal-data',
      mode: 'verification',
      journey: journey(),
      capabilityId: 'data.readback',
      apiMatches: [apiMatch()],
      observedReadbacks: [readback({
        consistent: undefined,
        failureCode: 'database-unavailable',
        failureSummary: 'DATABASE_URL is not configured token=db-secret',
        observedSummary: 'database read could not run',
      })],
      generatedAt: now,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'data-source-unavailable',
        possibleLayer: 'database',
        observedSummary: expect.stringContaining('DATABASE_URL'),
      }),
    ]));
    expect(JSON.stringify(result)).not.toContain('db-secret');
  });

  it('redacts sensitive data identifiers and readback summaries', () => {
    const result = evaluateDataReadbackEvidence({
      runId: 'run-data-6',
      goalId: 'goal-data',
      mode: 'verification',
      journey: journey(),
      capabilityId: 'data.readback',
      apiMatches: [apiMatch()],
      observedReadbacks: [readback({
        dataIdSummary: 'profile id profile-123 session=secret-session',
        observedSummary: '{"accessToken":"token-secret","api_key":"secret-key","name":"Ada"}',
        privacy: { classification: 'confidential', containsSensitiveData: true, redacted: false },
      })],
      generatedAt: now,
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('secret-session');
    expect(serialized).not.toContain('token-secret');
    expect(serialized).not.toContain('secret-key');
    expect(serialized).toContain('[REDACTED]');
    expect(result.evidence[0]?.privacy).toMatchObject({
      containsSensitiveData: true,
      redacted: true,
    });
  });

  it('blocks evidence when readback is not linked to matching API evidence', () => {
    const result = evaluateDataReadbackEvidence({
      runId: 'run-data-7',
      goalId: 'goal-data',
      mode: 'verification',
      journey: journey(),
      capabilityId: 'data.readback',
      apiMatches: [apiMatch({ eventId: 'other-api-event' })],
      observedReadbacks: [readback({ apiEventId: 'api-profile-save' })],
      generatedAt: now,
    });

    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'data-api-evidence-unbound', actionId: 'submit-profile' }),
    ]));
  });

  it('fails evidence when linked API evidence is not successful', () => {
    const result = evaluateDataReadbackEvidence({
      runId: 'run-data-8',
      goalId: 'goal-data',
      mode: 'verification',
      journey: journey(),
      capabilityId: 'data.readback',
      apiMatches: [apiMatch({ status: 500 })],
      observedReadbacks: [readback()],
      generatedAt: now,
    });

    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'data-api-evidence-failed', actionId: 'submit-profile' }),
    ]));
  });
});
