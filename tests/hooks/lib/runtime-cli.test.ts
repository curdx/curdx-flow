import { mkdirSync, rmSync, writeFileSync } from "node:fs";
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
      };
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
});
