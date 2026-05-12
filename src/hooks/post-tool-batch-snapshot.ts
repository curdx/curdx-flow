// PostToolBatch hook: injects compact curdx-flow drift context after batched
// edits. It is advisory and fail-open.

import { buildWorkflowSnapshot } from "./lib/workflow-snapshot.js";
import { classifySmartRoute } from "./lib/smart-route.js";
import { buildExecutionBrief, compactExecutionBrief } from "./lib/execution-brief.js";
import { appendBrainEvent } from "./lib/project-brain.js";
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
    const route = classifySmartRoute({ cwd: input.cwd });
    const brief = buildExecutionBrief({ cwd: input.cwd, routeFacts: route });
    const missingVerifier =
      route.suggestedVerifier.command ?? route.suggestedVerifier.fallback ?? "repo verifier";
    const qualityGateText = route.qualityGates
      .filter((gate) => gate.required)
      .slice(0, 3)
      .map((gate) => gate.command ? `${gate.id} (${gate.command})` : gate.id)
      .join(", ");
    appendBrainEvent(input.cwd, {
      type: "edit-batch",
      route: route.route,
      stack: route.stackProfile.primary,
      verifier: missingVerifier,
      files: calls.length,
    });

    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolBatch",
          additionalContext:
            `curdx-flow snapshot gates after batch: ${snapshot.gates.join(", ")}. ` +
            `Stack: ${route.stackProfile.primary}. ` +
            `Quality gates: ${qualityGateText || "none"}. ` +
            `Suggested verifier: ${missingVerifier}. ` +
            `${compactExecutionBrief(brief)}. ` +
            `Next action: ${snapshot.nextAction}`,
        },
      }),
    );
  } catch {
    // Fail open.
  }
}

void main();
