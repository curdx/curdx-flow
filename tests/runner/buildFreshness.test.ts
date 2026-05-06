import { describe, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertFreshBuild } from '../../src/runner/buildFreshness.ts';

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
