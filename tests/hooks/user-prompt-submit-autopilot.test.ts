import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const HOOK = path.join(
  REPO_ROOT,
  "plugins/curdx-flow/hooks/scripts/user-prompt-submit-autopilot.mjs",
);
const PLUGIN_ROOT = path.join(REPO_ROOT, "plugins/curdx-flow");

function runHook(input: unknown, cwd: string): { exitCode: number; json?: any; stdout: string } {
  const result = spawnSync("node", [HOOK], {
    input: JSON.stringify(input),
    cwd,
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
    encoding: "utf8",
    timeout: 5000,
  });
  const stdout = result.stdout ?? "";
  let json: any;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = undefined;
  }
  return { exitCode: result.status ?? -1, json, stdout };
}

describe("user-prompt-submit-autopilot", () => {
  it("injects last-mile context for normal coding prompts", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "cflow-ups-"));
    try {
      writeFileSync(
        path.join(cwd, "package.json"),
        JSON.stringify({ dependencies: { vue: "^3.5.0" }, scripts: { test: "vitest" } }),
      );

      const result = runHook(
        {
          cwd,
          hook_event_name: "UserPromptSubmit",
          prompt: "修复 Vue 登录页面的浏览器交互问题，并给出验证证据",
        },
        cwd,
      );

      expect(result.exitCode).toBe(0);
      expect(result.json?.hookSpecificOutput?.hookEventName).toBe("UserPromptSubmit");
      expect(result.json?.hookSpecificOutput?.additionalContext).toContain("curdx-flow autopilot");
      expect(result.json?.hookSpecificOutput?.additionalContext).toContain("lastMile(");
      expect(result.json?.hookSpecificOutput?.additionalContext).toContain("browser");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("stays silent for non-development prompts", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "cflow-ups-silent-"));
    try {
      const result = runHook(
        {
          cwd,
          hook_event_name: "UserPromptSubmit",
          prompt: "你好，今天纽约几点？",
        },
        cwd,
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
