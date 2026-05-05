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
