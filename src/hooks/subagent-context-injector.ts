import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { runHook } from "./_shared/run-hook.js";
import { resolveCurrent } from "./_shared/path-resolver.js";
import {
  IRON_LAW_SUMMARY,
  buildContextPayload,
} from "./lib/build-context-payload.js";
import { appendBrainEvent } from "./lib/project-brain.js";
import type { CurdxState, HookOutput } from "./_shared/types.js";

void IRON_LAW_SUMMARY;

interface SubagentInjectionOutput {
  hookSpecificOutput: {
    hookEventName: "SubagentStart";
    additionalContext: string;
  };
  continue: true;
}

interface SubagentContinueOutput {
  continue: true;
}

const FAIL_OPEN: SubagentContinueOutput = { continue: true };

runHook(async (input) => {
  try {
                const eventName = input?.hook_event_name;
    if (typeof eventName === "string" && eventName !== "SubagentStart") {
      return FAIL_OPEN as unknown as HookOutput;
    }

    const cwd = input?.cwd;
    if (typeof cwd !== "string" || cwd.length === 0) {
      return FAIL_OPEN as unknown as HookOutput;
    }

                            const subagentInput = input as unknown as {
      session_id?: unknown;
      agent_id?: unknown;
      agent_type?: unknown;
      transcript_path?: unknown;
      parent_agent_id?: unknown;
    };
    appendBrainEvent(cwd, {
      type: "subagent-started",
      sessionId:
        typeof subagentInput.session_id === "string" ? subagentInput.session_id : undefined,
      agentId:
        typeof subagentInput.agent_id === "string" ? subagentInput.agent_id : undefined,
      agentType:
        typeof subagentInput.agent_type === "string" ? subagentInput.agent_type : undefined,
      parentAgentId:
        typeof subagentInput.parent_agent_id === "string"
          ? subagentInput.parent_agent_id
          : undefined,
      transcriptPath:
        typeof subagentInput.transcript_path === "string"
          ? subagentInput.transcript_path
          : undefined,
    });

                const specPath = resolveCurrent({ cwd, sessionId: input.session_id });
    if (!specPath) {
      return FAIL_OPEN as unknown as HookOutput;
    }

    const specDirFs = join(cwd, specPath);
    const stateFile = join(specDirFs, ".curdx-state.json");
    if (!existsSync(stateFile)) {
      return FAIL_OPEN as unknown as HookOutput;
    }

    let state: CurdxState;
    try {
      state = JSON.parse(readFileSync(stateFile, "utf8")) as CurdxState;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(
        `[subagent-context-injector] state parse failed: ${msg}\n`,
      );
      return FAIL_OPEN as unknown as HookOutput;
    }

            if (state.completed === true) {
      return FAIL_OPEN as unknown as HookOutput;
    }

                    const additionalContext = buildContextPayload(state, specPath, {
      forSubagent: true,
    });

    const out: SubagentInjectionOutput = {
      hookSpecificOutput: {
        hookEventName: "SubagentStart",
        additionalContext,
      },
      continue: true,
    };
    return out as unknown as HookOutput;
  } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[subagent-context-injector] ${msg}\n`);
    return FAIL_OPEN as unknown as HookOutput;
  }
});
