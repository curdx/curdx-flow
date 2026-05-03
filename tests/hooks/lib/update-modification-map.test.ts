import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { runLib, makeTmpDir } from "./_lib-helpers.js";

describe("update-modification-map", () => {
  it("happy: creates .file-modifications.json and stores per-task file list", () => {
    const specDir = makeTmpDir("ummap-fresh");
    try {
      const r = runLib("update-modification-map", [
        specDir,
        "1.1",
        "src/a.ts",
        "src/b.ts",
      ]);
      expect(r.exitCode).toBe(0);
      const state = path.join(specDir, ".file-modifications.json");
      expect(existsSync(state)).toBe(true);
      const data = JSON.parse(readFileSync(state, "utf8")) as Record<
        string,
        string[]
      >;
      expect(data["1.1"]).toEqual(["src/a.ts", "src/b.ts"]);
      // stdout is compact JSON of the updated entry
      expect(r.json).toEqual({ "1.1": ["src/a.ts", "src/b.ts"] });
    } finally {
      rmSync(specDir, { recursive: true, force: true });
    }
  });

  it("dedupes when adding files already present for the same task", () => {
    const specDir = makeTmpDir("ummap-dedup");
    try {
      runLib("update-modification-map", [
        specDir,
        "2.3",
        "src/a.ts",
      ]);
      const r = runLib("update-modification-map", [
        specDir,
        "2.3",
        "src/a.ts",
        "src/b.ts",
      ]);
      expect(r.exitCode).toBe(0);
      const data = JSON.parse(
        readFileSync(path.join(specDir, ".file-modifications.json"), "utf8"),
      ) as Record<string, string[]>;
      expect(data["2.3"]).toEqual(["src/a.ts", "src/b.ts"]);
    } finally {
      rmSync(specDir, { recursive: true, force: true });
    }
  });

  it("accepts explicit .json state file path (vs spec dir)", () => {
    const specDir = makeTmpDir("ummap-explicit");
    const stateFile = path.join(specDir, "custom-name.json");
    try {
      const r = runLib("update-modification-map", [
        stateFile,
        "3.1",
        "src/x.ts",
      ]);
      expect(r.exitCode).toBe(0);
      expect(existsSync(stateFile)).toBe(true);
      const data = JSON.parse(readFileSync(stateFile, "utf8")) as Record<
        string,
        string[]
      >;
      expect(data["3.1"]).toEqual(["src/x.ts"]);
    } finally {
      rmSync(specDir, { recursive: true, force: true });
    }
  });
});
