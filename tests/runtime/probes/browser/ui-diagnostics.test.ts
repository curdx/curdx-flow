import { describe, expect, it } from 'vitest';

import {
  evaluateUiDiagnosticsEvidence,
  type EvaluateUiDiagnosticsEvidenceInput,
} from '../../../../src/runtime/adapters/browser/index.ts';
import type { UserJourney } from '../../../../src/runtime/planner/index.ts';

const now = '2026-05-17T14:20:00.000Z';

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
      { actionId: 'open-profile', state: 'loading', assertion: 'Profile form shows a loading state before data resolves' },
      { actionId: 'submit-profile', state: 'success-after-submit', assertion: 'Saved confirmation is visible after submit' },
    ],
    expectedApi: [],
    expectedData: [],
    inferred: false,
    confidence: 1,
    missingEvidence: [],
    remainingRisks: [],
  };
}

function input(overrides: Partial<EvaluateUiDiagnosticsEvidenceInput> = {}): EvaluateUiDiagnosticsEvidenceInput {
  return {
    runId: overrides.runId ?? 'run-ui-1',
    goalId: overrides.goalId ?? 'goal-ui',
    mode: overrides.mode ?? 'verification',
    journey: overrides.journey ?? journey(),
    capabilityId: overrides.capabilityId ?? 'browser.ui-diagnostics',
    actionResults: overrides.actionResults ?? [
      { actionId: 'open-profile', actionType: 'navigate', status: 'passed', pageState: 'loading then form-ready' },
      { actionId: 'submit-profile', actionType: 'click', status: 'passed', pageState: 'success-after-submit' },
    ],
    stateObservations: overrides.stateObservations ?? [
      { actionId: 'open-profile', state: 'loading', status: 'passed', summary: 'Skeleton visible before profile payload resolves', evidenceRefs: ['screenshot-loading'] },
      { actionId: 'submit-profile', state: 'success-after-submit', status: 'passed', summary: 'Saved toast visible after submit', evidenceRefs: ['screenshot-success'] },
    ],
    consoleIssues: overrides.consoleIssues ?? [],
    networkIssues: overrides.networkIssues ?? [],
    visualIssues: overrides.visualIssues ?? [],
    checkedViewports: overrides.checkedViewports ?? [
      { id: 'desktop', width: 1440, height: 900, evidenceRefs: ['screenshot-desktop'] },
      { id: 'mobile', width: 390, height: 844, evidenceRefs: ['screenshot-mobile'] },
    ],
    requiredViewports: overrides.requiredViewports ?? ['desktop', 'mobile'],
    uxCapability: Object.hasOwn(overrides, 'uxCapability')
      ? overrides.uxCapability
      : { capabilityId: 'ui-ux-pro-max', state: 'available', reason: 'capability detected' },
    generatedAt: overrides.generatedAt ?? now,
  };
}

describe('UI diagnostics evidence', () => {
  it('creates state matrix evidence when expected UI states and viewports are covered', () => {
    const result = evaluateUiDiagnosticsEvidence(input());

    expect(result).toMatchObject({
      ok: true,
      status: 'passed',
      capabilityId: 'browser.ui-diagnostics',
    });
    expect(result.evidence[0]).toMatchObject({
      source: 'browser',
      trustLevel: 'verified',
      status: 'passed',
      journeyId: 'profile-save',
      checkedViewports: ['desktop', 'mobile'],
      missingViewports: [],
    });
    expect(result.stateMatrix).toEqual([
      expect.objectContaining({ actionId: 'open-profile', expectedState: 'loading', status: 'passed' }),
      expect.objectContaining({ actionId: 'submit-profile', expectedState: 'success-after-submit', status: 'passed' }),
    ]);
  });

  it('fails evidence for console errors tied to a user action', () => {
    const result = evaluateUiDiagnosticsEvidence(input({
      consoleIssues: [
        { actionId: 'submit-profile', level: 'error', severity: 'high', message: 'Uncaught TypeError: cannot read property name', evidenceRefs: ['console-1'] },
      ],
    }));

    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ui-console-error', actionId: 'submit-profile', severity: 'high' }),
    ]));
  });

  it('fails evidence for failed network requests observed during the journey', () => {
    const result = evaluateUiDiagnosticsEvidence(input({
      networkIssues: [
        { actionId: 'submit-profile', method: 'PATCH', url: '/api/profile', status: 500, severity: 'critical', failureSummary: 'PATCH /api/profile returned 500', evidenceRefs: ['network-1'] },
      ],
    }));

    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ui-network-failure', actionId: 'submit-profile', severity: 'critical' }),
    ]));
  });

  it('fails evidence for a blank page visual issue', () => {
    const result = evaluateUiDiagnosticsEvidence(input({
      visualIssues: [
        { actionId: 'open-profile', type: 'blank-page', severity: 'critical', summary: 'Screenshot is blank after navigation', viewport: 'desktop', evidenceRefs: ['screenshot-blank'] },
      ],
    }));

    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ui-visual-blank-page', actionId: 'open-profile' }),
    ]));
  });

  it('fails evidence for obvious overlap or clipping visual defects', () => {
    const result = evaluateUiDiagnosticsEvidence(input({
      visualIssues: [
        { actionId: 'submit-profile', type: 'overlap', severity: 'high', summary: 'Save button overlaps validation text', viewport: 'desktop', evidenceRefs: ['screenshot-overlap'] },
      ],
    }));

    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ui-visual-overlap', actionId: 'submit-profile' }),
    ]));
  });

  it('degrades evidence when required mobile viewport evidence is missing', () => {
    const result = evaluateUiDiagnosticsEvidence(input({
      checkedViewports: [
        { id: 'desktop', width: 1440, height: 900, evidenceRefs: ['screenshot-desktop'] },
      ],
      requiredViewports: ['desktop', 'mobile'],
    }));

    expect(result.ok).toBe(false);
    expect(result.status).toBe('degraded');
    expect(result.evidence[0]).toMatchObject({
      missingViewports: ['mobile'],
      unverifiedScope: expect.arrayContaining([expect.stringContaining('mobile')]),
    });
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ui-viewport-missing' }),
    ]));
  });

  it('degrades evidence when a checked viewport has no screenshot or trace evidence reference', () => {
    const result = evaluateUiDiagnosticsEvidence(input({
      checkedViewports: [
        { id: 'desktop', width: 1440, height: 900, evidenceRefs: ['screenshot-desktop'] },
        { id: 'mobile', width: 390, height: 844, evidenceRefs: [] },
      ],
      requiredViewports: ['desktop', 'mobile'],
    }));

    expect(result.status).toBe('degraded');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ui-viewport-evidence-missing', viewport: 'mobile' }),
    ]));
  });

  it('blocks skipped UI states when no reason or remaining risk is recorded', () => {
    const result = evaluateUiDiagnosticsEvidence(input({
      stateObservations: [
        { actionId: 'open-profile', state: 'loading', status: 'passed', summary: 'Skeleton visible before profile payload resolves', evidenceRefs: ['screenshot-loading'] },
        { actionId: 'submit-profile', state: 'success-after-submit', status: 'skipped', summary: 'Saved state not captured', evidenceRefs: [] },
      ],
    }));

    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ui-state-unexplained', actionId: 'submit-profile' }),
    ]));
  });

  it('degrades evidence when ui-ux-pro-max is unavailable for visual quality checks', () => {
    const result = evaluateUiDiagnosticsEvidence(input({
      uxCapability: { capabilityId: 'ui-ux-pro-max', state: 'unavailable', reason: 'plugin dependency not installed' },
    }));

    expect(result.ok).toBe(false);
    expect(result.status).toBe('degraded');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'ui-ux-capability-unavailable',
        capabilityId: 'ui-ux-pro-max',
      }),
    ]));
  });

  it('degrades evidence when ui-ux-pro-max capability status is missing', () => {
    const result = evaluateUiDiagnosticsEvidence(input({ uxCapability: undefined }));

    expect(result.status).toBe('degraded');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ui-ux-capability-unavailable', capabilityId: 'ui-ux-pro-max' }),
    ]));
  });

  it('redacts sensitive console and network summaries', () => {
    const result = evaluateUiDiagnosticsEvidence(input({
      consoleIssues: [
        { actionId: 'submit-profile', level: 'error', severity: 'high', message: 'Authorization: Bearer SECRET123', evidenceRefs: ['console-secret'] },
      ],
      networkIssues: [
        { actionId: 'submit-profile', method: 'POST', url: '/api/profile', status: 500, severity: 'critical', failureSummary: '{"accessToken":"token-secret","api_key":"secret-key"}', evidenceRefs: ['network-secret'] },
      ],
    }));

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('SECRET123');
    expect(serialized).not.toContain('token-secret');
    expect(serialized).not.toContain('secret-key');
    expect(serialized).toContain('[REDACTED]');
    expect(result.evidence[0]?.privacy).toMatchObject({
      containsSensitiveData: true,
      redacted: true,
    });
  });
});
