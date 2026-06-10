/**
 * Hard contract: the logging entry points NEVER throw — a logging fault must
 * not turn into a session blocker. Each written line must stay below 4 KB on
 * disk so jsonl readers don't choke; msg/stack/payload are truncated to fit.
 */
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs';
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

const ROTATE_SIZE_BYTES = 10 * 1024 * 1024;
const ROTATE_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const ROTATE_THROTTLE_N = 10;
const ROTATE_KEEP = 5;
const RENAME_RETRY_DELAYS_MS = [50, 200, 500] as const;

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
    cachedEnabled = true;
    return cachedEnabled;
  } catch {
    process.stderr.write('[error-logger] settings.json missing/corrupt, defaulting errorLogEnabled=true\n');
    cachedEnabled = true;
    return cachedEnabled;
  }
}

function trunc(s: unknown, max: number): string | undefined {
  if (typeof s !== 'string') return undefined;
  return s.length <= max ? s : s.slice(0, max);
}

export type EventLevel = 'error' | 'info' | 'metric' | 'decision';

// Closed set: `coerceKind` collapses anything outside it to 'unknown' so old
// jsonl rows survive schema upgrades.
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

export function coerceKind(raw: unknown): EventKind {
  return typeof raw === 'string' && KNOWN_KINDS.has(raw as EventKind)
    ? (raw as EventKind)
    : 'unknown';
}

export function shouldRotate(filePath: string): boolean {
  try {
    const st = statSync(filePath);
    if (st.size > ROTATE_SIZE_BYTES) return true;
    if (Date.now() - st.mtimeMs > ROTATE_AGE_MS) return true;
    return false;
  } catch {
    return false;
  }
}

// POSIX same-FS rename is atomic; Windows file-locking (EBUSY/EPERM) gets a
// retry chain; EXDEV or exhausted retries fall back to copy + unlink.
export function safeRename(from: string, to: string): void {
  try {
    try { renameSync(from, to); return; } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'EBUSY' || code === 'EPERM') {
        for (const ms of RENAME_RETRY_DELAYS_MS) {
          const end = Date.now() + ms;
          while (Date.now() < end) { /* spin: hooks are short-lived, no await available */ }
          try { renameSync(from, to); return; } catch { /* keep retrying */ }
        }
      }
      try { copyFileSync(from, to); unlinkSync(from); } catch { /* give up silently */ }
    }
  } catch { /* never throw */ }
}

export function pruneRotatedFiles(dir: string): void {
  try {
    const entries = readdirSync(dir);
    const rotated: Array<{ p: string; m: number }> = [];
    for (const name of entries) {
      if (!name.startsWith('errors.') || !name.endsWith('.jsonl')) continue;
      if (name === 'errors.jsonl') continue;
      const full = path.join(dir, name);
      try {
        rotated.push({ p: full, m: statSync(full).mtimeMs });
      } catch { /* skip unreadable entry */ }
    }
    rotated.sort((a, b) => b.m - a.m);
    for (const { p } of rotated.slice(ROTATE_KEEP)) {
      try { unlinkSync(p); } catch { /* skip */ }
    }
  } catch { /* never throw */ }
}

let rotateCounter = 0;

// Only every Nth call stats the file, to protect the hot-path latency budget.
export function rotateIfNeeded(filePath: string): void {
  try {
    rotateCounter = (rotateCounter + 1) % ROTATE_THROTTLE_N;
    if (rotateCounter !== 0) return;
    if (!shouldRotate(filePath)) return;
    const iso = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const dir = path.dirname(filePath);
    const target = path.join(dir, `errors.${iso}-${process.pid}.jsonl`);
    safeRename(filePath, target);
    pruneRotatedFiles(dir);
  } catch { /* NEVER-throw */ }
}

export function __resetRotateCounterForTest(): void {
  rotateCounter = 0;
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
  kind?: EventKind;
}

// `payload` is trusted as-is — consumers must redact before calling; this
// layer only enforces the 4 KB line cap.
export interface LogHookEventInput extends LogHookErrorContext {
  level?: EventLevel;
  kind?: EventKind;
  payload?: Record<string, unknown>;
  correlationId?: string;
}

// Never throws. Over-budget lines drop stack, then msg, then payload.
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
      // appendFileSync failure below will swallow
    }
    rotateIfNeeded(ERRORS_LOG);
    appendFileSync(ERRORS_LOG, line + '\n');
  } catch {
    // never throw — logging must not cascade into a session blocker
  }
}

export function logHookError(ctx: LogHookErrorContext, err?: Error): void {
  logHookEvent({ ...ctx, level: 'error', kind: ctx.kind ?? 'unknown' }, err);
}

export function __resetCacheForTest(): void {
  cachedEnabled = null;
}
