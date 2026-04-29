#!/usr/bin/env node
// Atomic version bumper. Writes the target version into all 5 fields that
// check-versions.mjs validates, then runs that gate to confirm alignment.
//
// Usage:
//   node scripts/bump-version.mjs <X.Y.Z>          # exact semver
//   node scripts/bump-version.mjs patch|minor|major
//   node scripts/bump-version.mjs <...> --dry-run  # plan only, no writes
//
// Why: CLAUDE.md's release SOP step 2 used to be "manually sync 5 version
// fields." `npm version` covers package.json + package-lock.json (root +
// packages[""]); this script extends the same atomic action to plugin.json
// and marketplace.json so future releases can't regress to the v5.0.0 /
// v6.0.0 drift incidents that motivated check-versions.mjs.
//
// The plugin.json / marketplace.json writes use targeted regex replacement
// (NOT JSON.parse + JSON.stringify) so the rest of each file's formatting —
// notably plugin.json's inline `keywords` array — stays byte-identical.

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const positional = args.filter((a) => !a.startsWith('--'));

if (positional.length !== 1) {
  console.error('Usage: bump-version.mjs <X.Y.Z|patch|minor|major> [--dry-run]');
  process.exit(2);
}

const arg = positional[0];

function readJson(rel) {
  return JSON.parse(readFileSync(path.join(repoRoot, rel), 'utf8'));
}

// Replace exactly one `"version": "..."` field in-place, preserving every
// other byte of the file (whitespace, key order, inline arrays, trailing
// newline). When `afterName` is given, the version replaced is the first
// one that appears after `"name": "<afterName>"`, so we can disambiguate
// nested entries (e.g. marketplace.json's plugins[name=curdx-flow]).
function patchVersionField(rel, newVersion, opts = {}) {
  const abs = path.join(repoRoot, rel);
  const original = readFileSync(abs, 'utf8');
  const re = opts.afterName
    ? new RegExp(
        `("name"\\s*:\\s*"${opts.afterName}"[\\s\\S]*?"version"\\s*:\\s*")[^"]+(")`,
      )
    : /("version"\s*:\s*")[^"]+(")/;
  if (!re.test(original)) {
    console.error(`✗ version pattern not found in ${rel}`);
    process.exit(1);
  }
  const updated = original.replace(re, `$1${newVersion}$2`);
  writeFileSync(abs, updated);
  console.log(`✓ ${rel}`);
}

const pkg = readJson('package.json');
const current = pkg.version;

let target;
if (/^\d+\.\d+\.\d+$/.test(arg)) {
  target = arg;
} else if (['patch', 'minor', 'major'].includes(arg)) {
  const [maj, min, pat] = current.split('.').map(Number);
  if ([maj, min, pat].some((n) => Number.isNaN(n))) {
    console.error(`✗ unparseable current version: ${current}`);
    process.exit(2);
  }
  target =
    arg === 'major'
      ? `${maj + 1}.0.0`
      : arg === 'minor'
        ? `${maj}.${min + 1}.0`
        : `${maj}.${min}.${pat + 1}`;
} else {
  console.error(`✗ invalid argument: ${arg}`);
  console.error('  expected: <X.Y.Z> | patch | minor | major');
  process.exit(2);
}

console.log(`Bumping: ${current} → ${target}${dryRun ? ' (dry-run)' : ''}`);

const writes = [
  'package.json',
  'package-lock.json (root + packages[""])',
  'plugins/curdx-flow/.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json plugins[curdx-flow]',
];

if (dryRun) {
  console.log('  Would update:');
  for (const w of writes) console.log(`    ${w}`);
  process.exit(0);
}

// 1. npm version handles package.json + package-lock.json (both fields).
const npmRes = spawnSync(
  'npm',
  ['version', target, '--no-git-tag-version'],
  { cwd: repoRoot, stdio: 'inherit' },
);
if (npmRes.status !== 0) {
  console.error('✗ npm version failed (often: same version, or dirty lockfile)');
  process.exit(npmRes.status ?? 1);
}

// 2. plugin.json — top-level version, only one in the file.
patchVersionField('plugins/curdx-flow/.claude-plugin/plugin.json', target);

// 3. marketplace.json — version sits inside plugins[name=curdx-flow].
patchVersionField('.claude-plugin/marketplace.json', target, {
  afterName: 'curdx-flow',
});

// 4. Confirm with the existing gate.
const checkRes = spawnSync('node', ['scripts/check-versions.mjs'], {
  cwd: repoRoot,
  stdio: 'inherit',
});
if (checkRes.status !== 0) {
  console.error('✗ check-versions failed after bump — versions are out of sync');
  process.exit(checkRes.status ?? 1);
}

console.log(`✓ bumped to ${target}`);
console.log('  Next: update CHANGELOG.md, then `git commit && git tag v' + target + ' && git push --tags`');
