import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeTmpDir, runLib } from "./_lib-helpers.js";

describe("goal-bridge", () => {
  it("builds a native /goal condition from the active spec state", () => {
    const cwd = makeTmpDir("goal-bridge");
    try {
      const specDir = path.join(cwd, "specs", "goal-demo");
      mkdirSync(specDir, { recursive: true });
      writeFileSync(path.join(cwd, "specs", ".current-spec"), "goal-demo\n");
      writeFileSync(
        path.join(specDir, "tasks.md"),
        [
          "# Tasks",
          "",
          "- [x] 1.1 Done slice",
          "  - **Verify**: `npm test`",
          "",
          "- [ ] 1.2 Remaining slice",
          "  - **Verify**: `npm test`",
          "",
        ].join("\n"),
      );
      writeFileSync(
        path.join(specDir, ".curdx-state.json"),
        JSON.stringify({
          version: 2,
          source: "spec",
          name: "goal-demo",
          basePath: "./specs/goal-demo",
          phase: "execution",
          taskIndex: 1,
          totalTasks: 2,
          autoPolicy: {
            version: 2,
            mode: "auto",
            risk: "medium",
            executionMode: "standard",
            executionDriver: "goal",
            taskGranularity: "standard",
            taskTargetRange: { min: 3, max: 7 },
            reviewCadence: "final",
            verificationLevel: "standard",
            subagentPolicy: "on-demand",
            maxGlobalIterations: 18,
            maxTaskIterations: 4,
            shouldSplitSpec: false,
            reasons: ["fixture"],
          },
          verificationBlocks: {
            execution: {
              command: "npm test",
              exitCode: 0,
              timestamp: new Date().toISOString(),
              srcMtime: Date.now() - 1000,
            },
          },
          completed: false,
        }),
      );

      const result = runLib("runtime-cli", [
        "goal",
        "--cwd",
        cwd,
        "--goal",
        "Finish the demo spec",
        "--max-turns",
        "9",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.json).toMatchObject({
        version: 1,
      });
      const json = result.json as {
        condition: string;
        slashCommand: string;
        evidenceProtocol: string[];
      };
      expect(json.condition.length).toBeLessThanOrEqual(4000);
      expect(json.slashCommand).toMatch(/^\/goal /);
      expect(json.condition).toContain("specs/goal-demo");
      expect(json.condition).toContain("ALL_TASKS_COMPLETE");
      expect(json.condition).toContain("exitCode 0");
      expect(json.condition).toContain("Stop after 9 goal turns");
      expect(json.evidenceProtocol.join("\n")).toContain("tasks.md shows 1/2");
      expect(result.stdout).not.toMatch(/"size"\s*:/);
      expect(result.stdout).not.toMatch(/stopHookPolicy|short-continuation|full-loop|\bXS\b|\bXL\b/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
