// Streaming jsonl parser with incremental byte-offset bookkeeping.
//
// Design notes (echoes design.md / Phase 2 task notes):
//   • node:fs.createReadStream + readline keeps memory bounded (FR-2 100MB)
//   • Each line is best-effort JSON.parse; corrupt/half lines bump
//     counters.parse_error and are skipped (FR-20 robustness)
//   • Unknown event types bump counters.unknown_type (FR-19) instead of
//     throwing — schema drift surfaces as a stat, not a crash (D-1 / AC-6.1)
//   • shouldRotate() embodies D-1: size or mtime regression ⇒ rotate
//
// Built-in whitelist: hook_success / tool_use / assistant / user. Task 2.2
// will move the canonical list into plugins/curdx-flow/schemas/transcript-events.json
// and this fallback becomes the safety net.

import { createReadStream, statSync } from 'node:fs';
import readline from 'node:readline';

import type { Counters, Event, SchemaMap, StateFile } from './types.ts';

type RawJsonLine = Record<string, unknown> & { type?: unknown; attachment?: unknown };

interface BuiltinKindMap {
  [type: string]: Event['kind'];
}

// Minimal whitelist used both as fallback and for schemaMap-less callers
// (Task 2.1 keeps the orchestrator passing schemaMap=undefined; Task 2.2 wires
// the JSON file). attachment.type='hook_success' is unwrapped by the caller
// below — see `classify()`.
const BUILTIN_KIND_MAP: BuiltinKindMap = {
  hook_success: 'hook_invocation',
  attachment: 'hook_invocation', // overridden by attachment.type when present
  tool_use: 'tool_call',
  assistant: 'assistant_turn',
  user: 'user_turn',
};

function classify(raw: RawJsonLine, schemaMap: SchemaMap | undefined): Event['kind'] | undefined {
  // Schema map takes precedence — when supplied (Task 2.2), it controls
  // dispatch. Until then, schemaMap stays undefined and we use BUILTIN_KIND_MAP.
  const top = typeof raw.type === 'string' ? (raw.type as string) : undefined;
  if (!top) return undefined;

  // Unwrap attachment.type for hook_success and friends (jsonl wraps hook
  // results inside `{type:"attachment", attachment:{type:"hook_success",...}}`).
  let effectiveType = top;
  if (top === 'attachment' && raw.attachment && typeof raw.attachment === 'object') {
    const att = raw.attachment as { type?: unknown };
    if (typeof att.type === 'string') effectiveType = att.type;
  }

  if (schemaMap && schemaMap[effectiveType]) {
    // Task 2.2 reads schemaMap[effectiveType].action; for now just acknowledge
    // it as known by mapping to a kind via the builtin list as best-effort.
    const kind = BUILTIN_KIND_MAP[effectiveType];
    return kind ?? 'unknown';
  }

  return BUILTIN_KIND_MAP[effectiveType];
}

function pickString(raw: RawJsonLine, key: string): string | undefined {
  const v = raw[key];
  return typeof v === 'string' ? v : undefined;
}

/**
 * Stream events from a jsonl file starting at `startOffset` bytes.
 *
 * Why an async generator: lets the orchestrator both consume one-by-one
 * (memory-bounded) and `for await` collect into an array for filter.ts.
 * Counters mutate in place — caller passes the same object across all
 * parseTranscript calls in a run.
 */
export async function* parseTranscript(
  path: string,
  startOffset: number,
  schemaMap?: SchemaMap,
  counters?: Counters,
): AsyncIterable<Event> {
  const localCounters: Counters = counters ?? { unknown_type: 0, parse_error: 0, processed: 0 };

  // start: 0 means whole file; otherwise resume from previously persisted offset.
  const stream = createReadStream(path, { encoding: 'utf8', start: startOffset });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line) continue;

    let raw: RawJsonLine;
    try {
      raw = JSON.parse(line) as RawJsonLine;
    } catch {
      // Half line / corrupt JSON — count and skip (FR-20).
      localCounters.parse_error += 1;
      continue;
    }

    const kind = classify(raw, schemaMap);
    if (!kind) {
      // Unknown top-level type — count and drop (FR-19, AC-6.1).
      localCounters.unknown_type += 1;
      continue;
    }

    localCounters.processed += 1;

    // Salvage common fields if present; absence is fine — filter.ts handles
    // requestId-missing fallback (D-3).
    const ts = pickString(raw, 'timestamp') ?? pickString(raw, 'ts') ?? '';
    const uuid = pickString(raw, 'uuid');
    const requestId = pickString(raw, 'requestId');
    const cwd = pickString(raw, 'cwd');

    yield {
      kind,
      ts,
      ...(uuid !== undefined ? { uuid } : {}),
      ...(requestId !== undefined ? { requestId } : {}),
      ...(cwd !== undefined ? { cwd } : {}),
      payload: raw as Record<string, unknown>,
    } as Event;
  }
}

/**
 * Snapshot the current on-disk state of `path`. Used by the orchestrator
 * to decide rotation and to persist post-read state.
 */
export function getStateForPath(path: string): {
  byteOffset: number;
  lastModifiedMs: number;
  sizeBytes: number;
} {
  const st = statSync(path);
  return {
    byteOffset: st.size,
    lastModifiedMs: st.mtimeMs,
    sizeBytes: st.size,
  };
}

/**
 * D-1: rotate (= reset offset to 0 → full re-read) when:
 *   • prev is missing → first run, no rotation per se but caller starts at 0
 *     anyway; we return false so the rotation accounting is honest
 *   • current.sizeBytes < prev.sizeBytes → file truncated (log rotation)
 *   • current.lastModifiedMs < prev.lastModifiedMs → mtime jumped backwards
 *     (clock skew or restored backup) — safer to re-read than risk gaps
 */
export function shouldRotate(
  prev: StateFile['files'][string] | undefined,
  current: { sizeBytes: number; lastModifiedMs: number },
): boolean {
  if (!prev) return false;
  if (current.sizeBytes < prev.sizeBytes) return true;
  if (current.lastModifiedMs < prev.lastModifiedMs) return true;
  return false;
}
