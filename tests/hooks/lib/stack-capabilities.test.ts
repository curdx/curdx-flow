import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverProjectTopology } from "../../../src/hooks/lib/project-topology.js";
import {
  detectStackProfile,
  selectContextBudget,
  selectQualityGates,
  selectSuggestedVerifier,
} from "../../../src/hooks/lib/stack-capabilities.js";
import { makeTmpDir, runLib } from "./_lib-helpers.js";

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, JSON.stringify(value, null, 2));
}

describe("stack-capabilities", () => {
  it("detects Vue/Vite and recommends browser verification for UI work", () => {
    const cwd = makeTmpDir("stack-vue");
    try {
      writeJson(path.join(cwd, "package.json"), {
        dependencies: { vue: "^3.5.0" },
        devDependencies: { vite: "^6.0.0", typescript: "^5.6.0" },
      });
      const topology = discoverProjectTopology({ cwd, goal: "Build a Vue login page" });
      const stackProfile = detectStackProfile({ cwd, topology, goal: "Build a Vue login page" });
      const qualityGates = selectQualityGates({
        cwd,
        topology,
        goal: "Build a Vue login page",
        route: "lite-spec",
        risk: "medium",
        stackProfile,
      });
      const verifier = selectSuggestedVerifier({
        cwd,
        topology,
        goal: "Build a Vue login page",
        route: "lite-spec",
        risk: "medium",
        stackProfile,
        qualityGates,
      });

      expect(stackProfile.primary).toBe("vue");
      expect(qualityGates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "vue-browser", required: true }),
        ]),
      );
      expect(verifier).toMatchObject({
        kind: "browser",
        needsRuntime: true,
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("detects Claude Code plugin projects and recommends plugin smoke verification", () => {
    const cwd = makeTmpDir("stack-plugin");
    try {
      mkdirSync(path.join(cwd, ".claude-plugin"), { recursive: true });
      mkdirSync(path.join(cwd, "hooks"), { recursive: true });
      mkdirSync(path.join(cwd, "skills", "start"), { recursive: true });
      writeJson(path.join(cwd, ".claude-plugin", "plugin.json"), { name: "demo" });
      writeFileSync(path.join(cwd, "hooks", "hooks.json"), "{}\n");
      writeFileSync(path.join(cwd, "skills", "start", "SKILL.md"), "---\nname: start\n---\n");
      writeJson(path.join(cwd, "package.json"), {
        scripts: {
          "check:hooks-fresh": "node scripts/check-hooks-fresh.mjs",
          typecheck: "tsc --noEmit",
          "test:claudecc": "node smoke.mjs",
        },
      });
      const topology = discoverProjectTopology({ cwd, goal: "Update Claude Code plugin hook release behavior" });
      const stackProfile = detectStackProfile({
        cwd,
        topology,
        goal: "Update Claude Code plugin hook release behavior",
      });
      const qualityGates = selectQualityGates({
        cwd,
        topology,
        goal: "Update Claude Code plugin hook release behavior",
        route: "full-spec",
        risk: "critical",
        stackProfile,
      });
      const verifier = selectSuggestedVerifier({
        cwd,
        topology,
        goal: "Update Claude Code plugin hook release behavior",
        route: "full-spec",
        risk: "critical",
        stackProfile,
        qualityGates,
      });

      expect(stackProfile.primary).toBe("claude-code-plugin");
      expect(qualityGates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "claude-code-plugin-docs", required: true }),
          expect.objectContaining({ id: "claude-code-plugin-baseline" }),
        ]),
      );
      expect(verifier).toMatchObject({
        kind: "plugin-smoke",
        command: "CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc",
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("CLI emits stack profile, gates, verifier, and context budget", () => {
    const cwd = makeTmpDir("stack-cli");
    try {
      writeFileSync(path.join(cwd, "go.mod"), "module example.com/demo\n");

      const result = runLib("stack-capabilities", [
        "--cwd",
        cwd,
        "--goal",
        "Add Go API validation",
        "--route",
        "lite-spec",
        "--risk",
        "medium",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.json).toMatchObject({
        stackProfile: { primary: "go" },
        suggestedVerifier: { command: "go test ./..." },
        contextBudget: { level: "focused" },
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
