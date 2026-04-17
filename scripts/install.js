#!/usr/bin/env node
/**
 * curdx-flow installer
 *
 * Idempotent install of curdx-flow + its dependencies (claude-mem, pua) and MCPs.
 *
 * Pattern borrowed from gstack's bin/gstack-settings-hook (atomic tmp+rename),
 * BMAD's per-module manifest, and spec-kit's SHA-256 file tracking.
 *
 * Flags:
 *   --dry-run       print the install plan, don't mutate
 *   --force         re-install even if state shows "already done"
 *   --repair        re-add hooks the user disabled (otherwise respected)
 *   --no-deps       skip claude-mem and pua, install only curdx-flow plugin itself
 *   --skip-claude   skip claude plugin marketplace add/install (CI environments)
 *   --verbose       extra logging
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

const STATE_DIR = path.join(os.homedir(), '.curdx');
const STATE_FILE = path.join(STATE_DIR, 'install-state.json');
const LOCK_FILE = path.join(STATE_DIR, '.install.lock');
const SCHEMA_VERSION = 1;
const PKG = require(path.join(__dirname, '..', 'package.json'));

const ARGS = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const out = { dryRun: false, force: false, repair: false, noDeps: false, skipClaude: false, verbose: false };
  for (const a of argv) {
    switch (a) {
      case '--dry-run': out.dryRun = true; break;
      case '--force': out.force = true; break;
      case '--repair': out.repair = true; break;
      case '--no-deps': out.noDeps = true; break;
      case '--skip-claude': out.skipClaude = true; break;
      case '--verbose': case '-v': out.verbose = true; break;
      case 'install': case 'help': case '--help': case '-h':
        if (a === 'help' || a === '--help' || a === '-h') { printHelp(); process.exit(0); }
        break;
      default:
        if (a.startsWith('--')) {
          console.error(`unknown flag: ${a}`);
          printHelp();
          process.exit(2);
        }
    }
  }
  return out;
}

function printHelp() {
  console.log(`
curdx-flow installer v${PKG.version}

usage:
  npx curdx-flow install [flags]
  curdx-flow install [flags]

flags:
  --dry-run       print the install plan, don't mutate
  --force         re-install even if state shows already done
  --repair        re-add hooks the user disabled (otherwise respected)
  --no-deps       skip claude-mem and pua, install only curdx-flow itself
  --skip-claude   skip 'claude plugin' commands (for CI / sandboxed envs)
  --verbose, -v   extra logging
  --help, -h      show this help

state file: ${STATE_FILE}
`);
}

function log(...args) { console.log('[curdx-flow]', ...args); }
function vlog(...args) { if (ARGS.verbose) console.log('[curdx-flow:debug]', ...args); }
function warn(...args) { console.warn('[curdx-flow:warn]', ...args); }
function err(...args) { console.error('[curdx-flow:error]', ...args); }

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function atomicWriteJson(file, data) {
  ensureDir(path.dirname(file));
  const tmp = file + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch (e) { warn(`could not parse ${file}: ${e.message}`); return fallback; }
}

function isProcessAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; }
}

function acquireLock() {
  ensureDir(STATE_DIR);
  if (fs.existsSync(LOCK_FILE)) {
    const existing = readJson(LOCK_FILE, null);
    if (existing && existing.pid && isProcessAlive(existing.pid)) {
      err(`another install is running (pid ${existing.pid}, started ${existing.startedAt}).`);
      err(`if you're sure it's stuck, delete ${LOCK_FILE}`);
      process.exit(1);
    } else {
      warn('found stale lock; overwriting');
    }
  }
  atomicWriteJson(LOCK_FILE, { pid: process.pid, startedAt: new Date().toISOString() });
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch (e) { /* ignore */ }
}

function commandExists(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'pipe' });
  return r.status === 0;
}

function run(cmd, opts = {}) {
  if (ARGS.dryRun) {
    log(`[dry-run] would run: ${cmd}`);
    return { ok: true, output: '' };
  }
  vlog(`run: ${cmd}`);
  try {
    const output = execSync(cmd, { stdio: opts.silent ? 'pipe' : 'inherit', encoding: 'utf-8', ...opts });
    return { ok: true, output: typeof output === 'string' ? output : '' };
  } catch (e) {
    return { ok: false, error: e.message, output: e.stdout ? String(e.stdout) : '' };
  }
}

function loadState() {
  return readJson(STATE_FILE, {
    schemaVersion: SCHEMA_VERSION,
    version: null,
    installedAt: null,
    lastUpdated: null,
    installerPlatform: `${process.platform}-${process.arch}`,
    dependencies: {},
    mcpsRegistered: [],
    hooksRegistered: [],
    userOverrides: {},
    migrationsRun: []
  });
}

function saveState(state) {
  if (ARGS.dryRun) { log('[dry-run] would write state.json'); return; }
  state.lastUpdated = new Date().toISOString();
  atomicWriteJson(STATE_FILE, state);
}

// ---------- install steps ----------

function stepInstallClaudeMem(state) {
  if (ARGS.noDeps) { log('skip claude-mem (--no-deps)'); return; }
  const installed = state.dependencies['claude-mem'];
  if (installed && !ARGS.force) {
    log(`claude-mem already installed (v${installed.version || 'unknown'}); skip. use --force to re-run.`);
    return;
  }
  log('installing claude-mem (cross-session memory layer)...');
  if (!commandExists('npx')) { err('npx not found; install Node.js first'); process.exit(1); }
  const r = run('npx -y claude-mem@latest install --ide claude-code');
  if (!r.ok) {
    warn(`claude-mem install failed: ${r.error}. continuing without it; re-run with --force later.`);
    state.dependencies['claude-mem'] = { installed: false, error: r.error, attemptedAt: new Date().toISOString() };
    return;
  }
  state.dependencies['claude-mem'] = { installed: true, installedAt: new Date().toISOString(), source: 'npx-claude-mem' };
}

function stepInstallPua(state) {
  if (ARGS.noDeps) { log('skip pua (--no-deps)'); return; }
  if (ARGS.skipClaude) { log('skip pua (--skip-claude)'); return; }
  const installed = state.dependencies['pua'];
  if (installed && !ARGS.force) {
    log(`pua already installed; skip. use --force to re-run.`);
    return;
  }
  log('installing pua (failure-detection + behavioral protocol)...');
  if (!commandExists('claude')) {
    warn('claude CLI not found; pua install requires `claude plugin` commands. skipping.');
    state.dependencies['pua'] = { installed: false, error: 'claude CLI missing', attemptedAt: new Date().toISOString() };
    return;
  }
  let r = run('claude plugin marketplace add tanweai/pua', { silent: true });
  if (!r.ok && !/already added|exists/i.test(r.output + r.error)) {
    warn(`pua marketplace add failed: ${r.error || r.output}`);
  }
  r = run('claude plugin install pua@pua-skills', { silent: true });
  if (!r.ok && !/already installed/i.test(r.output + r.error)) {
    warn(`pua install failed: ${r.error || r.output}. continuing.`);
    state.dependencies['pua'] = { installed: false, error: r.error, attemptedAt: new Date().toISOString() };
    return;
  }
  state.dependencies['pua'] = { installed: true, installedAt: new Date().toISOString(), source: 'claude-marketplace' };
}

function detectMarketplace() {
  // Priority:
  //  1. CURDX_MARKETPLACE env var (explicit user override)
  //  2. Local dev: if we can find our own marketplace.json on disk, use that path
  //  3. Default: the published GitHub shorthand "curdx/curdx-flow"
  if (process.env.CURDX_MARKETPLACE) return { mp: process.env.CURDX_MARKETPLACE, mode: 'env' };
  const localRoot = path.join(__dirname, '..');
  if (fs.existsSync(path.join(localRoot, '.claude-plugin', 'marketplace.json'))) {
    return { mp: localRoot, mode: 'local' };
  }
  return { mp: 'curdx/curdx-flow', mode: 'remote' };
}

function stepInstallSelf(state) {
  if (ARGS.skipClaude) { log('skip curdx-flow plugin install (--skip-claude)'); return; }
  if (state.dependencies['curdx-flow'] && !ARGS.force) {
    log(`curdx-flow plugin already installed; skip. use --force to re-run.`);
    return;
  }
  if (!commandExists('claude')) {
    warn('claude CLI not found; cannot install curdx-flow plugin via marketplace.');
    warn('clone the repo and reference its directory in your .claude/ folder, or install the claude CLI.');
    return;
  }
  const { mp, mode } = detectMarketplace();
  log(`installing curdx-flow plugin into Claude Code (${mode} marketplace: ${mp})...`);

  // In local mode, if a prior install cached an older/broken plugin under the same
  // marketplace identifier, upgrading our local file doesn't auto-invalidate the cache.
  // Run `marketplace update` first to refresh; ignore errors if marketplace wasn't added yet.
  if (mode === 'local' || ARGS.force) {
    run('claude plugin marketplace update curdx-flow', { silent: true });
  }

  let r = run(`claude plugin marketplace add ${mp}`, { silent: true });
  if (!r.ok && !/already added|exists/i.test(r.output + r.error)) {
    warn(`marketplace add failed: ${r.error || r.output}. you may need to add it manually.`);
  }

  r = run('claude plugin install curdx@curdx-flow', { silent: true });
  if (!r.ok && !/already installed/i.test(r.output + r.error)) {
    warn(`curdx-flow install failed: ${r.error || r.output}.`);
    // If we're in local mode and the user previously installed from this marketplace,
    // a stale cache may be interfering. Suggest concrete next step.
    if (mode === 'local') {
      warn('local-dev tip: try `claude plugin uninstall curdx@curdx-flow && claude plugin marketplace remove curdx-flow` then re-run this installer.');
    }
    return;
  }
  state.dependencies['curdx-flow'] = {
    installed: true,
    version: PKG.version,
    installedAt: new Date().toISOString(),
    marketplaceMode: mode,
    marketplacePath: mp,
  };
}

function runMigrations(state) {
  const migDir = path.join(__dirname, '..', 'migrations');
  if (!fs.existsSync(migDir)) return;
  const files = fs.readdirSync(migDir).filter(f => /^v[\d.]+\.js$/.test(f)).sort();
  for (const f of files) {
    const ver = f.replace(/^v|\.js$/g, '');
    if (state.migrationsRun.includes(ver)) continue;
    log(`running migration ${ver}...`);
    if (ARGS.dryRun) { log(`[dry-run] would run migration ${ver}`); continue; }
    try {
      require(path.join(migDir, f))(state);
      state.migrationsRun.push(ver);
    } catch (e) {
      warn(`migration ${ver} failed: ${e.message}; continuing anyway (idempotent re-run on next install)`);
    }
  }
}

// ---------- main ----------

function main() {
  log(`curdx-flow installer v${PKG.version}`);
  if (ARGS.dryRun) log('DRY RUN — no changes will be made');

  ensureDir(STATE_DIR);
  acquireLock();

  let exitCode = 0;
  try {
    const state = loadState();
    state.version = PKG.version;
    state.installedAt = state.installedAt || new Date().toISOString();

    stepInstallClaudeMem(state);
    stepInstallPua(state);
    stepInstallSelf(state);
    runMigrations(state);

    saveState(state);

    log('install complete.');
    log('next: cd into a project, run `claude`, then `/curdx:init`');
    log(`state: ${STATE_FILE}`);
  } catch (e) {
    err(`install failed: ${e.message}`);
    if (ARGS.verbose) console.error(e.stack);
    exitCode = 1;
  } finally {
    releaseLock();
  }
  process.exit(exitCode);
}

main();
