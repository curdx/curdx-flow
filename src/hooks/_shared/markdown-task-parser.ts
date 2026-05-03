/**
 * Markdown task-list parser — line-by-line state machine.
 *
 * Replaces the awk invocations in `plugins/curdx-flow/hooks/scripts/stop-watcher.sh`
 * (lines 258-267 single-task block, 278-289 parallel-group block) with a
 * platform-neutral TypeScript port. The awk recipes are the spec; this module
 * MUST emit the same lines awk would emit for any given index — see the
 * "Awk lineage" comments on each export below.
 *
 * Format recognized (current curdx-flow tasks.md convention):
 *
 *   - [ ] 1.14 Title text (parens with notes)
 *     - **Do**:
 *       1. Step
 *     - **Files**: path
 *     - **Verify**: cmd
 *     - **Commit**: msg
 *     - _Requirements: ..._
 *
 * A task block opens on a line matching /^- \[[ x]\]/ and closes on:
 *   (a) any non-empty, non-indented (does not start with two spaces) line
 *       that is NOT itself a task line (e.g. `## Heading`, `### Section`,
 *       prose paragraph), OR
 *   (b) end of file.
 * Indented lines (starting with two spaces) and blank lines BELONG to the
 * current task block, exactly mirroring awk's `found && /^  /` and
 * `found && /^$/` arms.
 *
 * NOTE — sibling-task tail-inclusion (verbatim awk parity):
 * The awk recipe in stop-watcher.sh increments its `count` ONLY when the line
 * is a task AND `count != idx`. Once `count == idx` fires (found=1), `count`
 * stays frozen at idx, so EVERY subsequent task line also satisfies
 * `count == idx` and gets printed. The block therefore actually runs from
 * the target task to the next non-task heading/EOF, sweeping in zero or more
 * trailing sibling tasks. stop-watcher's coordinator prompt tolerates this
 * (the first task line is still the "current" task; trailing sibling tasks
 * become extra context). The parser preserves this behavior verbatim — do
 * NOT "fix" it without first updating callers + the awk in stop-watcher.sh.
 *
 * Trailing blank lines INSIDE a returned block are stripped (mirrors the
 * `sed -e :a -e '/^[[:space:]]*$/{...}'` post-filter applied in
 * stop-watcher.sh L267).
 */

// @internal — documentation fixture; not exported. Mirrors the format
// extractTaskBlock/parseTaskList accept. Kept inline (no separate test fixture
// file) per task 1.16 instructions; real tests live in Phase 3.
const _FIXTURE = `# Tasks: example

## Phase 1

- [x] 1.1 First task title
  - **Do**: thing
  - **Verify**: cmd

- [ ] 1.2 [P] Second task with parallel marker
  - **Do**:
    1. step a
    2. step b
  - **Files**: path/to/file
  - **Commit**: \`feat: msg\`

- [ ] 1.3 Third task title
  - **Do**: another
  - **Done when**: criteria
`;
void _FIXTURE; // suppress unused warning; kept for documentation only.

/** Heading-like or other top-level non-task line that closes a task block. */
const TASK_LINE_RE = /^- \[[ x]\]/;
/** Lines beginning with at least two spaces are sub-content of the current task. */
const INDENTED_RE = /^  /;
/** Blank line (whitespace-only counts as blank for awk's /^$/ semantics). */
const BLANK_RE = /^\s*$/;
/** Captures id (e.g. "1.14") and remainder of the title from a task line. */
const TASK_HEADER_RE = /^- \[([ x])\]\s+(?:(\d+(?:\.\d+)*)\s+)?(.*)$/;

export interface TaskMeta {
  /** Task id like "1.14" if present in the title; undefined otherwise. */
  id?: string;
  /** Title text after the `[ ]`/`[x]` marker (and the optional id). */
  title: string;
  /** True when the marker was `[x]`. */
  completed: boolean;
  /** Full task block text — header line + sub-content, trailing blanks stripped. */
  raw: string;
  /** 1-based start line in the source markdown. */
  lineStart: number;
  /** 1-based end line (inclusive) of the last non-blank line in the block. */
  lineEnd: number;
}

/** Normalize CRLF/CR → LF; strip a leading UTF-8 BOM. */
function normalize(input: string): string {
  if (!input) return '';
  let s = input;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/\r\n?/g, '\n');
}

/** Strip trailing blank lines from a buffered block (sed post-filter parity). */
function trimTrailingBlankLines(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && BLANK_RE.test(lines[end - 1] ?? '')) end--;
  return lines.slice(0, end);
}

/**
 * Extract the Nth task block from `markdown`.
 *
 * Awk lineage — direct port of stop-watcher.sh L258-267:
 *   /^- \[[ x]\]/ { if (count == idx) { found=1; print; next }
 *                   if (found) { exit }
 *                   count++ }
 *   found && /^  / { print; next }
 *   found && /^$/ { print; next }
 *   found && !/^  / && !/^$/ { exit }
 *
 * Plus the `sed` post-filter that strips trailing blank lines (L267).
 *
 * Because of the awk count-frozen quirk (see file-level NOTE above), the
 * returned text may contain trailing sibling task blocks too — that is awk's
 * actual behavior on stop-watcher.sh's input format and is preserved verbatim.
 *
 * @param markdown Full tasks.md content (any line endings accepted).
 * @param taskIndex 0-based index — matches the awk `count` variable which
 *   starts at 0. Out-of-range, negative, or non-finite indices yield "".
 * @returns The block text WITHOUT a trailing newline. Empty string on miss.
 */
export function extractTaskBlock(markdown: string, taskIndex: number): string {
  if (!markdown) return '';
  if (!Number.isFinite(taskIndex) || taskIndex < 0) return '';
  const lines = normalize(markdown).split('\n');
  let count = 0;
  let found = false;
  const out: string[] = [];

  for (const line of lines) {
    if (TASK_LINE_RE.test(line)) {
      // Awk order: count==idx check FIRST, THEN found-exit check, THEN count++.
      // When idx==0 the counter never advances past 0 inside the target block,
      // so the very next sibling task line ALSO matches count==idx and is
      // included. This is the awk's actual emergent behavior — kept verbatim
      // for byte-equal parity with stop-watcher.sh.
      if (count === taskIndex) {
        found = true;
        out.push(line);
        continue;
      }
      if (found) break; // hit next sibling task — close
      count++;
      continue;
    }
    if (!found) continue;
    if (INDENTED_RE.test(line)) {
      out.push(line);
      continue;
    }
    if (BLANK_RE.test(line)) {
      out.push(line);
      continue;
    }
    // non-indented, non-blank, non-task → exit (heading or stray prose)
    break;
  }

  if (!found) return '';
  return trimTrailingBlankLines(out).join('\n');
}

/**
 * Parse the entire markdown into a list of task metadata records.
 *
 * Uses the same boundary rules as `extractTaskBlock` (awk lineage above) so
 * `parseTaskList(md)[idx].raw === extractTaskBlock(md, idx)` holds for every
 * in-range index.
 *
 * @returns Empty array when input has no `- [ ]` / `- [x]` task lines.
 */
export function parseTaskList(markdown: string): TaskMeta[] {
  if (!markdown) return [];
  const lines = normalize(markdown).split('\n');
  const tasks: TaskMeta[] = [];

  let current: { lines: string[]; lineStart: number; lineEnd: number; meta: Omit<TaskMeta, 'raw' | 'lineEnd'> } | null = null;

  const flush = () => {
    if (!current) return;
    const trimmed = trimTrailingBlankLines(current.lines);
    const lineEnd = current.lineStart + trimmed.length - 1;
    tasks.push({
      ...current.meta,
      raw: trimmed.join('\n'),
      lineEnd,
    });
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const lineNo = i + 1; // 1-based

    if (TASK_LINE_RE.test(line)) {
      flush();
      const m = line.match(TASK_HEADER_RE);
      const completed = m ? m[1] === 'x' : false;
      const id = m && m[2] ? m[2] : undefined;
      const title = m && m[3] !== undefined ? m[3] : line;
      current = {
        lines: [line],
        lineStart: lineNo,
        lineEnd: lineNo,
        meta: { id, title, completed } as Omit<TaskMeta, 'raw' | 'lineEnd'>,
      };
      continue;
    }

    if (!current) continue;

    if (INDENTED_RE.test(line) || BLANK_RE.test(line)) {
      current.lines.push(line);
      continue;
    }

    // Non-task, non-indented, non-blank line — block closes.
    flush();
  }
  flush();
  return tasks;
}
