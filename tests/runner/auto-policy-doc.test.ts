import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("AutoPolicy workflow docs", () => {
  it("start/new/tasks/implement surfaces all policy override flags", () => {
    const docs = [
      read("plugins/curdx-flow/skills/start/SKILL.md"),
      read("plugins/curdx-flow/skills/tasks/SKILL.md"),
      read("plugins/curdx-flow/skills/implement/SKILL.md"),
      read("plugins/curdx-flow/skills/help/SKILL.md"),
      read("plugins/curdx-flow/skills/curdx-core/SKILL.md"),
    ].join("\n");

    expect(docs).toContain("--mode auto|fast|deep");
    expect(docs).toContain("--tasks-size auto|coarse|standard|fine");
    expect(docs).toContain("--review minimal|standard|strict");
    expect(docs).toContain("autoPolicy");
  });

  it("task sizing docs enforce vertical slices and bounded task counts", () => {
    const sizing = read("plugins/curdx-flow/references/sizing-rules.md");
    const planner = read("plugins/curdx-flow/agents/task-planner.md");
    const combined = `${sizing}\n${planner}`;

    expect(combined).toContain("vertical slice");
    expect(combined).toContain("`lite-spec` | 1-3");
    expect(combined).toContain("`full-spec` | 3-7");
    expect(combined).toContain("If a single spec would exceed 12 top-level tasks");
    expect(combined).not.toContain("Target task count (POC) | 40-60+");
    expect(combined).not.toContain("Fine: Total task count is 40+");
  });
});
