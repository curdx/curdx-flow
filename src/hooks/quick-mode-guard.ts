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
 * Error policy: any thrown error → console.error + process.exit(0). Never block
 * the Claude Code session (FR-8).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { readStdinJson } from "./_shared/stdin.js";
import { resolveCurrent } from "./_shared/path-resolver.js";
import type {
  AllowDecisionOutput,
  DenyDecisionOutput,
  HookOutput,
  HookStdin,
} from "./_shared/types.js";

interface CurdxState {
  quickMode?: boolean;
}

const QUICK_MODE_REASON =
  "Quick mode active: do NOT ask the user any questions. Make opinionated decisions autonomously. Choose the simplest, most conventional approach.";

function emitAllow(): void {
  const payload: AllowDecisionOutput = { decision: "allow" };
  const out: HookOutput = payload;
  process.stdout.write(JSON.stringify(out) + "\n");
  process.exit(0);
}

function emitDeny(): void {
  const payload: DenyDecisionOutput = {
    decision: "deny",
    reason: QUICK_MODE_REASON,
    hookSpecificOutput: {
      permissionDecision: "deny",
    },
    systemMessage: QUICK_MODE_REASON,
  };
  const out: HookOutput = payload;
  process.stdout.write(JSON.stringify(out) + "\n");
  process.exit(0);
}

async function main(): Promise<void> {
  const input = await readStdinJson<HookStdin>();
  const cwd = input?.cwd;
  if (!cwd) {
    emitAllow();
    return;
  }

  // Resolve active spec (uses CURDX_CWD env or process.cwd by default).
  const specPath = resolveCurrent({ cwd });
  if (!specPath) {
    emitAllow();
    return;
  }

  // path.join handles both absolute and relative spec paths correctly.
  const stateFile = join(cwd, specPath, ".curdx-state.json");
  if (!existsSync(stateFile)) {
    emitAllow();
    return;
  }

  let state: CurdxState;
  try {
    state = JSON.parse(readFileSync(stateFile, "utf8")) as CurdxState;
  } catch {
    // Malformed state file — treat as no quick-mode signal, allow.
    emitAllow();
    return;
  }

  if (state.quickMode === true) {
    emitDeny();
    return;
  }
  emitAllow();
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[quick-mode-guard] error: ${msg}\n`);
  // Never block the session — exit 0 even on unexpected errors.
  process.exit(0);
});
