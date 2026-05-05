// Orchestrator for `analyze`. Wires parser → filter → (inline render).
// Phase 2 Task 2.2 will pull rendering into report.ts; Task 2.3 adds redact.
// For now we keep the POC's hookFailures rollup inline so 1.3's behaviour
// does not regress.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { filterEvents } from './filter.ts';
import { getStateForPath, parseTranscript, shouldRotate } from './parser.ts';
import type { Counters, Event, Options, StateFile } from './types.ts';

export type RunAnalyzeOptions = Options;

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
const POC_FIXTURE_REL = 'tests/analyze/fixtures/sample.jsonl';
const STATE_DIR = path.join(homedir(), '.claude', 'curdx-flow');
const STATE_PATH = path.join(STATE_DIR, 'observability-state.json');

function truncate(s: string | undefined, max = STDERR_MAX): string {
  if (!s) return '';
  return s.length <= max ? s : s.slice(0, max);
}

function escapeCell(s: string): string {
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

function readState(): StateFile {
  if (!existsSync(STATE_PATH)) return { version: 1, files: {} };
  try {
    const raw = readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as StateFile;
    if (parsed && parsed.version === 1 && parsed.files) return parsed;
  } catch {
    // Corrupt state — start fresh, do NOT throw (FR-20 robustness extends to state).
  }
  return { version: 1, files: {} };
}

function writeState(state: StateFile): void {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

/**
 * Roll up hook_success failures from the parsed events. Mirrors POC behaviour
 * (Task 1.2 / 1.3) so the diff between phase-1 and phase-2 stdout is empty.
 */
function rollupHookFailures(events: Event[]): HookFailureEntry[] {
  const counts = new Map<string, HookFailureAccumulator>();
  for (const ev of events) {
    if (ev.kind !== 'hook_invocation') continue;
    const att = (ev.payload as { attachment?: unknown }).attachment;
    if (!att || typeof att !== 'object') continue;
    const a = att as { type?: unknown; hookName?: unknown; exitCode?: unknown; stderr?: unknown };
    if (a.type !== 'hook_success') continue;
    const hookName = typeof a.hookName === 'string' ? a.hookName : undefined;
    const exitCode = typeof a.exitCode === 'number' ? a.exitCode : undefined;
    if (!hookName || exitCode === undefined || exitCode === 0) continue;
    const stderr = truncate(typeof a.stderr === 'string' ? a.stderr : '');
    const prev = counts.get(hookName);
    if (prev) {
      prev.count += 1;
      prev.lastStderr = stderr;
    } else {
      counts.set(hookName, { count: 1, lastStderr: stderr });
    }
  }
  return Array.from(counts.entries())
    .map(([hook, v]) => ({ hook, count: v.count, lastStderr: v.lastStderr }))
    .sort((a, b) => b.count - a.count);
}

export async function runAnalyze(opts: RunAnalyzeOptions): Promise<void> {
  const fixturePath = path.resolve(process.cwd(), POC_FIXTURE_REL);
  const limit = Number(opts.limit) || 10;

  const state = readState();
  const stat = statSync(fixturePath);
  const prevForPath = state.files[fixturePath];
  const rotate = shouldRotate(prevForPath, { sizeBytes: stat.size, lastModifiedMs: stat.mtimeMs });
  const startOffset = rotate || !prevForPath ? 0 : prevForPath.byteOffset;

  // Incremental tail with no new bytes → replay the last persisted report so
  // `analyze` is idempotent across runs (verifies via `diff /tmp/a.json /tmp/b.json`).
  // We only short-circuit when we are NOT rotating AND the offset has caught
  // up to file size AND we have a cached report. Otherwise fall through and
  // re-render (could be empty), which still writes state.
  if (
    !rotate &&
    prevForPath &&
    startOffset >= stat.size &&
    (state.lastReportJson || state.lastReportMarkdown)
  ) {
    if (opts.json && state.lastReportJson) {
      process.stdout.write(state.lastReportJson);
      // Touch state (mtime/size unchanged but still rewrite to keep schema fresh).
      writeState(state);
      return;
    }
    if (!opts.json && state.lastReportMarkdown) {
      process.stdout.write(state.lastReportMarkdown);
      writeState(state);
      return;
    }
  }

  const counters: Counters = { unknown_type: 0, parse_error: 0, processed: 0 };
  const collected: Event[] = [];
  try {
    for await (const ev of parseTranscript(fixturePath, startOffset, undefined, counters)) {
      collected.push(ev);
    }

    const filtered = filterEvents(collected, { ...opts, limit });
    const hookFailures = rollupHookFailures(filtered).slice(0, limit);
    const report: AnalyzeReport = { hookFailures };

    void opts.out;

    const jsonStr = `${JSON.stringify(report)}\n`;
    const markdownStr = renderMarkdown(hookFailures, limit);

    // Cache last report so the next idempotent run replays this exact bytes.
    state.lastReportJson = jsonStr;
    state.lastReportMarkdown = markdownStr;

    if (opts.json) {
      process.stdout.write(jsonStr);
    } else {
      process.stdout.write(markdownStr);
    }

    // Surface counters on stderr (debug only — does not affect stdout diff).
    if (counters.parse_error || counters.unknown_type) {
      process.stderr.write(
        `(analyze: parse_error=${counters.parse_error} unknown_type=${counters.unknown_type} processed=${counters.processed})\n`,
      );
    }
  } finally {
    // Always persist offset — even on error mid-stream we don't want to
    // re-process bytes that already produced events.
    state.files[fixturePath] = {
      byteOffset: stat.size,
      lastModifiedMs: stat.mtimeMs,
      sizeBytes: stat.size,
    };
    void getStateForPath; // satisfy unused-import lint; helper is exported for tests.
    writeState(state);
  }
}
