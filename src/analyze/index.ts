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

export async function runAnalyze(opts: RunAnalyzeOptions): Promise<void> {
  const fixturePath = path.resolve(process.cwd(), POC_FIXTURE_REL);
  const counts = await parseHookFailures(fixturePath);

  const hookFailures: HookFailureEntry[] = Array.from(counts.entries())
    .map(([hook, v]) => ({ hook, count: v.count, lastStderr: v.lastStderr }))
    .sort((a, b) => b.count - a.count);

  const report: AnalyzeReport = { hookFailures };

  // POC Phase 1: Task 1.3 wires markdown rendering + --out. For now, JSON only.
  void opts.out;
  void opts.limit;
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
