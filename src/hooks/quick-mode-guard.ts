import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runHook } from "./_shared/run-hook.js";
import { resolveCurrent } from "./_shared/path-resolver.js";
import type { CurdxState, DenyDecisionOutput } from "./_shared/types.js";

const QUICK_MODE_REASON =
  "Quick mode active: do NOT ask the user any questions. Make opinionated decisions autonomously. Choose the simplest, most conventional approach.";

const DENY: DenyDecisionOutput = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: QUICK_MODE_REASON,
  },
};

runHook(async (input) => {
  const cwd = input?.cwd;
  if (!cwd) {
    return;
  }

  const specPath = resolveCurrent({ cwd, sessionId: input.session_id });
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
