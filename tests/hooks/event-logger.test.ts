// Unit tests for src/hooks/_shared/error-logger.ts (logHookEvent / rotation /
// coerceKind) AND src/hooks/_shared/correlation.ts (buildCorrelationId).
//
// Phase 3 Task 3.2 — covers:
//   case 1: logHookEvent writes a row with all 4 new fields (level/kind/
//           payload/correlationId).
//   case 2: coerceKind unknown string → 'unknown' (back-compat for old rows).
//   case 3: rotation — file at >10 MB triggers rename to errors.<ts>-<pid>.jsonl
//           after the 10th call (throttle N=10), live errors.jsonl restarts.
//   case 4: payload pass-through — caller-supplied payload is written verbatim
//           (the analyze pipeline's D-9 PATH_FIELDS white-list lives in
//           redact.ts and is applied at READ-time, not write-time; the
//           logHookEvent contract trusts the caller — see error-logger.ts L260).
//   case 5: buildCorrelationId returns `<session_id>:<task_idx>:<iter>` exactly.
//   case 6: round-trip an old-format row (no level/kind) through the same
//           ?? defaults `loadErrorEntries` uses → level:'error', kind:'unknown'.
//   case 7: NEVER-throw — circular-reference payload does not propagate.
//
// Strategy: mock `node:os.homedir()` to point at a per-test mkdtemp dir so the
// real fs paths resolve under a sandbox; the module reads `homedir()` at
// import time, so we vi.hoisted() a fixture root and pin it before the dynamic
// import. Each test gets its own subdirectory layout via __resetCacheForTest /
// __resetRotateCounterForTest. Real fs is used (not mocked) so rotation +
// rename + prune behave end-to-end.

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, statSync, utimesSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Hoisted homedir override: set BEFORE the vi.mock factory runs so the
// dynamic import below sees the temp path.
const homeState = vi.hoisted(() => ({
  home: '',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: () => homeState.home,
  };
});

// Pre-create the homedir BEFORE module-load, otherwise SETTINGS_PATH /
// ERRORS_DIR get computed against an empty string (path.join('', ...)) and
// every later assertion misses the sandbox.
homeState.home = mkdtempSync(path.join(tmpdir(), 'event-logger-test-'));
mkdirSync(path.join(homeState.home, '.claude'), { recursive: true });
writeFileSync(
  path.join(homeState.home, '.claude', 'settings.json'),
  '{"errorLogEnabled":true}',
  'utf8',
);

const errorLoggerMod = await import('../../src/hooks/_shared/error-logger.ts');
const { logHookEvent, coerceKind, __resetCacheForTest, __resetRotateCounterForTest } =
  errorLoggerMod;

const correlationMod = await import('../../src/hooks/_shared/correlation.ts');
const { buildCorrelationId } = correlationMod;

const ERRORS_DIR = path.join(homeState.home, '.claude', 'curdx-flow');
const ERRORS_LOG = path.join(ERRORS_DIR, 'errors.jsonl');

function readLines(p: string): string[] {
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').filter((l) => l.length > 0);
}

describe('event-logger (logHookEvent + correlation)', () => {
  beforeEach(() => {
    // Wipe the curdx-flow dir so each test sees a fresh errors.jsonl tree.
    if (existsSync(ERRORS_DIR)) {
      rmSync(ERRORS_DIR, { recursive: true, force: true });
    }
    __resetCacheForTest();
    __resetRotateCounterForTest();
    // Re-write enable flag — __resetCacheForTest forces a fresh settings read.
    writeFileSync(
      path.join(homeState.home, '.claude', 'settings.json'),
      '{"errorLogEnabled":true}',
      'utf8',
    );
  });

  afterAll(() => {
    rmSync(homeState.home, { recursive: true, force: true });
  });

  it('case 1: logHookEvent writes a row with all 4 new fields (level/kind/payload/correlationId)', () => {
    logHookEvent({
      hook: 'stop-watcher',
      event: 'decision',
      msg: 'unit-1',
      level: 'decision',
      kind: 'stop_block_continuation',
      payload: { specName: 'foo', iteration: 3 },
      correlationId: 'sess123:0:1',
    });

    const lines = readLines(ERRORS_LOG);
    expect(lines).toHaveLength(1);
    const row = JSON.parse(lines[0]!);
    expect(row.level).toBe('decision');
    expect(row.kind).toBe('stop_block_continuation');
    expect(row.payload).toEqual({ specName: 'foo', iteration: 3 });
    expect(row.correlationId).toBe('sess123:0:1');
    // Sanity: pre-existing required fields still emit.
    expect(typeof row.ts).toBe('string');
    expect(row.hook).toBe('stop-watcher');
    expect(row.event).toBe('decision');
    expect(row.msg).toBe('unit-1');
  });

  it('case 2: coerceKind unknown string → coerced to "unknown"', () => {
    expect(coerceKind('not_a_real_kind')).toBe('unknown');
    expect(coerceKind(undefined)).toBe('unknown');
    expect(coerceKind(42)).toBe('unknown');
    expect(coerceKind(null)).toBe('unknown');
    // Known kinds round-trip unchanged.
    expect(coerceKind('stop_block_continuation')).toBe('stop_block_continuation');
    expect(coerceKind('task_verify_pass')).toBe('task_verify_pass');
  });

  it('case 3: rotation triggers on size >10 MB after throttle N=10 → live file renames + restarts', () => {
    // Pre-stage a fake oversized errors.jsonl (>10 MB) so shouldRotate fires.
    mkdirSync(ERRORS_DIR, { recursive: true });
    const tenMB = 10 * 1024 * 1024;
    // 10 MB + 1 KB of dummy content. Single big string is fine; we only
    // care about file size, not parseability — rotation moves the WHOLE file.
    writeFileSync(ERRORS_LOG, 'x'.repeat(tenMB + 1024), 'utf8');
    expect(statSync(ERRORS_LOG).size).toBeGreaterThan(tenMB);

    // First 9 calls: throttle skips the size check (counter % 10 !== 0).
    // 10th call: shouldRotate fires → live file renames → new line written
    // to a fresh errors.jsonl.
    for (let i = 0; i < 10; i++) {
      logHookEvent({
        hook: 'stop-watcher',
        event: 'rotation-test',
        msg: `call-${i}`,
        level: 'info',
        kind: 'unknown',
      });
    }

    // After the 10th call rotation should have fired:
    //   - errors.jsonl exists and is small (only the 10th call's line).
    //   - exactly one rotated archive `errors.<ts>-<pid>.jsonl` is present.
    const liveSize = statSync(ERRORS_LOG).size;
    expect(liveSize).toBeLessThan(tenMB); // restarted from empty + 1 line

    const archives = readdirSync(ERRORS_DIR).filter(
      (n) => n.startsWith('errors.') && n.endsWith('.jsonl') && n !== 'errors.jsonl',
    );
    expect(archives.length).toBe(1);
    // Suffix shape: errors.<ISO-ts>-<pid>.jsonl, e.g. errors.20260507T120000Z-12345.jsonl
    expect(archives[0]).toMatch(/^errors\.\d{8}T\d{6}Z-\d+\.jsonl$/);

    // Live file's last line is the 10th call's row.
    const liveLines = readLines(ERRORS_LOG);
    expect(liveLines.length).toBeGreaterThanOrEqual(1);
    const lastRow = JSON.parse(liveLines[liveLines.length - 1]!);
    expect(lastRow.event).toBe('rotation-test');
  });

  it('case 4: payload pass-through preserves all caller-supplied keys verbatim', () => {
    // Per error-logger.ts L260 the logHookEvent contract is "consumers
    // redact before calling; this layer trusts what it gets" — D-9
    // PATH_FIELDS redaction lives in src/analyze/redact.ts and runs
    // at read/render time, not write time. Verify that payload keys
    // including PATH_FIELDS members survive the write unmodified so
    // the analyze pipeline can apply white-list policy on its own.
    const PATH_FIELDS = ['cwd', 'path', 'file', 'transcript_path', 'projectPath'];
    const payload: Record<string, unknown> = {
      specName: 'spec-decision-event-logging',
      iteration: 7,
    };
    for (const f of PATH_FIELDS) {
      payload[f] = `/Users/dev/${f}`;
    }

    logHookEvent({
      hook: 'subagent-context-injector',
      event: 'pass-through',
      level: 'info',
      kind: 'subagent_context_injected',
      payload,
    });

    const lines = readLines(ERRORS_LOG);
    expect(lines).toHaveLength(1);
    const row = JSON.parse(lines[0]!);
    // All keys, including white-list members, are written verbatim.
    expect(row.payload).toEqual(payload);
    for (const f of PATH_FIELDS) {
      expect(row.payload[f]).toBe(`/Users/dev/${f}`);
    }
  });

  it('case 5: buildCorrelationId returns `<session_id>:<task_idx>:<iter>` exactly', () => {
    const stdin = {
      transcript_path: '/Users/dev/.claude/projects/foo/abc123-session.jsonl',
    };
    const state = {
      phase: 'execution',
      taskIndex: 4,
      taskIteration: 2,
      globalIteration: 9,
    };
    // execution phase → uses taskIteration (2), basename strips `.jsonl`
    expect(buildCorrelationId(stdin, state as never)).toBe('abc123-session:4:2');

    // Non-execution phase → uses globalIteration.
    const researchState = { ...state, phase: 'research' };
    expect(buildCorrelationId(stdin, researchState as never)).toBe('abc123-session:4:9');

    // Both null → defaults: 'unknown:0:1'
    expect(buildCorrelationId(null, null)).toBe('unknown:0:1');
  });

  it('case 6: round-trip — old errors.jsonl row without level/kind parses with `??` defaults', () => {
    // Mirrors the exact ?? logic loadErrorEntries in src/analyze/index.ts uses
    // (Task 3.1). Old rows lacking level/kind/payload/correlationId default to
    // {level:'error', kind:'unknown', payload:undefined, correlationId:undefined}.
    function parseEventLine(line: string): {
      ts: string;
      level: string;
      kind: string;
      payload?: Record<string, unknown>;
      correlationId?: string;
    } {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const level =
        parsed.level === 'error' ||
        parsed.level === 'info' ||
        parsed.level === 'metric' ||
        parsed.level === 'decision'
          ? (parsed.level as string)
          : 'error';
      const kind = typeof parsed.kind === 'string' ? parsed.kind : 'unknown';
      const payload =
        parsed.payload && typeof parsed.payload === 'object' && !Array.isArray(parsed.payload)
          ? (parsed.payload as Record<string, unknown>)
          : undefined;
      const correlationId =
        typeof parsed.correlationId === 'string' ? parsed.correlationId : undefined;
      return {
        ts: typeof parsed.ts === 'string' ? parsed.ts : '',
        level,
        kind,
        ...(payload !== undefined ? { payload } : {}),
        ...(correlationId !== undefined ? { correlationId } : {}),
      };
    }

    // Old-format line (pre-OB-2): just ts/hook/event/msg, no level/kind/etc.
    const oldLine = JSON.stringify({
      ts: '2026-04-01T12:00:00.000Z',
      hook: 'stop-watcher',
      event: 'legacy-error',
      msg: 'pre-OB-2 row',
    });
    const oldParsed = parseEventLine(oldLine);
    expect(oldParsed.level).toBe('error');
    expect(oldParsed.kind).toBe('unknown');
    expect(oldParsed.payload).toBeUndefined();
    expect(oldParsed.correlationId).toBeUndefined();

    // New-format line round-trips byte-exact.
    logHookEvent({
      hook: 'stop-watcher',
      event: 'new-event',
      msg: 'post-OB-2 row',
      level: 'decision',
      kind: 'stop_block_continuation',
      payload: { iteration: 5 },
      correlationId: 's1:0:1',
    });
    const newLine = readLines(ERRORS_LOG)[0]!;
    const newParsed = parseEventLine(newLine);
    expect(newParsed.level).toBe('decision');
    expect(newParsed.kind).toBe('stop_block_continuation');
    expect(newParsed.payload).toEqual({ iteration: 5 });
    expect(newParsed.correlationId).toBe('s1:0:1');
  });

  it('case 7: NEVER-throw — circular-reference payload does not propagate (NFR-9)', () => {
    // Build a circular-reference payload. JSON.stringify will throw
    // "Converting circular structure to JSON" — logHookEvent's outer
    // try/catch must swallow it.
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;

    expect(() =>
      logHookEvent({
        hook: 'stop-watcher',
        event: 'circular-payload',
        level: 'info',
        kind: 'unknown',
        payload: circular,
      }),
    ).not.toThrow();

    // After the throw is swallowed, errors.jsonl may not have the bad row,
    // but the file must remain intact (no corruption / no crash). A
    // subsequent well-formed call MUST still succeed.
    expect(() =>
      logHookEvent({
        hook: 'stop-watcher',
        event: 'after-circular',
        level: 'info',
        kind: 'unknown',
      }),
    ).not.toThrow();

    const lines = readLines(ERRORS_LOG);
    // At least the second well-formed call landed.
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const lastRow = JSON.parse(lines[lines.length - 1]!);
    expect(lastRow.event).toBe('after-circular');
  });
});
