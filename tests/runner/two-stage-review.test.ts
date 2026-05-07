// Drift detection for the two-stage review POC (spec-two-stage-review).
//
// Two reviewer agents must remain in their lanes:
//   - `spec-reviewer.md` does spec-compliance only (no code-quality territory)
//   - `code-quality-reviewer.md` does code-quality only and explicitly EXCLUDES
//     spec-compliance dimensions (traceability, artifact structure, etc.)
//
// Both agents must preserve the byte-equal `REVIEW_PASS` / `REVIEW_FAIL`
// signal strings so coordinators that grep for the verdict keep working.
//
// Drift in any of these invariants silently degrades the two-stage review:
// reviewers double-cover one domain (waste + conflict), or the coordinator
// can't parse the verdict (silent failure).
//
// References: FR-N5, AC-8.1, NFR-1, FR-X3 (per requirements.md).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');

const SPEC_REVIEWER_PATH = join(
  REPO_ROOT,
  'plugins',
  'curdx-flow',
  'agents',
  'spec-reviewer.md',
);
const CODE_QUALITY_REVIEWER_PATH = join(
  REPO_ROOT,
  'plugins',
  'curdx-flow',
  'agents',
  'code-quality-reviewer.md',
);

function readFile(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('two-stage-review drift detection', () => {
  test('spec-reviewer.md has no code-quality keyword leakage', () => {
    const doc = readFile(SPEC_REVIEWER_PATH);

    // Word-presence check (case-insensitive, whole-word). spec-reviewer must
    // not mention code-quality territory at all in the narrowed Pass-1 scope.
    // If a future pass legitimately needs a cross-reference (e.g. "delegate
    // to code-quality-reviewer"), narrow this regex to a section-header form
    // like /##.*Code Quality\b/i instead of widening the allowlist here.
    const forbiddenPatterns: RegExp[] = [
      /\bcode[\s-]?quality\b/i,
      /\bcode[\s-]?smell/i,
      /\bsmell\b/i,
      /\bsecurity\b/i,
      /\breadability\b/i,
    ];

    const hits = forbiddenPatterns
      .map((re) => ({ re: re.source, matched: re.test(doc) }))
      .filter((h) => h.matched);

    expect(hits).toEqual([]);
  });

  test('code-quality-reviewer.md exists and contains all 4 exclusion keywords', () => {
    const doc = readFile(CODE_QUALITY_REVIEWER_PATH);

    // The 4 exclusion keywords from Task 1.2 — these MUST appear so the
    // agent prompt explicitly carves out spec-compliance dimensions.
    expect(doc).toContain('traceability to requirements');
    expect(doc).toContain('phase artifact structure');
    expect(doc).toContain('requirement coverage');
    expect(doc).toContain('artifact format');
  });

  test('REVIEW_PASS and REVIEW_FAIL signal strings appear in both agent files', () => {
    const specDoc = readFile(SPEC_REVIEWER_PATH);
    const cqDoc = readFile(CODE_QUALITY_REVIEWER_PATH);

    // Byte-equal preservation (NFR-1 / FR-X3): coordinators grep for these
    // exact tokens. Any markdown formatter that normalizes them (e.g. to
    // `Review_Pass` or smart-quoted variants) breaks every consumer.
    expect(specDoc).toContain('REVIEW_PASS');
    expect(specDoc).toContain('REVIEW_FAIL');
    expect(cqDoc).toContain('REVIEW_PASS');
    expect(cqDoc).toContain('REVIEW_FAIL');
  });
});
