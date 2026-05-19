#!/usr/bin/env node
// Full Claude Code E2E suite for the curdx-flow plugin.
//
// Sequentially runs 7 isolated stages, each owning its own fixture tmpdir,
// its own Claude budget cap, and its own validators. Stages are fail-soft:
// any single stage failure does not block subsequent stages. The script
// exits 1 if any stage failed; exits 0 only when all stages passed (or were
// filtered out).
//
// Each "claude" stage spends real model budget (default cap $3 per Claude
// invocation, controlled by CURDX_FLOW_E2E_MAX_BUDGET_USD). Worst-case full
// suite spend is roughly $10-12. Stages of mode "cli" do not call Claude and
// are nearly free.
//
// Environment variables:
//   CURDX_FLOW_CLAUDE_BIN          path/alias of the Claude Code CLI (default: claude)
//   CURDX_FLOW_E2E_MAX_BUDGET_USD  per-Claude-call budget cap (default: 3)
//   CURDX_FLOW_E2E_KEEP_TMP=1      keep fixture tmpdirs after the run
//   CURDX_FLOW_E2E_SUITE_FILTER    comma-separated stage name substrings
//   CURDX_FLOW_E2E_MAX_ATTEMPTS    pass@k retry budget per claude stage (default: 2)
//
// Isolation strategy: every claude subprocess gets four CLAUDE_CODE_DISABLE_*
// env vars that block the user-global CLAUDE.md, auto-memory, managed skills,
// and marketplace auto-install — three of the biggest pollution sources for
// agent E2E. We deliberately do NOT use `--bare` (it disables keychain reads
// and breaks subscription OAuth), and we do NOT redirect $HOME (it also
// breaks `--plugin-dir` slash-command resolution). User hooks declared in
// ~/.claude/settings.json still load; pass@2 retry absorbs the rare cases
// where they actually distort the agent's path.
//
// Run via: npm run test:claudecc:e2e:suite

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const pluginRoot = join(repoRoot, 'plugins', 'curdx-flow');
const runtimeCli = join(pluginRoot, 'bin', 'curdx-flow');

const claudeBin = process.env.CURDX_FLOW_CLAUDE_BIN ?? 'claude';
const maxBudgetUsd = process.env.CURDX_FLOW_E2E_MAX_BUDGET_USD ?? '3';
const keepTmp = process.env.CURDX_FLOW_E2E_KEEP_TMP === '1';
const filter = (process.env.CURDX_FLOW_E2E_SUITE_FILTER ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// ---------------------- shell + assert helpers ----------------------

function log(stage, message) {
  console.log(`[e2e-suite/${stage}] ${message}`);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function shellCommandToken(value) {
  const raw = String(value);
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(raw) ? raw : shellQuote(raw);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseJson(label, raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${label}: invalid JSON (${err.message})\n${raw}`);
  }
}

function run(stage, label, command, args, options = {}) {
  log(stage, label);
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    timeout: options.timeout ?? 120000,
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 20,
    env: { ...process.env, CI: '1' },
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  const expected = options.expectedStatus ?? 0;
  if (result.status !== expected) {
    throw new Error(`${label} exited ${result.status}; expected ${expected}`);
  }
  return result;
}

/**
 * Spawn `claude` with the documented opt-out env vars that neutralize the
 * three biggest pollution sources for E2E:
 *   - CLAUDE_CODE_DISABLE_CLAUDE_MDS=1   → no user-global ~/.claude/CLAUDE.md
 *   - CLAUDE_CODE_DISABLE_AUTO_MEMORY=1  → no user memory index injected
 *   - CLAUDE_CODE_DISABLE_POLICY_SKILLS=1 → no managed-skill side-loading
 *
 * We deliberately do NOT:
 *   - pass `--bare`: it also disables keychain reads, breaking Claude Code
 *     subscription (OAuth) users.
 *   - redirect $HOME or CLAUDE_CONFIG_DIR: `--plugin-dir` still resolves
 *     slash-commands via the user config registry, so reparenting HOME
 *     makes the plugin invisible ("Unknown command: /curdx-flow:start").
 *
 * Residual pollution we accept (relying on pass@2 retry to absorb it):
 *   - user hooks declared in ~/.claude/settings.json (e.g. PUA Guard) still
 *     load. They are read-only supervisors; they can change Claude's
 *     phrasing but rarely block end-to-end success.
 */
function runClaudeCode(stage, label, args, options = {}) {
  const cwd = options.cwd;
  if (!cwd) throw new Error('runClaudeCode requires options.cwd (per-stage fixture root)');

  log(stage, label);
  const command = [shellCommandToken(claudeBin), ...args.map(shellQuote)].join(' ');
  const result = spawnSync('zsh', ['-lic', command], {
    cwd,
    encoding: 'utf8',
    timeout: options.timeout ?? 900000,
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 60,
    env: {
      ...process.env,
      CI: '1',
      // Force `curdx-flow` to resolve to the in-repo CLI binary that ships
      // with the plugin under test. Without this, $PATH resolves it to the
      // user-global installed copy under
      //   ~/.claude/plugins/cache/curdx/curdx-flow/<old-version>/bin/curdx-flow,
      // which may be a different version than the skill files loaded via
      // --plugin-dir. The resulting skill-vs-CLI version mismatch makes
      // `curdx-flow verify run` exit 0 without writing in some boundary
      // cases — see SKILL.md `references/coordinator-pattern.md`.
      PATH: `${join(pluginRoot, 'bin')}:${process.env.PATH ?? ''}`,
      CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1',
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      CLAUDE_CODE_DISABLE_POLICY_SKILLS: '1',
      CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL: '1',
    },
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  const expected = options.expectedStatus ?? 0;
  if (result.status !== expected) {
    throw new Error(`${label} exited ${result.status}; expected ${expected}`);
  }
  return result;
}

// ---------------------- fixture writers ----------------------

function makeFixtureRoot(prefix) {
  return mkdtempSync(join(tmpdir(), `curdx-flow-e2e-${prefix}-`));
}

function writeGreetFixture(tmp) {
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
        scripts: { test: 'node --test' },
      },
      null,
      2,
    ) + '\n',
  );
  writeFileSync(
    join(tmp, 'src', 'greet.js'),
    ['export function greet(name) {', '  return name;', '}', ''].join('\n'),
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

function writeDirectChangeFixture(tmp) {
  mkdirSync(join(tmp, 'src'), { recursive: true });
  writeFileSync(
    join(tmp, 'package.json'),
    JSON.stringify(
      {
        name: 'curdx-flow-e2e-direct',
        version: '0.0.0',
        private: true,
        type: 'module',
      },
      null,
      2,
    ) + '\n',
  );
  writeFileSync(
    join(tmp, 'src', 'greet.js'),
    ['export function greet(name) {', '  return `Hellp, ${name}!`;', '}', ''].join('\n'),
  );
}

function writeFailureRecoveryFixture(tmp) {
  // Three test cases. greet.js starts blatantly wrong so the first verify run
  // returns exitCode != 0 and Claude must iterate.
  mkdirSync(join(tmp, 'src'), { recursive: true });
  mkdirSync(join(tmp, 'test'), { recursive: true });
  writeFileSync(
    join(tmp, 'package.json'),
    JSON.stringify(
      {
        name: 'curdx-flow-e2e-recovery',
        version: '0.0.0',
        private: true,
        type: 'module',
        scripts: { test: 'node --test' },
      },
      null,
      2,
    ) + '\n',
  );
  writeFileSync(
    join(tmp, 'src', 'greet.js'),
    [
      'export function greet(name) {',
      '  // intentionally broken so the first verification fails',
      "  return 'BROKEN';",
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
      "test('falls back for empty input', () => {",
      "  assert.equal(greet('   '), 'Hello, friend!');",
      '});',
      "test('preserves middle whitespace', () => {",
      "  assert.equal(greet(' Ada Lovelace '), 'Hello, Ada Lovelace!');",
      '});',
      '',
    ].join('\n'),
  );
}

// ---------------------- shared validators ----------------------

function readState(tmp, specName) {
  const stateFile = join(tmp, 'specs', specName, '.curdx-state.json');
  assert(existsSync(stateFile), `missing .curdx-state.json at ${stateFile}`);
  return parseJson('curdx state', readFileSync(stateFile, 'utf8'));
}

function validateSpecArtifacts(tmp, specName, opts = {}) {
  const specDir = join(tmp, 'specs', specName);
  assert(existsSync(specDir), `expected spec dir: ${specDir}`);
  assert(
    !existsSync(join(tmp, '.curdx-state.json')),
    `state must NOT live at project root (found ${join(tmp, '.curdx-state.json')})`,
  );
  const state = readState(tmp, specName);
  if (opts.requireExecutionBlock !== false) {
    const eb = state.verificationBlocks?.execution;
    assert(eb, 'state missing verificationBlocks.execution');
    assert(typeof eb.command === 'string' && eb.command.length > 0, 'execution.command missing');
    assert(eb.exitCode === 0, `execution.exitCode=${eb.exitCode}, expected 0`);
    assert(
      Number.isFinite(eb.srcMtime) && eb.srcMtime >= 0,
      `execution.srcMtime invalid: ${eb.srcMtime}`,
    );
    // Accept both ISO 8601 strings (what `curdx-flow verify run` writes) and
    // epoch ms numbers (what some agent hand-writes produce). Both serialize
    // to the same instant.
    const ts = eb.timestamp;
    const tsValid =
      (typeof ts === 'string' && Number.isFinite(Date.parse(ts))) ||
      (typeof ts === 'number' && Number.isFinite(ts) && ts > 0);
    assert(tsValid, `execution.timestamp invalid: ${ts}`);
  }
  if (opts.requireDriver) {
    assert(
      state.executionDriver === opts.requireDriver,
      `executionDriver=${state.executionDriver}, expected ${opts.requireDriver}`,
    );
  }
  if (opts.requireCompleted) {
    assert(state.completed === true, 'state.completed should be true');
  }
  if (opts.requirePhaseFiles) {
    for (const file of opts.requirePhaseFiles) {
      assert(existsSync(join(specDir, file)), `missing phase artifact: ${file}`);
    }
  }
  return state;
}

function specsHasNonHiddenChildren(tmp) {
  const specsDir = join(tmp, 'specs');
  if (!existsSync(specsDir)) return false;
  return readdirSync(specsDir).some((name) => !name.startsWith('.'));
}

// ---------------------- stages ----------------------

const stageOrder = [
  'lite-spec-quick',
  'full-spec-implement',
  'direct-change',
  'resume-after-interrupt',
  'failure-recovery',
  'refactor-followup',
  'manual-mode',
];

const stages = {
  /**
   * Stage 1: lightweight inline path. Reproduces the legacy
   * test:claudecc:e2e flow as the baseline gate.
   */
  'lite-spec-quick': {
    mode: 'claude',
    async run() {
      const stage = 'lite-spec-quick';
      const tmp = makeFixtureRoot('lite');
      try {
        log(stage, `fixture: ${tmp}`);
        writeGreetFixture(tmp);
        run(stage, 'git init', 'git', ['init', '-b', 'main'], { cwd: tmp });
        run(stage, 'initial npm test must fail', 'npm', ['test'], {
          cwd: tmp,
          expectedStatus: 1,
        });
        const prompt = [
          '/curdx-flow:start greet-helper',
          '"Implement src/greet.js so npm test passes. Export greet(name). Trim whitespace and return Hello, friend! for empty input."',
          '--quick --no-commit-spec --mode fast --task-granularity coarse --review minimal',
        ].join(' ');
        runClaudeCode(
          stage,
          'real Claude Code slash workflow',
          [
            '--plugin-dir',
            pluginRoot,
            '--permission-mode',
            'bypassPermissions',
            '--max-budget-usd',
            maxBudgetUsd,
            '-p',
            prompt,
          ],
          { cwd: tmp, timeout: 900000 },
        );
        run(stage, 'final npm test must pass', 'npm', ['test'], { cwd: tmp });
        validateSpecArtifacts(tmp, 'greet-helper', { requireCompleted: true });
        return { stage, status: 'PASS', tmp };
      } catch (err) {
        return { stage, status: 'FAIL', tmp, error: err.message };
      }
    },
  },

  /**
   * Stage 2: full-spec workflow then /curdx-flow:implement.
   * /curdx-flow:implement compiles a Claude Code native /goal condition via
   * `curdx-flow goal` (the bridge CLI) and then hands execution to the
   * native /goal slash command for multi-turn coordinator-pattern dispatch.
   * This stage validates: full-spec phase creation, native /goal handoff,
   * verify-run contract for verificationBlocks.execution.
   */
  'full-spec-implement': {
    mode: 'claude',
    async run() {
      const stage = 'full-spec-implement';
      const tmp = makeFixtureRoot('full');
      try {
        log(stage, `fixture: ${tmp}`);
        writeGreetFixture(tmp);
        run(stage, 'git init', 'git', ['init', '-b', 'main'], { cwd: tmp });
        run(stage, 'initial npm test must fail', 'npm', ['test'], {
          cwd: tmp,
          expectedStatus: 1,
        });
        // Phase A: full-spec creation (no --quick → research + requirements + design + tasks)
        const startPrompt = [
          '/curdx-flow:start greet-helper',
          '"Implement src/greet.js so npm test passes. Export greet(name). Trim whitespace and return Hello, friend! for empty input."',
          '--no-commit-spec --review minimal',
        ].join(' ');
        runClaudeCode(
          stage,
          'full-spec start (research → tasks)',
          [
            '--plugin-dir',
            pluginRoot,
            '--permission-mode',
            'bypassPermissions',
            '--max-budget-usd',
            maxBudgetUsd,
            '-p',
            startPrompt,
          ],
          { cwd: tmp, timeout: 1200000 },
        );
        const specDir = join(tmp, 'specs', 'greet-helper');
        assert(existsSync(specDir), 'spec dir missing after full-spec start');
        // Do not require tasks.md after phase A: the full-spec workflow may
        // stop earlier (research/requirements). /curdx-flow:implement is
        // expected to backfill any missing phase artifacts before executing.
        assert(
          existsSync(join(specDir, '.curdx-state.json')),
          '.curdx-state.json missing after full-spec start',
        );
        // Phase B: /curdx-flow:implement (goal-driven loop)
        runClaudeCode(
          stage,
          'implement (goal-driven loop)',
          [
            '--plugin-dir',
            pluginRoot,
            '--permission-mode',
            'bypassPermissions',
            '--max-budget-usd',
            maxBudgetUsd,
            '-p',
            '/curdx-flow:implement',
          ],
          { cwd: tmp, timeout: 1500000 },
        );
        run(stage, 'final npm test must pass', 'npm', ['test'], { cwd: tmp });
        validateSpecArtifacts(tmp, 'greet-helper', {
          requireCompleted: true,
          requireDriver: 'goal',
          requirePhaseFiles: ['tasks.md'],
        });
        return { stage, status: 'PASS', tmp };
      } catch (err) {
        return { stage, status: 'FAIL', tmp, error: err.message };
      }
    },
  },

  /**
   * Stage 3: direct-change route. A trivial one-line typo fix should NOT
   * create a spec directory; runtime should apply the change inline.
   */
  'direct-change': {
    mode: 'claude',
    async run() {
      const stage = 'direct-change';
      const tmp = makeFixtureRoot('direct');
      try {
        log(stage, `fixture: ${tmp}`);
        writeDirectChangeFixture(tmp);
        run(stage, 'git init', 'git', ['init', '-b', 'main'], { cwd: tmp });
        const prompt =
          '/curdx-flow:start "Fix the typo in src/greet.js: change Hellp to Hello."';
        runClaudeCode(
          stage,
          'direct-change route',
          [
            '--plugin-dir',
            pluginRoot,
            '--permission-mode',
            'bypassPermissions',
            '--max-budget-usd',
            maxBudgetUsd,
            '-p',
            prompt,
          ],
          { cwd: tmp, timeout: 600000 },
        );
        const code = readFileSync(join(tmp, 'src', 'greet.js'), 'utf8');
        assert(code.includes('Hello,'), 'typo fix not applied');
        assert(!code.includes('Hellp,'), 'old typo still present');
        assert(
          !specsHasNonHiddenChildren(tmp),
          'direct-change route should not create a spec subdir',
        );
        return { stage, status: 'PASS', tmp };
      } catch (err) {
        return { stage, status: 'FAIL', tmp, error: err.message };
      }
    },
  },

  /**
   * Stage 4: resume-current. Pre-build a mid-flight spec state (completed:
   * false, phase: execution) via the runtime CLI, then invoke
   * `curdx-flow route` to assert the router classifies it as resume-current.
   * Pure CLI — no Claude calls.
   */
  'resume-after-interrupt': {
    mode: 'cli',
    async run() {
      const stage = 'resume-after-interrupt';
      const tmp = makeFixtureRoot('resume');
      try {
        log(stage, `fixture: ${tmp}`);
        writeGreetFixture(tmp);
        run(stage, 'git init', 'git', ['init', '-b', 'main'], { cwd: tmp });
        // Build a half-finished spec
        const specsDir = join(tmp, 'specs');
        const specDir = join(specsDir, 'greet-helper');
        mkdirSync(specDir, { recursive: true });
        writeFileSync(join(specsDir, '.current-spec'), 'greet-helper\n');
        writeFileSync(
          join(specDir, 'tasks.md'),
          [
            '## Source Coverage Audit',
            '',
            '- [ ] 1.1 Implement greet helper',
            '  - **Do**: edit src/greet.js then run npm test',
            '  - **Files**: src/greet.js, test/greet.test.js',
            '  - **Done when**: npm test exits 0',
            '  - **Verify**: npm test',
            '',
          ].join('\n'),
        );
        writeFileSync(
          join(specDir, '.curdx-state.json'),
          JSON.stringify(
            {
              version: 2,
              source: 'spec',
              name: 'greet-helper',
              basePath: 'specs/greet-helper',
              identity: {
                name: 'greet-helper',
                basePath: 'specs/greet-helper',
                goal: 'Implement greet helper',
              },
              phase: 'execution',
              taskIndex: 0,
              totalTasks: 1,
              taskIteration: 1,
              maxTaskIterations: 5,
              globalIteration: 1,
              maxGlobalIterations: 30,
              commitSpec: false,
              quickMode: false,
              executionDriver: 'goal',
              completed: false,
            },
            null,
            2,
          ) + '\n',
        );
        // Route should now report resume-current. Do NOT pass a new --goal:
        // router treats any new goal text against an unfinished spec as a
        // blocked-ask-user prompt (verified empirically against the runtime).
        const routeRes = run(
          stage,
          'curdx-flow route on mid-flight spec',
          process.execPath,
          [runtimeCli, 'route', '--cwd', tmp, '--name', 'greet-helper'],
          { cwd: tmp },
        );
        const routeJson = parseJson('route output', routeRes.stdout);
        assert(
          routeJson.route === 'resume-current',
          `route=${routeJson.route}, expected resume-current`,
        );
        // Snapshot must see the spec as active
        const snapRes = run(stage, 'curdx-flow snapshot', process.execPath, [
          runtimeCli,
          'snapshot',
          '--cwd',
          tmp,
        ]);
        const snap = parseJson('snapshot output', snapRes.stdout);
        assert(snap.active === true, 'snapshot.active should be true for resumed spec');
        assert(
          snap.spec?.path === 'specs/greet-helper',
          `snapshot.spec.path=${snap.spec?.path}, expected specs/greet-helper`,
        );
        return { stage, status: 'PASS', tmp };
      } catch (err) {
        return { stage, status: 'FAIL', tmp, error: err.message };
      }
    },
  },

  /**
   * Stage 5: failure-recovery. Source starts blatantly broken so the first
   * `curdx-flow verify run` returns exitCode != 0. The skill must NOT mark
   * completion until verification is green. We assert the final state is
   * completed=true with exitCode=0 AND that npm test really passes — proving
   * Claude iterated, not just lied about completion.
   */
  'failure-recovery': {
    mode: 'claude',
    async run() {
      const stage = 'failure-recovery';
      const tmp = makeFixtureRoot('recovery');
      try {
        log(stage, `fixture: ${tmp}`);
        writeFailureRecoveryFixture(tmp);
        run(stage, 'git init', 'git', ['init', '-b', 'main'], { cwd: tmp });
        run(stage, 'initial npm test must fail', 'npm', ['test'], {
          cwd: tmp,
          expectedStatus: 1,
        });
        const prompt = [
          '/curdx-flow:start greet-helper',
          '"src/greet.js is broken. Fix it so all three tests in test/greet.test.js pass. Do not modify the test file."',
          '--quick --no-commit-spec --mode fast --task-granularity coarse --review minimal',
        ].join(' ');
        runClaudeCode(
          stage,
          'recovery from initial verification failure',
          [
            '--plugin-dir',
            pluginRoot,
            '--permission-mode',
            'bypassPermissions',
            '--max-budget-usd',
            maxBudgetUsd,
            '-p',
            prompt,
          ],
          { cwd: tmp, timeout: 900000 },
        );
        run(stage, 'final npm test must pass', 'npm', ['test'], { cwd: tmp });
        const state = validateSpecArtifacts(tmp, 'greet-helper', { requireCompleted: true });
        assert(
          state.verificationBlocks?.execution?.exitCode === 0,
          'final execution.exitCode must be 0 after recovery',
        );
        // Test file untouched
        const testSrc = readFileSync(join(tmp, 'test', 'greet.test.js'), 'utf8');
        assert(testSrc.includes('Ada Lovelace'), 'test file modified (scoring asset corruption)');
        return { stage, status: 'PASS', tmp };
      } catch (err) {
        return { stage, status: 'FAIL', tmp, error: err.message };
      }
    },
  },

  /**
   * Stage 6: /curdx-flow:refactor on a completed spec. Reuses the lite-spec
   * fixture pattern, runs the full lite-spec to completion, then asks
   * /curdx-flow:refactor to add a follow-up behavior. Validates that the
   * existing spec is updated rather than a new spec being created.
   */
  'refactor-followup': {
    mode: 'claude',
    async run() {
      const stage = 'refactor-followup';
      const tmp = makeFixtureRoot('refactor');
      try {
        log(stage, `fixture: ${tmp}`);
        writeGreetFixture(tmp);
        run(stage, 'git init', 'git', ['init', '-b', 'main'], { cwd: tmp });
        run(stage, 'initial npm test must fail', 'npm', ['test'], {
          cwd: tmp,
          expectedStatus: 1,
        });
        // Phase A: complete the lite-spec
        runClaudeCode(
          stage,
          'lite-spec completion (pre-refactor)',
          [
            '--plugin-dir',
            pluginRoot,
            '--permission-mode',
            'bypassPermissions',
            '--max-budget-usd',
            maxBudgetUsd,
            '-p',
            [
              '/curdx-flow:start greet-helper',
              '"Implement src/greet.js so npm test passes. Export greet(name). Trim whitespace and return Hello, friend! for empty input."',
              '--quick --no-commit-spec --mode fast --task-granularity coarse --review minimal',
            ].join(' '),
          ],
          { cwd: tmp, timeout: 900000 },
        );
        run(stage, 'post-completion npm test', 'npm', ['test'], { cwd: tmp });
        // Capture mtime of state file before refactor
        const stateBefore = readState(tmp, 'greet-helper');
        assert(stateBefore.completed === true, 'pre-refactor state must be completed');
        // Phase B: add new requirement via /curdx-flow:refactor
        // Append a new test case to test/greet.test.js that exercises upper-case fallback
        writeFileSync(
          join(tmp, 'test', 'greet.upper.test.js'),
          [
            "import { strict as assert } from 'node:assert';",
            "import { test } from 'node:test';",
            "import { greet } from '../src/greet.js';",
            '',
            "test('greets without uppercasing names', () => {",
            "  assert.equal(greet('ada'), 'Hello, ada!');",
            '});',
            '',
          ].join('\n'),
        );
        runClaudeCode(
          stage,
          '/curdx-flow:refactor follow-up',
          [
            '--plugin-dir',
            pluginRoot,
            '--permission-mode',
            'bypassPermissions',
            '--max-budget-usd',
            maxBudgetUsd,
            '-p',
            '/curdx-flow:refactor "ensure greet works for lower-case names without uppercasing — see test/greet.upper.test.js"',
          ],
          { cwd: tmp, timeout: 900000 },
        );
        run(stage, 'final npm test must pass', 'npm', ['test'], { cwd: tmp });
        const stateAfter = readState(tmp, 'greet-helper');
        assert(
          specsHasNonHiddenChildren(tmp),
          'spec dir should still exist after refactor',
        );
        assert(
          stateAfter.name === 'greet-helper',
          `refactor should reuse spec, got name=${stateAfter.name}`,
        );
        return { stage, status: 'PASS', tmp };
      } catch (err) {
        return { stage, status: 'FAIL', tmp, error: err.message };
      }
    },
  },

  /**
   * Stage 7: manual mode. `--manual` is an `/curdx-flow:implement` flag
   * (implement/SKILL.md:42). The first version of this stage chained
   * full-spec start → implement --manual, but on simple fixtures the start
   * skill completed the task in one go, so implement found a completed
   * spec and skipped the state-init path that writes executionDriver.
   * Workaround: pre-build an unfinished spec scaffold via fixture writes,
   * then run a single Claude turn of `/curdx-flow:implement --manual`.
   * Asserts only the field the flag is supposed to flip; manual mode is
   * defined as "run one coordinator turn" so we do not require completion.
   */
  'manual-mode': {
    mode: 'claude',
    async run() {
      const stage = 'manual-mode';
      const tmp = makeFixtureRoot('manual');
      try {
        log(stage, `fixture: ${tmp}`);
        writeGreetFixture(tmp);
        run(stage, 'git init', 'git', ['init', '-b', 'main'], { cwd: tmp });
        // Pre-build an unfinished spec scaffold so implement has work to init
        const specsDir = join(tmp, 'specs');
        const specDir = join(specsDir, 'greet-helper');
        mkdirSync(specDir, { recursive: true });
        writeFileSync(join(specsDir, '.current-spec'), 'greet-helper\n');
        writeFileSync(
          join(specDir, 'tasks.md'),
          [
            '## Source Coverage Audit',
            '',
            '- [ ] 1.1 Implement greet helper',
            '  - **Do**: edit src/greet.js so npm test passes (trim input, fall back to friend for empty)',
            '  - **Files**: src/greet.js',
            '  - **Done when**: npm test exits 0',
            '  - **Verify**: npm test',
            '',
          ].join('\n'),
        );
        writeFileSync(
          join(specDir, '.curdx-state.json'),
          JSON.stringify(
            {
              version: 2,
              source: 'spec',
              name: 'greet-helper',
              basePath: 'specs/greet-helper',
              identity: {
                name: 'greet-helper',
                basePath: 'specs/greet-helper',
                goal: 'Implement greet helper',
              },
              phase: 'tasks',
              taskIndex: 0,
              totalTasks: 1,
              commitSpec: false,
              quickMode: false,
              completed: false,
            },
            null,
            2,
          ) + '\n',
        );
        runClaudeCode(
          stage,
          'implement --manual on unfinished spec',
          [
            '--plugin-dir',
            pluginRoot,
            '--permission-mode',
            'bypassPermissions',
            '--max-budget-usd',
            maxBudgetUsd,
            '-p',
            '/curdx-flow:implement --manual',
          ],
          { cwd: tmp, timeout: 1200000 },
        );
        const state = readState(tmp, 'greet-helper');
        assert(
          state.executionDriver === 'manual',
          `executionDriver=${state.executionDriver}, expected manual`,
        );
        return { stage, status: 'PASS', tmp };
      } catch (err) {
        return { stage, status: 'FAIL', tmp, error: err.message };
      }
    },
  },
};

// ---------------------- orchestrator ----------------------

function shouldRun(name) {
  if (filter.length === 0) return true;
  return filter.some((f) => name.includes(f));
}

function cleanupTmp(result) {
  if (keepTmp) return;
  if (!result.tmp) return;
  try {
    rmSync(result.tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

/**
 * Pass-at-k retry: claude-driven stages are flaky because the LLM may
 * occasionally take an unexpected route. SWE-bench++ reports only ~39% of
 * agent runs are fully deterministic, so the industry pattern is best-of-n.
 * Here we use a cheap "first PASS wins" variant: run up to `maxAttempts`,
 * stop as soon as one attempt passes. CLI-only stages (mode='cli') do not
 * retry — they're deterministic and a re-run wastes time.
 */
async function runStageOnce(name, spec) {
  const start = Date.now();
  let r;
  try {
    r = await spec.run();
  } catch (err) {
    r = { stage: name, status: 'FAIL', error: err.message };
  }
  r.durationMs = Date.now() - start;
  return r;
}

async function runStageWithRetry(name, spec) {
  const maxAttempts =
    spec.mode === 'cli'
      ? 1
      : Math.max(1, Number(process.env.CURDX_FLOW_E2E_MAX_ATTEMPTS) || 2);
  const attempts = [];
  for (let i = 0; i < maxAttempts; i++) {
    if (maxAttempts > 1) {
      console.log(`---------- [${name}] attempt ${i + 1}/${maxAttempts} ----------`);
    }
    const r = await runStageOnce(name, spec);
    r.attemptNumber = i + 1;
    attempts.push(r);
    if (r.status === 'PASS') break;
    // Cleanup failed attempt's tmp unless KEEP_TMP — next attempt makes its own fixture
    if (i < maxAttempts - 1 && !keepTmp && r.tmp) {
      try {
        rmSync(r.tmp, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  }
  const winner = attempts.find((a) => a.status === 'PASS') ?? attempts[attempts.length - 1];
  winner.attempts = attempts.length;
  winner.totalDurationMs = attempts.reduce((s, a) => s + (a.durationMs ?? 0), 0);
  return winner;
}

async function main() {
  const started = Date.now();
  const results = [];
  for (const name of stageOrder) {
    if (!shouldRun(name)) {
      results.push({ stage: name, status: 'SKIP' });
      continue;
    }
    const spec = stages[name];
    if (!spec) {
      results.push({ stage: name, status: 'FAIL', error: 'no such stage' });
      continue;
    }
    console.log(`\n========== [${name}] mode=${spec.mode} ==========`);
    const result = await runStageWithRetry(name, spec);
    results.push(result);
    cleanupTmp(result);
  }

  const totalMs = Date.now() - started;
  console.log('\n========== SUITE SUMMARY ==========');
  console.log(
    [
      `total: ${(totalMs / 1000).toFixed(1)}s`,
      `pass: ${results.filter((r) => r.status === 'PASS').length}`,
      `fail: ${results.filter((r) => r.status === 'FAIL').length}`,
      `skip: ${results.filter((r) => r.status === 'SKIP').length}`,
    ].join('  '),
  );
  for (const r of results) {
    const dur =
      r.totalDurationMs != null
        ? `${(r.totalDurationMs / 1000).toFixed(1)}s`
        : r.durationMs != null
          ? `${(r.durationMs / 1000).toFixed(1)}s`
          : '-';
    const tries = r.attempts && r.attempts > 1 ? `  attempts=${r.attempts}` : '';
    const tail = r.status === 'FAIL' ? `  → ${r.error}` : '';
    const tmp = keepTmp && r.tmp ? `  tmp=${r.tmp}` : '';
    console.log(`  [${r.status}] ${r.stage}  (${dur})${tries}${tail}${tmp}`);
  }
  const anyFail = results.some((r) => r.status === 'FAIL');
  process.exit(anyFail ? 1 : 0);
}

main().catch((err) => {
  console.error('[e2e-suite] orchestrator crashed:', err);
  process.exit(2);
});
