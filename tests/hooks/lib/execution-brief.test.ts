import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildExecutionBrief, compactExecutionBrief } from "../../../src/hooks/lib/execution-brief.js";
import { appendBrainEvent } from "../../../src/hooks/lib/project-brain.js";
import { makeTmpDir } from "./_lib-helpers.js";

describe("execution-brief", () => {
  it("compiles route facts into a bounded execution contract", () => {
    const cwd = makeTmpDir("brief-plugin");
    try {
      writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ scripts: { verify: "npm test" } }));
      appendBrainEvent(cwd, {
        type: "verification-run",
        stack: "claude-code-plugin",
        phase: "execution",
        command: "CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc",
        exitCode: 0,
      });

      const brief = buildExecutionBrief({
        cwd,
        goal: "Update Claude Code plugin hooks and publish safely",
        changedFiles: ["plugins/curdx-flow/hooks/hooks.json", "src/hooks/task-completed-verifier.ts"],
      });

      expect(brief.version).toBe(1);
      expect(brief.route).toBe("full-spec");
      expect(brief.stack).toBe("claude-code-plugin");
      expect(brief.context.readFirst).toEqual(
        expect.arrayContaining(["https://code.claude.com/docs/llms.txt"]),
      );
      expect(brief.execution.agents).toEqual(
        expect.arrayContaining(["spec-executor", "spec-reviewer"]),
      );
      expect(brief.completionContract.join(" ")).toContain("fresh verification evidence");
      expect(brief.brain.verifierHints).toContain("CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc");
      expect(compactExecutionBrief(brief)).toContain("brief(route=full-spec");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
