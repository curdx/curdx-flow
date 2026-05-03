import { describe, it, expect } from "vitest";
import { runHook } from "./_helpers.js";

describe("stop-watcher (Stop hook)", () => {
  it("happy: spec mid-execution → exit 0, JSON decision=block with resume prompt", () => {
    const r = runHook(
      "stop-watcher",
      "tests/hooks/fixtures/stop-watcher/execution-block.json",
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
});
