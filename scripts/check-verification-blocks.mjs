#!/usr/bin/env node
// Release-time gate: assert the active spec's verificationBlocks are present,
// passing, and not stale. Per design.md §Component 7 (D3 hybrid: extend
// `npm run verify` + `npx curdx-flow check`), this script is the canonical
// release-boundary impl; CLI subcommand (Task 2.22) imports the same idea.
//
// Why a standalone .mjs (not an import of src/hooks/lib/verify-blocks.ts):
// `npm run verify` runs against built artifacts, before any TS toolchain is
// guaranteed available. Keep this script zero-dep, ESM, node-builtins-only.
// The comparison logic mirrors verify-blocks.ts in spirit but is duplicated
// intentionally — small (~30 LOC) and stable.
//
// Behavior:
//   1. Resolve active spec dir:
//        a. specs/.current-spec (project convention; .curdx/active-spec is
//           not used by curdx-flow today — see learning in .progress.md).
//        b. else: latest-mtime sub-dir under ./specs/ that contains a
//           .curdx-state.json file.
//        c. if neither: graceful no-op exit 0 (CI in non-spec repos must not
//           break — see learning "check-verification-blocks.mjs needs
//           graceful no-op" in .progress.md).
//   2. Read <specDir>/.curdx-state.json.
//   3. If verificationBlocks missing/empty → exit 2 with actionable stderr.
//   4. For each present phase block: assert exitCode === 0 AND
//      Date.parse(block.timestamp) >= block.srcMtime (per task 2.20 step-3).
//   5. On any failure → exit 2 with stderr listing failed phases + re-run cmd.
//   6. On all-pass → stdout "All verificationBlocks valid." + exit 0.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const specsDir = path.join(repoRoot, 'specs');

const VERIFICATION_PHASES = ['research', 'requirements', 'design', 'tasks', 'execution'];

function resolveActiveSpecDir() {
  // (a) specs/.current-spec pointer
  const pointer = path.join(specsDir, '.current-spec');
  if (existsSync(pointer)) {
    const name = readFileSync(pointer, 'utf8').trim();
    if (name) {
      const dir = path.join(specsDir, name);
      if (existsSync(path.join(dir, '.curdx-state.json'))) return dir;
    }
  }
  // (b) latest-mtime spec dir with state file
  if (!existsSync(specsDir)) return null;
  let entries;
  try {
    entries = readdirSync(specsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  let latest = null;
  let latestMtime = 0;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
    const stateFile = path.join(specsDir, e.name, '.curdx-state.json');
    if (!existsSync(stateFile)) continue;
    try {
      const st = statSync(stateFile);
      if (st.mtimeMs > latestMtime) {
        latestMtime = st.mtimeMs;
        latest = path.join(specsDir, e.name);
      }
    } catch {
      // ignore
    }
  }
  return latest;
}

const specDir = resolveActiveSpecDir();
if (!specDir) {
  // Graceful no-op for non-spec repos / CI without an active spec.
  console.log('check-verification-blocks: no active spec found, skipping.');
  process.exit(0);
}

const stateFile = path.join(specDir, '.curdx-state.json');
let state;
try {
  state = JSON.parse(readFileSync(stateFile, 'utf8'));
} catch (err) {
  console.error(`✗ failed to read ${path.relative(repoRoot, stateFile)}: ${err.message}`);
  process.exit(2);
}

const blocks = state.verificationBlocks;
const presentPhases = blocks
  ? Object.keys(blocks).filter((p) => blocks[p] !== undefined && blocks[p] !== null)
  : [];

if (!blocks || presentPhases.length === 0) {
  console.error('✗ No verificationBlocks found. Run the appropriate phase verification command.');
  console.error(`  Active spec: ${path.relative(repoRoot, specDir)}`);
  console.error('  Hint: each phase must record an entry in .curdx-state.json::verificationBlocks');
  console.error('        (see plugins/curdx-flow/references/iron-law-verification.md).');
  process.exit(2);
}

const failures = [];
for (const phase of presentPhases) {
  if (!VERIFICATION_PHASES.includes(phase)) {
    failures.push({ phase, reason: `unknown phase key "${phase}"`, command: '(remove from state)' });
    continue;
  }
  const block = blocks[phase];
  if (typeof block !== 'object' || block === null) {
    failures.push({ phase, reason: 'block is not an object', command: '(rewrite block)' });
    continue;
  }
  const { command = '(unknown command)', exitCode, timestamp, srcMtime } = block;
  if (exitCode !== 0) {
    failures.push({
      phase,
      reason: block.failedReason
        ? `verification failed: ${block.failedReason} (exitCode=${exitCode})`
        : `verification failed (exitCode=${exitCode})`,
      command,
    });
    continue;
  }
  const ts = Date.parse(timestamp);
  if (Number.isNaN(ts)) {
    failures.push({ phase, reason: `invalid timestamp "${timestamp}"`, command });
    continue;
  }
  if (typeof srcMtime !== 'number' || !Number.isFinite(srcMtime) || srcMtime < 0) {
    failures.push({ phase, reason: `invalid srcMtime ${srcMtime}`, command });
    continue;
  }
  // Task 2.20 step-3: timestamp >= srcMtime (i.e. verification ran AFTER the
  // last src edit). Equivalent to verify-blocks.ts canonical check
  // `block.srcMtime > Date.parse(block.timestamp)` negated — same semantics.
  if (ts < srcMtime) {
    const srcIso = new Date(srcMtime).toISOString();
    failures.push({
      phase,
      reason: `stale evidence: src changed at ${srcIso}, last verified at ${timestamp}`,
      command,
    });
  }
}

if (failures.length > 0) {
  console.error('✗ verificationBlocks gate failed:');
  console.error(`  Active spec: ${path.relative(repoRoot, specDir)}`);
  for (const f of failures) {
    console.error(`  - phase "${f.phase}": ${f.reason}`);
    console.error(`      Re-run: ${f.command}`);
  }
  console.error('');
  console.error('See plugins/curdx-flow/references/iron-law-verification.md for the full checklist.');
  process.exit(2);
}

console.log('All verificationBlocks valid.');
console.log(`  Active spec: ${path.relative(repoRoot, specDir)}`);
console.log(`  Phases verified: ${presentPhases.join(', ')}`);
process.exit(0);
