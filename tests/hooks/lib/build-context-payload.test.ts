import { describe, expect, it } from "vitest";
import { buildContextCapsule } from "../../../src/hooks/lib/build-context-payload.js";
import type { WorkflowSnapshot } from "../../../src/hooks/lib/workflow-snapshot.js";

function snapshotWithCompactSummary(summary: string): WorkflowSnapshot {
  return {
    version: 2,
    cwd: "/repo",
    active: true,
    spec: {
      name: "demo",
      path: "specs/demo",
      fsPath: "/repo/specs/demo",
      statePath: "/repo/specs/demo/.curdx-state.json",
    },
    state: {
      exists: true,
      valid: true,
      phase: "execution",
      completed: false,
      awaitingApproval: false,
      quickMode: false,
      recommendedCapabilities: [],
      verificationBlocks: {},
    },
    artifacts: {
      research: { exists: true, path: "/repo/specs/demo/research.md" },
      requirements: { exists: true, path: "/repo/specs/demo/requirements.md" },
      design: { exists: true, path: "/repo/specs/demo/design.md" },
      tasks: { exists: true, path: "/repo/specs/demo/tasks.md" },
      progress: { exists: false, path: "/repo/specs/demo/.progress.md" },
    },
    tasks: {
      total: 1,
      completed: 0,
      pending: 1,
      currentIndex: 0,
      current: {
        id: "1.1",
        title: "Implement recovery capsule",
        lineStart: 1,
        lineEnd: 4,
        files: ["src/hooks/lib/build-context-payload.ts"],
      },
    },
    git: {
      available: true,
      branch: "main",
      dirty: false,
      changedFiles: 0,
    },
    recovery: {
      recentFailures: [
        {
          timestamp: "2026-05-13T00:00:00.000Z",
          type: "verification-blocked",
          phase: "execution",
          reason: "verification failed",
        },
      ],
      lastCompactSummary: {
        timestamp: "2026-05-13T00:00:00.000Z",
        summary,
      },
    },
    nextAction: "Run /curdx-flow:implement.",
    gates: [],
  };
}

describe("buildContextCapsule", () => {
  it("truncates multibyte compact summaries by UTF-8 byte budget", () => {
    const capsule = buildContextCapsule(snapshotWithCompactSummary("恢复".repeat(200)), 500);

    expect(Buffer.byteLength(capsule, "utf8")).toBeLessThanOrEqual(500);
    expect(capsule).toContain("---BEGIN CURDX SPEC DATA---");
    expect(capsule).toContain("compact-truncated=true");
    expect(capsule).toContain("---END CURDX SPEC DATA---");
  });
});
