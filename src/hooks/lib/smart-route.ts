// src/hooks/lib/smart-route.ts
//
// Deterministic behavior router for curdx-flow slash skills.
//
// This helper converts cheap facts (user goal, flags, active spec state, and
// optional file/task estimates) into action-oriented route names. The route
// names are intentionally written for LLM consumption: they describe what to
// do, not a human-facing size label.

import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyAutoPolicy, type AutoPolicy } from "./auto-policy.js";
import { discoverProjectTopology, type ProjectTopology } from "./project-topology.js";
import { findSpec, resolveCurrent } from "../_shared/path-resolver.js";

export type SmartRouteName =
  | "direct-change"
  | "lite-spec"
  | "full-spec"
  | "epic-split"
  | "resume-current"
  | "blocked-ask-user";

export interface SmartRouteInput {
  goal?: string;
  name?: string;
  flags?: string;
  changedFiles?: string[];
  estimatedFiles?: number;
  taskCount?: number;
  cwd?: string;
}

export interface SmartRoute {
  version: 1;
  route: SmartRouteName;
  nextAction: string;
  reason: string;
  shouldCreateSpec: boolean;
  shouldCreateTasks: boolean;
  shouldUseSubagent: boolean;
  taskCountLimit: number;
  activeSpec?: {
    name: string;
    path: string;
    phase: string;
    completed: boolean;
  };
  topology?: Pick<
    ProjectTopology,
    "devContextFound" | "roots" | "requiredRoots" | "missingRoots" | "accessFix" | "warnings"
  >;
  blockedReason?: string;
  policy: {
    mode: AutoPolicy["mode"];
    risk: AutoPolicy["risk"];
    executionMode: AutoPolicy["executionMode"];
    taskGranularity: AutoPolicy["taskGranularity"];
    taskTargetRange: AutoPolicy["taskTargetRange"];
    reviewCadence: AutoPolicy["reviewCadence"];
    verificationLevel: AutoPolicy["verificationLevel"];
    subagentPolicy: AutoPolicy["subagentPolicy"];
    stopHookPolicy: AutoPolicy["stopHookPolicy"];
    maxGlobalIterations: AutoPolicy["maxGlobalIterations"];
    maxTaskIterations: AutoPolicy["maxTaskIterations"];
    shouldSplitSpec: AutoPolicy["shouldSplitSpec"];
  };
  reasons: string[];
}

interface ActiveSpecState {
  name: string;
  path: string;
  phase: string;
  completed: boolean;
}

function normalizeText(input: string | undefined): string {
  return (input ?? "").trim().replace(/\s+/g, " ");
}

function hasFlag(flags: string | undefined, flag: string): boolean {
  return new RegExp(`(^|\\s)${flag.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(\\s|$)`).test(
    flags ?? "",
  );
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function readArg(name: string, argv: string[]): string | undefined {
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

function specNameFromPath(specPath: string): string {
  const parts = specPath.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? specPath;
}

function loadActiveSpecFromPath(cwd: string, specPath: string): ActiveSpecState {
  const statePath = join(cwd, specPath, ".curdx-state.json");
  let phase = "unknown";
  let completed = false;
  if (existsSync(statePath)) {
    try {
      const parsed = JSON.parse(readFileSync(statePath, "utf8")) as {
        phase?: unknown;
        completed?: unknown;
      };
      if (typeof parsed.phase === "string" && parsed.phase.trim().length > 0) {
        phase = parsed.phase;
      }
      completed = parsed.completed === true;
    } catch {
      phase = "unknown";
    }
  } else if (existsSync(join(cwd, specPath, "tasks.md"))) {
    phase = "execution";
  } else if (existsSync(join(cwd, specPath, "design.md"))) {
    phase = "tasks";
  } else if (existsSync(join(cwd, specPath, "requirements.md"))) {
    phase = "design";
  } else if (existsSync(join(cwd, specPath, "research.md"))) {
    phase = "requirements";
  }

  return {
    name: specNameFromPath(specPath),
    path: specPath,
    phase,
    completed,
  };
}

function findActiveSpec(input: SmartRouteInput): ActiveSpecState | undefined {
  const cwd = input.cwd ?? process.cwd();
  const fresh = hasFlag(input.flags, "--fresh");
  if (fresh) return undefined;

  const explicitName = normalizeText(input.name);
  if (explicitName) {
    const found = findSpec(explicitName, { cwd });
    if (found.ok) return loadActiveSpecFromPath(cwd, found.path);
    return undefined;
  }

  const current = resolveCurrent({ cwd });
  if (current === null) return undefined;
  return loadActiveSpecFromPath(cwd, current);
}

function nextActionForActiveSpec(spec: ActiveSpecState): string {
  if (spec.completed) {
    return `Active spec '${spec.name}' is completed; start a new spec or run /curdx-flow:refactor ${spec.name}.`;
  }
  switch (spec.phase) {
    case "research":
      return `Continue '${spec.name}' with /curdx-flow:requirements after reviewing research.md.`;
    case "requirements":
      return `Continue '${spec.name}' with /curdx-flow:design.`;
    case "design":
      return `Continue '${spec.name}' with /curdx-flow:tasks.`;
    case "tasks":
      return `Continue '${spec.name}' with /curdx-flow:implement.`;
    case "execution":
      return `Resume '${spec.name}' with /curdx-flow:implement.`;
    default:
      return `Inspect '${spec.name}' with /curdx-flow:status, then continue the next missing phase.`;
  }
}

function publicPolicy(policy: AutoPolicy): SmartRoute["policy"] {
  return {
    mode: policy.mode,
    risk: policy.risk,
    executionMode: policy.executionMode,
    taskGranularity: policy.taskGranularity,
    taskTargetRange: policy.taskTargetRange,
    reviewCadence: policy.reviewCadence,
    verificationLevel: policy.verificationLevel,
    subagentPolicy: policy.subagentPolicy,
    stopHookPolicy: policy.stopHookPolicy,
    maxGlobalIterations: policy.maxGlobalIterations,
    maxTaskIterations: policy.maxTaskIterations,
    shouldSplitSpec: policy.shouldSplitSpec,
  };
}

function routeFromPolicy(policy: AutoPolicy): SmartRouteName {
  if (policy.shouldSplitSpec || policy.executionMode === "epic-triage") {
    return "epic-split";
  }
  if (policy.executionMode === "direct") return "direct-change";
  if (policy.executionMode === "spec-lite") return "lite-spec";
  return "full-spec";
}

function routeDefaults(route: SmartRouteName): Pick<
  SmartRoute,
  "nextAction" | "shouldCreateSpec" | "shouldCreateTasks" | "shouldUseSubagent" | "taskCountLimit"
> {
  switch (route) {
    case "direct-change":
      return {
        nextAction: "Handle directly in the current turn; do not create a spec or tasks.md.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: false,
        taskCountLimit: 1,
      };
    case "lite-spec":
      return {
        nextAction:
          "Create a lightweight spec and 1-3 value-slice tasks, then execute without unnecessary subagents.",
        shouldCreateSpec: true,
        shouldCreateTasks: true,
        shouldUseSubagent: false,
        taskCountLimit: 3,
      };
    case "full-spec":
      return {
        nextAction:
          "Run the full research, requirements, design, tasks, and implementation workflow.",
        shouldCreateSpec: true,
        shouldCreateTasks: true,
        shouldUseSubagent: true,
        taskCountLimit: 12,
      };
    case "epic-split":
      return {
        nextAction:
          "Run /curdx-flow:triage; do not force this work into one oversized spec.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: true,
        taskCountLimit: 12,
      };
    case "resume-current":
      return {
        nextAction: "Resume the active spec at its next incomplete phase.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: true,
        taskCountLimit: 12,
      };
    case "blocked-ask-user":
      return {
        nextAction: "Ask one focused question before continuing.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: false,
        taskCountLimit: 0,
      };
  }
}

function publicTopology(topology: ProjectTopology): SmartRoute["topology"] {
  return {
    devContextFound: topology.devContextFound,
    roots: topology.roots,
    requiredRoots: topology.requiredRoots,
    missingRoots: topology.missingRoots,
    ...(topology.accessFix ? { accessFix: topology.accessFix } : {}),
    warnings: topology.warnings,
  };
}

export function classifySmartRoute(input: SmartRouteInput): SmartRoute {
  const goal = normalizeText(input.goal);
  const cwd = input.cwd ?? process.cwd();
  const activeSpec = findActiveSpec({ ...input, cwd });
  const topology = discoverProjectTopology({ cwd, goal });
  const policy = classifyAutoPolicy({
    goal,
    flags: input.flags,
    changedFiles: input.changedFiles,
    estimatedFiles: input.estimatedFiles,
    taskCount: input.taskCount,
  });

  if (activeSpec !== undefined && !activeSpec.completed && goal.length === 0) {
    return {
      version: 1,
      route: "resume-current",
      reason: "active unfinished spec found and no new goal was provided",
      activeSpec,
      ...routeDefaults("resume-current"),
      nextAction: nextActionForActiveSpec(activeSpec),
      topology: publicTopology(topology),
      policy: publicPolicy(policy),
      reasons: ["active unfinished spec"],
    };
  }

  if (
    activeSpec !== undefined &&
    !activeSpec.completed &&
    normalizeText(input.name).length > 0 &&
    goal.length > 0
  ) {
    return {
      version: 1,
      route: "blocked-ask-user",
      reason: "requested spec already exists and is unfinished",
      activeSpec,
      blockedReason:
        "Ask whether to resume the existing spec or rerun with --fresh for new work.",
      ...routeDefaults("blocked-ask-user"),
      topology: publicTopology(topology),
      policy: publicPolicy(policy),
      reasons: ["existing unfinished spec with new goal text"],
    };
  }

  const explicitName = normalizeText(input.name);
  if (explicitName && !hasFlag(input.flags, "--fresh")) {
    const found = findSpec(explicitName, { cwd });
    if (!found.ok && found.reason === "ambiguous") {
      return {
        version: 1,
        route: "blocked-ask-user",
        reason: "multiple specs match the requested name",
        blockedReason: `Ambiguous spec '${explicitName}': ${found.matches.join(", ")}`,
        ...routeDefaults("blocked-ask-user"),
        topology: publicTopology(topology),
        policy: publicPolicy(policy),
        reasons: ["ambiguous spec name"],
      };
    }
  }

  if (goal.length === 0) {
    return {
      version: 1,
      route: "blocked-ask-user",
      reason: "no goal and no resumable active spec",
      blockedReason: "Ask for the goal or a spec name.",
      ...routeDefaults("blocked-ask-user"),
      topology: publicTopology(topology),
      policy: publicPolicy(policy),
      reasons: ["missing goal"],
    };
  }

  if (topology.missingRoots.length > 0) {
    const missing = topology.missingRoots
      .map((root) => `${root.name} (${root.path})`)
      .join(", ");
    return {
      version: 1,
      route: "blocked-ask-user",
      reason: "related code root is not accessible",
      blockedReason:
        `Goal requires ${missing}. ${topology.accessFix ?? "Add the missing root before continuing."}`,
      ...routeDefaults("blocked-ask-user"),
      nextAction: topology.accessFix ?? "Add the missing code root, then rerun /curdx-flow:start.",
      topology: publicTopology(topology),
      policy: publicPolicy(policy),
      reasons: ["related code root is outside current Claude Code access"],
    };
  }

  const route = routeFromPolicy(policy);
  const defaults = routeDefaults(route);
  return {
    version: 1,
    route,
    reason: policy.reasons[0] ?? "deterministic policy classification",
    ...defaults,
    topology: publicTopology(topology),
    policy: publicPolicy(policy),
    reasons: policy.reasons,
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  const goal = readArg("--goal", argv) ?? "";
  const name = readArg("--name", argv);
  const flags = readArg("--flags", argv) ?? "";
  const cwd = readArg("--cwd", argv);
  const files = parseList(readArg("--files", argv));
  const estimatedRaw = readArg("--estimated-files", argv);
  const taskRaw = readArg("--task-count", argv);
  const route = classifySmartRoute({
    goal,
    name,
    flags,
    cwd,
    changedFiles: files,
    estimatedFiles: estimatedRaw === undefined ? undefined : Number(estimatedRaw),
    taskCount: taskRaw === undefined ? undefined : Number(taskRaw),
  });
  process.stdout.write(JSON.stringify(route, null, 2) + "\n");
}

function isDirectRun(): boolean {
  try {
    const entry = fileURLToPath(import.meta.url);
    return process.argv[1] === entry && basename(entry).startsWith("smart-route.");
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main();
}
