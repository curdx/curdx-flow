// UserPromptSubmit hook: injects curdx-flow last-mile autopilot context for
// normal coding prompts, not only explicit /curdx-flow slash commands.

import { buildWorkflowSnapshot } from "./lib/workflow-snapshot.js";
import {
  compactLastMileDecision,
  decideLastMile,
  isLastMileRelevantPrompt,
} from "./lib/last-mile-orchestrator.js";
import { readStdinJson } from "./_shared/stdin.js";

const MAX_ADDITIONAL_CONTEXT_CHARS = 1200;

interface PromptSubmitInput {
  cwd?: string;
  hook_event_name?: string;
  prompt?: string;
  user_prompt?: string;
  message?: string;
  [key: string]: unknown;
}

function limitContext(value: string): string {
  if (value.length <= MAX_ADDITIONAL_CONTEXT_CHARS) return value;
  return `${value.slice(0, MAX_ADDITIONAL_CONTEXT_CHARS - 15)} ...[truncated]`;
}

function promptText(input: PromptSubmitInput): string {
  for (const key of ["prompt", "user_prompt", "message"] as const) {
    const value = input[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return "";
}

async function main(): Promise<void> {
  let input: PromptSubmitInput;
  try {
    input = await readStdinJson<PromptSubmitInput>();
  } catch {
    return;
  }

  const prompt = promptText(input);
  if (prompt.trim().startsWith("/curdx-flow:")) return;

  try {
    const snapshot = buildWorkflowSnapshot({ cwd: input.cwd, goal: prompt });
    if (!isLastMileRelevantPrompt(prompt, snapshot)) return;

    const decision = decideLastMile({
      cwd: input.cwd,
      goal: prompt,
      snapshot,
      hookEvent: "UserPromptSubmit",
    });
    const context = [
      "curdx-flow autopilot:",
      compactLastMileDecision(decision),
      `instruction=${decision.coordinatorInstruction}`,
      decision.recoveryInstruction ? `recovery=${decision.recoveryInstruction}` : "",
      `blocking=${decision.blockingGates.join(",") || "none"}`,
    ].filter(Boolean).join(" ");

    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: limitContext(context),
        },
      }),
    );
  } catch {
    // Fail open. Prompt hooks should never make Claude Code unusable.
  }
}

void main();
