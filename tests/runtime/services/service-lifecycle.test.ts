import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  evaluateServiceReadiness,
  runHealthCheck,
  startService,
  type ServiceLifecycleResult,
} from '../../../src/runtime/services/index.ts';

const workspaces: string[] = [];

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), 'curdx-services-'));
  workspaces.push(workspace);
  return workspace;
}

async function getFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  if (!address || typeof address === 'string') throw new Error('Failed to allocate test port');
  return address.port;
}

async function waitForProcessExit(pid: number): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Process ${pid} was still running after timeout`);
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })));
});

function serverScript(port: number, response = 'ready'): string {
  return [
    "const http = require('node:http');",
    `const server = http.createServer((_req, res) => { res.statusCode = 200; res.end(${JSON.stringify(response)}); });`,
    `server.listen(${port}, '127.0.0.1', () => console.log('READY:${port}'));`,
    "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
  ].join('');
}

describe('service lifecycle and health checks', () => {
  it('starts a service with argv arrays and records runtime facts', async () => {
    const workspace = await createWorkspace();
    const port = await getFreePort();
    const result = await startService({
      id: 'frontend',
      root: '.',
      role: 'frontend',
      cwd: workspace,
      command: {
        executable: process.execPath,
        argv: ['-e', serverScript(port)],
      },
      evidenceId: 'ev-service-frontend',
      logArtifactPath: '.curdx/artifacts/services/frontend.log',
      startedAt: '2026-05-17T10:00:00.000Z',
      healthCheck: {
        kind: 'http',
        target: `http://127.0.0.1:${port}/`,
        confidence: 0.95,
        timeoutMs: 2_000,
        intervalMs: 25,
      },
    });

    try {
      expect(result.ok).toBe(true);
      expect(result.status).toBe('running');
      expect(result.record).toMatchObject({
        id: 'frontend',
        root: '.',
        role: 'frontend',
        command: process.execPath,
        argv: ['-e', expect.any(String)],
        pid: expect.any(Number),
        evidenceId: 'ev-service-frontend',
        logArtifactPath: '.curdx/artifacts/services/frontend.log',
      });
      expect(result.health).toMatchObject({
        status: 'passed',
        target: `http://127.0.0.1:${port}/`,
        httpStatus: 200,
        trustLevel: 'verified',
      });
      expect(result.log.stdout).toContain(`READY:${port}`);
      expect(result.blockers).toEqual([]);
    } finally {
      await result.stop();
    }
  });

  it('returns a blocker when the service exits before health is ready', async () => {
    const workspace = await createWorkspace();
    const port = await getFreePort();
    const result = await startService({
      id: 'api',
      root: 'apps/api',
      role: 'backend',
      cwd: workspace,
      command: {
        executable: process.execPath,
        argv: ['-e', "console.error('boom'); process.exit(7);"],
      },
      evidenceId: 'ev-service-api',
      logArtifactPath: '.curdx/artifacts/services/api.log',
      healthCheck: {
        kind: 'http',
        target: `http://127.0.0.1:${port}/health`,
        confidence: 0.95,
        timeoutMs: 1_000,
        intervalMs: 25,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.record).toMatchObject({
      exitCode: 7,
      logArtifactPath: '.curdx/artifacts/services/api.log',
    });
    expect(result.blockers).toEqual([
      expect.objectContaining({
        code: 'service-exited-before-ready',
        root: 'apps/api',
        command: process.execPath,
        argv: ['-e', "console.error('boom'); process.exit(7);"],
        stderrWindow: expect.stringContaining('boom'),
        nextAction: expect.stringContaining('Inspect service logs'),
      }),
    ]);
  });

  it('returns a health timeout blocker and stops the child process', async () => {
    const workspace = await createWorkspace();
    const port = await getFreePort();
    const result = await startService({
      id: 'api',
      root: 'apps/api',
      role: 'backend',
      cwd: workspace,
      command: {
        executable: process.execPath,
        argv: ['-e', 'setInterval(() => {}, 1000);'],
      },
      evidenceId: 'ev-timeout',
      logArtifactPath: '.curdx/artifacts/services/api-timeout.log',
      healthCheck: {
        kind: 'http',
        target: `http://127.0.0.1:${port}/health`,
        confidence: 0.95,
        timeoutMs: 120,
        intervalMs: 25,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.health).toMatchObject({
      status: 'blocked',
      blockerCode: 'health-timeout',
    });
    expect(result.blockers[0]).toMatchObject({
      code: 'health-timeout',
      logArtifactPath: '.curdx/artifacts/services/api-timeout.log',
    });
  });

  it('marks low-confidence inferred endpoints as degraded even when reachable', async () => {
    const workspace = await createWorkspace();
    const port = await getFreePort();
    const service = await startService({
      id: 'frontend',
      root: '.',
      role: 'frontend',
      cwd: workspace,
      command: {
        executable: process.execPath,
        argv: ['-e', serverScript(port)],
      },
      evidenceId: 'ev-inferred',
      logArtifactPath: '.curdx/artifacts/services/inferred.log',
      healthCheck: {
        kind: 'http',
        target: `http://127.0.0.1:${port}/`,
        confidence: 0.45,
        inferred: true,
        timeoutMs: 2_000,
        intervalMs: 25,
      },
    });

    try {
      expect(service.ok).toBe(true);
      expect(service.status).toBe('degraded');
      expect(service.health).toMatchObject({
        status: 'degraded',
        trustLevel: 'degraded',
        needsHumanInput: true,
      });
    } finally {
      await service.stop();
    }
  });

  it('bounds HTTP response summaries for health evidence', async () => {
    const workspace = await createWorkspace();
    const port = await getFreePort();
    const result = await startService({
      id: 'large-health',
      root: '.',
      role: 'frontend',
      cwd: workspace,
      command: {
        executable: process.execPath,
        argv: ['-e', serverScript(port, 'x'.repeat(2_000))],
      },
      evidenceId: 'ev-large-health',
      logArtifactPath: '.curdx/artifacts/services/large-health.log',
      healthCheck: {
        kind: 'http',
        target: `http://127.0.0.1:${port}/`,
        confidence: 0.95,
        timeoutMs: 2_000,
        intervalMs: 25,
        responseSummaryBytes: 64,
      },
    });

    try {
      expect(result.ok).toBe(true);
      expect(result.health?.responseSummary).toContain('[truncated]');
      expect(result.health?.responseSummary?.length).toBeLessThanOrEqual(80);
    } finally {
      await result.stop();
    }
  });

  it('prevents frontend-only success from becoming full-stack ready', () => {
    const frontend = {
      ok: true,
      status: 'running',
      record: { id: 'frontend', role: 'frontend', root: '.', command: 'npm', argv: ['run', 'dev'] },
      blockers: [],
      log: { stdout: '', stderr: '', truncated: false },
    } as ServiceLifecycleResult;
    const backend = {
      ok: false,
      status: 'blocked',
      record: { id: 'backend', role: 'backend', root: 'apps/api', command: 'npm', argv: ['run', 'dev'] },
      blockers: [
        {
          code: 'health-timeout',
          serviceId: 'backend',
          root: 'apps/api',
          command: 'npm',
          argv: ['run', 'dev'],
          summary: 'backend health timed out',
          stdoutWindow: '',
          stderrWindow: '',
          logArtifactPath: '.curdx/artifacts/services/backend.log',
          nextAction: 'Inspect service logs.',
        },
      ],
      log: { stdout: '', stderr: '', truncated: false },
    } as ServiceLifecycleResult;

    expect(evaluateServiceReadiness({
      topologyType: 'full-stack',
      services: [frontend, backend],
      requiresApiEvidence: true,
    })).toMatchObject({
      status: 'blocked',
      complete: false,
      blockers: expect.arrayContaining([
        expect.objectContaining({
          code: 'frontend-success-backend-failed',
          summary: expect.stringContaining('页面可访问不等于全栈完成'),
        }),
      ]),
    });
  });

  it('keeps logs bounded and references the log artifact path', async () => {
    const workspace = await createWorkspace();
    const port = await getFreePort();
    const noisyScript = [
      "for (let i = 0; i < 200; i += 1) console.log('line-' + i + '-xxxxxxxxxxxxxxxxxxxx');",
      serverScript(port),
    ].join('');
    const result = await startService({
      id: 'noisy',
      root: '.',
      role: 'frontend',
      cwd: workspace,
      command: {
        executable: process.execPath,
        argv: ['-e', noisyScript],
      },
      evidenceId: 'ev-noisy',
      logArtifactPath: '.curdx/artifacts/services/noisy.log',
      maxLogBytes: 400,
      healthCheck: {
        kind: 'http',
        target: `http://127.0.0.1:${port}/`,
        confidence: 0.95,
        timeoutMs: 2_000,
        intervalMs: 25,
      },
    });

    try {
      expect(result.ok).toBe(true);
      expect(result.log.truncated).toBe(true);
      expect(result.log.stdout.length).toBeLessThanOrEqual(430);
      expect(result.record.logArtifactPath).toBe('.curdx/artifacts/services/noisy.log');
    } finally {
      await result.stop();
    }
  });

  it('supports process-exit health checks and preserves argv as an array', async () => {
    const workspace = await createWorkspace();
    const result = await startService({
      id: 'cli-smoke',
      root: '.',
      role: 'worker',
      cwd: workspace,
      command: {
        executable: process.execPath,
        argv: ['-e', "console.log(process.argv[1]);", 'literal && not shell'],
      },
      evidenceId: 'ev-cli',
      logArtifactPath: '.curdx/artifacts/services/cli.log',
      healthCheck: {
        kind: 'process-exit',
        expectedExitCode: 0,
        timeoutMs: 1_000,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.record).toMatchObject({
      command: process.execPath,
      argv: ['-e', "console.log(process.argv[1]);", 'literal && not shell'],
      exitCode: 0,
    });
    expect(result.health).toMatchObject({
      status: 'passed',
      target: 'process-exit:0',
    });
    expect(result.log.stdout).toContain('literal && not shell');
  });

  it('stops a process-exit health check process when it times out', async () => {
    const workspace = await createWorkspace();
    const result = await startService({
      id: 'cli-timeout',
      root: '.',
      role: 'worker',
      cwd: workspace,
      command: {
        executable: process.execPath,
        argv: ['-e', 'setInterval(() => {}, 1000);'],
      },
      evidenceId: 'ev-cli-timeout',
      logArtifactPath: '.curdx/artifacts/services/cli-timeout.log',
      healthCheck: {
        kind: 'process-exit',
        expectedExitCode: 0,
        timeoutMs: 80,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.health).toMatchObject({
      status: 'blocked',
      blockerCode: 'health-timeout',
    });
    expect(result.record.pid).toEqual(expect.any(Number));
    await waitForProcessExit(result.record.pid as number);
  });

  it('returns a spawn blocker and exposes a non-hanging stop handle', async () => {
    const workspace = await createWorkspace();
    const result = await startService({
      id: 'missing-bin',
      root: '.',
      role: 'worker',
      cwd: workspace,
      command: {
        executable: join(workspace, 'missing-bin'),
        argv: ['literal && not shell'],
      },
      evidenceId: 'ev-missing-bin',
      logArtifactPath: '.curdx/artifacts/services/missing-bin.log',
      healthCheck: {
        kind: 'process-exit',
        expectedExitCode: 0,
        timeoutMs: 200,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.blockers[0]).toMatchObject({
      code: 'service-spawn-error',
      command: join(workspace, 'missing-bin'),
      argv: ['literal && not shell'],
    });
    await expect(result.stop()).resolves.toBeUndefined();
  });

  it('exposes direct HTTP health check failures without starting a service', async () => {
    const port = await getFreePort();
    const health = await runHealthCheck({
      kind: 'http',
      target: `http://127.0.0.1:${port}/health`,
      confidence: 0.95,
      timeoutMs: 80,
      intervalMs: 20,
    });

    expect(health).toMatchObject({
      status: 'blocked',
      blockerCode: 'health-timeout',
      target: `http://127.0.0.1:${port}/health`,
    });
  });
});
