#!/usr/bin/env node
// Release-time gate: assert the active spec's verificationBlocks are present,
// passing, and not stale. Per design.md §Component 7 (D3 hybrid: extend
// `npm run verify` + `npx curdx-flow check`), this script is the canonical
// release-boundary impl.
//
// Task 2.23: this script and the `npx @curdx/flow check` CLI subcommand
// (`src/cli/commands/check.ts`) now share one source — the bundled lib at
// `plugins/curdx-flow/hooks/scripts/lib/check-verification-blocks.mjs`,
// produced from `src/hooks/lib/check-verification-blocks.ts` via
// `scripts/build-hooks.mjs`.
//
// Why import the bundled .mjs and not the .ts source?
// `npm run verify` runs against built artifacts, before any TS toolchain is
// guaranteed available (the verify chain explicitly does `build:hooks`
// first). Importing the bundled lib keeps this script zero-dep, ESM,
// node-builtins-only at runtime — same constraint as the original Task
// 2.20 standalone impl. The `prepublishOnly` and `verify` scripts both
// build hooks before invoking this script, so the bundle is always
// fresh when this script runs.
//
// Behavior is unchanged from Task 2.20: the lib's `runVerificationCheck`
// is a verbatim port of the standalone logic. Stdout / stderr / exit
// codes are byte-equal to the previous standalone behavior.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const libPath = path.resolve(
  repoRoot,
  'plugins/curdx-flow/hooks/scripts/lib/check-verification-blocks.mjs',
);

if (!existsSync(libPath)) {
  console.error(
    `✗ check-verification-blocks: bundled lib missing at ${path.relative(repoRoot, libPath)}.`,
  );
  console.error('  Run `npm run build:hooks` first (the verify chain does this automatically).');
  process.exit(2);
}

const { runVerificationCheck } = await import(libPath);
const result = await runVerificationCheck({ repoRoot });

if (result.ok) {
  process.stdout.write(result.message);
  process.exit(0);
}

process.stderr.write(result.message);
process.exit(2);
