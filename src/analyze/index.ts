import { createReadStream } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

export type RunAnalyzeOptions = {
  out?: string;
  json?: boolean;
  limit?: number;
};

type HookFailureAccumulator = {
  count: number;
  lastStderr: string;
};

type HookFailureEntry = {
  hook: string;
  count: number;
  lastStderr: string;
};

export type AnalyzeReport = {
  hookFailures: HookFailureEntry[];
};

const STDERR_MAX = 200;

// POC Phase 1: hardcoded fixture path resolved against process.cwd().
// Task 2.x will replace this with proper source discovery (Claude session
// jsonl + curdx-flow errors.jsonl).
const POC_FIXTURE_REL = 'tests/analyze/fixtures/sample.jsonl';

function truncate(s: string | undefined, max = STDERR_MAX): string {
  if (!s) return '';
  return s.length <= max ? s : s.slice(0, max);
}

async function parseHookFailures(filePath: string): Promise<Map<string, HookFailureAccumulator>> {
  const counts = new Map<string, HookFailureAccumulator>();
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line) continue;
    let evt: any;
    try {
      evt = JSON.parse(line);
    } catch {
      // truncated or malformed line — skip (FR-20: parser tolerates bad rows)
      continue;
    }
    const att = evt && evt.attachment;
    if (!att || att.type !== 'hook_success') continue;
    const hookName: string | undefined = att.hookName;
    const exitCode: number | undefined = att.exitCode;
    if (!hookName || typeof exitCode !== 'number' || exitCode === 0) continue;
    const stderr = truncate(typeof att.stderr === 'string' ? att.stderr : '');
    const prev = counts.get(hookName);
    if (prev) {
      prev.count += 1;
      prev.lastStderr = stderr;
    } else {
      counts.set(hookName, { count: 1, lastStderr: stderr });
    }
  }
  return counts;
}

function escapeCell(s: string): string {
  // Markdown table cells: escape `|` and collapse newlines so the row stays on
  // one line. (We already truncate stderr to 200 chars upstream.)
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function renderMarkdown(failures: HookFailureEntry[], limit: number): string {
  const lines: string[] = [];
  lines.push(`## Hook Failures Top-${limit}`);
  lines.push('');
  if (failures.length === 0) {
    lines.push('_No hook failures recorded._');
    lines.push('');
    return lines.join('\n');
  }
  lines.push('| Hook | Count | Last stderr |');
  lines.push('| --- | --- | --- |');
  for (const f of failures) {
    lines.push(`| ${escapeCell(f.hook)} | ${f.count} | ${escapeCell(f.lastStderr)} |`);
  }
  lines.push('');
  return lines.join('\n');
}

export async function runAnalyze(opts: RunAnalyzeOptions): Promise<void> {
  const fixturePath = path.resolve(process.cwd(), POC_FIXTURE_REL);
  const counts = await parseHookFailures(fixturePath);

  // Single source of truth for sort + Top-N truncation (avoids N copies elsewhere).
  const limit = Number(opts.limit) || 10;
  const allFailures: HookFailureEntry[] = Array.from(counts.entries())
    .map(([hook, v]) => ({ hook, count: v.count, lastStderr: v.lastStderr }))
    .sort((a, b) => b.count - a.count);
  const hookFailures = allFailures.slice(0, limit);

  const report: AnalyzeReport = { hookFailures };

  // POC Phase 1: --out wiring deferred to Task 2.x; for now stdout only.
  void opts.out;

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return;
  }
  process.stdout.write(renderMarkdown(hookFailures, limit));
}
