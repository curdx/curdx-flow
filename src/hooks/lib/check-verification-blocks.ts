// src/hooks/lib/check-verification-blocks.ts
//
// Shared library for the verificationBlocks gate (release-time + CLI).
// Single source of truth for the verificationBlocks evaluation called from:
//   1. `scripts/check-verification-blocks.mjs` — npm verify chain (D3 hybrid).
//   2. `src/flows/check.ts` — `npx @curdx/flow check` CLI subcommand
//      (Task 2.23/2.24).
//
// The `verifyPhaseBlock` lib in `src/hooks/lib/verify-blocks.ts` powers the
// per-phase evaluator used by the in-process Stop / TaskCompleted hooks.
// This file is a thin wrapper that adds:
//   - active-spec resolution (specs/.current-spec → latest-mtime fallback),
//   - state-file load + parse,
//   - permissive "no verificationBlocks field at all" branch (initial state),
//   - per-phase walk + multi-failure aggregation, and
//   - human-readable error message production for stderr.
//
// Why a separate lib instead of importing verify-blocks.ts directly?
// The release-time gate must work even when verifyPhaseBlock's mandated
// FS-scan side-effect (walkSrcTree) is unwanted (no spec dir on disk for
// non-spec repos / CI). It also aggregates failures across phases rather
// than short-circuiting on the first one — useful for users who want to
// see every stale/failed block in a single run.
//
// Behavior mirrors `scripts/check-verification-blocks.mjs` (Task 2.20)
// verbatim, with one functional addition: the script's `process.env`
// opt-out (`CURDX_VERIFY_SKIP_BLOCKS=1`) is honored here too so callers
// have a single escape hatch.
//
// Spec: specs/spec-verification-iron-law/tasks.md Task 2.23
//        specs/spec-verification-iron-law/design.md §Component 7 (D3)

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

import type { VerificationPhase } from "../_shared/types.ts";

const VERIFICATION_PHASES: ReadonlyArray<VerificationPhase> = [
  "research",
  "requirements",
  "design",
  "tasks",
  "execution",
];

/**
 * Outcome of `runVerificationCheck`. The `code` field is the exit code the
 * CLI / script should produce (0 pass, 2 fail). `message` is the rendered
 * stdout (on pass) or stderr (on fail) blob the caller should write.
 *
 * `skipped` is true when the gate took a graceful no-op branch (no spec dir
 * found, env opt-out, or initial-state with absent `verificationBlocks`
 * field). Callers may distinguish `ok && skipped` from `ok && !skipped`
 * for telemetry, but both should still exit 0.
 */
export interface VerificationCheckResult {
  ok: boolean;
  code: 0 | 2;
  message: string;
  skipped?: boolean;
  specDir?: string;
}

/**
 * Options for `runVerificationCheck`. `repoRoot` is the directory under which
 * to look for `specs/` (defaults to `process.cwd()`). `env` is the env-var
 * map (defaults to `process.env`).
 */
export interface RunVerificationCheckOptions {
  repoRoot?: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Run the verificationBlocks gate.
 *
 * Resolution order for the active spec (mirrors `check-verification-blocks.mjs`):
 *   (a) `specs/.current-spec` pointer file — read trimmed, must reference a
 *       sub-dir that contains `.curdx-state.json`.
 *   (b) Else: latest-mtime sub-dir under `specs/` whose `.curdx-state.json`
 *       file exists. Skips dot-prefixed and underscore-prefixed dirs.
 *   (c) Else: graceful no-op `{ok: true, code: 0, skipped: true}`.
 *
 * After a spec is resolved, the env-var opt-out
 * (`CURDX_VERIFY_SKIP_BLOCKS=1`) is honored — also a graceful no-op.
 *
 * If `state.verificationBlocks === undefined` (the field is wholly absent),
 * the gate treats it as "initial state, predates iron-law" and exits 0.
 * If the field is present but empty `{}`, the gate fails (exitCode 2):
 * someone wiped the blocks but kept the field — that is a regression.
 *
 * For each present phase block, the gate enforces:
 *   - phase key must be one of `VERIFICATION_PHASES`,
 *   - `block` must be an object,
 *   - `block.exitCode === 0`,
 *   - `Date.parse(block.timestamp)` is finite,
 *   - `block.srcMtime` is a non-negative finite number,
 *   - `Date.parse(block.timestamp) >= block.srcMtime` (verification ran
 *     after the last src edit). Equivalent to verify-blocks.ts's canonical
 *     `block.srcMtime > Date.parse(block.timestamp)` negated.
 *
 * Aggregates all failures into a single stderr blob so users see every
 * problem in one run, not one-at-a-time.
 */
export async function runVerificationCheck(
  opts: RunVerificationCheckOptions = {},
): Promise<VerificationCheckResult> {
  const repoRoot = opts.repoRoot ?? process.cwd();
  const env = opts.env ?? process.env;
  const specsDir = path.join(repoRoot, "specs");

  const specDir = resolveActiveSpecDir(specsDir);
  if (!specDir) {
    return {
      ok: true,
      code: 0,
      skipped: true,
      message: "check-verification-blocks: no active spec found, skipping.\n",
    };
  }

  if (env.CURDX_VERIFY_SKIP_BLOCKS === "1") {
    return {
      ok: true,
      code: 0,
      skipped: true,
      specDir,
      message:
        "[check-verification-blocks] CURDX_VERIFY_SKIP_BLOCKS=1 — skipping gate.\n",
    };
  }

  const stateFile = path.join(specDir, ".curdx-state.json");
  let state: unknown;
  try {
    state = JSON.parse(readFileSync(stateFile, "utf8"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: 2,
      specDir,
      message: `✗ failed to read ${path.relative(repoRoot, stateFile)}: ${msg}\n`,
    };
  }

  // Initial-state permissive branch: field entirely ABSENT → no-op exit 0.
  // Distinct from "field present but empty {}" which trips the gate.
  if (
    typeof state !== "object" ||
    state === null ||
    !("verificationBlocks" in state)
  ) {
    const rel = path.relative(repoRoot, specDir);
    return {
      ok: true,
      code: 0,
      skipped: true,
      specDir,
      message:
        `[check-verification-blocks] No verificationBlocks defined — skipping (treat as initial state)\n` +
        `  Active spec: ${rel}\n`,
    };
  }

  const blocks = (state as { verificationBlocks?: unknown })
    .verificationBlocks;
  const blocksObj =
    blocks && typeof blocks === "object" && !Array.isArray(blocks)
      ? (blocks as Record<string, unknown>)
      : null;
  const presentPhases = blocksObj
    ? Object.keys(blocksObj).filter(
        (p) => blocksObj[p] !== undefined && blocksObj[p] !== null,
      )
    : [];

  if (!blocksObj || presentPhases.length === 0) {
    const rel = path.relative(repoRoot, specDir);
    return {
      ok: false,
      code: 2,
      specDir,
      message:
        "✗ No verificationBlocks found. Run the appropriate phase verification command.\n" +
        `  Active spec: ${rel}\n` +
        "  Hint: each phase must record an entry in .curdx-state.json::verificationBlocks\n" +
        "        (see plugins/curdx-flow/references/iron-law-verification.md).\n",
    };
  }

  interface Failure {
    phase: string;
    reason: string;
    command: string;
  }
  const failures: Failure[] = [];

  for (const phase of presentPhases) {
    if (!(VERIFICATION_PHASES as ReadonlyArray<string>).includes(phase)) {
      failures.push({
        phase,
        reason: `unknown phase key "${phase}"`,
        command: "(remove from state)",
      });
      continue;
    }
    const raw = blocksObj[phase];
    if (typeof raw !== "object" || raw === null) {
      failures.push({
        phase,
        reason: "block is not an object",
        command: "(rewrite block)",
      });
      continue;
    }
    const block = raw as Record<string, unknown>;
    const command =
      typeof block.command === "string" ? block.command : "(unknown command)";
    const exitCode = block.exitCode;
    const timestamp = block.timestamp;
    const srcMtime = block.srcMtime;
    const failedReason = block.failedReason;

    if (exitCode !== 0) {
      failures.push({
        phase,
        reason:
          typeof failedReason === "string" && failedReason.length > 0
            ? `verification failed: ${failedReason} (exitCode=${String(exitCode)})`
            : `verification failed (exitCode=${String(exitCode)})`,
        command,
      });
      continue;
    }
    const ts = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
    if (Number.isNaN(ts)) {
      failures.push({
        phase,
        reason: `invalid timestamp "${String(timestamp)}"`,
        command,
      });
      continue;
    }
    if (
      typeof srcMtime !== "number" ||
      !Number.isFinite(srcMtime) ||
      srcMtime < 0
    ) {
      failures.push({
        phase,
        reason: `invalid srcMtime ${String(srcMtime)}`,
        command,
      });
      continue;
    }
    if (ts < srcMtime) {
      const srcIso = new Date(srcMtime).toISOString();
      failures.push({
        phase,
        reason: `stale evidence: src changed at ${srcIso}, last verified at ${String(timestamp)}`,
        command,
      });
    }
  }

  if (failures.length > 0) {
    const rel = path.relative(repoRoot, specDir);
    let message = "✗ verificationBlocks gate failed:\n";
    message += `  Active spec: ${rel}\n`;
    for (const f of failures) {
      message += `  - phase "${f.phase}": ${f.reason}\n`;
      message += `      Re-run: ${f.command}\n`;
    }
    message += "\n";
    message +=
      "See plugins/curdx-flow/references/iron-law-verification.md for the full checklist.\n";
    return { ok: false, code: 2, specDir, message };
  }

  const rel = path.relative(repoRoot, specDir);
  return {
    ok: true,
    code: 0,
    specDir,
    message:
      "All verificationBlocks valid.\n" +
      `  Active spec: ${rel}\n` +
      `  Phases verified: ${presentPhases.join(", ")}\n`,
  };
}

/**
 * Resolve the active spec directory.
 *
 *  (a) `<specsDir>/.current-spec` pointer.
 *  (b) Latest-mtime sub-dir under `specsDir` containing `.curdx-state.json`.
 *  (c) `null` if neither — caller treats as graceful no-op.
 *
 * Skips dot-prefixed and underscore-prefixed dirs (`.index`, `_epics`, etc).
 * Per-entry `stat` failures are swallowed; the candidate is just skipped.
 */
function resolveActiveSpecDir(specsDir: string): string | null {
  const pointer = path.join(specsDir, ".current-spec");
  if (existsSync(pointer)) {
    try {
      const name = readFileSync(pointer, "utf8").trim();
      if (name) {
        const dir = path.join(specsDir, name);
        if (existsSync(path.join(dir, ".curdx-state.json"))) return dir;
      }
    } catch {
      // fall through to (b)
    }
  }
  if (!existsSync(specsDir)) return null;
  let entries;
  try {
    entries = readdirSync(specsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  let latest: string | null = null;
  let latestMtime = 0;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".") || e.name.startsWith("_")) continue;
    const stateFile = path.join(specsDir, e.name, ".curdx-state.json");
    if (!existsSync(stateFile)) continue;
    try {
      const st = statSync(stateFile);
      if (st.mtimeMs > latestMtime) {
        latestMtime = st.mtimeMs;
        latest = path.join(specsDir, e.name);
      }
    } catch {
      // ignore unreadable
    }
  }
  return latest;
}
