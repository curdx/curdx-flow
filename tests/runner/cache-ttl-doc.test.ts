// Drift detection for `references/cache-ttl-and-cost.md`.
//
// The cache-TTL doc encodes three load-bearing tokens that downstream
// consumers (CHANGELOG, design.md, stop-watcher cost-runaway message) all
// reference. If any of them is silently rewritten or deleted, the user-facing
// rationale for the 30-iteration cap defaults loses its anchor:
//
//   1. "5 minute" / "5-minute" / "5min"  — Anthropic prompt-cache TTL window
//      that motivates the 5-10× cost multiplier when sleep > 5min
//   2. "GH#46829"                        — upstream issue cite (closed-not-
//      planned: documented behavior, not a bug)
//   3. "5-10"                            — end-to-end cost multiplier band
//
// Spec: spec-cost-runaway-guards Task 3.5 (FR-T5 / FR-DOC2).
// Pattern mirrors `tests/runner/iron-law-doc.test.ts`.
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
  'cache-ttl-and-cost.md',
);

function readDoc(): string {
  return readFileSync(DOC_PATH, 'utf8');
}

describe('cache-ttl-and-cost.md drift detection', () => {
  test('mentions the 5-minute cache TTL anchor', () => {
    // Accepts any of the three canonical phrasings. We don't pin the exact
    // form because design.md only requires the *concept* to remain — but at
    // least one rendering must survive any future edit.
    const doc = readDoc();
    const pattern = /5\s?minute|5-minute|5min/i;
    expect(
      pattern.test(doc),
      `expected one of "5 minute" / "5-minute" / "5min" in cache-ttl-and-cost.md`,
    ).toBe(true);
  });

  test('cites GH#46829 (Anthropic 5min TTL upstream)', () => {
    const doc = readDoc();
    expect(doc).toContain('GH#46829');
  });

  test('quotes the 5-10× end-to-end cost multiplier', () => {
    // The "×" suffix may shift between renderings (`5-10×`, `5-10x`, `5-10
    // times`); the load-bearing token is the numeric range "5-10".
    const doc = readDoc();
    expect(doc).toContain('5-10');
  });
});
