import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { runHook } from "./_helpers.js";
import {
  createFixtureSpec,
  createLegacyState,
  type FixtureSpec,
} from "./_fixture-setup.js";

describe("stop-watcher (Stop hook)", () => {
  let demoSpec: FixtureSpec;
  let corruptSpec: FixtureSpec;

  beforeEach(() => {
    // Default fixture: phase=execution, taskIndex=1, totalTasks=3 → triggers
    // continuation block decision (current task < total).
    demoSpec = createFixtureSpec();
    // Corrupt-state fixture: same layout but the .curdx-state.json is invalid
    // JSON, exercising buildCorruptStateBlock().
    corruptSpec = createFixtureSpec({ noStateFile: true });
    writeFileSync(
      path.join(corruptSpec.cwd, "specs", corruptSpec.specName, ".curdx-state.json"),
      "{ this is not json",
    );
  });

  afterEach(() => {
    demoSpec.cleanup();
    corruptSpec.cleanup();
  });

  it("happy: spec mid-execution → exit 0, JSON decision=block with resume prompt", () => {
    const r = runHook(
      "stop-watcher",
      "tests/hooks/fixtures/stop-watcher/execution-block.json",
      { cwd: demoSpec.cwd },
    );
    expect(r.exitCode).toBe(0);
    expect(r.json).toBeDefined();
    expect((r.json as any).decision).toBe("block");
    expect((r.json as any).reason).toMatch(/Continue spec.*demo-spec/);
    expect((r.json as any).systemMessage).toMatch(/curdx-flow/);
    // Stderr banner echoes spec status for human visibility
    expect(r.stderr).toContain("demo-spec");
  });

  it("edge: corrupt state file → exit 0, JSON decision=block with recovery instructions", () => {
    const r = runHook(
      "stop-watcher",
      "tests/hooks/fixtures/stop-watcher/corrupt-state.json",
      { cwd: corruptSpec.cwd },
    );
    expect(r.exitCode).toBe(0);
    expect(r.json).toBeDefined();
    expect((r.json as any).decision).toBe("block");
    expect((r.json as any).reason).toMatch(/[Cc]orrupt state/);
    expect((r.json as any).systemMessage).toMatch(/corrupt state/i);
  });

  it("error: malformed stdin JSON → exit 0 (FR-8 never block Claude) + stderr error message", () => {
    const r = runHook(
      "stop-watcher",
      "tests/hooks/fixtures/stop-watcher/error-malformed.json",
    );
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain("invalid stdin JSON");
  });

  // NFR-5a: v7.1.0 completion marker — completed=true silent return
  it("completed=true → silent return (no continuation block)", () => {
    const completedSpec = createFixtureSpec({
      state: {
        phase: "execution",
        taskIndex: 3,
        totalTasks: 3,
        completed: true,
        completedAt: "2026-05-04T13:00:00.000Z",
      },
    });
    try {
      const r = runHook(
        "stop-watcher",
        "tests/hooks/fixtures/stop-watcher/execution-block.json",
        { cwd: completedSpec.cwd },
      );
      expect(r.exitCode).toBe(0);
      // Silent return: no stdout JSON decision block emitted.
      expect(r.stdout).toBe("");
      expect(r.json).toBeUndefined();
    } finally {
      completedSpec.cleanup();
    }
  });

  // NFR-5b / NFR-2: v7.0.x legacy state without `completed` field must fall
  // through to the existing in-progress continuation logic (backwards-compat).
  // Uses `createLegacyState()` to build the pre-v7.1.0 shape from scratch
  // (no `completed` key at all on disk — absence is explicit, not "set to
  // undefined"). The state file is written manually so DEFAULT_STATE's
  // `completed: false` doesn't leak in via createFixtureSpec's merge.
  it("legacy v7.0.x state (no `completed` key) → fall through to in-progress logic", () => {
    const legacySpec = createFixtureSpec({ noStateFile: true });
    try {
      const legacyState = createLegacyState({
        name: legacySpec.specName,
        phase: "execution",
        taskIndex: 1,
        totalTasks: 3,
      });
      // Sanity: the helper does not introduce a `completed` key.
      expect("completed" in legacyState).toBe(false);

      writeFileSync(
        path.join(
          legacySpec.cwd,
          "specs",
          legacySpec.specName,
          ".curdx-state.json",
        ),
        JSON.stringify(legacyState, null, 2),
      );

      const r = runHook(
        "stop-watcher",
        "tests/hooks/fixtures/stop-watcher/execution-block.json",
        { cwd: legacySpec.cwd },
      );
      expect(r.exitCode).toBe(0);
      // Continuation block IS emitted (NFR-2: legacy state → in-progress).
      expect(r.json).toBeDefined();
      expect((r.json as any).decision).toBe("block");
      expect((r.json as any).reason).toMatch(/Continue spec.*demo-spec/);
    } finally {
      legacySpec.cleanup();
    }
  });
});
