import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type {
  BrowserAutomationPort,
  BrowserConsoleIssue,
  BrowserNetworkIssue,
  BrowserVisualIssue,
  BrowserViewportEvidence,
  ObservedApiEvent,
  ObservedDataReadback,
  UiStateObservation,
} from '../../../../src/runtime/adapters/index.ts';
import { evaluateFullStackJourney } from '../../../../src/runtime/probes/full-stack/index.ts';
import type { UserJourney } from '../../../../src/runtime/planner/index.ts';

const now = '2026-05-17T15:00:00.000Z';
const fixtureRoot = join(process.cwd(), 'tests/fixtures/fullstack-app');
const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })));
});

async function tempWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), 'curdx-fullstack-'));
  workspaces.push(workspace);
  return workspace;
}

function profileJourney(): UserJourney {
  return {
    id: 'profile-save',
    title: 'Profile save journey',
    entry: {
      url: 'http://127.0.0.1:4173/profile',
      serviceId: 'fullstack-app',
      inferred: false,
      confidence: 1,
    },
    actions: [
      { id: 'open-profile', type: 'navigate', description: 'Open profile page', allowedInReportOnly: true, executes: false },
      { id: 'edit-name', type: 'fill', target: 'input[name="name"]', value: 'Ada Lovelace', description: 'Change display name', allowedInReportOnly: false, executes: false },
      { id: 'submit-profile', type: 'click', target: 'button[type="submit"]', description: 'Save profile', allowedInReportOnly: false, executes: false },
    ],
    expectedUi: [
      { actionId: 'submit-profile', state: 'success-after-submit', assertion: 'Saved state shows Ada Lovelace after submit' },
    ],
    expectedApi: [
      { actionId: 'submit-profile', method: 'PATCH', urlPattern: '/api/profile', expectedStatus: 200, responseShape: 'profile JSON with updated=true' },
    ],
    expectedData: [
      { actionId: 'submit-profile', target: 'profile.name', expectedState: 'Ada Lovelace persists', readback: 'GET /api/profile returns Ada Lovelace' },
    ],
    inferred: false,
    confidence: 1,
    missingEvidence: [],
    remainingRisks: [],
  };
}

function playwrightPort(): BrowserAutomationPort {
  return {
    capabilityId: 'playwright',
    capabilityKind: 'playwright',
    async execute(input) {
      return {
        status: 'passed',
        visitedUrl: input.journey.entry.url,
        command: {
          executable: 'node',
          argv: ['tests/fixtures/fullstack-app/scripts/run-journey.mjs', 'happy'],
          exitCode: 0,
          stdoutSummary: 'profile save journey passed',
          stderrSummary: '',
          durationMs: 80,
        },
        actions: input.journey.actions.map((action) => ({
          actionId: action.id,
          actionType: action.type,
          status: 'passed',
          url: input.journey.entry.url,
          pageState: action.id === 'submit-profile' ? 'success-after-submit' : 'ready',
          durationMs: 10,
        })),
        artifacts: [
          {
            id: 'profile-save-screenshot',
            type: 'screenshot',
            summary: 'Profile page saved state screenshot',
            content: 'fake screenshot bytes for profile save',
            quality: { status: 'usable', supportsEvidence: true, reason: 'Covers saved form state and success message.' },
          },
          {
            id: 'profile-save-trace',
            type: 'trace',
            summary: 'Profile save trace artifact',
            content: 'fake trace bytes for profile save',
            quality: { status: 'usable', supportsEvidence: true, reason: 'Contains navigation, edit, submit, and readback.' },
          },
        ],
        diagnostics: [],
        durationMs: 100,
      };
    },
  };
}

function apiEvent(overrides: Partial<ObservedApiEvent> = {}): ObservedApiEvent {
  return {
    id: overrides.id ?? 'api-profile-save',
    actionId: Object.hasOwn(overrides, 'actionId') ? overrides.actionId : 'submit-profile',
    method: overrides.method ?? 'PATCH',
    url: overrides.url ?? 'http://127.0.0.1:4173/api/profile',
    status: overrides.status ?? 200,
    source: overrides.source ?? 'browser-network',
    requestSummary: overrides.requestSummary ?? 'PATCH /api/profile {"name":"Ada Lovelace"}',
    responseSummary: overrides.responseSummary ?? '200 {"name":"Ada Lovelace","updated":true}',
    responseShapeValid: Object.hasOwn(overrides, 'responseShapeValid') ? overrides.responseShapeValid : true,
    uiConsistent: Object.hasOwn(overrides, 'uiConsistent') ? overrides.uiConsistent : true,
    dataConsistent: overrides.dataConsistent,
    schemaIssues: overrides.schemaIssues,
    startedAt: overrides.startedAt ?? '2026-05-17T15:00:01.000Z',
    completedAt: overrides.completedAt ?? '2026-05-17T15:00:01.100Z',
  };
}

function dataReadback(overrides: Partial<ObservedDataReadback> = {}): ObservedDataReadback {
  return {
    id: overrides.id ?? 'read-profile',
    actionId: Object.hasOwn(overrides, 'actionId') ? overrides.actionId : 'submit-profile',
    apiEventId: Object.hasOwn(overrides, 'apiEventId') ? overrides.apiEventId : 'api-profile-save',
    strategy: overrides.strategy ?? 'api-query',
    target: overrides.target ?? 'profile.name',
    expectedSummary: overrides.expectedSummary ?? 'profile.name should equal Ada Lovelace',
    observedSummary: overrides.observedSummary ?? 'GET /api/profile returned profile.name=Ada Lovelace',
    consistent: Object.hasOwn(overrides, 'consistent') ? overrides.consistent : true,
    source: overrides.source ?? 'real',
    dataIdSummary: Object.hasOwn(overrides, 'dataIdSummary') ? overrides.dataIdSummary : 'profile id profile-123',
    createdBy: overrides.createdBy ?? 'user-action',
    cleanupStrategy: Object.hasOwn(overrides, 'cleanupStrategy') ? overrides.cleanupStrategy : 'restore profile.name to Grace Hopper after test',
    privacy: Object.hasOwn(overrides, 'privacy') ? overrides.privacy : { classification: 'local-only', containsSensitiveData: false, redacted: false },
    uiState: overrides.uiState ?? 'success-after-submit',
    apiStatus: overrides.apiStatus ?? 200,
    failureCode: overrides.failureCode,
    failureSummary: overrides.failureSummary,
    startedAt: overrides.startedAt ?? '2026-05-17T15:00:02.000Z',
    completedAt: overrides.completedAt ?? '2026-05-17T15:00:02.100Z',
  };
}

function uiState(overrides: Partial<UiStateObservation> = {}): UiStateObservation {
  return {
    actionId: overrides.actionId ?? 'submit-profile',
    state: overrides.state ?? 'success-after-submit',
    status: overrides.status ?? 'passed',
    summary: overrides.summary ?? 'Saved message visible and profile name displays Ada Lovelace',
    reason: overrides.reason,
    evidenceRefs: overrides.evidenceRefs ?? ['profile-save-screenshot', 'profile-save-trace'],
  };
}

function viewport(overrides: Partial<BrowserViewportEvidence> = {}): BrowserViewportEvidence {
  return {
    id: overrides.id ?? 'desktop',
    width: overrides.width ?? 1280,
    height: overrides.height ?? 720,
    evidenceRefs: overrides.evidenceRefs ?? ['profile-save-screenshot'],
  };
}

async function runJourney(overrides: {
  runId?: string;
  apiEvents?: ObservedApiEvent[];
  dataReadbacks?: ObservedDataReadback[];
  stateObservations?: UiStateObservation[];
  consoleIssues?: BrowserConsoleIssue[];
  networkIssues?: BrowserNetworkIssue[];
  visualIssues?: BrowserVisualIssue[];
} = {}) {
  const workspaceRoot = await tempWorkspace();
  return evaluateFullStackJourney({
    workspaceRoot,
    fixtureRoot,
    runId: overrides.runId ?? 'run-fullstack-1',
    goalId: 'goal-fullstack',
    mode: 'verification',
    journey: profileJourney(),
    browserPort: playwrightPort(),
    apiCapabilityId: 'browser-network',
    observedApiEvents: overrides.apiEvents ?? [apiEvent()],
    dataCapabilityId: 'data.readback',
    observedDataReadbacks: overrides.dataReadbacks ?? [dataReadback()],
    uiCapabilityId: 'browser-diagnostics',
    uiDiagnostics: {
      stateObservations: overrides.stateObservations ?? [uiState()],
      consoleIssues: overrides.consoleIssues ?? [],
      networkIssues: overrides.networkIssues ?? [],
      visualIssues: overrides.visualIssues ?? [],
      checkedViewports: [viewport()],
      requiredViewports: ['desktop'],
      uxCapability: {
        capabilityId: 'ui-ux-pro-max',
        state: 'available',
        reason: 'fake fixture coverage',
      },
    },
    generatedAt: now,
    verifier: {
      command: 'npm run test:fullstack',
      exitCode: 0,
    },
  });
}

describe('full-stack journey fixtures', () => {
  it('keeps a runnable fullstack-app fixture in the expected journey location', async () => {
    await expect(readFile(join(fixtureRoot, 'package.json'), 'utf8')).resolves.toContain('curdx-fullstack-fixture');
    await expect(readFile(join(fixtureRoot, 'scripts/run-journey.mjs'), 'utf8')).resolves.toContain('profile-save');
  });

  it('produces L3 full-stack evidence and a complete verdict for the happy path', async () => {
    const result = await runJourney();

    expect(result.ok).toBe(true);
    expect(result.verdict.verdict).toBe('complete');
    expect(result.state).toMatchObject({
      status: 'complete',
      verdictStatus: 'complete',
      evidenceIds: expect.arrayContaining([
        'browser-run-fullstack-1-profile-save',
        'api-run-fullstack-1-profile-save',
        'data-run-fullstack-1-profile-save',
      ]),
    });
    expect(result.evidence.map((entry) => entry.source)).toEqual(expect.arrayContaining(['browser', 'api', 'data']));
    expect(result.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'browser', status: 'passed', trustLevel: 'verified' }),
      expect.objectContaining({ source: 'api', status: 'passed', trustLevel: 'verified' }),
      expect.objectContaining({ source: 'data', status: 'passed', trustLevel: 'verified' }),
    ]));
    expect(result.verdict.evidenceRefs).toEqual(expect.arrayContaining([
      'browser-run-fullstack-1-profile-save',
      'api-run-fullstack-1-profile-save',
      'data-run-fullstack-1-profile-save',
    ]));
    expect(result.artifactIndex.map((entry) => entry.type)).toEqual(expect.arrayContaining(['screenshot', 'trace']));
    expect(result.report.json.status).toBe('passed');
    expect(result.report.json.evidenceSummaries.some((entry) => entry.artifactRefs.includes('profile-save-screenshot'))).toBe(true);
  });

  it('marks mock and fixture-backed paths degraded and never complete', async () => {
    const result = await runJourney({
      runId: 'run-fullstack-mock',
      apiEvents: [apiEvent({ source: 'mock', responseSummary: '200 fixture response' })],
      dataReadbacks: [dataReadback({ source: 'fixture', createdBy: 'fixture', observedSummary: 'fixture row contains Ada Lovelace' })],
    });

    expect(result.ok).toBe(false);
    expect(result.verdict.verdict).not.toBe('complete');
    expect(result.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'api', status: 'degraded', trustLevel: 'degraded' }),
      expect.objectContaining({ source: 'data', status: 'degraded', trustLevel: 'degraded' }),
    ]));
    expect(result.report.json.status).not.toBe('passed');
    expect(JSON.stringify(result.verdict)).toContain('degraded');
  });

  it('keeps browser evidence visible when the page opens but API verification fails', async () => {
    const result = await runJourney({
      runId: 'run-fullstack-api-failure',
      apiEvents: [apiEvent({ status: 500, responseSummary: '500 {"error":"database unavailable"}' })],
      dataReadbacks: [],
    });

    expect(result.ok).toBe(false);
    expect(result.verdict.verdict).not.toBe('complete');
    expect(result.browser.status).toBe('passed');
    expect(result.api.status).toBe('failed');
    expect(result.report.json.evidenceSummaries).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'browser', status: 'passed' }),
      expect.objectContaining({ source: 'api', status: 'failed' }),
    ]));
    expect(result.report.markdown).toContain('api-status-mismatch');
  });

  it('blocks completion when API succeeds but data readback does not close UI/API/data', async () => {
    const result = await runJourney({
      runId: 'run-fullstack-data-failure',
      dataReadbacks: [dataReadback({ consistent: false, observedSummary: 'GET /api/profile returned profile.name=Grace Hopper' })],
    });

    expect(result.ok).toBe(false);
    expect(result.verdict.verdict).not.toBe('complete');
    expect(result.api.status).toBe('passed');
    expect(result.data.status).toBe('failed');
    expect(result.report.markdown).toContain('data-readback-mismatch');
    expect(result.report.json.status).toBe('blocked');
  });

  it('reflects console, network, and visual failures in report and final verdict', async () => {
    const result = await runJourney({
      runId: 'run-fullstack-ui-failure',
      consoleIssues: [{
        actionId: 'submit-profile',
        level: 'error',
        severity: 'high',
        message: 'Uncaught TypeError while rendering saved profile',
        evidenceRefs: ['profile-save-trace'],
      }],
      networkIssues: [{
        actionId: 'submit-profile',
        method: 'GET',
        url: 'http://127.0.0.1:4173/api/audit',
        status: 503,
        severity: 'high',
        failureSummary: 'GET /api/audit failed with 503',
        evidenceRefs: ['profile-save-trace'],
      }],
      visualIssues: [{
        actionId: 'submit-profile',
        type: 'overlap',
        severity: 'high',
        summary: 'Saved toast overlaps submit button on desktop',
        viewport: 'desktop',
        evidenceRefs: ['profile-save-screenshot'],
      }],
    });

    expect(result.ok).toBe(false);
    expect(result.verdict.verdict).not.toBe('complete');
    expect(result.ui.status).toBe('failed');
    expect(result.report.markdown).toContain('ui-console-error');
    expect(result.report.markdown).toContain('ui-network-failure');
    expect(result.report.markdown).toContain('ui-visual-overlap');
    expect(result.artifactIndex.map((entry) => entry.id)).toContain('profile-save-screenshot');
  });
});
