import { describe, expect, it } from 'vitest';

import {
  evaluateActionApiEvidence,
  type ObservedApiEvent,
} from '../../../../src/runtime/adapters/api-data/index.ts';
import type { UserJourney } from '../../../../src/runtime/planner/index.ts';

const now = '2026-05-17T13:45:00.000Z';

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

function apiEvent(overrides: Partial<ObservedApiEvent> = {}): ObservedApiEvent {
  return {
    id: overrides.id ?? 'api-profile-save',
    actionId: Object.hasOwn(overrides, 'actionId') ? overrides.actionId : 'submit-profile',
    method: overrides.method ?? 'PATCH',
    url: overrides.url ?? 'http://127.0.0.1:3000/api/profile',
    status: overrides.status ?? 200,
    source: overrides.source ?? 'browser-network',
    requestSummary: overrides.requestSummary ?? 'PATCH /api/profile {"name":"Ada"}',
    responseSummary: overrides.responseSummary ?? '200 {"name":"Ada","updated":true}',
    responseShapeValid: Object.hasOwn(overrides, 'responseShapeValid') ? overrides.responseShapeValid : true,
    uiConsistent: Object.hasOwn(overrides, 'uiConsistent') ? overrides.uiConsistent : true,
    dataConsistent: Object.hasOwn(overrides, 'dataConsistent') ? overrides.dataConsistent : undefined,
    startedAt: overrides.startedAt ?? '2026-05-17T13:45:01.000Z',
    completedAt: overrides.completedAt ?? '2026-05-17T13:45:01.100Z',
  };
}

describe('action-bound API evidence', () => {
  it('creates verified API evidence bound to a concrete journey action', () => {
    const result = evaluateActionApiEvidence({
      runId: 'run-api-1',
      goalId: 'goal-api',
      mode: 'verification',
      journey: journey(),
      capabilityId: 'api.check',
      observedEvents: [apiEvent()],
      generatedAt: now,
    });

    expect(result).toMatchObject({
      ok: true,
      status: 'passed',
      capabilityId: 'api.check',
    });
    expect(result.evidence[0]).toMatchObject({
      source: 'api',
      trustLevel: 'verified',
      status: 'passed',
      journeyId: 'profile-save',
      actionIds: ['submit-profile'],
    });
    expect(result.matches).toEqual([
      expect.objectContaining({
        actionId: 'submit-profile',
        method: 'PATCH',
        status: 200,
        timing: expect.objectContaining({
          startedAt: '2026-05-17T13:45:01.000Z',
          completedAt: '2026-05-17T13:45:01.100Z',
        }),
      }),
    ]);
    expect(result.evidence[0]).toMatchObject({
      startedAt: '2026-05-17T13:45:01.000Z',
      completedAt: '2026-05-17T13:45:01.100Z',
    });
  });

  it('blocks completion when the expected user action does not trigger the API request', () => {
    const result = evaluateActionApiEvidence({
      runId: 'run-api-2',
      goalId: 'goal-api',
      mode: 'verification',
      journey: journey(),
      capabilityId: 'api.check',
      observedEvents: [],
      generatedAt: now,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'api-request-missing',
        actionId: 'submit-profile',
        expectedMethod: 'PATCH',
        expectedUrlPattern: '/api/profile',
        possibleLayer: 'frontend-or-network',
      }),
    ]));
  });

  it('fails evidence when the response status does not match expectations', () => {
    const result = evaluateActionApiEvidence({
      runId: 'run-api-3',
      goalId: 'goal-api',
      mode: 'verification',
      journey: journey(),
      capabilityId: 'api.check',
      observedEvents: [apiEvent({ status: 500, responseSummary: '500 {"error":"db unavailable"}' })],
      generatedAt: now,
    });

    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'api-status-mismatch', actionId: 'submit-profile', observedStatus: 500 }),
    ]));
  });

  it('fails evidence when response shape validation reports a mismatch', () => {
    const result = evaluateActionApiEvidence({
      runId: 'run-api-4',
      goalId: 'goal-api',
      mode: 'verification',
      journey: journey(),
      capabilityId: 'api.check',
      observedEvents: [apiEvent({ responseShapeValid: false, schemaIssues: ['missing required property updated'] })],
      generatedAt: now,
    });

    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'api-schema-mismatch', actionId: 'submit-profile' }),
    ]));
  });

  it('blocks evidence when a required response shape has no validation result', () => {
    const result = evaluateActionApiEvidence({
      runId: 'run-api-4b',
      goalId: 'goal-api',
      mode: 'verification',
      journey: journey(),
      capabilityId: 'api.check',
      observedEvents: [apiEvent({ responseShapeValid: undefined })],
      generatedAt: now,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'api-schema-unverified', actionId: 'submit-profile' }),
    ]));
  });

  it('does not bind a literal URL pattern to a similarly named endpoint', () => {
    const result = evaluateActionApiEvidence({
      runId: 'run-api-4c',
      goalId: 'goal-api',
      mode: 'verification',
      journey: journey(),
      capabilityId: 'api.check',
      observedEvents: [apiEvent({ url: 'http://127.0.0.1:3000/api/profile-extra' })],
      generatedAt: now,
    });

    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'api-request-missing', actionId: 'submit-profile' }),
    ]));
  });

  it('marks mock or curl responses without action binding as degraded instead of passed', () => {
    const result = evaluateActionApiEvidence({
      runId: 'run-api-5',
      goalId: 'goal-api',
      mode: 'verification',
      journey: journey(),
      capabilityId: 'curl',
      observedEvents: [apiEvent({ actionId: undefined, source: 'mock', responseSummary: '200 fixture response' })],
      generatedAt: now,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('degraded');
    expect(result.evidence[0]).toMatchObject({ trustLevel: 'degraded', status: 'degraded' });
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'api-unbound-degraded', actionId: 'submit-profile' }),
    ]));
  });

  it('redacts sensitive request and response summaries before returning evidence', () => {
    const result = evaluateActionApiEvidence({
      runId: 'run-api-6',
      goalId: 'goal-api',
      mode: 'verification',
      journey: journey(),
      capabilityId: 'api.check',
      observedEvents: [apiEvent({
        requestSummary: 'Authorization: Bearer SECRET123 token=abc123',
        responseSummary: '{"api_key":"secret-key","accessToken":"token-secret","refresh_token":"refresh-secret","name":"Ada"}',
      })],
      generatedAt: now,
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('SECRET123');
    expect(serialized).not.toContain('abc123');
    expect(serialized).not.toContain('secret-key');
    expect(serialized).not.toContain('token-secret');
    expect(serialized).not.toContain('refresh-secret');
    expect(serialized).toContain('[REDACTED]');
    expect(result.evidence[0]?.privacy).toMatchObject({
      containsSensitiveData: true,
      redacted: true,
    });
  });

  it('fails evidence when API success is inconsistent with observed UI state', () => {
    const result = evaluateActionApiEvidence({
      runId: 'run-api-7',
      goalId: 'goal-api',
      mode: 'verification',
      journey: journey(),
      capabilityId: 'api.check',
      observedEvents: [apiEvent({ uiConsistent: false, responseSummary: '200 profile updated but UI still shows stale name' })],
      generatedAt: now,
    });

    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'ui-api-inconsistent',
        actionId: 'submit-profile',
        nextAction: expect.objectContaining({ summary: expect.stringContaining('UI/API/data closure') }),
      }),
    ]));
  });
});
