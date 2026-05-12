// UserPromptExpansion hook for curdx-flow slash skills.
// Adds compact workflow context for direct `/curdx-flow:*` invocations and
// blocks unknown curdx-flow command names before expansion.

import { buildWorkflowSnapshot } from "./lib/workflow-snapshot.js";
import { classifySmartRoute } from "./lib/smart-route.js";
import { buildExecutionBrief, compactExecutionBrief } from "./lib/execution-brief.js";
import { readStdinJson } from "./_shared/stdin.js";

const KNOWN = new Set([
  "curdx-flow:cancel",
  "curdx-flow:design",
  "curdx-flow:feedback",
  "curdx-flow:help",
  "curdx-flow:implement",
  "curdx-flow:index",
  "curdx-flow:new",
  "curdx-flow:prompt-optimize",
  "curdx-flow:refactor",
  "curdx-flow:requirements",
  "curdx-flow:research",
  "curdx-flow:start",
  "curdx-flow:status",
  "curdx-flow:switch",
  "curdx-flow:tasks",
  "curdx-flow:triage",
]);

interface ExpansionInput {
  cwd?: string;
  hook_event_name?: string;
  expansion_type?: string;
  command_name?: string;
  command_args?: string;
}

async function main(): Promise<void> {
  let input: ExpansionInput;
  try {
    input = await readStdinJson<ExpansionInput>();
  } catch {
    return;
  }

  if (input.expansion_type !== "slash_command") return;
  const commandName = input.command_name ?? "";
  if (!commandName.startsWith("curdx-flow:")) return;

  if (!KNOWN.has(commandName)) {
    process.stdout.write(
      JSON.stringify({
        decision: "block",
        reason: `Unknown curdx-flow skill: ${commandName}`,
        hookSpecificOutput: {
          hookEventName: "UserPromptExpansion",
          additionalContext: "Run /curdx-flow:help to list supported curdx-flow skills.",
        },
      }),
    );
    return;
  }

  try {
    const snapshot = buildWorkflowSnapshot({
      cwd: input.cwd,
      goal: input.command_args,
    });
    const route = classifySmartRoute({
      cwd: input.cwd,
      goal: input.command_args,
    });
    const brief = buildExecutionBrief({
      cwd: input.cwd,
      goal: input.command_args,
      routeFacts: route,
    });
    const topGates = route.qualityGates
      .filter((gate) => gate.required)
      .slice(0, 3)
      .map((gate) => gate.command ? `${gate.id}:${gate.command}` : gate.id)
      .join(",");
    const promptOptimizeHint =
      commandName === "curdx-flow:prompt-optimize"
        ? " advisory-only=true no-execution=true"
        : "";
    const context = [
      "curdx-flow expansion context:",
      `active=${snapshot.active}`,
      `route=${route.route}`,
      `stack=${route.stackProfile.primary}`,
      `verifier=${route.suggestedVerifier.command ?? route.suggestedVerifier.fallback ?? "repo-default"}`,
      `contextBudget=${route.contextBudget.level}`,
      `qualityGates=${topGates || "none"}`,
      compactExecutionBrief(brief),
      `next=${snapshot.nextAction}`,
      `gates=${snapshot.gates.join(",") || "none"}`,
      promptOptimizeHint.trim(),
    ].filter(Boolean).join(" ");
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptExpansion",
          additionalContext: context,
        },
      }),
    );
  } catch {
    // Fail open. Expansion hooks should never make curdx-flow unavailable.
  }
}

void main();
