// Drift gate for the iron-law canonical 1-liner.
//
// `IRON_LAW_SUMMARY` in `src/hooks/lib/build-context-payload.ts` is hardcoded
// for startup-fast (zero I/O on every SubagentStart fire). The canonical
// source of truth lives in `references/iron-law-verification.md`. This test
// asserts byte-level substring equality so any drift between the constant
// and the reference doc fails CI before reaching users.
//
// Mitigates risk R2 from spec design (D1, §Component 6).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { IRON_LAW_SUMMARY } from '../../src/hooks/lib/build-context-payload';

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

describe('subagent-context drift gate', () => {
  test('IRON_LAW_SUMMARY constant appears verbatim in iron-law-verification.md', () => {
    const content = readFileSync(DOC_PATH, 'utf8');
    expect(content).toContain(IRON_LAW_SUMMARY);
  });
});
