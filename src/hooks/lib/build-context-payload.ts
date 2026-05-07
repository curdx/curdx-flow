// src/hooks/lib/build-context-payload.ts
//
// Shared context-payload builder used by both SessionStart
// (`load-spec-context.ts`) and the new SubagentStart hook
// (`subagent-context-injector.ts`).
//
// Two output shapes:
//   - default (`forSubagent: false`)  → JSON-stringified SessionStart-shape
//     payload (specName, phase, taskIndex, totalTasks, goal, awaitingApproval).
//     Mirrors the inline payload that load-spec-context currently builds; the
//     SessionStart hook will be refactored (task 2.x) to call this and emit
//     the parsed object on stdout, preserving byte-equal external behavior.
//   - `forSubagent: true`             → compact `<curdx-spec-context>` text
//     block (phase / spec / iron-law). Target size ~100-150B, well under the
//     2 KB NFR-1 envelope.
//
// Pure function: takes `state` + `specDir` from the caller, never touches fs.
// Throws `PayloadOverBudgetError` when the produced payload exceeds
// `opts.maxBytes ?? 2048` — caller is responsible for fail-open recovery.
//
// Design refs: Component 1, D1, D3 (build-context-payload spec).

import { basename } from "node:path";
import type { CurdxState } from "../_shared/types.js";

/**
 * Iron-law one-liner injected into every subagent payload (D1).
 *
 * Hardcoded constant rather than runtime-read from
 * `references/iron-law-verification.md` for startup-fast (zero I/O on every
 * fire). Drift between this constant and the canonical reference doc is
 * guarded by `tests/runner/subagent-context-doc.test.ts` (Phase 3 task 3.3).
 */
export const IRON_LAW_SUMMARY =
  "No completion claim without fresh verification.";

/**
 * Default upper bound for any built payload. Mirrors NFR-1 (additionalContext
 * total payload ≤ 2 KB). Callers may pass a tighter bound via
 * `opts.maxBytes`.
 */
const DEFAULT_MAX_BYTES = 2048;

export interface BuildContextPayloadOpts {
  /**
   * When `true`, emit the compressed `<curdx-spec-context>` block consumed
   * by the SubagentStart hook. When `false` or omitted, emit the full
   * SessionStart-shape JSON string.
   */
  forSubagent?: boolean;
  /**
   * Hard byte ceiling. Output exceeding this throws `PayloadOverBudgetError`.
   * Defaults to 2048 (NFR-1).
   */
  maxBytes?: number;
}

/**
 * Thrown when the built payload exceeds `opts.maxBytes` (default 2048).
 * Hook handlers catch this and fail open with `{continue:true}` (D2 fail-open).
 */
export class PayloadOverBudgetError extends Error {
  /** Actual byte length of the over-budget payload. */
  readonly byteLength: number;
  /** Configured byte ceiling at the time of build. */
  readonly maxBytes: number;

  constructor(byteLength: number, maxBytes: number) {
    super(
      `curdx context payload exceeds budget: ${byteLength}B > ${maxBytes}B`,
    );
    this.name = "PayloadOverBudgetError";
    this.byteLength = byteLength;
    this.maxBytes = maxBytes;
  }
}

/**
 * SessionStart default payload shape — mirrors the inline `ContextBlock`
 * fields produced by `load-spec-context.ts` (specName / phase / taskIndex
 * / totalTasks / goal / awaitingApproval). Top-level `active`/`specPath`
 * are emitted by the SessionStart handler itself (they depend on session-
 * level resolver output, not on the (state, specDir) pair).
 */
interface SessionStartPayload {
  specName: string;
  phase?: string;
  taskIndex?: number;
  totalTasks?: number;
  goal?: string;
  awaitingApproval?: boolean;
}

function buildSessionStartPayload(
  state: CurdxState,
  specDir: string,
): SessionStartPayload {
  const specName = basename(specDir);
  const payload: SessionStartPayload = { specName };

  // Mirror load-spec-context.ts completion-branch + active-branch logic.
  if (state.completed === true) {
    payload.phase = "completed";
    payload.awaitingApproval = false;
    return payload;
  }

  // Byte-equal with load-spec-context.ts defaults: emit phase/taskIndex/
  // totalTasks/awaitingApproval unconditionally with the same fallbacks the
  // SessionStart handler used inline pre-D4 (phase ?? "unknown", numeric ?? 0,
  // awaitingApproval === true). Insertion order also matches the handler so
  // JSON.stringify output is byte-stable.
  payload.phase = typeof state.phase === "string" ? state.phase : "unknown";
  payload.taskIndex =
    typeof state.taskIndex === "number" ? state.taskIndex : 0;
  payload.totalTasks =
    typeof state.totalTasks === "number" ? state.totalTasks : 0;
  payload.awaitingApproval = state.awaitingApproval === true;
  return payload;
}

function buildSubagentBlock(state: CurdxState, specDir: string): string {
  const phase = typeof state.phase === "string" ? state.phase : "unknown";
  return [
    "<curdx-spec-context>",
    `phase: ${phase}`,
    `spec: ${specDir}`,
    `iron-law: ${IRON_LAW_SUMMARY}`,
    "</curdx-spec-context>",
  ].join("\n");
}

/**
 * Build a context payload string for either SessionStart (default) or
 * SubagentStart (`opts.forSubagent === true`).
 *
 * @throws {PayloadOverBudgetError} when the produced payload exceeds
 *   `opts.maxBytes ?? 2048` bytes (UTF-8).
 */
export function buildContextPayload(
  state: CurdxState,
  specDir: string,
  opts?: BuildContextPayloadOpts,
): string {
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
  const out = opts?.forSubagent
    ? buildSubagentBlock(state, specDir)
    : JSON.stringify(buildSessionStartPayload(state, specDir));

  const byteLength = Buffer.byteLength(out, "utf8");
  if (byteLength > maxBytes) {
    throw new PayloadOverBudgetError(byteLength, maxBytes);
  }
  return out;
}
