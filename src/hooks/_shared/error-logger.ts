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

export interface LogHookErrorContext {
  hook: string;
  event: string;
  msg?: string;
  cwd?: string;
  transcript_path?: string;
  spec?: string;
  path?: string;
  stack?: string;
}

/**
 * Append one error line. Never throws — see file header.
 */
export function logHookError(ctx: LogHookErrorContext, err?: Error): void {
  try {
    if (!readEnabled()) return;

    const stack = ctx.stack ?? err?.stack;
    const msg = ctx.msg ?? err?.message;

    const record: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level: 'error',
      hook: trunc(ctx.hook, STR_MAX) ?? '',
      event: trunc(ctx.event, STR_MAX) ?? '',
    };
    const optionalEntries: Array<[string, string | undefined]> = [
      ['msg', trunc(msg, MSG_MAX)],
      ['cwd', trunc(ctx.cwd, STR_MAX)],
      ['transcript_path', trunc(ctx.transcript_path, STR_MAX)],
      ['spec', trunc(ctx.spec, STR_MAX)],
      ['path', trunc(ctx.path, STR_MAX)],
      ['stack', trunc(stack, STACK_MAX)],
    ];
    for (const [k, v] of optionalEntries) {
      if (v !== undefined) record[k] = v;
    }

    let line = JSON.stringify(record);
    // Defensive: if assembled line still exceeds 4 KB (e.g. weird unicode
    // expansion), drop the stack first; if still too big, drop msg too.
    if (Buffer.byteLength(line + '\n', 'utf8') > MAX_LINE_BYTES) {
      delete record.stack;
      line = JSON.stringify(record);
    }
    if (Buffer.byteLength(line + '\n', 'utf8') > MAX_LINE_BYTES) {
      delete record.msg;
      line = JSON.stringify(record);
    }

    try {
      mkdirSync(ERRORS_DIR, { recursive: true });
    } catch {
      // ignore — appendFileSync failure below will swallow.
    }
    appendFileSync(ERRORS_LOG, line + '\n');
  } catch {
    // NFR-9: hook errors logging MUST NOT cascade. Swallow everything.
  }
}

/** Test-only: clear the module-level enabled cache (Phase 3 fake-fs). */
export function __resetCacheForTest(): void {
  cachedEnabled = null;
}
