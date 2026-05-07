/**
 * Error logger for the 4 curdx-flow hooks.
 *
 * Writes one JSON line per error to `~/.claude/curdx-flow/errors.jsonl` so
 * `analyze` can roll them up alongside jsonl `hook_success.exitCode!==0`
 * entries (R-9 fuzzy join). Reads `errorLogEnabled` from
 * `~/.claude/settings.json` once per process and caches the result — hooks
 * are one-shot Node processes, so we never need to invalidate.
 *
 * Hard contract (NFR-9):
 *   • THIS FUNCTION NEVER THROWS. Every external call is wrapped in
 *     try/catch and any failure is silently swallowed. The whole point of
 *     the logger is to capture errors in the hook — letting it crash would
 *     turn a recoverable hook fault into a session blocker.
 *   • Single line MUST stay below 4 KB on disk so jsonl readers (analyze)
 *     don't choke. We aggressively truncate `msg`, `stack`, and stringy
 *     payloads, then re-truncate stack to 0 if the assembled line still
 *     exceeds the budget.
 *
 * Schema (line):
 *   { ts, level, hook, event, msg?, cwd?, transcript_path?, spec?, path?, stack? }
 *
 * `__resetCacheForTest()` is exported solely for fake-fs unit tests
 * (Phase 3 tests inject a temp settings.json and need to clear the cache
 * between cases).
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const SETTINGS_PATH = path.join(homedir(), '.claude', 'settings.json');
const ERRORS_DIR = path.join(homedir(), '.claude', 'curdx-flow');
const ERRORS_LOG = path.join(ERRORS_DIR, 'errors.jsonl');

const MAX_LINE_BYTES = 4096;
const MSG_MAX = 500;
const STACK_MAX = 2000;
const STR_MAX = 500;

let cachedEnabled: boolean | null = null;

function readEnabled(): boolean {
  if (cachedEnabled !== null) return cachedEnabled;
  try {
    const raw = readFileSync(SETTINGS_PATH, 'utf8');
    const parsed = JSON.parse(raw) as { errorLogEnabled?: unknown };
    if (typeof parsed.errorLogEnabled === 'boolean') {
      cachedEnabled = parsed.errorLogEnabled;
      return cachedEnabled;
    }
    // Field missing — default to true (FR-8: errors should surface).
    cachedEnabled = true;
    return cachedEnabled;
  } catch {
    // Missing or corrupt settings.json — default to enabled, breadcrumb to stderr.
    process.stderr.write('[error-logger] settings.json missing/corrupt, defaulting errorLogEnabled=true\n');
    cachedEnabled = true;
    return cachedEnabled;
  }
}

function trunc(s: unknown, max: number): string | undefined {
  if (typeof s !== 'string') return undefined;
  return s.length <= max ? s : s.slice(0, max);
}

/**
 * Severity / category of an event line.
 *
 * - `'error'` is reserved for `logHookError` (back-compat).
 * - `'info'` is the default for `logHookEvent` (general structured events).
 * - `'metric'` is for measurement-only lines (counts, durations).
 * - `'decision'` flags lines that record a hook policy decision (allow / block / side-effect).
 */
export type EventLevel = 'error' | 'info' | 'metric' | 'decision';

/**
 * Closed enumeration of event kinds emitted by the 4 curdx-flow hooks.
 *
 * Adding a new kind here is the only safe way to introduce a new event
 * category — `coerceKind` falls back to `'unknown'` for any string outside
 * this set, so old jsonl rows produced before a kind was introduced still
 * round-trip cleanly through the parser.
 */
export type EventKind =
  | 'stop_block_continuation'
  | 'stop_block_cost_runaway'
  | 'stop_block_verification_failed'
  | 'stop_allow_early_exit'
  | 'task_verify_pass'
  | 'task_verify_fail'
  | 'subagent_context_injected'
  | 'subagent_injection_failed'
  | 'stop_failure_rate_limit'
  | 'stop_failure_other'
  | 'unknown';

const KNOWN_KINDS: ReadonlySet<EventKind> = new Set<EventKind>([
  'stop_block_continuation',
  'stop_block_cost_runaway',
  'stop_block_verification_failed',
  'stop_allow_early_exit',
  'task_verify_pass',
  'task_verify_fail',
  'subagent_context_injected',
  'subagent_injection_failed',
  'stop_failure_rate_limit',
  'stop_failure_other',
  'unknown',
]);

/**
 * Coerce an unknown value into the closed `EventKind` set.
 *
 * Anything not in `KNOWN_KINDS` (including `undefined`, non-strings, or
 * future-version kinds an older parser doesn't understand) becomes
 * `'unknown'`. This is what lets old log rows survive a schema upgrade.
 */
export function coerceKind(raw: unknown): EventKind {
  return typeof raw === 'string' && KNOWN_KINDS.has(raw as EventKind)
    ? (raw as EventKind)
    : 'unknown';
}

export interface LogHookErrorContext {
  hook: string;
  event: string;
  msg?: string;
  cwd?: string;
  transcript_path?: string;
  spec?: string;
  path?: string;
  stack?: string;
  /**
   * Optional event kind. Older callers may still omit this; `logHookError`
   * will default it to `'unknown'` via `coerceKind` when redirecting to
   * `logHookEvent`.
   */
  kind?: EventKind;
}

/**
 * Input shape for {@link logHookEvent}.
 *
 * Extends `LogHookErrorContext` with the 4 schema fields added in OB-2:
 *   - `level` — severity tag (defaults to `'info'` for `logHookEvent`)
 *   - `kind`  — closed-enum category (defaults to `'unknown'`)
 *   - `payload` — opaque structured side-data (consumers should redact
 *      before calling; this layer trusts what it gets and only enforces
 *      the 4 KB line cap)
 *   - `correlationId` — 3-segment id `<session>.<spec>.<phase>` produced by
 *      `_shared/correlation.ts#buildCorrelationId` (added in Task 1.3)
 */
export interface LogHookEventInput extends LogHookErrorContext {
  level?: EventLevel;
  kind?: EventKind;
  payload?: Record<string, unknown>;
  correlationId?: string;
}

/**
 * Append one structured event line. Never throws — see file header.
 *
 * `level` defaults to `'info'` and `kind` defaults to `'unknown'`. The
 * 4 KB line-cap cascade (drop `stack`, then `msg`, then `payload`) is the
 * same as the legacy `logHookError` path, plus an extra payload-drop step
 * because payloads can be arbitrarily large.
 */
export function logHookEvent(input: LogHookEventInput, err?: Error): void {
  try {
    if (!readEnabled()) return;

    const stack = input.stack ?? err?.stack;
    const msg = input.msg ?? err?.message;
    const level: EventLevel = input.level ?? 'info';
    const kind: EventKind = coerceKind(input.kind);

    const record: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      hook: trunc(input.hook, STR_MAX) ?? '',
      event: trunc(input.event, STR_MAX) ?? '',
      kind,
    };
    const optionalEntries: Array<[string, string | undefined]> = [
      ['msg', trunc(msg, MSG_MAX)],
      ['cwd', trunc(input.cwd, STR_MAX)],
      ['transcript_path', trunc(input.transcript_path, STR_MAX)],
      ['spec', trunc(input.spec, STR_MAX)],
      ['path', trunc(input.path, STR_MAX)],
      ['stack', trunc(stack, STACK_MAX)],
      ['correlationId', trunc(input.correlationId, STR_MAX)],
    ];
    for (const [k, v] of optionalEntries) {
      if (v !== undefined) record[k] = v;
    }
    if (input.payload !== undefined) {
      record.payload = input.payload;
    }

    let line = JSON.stringify(record);
    // Defensive: if assembled line still exceeds 4 KB (e.g. weird unicode
    // expansion), drop stack first, then msg, then payload (largest last
    // because payload is the most likely overflow culprit but also the most
    // valuable signal — drop the cheap stuff first).
    if (Buffer.byteLength(line + '\n', 'utf8') > MAX_LINE_BYTES) {
      delete record.stack;
      line = JSON.stringify(record);
    }
    if (Buffer.byteLength(line + '\n', 'utf8') > MAX_LINE_BYTES) {
      delete record.msg;
      line = JSON.stringify(record);
    }
    if (Buffer.byteLength(line + '\n', 'utf8') > MAX_LINE_BYTES) {
      delete record.payload;
      line = JSON.stringify(record);
    }

    try {
      mkdirSync(ERRORS_DIR, { recursive: true });
    } catch {
      // ignore — appendFileSync failure below will swallow.
    }
    appendFileSync(ERRORS_LOG, line + '\n');
  } catch {
    // NFR-9: hook events logging MUST NOT cascade. Swallow everything.
  }
}

/**
 * Append one error line. Never throws — see file header.
 *
 * Implementation note (OB-2): this is now a thin redirect to
 * `logHookEvent` with `level='error'` so all writers share the same
 * 4 KB cap, mkdir, and NEVER-throw guarantees. The signature is frozen —
 * existing 4 unit tests in `tests/hooks/error-logger.test.ts` MUST continue
 * to pass without modification (AC9).
 */
export function logHookError(ctx: LogHookErrorContext, err?: Error): void {
  logHookEvent({ ...ctx, level: 'error', kind: ctx.kind ?? 'unknown' }, err);
}

/** Test-only: clear the module-level enabled cache (Phase 3 fake-fs). */
export function __resetCacheForTest(): void {
  cachedEnabled = null;
}
