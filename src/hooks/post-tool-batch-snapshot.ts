// PostToolBatch hook: injects compact curdx-flow drift context after batched
// edits. It is advisory and fail-open.

import { buildWorkflowSnapshot } from "./lib/workflow-snapshot.js";
import { readStdinJson } from "./_shared/stdin.js";

interface ToolCall {
  tool_name?: string;
}

interface PostToolBatchInput {
  cwd?: string;
  tool_calls?: ToolCall[];
}

async function main(): Promise<void> {
  let input: PostToolBatchInput;
  try {
    input = await readStdinJson<PostToolBatchInput>();
  } catch {
    return;
  }

  const calls = input.tool_calls ?? [];
  const touchedWriteTool = calls.some((call) =>
    /^(Write|Edit|MultiEdit|Bash)$/.test(call.tool_name ?? ""),
  );
  if (!touchedWriteTool) return;

  try {
    const snapshot = buildWorkflowSnapshot({ cwd: input.cwd });
    if (!snapshot.active || snapshot.gates.length === 0) return;

    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolBatch",
          additionalContext:
            `curdx-flow snapshot gates after batch: ${snapshot.gates.join(", ")}. ` +
            `Next action: ${snapshot.nextAction}`,
        },
      }),
    );
  } catch {
    // Fail open.
  }
}

void main();
