// SubagentStop hook: record subagent termination as a brain event so
// post-hoc analyzers can join brain.jsonl against the transcript JSONL.
// Advisory only; this hook never blocks a session.
//
// Claude Code SubagentStop hook input (per code.claude.com/docs/en/hooks
// as of 2026-05): session_id, transcript_path, cwd, hook_event_name,
// agent_id, agent_type are guaranteed. parent_agent_id and stop_reason
// are NOT in the documented contract — see anthropics/claude-code#14859
// (still open as of 2026-05). We capture them defensively if present.

import { appendBrainEvent } from "./lib/project-brain.js";
import { readStdinJson } from "./_shared/stdin.js";

interface SubagentStopInput {
  cwd?: string;
  hook_event_name?: string;
  session_id?: string;
  agent_id?: string;
  agent_type?: string;
  transcript_path?: string;
  parent_agent_id?: string;
  stop_reason?: string;
  [key: string]: unknown;
}

async function main(): Promise<void> {
  let input: SubagentStopInput;
  try {
    input = await readStdinJson<SubagentStopInput>();
  } catch {
    return;
  }

  const cwd = input.cwd;
  if (!cwd) return;

  appendBrainEvent(cwd, {
    type: "subagent-stopped",
    sessionId: typeof input.session_id === "string" ? input.session_id : undefined,
    agentId: typeof input.agent_id === "string" ? input.agent_id : undefined,
    agentType: typeof input.agent_type === "string" ? input.agent_type : undefined,
    parentAgentId:
      typeof input.parent_agent_id === "string" ? input.parent_agent_id : undefined,
    transcriptPath:
      typeof input.transcript_path === "string" ? input.transcript_path : undefined,
    stopReason: typeof input.stop_reason === "string" ? input.stop_reason : undefined,
  });
}

void main();
