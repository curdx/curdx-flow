// PostCompact hook: persist Claude Code's official compact summary as
// project-local recovery memory. Advisory only; never blocks a session.

import { appendBrainEvent } from "./lib/project-brain.js";
import { readStdinJson } from "./_shared/stdin.js";

interface PostCompactInput {
  cwd?: string;
  hook_event_name?: string;
  compact_summary?: string;
  summary?: string;
  trigger?: string;
  [key: string]: unknown;
}

function compactSummary(input: PostCompactInput): string {
  for (const key of ["compact_summary", "summary"] as const) {
    const value = input[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

async function main(): Promise<void> {
  let input: PostCompactInput;
  try {
    input = await readStdinJson<PostCompactInput>();
  } catch {
    return;
  }

  const cwd = input.cwd;
  if (!cwd) return;
  const summary = compactSummary(input);
  if (!summary) return;

  appendBrainEvent(cwd, {
    type: "compact-summary",
    phase: "recovering",
    summary,
    reason: input.trigger ? `PostCompact:${String(input.trigger)}` : "PostCompact",
  });
}

void main();
