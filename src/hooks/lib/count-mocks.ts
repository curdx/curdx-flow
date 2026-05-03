// src/hooks/lib/count-mocks.ts
//
// CLI utility: count mock-framework usages across test files in a tree.
//
// Supports the reality-verification skill, which flags mock-heavy test
// anti-patterns. Recursively walks <root>, identifies test files
// (*.test.* / *.spec.*), and counts occurrences of:
//   vi.mock(   jest.mock(   mock.fn(   vi.fn(   jest.fn(
//
// Usage:
//   node count-mocks.mjs [<root>]
//
// - <root> defaults to process.cwd() when omitted.
// - Skips: node_modules, dist, .git, coverage.
// - Output: compact JSON `{"tests":N,"mockUsages":N,"ratio":N}` + newline.
// - 0 test files → tests=0, mockUsages=0, ratio=0 (no divide-by-zero).
//
// Spec: specs/cross-platform-support/design.md → "Lib utilities → count-mocks".

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const TEST_FILE_RE = /\.(test|spec)\.(t|j)sx?$/;
const MOCK_USAGE_RE =
  /\b(?:vi|jest)\.mock\s*\(|\bmock\.fn\s*\(|\b(?:vi|jest)\.fn\s*\(/g;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "coverage"]);

/**
 * Recursively yield absolute paths to test files under `dir`. Skips
 * SKIP_DIRS by name. Stat / read failures on individual entries log to
 * stderr and the walk continues.
 */
function* walkTests(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    process.stderr.write(
      `count-mocks: failed to read ${dir}: ${(err as Error).message}\n`,
    );
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = path.join(dir, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      yield* walkTests(abs);
    } else if (st.isFile() && TEST_FILE_RE.test(name)) {
      yield abs;
    }
  }
}

/** Count mock-pattern matches in the file contents. */
function countMocksInFile(file: string): number {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    process.stderr.write(
      `count-mocks: failed to read ${file}: ${(err as Error).message}\n`,
    );
    return 0;
  }
  const matches = raw.match(MOCK_USAGE_RE);
  return matches ? matches.length : 0;
}

function main(): void {
  const args = process.argv.slice(2);
  const rootArg = args[0];
  const root = rootArg === undefined ? process.cwd() : rootArg;

  let tests = 0;
  let mockUsages = 0;

  try {
    const st = statSync(root);
    if (!st.isDirectory()) {
      process.stderr.write(`count-mocks: not a directory: ${root}\n`);
      process.exit(1);
    }
  } catch (err) {
    process.stderr.write(
      `count-mocks: cannot stat ${root}: ${(err as Error).message}\n`,
    );
    process.exit(1);
  }

  for (const file of walkTests(root)) {
    tests++;
    mockUsages += countMocksInFile(file);
  }

  const ratio = tests > 0 ? mockUsages / tests : 0;
  process.stdout.write(
    JSON.stringify({ tests, mockUsages, ratio }) + "\n",
  );
}

main();
