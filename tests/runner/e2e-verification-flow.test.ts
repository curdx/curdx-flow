/**
 * E2E verification flow (VE1 + VE2) — fixture-based smoke test.
 *
 * Spec: spec-verification-iron-law (Tasks 3.5, 3.6).
 *
 * Unlike `tests/hooks/stop-watcher.test.ts` POC (b) — which uses the
 * `createFixtureSpec` helper and the canonical `runHook` runner — this test
 * exercises the bundled `stop-watcher.mjs` end-to-end against a hand-built
 * fixture directory created via `os.tmpdir()` + `mkdtempSync`. The goal is a
 * dependency-free smoke test that proves the iron-law gate fires when
 * `verificationBlocks` is missing (VE1), passes when a valid block is
 * written (VE2.b), and re-fires when the recorded block is stale (VE2.c).
 *
 * Note on "exit code" vs "block decision": the task description (3.5/3.6)
 * calls for "exit code 2", but `stop-watcher.mjs` is a Stop hook governed by
 * FR-8 (`runHook` in `src/hooks/_shared/run-hook.ts` always
 * `process.exit(0)` — even on the block path) and signals "block" to Claude
 * Code via JSON `{decision:"block", reason}` on stdout. We assert that
 * semantics here: exit 0 + JSON `decision:"block"` + `reason` contains the
 * canonical phrase. This matches the existing POC tests in
 * `tests/hooks/stop-watcher.test.ts` (lines 199-258, 317-350) which are the
 * source-of-truth for the gate's behavior.
 *
 * Task 3.7 (VE3) extends this file further with the performance case.
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

describe("e2e verification flow (VE1 + VE2) — fixture-based stop-watcher", () => {
  let fixtureDir: string;
  let transcriptPath: string;
  let stateFile: string;

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
    stateFile = path.join(specDir, ".curdx-state.json");
    writeFileSync(stateFile, JSON.stringify(state, null, 2));

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

  /**
   * Spawn the bundled stop-watcher.mjs against the per-test fixtureDir +
   * transcriptPath. Inlined in test (a) for VE1; tests (b) and (c) reuse it
   * via this helper to keep the write-block-then-spawn flow readable.
   */
  function spawnStopWatcher() {
    const stdin = JSON.stringify({
      hook_event_name: "Stop",
      hookEvent: "Stop",
      stop_hook_active: false,
      cwd: fixtureDir,
      transcript_path: transcriptPath,
    });
    return spawnSync("node", [STOP_WATCHER_BUNDLE], {
      input: stdin,
      cwd: fixtureDir,
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
      },
      encoding: "utf8",
      timeout: 5000,
    });
  }

  /**
   * Splice a `verificationBlocks.execution` block into the per-test state
   * file. Used by (b) — valid block path — and (c) — stale block path. Done
   * at the raw JSON level (no merge-state CLI) per Task 3.6 guidance: the
   * fixture setup is intentionally dependency-free so the assertion couples
   * only to stop-watcher.mjs's runtime behavior, not to the merge-state
   * writer. Re-renders the full state object (not a shallow merge) so the
   * fixture stays in lock-step with beforeEach.
   */
  function writeExecutionBlock(block: {
    command: string;
    exitCode: number;
    timestamp: string;
    srcMtime: number;
    description?: string;
  }) {
    const state = {
      source: "spec",
      name: "e2e-test",
      basePath: "./specs/e2e-test",
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
      granularity: "fine",
      completed: false,
      verificationBlocks: { execution: block },
    };
    writeFileSync(stateFile, JSON.stringify(state, null, 2));
  }

  it("(a) claim done without verificationBlocks → block decision with 'no verification block' reason", () => {
    const result = spawnStopWatcher();

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

  it("(b) write valid verificationBlocks.execution → hook passes (silent return, no block decision)", () => {
    // Valid block: srcMtime predates timestamp → not stale; exitCode 0 → not
    // failed. verifyPhaseBlock returns ok=true; handleCompletion exits silently.
    const now = Date.now();
    writeExecutionBlock({
      command: "npm run verify",
      exitCode: 0,
      timestamp: new Date(now).toISOString(),
      srcMtime: now - 5000,
      description: "VE2 happy-path fixture",
    });

    const result = spawnStopWatcher();

    // Iron-law gate passed → handleCompletion returned undefined → outer
    // return is silent (no JSON decision block on stdout). FR-8 still holds:
    // exit code is 0. This mirrors stop-watcher.test.ts POC (a) (line 199).
    expect(result.status).toBe(0);
    expect((result.stdout ?? "").trim()).toBe("");

    // Stderr still carries the ALL_TASKS_COMPLETE marker (preserved from
    // pre-gate behavior — proves the host code path was exercised).
    expect(result.stderr ?? "").toContain(
      "ALL_TASKS_COMPLETE detected in transcript",
    );
  });

  it("(c) write stale verificationBlocks.execution (srcMtime > timestamp) → block decision with 'Stale evidence' reason", () => {
    // Stale block: srcMtime is 10s in the FUTURE relative to timestamp,
    // simulating a src file that changed AFTER verification was recorded.
    // verifyPhaseBlock's canonical check `block.srcMtime > Date.parse(
    // block.timestamp)` fires the stale branch (verify-blocks.ts L116-122).
    const now = Date.now();
    writeExecutionBlock({
      command: "npm run verify",
      exitCode: 0,
      timestamp: new Date(now).toISOString(),
      srcMtime: now + 10000,
      description: "VE2 stale-evidence fixture",
    });

    const result = spawnStopWatcher();

    // FR-8: exit code 0 even on the block path; signal is on stdout JSON.
    expect(result.status).toBe(0);

    const stdout = (result.stdout ?? "").trim();
    expect(stdout.length).toBeGreaterThan(0);
    const json = JSON.parse(stdout) as {
      decision?: string;
      reason?: string;
      systemMessage?: string;
    };
    expect(json.decision).toBe("block");
    // Canonical stale message passed through verbatim from verify-blocks.ts
    // (stop-watcher.ts L449-457): "Stale evidence: src changed at <iso>,
    // last verified at <iso>. Re-run: <cmd>."
    expect(json.reason).toContain("Stale evidence");
    expect(json.reason).toContain("Re-run: npm run verify");
    expect(json.systemMessage).toMatch(/verification stale/);

    expect(result.stderr ?? "").toContain(
      "ALL_TASKS_COMPLETE detected in transcript",
    );
  });
});
