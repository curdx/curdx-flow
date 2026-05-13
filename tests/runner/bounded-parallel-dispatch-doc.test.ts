// Drift detection for `references/bounded-parallel-dispatch.md`.
//
// This doc is the operational contract for parallel agent dispatch across
// research, review, and debug domains. It also acts as the contract surface
// between this spec and `spec-two-stage-review` (review domain anti-patterns)
// and any future debug-domain consumer.
//
// If wording, anti-pattern counts, or path references drift between the doc,
// the consumer skills, or the stub redirect, downstream consumers silently
// degrade — coordinators fan out under wrong assumptions, or readers chase
// dead links through the old `parallel-research.md` path.
//
// This test mirrors `tests/runner/iron-law-doc.test.ts`. 8 assertions per
// design.md Test Strategy table (D2: per-domain ≥3 AND total ≥10).
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');

const NEW_DOC_PATH = join(
  REPO_ROOT,
  'plugins',
  'curdx-flow',
  'references',
  'bounded-parallel-dispatch.md',
);
const OLD_STUB_PATH = join(
  REPO_ROOT,
  'plugins',
  'curdx-flow',
  'references',
  'parallel-research.md',
);
const SKILLS_DIR = join(REPO_ROOT, 'plugins', 'curdx-flow', 'skills');

// Subset of `skills/*/SKILL.md` that the design (E1) classifies as inbound
// consumers — both hard refs (research, start, triage) and soft consumers
// (requirements, design, tasks). The drift test enforces zero `parallel-
// research.md` matches across this set, regardless of whether the file
// currently links to the new doc.
const INBOUND_SKILL_NAMES = [
  'research',
  'start',
  'triage',
  'requirements',
  'design',
  'tasks',
] as const;

function readDoc(): string {
  return readFileSync(NEW_DOC_PATH, 'utf8');
}

// Extract the text body of a `## ` section by heading text, up to (but not
// including) the next `## ` header or EOF.
function extractH2Section(doc: string, headingText: string): string {
  const lines = doc.split(/\r?\n/);
  const startIdx = lines.findIndex((line) => line === `## ${headingText}`);
  if (startIdx === -1) return '';
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && /^## (?!#)/.test(line)) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join('\n');
}

// Extract the text body of a `### ` subsection by heading-text-prefix match.
// Bounds at next `### ` or `## ` or EOF. Used for per-domain subsections
// like `### Research domain (3 — preserved from original doc)`.
function extractH3Subsection(section: string, headingPrefix: string): string {
  const lines = section.split(/\r?\n/);
  const startIdx = lines.findIndex((line) =>
    line.startsWith(`### ${headingPrefix}`),
  );
  if (startIdx === -1) return '';
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && /^(### |## (?!#))/.test(line)) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join('\n');
}

// Count top-level numbered list items: lines starting with `<digits>. `.
// Excludes nested numbered items (which would be indented). The doc uses
// `1. **Anti-pattern**` style at column 0.
function countNumberedItems(text: string): number {
  return text.split(/\r?\n/).filter((line) => /^\d+\. /.test(line)).length;
}

describe('bounded-parallel-dispatch.md drift detection', () => {
  test('new-doc-exists: bounded-parallel-dispatch.md is a non-empty file', () => {
    const stat = statSync(NEW_DOC_PATH);
    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBeGreaterThan(0);
  });

  test('old-stub-redirect: parallel-research.md is a ≤3-line moved-to redirect', () => {
    const stat = statSync(OLD_STUB_PATH);
    expect(stat.isFile()).toBe(true);
    const content = readFileSync(OLD_STUB_PATH, 'utf8');
    // Strip trailing newline before counting; otherwise a trailing `\n`
    // inflates line count by 1.
    const trimmed = content.replace(/\n+$/, '');
    const lineCount = trimmed.split(/\r?\n/).length;
    expect(lineCount).toBeLessThanOrEqual(3);
    expect(content).toMatch(/Moved to.*bounded-parallel-dispatch\.md/);
  });

  test('anti-pattern-count-total: §4 contains ≥10 numbered anti-patterns', () => {
    const doc = readDoc();
    const section = extractH2Section(doc, 'Per-Domain Anti-patterns');
    expect(section).not.toBe('');
    const count = countNumberedItems(section);
    expect(count).toBeGreaterThanOrEqual(10);
  });

  test('anti-pattern-count-per-domain: research/review/debug subsections each ≥3', () => {
    const doc = readDoc();
    const section = extractH2Section(doc, 'Per-Domain Anti-patterns');
    expect(section).not.toBe('');

    const research = extractH3Subsection(section, 'Research domain');
    const review = extractH3Subsection(section, 'Review domain');
    const debug = extractH3Subsection(section, 'Debug domain');

    expect(research).not.toBe('');
    expect(review).not.toBe('');
    expect(debug).not.toBe('');

    expect(countNumberedItems(research)).toBeGreaterThanOrEqual(3);
    expect(countNumberedItems(review)).toBeGreaterThanOrEqual(3);
    expect(countNumberedItems(debug)).toBeGreaterThanOrEqual(3);
  });

  test('independence-criteria-present: all 3 criterion strings appear', () => {
    const doc = readDoc();
    expect(doc).toContain('Independent input');
    expect(doc).toContain('Independent output');
    expect(doc).toContain('Independent context');
  });

  test('path-consistency-skills: zero parallel-research.md refs across inbound skills; new path present where doc was previously referenced', () => {
    let staleCount = 0;
    let newPathHits = 0;
    for (const name of INBOUND_SKILL_NAMES) {
      const content = readFileSync(join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
      // The stub itself is in references/, not entrypoint skills, so any match
      // in these skills is a stale ref by definition.
      if (content.includes('parallel-research.md')) staleCount += 1;
      if (content.includes('bounded-parallel-dispatch.md')) newPathHits += 1;
    }
    expect(staleCount).toBe(0);
    // At least one inbound skill must now reference the new path —
    // otherwise the rename hasn't propagated. (research.md and start.md
    // are the canonical hard-ref consumers per design E1.)
    expect(newPathHits).toBeGreaterThanOrEqual(1);
  });

  test('subagent-vs-grep-section-present: doc cites the predilection-for-subagents warning', () => {
    const doc = readDoc();
    expect(doc).toContain('predilection for subagents');
  });

  test('5-step-pattern-preserved: doc retains the dispatch-pattern heading and all 5 step markers', () => {
    const doc = readDoc();
    // Direct Agent dispatch is the stable default; Agent Teams are optional
    // because Claude Code currently gates them behind an experimental flag.
    expect(doc).toContain('## Dispatch Pattern (Direct Agent Default, Teams Optional)');
    expect(doc).toContain('Agent Teams are experimental and disabled by default');
    expect(doc).toContain('Direct `Agent(...)` dispatch is the baseline contract');
    // All 5 step markers must remain — drift in step ordering or count
    // breaks downstream skills that read the doc procedurally.
    for (let i = 1; i <= 5; i++) {
      expect(doc).toMatch(new RegExp(`### Step ${i}:`));
    }
  });
});
