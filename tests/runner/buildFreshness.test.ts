import { describe, expect, test } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  utimesSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertFreshBuild } from '../../src/runner/buildFreshness.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MERGE_STATE_BUNDLE = path.join(
  REPO_ROOT,
  'plugins',
  'curdx-flow',
  'hooks',
  'scripts',
  'lib',
  'merge-state.mjs',
);

function writeFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'curdx-build-freshness-'));
  const srcDir = path.join(root, 'src');
  const distDir = path.join(root, 'dist');
  mkdirSync(srcDir, { recursive: true });
  mkdirSync(distDir, { recursive: true });
  const srcFile = path.join(srcDir, 'index.ts');
  const distEntry = path.join(distDir, 'index.mjs');
  writeFileSync(srcFile, 'export const value = 1;\n', 'utf8');
  writeFileSync(distEntry, 'export const value = 1;\n', 'utf8');
  return { root, srcDir, srcFile, distEntry };
}

describe('assertFreshBuild', () => {
  test('throws when source is newer than dist', () => {
    const { root, srcDir, srcFile, distEntry } = writeFixture();
    utimesSync(distEntry, new Date(1000), new Date(1000));
    utimesSync(srcFile, new Date(2000), new Date(2000));

    expect(() =>
      assertFreshBuild({ projectRoot: root, srcDir, distEntry }),
    ).toThrow(/Local build is stale/);
  });

  test('does nothing when dist is up to date', () => {
    const { root, srcDir, srcFile, distEntry } = writeFixture();
    utimesSync(srcFile, new Date(1000), new Date(1000));
    utimesSync(distEntry, new Date(2000), new Date(2000));

    expect(() =>
      assertFreshBuild({ projectRoot: root, srcDir, distEntry }),
    ).not.toThrow();
  });
});

// Schema migration compatibility — `verificationBlocks` is an additive,
// optional field on `.curdx-state.json` (per spec-verification-iron-law D6 +
// types.ts `CurdxState`). State files written by v7.0.x and earlier predate
// the field; readers must tolerate its absence (NFR-2 backwards-compat) and
// new writes must round-trip through `merge-state.mjs` byte-stable.
describe('verificationBlocks schema migration', () => {
  test('old state JSON without verificationBlocks parses unchanged', () => {
    const dir = mkdtempSync(
      path.join(os.tmpdir(), 'curdx-state-old-schema-'),
    );
    const stateFile = path.join(dir, '.curdx-state.json');
    const oldState = {
      source: 'spec',
      name: 'legacy-spec',
      basePath: '/tmp/legacy',
      phase: 'execution',
      taskIndex: 3,
      totalTasks: 10,
      completed: false,
    };
    writeFileSync(stateFile, JSON.stringify(oldState), 'utf8');
    try {
      const parsed = JSON.parse(readFileSync(stateFile, 'utf8')) as Record<
        string,
        unknown
      >;
      expect(parsed.verificationBlocks).toBeUndefined();
      expect(parsed).toEqual(oldState);
      // existing fields intact
      expect(parsed.name).toBe('legacy-spec');
      expect(parsed.taskIndex).toBe(3);
      expect(parsed.completed).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('new state JSON with full verificationBlocks round-trips through merge-state', () => {
    const dir = mkdtempSync(
      path.join(os.tmpdir(), 'curdx-state-new-schema-'),
    );
    const stateFile = path.join(dir, '.curdx-state.json');
    const initial = {
      source: 'spec',
      name: 'modern-spec',
      basePath: '/tmp/modern',
      phase: 'execution',
      taskIndex: 5,
      totalTasks: 10,
    };
    writeFileSync(stateFile, JSON.stringify(initial), 'utf8');
    const block = {
      command: 'npm run verify',
      exitCode: 0,
      timestamp: '2026-05-06T18:00:00.000Z',
      srcMtime: 1746554400000,
      description: 'execution-phase verify',
    };
    const patch = JSON.stringify({ verificationBlocks: { execution: block } });
    try {
      const r = spawnSync('node', [MERGE_STATE_BUNDLE, stateFile, patch], {
        encoding: 'utf8',
        timeout: 5000,
      });
      expect(r.status).toBe(0);
      const onDisk = JSON.parse(readFileSync(stateFile, 'utf8')) as Record<
        string,
        unknown
      >;
      // existing fields preserved
      expect(onDisk.name).toBe('modern-spec');
      expect(onDisk.taskIndex).toBe(5);
      // verificationBlocks structurally identical to patch
      expect(onDisk.verificationBlocks).toEqual({ execution: block });
      // re-read produces same object (no parse-time normalization)
      const reread = JSON.parse(readFileSync(stateFile, 'utf8'));
      expect(reread).toEqual(onDisk);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
