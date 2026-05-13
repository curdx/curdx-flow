import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  compactLastMileDecision,
  decideLastMile,
} from "../../../src/hooks/lib/last-mile-orchestrator.js";
import { appendBrainEvent } from "../../../src/hooks/lib/project-brain.js";
import { makeTmpDir, runLib } from "./_lib-helpers.js";

describe("last-mile orchestrator", () => {
  it("routes UI work to ui-ux-pro-max and browser evidence automatically", () => {
    const cwd = makeTmpDir("last-mile-ui");
    try {
      mkdirSync(path.join(cwd, "src"), { recursive: true });
      writeFileSync(
        path.join(cwd, "package.json"),
        JSON.stringify({
          dependencies: { react: "^19.0.0" },
          scripts: { test: "vitest", "test:e2e": "playwright test" },
        }),
      );

      const decision = decideLastMile({
        cwd,
        goal: "Update the React login page and verify browser interaction",
        changedFiles: ["src/Login.tsx"],
        availableCapabilities: ["ui-ux-pro-max", "chrome-devtools-mcp"],
      });

      expect(decision.phase).toBe("planning");
      expect(decision.problemTypes).toEqual(
        expect.arrayContaining(["ui-quality-risk", "browser-evidence-needed"]),
      );
      expect(decision.capabilityPlan).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "ui-ux-pro-max", availabilityState: "available" }),
          expect.objectContaining({ id: "chrome-devtools-mcp", availabilityState: "available" }),
        ]),
      );
      expect(decision.evidenceRequired.join(" ")).toContain("browser evidence");
      expect(compactLastMileDecision(decision)).toContain("lastMile(");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("switches repeated failures into recovery with memory and pua actions", () => {
    const cwd = makeTmpDir("last-mile-recovery");
    try {
      writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ scripts: { test: "vitest" } }));
      appendBrainEvent(cwd, {
        type: "verification-blocked",
        route: "full-spec",
        stack: "typescript",
        phase: "execution",
        reason: "first failure",
      });
      appendBrainEvent(cwd, {
        type: "verification-blocked",
        route: "full-spec",
        stack: "typescript",
        phase: "execution",
        reason: "second failure",
      });

      const decision = decideLastMile({
        cwd,
        goal: "Again debug the auth regression after failed twice",
        availableCapabilities: ["claude-mem", "pua"],
        verification: { ok: false, phase: "execution", reason: "tests still fail" },
      });

      expect(decision.phase).toBe("recovering");
      expect(decision.problemTypes).toEqual(
        expect.arrayContaining(["repeated-failure", "verification-gap"]),
      );
      expect(decision.capabilityPlan).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "claude-mem", availabilityState: "available" }),
          expect.objectContaining({ id: "pua", availabilityState: "available" }),
        ]),
      );
      expect(decision.recoveryInstruction).toContain("/claude-mem:mem-search");
      expect(decision.recoveryInstruction).toContain("/pua:");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("marks Claude Code plugin publish work as release-gated", () => {
    const decision = decideLastMile({
      cwd: process.cwd(),
      goal: "Publish the Claude Code plugin and push npm tag",
      changedFiles: [
        "plugins/curdx-flow/.claude-plugin/plugin.json",
        "src/hooks/user-prompt-expansion-guard.ts",
      ],
    });

    expect(decision.phase).toBe("releasing");
    expect(decision.problemTypes).toContain("release-risk");
    expect(decision.evidenceRequired.join(" ")).toContain("release evidence");
    expect(decision.blockingGates).toContain("release-gate-required");
  });

  it("surfaces missing dependency fallbacks instead of pretending wheels exist", () => {
    const cwd = makeTmpDir("last-mile-missing-deps");
    try {
      writeFileSync(
        path.join(cwd, "package.json"),
        JSON.stringify({ dependencies: { vue: "^3.5.0" } }),
      );

      const decision = decideLastMile({
        cwd,
        goal: "Update Vue page UI and verify in browser",
        availableCapabilities: [],
      });

      expect(decision.problemTypes).toContain("dependency-missing");
      expect(decision.capabilityPlan).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "ui-ux-pro-max",
            availabilityState: "missing",
            fallbackWhenMissing: expect.any(String),
          }),
          expect.objectContaining({
            id: "chrome-devtools-mcp",
            availabilityState: "missing",
            fallbackWhenMissing: expect.any(String),
          }),
        ]),
      );
      expect(decision.coordinatorInstruction).toContain("curdx-flow doctor");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("CLI emits the same decision surface", () => {
    const result = runLib("last-mile-orchestrator", [
      "--goal",
      "Again debug React browser failure after failed twice",
      "--available-capabilities",
      "claude-mem,pua,ui-ux-pro-max,chrome-devtools-mcp",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.json).toMatchObject({
      version: 1,
      problemTypes: expect.arrayContaining(["browser-evidence-needed"]),
      capabilityPlan: expect.any(Array),
    });
  });
});
