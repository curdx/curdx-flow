// Shared types for the analyze pipeline.
//
// 5-piece module split (Task 2.1 lays the foundation; report.ts + redact.ts
// arrive in Task 2.2 / 2.3):
//   types.ts   — this file: cross-module type contract
//   parser.ts  — streams jsonl, yields Event, tracks byte offset + counters
//   filter.ts  — dedupe (uuid+requestId double-key), --since, --limit, --project
//   report.ts  — markdown + json rendering (Task 2.2)
//   redact.ts  — privacy redaction (Task 2.3)
//   index.ts   — orchestrator

/**
 * Discriminated union for all parsed transcript events.
 *
 * Phase 1 keeps a small fixed kind set; Task 2.2 will move the real kinds into
 * the schema map JSON and use this union as the runtime carrier (kind sourced
 * from `schemaMap[type].action`, fallback to the small built-in whitelist
 * below). `unknown` is reserved for events seen but not whitelisted — we count
 * them in `Counters.unknown_type` and skip; we do NOT throw.
 */
export type Event =
  | (BaseEvent & { kind: 'hook_invocation' })
  | (BaseEvent & { kind: 'tool_call' })
  | (BaseEvent & { kind: 'assistant_turn' })
  | (BaseEvent & { kind: 'user_turn' })
  | (BaseEvent & { kind: 'unknown' });

interface BaseEvent {
  ts: string;
  uuid?: string;
  requestId?: string;
  cwd?: string;
  payload: Record<string, unknown>;
}

/**
 * Counters surfaced on every parse. parser.ts mutates these in place; the
 * orchestrator decides whether to render them (FR-19 unknown-type drift
 * report; AC-6.1 schema drift). `processed` counts every event that survived
 * JSON.parse, including `unknown` ones.
 */
export interface Counters {
  unknown_type: number;
  parse_error: number;
  processed: number;
}

/**
 * CLI surface kept small and stable here so flows/analyze.ts and
 * report.ts can both import without circular deps. Tasks 2.2 / 2.3
 * extend this without breaking callers.
 */
export interface Options {
  json?: boolean;
  limit?: number;
  out?: string;
  since?: string;
  project?: string;
  includePrompts?: boolean;
  /** Filter to single session UUID — wired through resolveTranscriptSource. */
  session?: string;
  /** OB-3 cost analytics flags (Task 1.1). All optional — additive, no breaking change. */
  costSummary?: boolean;
  bySpec?: boolean;
  byPhase?: boolean;
  byTask?: boolean;
  top?: number;
}

/**
 * Persisted at ~/.claude/curdx-flow/observability-state.json.
 * `version: 1` is a literal so a future schema bump can branch cleanly via
 * the discriminator. `byteOffset` is the resume point for the next read;
 * `lastModifiedMs` + `sizeBytes` together implement the rotation heuristic
 * (D-1: size or mtime regression → reset offset).
 *
 * `lastReportJson` (added in Task 2.1 to keep `analyze` idempotent across
 * incremental runs): cached stringified report from the most recent
 * non-empty parse. When the next run finds zero new events, the
 * orchestrator replays this verbatim so stdout stays stable run-over-run
 * (this is what verifies "diff /tmp/a.json /tmp/b.json" is empty).
 */
export interface StateFile {
  version: 1;
  files: Record<
    string,
    {
      byteOffset: number;
      lastModifiedMs: number;
      sizeBytes: number;
    }
  >;
  lastReportJson?: string;
  lastReportMarkdown?: string;
  /** Discriminator for the cached report so toggling --include-prompts busts it. */
  lastIncludePrompts?: boolean;
  /** OB-3 cache discriminator — toggling --cost-summary busts the cached report. */
  lastCostSummary?: boolean;
}

/**
 * EventLogRow — superset of `ErrorLogEntry` (defined in report.ts) carrying
 * the 4 fields added by spec-decision-event-logging (OB-2 / D1 UNIFIED):
 *   • level         — 'error' | 'info' | 'metric' | 'decision'
 *   • kind          — EventKind string (matches src/hooks/_shared/error-logger
 *                     EventKind union); 'unknown' for legacy / unrecognized
 *   • payload       — optional structured data, white-list redacted at write
 *   • correlationId — 3-segment `<session_id>:<task_idx>:<iter>` per FR-4
 *
 * Old rows (errors.jsonl from before the schema bump) lack all 4 fields.
 * `loadErrorEntries()` in index.ts populates them with `??` defaults
 * (`level='error'`, `kind='unknown'`, others `undefined`) so AC9 round-trip
 * passes without breaking existing ErrorLogEntry consumers — this interface
 * is purely additive.
 */
export interface EventLogRow {
  ts: string;
  hook?: string;
  event?: string;
  msg?: string;
  cwd?: string;
  transcript_path?: string;
  level?: 'error' | 'info' | 'metric' | 'decision';
  kind?: string;
  payload?: Record<string, unknown>;
  correlationId?: string;
}

/**
 * UsageRow — single billing row extracted from transcript events.
 *
 * Two sources (Decision 11 — source-bucketed dedup):
 *   • 'assistant'         — main-thread assistant turn payload.message.usage
 *   • 'subagent_trailer'  — `<usage>...</usage>` block in sidechain
 *                            tool_result.content[].text (Decision 12: trailer
 *                            tokens fully attributed to outputTokens).
 *
 * `correlationId` follows OB-2 3-segment `<session_id>:<task_idx>:<iter>` so
 * cost.ts `aggregateBy` can join with state-file specPhaseMap (Decision 4).
 * `isSidechain` flags rows from sidechain assistant turns for R3 sub-agent
 * cost attribution.
 */
export interface UsageRow {
  ts: string;
  requestId: string;
  uuid?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreate5mTokens: number;
  cacheCreate1hTokens: number;
  correlationId?: string;
  isSidechain?: boolean;
  source: 'assistant' | 'subagent_trailer';
  durationMs?: number;
}

/**
 * AggregateBucket — output of `aggregateBy(rows, level, ctx)`.
 *
 * One bucket per `key` at the requested `level` (spec / phase / task).
 * `modelMix` keyed by canonical model id (post `resolveModelId`) gives R6
 * tokenizer cohort breakdown. `totalUSD` is rounded to 4 decimals at render
 * time (Decision 10) but stored raw here so further aggregation does not
 * accumulate rounding error.
 */
export interface AggregateBucket {
  level: 'spec' | 'phase' | 'task';
  key: string;
  totalUSD: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreate5mTokens: number;
  cacheCreate1hTokens: number;
  rowCount: number;
  trailerCount: number;
  durationMs: number;
  modelMix: Record<string, { tokens: number; usd: number }>;
  spec?: string;
  phase?: string;
}

/**
 * Severity ladder for recommendations (Decision 7 — 4 tiers including
 * `insufficient_data` as an explicit "can't compute" tier so NFR-10 does
 * not silently render OK).
 */
export type Severity = 'info' | 'warn' | 'sev' | 'insufficient_data';

/**
 * Recommendation — one finding emitted by `recommend()`.
 *
 * `rule` is the stable identifier (e.g. `R1_high_cache_5m_write`). `scope`
 * is the precise dimension of the violation (any of spec/phase/task may be
 * absent for global rules). `evidence` carries rule-specific raw numbers so
 * downstream `jq` filters can re-rank without recomputing.
 */
export interface Recommendation {
  rule: string;
  severity: Severity;
  scope: {
    spec?: string;
    phase?: string;
    task?: string;
  };
  message: string;
  evidence: Record<string, unknown>;
}

/**
 * Schema map placeholder — Task 2.2 fills the canonical JSON at
 * plugins/curdx-flow/schemas/transcript-events.json. parser.ts reads it via
 * a lazy loader and falls back to a built-in whitelist when missing/corrupt.
 */
export type SchemaMap = Record<
  string,
  {
    action: string;
    fields: string[];
    filter?: Record<string, unknown>;
    extractCommandName?: boolean;
    stderrMaxBytes?: number;
  }
>;
