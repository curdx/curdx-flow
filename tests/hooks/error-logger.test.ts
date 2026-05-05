// Unit tests for src/hooks/_shared/error-logger.ts (Phase 3 Task 3.2).
//
// We need to mock node:fs at module-load time because error-logger.ts caches
// `errorLogEnabled` after the first read. `vi.hoisted` lets the mock state
// outlive each test, and `__resetCacheForTest()` clears the in-module cache
// between cases so each scenario controls a fresh read.
//
// Coverage:
//   case 1: settings.json { errorLogEnabled: true } → appendFileSync called once
//           with a single JSON line containing all 5 required fields.
//   case 2: settings.json { errorLogEnabled: false } → appendFileSync not called.
//   case 3: settings.json corrupt → cachedEnabled defaults to true + stderr warning.
//   case 4: appendFileSync throws → logHookError swallows, does not propagate.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Hoisted mock state: shared module-scope refs that are visible from inside
// vi.mock factory (which runs before imports). Set per-test via fsState.* = ...
const fsState = vi.hoisted(() => ({
  settingsContent: '{"errorLogEnabled":true}',
  appendCalls: [] as Array<{ path: unknown; data: unknown }>,
  appendThrow: null as null | Error,
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn((p: unknown) => {
    if (typeof p === 'string' && p.endsWith('settings.json')) {
      return fsState.settingsContent;
    }
    const err: NodeJS.ErrnoException = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    throw err;
  }),
  appendFileSync: vi.fn((path: unknown, data: unknown) => {
    if (fsState.appendThrow) throw fsState.appendThrow;
    fsState.appendCalls.push({ path, data });
  }),
  mkdirSync: vi.fn(() => undefined),
}));

// Import AFTER vi.mock so the mocked fs is wired in.
const { logHookError, __resetCacheForTest } = await import('../../src/hooks/_shared/error-logger.ts');

describe('error-logger', () => {
  // Annotated as `any` because vi.spyOn returns a deeply-typed MockInstance
  // for stderr.write's overloads; the precise type tightens parameters in a
  // way that conflicts with the generic MockInstance shape we'd otherwise
  // need. Behavior is fully exercised through .mock.calls / .mockRestore().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrSpy: any;

  beforeEach(() => {
    fsState.appendCalls.length = 0;
    fsState.appendThrow = null;
    fsState.settingsContent = '{"errorLogEnabled":true}';
    __resetCacheForTest();
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('case 1: errorLogEnabled=true → appendFileSync called once with all 5 required fields', () => {
    fsState.settingsContent = '{"errorLogEnabled":true}';

    logHookError(
      {
        hook: 'quick-mode-guard',
        event: 'stdin-parse-failed',
        msg: 'unexpected token',
        cwd: '/tmp/test',
      },
      new Error('boom'),
    );

    expect(fsState.appendCalls).toHaveLength(1);
    const call = fsState.appendCalls[0]!;
    const dataStr = String(call.data);
    expect(dataStr.endsWith('\n')).toBe(true);

    // Parse the first (and only) line out of the appended chunk.
    const firstLine = dataStr.split('\n')[0]!;
    const parsed = JSON.parse(firstLine);
    // 5 required fields: ts, level, hook, event, msg
    expect(parsed).toHaveProperty('ts');
    expect(typeof parsed.ts).toBe('string');
    expect(parsed).toHaveProperty('level', 'error');
    expect(parsed).toHaveProperty('hook', 'quick-mode-guard');
    expect(parsed).toHaveProperty('event', 'stdin-parse-failed');
    expect(parsed).toHaveProperty('msg', 'unexpected token');
  });

  it('case 2: errorLogEnabled=false → appendFileSync not called', () => {
    fsState.settingsContent = '{"errorLogEnabled":false}';

    logHookError({ hook: 'h', event: 'e', msg: 'm' });

    expect(fsState.appendCalls).toHaveLength(0);
  });

  it('case 3: corrupt settings.json → defaults to enabled + stderr warning emitted', () => {
    fsState.settingsContent = '{not valid json';

    logHookError({ hook: 'h', event: 'e', msg: 'm' });

    // Defaulted to enabled → appendFileSync should have fired.
    expect(fsState.appendCalls).toHaveLength(1);

    // stderr breadcrumb must mention the fallback.
    const stderrText = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    expect(stderrText).toContain('[error-logger]');
    expect(stderrText).toContain('errorLogEnabled=true');
  });

  it('case 4: appendFileSync throws → logHookError swallows the error', () => {
    fsState.settingsContent = '{"errorLogEnabled":true}';
    fsState.appendThrow = Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });

    expect(() => logHookError({ hook: 'h', event: 'e', msg: 'm' })).not.toThrow();
  });
});
