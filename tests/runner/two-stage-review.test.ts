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
const DESIGN_COMMAND_PATH = join(
  REPO_ROOT,
  'plugins',
  'curdx-flow',
  'commands',
  'design.md',
);
const TASKS_COMMAND_PATH = join(
  REPO_ROOT,
  'plugins',
  'curdx-flow',
  'commands',
  'tasks.md',
);

function readFile(path: string): string {
  return readFileSync(path, 'utf8');
}

// Extract every line that exactly equals REVIEW_PASS or REVIEW_FAIL (no
// surrounding whitespace, no trailing punctuation). The byte-equal contract
// (NFR-1, FR-X3) is about the literal token coordinators grep for as the
// final verdict line — not about every prose mention. We assert the literal
// occurrences in both agent files are identical sets.
function extractVerdictLines(doc: string): string[] {
  return doc
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line === 'REVIEW_PASS' || line === 'REVIEW_FAIL');
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

  test('commands/design.md wires bounded-parallel-dispatch + dual reviewer Task calls (FR-D1, AC-8.1)', () => {
    const doc = readFile(DESIGN_COMMAND_PATH);

    // Phase boundary review must reference the bounded-parallel-dispatch
    // contract — that's the only place "ALL Task calls in ONE message" is
    // defined. If this link is gone, the coordinator silently regresses
    // to sequential dispatch.
    expect(doc).toContain('bounded-parallel-dispatch');

    // Both reviewers must be invoked via Task subagent. The literal
    // `subagent_type: <name>` form is what the dispatcher matches; a prose
    // mention alone (e.g. just "spec-reviewer reviews ...") would not
    // actually trigger dual dispatch.
    expect(doc).toMatch(/subagent_type:\s*spec-reviewer/);
    expect(doc).toMatch(/subagent_type:\s*code-quality-reviewer/);
  });

  test('commands/tasks.md wires bounded-parallel-dispatch + dual reviewer Task calls (FR-D1, AC-8.2)', () => {
    const doc = readFile(TASKS_COMMAND_PATH);

    // Mirror of the design.md contract — tasks.md phase boundary uses the
    // exact same parallel two-stage review protocol. Drift between the two
    // command files (e.g. tasks.md forgets one reviewer) silently breaks
    // the post-tasks gate while post-design still passes.
    expect(doc).toContain('bounded-parallel-dispatch');
    expect(doc).toMatch(/subagent_type:\s*spec-reviewer/);
    expect(doc).toMatch(/subagent_type:\s*code-quality-reviewer/);
  });

  test('REVIEW_PASS / REVIEW_FAIL verdict lines are byte-equal across both agent files (NFR-1, FR-X3)', () => {
    const specVerdicts = extractVerdictLines(readFile(SPEC_REVIEWER_PATH));
    const cqVerdicts = extractVerdictLines(readFile(CODE_QUALITY_REVIEWER_PATH));

    // Both agents must emit the literal verdict tokens on a line by
    // themselves at least once each. extractVerdictLines is strict —
    // smart-quoted, lowercased, or whitespace-padded variants would
    // already fail the filter, so a missing entry here means a real
    // formatter / hand-edit broke the contract.
    expect(specVerdicts).toContain('REVIEW_PASS');
    expect(specVerdicts).toContain('REVIEW_FAIL');
    expect(cqVerdicts).toContain('REVIEW_PASS');
    expect(cqVerdicts).toContain('REVIEW_FAIL');

    // Exact string comparison (the spec called this out explicitly).
    // Pull the unique tokens emitted by each file and assert they match
    // byte-for-byte. If one side ever introduces e.g. `REVIEW_PASSED` or
    // `REVIEW_PASS ` (trailing space), this fails loudly.
    const specUnique = Array.from(new Set(specVerdicts)).sort();
    const cqUnique = Array.from(new Set(cqVerdicts)).sort();
    expect(specUnique).toEqual(cqUnique);
    expect(specUnique).toEqual(['REVIEW_FAIL', 'REVIEW_PASS']);
  });

  test('cross-domain finding fixture is treated as advisory per 3-layer drift defense (FR-X2)', () => {
    // Drift fixture: simulate the canonical bad case where spec-reviewer
    // emits a finding that belongs to code-quality (e.g. "code smell").
    // The 3-layer defense (Layer 1 prompt / Layer 2 isolation / Layer 3
    // post-hoc detector) treats such findings as advisory, not a hard
    // block. We model the post-hoc classifier here and assert the
    // expected verdict label.
    const driftFinding = {
      reviewerId: 'spec-reviewer' as const,
      finding: 'Implementation has a code smell: long parameter list',
    };

    // Keywords that belong exclusively to the code-quality domain. If a
    // spec-reviewer finding mentions any of these, it has crossed the
    // boundary defined in references/two-stage-review.md.
    const codeQualityKeywords = [
      /\bcode[\s-]?smell\b/i,
      /\bsecurity\b/i,
      /\breadability\b/i,
      /\bperformance\b/i,
    ];

    function classify(f: { reviewerId: string; finding: string }): 'advisory' | 'hard-block' {
      if (f.reviewerId !== 'spec-reviewer') return 'hard-block';
      const crosses = codeQualityKeywords.some((re) => re.test(f.finding));
      // Layer 3 post-hoc detector: cross-domain leakage from spec-reviewer
      // is downgraded to advisory rather than escalated to a hard block,
      // so a single misclassified finding doesn't gate the whole phase.
      return crosses ? 'advisory' : 'hard-block';
    }

    expect(classify(driftFinding)).toBe('advisory');

    // Negative control: an in-domain spec-reviewer finding (e.g. missing
    // requirement traceability) must still hard-block. Otherwise the
    // detector would be a no-op and the gate would silently disappear.
    const inDomainFinding = {
      reviewerId: 'spec-reviewer' as const,
      finding: 'FR-7 has no acceptance criterion in tasks.md',
    };
    expect(classify(inDomainFinding)).toBe('hard-block');
  });
});
