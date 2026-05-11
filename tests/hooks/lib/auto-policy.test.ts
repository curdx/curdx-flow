import { describe, expect, it } from "vitest";
import { classifyAutoPolicy } from "../../../src/hooks/lib/auto-policy.js";

describe("auto-policy classifier", () => {
  it("classifies a single docs typo as XS direct work", () => {
    const policy = classifyAutoPolicy({
      goal: "Fix README typo",
      changedFiles: ["README.md"],
    });

    expect(policy.size).toBe("XS");
    expect(policy.risk).toBe("low");
    expect(policy.executionMode).toBe("direct");
    expect(policy.subagentPolicy).toBe("none");
    expect(policy.stopHookPolicy).toBe("disabled");
    expect(policy.taskTargetRange).toEqual({ min: 0, max: 1 });
  });

  it("keeps a small bounded feature in S with coarse tasks", () => {
    const policy = classifyAutoPolicy({
      goal: "Add validation message to login form",
      changedFiles: ["src/login.ts", "tests/login.test.ts"],
    });

    expect(policy.size).toBe("S");
    expect(policy.executionMode).toBe("spec-lite");
    expect(policy.taskGranularity).toBe("coarse");
    expect(policy.taskTargetRange).toEqual({ min: 1, max: 3 });
  });

  it("does not treat npm test as publish-critical release work", () => {
    const policy = classifyAutoPolicy({
      goal: "Implement src/greet.js so npm test passes",
      flags: "--mode fast --review minimal --tasks-size coarse",
      changedFiles: ["src/greet.js", "test/greet.test.js"],
    });

    expect(policy.size).toBe("S");
    expect(policy.risk).toBe("medium");
    expect(policy.executionMode).toBe("spec-lite");
    expect(policy.taskTargetRange).toEqual({ min: 1, max: 3 });
  });

  it("upgrades plugin hooks and manifest work to L strict execution", () => {
    const policy = classifyAutoPolicy({
      goal: "Optimize Claude Code plugin hooks and plugin manifest release behavior",
      changedFiles: [
        "plugins/curdx-flow/hooks/hooks.json",
        "plugins/curdx-flow/.claude-plugin/plugin.json",
        "src/hooks/stop-watcher.ts",
        "tests/hooks/stop-watcher.test.ts",
      ],
    });

    expect(policy.size).toBe("L");
    expect(policy.risk).toBe("critical");
    expect(policy.executionMode).toBe("deep-spec");
    expect(policy.reviewCadence).toBe("periodic");
    expect(policy.verificationLevel).toBe("strict");
  });

  it("routes oversized task plans to XL epic triage", () => {
    const policy = classifyAutoPolicy({
      goal: "Build a platform rewrite across multiple subsystems",
      estimatedFiles: 20,
      taskCount: 18,
    });

    expect(policy.size).toBe("XL");
    expect(policy.executionMode).toBe("epic-triage");
    expect(policy.shouldSplitSpec).toBe(true);
    expect(policy.taskTargetRange).toEqual({ min: 5, max: 10 });
  });

  it("honors explicit deep and review overrides deterministically", () => {
    const policy = classifyAutoPolicy({
      goal: "Add profile preference toggle",
      flags: "--mode deep --review strict --tasks-size fine",
      changedFiles: ["src/profile.ts", "tests/profile.test.ts"],
    });

    expect(policy.mode).toBe("deep");
    expect(policy.size).toBe("M");
    expect(policy.reviewCadence).toBe("strict");
    expect(policy.verificationLevel).toBe("strict");
    expect(policy.taskGranularity).toBe("fine");
  });
});
