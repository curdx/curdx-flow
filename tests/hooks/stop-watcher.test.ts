import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runHook } from "./_helpers.js";
import {
  createFixtureSpec,
  createLegacyState,
  type FixtureSpec,
} from "./_fixture-setup.js";

// Cross-platform fixture transcript path. Hardcoded `/tmp/` fails on Windows
// (CI Node22 leg) — see commit history for the original POC-gate test failure.
const FIXTURE_TRANSCRIPT_DIR = path.join(os.tmpdir(), "curdx-fixture-transcripts");
const FIXTURE_TRANSCRIPT_FILE = path.join(FIXTURE_TRANSCRIPT_DIR, "complete.txt");

// ---------------------------------------------------------------------------
// POC-gate (Task 1.8) helpers — local to this test file.
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid `verificationBlocks.execution` block: exitCode 0,
 * timestamp = now (ISO-8601), srcMtime = now-1000 ms (so srcMtime ≤ timestamp,
 * which the Phase-2 stale-detection branch will need; for Phase-1 only the
 * exitCode/missing branches are load-bearing). Kept inline rather than added
 * to `_fixture-setup.ts` because the helper is single-use within this file.
 */
function buildValidExecutionBlock() {
  const now = Date.now();
  return {
    command: "npm run typecheck",
    exitCode: 0,
    timestamp: new Date(now).toISOString(),
    srcMtime: now - 1000,
    description: "POC-gate fixture verification",
  };
}

/**
 * Resolve the bundled stop-watcher.mjs path so we can spawn it directly with
 * custom stdin (used by test case (c) to inject `stop_hook_active: true` —
 * a field the runHook helper does not expose as an override).
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT_FOR_BUNDLE = path.resolve(__dirname, "../..");
const STOP_WATCHER_BUNDLE = path.join(
  REPO_ROOT_FOR_BUNDLE,
  "plugins/curdx-flow/hooks/scripts/stop-watcher.mjs",
);

/**
 * Normalize CRLF -> LF for cross-platform stderr/stdout assertions (AC-7.5).
 * Windows GH Actions runners surface CRLF newlines in spawnSync output, which
 * would break naive `.toContain("...")` style matching across line boundaries.
 * Wrapping with `norm()` keeps assertions stable across macOS / Linux / Windows.
 */
function norm(s: string | null | undefined): string {
  return (s ?? "").replace(/\r\n/g, "\n");
}

describe("stop-watcher (Stop hook)", () => {
  let demoSpec: FixtureSpec;
  let corruptSpec: FixtureSpec;

  beforeEach(() => {
    // Default fixture: phase=execution, taskIndex=1, totalTasks=3 → triggers
    // continuation block decision (current task < total).
    demoSpec = createFixtureSpec();
    // Corrupt-state fixture: same layout but the .curdx-state.json is invalid
    // JSON, exercising buildCorruptStateBlock().
    corruptSpec = createFixtureSpec({ noStateFile: true });
    writeFileSync(
      path.join(corruptSpec.cwd, "specs", corruptSpec.specName, ".curdx-state.json"),
      "{ this is not json",
    );
    // POC-gate fixtures (a)+(b) reference all-complete.json, whose
    // transcript_path points at FIXTURE_TRANSCRIPT_FILE (platform tmpdir).
    // byte-equal.test.ts beforeAll provisions this file, but if that suite
    // hasn't run yet (test isolation / fork ordering) we provision it here
    // defensively so these cases stay self-contained.
    mkdirSync(FIXTURE_TRANSCRIPT_DIR, { recursive: true });
    writeFileSync(
      FIXTURE_TRANSCRIPT_FILE,
      "line one\nline two\nline three\nALL_TASKS_COMPLETE\n",
    );
  });

  afterEach(() => {
    demoSpec.cleanup();
    corruptSpec.cleanup();
  });

  it("happy: spec mid-execution → exit 0, JSON decision=block with resume prompt", () => {
    const r = runHook(
      "stop-watcher",
      "tests/hooks/fixtures/stop-watcher/execution-block.json",
      { cwd: demoSpec.cwd },
    );
    expect(r.exitCode).toBe(0);
    expect(r.json).toBeDefined();
    expect((r.json as any).decision).toBe("block");
    expect((r.json as any).reason).toMatch(/Continue spec.*demo-spec/);
    expect((r.json as any).systemMessage).toMatch(/curdx-flow/);
    // Stderr banner echoes spec status for human visibility
    expect(norm(r.stderr)).toContain("demo-spec");
  });

  it("edge: corrupt state file → exit 0, JSON decision=block with recovery instructions", () => {
    const r = runHook(
      "stop-watcher",
      "tests/hooks/fixtures/stop-watcher/corrupt-state.json",
      { cwd: corruptSpec.cwd },
    );
    expect(r.exitCode).toBe(0);
    expect(r.json).toBeDefined();
    expect((r.json as any).decision).toBe("block");
    expect((r.json as any).reason).toMatch(/[Cc]orrupt state/);
    expect((r.json as any).systemMessage).toMatch(/corrupt state/i);
  });

  it("error: malformed stdin JSON → exit 0 (FR-8 never block Claude) + stderr error message", () => {
    const r = runHook(
      "stop-watcher",
      "tests/hooks/fixtures/stop-watcher/error-malformed.json",
    );
    expect(r.exitCode).toBe(0);
    expect(norm(r.stderr)).toContain("invalid stdin JSON");
  });

  // NFR-5a: v7.1.0 completion marker — completed=true silent return
  it("completed=true → silent return (no continuation block)", () => {
    const completedSpec = createFixtureSpec({
      state: {
        phase: "execution",
        taskIndex: 3,
        totalTasks: 3,
        completed: true,
        completedAt: "2026-05-04T13:00:00.000Z",
      },
    });
    try {
      const r = runHook(
        "stop-watcher",
        "tests/hooks/fixtures/stop-watcher/execution-block.json",
        { cwd: completedSpec.cwd },
      );
      expect(r.exitCode).toBe(0);
      // Silent return: no stdout JSON decision block emitted.
      expect(r.stdout).toBe("");
      expect(r.json).toBeUndefined();
    } finally {
      completedSpec.cleanup();
    }
  });

  // NFR-5b / NFR-2: v7.0.x legacy state without `completed` field must fall
  // through to the existing in-progress continuation logic (backwards-compat).
  // Uses `createLegacyState()` to build the pre-v7.1.0 shape from scratch
  // (no `completed` key at all on disk — absence is explicit, not "set to
  // undefined"). The state file is written manually so DEFAULT_STATE's
  // `completed: false` doesn't leak in via createFixtureSpec's merge.
  it("legacy v7.0.x state (no `completed` key) → fall through to in-progress logic", () => {
    const legacySpec = createFixtureSpec({ noStateFile: true });
    try {
      const legacyState = createLegacyState({
        name: legacySpec.specName,
        phase: "execution",
        taskIndex: 1,
        totalTasks: 3,
      });
      // Sanity: the helper does not introduce a `completed` key.
      expect("completed" in legacyState).toBe(false);

      writeFileSync(
        path.join(
          legacySpec.cwd,
          "specs",
          legacySpec.specName,
          ".curdx-state.json",
        ),
        JSON.stringify(legacyState, null, 2),
      );

      const r = runHook(
        "stop-watcher",
        "tests/hooks/fixtures/stop-watcher/execution-block.json",
        { cwd: legacySpec.cwd },
      );
      expect(r.exitCode).toBe(0);
      // Continuation block IS emitted (NFR-2: legacy state → in-progress).
      expect(r.json).toBeDefined();
      expect((r.json as any).decision).toBe("block");
      expect((r.json as any).reason).toMatch(/Continue spec.*demo-spec/);
    } finally {
      legacySpec.cleanup();
    }
  });

  // -----------------------------------------------------------------------
  // POC gate (Task 1.8) — Layer-1 iron-law verification block check.
  //
  // The gate fires inside `handleCompletion()` (stop-watcher.ts ~L630) which
  // only runs when ALL_TASKS_COMPLETE is detected in the transcript. We use
  // the existing `all-complete.json` fixture (transcript_path points at
  // FIXTURE_TRANSCRIPT_FILE under the platform tmpdir — contains the marker;
  // provisioned by byte-equal.test.ts beforeAll, but that helper writes it
  // unconditionally so it's already on disk by the time these tests run on
  // any machine that has run the suite once; we re-provision defensively in
  // the test below to make these cases self-contained).
  // -----------------------------------------------------------------------

  it("POC (a): valid verificationBlocks.execution block + ALL_TASKS_COMPLETE → silent return (no continuation block)", () => {
    const validBlockSpec = createFixtureSpec({
      state: {
        phase: "execution",
        taskIndex: 1,
        totalTasks: 3,
        verificationBlocks: {
          execution: buildValidExecutionBlock(),
        },
      },
    });
    try {
      const r = runHook(
        "stop-watcher",
        "tests/hooks/fixtures/stop-watcher/all-complete.json",
        { cwd: validBlockSpec.cwd },
      );
      expect(r.exitCode).toBe(0);
      // Layer-1 gate passed → handleCompletion returned undefined →
      // outer return is silent (no JSON decision block on stdout).
      expect(r.stdout).toBe("");
      expect(r.json).toBeUndefined();
      // Stderr still carries the "ALL_TASKS_COMPLETE detected" marker line
      // (preserved from pre-gate behavior).
      expect(norm(r.stderr)).toContain("ALL_TASKS_COMPLETE detected in transcript");
    } finally {
      validBlockSpec.cleanup();
    }
  });

  it("POC (b): missing verificationBlocks field + ALL_TASKS_COMPLETE → block decision with 'no verification block' reason", () => {
    // createFixtureSpec's DEFAULT_STATE has no `verificationBlocks` field
    // (added in Task 1.1 to types but not to the default fixture state),
    // so the gate's "missing" branch fires.
    const missingBlockSpec = createFixtureSpec({
      state: {
        phase: "execution",
        taskIndex: 1,
        totalTasks: 3,
      },
    });
    try {
      const r = runHook(
        "stop-watcher",
        "tests/hooks/fixtures/stop-watcher/all-complete.json",
        { cwd: missingBlockSpec.cwd },
      );
      expect(r.exitCode).toBe(0);
      // Block decision emitted on stdout (reason carries the user-visible
      // fix instruction; systemMessage carries the short summary).
      expect(r.json).toBeDefined();
      expect((r.json as any).decision).toBe("block");
      expect((r.json as any).reason).toContain("no verification block");
      expect((r.json as any).reason).toMatch(/Phase 'execution'/);
      expect((r.json as any).systemMessage).toMatch(
        /missing verification block/,
      );
    } finally {
      missingBlockSpec.cleanup();
    }
  });

  // -----------------------------------------------------------------------
  // Phase-2 gate cases (Task 2.5) — exercise the failed / stale / preserved
  // branches of `verifyPhaseBlock` (src/hooks/lib/verify-blocks.ts) that
  // POC (a)+(b) intentionally did not cover.
  //
  // The user-visible block-fail messages are emitted as JSON on STDOUT
  // (`json.reason`), built by `buildVerificationBlockFailDecision` in
  // stop-watcher.ts (~L436). The task description's "stderr contains" wording
  // refers to the user-visible reason text — which the canonical path in
  // this hook surfaces via the JSON `reason` field, mirroring POC (b).
  // -----------------------------------------------------------------------

  it("(d): block exitCode !== 0 with failedReason → block decision, reason includes failedReason text", () => {
    const now = Date.now();
    const failedSpec = createFixtureSpec({
      state: {
        phase: "execution",
        taskIndex: 1,
        totalTasks: 3,
        verificationBlocks: {
          execution: {
            command: "npm run lint",
            exitCode: 1,
            timestamp: new Date(now).toISOString(),
            srcMtime: now - 1000,
            description: "lint check",
            failedReason: "lint failed: 3 errors in src/foo.ts",
          },
        },
      },
    });
    try {
      const r = runHook(
        "stop-watcher",
        "tests/hooks/fixtures/stop-watcher/all-complete.json",
        { cwd: failedSpec.cwd },
      );
      expect(r.exitCode).toBe(0);
      expect(r.json).toBeDefined();
      expect((r.json as any).decision).toBe("block");
      // Canonical failed format: "Verification failed: <reason>. Fix and re-run: <cmd>."
      expect((r.json as any).reason).toContain(
        "lint failed: 3 errors in src/foo.ts",
      );
      expect((r.json as any).reason).toMatch(/Verification failed/);
      expect((r.json as any).reason).toContain("npm run lint");
      expect((r.json as any).systemMessage).toMatch(
        /verification failed/,
      );
    } finally {
      failedSpec.cleanup();
    }
  });

  it("(e): block.srcMtime > Date.parse(timestamp) → block decision, reason starts with 'Stale evidence'", () => {
    const now = Date.now();
    const staleSpec = createFixtureSpec({
      state: {
        phase: "execution",
        taskIndex: 1,
        totalTasks: 3,
        verificationBlocks: {
          execution: {
            command: "npm run typecheck",
            exitCode: 0,
            // timestamp = 1 hour ago, srcMtime = now → strictly stale.
            timestamp: new Date(now - 3600_000).toISOString(),
            srcMtime: now,
            description: "typecheck (now stale)",
          },
        },
      },
    });
    try {
      const r = runHook(
        "stop-watcher",
        "tests/hooks/fixtures/stop-watcher/all-complete.json",
        { cwd: staleSpec.cwd },
      );
      expect(r.exitCode).toBe(0);
      expect(r.json).toBeDefined();
      expect((r.json as any).decision).toBe("block");
      // Canonical stale format passed through verbatim from verify-blocks.ts.
      // Task 4.2 (NFR-3): message embeds phase id + fix command + spec name.
      expect((r.json as any).reason).toMatch(/^Stale evidence for phase '/);
      expect((r.json as any).reason).toContain("phase 'execution'");
      expect((r.json as any).reason).toContain("Re-run: npm run typecheck");
      expect((r.json as any).reason).toMatch(/Spec: \S+/);
      expect((r.json as any).systemMessage).toMatch(
        /verification stale/,
      );
    } finally {
      staleSpec.cleanup();
    }
  });

  it("(f): ALL_TASKS_COMPLETE behavior preserved — taskIndex===totalTasks + valid block → silent return", () => {
    // Regression guard: when every task is checked AND a valid execution
    // block is recorded, the gate must allow the loop to terminate (no
    // continuation block on stdout). Distinct from POC (a) which had
    // taskIndex < totalTasks; this case asserts the post-completion path
    // still passes through cleanly when the spec is genuinely finished.
    const completedSpec = createFixtureSpec({
      state: {
        phase: "execution",
        taskIndex: 3,
        totalTasks: 3,
        verificationBlocks: {
          execution: buildValidExecutionBlock(),
        },
      },
    });
    try {
      const r = runHook(
        "stop-watcher",
        "tests/hooks/fixtures/stop-watcher/all-complete.json",
        { cwd: completedSpec.cwd },
      );
      expect(r.exitCode).toBe(0);
      // Silent: gate passed, ALL_TASKS_COMPLETE allowed to fall through.
      expect(r.stdout).toBe("");
      expect(r.json).toBeUndefined();
      // Marker line still printed by handleCompletion's stderr label.
      expect(norm(r.stderr)).toContain("ALL_TASKS_COMPLETE detected in transcript");
    } finally {
      completedSpec.cleanup();
    }
  });

  it("POC (c): stop_hook_active=true with missing block → silent early-exit (D5 anti-loop guard)", () => {
    // D5 canonical guard at the top of runHook handler short-circuits BEFORE
    // any state read — so even with no verificationBlocks the hook must exit
    // silently. We bypass the runHook helper here because it doesn't expose
    // `stop_hook_active` as an override; instead we spawn the bundle with a
    // hand-built stdin payload.
    const reentrantSpec = createFixtureSpec({
      state: {
        phase: "execution",
        taskIndex: 1,
        totalTasks: 3,
        // verificationBlocks intentionally absent → gate WOULD fire if we
        // ever reached it, but the early-exit must short-circuit first.
      },
    });
    try {
      const stdin = JSON.stringify({
        hookEvent: "Stop",
        cwd: reentrantSpec.cwd,
        transcript_path: FIXTURE_TRANSCRIPT_FILE,
        stop_hook_active: true,
      });
      const result = spawnSync("node", [STOP_WATCHER_BUNDLE], {
        input: stdin,
        cwd: reentrantSpec.cwd,
        env: {
          ...process.env,
          CLAUDE_PLUGIN_ROOT: path.join(
            REPO_ROOT_FOR_BUNDLE,
            "plugins/curdx-flow",
          ),
        },
        encoding: "utf8",
        timeout: 5000,
      });
      expect(result.status).toBe(0);
      // Silent early-exit: no JSON decision on stdout, no gate-related
      // stderr (hook returned before the ALL_TASKS_COMPLETE detection
      // path could log its marker).
      expect(result.stdout ?? "").toBe("");
      expect(norm(result.stderr)).not.toContain(
        "ALL_TASKS_COMPLETE detected in transcript",
      );
      expect(norm(result.stderr)).not.toContain("no verification block");
    } finally {
      reentrantSpec.cleanup();
    }
  });

  // -----------------------------------------------------------------------
  // Cost-runaway gate hard-block regression guards (Task 3.3 — spec
  // spec-cost-runaway-guards). The pre-7.2 stop-watcher only emitted a soft
  // stderr warn when an iteration cap was hit; Task 1.6 replaced that with a
  // hard `decision: "block"` via `buildCostRunawayBlock`. These two cases
  // pin the new behavior at the boundary AND assert the gate's insertion
  // order in the runHook pipeline:
  //
  //   stop_hook_active early-exit  (must fire FIRST — no block)
  //     ↓
  //   buildCostRunawayBlock        (must fire BEFORE verifyPhaseBlock)
  //     ↓
  //   verifyPhaseBlock missing/failed/stale gates
  //
  // Case (i) below provokes both gates simultaneously (missing
  // verificationBlocks + cap-tripped) and asserts the cost-runaway message
  // wins — proving the cost-runaway gate sits ahead of the iron-law gate.
  // -----------------------------------------------------------------------

  it("(h): globalIteration === maxGlobalIterations → hard block with 'Cost runaway guard' reason", () => {
    // Exact-equal boundary: the gate uses `>=` semantics, so equality must
    // trip it (regression guard against any future `>` typo). This case
    // duplicates the spirit of max-iterations-enforcement.test.ts case 1
    // intentionally — co-located here so the stop-watcher suite catches a
    // regression even if the dedicated boundary file is removed/refactored.
    const capSpec = createFixtureSpec({
      state: {
        phase: "execution",
        taskIndex: 1,
        totalTasks: 3,
        globalIteration: 30,
        maxGlobalIterations: 30,
        taskIteration: 1,
        maxTaskIterations: 5,
      },
    });
    try {
      const r = runHook(
        "stop-watcher",
        "tests/hooks/fixtures/stop-watcher/execution-block.json",
        { cwd: capSpec.cwd },
      );
      expect(r.exitCode).toBe(0);
      expect(r.json).toBeDefined();
      expect((r.json as any).decision).toBe("block");
      expect((r.json as any).reason).toContain("Cost runaway guard");
      expect((r.json as any).reason).toContain("globalIteration=30");
      expect((r.json as any).reason).toContain("maxGlobalIterations=30");
    } finally {
      capSpec.cleanup();
    }
  });

  it("(i): cap insertion order — fires AFTER stop_hook_active early-exit, BEFORE verifyPhaseBlock", () => {
    // Two-part assertion proving the gate's pipeline position:
    //
    // Part 1: stop_hook_active=true + cap-tripped + missing block →
    //   silent early-exit (no Cost-runaway message, no missing-block
    //   message). Confirms the D5 guard sits ABOVE the cost-runaway gate.
    //
    // Part 2: stop_hook_active=false + cap-tripped + missing block + cwd
    //   pointing at all-complete fixture (which would normally trigger the
    //   verifyPhaseBlock missing-block message under handleCompletion) →
    //   the COST-RUNAWAY message wins. Confirms the cost-runaway gate
    //   sits BELOW stop_hook_active but ABOVE verifyPhaseBlock.
    const orderingSpec = createFixtureSpec({
      state: {
        phase: "execution",
        taskIndex: 1,
        totalTasks: 3,
        globalIteration: 30,
        maxGlobalIterations: 30,
        taskIteration: 1,
        maxTaskIterations: 5,
        // verificationBlocks intentionally absent → verifyPhaseBlock would
        // emit the "no verification block" message if it were reached.
      },
    });
    try {
      // Part 1: stop_hook_active=true short-circuits before cost-runaway.
      const reentrantStdin = JSON.stringify({
        hookEvent: "Stop",
        cwd: orderingSpec.cwd,
        transcript_path: FIXTURE_TRANSCRIPT_FILE,
        stop_hook_active: true,
      });
      const reentrantResult = spawnSync("node", [STOP_WATCHER_BUNDLE], {
        input: reentrantStdin,
        cwd: orderingSpec.cwd,
        env: {
          ...process.env,
          CLAUDE_PLUGIN_ROOT: path.join(
            REPO_ROOT_FOR_BUNDLE,
            "plugins/curdx-flow",
          ),
        },
        encoding: "utf8",
        timeout: 5000,
      });
      expect(reentrantResult.status).toBe(0);
      expect(reentrantResult.stdout ?? "").toBe("");
      // Neither gate's message leaks: stop_hook_active wins.
      expect(norm(reentrantResult.stderr)).not.toContain("Cost runaway guard");
      expect(norm(reentrantResult.stderr)).not.toContain("no verification block");

      // Part 2: stop_hook_active=false → cost-runaway fires before
      // verifyPhaseBlock (despite all-complete fixture pointing at a
      // transcript with ALL_TASKS_COMPLETE, which would normally route
      // through handleCompletion → verifyPhaseBlock missing-block path).
      const r = runHook(
        "stop-watcher",
        "tests/hooks/fixtures/stop-watcher/all-complete.json",
        { cwd: orderingSpec.cwd },
      );
      expect(r.exitCode).toBe(0);
      expect(r.json).toBeDefined();
      expect((r.json as any).decision).toBe("block");
      // Cost-runaway message wins over verifyPhaseBlock's "no verification
      // block" message — load-bearing assertion for insertion order.
      expect((r.json as any).reason).toContain("Cost runaway guard");
      expect((r.json as any).reason).not.toContain("no verification block");
    } finally {
      orderingSpec.cleanup();
    }
  });
});
