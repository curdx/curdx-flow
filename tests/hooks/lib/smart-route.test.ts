import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifySmartRoute } from "../../../src/hooks/lib/smart-route.js";
import { makeTmpDir, runLib } from "./_lib-helpers.js";

describe("smart-route classifier", () => {
  it("routes a tiny docs fix to direct-change without spec or tasks", () => {
    const route = classifySmartRoute({
      goal: "Fix README typo",
      changedFiles: ["README.md"],
    });

    expect(route.route).toBe("direct-change");
    expect(route.shouldCreateSpec).toBe(false);
    expect(route.shouldCreateTasks).toBe(false);
    expect(route.shouldUseSubagent).toBe(false);
    expect(route.taskCountLimit).toBe(1);
    expect(route.nextAction).toContain("do not create a spec");
  });

  it("routes a bounded local feature to lite-spec with a small value-slice cap", () => {
    const route = classifySmartRoute({
      goal: "Add validation message to login form",
      changedFiles: ["src/login.ts", "tests/login.test.ts"],
    });

    expect(route.route).toBe("lite-spec");
    expect(route.shouldCreateSpec).toBe(true);
    expect(route.shouldCreateTasks).toBe(true);
    expect(route.shouldUseSubagent).toBe(false);
    expect(route.taskCountLimit).toBe(3);
  });

  it("routes cross-module product behavior to full-spec", () => {
    const route = classifySmartRoute({
      goal: "Add authenticated billing dashboard with API and UI behavior",
      changedFiles: [
        "src/api/billing.ts",
        "src/auth/session.ts",
        "src/ui/billing.tsx",
        "tests/billing.test.ts",
      ],
    });

    expect(route.route).toBe("full-spec");
    expect(route.shouldCreateSpec).toBe(true);
    expect(route.shouldCreateTasks).toBe(true);
    expect(route.shouldUseSubagent).toBe(true);
    expect(route.taskCountLimit).toBe(12);
  });

  it("routes oversized work to epic-split", () => {
    const route = classifySmartRoute({
      goal: "Rewrite the whole app across multiple subsystems",
      estimatedFiles: 20,
      taskCount: 18,
    });

    expect(route.route).toBe("epic-split");
    expect(route.shouldCreateSpec).toBe(false);
    expect(route.shouldCreateTasks).toBe(false);
    expect(route.nextAction).toContain("/curdx-flow:triage");
  });

  it("resumes an active unfinished spec when no new goal is provided", () => {
    const cwd = makeTmpDir("smart-route-resume");
    try {
      mkdirSync(path.join(cwd, "specs", "login-flow"), { recursive: true });
      writeFileSync(path.join(cwd, "specs", ".current-spec"), "login-flow\n");
      writeFileSync(
        path.join(cwd, "specs", "login-flow", ".curdx-state.json"),
        JSON.stringify({ phase: "design", completed: false }),
      );

      const route = classifySmartRoute({ cwd });

      expect(route.route).toBe("resume-current");
      expect(route.activeSpec).toEqual({
        name: "login-flow",
        path: "specs/login-flow",
        phase: "design",
        completed: false,
      });
      expect(route.nextAction).toContain("/curdx-flow:tasks");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("blocks only when there is no goal and no resumable active spec", () => {
    const cwd = makeTmpDir("smart-route-blocked");
    try {
      const route = classifySmartRoute({ cwd });

      expect(route.route).toBe("blocked-ask-user");
      expect(route.blockedReason).toContain("Ask for the goal");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("blocks when an explicit unfinished spec name also has new goal text", () => {
    const cwd = makeTmpDir("smart-route-existing-name");
    try {
      mkdirSync(path.join(cwd, "specs", "login-flow"), { recursive: true });
      writeFileSync(
        path.join(cwd, "specs", "login-flow", ".curdx-state.json"),
        JSON.stringify({ phase: "requirements", completed: false }),
      );

      const route = classifySmartRoute({
        cwd,
        name: "login-flow",
        goal: "Add a different login flow",
      });

      expect(route.route).toBe("blocked-ask-user");
      expect(route.blockedReason).toContain("--fresh");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("CLI output uses behavior names and avoids human size labels", () => {
    const result = runLib("smart-route", [
      "--goal",
      "Fix README typo",
      "--files",
      "README.md",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.json).toMatchObject({ route: "direct-change" });
    expect(result.stdout).not.toMatch(/"size"\s*:/);
    expect(result.stdout).not.toMatch(/\b(XS|XL)\b/);
  });
});
