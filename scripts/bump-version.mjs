#!/usr/bin/env node
// Atomic version bumper. Writes the target version into every field that
// check-versions.mjs validates, then runs that gate to confirm alignment.
//
// Usage:
//   node scripts/bump-version.mjs <X.Y.Z>          # exact semver
//   node scripts/bump-version.mjs patch|minor|major
//   node scripts/bump-version.mjs <...> --dry-run  # plan only, no writes
//
// Why: CLAUDE.md's release SOP step 2 used to be "manually sync version
// fields." `npm version` covers package.json + package-lock.json (root +
// packages[""]); this script extends the same atomic action to plugin.json
// so future releases can't regress to the v5.0.0 / v6.0.0 drift incidents
// that motivated check-versions.mjs. The marketplace entry no longer carries
// a version (plugin.json is the single source; `claude plugin tag` validates
// plugin<->marketplace agreement at tag time), so it is not patched here.
//
// The plugin.json write uses targeted regex replacement (NOT JSON.parse +
// JSON.stringify) so the rest of the file's formatting — notably the inline
// `keywords` array — stays byte-identical.

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
// newline).
function patchVersionField(rel, newVersion) {
  const abs = path.join(repoRoot, rel);
  const original = readFileSync(abs, 'utf8');
  const re = /("version"\s*:\s*")[^"]+(")/;
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
// Accept exact semver, including pre-release suffixes (e.g. 7.0.0-alpha.0,
// 7.0.0-beta.1, 7.0.0-rc.0). Build metadata (`+build.123`) is intentionally
// not supported — npm strips it and we want the gate to flag the difference.
if (/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(arg)) {
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

// 3. Confirm with the existing gate.
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
