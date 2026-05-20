
import { buildWorkflowSnapshot } from "./lib/workflow-snapshot.js";
import { classifySmartRoute } from "./lib/smart-route.js";
import { buildExecutionBrief, compactExecutionBrief } from "./lib/execution-brief.js";
import { compactLastMileDecision, decideLastMile } from "./lib/last-mile-orchestrator.js";
import { appendBrainEvent } from "./lib/project-brain.js";
import { readStdinJson } from "./_shared/stdin.js";

const MAX_ADDITIONAL_CONTEXT_CHARS = 1000;

interface ToolCall {
  tool_name?: string;
}

interface PostToolBatchInput {
  cwd?: string;
  session_id?: string;
  tool_calls?: ToolCall[];
}

function limitContext(value: string): string {
  if (value.length <= MAX_ADDITIONAL_CONTEXT_CHARS) return value;
  return `${value.slice(0, MAX_ADDITIONAL_CONTEXT_CHARS - 15)} ...[truncated]`;
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
    const snapshot = buildWorkflowSnapshot({ cwd: input.cwd, sessionId: input.session_id });
    const route = classifySmartRoute({ cwd: input.cwd });
    const brief = buildExecutionBrief({ cwd: input.cwd, routeFacts: route });
    const lastMile = decideLastMile({
      cwd: input.cwd,
      snapshot,
      routeFacts: route,
      hookEvent: "PostToolBatch",
      toolNames: calls.map((call) => call.tool_name ?? "unknown"),
      record: true,
    });
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

    const additionalContext =
      `curdx-flow snapshot gates after batch: ${snapshot.gates.join(", ")}. ` +
      `Stack: ${route.stackProfile.primary}. ` +
      `Quality gates: ${qualityGateText || "none"}. ` +
      `Suggested verifier: ${missingVerifier}. ` +
      `${compactExecutionBrief(brief, { includeLastMile: false })}. ` +
      `${compactLastMileDecision(lastMile)}. ` +
      `Autopilot: ${lastMile.coordinatorInstruction}. ` +
      `Next action: ${snapshot.nextAction}`;

    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolBatch",
          additionalContext: limitContext(additionalContext),
        },
      }),
    );
  } catch {
    // Fail open.
  }
}

void main();
