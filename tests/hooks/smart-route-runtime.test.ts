import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { classifyAutoPolicy } from '../../src/hooks/lib/auto-policy.ts';
import { decideLastMile } from '../../src/hooks/lib/last-mile-orchestrator.ts';
import { classifySmartRoute } from '../../src/hooks/lib/smart-route.ts';
import {
  detectDevRuntime,
  healthDevRuntime,
  startDevRuntime,
  stopDevRuntime,
  verifyDevRuntime,
} from '../../src/hooks/lib/dev-runtime.ts';

const workspaces: string[] = [];
const originalStaticPort = process.env['CURDX_FLOW_STATIC_PORT'];

const todoGoal = [
  'Build a static frontend Todo app (index.html, styles.css, app.js, no npm deps)',
  'supporting add/render/toggle/delete, mobile+desktop responsive.',
  "Verify via Chrome DevTools MCP in real browser: add 'Buy milk', toggle complete, delete,",
  'confirm list updates, inspect console errors. Record evidence in verificationBlocks.',
].join(' ');

async function workspace(prefix = 'curdx-route-'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  workspaces.push(dir);
  return dir;
}

async function staticTodoWorkspace(): Promise<string> {
  const dir = await workspace('curdx-static-html-');
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>Todos</title><script src="app.js"></script>\n');
  await writeFile(join(dir, 'styles.css'), 'body { font-family: sans-serif; }\n');
  await writeFile(join(dir, 'app.js'), 'document.title = "Todos";\n');
  return dir;
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  if (address === null || typeof address === 'string') throw new Error('failed to allocate test port');
  return address.port;
}

async function waitForHealth(cwd: string, timeoutMs = 3_000): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    last = healthDevRuntime({ cwd });
    if ((last as { ok?: boolean }).ok === true) return last;
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  return last;
}

afterEach(async () => {
  if (originalStaticPort === undefined) delete process.env['CURDX_FLOW_STATIC_PORT'];
  else process.env['CURDX_FLOW_STATIC_PORT'] = originalStaticPort;
  await Promise.all(workspaces.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('smart route and static frontend runtime', () => {
  it('routes no-npm static Todo browser work as product implementation, not npm release risk', async () => {
    const cwd = await workspace();
    await writeFile(join(cwd, 'README.md'), '# test workspace\n');

    const policy = classifyAutoPolicy({ goal: todoGoal });
    const route = classifySmartRoute({
      cwd,
      goal: todoGoal,
      availableCapabilities: ['context7', 'ui-ux-pro-max', 'chrome-devtools-mcp', 'sequential-thinking', 'pua', 'claude-mem'],
    });
    const lastMile = decideLastMile({ cwd, goal: todoGoal, routeFacts: route });

    expect(policy.risk).toBe('medium');
    expect(policy.executionMode).toBe('spec-lite');
    expect(route.intent.intentKind).toBe('product');
    expect(route.route).toBe('lite-spec');
    expect(route.stackProfile.primary).toBe('static-html');
    expect(route.stackProfile.detected.map((item) => item.id)).not.toContain('react');
    expect(route.stackProfile.detected.map((item) => item.id)).not.toContain('vue');
    expect(lastMile.phase).not.toBe('releasing');
    expect(lastMile.problemTypes).not.toContain('release-risk');
    expect(lastMile.problemTypes).toContain('browser-evidence-needed');
  });

  it('still classifies explicit npm publish/tag work as release-sensitive', async () => {
    const cwd = await workspace();
    await writeFile(join(cwd, 'package.json'), '{"name":"pkg","version":"1.0.0"}\n');

    const route = classifySmartRoute({
      cwd,
      goal: 'Release the package to npm: npm publish, create git tag, and verify changelog.',
    });

    expect(route.intent.intentKind).toBe('release');
    expect(route.policy.risk).toMatch(/high|critical/);
  });

  it('does not treat dependency-free Python CLI work as static HTML', async () => {
    const cwd = await workspace();

    const route = classifySmartRoute({
      cwd,
      goal: 'Build a simple Python CLI that prints hello world with no dependencies.',
    });

    expect(route.stackProfile.detected.map((item) => item.id)).not.toContain('static-html');
    expect(route.stackProfile.primary).toBe('python');
    expect(route.suggestedVerifier.kind).not.toBe('browser');
  });

  it('detects, starts, verifies, and cleans up a static HTML dev runtime', async () => {
    const cwd = await staticTodoWorkspace();
    const port = await freePort();
    process.env['CURDX_FLOW_STATIC_PORT'] = String(port);

    const plan = detectDevRuntime({ cwd });
    expect(plan.stackProfile.primary).toBe('static-html');
    expect(plan.services[0]?.command).toContain('node -e');
    expect(plan.health[0]?.command).toBe(`curl -fsS http://127.0.0.1:${port}/`);
    expect(plan.verification.baselineCommands).toContainEqual({ root: '.', command: 'node --check app.js' });

    const started = startDevRuntime({ cwd });
    try {
      expect(started.services.length).toBe(1);
      const health = await waitForHealth(cwd);
      expect((health as { ok?: boolean }).ok).toBe(true);
      expect(verifyDevRuntime({ cwd })).toMatchObject({ ok: true });
    } finally {
      expect(stopDevRuntime({ cwd })).toMatchObject({ ok: true });
    }
  });
});
