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
import { classifySmartRoute } from "./lib/smart-route.js";
import { appendBrainEvent } from "./lib/project-brain.js";
import type { CurdxState } from "./_shared/types.js";

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
    passThrough();
  }

  // Paths 2 & 3: AC-2.4 defensive guard.
  if (input.hook_event_name !== "TaskCompleted") {
    passThrough();
  }
  if (typeof input.task_id !== "string" || input.task_id.length === 0) {
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
    passThrough();
  }
  const specDir = join(cwd, specPath as string);
  const stateFile = join(specDir, ".curdx-state.json");
  if (!existsSync(stateFile)) {
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
    passThrough();
  }

  // Path 5: phase ∉ VERIFICATION_PHASES → pass-through (legacy state, fail-open).
  // Shared phase-detection lives in lib/verify-blocks.ts (Task 4.1 DRY).
  const phase = getVerificationPhase(state);
  if (phase === null) {
    passThrough();
  }

  // Path 6: run the shared gate. Same lib as Stop hook (D3 single source of
  // truth across 4 callers).
  const result = await verifyPhaseBlock(state, phase, specDir);
  if (!result.ok) {
    let verifierHint = "";
    let routeName = "unknown";
    let stack = "unknown";
    let verifier: string | undefined;
    try {
      const route = classifySmartRoute({ cwd });
      routeName = route.route;
      stack = route.stackProfile.primary;
      verifier = route.suggestedVerifier.command ?? route.suggestedVerifier.fallback ?? undefined;
      if (verifier) verifierHint = ` Suggested verifier: ${verifier}.`;
    } catch {
      verifierHint = "";
    }
    appendBrainEvent(cwd, {
      type: "verification-blocked",
      route: routeName,
      stack,
      phase,
      verifier,
      reason: result.reason ?? "verification failed",
    });
    emitBlock(`${result.reason ?? "verification failed"}${verifierHint}`);
  }
  process.exit(0);
}

// Path 7: top-level safety net. Unexpected throws → block with generic
// message + stack to stderr for the error log.
main().catch((err) => {
  const stack = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`[task-completed-verifier] ${stack}\n`);
  emitBlock("internal error in verify-blocks; see logs");
});
