
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { logHookError } from "./_shared/error-logger.js";
import { readStdinJson } from "./_shared/stdin.js";
import { resolveCurrent } from "./_shared/path-resolver.js";
import { getVerificationPhase, verifyPhaseBlock, type VerifyPhaseBlockResult } from "./lib/verify-blocks.js";
import { classifySmartRoute } from "./lib/smart-route.js";
import { decideLastMile } from "./lib/last-mile-orchestrator.js";
import { appendBrainEvent } from "./lib/project-brain.js";
import type { CurdxState } from "./_shared/types.js";

interface TaskCompletedStdin {
  cwd?: string;
  hook_event_name?: string;
  session_id?: string;
  task_id?: string;
  [k: string]: unknown;
}

function passThrough(): never {
  process.stdout.write(JSON.stringify({ continue: true }));
  process.exit(0);
}

function emitBlock(reason: string): never {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
}

function buildTaskCompletedGateReason(input: {
  state: CurdxState;
  phase: string;
  specDir: string;
  reason?: string;
  command?: string;
  verifierHint: string;
  recoveryHint: string;
}): string {
  const baseReason = input.reason === "missing"
    ? `missing verification block for phase '${input.phase}'`
    : input.reason ?? "verification failed";
  const identity = [
    typeof input.state.runId === "string" && input.state.runId.length > 0 ? `runId=${input.state.runId}` : undefined,
    typeof input.state.goalId === "string" && input.state.goalId.length > 0 ? `goalId=${input.state.goalId}` : undefined,
    `spec=${basename(input.specDir)}`,
    `phase=${input.phase}`,
  ].filter((item): item is string => item !== undefined).join(" ");
  const nextAction = typeof input.command === "string" && input.command.length > 0
    ? `Re-run: ${input.command}.`
    : `Next action: run /curdx-flow:${input.phase} to record fresh verification evidence.`;

  return `${baseReason}. ${identity}. ${nextAction}${input.verifierHint}${input.recoveryHint}`;
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
  const specPath = resolveCurrent({ cwd, sessionId: input.session_id });
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
  let result: VerifyPhaseBlockResult;
  try {
    result = await verifyPhaseBlock(state, phase, specDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logHookError(
      {
        hook: "task-completed-verifier",
        event: "verify_phase_block",
        msg,
        stack: err instanceof Error ? err.stack ?? "" : "",
        cwd,
        spec: basename(specDir),
      },
      err instanceof Error ? err : undefined,
    );
    process.stderr.write("[task-completed-verifier] verification helper error; failing open\n");
    passThrough();
  }
  if (!result.ok) {
    let verifierHint = "";
    let routeName = "unknown";
    let stack = "unknown";
    let verifier: string | undefined;
    let recoveryHint = "";
    try {
      const route = classifySmartRoute({ cwd });
      routeName = route.route;
      stack = route.stackProfile.primary;
      verifier = route.suggestedVerifier.command ?? route.suggestedVerifier.fallback ?? undefined;
      if (verifier) verifierHint = ` Suggested verifier: ${verifier}.`;
      const lastMile = decideLastMile({
        cwd,
        routeFacts: route,
        hookEvent: "TaskCompleted",
        verification: {
          ok: false,
          phase,
          reason: result.reason ?? "verification failed",
          command: result.command,
        },
        record: true,
      });
      recoveryHint = ` Last-mile recovery: ${lastMile.recoveryInstruction ?? lastMile.coordinatorInstruction}`;
    } catch {
      verifierHint = "";
      recoveryHint = "";
    }
    appendBrainEvent(cwd, {
      type: "verification-blocked",
      route: routeName,
      stack,
      phase,
      verifier,
      reason: result.reason ?? "verification failed",
    });
    emitBlock(buildTaskCompletedGateReason({
      state,
      phase,
      specDir,
      reason: result.reason,
      command: result.command,
      verifierHint,
      recoveryHint,
    }));
  }
  process.exit(0);
}

// Path 7: top-level safety net. Unexpected throws are non-deterministic hook
// faults, not evidence gaps, so fail open and keep diagnostics off stdout.
main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  logHookError(
    {
      hook: "task-completed-verifier",
      event: "uncaught",
      msg,
      stack: err instanceof Error ? err.stack ?? "" : "",
    },
    err instanceof Error ? err : undefined,
  );
  process.stderr.write("[task-completed-verifier] internal error; failing open\n");
  passThrough();
});
