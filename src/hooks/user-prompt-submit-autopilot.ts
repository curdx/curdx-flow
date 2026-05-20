
import { buildWorkflowSnapshot } from "./lib/workflow-snapshot.js";
import { buildContextCapsule } from "./lib/build-context-payload.js";
import {
  compactLastMileDecision,
  decideLastMile,
  isLastMileRelevantPrompt,
} from "./lib/last-mile-orchestrator.js";
import { bindSessionSpec, findSpec } from "./_shared/path-resolver.js";
import { readStdinJson } from "./_shared/stdin.js";
import { isAbsolute, join } from "node:path";
import { existsSync, statSync } from "node:fs";

const MAX_ADDITIONAL_CONTEXT_CHARS = 1200;

interface PromptSubmitInput {
  cwd?: string;
  session_id?: string;
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

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function maybeBindSwitchPrompt(input: PromptSubmitInput, prompt: string): void {
  const cwd = input.cwd;
  const sessionId = input.session_id;
  if (!cwd || !sessionId) return;
  const match = prompt.trim().match(/^\/curdx-flow:switch\s+([^\s]+)/);
  const target = match?.[1]?.trim();
  if (!target) return;

  let specPath: string | null = null;
  if (target.startsWith("./") || target.startsWith("../") || target.includes("/") || isAbsolute(target)) {
    const fsPath = isAbsolute(target) ? target : join(cwd, target);
    if (existsSync(fsPath) && isDirectory(fsPath)) specPath = target;
  } else {
    const found = findSpec(target, { cwd });
    if (found.ok) specPath = found.path;
  }
  if (specPath) {
    bindSessionSpec(specPath, { cwd, sessionId, source: "UserPromptSubmit:switch" });
  }
}

async function main(): Promise<void> {
  let input: PromptSubmitInput;
  try {
    input = await readStdinJson<PromptSubmitInput>();
  } catch {
    return;
  }

  const prompt = promptText(input);
  maybeBindSwitchPrompt(input, prompt);
  if (prompt.trim().startsWith("/curdx-flow:")) return;

  try {
    const snapshot = buildWorkflowSnapshot({ cwd: input.cwd, goal: prompt, sessionId: input.session_id });
    if (!isLastMileRelevantPrompt(prompt, snapshot)) return;

    const decision = decideLastMile({
      cwd: input.cwd,
      goal: prompt,
      snapshot,
      hookEvent: "UserPromptSubmit",
    });
    const capsule = buildContextCapsule(snapshot);
    const context = [
      capsule,
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
