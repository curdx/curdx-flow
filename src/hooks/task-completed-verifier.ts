/**
 * TaskCompleted hook — Layer-2 opt-in iron-law verification gate.
 *
 * Layer model (per design.md "Two-Layer Verification"):
 *   - Layer 1 (mandatory): Stop hook (`stop-watcher`) — runs on every spec
 *     loop iteration, gates ALL_TASKS_COMPLETE on a fresh verification block.
 *   - Layer 2 (opt-in)   : THIS hook — fires only when Anthropic's
 *     `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` env is set, providing an
 *     additional checkpoint at the per-Task tool boundary. Source does not
 *     gate on the env flag itself; the platform handles dispatch.
 *
 * Departures from `runHook` (used by the other 4 hooks):
 *   - Output contract differs: this hook intentionally writes a flat
 *     `{continue: true}` JSON for the pass-through paths (per AC-2.4 defensive
 *     guard) and a flat `{decision:"block", reason}` for the fail path. The
 *     `runHook` wrapper assumes one of the typed `HookOutput` variants and
 *     always exits 0; we need EXIT 2 on block to signal Claude Code that the
 *     TaskCompleted event must be intercepted (Anthropic TaskCompleted contract).
 *   - Therefore stdin parsing, output emission, and exit-code control live
 *     directly in this file rather than going through the wrapper.
 *
 * Defensive-guard paths (FR-8: never block on malformed input):
 *   1. Invalid stdin JSON                        → `{continue:true}` + exit 0
 *   2. `hook_event_name !== "TaskCompleted"`     → `{continue:true}` + exit 0
 *   3. `task_id` absent                          → `{continue:true}` + exit 0
 *   4. No `.curdx-state.json` in active spec     → `{continue:true}` + exit 0
 *      (not a curdx spec — pass-through)
 *   5. State present, phase ∉ VerificationPhase  → `{continue:true}` + exit 0
 *      (legacy / unknown phase — fail-open per FR-8)
 *
 * Block paths (exit 2, signals Claude Code to intercept):
 *   6. `verifyPhaseBlock` returns `!ok`          → `{decision:"block", reason}`
 *   7. Unexpected throw in any of the above      → `{decision:"block", reason:
 *      "internal error in verify-blocks; see logs"}` + stack to stderr
 *
 * Spec: specs/spec-verification-iron-law/tasks.md Task 2.9 + design.md
 * "Two-Layer Verification" + AC-2.4.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { readStdinJson } from "./_shared/stdin.js";
import { resolveCurrent } from "./_shared/path-resolver.js";
import { getVerificationPhase, verifyPhaseBlock } from "./lib/verify-blocks.js";
import { buildCorrelationId } from "./_shared/correlation.js";
import * as eventLog from "./_shared/error-logger.js";
import type { CurdxState, HookStdin } from "./_shared/types.js";

interface TaskCompletedStdin {
  cwd?: string;
  hook_event_name?: string;
  task_id?: string;
  [k: string]: unknown;
}

/** Emit `{continue:true}` and exit 0 — the canonical pass-through. */
function passThrough(): never {
  process.stdout.write(JSON.stringify({ continue: true }));
  process.exit(0);
}

/** Emit `{decision:"block", reason}` and exit 2 — gate the TaskCompleted event. */
function emitBlock(reason: string): never {
  process.stdout.write(JSON.stringify({ decision: "block", reason }));
  process.exit(2);
}

async function main(): Promise<void> {
  // Path 1: stdin parse failure → pass-through. We can't use readStdinJson
  // directly because it throws on bad JSON; we want fail-open here.
  let input: TaskCompletedStdin;
  try {
    input = await readStdinJson<TaskCompletedStdin>();
  } catch {
    // Site 1/9: stdin parse fail — defensive pass-through (fail-open).
    eventLog.logHookEvent({
      hook: "task-completed-verifier",
      event: "TaskCompleted",
      level: "info",
      kind: "unknown",
      payload: { reason: "stdin_parse_fail" },
      correlationId: buildCorrelationId(null, null),
    });
    passThrough();
  }

  // Paths 2 & 3: AC-2.4 defensive guard.
  if (input.hook_event_name !== "TaskCompleted") {
    // Site 2/9: event mismatch — wrong hook envelope, allow silently.
    eventLog.logHookEvent({
      hook: "task-completed-verifier",
      event: "TaskCompleted",
      level: "info",
      kind: "unknown",
      payload: { reason: "event_mismatch", got: input.hook_event_name },
      correlationId: buildCorrelationId(input as HookStdin | null, null),
      cwd: typeof input.cwd === "string" ? input.cwd : undefined,
    });
    passThrough();
  }
  if (typeof input.task_id !== "string" || input.task_id.length === 0) {
    // Site 3/9: task_id missing — Agent Teams disabled or malformed envelope.
    eventLog.logHookEvent({
      hook: "task-completed-verifier",
      event: "TaskCompleted",
      level: "info",
      kind: "unknown",
      payload: { reason: "no_task_id" },
      correlationId: buildCorrelationId(input as HookStdin | null, null),
      cwd: typeof input.cwd === "string" ? input.cwd : undefined,
    });
    passThrough();
  }

  // Path 4: locate the active spec's state file. Mirror stop-watcher's pattern:
  // resolveCurrent → join(cwd, specPath). If anything is missing, pass-through
  // (not a curdx spec or no active spec).
  const cwd = typeof input.cwd === "string" && input.cwd.length > 0
    ? input.cwd
    : process.cwd();
  const specPath = resolveCurrent({ cwd });
  if (!specPath) {
    // Site 4/9: no active spec — not a curdx spec, allow silently.
    eventLog.logHookEvent({
      hook: "task-completed-verifier",
      event: "TaskCompleted",
      level: "info",
      kind: "unknown",
      payload: { reason: "no_spec" },
      correlationId: buildCorrelationId(input as HookStdin | null, null),
      cwd,
    });
    passThrough();
  }
  const specDir = join(cwd, specPath as string);
  const stateFile = join(specDir, ".curdx-state.json");
  if (!existsSync(stateFile)) {
    // Site 5/9: spec resolved but no .curdx-state.json — pre-/post-loop, allow.
    eventLog.logHookEvent({
      hook: "task-completed-verifier",
      event: "TaskCompleted",
      level: "info",
      kind: "unknown",
      payload: { reason: "no_state", specPath: specPath as string },
      correlationId: buildCorrelationId(input as HookStdin | null, null),
      cwd,
      spec: specPath as string,
    });
    passThrough();
  }

  // Read state. JSON.parse failure here is treated as malformed → pass-through
  // (FR-8 fail-open: a corrupt state file in the spec dir should not gate
  // every TaskCompleted event in the session; the Stop hook owns the
  // user-visible "corrupt state" path).
  let state: CurdxState;
  try {
    state = JSON.parse(readFileSync(stateFile, "utf8")) as CurdxState;
  } catch {
    // Site 6/9: state JSON parse fail — corrupt state, fail-open per FR-8.
    eventLog.logHookEvent({
      hook: "task-completed-verifier",
      event: "TaskCompleted",
      level: "info",
      kind: "unknown",
      payload: { reason: "state_parse_fail", specPath: specPath as string },
      correlationId: buildCorrelationId(input as HookStdin | null, null),
      cwd,
      spec: specPath as string,
      path: stateFile,
    });
    passThrough();
  }

  // Path 5: phase ∉ VERIFICATION_PHASES → pass-through (legacy state, fail-open).
  // Shared phase-detection lives in lib/verify-blocks.ts (Task 4.1 DRY).
  const phase = getVerificationPhase(state);
  if (phase === null) {
    // Site 7/9: phase resolve fail — legacy/unknown phase, fail-open per FR-8.
    eventLog.logHookEvent({
      hook: "task-completed-verifier",
      event: "TaskCompleted",
      level: "info",
      kind: "unknown",
      payload: {
        reason: "phase_resolve_fail",
        statePhase: state.phase,
        specPath: specPath as string,
      },
      correlationId: buildCorrelationId(input as HookStdin | null, state),
      cwd,
      spec: specPath as string,
    });
    passThrough();
  }

  // Path 6: run the shared gate. Same lib as Stop hook (D3 single source of
  // truth across 4 callers).
  const result = await verifyPhaseBlock(state, phase, specDir);
  if (!result.ok) {
    // Site 8/9: verifyPhaseBlock failed at TaskCompleted — block decision.
    eventLog.logHookEvent({
      hook: "task-completed-verifier",
      event: "TaskCompleted",
      level: "decision",
      kind: "task_verify_fail",
      payload: {
        reason: result.reason ?? "verification failed",
        phase,
        specPath: specPath as string,
      },
      correlationId: buildCorrelationId(input as HookStdin | null, state),
      cwd,
      spec: specPath as string,
    });
    emitBlock(result.reason ?? "verification failed");
  }
  // Site 9/9: verification passed — Task allowed to complete.
  eventLog.logHookEvent({
    hook: "task-completed-verifier",
    event: "TaskCompleted",
    level: "info",
    kind: "task_verify_pass",
    payload: { phase, specPath: specPath as string },
    correlationId: buildCorrelationId(input as HookStdin | null, state),
    cwd,
    spec: specPath as string,
  });
  process.exit(0);
}

// Path 7: top-level safety net. Unexpected throws → block with generic
// message + stack to stderr for the error log.
main().catch((err) => {
  const stack = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`[task-completed-verifier] ${stack}\n`);
  emitBlock("internal error in verify-blocks; see logs");
});
