import { describe, it, expect, afterEach } from "vitest";
import { runHook } from "./_helpers.js";
import {
  createFixtureSpec,
  type FixtureSpec,
} from "./_fixture-setup.js";

/**
 * Boundary tests for the cost-runaway hard cap gate
 * (spec-cost-runaway-guards Task 3.2 / FR-E1, FR-E2, FR-E3, R6).
 *
 * The gate lives at the top of `stop-watcher` (after the `stop_hook_active`
 * early-exit). Once either:
 *   - state.globalIteration >= state.maxGlobalIterations
 *   - state.taskIteration  >= state.maxTaskIterations
 * is true, the hook MUST emit a `decision: "block"` with the canonical D4
 * "Cost runaway guard tripped" reason. When both are still under their cap,
 * the gate falls through and other gates (continuation, etc.) drive the
 * decision.
 *
 * Cross-platform: each case uses `createFixtureSpec()` (os.tmpdir-backed)
 * and tears the dir down in afterEach, mirroring the pattern in
 * `stop-watcher.test.ts`.
 */

describe("stop-watcher cost-runaway gate (max-iterations enforcement)", () => {
  let spec: FixtureSpec | undefined;

  afterEach(() => {
    spec?.cleanup();
    spec = undefined;
  });

  it("blocks when state.globalIteration >= state.maxGlobalIterations (cost runaway)", () => {
    spec = createFixtureSpec({
      state: {
        phase: "execution",
        taskIndex: 1,
        totalTasks: 3,
        globalIteration: 30,
        maxGlobalIterations: 30,
        taskIteration: 1,
        maxTaskIterations: 5,
      },
    });
    const r = runHook(
      "stop-watcher",
      "tests/hooks/fixtures/stop-watcher/execution-block.json",
      { cwd: spec.cwd },
    );
    expect(r.exitCode).toBe(0);
    expect(r.json).toBeDefined();
    expect((r.json as any).decision).toBe("block");
    expect((r.json as any).reason).toContain("Cost runaway guard tripped");
    expect((r.json as any).reason).toContain("globalIteration=30");
    expect((r.json as any).reason).toContain("maxGlobalIterations=30");
  });

  it("blocks when state.taskIteration >= state.maxTaskIterations (task cap)", () => {
    spec = createFixtureSpec({
      state: {
        phase: "execution",
        taskIndex: 1,
        totalTasks: 3,
        globalIteration: 1,
        maxGlobalIterations: 30,
        taskIteration: 5,
        maxTaskIterations: 5,
      },
    });
    const r = runHook(
      "stop-watcher",
      "tests/hooks/fixtures/stop-watcher/execution-block.json",
      { cwd: spec.cwd },
    );
    expect(r.exitCode).toBe(0);
    expect(r.json).toBeDefined();
    expect((r.json as any).decision).toBe("block");
    expect((r.json as any).reason).toContain("Cost runaway guard tripped");
    expect((r.json as any).reason).toContain("taskIteration=5");
    expect((r.json as any).reason).toContain("maxTaskIterations=5");
  });

  it("does NOT trip the cost-runaway gate when both iterations are under cap", () => {
    spec = createFixtureSpec({
      state: {
        phase: "execution",
        taskIndex: 1,
        totalTasks: 3,
        globalIteration: 1,
        maxGlobalIterations: 30,
        taskIteration: 1,
        maxTaskIterations: 5,
      },
    });
    const r = runHook(
      "stop-watcher",
      "tests/hooks/fixtures/stop-watcher/execution-block.json",
      { cwd: spec.cwd },
    );
    expect(r.exitCode).toBe(0);
    // Other gates (continuation block) may still run and emit a decision —
    // we only assert the cost-runaway gate did NOT fire. The D4 message is
    // unique to this gate, so absence of its sentinel string is the
    // load-bearing assertion.
    const reason =
      r.json && typeof (r.json as any).reason === "string"
        ? ((r.json as any).reason as string)
        : "";
    expect(reason).not.toContain("Cost runaway guard tripped");
  });
});
