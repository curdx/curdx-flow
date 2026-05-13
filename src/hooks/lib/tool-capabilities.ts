// src/hooks/lib/tool-capabilities.ts
//
// Compact third-party capability router for curdx-flow.
//
// This file is intentionally pure and cheap: it never shells out to Claude Code
// or MCP servers. The installer/runner passes installed items when it has them;
// smart-route uses goal/topology facts and leaves availability to Claude Code's
// actual tool surface.

import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ContextBudget,
  QualityGate,
  StackProfile,
} from "./stack-capabilities.js";
import { stripKnownCapabilityTokens } from "./capability-normalization.js";

export type ToolCapabilityId =
  | "claude-mem"
  | "context7"
  | "sequential-thinking"
  | "chrome-devtools-mcp"
  | "frontend-design"
  | "pua"
  | "docs-query"
  | "browser-verification"
  | "tdd-cycle"
  | "security-review"
  | "stack-specific-verification"
  | "context-budget";

export type CapabilityToolType = "plugin" | "mcp" | "workflow" | "policy";

export type CapabilityOwner =
  | "claude-mem"
  | "context7"
  | "sequential-thinking"
  | "chrome-devtools-mcp"
  | "frontend-design"
  | "pua"
  | "curdx-flow";

export type CurdxCapabilityRole =
  | "recommend"
  | "gate"
  | "record-evidence"
  | "compile-brief"
  | "route";

export type CapabilityPhase =
  | "before-coding"
  | "planning"
  | "implementation"
  | "verification"
  | "recovery";

export type CapabilityAvailability =
  | "plugin-dependency"
  | "external-expected"
  | "core-required"
  | "known-available"
  | "check-if-installed";

export type CapabilityAvailabilityState =
  | "available"
  | "expected"
  | "missing"
  | "workflow";

export type CapabilityProvisioning =
  | "plugin-dependency"
  | "external-mcp"
  | "workflow";

export interface ToolCapability {
  id: ToolCapabilityId;
  name: string;
  type: CapabilityToolType;
  ownedBy: CapabilityOwner;
  provisioning: CapabilityProvisioning;
  curdxRole: CurdxCapabilityRole[];
  doNotReimplement: boolean;
  expectedByDefault: boolean;
  invocation: string;
  summary: string;
  useWhen: string;
  skipWhen: string;
  missingAction?: string;
}

export interface CapabilityRoutingInput {
  goal?: string;
  route?: string;
  risk?: string;
  topologyKinds?: string[];
  topologyFrameworks?: string[];
  stackProfile?: StackProfile;
  qualityGates?: QualityGate[];
  contextBudget?: ContextBudget;
  missingRoots?: number;
  availableCapabilities?: string[];
  recentFailures?: number;
}

export interface CapabilityRecommendation {
  id: ToolCapabilityId;
  name: string;
  type: CapabilityToolType;
  invocation: string;
  phase: CapabilityPhase;
  category?: "docs" | "verification" | "tdd" | "security" | "context" | "recovery";
  availability: CapabilityAvailability;
  availabilityState: CapabilityAvailabilityState;
  ownedBy: CapabilityOwner;
  provisioning: CapabilityProvisioning;
  curdxRole: CurdxCapabilityRole[];
  doNotReimplement: boolean;
  expectedByDefault: boolean;
  missingAction?: string;
  reason: string;
  instruction: string;
  stackIds?: string[];
}

const CAPABILITIES: Record<ToolCapabilityId, ToolCapability> = {
  "context7": {
    id: "context7",
    name: "Context7",
    type: "mcp",
    ownedBy: "context7",
    provisioning: "external-mcp",
    curdxRole: ["recommend", "gate"],
    doNotReimplement: true,
    expectedByDefault: true,
    invocation: "Context7 MCP",
    summary: "current docs for libraries, SDKs, APIs, and frameworks",
    useWhen: "use the Context7 MCP before implementation when external library, SDK, API, or framework behavior matters.",
    skipWhen: "Skip for pure local logic, typos, and code paths fully understood from this repository.",
    missingAction: "Enable the external context7 MCP server from your setup script or configure https://mcp.context7.com/mcp.",
  },
  "claude-mem": {
    id: "claude-mem",
    name: "claude-mem",
    type: "plugin",
    ownedBy: "claude-mem",
    provisioning: "plugin-dependency",
    curdxRole: ["recommend"],
    doNotReimplement: true,
    expectedByDefault: true,
    invocation: "/claude-mem:mem-search",
    summary: "cross-session memory search and phased plan/execution commands",
    useWhen: "Use /claude-mem:mem-search when similar work, prior decisions, or repeated failures may exist; use /claude-mem:make-plan only for genuinely phased work.",
    skipWhen: "Skip when the task is new, obvious, and smaller than a short local edit.",
    missingAction: "Install/enable claude-mem from the thedotmack marketplace dependency.",
  },
  "sequential-thinking": {
    id: "sequential-thinking",
    name: "sequential-thinking",
    type: "mcp",
    ownedBy: "sequential-thinking",
    provisioning: "external-mcp",
    curdxRole: ["recommend"],
    doNotReimplement: true,
    expectedByDefault: true,
    invocation: "sequential-thinking MCP",
    summary: "structured hypothesis breakdown for hard architecture and debugging problems",
    useWhen: "Use for architecture tradeoffs, migrations, security/data/release risk, or debugging where assumptions may change.",
    skipWhen: "Skip for direct edits, simple lookups, and deterministic fixes.",
    missingAction: "Enable the external sequential-thinking MCP server from your setup script.",
  },
  "chrome-devtools-mcp": {
    id: "chrome-devtools-mcp",
    name: "Chrome DevTools MCP",
    type: "plugin",
    ownedBy: "chrome-devtools-mcp",
    provisioning: "plugin-dependency",
    curdxRole: ["recommend", "gate"],
    doNotReimplement: true,
    expectedByDefault: true,
    invocation: "Chrome DevTools MCP",
    summary: "real browser console, network, DOM, performance, and screenshot/snapshot verification",
    useWhen: "Use for browser runtime behavior, UI regressions, DOM/CSS issues, network failures, and frontend verification.",
    skipWhen: "Skip for backend-only code with no browser-facing behavior.",
    missingAction: "Install/enable chrome-devtools-mcp and make sure Chrome is installed.",
  },
  "frontend-design": {
    id: "frontend-design",
    name: "frontend-design",
    type: "plugin",
    ownedBy: "frontend-design",
    provisioning: "plugin-dependency",
    curdxRole: ["recommend"],
    doNotReimplement: true,
    expectedByDefault: true,
    invocation: "frontend-design plugin skills",
    summary: "frontend UX/design guidance for UI pages, components, and interaction polish",
    useWhen: "Use when building or changing visible UI, interaction design, frontend layout, or visual quality.",
    skipWhen: "Skip for backend-only changes, copy-only edits, and internal CLI/library work.",
    missingAction: "Install/enable frontend-design from the official plugin marketplace.",
  },
  "pua": {
    id: "pua",
    name: "pua",
    type: "plugin",
    ownedBy: "pua",
    provisioning: "plugin-dependency",
    curdxRole: ["recommend"],
    doNotReimplement: true,
    expectedByDefault: true,
    invocation: "/pua:pua-loop or /pua:p9",
    summary: "structured retries and parallel task decomposition",
    useWhen: "Use after multiple failed attempts or for truly independent parallel work slices.",
    skipWhen: "Skip on first-attempt failures, known fixes, and work that is sequential by dependency.",
    missingAction: "Install/enable pua from the pua-skills marketplace dependency.",
  },
  "docs-query": {
    id: "docs-query",
    name: "Docs query",
    type: "workflow",
    ownedBy: "curdx-flow",
    provisioning: "workflow",
    curdxRole: ["gate"],
    doNotReimplement: false,
    expectedByDefault: true,
    invocation: "Context7 or official docs",
    summary: "phase-specific grounding against current documentation",
    useWhen: "Use before implementation when quality gates mark docs as required.",
    skipWhen: "Skip when local code fully defines the behavior and no external API/version matters.",
  },
  "browser-verification": {
    id: "browser-verification",
    name: "Browser verification",
    type: "workflow",
    ownedBy: "curdx-flow",
    provisioning: "workflow",
    curdxRole: ["gate", "record-evidence"],
    doNotReimplement: false,
    expectedByDefault: true,
    invocation: "Playwright or Chrome DevTools MCP",
    summary: "repeatable browser/runtime proof for UI and full-stack behavior",
    useWhen: "Use when browser-facing quality gates are required or suggested.",
    skipWhen: "Skip for backend-only and CLI-only work.",
  },
  "tdd-cycle": {
    id: "tdd-cycle",
    name: "TDD cycle",
    type: "workflow",
    ownedBy: "curdx-flow",
    provisioning: "workflow",
    curdxRole: ["gate"],
    doNotReimplement: false,
    expectedByDefault: true,
    invocation: "RED/GREEN/VERIFY loop",
    summary: "test-first implementation for behavior changes",
    useWhen: "Use when route/risk indicates implementation should be protected by a regression test.",
    skipWhen: "Skip for docs-only edits and pure mechanical metadata updates.",
  },
  "security-review": {
    id: "security-review",
    name: "Security review",
    type: "workflow",
    ownedBy: "curdx-flow",
    provisioning: "workflow",
    curdxRole: ["gate"],
    doNotReimplement: false,
    expectedByDefault: true,
    invocation: "read-only security review",
    summary: "focused review of auth, secrets, injection, release, and dependency risk",
    useWhen: "Use when quality gates indicate auth/security/release risk.",
    skipWhen: "Skip for isolated copy edits with no executable behavior.",
  },
  "stack-specific-verification": {
    id: "stack-specific-verification",
    name: "Stack-specific verification",
    type: "workflow",
    ownedBy: "curdx-flow",
    provisioning: "workflow",
    curdxRole: ["gate", "record-evidence"],
    doNotReimplement: false,
    expectedByDefault: true,
    invocation: "curdx-flow route qualityGates",
    summary: "run the verifier that matches the detected stack profile",
    useWhen: "Use before completion whenever smart-route returns a suggestedVerifier.",
    skipWhen: "Skip only when no stack profile is detected and no repo verifier exists.",
  },
  "context-budget": {
    id: "context-budget",
    name: "Context budget",
    type: "policy",
    ownedBy: "curdx-flow",
    provisioning: "workflow",
    curdxRole: ["route", "compile-brief"],
    doNotReimplement: false,
    expectedByDefault: true,
    invocation: "curdx-flow route contextBudget",
    summary: "limit reference loading by route and stack confidence",
    useWhen: "Use for every non-trivial route to keep the session focused.",
    skipWhen: "Skip only for no-op direct changes.",
  },
};

const ORDER: ToolCapabilityId[] = [
  "context7",
  "docs-query",
  "claude-mem",
  "frontend-design",
  "chrome-devtools-mcp",
  "browser-verification",
  "tdd-cycle",
  "security-review",
  "stack-specific-verification",
  "context-budget",
  "sequential-thinking",
  "pua",
];

const EXTERNAL_DOCS_RE =
  /\b(api|sdk|library|libraries|framework|version|upgrade|dependency|dependencies|official docs?|latest docs?|claude code|plugin|mcp|hook|hooks|skill|skills|agent|agents|scaffold|starter|template|generator|initializer|initializr|react|vue|spring|spring boot|spring cloud|next\.?js|vite|webpack|npm|node|go|python|rust|cargo|maven|gradle|cookiecutter)\b|最新|依赖|框架|插件|官方|联网|搜索|文档|脚手架|初始化|生成器|模板/i;

const MEMORY_RE =
  /\b(previous|before|again|remember|memory|history|similar|repeated|regression|already solved|same bug|past decision)\b|之前|上次|记得|历史|做过|又|重复|老问题/i;

const UI_RE =
  /\b(ui|ux|frontend|front-end|browser|chrome|dom|css|html|layout|component|page|form|modal|responsive|visual|render|react|vue|vite|next\.?js|screenshot|interaction)\b|前端|页面|浏览器|样式|交互|组件|布局|视觉|截图/i;

const BROWSER_VERIFY_RE =
  /\b(browser|chrome|dom|css|network|console|performance|render|screenshot|e2e|playwright|visual regression|interaction)\b|浏览器|控制台|网络|性能|渲染|截图|端到端/i;

const COMPLEX_RE =
  /\b(architecture|architect|migration|migrate|security|auth|authentication|authorization|permission|oauth|payment|billing|database|schema|release|publish|npm|tag|hook|subagent|multi[- ]?repo|monorepo|cross[- ]?system|concurrency|race|cache|rewrite|refactor)\b|架构|迁移|安全|权限|认证|数据库|发布|重写|并发|跨仓库|多仓库/i;

const STUCK_RE =
  /\b(stuck|failed|failure|fails|flaky|retry|debug|investigate|root cause|not working|broken|regression)\b|卡住|失败|报错|不行|修不好|定位|排查/i;

const REPEATED_FAILURE_RE =
  /\b(repeated|multiple failed|failed twice|failed 2|again failed|keeps failing|stuck again)\b|连续失败|多次失败|失败两次|又失败|反复失败|一直失败/i;

const PARALLEL_RE =
  /\b(parallel|multi-agent|team|decompose|split|epic|multiple subsystems|large refactor)\b|并行|多智能体|拆分|史诗|多模块/i;

const LOW_RISK_LOCAL_RE =
  /\b(typo|readme|docs?|comment|comments|copy|wording|rename label|format text)\b|错别字|注释|文案/i;

function normalize(input: string | undefined): string {
  return (input ?? "").trim().replace(/\s+/g, " ");
}

function hasAny(values: string[] | undefined, candidates: string[]): boolean {
  const set = new Set((values ?? []).map((v) => v.toLowerCase()));
  return candidates.some((candidate) => set.has(candidate.toLowerCase()));
}

function capabilityAvailability(
  id: ToolCapabilityId,
  available: Set<string> | null,
): {
  availability: CapabilityAvailability;
  availabilityState: CapabilityAvailabilityState;
} {
  const cap = CAPABILITIES[id];
  if (cap.type === "workflow" || cap.type === "policy") {
    return { availability: "known-available", availabilityState: "workflow" };
  }
  const expectedAvailability =
    cap.provisioning === "external-mcp" ? "external-expected" : "plugin-dependency";
  if (available === null) {
    return {
      availability: cap.expectedByDefault ? expectedAvailability : "check-if-installed",
      availabilityState: cap.expectedByDefault ? "expected" : "missing",
    };
  }
  if (available.has(id)) {
    return { availability: "known-available", availabilityState: "available" };
  }
  return {
    availability: cap.expectedByDefault ? expectedAvailability : "check-if-installed",
    availabilityState: "missing",
  };
}

function pushRecommendation(
  out: CapabilityRecommendation[],
  available: Set<string> | null,
  id: ToolCapabilityId,
  phase: CapabilityPhase,
  reason: string,
  instruction: string,
  extra: Pick<CapabilityRecommendation, "category" | "stackIds"> = {},
): void {
  const availability = capabilityAvailability(id, available);
  if (out.some((rec) => rec.id === id)) return;
  const cap = CAPABILITIES[id];
  out.push({
    id,
    name: cap.name,
    type: cap.type,
    invocation: cap.invocation,
    phase,
    ...extra,
    availability: availability.availability,
    availabilityState: availability.availabilityState,
    ownedBy: cap.ownedBy,
    provisioning: cap.provisioning,
    curdxRole: cap.curdxRole,
    doNotReimplement: cap.doNotReimplement,
    expectedByDefault: cap.expectedByDefault,
    ...(availability.availabilityState === "missing" && cap.missingAction
      ? { missingAction: cap.missingAction }
      : {}),
    reason,
    instruction,
  });
}

function sortRecommendations(
  recs: CapabilityRecommendation[],
): CapabilityRecommendation[] {
  return [...recs].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
}

export function knownToolCapabilities(): ToolCapability[] {
  return ORDER.map((id) => CAPABILITIES[id]);
}

export function recommendToolCapabilities(
  input: CapabilityRoutingInput,
): CapabilityRecommendation[] {
  const goal = normalize(input.goal);
  const semanticGoal = normalize(stripKnownCapabilityTokens(goal));
  const route = normalize(input.route);
  const risk = normalize(input.risk);
  const topologyKinds = input.topologyKinds ?? [];
  const topologyFrameworks = input.topologyFrameworks ?? [];
  const stackProfile = input.stackProfile;
  const qualityGates = input.qualityGates ?? [];
  const contextBudget = input.contextBudget;
  const missingRoots = input.missingRoots ?? 0;
  const available =
    input.availableCapabilities === undefined
      ? null
      : new Set(input.availableCapabilities.filter(Boolean));

  const recs: CapabilityRecommendation[] = [];
  if (missingRoots > 0) {
    return recs;
  }

  const externalDocsRelevant = EXTERNAL_DOCS_RE.test(semanticGoal);
  const localLowRisk =
    LOW_RISK_LOCAL_RE.test(semanticGoal) && route === "direct-change" && !externalDocsRelevant;
  if (localLowRisk) {
    return recs;
  }

  const hasFrontend =
    UI_RE.test(semanticGoal) ||
    hasAny(topologyKinds, ["frontend-app"]) ||
    hasAny(topologyFrameworks, ["react", "vue", "next.js", "vite"]);
  const browserRuntime = BROWSER_VERIFY_RE.test(semanticGoal) || hasFrontend;
  const complex =
    (COMPLEX_RE.test(semanticGoal) && route !== "direct-change") ||
    risk === "high" ||
    risk === "critical" ||
    route === "full-spec" ||
    route === "epic-split";
  const stuck = STUCK_RE.test(semanticGoal);
  const repeatedFailure = REPEATED_FAILURE_RE.test(semanticGoal) || (input.recentFailures ?? 0) >= 2;
  const parallel = PARALLEL_RE.test(semanticGoal) || route === "epic-split";
  const stackIds = stackProfile?.detected.map((stack) => stack.id) ?? [];
  const docsGate = qualityGates.find((gate) => gate.id.endsWith("-docs"));
  const browserGate = qualityGates.find((gate) => gate.id.endsWith("-browser"));
  const tddGate = qualityGates.find((gate) => gate.id.endsWith("-tdd"));
  const securityGate = qualityGates.find((gate) => gate.id.endsWith("-security-review"));
  const baselineGate = qualityGates.find((gate) => gate.id.endsWith("-baseline"));

  if (externalDocsRelevant || docsGate?.required === true) {
    pushRecommendation(
      recs,
      available,
      "context7",
      "before-coding",
      docsGate?.reason ?? "external documentation or current API behavior is likely relevant",
      stackProfile?.primary === "claude-code-plugin"
        ? "Start from official Claude Code docs; use Context7 only for external library/framework docs."
        : "Use Context7 before editing so version-specific library behavior is grounded in current docs.",
      { category: "docs", stackIds },
    );
    pushRecommendation(
      recs,
      available,
      "docs-query",
      "before-coding",
      docsGate?.reason ?? "documentation grounding should happen before implementation",
      "Query official/current docs first, then summarize only the decisions that affect this route.",
      { category: "docs", stackIds },
    );
  }

  if (MEMORY_RE.test(semanticGoal) || stuck || route === "full-spec" || route === "epic-split") {
    pushRecommendation(
      recs,
      available,
      "claude-mem",
      "planning",
      "similar prior work or longer-running plan may exist",
      "Search memory before planning; use make-plan only when the work is genuinely phased.",
      { category: "context", stackIds },
    );
  }

  if (hasFrontend) {
    pushRecommendation(
      recs,
      available,
      "frontend-design",
      "implementation",
      "visible frontend behavior or UI quality is in scope",
      "Use frontend-design guidance for UI structure, interaction, responsive behavior, and visual polish.",
      { category: "verification", stackIds },
    );
  }

  if (browserRuntime || browserGate !== undefined) {
    pushRecommendation(
      recs,
      available,
      "chrome-devtools-mcp",
      "verification",
      browserGate?.reason ?? "browser runtime behavior should be verified in a real browser",
      "Use Chrome DevTools MCP for console, network, DOM, performance, or visual proof after implementation.",
      { category: "verification", stackIds },
    );
    pushRecommendation(
      recs,
      available,
      "browser-verification",
      "verification",
      browserGate?.reason ?? "browser-facing behavior needs repeatable runtime evidence",
      "Prefer Playwright for repeatable E2E; use Chrome DevTools MCP when high-fidelity runtime inspection is needed.",
      { category: "verification", stackIds },
    );
  }

  if (tddGate?.required === true) {
    pushRecommendation(
      recs,
      available,
      "tdd-cycle",
      "implementation",
      tddGate.reason,
      "Start with a focused failing test or reproduction when behavior is changing; keep the test in the final verifier.",
      { category: "tdd", stackIds },
    );
  }

  if (securityGate !== undefined || COMPLEX_RE.test(semanticGoal)) {
    pushRecommendation(
      recs,
      available,
      "security-review",
      "verification",
      securityGate?.reason ?? "the task touches a risk surface that benefits from security review",
      "Run a read-only security pass over auth, input validation, secrets, dependencies, and release metadata before completion.",
      { category: "security", stackIds },
    );
  }

  if ((baselineGate !== undefined || stackProfile?.primary !== "unknown") && route !== "direct-change") {
    pushRecommendation(
      recs,
      available,
      "stack-specific-verification",
      "verification",
      baselineGate?.reason ?? "detected stack should drive the final verifier",
      baselineGate?.command
        ? `Run the stack verifier: ${baselineGate.command}.`
        : "Use the repository's documented verifier for the detected stack.",
      { category: "verification", stackIds },
    );
  }

  if (contextBudget !== undefined && route !== "direct-change") {
    pushRecommendation(
      recs,
      available,
      "context-budget",
      "planning",
      `context budget is ${contextBudget.level}`,
      contextBudget.strategy,
      { category: "context", stackIds },
    );
  }

  if (complex || stuck) {
    pushRecommendation(
      recs,
      available,
      "sequential-thinking",
      "planning",
      "risk or uncertainty requires explicit hypothesis management",
      "Use sequential-thinking to break assumptions before choosing the implementation path.",
      { category: "context", stackIds },
    );
  }

  if ((stuck && repeatedFailure) || parallel) {
    pushRecommendation(
      recs,
      available,
      "pua",
      stuck ? "recovery" : "planning",
      stuck
        ? "the goal indicates repeated failure or debugging difficulty"
        : "large work may contain independent parallel slices",
      stuck
        ? "Use /pua:pua-loop only after local triage confirms the first fix path is not working."
        : "Use /pua:p9 only after dependencies prove the slices can run independently.",
      { category: stuck ? "recovery" : "context", stackIds },
    );
  }

  return sortRecommendations(recs);
}

export function renderInstalledCapabilityRules(availableCapabilities: string[]): string[] {
  const available = new Set(availableCapabilities);
  const lines: string[] = [
    "Use installed capabilities by trigger, not by habit. Prefer the first matching rule; skip absent capabilities.",
  ];

  for (const id of ORDER) {
    if (!available.has(id)) continue;
    const cap = CAPABILITIES[id];
    lines.push(`- ${cap.invocation}: ${cap.useWhen} ${cap.skipWhen}`);
  }

  return lines;
}

export function renderCapabilityDecisionTree(availableCapabilities: string[]): string[] {
  const available = new Set(availableCapabilities);
  const rules: string[] = [
    "Can the edit be finished safely from local code in 1-2 steps? -> Do it directly.",
  ];
  if (available.has("context7")) {
    rules.push("Does correctness depend on external SDKs, APIs, or framework docs? -> use the Context7 MCP before editing; for Claude Code behavior, start from official Claude Code docs.");
  }
  if (available.has("claude-mem")) {
    rules.push("Might similar work, a prior decision, or a repeated failure exist? -> Start with `/claude-mem:mem-search`.");
  }
  if (available.has("frontend-design") || available.has("chrome-devtools-mcp")) {
    rules.push("Is visible frontend behavior in scope? -> Use frontend-design for UI decisions and Chrome DevTools MCP for runtime proof when installed.");
  }
  if (available.has("sequential-thinking")) {
    rules.push("Is the work high-risk, architectural, or assumption-heavy? -> Use sequential-thinking after reading the relevant code.");
  }
  if (available.has("pua")) {
    rules.push("Are there repeated failed attempts or truly independent parallel slices? -> Use `/pua:pua-loop` for recovery or `/pua:p9` for bounded parallel planning.");
  }
  return rules.map((rule, idx) => `${idx + 1}. ${rule}`);
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

function main(): void {
  const argv = process.argv.slice(2);
  const recommendations = recommendToolCapabilities({
    goal: readArg("--goal", argv),
    route: readArg("--route", argv),
    risk: readArg("--risk", argv),
    topologyKinds: parseList(readArg("--topology-kinds", argv)),
    topologyFrameworks: parseList(readArg("--topology-frameworks", argv)),
    missingRoots: Number(readArg("--missing-roots", argv) ?? 0),
    availableCapabilities: readArg("--available-capabilities", argv)
      ? parseList(readArg("--available-capabilities", argv))
      : undefined,
  });
  process.stdout.write(JSON.stringify(recommendations, null, 2) + "\n");
}

function isDirectRun(): boolean {
  try {
    const entry = fileURLToPath(import.meta.url);
    return process.argv[1] === entry && basename(entry).startsWith("tool-capabilities.");
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main();
}
