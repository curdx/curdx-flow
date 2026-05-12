import { existsSync, rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  appendBrainEvent,
  brainPath,
  readBrainEvents,
  summarizeProjectBrain,
} from "../../../src/hooks/lib/project-brain.js";
import { makeTmpDir } from "./_lib-helpers.js";

describe("project-brain", () => {
  it("stores lightweight project-local verification memory under .curdx", () => {
    const cwd = makeTmpDir("brain");
    try {
      const ok = appendBrainEvent(cwd, {
        type: "verification-run",
        stack: "go",
        phase: "execution",
        command: "go test ./...",
        exitCode: 0,
      });
      const blocked = appendBrainEvent(cwd, {
        type: "verification-blocked",
        route: "lite-spec",
        stack: "go",
        phase: "execution",
        verifier: "go test ./...",
        reason: "missing verification block",
      });

      expect(ok.ok).toBe(true);
      expect(blocked.ok).toBe(true);
      expect(existsSync(brainPath(cwd))).toBe(true);
      expect(readBrainEvents(cwd)).toHaveLength(2);

      const summary = summarizeProjectBrain(cwd);
      expect(summary.path).toContain(".curdx/brain.jsonl");
      expect(summary.totalEvents).toBe(2);
      expect(summary.stackHints).toContain("go");
      expect(summary.verifierHints).toContain("go test ./...");
      expect(summary.recentFailures[0]).toMatchObject({
        type: "verification-blocked",
        phase: "execution",
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
