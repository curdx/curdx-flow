import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { runHook } from "./_helpers.js";

/**
 * update-spec-index reads cwd from the fixture, ignores stdin, and writes
 * specs/.index/{index-state.json,index.md} as a side-effect. Each test cleans
 * the index dir before running so assertions reflect this invocation only.
 */
function cleanIndex(cwd: string) {
  const indexDir = path.join(cwd, "specs/.index");
  if (existsSync(indexDir)) {
    rmSync(indexDir, { recursive: true, force: true });
  }
}

describe("update-spec-index (CLI hook for spec index regeneration)", () => {
  it("happy: cwd has one spec → exit 0, stderr 'Updated' lines, index files written with spec entry", () => {
    const cwd = "/tmp/curdx-fixture-spec";
    cleanIndex(cwd);
    const r = runHook(
      "update-spec-index",
      "tests/hooks/fixtures/update-spec-index/with-spec.json",
    );
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain("Updated");
    expect(r.stderr).toContain("1 specs in 1 directories");

    const stateJson = JSON.parse(
      readFileSync(path.join(cwd, "specs/.index/index-state.json"), "utf8"),
    );
    expect(stateJson.specs).toHaveLength(1);
    expect(stateJson.specs[0]).toMatchObject({
      name: "demo-spec",
      phase: "execution",
      taskIndex: 1,
      totalTasks: 3,
    });
  });

  it("edge: empty cwd with --quiet → exit 0, no stderr 'Updated' chatter, but files still written", () => {
    const cwd = "/tmp/curdx-fixture-empty";
    cleanIndex(cwd);
    const r = runHook(
      "update-spec-index",
      "tests/hooks/fixtures/update-spec-index/empty-quiet.json",
    );
    expect(r.exitCode).toBe(0);
    // --quiet suppresses the "Updated ..." progress lines
    expect(r.stderr).not.toContain("Updated");
    // Side-effect still runs
    expect(existsSync(path.join(cwd, "specs/.index/index-state.json"))).toBe(true);
    const stateJson = JSON.parse(
      readFileSync(path.join(cwd, "specs/.index/index-state.json"), "utf8"),
    );
    expect(stateJson.specs).toHaveLength(0);
  });

  it("error: bogus argv flags → exit 0 (FR-8 never block) and still produces output", () => {
    const cwd = "/tmp/curdx-fixture-empty";
    cleanIndex(cwd);
    const r = runHook(
      "update-spec-index",
      "tests/hooks/fixtures/update-spec-index/error-bogus-args.json",
    );
    expect(r.exitCode).toBe(0);
    // The hook must not crash on unknown flags; index should still be written
    expect(existsSync(path.join(cwd, "specs/.index/index-state.json"))).toBe(true);
  });
});
