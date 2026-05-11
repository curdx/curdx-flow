// Orchestrator for `analyze`. Wires schema-map → parser → filter → report.
//
// Phase 2 Task 2.2 retired the inline POC renderer in favour of report.ts and
// pulled in two sidecar inputs: ./specs/*\/.curdx-state.json (spec funnel) and
// ~/.claude/curdx-flow/errors.jsonl (R-9 fuzzy join with jsonl hook failures).
// Task 2.3 will layer redact.ts in front of the renderer.

import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { aggregateBy, computeCost, extractUsageRowsFromEvents } from './cost.ts';
import { filterEvents } from './filter.ts';
import { getStateForPath, loadSchemaMap, parseTranscript, shouldRotate } from './parser.ts';
import { recommend } from './recommend.ts';
import { redactEvent, redactReportFields } from './redact.ts';
import { renderReport } from './report.ts';
import type { CostBreakdownInput, ReportJson, SpecStateInfo } from './report.ts';
import { resolveTranscriptSource, TranscriptNotFoundError } from './transcript-path.ts';
import type {
  AggregateBucket,
  Counters,
  Event,
  EventLogRow,
  Options,
  Recommendation,
  StateFile,
} from './types.ts';

export type RunAnalyzeOptions = Options;

export type AnalyzeReport = ReportJson;

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

function emitReport(bytes: string, out?: string): void {
  if (!out) {
    process.stdout.write(bytes);
    return;
  }
  const target = path.resolve(out);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes, 'utf8');
}

/**
 * Trim orphan entries from `state.files` so the file does not grow unbounded
 * across months of use (D2: dual heuristic). Two passes:
 *
 *   Pass 1 — drop any entry whose `lastModifiedMs` is older than 30 days OR
 *            whose path no longer exists on disk.
 *   Pass 2 — if more than 100 entries still remain, drop the oldest by
 *            `lastModifiedMs` until ≤ 100.
 *
 * Entries listed in `currentPaths` are never dropped — the active run owns
 * them and the resume offset must survive the GC. Returns the same `state`
 * object (mutated in place) so callers can chain with `writeState`.
 */
export function cleanupOrphanState(state: StateFile, currentPaths: string[]): StateFile {
  const now = Date.now();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const KEEP_MAX = 100;
  const protectedKeys = new Set(currentPaths);
  const dropped: string[] = [];

  // Pass 1: stale (>30d) OR file-gone. Skip protected (current-run) entries.
  for (const key of Object.keys(state.files)) {
    if (protectedKeys.has(key)) continue;
    const entry = state.files[key];
    if (!entry) continue;
    const stale = now - entry.lastModifiedMs > THIRTY_DAYS_MS;
    const gone = !existsSync(key);
    if (stale || gone) {
      delete state.files[key];
      dropped.push(key);
    }
  }

  // Pass 2: if still > KEEP_MAX, drop oldest by lastModifiedMs until ≤ cap.
  // Protected (current-run) entries are filtered out of the candidate pool
  // so the active session always survives even if it would otherwise be the
  // oldest in a synthetic fixture.
  const overflow = Object.keys(state.files).length - KEEP_MAX;
  if (overflow > 0) {
    const candidates = Object.entries(state.files)
      .filter(([k]) => !protectedKeys.has(k))
      .sort((a, b) => a[1].lastModifiedMs - b[1].lastModifiedMs);
    for (const [key] of candidates.slice(0, overflow)) {
      delete state.files[key];
      dropped.push(key);
    }
  }

  if (dropped.length) {
    // eslint-disable-next-line no-console
    console.warn(`state: GC dropped ${dropped.length} orphan entr${dropped.length === 1 ? 'y' : 'ies'}`);
  }
  return state;
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
 *
 * D1 (UNIFIED): the file is still named `errors.jsonl` for back-compat, but
 * post spec-decision-event-logging it carries both legacy errors AND new
 * decision events. Each row may carry 4 additional fields (level / kind /
 * payload / correlationId); legacy rows lack them and get default values via
 * `??` so AC9 round-trip passes:
 *   • level         → 'error'   (legacy was error-only)
 *   • kind          → 'unknown' (legacy had no taxonomy)
 *   • payload       → undefined (no structured data)
 *   • correlationId → undefined (no 3-segment id)
 *
 * Return type widened to `EventLogRow[]` (superset of `ErrorLogEntry`); this
 * is structurally compatible with `renderReport`'s `ErrorLogEntry[]` param so
 * existing consumers remain untouched.
 */
function normalizePathForScope(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

function isErrorEntryInScope(entry: EventLogRow, source: ReturnType<typeof resolveTranscriptSource>): boolean {
  const transcriptPaths = new Set(source.paths.map((p) => normalizePathForScope(p)));
  if (entry.transcript_path) {
    if (transcriptPaths.has(normalizePathForScope(entry.transcript_path))) return true;
  }

  if (entry.cwd) {
    const sourceCwds = new Set<string>([normalizePathForScope(source.cwd)]);
    if (source.kind === 'real') sourceCwds.add(normalizePathForScope(source.realCwd));
    if (sourceCwds.has(normalizePathForScope(entry.cwd))) return true;
  }

  return false;
}

function loadErrorEntries(source: ReturnType<typeof resolveTranscriptSource>): EventLogRow[] {
  if (!existsSync(ERRORS_LOG_PATH)) return [];
  let raw: string;
  try {
    raw = readFileSync(ERRORS_LOG_PATH, 'utf8');
  } catch {
    return [];
  }
  const out: EventLogRow[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const level: EventLogRow['level'] =
        parsed.level === 'error' ||
        parsed.level === 'info' ||
        parsed.level === 'metric' ||
        parsed.level === 'decision'
          ? parsed.level
          : 'error';
      const kind = typeof parsed.kind === 'string' ? parsed.kind : 'unknown';
      const payload =
        parsed.payload && typeof parsed.payload === 'object' && !Array.isArray(parsed.payload)
          ? (parsed.payload as Record<string, unknown>)
          : undefined;
      const correlationId =
        typeof parsed.correlationId === 'string' ? parsed.correlationId : undefined;
      const entry: EventLogRow = {
        ts: typeof parsed.ts === 'string' ? parsed.ts : '',
        ...(typeof parsed.hook === 'string' ? { hook: parsed.hook } : {}),
        ...(typeof parsed.event === 'string' ? { event: parsed.event } : {}),
        ...(typeof parsed.msg === 'string' ? { msg: parsed.msg } : {}),
        ...(typeof parsed.cwd === 'string' ? { cwd: parsed.cwd } : {}),
        ...(typeof parsed.transcript_path === 'string' ? { transcript_path: parsed.transcript_path } : {}),
        level,
        kind,
        ...(payload !== undefined ? { payload } : {}),
        ...(correlationId !== undefined ? { correlationId } : {}),
      };
      if (isErrorEntryInScope(entry, source)) out.push(entry);
    } catch {
      continue;
    }
  }
  return out;
}

async function runAnalyzeInner(opts: RunAnalyzeOptions): Promise<void> {
  // Resolve transcript source: real Claude Code project dir (default) or
  // CURDX_TRANSCRIPT_FIXTURE override (legacy / test path). Throws
  // TranscriptNotFoundError if neither yields any `.jsonl` — caught at the
  // top-level wrapper for friendly 2-line stderr + exit 1 (D1 / AC3).
  const source = resolveTranscriptSource({
    fixtureOverride: process.env.CURDX_TRANSCRIPT_FIXTURE,
    sessionFilter: opts.session,
  });
  const limit = Number(opts.limit) || 10;

  const state = readState();

  // Per-path stat + rotation: rotation is checked per session file because
  // each `.jsonl` has independent size/mtime. We aggregate stats so the
  // idempotent-replay short-circuit only triggers when EVERY path is
  // unchanged at its last byteOffset (any new bytes anywhere → re-render).
  type PathStat = {
    p: string;
    sizeBytes: number;
    lastModifiedMs: number;
    rotate: boolean;
    startOffset: number;
  };
  const pathStats: PathStat[] = [];
  let allCachedReady = true;
  for (const p of source.paths) {
    const stat = statSync(p);
    const prev = state.files[p];
    const rotate = shouldRotate(prev, { sizeBytes: stat.size, lastModifiedMs: stat.mtimeMs });
    const startOffset = rotate || !prev ? 0 : prev.byteOffset;
    if (rotate || !prev || startOffset < stat.size) allCachedReady = false;
    pathStats.push({ p, sizeBytes: stat.size, lastModifiedMs: stat.mtimeMs, rotate, startOffset });
  }

  // Incremental tail with no new bytes across ALL paths → replay the last
  // persisted report so `analyze` is idempotent across runs. Cache is keyed
  // implicitly by includePrompts — toggling the flag MUST bust the cache
  // because the redacted vs. unredacted reports diverge. OB-3 (Task 1.5)
  // adds the same discriminator on `--cost-summary`: toggling the flag
  // changes the rendered shape (markdown gets a new section, JSON gets a
  // new top-level field), so cache must bust on transition. Task 2.10
  // formalizes this with the StateFile.lastCostSummary field — Phase 1
  // wiring already lands here so the POC smoke is correct on re-runs.
  const includePrompts = Boolean(opts.includePrompts);
  const costSummary = opts.costSummary === true;
  const cacheCompatible =
    (state.lastIncludePrompts ?? false) === includePrompts &&
    (state.lastCostSummary ?? false) === costSummary;
  if (
    allCachedReady &&
    pathStats.length > 0 &&
    cacheCompatible &&
    (state.lastReportJson || state.lastReportMarkdown)
  ) {
    if (opts.json && state.lastReportJson) {
      emitReport(state.lastReportJson, opts.out);
      writeState(state);
      return;
    }
    if (!opts.json && state.lastReportMarkdown) {
      emitReport(state.lastReportMarkdown, opts.out);
      writeState(state);
      return;
    }
  }

  const schemaMap = loadSchemaMap();
  const counters: Counters = { unknown_type: 0, parse_error: 0, processed: 0 };
  const collected: Event[] = [];
  try {
    // Multi-file aggregation: parse each path's tail, collect into a single
    // event list, then dedupe/filter downstream. Order across files is
    // unstable here; filter.ts dedupes on `uuid|requestId` so ordering only
    // matters for tie-break reporting (acceptable for v1).
    for (const { p, startOffset } of pathStats) {
      for await (const ev of parseTranscript(p, startOffset, schemaMap, counters)) {
        collected.push(ev);
      }
    }

    // D-9 redact-by-default: drop file-history-snapshot, scrub user prompts,
    // hash paths. `--include-prompts` short-circuits inside redactEvent.
    const redacted: Event[] = [];
    for (const ev of collected) {
      const r = redactEvent(ev, { includePrompts });
      if (r) redacted.push(r);
    }

    const filtered = filterEvents(redacted, { ...opts, limit });
    const errorEntries = loadErrorEntries(source);
    const specStates = loadSpecStates();

    // OB-3 cost branch — Phase 4 Task 4.6 wires `recommend()` + recommendations
    // into both markdown (`## Recommendations` chapter, after `## Cost Breakdown`)
    // and JSON (top-level `recommendations: Recommendation[]`, sibling of
    // `costBreakdown`). The existing 7 flat sections from `renderReport` are
    // NOT touched (NFR-6 hard constraint).
    //
    // Compute the cost aggregates BEFORE calling renderReport so we can pass
    // costBreakdown + recommendations as RenderOptions; renderReport renders
    // both extra chapters in a single pass (no post-render markdown surgery).
    let costBreakdown: CostBreakdownInput | undefined;
    let recommendations: Recommendation[] = [];
    if (opts.costSummary === true) {
      // Task 2.6 — derive `specPhaseMap: Record<sid, phase>` from the spec
      // state files (`./specs/*\/.curdx-state.json`) loaded above. State files
      // do NOT carry a `sessionId` field (verified 2026-05-07: state.json shape
      // is { name, phase, taskIndex, ... } only), so the fallback per task
      // brief is to key by spec name. `aggregateBy` ctx looks up by the
      // correlationId `sid` segment (= transcript filename basename, an
      // anthropic session UUID), so most lookups will fall through to the
      // 'unknown' phase bucket — that's the explicit NFR-9 contract.
      //
      // Reuses the already-loaded `specStates` from above (loadSpecStates is
      // itself NEVER-throw — missing dir / corrupt JSON → []). The reduce
      // below is wrapped defensively even though the input is already safe.
      let specPhaseMap: Record<string, string> = {};
      try {
        for (const s of specStates) {
          if (s && typeof s.name === 'string' && typeof s.phase === 'string') {
            specPhaseMap[s.name] = s.phase;
          }
        }
      } catch {
        specPhaseMap = {};
      }
      const usageRows = extractUsageRowsFromEvents(filtered, errorEntries);
      let totalUsd = 0;
      for (const r of usageRows) totalUsd += computeCost(r);
      // 4-decimal round at the boundary (Decision 10) — matches per-row
      // round4 in cost.ts so re-summing across rows doesn't drift.
      totalUsd = Math.round(totalUsd * 10000) / 10000;

      // Task 2.7 — wire --by-spec / --by-phase / --by-task / --top flags.
      // Selection rules (FR-CLI-1 / AC7 / design §Components #7 5 CLI flag 接线):
      //   • Any of {bySpec, byPhase, byTask} = true → ONLY those dims compute
      //   • All three false (cost-summary alone) → all three dims compute (R1+R2+R3+R7)
      //   • `top` only truncates R7 (task-level) buckets
      const anyByFlag = opts.bySpec === true || opts.byPhase === true || opts.byTask === true;
      const wantSpec = anyByFlag ? opts.bySpec === true : true;
      const wantPhase = anyByFlag ? opts.byPhase === true : true;
      const wantTask = anyByFlag ? opts.byTask === true : true;
      const top = typeof opts.top === 'number' && Number.isFinite(opts.top) && opts.top > 0
        ? Math.floor(opts.top)
        : 10;
      const costAggregates: {
        spec?: AggregateBucket[];
        phase?: AggregateBucket[];
        task?: AggregateBucket[];
      } = {};
      if (wantSpec) costAggregates.spec = aggregateBy(usageRows, 'spec', { specPhaseMap });
      if (wantPhase) costAggregates.phase = aggregateBy(usageRows, 'phase', { specPhaseMap });
      if (wantTask) {
        const taskBuckets = aggregateBy(usageRows, 'task', { specPhaseMap });
        costAggregates.task = taskBuckets.slice(0, top);
      }

      // Task 2.9 — costBreakdown sibling alongside top-level `totalCost.usd`.
      // R4/R5/R6 derived inside `renderCostBreakdown` from R3 buckets at render
      // time (see report.ts), so we leave them as empty placeholders here.
      const taskBucketsAll = costAggregates.task ?? [];
      const r7TopN = taskBucketsAll.slice(0, top);
      costBreakdown = {
        R1_perSpec: costAggregates.spec ?? [],
        R2_perPhase: costAggregates.phase ?? [],
        R3_perTask: taskBucketsAll,
        R4_cacheHit: [] as unknown[],
        R5_wallClock: [] as unknown[],
        R6_modelMix: [] as unknown[],
        R7_topN: r7TopN,
        totalCost: { usd: totalUsd },
      };

      // Task 4.6 — call recommend() over ALL aggregated buckets (spec + phase +
      // task) so per-rule scope filters (`b.level === 'task'` etc) all see their
      // intended slice. critical-phase skip list hardcoded per Decision 5
      // (MVP); future may read from state-file `meta.criticalPhase`.
      // NEVER-throw constraint: recommend() itself is double-wrapped (per-rule
      // + per-bucket try/catch — see recommend.ts), but we wrap the dispatch
      // call too in case import-time evaluation throws (e.g. type drift). On
      // any failure → empty recommendations array, the chapter is skipped.
      try {
        const allBuckets: AggregateBucket[] = [
          ...(costAggregates.spec ?? []),
          ...(costAggregates.phase ?? []),
          ...taskBucketsAll,
        ];
        recommendations = recommend(allBuckets, {
          errorEntries,
          criticalPhases: ['critical', 'debug-hard', 'security'],
        });
      } catch {
        recommendations = [];
      }
    }

    const { markdown, json } = renderReport(filtered, errorEntries, specStates, {
      ...opts,
      limit,
      schemaDrift: {
        unknownTypeCount: counters.unknown_type,
        parseErrorCount: counters.parse_error,
      },
      ...(costBreakdown ? { costBreakdown } : {}),
      ...(recommendations.length > 0 ? { recommendations } : {}),
    });

    // Belt-and-suspenders pass on the rendered JSON (no-op when redactEvent
    // already nuked the field, but guards against future renderer additions
    // that might surface a new path-shaped value).
    const safeJson = redactReportFields(json, { includePrompts });

    const markdownStr = markdown;
    let jsonObj: Record<string, unknown> = safeJson as unknown as Record<string, unknown>;
    if (opts.costSummary === true && costBreakdown) {
      // JSON shape: top-level `totalCost.usd` mirror (Decision 3) +
      // `costBreakdown` sibling (Task 2.9) + `recommendations` sibling (Task
      // 4.6 / Decision 4). The 7 flat keys from `safeJson` survive untouched.
      jsonObj = {
        ...jsonObj,
        totalCost: { usd: costBreakdown.totalCost.usd },
        costBreakdown,
        recommendations,
      };
    }

    const jsonStr = `${JSON.stringify(jsonObj)}\n`;

    // Cache last report so the next idempotent run replays this exact bytes.
    state.lastReportJson = jsonStr;
    state.lastReportMarkdown = markdownStr;
    state.lastIncludePrompts = includePrompts;
    state.lastCostSummary = costSummary;

    if (opts.json) {
      emitReport(jsonStr, opts.out);
    } else {
      emitReport(markdownStr, opts.out);
    }
    void safeJson;

    if (counters.parse_error || counters.unknown_type) {
      process.stderr.write(
        `(analyze: parse_error=${counters.parse_error} unknown_type=${counters.unknown_type} processed=${counters.processed})\n`,
      );
    }
  } finally {
    // Per-path state entry: each session's resume offset is independent, so
    // rotation detection (size/mtime regression) keys on its own file.
    for (const ps of pathStats) {
      state.files[ps.p] = {
        byteOffset: ps.sizeBytes,
        lastModifiedMs: ps.lastModifiedMs,
        sizeBytes: ps.sizeBytes,
      };
    }
    void getStateForPath; // satisfy unused-import lint; helper is exported for tests.
    // Orphan GC: drop stale (>30d), file-gone, or overflow (>100) entries
    // before persisting. Wrapped fail-open per FR-C3 — a GC failure must
    // never crash the analyze run.
    try {
      cleanupOrphanState(state, pathStats.map((ps) => ps.p));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('state: GC failed (continuing without cleanup):', (err as Error).message);
    }
    writeState(state);
  }
}

/**
 * Top-level wrapper: catches `TranscriptNotFoundError` and emits a friendly
 * 2-line stderr message + exits with code 1 (D1 / AC3). Other errors
 * propagate so unit tests still see real stack traces.
 */
export async function runAnalyze(opts: RunAnalyzeOptions): Promise<void> {
  try {
    await runAnalyzeInner(opts);
  } catch (err) {
    if (err instanceof TranscriptNotFoundError) {
      process.stderr.write(`warning: no transcripts found at ${err.path}\n`);
      process.stderr.write(`hint: ${err.hint}\n`);
      process.exit(1);
    }
    throw err;
  }
}
