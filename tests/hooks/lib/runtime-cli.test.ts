import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeTmpDir, runLib } from "./_lib-helpers.js";

describe("runtime-cli lib", () => {
  it("routes through the shared smart-route helper", () => {
    const result = runLib("runtime-cli", ["route", "--goal", "Fix README typo"]);
    expect(result.exitCode).toBe(0);
    expect(result.json).toMatchObject({
      version: 1,
      route: "direct-change",
      shouldCreateSpec: false,
    });
  });

  it("returns workflow snapshot through the runtime command surface", () => {
    const cwd = makeTmpDir("runtime-snapshot");
    try {
      mkdirSync(path.join(cwd, "specs", "x"), { recursive: true });
      writeFileSync(path.join(cwd, "specs", ".current-spec"), "x\n");
      writeFileSync(
        path.join(cwd, "specs", "x", ".curdx-state.json"),
        JSON.stringify({ version: 2, source: "spec", name: "x", basePath: "./specs/x", phase: "research" }),
      );
      const result = runLib("runtime-cli", ["snapshot", "--cwd", cwd]);
      expect(result.exitCode).toBe(0);
      expect(result.json).toMatchObject({
        version: 2,
        active: true,
        spec: { name: "x" },
        nextAction: "Run /curdx-flow:research.",
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("resolves and lists specs through the runtime command surface", () => {
    const cwd = makeTmpDir("runtime-specs");
    try {
      mkdirSync(path.join(cwd, ".claude"), { recursive: true });
      mkdirSync(path.join(cwd, "specs", "login"), { recursive: true });
      mkdirSync(path.join(cwd, "packages", "api", "specs", "auth"), { recursive: true });
      writeFileSync(
        path.join(cwd, ".claude", "curdx-flow.local.md"),
        ["---", 'specs_dirs: ["./specs", "./packages/api/specs"]', "---", ""].join("\n"),
      );
      writeFileSync(path.join(cwd, "specs", ".current-spec"), "login\n");

      const list = runLib("runtime-cli", ["specs", "list", "--cwd", cwd]);
      expect(list.exitCode).toBe(0);
      expect(list.json).toMatchObject({
        defaultDir: "./specs",
        active: "specs/login",
        specs: expect.arrayContaining([
          { name: "login", path: "specs/login" },
          { name: "auth", path: "packages/api/specs/auth" },
        ]),
      });

      const resolved = runLib("runtime-cli", ["specs", "resolve", "--cwd", cwd]);
      expect(resolved.exitCode).toBe(0);
      expect(resolved.json).toMatchObject({
        ok: true,
        name: "login",
        path: "specs/login",
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("returns a distinct exit code for ambiguous spec names", () => {
    const cwd = makeTmpDir("runtime-specs-ambiguous");
    try {
      mkdirSync(path.join(cwd, ".claude"), { recursive: true });
      mkdirSync(path.join(cwd, "specs", "auth"), { recursive: true });
      mkdirSync(path.join(cwd, "packages", "api", "specs", "auth"), { recursive: true });
      writeFileSync(
        path.join(cwd, ".claude", "curdx-flow.local.md"),
        ["---", 'specs_dirs: ["./specs", "./packages/api/specs"]', "---", ""].join("\n"),
      );

      const found = runLib("runtime-cli", ["specs", "find", "auth", "--cwd", cwd]);
      expect(found.exitCode).toBe(2);
      expect(found.json).toMatchObject({
        ok: false,
        reason: "ambiguous",
        matches: ["specs/auth", "packages/api/specs/auth"],
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("reports browser verification readiness in doctor output", () => {
    const cwd = makeTmpDir("runtime-doctor-browser");
    try {
      const fakeChrome = path.join(cwd, "fake-chrome");
      writeFileSync(
        path.join(cwd, "package.json"),
        JSON.stringify(
          {
            scripts: {
              dev: "vite --host 0.0.0.0 --port 5173",
              "test:e2e": "playwright test",
              test: "vitest",
            },
            devDependencies: {
              "@playwright/test": "^1.0.0",
            },
          },
          null,
          2,
        ),
      );
      writeFileSync(path.join(cwd, "playwright.config.ts"), "export default {};\n");
      writeFileSync(fakeChrome, "");

      const result = runLib("runtime-cli", ["doctor", "--cwd", cwd], {
        env: { CHROME_PATH: fakeChrome },
      });
      expect(result.exitCode).toBe(0);
      const json = result.json as {
        ok?: boolean;
        runtime?: {
          ready?: boolean;
        };
        plugin?: {
          ready?: boolean;
          manifest?: {
            name?: string | null;
            version?: string | null;
          };
          hooks?: {
            commandHookCount?: number;
            execForm?: boolean;
            shellFormHooks?: unknown[];
            missingScripts?: unknown[];
          };
          bin?: {
            curdxFlow?: boolean;
          };
        };
        browserVerification?: {
          project?: {
            devServerScripts?: string[];
            e2eScripts?: string[];
            e2eConfigFiles?: string[];
          };
          playwright?: {
            ready?: boolean;
            dependency?: boolean;
            recommendedCommand?: string | null;
          };
          chromeDevtoolsMcp?: {
            ready?: boolean;
            dependencyDeclared?: boolean;
            chromeInstalled?: boolean;
          };
        };
        stackProfile?: {
          primary?: string;
        };
        qualityGates?: Array<{ id?: string; command?: string | null }>;
        suggestedVerifier?: { command?: string | null; fallback?: string | null };
        hookFreshness?: { fresh?: boolean };
        recommendations?: Array<{ id?: string; command?: string; action?: string }>;
      };
      expect(json.ok).toBe(true);
      expect(json.runtime?.ready).toBe(true);
      expect(json.plugin).toMatchObject({
        ready: true,
        manifest: {
          name: "curdx-flow",
        },
        hooks: {
          execForm: true,
          shellFormHooks: [],
          missingScripts: [],
        },
        bin: {
          curdxFlow: true,
        },
      });
      expect(json.plugin?.hooks?.commandHookCount).toBeGreaterThan(0);
      expect(json.recommendations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "workflow" }),
          expect.objectContaining({ id: "plugin-validate" }),
        ]),
      );
      expect(json.hookFreshness?.fresh).toBe(true);
      expect(json.stackProfile?.primary).toEqual(expect.any(String));
      expect(json.qualityGates).toEqual(expect.any(Array));
      expect(json.suggestedVerifier).toBeDefined();
      expect(json.browserVerification?.project?.devServerScripts).toContain("dev");
      expect(json.browserVerification?.project?.e2eScripts).toContain("test:e2e");
      expect(json.browserVerification?.project?.e2eConfigFiles).toContain("playwright.config.ts");
      expect(json.browserVerification?.playwright).toMatchObject({
        ready: true,
        dependency: true,
        recommendedCommand: "npm run test:e2e",
      });
      expect(json.browserVerification?.chromeDevtoolsMcp).toMatchObject({
        ready: true,
        dependencyDeclared: true,
        chromeInstalled: true,
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("detects local dev runtime commands for split frontend and backend roots", () => {
    const parent = makeTmpDir("runtime-dev-detect");
    const backend = path.join(parent, "backend");
    const frontend = path.join(parent, "frontend");
    try {
      mkdirSync(path.join(backend, ".git"), { recursive: true });
      mkdirSync(frontend, { recursive: true });
      writeFileSync(path.join(backend, "CLAUDE.md"), "## Dev\n- frontend: ../frontend\n- backend: .\n");
      writeFileSync(
        path.join(frontend, "package.json"),
        JSON.stringify({
          scripts: {
            dev: "vite --host 0.0.0.0 --port 5173",
            typecheck: "vue-tsc --noEmit",
            test: "vitest",
            build: "vite build",
            "test:e2e": "playwright test",
          },
          dependencies: { vue: "^3.5.0" },
          devDependencies: { vite: "^6.0.0", "@playwright/test": "^1.0.0" },
        }),
      );
      writeFileSync(
        path.join(backend, "pom.xml"),
        [
          "<project>",
          "<dependency><artifactId>spring-boot-starter-web</artifactId></dependency>",
          "</project>",
        ].join("\n"),
      );

      const result = runLib("runtime-cli", ["dev", "detect", "--cwd", backend]);

      expect(result.exitCode).toBe(0);
      expect(result.json).toMatchObject({
        version: 1,
        workspaceState: "split-repo",
        services: expect.arrayContaining([
          expect.objectContaining({ root: "../frontend", command: "npm run dev" }),
          expect.objectContaining({ root: ".", command: "mvn spring-boot:run" }),
        ]),
        verification: {
          baselineCommands: expect.arrayContaining([
            { root: "../frontend", command: "npm run typecheck" },
            { root: "../frontend", command: "npm run test" },
            { root: "../frontend", command: "npm run build" },
            { root: ".", command: "mvn test" },
          ]),
          e2eCommands: [{ root: "../frontend", command: "npm run test:e2e" }],
        },
      });
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("prints dev health and verify plans without starting services in dry-run mode", () => {
    const cwd = makeTmpDir("runtime-dev-dry-run");
    try {
      writeFileSync(
        path.join(cwd, "package.json"),
        JSON.stringify({
          scripts: {
            dev: "vite",
            test: "vitest",
          },
          dependencies: { vue: "^3.5.0" },
          devDependencies: { vite: "^6.0.0" },
        }),
      );

      const health = runLib("runtime-cli", ["dev", "health", "--cwd", cwd, "--dry-run"]);
      const verify = runLib("runtime-cli", ["dev", "verify", "--cwd", cwd, "--dry-run"]);
      const down = runLib("runtime-cli", ["dev", "down", "--cwd", cwd]);

      expect(health.exitCode).toBe(0);
      expect(health.json).toMatchObject({
        services: [],
        health: [expect.objectContaining({ skipped: true })],
      });
      expect(verify.exitCode).toBe(0);
      expect(verify.json).toMatchObject({
        dryRun: true,
        commands: [{ root: ".", command: "npm run test" }],
      });
      expect(down.exitCode).toBe(0);
      expect(down.json).toMatchObject({ ok: true, stopped: [] });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("runs verification commands and records execution evidence", () => {
    const cwd = makeTmpDir("runtime-verify-run");
    try {
      mkdirSync(path.join(cwd, "specs", "x"), { recursive: true });
      writeFileSync(path.join(cwd, "specs", ".current-spec"), "x\n");
      writeFileSync(
        path.join(cwd, "specs", "x", ".curdx-state.json"),
        JSON.stringify({
          version: 2,
          source: "spec",
          name: "x",
          basePath: "./specs/x",
          phase: "execution",
          verificationBlocks: {},
        }),
      );
      writeFileSync(path.join(cwd, "specs", "x", "tasks.md"), "- [x] 1.1 Done\n");

      const command = `${JSON.stringify(process.execPath)} -e "process.exit(0)"`;
      const result = runLib("runtime-cli", [
        "verify",
        "run",
        "--cwd",
        cwd,
        "--phase",
        "execution",
        "--command",
        command,
      ]);
      expect(result.exitCode).toBe(0);

      const state = JSON.parse(
        readFileSync(path.join(cwd, "specs", "x", ".curdx-state.json"), "utf8"),
      ) as {
        verificationBlocks?: {
          execution?: {
            command?: string;
            exitCode?: number;
            timestamp?: string;
            srcMtime?: number;
          };
        };
      };
      expect(state.verificationBlocks?.execution).toMatchObject({
        command,
        exitCode: 0,
      });
      expect(Date.parse(state.verificationBlocks?.execution?.timestamp ?? "")).not.toBeNaN();
      expect(state.verificationBlocks?.execution?.srcMtime).toEqual(expect.any(Number));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
