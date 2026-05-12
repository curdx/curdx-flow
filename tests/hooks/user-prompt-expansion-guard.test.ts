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
  "plugins/curdx-flow/hooks/scripts/user-prompt-expansion-guard.mjs",
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

describe("user-prompt-expansion-guard", () => {
  it("accepts prompt-optimize and injects advisory route context", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "cflow-upe-"));
    try {
      writeFileSync(path.join(cwd, "go.mod"), "module example.com/demo\n");
      const result = runHook(
        {
          cwd,
          expansion_type: "slash_command",
          command_name: "curdx-flow:prompt-optimize",
          command_args: "帮我优化一个 Go API 修复提示词",
        },
        cwd,
      );

      expect(result.exitCode).toBe(0);
      expect(result.json?.hookSpecificOutput?.hookEventName).toBe("UserPromptExpansion");
      expect(result.json?.hookSpecificOutput?.additionalContext).toContain("route=");
      expect(result.json?.hookSpecificOutput?.additionalContext).toContain("stack=go");
      expect(result.json?.hookSpecificOutput?.additionalContext).toContain("advisory-only=true");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("blocks unknown curdx-flow skill names", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "cflow-upe-unknown-"));
    try {
      const result = runHook(
        {
          cwd,
          expansion_type: "slash_command",
          command_name: "curdx-flow:does-not-exist",
          command_args: "",
        },
        cwd,
      );

      expect(result.exitCode).toBe(0);
      expect(result.json).toMatchObject({
        decision: "block",
        reason: "Unknown curdx-flow skill: curdx-flow:does-not-exist",
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
