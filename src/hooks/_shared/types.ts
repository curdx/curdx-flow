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
 *
 * NOTE: types-only module, no runtime exports. All declarations below are
 * `export interface` / `export type` only and are erased at compile time
 * (esbuild ESM bundling drops type-only imports — see design.md §6 K-2).
 */

/**
 * Decision tags emitted by hooks at the top-level `decision` field.
 *  - `block` : Stop hook continuation (stop-watcher).
 *
 * Note: PreToolUse permission decisions (quick-mode-guard) do NOT use the
 * top-level `decision` field — Claude Code's schema rejects values other
 * than `"approve"|"block"` there. Allow path emits nothing; deny path uses
 * the `hookSpecificOutput.permissionDecision` shape only.
 */
export type HookDecision = "block";

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
  /**
   * Phase 2 Task 2.3 (FR-10): Claude Code 2.x exposes these on PreToolUse /
   * Stop / SessionStart payloads. Hooks can plumb them into error-logger
   * context for richer R-9 fuzzy-join keys when both jsonl and errors.jsonl
   * carry the same incident.
   */
  session_id?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_use_id?: string;
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
 * PreToolUse permission decision (deny path) — emitted by quick-mode-guard
 * when quick mode is active. Byte-equal to v6 bash baseline (NFR-7).
 *
 * Allow path is intentionally absent from this union: per v6 contract and
 * Claude Code's PreToolUse schema, allow = empty stdout (no JSON).
 */
export interface DenyDecisionOutput {
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
 *
 * Note: quick-mode-guard's allow path emits NOTHING (handler returns void),
 * so it has no entry in this union. Only the deny path produces JSON.
 */
export type HookOutput =
  | ContextBlockOutput
  | DenyDecisionOutput
  | BlockDecisionOutput;

/**
 * Spec phase identifier used as the key for verification block records.
 * Five canonical phases that produce verifiable artifacts (per design D2).
 */
export type VerificationPhase =
  | "research"
  | "requirements"
  | "design"
  | "tasks"
  | "execution";

/**
 * Reviewer verdict persisted as a peer-field on a `VerificationBlock` (D3).
 *
 * Two-stage review (spec-two-stage-review) runs spec-compliance and
 * code-quality reviewers at phase boundaries; each emits one of these
 * records into `VerificationBlock.reviews.{specCompliance|codeQuality}`.
 *
 *  - `verdict`     : "pass" | "fail" | "advisory"
 *                    "advisory" surfaces findings without blocking (used by
 *                    code-quality reviewer in QuickMode bypass per FR-M2 —
 *                    spec-compliance remains a hard gate, code-quality
 *                    degrades to advisory only).
 *  - `findings`    : reviewer notes (one per concern). Empty array on pass
 *                    is allowed; `fail`/`advisory` should populate ≥1 entry
 *                    so downstream tooling can render rationale.
 *  - `reviewerId`  : agent identifier (e.g. `spec-reviewer`,
 *                    `code-quality-reviewer`). Used by drift tests to
 *                    confirm domain ownership.
 *  - `timestamp`   : ISO-8601 instant the verdict was recorded.
 */
export interface ReviewVerdict {
  verdict: "pass" | "fail" | "advisory";
  findings: string[];
  reviewerId: string;
  timestamp: string;
}

/**
 * Verification record persisted on `CurdxState.verificationBlocks[phase]`.
 *
 * Captures the outcome of running a phase's `Verify` command (per design
 * §Components 3). Required fields establish the iron-law evidence:
 *  - `command`     : exact command line that was executed
 *  - `exitCode`    : process exit status (0 = pass, non-zero = fail)
 *  - `timestamp`   : ISO-8601 instant the verification was recorded
 *  - `srcMtime`    : mtime (epoch ms) of the verified source artifact, used
 *                    by downstream gates to detect drift between recorded
 *                    verification and post-edit content.
 *
 * Optional fields enrich the record without being load-bearing for gating:
 *  - `description`  : human-readable summary of what was checked
 *  - `failedReason` : populated only when `exitCode !== 0`
 *  - `reviews`      : two-stage review verdicts (spec-two-stage-review D3) —
 *                     keyed-object shape isomorphic to the parent
 *                     `verificationBlocks` map; O(1) lookup, no semantic key
 *                     loss vs an array of `{reviewerId,...}` entries.
 *                     Both sub-fields optional for backwards-compat with
 *                     pre-two-stage-review states.
 */
export interface VerificationBlock {
  command: string;
  exitCode: number;
  timestamp: string;
  srcMtime: number;
  description?: string;
  failedReason?: string;
  reviews?: {
    specCompliance?: ReviewVerdict;
    codeQuality?: ReviewVerdict;
  };
}

/**
 * Per-spec runtime state, persisted at `<basePath>/.curdx-state.json`.
 *
 * Single source of truth for the 4 readers (load-spec-context,
 * quick-mode-guard, stop-watcher, update-spec-index) — replaces the inline
 * `interface CurdxState` copies that previously existed in each hook
 * (per design.md §1, K-2; FR-12 same-name constraint auto-satisfied via
 * shared module). esbuild bundling collapses these `import type` references
 * to zero runtime cost.
 *
 * All fields optional — readers must tolerate v7.0.x states that lack
 * `completed` / `completedAt` and treat `completed === undefined` as
 * in-progress (NFR-2 backwards-compat). All consumers use strict
 * `state.completed === true` equality, never truthiness.
 *
 * NOTE: this interface is for hook readers. Writers (coordinator /
 * `commands/implement.md` via `merge-state.mjs`) are not type-checked
 * against this — the persistent schema lives in
 * `plugins/curdx-flow/schemas/spec.schema.json`.
 */
export interface CurdxState {
  // identity
  source?: "spec" | "plan" | "direct";
  name?: string;
  basePath?: string;
  phase?: string;
  // ephemeral / loop control
  taskIndex?: number;
  totalTasks?: number;
  taskIteration?: number;
  maxTaskIterations?: number;
  globalIteration?: number;
  maxGlobalIterations?: number;
  awaitingApproval?: boolean;
  recoveryMode?: boolean;
  nativeSyncEnabled?: boolean;
  // mode
  quickMode?: boolean;
  granularity?: "auto" | "fine" | "standard" | "coarse";
  autoPolicy?: {
    version?: 1;
    mode?: "auto" | "fast" | "deep";
    size?: "XS" | "S" | "M" | "L" | "XL";
    risk?: "low" | "medium" | "high" | "critical";
    executionMode?: "direct" | "spec-lite" | "standard" | "deep-spec" | "epic-triage";
    taskGranularity?: "none" | "coarse" | "standard" | "fine";
    taskTargetRange?: { min?: number; max?: number };
    reviewCadence?: "minimal" | "final" | "periodic" | "strict";
    verificationLevel?: "targeted" | "standard" | "strict";
    subagentPolicy?: "none" | "on-demand" | "per-slice";
    stopHookPolicy?: "disabled" | "short-continuation" | "full-loop";
    maxGlobalIterations?: number;
    maxTaskIterations?: number;
    shouldSplitSpec?: boolean;
    reasons?: string[];
  };
  epicName?: string;
  // verification iron-law (design D2): per-phase Verify command outcomes
  verificationBlocks?: Partial<Record<VerificationPhase, VerificationBlock>>;
  // completion marker (v7.1.0)
  completed?: boolean;
  completedAt?: string;
}
