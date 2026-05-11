import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..", "..");
const AGENTS = join(ROOT, "plugins", "curdx-flow", "agents");
const REFS = join(ROOT, "plugins", "curdx-flow", "references");

describe("agent output contract", () => {
  it("documents all canonical agent markers", () => {
    const doc = readFileSync(join(REFS, "agent-output-contract.md"), "utf8");
    for (const marker of [
      "RESEARCH_COMPLETE",
      "REQUIREMENTS_COMPLETE",
      "DESIGN_COMPLETE",
      "TASKS_READY",
      "TASK_COMPLETE",
      "TASK_MODIFICATION_REQUEST",
      "VERIFICATION_PASS",
      "REVIEW_PASS",
      "EPIC_READY",
    ]) {
      expect(doc).toContain(marker);
    }
  });

  it("critical agents mention their success and failure markers", () => {
    const cases = [
      ["research-analyst.md", "RESEARCH_COMPLETE", "RESEARCH_BLOCKED"],
      ["product-manager.md", "REQUIREMENTS_COMPLETE", "REQUIREMENTS_BLOCKED"],
      ["architect-reviewer.md", "DESIGN_COMPLETE", "DESIGN_BLOCKED"],
      ["task-planner.md", "TASKS_READY", "TASKS_BLOCKED"],
      ["spec-executor.md", "TASK_COMPLETE", "TASK_MODIFICATION_REQUEST"],
      ["qa-engineer.md", "VERIFICATION_PASS", "VERIFICATION_FAIL"],
      ["triage-analyst.md", "EPIC_READY", "EPIC_BLOCKED"],
    ] as const;

    for (const [file, success, failure] of cases) {
      const body = readFileSync(join(AGENTS, file), "utf8");
      expect(body, `${file} missing ${success}`).toContain(success);
      expect(body, `${file} missing ${failure}`).toContain(failure);
    }
  });
});
