#!/usr/bin/env node
// Smoke-test the shipped Claude Code plugin through the user's claudecc entry.
//
// The commands that may invoke slash skills run in an isolated temp directory
// so smoke validation never creates specs or state files in this repository.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const pluginRoot = join(repoRoot, 'plugins', 'curdx-flow');

function quote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function runZsh(label, command, cwd = repoRoot) {
  console.log(`[claudecc-smoke] ${label}`);
  const result = spawnSync('zsh', ['-lic', command], {
    cwd,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 10,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit ${result.status}`);
  }
  return result.stdout;
}

function runNode(label, args, cwd = repoRoot) {
  console.log(`[claudecc-smoke] ${label}`);
  const result = spawnSync('node', args, {
    cwd,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit ${result.status}`);
  }
  return result.stdout;
}

const tmp = mkdtempSync(join(tmpdir(), 'curdx-flow-claudecc-smoke-'));

try {
  runZsh('version', 'claudecc --version');
  runZsh('plugin validate', `claudecc plugin validate ${quote(pluginRoot)}`);

  const help = runZsh(
    'slash help',
    `claudecc --plugin-dir ${quote(pluginRoot)} -p ${quote('/curdx-flow:help')}`,
    tmp,
  );
  if (!help.includes('/curdx-flow:start')) {
    throw new Error('help smoke did not include /curdx-flow:start');
  }

  const status = runZsh(
    'slash status',
    `claudecc --plugin-dir ${quote(pluginRoot)} -p ${quote('/curdx-flow:status')}`,
    tmp,
  );
  if (!/Recommended next action/i.test(status)) {
    throw new Error('status smoke did not include a recommended next action');
  }

  const route = runNode('smart-route direct-change', [
    join(pluginRoot, 'hooks', 'scripts', 'lib', 'smart-route.mjs'),
    '--goal',
    'Fix README typo',
    '--files',
    'README.md',
  ]);
  const parsed = JSON.parse(route);
  if (parsed.route !== 'direct-change' || parsed.shouldCreateSpec !== false) {
    throw new Error(`unexpected smart-route output: ${route}`);
  }
  if (!Array.isArray(parsed.recommendedCapabilities) || parsed.recommendedCapabilities.length !== 0) {
    throw new Error(`direct-change should not recommend third-party tools: ${route}`);
  }

  const capabilityRoute = runNode('smart-route capability recommendations', [
    join(pluginRoot, 'hooks', 'scripts', 'lib', 'smart-route.mjs'),
    '--goal',
    'Debug React network error in Chrome using latest docs',
    '--files',
    'src/Login.tsx,tests/login.test.ts',
    '--available-capabilities',
    'context7,frontend-design,chrome-devtools-mcp,sequential-thinking',
  ]);
  const capabilityParsed = JSON.parse(capabilityRoute);
  const capabilityIds = capabilityParsed.recommendedCapabilities?.map((rec) => rec.id) ?? [];
  for (const expected of ['context7', 'frontend-design', 'chrome-devtools-mcp', 'sequential-thinking']) {
    if (!capabilityIds.includes(expected)) {
      throw new Error(`missing capability recommendation ${expected}: ${capabilityRoute}`);
    }
  }

  const splitParent = mkdtempSync(join(tmpdir(), 'curdx-flow-split-smoke-'));
  try {
    const backend = join(splitParent, 'backend');
    const frontend = join(splitParent, 'frontend');
    mkdirSync(join(backend, '.git'), { recursive: true });
    mkdirSync(frontend, { recursive: true });
    writeFileSync(join(backend, 'CLAUDE.md'), '## Dev\n- frontend: ../frontend\n- backend: .\n');
    writeFileSync(join(frontend, 'package.json'), JSON.stringify({ dependencies: { react: '^19.0.0' } }));
    const splitRoute = runNode('smart-route split missing frontend', [
      join(pluginRoot, 'hooks', 'scripts', 'lib', 'smart-route.mjs'),
      '--cwd',
      backend,
      '--goal',
      'Update the React login page',
    ]);
    const splitParsed = JSON.parse(splitRoute);
    if (splitParsed.route !== 'blocked-ask-user' || !String(splitParsed.nextAction).includes('/add-dir ../frontend')) {
      throw new Error(`unexpected split-route output: ${splitRoute}`);
    }
  } finally {
    rmSync(splitParent, { recursive: true, force: true });
  }

  console.log('[claudecc-smoke] OK');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
