// src/hooks/lib/verify-blocks.ts
//
// Shared verification-block evaluator for the iron-law gate.
// Single source of truth referenced from 4 distinct call sites
// (Stop hook, TaskCompleted hook, npm verify gate, `curdx-flow check` CLI),
// per design.md §Components 3 / D3.
//
// Phase 2: `walkSrcTree` is now a real recursive walker (Task 2.1) — used
// downstream by the stale-mtime gate (Task 2.2 / 2.3). `verifyPhaseBlock`
// itself still only consults the "missing" / "failed" branches; the
// stale-mtime branch is wired into it in Task 2.3.
//
// Departure from `lib/README.md` "CLI surface only" invariant: this lib is
// imported as a TypeScript module rather than invoked as a child `node`
// process — required by D3 (single-truth code path across 4 callers).
// Build pipeline still emits `plugins/curdx-flow/hooks/scripts/lib/verify-blocks.mjs`
// for any future CLI wrapper.
//
// Spec: specs/spec-verification-iron-law/design.md § Components 3
// "verify-blocks shared lib".

import { promises as fs } from "node:fs";
import { join } from "node:path";

import type { CurdxState, VerificationPhase } from "../_shared/types.ts";

/**
 * Directory names skipped during `walkSrcTree`. These are either VCS / package
 * artifacts (`.git`, `node_modules`, `dist`) or curdx-flow's own runtime trees
 * (`.curdx`, `.claude`) which would otherwise dominate the mtime calculation
 * and make stale-detection meaningless.
 */
const WALK_SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  ".curdx",
  ".claude",
]);

/**
 * Recursion depth cap for `walkSrcTree`. Spec dirs and `src/**` are flat in
 * practice; 6 levels is enough headroom while bounding worst-case I/O on
 * accidental traversal into a deep tree.
 */
const WALK_MAX_DEPTH = 6;

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
 * Recursively walk `dir` and return the maximum file `mtimeMs` (epoch ms)
 * across every regular file reachable within `WALK_MAX_DEPTH` levels.
 *
 * Used by the stale-mtime branch of the iron-law gate (Task 2.2 / 2.3) —
 * compare against `verificationBlocks[phase].srcMtime` to detect that the
 * source tree has been edited since the recorded verification, in which
 * case the gate must demand a fresh `Verify` run.
 *
 * Behavior:
 *  - Directories whose basename is in `WALK_SKIP_DIRS` are pruned
 *    (`.git`, `node_modules`, `dist`, `.curdx`, `.claude`).
 *  - Depth is measured from `dir` (depth 0). At `WALK_MAX_DEPTH` we still
 *    stat the entries at that level but do not descend further.
 *  - Path joins go through `path.join` for cross-platform safety (AC-7.2).
 *  - Per-entry `readdir` / `stat` failures are swallowed and treated as
 *    contributing 0 to the running max — the walker never throws; FR-8
 *    "never block the session" applies to all 4 callers.
 *  - Empty trees (no files reachable, or every subdir filtered) → return 0.
 *    This makes the downstream stale check fall back to "block exists ⇒ ok"
 *    semantics rather than spuriously failing on a brand-new spec dir.
 *  - Symlinks: `readdir`'s `Dirent` flags from a symlink only mark it as
 *    a symlink (not a directory), so they are treated as files; their
 *    target's `mtimeMs` is read via `stat` (follows the link). This is
 *    intentional — drift in linked sources should still trigger staleness.
 */
export async function walkSrcTree(dir: string): Promise<number> {
  let maxMtime = 0;

  async function walk(current: string, depth: number): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = join(current, entry.name);
      if (entry.isDirectory()) {
        if (WALK_SKIP_DIRS.has(entry.name)) continue;
        if (depth >= WALK_MAX_DEPTH) continue;
        await walk(abs, depth + 1);
        continue;
      }
      // Treat anything non-directory (regular file, symlink, etc.) as a
      // file for mtime purposes. `stat` follows symlinks.
      try {
        const st = await fs.stat(abs);
        if (st.mtimeMs > maxMtime) maxMtime = st.mtimeMs;
      } catch {
        // ignore unreadable entry, contribute 0
      }
    }
  }

  await walk(dir, 0);
  return maxMtime;
}
