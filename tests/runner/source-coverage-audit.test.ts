import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..", "..");

describe("source coverage audit contract", () => {
  it("is enforced by planner and spec reviewer", () => {
    const ref = readFileSync(
      join(ROOT, "plugins", "curdx-flow", "references", "source-coverage-audit.md"),
      "utf8",
    );
    const planner = readFileSync(
      join(ROOT, "plugins", "curdx-flow", "agents", "task-planner.md"),
      "utf8",
    );
    const reviewer = readFileSync(
      join(ROOT, "plugins", "curdx-flow", "agents", "spec-reviewer.md"),
      "utf8",
    );

    for (const body of [ref, planner, reviewer]) {
      expect(body).toContain("Source Coverage Audit");
      expect(body).toContain("COVERED");
      expect(body).toContain("DEFERRED");
      expect(body).toContain("BLOCKED");
    }
    expect(planner).toContain("TASKS_BLOCKED");
    expect(reviewer).toContain("REVIEW_FAIL");
  });

  it("locks the scope-reduction ban", () => {
    const planner = readFileSync(
      join(ROOT, "plugins", "curdx-flow", "agents", "task-planner.md"),
      "utf8",
    );
    for (const phrase of ["placeholder", "basic version", "static for now", "future enhancement"]) {
      expect(planner).toContain(phrase);
    }
  });
});
