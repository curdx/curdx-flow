#!/usr/bin/env node
// Detect source-bundle drift: rebuild hooks then check git diff for changes.
//
// Use case: CI gate to ensure committed .mjs bundles match current src/hooks/*.ts.
// Replaces the manual "did you remember to npm run build:hooks?" footgun.

import { spawnSync } from 'node:child_process';

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

console.log('[check:hooks-fresh] rebuilding hooks bundle…');
run('node', ['scripts/build-hooks.mjs']);

console.log('[check:hooks-fresh] checking for diff…');
const diff = spawnSync('git', ['diff', '--exit-code', 'plugins/curdx-flow/hooks/scripts/'], {
  stdio: 'inherit',
});
if (diff.status !== 0) {
  console.error('');
  console.error('[check:hooks-fresh] source-bundle drift detected.');
  console.error('  → Run `npm run build:hooks` and commit the regenerated bundles.');
  process.exit(1);
}

console.log('[check:hooks-fresh] OK — bundles match source.');
