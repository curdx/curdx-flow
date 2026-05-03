import { describe, it, expect } from "vitest";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runLib, makeTmpDir } from "./_lib-helpers.js";

describe("cleanup-files", () => {
  it("happy: deletes glob-matched files under cwd, leaves non-matches", () => {
    const dir = makeTmpDir("cleanup");
    const keep = path.join(dir, "keep.txt");
    const drop1 = path.join(dir, "tmp-1.json");
    const drop2 = path.join(dir, "tmp-2.json");
    writeFileSync(keep, "stay");
    writeFileSync(drop1, "{}");
    writeFileSync(drop2, "{}");
    try {
      const r = runLib("cleanup-files", ["tmp-*.json"], { cwd: dir });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toMatch(/cleanup: tmp-\*\.json → 2 file\(s\) removed/);
      expect(existsSync(keep)).toBe(true);
      expect(existsSync(drop1)).toBe(false);
      expect(existsSync(drop2)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses unsafe absolute pattern with stderr warning", () => {
    const dir = makeTmpDir("cleanup-unsafe");
    try {
      const r = runLib("cleanup-files", ["/etc/passwd"], { cwd: dir });
      expect(r.exitCode).toBe(0); // best-effort: warns + skips, doesn't abort
      expect(r.stderr).toMatch(/refusing unsafe pattern/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
