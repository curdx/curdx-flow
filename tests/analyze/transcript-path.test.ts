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
