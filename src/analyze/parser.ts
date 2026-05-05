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

import { createReadStream, readFileSync, statSync } from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Counters, Event, SchemaMap, StateFile } from './types.ts';

type RawJsonLine = Record<string, unknown> & { type?: unknown; attachment?: unknown };

interface BuiltinKindMap {
  [type: string]: Event['kind'];
}

// Minimal whitelist used both as fallback and for schemaMap-less callers.
// attachment.type='hook_success' is unwrapped before classify() sees it —
// see `classify()`.
const BUILTIN_KIND_MAP: BuiltinKindMap = {
  hook_success: 'hook_invocation',
  attachment: 'hook_invocation', // overridden by attachment.type when present
  tool_use: 'tool_call',
  assistant: 'assistant_turn',
  user: 'user_turn',
};

// Built-in fallback schema map mirrors the canonical JSON at
// plugins/curdx-flow/schemas/transcript-events.json. Used when the JSON is
// missing/corrupt so analyze still runs (D-1 robustness).
const BUILTIN_SCHEMA_MAP: SchemaMap = {
  hook_success: {
    action: 'hook_invocation',
    fields: ['hookName', 'hookEvent', 'exitCode', 'durationMs', 'stderr'],
    stderrMaxBytes: 500,
  },
  tool_use: {
    action: 'tool_call',
    fields: ['name', 'input.subagent_type'],
    filter: { name: ['Agent', 'Task'] },
  },
  assistant: {
    action: 'assistant_turn',
    fields: ['attributionPlugin', 'attributionSkill'],
  },
  user: {
    action: 'user_turn',
    fields: ['content'],
    extractCommandName: true,
  },
};

/**
 * Resolve the schema map JSON file with two probes:
 *   1. <bundle dir>/../../plugins/curdx-flow/schemas/transcript-events.json
 *      — works when running from dist/index.mjs (bundle is one level deep
 *      under repo root).
 *   2. process.cwd()/plugins/curdx-flow/schemas/transcript-events.json
 *      — covers `node dist/index.mjs analyze` from repo root or any other
 *      cwd that contains the plugin tree.
 * Either probe wins → return its parsed map. Both miss → return undefined and
 * let the caller fall back to the built-in map (with stderr breadcrumb).
 */
export function loadSchemaMap(schemaPath?: string): SchemaMap {
  const candidates: string[] = [];
  if (schemaPath) candidates.push(schemaPath);

  // Probe 1: relative to this module file (post-bundle this resolves to the
  // dist/ directory, so we walk up two levels to reach repo root).
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    candidates.push(
      path.resolve(here, '..', '..', 'plugins', 'curdx-flow', 'schemas', 'transcript-events.json'),
      path.resolve(here, '..', 'plugins', 'curdx-flow', 'schemas', 'transcript-events.json'),
    );
  } catch {
    // import.meta.url not available — skip this probe.
  }

  // Probe 2: cwd-relative.
  candidates.push(
    path.resolve(process.cwd(), 'plugins', 'curdx-flow', 'schemas', 'transcript-events.json'),
  );

  for (const candidate of candidates) {
    try {
      const raw = readFileSync(candidate, 'utf8');
      const parsed = JSON.parse(raw) as { events?: Record<string, unknown> };
      if (parsed && typeof parsed === 'object' && parsed.events && typeof parsed.events === 'object') {
        const out: SchemaMap = {};
        for (const [type, def] of Object.entries(parsed.events)) {
          if (!def || typeof def !== 'object') continue;
          const d = def as {
            action?: unknown;
            fields?: unknown;
            filter?: unknown;
            extractCommandName?: unknown;
            stderrMaxBytes?: unknown;
          };
          if (typeof d.action !== 'string') continue;
          out[type] = {
            action: d.action,
            fields: Array.isArray(d.fields) ? (d.fields.filter((f) => typeof f === 'string') as string[]) : [],
            ...(d.filter && typeof d.filter === 'object'
              ? { filter: d.filter as Record<string, unknown> }
              : {}),
            ...(typeof d.extractCommandName === 'boolean' ? { extractCommandName: d.extractCommandName } : {}),
            ...(typeof d.stderrMaxBytes === 'number' ? { stderrMaxBytes: d.stderrMaxBytes } : {}),
          };
        }
        if (Object.keys(out).length > 0) return out;
      }
      // File found but malformed — try next candidate after a stderr breadcrumb.
      process.stderr.write(`[analyze] schema map at ${candidate} malformed, trying next probe\n`);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') continue; // probe miss — silent
      // EACCES / EISDIR / parse error — note and try next.
      process.stderr.write(`[analyze] schema map probe failed at ${candidate}: ${(err as Error).message}\n`);
    }
  }

  process.stderr.write('[analyze] schema map not found, using builtin fallback\n');
  return BUILTIN_SCHEMA_MAP;
}

// Map a schema-map `action` string to the runtime Event['kind'] union. Keep
// this whitelist small — anything outside this set is treated as 'unknown'
// so consumers can rely on the discriminated union in types.ts.
const ACTION_TO_KIND: Record<string, Event['kind']> = {
  hook_invocation: 'hook_invocation',
  tool_call: 'tool_call',
  assistant_turn: 'assistant_turn',
  user_turn: 'user_turn',
};

function classify(raw: RawJsonLine, schemaMap: SchemaMap | undefined): Event['kind'] | undefined {
  const top = typeof raw.type === 'string' ? (raw.type as string) : undefined;
  if (!top) return undefined;

  // Unwrap attachment.type for hook_success and friends (jsonl wraps hook
  // results inside `{type:"attachment", attachment:{type:"hook_success",...}}`).
  let effectiveType = top;
  if (top === 'attachment' && raw.attachment && typeof raw.attachment === 'object') {
    const att = raw.attachment as { type?: unknown };
    if (typeof att.type === 'string') effectiveType = att.type;
  }

  // Schema map wins when supplied — its `action` decides the kind.
  if (schemaMap && schemaMap[effectiveType]) {
    const action = schemaMap[effectiveType]?.action;
    if (action) {
      const kind = ACTION_TO_KIND[action];
      return kind ?? 'unknown';
    }
  }

  // Fallback: built-in whitelist (used when schemaMap is undefined).
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
