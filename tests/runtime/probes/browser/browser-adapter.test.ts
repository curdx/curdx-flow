import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  executeBrowserJourney,
  type BrowserAutomationPort,
} from '../../../../src/runtime/adapters/browser/index.ts';
import type { UserJourney } from '../../../../src/runtime/planner/index.ts';

const now = '2026-05-17T13:30:00.000Z';
const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })));
});

async function tempWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), 'curdx-browser-adapter-'));
  workspaces.push(workspace);
  return workspace;
}

function profileJourney(): UserJourney {
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
      { id: 'edit-name', type: 'fill', target: 'input[name="name"]', value: 'Ada Lovelace', description: 'Change display name', allowedInReportOnly: false, executes: false },
      { id: 'submit-profile', type: 'click', target: 'button[type="submit"]', description: 'Save profile', allowedInReportOnly: false, executes: false },
    ],
    expectedUi: [
      { actionId: 'submit-profile', state: 'success', assertion: 'Profile page shows Saved and the new display name' },
    ],
    expectedApi: [
      { actionId: 'submit-profile', method: 'PATCH', urlPattern: '/api/profile', expectedStatus: 200 },
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

function playwrightPort(): BrowserAutomationPort {
  return {
    capabilityId: 'playwright',
    capabilityKind: 'playwright',
    async execute(input) {
      return {
        status: 'passed',
        visitedUrl: input.journey.entry.url,
        command: {
          executable: 'npx',
          argv: ['playwright', 'test', 'profile-save.spec.ts'],
          exitCode: 0,
          stdoutSummary: '1 passed',
          stderrSummary: '',
          durationMs: 42,
        },
        actions: input.journey.actions.map((action) => ({
          actionId: action.id,
          actionType: action.type,
          status: 'passed',
          url: input.journey.entry.url,
          pageState: action.id === 'submit-profile' ? 'success-after-submit' : 'ready',
          durationMs: 5,
        })),
        artifacts: [
          {
            id: 'profile-save-screenshot',
            type: 'screenshot',
            summary: 'Profile save success screenshot',
            content: 'fake png bytes',
            quality: { status: 'usable', supportsEvidence: true, reason: 'Covers the changed profile form.' },
          },
          {
            id: 'profile-save-trace',
            type: 'trace',
            summary: 'Profile save rerunnable trace',
            content: 'fake trace zip bytes',
            quality: { status: 'usable', supportsEvidence: true, reason: 'Contains the full journey.' },
          },
        ],
        diagnostics: [],
        durationMs: 60,
      };
    },
  };
}

describe('browser adapter execution', () => {
  it('produces verified Playwright browser evidence with screenshot and trace artifacts', async () => {
    const workspaceRoot = await tempWorkspace();
    const result = await executeBrowserJourney({
      workspaceRoot,
      runId: 'run-browser-1',
      goalId: 'goal-browser',
      mode: 'verification',
      journey: profileJourney(),
      port: playwrightPort(),
      generatedAt: now,
    });

    expect(result).toMatchObject({
      ok: true,
      status: 'passed',
      capabilityId: 'playwright',
      command: {
        executable: 'npx',
        argv: ['playwright', 'test', 'profile-save.spec.ts'],
        exitCode: 0,
      },
    });
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]).toMatchObject({
      runId: 'run-browser-1',
      goalId: 'goal-browser',
      source: 'browser',
      capabilityId: 'playwright',
      trustLevel: 'verified',
      status: 'passed',
      journeyId: 'profile-save',
      actionIds: ['open-profile', 'edit-name', 'submit-profile'],
    });
    expect(result.artifacts.map((artifact) => artifact.type)).toEqual(expect.arrayContaining(['screenshot', 'trace']));
    expect(result.artifacts.every((artifact) => !artifact.path.startsWith('/'))).toBe(true);
    expect(result.artifacts.every((artifact) => artifact.privacy?.classification === 'local-only')).toBe(true);
    await access(join(workspaceRoot, result.artifacts.find((artifact) => artifact.type === 'screenshot')?.path ?? 'missing'));
    await access(join(workspaceRoot, result.artifacts.find((artifact) => artifact.type === 'trace')?.path ?? 'missing'));
    await expect(readFile(join(workspaceRoot, result.artifacts[0]?.path ?? 'missing'), 'utf8')).resolves.toContain('fake');
  });

  it('marks Chrome DevTools MCP results as degraded live diagnostics, not rerunnable Playwright evidence', async () => {
    const workspaceRoot = await tempWorkspace();
    const port: BrowserAutomationPort = {
      capabilityId: 'chrome-devtools-mcp',
      capabilityKind: 'chrome-devtools-mcp',
      async execute(input) {
        return {
          status: 'passed',
          visitedUrl: input.journey.entry.url,
          actions: input.journey.actions.map((action) => ({
            actionId: action.id,
            actionType: action.type,
            status: 'passed',
            url: input.journey.entry.url,
            pageState: 'observed-live-browser',
          })),
          artifacts: [{
            id: 'live-screenshot',
            type: 'screenshot',
            summary: 'Live browser screenshot',
            content: 'live browser image',
            quality: { status: 'usable', supportsEvidence: true, reason: 'Live diagnostic only.' },
          }],
          diagnostics: [],
          durationMs: 25,
        };
      },
    };

    const result = await executeBrowserJourney({
      workspaceRoot,
      runId: 'run-browser-2',
      goalId: 'goal-browser',
      mode: 'verification',
      journey: profileJourney(),
      port,
      generatedAt: now,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('degraded');
    expect(result.evidence[0]).toMatchObject({
      capabilityId: 'chrome-devtools-mcp',
      trustLevel: 'degraded',
      status: 'degraded',
    });
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'browser-live-diagnostic-not-rerunnable' }),
    ]));
  });

  it('returns an actionable blocker when the page cannot be opened', async () => {
    const workspaceRoot = await tempWorkspace();
    const port: BrowserAutomationPort = {
      capabilityId: 'playwright',
      capabilityKind: 'playwright',
      async execute(input) {
        return {
          status: 'blocked',
          visitedUrl: input.journey.entry.url,
          actions: [{
            actionId: 'open-profile',
            actionType: 'navigate',
            status: 'blocked',
            url: input.journey.entry.url,
            error: 'ECONNREFUSED 127.0.0.1:3000',
            failureCode: 'page-open-failed',
          }],
          artifacts: [],
          diagnostics: [{ code: 'page-open-failed', message: 'Page did not open.' }],
          durationMs: 10,
        };
      },
    };

    const result = await executeBrowserJourney({
      workspaceRoot,
      runId: 'run-browser-3',
      goalId: 'goal-browser',
      mode: 'verification',
      journey: profileJourney(),
      port,
      generatedAt: now,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'page-open-failed',
        category: 'browser',
        url: 'http://127.0.0.1:3000/profile',
        actionId: 'open-profile',
        owner: 'agent',
        riskLevel: 'high',
        nextAction: expect.objectContaining({ summary: expect.stringContaining('Start or fix the target service') }),
      }),
    ]));
  });

  it('returns an actionable blocker when a planned action times out', async () => {
    const workspaceRoot = await tempWorkspace();
    const port: BrowserAutomationPort = {
      capabilityId: 'playwright',
      capabilityKind: 'playwright',
      async execute(input) {
        return {
          status: 'blocked',
          visitedUrl: input.journey.entry.url,
          actions: [
            { actionId: 'open-profile', actionType: 'navigate', status: 'passed', url: input.journey.entry.url },
            {
              actionId: 'edit-name',
              actionType: 'fill',
              status: 'blocked',
              url: input.journey.entry.url,
              error: 'Timeout 5000ms waiting for input[name="name"]',
              failureCode: 'action-timeout',
            },
          ],
          artifacts: [],
          diagnostics: [{ code: 'action-timeout', message: 'Selector timed out.' }],
          durationMs: 5000,
        };
      },
    };

    const result = await executeBrowserJourney({
      workspaceRoot,
      runId: 'run-browser-4',
      goalId: 'goal-browser',
      mode: 'verification',
      journey: profileJourney(),
      port,
      generatedAt: now,
    });

    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'action-timeout',
        actionId: 'edit-name',
        attemptedActions: expect.arrayContaining(['open-profile', 'edit-name']),
        availableFallbacks: expect.arrayContaining(['chrome-devtools-mcp', 'chrome-runtime']),
      }),
    ]));
  });

  it('degrades blank screenshots so they cannot support successful browser evidence', async () => {
    const workspaceRoot = await tempWorkspace();
    const port: BrowserAutomationPort = {
      capabilityId: 'playwright',
      capabilityKind: 'playwright',
      async execute(input) {
        return {
          status: 'passed',
          visitedUrl: input.journey.entry.url,
          actions: input.journey.actions.map((action) => ({
            actionId: action.id,
            actionType: action.type,
            status: 'passed',
            url: input.journey.entry.url,
          })),
          artifacts: [{
            id: 'blank-profile-screenshot',
            type: 'screenshot',
            summary: 'Blank white screenshot',
            content: '',
            quality: { status: 'blank', supportsEvidence: false, reason: 'Screenshot has no visible page content.' },
          }],
          diagnostics: [],
          durationMs: 20,
        };
      },
    };

    const result = await executeBrowserJourney({
      workspaceRoot,
      runId: 'run-browser-5',
      goalId: 'goal-browser',
      mode: 'verification',
      journey: profileJourney(),
      port,
      generatedAt: now,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('degraded');
    expect(result.evidence[0]?.status).toBe('degraded');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'artifact-quality-blank',
        actionId: 'profile-save',
        nextAction: expect.objectContaining({ summary: expect.stringContaining('Capture a new screenshot or trace') }),
      }),
    ]));
  });

  it('blocks unsafe artifact paths before writing them', async () => {
    const workspaceRoot = await tempWorkspace();
    const port: BrowserAutomationPort = {
      capabilityId: 'playwright',
      capabilityKind: 'playwright',
      async execute(input) {
        return {
          status: 'passed',
          visitedUrl: input.journey.entry.url,
          actions: input.journey.actions.map((action) => ({
            actionId: action.id,
            actionType: action.type,
            status: 'passed',
            url: input.journey.entry.url,
          })),
          artifacts: [{
            id: 'unsafe-screenshot',
            type: 'screenshot',
            path: '../escape.png',
            summary: 'Unsafe screenshot path',
            content: 'unsafe',
            quality: { status: 'usable', supportsEvidence: true, reason: 'Would be usable if the path were safe.' },
          }],
          diagnostics: [],
          durationMs: 20,
        };
      },
    };

    const result = await executeBrowserJourney({
      workspaceRoot,
      runId: 'run-browser-6',
      goalId: 'goal-browser',
      mode: 'verification',
      journey: profileJourney(),
      port,
      generatedAt: now,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.artifacts).toEqual([]);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'artifact-path-unsafe', category: 'browser' }),
    ]));
  });

  it('blocks artifact paths that are relative but outside the run artifact directory', async () => {
    const workspaceRoot = await tempWorkspace();
    const port: BrowserAutomationPort = {
      capabilityId: 'playwright',
      capabilityKind: 'playwright',
      async execute(input) {
        return {
          status: 'passed',
          visitedUrl: input.journey.entry.url,
          actions: input.journey.actions.map((action) => ({
            actionId: action.id,
            actionType: action.type,
            status: 'passed',
            url: input.journey.entry.url,
          })),
          artifacts: [{
            id: 'overwrite-package',
            type: 'screenshot',
            path: 'package.json',
            summary: 'Relative but unsafe target',
            content: 'do not write here',
            quality: { status: 'usable', supportsEvidence: true, reason: 'Path is the problem.' },
          }],
          diagnostics: [],
          durationMs: 20,
        };
      },
    };

    const result = await executeBrowserJourney({
      workspaceRoot,
      runId: 'run-browser-7',
      goalId: 'goal-browser',
      mode: 'verification',
      journey: profileJourney(),
      port,
      generatedAt: now,
    });

    expect(result.status).toBe('blocked');
    expect(result.artifacts).toEqual([]);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'artifact-path-unsafe',
        message: expect.stringContaining('.curdx/artifacts/run-browser-7'),
      }),
    ]));
    await expect(access(join(workspaceRoot, 'package.json'))).rejects.toThrow();
  });

  it('blocks passed port results that omit planned journey actions', async () => {
    const workspaceRoot = await tempWorkspace();
    const port: BrowserAutomationPort = {
      capabilityId: 'playwright',
      capabilityKind: 'playwright',
      async execute(input) {
        return {
          status: 'passed',
          visitedUrl: input.journey.entry.url,
          actions: [{
            actionId: 'open-profile',
            actionType: 'navigate',
            status: 'passed',
            url: input.journey.entry.url,
          }],
          artifacts: [{
            id: 'partial-screenshot',
            type: 'screenshot',
            summary: 'Only navigation was captured',
            content: 'partial',
            quality: { status: 'usable', supportsEvidence: true, reason: 'Navigation only.' },
          }],
          diagnostics: [],
          durationMs: 20,
        };
      },
    };

    const result = await executeBrowserJourney({
      workspaceRoot,
      runId: 'run-browser-8',
      goalId: 'goal-browser',
      mode: 'verification',
      journey: profileJourney(),
      port,
      generatedAt: now,
    });

    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'browser-action-missing', actionId: 'edit-name' }),
      expect.objectContaining({ code: 'browser-action-missing', actionId: 'submit-profile' }),
    ]));
  });

  it('blocks report-only execution before calling the port when planned actions are not report-only safe', async () => {
    const workspaceRoot = await tempWorkspace();
    let called = false;
    const port: BrowserAutomationPort = {
      capabilityId: 'playwright',
      capabilityKind: 'playwright',
      async execute() {
        called = true;
        throw new Error('report-only should not execute unsafe actions');
      },
    };

    const result = await executeBrowserJourney({
      workspaceRoot,
      runId: 'run-browser-9',
      goalId: 'goal-browser',
      mode: 'report-only',
      journey: profileJourney(),
      port,
      generatedAt: now,
    });

    expect(called).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'report-only-browser-action-disallowed', actionId: 'edit-name' }),
      expect.objectContaining({ code: 'report-only-browser-action-disallowed', actionId: 'submit-profile' }),
    ]));
  });
});
