import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const HOOK = path.join(
  REPO_ROOT,
  "plugins/curdx-flow/hooks/scripts/post-tool-batch-snapshot.mjs",
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

describe("post-tool-batch-snapshot", () => {
  it("injects stack-aware quality gate context after write batches", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "cflow-ptb-"));
    try {
      mkdirSync(path.join(cwd, "specs", "demo"), { recursive: true });
      writeFileSync(path.join(cwd, "go.mod"), "module example.com/demo\n");
      writeFileSync(path.join(cwd, "specs", ".current-spec"), "demo\n");
      writeFileSync(
        path.join(cwd, "specs", "demo", ".curdx-state.json"),
        JSON.stringify({ version: 2, source: "spec", name: "demo", basePath: "./specs/demo", phase: "execution" }),
      );

      const result = runHook(
        {
          cwd,
          tool_calls: [{ tool_name: "Edit" }],
        },
        cwd,
      );

      expect(result.exitCode).toBe(0);
      expect(result.json?.hookSpecificOutput?.hookEventName).toBe("PostToolBatch");
      expect(result.json?.hookSpecificOutput?.additionalContext).toContain("Stack: go");
      expect(result.json?.hookSpecificOutput?.additionalContext).toContain("Suggested verifier");
      expect(result.json?.hookSpecificOutput?.additionalContext).toContain("brief(route=");
      expect(existsSync(path.join(cwd, ".curdx", "brain.jsonl"))).toBe(true);
      expect(readFileSync(path.join(cwd, ".curdx", "brain.jsonl"), "utf8")).toContain("edit-batch");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("stays silent for read-only batches", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "cflow-ptb-read-"));
    try {
      const result = runHook(
        {
          cwd,
          tool_calls: [{ tool_name: "Read" }],
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
