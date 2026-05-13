#!/usr/bin/env node
// Smoke-test the shipped Claude Code plugin through Claude Code.
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

function shellCommandToken(value) {
  const raw = String(value);
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(raw) ? raw : quote(raw);
}

function canRunClaudeBin(bin) {
  const result = spawnSync('zsh', ['-lic', `${shellCommandToken(bin)} --version >/dev/null 2>&1`], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30000,
  });
  return result.status === 0;
}

function resolveClaudeBin() {
  if (process.env.CURDX_FLOW_CLAUDE_BIN) return process.env.CURDX_FLOW_CLAUDE_BIN;
  if (canRunClaudeBin('claudecc')) return 'claudecc';
  return 'claude';
}

const claudeBin = resolveClaudeBin();

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

function runClaude(label, args, cwd = repoRoot) {
  return runZsh(label, `${shellCommandToken(claudeBin)} ${args}`, cwd);
}

function runNode(label, args, cwd = repoRoot, env = {}) {
  console.log(`[claudecc-smoke] ${label}`);
  const result = spawnSync('node', args, {
    cwd,
    env: { ...process.env, ...env },
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

function assertCleanSlashOutput(label, output) {
  if (/\bPUA\b|pua[:\s]|注入|injected prompt|third-party hook|第三方 hook/i.test(output)) {
    throw new Error(`${label} exposed unrelated injected context`);
  }
}

const tmp = mkdtempSync(join(tmpdir(), 'curdx-flow-claudecc-smoke-'));

try {
  console.log(`[claudecc-smoke] using ${claudeBin}`);
  runClaude('version', '--version');
  runClaude('plugin validate', `plugin validate ${quote(pluginRoot)}`);

  const help = runClaude(
    'slash help',
    `--plugin-dir ${quote(pluginRoot)} -p ${quote('/curdx-flow:help')}`,
    tmp,
  );
  if (!help.includes('/curdx-flow:start')) {
    throw new Error('help smoke did not include /curdx-flow:start');
  }
  assertCleanSlashOutput('help smoke', help);

  const status = runClaude(
    'slash status',
    `--plugin-dir ${quote(pluginRoot)} -p ${quote('/curdx-flow:status')}`,
    tmp,
  );
  if (!/Recommended next action/i.test(status)) {
    throw new Error('status smoke did not include a recommended next action');
  }
  assertCleanSlashOutput('status smoke', status);

  const doctor = runNode('runtime doctor', [
    join(pluginRoot, 'bin', 'curdx-flow'),
    'doctor',
    '--cwd',
    tmp,
  ], repoRoot, {
    CURDX_FLOW_MCP_LIST_OUTPUT: '',
  });
  const doctorParsed = JSON.parse(doctor);
  const releaseTagDriftOnly =
    doctorParsed.runtime?.ready === true &&
    doctorParsed.plugin?.ready === true &&
    doctorParsed.hookFreshness?.fresh === true &&
    doctorParsed.release?.ready === false &&
    doctorParsed.release?.tagParity?.state === 'incomplete';
  if (doctorParsed.ok !== true && !releaseTagDriftOnly) {
    throw new Error(`runtime doctor failed: ${doctor}`);
  }
  if (!doctorParsed.brain?.path || !doctorParsed.executionBrief?.completionContract) {
    throw new Error(`runtime doctor missing brain/executionBrief: ${doctor}`);
  }

  const snapshot = runNode('runtime snapshot', [
    join(pluginRoot, 'bin', 'curdx-flow'),
    'snapshot',
    '--cwd',
    tmp,
  ]);
  const snapshotParsed = JSON.parse(snapshot);
  if (snapshotParsed.active !== false || snapshotParsed.nextAction !== 'No active spec. Run /curdx-flow:start <name> <goal>.') {
    throw new Error(`unexpected runtime snapshot output: ${snapshot}`);
  }

  const route = runNode('runtime route direct-change', [
    join(pluginRoot, 'bin', 'curdx-flow'),
    'route',
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

  const capabilityRoute = runNode('runtime route capability recommendations', [
    join(pluginRoot, 'bin', 'curdx-flow'),
    'route',
    '--goal',
    'Debug React network error in Chrome using latest docs',
    '--files',
    'src/Login.tsx,tests/login.test.ts',
    '--available-capabilities',
    'context7,frontend-design,chrome-devtools-mcp,sequential-thinking',
  ]);
  const capabilityParsed = JSON.parse(capabilityRoute);
  const capabilityRecs = capabilityParsed.recommendedCapabilities ?? [];
  const capabilityById = new Map(capabilityRecs.map((rec) => [rec.id, rec]));
  for (const [expected, availability, availabilityState, provisioning] of [
    ['context7', 'known-available', 'available', 'external-mcp'],
    ['claude-mem', 'plugin-dependency', 'missing', 'plugin-dependency'],
    ['frontend-design', 'known-available', 'available', 'plugin-dependency'],
    ['chrome-devtools-mcp', 'known-available', 'available', 'plugin-dependency'],
    ['sequential-thinking', 'known-available', 'available', 'external-mcp'],
    ['docs-query', 'known-available', 'workflow', 'workflow'],
    ['browser-verification', 'known-available', 'workflow', 'workflow'],
    ['stack-specific-verification', 'known-available', 'workflow', 'workflow'],
    ['context-budget', 'known-available', 'workflow', 'workflow'],
  ]) {
    const rec = capabilityById.get(expected);
    if (!rec) {
      throw new Error(`missing capability recommendation ${expected}: ${capabilityRoute}`);
    }
    if (rec.availability !== availability) {
      throw new Error(`expected ${expected} availability ${availability}: ${capabilityRoute}`);
    }
    if (rec.availabilityState !== availabilityState) {
      throw new Error(`expected ${expected} availabilityState ${availabilityState}: ${capabilityRoute}`);
    }
    if (rec.provisioning !== provisioning) {
      throw new Error(`expected ${expected} provisioning ${provisioning}: ${capabilityRoute}`);
    }
  }
  if (capabilityById.has('pua')) {
    throw new Error(`pua should not be recommended before repeated failures or parallel decomposition: ${capabilityRoute}`);
  }
  for (const [expected, phase] of [
    ['docs-query', 'before-coding'],
    ['browser-verification', 'verification'],
    ['stack-specific-verification', 'verification'],
    ['context-budget', 'planning'],
  ]) {
    const rec = capabilityById.get(expected);
    if (rec?.phase !== phase) {
      throw new Error(`expected ${expected} phase ${phase}: ${capabilityRoute}`);
    }
  }

  const compileParent = mkdtempSync(join(tmpdir(), 'curdx-flow-compile-smoke-'));
  try {
    writeFileSync(join(compileParent, 'package.json'), JSON.stringify({ scripts: { verify: 'npm test' } }));
    const compiledRoute = runNode('runtime route compile', [
      join(pluginRoot, 'bin', 'curdx-flow'),
      'route',
      '--compile',
      '--cwd',
      compileParent,
      '--goal',
      'Update Claude Code plugin hooks and publish',
      '--files',
      'plugins/curdx-flow/hooks/hooks.json,src/hooks/lib/runtime-cli.ts',
    ]);
    const compiledParsed = JSON.parse(compiledRoute);
    if (
      compiledParsed.route !== 'full-spec' ||
      compiledParsed.stack !== 'claude-code-plugin' ||
      !String(compiledParsed.completionContract?.join(' ')).includes('fresh verification evidence') ||
      !String(compiledParsed.brain?.path).includes('.curdx/brain.jsonl')
    ) {
      throw new Error(`unexpected compiled route output: ${compiledRoute}`);
    }
  } finally {
    rmSync(compileParent, { recursive: true, force: true });
  }

  const splitParent = mkdtempSync(join(tmpdir(), 'curdx-flow-split-smoke-'));
  try {
    const backend = join(splitParent, 'backend');
    const frontend = join(splitParent, 'frontend');
    mkdirSync(join(backend, '.git'), { recursive: true });
    mkdirSync(frontend, { recursive: true });
    writeFileSync(join(backend, 'CLAUDE.md'), '## Dev\n- frontend: ../frontend\n- backend: .\n');
    writeFileSync(join(frontend, 'package.json'), JSON.stringify({ dependencies: { react: '^19.0.0' } }));
    const splitRoute = runNode('runtime route split missing frontend', [
      join(pluginRoot, 'bin', 'curdx-flow'),
      'route',
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
