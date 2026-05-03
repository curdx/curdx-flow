import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { runLib, makeTmpDir } from "./_lib-helpers.js";

/**
 * `get-default-branch` shells out to `git`. We can't easily test the full
 * fallback chain without manipulating `origin/HEAD` in a real repo, so the
 * happy-path test runs against the curdx-flow repo itself (which has a
 * proper `origin/HEAD` symbolic ref) and asserts the output is a non-empty
 * branch name.
 */
describe("get-default-branch", () => {
  it("happy: prints a non-empty branch name in this repo", () => {
    const r = runLib("get-default-branch", []);
    expect(r.exitCode).toBe(0);
    const out = r.stdout.trim();
    expect(out.length).toBeGreaterThan(0);
    // Common defaults — looser assertion than equality so the test stays
    // green if the upstream renames the default branch.
    expect(["main", "master"]).toContain(out);
  });

  it("exits 1 when run outside any git repo", () => {
    const dir = makeTmpDir("gdb-nogit");
    try {
      // execFileSync with cwd=tmp-dir (not a git repo) — every git call inside
      // the lib will fail, so resolveDefaultBranch returns null → exit 1.
      const r = runLib("get-default-branch", [], { cwd: dir });
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toMatch(/unable to determine default branch/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("git binary is available in PATH (sanity)", () => {
    expect(() =>
      execFileSync("git", ["--version"], { stdio: "ignore" }),
    ).not.toThrow();
  });
});
