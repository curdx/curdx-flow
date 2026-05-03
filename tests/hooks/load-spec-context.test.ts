import { describe, it, expect } from "vitest";
import { runHook } from "./_helpers.js";

describe("load-spec-context (SessionStart hook)", () => {
  it("happy: with active spec → exit 0, JSON {active:true} + spec metadata", () => {
    const r = runHook(
      "load-spec-context",
      "tests/hooks/fixtures/load-spec-context/with-spec.json",
    );
    expect(r.exitCode).toBe(0);
    expect(r.json).toBeDefined();
    expect(r.json).toMatchObject({
      active: true,
      specName: "demo-spec",
      phase: "execution",
      taskIndex: 1,
      totalTasks: 3,
    });
    // Stderr surfaces the human-readable banner Claude reads
    expect(r.stderr).toContain("[curdx-flow]");
    expect(r.stderr).toContain("demo-spec");
  });

  it("edge: quick-mode spec at design phase → exit 0, JSON active:true with phase=design", () => {
    const r = runHook(
      "load-spec-context",
      "tests/hooks/fixtures/load-spec-context/quick-mode.json",
    );
    expect(r.exitCode).toBe(0);
    expect(r.json).toBeDefined();
    expect(r.json).toMatchObject({
      active: true,
      specName: "quick-spec",
      phase: "design",
    });
  });

  it("error: malformed stdin JSON → exit 0 (FR-8 never block) + stderr error message", () => {
    const r = runHook(
      "load-spec-context",
      "tests/hooks/fixtures/load-spec-context/error-malformed.json",
    );
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain("invalid stdin JSON");
  });
});
