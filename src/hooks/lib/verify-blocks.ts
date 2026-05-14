// src/hooks/lib/verify-blocks.ts
//
// Shared verification-block evaluator for the iron-law gate.
// Single source of truth referenced from 4 distinct call sites
// (Stop hook, TaskCompleted hook, npm verify gate, `curdx-flow check` CLI),
// per design.md §Components 3 / D3.
//
// Phase 2: `walkSrcTree` is now a real recursive walker (Task 2.1) and
// `verifyPhaseBlock` is async (Task 2.2). Stale-detection is wired in:
// after the exitCode check, the function awaits `walkSrcTree(specDir)`
// (per design.md sequence-diagram L324, which mandates the FS scan as
// part of the gate's side-effect surface) and then evaluates the
// canonical comparison `block.srcMtime > Date.parse(block.timestamp)`
// (design.md §Components 1 step-3, error table L355). The remaining
// error-message-format polish lands in Task 2.3.
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
import { basename, join } from "node:path";

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
 * Canonical list of phases the iron-law gate evaluates. Single source of truth
 * for callers (Stop hook, TaskCompleted hook) that need to decide whether a
 * raw `state.phase` string is a known verification phase before invoking
 * `verifyPhaseBlock`.
 *
 * `check-verification-blocks.ts` keeps its own copy because that file is
 * imported by both the npm verify gate and the `curdx-flow check` CLI and we
 * want minimal coupling across the two iron-law subsystems; a future cleanup
 * can fold them together once the CLI surface stabilizes.
 */
export const VERIFICATION_PHASES: ReadonlyArray<VerificationPhase> = [
  "research",
  "requirements",
  "design",
  "tasks",
  "execution",
];

/**
 * Coerce a state's `phase` field to a typed `VerificationPhase`, or return
 * `null` when the phase is missing / non-string / not a known phase.
 *
 * Both hook callers (Stop, TaskCompleted) need this exact shape: read
 * `state.phase`, defend against `phase: "unknown"` legacy states (FR-8 fail-
 * open), and only proceed to `verifyPhaseBlock` when the phase is one of the
 * five canonical values. Callers diverge on what to DO when the phase isn't
 * known (Stop: silently fall through; TaskCompleted: pass-through with
 * `{continue: true}`), so this helper just returns the typed phase or null
 * and lets each caller pick its own branch.
 */
export function getVerificationPhase(
  state: CurdxState,
): VerificationPhase | null {
  const raw = typeof state.phase === "string" ? state.phase : "";
  if (!(VERIFICATION_PHASES as ReadonlyArray<string>).includes(raw)) {
    return null;
  }
  return raw as VerificationPhase;
}

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
 * Phase-2 semantics (stale-mtime now wired):
 *   1. No block recorded            → `{ok: false, reason: "missing", command: ""}`
 *   2. Block exists, `exitCode !== 0` → `{ok: false, reason: failedReason ?? "verification failed", command: block.command}`
 *   3. Block exists, `block.srcMtime > Date.parse(block.timestamp)` → stale
 *      `{ok: false, reason: "Phase '<phase>' stale evidence: src changed at <iso>, last verified at <ts>. Re-run: <cmd>. Spec: <specName>.", command: block.command}`
 *   4. Block exists, otherwise      → `{ok: true}`
 *
 * The comparison uses ms-vs-ms (AC-7.3): `block.srcMtime` is already epoch
 * ms, and `Date.parse(block.timestamp)` returns epoch ms. No `/1000`
 * conversion. Per design.md §Components 1 step-3 + error table L355.
 *
 * `specDir` is consumed here: `walkSrcTree(specDir)` is invoked after the
 * exitCode check per design.md sequence-diagram L324 (the gate's mandated
 * FS-scan side-effect). Its return is intentionally not used in the
 * comparison expression — the canonical staleness check is the literal
 * `block.srcMtime > Date.parse(block.timestamp)` form (design L179, L355,
 * tasks.md Task 2.2 step-2). Future tasks may refine the comparison to
 * fold in the live `maxSrcMtime`; see design.md L329.
 *
 * NFR-3 (Task 4.2): the stale message embeds all 3 mandated fields —
 * phase id (`Phase '<phase>'`), fix command (`Re-run: <cmd>`), and spec
 * context (`Spec: <specName>`). The basename of `specDir` is used so
 * that downstream callers (Stop hook, TaskCompleted hook, CLI) get the
 * same human-recognizable identifier without further plumbing. The
 * `missing` and `failed` reasons remain short tokens — stop-watcher's
 * `buildVerificationBlockFailDecision` is the single point that wraps
 * them with phase + spec context for user display, since the malformed
 * branch lives in stop-watcher.ts only.
 */
export async function verifyPhaseBlock(
  state: CurdxState,
  phase: VerificationPhase,
  specDir: string,
): Promise<VerifyPhaseBlockResult> {
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
  // Mandated FS-scan (design L324): walk the spec dir to compute the
  // current max mtime. Awaited per task spec — bound to a void sink so
  // the side-effect runs but is intentionally not consumed in the
  // comparison below (the canonical stale check uses block.srcMtime
  // directly, which merge-state populates with walkSrcTree's value at
  // block-write time).
  void (await walkSrcTree(specDir));
  if (block.srcMtime > Date.parse(block.timestamp)) {
    const srcIso = new Date(block.srcMtime).toISOString();
    // NFR-3: phase id + fix command + spec context all embedded in one
    // line so passthrough to stop-watcher / task-completed-verifier
    // surfaces a fully actionable message without further wrapping.
    // Wording keeps the leading literal "Stale evidence" so the canonical
    // matcher `^Stale evidence` (in stop-watcher / e2e tests) still fires.
    const specName = basename(specDir);
    return {
      ok: false,
      reason: `Stale evidence for phase '${phase}': src changed at ${srcIso}, last verified at ${block.timestamp}. Re-run: ${block.command}. Spec: ${specName}.`,
      command: block.command,
    };
  }
  // Task-level granularity (v7.2.0): when an execution-phase block was
  // recorded against a specific `taskIndex`, refuse to let it gate a later
  // task. This closes the phase-level loophole where evidence from task N
  // could pass task N+1 if N+1 happened not to touch any source files
  // (e.g. a docs-only or wrap-up task). Backwards-compat: legacy blocks
  // without `taskIndex` are accepted unchanged.
  if (phase === "execution" && typeof block.taskIndex === "number") {
    const currentTaskIndex = typeof state.taskIndex === "number" ? state.taskIndex : 0;
    if (block.taskIndex !== currentTaskIndex) {
      const specName = basename(specDir);
      return {
        ok: false,
        reason: `Stale evidence for phase 'execution': block recorded against task index ${block.taskIndex}, current task index is ${currentTaskIndex}. Re-run: ${block.command}. Spec: ${specName}.`,
        command: block.command,
      };
    }
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
