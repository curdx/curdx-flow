// src/hooks/lib/last-mile-orchestrator.ts
//
// Deterministic "last mile" autopilot for curdx-flow.
//
// This module does not invoke external plugins or MCP servers. It converts
// route/snapshot/brain facts into a compact coordinator instruction so Claude
// Code can decide when to use dependency wheels such as claude-mem, pua,
// ui-ux-pro-max, and chrome-devtools-mcp without asking the
// user to pick a skill manually.

import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildWorkflowSnapshot,
  type WorkflowSnapshot,
} from "./workflow-snapshot.js";
import {
  classifySmartRoute,
  type SmartRoute,
  type SmartRouteInput,
} from "./smart-route.js";
import {
  appendBrainEvent,
  summarizeProjectBrain,
  type BrainSummary,
} from "./project-brain.js";
import type {
  CapabilityRecommendation,
  ToolCapabilityId,
} from "./tool-capabilities.js";

export type LastMilePhase =
  | "discovering"
  | "planning"
  | "implementing"
  | "debugging"
  | "verifying"
  | "recovering"
  | "releasing";

export type LastMileProblemType =
  | "missing-context"
  | "ui-quality-risk"
  | "browser-evidence-needed"
  | "repeated-failure"
  | "release-risk"
  | "verification-gap"
  | "scope-drift"
  | "dependency-missing";

export type LastMileHookEvent =
  | "UserPromptSubmit"
  | "UserPromptExpansion"
  | "PostToolBatch"
  | "TaskCompleted"
  | "Stop"
  | "StopFailure"
  | "runtime";

export interface LastMileVerificationSignal {
  ok?: boolean;
  phase?: string;
  reason?: string;
  command?: string;
}

export interface LastMileInput extends SmartRouteInput {
  hookEvent?: LastMileHookEvent;
  snapshot?: WorkflowSnapshot;
  routeFacts?: SmartRoute;
  toolNames?: string[];
  verification?: LastMileVerificationSignal;
  record?: boolean;
}

export interface LastMileCapabilityAction {
  id: ToolCapabilityId;
  name: string;
  invocation: string;
  phase: CapabilityRecommendation["phase"];
  availabilityState: CapabilityRecommendation["availabilityState"];
  required: boolean;
  triggerReason: string;
  action: string;
  fallbackWhenMissing: string;
}

export interface LastMileDecision {
  version: 1;
  generatedAt: string;
  phase: LastMilePhase;
  problemType: LastMileProblemType | null;
  problemTypes: LastMileProblemType[];
  task: {
    goal: string;
    route: SmartRoute["route"];
    stack: string;
    risk: string;
    activeSpec: string | null;
    currentTask: string | null;
  };
  capabilityPlan: LastMileCapabilityAction[];
  evidenceRequired: string[];
  evidenceSatisfied: string[];
  blockingGates: string[];
  coordinatorInstruction: string;
  recoveryInstruction: string | null;
}

const CODING_PROMPT_RE =
  /\b(implement|fix|debug|build|add|update|refactor|release|publish|test|verify|ui|ux|frontend|backend|plugin|hook|skill|mcp|agent|doctor|npm|tag)\b|实现|修复|开发|构建|新增|添加|更新|修改|优化|重构|发布|测试|验证|前端|后端|页面|插件|钩子|技能|报错|失败|定位|排查|编写|调试|查看|分析|重写|集成|接入|调用|审查|审核|完成|生成/i;
const RELEASE_RE =
  /\b(release|publish|deploy|ship|tag|npm|version|changelog)\b|发布|部署|上线|打包|版本|标签|提测|灰度/i;
const FAILURE_RE =
  /\b(fail|failed|failure|error|stuck|retry|debug|broken|regression)\b|失败|报错|卡住|重试|排查|定位|回归|崩溃|阻塞|无法|不通过/i;

function normalize(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function rec(route: SmartRoute, id: ToolCapabilityId): CapabilityRecommendation | undefined {
  return route.recommendedCapabilities.find((item) => item.id === id);
}

function hasRec(route: SmartRoute, id: ToolCapabilityId): boolean {
  return rec(route, id) !== undefined;
}

function missingCapabilityIds(route: SmartRoute): ToolCapabilityId[] {
  return route.recommendedCapabilities
    .filter((item) => item.availabilityState === "missing" && item.expectedByDefault)
    .map((item) => item.id);
}

function isReleaseSensitive(goal: string, route: SmartRoute): boolean {
  return route.intent.intentKind === "release" ||
    RELEASE_RE.test(goal) ||
    route.qualityGates.some((gate) => gate.id.endsWith("-release")) ||
    route.stackProfile.primary === "claude-code-plugin" && RELEASE_RE.test(goal);
}

function hasVerificationGap(input: LastMileInput, snapshot: WorkflowSnapshot): boolean {
  if (input.verification?.ok === false) return true;
  if (input.hookEvent === "TaskCompleted") return true;
  return snapshot.gates.some((gate) =>
    gate === "completion-unmarked" ||
    gate === "missing-tasks" ||
    gate === "empty-tasks" ||
    gate === "invalid-state",
  );
}

function inferPhase(input: LastMileInput, route: SmartRoute, snapshot: WorkflowSnapshot, brain: BrainSummary): LastMilePhase {
  const goal = normalize(input.goal);
  if (isReleaseSensitive(goal, route)) return "releasing";
  if (input.verification?.ok === false || brain.recentFailures.length >= 2) return "recovering";
  if (input.hookEvent === "TaskCompleted") return "verifying";
  if (FAILURE_RE.test(goal)) return "debugging";

  const statePhase = snapshot.state.phase;
  if (statePhase === "execution") return "implementing";
  if (statePhase === "research") return "discovering";
  if (statePhase === "requirements" || statePhase === "design" || statePhase === "tasks") {
    return "planning";
  }
  if (route.route === "blocked-ask-user" || route.route === "product-inception") return "discovering";
  if (route.shouldCreateSpec) return "planning";
  return "implementing";
}

function inferProblemTypes(
  input: LastMileInput,
  route: SmartRoute,
  snapshot: WorkflowSnapshot,
  brain: BrainSummary,
): LastMileProblemType[] {
  const goal = normalize(input.goal);
  const out: LastMileProblemType[] = [];
  if (route.route === "blocked-ask-user" || route.intent.missingFacts.length > 0) {
    out.push("missing-context");
  }
  if (hasRec(route, "ui-ux-pro-max")) out.push("ui-quality-risk");
  if (hasRec(route, "chrome-devtools-mcp") || hasRec(route, "browser-verification")) {
    out.push("browser-evidence-needed");
  }
  if (brain.recentFailures.length >= 2 || hasRec(route, "pua") || /\b(repeated|twice|again)\b|反复|连续|又失败|多次/i.test(goal)) {
    out.push("repeated-failure");
  }
  if (isReleaseSensitive(goal, route)) out.push("release-risk");
  if (hasVerificationGap(input, snapshot)) out.push("verification-gap");
  if (snapshot.git.dirty && snapshot.git.changedFiles > 8 || snapshot.gates.includes("missing-code-root")) {
    out.push("scope-drift");
  }
  if (missingCapabilityIds(route).length > 0) out.push("dependency-missing");
  return unique(out) as LastMileProblemType[];
}

function capabilityAction(recItem: CapabilityRecommendation): LastMileCapabilityAction {
  const required =
    recItem.curdxRole.includes("gate") ||
    recItem.category === "docs" ||
    recItem.category === "verification" ||
    recItem.category === "security" ||
    recItem.id === "pua";
  return {
    id: recItem.id,
    name: recItem.name,
    invocation: recItem.invocation,
    phase: recItem.phase,
    availabilityState: recItem.availabilityState,
    required,
    triggerReason: recItem.triggerReason,
    action: recItem.availabilityState === "missing"
      ? recItem.fallbackWhenMissing
      : recItem.instruction,
    fallbackWhenMissing: recItem.fallbackWhenMissing,
  };
}

function evidenceRequired(
  input: LastMileInput,
  route: SmartRoute,
  snapshot: WorkflowSnapshot,
  problems: LastMileProblemType[],
): string[] {
  const out = route.qualityGates
    .filter((gate) => gate.required)
    .map((gate) => gate.command ? `${gate.id}: ${gate.command}` : gate.id);
  const verifier = route.suggestedVerifier.command ?? route.suggestedVerifier.fallback;
  if (verifier) out.push(`suggested-verifier: ${verifier}`);
  if (problems.includes("browser-evidence-needed")) {
    out.push("browser evidence: Playwright pass or Chrome DevTools MCP console/network/DOM proof");
  }
  if (problems.includes("release-risk")) {
    out.push("release evidence: curdx-flow doctor, plugin validate, hook freshness, version/tag parity");
  }
  if (problems.includes("verification-gap")) {
    const phase = input.verification?.phase ?? snapshot.state.phase ?? "execution";
    out.push(`fresh verification block for phase '${phase}'`);
  }
  return unique(out).slice(0, 8);
}

function evidenceSatisfied(snapshot: WorkflowSnapshot, brain: BrainSummary): string[] {
  const verified = Object.entries(snapshot.state.verificationBlocks)
    .filter(([, block]) => block?.exitCode === 0 && typeof block.command === "string")
    .map(([phase, block]) => `${phase}: ${block?.command}`);
  return unique([...verified, ...brain.verifierHints.map((hint) => `brain: ${hint}`)]).slice(0, 6);
}

function blockingGates(route: SmartRoute, snapshot: WorkflowSnapshot, problems: LastMileProblemType[]): string[] {
  const out = [...snapshot.gates];
  if (route.blockedReason) out.push(`route-blocked: ${route.blockedReason}`);
  for (const id of missingCapabilityIds(route)) {
    out.push(`dependency-missing: ${id}`);
  }
  if (problems.includes("release-risk")) out.push("release-gate-required");
  return unique(out);
}

function firstCapability(plan: LastMileCapabilityAction[], id: ToolCapabilityId): LastMileCapabilityAction | undefined {
  return plan.find((item) => item.id === id);
}

function instructionFor(
  phase: LastMilePhase,
  problems: LastMileProblemType[],
  plan: LastMileCapabilityAction[],
  route: SmartRoute,
  snapshot: WorkflowSnapshot,
): string {
  if (problems.includes("dependency-missing")) {
    const missing = plan
      .filter((item) => item.availabilityState === "missing")
      .map((item) => item.id)
      .join(", ");
    return `Run curdx-flow doctor and fix missing expected capabilities before relying on them: ${missing}.`;
  }
  if (problems.includes("repeated-failure")) {
    const memory = firstCapability(plan, "claude-mem");
    const pua = firstCapability(plan, "pua");
    const parts = [
      memory ? `${memory.invocation} for prior decisions/failures` : "read .curdx/brain.jsonl for recent failures",
      pua ? `${pua.invocation} for structured recovery or parallel diagnosis` : "switch to systematic recovery before another edit",
    ];
    return `Stop the same edit loop; ${parts.join(", ")}.`;
  }
  if (problems.includes("ui-quality-risk")) {
    const uiUx = firstCapability(plan, "ui-ux-pro-max");
    const design = uiUx !== undefined && uiUx.availabilityState !== "missing"
      ? uiUx.invocation
      : "the available frontend design guidance";
    return `Apply ${design} before changing visible UI, then keep browser evidence as the completion gate.`;
  }
  if (problems.includes("browser-evidence-needed")) {
    return "After implementation, collect browser runtime evidence with Playwright or Chrome DevTools MCP before claiming completion.";
  }
  if (problems.includes("release-risk")) {
    return "Before tag, push, or publish, run the release gate: official Claude Code docs check, curdx-flow doctor, plugin validate, hook freshness, and npm/plugin tag parity.";
  }
  if (problems.includes("verification-gap")) {
    return `Do not finish yet; satisfy the verifier for ${snapshot.spec?.name ?? "the active spec"} and record fresh evidence.`;
  }
  if (phase === "planning") return "Create or resume the smallest spec/task plan that satisfies the route, then enter implementation.";
  return route.nextAction;
}

function recoveryFor(problems: LastMileProblemType[], plan: LastMileCapabilityAction[], input: LastMileInput): string | null {
  if (!problems.includes("repeated-failure") && !problems.includes("verification-gap")) return null;
  const phase = input.verification?.phase ?? "current phase";
  const reason = input.verification?.reason ?? "missing or failed evidence";
  const memory = firstCapability(plan, "claude-mem");
  const pua = firstCapability(plan, "pua");
  return [
    `Recovery for ${phase}: ${reason}.`,
    memory ? `First search memory with ${memory.invocation}.` : "First inspect .curdx/brain.jsonl and the failing verifier output.",
    pua ? `If the same fix path already failed, use ${pua.invocation} for decomposition/retry discipline.` : "If the same fix path already failed, decompose before editing again.",
    "Then run the suggested verifier and record the result before completion.",
  ].join(" ");
}

export function decideLastMile(input: LastMileInput = {}): LastMileDecision {
  const cwd = input.cwd;
  const goal = normalize(input.goal);
  const snapshot = input.snapshot ?? buildWorkflowSnapshot({ cwd, goal, spec: input.name });
  const route = input.routeFacts ?? classifySmartRoute(input);
  const brain = summarizeProjectBrain(cwd);
  const phase = inferPhase(input, route, snapshot, brain);
  const problemTypes = inferProblemTypes(input, route, snapshot, brain);
  const capabilityPlan = route.recommendedCapabilities.map(capabilityAction);
  const blocking = blockingGates(route, snapshot, problemTypes);
  const coordinatorInstruction = instructionFor(phase, problemTypes, capabilityPlan, route, snapshot);
  const recoveryInstruction = recoveryFor(problemTypes, capabilityPlan, input);
  const decision: LastMileDecision = {
    version: 1,
    generatedAt: new Date().toISOString(),
    phase,
    problemType: problemTypes[0] ?? null,
    problemTypes,
    task: {
      goal,
      route: route.route,
      stack: route.stackProfile.primary,
      risk: route.policy.risk,
      activeSpec: snapshot.spec?.name ?? route.activeSpec?.name ?? null,
      currentTask: snapshot.tasks.current?.title ?? null,
    },
    capabilityPlan,
    evidenceRequired: evidenceRequired(input, route, snapshot, problemTypes),
    evidenceSatisfied: evidenceSatisfied(snapshot, brain),
    blockingGates: blocking,
    coordinatorInstruction,
    recoveryInstruction,
  };

  if (input.record === true) {
    appendBrainEvent(cwd, {
      type: "last-mile-decision",
      route: route.route,
      stack: route.stackProfile.primary,
      phase,
      reason: [
        `problem=${decision.problemType ?? "none"}`,
        `instruction=${coordinatorInstruction}`,
      ].join(" "),
      files: input.toolNames?.length,
    });
  }

  return decision;
}

export function compactLastMileDecision(decision: LastMileDecision): string {
  const caps = decision.capabilityPlan
    .slice(0, 5)
    .map((item) =>
      item.availabilityState === "missing" ? `${item.id}:missing` : item.id,
    )
    .join(",");
  const evidence = decision.evidenceRequired.slice(0, 3).join(" | ") || "none";
  return [
    `lastMile(phase=${decision.phase}`,
    `problem=${decision.problemType ?? "none"}`,
    `route=${decision.task.route}`,
    `stack=${decision.task.stack}`,
    `caps=${caps || "none"}`,
    `evidence=${evidence})`,
  ].join(" ");
}

export function isLastMileRelevantPrompt(prompt: string, snapshot?: WorkflowSnapshot): boolean {
  const text = normalize(prompt);
  if (text.length === 0) return false;
  if (snapshot?.active === true) return true;
  return CODING_PROMPT_RE.test(text);
}

function readArg(name: string, argv: string[]): string | undefined {
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function main(): void {
  const argv = process.argv.slice(2);
  const available = parseList(readArg("--available-capabilities", argv));
  const decision = decideLastMile({
    cwd: readArg("--cwd", argv),
    goal: readArg("--goal", argv) ?? "",
    name: readArg("--spec", argv) ?? readArg("--name", argv),
    changedFiles: parseList(readArg("--files", argv)),
    availableCapabilities: available.length > 0 ? available : undefined,
    hookEvent: "runtime",
    record: argv.includes("--record"),
  });
  process.stdout.write(JSON.stringify(decision, null, 2) + "\n");
}

function isDirectRun(): boolean {
  try {
    const entry = fileURLToPath(import.meta.url);
    return process.argv[1] === entry && basename(entry).startsWith("last-mile-orchestrator.");
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main();
}
