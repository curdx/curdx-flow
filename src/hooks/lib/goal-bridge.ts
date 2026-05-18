// src/hooks/lib/goal-bridge.ts
//
// Builds a native Claude Code `/goal` completion condition for curdx-flow
// implementation runs. The condition is intentionally transcript-verifiable:
// the official goal evaluator does not run tools or read files, so every
// required proof must be something Claude prints during its own turns.

import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
  attachNativeGoalConditionLength,
  buildNativeGoalReadiness,
  evaluateNativeGoalConditionLength,
  GOAL_CONDITION_LIMIT,
  type NativeGoalConditionLength,
  type NativeGoalReadiness,
} from "../../runtime/capabilities/goal-readiness.ts";
import { buildWorkflowSnapshot, type WorkflowSnapshot } from "./workflow-snapshot.js";
import { decideLastMile, type LastMileDecision } from "./last-mile-orchestrator.js";

export interface GoalBridgeInput {
  cwd?: string;
  spec?: string;
  goal?: string;
  maxTurns?: number;
  nativeGoal?: NativeGoalReadiness;
}

export interface GoalBridge {
  version: 1;
  condition: string;
  slashCommand: string;
  startPrompt: string;
  evidenceProtocol: string[];
  warnings: string[];
  readiness: NativeGoalReadiness;
  recommendedDriver: NativeGoalReadiness["recommendedDriver"];
  fallbackAction: string | null;
  conditionLength: NativeGoalConditionLength;
}

function readArg(name: string, argv: string[]): string | undefined {
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

function normalize(input: string | undefined): string {
  return (input ?? "").trim().replace(/\s+/g, " ");
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function specLabel(snapshot: WorkflowSnapshot, explicitSpec: string | undefined): string {
  if (snapshot.spec?.path) return snapshot.spec.path;
  if (explicitSpec && explicitSpec.trim()) return explicitSpec.trim();
  return "the active curdx-flow spec";
}

function taskLine(snapshot: WorkflowSnapshot): string {
  const total = snapshot.tasks.total;
  const completed = snapshot.tasks.completed;
  if (total > 0) return `tasks.md shows ${completed}/${total} tasks complete and every remaining task is handled`;
  return "tasks.md is present when the workflow requires tasks, or the route explicitly does not require tasks";
}

function verificationLine(snapshot: WorkflowSnapshot): string {
  const phase = snapshot.state.phase ?? "execution";
  const block = snapshot.state.verificationBlocks[phase];
  if (block?.command) {
    return `the final ${phase} verifier is shown as ${block.command} with exitCode 0`;
  }
  return "the final execution verifier command and exit code 0 are shown in the conversation";
}

function capabilityEvidence(decision: LastMileDecision): string[] {
  const ids = decision.capabilityPlan.map((item) => item.id);
  const out: string[] = [];
  if (ids.includes("context7") || ids.includes("docs-query")) {
    out.push("current docs evidence is shown before relying on external API, SDK, framework, or Claude Code behavior");
  }
  if (ids.includes("ui-ux-pro-max")) {
    out.push("visible UI changes show ui-ux-pro-max guidance was applied or explicitly deemed irrelevant");
  }
  if (ids.includes("chrome-devtools-mcp") || ids.includes("browser-verification")) {
    out.push("browser-sensitive work includes real browser evidence such as URL, actions, console/network result, screenshot, snapshot, or trace");
  }
  if (ids.includes("claude-mem")) {
    out.push("similar prior work or repeated-failure memory was checked when relevant");
  }
  if (ids.includes("pua")) {
    out.push("repeated failure or parallel slice recovery used pua when available, or recorded why it was skipped");
  }
  if (ids.includes("sequential-thinking")) {
    out.push("high-risk architecture choices include a sequential-thinking conclusion or an explicit local reasoning substitute");
  }
  return out;
}

function evidenceProtocol(snapshot: WorkflowSnapshot, decision: LastMileDecision): string[] {
  return [
    taskLine(snapshot),
    verificationLine(snapshot),
    "curdx-flow snapshot or last-mile output shows no blocking gates remain",
    "missingEvidence is shown as empty, converted into a blocker, or explicitly marked manual-confirmation-required",
    "the final verdict is shown as complete only when verifier evidence and gates are visible; otherwise it reports blocked, partial, or manual-confirmation-required",
    "the assistant outputs ALL_TASKS_COMPLETE only after the task and verifier evidence above is visible",
    ...capabilityEvidence(decision),
  ];
}

function compactCondition(
  parts: string[],
  warnings: string[],
): { condition: string; conditionLength: NativeGoalConditionLength } {
  let condition = parts.join(" ");
  const originalLength = condition.length;
  if (condition.length <= GOAL_CONDITION_LIMIT) {
    return {
      condition,
      conditionLength: evaluateNativeGoalConditionLength({ condition, originalLength }),
    };
  }

  warnings.push("Condition was shortened to fit Claude Code /goal's 4000 character limit.");
  const suffix = " Critical completion evidence still required: transcript-visible verifier command, exitCode 0, missingEvidence status, final verdict, and no blocking gates. If incomplete or blocked, stop after the stated turn limit and report the blocker with next action.";
  const maxBody = GOAL_CONDITION_LIMIT - suffix.length;
  condition = condition.slice(0, Math.max(0, maxBody)).replace(/\s+\S*$/, "");
  const compacted = `${condition}${suffix}`;
  return {
    condition: compacted,
    conditionLength: evaluateNativeGoalConditionLength({
      condition: compacted,
      originalLength,
      compressed: true,
    }),
  };
}

export function buildGoalBridge(input: GoalBridgeInput = {}): GoalBridge {
  const cwd = input.cwd ?? process.cwd();
  const snapshot = buildWorkflowSnapshot({
    cwd,
    spec: input.spec,
    goal: input.goal,
  });
  const decision = decideLastMile({
    cwd,
    name: input.spec,
    goal: input.goal ?? "",
    snapshot,
    hookEvent: "runtime",
  });
  const maxTurns = Math.max(
    1,
    Math.floor(input.maxTurns ?? snapshot.state.autoPolicy?.maxGlobalIterations ?? 30),
  );
  const warnings: string[] = [];
  if (!snapshot.active) {
    warnings.push("No active spec was resolved; the goal condition uses a generic active-spec target.");
  }
  warnings.push(
    "Native /goal is unavailable if Claude Code hooks are disabled by disableAllHooks or allowManagedHooksOnly.",
  );

  const evidence = evidenceProtocol(snapshot, decision);
  const target = specLabel(snapshot, input.spec);
  const userGoal = normalize(input.goal);
  const { condition, conditionLength } = compactCondition(
    [
      `Complete curdx-flow implementation for ${target}.`,
      "This goal is satisfied only when transcript-visible evidence in the conversation visibly shows:",
      evidence.map((item, idx) => `${idx + 1}. ${item}.`).join(" "),
      `Stop after ${maxTurns} goal turns if still incomplete and report the blocker, current task, verifier status, and next action instead of claiming completion.`,
      `If the evidence is not visible, continue by running curdx-flow snapshot/last-mile as needed, executing the next incomplete value-slice task, recording verifier evidence, and updating state.`,
      userGoal ? `User goal context: ${userGoal}.` : "",
    ].filter(Boolean),
    warnings,
  );
  const readiness = attachNativeGoalConditionLength(
    input.nativeGoal ?? buildNativeGoalReadiness(),
    conditionLength,
  );
  const startPrompt = readiness.recommendedDriver === "native-goal"
    ? "Run the slashCommand in Claude Code to let native /goal drive follow-up turns. If /goal becomes unavailable, use manual resume and keep the same evidence protocol; do not rely on Stop-hook continuation."
    : `Native /goal is not available: ${readiness.reason} Use /curdx-flow:implement --manual for one coordinator turn, keep the same evidence protocol, and resume explicitly; do not rely on Stop-hook continuation.`;

  return {
    version: 1,
    condition,
    slashCommand: `/goal ${condition}`,
    startPrompt,
    evidenceProtocol: evidence,
    warnings: [...new Set([...warnings, ...readiness.warnings])],
    readiness,
    recommendedDriver: readiness.recommendedDriver,
    fallbackAction: readiness.fallbackAction,
    conditionLength,
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  const bridge = buildGoalBridge({
    cwd: readArg("--cwd", argv),
    spec: readArg("--spec", argv) ?? readArg("--name", argv),
    goal: readArg("--goal", argv),
    maxTurns: parsePositiveInt(
      readArg("--max-turns", argv) ?? readArg("--max-global-iterations", argv),
      30,
    ),
  });
  process.stdout.write(JSON.stringify(bridge, null, 2) + "\n");
}

function isDirectRun(): boolean {
  try {
    const entry = fileURLToPath(import.meta.url);
    return process.argv[1] === entry && basename(entry).startsWith("goal-bridge.");
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main();
}
