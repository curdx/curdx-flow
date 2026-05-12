import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/lib/tool-capabilities.ts
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
var CAPABILITIES = {
  "context7": {
    id: "context7",
    name: "Context7",
    type: "mcp",
    invocation: "Context7 MCP",
    summary: "current official docs for libraries, SDKs, APIs, and Claude Code",
    useWhen: "use the Context7 MCP before implementation when external library, SDK, API, framework, or Claude Code behavior matters.",
    skipWhen: "Skip for pure local logic, typos, and code paths fully understood from this repository."
  },
  "claude-mem": {
    id: "claude-mem",
    name: "claude-mem",
    type: "plugin",
    invocation: "/claude-mem:mem-search",
    summary: "cross-session memory search and phased plan/execution commands",
    useWhen: "Use /claude-mem:mem-search when similar work, prior decisions, or repeated failures may exist; use /claude-mem:make-plan only for genuinely phased work.",
    skipWhen: "Skip when the task is new, obvious, and smaller than a short local edit."
  },
  "sequential-thinking": {
    id: "sequential-thinking",
    name: "sequential-thinking",
    type: "mcp",
    invocation: "sequential-thinking MCP",
    summary: "structured hypothesis breakdown for hard architecture and debugging problems",
    useWhen: "Use for architecture tradeoffs, migrations, security/data/release risk, or debugging where assumptions may change.",
    skipWhen: "Skip for direct edits, simple lookups, and deterministic fixes."
  },
  "chrome-devtools-mcp": {
    id: "chrome-devtools-mcp",
    name: "Chrome DevTools MCP",
    type: "plugin",
    invocation: "Chrome DevTools MCP",
    summary: "real browser console, network, DOM, performance, and screenshot/snapshot verification",
    useWhen: "Use for browser runtime behavior, UI regressions, DOM/CSS issues, network failures, and frontend verification.",
    skipWhen: "Skip for backend-only code with no browser-facing behavior."
  },
  "frontend-design": {
    id: "frontend-design",
    name: "frontend-design",
    type: "plugin",
    invocation: "frontend-design plugin skills",
    summary: "frontend UX/design guidance for UI pages, components, and interaction polish",
    useWhen: "Use when building or changing visible UI, interaction design, frontend layout, or visual quality.",
    skipWhen: "Skip for backend-only changes, copy-only edits, and internal CLI/library work."
  },
  "pua": {
    id: "pua",
    name: "pua",
    type: "plugin",
    invocation: "/pua:pua-loop or /pua:p9",
    summary: "structured retries and parallel task decomposition",
    useWhen: "Use after multiple failed attempts or for truly independent parallel work slices.",
    skipWhen: "Skip on first-attempt failures, known fixes, and work that is sequential by dependency."
  },
  "docs-query": {
    id: "docs-query",
    name: "Docs query",
    type: "workflow",
    invocation: "Context7 or official docs",
    summary: "phase-specific grounding against current documentation",
    useWhen: "Use before implementation when quality gates mark docs as required.",
    skipWhen: "Skip when local code fully defines the behavior and no external API/version matters."
  },
  "browser-verification": {
    id: "browser-verification",
    name: "Browser verification",
    type: "workflow",
    invocation: "Playwright or Chrome DevTools MCP",
    summary: "repeatable browser/runtime proof for UI and full-stack behavior",
    useWhen: "Use when browser-facing quality gates are required or suggested.",
    skipWhen: "Skip for backend-only and CLI-only work."
  },
  "tdd-cycle": {
    id: "tdd-cycle",
    name: "TDD cycle",
    type: "workflow",
    invocation: "RED/GREEN/VERIFY loop",
    summary: "test-first implementation for behavior changes",
    useWhen: "Use when route/risk indicates implementation should be protected by a regression test.",
    skipWhen: "Skip for docs-only edits and pure mechanical metadata updates."
  },
  "security-review": {
    id: "security-review",
    name: "Security review",
    type: "workflow",
    invocation: "read-only security review",
    summary: "focused review of auth, secrets, injection, release, and dependency risk",
    useWhen: "Use when quality gates indicate auth/security/release risk.",
    skipWhen: "Skip for isolated copy edits with no executable behavior."
  },
  "stack-specific-verification": {
    id: "stack-specific-verification",
    name: "Stack-specific verification",
    type: "workflow",
    invocation: "curdx-flow route qualityGates",
    summary: "run the verifier that matches the detected stack profile",
    useWhen: "Use before completion whenever smart-route returns a suggestedVerifier.",
    skipWhen: "Skip only when no stack profile is detected and no repo verifier exists."
  },
  "context-budget": {
    id: "context-budget",
    name: "Context budget",
    type: "policy",
    invocation: "curdx-flow route contextBudget",
    summary: "limit reference loading by route and stack confidence",
    useWhen: "Use for every non-trivial route to keep the session focused.",
    skipWhen: "Skip only for no-op direct changes."
  }
};
var ORDER = [
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
  "pua"
];
var CORE_REQUIRED = /* @__PURE__ */ new Set([
  "context7",
  "claude-mem",
  "frontend-design",
  "chrome-devtools-mcp",
  "sequential-thinking",
  "pua"
]);
var EXTERNAL_DOCS_RE = /\b(api|sdk|library|libraries|framework|version|upgrade|dependency|dependencies|official docs?|latest docs?|claude code|plugin|mcp|hook|hooks|skill|skills|agent|agents|scaffold|starter|template|generator|initializer|initializr|react|vue|spring|spring boot|spring cloud|next\.?js|vite|webpack|npm|node|go|python|rust|cargo|maven|gradle|cookiecutter)\b|最新|依赖|框架|插件|官方|联网|搜索|文档|脚手架|初始化|生成器|模板/i;
var MEMORY_RE = /\b(previous|before|again|remember|memory|history|similar|repeated|regression|already solved|same bug|past decision)\b|之前|上次|记得|历史|做过|又|重复|老问题/i;
var UI_RE = /\b(ui|ux|frontend|front-end|browser|chrome|dom|css|html|layout|component|page|form|modal|responsive|visual|render|react|vue|vite|next\.?js|screenshot|interaction)\b|前端|页面|浏览器|样式|交互|组件|布局|视觉|截图/i;
var BROWSER_VERIFY_RE = /\b(browser|chrome|dom|css|network|console|performance|render|screenshot|e2e|playwright|visual regression|interaction)\b|浏览器|控制台|网络|性能|渲染|截图|端到端/i;
var COMPLEX_RE = /\b(architecture|architect|migration|migrate|security|auth|authentication|authorization|permission|oauth|payment|billing|database|schema|release|publish|npm|tag|hook|subagent|multi[- ]?repo|monorepo|cross[- ]?system|concurrency|race|cache|rewrite|refactor)\b|架构|迁移|安全|权限|认证|数据库|发布|重写|并发|跨仓库|多仓库/i;
var STUCK_RE = /\b(stuck|failed|failure|fails|flaky|retry|debug|investigate|root cause|not working|broken|regression)\b|卡住|失败|报错|不行|修不好|定位|排查/i;
var PARALLEL_RE = /\b(parallel|multi-agent|team|decompose|split|epic|multiple subsystems|large refactor)\b|并行|多智能体|拆分|史诗|多模块/i;
var LOW_RISK_LOCAL_RE = /\b(typo|readme|docs?|comment|comments|copy|wording|rename label|format text)\b|错别字|注释|文案/i;
function normalize(input) {
  return (input ?? "").trim().replace(/\s+/g, " ");
}
function hasAny(values, candidates) {
  const set = new Set((values ?? []).map((v) => v.toLowerCase()));
  return candidates.some((candidate) => set.has(candidate.toLowerCase()));
}
function capabilityAvailability(id, available) {
  if (CORE_REQUIRED.has(id)) return "core-required";
  const cap = CAPABILITIES[id];
  if (cap.type === "workflow" || cap.type === "policy") return "known-available";
  if (available === null) return "check-if-installed";
  return available.has(id) ? "known-available" : null;
}
function pushRecommendation(out, available, id, phase, reason, instruction, extra = {}) {
  const availability = capabilityAvailability(id, available);
  if (availability === null) return;
  if (out.some((rec) => rec.id === id)) return;
  const cap = CAPABILITIES[id];
  out.push({
    id,
    name: cap.name,
    type: cap.type,
    invocation: cap.invocation,
    phase,
    ...extra,
    availability,
    reason,
    instruction
  });
}
function sortRecommendations(recs) {
  return [...recs].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
}
function knownToolCapabilities() {
  return ORDER.map((id) => CAPABILITIES[id]);
}
function recommendToolCapabilities(input) {
  const goal = normalize(input.goal);
  const route = normalize(input.route);
  const risk = normalize(input.risk);
  const topologyKinds = input.topologyKinds ?? [];
  const topologyFrameworks = input.topologyFrameworks ?? [];
  const stackProfile = input.stackProfile;
  const qualityGates = input.qualityGates ?? [];
  const contextBudget = input.contextBudget;
  const missingRoots = input.missingRoots ?? 0;
  const available = input.availableCapabilities === void 0 ? null : new Set(input.availableCapabilities.filter(Boolean));
  const recs = [];
  if (missingRoots > 0) {
    return recs;
  }
  const externalDocsRelevant = EXTERNAL_DOCS_RE.test(goal);
  const localLowRisk = LOW_RISK_LOCAL_RE.test(goal) && route === "direct-change" && !externalDocsRelevant;
  if (localLowRisk) {
    return recs;
  }
  const hasFrontend = UI_RE.test(goal) || hasAny(topologyKinds, ["frontend-app"]) || hasAny(topologyFrameworks, ["react", "vue", "next.js", "vite"]);
  const browserRuntime = BROWSER_VERIFY_RE.test(goal) || hasFrontend;
  const complex = COMPLEX_RE.test(goal) && route !== "direct-change" || risk === "high" || risk === "critical" || route === "full-spec" || route === "epic-split";
  const stuck = STUCK_RE.test(goal);
  const parallel = PARALLEL_RE.test(goal) || route === "epic-split";
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
      "Use Context7 before editing so version-specific behavior is grounded in current docs.",
      { category: "docs", stackIds }
    );
    pushRecommendation(
      recs,
      available,
      "docs-query",
      "before-coding",
      docsGate?.reason ?? "documentation grounding should happen before implementation",
      "Query official/current docs first, then summarize only the decisions that affect this route.",
      { category: "docs", stackIds }
    );
  }
  if (MEMORY_RE.test(goal) || stuck || route === "full-spec" || route === "epic-split") {
    pushRecommendation(
      recs,
      available,
      "claude-mem",
      "planning",
      "similar prior work or longer-running plan may exist",
      "Search memory before planning; use make-plan only when the work is genuinely phased.",
      { category: "context", stackIds }
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
      { category: "verification", stackIds }
    );
  }
  if (browserRuntime || browserGate !== void 0) {
    pushRecommendation(
      recs,
      available,
      "chrome-devtools-mcp",
      "verification",
      browserGate?.reason ?? "browser runtime behavior should be verified in a real browser",
      "Use Chrome DevTools MCP for console, network, DOM, performance, or visual proof after implementation.",
      { category: "verification", stackIds }
    );
    pushRecommendation(
      recs,
      available,
      "browser-verification",
      "verification",
      browserGate?.reason ?? "browser-facing behavior needs repeatable runtime evidence",
      "Prefer Playwright for repeatable E2E; use Chrome DevTools MCP when high-fidelity runtime inspection is needed.",
      { category: "verification", stackIds }
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
      { category: "tdd", stackIds }
    );
  }
  if (securityGate !== void 0 || COMPLEX_RE.test(goal)) {
    pushRecommendation(
      recs,
      available,
      "security-review",
      "verification",
      securityGate?.reason ?? "the task touches a risk surface that benefits from security review",
      "Run a read-only security pass over auth, input validation, secrets, dependencies, and release metadata before completion.",
      { category: "security", stackIds }
    );
  }
  if ((baselineGate !== void 0 || stackProfile?.primary !== "unknown") && route !== "direct-change") {
    pushRecommendation(
      recs,
      available,
      "stack-specific-verification",
      "verification",
      baselineGate?.reason ?? "detected stack should drive the final verifier",
      baselineGate?.command ? `Run the stack verifier: ${baselineGate.command}.` : "Use the repository's documented verifier for the detected stack.",
      { category: "verification", stackIds }
    );
  }
  if (contextBudget !== void 0 && route !== "direct-change") {
    pushRecommendation(
      recs,
      available,
      "context-budget",
      "planning",
      `context budget is ${contextBudget.level}`,
      contextBudget.strategy,
      { category: "context", stackIds }
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
      { category: "context", stackIds }
    );
  }
  if (stuck || parallel) {
    pushRecommendation(
      recs,
      available,
      "pua",
      stuck ? "recovery" : "planning",
      stuck ? "the goal indicates repeated failure or debugging difficulty" : "large work may contain independent parallel slices",
      stuck ? "Use /pua:pua-loop only after local triage confirms the first fix path is not working." : "Use /pua:p9 only after dependencies prove the slices can run independently.",
      { category: stuck ? "recovery" : "context", stackIds }
    );
  }
  return sortRecommendations(recs);
}
function renderInstalledCapabilityRules(availableCapabilities) {
  const available = new Set(availableCapabilities);
  const lines = [
    "Use installed capabilities by trigger, not by habit. Prefer the first matching rule; skip absent capabilities."
  ];
  for (const id of ORDER) {
    if (!available.has(id)) continue;
    const cap = CAPABILITIES[id];
    lines.push(`- ${cap.invocation}: ${cap.useWhen} ${cap.skipWhen}`);
  }
  return lines;
}
function renderCapabilityDecisionTree(availableCapabilities) {
  const available = new Set(availableCapabilities);
  const rules = [
    "Can the edit be finished safely from local code in 1-2 steps? -> Do it directly."
  ];
  if (available.has("context7")) {
    rules.push("Does correctness depend on external docs, SDKs, APIs, or Claude Code behavior? -> use the Context7 MCP before editing.");
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
    rules.push("Are there multiple failed attempts or truly independent parallel slices? -> Use `/pua:pua-loop` for recovery or `/pua:p9` for bounded parallel planning.");
  }
  return rules.map((rule, idx) => `${idx + 1}. ${rule}`);
}
function parseList(value) {
  if (!value) return [];
  return value.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}
function readArg(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function main() {
  const argv = process.argv.slice(2);
  const recommendations = recommendToolCapabilities({
    goal: readArg("--goal", argv),
    route: readArg("--route", argv),
    risk: readArg("--risk", argv),
    topologyKinds: parseList(readArg("--topology-kinds", argv)),
    topologyFrameworks: parseList(readArg("--topology-frameworks", argv)),
    missingRoots: Number(readArg("--missing-roots", argv) ?? 0),
    availableCapabilities: readArg("--available-capabilities", argv) ? parseList(readArg("--available-capabilities", argv)) : void 0
  });
  process.stdout.write(JSON.stringify(recommendations, null, 2) + "\n");
}
function isDirectRun() {
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
export {
  knownToolCapabilities,
  recommendToolCapabilities,
  renderCapabilityDecisionTree,
  renderInstalledCapabilityRules
};
//# sourceMappingURL=tool-capabilities.mjs.map
