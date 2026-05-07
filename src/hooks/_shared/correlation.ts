import { basename } from "node:path";

import type { CurdxState, HookStdin } from "./types.ts";

/**
 * `buildCorrelationId` — produce the 3-segment correlation tag emitted on
 * every `logHookEvent` row so cross-hook traces can be join-grepped from a
 * single `errors.jsonl` stream (OB-2 Component 6).
 *
 * Format: `<session_id>:<task_idx>:<iter>`
 *
 *   - `session_id` ← `basename(stdin.transcript_path)` with the trailing
 *                    `.jsonl` / `.json` extension stripped. Falls back to
 *                    `'unknown'` when `transcript_path` is missing (the
 *                    SessionStart / PreToolUse envelopes don't ship it).
 *   - `task_idx`   ← `state.taskIndex`, default `0`.
 *   - `iter`       ← phase-aware: during `phase === 'execution'` we use
 *                    `state.taskIteration` (per-task retries), otherwise
 *                    `state.globalIteration` (whole-spec passes). Default `1`.
 *
 * NEVER-throw contract (NFR-9): every field is read defensively and any
 * undefined/null/missing path collapses to its default. Callers can pass a
 * partial or null `state` and a partial or null `stdin` without guarding —
 * this helper produces a usable string in every case so the surrounding
 * `logHookEvent` call site never has to branch on data shape.
 *
 * Pure function, no side effects, deterministic in inputs — safe for the
 * upcoming `tests/hooks/event-logger.test.ts` 7-case suite.
 */
export function buildCorrelationId(
  stdin: HookStdin | null | undefined,
  state: CurdxState | null | undefined,
): string {
  const transcriptPath = stdin?.transcript_path;
  const sessionId = transcriptPath
    ? basename(transcriptPath).replace(/\.(jsonl|json)$/, "")
    : "unknown";

  const taskIdx = state?.taskIndex ?? 0;

  const iter =
    state?.phase === "execution"
      ? (state?.taskIteration ?? 1)
      : (state?.globalIteration ?? 1);

  return `${sessionId}:${taskIdx}:${iter}`;
}
