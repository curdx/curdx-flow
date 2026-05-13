import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeTmpDir, runLib } from "./_lib-helpers.js";

describe("workflow-snapshot lib", () => {
  it("reports no active spec with a clear next action", () => {
    const cwd = makeTmpDir("snapshot-empty");
    try {
      const result = runLib("workflow-snapshot", ["--cwd", cwd]);
      expect(result.exitCode).toBe(0);
      expect(result.json).toMatchObject({
        version: 2,
        active: false,
        topology: {
          workspaceState: "empty",
        },
        nextAction: "No active spec. Run /curdx-flow:start <name> <goal>.",
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("summarizes active spec artifacts, tasks, state, and gates", () => {
    const cwd = makeTmpDir("snapshot-active");
    try {
      const specDir = path.join(cwd, "specs", "login-flow");
      mkdirSync(specDir, { recursive: true });
      writeFileSync(path.join(cwd, "specs", ".current-spec"), "login-flow\n");
      writeFileSync(
        path.join(specDir, ".curdx-state.json"),
        JSON.stringify({
          version: 2,
          source: "spec",
          name: "login-flow",
          basePath: "./specs/login-flow",
          phase: "execution",
          taskIndex: 1,
          totalTasks: 2,
          awaitingApproval: false,
        }),
      );
      writeFileSync(path.join(specDir, "research.md"), "# Research\n");
      writeFileSync(path.join(specDir, "requirements.md"), "# Requirements\n");
      writeFileSync(path.join(specDir, "design.md"), "# Design\n");
      writeFileSync(
        path.join(specDir, "tasks.md"),
        [
          "- [x] 1.1 First",
          "  - **Files**: src/a.ts",
          "  - **Verify**: npm test",
          "",
          "- [ ] 1.2 Second",
          "  - **Files**: src/b.ts, tests/b.test.ts",
          "  - **Verify**: npm run test -- b",
          "",
        ].join("\n"),
      );

      const result = runLib("workflow-snapshot", ["--cwd", cwd]);
      expect(result.exitCode).toBe(0);
      expect(result.json).toMatchObject({
        version: 2,
        active: true,
        spec: { name: "login-flow", path: "specs/login-flow" },
        state: { exists: true, valid: true, version: 2, phase: "execution" },
        tasks: {
          total: 2,
          completed: 1,
          pending: 1,
          currentIndex: 1,
          current: {
            id: "1.2",
            title: "Second",
            verify: "npm run test -- b",
            files: ["src/b.ts", "tests/b.test.ts"],
          },
        },
        nextAction: "Run /curdx-flow:implement.",
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("treats relative current-spec paths as paths instead of bare spec names", () => {
    const cwd = makeTmpDir("snapshot-relative-current");
    try {
      const specDir = path.join(cwd, "specs", "login-flow");
      mkdirSync(specDir, { recursive: true });
      writeFileSync(path.join(cwd, "specs", ".current-spec"), "specs/login-flow\n");
      writeFileSync(
        path.join(specDir, ".curdx-state.json"),
        JSON.stringify({
          version: 2,
          source: "spec",
          name: "login-flow",
          basePath: "specs/login-flow",
          phase: "implement",
          completed: true,
        }),
      );
      writeFileSync(path.join(specDir, "research.md"), "# Research\n");
      writeFileSync(path.join(specDir, "requirements.md"), "# Requirements\n");
      writeFileSync(path.join(specDir, "design.md"), "# Design\n");
      writeFileSync(path.join(specDir, "tasks.md"), "- [x] 1.1 Done\n");

      const result = runLib("workflow-snapshot", ["--cwd", cwd]);
      expect(result.exitCode).toBe(0);
      expect(result.json).toMatchObject({
        active: true,
        spec: {
          name: "login-flow",
          path: "specs/login-flow",
          fsPath: path.join(cwd, "specs", "login-flow"),
        },
        state: {
          exists: true,
          valid: true,
          completed: true,
        },
        gates: [],
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("supports completed quick lite-spec snapshots without full-spec phase artifacts", () => {
    const cwd = makeTmpDir("snapshot-lite-complete");
    try {
      const specDir = path.join(cwd, "specs", "greet-helper");
      mkdirSync(specDir, { recursive: true });
      writeFileSync(path.join(cwd, ".current-spec"), "greet-helper\n");
      writeFileSync(
        path.join(specDir, ".curdx-state.json"),
        JSON.stringify({
          version: 2,
          source: "spec",
          name: "greet-helper",
          basePath: "specs/greet-helper",
          phase: "implement",
          quickMode: true,
          autoPolicy: {
            executionMode: "spec-lite",
          },
          completed: true,
          taskIndex: 1,
          totalTasks: 1,
        }),
      );
      writeFileSync(
        path.join(specDir, "tasks.md"),
        [
          "## Source Coverage Audit",
          "",
          "- [x] 1.1 Implement greet helper",
          "  - **Verify**: npm test",
          "",
        ].join("\n"),
      );

      const result = runLib("workflow-snapshot", ["--cwd", cwd]);
      expect(result.exitCode).toBe(0);
      expect(result.json).toMatchObject({
        active: true,
        spec: { name: "greet-helper", path: "specs/greet-helper" },
        state: { exists: true, valid: true, completed: true, quickMode: true },
        tasks: { total: 1, completed: 1, pending: 0 },
        gates: [],
        nextAction: "Spec is completed. Use /curdx-flow:refactor for follow-up changes.",
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("prefers a session-scoped active spec over the global current-spec marker", () => {
    const cwd = makeTmpDir("snapshot-session");
    try {
      const alpha = path.join(cwd, "specs", "alpha");
      const beta = path.join(cwd, "specs", "beta");
      mkdirSync(alpha, { recursive: true });
      mkdirSync(beta, { recursive: true });
      writeFileSync(path.join(cwd, "specs", ".current-spec"), "alpha\n");
      writeFileSync(
        path.join(alpha, ".curdx-state.json"),
        JSON.stringify({ version: 2, source: "spec", name: "alpha", phase: "research" }),
      );
      writeFileSync(
        path.join(beta, ".curdx-state.json"),
        JSON.stringify({ version: 2, source: "spec", name: "beta", phase: "design" }),
      );
      mkdirSync(path.join(cwd, ".curdx", "sessions"), { recursive: true });
      writeFileSync(
        path.join(cwd, ".curdx", "sessions", "sess-1.json"),
        JSON.stringify({
          version: 1,
          sessionId: "sess-1",
          specPath: "specs/beta",
          specName: "beta",
          lastSeenAt: "2026-05-13T00:00:00.000Z",
          source: "test",
        }),
      );

      const result = runLib("workflow-snapshot", ["--cwd", cwd, "--session-id", "sess-1"]);
      expect(result.exitCode).toBe(0);
      expect(result.json).toMatchObject({
        active: true,
        spec: { name: "beta", path: "specs/beta" },
        state: { phase: "design" },
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
