import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const HOOK = path.join(
  REPO_ROOT,
  "plugins/curdx-flow/hooks/scripts/post-compact-recorder.mjs",
);
const PLUGIN_ROOT = path.join(REPO_ROOT, "plugins/curdx-flow");

function runHook(input: unknown, cwd: string): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync("node", [HOOK], {
    input: JSON.stringify(input),
    cwd,
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
    encoding: "utf8",
    timeout: 5000,
  });
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("post-compact-recorder", () => {
  it("records official compact summaries into project brain", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "cflow-postcompact-"));
    try {
      const result = runHook(
        {
          cwd,
          hook_event_name: "PostCompact",
          compact_summary: "Research complete; next step is design.",
          trigger: "manual",
        },
        cwd,
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
      const brain = readFileSync(path.join(cwd, ".curdx", "brain.jsonl"), "utf8");
      expect(brain).toContain("compact-summary");
      expect(brain).toContain("Research complete");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
