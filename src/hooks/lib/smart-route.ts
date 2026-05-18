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
import {
  discoverProjectTopology,
  type ProjectTopology,
  type WorkspaceState,
} from "./project-topology.js";
import {
  recommendToolCapabilities,
  type CapabilityRecommendation,
} from "./tool-capabilities.js";
import { stripKnownCapabilityTokens } from "./capability-normalization.js";
import { summarizeProjectBrain } from "./project-brain.js";
import {
  detectStackProfile,
  selectContextBudget,
  selectQualityGates,
  selectSuggestedVerifier,
  type ContextBudget,
  type QualityGate,
  type StackProfile,
  type SuggestedVerifier,
} from "./stack-capabilities.js";
import { findSpec, resolveCurrent } from "../_shared/path-resolver.js";

export type SmartRouteName =
  | "direct-change"
  | "lite-spec"
  | "full-spec"
  | "epic-split"
  | "scaffold"
  | "product-inception"
  | "greenfield-spec"
  | "prototype"
  | "import-spec"
  | "resume-current"
  | "blocked-ask-user";

export type IntentKind =
  | "scaffold"
  | "product"
  | "prototype"
  | "import-spec"
  | "feature"
  | "fix"
  | "refactor"
  | "release"
  | "unknown";

export type IntentClarity = "high" | "medium" | "low";
export type DeliveryExpectation =
  | "demo"
  | "usable-app"
  | "production"
  | "maintenance";

export interface SmartIntent {
  workspaceState: WorkspaceState;
  intentKind: IntentKind;
  clarity: IntentClarity;
  stackSpecified: boolean;
  artifactProvided: boolean;
  deliveryExpectation: DeliveryExpectation;
  missingFacts: string[];
  confidence: number;
  recommendedAction: string;
}

export interface SmartRouteInput {
  goal?: string;
  name?: string;
  flags?: string;
  changedFiles?: string[];
  estimatedFiles?: number;
  taskCount?: number;
  cwd?: string;
  availableCapabilities?: string[];
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
    "workspaceState" | "devContextFound" | "roots" | "requiredRoots" | "missingRoots" | "accessFix" | "warnings"
  >;
  intent: SmartIntent;
  stackProfile: StackProfile;
  qualityGates: QualityGate[];
  suggestedVerifier: SuggestedVerifier;
  contextBudget: ContextBudget;
  blockedReason?: string;
  recommendedCapabilities: CapabilityRecommendation[];
  policy: {
    mode: AutoPolicy["mode"];
    risk: AutoPolicy["risk"];
    executionMode: AutoPolicy["executionMode"];
    executionDriver: AutoPolicy["executionDriver"];
    taskGranularity: AutoPolicy["taskGranularity"];
    taskTargetRange: AutoPolicy["taskTargetRange"];
    reviewCadence: AutoPolicy["reviewCadence"];
    verificationLevel: AutoPolicy["verificationLevel"];
    subagentPolicy: AutoPolicy["subagentPolicy"];
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
    executionDriver: policy.executionDriver,
    taskGranularity: policy.taskGranularity,
    taskTargetRange: policy.taskTargetRange,
    reviewCadence: policy.reviewCadence,
    verificationLevel: policy.verificationLevel,
    subagentPolicy: policy.subagentPolicy,
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

const STACK_RE =
  /\b(vue|vue3|vite|pinia|vue router|react|next\.?js|nuxt|static html|vanilla js|index\.html|styles\.css|app\.js|spring|spring boot|spring cloud|maven|gradle|java|node|nestjs|fastapi|go|postgres|mysql|redis|docker)\b|前端|后端|全栈|全家桶/i;
const ARTIFACT_RE =
  /\b(prd|spec|requirements?|design doc|figma|wireframe|openapi|swagger|api doc|接口文档|产品文档|需求文档|设计稿|原型图)\b/i;
const SCAFFOLD_RE =
  /\b(scaffold|bootstrap|init|starter|template|skeleton|create project|create app|new project|setup project)\b|脚手架|初始化|搭建项目|创建项目|项目骨架|先搭骨架|搭骨架/i;
const PROTOTYPE_RE =
  /\b(prototype|poc|demo|spike|experiment|technical validation|prove|验证|原型|演示|技术验证|试验)\b/i;
const PRODUCT_RE =
  /\b(app|application|system|platform|saas|crm|dashboard|admin|portal|product|service|tool)\b|系统|平台|后台|管理端|应用|产品|工具|开发一套|做一个|做一套/i;
const PRODUCT_DOMAIN_HINT_RE =
  /\b(crm|customer|order|inventory|invoice|booking|calendar|todo|task|project|ticket|commerce|shop|blog|cms|dashboard|admin|user|auth|report)\b|客户|订单|库存|合同|发票|预约|日历|待办|任务|项目|工单|商城|电商|博客|内容|后台|用户|权限|登录|报表/i;
const FIX_RE =
  /\b(fix|bug|debug|repair|resolve|broken|regression|修复|报错|失败|排查|定位)\b/i;
const REFACTOR_RE =
  /\b(refactor|rewrite|cleanup|restructure|重构|重写|整理)\b/i;
const RELEASE_RE =
  /\b(release|publish|deploy|tag|上线|发布|部署|打包)\b/i;
const NPM_RELEASE_RE =
  /\bnpm\s+(publish|release|version|tag|dist-tag)\b|\bpublish(?:ing)?\s+(?:to\s+)?npm\b|\bnpm\s+package\b/i;
const DEMO_RE = /\b(demo|prototype|poc|演示|原型)\b/i;
const PRODUCTION_RE = /\b(production|prod|ship|launch|deploy|release|上线|生产|发布|可用|能用)\b/i;

function hasReleaseIntent(goal: string): boolean {
  return RELEASE_RE.test(goal) || NPM_RELEASE_RE.test(goal);
}

function classifyIntent(goal: string, topology: ProjectTopology): SmartIntent {
  const semanticGoal = stripKnownCapabilityTokens(goal);
  const artifactProvided = ARTIFACT_RE.test(semanticGoal);
  const stackSpecified = STACK_RE.test(semanticGoal);
  let intentKind: IntentKind = "unknown";
  if (artifactProvided) intentKind = "import-spec";
  else if (SCAFFOLD_RE.test(semanticGoal)) intentKind = "scaffold";
  else if (PROTOTYPE_RE.test(semanticGoal)) intentKind = "prototype";
  else if (hasReleaseIntent(semanticGoal)) intentKind = "release";
  else if (FIX_RE.test(semanticGoal)) intentKind = "fix";
  else if (REFACTOR_RE.test(semanticGoal)) intentKind = "refactor";
  else if (PRODUCT_RE.test(semanticGoal)) intentKind = "product";
  else if (goal.length > 0) intentKind = "feature";

  let deliveryExpectation: DeliveryExpectation = "maintenance";
  if (DEMO_RE.test(semanticGoal)) deliveryExpectation = "demo";
  else if (PRODUCTION_RE.test(semanticGoal)) deliveryExpectation = "production";
  else if (intentKind === "product" || topology.workspaceState === "empty") {
    deliveryExpectation = "usable-app";
  }

  const missingFacts: string[] = [];
  if (
    topology.workspaceState === "empty" &&
    intentKind === "product" &&
    !artifactProvided &&
    !PRODUCT_DOMAIN_HINT_RE.test(semanticGoal)
  ) {
    missingFacts.push("product domain, target user, MVP acceptance criteria");
  }
  if (
    topology.workspaceState === "empty" &&
    (intentKind === "product" || intentKind === "feature") &&
    !stackSpecified
  ) {
    missingFacts.push("preferred stack or permission to choose defaults");
  }
  if (intentKind === "prototype" && !/success|metric|prove|验证|成功|标准/i.test(semanticGoal)) {
    missingFacts.push("prototype success criterion");
  }

  let clarity: IntentClarity = "medium";
  if (artifactProvided || intentKind === "scaffold") clarity = "high";
  else if (missingFacts.length > 0) clarity = "low";
  else if (stackSpecified || intentKind === "fix" || intentKind === "refactor") clarity = "high";

  let confidence = 0.62;
  if (artifactProvided || SCAFFOLD_RE.test(semanticGoal) || PROTOTYPE_RE.test(semanticGoal)) confidence += 0.22;
  if (stackSpecified) confidence += 0.08;
  if (missingFacts.length > 0) confidence -= 0.18;
  confidence = Math.max(0.1, Math.min(0.98, Number(confidence.toFixed(2))));

  let recommendedAction = "route with deterministic policy";
  if (topology.workspaceState === "empty") {
    if (intentKind === "scaffold") {
      recommendedAction =
        "select an official/ecosystem scaffold source when available, create the requested skeleton, then run baseline verification";
    } else if (intentKind === "import-spec") {
      recommendedAction = "import the provided artifact, derive plan/tasks, then implement";
    } else if (intentKind === "prototype") {
      recommendedAction = "create a bounded prototype spec with an explicit success criterion";
    } else if (clarity === "low") {
      recommendedAction = "perform product inception before writing application code";
    } else {
      recommendedAction = "create greenfield spec with constitution and walking skeleton tasks";
    }
  }

  return {
    workspaceState: topology.workspaceState,
    intentKind,
    clarity,
    stackSpecified,
    artifactProvided,
    deliveryExpectation,
    missingFacts,
    confidence,
    recommendedAction,
  };
}

function routeFromIntent(intent: SmartIntent, policy: AutoPolicy): SmartRouteName {
  if (intent.workspaceState === "empty") {
    switch (intent.intentKind) {
      case "scaffold":
        return "scaffold";
      case "import-spec":
        return "import-spec";
      case "prototype":
        return "prototype";
      case "product":
        return intent.clarity === "low" ? "product-inception" : "greenfield-spec";
      case "feature":
        return intent.clarity === "low" ? "product-inception" : "greenfield-spec";
      default:
        return "product-inception";
    }
  }
  return routeFromPolicy(policy);
}

function reasonForRoute(route: SmartRouteName, policy: AutoPolicy, intent: SmartIntent): string {
  if (
    route === "scaffold" ||
    route === "product-inception" ||
    route === "greenfield-spec" ||
    route === "prototype" ||
    route === "import-spec"
  ) {
    return intent.recommendedAction;
  }
  return policy.reasons[0] ?? "deterministic policy classification";
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
    case "scaffold":
      return {
        nextAction:
          "Select an official/ecosystem scaffold source when available, create the requested skeleton, record assumptions, then run baseline verification.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: false,
        taskCountLimit: 1,
      };
    case "product-inception":
      return {
        nextAction:
          "Create product context first: mission, constraints, roadmap, tech-stack assumptions, and project constitution before application code.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: true,
        taskCountLimit: 0,
      };
    case "greenfield-spec":
      return {
        nextAction:
          "Create a greenfield spec with constitution, technical plan, walking skeleton, and vertical-slice tasks.",
        shouldCreateSpec: true,
        shouldCreateTasks: true,
        shouldUseSubagent: true,
        taskCountLimit: 10,
      };
    case "prototype":
      return {
        nextAction:
          "Create a bounded prototype spec, define the success criterion, implement the thinnest proof, and verify it.",
        shouldCreateSpec: true,
        shouldCreateTasks: true,
        shouldUseSubagent: false,
        taskCountLimit: 5,
      };
    case "import-spec":
      return {
        nextAction:
          "Import the provided PRD/spec/design/API artifact, normalize it into curdx-flow artifacts, then plan implementation.",
        shouldCreateSpec: true,
        shouldCreateTasks: true,
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
    workspaceState: topology.workspaceState,
    devContextFound: topology.devContextFound,
    roots: topology.roots,
    requiredRoots: topology.requiredRoots,
    missingRoots: topology.missingRoots,
    ...(topology.accessFix ? { accessFix: topology.accessFix } : {}),
    warnings: topology.warnings,
  };
}

function topologyKinds(topology: ProjectTopology): string[] {
  return [...new Set(topology.roots.flatMap((root) => root.kinds))];
}

function topologyFrameworks(topology: ProjectTopology): string[] {
  return [...new Set(topology.roots.flatMap((root) => root.frameworks))];
}

export function classifySmartRoute(input: SmartRouteInput): SmartRoute {
  const goal = normalizeText(input.goal);
  const cwd = input.cwd ?? process.cwd();
  const activeSpec = findActiveSpec({ ...input, cwd });
  const topology = discoverProjectTopology({ cwd, goal });
  const intent = classifyIntent(goal, topology);
  const policy = classifyAutoPolicy({
    goal,
    flags: input.flags,
    changedFiles: input.changedFiles,
    estimatedFiles: input.estimatedFiles,
    taskCount: input.taskCount,
  });
  const routeCandidate = routeFromIntent(intent, policy);
  const stackProfile = detectStackProfile({
    cwd,
    goal,
    topology,
    route: routeCandidate,
    risk: policy.risk,
  });
  const qualityGates = selectQualityGates({
    cwd,
    goal,
    topology,
    route: routeCandidate,
    risk: policy.risk,
    stackProfile,
  });
  const suggestedVerifier = selectSuggestedVerifier({
    cwd,
    goal,
    topology,
    route: routeCandidate,
    risk: policy.risk,
    stackProfile,
    qualityGates,
  });
  const contextBudget = selectContextBudget({
    cwd,
    goal,
    topology,
    route: routeCandidate,
    risk: policy.risk,
    stackProfile,
  });
  const brain = summarizeProjectBrain(cwd);
  const recommendations = recommendToolCapabilities({
    goal,
    route: routeCandidate,
    risk: policy.risk,
    topologyKinds: topologyKinds(topology),
    topologyFrameworks: topologyFrameworks(topology),
    stackProfile,
    qualityGates,
    contextBudget,
    missingRoots: topology.missingRoots.length,
    availableCapabilities: input.availableCapabilities,
    recentFailures: brain.recentFailures.length,
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
      intent,
      stackProfile,
      qualityGates,
      suggestedVerifier,
      contextBudget,
      recommendedCapabilities: [],
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
      intent,
      stackProfile,
      qualityGates,
      suggestedVerifier,
      contextBudget,
      recommendedCapabilities: recommendations,
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
        intent,
        stackProfile,
        qualityGates,
        suggestedVerifier,
        contextBudget,
        recommendedCapabilities: recommendations,
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
      intent,
      stackProfile,
      qualityGates,
      suggestedVerifier,
      contextBudget,
      recommendedCapabilities: [],
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
      intent,
      stackProfile,
      qualityGates,
      suggestedVerifier,
      contextBudget,
      recommendedCapabilities: [],
      policy: publicPolicy(policy),
      reasons: ["related code root is outside current Claude Code access"],
    };
  }

  const route = routeCandidate;
  const defaults = routeDefaults(route);
  return {
    version: 1,
    route,
    reason: reasonForRoute(route, policy, intent),
    ...defaults,
    topology: publicTopology(topology),
    intent,
    stackProfile,
    qualityGates,
    suggestedVerifier,
    contextBudget,
    recommendedCapabilities: recommendations,
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
  const availableCapabilities = parseList(readArg("--available-capabilities", argv));
  const estimatedRaw = readArg("--estimated-files", argv);
  const taskRaw = readArg("--task-count", argv);
  const route = classifySmartRoute({
    goal,
    name,
    flags,
    cwd,
    changedFiles: files,
    availableCapabilities:
      availableCapabilities.length > 0 ? availableCapabilities : undefined,
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
