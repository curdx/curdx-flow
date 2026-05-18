import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { createServer } from 'node:net';
import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';

import {
  evaluateRuntimeReadiness,
  renderRuntimeReadinessReport,
  type RuntimeReadinessFixtureExpectation,
} from '../../../src/runtime/readiness/index.ts';
import { readArtifactIndex, readEvidenceLedger } from '../../../src/runtime/evidence/index.ts';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fixtureRoot = join(repoRoot, 'tests/fixtures/runtime-readiness');
const workspaces: string[] = [];
type UserProcess = ChildProcessByStdio<null, Readable, Readable>;
const userProcesses: UserProcess[] = [];

async function createWorkspaceFromFixture(name: string): Promise<{ workspace: string; expected: RuntimeReadinessFixtureExpectation }> {
  const workspace = await mkdtemp(join(tmpdir(), `curdx-readiness-${name}-`));
  workspaces.push(workspace);
  const source = join(fixtureRoot, name);
  for (const entry of await readdir(source)) {
    await cp(join(source, entry), join(workspace, entry), { recursive: true });
  }
  const expected = JSON.parse(await readFile(join(workspace, 'expected-readiness.json'), 'utf8')) as RuntimeReadinessFixtureExpectation;
  return { workspace, expected };
}

async function getFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  await new Promise<void>((resolveClose, reject) => server.close((err) => err ? reject(err) : resolveClose()));
  if (!address || typeof address === 'string') throw new Error('Failed to allocate test port');
  return address.port;
}

async function startUserServer(port: number): Promise<UserProcess> {
  const child = spawn(process.execPath, ['-e', [
    "const http = require('node:http');",
    "const server = http.createServer((_req, res) => { res.statusCode = 200; res.end('user-existing'); });",
    `server.listen(${port}, '127.0.0.1', () => console.log('READY:${port}'));`,
    "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
  ].join('')], {
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  userProcesses.push(child);
  await new Promise<void>((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for user server')), 2_000);
    child.stdout.on('data', (chunk: Buffer) => {
      if (chunk.toString('utf8').includes(`READY:${port}`)) {
        clearTimeout(timer);
        resolveReady();
      }
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  return child;
}

async function stopProcess(child: UserProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise<void>((resolveClose) => child.once('close', () => resolveClose()));
  child.kill('SIGTERM');
  await Promise.race([
    closed,
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1_000)),
  ]);
}

async function expectProcessAlive(pid: number): Promise<void> {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  expect(() => process.kill(pid, 0)).not.toThrow();
}

afterEach(async () => {
  await Promise.all(userProcesses.splice(0).map((child) => stopProcess(child)));
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })));
});

describe('runtime readiness fixtures and blocker reports', () => {
  it('runs a frontend fixture through discovery, command detection, service health, evidence, and artifact lifecycle', async () => {
    const { workspace, expected } = await createWorkspaceFromFixture('frontend-app');
    const port = await getFreePort();

    const result = await evaluateRuntimeReadiness({
      workspaceRoot: workspace,
      fixtureName: expected.name,
      generatedAt: '2026-05-17T12:00:00.000Z',
      runId: 'run-readiness-frontend',
      goalId: 'goal-readiness',
      writeEvidence: true,
      serviceOverrides: [
        {
          root: '.',
          purpose: 'dev',
          id: 'frontend',
          role: 'frontend',
          cwd: workspace,
          command: { executable: process.execPath, argv: ['scripts/fake-server.mjs'] },
          env: { PORT: String(port), RESPONSE: 'frontend-ready' },
          ports: [{ host: '127.0.0.1', port, protocol: 'http', target: `http://127.0.0.1:${port}/` }],
          healthCheck: {
            kind: 'http',
            target: `http://127.0.0.1:${port}/`,
            confidence: 0.95,
            timeoutMs: 2_000,
            intervalMs: 25,
          },
        },
      ],
    });

    expect(result.status).toBe(expected.expectedStatus);
    expect(result.topology.overallType).toBe(expected.expectedTopology.overallType);
    expect(result.commandPlan.commands.map((command) => command.purpose)).toEqual(expect.arrayContaining(expected.expectedCommands));
    expect(result.services?.services.frontend?.record).toMatchObject({
      startupMode: 'cold-started',
      ownership: 'curdx-started',
      cleanupStatus: 'success',
    });
    expect(result.services?.services.frontend?.health).toMatchObject({ status: 'passed', trustLevel: 'verified' });
    expect(result.evidence.evidence).toEqual([
      expect.objectContaining({
        source: 'service',
        trustLevel: 'verified',
        status: 'passed',
        capabilityId: 'runtime-readiness',
      }),
    ]);
    expect(result.evidence.writeResult).toMatchObject({ ok: true, evidenceId: 'ev-runtime-readiness-run-readiness-frontend' });

    await expect(readEvidenceLedger({ workspaceRoot: workspace, runId: 'run-readiness-frontend' })).resolves.toMatchObject({
      ok: true,
      entries: [expect.objectContaining({ id: 'ev-runtime-readiness-run-readiness-frontend' })],
    });
    await expect(readArtifactIndex({ workspaceRoot: workspace })).resolves.toMatchObject({
      ok: true,
      entries: [
        expect.objectContaining({ id: 'artifact-runtime-readiness-report-run-readiness-frontend', type: 'report' }),
        expect.objectContaining({ id: 'artifact-runtime-readiness-service-frontend', type: 'log' }),
      ],
    });
    const reportArtifact = await readFile(join(workspace, '.curdx/artifacts/readiness/run-readiness-frontend.md'), 'utf8');
    expect(reportArtifact).toContain('## Evidence');
    expect(reportArtifact).toContain('ev-runtime-readiness-run-readiness-frontend');
    expect(result.report).toContain('Runtime readiness: ready');
  });

  it('normalizes unknown project and dependency install failure into structured blocker reports', async () => {
    const { workspace, expected } = await createWorkspaceFromFixture('unknown-broken-app');

    const result = await evaluateRuntimeReadiness({
      workspaceRoot: workspace,
      fixtureName: expected.name,
      generatedAt: '2026-05-17T12:00:00.000Z',
      runId: 'run-readiness-blocked',
      goalId: 'goal-readiness',
      dependencyCheck: {
        id: 'dependency-install',
        root: '.',
        purpose: 'install',
        command: { executable: 'npm', argv: ['install'] },
        status: 'failed',
        exitCode: 1,
        summary: 'npm install failed with ERESOLVE in fixture preflight.',
        stderrWindow: 'ERESOLVE unable to resolve dependency tree',
        logArtifactPath: '.curdx/artifacts/commands/npm-install.log',
      },
    });

    expect(result.status).toBe('blocked');
    expect(result.blockers.map((blocker) => blocker.category)).toEqual(expect.arrayContaining(expected.expectedBlockerCategories ?? []));
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: 'dependency',
        message: expect.stringContaining('npm install failed'),
        reproduction: expect.objectContaining({
          command: 'npm',
          argv: ['install'],
          cwd: '.',
        }),
        attemptedActions: [expect.stringContaining('npm install')],
        nextAction: expect.objectContaining({
          owner: 'target-project',
          summary: expect.stringContaining('Fix dependency installation'),
        }),
        owner: 'target-project',
        riskLevel: 'high',
        evidenceRefs: ['command:dependency-install'],
      }),
      expect.objectContaining({
        category: 'topology',
        owner: 'user',
        riskLevel: 'medium',
      }),
    ]));
    expect(renderRuntimeReadinessReport(result)).toContain('ERESOLVE');
    expect(renderRuntimeReadinessReport(result)).toContain('Next action');
  });

  it('blocks user-existing port conflicts without killing the user process', async () => {
    const { workspace } = await createWorkspaceFromFixture('api-app');
    const port = await getFreePort();
    const userServer = await startUserServer(port);

    const result = await evaluateRuntimeReadiness({
      workspaceRoot: workspace,
      fixtureName: 'api-app',
      generatedAt: '2026-05-17T12:00:00.000Z',
      runId: 'run-readiness-port-conflict',
      goalId: 'goal-readiness',
      serviceOverrides: [
        {
          root: '.',
          purpose: 'dev',
          id: 'api',
          role: 'backend',
          env: { PORT: String(port) },
          ports: [{ host: '127.0.0.1', port, protocol: 'http', target: `http://127.0.0.1:${port}/` }],
          healthCheck: {
            kind: 'http',
            target: `http://127.0.0.1:${port}/`,
            confidence: 0.95,
            timeoutMs: 500,
            intervalMs: 25,
          },
        },
      ],
    });

    expect(result.status).toBe('blocked');
    expect(result.services?.portConflicts).toEqual([
      expect.objectContaining({ serviceId: 'api', owner: 'user-existing', resolution: 'blocked' }),
    ]);
    expect(result.blockers).toEqual([
      expect.objectContaining({
        category: 'port',
        owner: 'user',
        riskLevel: 'high',
        evidenceRefs: expect.arrayContaining(['service:api']),
      }),
    ]);
    expect(userServer.pid).toEqual(expect.any(Number));
    await expectProcessAlive(userServer.pid as number);
  });

  it('allows warm reuse only as reused service state with degraded evidence trust', async () => {
    const { workspace } = await createWorkspaceFromFixture('api-app');
    const port = await getFreePort();
    const userServer = await startUserServer(port);

    const result = await evaluateRuntimeReadiness({
      workspaceRoot: workspace,
      fixtureName: 'api-app',
      generatedAt: '2026-05-17T12:00:00.000Z',
      runId: 'run-readiness-warm-reuse',
      goalId: 'goal-readiness',
      allowReuseExisting: true,
      serviceOverrides: [
        {
          root: '.',
          purpose: 'dev',
          id: 'api',
          role: 'backend',
          env: { PORT: String(port) },
          ports: [{ host: '127.0.0.1', port, protocol: 'http', target: `http://127.0.0.1:${port}/` }],
          healthCheck: {
            kind: 'http',
            target: `http://127.0.0.1:${port}/`,
            confidence: 0.95,
            timeoutMs: 500,
            intervalMs: 25,
          },
        },
      ],
    });

    expect(result.status).toBe('ready');
    expect(result.services?.portConflicts).toEqual([
      expect.objectContaining({ serviceId: 'api', owner: 'user-existing', resolution: 'reuse' }),
    ]);
    expect(result.services?.services.api?.record).toMatchObject({
      startupMode: 'warm-reused',
      ownership: 'user-existing',
      cleanupStatus: 'skipped',
    });
    expect(result.evidence.evidence[0]).toMatchObject({
      status: 'passed',
      trustLevel: 'degraded',
    });
    expect(userServer.pid).toEqual(expect.any(Number));
    await expectProcessAlive(userServer.pid as number);
  });

  it('keeps full-stack readiness blocked when frontend passes but backend health fails', async () => {
    const { workspace } = await createWorkspaceFromFixture('fullstack-app');
    const frontendPort = await getFreePort();
    const backendPort = await getFreePort();

    const result = await evaluateRuntimeReadiness({
      workspaceRoot: workspace,
      fixtureName: 'fullstack-app',
      generatedAt: '2026-05-17T12:00:00.000Z',
      runId: 'run-readiness-fullstack',
      goalId: 'goal-readiness',
      serviceOverrides: [
        {
          root: '.',
          purpose: 'dev',
          id: 'frontend',
          role: 'frontend',
          env: { PORT: String(frontendPort), RESPONSE: 'frontend-ready' },
          ports: [{ host: '127.0.0.1', port: frontendPort, protocol: 'http', target: `http://127.0.0.1:${frontendPort}/` }],
          healthCheck: { kind: 'http', target: `http://127.0.0.1:${frontendPort}/`, confidence: 0.95, timeoutMs: 2_000, intervalMs: 25 },
        },
        {
          id: 'backend',
          root: '.',
          role: 'backend',
          cwd: workspace,
          command: { executable: process.execPath, argv: ['scripts/fail-server.mjs'] },
          env: { PORT: String(backendPort) },
          evidenceId: 'ev-backend',
          logArtifactPath: '.curdx/artifacts/services/backend.log',
          ports: [{ host: '127.0.0.1', port: backendPort, protocol: 'http', target: `http://127.0.0.1:${backendPort}/health` }],
          healthCheck: { kind: 'http', target: `http://127.0.0.1:${backendPort}/health`, confidence: 0.95, timeoutMs: 500, intervalMs: 25 },
        },
      ],
    });

    expect(result.status).toBe('blocked');
    expect(result.services?.services.frontend?.ok).toBe(true);
    expect(result.services?.services.backend?.ok).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'health', evidenceRefs: expect.arrayContaining(['service:backend']) }),
      expect.objectContaining({ category: 'readiness', message: expect.stringContaining('后端/API') }),
    ]));
    expect(result.report).toContain('frontend-success-backend-failed');
    expect(result.report).toContain('.curdx/artifacts/services/backend.log');
  });

  it('covers monorepo and Claude Code plugin-like fixtures without invoking external global tools', async () => {
    const monorepo = await createWorkspaceFromFixture('monorepo');
    const plugin = await createWorkspaceFromFixture('claude-code-plugin-like');

    const monorepoResult = await evaluateRuntimeReadiness({
      workspaceRoot: monorepo.workspace,
      fixtureName: monorepo.expected.name,
      generatedAt: '2026-05-17T12:00:00.000Z',
      runId: 'run-readiness-monorepo',
      goalId: 'goal-readiness',
    });
    expect(monorepoResult.topology.overallType).toBe('monorepo');
    expect(monorepoResult.commandPlan.commands.map((command) => command.root)).toEqual(expect.arrayContaining(['apps/web', 'apps/api']));

    const pluginResult = await evaluateRuntimeReadiness({
      workspaceRoot: plugin.workspace,
      fixtureName: plugin.expected.name,
      generatedAt: '2026-05-17T12:00:00.000Z',
      runId: 'run-readiness-plugin',
      goalId: 'goal-readiness',
      executeExternalTools: false,
    });
    expect(pluginResult.topology.overallType).toBe('claude-code-plugin');
    expect(pluginResult.commandPlan.commands).toEqual([
      expect.objectContaining({ purpose: 'plugin-validation', executable: 'claude', argv: ['plugin', 'validate', '.'] }),
    ]);
    expect(pluginResult.skips).toEqual([
      expect.objectContaining({
        category: 'external-tool',
        reason: expect.stringContaining('executeExternalTools=false'),
        command: 'claude',
      }),
    ]);
  });
});
