#!/usr/bin/env node
// Version consistency gate. Run before npm publish / release.
//
// Asserts that the four version-bearing files all agree:
//   1. package.json                                            (npm package)
//   2. package-lock.json                                       (lockfile root)
//   3. plugins/curdx-flow/.claude-plugin/plugin.json           (plugin manifest)
//   4. .claude-plugin/marketplace.json (plugins[name=curdx-flow]) (marketplace index)
//
// Why: incident on 2026-04-27 — v5.0.0 plugin commit bumped plugin.json but
// missed marketplace.json, so claude CLI kept advertising 4.9.1 and the
// installer's update path silently no-op'd. This script makes that class of
// drift a hard build failure.
//
// Exits 0 when all four match, non-zero with a diff table when they don't.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function readJson(rel) {
  const abs = path.join(repoRoot, rel);
  try {
    return JSON.parse(readFileSync(abs, 'utf8'));
  } catch (err) {
    console.error(`✗ failed to read ${rel}: ${err.message}`);
    process.exit(2);
  }
}

const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const pluginManifest = readJson('plugins/curdx-flow/.claude-plugin/plugin.json');
const marketplace = readJson('.claude-plugin/marketplace.json');

const marketplaceEntry = marketplace.plugins?.find((p) => p.name === 'curdx-flow');
if (!marketplaceEntry) {
  console.error('✗ .claude-plugin/marketplace.json has no plugins[name=curdx-flow] entry');
  process.exit(2);
}

const checks = [
  { label: 'package.json', version: pkg.version },
  { label: 'package-lock.json (root)', version: lock.version },
  { label: 'package-lock.json (packages[""])', version: lock.packages?.['']?.version },
  { label: 'plugins/curdx-flow/.claude-plugin/plugin.json', version: pluginManifest.version },
  {
    label: '.claude-plugin/marketplace.json plugins[curdx-flow]',
    version: marketplaceEntry.version,
  },
];

const distinct = new Set(checks.map((c) => c.version));

if (distinct.size === 1 && !distinct.has(undefined)) {
  console.log(`✓ versions aligned: ${[...distinct][0]}`);
  for (const c of checks) console.log(`    ${c.label}: ${c.version}`);
  process.exit(0);
}

console.error('✗ version drift detected:');
const widest = Math.max(...checks.map((c) => c.label.length));
for (const c of checks) {
  const pad = c.label.padEnd(widest);
  console.error(`    ${pad}  ${c.version ?? '(missing)'}`);
}
console.error('');
console.error('Fix: bump every file above to the same version, then re-run.');
console.error('See incident commit e234fb8 for the canonical example of what this gate prevents.');
process.exit(1);
