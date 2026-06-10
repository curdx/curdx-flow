/**
 * Markdown task-list parser. A task block opens on /^- \[[ x]\]/ and closes
 * on the first non-empty, non-indented, non-task line or EOF; two-space
 * indented lines and blank lines belong to the current block.
 *
 * Intentional quirk preserved from the original awk implementation: the
 * counter freezes once the target index is found, so `extractTaskBlock`
 * sweeps in trailing sibling tasks up to the next heading/EOF. Callers
 * tolerate this — the first task line is still the "current" task. Do NOT
 * "fix" it without updating callers.
 */

const TASK_LINE_RE = /^- \[[ x]\]/;
const INDENTED_RE = /^  /;
const BLANK_RE = /^\s*$/;
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

function normalize(input: string): string {
  if (!input) return '';
  let s = input;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/\r\n?/g, '\n');
}

function trimTrailingBlankLines(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && BLANK_RE.test(lines[end - 1] ?? '')) end--;
  return lines.slice(0, end);
}

/**
 * Extract the Nth (0-based) task block. Out-of-range, negative, or
 * non-finite indices yield "". The returned text has no trailing newline
 * and may include trailing sibling tasks (see file header).
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
      // count==idx is checked before count++, so the counter freezes inside
      // the target block — the sibling tail-inclusion quirk (file header).
      if (count === taskIndex) {
        found = true;
        out.push(line);
        continue;
      }
      if (found) break;
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
    break;
  }

  if (!found) return '';
  return trimTrailingBlankLines(out).join('\n');
}

// Uses the same block-boundary rules as extractTaskBlock.
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
    const lineNo = i + 1;

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

    flush();
  }
  flush();
  return tasks;
}
