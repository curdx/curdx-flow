// scripts/build-hooks.mjs
//
// esbuild driver for plugin hooks.
// Bundles src/hooks/*.ts (HOOK_ENTRIES) and src/hooks/lib/*.ts (LIB_ENTRIES)
// into plugins/curdx-flow/hooks/scripts/*.mjs as single-file ESM.
//
// Tolerant of missing entries: skips with a console note so this driver runs
// to completion even before any hooks have been ported (task 1.9 baseline).
//
// Spec: specs/cross-platform-support/design.md → "Build Pipeline → esbuild 配置".

import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const HOOK_ENTRIES = [
  'src/hooks/load-spec-context.ts',
  'src/hooks/post-compact-recorder.ts',
  'src/hooks/post-tool-batch-snapshot.ts',
  'src/hooks/post-tool-edit-stamp.ts',
  'src/hooks/quick-mode-guard.ts',
  'src/hooks/stop-failure-handler.ts',
  'src/hooks/stop-watcher.ts',
  'src/hooks/subagent-context-injector.ts',
  'src/hooks/subagent-stop-recorder.ts',
  'src/hooks/task-completed-verifier.ts',
  'src/hooks/user-prompt-expansion-guard.ts',
  'src/hooks/user-prompt-submit-autopilot.ts',
  'src/hooks/update-spec-index.ts',
];

/**
 * Collect entrypoints matching `<dir>/*.ts`. Returns repo-relative paths.
 * Returns [] if directory doesn't exist (e.g. lib/ before tasks 2.x).
 */
async function collectGlob(relDir) {
  const absDir = path.join(REPO_ROOT, relDir);
  if (!existsSync(absDir)) return [];
  const names = await readdir(absDir);
  return names
    .filter((n) => n.endsWith('.ts'))
    .map((n) => path.posix.join(relDir, n));
}

const LIB_ENTRIES = await collectGlob('src/hooks/lib');

const BANNER = `
import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);
`.trim();

// Filter out entries whose source files don't exist yet. Driver must run to
// completion even if HOOK_ENTRIES is empty (task 1.9 done-when criterion).
const allEntries = [...HOOK_ENTRIES, ...LIB_ENTRIES];
const presentEntries = [];
for (const entry of allEntries) {
  const abs = path.join(REPO_ROOT, entry);
  if (existsSync(abs)) {
    presentEntries.push(entry);
  } else {
    console.log(`[build-hooks] skip (not yet created): ${entry}`);
  }
}

if (presentEntries.length === 0) {
  console.log('[build-hooks] no entrypoints present — nothing to bundle.');
  process.exit(0);
}

await build({
  entryPoints: presentEntries,
  outdir: 'plugins/curdx-flow/hooks/scripts',
  outbase: 'src/hooks',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  packages: 'bundle',
  outExtension: { '.js': '.mjs' },
  banner: { js: BANNER },
  treeShaking: true,
  sourcemap: 'linked',
  minify: false, // readable for plugin auditability
  logLevel: 'info',
});

console.log(`[build-hooks] bundled ${presentEntries.length} entrypoint(s).`);
