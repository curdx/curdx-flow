import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runLib, makeTmpDir } from "./_lib-helpers.js";

describe("init-execution-state", () => {
  it("happy: writes .curdx-state.json into a fresh spec dir", () => {
    const specDir = makeTmpDir("init-fresh");
    try {
      const r = runLib("init-execution-state", [specDir]);
      expect(r.exitCode).toBe(0);
      const target = path.join(specDir, ".curdx-state.json");
      expect(existsSync(target)).toBe(true);
      const parsed = JSON.parse(readFileSync(target, "utf8")) as Record<
        string,
        unknown
      >;
      // Required template fields per the embedded fallback shape.
      expect(parsed).toMatchObject({
        phase: "execution",
        taskIndex: 0,
        taskIteration: 1,
        globalIteration: 1,
        recoveryMode: false,
      });
      // stdout prints absolute target path
      expect(r.stdout.trim()).toBe(target);
    } finally {
      rmSync(specDir, { recursive: true, force: true });
    }
  });

  it("refuses to overwrite existing state without --force", () => {
    const specDir = makeTmpDir("init-existing");
    const target = path.join(specDir, ".curdx-state.json");
    writeFileSync(target, '{"existing":true}');
    try {
      const r = runLib("init-execution-state", [specDir]);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toMatch(/already exists; pass --force/);
      // file untouched
      expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({
        existing: true,
      });
    } finally {
      rmSync(specDir, { recursive: true, force: true });
    }
  });

  it("--force overwrites existing state", () => {
    const specDir = makeTmpDir("init-force");
    const target = path.join(specDir, ".curdx-state.json");
    writeFileSync(target, '{"existing":true}');
    try {
      const r = runLib("init-execution-state", [specDir, "--force"]);
      expect(r.exitCode).toBe(0);
      const after = JSON.parse(readFileSync(target, "utf8")) as Record<
        string,
        unknown
      >;
      expect(after.phase).toBe("execution");
    } finally {
      rmSync(specDir, { recursive: true, force: true });
    }
  });
});
