import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { runHook } from "./_helpers.js";
import { createFixtureSpec, type FixtureSpec } from "./_fixture-setup.js";
import { IRON_LAW_SUMMARY } from "../../src/hooks/lib/build-context-payload.js";

const FIXTURE = "tests/hooks/fixtures/subagent-context-injector/with-spec.json";

describe("subagent-context-injector (SubagentStart hook)", () => {
  let activeSpec: FixtureSpec;

  beforeEach(() => {
    activeSpec = createFixtureSpec();
  });

  afterEach(() => {
    activeSpec.cleanup();
  });

  it("(a) happy: spec active + valid state → additionalContext contains phase:, spec:, iron-law:", () => {
    const r = runHook("subagent-context-injector", FIXTURE, {
      cwd: activeSpec.cwd,
    });
    expect(r.exitCode).toBe(0);
    expect(r.json).toBeDefined();
    const out = r.json as {
      hookSpecificOutput?: {
        hookEventName?: string;
        additionalContext?: string;
      };
      continue?: boolean;
    };
    expect(out.continue).toBe(true);
    expect(out.hookSpecificOutput?.hookEventName).toBe("SubagentStart");
    const ctx = out.hookSpecificOutput?.additionalContext ?? "";
    expect(ctx).toContain("phase:");
    expect(ctx).toContain("spec:");
    expect(ctx).toContain("iron-law:");
  });

  it("(b) state absent: no .curdx-state.json → {continue:true}, exit 0", () => {
    const noState = createFixtureSpec({
      specName: "no-state-spec",
      noStateFile: true,
    });
    try {
      const r = runHook("subagent-context-injector", FIXTURE, {
        cwd: noState.cwd,
      });
      expect(r.exitCode).toBe(0);
      expect(r.json).toEqual({ continue: true });
    } finally {
      noState.cleanup();
    }
  });

  it("(c) state malformed: bad JSON in state → exit 0 + stderr trace", () => {
    // Overwrite the state file produced by createFixtureSpec with garbage so
    // resolveCurrent succeeds but JSON.parse throws.
    const stateFile = path.join(
      activeSpec.cwd,
      "specs",
      activeSpec.specName,
      ".curdx-state.json",
    );
    writeFileSync(stateFile, "{not valid json");

    const r = runHook("subagent-context-injector", FIXTURE, {
      cwd: activeSpec.cwd,
    });
    expect(r.exitCode).toBe(0);
    expect(r.json).toEqual({ continue: true });
    expect(r.stderr).toContain("[subagent-context-injector]");
  });

  it("(d) payload size: JSON.stringify(output).length ≤ 2048 AND additionalContext.length ≤ 200", () => {
    const r = runHook("subagent-context-injector", FIXTURE, {
      cwd: activeSpec.cwd,
    });
    expect(r.exitCode).toBe(0);
    expect(r.json).toBeDefined();
    const totalLen = JSON.stringify(r.json).length;
    expect(totalLen).toBeLessThanOrEqual(2048);
    const ctx =
      (r.json as {
        hookSpecificOutput?: { additionalContext?: string };
      }).hookSpecificOutput?.additionalContext ?? "";
    expect(ctx.length).toBeLessThanOrEqual(200);
  });

  it("(e) iron-law verbatim: additionalContext contains exact IRON_LAW_SUMMARY string", () => {
    const r = runHook("subagent-context-injector", FIXTURE, {
      cwd: activeSpec.cwd,
    });
    expect(r.exitCode).toBe(0);
    const ctx =
      (r.json as {
        hookSpecificOutput?: { additionalContext?: string };
      }).hookSpecificOutput?.additionalContext ?? "";
    expect(ctx).toContain(IRON_LAW_SUMMARY);
  });
});
