// Orchestrator for `analyze`. Wires schema-map → parser → filter → report.
//
// Phase 2 Task 2.2 retired the inline POC renderer in favour of report.ts and
// pulled in two sidecar inputs: ./specs/*\/.curdx-state.json (spec funnel) and
// ~/.claude/curdx-flow/errors.jsonl (R-9 fuzzy join with jsonl hook failures).
// Task 2.3 will layer redact.ts in front of the renderer.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { filterEvents } from './filter.ts';
import { getStateForPath, loadSchemaMap, parseTranscript, shouldRotate } from './parser.ts';
import { renderReport } from './report.ts';
import type { ErrorLogEntry, ReportJson, SpecStateInfo } from './report.ts';
import type { Counters, Event, Options, StateFile } from './types.ts';

export type RunAnalyzeOptions = Options;

export type AnalyzeReport = ReportJson;

const POC_FIXTURE_REL = 'tests/analyze/fixtures/sample.jsonl';
const STATE_DIR = path.join(homedir(), '.claude', 'curdx-flow');
const STATE_PATH = path.join(STATE_DIR, 'observability-state.json');
const ERRORS_LOG_PATH = path.join(STATE_DIR, 'errors.jsonl');
const SPECS_DIR_REL = 'specs';

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
 * Scan ./specs/*\/.curdx-state.json and pluck `phase` from each. Missing dir,
 * missing file, or corrupt JSON all degrade to "skip the spec" rather than
 * throw — this is a sidecar input, not a hard dep.
 */
function loadSpecStates(): SpecStateInfo[] {
  const specsDir = path.resolve(process.cwd(), SPECS_DIR_REL);
  if (!existsSync(specsDir)) return [];
  let entries: string[];
  try {
    entries = readdirSync(specsDir);
  } catch {
    return [];
  }
  const out: SpecStateInfo[] = [];
  for (const name of entries) {
    if (name.startsWith('.')) continue; // skip ./specs/.index/
    const stateFile = path.join(specsDir, name, '.curdx-state.json');
    if (!existsSync(stateFile)) continue;
    try {
      const raw = readFileSync(stateFile, 'utf8');
      const parsed = JSON.parse(raw) as { phase?: unknown; name?: unknown };
      const phase = typeof parsed.phase === 'string' ? parsed.phase : undefined;
      if (!phase) continue;
      out.push({ name, phase });
    } catch {
      continue;
    }
  }
  return out;
}

/**
 * Read `errors.jsonl` lazily — one JSON object per line. Same FR-20 stance:
 * missing file or corrupt lines are silent (counted only locally, not surfaced
 * here; parser.ts handles the schema-drift counters for the transcript path).
 */
function loadErrorEntries(): ErrorLogEntry[] {
  if (!existsSync(ERRORS_LOG_PATH)) return [];
  let raw: string;
  try {
    raw = readFileSync(ERRORS_LOG_PATH, 'utf8');
  } catch {
    return [];
  }
  const out: ErrorLogEntry[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      out.push({
        ts: typeof parsed.ts === 'string' ? parsed.ts : '',
        ...(typeof parsed.hook === 'string' ? { hook: parsed.hook } : {}),
        ...(typeof parsed.event === 'string' ? { event: parsed.event } : {}),
        ...(typeof parsed.msg === 'string' ? { msg: parsed.msg } : {}),
        ...(typeof parsed.cwd === 'string' ? { cwd: parsed.cwd } : {}),
        ...(typeof parsed.transcript_path === 'string' ? { transcript_path: parsed.transcript_path } : {}),
      });
    } catch {
      continue;
    }
  }
  return out;
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
  if (
    !rotate &&
    prevForPath &&
    startOffset >= stat.size &&
    (state.lastReportJson || state.lastReportMarkdown)
  ) {
    if (opts.json && state.lastReportJson) {
      process.stdout.write(state.lastReportJson);
      writeState(state);
      return;
    }
    if (!opts.json && state.lastReportMarkdown) {
      process.stdout.write(state.lastReportMarkdown);
      writeState(state);
      return;
    }
  }

  const schemaMap = loadSchemaMap();
  const counters: Counters = { unknown_type: 0, parse_error: 0, processed: 0 };
  const collected: Event[] = [];
  try {
    for await (const ev of parseTranscript(fixturePath, startOffset, schemaMap, counters)) {
      collected.push(ev);
    }

    const filtered = filterEvents(collected, { ...opts, limit });
    const errorEntries = loadErrorEntries();
    const specStates = loadSpecStates();

    const { markdown, json } = renderReport(filtered, errorEntries, specStates, {
      ...opts,
      limit,
      schemaDrift: {
        unknownTypeCount: counters.unknown_type,
        parseErrorCount: counters.parse_error,
      },
    });

    void opts.out;

    const jsonStr = `${JSON.stringify(json)}\n`;
    const markdownStr = markdown;

    // Cache last report so the next idempotent run replays this exact bytes.
    state.lastReportJson = jsonStr;
    state.lastReportMarkdown = markdownStr;

    if (opts.json) {
      process.stdout.write(jsonStr);
    } else {
      process.stdout.write(markdownStr);
    }

    if (counters.parse_error || counters.unknown_type) {
      process.stderr.write(
        `(analyze: parse_error=${counters.parse_error} unknown_type=${counters.unknown_type} processed=${counters.processed})\n`,
      );
    }
  } finally {
    state.files[fixturePath] = {
      byteOffset: stat.size,
      lastModifiedMs: stat.mtimeMs,
      sizeBytes: stat.size,
    };
    void getStateForPath; // satisfy unused-import lint; helper is exported for tests.
    writeState(state);
  }
}
