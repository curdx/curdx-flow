/**
 * Shared hook envelope types — extracted from inline declarations in
 * load-spec-context.ts, quick-mode-guard.ts, stop-watcher.ts, update-spec-index.ts
 * (per task 2.1). Source of truth: Anthropic hook spec + design.md
 * "Stdin/Stdout Contract".
 *
 * Design choice: a single permissive `HookStdin` interface with all observed
 * fields optional, plus a discriminated `HookOutput` union covering the three
 * actual emitted shapes (context block | permission decision | stop block).
 *
 * Rationale: we keep `HookStdin` permissive because Claude Code's hook
 * envelope evolves and we tolerate unknown fields (FR-8: never block the
 * session). Output is a tagged union because each emit-site knows exactly
 * which shape it produces; readers benefit from `decision` discrimination.
 *
 * No behavior change from extraction — every field below mirrors what the
 * 4 hooks already declared inline.
 */

/**
 * Decision tags emitted by hooks.
 *  - `allow` / `deny`  : PreToolUse permission decisions (quick-mode-guard).
 *  - `block`           : Stop hook continuation (stop-watcher).
 *
 * Matches Anthropic's PermissionDecision plus Stop's `block` verb.
 */
export type HookDecision = "allow" | "deny" | "block";

/**
 * Hook stdin envelope — superset of fields observed across the 4 hooks.
 *
 *  - `cwd`               : SessionStart, PreToolUse, Stop (all use it).
 *  - `transcript_path`   : Stop only (path to JSONL transcript).
 *  - `stop_hook_active`  : Stop only (re-invocation guard).
 *
 * Permissive by design: unknown fields are ignored, missing fields fall back
 * to safe defaults at each call site. Per FR-8, hooks never throw on
 * malformed input — they exit 0 silently.
 */
export interface HookStdin {
  cwd?: string;
  transcript_path?: string;
  stop_hook_active?: boolean;
}

/**
 * SessionStart context block emitted on stdout by load-spec-context.
 * Consumers (and the task verify pipeline) parse this with `JSON.parse`.
 */
export interface ContextBlockOutput {
  active: boolean;
  specName?: string;
  specPath?: string;
  phase?: string;
  taskIndex?: number;
  totalTasks?: number;
  awaitingApproval?: boolean;
  goal?: string;
}

/**
 * PreToolUse permission decision (allow path) — emitted by quick-mode-guard
 * when AskUserQuestion is permitted.
 */
export interface AllowDecisionOutput {
  decision: "allow";
}

/**
 * PreToolUse permission decision (deny path) — emitted by quick-mode-guard
 * when quick mode is active. Carries both the simplified `decision`/`reason`
 * shape AND Claude Code's native `hookSpecificOutput` payload for
 * byte-equal-ish parity with the v6 bash baseline.
 */
export interface DenyDecisionOutput {
  decision: "deny";
  reason: string;
  hookSpecificOutput: {
    permissionDecision: "deny";
  };
  systemMessage: string;
}

/**
 * Stop hook block decision — emitted by stop-watcher to keep the loop alive
 * (continuation, quick-mode hold, corrupt-state recovery, unchecked-tasks
 * gate).
 */
export interface BlockDecisionOutput {
  decision: "block";
  reason: string;
  systemMessage: string;
}

/**
 * Tagged union of every JSON shape any curdx-flow hook emits on stdout.
 * Each emit-site narrows to one variant via the `decision`/`active` tag.
 */
export type HookOutput =
  | ContextBlockOutput
  | AllowDecisionOutput
  | DenyDecisionOutput
  | BlockDecisionOutput;
