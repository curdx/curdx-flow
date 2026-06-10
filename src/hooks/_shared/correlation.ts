import { basename } from "node:path";

import type { CurdxState, HookStdin } from "./types.ts";

/**
 * 3-segment correlation tag `<session_id>:<task_idx>:<iter>` for join-greps
 * over errors.jsonl. `iter` is `taskIteration` during the execution phase,
 * otherwise `globalIteration`. Never throws — accepts null/partial inputs
 * and collapses every missing field to a default.
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
