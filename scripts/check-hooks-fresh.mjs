#!/usr/bin/env node
// Detect source-bundle drift: rebuild hooks then check git diff for changes.
//
// Use case: CI gate to ensure committed .mjs bundles match current src/hooks/*.ts.
// Replaces the manual "did you remember to npm run build:hooks?" footgun.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const HOOKS_DIR = 'plugins/curdx-flow/hooks/scripts';

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const file = path.join(dir, entry);
    const st = statSync(file);
    if (st.isDirectory()) {
      out.push(...listFiles(file));
    } else if (st.isFile()) {
      out.push(file);
    }
  }
  return out.sort();
}

function hashTree(dir) {
  const hash = createHash('sha256');
  for (const file of listFiles(dir)) {
    hash.update(path.relative(dir, file));
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

const before = hashTree(HOOKS_DIR);

console.log('[check:hooks-fresh] rebuilding hooks bundle…');
run('node', ['scripts/build-hooks.mjs']);

console.log('[check:hooks-fresh] checking for build output changes…');
const after = hashTree(HOOKS_DIR);
if (before !== after) {
  spawnSync('git', ['diff', '--', `${HOOKS_DIR}/`], {
  stdio: 'inherit',
  });
  console.error('');
  console.error('[check:hooks-fresh] source-bundle drift detected.');
  console.error('  → Run `npm run build:hooks` and commit the regenerated bundles.');
  process.exit(1);
}

console.log('[check:hooks-fresh] OK — bundles match source.');
