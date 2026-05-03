import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runLib, makeTmpDir } from "./_lib-helpers.js";

describe("ensure-gitignore", () => {
  it("happy: creates .gitignore when missing", () => {
    const dir = makeTmpDir("gi-create");
    try {
      const r = runLib("ensure-gitignore", [".curdx-state.json"], { cwd: dir });
      expect(r.exitCode).toBe(0);
      const gi = path.join(dir, ".gitignore");
      expect(existsSync(gi)).toBe(true);
      expect(readFileSync(gi, "utf8")).toBe(".curdx-state.json\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("idempotent: existing entry → no change", () => {
    const dir = makeTmpDir("gi-idempotent");
    const gi = path.join(dir, ".gitignore");
    writeFileSync(gi, "node_modules\n.curdx-state.json\n");
    const before = readFileSync(gi, "utf8");
    try {
      const r = runLib("ensure-gitignore", [".curdx-state.json"], { cwd: dir });
      expect(r.exitCode).toBe(0);
      expect(readFileSync(gi, "utf8")).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("happy: appends with leading newline when file lacks trailing newline", () => {
    const dir = makeTmpDir("gi-append");
    const gi = path.join(dir, ".gitignore");
    writeFileSync(gi, "node_modules"); // no trailing \n
    try {
      const r = runLib("ensure-gitignore", [".curdx-state.json"], { cwd: dir });
      expect(r.exitCode).toBe(0);
      expect(readFileSync(gi, "utf8")).toBe(
        "node_modules\n.curdx-state.json\n",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
