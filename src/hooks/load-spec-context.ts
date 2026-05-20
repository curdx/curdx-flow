import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { runHook } from "./_shared/run-hook.js";
import { bindSessionSpec, resolveCurrent } from "./_shared/path-resolver.js";
import { buildContextPayload } from "./lib/build-context-payload.js";
import { buildContextCapsule } from "./lib/build-context-payload.js";
import { buildWorkflowSnapshot } from "./lib/workflow-snapshot.js";
import type { ContextBlockOutput } from "./_shared/types.js";
import type { CurdxState } from "./_shared/types.js";

type ContextBlock = ContextBlockOutput;

const SETTINGS_REL_PATH = ".claude/curdx-flow.local.md";

const INACTIVE: ContextBlock = { active: false };

function readEnabledSetting(settingsPath: string): string | null {
  let raw: string;
  try {
    raw = readFileSync(settingsPath, "utf8");
  } catch {
    return null;
  }
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*$/m);
  const block = fmMatch?.[1];
  if (!block) return null;
  const line = block.split(/\r?\n/).find((l) => /^enabled\s*:/.test(l));
  if (!line) return null;
  const value = line.replace(/^enabled\s*:\s*/, "");
    const cleaned = value.replace(/[\s"']/g, "").toLowerCase();
  return cleaned || null;
}

function readGoalFromProgress(progressPath: string): string | null {
  let raw: string;
  try {
    raw = readFileSync(progressPath, "utf8");
  } catch {
    return null;
  }
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (/^## Original Goal\s*$/.test(lines[i] ?? "")) {
                  const next = lines[i + 1] ?? "";
      const trimmed = next.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
  }
  return null;
}

runHook(async (input) => {
  const cwd = input?.cwd;
  if (!cwd) {
    return INACTIVE;
  }

    const settingsPath = join(cwd, SETTINGS_REL_PATH);
  if (existsSync(settingsPath)) {
    const enabled = readEnabledSetting(settingsPath);
    if (enabled === "false") {
      return INACTIVE;
    }
  }

    const specRelativePath = resolveCurrent({ cwd, sessionId: input.session_id });
  if (!specRelativePath) {
    return INACTIVE;
  }
  if (typeof input.session_id === "string" && input.session_id.length > 0) {
    bindSessionSpec(specRelativePath, {
      cwd,
      sessionId: input.session_id,
      source: "SessionStart",
    });
  }

  const specPath = join(cwd, specRelativePath);
        const specName = basename(specRelativePath);

    try {
    const { statSync } = await import("node:fs");
    if (!statSync(specPath).isDirectory()) {
      return INACTIVE;
    }
  } catch {
    return INACTIVE;
  }

  const stateFile = join(specPath, ".curdx-state.json");
  const progressFile = join(specPath, ".progress.md");

    process.stderr.write(`[curdx-flow] Active spec detected: ${specName}\n`);

  const block: ContextBlock = {
    active: true,
    specName,
    specPath: specRelativePath,
  };

  // Output state summary if state file exists and is parseable.
  let state: CurdxState | null = null;
  if (existsSync(stateFile)) {
    try {
      state = JSON.parse(readFileSync(stateFile, "utf8")) as CurdxState;
    } catch {
      state = null;
    }
  }

  if (state) {
    if (state.completed === true) {
      const at =
        typeof state.completedAt === "string" ? state.completedAt : "unknown";
      process.stderr.write(
        `[curdx-flow] Spec completed: ${specName} (${at}). Run /curdx-flow:refactor to reopen or /curdx-flow:new for a new spec.\n`,
      );
      Object.assign(block, JSON.parse(buildContextPayload(state, specPath)));
      return block;
    }
    // D4 surgical refactor: state-derived payload fields now come from the
    // shared lib; stderr banner still uses local variables for byte-equal
    // formatting parity with v6 baseline.
    Object.assign(block, JSON.parse(buildContextPayload(state, specPath)));
    const phase = block.phase ?? "unknown";
    const taskIndex = typeof block.taskIndex === "number" ? block.taskIndex : 0;
    const totalTasks =
      typeof block.totalTasks === "number" ? block.totalTasks : 0;
    const awaiting = block.awaitingApproval === true;

    process.stderr.write(
      `[curdx-flow] Phase: ${phase} | Task: ${taskIndex + 1}/${totalTasks} | Awaiting approval: ${awaiting}\n`,
    );

    if (phase === "execution" && !awaiting) {
      process.stderr.write(
        `[curdx-flow] Execution in progress. Run /curdx-flow:implement to continue.\n`,
      );
    } else if (awaiting) {
      switch (phase) {
        case "research":
          process.stderr.write(
            `[curdx-flow] Research complete. Run /curdx-flow:requirements to continue.\n`,
          );
          break;
        case "requirements":
          process.stderr.write(
            `[curdx-flow] Requirements complete. Run /curdx-flow:design to continue.\n`,
          );
          break;
        case "design":
          process.stderr.write(
            `[curdx-flow] Design complete. Run /curdx-flow:tasks to continue.\n`,
          );
          break;
        case "tasks":
          process.stderr.write(
            `[curdx-flow] Tasks complete. Run /curdx-flow:implement to start execution.\n`,
          );
          break;
      }
    }
  } else {
    // No (parseable) state file — fall back to file-based phase detection.
    if (existsSync(join(specPath, "tasks.md"))) {
      process.stderr.write(
        `[curdx-flow] Tasks defined but no execution state. Run /curdx-flow:implement to start.\n`,
      );
    } else if (existsSync(join(specPath, "design.md"))) {
      process.stderr.write(
        `[curdx-flow] Design exists. Run /curdx-flow:tasks to generate tasks.\n`,
      );
    } else if (existsSync(join(specPath, "requirements.md"))) {
      process.stderr.write(
        `[curdx-flow] Requirements exist. Run /curdx-flow:design to continue.\n`,
      );
    } else if (existsSync(join(specPath, "research.md"))) {
      process.stderr.write(
        `[curdx-flow] Research exists. Run /curdx-flow:requirements to continue.\n`,
      );
    }
  }

  // Original goal from progress file.
  if (existsSync(progressFile)) {
    const goal = readGoalFromProgress(progressFile);
    if (goal) {
      block.goal = goal;
      process.stderr.write(`[curdx-flow] Goal: ${goal}\n`);
    }
  }

  try {
    block.contextCapsule = buildContextCapsule(
      buildWorkflowSnapshot({ cwd, spec: specRelativePath, sessionId: input.session_id }),
    );
  } catch {
    // Capsule is advisory; preserve the existing SessionStart contract.
  }

  return block;
});
