import { describe, it, expect } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runLib, makeTmpDir } from "./_lib-helpers.js";

describe("count-mocks", () => {
  it("happy: counts vi.mock / jest.mock / mock.fn / vi.fn occurrences across test files", () => {
    const root = makeTmpDir("countmocks");
    const testsDir = path.join(root, "tests");
    mkdirSync(testsDir);
    writeFileSync(
      path.join(testsDir, "a.test.ts"),
      "vi.mock('foo'); vi.fn(); const x = 1;",
    );
    writeFileSync(
      path.join(testsDir, "b.spec.js"),
      "jest.mock('bar'); jest.fn(); mock.fn();",
    );
    writeFileSync(
      path.join(testsDir, "not-a-test.ts"),
      "vi.mock('ignored');", // not test/spec named, should NOT be counted
    );
    try {
      const r = runLib("count-mocks", [root]);
      expect(r.exitCode).toBe(0);
      expect(r.json).toEqual({ tests: 2, mockUsages: 5, ratio: 2.5 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("happy: zero test files → tests=0, mockUsages=0, ratio=0", () => {
    const root = makeTmpDir("countmocks-empty");
    try {
      const r = runLib("count-mocks", [root]);
      expect(r.exitCode).toBe(0);
      expect(r.json).toEqual({ tests: 0, mockUsages: 0, ratio: 0 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
