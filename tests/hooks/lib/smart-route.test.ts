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
    expect(route.recommendedCapabilities).toEqual([]);
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

  it("keeps a tiny npm-test implementation on the lite-spec path", () => {
    const route = classifySmartRoute({
      goal: "Implement src/greet.js so npm test passes",
      flags: "--mode fast --review minimal --tasks-size coarse",
      changedFiles: ["src/greet.js", "test/greet.test.js"],
    });

    expect(route.route).toBe("lite-spec");
    expect(route.policy.risk).toBe("medium");
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
    expect(route.recommendedCapabilities.map((rec) => rec.id)).toEqual(
      expect.arrayContaining(["claude-mem", "ui-ux-pro-max", "chrome-devtools-mcp", "sequential-thinking"]),
    );
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

  it("routes explicit empty-workspace scaffolding to scaffold instead of lite-spec", () => {
    const cwd = makeTmpDir("smart-route-empty-scaffold");
    try {
      const route = classifySmartRoute({
        cwd,
        goal: "创建一个 Vue3 Vite TypeScript 项目脚手架",
      });

      expect(route.route).toBe("scaffold");
      expect(route.shouldCreateSpec).toBe(false);
      expect(route.intent).toMatchObject({
        workspaceState: "empty",
        intentKind: "scaffold",
        clarity: "high",
        stackSpecified: true,
      });
      expect(route.topology?.workspaceState).toBe("empty");
      expect(route.stackProfile.primary).toBe("vue");
      expect(route.qualityGates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "vue-docs" }),
          expect.objectContaining({ id: "vue-baseline" }),
        ]),
      );
      expect(route.contextBudget.level).toBe("focused");
      expect(route.nextAction).toContain("official/ecosystem scaffold source");
      expect(route.recommendedCapabilities).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "context7",
          phase: "before-coding",
        }),
      ]));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("routes vague empty-workspace product requests to product-inception", () => {
    const cwd = makeTmpDir("smart-route-empty-product");
    try {
      const route = classifySmartRoute({
        cwd,
        goal: "开发一套前后端，前端 Vue 全家桶，后端 Spring 全家桶",
      });

      expect(route.route).toBe("product-inception");
      expect(route.shouldCreateSpec).toBe(false);
      expect(route.intent.intentKind).toBe("product");
      expect(route.intent.missingFacts).toContain(
        "product domain, target user, MVP acceptance criteria",
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("routes clear empty-workspace product requests to greenfield-spec", () => {
    const cwd = makeTmpDir("smart-route-empty-greenfield");
    try {
      const route = classifySmartRoute({
        cwd,
        goal: "开发一个 CRM 客户管理系统，前端 Vue，后端 Spring Boot，MVP 支持客户列表和合同记录",
      });

      expect(route.route).toBe("greenfield-spec");
      expect(route.shouldCreateSpec).toBe(true);
      expect(route.shouldUseSubagent).toBe(true);
      expect(route.intent).toMatchObject({
        workspaceState: "empty",
        intentKind: "product",
        clarity: "high",
        stackSpecified: true,
      });
      expect(route.intent.missingFacts).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });


  it("routes empty-workspace PRD/spec imports to import-spec", () => {
    const cwd = makeTmpDir("smart-route-empty-import");
    try {
      const route = classifySmartRoute({
        cwd,
        goal: "这里有 PRD.md，按这个需求文档实现管理后台",
      });

      expect(route.route).toBe("import-spec");
      expect(route.shouldCreateSpec).toBe(true);
      expect(route.intent).toMatchObject({
        workspaceState: "empty",
        intentKind: "import-spec",
        artifactProvided: true,
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("routes empty-workspace technical POCs to prototype", () => {
    const cwd = makeTmpDir("smart-route-empty-prototype");
    try {
      const route = classifySmartRoute({
        cwd,
        goal: "验证 Spring Cloud Gateway OAuth POC 是否能跑通",
      });

      expect(route.route).toBe("prototype");
      expect(route.taskCountLimit).toBe(5);
      expect(route.intent.intentKind).toBe("prototype");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("detects Claude Code plugin stack and recommends plugin smoke for release-sensitive work", () => {
    const route = classifySmartRoute({
      goal: "Update Claude Code plugin hooks and publish a new npm tag",
      changedFiles: [
        "plugins/curdx-flow/hooks/hooks.json",
        "src/hooks/user-prompt-expansion-guard.ts",
        "package.json",
      ],
      cwd: process.cwd(),
    });

    expect(route.stackProfile.primary).toBe("claude-code-plugin");
    expect(route.suggestedVerifier).toMatchObject({
      kind: "plugin-smoke",
    });
    expect(route.recommendedCapabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "docs-query", category: "docs" }),
        expect.objectContaining({ id: "stack-specific-verification" }),
        expect.objectContaining({ id: "context-budget" }),
      ]),
    );
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

  it("keeps direct docs work direct while still recommending current docs lookup", () => {
    const route = classifySmartRoute({
      goal: "Update README with latest Claude Code plugin docs",
      changedFiles: ["README.md"],
    });

    expect(route.route).toBe("direct-change");
    expect(route.shouldCreateSpec).toBe(false);
    expect(route.recommendedCapabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "context7",
          availability: "external-expected",
          provisioning: "external-mcp",
        }),
        expect.objectContaining({
          id: "docs-query",
          category: "docs",
        }),
      ]),
    );
    expect(route.recommendedCapabilities.map((rec) => rec.id)).not.toContain("tdd-cycle");
  });

  it("accepts available capability filters for tool recommendations", () => {
    const route = classifySmartRoute({
      goal: "Debug React network error in Chrome using latest docs",
      changedFiles: ["src/Login.tsx", "tests/login.test.ts"],
      availableCapabilities: ["context7", "chrome-devtools-mcp"],
    });

    expect(route.recommendedCapabilities.map((rec) => rec.id)).toEqual(
      expect.arrayContaining([
        "context7",
        "docs-query",
        "claude-mem",
        "ui-ux-pro-max",
        "chrome-devtools-mcp",
        "browser-verification",
        "stack-specific-verification",
        "context-budget",
        "sequential-thinking",
      ]),
    );
    expect(route.recommendedCapabilities.map((rec) => rec.id)).not.toContain("pua");
    expect(route.recommendedCapabilities.find((rec) => rec.id === "context7")?.availabilityState).toBe("available");
    expect(route.recommendedCapabilities.find((rec) => rec.id === "claude-mem")?.availabilityState).toBe("missing");
    expect(route.recommendedCapabilities.find((rec) => rec.id === "ui-ux-pro-max")?.availabilityState).toBe("missing");
    expect(route.recommendedCapabilities.find((rec) => rec.id === "chrome-devtools-mcp")?.availabilityState).toBe("available");
    expect(route.recommendedCapabilities.find((rec) => rec.id === "sequential-thinking")?.availabilityState).toBe("missing");
  });

  it("recommends PUA only for repeated failure recovery or parallel slices", () => {
    const route = classifySmartRoute({
      goal: "Again debug React network error after failed twice using latest docs",
      changedFiles: ["src/Login.tsx", "tests/login.test.ts"],
      availableCapabilities: ["pua"],
    });

    expect(route.recommendedCapabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "pua",
          phase: "recovery",
          availabilityState: "available",
        }),
      ]),
    );
  });

  it("does not infer UI stacks from companion capability names alone", () => {
    const route = classifySmartRoute({
      goal: "Use claude-mem pua context7 sequential-thinking chrome-devtools-mcp ui-ux-pro-max to improve routing",
      cwd: process.cwd(),
    });

    expect(route.stackProfile.detected.map((stack) => stack.id)).not.toEqual(
      expect.arrayContaining(["react", "vue"]),
    );
    expect(route.recommendedCapabilities.map((rec) => rec.id)).not.toContain("browser-verification");
  });

  it("blocks UI work when CLAUDE.md declares a frontend root outside current access", () => {
    const parent = makeTmpDir("smart-route-topology");
    const backend = path.join(parent, "backend");
    const frontend = path.join(parent, "frontend");
    try {
      mkdirSync(path.join(backend, ".git"), { recursive: true });
      mkdirSync(frontend, { recursive: true });
      writeFileSync(path.join(backend, "CLAUDE.md"), "## Dev\n- frontend: ../frontend\n- backend: .\n");
      writeFileSync(
        path.join(frontend, "package.json"),
        JSON.stringify({ dependencies: { react: "^19.0.0" } }),
      );

      const route = classifySmartRoute({
        cwd: backend,
        goal: "Update the React login page",
      });

      expect(route.route).toBe("blocked-ask-user");
      expect(route.blockedReason).toContain("frontend");
      expect(route.nextAction).toContain("/add-dir ../frontend");
      expect(route.recommendedCapabilities).toEqual([]);
      expect(route.topology?.missingRoots).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "frontend", access: "outside-working-directory" }),
        ]),
      );
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("does not block split frontend work when additionalDirectories covers the root", () => {
    const parent = makeTmpDir("smart-route-topology-access");
    const backend = path.join(parent, "backend");
    const frontend = path.join(parent, "frontend");
    try {
      mkdirSync(path.join(backend, ".git"), { recursive: true });
      mkdirSync(path.join(backend, ".claude"), { recursive: true });
      mkdirSync(frontend, { recursive: true });
      writeFileSync(path.join(backend, "CLAUDE.md"), "## Dev\n- frontend: ../frontend\n- backend: .\n");
      writeFileSync(
        path.join(backend, ".claude", "settings.json"),
        JSON.stringify({ additionalDirectories: ["../frontend"] }),
      );
      writeFileSync(
        path.join(frontend, "package.json"),
        JSON.stringify({ dependencies: { vue: "^3.5.0" } }),
      );

      const route = classifySmartRoute({
        cwd: backend,
        goal: "Update the Vue login page",
        changedFiles: ["src/Login.vue"],
      });

      expect(route.route).not.toBe("blocked-ask-user");
      expect(route.topology?.requiredRoots).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "frontend",
            access: "configured-additional-directory",
          }),
        ]),
      );
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
