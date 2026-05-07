// Drift detection for `references/iron-law-verification.md`.
//
// The Iron Law reference doc names a fixed set of `npm run <script>` commands
// that hooks, the release gate, and recovery cookbooks all point users to.
// If any of those scripts is renamed or removed in `package.json` without
// updating the doc (or vice-versa), users hit a copy-paste fix command that
// no longer works.
//
// This test enforces that every `npm run <script>` reference in the doc
// resolves to an existing key in `package.json::scripts`, and that the doc
// retains its full structural skeleton (>=6 H2 sections — Iron Law,
// Two-Layer Model, VerificationBlock Field Reference, Phase Boundary
// Checklist, Failure Recovery Cookbook, Cross-References).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');
const DOC_PATH = join(
  REPO_ROOT,
  'plugins',
  'curdx-flow',
  'references',
  'iron-law-verification.md',
);
const PACKAGE_JSON_PATH = join(REPO_ROOT, 'package.json');

function readDoc(): string {
  return readFileSync(DOC_PATH, 'utf8');
}

function readScripts(): Record<string, string> {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as {
    scripts?: Record<string, string>;
  };
  return pkg.scripts ?? {};
}

// Match: a backtick-wrapped `npm run <script>` token. The script name is
// captured in group 1. Allowed script-name chars: letters, digits, `:`, `-`,
// `_`, `.` — covers package.json conventions like `check:hooks-fresh`.
const NPM_RUN_PATTERN = /`npm run ([A-Za-z0-9:_\-.]+)`/g;

function extractNpmRunScripts(doc: string): string[] {
  const found = new Set<string>();
  for (const m of doc.matchAll(NPM_RUN_PATTERN)) {
    if (m[1] !== undefined) found.add(m[1]);
  }
  return [...found].sort();
}

describe('iron-law-verification.md drift detection', () => {
  test('every `npm run <script>` mention resolves to a package.json script', () => {
    const doc = readDoc();
    const scripts = readScripts();
    const referenced = extractNpmRunScripts(doc);

    // Sanity: the doc must mention at least the canonical gate commands.
    expect(referenced.length).toBeGreaterThanOrEqual(3);

    const missing = referenced.filter((name) => !(name in scripts));
    expect(missing).toEqual([]);
  });

  test('doc retains at least 6 H2 (`## `) section headers', () => {
    const doc = readDoc();
    // Count lines starting with exactly `## ` (not `### ` or deeper).
    const headers = doc
      .split(/\r?\n/)
      .filter((line) => /^## (?!#)/.test(line));
    expect(headers.length).toBeGreaterThanOrEqual(6);
  });
});
