#!/usr/bin/env node
// Full Claude Code E2E for the curdx-flow plugin.
//
// This intentionally calls the real Claude Code CLI and may spend model budget.
// Keep it out of the default verify gate; run it manually before release-facing
// plugin changes when we need to prove the slash workflow can finish a project.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const pluginRoot = join(repoRoot, 'plugins', 'curdx-flow');
const runtimeCli = join(pluginRoot, 'bin', 'curdx-flow');
const distCli = join(repoRoot, 'dist', 'index.mjs');

const claudeBin = process.env.CURDX_FLOW_CLAUDE_BIN ?? 'claude';
const maxBudgetUsd = process.env.CURDX_FLOW_E2E_MAX_BUDGET_USD ?? '3';
const keepTmp = process.env.CURDX_FLOW_E2E_KEEP_TMP === '1';
const tmp = mkdtempSync(join(tmpdir(), 'curdx-flow-e2e-'));
const debugLog = join(tmp, 'claude-debug.log');
const analyzeReport = join(tmp, 'curdx-flow-analyze.md');

function log(message) {
  console.log(`[claudecc-e2e] ${message}`);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function shellCommandToken(value) {
  const raw = String(value);
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(raw) ? raw : shellQuote(raw);
}

function fail(message, detail) {
  if (detail) {
    console.error(detail);
  }
  throw new Error(message);
}

function run(label, command, args, options = {}) {
  log(label);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? tmp,
    encoding: 'utf8',
    timeout: options.timeout ?? 120000,
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 20,
    env: {
      ...process.env,
      CI: '1',
    },
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;

  const expectedStatus = options.expectedStatus ?? 0;
  if (result.status !== expectedStatus) {
    fail(`${label} exited ${result.status}; expected ${expectedStatus}`, [
      result.stdout ? `stdout:\n${result.stdout}` : '',
      result.stderr ? `stderr:\n${result.stderr}` : '',
    ].filter(Boolean).join('\n'));
  }
  return result;
}

function runClaudeCode(label, args, options = {}) {
  log(label);
  const command = [shellCommandToken(claudeBin), ...args.map(shellQuote)].join(' ');
  const result = spawnSync('zsh', ['-lic', command], {
    cwd: options.cwd ?? tmp,
    encoding: 'utf8',
    timeout: options.timeout ?? 120000,
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 20,
    env: {
      ...process.env,
      CI: '1',
    },
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;

  const expectedStatus = options.expectedStatus ?? 0;
  if (result.status !== expectedStatus) {
    fail(`${label} exited ${result.status}; expected ${expectedStatus}`, [
      result.stdout ? `stdout:\n${result.stdout}` : '',
      result.stderr ? `stderr:\n${result.stderr}` : '',
    ].filter(Boolean).join('\n'));
  }
  return result;
}

function runAllowFailure(label, command, args, options = {}) {
  log(label);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? tmp,
    encoding: 'utf8',
    timeout: options.timeout ?? 120000,
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 20,
    env: {
      ...process.env,
      CI: '1',
    },
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  return result;
}

function parseJson(label, raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    fail(`${label} did not return JSON: ${(err).message}`, raw);
  }
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function writeFixtureProject() {
  mkdirSync(join(tmp, 'src'), { recursive: true });
  mkdirSync(join(tmp, 'test'), { recursive: true });
  writeFileSync(
    join(tmp, 'package.json'),
    JSON.stringify(
      {
        name: 'curdx-flow-e2e-fixture',
        version: '0.0.0',
        private: true,
        type: 'module',
        scripts: {
          test: 'node --test',
        },
      },
      null,
      2,
    ) + '\n',
  );
  writeFileSync(
    join(tmp, 'src', 'greet.js'),
    [
      'export function greet(name) {',
      '  return name;',
      '}',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(tmp, 'test', 'greet.test.js'),
    [
      "import { strict as assert } from 'node:assert';",
      "import { test } from 'node:test';",
      "import { greet } from '../src/greet.js';",
      '',
      "test('greets a trimmed name', () => {",
      "  assert.equal(greet(' Ada '), 'Hello, Ada!');",
      '});',
      '',
      "test('falls back for empty input', () => {",
      "  assert.equal(greet('   '), 'Hello, friend!');",
      '});',
      '',
    ].join('\n'),
  );
}

function validateArtifacts() {
  const specDir = join(tmp, 'specs', 'greet-helper');
  assert(existsSync(specDir), `expected spec directory: ${specDir}`);

  const expectedArtifacts = ['tasks.md', '.progress.md', '.curdx-state.json'];
  for (const artifact of expectedArtifacts) {
    assert(existsSync(join(specDir, artifact)), `missing spec artifact: ${artifact}`);
  }

  const current = readFileSync(join(tmp, 'specs', '.current-spec'), 'utf8').trim();
  assert(current === 'specs/greet-helper' || current === 'greet-helper', `.current-spec unexpected: ${current}`);

  const tasks = readFileSync(join(specDir, 'tasks.md'), 'utf8');
  assert(tasks.includes('## Source Coverage Audit'), 'tasks.md missing Source Coverage Audit');
  assert(/^- \[[ x]\] \d+\.\d+ .+/m.test(tasks), 'tasks.md missing top-level checkbox tasks');
  assert(!/^##\s*T\d+\b/m.test(tasks), 'tasks.md contains heading-only task sections');

  const state = parseJson(
    'curdx state',
    readFileSync(join(specDir, '.curdx-state.json'), 'utf8'),
  );
  const executionBlock = state.verificationBlocks?.execution;
  assert(executionBlock, 'state missing verificationBlocks.execution');
  assert(executionBlock.command === 'npm test', `unexpected verification command: ${executionBlock.command}`);
  assert(executionBlock.exitCode === 0, `unexpected verification exitCode: ${executionBlock.exitCode}`);
  assert(Number.isFinite(Date.parse(executionBlock.timestamp)), 'verification timestamp is invalid');
  assert(Number.isFinite(executionBlock.srcMtime) && executionBlock.srcMtime >= 0, 'verification srcMtime is invalid');

  const snapshotRaw = run('runtime snapshot', process.execPath, [runtimeCli, 'snapshot', '--cwd', tmp]).stdout;
  const snapshot = parseJson('runtime snapshot', snapshotRaw);
  assert(snapshot.active === true, 'snapshot did not detect active spec');
  assert(snapshot.spec?.path === 'specs/greet-helper', `snapshot resolved wrong spec path: ${snapshot.spec?.path}`);
  assert(snapshot.tasks?.total > 0, 'snapshot task count is zero');
  assert(snapshot.state?.verificationBlocks?.execution?.command === 'npm test', 'snapshot missing execution verification block');
  assert(!snapshot.gates?.includes('empty-tasks'), 'snapshot reported empty-tasks');
  assert(!snapshot.gates?.includes('missing-state'), 'snapshot reported missing-state');
}

function validateDebugLog() {
  assert(existsSync(debugLog), `missing debug log: ${debugLog}`);
  const logText = readFileSync(debugLog, 'utf8');
  for (const expected of [
    'Loaded hooks from standard location for plugin curdx-flow',
    'Loaded inline plugin from path: curdx-flow',
    'Loaded',
    'skills from plugin curdx-flow',
    'Hook UserPromptExpansion',
    'Hook Stop',
  ]) {
    assert(logText.includes(expected), `debug log missing signal: ${expected}`);
  }
}

function analyzeLogs() {
  if (!existsSync(distCli)) {
    log('skip analyze: dist/index.mjs is missing');
    return;
  }
  const result = runAllowFailure(
    'analyze generated Claude transcript and hook logs',
    process.execPath,
    [distCli, 'analyze', '--limit', '20', '--cost-summary', '--out', analyzeReport],
    { cwd: tmp, timeout: 120000 },
  );
  if (result.status !== 0) {
    log('analyze did not find a transcript; debug-log assertions still covered hook execution');
    return;
  }
  const report = readFileSync(analyzeReport, 'utf8');
  assert(report.includes('Hook') || report.includes('Cost Summary'), 'analyze report missing hook/cost sections');
}

try {
  log(`fixture: ${tmp}`);
  writeFixtureProject();
  run('git init', 'git', ['init', '-b', 'main']);
  run('initial npm test must fail', 'npm', ['test'], { expectedStatus: 1 });

  const prompt = [
    '/curdx-flow:start greet-helper',
    '"Implement src/greet.js so npm test passes. Export greet(name). Trim whitespace and return Hello, friend! for empty input."',
    '--quick --no-commit-spec --mode fast --tasks-size coarse --review minimal',
  ].join(' ');

  runClaudeCode(
    'real Claude Code slash workflow',
    [
      '--plugin-dir',
      pluginRoot,
      '--permission-mode',
      'bypassPermissions',
      '--debug-file',
      debugLog,
      '--max-budget-usd',
      maxBudgetUsd,
      '-p',
      prompt,
    ],
    { timeout: 900000, maxBuffer: 1024 * 1024 * 60 },
  );

  run('final npm test must pass', 'npm', ['test']);
  validateArtifacts();
  validateDebugLog();
  analyzeLogs();

  log('OK');
  if (keepTmp) {
    log(`kept fixture: ${tmp}`);
  }
} finally {
  if (!keepTmp) {
    rmSync(tmp, { recursive: true, force: true });
  }
}
