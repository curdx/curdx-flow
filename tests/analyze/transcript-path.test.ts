// Unit tests for src/analyze/transcript-path.ts (Phase 2 Task 2.1).
//
// Coverage:
//   1. encoding: cwd `/Users/x/foo` → encoded dir ends with `-Users-x-foo`
//   2. multi-session glob: 3 .jsonl files in encoded dir → all 3 in paths[]
//   3. missing project dir: no encoded dir → throws TranscriptNotFoundError
//   4. fixture override: existing file → kind='fixture', no glob
//   5. --session filter: 3 files, sessionFilter='abc' → only abc.jsonl returned
//
// Setup convention:
//   • mkdtempSync(os.tmpdir()) creates an isolated fake $HOME per test
//   • opts.homedir injection avoids touching real ~/.claude/projects
//   • afterEach removes the tmpdir tree

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  resolveTranscriptSource,
  TranscriptNotFoundError,
} from '../../src/analyze/transcript-path.ts';
import { cleanupOrphanState } from '../../src/analyze/index.ts';
import type { StateFile } from '../../src/analyze/types.ts';

let fakeHome: string;

beforeEach(() => {
  fakeHome = mkdtempSync(path.join(os.tmpdir(), 'curdx-resolver-'));
});

afterEach(() => {
  rmSync(fakeHome, { recursive: true, force: true });
});

/** Build the encoded project dir under fakeHome and seed it with N .jsonl files. */
function seedProject(cwd: string, sessionUuids: string[]): string {
  const encoded = cwd.replace(/\//g, '-');
  const projectDir = path.join(fakeHome, '.claude', 'projects', encoded);
  mkdirSync(projectDir, { recursive: true });
  for (const uuid of sessionUuids) {
    writeFileSync(path.join(projectDir, `${uuid}.jsonl`), '{}\n');
  }
  return projectDir;
}

describe('resolveTranscriptSource', () => {
  it('encodes cwd `/Users/x/foo` into project dir ending with `-Users-x-foo`', () => {
    const cwd = '/Users/x/foo';
    seedProject(cwd, ['session-a']);

    const src = resolveTranscriptSource({ cwd, homedir: fakeHome });

    expect(src.kind).toBe('real');
    if (src.kind !== 'real') throw new Error('unreachable');
    expect(src.encodedDir.endsWith('-Users-x-foo')).toBe(true);
    expect(src.realCwd).toBe(cwd);
    expect(src.cwd).toBe(cwd);
    expect(src.paths).toHaveLength(1);
  });

  it('returns all .jsonl files when the encoded dir has multiple sessions', () => {
    const cwd = '/Users/x/multi.session-test';
    seedProject(cwd, ['aaa-1', 'bbb-2', 'ccc-3']);

    const src = resolveTranscriptSource({ cwd, homedir: fakeHome });

    expect(src.kind).toBe('real');
    expect(src.paths).toHaveLength(3);
    const names = src.paths.map((p) => path.basename(p)).sort();
    expect(names).toEqual(['aaa-1.jsonl', 'bbb-2.jsonl', 'ccc-3.jsonl']);
  });

  it('throws TranscriptNotFoundError with path + hint when project dir is missing', () => {
    const cwd = '/Users/x/never-opened';
    // Note: no seedProject() — encoded dir does not exist.

    let caught: unknown;
    try {
      resolveTranscriptSource({ cwd, homedir: fakeHome });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(TranscriptNotFoundError);
    const e = caught as TranscriptNotFoundError;
    expect(e.path.endsWith('-Users-x-never-opened')).toBe(true);
    expect(e.hint).toContain('claude');
    expect(e.hint).toContain(cwd);
  });

  it('returns kind="fixture" when fixtureOverride is set, skipping the glob', () => {
    // Even though no encoded dir exists for this cwd, fixture override wins.
    const cwd = '/Users/x/foo';
    const fixturePath = path.join(fakeHome, 'fake-fixture.jsonl');
    writeFileSync(fixturePath, '{"ts":0}\n');

    const src = resolveTranscriptSource({
      cwd,
      fixtureOverride: fixturePath,
      homedir: fakeHome,
    });

    expect(src.kind).toBe('fixture');
    expect(src.paths).toEqual([fixturePath]);
    expect(src.cwd).toBe(cwd);
  });

  it('narrows paths to the matching uuid when sessionFilter is supplied', () => {
    const cwd = '/Users/x/filter-test';
    seedProject(cwd, ['abc', 'def', 'ghi']);

    const src = resolveTranscriptSource({
      cwd,
      sessionFilter: 'abc',
      homedir: fakeHome,
    });

    expect(src.kind).toBe('real');
    expect(src.paths).toHaveLength(1);
    expect(path.basename(src.paths[0]!)).toBe('abc.jsonl');
  });
});

// State GC tests (Phase 2 Task 2.2): cleanupOrphanState mutates state.files
// per the dual heuristic (mtime > 30d OR > 100 keys), preserving any path in
// `currentPaths`. We seed real fs entries because Pass 1 also drops via
// existsSync(); seedFixtureFile gives us real files under fakeHome.

function seedFixtureFile(name: string): string {
  const p = path.join(fakeHome, name);
  writeFileSync(p, '{}\n');
  return p;
}

describe('cleanupOrphanState', () => {
  it('drops entries older than 30 days (mtime threshold)', () => {
    const fresh = seedFixtureFile('fresh.jsonl');
    const stale = seedFixtureFile('stale.jsonl');
    const now = Date.now();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

    const state: StateFile = {
      version: 1,
      files: {
        [fresh]: { byteOffset: 10, lastModifiedMs: now - 1000, sizeBytes: 10 },
        [stale]: { byteOffset: 20, lastModifiedMs: now - THIRTY_DAYS_MS - 1000, sizeBytes: 20 },
      },
    };

    cleanupOrphanState(state, []);

    expect(Object.keys(state.files)).toEqual([fresh]);
    expect(state.files[stale]).toBeUndefined();
  });

  it('caps state.files at 100 entries by dropping oldest by lastModifiedMs', () => {
    // Seed 101 fresh on-disk fixtures so Pass 1 leaves them all alive,
    // then verify Pass 2 trims down to exactly 100 starting from the oldest.
    const now = Date.now();
    const state: StateFile = { version: 1, files: {} };
    const paths: string[] = [];
    for (let i = 0; i < 101; i++) {
      const p = seedFixtureFile(`session-${String(i).padStart(3, '0')}.jsonl`);
      paths.push(p);
      // i=0 oldest, i=100 newest; all within 30d window.
      state.files[p] = { byteOffset: i, lastModifiedMs: now - (101 - i) * 1000, sizeBytes: i };
    }

    cleanupOrphanState(state, []);

    expect(Object.keys(state.files)).toHaveLength(100);
    // Oldest (paths[0]) was dropped; newest survived.
    expect(state.files[paths[0]!]).toBeUndefined();
    expect(state.files[paths[100]!]).toBeDefined();
  });

  it('preserves entries listed in currentPaths even if stale', () => {
    const stale = seedFixtureFile('stale-but-current.jsonl');
    const now = Date.now();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

    const state: StateFile = {
      version: 1,
      files: {
        [stale]: { byteOffset: 5, lastModifiedMs: now - THIRTY_DAYS_MS - 5000, sizeBytes: 5 },
      },
    };

    cleanupOrphanState(state, [stale]);

    // currentPaths protects the entry from BOTH passes.
    expect(state.files[stale]).toBeDefined();
    expect(state.files[stale]!.byteOffset).toBe(5);
  });
});
