/**
 * PreToolUse:AskUserQuestion hook — block AskUserQuestion when quick mode is on.
 *
 * Output contract (byte-equal to v6 `quick-mode-guard.sh` baseline, NFR-7):
 *   - Allow path: emit nothing (return undefined). Claude Code's PreToolUse
 *     hook treats empty stdout as implicit allow.
 *   - Deny path: emit only `{hookSpecificOutput:{permissionDecision:"deny"},
 *     systemMessage:"..."}`. This is the exact shape v6 bash produced.
 *
 * Why no top-level `decision` field: Claude Code's PreToolUse hook output
 * schema validates `decision` against `"approve"|"block"` only. Earlier
 * v7.0.0 added `decision:"allow"|"deny"` for "task verify parity"; that
 * tripped schema validation ("(root): Invalid input") and silently blocked
 * AskUserQuestion in normal-mode sessions. Fixed in v7.0.1.
 *
 * Error policy (FR-8): all uncaught errors are funneled through `runHook`,
 * which logs to stderr and exits 0. Hook NEVER blocks the Claude Code session.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runHook } from "./_shared/run-hook.js";
import { resolveCurrent } from "./_shared/path-resolver.js";
import type { CurdxState, DenyDecisionOutput } from "./_shared/types.js";

const QUICK_MODE_REASON =
  "Quick mode active: do NOT ask the user any questions. Make opinionated decisions autonomously. Choose the simplest, most conventional approach.";

const DENY: DenyDecisionOutput = {
  hookSpecificOutput: {
    permissionDecision: "deny",
  },
  systemMessage: QUICK_MODE_REASON,
};

runHook(async (input) => {
  const cwd = input?.cwd;
  if (!cwd) {
    return;
  }

  const specPath = resolveCurrent({ cwd });
  if (!specPath) {
    return;
  }

  const stateFile = join(cwd, specPath, ".curdx-state.json");
  if (!existsSync(stateFile)) {
    return;
  }

  let state: CurdxState;
  try {
    state = JSON.parse(readFileSync(stateFile, "utf8")) as CurdxState;
  } catch {
    return;
  }

  if (state.quickMode === true) {
    return DENY;
  }
  return;
});
