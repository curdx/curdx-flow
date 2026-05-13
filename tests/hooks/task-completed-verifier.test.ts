import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createFixtureSpec,
  type FixtureSpec,
} from "./_fixture-setup.js";

// ---------------------------------------------------------------------------
// Task 2.13 — TaskCompleted hook (Layer-2 opt-in iron-law gate) unit tests.
//
// The hook bundle is invoked directly via `spawnSync` rather than through
// `runHook`, because:
//   - `runHook` rewrites only the `cwd` field of the fixture stdin and does
//     not let callers control `hook_event_name` / `task_id` per case;
//   - this hook's pass-through paths return `{continue:true}` (not empty
//     stdout) and the block path exits with code 2, so the wrapper's
//     "single JSON decision or empty" assumption does not match.
//
// Five paths exercised, mapped to the canonical defensive-guard ladder in
// `src/hooks/task-completed-verifier.ts`:
//   (a) valid block present                  → exit 0, {continue:true}
//   (b) verificationBlocks missing for phase → exit 2, stderr block reason
//   (c) stale (srcMtime > timestamp)         → exit 2, "Stale evidence"
//   (d) malformed stdin (no task_id)         → exit 0 pass-through
//   (e) absent `.curdx-state.json`           → exit 0 pass-through
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT_FOR_BUNDLE = path.resolve(__dirname, "../..");
const HOOK_BUNDLE = path.join(
  REPO_ROOT_FOR_BUNDLE,
  "plugins/curdx-flow/hooks/scripts/task-completed-verifier.mjs",
);
const PLUGIN_ROOT = path.join(REPO_ROOT_FOR_BUNDLE, "plugins/curdx-flow");

interface SpawnHookResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  json: unknown | undefined;
}

/**
 * Spawn the bundled task-completed-verifier with a custom stdin payload + cwd.
 *
 * Keeps stdin construction explicit at the call site so each test's payload
 * (`hook_event_name` / `task_id` / `cwd` shape) is locally readable.
 */
function spawnHook(
  stdin: string,
  cwd: string,
  envOverrides: Record<string, string> = {},
): SpawnHookResult {
  const result = spawnSync("node", [HOOK_BUNDLE], {
    input: stdin,
    cwd,
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
      CURDX_CWD: cwd,
      ...envOverrides,
    },
    encoding: "utf8",
    timeout: 5000,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  let json: unknown | undefined;
  const trimmed = stdout.trim();
  if (trimmed.length > 0) {
    try {
      json = JSON.parse(trimmed);
    } catch {
      json = undefined;
    }
  }
  return {
    exitCode: result.status ?? -1,
    stdout,
    stderr,
    json,
  };
}

/** Build a minimal valid execution block (exitCode 0, srcMtime ≤ timestamp). */
function buildValidExecutionBlock() {
  const now = Date.now();
  return {
    command: "npm run typecheck",
    exitCode: 0,
    timestamp: new Date(now).toISOString(),
    srcMtime: now - 1000,
    description: "TaskCompleted unit-test fixture",
  };
}

describe("task-completed-verifier (TaskCompleted hook)", () => {
  let spec: FixtureSpec | undefined;

  afterEach(() => {
    if (spec) {
      spec.cleanup();
      spec = undefined;
    }
  });

  it("(a): valid verificationBlocks.execution block → exit 0, no block decision emitted", () => {
    spec = createFixtureSpec({
      state: {
        phase: "execution",
        taskIndex: 1,
        totalTasks: 3,
        verificationBlocks: {
          execution: buildValidExecutionBlock(),
        },
      },
    });
    const stdin = JSON.stringify({
      hook_event_name: "TaskCompleted",
      task_id: "task-1.2",
      cwd: spec.cwd,
    });
    const r = spawnHook(stdin, spec.cwd);
    // Path 6 (gate passed) reaches `process.exit(0)` directly without writing
    // `{continue:true}` — that envelope is reserved for the defensive fail-open
    // pass-through paths. The contract for "valid block" is therefore exit 0
    // with no block-decision JSON on stdout (Claude Code treats absence of a
    // `decision:"block"` envelope as continue-by-default).
    expect(r.exitCode).toBe(0);
    // Either silent stdout, or any JSON that is NOT a block decision. The
    // load-bearing assertion is "no gate fired", encoded as: not exit 2 and
    // no `decision:"block"` envelope.
    if (r.json !== undefined) {
      expect((r.json as any).decision).not.toBe("block");
    }
  });

  it("(b): verificationBlocks missing for phase → exit 2, stderr reason='missing'", () => {
    spec = createFixtureSpec({
      state: {
        phase: "execution",
        taskIndex: 1,
        totalTasks: 3,
        // verificationBlocks intentionally absent → verifyPhaseBlock returns
        // { ok:false, reason:"missing" } and the hook propagates it verbatim.
      },
    });
    const stdin = JSON.stringify({
      hook_event_name: "TaskCompleted",
      task_id: "task-1.2",
      cwd: spec.cwd,
    });
    const r = spawnHook(stdin, spec.cwd);
    expect(r.exitCode).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("missing");
    expect(r.stderr).toContain("Suggested verifier");
    expect(existsSync(path.join(spec.cwd, ".curdx", "brain.jsonl"))).toBe(true);
    expect(readFileSync(path.join(spec.cwd, ".curdx", "brain.jsonl"), "utf8")).toContain("verification-blocked");
  });

  it("(c): stale block (srcMtime > Date.parse(timestamp)) → exit 2, reason starts with 'Stale evidence'", () => {
    const now = Date.now();
    spec = createFixtureSpec({
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
    const stdin = JSON.stringify({
      hook_event_name: "TaskCompleted",
      task_id: "task-1.2",
      cwd: spec.cwd,
    });
    const r = spawnHook(stdin, spec.cwd);
    expect(r.exitCode).toBe(2);
    expect(r.stdout).toBe("");
    // Task 4.2 (NFR-3): stale message embeds phase id + fix command + spec.
    expect(r.stderr).toMatch(/^Stale evidence for phase '/);
    expect(r.stderr).toContain("phase 'execution'");
    expect(r.stderr).toContain("Re-run: npm run typecheck");
    expect(r.stderr).toMatch(/Spec: \S+/);
  });

  it("(d): malformed stdin (missing task_id) → exit 0 pass-through {continue:true}", () => {
    // Even with a fully-set spec on disk + valid block, missing `task_id`
    // must fail-open per FR-8 / AC-2.4 (defensive guard), regardless of
    // verification state. We fixture a perfectly valid spec so we know any
    // exit-2 result would be a regression of the guard.
    spec = createFixtureSpec({
      state: {
        phase: "execution",
        taskIndex: 1,
        totalTasks: 3,
        verificationBlocks: {
          execution: buildValidExecutionBlock(),
        },
      },
    });
    const stdin = JSON.stringify({
      hook_event_name: "TaskCompleted",
      // task_id intentionally omitted
      cwd: spec.cwd,
    });
    const r = spawnHook(stdin, spec.cwd);
    expect(r.exitCode).toBe(0);
    expect(r.json).toEqual({ continue: true });
  });

  it("(e): absent `.curdx-state.json` → exit 0 pass-through {continue:true}", () => {
    // No spec layout at all: bare temp dir, no specs/, no .current-spec, no
    // state file. resolveCurrent() returns null → hook bails to pass-through
    // (Path 4 in the defensive-guard ladder).
    const bareCwd = mkdtempSync(path.join(tmpdir(), "curdx-bare-"));
    try {
      const stdin = JSON.stringify({
        hook_event_name: "TaskCompleted",
        task_id: "task-1.2",
        cwd: bareCwd,
      });
      const r = spawnHook(stdin, bareCwd);
      expect(r.exitCode).toBe(0);
      expect(r.json).toEqual({ continue: true });
    } finally {
      rmSync(bareCwd, { recursive: true, force: true });
    }
  });
});
