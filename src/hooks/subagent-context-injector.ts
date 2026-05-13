/**
 * SubagentStart hook — injects compressed spec context + iron-law summary
 * into every dispatched subagent (general-purpose / Explore / custom alike).
 *
 * Behaviour (design.md §Component 2, D2/D3):
 *   1. `runHook` parses stdin envelope (universal hook fields + `agent_type`).
 *   2. Resolve active spec via `_shared/path-resolver.resolveCurrent({cwd})`
 *      — reads `<defaultSpecsDir>/.current-spec`. Missing → fail-open
 *      `{continue:true}` (no injection).
 *   3. Read `<specDir>/.curdx-state.json`. Missing/malformed/throw on parse →
 *      fail-open `{continue:true}` + stderr trace (FR-9, FR-10).
 *   4. `state.completed === true` → fail-open `{continue:true}` (no injection
 *      — open question 5 settled in design: subagent dispatch under completed
 *      spec is a coordinator-side bug, this hook stays out of it).
 *   5. `buildContextPayload(state, specDir, {forSubagent: true})` → compact
 *      CURDX SPEC DATA text block (~200B, NFR-1 ≤ 2KB).
 *   6. Emit `{hookSpecificOutput:{hookEventName:"SubagentStart",
 *      additionalContext:<text>}, continue:true}` (Claude Code wraps the
 *      string in a `<system-reminder>` block — issue #23885 wontfix upstream).
 *
 * Error policy (FR-FailOpen / D2): every step above is wrapped in an inner
 * try/catch that funnels any throw — invalid stdin, fs error, JSON parse
 * failure, payload-over-budget — into `{continue:true}` with a stderr trace.
 * Hook NEVER blocks subagent dispatch.
 *
 * Why an inner try/catch on top of `runHook`'s outer catch: `runHook` already
 * exits 0 on any throw (FR-8), but its uncaught path emits NO stdout JSON.
 * The SubagentStart contract here is more specific — fail-open MUST emit
 * `{continue:true}` so downstream consumers can mech-check "hook fired and
 * deliberately allowed" vs "hook crashed silently". Inner catch makes that
 * distinction explicit.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { runHook } from "./_shared/run-hook.js";
import { resolveCurrent } from "./_shared/path-resolver.js";
import {
  IRON_LAW_SUMMARY,
  buildContextPayload,
} from "./lib/build-context-payload.js";
import type { CurdxState, HookOutput } from "./_shared/types.js";

// Reference IRON_LAW_SUMMARY at module scope to keep tree-shaking honest:
// the constant is part of the public surface contract (drift test imports
// it directly), and a value-side import here documents the dependency
// without affecting payload construction (the lib already inlines it).
void IRON_LAW_SUMMARY;

/**
 * SubagentStart fail-open output. Not part of the shared `HookOutput` union
 * (defined in `_shared/types.ts`) because that union currently models only
 * the three pre-existing hook shapes (SessionStart context block, PreToolUse
 * deny decision, Stop block decision). We keep the new shape local to this
 * hook to avoid expanding the shared types surface for a single call site;
 * the cast at the return boundary is documented by this interface.
 */
interface SubagentInjectionOutput {
  hookSpecificOutput: {
    hookEventName: "SubagentStart";
    additionalContext: string;
  };
  continue: true;
}

/** Plain `{continue:true}` — fail-open output with no injection. */
interface SubagentContinueOutput {
  continue: true;
}

const FAIL_OPEN: SubagentContinueOutput = { continue: true };

runHook(async (input) => {
  try {
    // Only react to SubagentStart events. If the hook is wired into a
    // different event by misconfiguration, fail open silently — never
    // poison an unrelated event with subagent context.
    const eventName = input?.hook_event_name;
    if (typeof eventName === "string" && eventName !== "SubagentStart") {
      return FAIL_OPEN as unknown as HookOutput;
    }

    const cwd = input?.cwd;
    if (typeof cwd !== "string" || cwd.length === 0) {
      return FAIL_OPEN as unknown as HookOutput;
    }

    // Resolve `<defaultSpecsDir>/.current-spec`. Returns POSIX-form serialized
    // spec path; we re-anchor with `path.join` for fs reads (Node tolerates
    // mixed seps on Windows — see path-resolver.ts contract).
    const specPath = resolveCurrent({ cwd, sessionId: input.session_id });
    if (!specPath) {
      return FAIL_OPEN as unknown as HookOutput;
    }

    const specDirFs = join(cwd, specPath);
    const stateFile = join(specDirFs, ".curdx-state.json");
    if (!existsSync(stateFile)) {
      return FAIL_OPEN as unknown as HookOutput;
    }

    let state: CurdxState;
    try {
      state = JSON.parse(readFileSync(stateFile, "utf8")) as CurdxState;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(
        `[subagent-context-injector] state parse failed: ${msg}\n`,
      );
      return FAIL_OPEN as unknown as HookOutput;
    }

    // Completed spec → no injection. Coordinator should not dispatch
    // subagents under a completed spec; if it does, this hook stays silent.
    if (state.completed === true) {
      return FAIL_OPEN as unknown as HookOutput;
    }

    // Build compact CURDX SPEC DATA text block. We pass the original
    // POSIX-form `specPath` (not the local fs join) so the payload is byte-
    // stable across platforms — matches lib's "specDir is serialized form"
    // contract used by the SessionStart payload as well.
    const additionalContext = buildContextPayload(state, specPath, {
      forSubagent: true,
    });

    const out: SubagentInjectionOutput = {
      hookSpecificOutput: {
        hookEventName: "SubagentStart",
        additionalContext,
      },
      continue: true,
    };
    return out as unknown as HookOutput;
  } catch (e) {
    // Any throw from the lib (PayloadOverBudgetError, unexpected) or fs
    // surface lands here. FR-FailOpen: emit {continue:true} with stderr
    // trace, never block dispatch.
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[subagent-context-injector] ${msg}\n`);
    return FAIL_OPEN as unknown as HookOutput;
  }
});
