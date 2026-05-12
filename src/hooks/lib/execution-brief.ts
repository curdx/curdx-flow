// src/hooks/lib/execution-brief.ts
//
// Compiles smart-route facts into a short, executable contract for the agent.
// This is the "last mile" layer: bounded context, explicit verifier, review
// expectations, and escalation rules derived from deterministic route facts.

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

export interface ExecutionBrief {
  version: 1;
  generatedAt: string;
  goal: string;
  route: SmartRoute["route"];
  reason: string;
  stack: string;
  risk: string;
  context: {
    budget: string;
    maxReferenceFiles: number;
    readFirst: string[];
    avoid: string[];
  };
  execution: {
    mode: string;
    primarySkill: string;
    agents: string[];
    isolation: string;
    taskShape: string;
  };
  qualityGates: Array<{
    id: string;
    phase: string;
    required: boolean;
    command: string | null;
  }>;
  completionContract: string[];
  escalationRules: string[];
  brain: Pick<BrainSummary, "path" | "totalEvents" | "lastUpdated" | "stackHints" | "verifierHints" | "recentFailures">;
}

export interface ExecutionBriefInput extends SmartRouteInput {
  routeFacts?: SmartRoute;
  record?: boolean;
}

function preferredSkill(route: SmartRoute): string {
  switch (route.route) {
    case "direct-change":
      return "direct edit in current turn";
    case "lite-spec":
      return "/curdx-flow:start with lightweight spec";
    case "full-spec":
      return "/curdx-flow:start full spec workflow";
    case "epic-split":
      return "/curdx-flow:triage";
    case "scaffold":
      return "/curdx-flow:start scaffold path";
    case "product-inception":
      return "/curdx-flow:start product inception";
    case "greenfield-spec":
      return "/curdx-flow:start greenfield spec";
    case "prototype":
      return "/curdx-flow:start prototype spec";
    case "import-spec":
      return "/curdx-flow:start import spec";
    case "resume-current":
      return "/curdx-flow:implement or next missing phase";
    case "blocked-ask-user":
      return "ask one focused question";
  }
}

function agentPlan(route: SmartRoute): string[] {
  if (route.route === "direct-change" || route.route === "blocked-ask-user") return [];
  if (route.policy.reviewCadence === "strict" || route.policy.reviewCadence === "periodic") {
    return ["spec-executor", "spec-reviewer", "code-quality-reviewer"];
  }
  if (route.shouldUseSubagent) return ["spec-executor", "spec-reviewer"];
  return ["self-review before completion"];
}

function isolationPlan(route: SmartRoute): string {
  if (route.policy.risk === "critical" || route.route === "full-spec" || route.route === "epic-split") {
    return "prefer worktree isolation for executor tasks; do not touch release metadata unless task scope names it";
  }
  if (route.route === "direct-change") return "current workspace, minimal touched files";
  return "current workspace with bounded file ownership";
}

function taskShape(route: SmartRoute): string {
  if (!route.shouldCreateTasks) return "single bounded change; no tasks.md";
  const range = route.policy.taskTargetRange;
  return `${range.min}-${Math.min(range.max, route.taskCountLimit)} value-slice tasks, each with verifier`;
}

function readFirst(route: SmartRoute, input: SmartRouteInput): string[] {
  const out: string[] = [];
  const files = input.changedFiles?.slice(0, Math.max(1, route.contextBudget.maxReferenceFiles)) ?? [];
  out.push(...files);
  if (route.stackProfile.primary === "claude-code-plugin") {
    out.push("https://code.claude.com/docs/llms.txt");
    out.push("plugin manifest, hooks.json, touched skill/agent files");
  }
  if (route.qualityGates.some((gate) => gate.phase === "before-coding" && gate.required)) {
    out.push("official/current docs for the detected stack");
  }
  if (route.shouldCreateTasks) {
    out.push("nearest spec artifacts and tasks.md before editing");
  }
  if (route.contextBudget.level === "tiny") {
    return out.slice(0, Math.max(1, route.contextBudget.maxReferenceFiles));
  }
  return [...new Set(out)].slice(0, route.contextBudget.maxReferenceFiles);
}

function completionContract(route: SmartRoute, brain: BrainSummary): string[] {
  const verifier = route.suggestedVerifier.command ?? route.suggestedVerifier.fallback ?? undefined;
  const contract = [
    "Do not claim completion without fresh verification evidence from this turn.",
  ];
  if (verifier) {
    const suffix = /[.!?]$/.test(verifier) ? "" : ".";
    contract.push(`Run verifier: ${verifier}${suffix}`);
  }
  if (route.shouldCreateSpec) {
    contract.push("Record spec evidence with curdx-flow verify run when a spec phase is completed.");
  }
  if (route.policy.reviewCadence === "strict" || route.policy.reviewCadence === "periodic") {
    contract.push("Run spec-compliance review before code-quality review; fix blocking findings before proceeding.");
  }
  if (brain.recentFailures.length > 0) {
    contract.push("Check .curdx/brain.jsonl recent failures before reusing the same fix path.");
  }
  return contract;
}

function escalationRules(route: SmartRoute): string[] {
  const rules = [
    "Ask the user only when missing facts change implementation or access is blocked.",
    "If verifier fails twice for the same phase, switch to systematic debugging before more edits.",
  ];
  if (route.route === "blocked-ask-user" && route.blockedReason) {
    rules.unshift(route.blockedReason);
  }
  if (route.policy.risk === "critical") {
    rules.push("For release/security/plugin metadata changes, run official-docs check and plugin validation before tag/push.");
  }
  if (route.topology?.missingRoots && route.topology.missingRoots.length > 0) {
    rules.push(route.topology.accessFix ?? "Add required code roots before editing.");
  }
  return rules;
}

export function buildExecutionBrief(input: ExecutionBriefInput): ExecutionBrief {
  const route = input.routeFacts ?? classifySmartRoute(input);
  const cwd = input.cwd;
  const brain = summarizeProjectBrain(cwd);
  const verifier = route.suggestedVerifier.command ?? route.suggestedVerifier.fallback ?? undefined;
  const brief: ExecutionBrief = {
    version: 1,
    generatedAt: new Date().toISOString(),
    goal: input.goal ?? "",
    route: route.route,
    reason: route.reason,
    stack: route.stackProfile.primary,
    risk: route.policy.risk,
    context: {
      budget: route.contextBudget.level,
      maxReferenceFiles: route.contextBudget.maxReferenceFiles,
      readFirst: readFirst(route, input),
      avoid: ["node_modules", "dist/build outputs unless verifying generated artifacts", "old project docs as design authority"],
    },
    execution: {
      mode: route.policy.executionMode,
      primarySkill: preferredSkill(route),
      agents: agentPlan(route),
      isolation: isolationPlan(route),
      taskShape: taskShape(route),
    },
    qualityGates: route.qualityGates.map((gate) => ({
      id: gate.id,
      phase: gate.phase,
      required: gate.required,
      command: gate.command,
    })),
    completionContract: completionContract(route, brain),
    escalationRules: escalationRules(route),
    brain: {
      path: brain.path,
      totalEvents: brain.totalEvents,
      lastUpdated: brain.lastUpdated,
      stackHints: brain.stackHints,
      verifierHints: brain.verifierHints,
      recentFailures: brain.recentFailures,
    },
  };

  if (input.record === true) {
    appendBrainEvent(cwd, {
      type: "route-compiled",
      route: route.route,
      stack: route.stackProfile.primary,
      verifier,
      reason: route.reason,
      files: input.changedFiles?.length,
    });
  }
  return brief;
}

export function compactExecutionBrief(brief: ExecutionBrief): string {
  const verifier =
    brief.qualityGates.find((gate) => gate.required && gate.command !== null)?.command ??
    "repo verifier";
  const agents = brief.execution.agents.length > 0 ? brief.execution.agents.join("+") : "none";
  return [
    `brief(route=${brief.route}`,
    `stack=${brief.stack}`,
    `risk=${brief.risk}`,
    `read<=${brief.context.maxReferenceFiles}`,
    `skill=${brief.execution.primarySkill}`,
    `agents=${agents}`,
    `verifier=${verifier})`,
  ].join(" ");
}
