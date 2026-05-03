/**
 * PreToolUse:AskUserQuestion hook — block AskUserQuestion when quick mode is on.
 *
 * Behaviour mirrors v6 `quick-mode-guard.sh` (47 LOC):
 *   1. Read JSON from stdin; need `cwd` field. Missing/empty → exit 0 (allow).
 *   2. Resolve current spec via _shared/path-resolver. No active spec → allow.
 *   3. Read `<cwd>/<specPath>/.curdx-state.json`. Missing → allow.
 *   4. If `quickMode === true`, emit deny JSON; otherwise allow JSON.
 *
 * Output contract (per task 1.12 + design.md "Component Catalog → quick-mode-guard"):
 *   - Deny path emits BOTH the simplified `{decision:"deny",reason}` form AND the
 *     Claude Code native `{hookSpecificOutput:{permissionDecision:"deny"},systemMessage}`
 *     payload. The native fields preserve byte-equal-ish parity with v6 bash output
 *     (NFR-7) so the hook still suppresses AskUserQuestion in real sessions; the
 *     `decision`/`reason` fields satisfy task verify (`JSON.parse` on stdout).
 *   - Allow path emits `{decision:"allow"}`. v6 bash exited 0 silently for allow,
 *     so there is no byte-equal baseline to break.
 *
 * Error policy (FR-8): all uncaught errors are funneled through `runHook`,
 * which logs to stderr and exits 0. Hook NEVER blocks the Claude Code session.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runHook } from "./_shared/run-hook.js";
import { resolveCurrent } from "./_shared/path-resolver.js";
import type {
  AllowDecisionOutput,
  DenyDecisionOutput,
  HookOutput,
} from "./_shared/types.js";

interface CurdxState {
  quickMode?: boolean;
}

const QUICK_MODE_REASON =
  "Quick mode active: do NOT ask the user any questions. Make opinionated decisions autonomously. Choose the simplest, most conventional approach.";

const ALLOW: AllowDecisionOutput = { decision: "allow" };

const DENY: DenyDecisionOutput = {
  decision: "deny",
  reason: QUICK_MODE_REASON,
  hookSpecificOutput: {
    permissionDecision: "deny",
  },
  systemMessage: QUICK_MODE_REASON,
};

runHook(async (input) => {
  const cwd = input?.cwd;
  if (!cwd) {
    return ALLOW;
  }

  // Resolve active spec (uses CURDX_CWD env or process.cwd by default).
  const specPath = resolveCurrent({ cwd });
  if (!specPath) {
    return ALLOW;
  }

  // fs IO — use `path.join` (native sep). `specPath` is posix-form from
  // resolveCurrent; Node's fs APIs accept the mixed separator on Windows.
  // Path policy: see _shared/path-resolver.ts header.
  const stateFile = join(cwd, specPath, ".curdx-state.json");
  if (!existsSync(stateFile)) {
    return ALLOW;
  }

  let state: CurdxState;
  try {
    state = JSON.parse(readFileSync(stateFile, "utf8")) as CurdxState;
  } catch {
    // Malformed state file — treat as no quick-mode signal, allow.
    return ALLOW;
  }

  const out: HookOutput = state.quickMode === true ? DENY : ALLOW;
  return out;
});
