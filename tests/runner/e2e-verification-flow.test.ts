/**
 * E2E verification flow (VE1) — fixture-based smoke test.
 *
 * Spec: spec-verification-iron-law (Task 3.5).
 *
 * Unlike `tests/hooks/stop-watcher.test.ts` POC (b) — which uses the
 * `createFixtureSpec` helper and the canonical `runHook` runner — this test
 * exercises the bundled `stop-watcher.mjs` end-to-end against a hand-built
 * fixture directory created via `os.tmpdir()` + `mkdtempSync`. The goal is a
 * dependency-free smoke test that proves the iron-law gate fires when
 * `verificationBlocks` is missing, with no shared test infrastructure between
 * the fixture and the hook under test.
 *
 * Note on "exit code" vs "block decision": the task description (3.5) calls
 * for "exit code 2", but `stop-watcher.mjs` is a Stop hook governed by FR-8
 * (`runHook` in `src/hooks/_shared/run-hook.ts` always `process.exit(0)` —
 * even on the block path) and signals "block" to Claude Code via JSON
 * `{decision:"block", reason}` on stdout. We assert that semantics here:
 * exit 0 + JSON `decision:"block"` + `reason` contains "no verification
 * block". This matches the existing POC (b) test in stop-watcher.test.ts
 * (lines 229-259) which is the source-of-truth for the gate's behavior.
 *
 * Tasks 3.6 (VE2) and 3.7 (VE3) extend this file with the
 * write-block-then-pass + stale + performance cases.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const PLUGIN_ROOT = path.join(REPO_ROOT, "plugins/curdx-flow");
const STOP_WATCHER_BUNDLE = path.join(
  PLUGIN_ROOT,
  "hooks/scripts/stop-watcher.mjs",
);

describe("e2e verification flow (VE1) — fixture-based stop-watcher", () => {
  let fixtureDir: string;
  let transcriptPath: string;

  beforeEach(() => {
    // Fresh tmpdir per test — never hardcode `/tmp`, use `os.tmpdir()` for
    // cross-platform CI (Windows GitHub runner uses `C:\Users\...\AppData\
    // Local\Temp\`, see _fixture-setup.ts header for context).
    fixtureDir = mkdtempSync(path.join(tmpdir(), "curdx-e2e-"));
    const specName = "e2e-test";
    const specsDir = path.join(fixtureDir, "specs");
    const specDir = path.join(specsDir, specName);
    mkdirSync(specDir, { recursive: true });

    // .current-spec marker so resolveCurrent() finds the spec.
    writeFileSync(path.join(specsDir, ".current-spec"), specName);

    // Minimal state: phase=execution, taskIndex===totalTasks so the
    // ALL_TASKS_COMPLETE branch in runStopHook reaches the iron-law gate
    // (the gate runs inside handleCompletion; it only fires when the
    // transcript contains ALL_TASKS_COMPLETE — see stop-watcher.ts L633-722).
    // verificationBlocks intentionally absent → "missing" branch fires.
    const state = {
      source: "spec" as const,
      name: specName,
      basePath: `./specs/${specName}`,
      phase: "execution",
      taskIndex: 1,
      totalTasks: 1,
      taskIteration: 1,
      maxTaskIterations: 5,
      globalIteration: 1,
      maxGlobalIterations: 100,
      commitSpec: true,
      quickMode: false,
      awaitingApproval: false,
      recoveryMode: false,
      nativeSyncEnabled: false,
      granularity: "fine" as const,
      completed: false,
    };
    writeFileSync(
      path.join(specDir, ".curdx-state.json"),
      JSON.stringify(state, null, 2),
    );

    // Transcript with ALL_TASKS_COMPLETE marker (lives under fixtureDir so
    // cleanup wipes it alongside the spec).
    transcriptPath = path.join(fixtureDir, "transcript.txt");
    writeFileSync(
      transcriptPath,
      "line one\nline two\nALL_TASKS_COMPLETE\n",
    );
  });

  afterEach(() => {
    try {
      rmSync(fixtureDir, { recursive: true, force: true });
    } catch {
      /* best-effort — Windows occasionally locks files */
    }
  });

  it("(a) claim done without verificationBlocks → block decision with 'no verification block' reason", () => {
    const stdin = JSON.stringify({
      hook_event_name: "Stop",
      hookEvent: "Stop",
      stop_hook_active: false,
      cwd: fixtureDir,
      transcript_path: transcriptPath,
    });

    const result = spawnSync("node", [STOP_WATCHER_BUNDLE], {
      input: stdin,
      cwd: fixtureDir,
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
      },
      encoding: "utf8",
      timeout: 5000,
    });

    // FR-8: stop-watcher.mjs ALWAYS exits 0 (the runHook contract in
    // _shared/run-hook.ts hard-wires process.exit(0) on every code path).
    // The "block" signal travels via JSON on stdout, not via exit code.
    expect(result.status).toBe(0);

    const stdout = (result.stdout ?? "").trim();
    expect(stdout.length).toBeGreaterThan(0);
    const json = JSON.parse(stdout) as {
      decision?: string;
      reason?: string;
      systemMessage?: string;
    };
    expect(json.decision).toBe("block");
    expect(json.reason).toContain("no verification block");
    expect(json.reason).toMatch(/Phase 'execution'/);
    expect(json.systemMessage).toMatch(/missing verification block/);

    // Stderr carries the ALL_TASKS_COMPLETE detection marker (proves the
    // gate's host code path was actually exercised — not short-circuited by
    // an earlier branch).
    expect(result.stderr ?? "").toContain(
      "ALL_TASKS_COMPLETE detected in transcript",
    );
  });
});
