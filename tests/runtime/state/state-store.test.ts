import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { RuntimeSession, StateLedger } from '../../../src/runtime/contracts/index.ts';
import {
  buildResumeContext,
  captureDirtyBaseline,
  classifyGeneratedFiles,
  createRunState,
  createSessionState,
  readRunState,
  readSessionState,
  resolveStatePaths,
  updateRunState,
} from '../../../src/runtime/state/index.ts';

const workspaces: string[] = [];

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), 'curdx-state-'));
  workspaces.push(workspace);
  return workspace;
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })));
});

function dirtyBaseline() {
  return {
    capturedAt: '2026-05-17T00:30:00.000Z',
    files: [
      {
        path: 'src/app.ts',
        status: 'modified',
        source: 'user-existing',
      },
    ],
  };
}

function runState(overrides: Partial<StateLedger> = {}): StateLedger {
  return {
    schemaVersion: 1,
    runId: 'run-1',
    goalId: 'goal-1',
    workspaceRoot: '/workspace',
    mode: 'fix',
    policy: {
      noFalseCompletion: true,
    },
    scope: {
      summary: 'state story',
    },
    expectedJourney: {
      summary: 'recover current run',
    },
    status: 'running',
    verdictStatus: 'partial',
    phase: 'state',
    startedAt: '2026-05-17T00:30:00.000Z',
    updatedAt: '2026-05-17T00:31:00.000Z',
    evidenceIds: ['ev-command-1'],
    missingEvidence: ['browser evidence'],
    artifactIndexPath: '.curdx/artifacts/index.jsonl',
    dirtyBaseline: dirtyBaseline(),
    generatedFiles: [
      {
        path: '.curdx/evidence/run-1.jsonl',
        category: 'evidence',
        owner: 'curdx-flow',
        createdAt: '2026-05-17T00:30:05.000Z',
        relatedRunId: 'run-1',
      },
    ],
    nextAction: {
      owner: 'dev',
      summary: 'run state tests',
    },
    ...overrides,
  };
}

function session(overrides: Partial<RuntimeSession> = {}): RuntimeSession {
  return {
    schemaVersion: 1,
    sessionId: 'session-1',
    runId: 'run-1',
    goalId: 'goal-1',
    status: 'active',
    currentStep: 'state',
    resumeSummary: 'Continue by restoring run state.',
    checkpoints: [],
    missingEvidence: ['browser evidence'],
    startedAt: '2026-05-17T00:30:00.000Z',
    updatedAt: '2026-05-17T00:31:00.000Z',
    nextAction: {
      owner: 'dev',
      summary: 'run state tests',
    },
    ...overrides,
  };
}

describe('runtime state store', () => {
  it('creates and reads workspace-local run state while preserving unknown fields', async () => {
    const workspaceRoot = await createWorkspace();
    const state = runState({ workspaceRoot, futureTopLevelField: { kept: true } });

    await expect(createRunState({ workspaceRoot, state })).resolves.toMatchObject({
      ok: true,
      statePath: expect.stringContaining('/.curdx/state/runs/run-1.json'),
    });

    const paths = resolveStatePaths({ workspaceRoot, runId: 'run-1', sessionId: 'session-1' });
    expect(paths.runStatePath.startsWith(`${workspaceRoot}/.curdx/state/runs/`)).toBe(true);

    const result = await readRunState({ workspaceRoot, runId: 'run-1' });
    expect(result).toMatchObject({
      ok: true,
      state: expect.objectContaining({
        runId: 'run-1',
        futureTopLevelField: { kept: true },
      }),
    });
  });

  it('migrates legacy state while preserving unknown fields', async () => {
    const workspaceRoot = await createWorkspace();
    const paths = resolveStatePaths({ workspaceRoot, runId: 'run-legacy', sessionId: 'session-1' });
    await mkdir(dirname(paths.runStatePath), { recursive: true });
    await writeFile(
      paths.runStatePath,
      JSON.stringify({
        schemaVersion: 0,
        runId: 'run-legacy',
        goalId: 'goal-1',
        workspaceRoot,
        mode: 'fix',
        policy: {},
        scope: {},
        expectedJourney: {},
        status: 'running',
        phase: 'legacy',
        startedAt: '2026-05-17T00:30:00.000Z',
        updatedAt: '2026-05-17T00:31:00.000Z',
        evidenceIds: [],
        artifactIndexPath: '.curdx/artifacts/index.jsonl',
        dirtyBaseline: {
          futureNestedField: { kept: true },
          files: [
            {
              path: 'src/legacy.ts',
              status: 'modified',
              source: 'user-existing',
            },
          ],
        },
        generatedFiles: [
          {
            path: '.curdx/reports/legacy.md',
            category: 'report',
            owner: 'curdx-flow',
          },
        ],
        nextAction: {},
        legacyUnknown: { kept: true },
      }),
      'utf8',
    );

    const result = await readRunState({ workspaceRoot, runId: 'run-legacy' });

    expect(result).toMatchObject({
      ok: true,
      migrated: true,
      state: expect.objectContaining({
        schemaVersion: 1,
        legacyUnknown: { kept: true },
        dirtyBaseline: expect.objectContaining({
          capturedAt: '2026-05-17T00:31:00.000Z',
          futureNestedField: { kept: true },
          files: [expect.objectContaining({ path: 'src/legacy.ts' })],
        }),
        generatedFiles: [
          expect.objectContaining({
            path: '.curdx/reports/legacy.md',
            createdAt: '2026-05-17T00:31:00.000Z',
            relatedRunId: 'run-legacy',
          }),
        ],
      }),
    });
  });

  it('blocks unsupported future state versions instead of downgrading them', async () => {
    const workspaceRoot = await createWorkspace();
    const paths = resolveStatePaths({ workspaceRoot, runId: 'run-future', sessionId: 'session-future' });
    await mkdir(dirname(paths.runStatePath), { recursive: true });
    await writeFile(paths.runStatePath, JSON.stringify(runState({ workspaceRoot, runId: 'run-future', schemaVersion: 999 as 1 })), 'utf8');
    await mkdir(dirname(paths.sessionStatePath as string), { recursive: true });
    await writeFile(
      paths.sessionStatePath as string,
      JSON.stringify(session({ sessionId: 'session-future', schemaVersion: 999 as 1 })),
      'utf8',
    );

    await expect(readRunState({ workspaceRoot, runId: 'run-future' })).resolves.toMatchObject({
      ok: false,
      status: 'blocked',
      issues: [expect.objectContaining({ code: 'unsupported-schema-version' })],
    });
    await expect(readSessionState({ workspaceRoot, sessionId: 'session-future' })).resolves.toMatchObject({
      ok: false,
      status: 'blocked',
      issues: [expect.objectContaining({ code: 'unsupported-schema-version' })],
    });
  });

  it('blocks recovery when state or session ids do not match the requested file identity', async () => {
    const workspaceRoot = await createWorkspace();
    const paths = resolveStatePaths({ workspaceRoot, runId: 'run-1', sessionId: 'session-1' });
    await mkdir(dirname(paths.runStatePath), { recursive: true });
    await writeFile(paths.runStatePath, JSON.stringify(runState({ workspaceRoot, runId: 'run-2' })), 'utf8');
    await mkdir(dirname(paths.sessionStatePath as string), { recursive: true });
    await writeFile(paths.sessionStatePath as string, JSON.stringify(session({ sessionId: 'session-2' })), 'utf8');

    await expect(readRunState({ workspaceRoot, runId: 'run-1' })).resolves.toMatchObject({
      ok: false,
      status: 'blocked',
      issues: [expect.objectContaining({ path: '$.runId', code: 'invalid-pattern' })],
    });
    await expect(readSessionState({ workspaceRoot, sessionId: 'session-1' })).resolves.toMatchObject({
      ok: false,
      status: 'blocked',
      issues: [expect.objectContaining({ path: '$.sessionId', code: 'invalid-pattern' })],
    });
  });

  it('migrates legacy session state while preserving unknown fields', async () => {
    const workspaceRoot = await createWorkspace();
    const paths = resolveStatePaths({ workspaceRoot, runId: 'run-1', sessionId: 'session-legacy' });
    await mkdir(dirname(paths.sessionStatePath as string), { recursive: true });
    await writeFile(
      paths.sessionStatePath as string,
      JSON.stringify({
        schemaVersion: 0,
        sessionId: 'session-legacy',
        runId: 'run-1',
        goalId: 'goal-1',
        status: 'active',
        currentStep: 'legacy-session',
        resumeSummary: 'Resume from legacy session.',
        checkpoints: [],
        startedAt: '2026-05-17T00:30:00.000Z',
        updatedAt: '2026-05-17T00:31:00.000Z',
        nextAction: {},
        legacyUnknown: { kept: true },
      }),
      'utf8',
    );

    const result = await readSessionState({ workspaceRoot, sessionId: 'session-legacy' });

    expect(result).toMatchObject({
      ok: true,
      migrated: true,
      session: expect.objectContaining({
        schemaVersion: 1,
        legacyUnknown: { kept: true },
        missingEvidence: [],
      }),
    });
  });

  it('returns a recovery blocker for malformed state instead of continuing', async () => {
    const workspaceRoot = await createWorkspace();
    const paths = resolveStatePaths({ workspaceRoot, runId: 'run-1', sessionId: 'session-1' });
    await mkdir(dirname(paths.runStatePath), { recursive: true });
    await writeFile(paths.runStatePath, '{not-json', 'utf8');

    await expect(readRunState({ workspaceRoot, runId: 'run-1' })).resolves.toMatchObject({
      ok: false,
      status: 'blocked',
      recoveryReport: expect.objectContaining({
        summary: expect.stringContaining('malformed'),
      }),
      issues: [expect.objectContaining({ code: 'invalid-json' })],
    });
  });

  it('turns state read failures into structured recovery blockers', async () => {
    const workspaceRoot = await createWorkspace();
    const result = await readRunState({
      workspaceRoot,
      runId: 'run-1',
      io: {
        readFile: async () => {
          const err = new Error('permission denied') as NodeJS.ErrnoException;
          err.code = 'EACCES';
          throw err;
        },
      },
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'blocked',
      recoveryReport: expect.objectContaining({
        summary: expect.stringContaining('malformed or unreadable'),
      }),
      issues: [expect.objectContaining({ code: 'invalid-read' })],
    });
  });

  it('creates sessions and builds resume context from state plus session data', async () => {
    const workspaceRoot = await createWorkspace();
    await createRunState({ workspaceRoot, state: runState({ workspaceRoot }) });
    await createSessionState({ workspaceRoot, session: session() });

    const loadedState = await readRunState({ workspaceRoot, runId: 'run-1' });
    const loadedSession = await readSessionState({ workspaceRoot, sessionId: 'session-1' });
    expect(loadedState).toMatchObject({ ok: true });
    expect(loadedSession).toMatchObject({ ok: true });

    if (loadedState.ok && loadedSession.ok) {
      expect(buildResumeContext(loadedState.state, loadedSession.session)).toMatchObject({
        currentStep: 'state',
        verifiedEvidenceIds: ['ev-command-1'],
        missingEvidence: ['browser evidence'],
        nextAction: {
          owner: 'dev',
        },
      });
    }
  });

  it('keeps user-existing dirty files distinct from generated files', () => {
    const baseline = captureDirtyBaseline({
      capturedAt: '2026-05-17T00:30:00.000Z',
      files: [{ path: 'src/app.ts', status: 'modified' }],
    });

    const classified = classifyGeneratedFiles({
      dirtyBaseline: baseline,
      files: [
        { path: 'src/app.ts', category: 'source-change', owner: 'curdx-flow' },
        { path: '.curdx/reports/run-1.report.md', category: 'report', owner: 'curdx-flow' },
      ],
      createdAt: '2026-05-17T00:31:00.000Z',
      runId: 'run-1',
    });

    expect(classified).toEqual([
      expect.objectContaining({ path: 'src/app.ts', category: 'user-existing-file' }),
      expect.objectContaining({ path: '.curdx/reports/run-1.report.md', category: 'report' }),
    ]);
  });

  it('keeps an explicit same-path generated change distinct from the dirty baseline', () => {
    const baseline = captureDirtyBaseline({
      capturedAt: '2026-05-17T00:30:00.000Z',
      files: [{ path: 'src/app.ts', status: 'modified' }],
    });

    const classified = classifyGeneratedFiles({
      dirtyBaseline: baseline,
      files: [
        {
          path: 'src/app.ts',
          category: 'source-change',
          owner: 'curdx-flow',
          userExistingChangeReason: 'user approved applying a fix to the pre-existing dirty file',
        },
      ],
      createdAt: '2026-05-17T00:31:00.000Z',
      runId: 'run-1',
    });

    expect(classified).toEqual([
      expect.objectContaining({
        path: 'src/app.ts',
        category: 'source-change',
        userExistingChangeReason: expect.stringContaining('approved'),
      }),
    ]);
  });

  it('returns structured write failure and preserves old state bytes', async () => {
    const workspaceRoot = await createWorkspace();
    const paths = resolveStatePaths({ workspaceRoot, runId: 'run-1', sessionId: 'session-1' });
    const existing = `${JSON.stringify(runState({ workspaceRoot, phase: 'old' }))}\n`;
    await mkdir(dirname(paths.runStatePath), { recursive: true });
    await writeFile(paths.runStatePath, existing, 'utf8');

    const result = await updateRunState({
      workspaceRoot,
      state: runState({ workspaceRoot, phase: 'new' }),
      io: {
        rename: async () => {
          throw new Error('rename failed');
        },
      },
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'blocked',
      issues: [expect.objectContaining({ code: 'invalid-write' })],
    });
    expect(readFileSync(paths.runStatePath, 'utf8')).toBe(existing);
  });

  it('turns mkdir and temp write failures into structured blockers without corrupting old state', async () => {
    const workspaceRoot = await createWorkspace();
    const paths = resolveStatePaths({ workspaceRoot, runId: 'run-1', sessionId: 'session-1' });
    const existing = `${JSON.stringify(runState({ workspaceRoot, phase: 'old' }))}\n`;
    await mkdir(dirname(paths.runStatePath), { recursive: true });
    await writeFile(paths.runStatePath, existing, 'utf8');

    await expect(
      updateRunState({
        workspaceRoot,
        state: runState({ workspaceRoot, phase: 'new' }),
        io: {
          mkdir: async () => {
            throw new Error('mkdir failed');
          },
        },
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 'blocked',
      issues: [expect.objectContaining({ code: 'invalid-write' })],
    });
    expect(readFileSync(paths.runStatePath, 'utf8')).toBe(existing);

    await expect(
      updateRunState({
        workspaceRoot,
        state: runState({ workspaceRoot, phase: 'new' }),
        io: {
          writeFile: async () => {
            throw new Error('write failed');
          },
        },
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 'blocked',
      issues: [expect.objectContaining({ code: 'invalid-write' })],
    });
    expect(readFileSync(paths.runStatePath, 'utf8')).toBe(existing);
  });

  it('rejects workspace escaping state paths', async () => {
    const workspaceRoot = await createWorkspace();

    expect(() =>
      resolveStatePaths({
        workspaceRoot,
        runId: 'run-1',
        sessionId: 'session-1',
        runStateRelativePath: '../state.json',
      }),
    ).toThrow(/Unsafe/);
  });
});
