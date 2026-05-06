// src/hooks/lib/verify-blocks.ts
//
// Shared verification-block evaluator for the iron-law gate.
// Single source of truth referenced from 4 distinct call sites
// (Stop hook, TaskCompleted hook, npm verify gate, `curdx-flow check` CLI),
// per design.md §Components 3 / D3.
//
// Phase 1 (POC) skeleton — only the "missing block" branch is load-bearing
// for the Stop-hook gate (Task 1.6). Stale-mtime detection and the full
// `walkSrcTree` implementation are deferred to Phase 2 (Task 2.1).
//
// Departure from `lib/README.md` "CLI surface only" invariant: this lib is
// imported as a TypeScript module rather than invoked as a child `node`
// process — required by D3 (single-truth code path across 4 callers).
// Build pipeline still emits `plugins/curdx-flow/hooks/scripts/lib/verify-blocks.mjs`
// for any future CLI wrapper.
//
// Spec: specs/spec-verification-iron-law/design.md § Components 3
// "verify-blocks shared lib".

import type { CurdxState, VerificationPhase } from "../_shared/types.ts";

/**
 * Outcome of evaluating a phase's verification block.
 *
 *  - `ok: true`            → block exists and `exitCode === 0` (gate passes).
 *  - `ok: false`           → either no block recorded for this phase, or the
 *                            recorded block carries a non-zero exit. Callers
 *                            surface `reason` + `command` in the user-visible
 *                            block message so the user knows the exact
 *                            command line to re-run.
 *
 * `reason` and `command` are optional in the success branch and always
 * populated in the failure branch.
 */
export interface VerifyPhaseBlockResult {
  ok: boolean;
  reason?: string;
  command?: string;
}

/**
 * Evaluate the verification block recorded for `phase` on `state`.
 *
 * Phase-1 semantics (stale-mtime check deferred to Phase 2):
 *   1. No block recorded            → `{ok: false, reason: "missing", command: ""}`
 *   2. Block exists, `exitCode !== 0` → `{ok: false, reason: failedReason ?? "verification failed", command: block.command}`
 *   3. Block exists, `exitCode === 0` → `{ok: true}`
 *
 * `specDir` is reserved for the Phase-2 stale-mtime branch (where it will
 * be passed through to `walkSrcTree`); accepting it now keeps the call
 * signature stable across the POC → full-impl boundary.
 */
export function verifyPhaseBlock(
  state: CurdxState,
  phase: VerificationPhase,
  specDir: string,
): VerifyPhaseBlockResult {
  // `specDir` is intentionally unused in the POC — Phase 2 will consume it
  // for `walkSrcTree(specDir)` stale detection. Touch it to keep TS strict
  // happy under future `noUnusedParameters` without renaming the public
  // signature.
  void specDir;

  const block = state.verificationBlocks?.[phase];
  if (block === undefined) {
    return { ok: false, reason: "missing", command: "" };
  }
  if (block.exitCode !== 0) {
    return {
      ok: false,
      reason: block.failedReason ?? "verification failed",
      command: block.command,
    };
  }
  return { ok: true };
}

/**
 * Phase-1 stub. Phase 2 (Task 2.1) will replace the body with a real
 * recursive walk of `dir` that returns the maximum mtime (epoch ms) of
 * any source artifact under it, used to detect drift between the recorded
 * `srcMtime` and the current tree state.
 *
 * Returning `Date.now()` is intentional: it makes any current call site
 * conservatively treat the tree as "just touched", which is acceptable
 * for the POC since `verifyPhaseBlock` does not yet consult this value.
 */
export async function walkSrcTree(dir: string): Promise<number> {
  void dir;
  return Date.now();
}
