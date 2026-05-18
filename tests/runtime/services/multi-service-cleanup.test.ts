import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupServices,
  startServices,
  type MultiServiceLifecycleResult,
} from '../../../src/runtime/services/index.ts';

const workspaces: string[] = [];
type UserProcess = ChildProcessByStdio<null, Readable, Readable>;
const userProcesses: UserProcess[] = [];

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), 'curdx-multi-services-'));
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

function serverScript(port: number, response = 'ready'): string {
  return [
    "const http = require('node:http');",
    `const server = http.createServer((_req, res) => { res.statusCode = 200; res.end(${JSON.stringify(response)}); });`,
    `server.listen(${port}, '127.0.0.1', () => console.log('READY:${port}'));`,
    "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
  ].join('');
}

async function startUserServer(port: number, response = 'ready'): Promise<UserProcess> {
  const child = spawn(process.execPath, ['-e', serverScript(port, response)], {
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  userProcesses.push(child);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for user server')), 2_000);
    child.stdout.on('data', (chunk: Buffer) => {
      if (chunk.toString('utf8').includes(`READY:${port}`)) {
        clearTimeout(timer);
        resolve();
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
  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
  child.kill('SIGTERM');
  await Promise.race([
    closed,
    new Promise((resolve) => setTimeout(resolve, 1_000)),
  ]);
}

async function expectProcessAlive(pid: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(() => process.kill(pid, 0)).not.toThrow();
}

afterEach(async () => {
  await Promise.all(userProcesses.splice(0).map((child) => stopProcess(child)));
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })));
});

describe('multi-service lifecycle, port conflicts, and cleanup', () => {
  it('starts multiple services with independent health, relation, log, and cleanup facts', async () => {
    const workspace = await createWorkspace();
    const frontendPort = await getFreePort();
    const backendPort = await getFreePort();

    const result = await startServices({
      relations: [{ from: 'frontend', to: 'backend', kind: 'calls-api' }],
      services: [
        {
          id: 'frontend',
          root: 'apps/web',
          role: 'frontend',
          cwd: workspace,
          command: { executable: process.execPath, argv: ['-e', serverScript(frontendPort)] },
          evidenceId: 'ev-frontend',
          logArtifactPath: '.curdx/artifacts/services/frontend.log',
          ports: [{ host: '127.0.0.1', port: frontendPort, protocol: 'http', target: `http://127.0.0.1:${frontendPort}/` }],
          healthCheck: { kind: 'http', target: `http://127.0.0.1:${frontendPort}/`, confidence: 0.95, timeoutMs: 2_000, intervalMs: 25 },
        },
        {
          id: 'backend',
          root: 'apps/api',
          role: 'backend',
          cwd: workspace,
          command: { executable: process.execPath, argv: ['-e', serverScript(backendPort)] },
          evidenceId: 'ev-backend',
          logArtifactPath: '.curdx/artifacts/services/backend.log',
          ports: [{ host: '127.0.0.1', port: backendPort, protocol: 'http', target: `http://127.0.0.1:${backendPort}/` }],
          healthCheck: { kind: 'http', target: `http://127.0.0.1:${backendPort}/`, confidence: 0.95, timeoutMs: 2_000, intervalMs: 25 },
        },
      ],
    });

    expect(result.status).toBe('running');
    expect(result.order).toEqual(['frontend', 'backend']);
    expect(result.relations).toEqual([{ from: 'frontend', to: 'backend', kind: 'calls-api' }]);
    expect(result.services.frontend?.record).toMatchObject({
      id: 'frontend',
      root: 'apps/web',
      ownership: 'curdx-started',
      startupMode: 'cold-started',
      ports: [expect.objectContaining({ port: frontendPort })],
    });
    expect(result.services.backend?.health).toMatchObject({ status: 'passed' });

    const cleanup = await cleanupServices(result);
    expect(cleanup.status).toBe('clean');
    expect(cleanup.attempts).toEqual([
      expect.objectContaining({ serviceId: 'frontend', result: 'success', ownership: 'curdx-started' }),
      expect.objectContaining({ serviceId: 'backend', result: 'success', ownership: 'curdx-started' }),
    ]);
  });

  it('blocks on a user-existing port conflict without killing the user process', async () => {
    const workspace = await createWorkspace();
    const port = await getFreePort();
    const userServer = await startUserServer(port);

    const result = await startServices({
      services: [
        {
          id: 'api',
          root: 'apps/api',
          role: 'backend',
          cwd: workspace,
          command: { executable: process.execPath, argv: ['-e', serverScript(port)] },
          evidenceId: 'ev-api',
          logArtifactPath: '.curdx/artifacts/services/api.log',
          ports: [{ host: '127.0.0.1', port, protocol: 'http', target: `http://127.0.0.1:${port}/` }],
          healthCheck: { kind: 'http', target: `http://127.0.0.1:${port}/`, confidence: 0.95, timeoutMs: 500, intervalMs: 25 },
        },
      ],
    });

    expect(result.status).toBe('blocked');
    expect(result.portConflicts).toEqual([
      expect.objectContaining({
        serviceId: 'api',
        owner: 'user-existing',
        resolution: 'blocked',
        riskLevel: 'high',
      }),
    ]);
    expect(result.services.api?.blockers[0]).toMatchObject({
      code: 'port-conflict-user-existing',
      nextAction: expect.stringContaining('Do not kill'),
    });
    expect(userServer.pid).toEqual(expect.any(Number));
    await expectProcessAlive(userServer.pid as number);

    const cleanup = await cleanupServices(result);
    expect(cleanup.attempts[0]).toMatchObject({
      serviceId: 'api',
      result: 'skipped',
      ownership: 'user-existing',
    });
    await expectProcessAlive(userServer.pid as number);
  });

  it('classifies same-run port conflicts as curdx-started ownership', async () => {
    const workspace = await createWorkspace();
    const port = await getFreePort();

    const result = await startServices({
      allowReuseExisting: true,
      services: [
        {
          id: 'frontend',
          root: 'apps/web',
          role: 'frontend',
          cwd: workspace,
          command: { executable: process.execPath, argv: ['-e', serverScript(port)] },
          evidenceId: 'ev-frontend',
          logArtifactPath: '.curdx/artifacts/services/frontend-same-port.log',
          ports: [{ host: '127.0.0.1', port, protocol: 'http', target: `http://127.0.0.1:${port}/` }],
          healthCheck: { kind: 'http', target: `http://127.0.0.1:${port}/`, confidence: 0.95, timeoutMs: 2_000, intervalMs: 25 },
        },
        {
          id: 'backend',
          root: 'apps/api',
          role: 'backend',
          cwd: workspace,
          command: { executable: process.execPath, argv: ['-e', serverScript(port)] },
          evidenceId: 'ev-backend',
          logArtifactPath: '.curdx/artifacts/services/backend-same-port.log',
          ports: [{ host: '127.0.0.1', port, protocol: 'http', target: `http://127.0.0.1:${port}/` }],
          healthCheck: { kind: 'http', target: `http://127.0.0.1:${port}/`, confidence: 0.95, timeoutMs: 500, intervalMs: 25 },
        },
      ],
    });

    try {
      expect(result.status).toBe('blocked');
      expect(result.portConflicts[0]).toMatchObject({
        serviceId: 'backend',
        owner: 'curdx-started',
        existingServiceId: 'frontend',
        resolution: 'blocked',
      });
      expect(result.services.backend?.blockers[0]).toMatchObject({
        code: 'port-conflict-curdx-started',
      });
      expect(result.services.backend?.record.startupMode).toBe('blocked');
    } finally {
      await cleanupServices(result);
    }
  });

  it('blocks duplicate service ids before starting processes', async () => {
    const workspace = await createWorkspace();
    const firstPort = await getFreePort();
    const secondPort = await getFreePort();

    const result = await startServices({
      services: [
        {
          id: 'api',
          root: 'apps/api',
          role: 'backend',
          cwd: workspace,
          command: { executable: process.execPath, argv: ['-e', serverScript(firstPort)] },
          evidenceId: 'ev-api-1',
          logArtifactPath: '.curdx/artifacts/services/api-1.log',
          ports: [{ host: '127.0.0.1', port: firstPort, protocol: 'http', target: `http://127.0.0.1:${firstPort}/` }],
          healthCheck: { kind: 'http', target: `http://127.0.0.1:${firstPort}/`, confidence: 0.95, timeoutMs: 2_000, intervalMs: 25 },
        },
        {
          id: 'api',
          root: 'apps/api-copy',
          role: 'backend',
          cwd: workspace,
          command: { executable: process.execPath, argv: ['-e', serverScript(secondPort)] },
          evidenceId: 'ev-api-2',
          logArtifactPath: '.curdx/artifacts/services/api-2.log',
          ports: [{ host: '127.0.0.1', port: secondPort, protocol: 'http', target: `http://127.0.0.1:${secondPort}/` }],
          healthCheck: { kind: 'http', target: `http://127.0.0.1:${secondPort}/`, confidence: 0.95, timeoutMs: 2_000, intervalMs: 25 },
        },
      ],
    });

    expect(result.status).toBe('blocked');
    expect(result.services).toEqual({});
    expect(result.blockers[0]).toMatchObject({
      code: 'duplicate-service-id',
      serviceId: 'api',
    });
  });

  it('can reuse an existing service as warm evidence without cleaning it up', async () => {
    const workspace = await createWorkspace();
    const port = await getFreePort();
    const userServer = await startUserServer(port, 'external-ready');

    const result = await startServices({
      allowReuseExisting: true,
      services: [
        {
          id: 'api',
          root: 'apps/api',
          role: 'backend',
          cwd: workspace,
          command: { executable: process.execPath, argv: ['-e', serverScript(port)] },
          evidenceId: 'ev-reused-api',
          logArtifactPath: '.curdx/artifacts/services/reused-api.log',
          ports: [{ host: '127.0.0.1', port, protocol: 'http', target: `http://127.0.0.1:${port}/` }],
          healthCheck: { kind: 'http', target: `http://127.0.0.1:${port}/`, confidence: 0.95, timeoutMs: 500, intervalMs: 25 },
        },
      ],
    });

    expect(result.status).toBe('running');
    expect(result.portConflicts[0]).toMatchObject({
      serviceId: 'api',
      owner: 'user-existing',
      resolution: 'reuse',
    });
    expect(result.services.api?.record).toMatchObject({
      ownership: 'user-existing',
      startupMode: 'warm-reused',
    });
    expect(result.services.api?.health).toMatchObject({
      status: 'passed',
      responseSummary: 'external-ready',
    });

    const cleanup = await cleanupServices(result);
    expect(cleanup.status).toBe('clean');
    expect(cleanup.attempts[0]).toMatchObject({
      serviceId: 'api',
      result: 'skipped',
      ownership: 'user-existing',
    });
    expect(userServer.pid).toEqual(expect.any(Number));
    await expectProcessAlive(userServer.pid as number);
  });

  it('records cleanup failures as blockers instead of dropping them', async () => {
    const result: MultiServiceLifecycleResult = {
      status: 'running',
      complete: false,
      order: ['worker'],
      relations: [],
      portConflicts: [],
      services: {
        worker: {
          ok: true,
          status: 'running',
          record: {
            id: 'worker',
            root: '.',
            command: 'node',
            argv: ['worker.js'],
            ownership: 'curdx-started',
            startupMode: 'cold-started',
            pid: process.pid,
            logArtifactPath: '.curdx/artifacts/services/worker.log',
          },
          blockers: [],
          log: { stdout: '', stderr: '', truncated: false },
          stop: async () => {
            throw new Error('stop failed');
          },
        },
      },
      blockers: [],
      warnings: [],
      cleanup: { status: 'pending', attempts: [], blockers: [], warnings: [] },
    };

    const cleanup = await cleanupServices(result);

    expect(cleanup.status).toBe('blocked');
    expect(cleanup.attempts[0]).toMatchObject({
      serviceId: 'worker',
      result: 'failed',
      remainingProcess: true,
      nextAction: expect.stringContaining('Manual cleanup required'),
    });
    expect(cleanup.blockers[0]).toMatchObject({
      code: 'service-cleanup-failed',
      serviceId: 'worker',
    });
  });

  it('keeps large multi-service logs bounded', async () => {
    const workspace = await createWorkspace();
    const port = await getFreePort();
    const noisyScript = [
      "for (let i = 0; i < 200; i += 1) console.log('line-' + i + '-xxxxxxxxxxxxxxxxxxxx');",
      serverScript(port),
    ].join('');

    const result = await startServices({
      services: [
        {
          id: 'noisy',
          root: '.',
          role: 'frontend',
          cwd: workspace,
          command: { executable: process.execPath, argv: ['-e', noisyScript] },
          evidenceId: 'ev-noisy',
          logArtifactPath: '.curdx/artifacts/services/noisy.log',
          maxLogBytes: 300,
          ports: [{ host: '127.0.0.1', port, protocol: 'http', target: `http://127.0.0.1:${port}/` }],
          healthCheck: { kind: 'http', target: `http://127.0.0.1:${port}/`, confidence: 0.95, timeoutMs: 2_000, intervalMs: 25 },
        },
      ],
    });

    try {
      expect(result.services.noisy?.log.truncated).toBe(true);
      expect(result.services.noisy?.log.stdout.length).toBeLessThanOrEqual(330);
      expect(result.services.noisy?.record.logArtifactPath).toBe('.curdx/artifacts/services/noisy.log');
    } finally {
      await cleanupServices(result);
    }
  });
});
