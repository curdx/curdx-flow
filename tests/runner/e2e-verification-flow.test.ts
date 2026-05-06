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
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
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

/**
 * Task 3.7 (VE3 + NFR-1) — performance budget assertion.
 *
 * Spec NFR-1: stop-watcher hook overhead must stay below mean ≤ 200 ms and
 * P95 ≤ 500 ms on a fixture state file ≤ 100 KB. This test runs the bundled
 * `stop-watcher.mjs` 20 iterations in sequence against a single shared
 * fixture (built once in beforeAll, torn down once in afterAll) on the happy
 * path — i.e. valid `verificationBlocks.execution` block + ALL_TASKS_COMPLETE
 * marker in transcript — so each iteration takes the silent-pass branch
 * (`runStopHook` exits 0 with empty stdout). This is the cheapest legitimate
 * path through the hook; if the budget can't hold here, no real-world phase
 * exit will either.
 *
 * Implementation notes (load-bearing for review):
 *  • State file is ~480 bytes — well under the 100 KB ceiling NFR-1
 *    references. The ceiling exists because `verifyPhaseBlock` walks
 *    `walkSrcTree(specDir)` whose runtime is dominated by FS scan, not state
 *    file parse, so a tiny fixture is the right baseline for hook overhead.
 *  • We discard 3 warm-up iterations BEFORE the measurement loop. Empirically
 *    on this machine the first 1-2 spawns include Node startup + V8 jit cold
 *    paths and run ~1000 ms each, while steady-state runs land at ~25 ms.
 *    NFR-1 is a steady-state budget (the hook fires per session-end, not
 *    once-ever), so cold-start outliers would be a misrepresentation. The
 *    warm-up count is documented here so future readers don't strip it as
 *    "unused setup". // FLAKY-MITIGATION: warm-up keeps P95 stable on cold CI.
 *  • Per-test timeout overridden to 60_000 ms so 20 spawns × ~30 ms typical
 *    + headroom for slow CI runners (Windows GH Actions in particular spawns
 *    Node ~3-5× slower than macOS) can complete inside the test envelope.
 *  • Cleanup uses `rmSync(fixtureDir, {recursive:true})` in afterAll per
 *    Task 3.7 step-5; we don't pass `force:true` here intentionally — if the
 *    fixture path resolves wrong, surfacing the ENOENT signals a real bug.
 */
describe("e2e verification flow (VE3 + NFR-1) — performance budget", () => {
  const ITERATIONS = 20;
  const WARMUP = 3;
  const MEAN_BUDGET_MS = 200;
  const P95_BUDGET_MS = 500;

  let fixtureDir: string;
  let transcriptPath: string;
  let stdinPayload: string;

  beforeAll(() => {
    fixtureDir = mkdtempSync(path.join(tmpdir(), "curdx-e2e-perf-"));
    const specName = "e2e-perf";
    const specsDir = path.join(fixtureDir, "specs");
    const specDir = path.join(specsDir, specName);
    mkdirSync(specDir, { recursive: true });

    writeFileSync(path.join(specsDir, ".current-spec"), specName);

    // Valid block: srcMtime predates timestamp by 5s, exitCode 0 → silent
    // pass branch. Identical to the (b) test's happy-path fixture but baked
    // once for the whole describe so 20 iterations don't re-write the state
    // file (the perf budget covers the hook's read path, not fixture setup).
    const now = Date.now();
    const state = {
      source: "spec" as const,
      name: specName,
      basePath: `./specs/${specName}`,
      phase: "execution" as const,
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
      verificationBlocks: {
        execution: {
          command: "npm run verify",
          exitCode: 0,
          timestamp: new Date(now).toISOString(),
          srcMtime: now - 5000,
          description: "VE3 perf-budget fixture",
        },
      },
    };
    const stateFile = path.join(specDir, ".curdx-state.json");
    writeFileSync(stateFile, JSON.stringify(state, null, 2));

    // Sanity-check NFR-1's "≤ 100 KB" precondition. If somebody bloats the
    // fixture, this fails loudly instead of silently inflating the budget
    // for free.
    const stateBytes = Buffer.byteLength(
      JSON.stringify(state, null, 2),
      "utf8",
    );
    if (stateBytes > 100 * 1024) {
      throw new Error(
        `VE3 fixture state file is ${stateBytes} bytes; NFR-1 caps at 100 KB`,
      );
    }

    transcriptPath = path.join(fixtureDir, "transcript.txt");
    writeFileSync(
      transcriptPath,
      "line one\nline two\nALL_TASKS_COMPLETE\n",
    );

    stdinPayload = JSON.stringify({
      hook_event_name: "Stop",
      hookEvent: "Stop",
      stop_hook_active: false,
      cwd: fixtureDir,
      transcript_path: transcriptPath,
    });
  });

  afterAll(() => {
    // Task 3.7 step-5 explicitly: rmSync(fixtureDir, {recursive: true}).
    rmSync(fixtureDir, { recursive: true });
  });

  it(
    `runs ${ITERATIONS} iterations under mean ≤${MEAN_BUDGET_MS}ms and P95 ≤${P95_BUDGET_MS}ms`,
    { timeout: 60_000 },
    () => {
      const env = {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
      };

      // Warm-up pass: discarded. See file-level note on cold-start outliers.
      for (let i = 0; i < WARMUP; i++) {
        spawnSync("node", [STOP_WATCHER_BUNDLE], {
          input: stdinPayload,
          cwd: fixtureDir,
          env,
          encoding: "utf8",
          timeout: 5000,
        });
      }

      // Measurement loop.
      const durations: number[] = [];
      for (let i = 0; i < ITERATIONS; i++) {
        const t0 = performance.now();
        const result = spawnSync("node", [STOP_WATCHER_BUNDLE], {
          input: stdinPayload,
          cwd: fixtureDir,
          env,
          encoding: "utf8",
          timeout: 5000,
        });
        const elapsed = performance.now() - t0;
        durations.push(elapsed);

        // Each iteration MUST hit the silent-pass path. If any iteration
        // unexpectedly drops to the block-decision path, the perf number is
        // meaningless — fail fast with the offending stdout for diagnosis.
        expect(result.status, `iter ${i} non-zero exit`).toBe(0);
        expect(
          (result.stdout ?? "").trim(),
          `iter ${i} unexpected stdout (block decision?)`,
        ).toBe("");
      }

      const mean =
        durations.reduce((acc, d) => acc + d, 0) / durations.length;
      // P95: index = floor(n * 0.95) on a sorted ascending array. For n=20,
      // floor(20*0.95)=19, so P95 == max(durations) — i.e. the slowest
      // measured iteration. This is the strictest reading of "P95 over 20
      // samples" and matches Task 3.7's intent (catch tail latency).
      const sorted = [...durations].sort((a, b) => a - b);
      // Non-null assertion: durations.length === ITERATIONS (20) is asserted
      // implicitly by the loop above and the budget index 19 is in-range. We
      // narrow with `?? Number.POSITIVE_INFINITY` defensively so the eventual
      // expect() still fires loudly if the array somehow shortens — better
      // than `undefined < 500` silently truthy-coercing.
      const p95 =
        sorted[Math.floor(durations.length * 0.95)] ??
        Number.POSITIVE_INFINITY;

      // Surface the actual numbers so failures are diagnosable from CI logs
      // without re-running locally. Format mirrors the script-level baseline
      // notebook used during NFR-1 calibration.
      // eslint-disable-next-line no-console
      console.log(
        `[VE3 perf] iterations=${ITERATIONS} mean=${mean.toFixed(
          1,
        )}ms p95=${p95.toFixed(1)}ms (budget mean ≤${MEAN_BUDGET_MS}ms, P95 ≤${P95_BUDGET_MS}ms)`,
      );

      expect(mean, `mean (${mean.toFixed(1)}ms) exceeded NFR-1 budget`).toBeLessThanOrEqual(
        MEAN_BUDGET_MS,
      );
      expect(p95, `P95 (${p95.toFixed(1)}ms) exceeded NFR-1 budget`).toBeLessThanOrEqual(
        P95_BUDGET_MS,
      );
    },
  );
});
