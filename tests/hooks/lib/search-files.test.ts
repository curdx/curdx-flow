import { describe, it, expect } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runLib, makeTmpDir } from "./_lib-helpers.js";

describe("search-files", () => {
  it("happy: prints <path>:<line>:<content> for each match in dir tree", () => {
    const root = makeTmpDir("search");
    const sub = path.join(root, "src");
    mkdirSync(sub);
    writeFileSync(path.join(sub, "a.txt"), "alpha\nbeta\ngamma\n");
    writeFileSync(path.join(sub, "b.txt"), "delta\nbeta-suffix\n");
    writeFileSync(path.join(sub, "c.txt"), "no match here\n");
    try {
      const r = runLib("search-files", ["beta", root]);
      expect(r.exitCode).toBe(0);
      const lines = r.stdout.split("\n").filter((l) => l.length > 0);
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatch(/a\.txt:2:beta$/);
      expect(lines[1]).toMatch(/b\.txt:2:beta-suffix$/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("--name-only: prints <path> once per file with at least one match", () => {
    const root = makeTmpDir("search-name");
    writeFileSync(path.join(root, "a.txt"), "hit\nhit again\n");
    writeFileSync(path.join(root, "b.txt"), "miss\n");
    try {
      const r = runLib("search-files", ["hit", root, "--name-only"]);
      expect(r.exitCode).toBe(0);
      const lines = r.stdout.split("\n").filter((l) => l.length > 0);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/a\.txt$/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("invalid regex → exit 1 with stderr", () => {
    const root = makeTmpDir("search-bad");
    try {
      const r = runLib("search-files", ["[unclosed", root]);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toMatch(/invalid regex/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
