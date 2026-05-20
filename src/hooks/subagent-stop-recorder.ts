
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
