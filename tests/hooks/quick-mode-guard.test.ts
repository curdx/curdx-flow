import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runHook } from "./_helpers.js";
import { createFixtureSpec, type FixtureSpec } from "./_fixture-setup.js";

describe("quick-mode-guard (PreToolUse hook for AskUserQuestion)", () => {
  let quickActive: FixtureSpec;
  let quickInactive: FixtureSpec;

  beforeEach(() => {
    // quick-active fixture targets a spec with quickMode=true
    quickActive = createFixtureSpec({
      specName: "quick-spec",
      state: { phase: "design", quickMode: true, taskIndex: 0, totalTasks: 0 },
    });
    // quick-inactive fixture targets a spec with quickMode=false (default)
    quickInactive = createFixtureSpec();
  });

  afterEach(() => {
    quickActive.cleanup();
    quickInactive.cleanup();
  });

  it("happy: quick mode active → exit 0, JSON decision=deny + permission-deny payload", () => {
    const r = runHook(
      "quick-mode-guard",
      "tests/hooks/fixtures/quick-mode-guard/quick-active.json",
      { cwd: quickActive.cwd },
    );
    expect(r.exitCode).toBe(0);
    expect(r.json).toBeDefined();
    expect(r.json).toMatchObject({
      decision: "deny",
    });
    expect((r.json as any).hookSpecificOutput).toMatchObject({
      permissionDecision: "deny",
    });
    expect((r.json as any).systemMessage).toMatch(/quick mode/i);
  });

  it("edge: spec exists but quick mode is OFF → exit 0, JSON decision=allow", () => {
    const r = runHook(
      "quick-mode-guard",
      "tests/hooks/fixtures/quick-mode-guard/quick-inactive.json",
      { cwd: quickInactive.cwd },
    );
    expect(r.exitCode).toBe(0);
    expect(r.json).toBeDefined();
    expect((r.json as any).decision).toBe("allow");
  });

  it("error: malformed stdin JSON → exit 0 (FR-8 never block) + stderr error message", () => {
    const r = runHook(
      "quick-mode-guard",
      "tests/hooks/fixtures/quick-mode-guard/error-malformed.json",
    );
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain("invalid stdin JSON");
  });
});
