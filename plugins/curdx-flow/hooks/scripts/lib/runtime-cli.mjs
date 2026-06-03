import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/lib/runtime-cli.ts
import { spawnSync as spawnSync3 } from "node:child_process";
import { existsSync as existsSync10, readFileSync as readFileSync10, statSync as statSync6 } from "node:fs";
import { basename as basename11, dirname, isAbsolute as isAbsolute6, join as join9, resolve as resolve5 } from "node:path";
import { fileURLToPath as fileURLToPath8 } from "node:url";

// src/registry/capabilities.ts
var CURDX_PLUGIN_DEPENDENCIES = [
  {
    id: "pua",
    name: "pua",
    marketplace: "pua-skills",
    marketplaceSource: "tanweai/pua",
    pluginId: "pua@pua-skills",
    description: "tanweai/pua - Chinese Claude Code skills bundle",
    whenToUse: "auto-fires on 2+ failures or user frustration; sub-modes p7 / p9 / pro / loop. Skip on first-attempt failures or when a known fix is executing.",
    slashNamespace: "/pua:*",
    required: true
  },
  {
    id: "claude-mem",
    name: "claude-mem",
    marketplace: "thedotmack",
    marketplaceSource: "thedotmack/claude-mem",
    pluginId: "claude-mem@thedotmack",
    description: "thedotmack/claude-mem - persistent cross-session memory for Claude Code",
    whenToUse: 'for cross-session memory search ("did we solve this before?"), phased planning (`make-plan`), or phased execution (`do`).',
    slashNamespace: "/claude-mem:*",
    required: true
  },
  {
    id: "chrome-devtools-mcp",
    name: "chrome-devtools-mcp",
    marketplace: "chrome-devtools-plugins",
    marketplaceSource: "ChromeDevTools/chrome-devtools-mcp",
    pluginId: "chrome-devtools-mcp@chrome-devtools-plugins",
    description: "ChromeDevTools/chrome-devtools-mcp - drive a real Chrome from Claude Code",
    whenToUse: "when debugging code that runs in a browser: perf traces, network / console inspection, DOM / CSS issues. Prefer snapshot over screenshot.",
    required: true
  },
  {
    id: "ui-ux-pro-max",
    name: "ui-ux-pro-max",
    marketplace: "ui-ux-pro-max-skill",
    marketplaceSource: "nextlevelbuilder/ui-ux-pro-max-skill",
    pluginId: "ui-ux-pro-max@ui-ux-pro-max-skill",
    description: "nextlevelbuilder/ui-ux-pro-max-skill - UI/UX design intelligence",
    whenToUse: "auto-fires when building UI / UX / web components / pages. Best where visual quality, accessibility, responsive behavior, or design systems matter.",
    required: true
  }
];
var CURDX_EXTERNAL_MCPS = [
  {
    id: "context7",
    match: /context7|mcp\.context7\.com/i,
    installHint: "Installed externally by setup script; expected to appear in `claude mcp list`."
  },
  {
    id: "sequential-thinking",
    match: /sequential[- ]thinking|server-sequential-thinking/i,
    installHint: "Installed externally by setup script; expected to appear in `claude mcp list`."
  }
];
var CURDX_TOOL_CAPABILITIES = {
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
    missingAction: "Enable the external context7 MCP server from your setup script or configure https://mcp.context7.com/mcp."
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
    missingAction: "Install/enable claude-mem from the thedotmack marketplace dependency."
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
    missingAction: "Enable the external sequential-thinking MCP server from your setup script."
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
    missingAction: "Install/enable chrome-devtools-mcp and make sure Chrome is installed."
  },
  "ui-ux-pro-max": {
    id: "ui-ux-pro-max",
    name: "ui-ux-pro-max",
    type: "plugin",
    ownedBy: "ui-ux-pro-max",
    provisioning: "plugin-dependency",
    curdxRole: ["recommend"],
    doNotReimplement: true,
    expectedByDefault: true,
    invocation: "ui-ux-pro-max plugin skills",
    summary: "frontend UX/design guidance for UI pages, components, and interaction polish",
    useWhen: "Use when building or changing visible UI, interaction design, frontend layout, or visual quality.",
    skipWhen: "Skip for backend-only changes, copy-only edits, and internal CLI/library work.",
    missingAction: "Install/enable ui-ux-pro-max from the ui-ux-pro-max-skill marketplace dependency."
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
    missingAction: "Install/enable pua from the pua-skills marketplace dependency."
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
    skipWhen: "Skip when local code fully defines the behavior and no external API/version matters."
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
    skipWhen: "Skip for backend-only and CLI-only work."
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
    skipWhen: "Skip for docs-only edits and pure mechanical metadata updates."
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
    skipWhen: "Skip for isolated copy edits with no executable behavior."
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
    skipWhen: "Skip only when no stack profile is detected and no repo verifier exists."
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
    skipWhen: "Skip only for no-op direct changes."
  }
};
var CURDX_TOOL_CAPABILITY_ORDER = [
  "context7",
  "docs-query",
  "claude-mem",
  "ui-ux-pro-max",
  "chrome-devtools-mcp",
  "browser-verification",
  "tdd-cycle",
  "security-review",
  "stack-specific-verification",
  "context-budget",
  "sequential-thinking",
  "pua"
];

// src/hooks/lib/smart-route.ts
import { existsSync as existsSync5, readFileSync as readFileSync5 } from "node:fs";
import { basename as basename5, join as join4 } from "node:path";
import { fileURLToPath as fileURLToPath4 } from "node:url";

// src/hooks/lib/auto-policy.ts
import { fileURLToPath } from "node:url";
import { basename } from "node:path";
var LOW_RISK_RE = /\b(readme|docs?|documentation|typo|copy|wording|comment|comments|changelog|license|format text|rename label|css copy|style text)\b/i;
var HIGH_RISK_RE = /\b(auth|authentication|authorization|permission|permissions|security|secret|secrets|token|password|oauth|payment|billing|invoice|migration|database|schema|release|publish|tag|manifest|plugin\.json|claude-plugin|hooks?\.json|hook|subagent|agent|sandbox|destructive|data loss|concurrency|race|cache|cost|pricing)\b/i;
var CRITICAL_RISK_RE = /\b(payment|billing|security|secret|secrets|password|token|oauth|authorization|permission|migration|data loss|release|publish|tag|hooks?\.json|plugin\.json|claude-plugin)\b/i;
var DESTRUCTIVE_INTENT_RE = /\b(rm\s+-rf|delete\s+(file|files|directory|directories|folder|folders|branch|branches|tag|tags|database|schema|table|record|records|data|repo|repository)|remove\s+(file|files|directory|directories|folder|folders|branch|branches|tag|tags|database|schema|table|record|records|data|repo|repository)|drop\s+(database|schema|table)|wipe|purge|destroy)\b|删除(文件|目录|数据|数据库|表|仓库|分支|标签)|删库|清空数据/i;
var EPIC_TRIAGE_RE = /\b(epic|multi-spec|multiple specs|multiple subsystems|cross-system|whole app|entire app|rewrite|rebuild|platform|framework migration|全量|重写|多个子系统|史诗)\b/i;
var ADD_OR_FIX_RE = /\b(add|build|create|implement|support|fix|debug|repair|resolve|refactor|change|modify|update)\b/i;
function normalizeWords(input) {
  return (input ?? "").trim().replace(/\s+/g, " ");
}
function parseFlags(flags) {
  const text = ` ${flags ?? ""} `;
  const modeMatch = text.match(/\s--mode\s+(auto|fast|deep)(?=\s|$)/);
  const granularityMatch = text.match(/\s--task-granularity\s+(auto|coarse|standard|fine)(?=\s|$)/) ?? text.match(/\s--tasks-size\s+(auto|coarse|standard|fine)(?=\s|$)/);
  const reviewMatch = text.match(
    /\s--review\s+(minimal|standard|strict)(?=\s|$)/
  );
  return {
    mode: modeMatch?.[1] ?? "auto",
    taskGranularity: granularityMatch?.[1],
    review: reviewMatch?.[1]
  };
}
function countDistinctDirs(files) {
  const dirs = /* @__PURE__ */ new Set();
  for (const file of files) {
    const parts = file.split(/[\\/]+/).filter(Boolean);
    if (parts.length <= 1) {
      dirs.add(".");
    } else {
      dirs.add(parts.slice(0, Math.min(2, parts.length - 1)).join("/"));
    }
  }
  return dirs.size;
}
function bumpRisk(a, b) {
  const order = ["low", "medium", "high", "critical"];
  return order[Math.max(order.indexOf(a), order.indexOf(b))];
}
function classifyRisk(goal2, files, fileCount) {
  let risk = "medium";
  const reasons = [];
  if (LOW_RISK_RE.test(goal2)) {
    risk = "low";
    reasons.push("low-risk wording/docs signal");
  }
  if (!ADD_OR_FIX_RE.test(goal2) && fileCount <= 2) {
    risk = bumpRisk(risk, "low");
    reasons.push("small unclear change; keep validation targeted");
  }
  if (HIGH_RISK_RE.test(goal2) || DESTRUCTIVE_INTENT_RE.test(goal2) || files.some((f) => HIGH_RISK_RE.test(f) || DESTRUCTIVE_INTENT_RE.test(f))) {
    risk = bumpRisk(risk, "high");
    reasons.push("high-risk domain or publish-critical file");
  }
  if (CRITICAL_RISK_RE.test(goal2) || files.some((f) => CRITICAL_RISK_RE.test(f))) {
    risk = bumpRisk(risk, "critical");
    reasons.push("critical security/data/release/plugin surface");
  }
  if (fileCount >= 9) {
    risk = bumpRisk(risk, "high");
    reasons.push("large file surface");
  }
  if (countDistinctDirs(files) >= 4) {
    risk = bumpRisk(risk, "high");
    reasons.push("cross-directory blast radius");
  }
  return { risk, reasons };
}
function classifyExecutionMode(args) {
  const reasons = [];
  let executionMode;
  if (EPIC_TRIAGE_RE.test(args.goal) || args.fileCount >= 16 || args.dirCount >= 6 || typeof args.taskCount === "number" && args.taskCount > 12) {
    executionMode = "epic-triage";
    reasons.push("epic-level or multi-subsystem task/file surface");
  } else if (args.risk === "critical" || args.fileCount >= 9) {
    executionMode = "deep-spec";
    reasons.push("critical/high blast radius requires deep spec");
  } else if (args.risk === "high" || args.fileCount >= 4) {
    executionMode = "standard";
    reasons.push("moderate implementation surface");
  } else if (args.risk === "low" && args.fileCount <= 1) {
    executionMode = "direct";
    reasons.push("single low-risk change");
  } else if (args.fileCount <= 3) {
    executionMode = "spec-lite";
    reasons.push("small bounded change");
  } else {
    executionMode = "standard";
    reasons.push("default standard slice");
  }
  if (args.mode === "deep" && executionMode !== "epic-triage") {
    executionMode = executionMode === "direct" || executionMode === "spec-lite" ? "standard" : "deep-spec";
    reasons.push("explicit deep mode");
  }
  if (args.mode === "fast" && executionMode === "deep-spec" && args.risk !== "critical") {
    executionMode = "standard";
    reasons.push("explicit fast mode without critical risk");
  }
  return { executionMode, reasons };
}
function policyForExecutionMode(executionMode) {
  switch (executionMode) {
    case "direct":
      return {
        executionDriver: "goal",
        taskGranularity: "none",
        taskTargetRange: { min: 0, max: 1 },
        reviewCadence: "minimal",
        verificationLevel: "targeted",
        subagentPolicy: "none",
        maxGlobalIterations: 5,
        maxTaskIterations: 2
      };
    case "spec-lite":
      return {
        executionDriver: "goal",
        taskGranularity: "coarse",
        taskTargetRange: { min: 1, max: 3 },
        reviewCadence: "minimal",
        verificationLevel: "targeted",
        subagentPolicy: "none",
        maxGlobalIterations: 8,
        maxTaskIterations: 3
      };
    case "standard":
      return {
        executionDriver: "goal",
        taskGranularity: "standard",
        taskTargetRange: { min: 3, max: 7 },
        reviewCadence: "final",
        verificationLevel: "standard",
        subagentPolicy: "on-demand",
        maxGlobalIterations: 18,
        maxTaskIterations: 4
      };
    case "deep-spec":
      return {
        executionDriver: "goal",
        taskGranularity: "standard",
        taskTargetRange: { min: 5, max: 12 },
        reviewCadence: "periodic",
        verificationLevel: "strict",
        subagentPolicy: "per-slice",
        maxGlobalIterations: 30,
        maxTaskIterations: 5
      };
    case "epic-triage":
      return {
        executionDriver: "goal",
        taskGranularity: "standard",
        taskTargetRange: { min: 5, max: 10 },
        reviewCadence: "strict",
        verificationLevel: "strict",
        subagentPolicy: "per-slice",
        maxGlobalIterations: 30,
        maxTaskIterations: 5
      };
  }
}
function applyOverrides(policy, overrides) {
  const next = { ...policy };
  if (overrides.taskGranularity !== void 0 && overrides.taskGranularity !== "auto") {
    next.taskGranularity = overrides.taskGranularity;
    next.reasons = [
      ...next.reasons,
      `explicit task-granularity=${overrides.taskGranularity}`
    ];
  }
  if (overrides.review === "minimal") {
    next.reviewCadence = "minimal";
    next.reasons = [...next.reasons, "explicit review=minimal"];
  } else if (overrides.review === "strict") {
    next.reviewCadence = "strict";
    next.verificationLevel = "strict";
    next.reasons = [...next.reasons, "explicit review=strict"];
  }
  return next;
}
function classifyAutoPolicy(input) {
  const goal2 = normalizeWords(input.goal);
  const flags = parseFlags(input.flags);
  const changedFiles = input.changedFiles ?? [];
  const estimatedFiles = typeof input.estimatedFiles === "number" && Number.isFinite(input.estimatedFiles) ? Math.max(0, Math.floor(input.estimatedFiles)) : changedFiles.length;
  const fileCount = Math.max(estimatedFiles, changedFiles.length);
  const dirCount = countDistinctDirs(changedFiles);
  const riskResult = classifyRisk(goal2, changedFiles, fileCount);
  const modeResult = classifyExecutionMode({
    goal: goal2,
    risk: riskResult.risk,
    fileCount,
    dirCount,
    taskCount: input.taskCount,
    mode: flags.mode
  });
  const base = policyForExecutionMode(modeResult.executionMode);
  const taskCount = input.taskCount;
  const shouldSplitSpec = modeResult.executionMode === "epic-triage" || typeof taskCount === "number" && taskCount > base.taskTargetRange.max;
  return applyOverrides(
    {
      version: 2,
      mode: flags.mode,
      risk: riskResult.risk,
      executionMode: modeResult.executionMode,
      shouldSplitSpec,
      reasons: [...riskResult.reasons, ...modeResult.reasons],
      ...base
    },
    flags
  );
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
  const goal2 = readArg("--goal", argv) ?? "";
  const flags = readArg("--flags", argv) ?? "";
  const files = parseList(readArg("--files", argv));
  const estimatedRaw = readArg("--estimated-files", argv);
  const taskRaw = readArg("--task-count", argv);
  const policy = classifyAutoPolicy({
    goal: goal2,
    flags,
    changedFiles: files,
    estimatedFiles: estimatedRaw === void 0 ? void 0 : Number(estimatedRaw),
    taskCount: taskRaw === void 0 ? void 0 : Number(taskRaw)
  });
  process.stdout.write(JSON.stringify(policy, null, 2) + "\n");
}
function isDirectRun() {
  try {
    const entry = fileURLToPath(import.meta.url);
    return process.argv[1] === entry && basename(entry).startsWith("auto-policy.");
  } catch {
    return false;
  }
}
if (isDirectRun()) {
  main();
}

// src/hooks/lib/project-topology.ts
import {
  existsSync as existsSync2,
  readFileSync as readFileSync2,
  readdirSync as readdirSync2,
  statSync as statSync2
} from "node:fs";
import { homedir } from "node:os";
import path, { basename as basename3, isAbsolute as isAbsolute2, relative, resolve } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/hooks/_shared/path-resolver.ts
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename as basename2, isAbsolute, join, posix } from "node:path";
var DEFAULT_SPECS_DIR = "./specs";
var SETTINGS_REL_PATH = ".claude/curdx-flow.local.md";
function resolveCwd(opts) {
  return opts?.cwd ?? process.env["CURDX_CWD"] ?? process.cwd();
}
function warn(msg) {
  process.stderr.write(`[curdx-warn] ${msg}
`);
}
function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
function sanitizeSessionId(sessionId) {
  const raw = sessionId?.trim();
  if (!raw) return null;
  const safe = raw.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 120);
  return safe.length > 0 ? safe : null;
}
function specPathExists(cwd, specPath) {
  const fsPath = isAbsolute(specPath) ? specPath : join(cwd, specPath);
  return isDir(fsPath);
}
function sessionBindingPath(opts) {
  const cwd = resolveCwd(opts);
  const sessionId = sanitizeSessionId(opts?.sessionId);
  if (!sessionId) return null;
  return join(cwd, ".curdx", "sessions", `${sessionId}.json`);
}
function readSessionSpecBinding(opts) {
  const cwd = resolveCwd(opts);
  const path3 = sessionBindingPath(opts);
  if (!path3 || !existsSync(path3)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path3, "utf8"));
    if (parsed.version !== 1) return null;
    if (typeof parsed.sessionId !== "string" || typeof parsed.specPath !== "string") return null;
    if (!specPathExists(cwd, parsed.specPath)) return null;
    return {
      version: 1,
      sessionId: parsed.sessionId,
      specPath: parsed.specPath,
      specName: typeof parsed.specName === "string" ? parsed.specName : basename2(parsed.specPath),
      lastSeenAt: typeof parsed.lastSeenAt === "string" ? parsed.lastSeenAt : "",
      source: typeof parsed.source === "string" ? parsed.source : "unknown"
    };
  } catch {
    return null;
  }
}
function bindSessionSpec(specPath, opts) {
  const cwd = resolveCwd(opts);
  const sessionId = sanitizeSessionId(opts?.sessionId);
  if (!sessionId) return { ok: false, reason: "missing-session-id" };
  if (!specPath || !specPathExists(cwd, specPath)) {
    return { ok: false, reason: "spec-not-found" };
  }
  const bindingPath = sessionBindingPath({ cwd, sessionId });
  if (!bindingPath) return { ok: false, reason: "missing-session-id" };
  const binding = {
    version: 1,
    sessionId,
    specPath,
    specName: basename2(specPath),
    lastSeenAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: opts?.source ?? "runtime"
  };
  try {
    mkdirSync(join(cwd, ".curdx", "sessions"), { recursive: true });
    writeFileSync(bindingPath, JSON.stringify(binding, null, 2) + "\n", "utf8");
    return { ok: true, path: bindingPath };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, reason, path: bindingPath };
  }
}
function normalizePath(input) {
  if (!input) return ".";
  let p = input.replace(/\/+$/, "");
  if (p === "") p = ".";
  return p;
}
function findRepoRoot(start) {
  const origin = start ?? process.cwd();
  let cur = origin;
  for (let i = 0; i < 64; i++) {
    if (isDir(join(cur, ".git"))) return cur;
    if (existsSync(join(cur, SETTINGS_REL_PATH))) return cur;
    const parent = join(cur, "..");
    if (parent === cur) break;
    cur = parent;
  }
  return origin;
}
function parseSpecsDirsFromSettings(settingsPath) {
  let raw;
  try {
    raw = readFileSync(settingsPath, "utf8");
  } catch {
    return [];
  }
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*$/m);
  const block = fmMatch?.[1] ?? raw;
  const line = block.split(/\r?\n/).find((l) => /^\s*specs_dirs\s*:/.test(l));
  if (!line) return [];
  const value = line.replace(/^\s*specs_dirs\s*:\s*/, "");
  return value.replace(/[\[\]"']/g, "").split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}
function getSpecsDirs(opts) {
  const cwd = resolveCwd(opts);
  if (!isDir(cwd)) {
    warn(`CURDX_CWD does not exist: ${cwd}`);
    return [DEFAULT_SPECS_DIR];
  }
  const settingsPath = join(cwd, SETTINGS_REL_PATH);
  const raw = existsSync(settingsPath) ? parseSpecsDirsFromSettings(settingsPath) : [];
  if (raw.length === 0) return [DEFAULT_SPECS_DIR];
  const validated = [];
  for (const entry of raw) {
    const dir = normalizePath(entry);
    const absoluteOutsideCwd = isAbsolute(dir) && !dir.startsWith(cwd);
    if (absoluteOutsideCwd) {
      if (!isDir(dir)) {
        warn(
          `Skipping invalid absolute path in specs_dirs: ${dir} (does not exist)`
        );
        continue;
      }
    } else {
      const resolved = isAbsolute(dir) ? dir : join(cwd, dir);
      if (!isDir(resolved)) {
        warn(
          `Skipping invalid path in specs_dirs: ${dir} (directory not found at ${resolved})`
        );
        continue;
      }
    }
    validated.push(dir);
  }
  if (validated.length === 0) {
    warn(`No valid paths in specs_dirs, using default: ${DEFAULT_SPECS_DIR}`);
    return [DEFAULT_SPECS_DIR];
  }
  return validated;
}
function getDefaultDir(opts) {
  const dirs = getSpecsDirs(opts);
  return normalizePath(dirs[0] ?? DEFAULT_SPECS_DIR);
}
function findSpec(name, opts) {
  if (!name) {
    return { ok: false, reason: "not-found", name: "" };
  }
  const cwd = resolveCwd(opts);
  if (!isDir(cwd)) {
    return { ok: false, reason: "not-found", name };
  }
  let cleaned = normalizePath(name);
  if (cleaned.startsWith("./")) cleaned = cleaned.slice(2);
  const matches = [];
  for (const entry of getSpecsDirs(opts)) {
    const dir = normalizePath(entry);
    const candidateFs = isAbsolute(dir) ? join(dir, cleaned) : join(cwd, dir, cleaned);
    if (isDir(candidateFs)) {
      matches.push(posix.join(dir, cleaned));
    }
  }
  if (matches.length === 0) {
    return { ok: false, reason: "not-found", name: cleaned };
  }
  if (matches.length === 1) {
    return { ok: true, path: matches[0] };
  }
  return { ok: false, reason: "ambiguous", name: cleaned, matches };
}
function resolveCurrent(opts) {
  const cwd = resolveCwd(opts);
  if (!isDir(cwd)) return null;
  const sessionBinding = readSessionSpecBinding(opts);
  if (sessionBinding) return sessionBinding.specPath;
  const defaultDir = getDefaultDir(opts);
  const markerFs = [
    join(cwd, defaultDir, ".current-spec"),
    join(cwd, ".current-spec")
  ].find((candidate) => existsSync(candidate));
  if (!markerFs) return null;
  let content;
  try {
    content = readFileSync(markerFs, "utf8");
  } catch {
    return null;
  }
  content = content.replace(/\s+/g, "");
  if (!content) {
    warn(".current-spec file is empty");
    return null;
  }
  const normalized = normalizePath(content);
  if (normalized.startsWith("./") || normalized.startsWith("../") || normalized.includes("/") || isAbsolute(normalized)) {
    return normalized;
  }
  return posix.join(defaultDir, normalized);
}
function listSpecs(opts) {
  const cwd = resolveCwd(opts);
  if (!isDir(cwd)) return [];
  const out = [];
  for (const entry of getSpecsDirs(opts)) {
    const dir = normalizePath(entry);
    const rootFs = isAbsolute(dir) ? dir : join(cwd, dir);
    if (!isDir(rootFs)) continue;
    let children;
    try {
      children = readdirSync(rootFs);
    } catch {
      continue;
    }
    for (const child of children) {
      if (child.startsWith(".")) continue;
      const childFs = join(rootFs, child);
      if (!isDir(childFs)) continue;
      out.push({
        name: basename2(child),
        path: posix.join(dir, child)
      });
    }
  }
  return out;
}

// src/hooks/lib/project-topology.ts
var FRONTEND_KEY_RE = /^(frontend|front-end|web|ui|client|admin|前端)$/i;
var BACKEND_KEY_RE = /^(backend|back-end|api|server|service|后端)$/i;
var SHARED_KEY_RE = /^(shared|common|contracts?|types?|sdk|共享|协议)$/i;
var INFRA_KEY_RE = /^(infra|infrastructure|deploy|ops|devops|docker|k8s)$/i;
var MOBILE_KEY_RE = /^(mobile|ios|android|app)$/i;
var DATABASE_KEY_RE = /^(database|db|mysql|postgres|postgresql|redis|mongo|数据库)$/i;
var UI_GOAL_RE = /\b(ui|ux|frontend|front-end|react|vue|vite|next|nuxt|page|screen|component|button|form|css|style|layout|页面|前端|组件|样式)\b/i;
var BACKEND_GOAL_RE = /\b(backend|back-end|api|endpoint|controller|service|spring|spring boot|spring cloud|dto|entity|repository|database|db|migration|接口|后端|数据库)\b/i;
var CONTRACT_GOAL_RE = /\b(contract|openapi|swagger|api response|dto|schema|client generation|接口字段|接口返回|契约)\b/i;
var AUTH_GOAL_RE = /\b(auth|login|logout|session|permission|oauth|jwt|登录|鉴权|权限)\b/i;
function isDir2(p) {
  try {
    return statSync2(p).isDirectory();
  } catch {
    return false;
  }
}
function isFile(p) {
  try {
    return statSync2(p).isFile();
  } catch {
    return false;
  }
}
function readText(file) {
  try {
    return readFileSync2(file, "utf8");
  } catch {
    return "";
  }
}
function meaningfulProjectEntries(projectRoot) {
  try {
    return readdirSync2(projectRoot).filter((name) => {
      if (name === ".git" || name === ".hg" || name === ".svn") return false;
      if (name === ".DS_Store" || name === "Thumbs.db") return false;
      if (name === ".claude" || name === ".curdx") return false;
      if (name === "specs") return false;
      return true;
    });
  } catch {
    return [];
  }
}
function normalizeSerializedPath(input) {
  const trimmed = input.trim().replace(/^["'`]+|["'`]+$/g, "");
  if (!trimmed || trimmed === "./") return ".";
  return trimmed.replace(/\\/g, "/").replace(/\/+$/, "") || ".";
}
function toPosixPath(p) {
  return p.split(path.sep).join("/");
}
function relativeOrDot(from, to) {
  const rel = toPosixPath(relative(from, to));
  return rel.length === 0 ? "." : rel;
}
function roleFromKey(key) {
  const normalized = key.trim().toLowerCase();
  if (FRONTEND_KEY_RE.test(normalized)) return "frontend";
  if (BACKEND_KEY_RE.test(normalized)) return "backend";
  if (SHARED_KEY_RE.test(normalized)) return "shared";
  if (INFRA_KEY_RE.test(normalized)) return "infra";
  if (MOBILE_KEY_RE.test(normalized)) return "mobile";
  if (DATABASE_KEY_RE.test(normalized)) return "database";
  return "auto";
}
function rootNameFromRole(role, fallbackPath) {
  if (role !== "auto" && role !== "unknown") return role;
  const base = basename3(fallbackPath);
  return base === "." || base === ".." || base.length === 0 ? "current" : base;
}
function extractFrontmatter(raw) {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*/);
  return match?.[1] ?? raw;
}
function cleanScalar(value) {
  return value.trim().replace(/^["']|["']$/g, "").replace(/\s+#.*$/, "").trim();
}
function parseCodeRootsFromCurdxSettings(projectRoot) {
  const settingsPath = path.join(projectRoot, ".claude", "curdx-flow.local.md");
  if (!isFile(settingsPath)) return [];
  const block = extractFrontmatter(readText(settingsPath));
  const lines = block.split(/\r?\n/);
  const roots = [];
  let inCodeRoots = false;
  let current;
  function flush() {
    if (!current?.path) return;
    const role = current.role ?? "auto";
    roots.push({
      name: current.name ?? rootNameFromRole(role, current.path),
      path: normalizeSerializedPath(current.path),
      role,
      source: "curdx-settings",
      confidence: 0.99
    });
    current = void 0;
  }
  for (const line of lines) {
    if (/^\s*code_roots\s*:/.test(line)) {
      inCodeRoots = true;
      continue;
    }
    if (!inCodeRoots) continue;
    if (/^\S/.test(line) && !/^\s*-/.test(line)) {
      flush();
      break;
    }
    const itemMatch = line.match(/^\s*-\s*(.*)$/);
    if (itemMatch) {
      flush();
      current = {};
      const inline = itemMatch[1]?.trim() ?? "";
      const inlineMatch = inline.match(/^(\w+)\s*:\s*(.+)$/);
      if (inlineMatch?.[1] && inlineMatch[2]) {
        const key2 = inlineMatch[1];
        const value2 = cleanScalar(inlineMatch[2]);
        if (key2 === "name") current.name = value2;
        if (key2 === "path") current.path = value2;
        if (key2 === "role" || key2 === "kind") {
          current.role = roleFromKey(value2);
        }
      }
      continue;
    }
    const propMatch = line.match(/^\s+(name|path|role|kind)\s*:\s*(.+)$/);
    if (!propMatch?.[1] || propMatch[2] === void 0) continue;
    current ??= {};
    const key = propMatch[1];
    const value = cleanScalar(propMatch[2]);
    if (key === "name") current.name = value;
    if (key === "path") current.path = value;
    if (key === "role" || key === "kind") current.role = roleFromKey(value);
  }
  flush();
  return roots.filter((r) => r.role !== "database");
}
function claudeMdCandidates(projectRoot) {
  return [
    path.join(projectRoot, "CLAUDE.md"),
    path.join(projectRoot, ".claude", "CLAUDE.md"),
    path.join(projectRoot, "CLAUDE.local.md")
  ];
}
function extractDevBlocks(raw) {
  const lines = raw.split(/\r?\n/);
  const blocks = [];
  let activeLevel = 0;
  let current = [];
  function flush() {
    if (current.length > 0) {
      blocks.push(current.join("\n"));
      current = [];
    }
  }
  for (const line of lines) {
    const header = line.match(/^(#{1,4})\s+(.+?)\s*$/);
    if (header?.[1] && header[2]) {
      const level = header[1].length;
      const title = header[2].trim().toLowerCase();
      if (activeLevel > 0 && level <= activeLevel) {
        flush();
        activeLevel = 0;
      }
      if (/\b(dev|development|local services|local development)\b/i.test(title) || /(开发|本地开发|开发环境)/.test(title)) {
        activeLevel = level;
        current = [];
      }
      continue;
    }
    if (activeLevel > 0) current.push(line);
  }
  flush();
  return blocks;
}
function parseRootsFromDevText(text) {
  const roots = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:[-*]\s*)?([A-Za-z\u4e00-\u9fa5][\w\u4e00-\u9fa5 -]{0,40})\s*[:：]\s*(.+?)\s*$/
    );
    if (!match?.[1] || match[2] === void 0) continue;
    const key = match[1].trim();
    const role = roleFromKey(key);
    if (role === "database" || role === "unknown") continue;
    const value = normalizeSerializedPath(match[2].split(/\s+/)[0] ?? "");
    if (!value || value.includes("://") || value.startsWith("$")) continue;
    roots.push({
      name: rootNameFromRole(role, value),
      path: value,
      role,
      source: "claude-md",
      confidence: 0.95
    });
  }
  return roots;
}
function parseRootsFromClaudeMd(projectRoot) {
  const roots = [];
  const warnings = [];
  let devContextFound = false;
  for (const file of claudeMdCandidates(projectRoot)) {
    if (!isFile(file)) continue;
    const raw = readText(file);
    const blocks = extractDevBlocks(raw);
    if (blocks.length === 0) continue;
    devContextFound = true;
    for (const block of blocks) {
      roots.push(...parseRootsFromDevText(block));
      if (/(password|passwd|token|secret|jdbc:|mysql:\/\/|postgres:\/\/|mongodb:\/\/|redis:\/\/)/i.test(block)) {
        warnings.push(
          "Dev context mentions database or sensitive-looking values; topology output stores only paths and omits credentials."
        );
      }
    }
  }
  return { roots, devContextFound, warnings };
}
function readJsonObject(file) {
  try {
    const parsed = JSON.parse(readFileSync2(file, "utf8"));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function stringRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}
function hasDep(pkg, name) {
  if (!pkg) return false;
  const deps = {
    ...stringRecord(pkg["dependencies"]),
    ...stringRecord(pkg["devDependencies"]),
    ...stringRecord(pkg["peerDependencies"])
  };
  return Object.prototype.hasOwnProperty.call(deps, name);
}
function hasAnyDep(pkg, names) {
  return names.some((name) => hasDep(pkg, name));
}
function detectPackageManager(rootAbs) {
  if (isFile(path.join(rootAbs, "pnpm-lock.yaml")) || isFile(path.join(rootAbs, "pnpm-workspace.yaml"))) {
    return "pnpm";
  }
  if (isFile(path.join(rootAbs, "yarn.lock"))) return "yarn";
  if (isFile(path.join(rootAbs, "package-lock.json"))) return "npm";
  if (isFile(path.join(rootAbs, "bun.lockb")) || isFile(path.join(rootAbs, "bun.lock"))) return "bun";
  if (isFile(path.join(rootAbs, "pom.xml"))) return "maven";
  if (isFile(path.join(rootAbs, "build.gradle")) || isFile(path.join(rootAbs, "build.gradle.kts"))) return "gradle";
  return void 0;
}
function hasManifestOrSource(rootAbs) {
  return [
    "index.html",
    "package.json",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "go.mod",
    "pyproject.toml",
    "Cargo.toml",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    "src",
    "app",
    "packages"
  ].some((entry) => existsSync2(path.join(rootAbs, entry)));
}
function pushUnique(items, item) {
  if (!items.includes(item)) items.push(item);
}
function classifyRoot(rootAbs, role) {
  const kinds = [];
  const frameworks = [];
  const pkg = readJsonObject(path.join(rootAbs, "package.json"));
  const pom = readText(path.join(rootAbs, "pom.xml"));
  const gradle = [
    readText(path.join(rootAbs, "build.gradle")),
    readText(path.join(rootAbs, "build.gradle.kts"))
  ].join("\n");
  const buildText = `${pom}
${gradle}`;
  if (isFile(path.join(rootAbs, "index.html")) && (isFile(path.join(rootAbs, "app.js")) || isFile(path.join(rootAbs, "styles.css")))) {
    pushUnique(kinds, "frontend-app");
    frameworks.push("static-html");
  }
  if (isFile(path.join(rootAbs, ".claude-plugin", "plugin.json"))) {
    pushUnique(kinds, "claude-code-plugin");
    frameworks.push("claude-code-plugin");
  }
  if (pkg) {
    if (hasDep(pkg, "react") || hasDep(pkg, "next")) {
      pushUnique(kinds, "frontend-app");
      frameworks.push(hasDep(pkg, "next") ? "next" : "react");
    }
    if (hasDep(pkg, "vue") || hasDep(pkg, "nuxt")) {
      pushUnique(kinds, "frontend-app");
      frameworks.push(hasDep(pkg, "nuxt") ? "nuxt" : "vue");
    }
    if (hasDep(pkg, "vite") || isFile(path.join(rootAbs, "vite.config.ts")) || isFile(path.join(rootAbs, "vite.config.js"))) {
      pushUnique(kinds, "frontend-app");
      if (!frameworks.includes("vite")) frameworks.push("vite");
    }
    if (hasAnyDep(pkg, ["express", "fastify", "koa", "@nestjs/core", "hono"])) {
      pushUnique(kinds, "backend-service");
      if (hasDep(pkg, "@nestjs/core")) frameworks.push("nestjs");
      else if (hasDep(pkg, "fastify")) frameworks.push("fastify");
      else if (hasDep(pkg, "hono")) frameworks.push("hono");
      else frameworks.push("node-api");
    }
    if (typeof pkg["bin"] === "string" || pkg["bin"] && typeof pkg["bin"] === "object") {
      pushUnique(kinds, "cli");
    }
    if (role === "shared") pushUnique(kinds, "shared-library");
  }
  if (/spring-boot-starter/i.test(buildText)) {
    pushUnique(kinds, "backend-service");
    frameworks.push("spring-boot");
  }
  if (/spring-cloud/i.test(buildText)) {
    pushUnique(kinds, "backend-service");
    frameworks.push("spring-cloud");
  }
  if (isDir2(path.join(rootAbs, "src", "main", "java"))) {
    pushUnique(kinds, "backend-service");
    if (!frameworks.includes("java")) frameworks.push("java");
  }
  if (isFile(path.join(rootAbs, "go.mod"))) {
    pushUnique(kinds, "backend-service");
    frameworks.push("go");
  }
  if (isFile(path.join(rootAbs, "pyproject.toml"))) {
    const pyproject = readText(path.join(rootAbs, "pyproject.toml"));
    if (/(fastapi|django|flask)/i.test(pyproject)) {
      pushUnique(kinds, "backend-service");
      frameworks.push(/fastapi/i.test(pyproject) ? "fastapi" : /django/i.test(pyproject) ? "django" : "flask");
    }
  }
  if (isFile(path.join(rootAbs, "Dockerfile")) || isFile(path.join(rootAbs, "docker-compose.yml")) || isFile(path.join(rootAbs, "docker-compose.yaml"))) {
    pushUnique(kinds, "infra");
  }
  if (role === "frontend") pushUnique(kinds, "frontend-app");
  if (role === "backend") pushUnique(kinds, "backend-service");
  if (role === "plugin") pushUnique(kinds, "claude-code-plugin");
  if (role === "infra") pushUnique(kinds, "infra");
  if (role === "mobile") pushUnique(kinds, "mobile-app");
  if (kinds.length === 0) kinds.push("unknown");
  return {
    kinds,
    frameworks: [...new Set(frameworks)],
    packageManager: detectPackageManager(rootAbs)
  };
}
function settingsAdditionalDirectories(projectRoot) {
  const entries = [];
  const candidates = [
    { file: path.join(projectRoot, ".claude", "settings.json"), base: projectRoot },
    { file: path.join(projectRoot, ".claude", "settings.local.json"), base: projectRoot },
    { file: path.join(homedir(), ".claude", "settings.json"), base: path.join(homedir(), ".claude") }
  ];
  for (const candidate of candidates) {
    const parsed = readJsonObject(candidate.file);
    const dirs = parsed?.["additionalDirectories"];
    if (!Array.isArray(dirs)) continue;
    for (const dir of dirs) {
      if (typeof dir !== "string" || dir.trim().length === 0) continue;
      entries.push(isAbsolute2(dir) ? resolve(dir) : resolve(candidate.base, dir));
    }
  }
  return [...new Set(entries)];
}
function containsPath(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || !rel.startsWith("..") && !isAbsolute2(rel);
}
function rootAccess(rootAbs, cwd, additionalDirs) {
  if (!existsSync2(rootAbs)) return "missing-path";
  if (containsPath(cwd, rootAbs)) return "inside-working-directory";
  if (additionalDirs.some((dir) => containsPath(dir, rootAbs))) {
    return "configured-additional-directory";
  }
  return "outside-working-directory";
}
function addOrMergeRoot(map, root, projectRoot) {
  const abs = isAbsolute2(root.path) ? resolve(root.path) : resolve(projectRoot, root.path);
  const key = abs;
  const existing = map.get(key);
  if (!existing || root.confidence > existing.confidence) {
    map.set(key, root);
  }
}
function siblingCandidates(projectRoot) {
  const currentBase = basename3(projectRoot).toLowerCase();
  const parent = resolve(projectRoot, "..");
  if (!isDir2(parent)) return [];
  const currentLooksBackend = /^(backend|api|server|service|services)$/.test(currentBase);
  const currentLooksFrontend = /^(frontend|web|ui|client|admin)$/.test(currentBase);
  if (!currentLooksBackend && !currentLooksFrontend) return [];
  const names = readdirSync2(parent).slice(0, 80);
  const out = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const abs = path.join(parent, name);
    if (abs === projectRoot || !isDir2(abs)) continue;
    const lower = name.toLowerCase();
    if (currentLooksBackend && /^(frontend|web|ui|client|admin)$/.test(lower)) {
      out.push({
        name: lower,
        path: relativeOrDot(projectRoot, abs),
        role: "frontend",
        source: "sibling-scan",
        confidence: 0.72
      });
    }
    if (currentLooksFrontend && /^(backend|api|server|service)$/.test(lower)) {
      out.push({
        name: lower,
        path: relativeOrDot(projectRoot, abs),
        role: "backend",
        source: "sibling-scan",
        confidence: 0.72
      });
    }
  }
  return out;
}
function detectWorkspaceState(projectRoot, roots) {
  const meaningfulEntries = meaningfulProjectEntries(projectRoot);
  if (meaningfulEntries.length === 0) return "empty";
  const accessibleRoots = roots.filter((root) => root.access !== "missing-path");
  const hasFrontend = accessibleRoots.some(
    (root) => root.role === "frontend" || root.kinds.includes("frontend-app")
  );
  const hasBackend = accessibleRoots.some(
    (root) => root.role === "backend" || root.kinds.includes("backend-service")
  );
  const hasMultipleRoots = new Set(accessibleRoots.map((root) => root.path)).size > 1;
  if (hasMultipleRoots && hasFrontend && hasBackend) return "split-repo";
  const current = accessibleRoots.find((root) => root.path === ".");
  const currentAbs = projectRoot;
  const currentKnown = current !== void 0 && current.kinds.some((kind) => kind !== "unknown" && kind !== "infra");
  if (currentKnown || hasManifestOrSource(currentAbs)) return "existing";
  return "scaffolded";
}
function discoverRawRoots(projectRoot) {
  const fromClaude = parseRootsFromClaudeMd(projectRoot);
  const map = /* @__PURE__ */ new Map();
  addOrMergeRoot(map, {
    name: "current",
    path: ".",
    role: "auto",
    source: "cwd",
    confidence: 0.5
  }, projectRoot);
  for (const root of parseCodeRootsFromCurdxSettings(projectRoot)) addOrMergeRoot(map, root, projectRoot);
  for (const root of fromClaude.roots) addOrMergeRoot(map, root, projectRoot);
  for (const root of siblingCandidates(projectRoot)) addOrMergeRoot(map, root, projectRoot);
  return {
    roots: [...map.values()],
    devContextFound: fromClaude.devContextFound,
    warnings: fromClaude.warnings
  };
}
function buildAccessFix(missingRoots) {
  const addDirs = missingRoots.filter((root) => root.access === "outside-working-directory").map((root) => `/add-dir ${root.path}`);
  const missingPaths = missingRoots.filter((root) => root.access === "missing-path").map((root) => `Path not found: ${root.path}`);
  const lines = [...addDirs, ...missingPaths];
  return lines.length > 0 ? lines.join("\n") : void 0;
}
function rootMatches(root, role) {
  if (root.role === role) return true;
  if (role === "frontend") return root.kinds.includes("frontend-app");
  if (role === "backend") return root.kinds.includes("backend-service");
  if (role === "shared") return root.kinds.includes("shared-library");
  return root.kinds.includes("claude-code-plugin");
}
function inferRequiredRoots(goal2, roots) {
  const text = (goal2 ?? "").trim();
  if (text.length === 0) return [];
  const required = /* @__PURE__ */ new Map();
  const frontendRoots = roots.filter((root) => rootMatches(root, "frontend"));
  const backendRoots = roots.filter((root) => rootMatches(root, "backend"));
  const sharedRoots = roots.filter((root) => rootMatches(root, "shared"));
  function add(root, reason) {
    required.set(root.name, {
      name: root.name,
      path: root.path,
      reason,
      access: root.access
    });
  }
  if (UI_GOAL_RE.test(text)) {
    for (const root of frontendRoots) add(root, "goal mentions UI/frontend behavior");
  }
  if (BACKEND_GOAL_RE.test(text)) {
    for (const root of backendRoots) add(root, "goal mentions backend/API behavior");
  }
  if (CONTRACT_GOAL_RE.test(text)) {
    for (const root of backendRoots) add(root, "API contract work needs backend source");
    for (const root of frontendRoots) add(root, "API contract work needs consuming frontend source");
    for (const root of sharedRoots) add(root, "API contract work may use shared contracts");
  }
  if (AUTH_GOAL_RE.test(text) && frontendRoots.length > 0 && backendRoots.length > 0) {
    for (const root of backendRoots) add(root, "auth flow spans backend behavior");
    for (const root of frontendRoots) add(root, "auth flow spans frontend behavior");
  }
  return [...required.values()];
}
function discoverProjectTopology(options = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());
  const projectRoot = findRepoRoot(cwd);
  const additionalDirs = settingsAdditionalDirectories(projectRoot);
  const raw = discoverRawRoots(projectRoot);
  const roots = [];
  for (const root of raw.roots) {
    const rootAbs = isAbsolute2(root.path) ? resolve(root.path) : resolve(projectRoot, root.path);
    const classified = classifyRoot(rootAbs, root.role);
    roots.push({
      name: root.name,
      path: normalizeSerializedPath(root.path),
      role: root.role,
      kinds: classified.kinds,
      frameworks: classified.frameworks,
      ...classified.packageManager ? { packageManager: classified.packageManager } : {},
      access: rootAccess(rootAbs, cwd, additionalDirs),
      source: root.source,
      confidence: root.confidence
    });
  }
  const requiredRoots = inferRequiredRoots(options.goal, roots);
  const missingRoots = requiredRoots.filter(
    (root) => root.access === "outside-working-directory" || root.access === "missing-path"
  );
  const workspaceState = detectWorkspaceState(projectRoot, roots);
  return {
    version: 1,
    cwd,
    projectRoot,
    workspaceState,
    devContextFound: raw.devContextFound,
    roots,
    requiredRoots,
    missingRoots,
    ...missingRoots.length > 0 ? { accessFix: buildAccessFix(missingRoots) } : {},
    warnings: [...new Set(raw.warnings)]
  };
}
function renderContextMap(topology) {
  const lines = [
    "# Project Context Map",
    "",
    `Project root: ${topology.projectRoot}`,
    `Workspace state: ${topology.workspaceState}`,
    `Dev context found: ${topology.devContextFound ? "yes" : "no"}`,
    "",
    "## Code Roots",
    ""
  ];
  for (const root of topology.roots) {
    const frameworks = root.frameworks.length > 0 ? `; frameworks: ${root.frameworks.join(", ")}` : "";
    const packageManager = root.packageManager ? `; package manager: ${root.packageManager}` : "";
    lines.push(
      `- ${root.name}: ${root.path} (${root.role}; ${root.kinds.join(", ")}; ${root.access}${frameworks}${packageManager})`
    );
  }
  if (topology.requiredRoots.length > 0) {
    lines.push("", "## Required For Current Goal", "");
    for (const root of topology.requiredRoots) {
      lines.push(`- ${root.name}: ${root.reason}; access: ${root.access}`);
    }
  }
  if (topology.missingRoots.length > 0) {
    lines.push("", "## Access Fix", "", topology.accessFix ?? "");
  }
  if (topology.warnings.length > 0) {
    lines.push("", "## Warnings", "");
    for (const warning of topology.warnings) lines.push(`- ${warning}`);
  }
  return `${lines.join("\n")}
`;
}
function readArg2(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function main2() {
  const argv = process.argv.slice(2);
  const cwd = readArg2("--cwd", argv);
  const goal2 = readArg2("--goal", argv);
  const format = readArg2("--format", argv) ?? "json";
  const topology = discoverProjectTopology({ cwd, goal: goal2 });
  if (format === "context-map") {
    process.stdout.write(renderContextMap(topology));
    return;
  }
  process.stdout.write(JSON.stringify(topology, null, 2) + "\n");
}
function isDirectRun2() {
  try {
    const entry = fileURLToPath2(import.meta.url);
    return process.argv[1] === entry && basename3(entry).startsWith("project-topology.");
  } catch {
    return false;
  }
}
if (isDirectRun2()) {
  main2();
}

// src/hooks/lib/tool-capabilities.ts
import { basename as basename4 } from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";

// src/registry/capability-tokens.ts
var KNOWN_CAPABILITY_TOKEN_PATTERN = String.raw`\b(?:claude-mem|context7|sequential-thinking|chrome-devtools-mcp|chrome devtools mcp|ui[\s_-]*ux[\s_-]*(?:pro[\s_-]*)?max|pua)\b`;
function knownCapabilityTokenRegex() {
  return new RegExp(KNOWN_CAPABILITY_TOKEN_PATTERN, "gi");
}

// src/hooks/lib/capability-normalization.ts
function stripKnownCapabilityTokens(input) {
  return (input ?? "").replace(knownCapabilityTokenRegex(), " ");
}

// src/hooks/lib/tool-capabilities.ts
var CAPABILITIES = CURDX_TOOL_CAPABILITIES;
var ORDER = [...CURDX_TOOL_CAPABILITY_ORDER];
var EXTERNAL_DOCS_RE = /\b(api|sdk|library|libraries|framework|version|upgrade|dependency|dependencies|official docs?|latest docs?|claude code|plugin|mcp|hook|hooks|skill|skills|agent|agents|scaffold|starter|template|generator|initializer|initializr|react|vue|spring|spring boot|spring cloud|next\.?js|vite|webpack|node|go|python|rust|cargo|maven|gradle|cookiecutter)\b|最新|依赖|框架|插件|官方|联网|搜索|文档|脚手架|初始化|生成器|模板/i;
var MEMORY_RE = /\b(previous|before|again|remember|memory|history|similar|repeated|regression|already solved|same bug|past decision)\b|之前|上次|记得|历史|做过|又|重复|老问题/i;
var UI_RE = /\b(ui|ux|frontend|front-end|browser|chrome|dom|css|html|layout|component|page|form|modal|responsive|visual|render|react|vue|vite|next\.?js|screenshot|interaction)\b|前端|页面|浏览器|样式|交互|组件|布局|视觉|截图/i;
var BROWSER_VERIFY_RE = /\b(browser|chrome|dom|css|network|console|performance|render|screenshot|e2e|playwright|visual regression|interaction)\b|浏览器|控制台|网络|性能|渲染|截图|端到端/i;
var COMPLEX_RE = /\b(architecture|architect|migration|migrate|security|auth|authentication|authorization|permission|oauth|payment|billing|database|schema|release|publish|tag|hook|subagent|multi[- ]?repo|monorepo|cross[- ]?system|concurrency|race|cache|rewrite|refactor)\b|架构|迁移|安全|权限|认证|数据库|发布|重写|并发|跨仓库|多仓库/i;
var STUCK_RE = /\b(stuck|failed|failure|fails|flaky|retry|debug|investigate|root cause|not working|broken|regression)\b|卡住|失败|报错|不行|修不好|定位|排查/i;
var REPEATED_FAILURE_RE = /\b(repeated|multiple failed|failed twice|failed 2|again failed|keeps failing|stuck again)\b|连续失败|多次失败|失败两次|又失败|反复失败|一直失败/i;
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
  const cap = CAPABILITIES[id];
  if (cap.type === "workflow" || cap.type === "policy") {
    return { availability: "known-available", availabilityState: "workflow" };
  }
  const expectedAvailability = cap.provisioning === "external-mcp" ? "external-expected" : "plugin-dependency";
  if (available === null) {
    return {
      availability: cap.expectedByDefault ? expectedAvailability : "check-if-installed",
      availabilityState: cap.expectedByDefault ? "expected" : "missing"
    };
  }
  if (available.has(id)) {
    return { availability: "known-available", availabilityState: "available" };
  }
  return {
    availability: cap.expectedByDefault ? expectedAvailability : "check-if-installed",
    availabilityState: "missing"
  };
}
function pushRecommendation(out, available, id, phase, reason, instruction, extra = {}) {
  const availability = capabilityAvailability(id, available);
  if (out.some((rec2) => rec2.id === id)) return;
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
    ...availability.availabilityState === "missing" && cap.missingAction ? { missingAction: cap.missingAction } : {},
    reason,
    instruction,
    triggerReason: reason,
    requiredWhen: cap.curdxRole.includes("gate") ? "Required when this route reaches its matching quality gate." : "Use when the coordinator is in the matching phase and the task context still fits this reason.",
    fallbackWhenMissing: cap.missingAction ?? (cap.doNotReimplement ? "Do not rebuild this capability inside curdx-flow; continue with the local workflow only if the evidence gate can still be satisfied." : "Use the local curdx-flow workflow path for this capability.")
  });
}
function sortRecommendations(recs) {
  return [...recs].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
}
function recommendToolCapabilities(input) {
  const goal2 = normalize(input.goal);
  const semanticGoal = normalize(stripKnownCapabilityTokens(goal2));
  const route2 = normalize(input.route);
  const risk = normalize(input.risk);
  const topologyKinds2 = input.topologyKinds ?? [];
  const topologyFrameworks2 = input.topologyFrameworks ?? [];
  const stackProfile = input.stackProfile;
  const qualityGates = input.qualityGates ?? [];
  const contextBudget = input.contextBudget;
  const missingRoots = input.missingRoots ?? 0;
  const available = input.availableCapabilities === void 0 ? null : new Set(input.availableCapabilities.filter(Boolean));
  const recs = [];
  if (missingRoots > 0) {
    return recs;
  }
  const externalDocsRelevant = EXTERNAL_DOCS_RE.test(semanticGoal);
  const localLowRisk = LOW_RISK_LOCAL_RE.test(semanticGoal) && route2 === "direct-change" && !externalDocsRelevant;
  if (localLowRisk) {
    return recs;
  }
  const hasFrontend = UI_RE.test(semanticGoal) || hasAny(topologyKinds2, ["frontend-app"]) || hasAny(topologyFrameworks2, ["react", "vue", "next.js", "vite"]);
  const browserRuntime = BROWSER_VERIFY_RE.test(semanticGoal) || hasFrontend;
  const complex = COMPLEX_RE.test(semanticGoal) && route2 !== "direct-change" || risk === "high" || risk === "critical" || route2 === "full-spec" || route2 === "epic-split";
  const stuck = STUCK_RE.test(semanticGoal);
  const repeatedFailure = REPEATED_FAILURE_RE.test(semanticGoal) || (input.recentFailures ?? 0) >= 2;
  const parallel = PARALLEL_RE.test(semanticGoal) || route2 === "epic-split";
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
      stackProfile?.primary === "claude-code-plugin" ? "Start from official Claude Code docs; use Context7 only for external library/framework docs." : "Use Context7 before editing so version-specific library behavior is grounded in current docs.",
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
  if (MEMORY_RE.test(semanticGoal) || stuck || route2 === "full-spec" || route2 === "epic-split") {
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
      "ui-ux-pro-max",
      "implementation",
      "visible frontend behavior or UI quality is in scope",
      "Use ui-ux-pro-max guidance for UI structure, interaction, responsive behavior, and visual polish when the work needs deeper UI/UX critique.",
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
  if (securityGate !== void 0 || COMPLEX_RE.test(semanticGoal)) {
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
  if ((baselineGate !== void 0 || stackProfile?.primary !== "unknown") && route2 !== "direct-change") {
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
  if (contextBudget !== void 0 && route2 !== "direct-change") {
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
  if (stuck && repeatedFailure || parallel) {
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
function parseList2(value) {
  if (!value) return [];
  return value.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}
function readArg3(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function main3() {
  const argv = process.argv.slice(2);
  const recommendations = recommendToolCapabilities({
    goal: readArg3("--goal", argv),
    route: readArg3("--route", argv),
    risk: readArg3("--risk", argv),
    topologyKinds: parseList2(readArg3("--topology-kinds", argv)),
    topologyFrameworks: parseList2(readArg3("--topology-frameworks", argv)),
    missingRoots: Number(readArg3("--missing-roots", argv) ?? 0),
    availableCapabilities: readArg3("--available-capabilities", argv) ? parseList2(readArg3("--available-capabilities", argv)) : void 0
  });
  process.stdout.write(JSON.stringify(recommendations, null, 2) + "\n");
}
function isDirectRun3() {
  try {
    const entry = fileURLToPath3(import.meta.url);
    return process.argv[1] === entry && basename4(entry).startsWith("tool-capabilities.");
  } catch {
    return false;
  }
}
if (isDirectRun3()) {
  main3();
}

// src/hooks/lib/project-brain.ts
import { appendFileSync, existsSync as existsSync3, mkdirSync as mkdirSync2, readFileSync as readFileSync3, statSync as statSync3, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join2, resolve as resolve2 } from "node:path";
var MAX_REASON = 240;
var MAX_COMMAND = 180;
var MAX_SUMMARY = 900;
var MAX_PATH = 400;
var MAX_AGENT_FIELD = 120;
var MAX_BRAIN_BYTES = 64 * 1024;
var MAX_BRAIN_LINES = 400;
function normalizeCwd(cwd) {
  return resolve2(cwd ?? process.cwd());
}
function brainPath(cwd) {
  return join2(normalizeCwd(cwd), ".curdx", "brain.jsonl");
}
function truncate(value, limit) {
  if (value === void 0) return void 0;
  const compact = value.trim().replace(/\s+/g, " ");
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, Math.max(0, limit - 3))}...`;
}
function normalizeEvent(event) {
  const out = {
    version: 1,
    type: event.type,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (event.route) out.route = event.route;
  if (event.stack) out.stack = event.stack;
  if (event.phase) out.phase = event.phase;
  if (event.command) out.command = truncate(event.command, MAX_COMMAND);
  if (typeof event.exitCode === "number" && Number.isFinite(event.exitCode)) {
    out.exitCode = event.exitCode;
  }
  if (event.verifier) out.verifier = truncate(event.verifier, MAX_COMMAND);
  if (event.reason) out.reason = truncate(event.reason, MAX_REASON);
  if (event.summary) out.summary = truncate(event.summary, MAX_SUMMARY);
  if (typeof event.files === "number" && Number.isFinite(event.files)) {
    out.files = Math.max(0, Math.floor(event.files));
  }
  if (event.sessionId) out.sessionId = truncate(event.sessionId, MAX_AGENT_FIELD);
  if (event.agentId) out.agentId = truncate(event.agentId, MAX_AGENT_FIELD);
  if (event.agentType) out.agentType = truncate(event.agentType, MAX_AGENT_FIELD);
  if (event.parentAgentId) out.parentAgentId = truncate(event.parentAgentId, MAX_AGENT_FIELD);
  if (event.transcriptPath) out.transcriptPath = truncate(event.transcriptPath, MAX_PATH);
  if (event.stopReason) out.stopReason = truncate(event.stopReason, MAX_REASON);
  return out;
}
function appendBrainEvent(cwd, event) {
  const path3 = brainPath(cwd);
  if (process.env.CURDX_FLOW_BRAIN === "off") return { ok: true, path: path3 };
  try {
    mkdirSync2(join2(normalizeCwd(cwd), ".curdx"), { recursive: true });
    appendFileSync(path3, JSON.stringify(normalizeEvent(event)) + "\n", "utf8");
    compactBrainIfNeeded(path3);
    return { ok: true, path: path3 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, path: path3, error: message };
  }
}
function compactBrainIfNeeded(path3) {
  try {
    if (statSync3(path3).size <= MAX_BRAIN_BYTES) return;
    const lines = readFileSync3(path3, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-MAX_BRAIN_LINES);
    writeFileSync2(path3, lines.join("\n") + (lines.length > 0 ? "\n" : ""), "utf8");
  } catch {
  }
}
function parseBrainLine(line) {
  try {
    const parsed = JSON.parse(line);
    if (parsed.version !== 1) return null;
    if (parsed.type !== "route-compiled" && parsed.type !== "edit-batch" && parsed.type !== "verification-run" && parsed.type !== "verification-blocked" && parsed.type !== "last-mile-decision" && parsed.type !== "compact-summary" && parsed.type !== "subagent-started" && parsed.type !== "subagent-stopped") {
      return null;
    }
    if (typeof parsed.timestamp !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}
function readBrainEvents(cwd, limit = 100) {
  const path3 = brainPath(cwd);
  if (!existsSync3(path3)) return [];
  try {
    const lines = readFileSync3(path3, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const parsed = lines.slice(Math.max(0, lines.length - Math.max(1, limit))).map(parseBrainLine).filter((event) => event !== null);
    return parsed;
  } catch {
    return [];
  }
}
function uniqueRecent(values, limit) {
  const out = [];
  for (const value of values.reverse()) {
    if (!value || out.includes(value)) continue;
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}
function summarizeProjectBrain(cwd) {
  const path3 = brainPath(cwd);
  const events = readBrainEvents(cwd, 200);
  const failures = events.filter((event) => event.type === "verification-blocked" || event.exitCode !== void 0 && event.exitCode !== 0).slice(-5).reverse().map((event) => ({
    timestamp: event.timestamp,
    type: event.type,
    phase: event.phase,
    command: event.command,
    reason: event.reason
  }));
  const verifierHints = uniqueRecent(
    events.filter((event) => event.type === "verification-run" && event.exitCode === 0).map((event) => event.command ?? event.verifier),
    5
  );
  const compactEvent = events.filter((event) => event.type === "compact-summary" && event.summary).at(-1);
  return {
    path: path3,
    exists: existsSync3(path3),
    totalEvents: events.length,
    lastUpdated: events.length > 0 ? events[events.length - 1]?.timestamp ?? null : null,
    stackHints: uniqueRecent(events.map((event) => event.stack), 5),
    verifierHints,
    recentFailures: failures,
    ...compactEvent?.summary ? {
      lastCompactSummary: {
        timestamp: compactEvent.timestamp,
        summary: compactEvent.summary
      }
    } : {}
  };
}

// src/hooks/lib/stack-capabilities.ts
import { existsSync as existsSync4, readFileSync as readFileSync4, readdirSync as readdirSync3 } from "node:fs";
import { isAbsolute as isAbsolute3, join as join3, resolve as resolve3 } from "node:path";
var STACKS = {
  "static-html": {
    id: "static-html",
    name: "Static HTML",
    frameworks: ["static-html"],
    goalPattern: /\b(static html|static frontend|static page|static web|vanilla js|vanilla javascript|plain html|html\/css\/js|index\.html|styles\.css|app\.js)\b|静态页面|原生\s*(js|javascript)/i,
    manifestHints: ["index.html"],
    docsQuery: "MDN documentation for HTML, CSS, DOM events, and browser behavior",
    tdd: "Use small DOM/browser interaction checks for user-visible behavior.",
    security: "Review DOM insertion, event handling, unsafe HTML, and local file serving assumptions.",
    verifierCommands: ["node --check app.js"],
    releaseCommands: ["node --check app.js"],
    browser: true,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "typescript": {
    id: "typescript",
    name: "TypeScript",
    frameworks: ["typescript"],
    goalPattern: /\b(ts|typescript|typecheck|tsconfig)\b/i,
    manifestHints: ["tsconfig.json", "tsconfig.*.json"],
    docsQuery: "TypeScript official documentation for compiler and project configuration",
    tdd: "Write focused tests first when behavior changes; keep typecheck as a mandatory gate.",
    security: "Review unsafe casts, unchecked external input, and dependency/script changes.",
    verifierCommands: ["npm run typecheck", "npm test", "npm run build"],
    releaseCommands: ["npm run verify"],
    browser: false,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "react": {
    id: "react",
    name: "React",
    frameworks: ["react"],
    goalPattern: /\b(react|jsx|tsx|react component|react hook)\b/i,
    manifestHints: ["package.json:react"],
    docsQuery: "React official documentation for current component and hook behavior",
    tdd: "Prefer component or interaction tests for user-visible behavior.",
    security: "Review XSS, unsafe HTML, auth state leaks, and client-side permission assumptions.",
    verifierCommands: ["npm run typecheck", "npm test", "npm run build"],
    releaseCommands: ["npm run test:e2e"],
    browser: true,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "vue": {
    id: "vue",
    name: "Vue",
    frameworks: ["vue", "vite"],
    goalPattern: /\b(vue|vue3|vite|pinia|vue router|vue component)\b/i,
    manifestHints: ["package.json:vue", "vite.config.*"],
    docsQuery: "Vue and Vite official documentation for current project setup and runtime behavior",
    tdd: "Prefer component or interaction tests; keep vue-tsc/typecheck and build gates.",
    security: "Review template injection, route guards, auth state leaks, and unsafe dynamic HTML.",
    verifierCommands: ["npm run typecheck", "npm test", "npm run build"],
    releaseCommands: ["npm run test:e2e"],
    browser: true,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "next": {
    id: "next",
    name: "Next.js",
    frameworks: ["next"],
    goalPattern: /\b(next\.?js|next|app router|server action|route handler)\b/i,
    manifestHints: ["next.config.*", "package.json:next"],
    docsQuery: "Next.js official documentation for routing, server actions, rendering, and build behavior",
    tdd: "Test server/client boundaries and route handlers before broad UI changes.",
    security: "Review server/client data exposure, auth, cookies, headers, and route handlers.",
    verifierCommands: ["npm run typecheck", "npm test", "npm run build"],
    releaseCommands: ["npm run test:e2e"],
    browser: true,
    contextBudget: {
      "direct-change": "focused",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "node": {
    id: "node",
    name: "Node.js",
    frameworks: ["node-api", "nestjs", "fastify", "hono"],
    goalPattern: /\b(node|api|express|fastify|nestjs|hono|server)\b/i,
    manifestHints: ["package.json"],
    docsQuery: "Node.js and framework official documentation for current API behavior",
    tdd: "Use unit/integration tests around API behavior and error paths.",
    security: "Review input validation, auth, command execution, secrets, and dependency scripts.",
    verifierCommands: ["npm test", "npm run typecheck", "npm run build"],
    releaseCommands: ["npm run verify"],
    browser: false,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "spring-boot": {
    id: "spring-boot",
    name: "Spring Boot",
    frameworks: ["spring-boot"],
    goalPattern: /\b(spring boot|spring|maven|gradle|controller|service|repository)\b|后端|接口/i,
    manifestHints: ["pom.xml:spring-boot", "build.gradle:spring-boot"],
    docsQuery: "Spring Boot official documentation for current runtime, testing, and actuator behavior",
    tdd: "Use slice or integration tests for controller/service/repository behavior.",
    security: "Review auth filters, authorization, validation, configuration, and secret exposure.",
    verifierCommands: ["./mvnw test", "./gradlew test", "mvn test", "gradle test"],
    releaseCommands: ["./mvnw verify", "./gradlew build"],
    browser: false,
    contextBudget: {
      "direct-change": "focused",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "spring-cloud": {
    id: "spring-cloud",
    name: "Spring Cloud",
    frameworks: ["spring-cloud"],
    goalPattern: /\b(spring cloud|gateway|config server|eureka|openfeign|resilience4j)\b/i,
    manifestHints: ["pom.xml:spring-cloud", "build.gradle:spring-cloud"],
    docsQuery: "Spring Cloud official documentation for current integration, gateway, and config behavior",
    tdd: "Prefer integration tests or contract tests for cross-service behavior.",
    security: "Review gateway filters, service auth, config leakage, and network boundaries.",
    verifierCommands: ["./mvnw test", "./gradlew test", "mvn test", "gradle test"],
    releaseCommands: ["./mvnw verify", "./gradlew build"],
    browser: false,
    contextBudget: {
      "direct-change": "focused",
      "lite-spec": "standard",
      "full-spec": "expanded",
      "epic-split": "expanded"
    }
  },
  "python": {
    id: "python",
    name: "Python",
    frameworks: ["python", "fastapi", "django", "flask"],
    goalPattern: /\b(python|pytest|fastapi|django|flask|pyproject|ruff)\b/i,
    manifestHints: ["pyproject.toml", "requirements.txt"],
    docsQuery: "Python framework official documentation for current API and testing behavior",
    tdd: "Use pytest around behavior and regression reproduction.",
    security: "Review deserialization, SQL/query construction, auth, secrets, and dependency pinning.",
    verifierCommands: ["pytest", "python -m pytest", "ruff check .", "mypy ."],
    releaseCommands: ["python -m build"],
    browser: false,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "go": {
    id: "go",
    name: "Go",
    frameworks: ["go"],
    goalPattern: /\b(go|golang|go test|go mod|goroutine|grpc)\b/i,
    manifestHints: ["go.mod"],
    docsQuery: "Go official documentation for current standard library and tooling behavior",
    tdd: "Use table-driven tests and keep go test ./... as the baseline gate.",
    security: "Review context cancellation, goroutine leaks, input validation, auth, and unsafe file/network paths.",
    verifierCommands: ["go test ./...", "go vet ./...", "go build ./..."],
    releaseCommands: ["go test ./..."],
    browser: false,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "rust": {
    id: "rust",
    name: "Rust",
    frameworks: ["rust"],
    goalPattern: /\b(rust|cargo|crate|tokio|axum)\b/i,
    manifestHints: ["Cargo.toml"],
    docsQuery: "Rust and crate official documentation for current API and safety behavior",
    tdd: "Use cargo test and focused regression tests before implementation changes.",
    security: "Review unsafe blocks, parsing, auth, IO boundaries, and dependency features.",
    verifierCommands: ["cargo test", "cargo clippy -- -D warnings", "cargo build"],
    releaseCommands: ["cargo test"],
    browser: false,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "claude-code-plugin": {
    id: "claude-code-plugin",
    name: "Claude Code plugin",
    frameworks: ["claude-code-plugin"],
    goalPattern: /\b(claude code|plugin|skill|agent|hook|hooks|mcp|marketplace|tag|release)\b/i,
    manifestHints: [
      ".claude-plugin/plugin.json",
      "hooks/hooks.json",
      "skills/*/SKILL.md",
      "plugins/*/.claude-plugin/plugin.json",
      "plugins/*/hooks/hooks.json",
      "plugins/*/skills/*/SKILL.md"
    ],
    docsQuery: "Claude Code official docs for plugins, skills, agents, hooks, dependencies, and release tags",
    tdd: "Use focused hook/runner tests and the real Claude Code smoke path before release.",
    security: "Review hook fail-open behavior, plugin metadata, dependency declarations, and release tags.",
    verifierCommands: [
      "npm run check:hooks-fresh",
      "npm run typecheck",
      "npm run test:runner",
      "CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc"
    ],
    releaseCommands: ["claude plugin validate ./plugins/curdx-flow", "npm run verify"],
    browser: false,
    contextBudget: {
      "direct-change": "focused",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  }
};
var STACK_PRIORITY = {
  "claude-code-plugin": 110,
  "next": 100,
  "static-html": 95,
  "react": 90,
  "vue": 90,
  "spring-cloud": 85,
  "spring-boot": 80,
  "go": 75,
  "rust": 75,
  "python": 75,
  "typescript": 30,
  "node": 20
};
var RELEASE_GOAL_RE = /\b(release|publish|deploy|tag)\b|发布|部署|上线|打包|标签/i;
var NPM_RELEASE_RE = /\bnpm\s+(publish|release|version|tag|dist-tag)\b|\bpublish(?:ing)?\s+(?:to\s+)?npm\b|\bnpm\s+package\b/i;
function hasReleaseGoal(goal2) {
  const text = stripKnownCapabilityTokens(goal2);
  return RELEASE_GOAL_RE.test(text) || NPM_RELEASE_RE.test(text);
}
function normalizeText(input) {
  return (input ?? "").trim().replace(/\s+/g, " ");
}
function rootFsPath(projectRoot, root) {
  return isAbsolute3(root.path) ? resolve3(root.path) : resolve3(projectRoot, root.path);
}
function readText2(file) {
  try {
    return readFileSync4(file, "utf8");
  } catch {
    return "";
  }
}
function packageJsonContains(rootAbs, pattern) {
  return pattern.test(readText2(join3(rootAbs, "package.json")));
}
function globSegmentToRegExp(segment) {
  return new RegExp(
    `^${segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`
  );
}
function globPathExists(rootAbs, hint) {
  const parts = hint.split("/").filter(Boolean);
  function walk(dir, idx) {
    if (idx >= parts.length) return existsSync4(dir);
    const part = parts[idx];
    if (!part) return false;
    if (!part.includes("*")) return walk(join3(dir, part), idx + 1);
    let entries;
    try {
      entries = readdirSync3(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    const pattern = globSegmentToRegExp(part);
    return entries.some((entry) => pattern.test(entry.name) && walk(join3(dir, entry.name), idx + 1));
  }
  return walk(rootAbs || ".", 0);
}
function hasManifestHint(rootAbs, hint) {
  if (hint.includes(":")) {
    const [file, needle] = hint.split(":", 2);
    if (!file || !needle) return false;
    return readText2(join3(rootAbs, file)).toLowerCase().includes(needle.toLowerCase());
  }
  if (hint.includes("*")) {
    return globPathExists(rootAbs, hint);
  }
  return existsSync4(join3(rootAbs, hint));
}
function scoreStack(stack, roots, projectRoot, goal2) {
  const evidence = [];
  let score = 0;
  if (stack.goalPattern.test(goal2)) {
    score += stack.id === "claude-code-plugin" ? 0.46 : ["react", "vue", "next", "spring-cloud", "spring-boot"].includes(stack.id) ? 0.32 : 0.24;
    evidence.push("goal keyword");
  }
  for (const root of roots) {
    const rootAbs = rootFsPath(projectRoot, root);
    const frameworkHits = root.frameworks.filter(
      (framework) => stack.frameworks.includes(framework)
    );
    if (frameworkHits.length > 0) {
      score += 0.34;
      evidence.push(`${root.path}: framework ${frameworkHits.join(",")}`);
    }
    for (const hint of stack.manifestHints) {
      if (hasManifestHint(rootAbs, hint)) {
        score += 0.18;
        evidence.push(`${root.path}: ${hint}`);
      }
    }
    if (stack.id === "typescript" && packageJsonContains(rootAbs, /"typescript"\s*:/i)) {
      score += 0.2;
      evidence.push(`${root.path}: package.json:typescript`);
    }
  }
  if (score <= 0) return null;
  const confidence = Math.max(0.1, Math.min(0.99, Number(score.toFixed(2))));
  return {
    id: stack.id,
    name: stack.name,
    confidence,
    evidence: [...new Set(evidence)].slice(0, 5)
  };
}
function detectStackProfile(input) {
  const goal2 = normalizeText(stripKnownCapabilityTokens(input.goal));
  const roots = input.topology.roots;
  const detected = Object.values(STACKS).map((stack) => scoreStack(stack, roots, input.topology.projectRoot, goal2)).filter((item) => item !== null).sort(
    (a, b) => b.confidence - a.confidence || STACK_PRIORITY[b.id] - STACK_PRIORITY[a.id]
  );
  const primary = detected[0]?.id ?? "unknown";
  const confidence = detected[0]?.confidence ?? 0;
  const warnings = [];
  if (primary === "unknown") {
    warnings.push("No first-class stack profile detected; use repository scripts as the verifier source.");
  }
  if (detected.length > 1 && detected[0] && detected[1] && detected[1].confidence > 0.5) {
    warnings.push("Multiple stack profiles are relevant; keep verification multi-root and avoid single-stack assumptions.");
  }
  return {
    version: 1,
    primary,
    detected,
    confidence,
    evidence: detected.flatMap((item) => item.evidence).slice(0, 8),
    warnings
  };
}
function stackFor(profile) {
  return profile.primary === "unknown" ? null : STACKS[profile.primary];
}
function selectCommand(commands, roots, projectRoot) {
  for (const command of commands) {
    if (command.startsWith("./mvnw") && !roots.some((root) => existsSync4(join3(rootFsPath(projectRoot, root), "mvnw")))) {
      continue;
    }
    if (command.startsWith("./gradlew") && !roots.some((root) => existsSync4(join3(rootFsPath(projectRoot, root), "gradlew")))) {
      continue;
    }
    return command;
  }
  return commands[0] ?? null;
}
function selectQualityGates(input) {
  const stack = stackFor(input.stackProfile);
  const route2 = input.route ?? "";
  const risk = input.risk ?? "";
  if (stack === null) {
    return [
      {
        id: "repo-verification",
        phase: "verification",
        required: route2 !== "direct-change",
        command: null,
        reason: "No stack profile matched; use the repository's documented verification command."
      }
    ];
  }
  const primaryCommand = selectCommand(stack.verifierCommands, input.topology.roots, input.topology.projectRoot);
  const gates = [
    {
      id: `${stack.id}-docs`,
      phase: "before-coding",
      required: /plugin|hook|skill|agent|latest|official|framework|api|sdk/i.test(
        stripKnownCapabilityTokens(input.goal)
      ) || stack.id === "claude-code-plugin",
      command: null,
      reason: stack.docsQuery
    },
    {
      id: `${stack.id}-tdd`,
      phase: "implementation",
      required: route2 !== "direct-change" && risk !== "low",
      command: null,
      reason: stack.tdd
    },
    {
      id: `${stack.id}-baseline`,
      phase: "verification",
      required: true,
      command: primaryCommand,
      reason: `Baseline verification for ${stack.name}.`
    }
  ];
  if (stack.browser) {
    gates.push({
      id: `${stack.id}-browser`,
      phase: "verification",
      required: route2 !== "direct-change",
      command: stack.id === "static-html" ? null : "npm run test:e2e",
      reason: "Browser-facing behavior needs Playwright or Chrome DevTools MCP evidence."
    });
  }
  const semanticGoal = stripKnownCapabilityTokens(input.goal);
  if (risk === "high" || risk === "critical" || /auth|security|permission|oauth|secret|release|publish|tag/i.test(semanticGoal)) {
    gates.push({
      id: `${stack.id}-security-review`,
      phase: "verification",
      required: risk === "critical" || /auth|security|permission|oauth|secret/i.test(semanticGoal),
      command: null,
      reason: stack.security
    });
  }
  const releaseGoal = hasReleaseGoal(input.goal);
  if (route2 === "epic-split" || releaseGoal) {
    gates.push({
      id: `${stack.id}-release`,
      phase: "release",
      required: releaseGoal,
      command: selectCommand(stack.releaseCommands, input.topology.roots, input.topology.projectRoot),
      reason: `Release-facing ${stack.name} work needs the stricter release gate.`
    });
  }
  return gates;
}
function selectSuggestedVerifier(input) {
  const browserGate = input.qualityGates.find((gate) => gate.id.endsWith("-browser"));
  const semanticGoal = stripKnownCapabilityTokens(input.goal);
  if (browserGate && /ui|browser|frontend|page|component|css|layout|交互|页面|前端/i.test(semanticGoal)) {
    return {
      kind: "browser",
      command: browserGate.command,
      fallback: "Chrome DevTools MCP",
      needsRuntime: true,
      reason: browserGate.reason
    };
  }
  if (input.stackProfile.primary === "claude-code-plugin") {
    return {
      kind: "plugin-smoke",
      command: "CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc",
      fallback: "claude plugin validate ./plugins/curdx-flow",
      needsRuntime: false,
      reason: "Claude Code plugin changes need real plugin validation in addition to unit tests."
    };
  }
  const baseline = input.qualityGates.find((gate) => gate.id.endsWith("-baseline"));
  return {
    kind: baseline?.command?.includes("build") ? "build" : "unit",
    command: baseline?.command ?? null,
    fallback: "Use the repository's documented verify command.",
    needsRuntime: false,
    reason: baseline?.reason ?? "Use local verification evidence before completion."
  };
}
function selectContextBudget(input) {
  const stack = stackFor(input.stackProfile);
  const route2 = input.route ?? "full-spec";
  const routeDefault = route2 === "direct-change" ? "tiny" : route2 === "scaffold" || route2 === "prototype" || route2 === "lite-spec" ? "focused" : route2 === "epic-split" ? "expanded" : "standard";
  const level = stack?.contextBudget[route2] ?? routeDefault;
  const limits = {
    tiny: 2,
    focused: 4,
    standard: 8,
    expanded: 12
  };
  return {
    level,
    maxReferenceFiles: limits[level],
    strategy: level === "tiny" ? "Read only the directly touched files plus one local convention file." : level === "focused" ? "Read the target files, nearest tests, and one relevant reference before editing." : level === "standard" ? "Use bounded discovery across source, tests, docs, and official references." : "Split discovery by subsystem and summarize before implementation."
  };
}
function readArg4(name, argv) {
  const idx = argv.indexOf(name);
  return idx === -1 ? void 0 : argv[idx + 1];
}
function main4() {
  const argv = process.argv.slice(2);
  const cwd = readArg4("--cwd", argv);
  const goal2 = readArg4("--goal", argv) ?? "";
  const route2 = readArg4("--route", argv);
  const risk = readArg4("--risk", argv);
  const topology = discoverProjectTopology({ cwd, goal: goal2 });
  const stackProfile = detectStackProfile({ cwd, goal: goal2, topology, route: route2, risk });
  const qualityGates = selectQualityGates({ cwd, goal: goal2, topology, route: route2, risk, stackProfile });
  const suggestedVerifier = selectSuggestedVerifier({ cwd, goal: goal2, topology, route: route2, risk, stackProfile, qualityGates });
  const contextBudget = selectContextBudget({ cwd, goal: goal2, topology, route: route2, risk, stackProfile });
  process.stdout.write(JSON.stringify({
    stackProfile,
    qualityGates,
    suggestedVerifier,
    contextBudget
  }, null, 2) + "\n");
}
function isDirectRun4() {
  try {
    return process.argv[1]?.endsWith("stack-capabilities.mjs") === true;
  } catch {
    return false;
  }
}
if (isDirectRun4()) {
  main4();
}

// src/hooks/lib/smart-route.ts
function normalizeText2(input) {
  return (input ?? "").trim().replace(/\s+/g, " ");
}
function hasFlag(flags, flag) {
  return new RegExp(`(^|\\s)${flag.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(\\s|$)`).test(
    flags ?? ""
  );
}
function parseList3(value) {
  if (!value) return [];
  return value.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}
function readArg5(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function specNameFromPath(specPath) {
  const parts = specPath.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? specPath;
}
function loadActiveSpecFromPath(cwd, specPath) {
  const statePath = join4(cwd, specPath, ".curdx-state.json");
  let phase = "unknown";
  let completed = false;
  if (existsSync5(statePath)) {
    try {
      const parsed = JSON.parse(readFileSync5(statePath, "utf8"));
      if (typeof parsed.phase === "string" && parsed.phase.trim().length > 0) {
        phase = parsed.phase;
      }
      completed = parsed.completed === true;
    } catch {
      phase = "unknown";
    }
  } else if (existsSync5(join4(cwd, specPath, "tasks.md"))) {
    phase = "execution";
  } else if (existsSync5(join4(cwd, specPath, "design.md"))) {
    phase = "tasks";
  } else if (existsSync5(join4(cwd, specPath, "requirements.md"))) {
    phase = "design";
  } else if (existsSync5(join4(cwd, specPath, "research.md"))) {
    phase = "requirements";
  }
  return {
    name: specNameFromPath(specPath),
    path: specPath,
    phase,
    completed
  };
}
function findActiveSpec(input) {
  const cwd = input.cwd ?? process.cwd();
  const fresh = hasFlag(input.flags, "--fresh");
  if (fresh) return void 0;
  const explicitName = normalizeText2(input.name);
  if (explicitName) {
    const found = findSpec(explicitName, { cwd });
    if (found.ok) return loadActiveSpecFromPath(cwd, found.path);
    return void 0;
  }
  const current = resolveCurrent({ cwd });
  if (current === null) return void 0;
  return loadActiveSpecFromPath(cwd, current);
}
function nextActionForActiveSpec(spec) {
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
function publicPolicy(policy) {
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
    shouldSplitSpec: policy.shouldSplitSpec
  };
}
function routeFromPolicy(policy) {
  if (policy.shouldSplitSpec || policy.executionMode === "epic-triage") {
    return "epic-split";
  }
  if (policy.executionMode === "direct") return "direct-change";
  if (policy.executionMode === "spec-lite") return "lite-spec";
  return "full-spec";
}
var STACK_RE = /\b(vue|vue3|vite|pinia|vue router|react|next\.?js|nuxt|static html|vanilla js|index\.html|styles\.css|app\.js|spring|spring boot|spring cloud|maven|gradle|java|node|nestjs|fastapi|go|postgres|mysql|redis|docker)\b|前端|后端|全栈|全家桶/i;
var ARTIFACT_RE = /\b(prd|spec|requirements?|design doc|figma|wireframe|openapi|swagger|api doc|接口文档|产品文档|需求文档|设计稿|原型图)\b/i;
var SCAFFOLD_RE = /\b(scaffold|bootstrap|init|starter|template|skeleton|create project|create app|new project|setup project)\b|脚手架|初始化|搭建项目|创建项目|项目骨架|先搭骨架|搭骨架/i;
var PROTOTYPE_RE = /\b(prototype|poc|demo|spike|experiment|technical validation|prove|验证|原型|演示|技术验证|试验)\b/i;
var PRODUCT_RE = /\b(app|application|system|platform|saas|crm|dashboard|admin|portal|product|service|tool)\b|系统|平台|后台|管理端|应用|产品|工具|开发一套|做一个|做一套/i;
var PRODUCT_DOMAIN_HINT_RE = /\b(crm|customer|order|inventory|invoice|booking|calendar|todo|task|project|ticket|commerce|shop|blog|cms|dashboard|admin|user|auth|report)\b|客户|订单|库存|合同|发票|预约|日历|待办|任务|项目|工单|商城|电商|博客|内容|后台|用户|权限|登录|报表/i;
var FIX_RE = /\b(fix|bug|debug|repair|resolve|broken|regression|修复|报错|失败|排查|定位)\b/i;
var REFACTOR_RE = /\b(refactor|rewrite|cleanup|restructure|重构|重写|整理)\b/i;
var RELEASE_RE = /\b(release|publish|deploy|tag|上线|发布|部署|打包)\b/i;
var NPM_RELEASE_RE2 = /\bnpm\s+(publish|release|version|tag|dist-tag)\b|\bpublish(?:ing)?\s+(?:to\s+)?npm\b|\bnpm\s+package\b/i;
var DEMO_RE = /\b(demo|prototype|poc|演示|原型)\b/i;
var PRODUCTION_RE = /\b(production|prod|ship|launch|deploy|release|上线|生产|发布|可用|能用)\b/i;
function hasReleaseIntent(goal2) {
  return RELEASE_RE.test(goal2) || NPM_RELEASE_RE2.test(goal2);
}
function classifyIntent(goal2, topology) {
  const semanticGoal = stripKnownCapabilityTokens(goal2);
  const artifactProvided = ARTIFACT_RE.test(semanticGoal);
  const stackSpecified = STACK_RE.test(semanticGoal);
  let intentKind = "unknown";
  if (artifactProvided) intentKind = "import-spec";
  else if (SCAFFOLD_RE.test(semanticGoal)) intentKind = "scaffold";
  else if (PROTOTYPE_RE.test(semanticGoal)) intentKind = "prototype";
  else if (hasReleaseIntent(semanticGoal)) intentKind = "release";
  else if (FIX_RE.test(semanticGoal)) intentKind = "fix";
  else if (REFACTOR_RE.test(semanticGoal)) intentKind = "refactor";
  else if (PRODUCT_RE.test(semanticGoal)) intentKind = "product";
  else if (goal2.length > 0) intentKind = "feature";
  let deliveryExpectation = "maintenance";
  if (DEMO_RE.test(semanticGoal)) deliveryExpectation = "demo";
  else if (PRODUCTION_RE.test(semanticGoal)) deliveryExpectation = "production";
  else if (intentKind === "product" || topology.workspaceState === "empty") {
    deliveryExpectation = "usable-app";
  }
  const missingFacts = [];
  if (topology.workspaceState === "empty" && intentKind === "product" && !artifactProvided && !PRODUCT_DOMAIN_HINT_RE.test(semanticGoal)) {
    missingFacts.push("product domain, target user, MVP acceptance criteria");
  }
  if (topology.workspaceState === "empty" && (intentKind === "product" || intentKind === "feature") && !stackSpecified) {
    missingFacts.push("preferred stack or permission to choose defaults");
  }
  if (intentKind === "prototype" && !/success|metric|prove|验证|成功|标准/i.test(semanticGoal)) {
    missingFacts.push("prototype success criterion");
  }
  let clarity = "medium";
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
      recommendedAction = "select an official/ecosystem scaffold source when available, create the requested skeleton, then run baseline verification";
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
    recommendedAction
  };
}
function routeFromIntent(intent, policy) {
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
function reasonForRoute(route2, policy, intent) {
  if (route2 === "scaffold" || route2 === "product-inception" || route2 === "greenfield-spec" || route2 === "prototype" || route2 === "import-spec") {
    return intent.recommendedAction;
  }
  return policy.reasons[0] ?? "deterministic policy classification";
}
function routeDefaults(route2) {
  switch (route2) {
    case "direct-change":
      return {
        nextAction: "Handle directly in the current turn; do not create a spec or tasks.md.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: false,
        taskCountLimit: 1
      };
    case "lite-spec":
      return {
        nextAction: "Create a lightweight spec and 1-3 value-slice tasks, then execute without unnecessary subagents.",
        shouldCreateSpec: true,
        shouldCreateTasks: true,
        shouldUseSubagent: false,
        taskCountLimit: 3
      };
    case "full-spec":
      return {
        nextAction: "Run the full research, requirements, design, tasks, and implementation workflow.",
        shouldCreateSpec: true,
        shouldCreateTasks: true,
        shouldUseSubagent: true,
        taskCountLimit: 12
      };
    case "epic-split":
      return {
        nextAction: "Run /curdx-flow:triage; do not force this work into one oversized spec.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: true,
        taskCountLimit: 12
      };
    case "scaffold":
      return {
        nextAction: "Select an official/ecosystem scaffold source when available, create the requested skeleton, record assumptions, then run baseline verification.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: false,
        taskCountLimit: 1
      };
    case "product-inception":
      return {
        nextAction: "Create product context first: mission, constraints, roadmap, tech-stack assumptions, and project constitution before application code.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: true,
        taskCountLimit: 0
      };
    case "greenfield-spec":
      return {
        nextAction: "Create a greenfield spec with constitution, technical plan, walking skeleton, and vertical-slice tasks.",
        shouldCreateSpec: true,
        shouldCreateTasks: true,
        shouldUseSubagent: true,
        taskCountLimit: 10
      };
    case "prototype":
      return {
        nextAction: "Create a bounded prototype spec, define the success criterion, implement the thinnest proof, and verify it.",
        shouldCreateSpec: true,
        shouldCreateTasks: true,
        shouldUseSubagent: false,
        taskCountLimit: 5
      };
    case "import-spec":
      return {
        nextAction: "Import the provided PRD/spec/design/API artifact, normalize it into curdx-flow artifacts, then plan implementation.",
        shouldCreateSpec: true,
        shouldCreateTasks: true,
        shouldUseSubagent: true,
        taskCountLimit: 12
      };
    case "resume-current":
      return {
        nextAction: "Resume the active spec at its next incomplete phase.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: true,
        taskCountLimit: 12
      };
    case "blocked-ask-user":
      return {
        nextAction: "Ask one focused question before continuing.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: false,
        taskCountLimit: 0
      };
  }
}
function publicTopology(topology) {
  return {
    workspaceState: topology.workspaceState,
    devContextFound: topology.devContextFound,
    roots: topology.roots,
    requiredRoots: topology.requiredRoots,
    missingRoots: topology.missingRoots,
    ...topology.accessFix ? { accessFix: topology.accessFix } : {},
    warnings: topology.warnings
  };
}
function topologyKinds(topology) {
  return [...new Set(topology.roots.flatMap((root) => root.kinds))];
}
function topologyFrameworks(topology) {
  return [...new Set(topology.roots.flatMap((root) => root.frameworks))];
}
function classifySmartRoute(input) {
  const goal2 = normalizeText2(input.goal);
  const cwd = input.cwd ?? process.cwd();
  const activeSpec = findActiveSpec({ ...input, cwd });
  const topology = discoverProjectTopology({ cwd, goal: goal2 });
  const intent = classifyIntent(goal2, topology);
  const policy = classifyAutoPolicy({
    goal: goal2,
    flags: input.flags,
    changedFiles: input.changedFiles,
    estimatedFiles: input.estimatedFiles,
    taskCount: input.taskCount
  });
  const routeCandidate = routeFromIntent(intent, policy);
  const stackProfile = detectStackProfile({
    cwd,
    goal: goal2,
    topology,
    route: routeCandidate,
    risk: policy.risk
  });
  const qualityGates = selectQualityGates({
    cwd,
    goal: goal2,
    topology,
    route: routeCandidate,
    risk: policy.risk,
    stackProfile
  });
  const suggestedVerifier = selectSuggestedVerifier({
    cwd,
    goal: goal2,
    topology,
    route: routeCandidate,
    risk: policy.risk,
    stackProfile,
    qualityGates
  });
  const contextBudget = selectContextBudget({
    cwd,
    goal: goal2,
    topology,
    route: routeCandidate,
    risk: policy.risk,
    stackProfile
  });
  const brain = summarizeProjectBrain(cwd);
  const recommendations = recommendToolCapabilities({
    goal: goal2,
    route: routeCandidate,
    risk: policy.risk,
    topologyKinds: topologyKinds(topology),
    topologyFrameworks: topologyFrameworks(topology),
    stackProfile,
    qualityGates,
    contextBudget,
    missingRoots: topology.missingRoots.length,
    availableCapabilities: input.availableCapabilities,
    recentFailures: brain.recentFailures.length
  });
  if (activeSpec !== void 0 && !activeSpec.completed && goal2.length === 0) {
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
      reasons: ["active unfinished spec"]
    };
  }
  if (activeSpec !== void 0 && !activeSpec.completed && normalizeText2(input.name).length > 0 && goal2.length > 0) {
    return {
      version: 1,
      route: "blocked-ask-user",
      reason: "requested spec already exists and is unfinished",
      activeSpec,
      blockedReason: "Ask whether to resume the existing spec or rerun with --fresh for new work.",
      ...routeDefaults("blocked-ask-user"),
      topology: publicTopology(topology),
      intent,
      stackProfile,
      qualityGates,
      suggestedVerifier,
      contextBudget,
      recommendedCapabilities: recommendations,
      policy: publicPolicy(policy),
      reasons: ["existing unfinished spec with new goal text"]
    };
  }
  const explicitName = normalizeText2(input.name);
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
        reasons: ["ambiguous spec name"]
      };
    }
  }
  if (goal2.length === 0) {
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
      reasons: ["missing goal"]
    };
  }
  if (topology.missingRoots.length > 0) {
    const missing = topology.missingRoots.map((root) => `${root.name} (${root.path})`).join(", ");
    return {
      version: 1,
      route: "blocked-ask-user",
      reason: "related code root is not accessible",
      blockedReason: `Goal requires ${missing}. ${topology.accessFix ?? "Add the missing root before continuing."}`,
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
      reasons: ["related code root is outside current Claude Code access"]
    };
  }
  const route2 = routeCandidate;
  const defaults = routeDefaults(route2);
  return {
    version: 1,
    route: route2,
    reason: reasonForRoute(route2, policy, intent),
    ...defaults,
    topology: publicTopology(topology),
    intent,
    stackProfile,
    qualityGates,
    suggestedVerifier,
    contextBudget,
    recommendedCapabilities: recommendations,
    policy: publicPolicy(policy),
    reasons: policy.reasons
  };
}
function main5() {
  const argv = process.argv.slice(2);
  const goal2 = readArg5("--goal", argv) ?? "";
  const name = readArg5("--name", argv);
  const flags = readArg5("--flags", argv) ?? "";
  const cwd = readArg5("--cwd", argv);
  const files = parseList3(readArg5("--files", argv));
  const availableCapabilities = parseList3(readArg5("--available-capabilities", argv));
  const estimatedRaw = readArg5("--estimated-files", argv);
  const taskRaw = readArg5("--task-count", argv);
  const route2 = classifySmartRoute({
    goal: goal2,
    name,
    flags,
    cwd,
    changedFiles: files,
    availableCapabilities: availableCapabilities.length > 0 ? availableCapabilities : void 0,
    estimatedFiles: estimatedRaw === void 0 ? void 0 : Number(estimatedRaw),
    taskCount: taskRaw === void 0 ? void 0 : Number(taskRaw)
  });
  process.stdout.write(JSON.stringify(route2, null, 2) + "\n");
}
function isDirectRun5() {
  try {
    const entry = fileURLToPath4(import.meta.url);
    return process.argv[1] === entry && basename5(entry).startsWith("smart-route.");
  } catch {
    return false;
  }
}
if (isDirectRun5()) {
  main5();
}

// src/hooks/lib/workflow-snapshot.ts
import { execFileSync } from "node:child_process";
import { existsSync as existsSync6, readFileSync as readFileSync6, statSync as statSync4 } from "node:fs";
import { basename as basename6, isAbsolute as isAbsolute4, join as join5 } from "node:path";
import { fileURLToPath as fileURLToPath5 } from "node:url";

// src/hooks/_shared/markdown-task-parser.ts
var TASK_LINE_RE = /^- \[[ x]\]/;
var INDENTED_RE = /^  /;
var BLANK_RE = /^\s*$/;
var TASK_HEADER_RE = /^- \[([ x])\]\s+(?:(\d+(?:\.\d+)*)\s+)?(.*)$/;
function normalize2(input) {
  if (!input) return "";
  let s = input;
  if (s.charCodeAt(0) === 65279) s = s.slice(1);
  return s.replace(/\r\n?/g, "\n");
}
function trimTrailingBlankLines(lines) {
  let end = lines.length;
  while (end > 0 && BLANK_RE.test(lines[end - 1] ?? "")) end--;
  return lines.slice(0, end);
}
function parseTaskList(markdown) {
  if (!markdown) return [];
  const lines = normalize2(markdown).split("\n");
  const tasks2 = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    const trimmed = trimTrailingBlankLines(current.lines);
    const lineEnd = current.lineStart + trimmed.length - 1;
    tasks2.push({
      ...current.meta,
      raw: trimmed.join("\n"),
      lineEnd
    });
    current = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineNo = i + 1;
    if (TASK_LINE_RE.test(line)) {
      flush();
      const m = line.match(TASK_HEADER_RE);
      const completed = m ? m[1] === "x" : false;
      const id = m && m[2] ? m[2] : void 0;
      const title = m && m[3] !== void 0 ? m[3] : line;
      current = {
        lines: [line],
        lineStart: lineNo,
        lineEnd: lineNo,
        meta: { id, title, completed }
      };
      continue;
    }
    if (!current) continue;
    if (INDENTED_RE.test(line) || BLANK_RE.test(line)) {
      current.lines.push(line);
      continue;
    }
    flush();
  }
  flush();
  return tasks2;
}

// src/hooks/lib/workflow-snapshot.ts
function readArg6(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function normalizeSpecPath(cwd, specPath) {
  if (isAbsolute4(specPath)) return specPath;
  return join5(cwd, specPath);
}
function specNameFromPath2(specPath) {
  const parts = specPath.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? basename6(specPath);
}
function resolveSpecPath(input) {
  const cwd = input.cwd ?? process.cwd();
  const explicit = input.spec?.trim();
  if (explicit) {
    if (explicit.startsWith("./") || explicit.startsWith("../") || isAbsolute4(explicit)) {
      return explicit;
    }
    const found = findSpec(explicit, { cwd });
    if (found.ok) return found.path;
    return explicit;
  }
  return resolveCurrent({ cwd, sessionId: input.sessionId }) ?? void 0;
}
function readJsonFile(path3) {
  try {
    return { ok: true, value: JSON.parse(readFileSync6(path3, "utf8")) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
function artifact(specFs, filename) {
  const p = join5(specFs, filename);
  if (!existsSync6(p)) return { exists: false, path: p };
  try {
    const st = statSync4(p);
    return {
      exists: true,
      path: p,
      mtimeMs: st.mtimeMs,
      bytes: st.size
    };
  } catch {
    return { exists: true, path: p };
  }
}
function extractVerify(raw) {
  const m = raw.match(/^\s+- \*\*Verify\*\*:\s*(.+)$/m);
  return m?.[1]?.trim();
}
function extractFiles(raw) {
  const m = raw.match(/^\s+- \*\*Files\*\*:\s*(.+)$/m);
  const value = m?.[1]?.trim();
  if (!value) return [];
  return value.split(/[,;]/).map((part) => part.trim().replace(/^`|`$/g, "")).filter(Boolean);
}
function buildTaskSnapshot(specFs, state2) {
  const tasksPath = join5(specFs, "tasks.md");
  if (!existsSync6(tasksPath)) {
    return { total: 0, completed: 0, pending: 0, currentIndex: 0 };
  }
  let tasks2 = [];
  try {
    tasks2 = parseTaskList(readFileSync6(tasksPath, "utf8"));
  } catch {
    tasks2 = [];
  }
  const total = tasks2.length;
  const completed = tasks2.reduce((n, task) => n + (task.completed ? 1 : 0), 0);
  const pending = total - completed;
  const rawIndex = typeof state2?.taskIndex === "number" ? state2.taskIndex : completed;
  const currentIndex = Math.max(0, Math.min(rawIndex, Math.max(total - 1, 0)));
  const currentTask = tasks2[currentIndex];
  return {
    total,
    completed,
    pending,
    currentIndex,
    ...currentTask ? {
      current: {
        ...currentTask.id ? { id: currentTask.id } : {},
        title: currentTask.title,
        lineStart: currentTask.lineStart,
        lineEnd: currentTask.lineEnd,
        ...extractVerify(currentTask.raw) ? { verify: extractVerify(currentTask.raw) } : {},
        files: extractFiles(currentTask.raw)
      }
    } : {}
  };
}
function gitSnapshot(cwd) {
  try {
    const branch = execFileSync("git", ["branch", "--show-current"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const status2 = execFileSync("git", ["status", "--porcelain"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).split(/\r?\n/).filter(Boolean);
    return {
      available: true,
      ...branch ? { branch } : {},
      dirty: status2.length > 0,
      changedFiles: status2.length
    };
  } catch {
    return { available: false, dirty: false, changedFiles: 0 };
  }
}
function compactTopology(topology) {
  return {
    workspaceState: topology.workspaceState,
    devContextFound: topology.devContextFound,
    roots: topology.roots,
    requiredRoots: topology.requiredRoots,
    missingRoots: topology.missingRoots,
    ...topology.accessFix ? { accessFix: topology.accessFix } : {},
    warnings: topology.warnings
  };
}
function isLiteSpecState(state2) {
  const route2 = state2?.route?.route;
  return state2?.autoPolicy?.executionMode === "spec-lite" || route2 === "lite-spec";
}
function inferNextAction(state2, artifacts, tasks2) {
  if (state2?.completed === true) return "Spec is completed. Use /curdx-flow:refactor for follow-up changes.";
  if (isLiteSpecState(state2)) {
    if (!artifacts.tasks.exists) return "Run /curdx-flow:tasks.";
    if (tasks2.pending > 0) return "Run /curdx-flow:implement.";
    return "All task checkboxes are complete; run verification/refactor or mark complete.";
  }
  if (!artifacts.research.exists) return "Run /curdx-flow:research.";
  if (!artifacts.requirements.exists) return "Run /curdx-flow:requirements.";
  if (!artifacts.design.exists) return "Run /curdx-flow:design.";
  if (!artifacts.tasks.exists) return "Run /curdx-flow:tasks.";
  if (tasks2.pending > 0) return "Run /curdx-flow:implement.";
  return "All task checkboxes are complete; run verification/refactor or mark complete.";
}
function buildGates(stateInfo, artifacts, tasks2, topology) {
  const gates = [];
  const isLiteSpec = stateInfo.autoPolicy?.executionMode === "spec-lite";
  if (!stateInfo.exists) gates.push("missing-state");
  if (stateInfo.exists && !stateInfo.valid) gates.push("invalid-state");
  if (topology && topology.missingRoots.length > 0) gates.push("missing-code-root");
  if (isLiteSpec) {
    if (!artifacts.tasks.exists) gates.push("missing-tasks");
  } else {
    if (!artifacts.research.exists) gates.push("missing-research");
    if (!artifacts.requirements.exists && artifacts.research.exists) gates.push("missing-requirements");
    if (!artifacts.design.exists && artifacts.requirements.exists) gates.push("missing-design");
    if (!artifacts.tasks.exists && artifacts.design.exists) gates.push("missing-tasks");
  }
  if (artifacts.tasks.exists && tasks2.total === 0) gates.push("empty-tasks");
  if (tasks2.total > 0 && stateInfo.phase === "execution" && tasks2.pending === 0 && !stateInfo.completed) {
    gates.push("completion-unmarked");
  }
  return gates;
}
function buildWorkflowSnapshot(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const specPath = resolveSpecPath({ ...input, cwd });
  const topology = compactTopology(discoverProjectTopology({ cwd, goal: input.goal ?? "" }));
  const git = gitSnapshot(cwd);
  const brain = summarizeProjectBrain(cwd);
  if (!specPath) {
    return {
      version: 2,
      cwd,
      active: false,
      state: {
        exists: false,
        valid: false,
        completed: false,
        awaitingApproval: false,
        quickMode: false,
        recommendedCapabilities: [],
        verificationBlocks: {}
      },
      artifacts: {
        research: { exists: false, path: join5(cwd, "research.md") },
        requirements: { exists: false, path: join5(cwd, "requirements.md") },
        design: { exists: false, path: join5(cwd, "design.md") },
        tasks: { exists: false, path: join5(cwd, "tasks.md") },
        progress: { exists: false, path: join5(cwd, ".progress.md") }
      },
      tasks: { total: 0, completed: 0, pending: 0, currentIndex: 0 },
      topology,
      git,
      recovery: {
        recentFailures: brain.recentFailures,
        ...brain.lastCompactSummary ? { lastCompactSummary: brain.lastCompactSummary } : {}
      },
      nextAction: "No active spec. Run /curdx-flow:start <name> <goal>.",
      gates: ["no-active-spec"]
    };
  }
  const specFs = normalizeSpecPath(cwd, specPath);
  const statePath = join5(specFs, ".curdx-state.json");
  let state2 = null;
  const stateInfo = {
    exists: existsSync6(statePath),
    valid: false,
    completed: false,
    awaitingApproval: false,
    quickMode: false,
    recommendedCapabilities: [],
    verificationBlocks: {}
  };
  if (stateInfo.exists) {
    const parsed = readJsonFile(statePath);
    if (parsed.ok) {
      state2 = parsed.value;
      stateInfo.valid = true;
      stateInfo.version = parsed.value.version;
      stateInfo.phase = parsed.value.phase;
      stateInfo.completed = parsed.value.completed === true;
      stateInfo.awaitingApproval = parsed.value.awaitingApproval === true;
      stateInfo.quickMode = parsed.value.quickMode === true;
      stateInfo.autoPolicy = parsed.value.autoPolicy;
      stateInfo.recommendedCapabilities = parsed.value.recommendedCapabilities ?? [];
      stateInfo.projectTopology = parsed.value.projectTopology;
      stateInfo.verificationBlocks = parsed.value.verificationBlocks ?? {};
    } else {
      stateInfo.error = parsed.error;
    }
  }
  const artifacts = {
    research: artifact(specFs, "research.md"),
    requirements: artifact(specFs, "requirements.md"),
    design: artifact(specFs, "design.md"),
    tasks: artifact(specFs, "tasks.md"),
    progress: artifact(specFs, ".progress.md")
  };
  const tasks2 = buildTaskSnapshot(specFs, state2);
  return {
    version: 2,
    cwd,
    active: existsSync6(specFs),
    spec: {
      name: specNameFromPath2(specPath),
      path: specPath,
      fsPath: specFs,
      statePath
    },
    state: stateInfo,
    artifacts,
    tasks: tasks2,
    topology,
    git,
    recovery: {
      recentFailures: brain.recentFailures,
      ...brain.lastCompactSummary ? { lastCompactSummary: brain.lastCompactSummary } : {}
    },
    nextAction: inferNextAction(state2, artifacts, tasks2),
    gates: buildGates(stateInfo, artifacts, tasks2, topology)
  };
}
function main6() {
  const argv = process.argv.slice(2);
  const snapshot2 = buildWorkflowSnapshot({
    cwd: readArg6("--cwd", argv),
    spec: readArg6("--spec", argv),
    goal: readArg6("--goal", argv),
    sessionId: readArg6("--session-id", argv)
  });
  process.stdout.write(JSON.stringify(snapshot2, null, 2) + "\n");
}
function isDirectRun6() {
  try {
    const entry = fileURLToPath5(import.meta.url);
    return process.argv[1] === entry && basename6(entry).startsWith("workflow-snapshot.");
  } catch {
    return false;
  }
}
if (isDirectRun6()) {
  main6();
}

// src/hooks/lib/check-verification-blocks.ts
import { readFileSync as readFileSync7, readdirSync as readdirSync4, statSync as statSync5, existsSync as existsSync7 } from "node:fs";
import path2 from "node:path";
var VERIFICATION_PHASES = [
  "research",
  "requirements",
  "design",
  "tasks",
  "execution"
];
async function runVerificationCheck(opts = {}) {
  const repoRoot = opts.repoRoot ?? process.cwd();
  const env = opts.env ?? process.env;
  const specsDir = path2.join(repoRoot, "specs");
  const specDir = resolveActiveSpecDir(specsDir);
  if (!specDir) {
    return {
      ok: true,
      code: 0,
      skipped: true,
      message: "check-verification-blocks: no active spec found, skipping.\n"
    };
  }
  if (env.CURDX_VERIFY_SKIP_BLOCKS === "1") {
    return {
      ok: true,
      code: 0,
      skipped: true,
      specDir,
      message: "[check-verification-blocks] CURDX_VERIFY_SKIP_BLOCKS=1 \u2014 skipping gate.\n"
    };
  }
  const stateFile = path2.join(specDir, ".curdx-state.json");
  let state2;
  try {
    state2 = JSON.parse(readFileSync7(stateFile, "utf8"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: 2,
      specDir,
      message: `\u2717 failed to read ${path2.relative(repoRoot, stateFile)}: ${msg}
`
    };
  }
  if (typeof state2 !== "object" || state2 === null || !("verificationBlocks" in state2)) {
    const rel2 = path2.relative(repoRoot, specDir);
    return {
      ok: true,
      code: 0,
      skipped: true,
      specDir,
      message: `[check-verification-blocks] No verificationBlocks defined \u2014 skipping (treat as initial state)
  Active spec: ${rel2}
`
    };
  }
  const blocks = state2.verificationBlocks;
  const blocksObj = blocks && typeof blocks === "object" && !Array.isArray(blocks) ? blocks : null;
  const presentPhases = blocksObj ? Object.keys(blocksObj).filter(
    (p) => blocksObj[p] !== void 0 && blocksObj[p] !== null
  ) : [];
  if (!blocksObj || presentPhases.length === 0) {
    const rel2 = path2.relative(repoRoot, specDir);
    return {
      ok: false,
      code: 2,
      specDir,
      message: `\u2717 No verificationBlocks found. Run the appropriate phase verification command.
  Active spec: ${rel2}
  Hint: each phase must record an entry in .curdx-state.json::verificationBlocks
        (see plugins/curdx-flow/references/iron-law-verification.md).
`
    };
  }
  const failures = [];
  for (const phase of presentPhases) {
    if (!VERIFICATION_PHASES.includes(phase)) {
      failures.push({
        phase,
        reason: `unknown phase key "${phase}"`,
        command: "(remove from state)"
      });
      continue;
    }
    const raw = blocksObj[phase];
    if (typeof raw !== "object" || raw === null) {
      failures.push({
        phase,
        reason: "block is not an object",
        command: "(rewrite block)"
      });
      continue;
    }
    const block = raw;
    const command = typeof block.command === "string" ? block.command : "(unknown command)";
    const exitCode = block.exitCode;
    const timestamp = block.timestamp;
    const srcMtime = block.srcMtime;
    const failedReason = block.failedReason;
    if (exitCode !== 0) {
      failures.push({
        phase,
        reason: typeof failedReason === "string" && failedReason.length > 0 ? `verification failed: ${failedReason} (exitCode=${String(exitCode)})` : `verification failed (exitCode=${String(exitCode)})`,
        command
      });
      continue;
    }
    const ts = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
    if (Number.isNaN(ts)) {
      failures.push({
        phase,
        reason: `invalid timestamp "${String(timestamp)}"`,
        command
      });
      continue;
    }
    if (typeof srcMtime !== "number" || !Number.isFinite(srcMtime) || srcMtime < 0) {
      failures.push({
        phase,
        reason: `invalid srcMtime ${String(srcMtime)}`,
        command
      });
      continue;
    }
    if (ts < srcMtime) {
      const srcIso = new Date(srcMtime).toISOString();
      failures.push({
        phase,
        reason: `stale evidence: src changed at ${srcIso}, last verified at ${String(timestamp)}`,
        command
      });
    }
  }
  if (failures.length > 0) {
    const rel2 = path2.relative(repoRoot, specDir);
    let message = "\u2717 verificationBlocks gate failed:\n";
    message += `  Active spec: ${rel2}
`;
    for (const f of failures) {
      message += `  - phase "${f.phase}": ${f.reason}
`;
      message += `      Re-run: ${f.command}
`;
    }
    message += "\n";
    message += "See plugins/curdx-flow/references/iron-law-verification.md for the full checklist.\n";
    return { ok: false, code: 2, specDir, message };
  }
  const rel = path2.relative(repoRoot, specDir);
  return {
    ok: true,
    code: 0,
    specDir,
    message: `All verificationBlocks valid.
  Active spec: ${rel}
  Phases verified: ${presentPhases.join(", ")}
`
  };
}
function resolveActiveSpecDir(specsDir) {
  const pointer = path2.join(specsDir, ".current-spec");
  if (existsSync7(pointer)) {
    try {
      const name = readFileSync7(pointer, "utf8").trim();
      if (name) {
        const dir = path2.join(specsDir, name);
        if (existsSync7(path2.join(dir, ".curdx-state.json"))) return dir;
      }
    } catch {
    }
  }
  if (!existsSync7(specsDir)) return null;
  let entries;
  try {
    entries = readdirSync4(specsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  let latest = null;
  let latestMtime = 0;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".") || e.name.startsWith("_")) continue;
    const stateFile = path2.join(specsDir, e.name, ".curdx-state.json");
    if (!existsSync7(stateFile)) continue;
    try {
      const st = statSync5(stateFile);
      if (st.mtimeMs > latestMtime) {
        latestMtime = st.mtimeMs;
        latest = path2.join(specsDir, e.name);
      }
    } catch {
    }
  }
  return latest;
}

// src/hooks/lib/verify-blocks.ts
import { promises as fs } from "node:fs";
import { basename as basename7, join as join6 } from "node:path";
var WALK_SKIP_DIRS = /* @__PURE__ */ new Set([
  ".git",
  "node_modules",
  "dist",
  ".curdx",
  ".claude"
]);
var WALK_MAX_DEPTH = 6;
async function walkSrcTree(dir) {
  let maxMtime = 0;
  async function walk(current, depth) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = join6(current, entry.name);
      if (entry.isDirectory()) {
        if (WALK_SKIP_DIRS.has(entry.name)) continue;
        if (depth >= WALK_MAX_DEPTH) continue;
        await walk(abs, depth + 1);
        continue;
      }
      try {
        const st = await fs.stat(abs);
        if (st.mtimeMs > maxMtime) maxMtime = st.mtimeMs;
      } catch {
        continue;
      }
    }
  }
  await walk(dir, 0);
  return maxMtime;
}

// src/hooks/lib/dev-runtime.ts
import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync as existsSync8,
  mkdirSync as mkdirSync3,
  openSync,
  readFileSync as readFileSync8,
  rmSync,
  writeFileSync as writeFileSync3
} from "node:fs";
import { isAbsolute as isAbsolute5, join as join7, resolve as resolve4 } from "node:path";
var DEFAULT_STATIC_HTML_PORT = 8123;
var STATIC_HTML_NODE_EVAL_PATTERN = /^node -e "eval\(Buffer\.from\('([A-Za-z0-9+/=]+)','base64'\)\.toString\('utf8'\)\)"$/;
function staticHtmlPort() {
  const raw = process.env["CURDX_FLOW_STATIC_PORT"];
  if (raw === void 0 || raw.trim() === "") return DEFAULT_STATIC_HTML_PORT;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : DEFAULT_STATIC_HTML_PORT;
}
function readJsonFile2(path3) {
  try {
    return JSON.parse(readFileSync8(path3, "utf8"));
  } catch {
    return null;
  }
}
function detectPackageManager2(rootAbs) {
  if (existsSync8(join7(rootAbs, "pnpm-lock.yaml")) || existsSync8(join7(rootAbs, "pnpm-workspace.yaml"))) return "pnpm";
  if (existsSync8(join7(rootAbs, "bun.lockb")) || existsSync8(join7(rootAbs, "bun.lock"))) return "bun";
  if (existsSync8(join7(rootAbs, "yarn.lock"))) return "yarn";
  if (existsSync8(join7(rootAbs, "package-lock.json"))) return "npm";
  if (existsSync8(join7(rootAbs, "package.json"))) return "npm";
  if (existsSync8(join7(rootAbs, "pom.xml"))) return "maven";
  if (existsSync8(join7(rootAbs, "build.gradle")) || existsSync8(join7(rootAbs, "build.gradle.kts"))) return "gradle";
  return null;
}
function scriptCommand(packageManager, scriptName) {
  switch (packageManager) {
    case "pnpm":
      return `pnpm run ${scriptName}`;
    case "yarn":
      return `yarn ${scriptName}`;
    case "bun":
      return `bun run ${scriptName}`;
    default:
      return `npm run ${scriptName}`;
  }
}
function firstScript(scripts, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(scripts, name)) return name;
  }
  return null;
}
function scriptNamesMatching(scripts, pattern) {
  return Object.entries(scripts).filter(([name, command]) => pattern.test(`${name} ${command}`)).map(([name]) => name);
}
function defaultUrlFor(root) {
  if (root.frameworks.includes("static-html")) return [`http://127.0.0.1:${staticHtmlPort()}/`];
  if (root.frameworks.includes("vite")) return ["http://localhost:5173"];
  if (root.frameworks.includes("next") || root.frameworks.includes("react")) return ["http://localhost:3000"];
  if (root.frameworks.includes("spring-boot") || root.frameworks.includes("spring-cloud")) {
    return ["http://localhost:8080/actuator/health", "http://localhost:8080/health"];
  }
  return [];
}
function rootFsPath2(projectRoot, root) {
  return isAbsolute5(root.path) ? resolve4(root.path) : resolve4(projectRoot, root.path);
}
function javaCommands(rootAbs) {
  if (existsSync8(join7(rootAbs, "pom.xml"))) {
    const mvn = existsSync8(join7(rootAbs, "mvnw")) ? "./mvnw" : "mvn";
    return {
      startCommand: `${mvn} spring-boot:run`,
      verifyCommands: [`${mvn} test`]
    };
  }
  if (existsSync8(join7(rootAbs, "build.gradle")) || existsSync8(join7(rootAbs, "build.gradle.kts"))) {
    const gradle = existsSync8(join7(rootAbs, "gradlew")) ? "./gradlew" : "gradle";
    return {
      startCommand: `${gradle} bootRun`,
      verifyCommands: [`${gradle} test`]
    };
  }
  return { startCommand: null, verifyCommands: [] };
}
function nativeVerifyCommands(rootAbs) {
  if (isStaticHtmlRoot(rootAbs) && existsSync8(join7(rootAbs, "app.js"))) {
    return ["node --check app.js"];
  }
  if (existsSync8(join7(rootAbs, "go.mod"))) {
    return ["go test ./...", "go vet ./..."];
  }
  if (existsSync8(join7(rootAbs, "Cargo.toml"))) {
    return ["cargo test", "cargo clippy -- -D warnings"];
  }
  if (existsSync8(join7(rootAbs, "pyproject.toml")) || existsSync8(join7(rootAbs, "requirements.txt"))) {
    return ["pytest", "ruff check ."];
  }
  if (existsSync8(join7(rootAbs, ".claude-plugin", "plugin.json"))) {
    return [
      "npm run check:hooks-fresh",
      "npm run typecheck",
      "CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc"
    ];
  }
  return [];
}
function isStaticHtmlRoot(rootAbs) {
  return existsSync8(join7(rootAbs, "index.html")) && (existsSync8(join7(rootAbs, "app.js")) || existsSync8(join7(rootAbs, "styles.css")));
}
function staticHtmlServerCommand(rootAbs) {
  if (!isStaticHtmlRoot(rootAbs)) return null;
  const port = staticHtmlPort();
  const script = [
    'const http=require("node:http"),fs=require("node:fs"),path=require("node:path");',
    "const root=process.cwd();",
    'const types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8"};',
    "const server=http.createServer((req,res)=>{",
    'let rel=decodeURIComponent(new URL(req.url,"http://127.0.0.1").pathname);',
    'rel=rel==="/"?"index.html":rel.replace(/^[/\\\\]+/,"");',
    "const file=path.resolve(root,path.normalize(rel));",
    'if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end("Forbidden");return;}',
    "fs.readFile(file,(err,data)=>{",
    'if(err){res.writeHead(404);res.end("Not found");return;}',
    'res.writeHead(200,{"Content-Type":types[path.extname(file).toLowerCase()]||"application/octet-stream"});',
    "res.end(data);",
    "});",
    "});",
    `server.listen(${port},"127.0.0.1",()=>console.log("READY:http://127.0.0.1:${port}/"));`,
    'process.on("SIGTERM",()=>server.close(()=>process.exit(0)));',
    'process.on("SIGINT",()=>server.close(()=>process.exit(0)));'
  ].join("");
  const encoded = Buffer.from(script, "utf8").toString("base64");
  return `node -e "eval(Buffer.from('${encoded}','base64').toString('utf8'))"`;
}
function spawnCommandFor(command) {
  const staticHtmlMatch = STATIC_HTML_NODE_EVAL_PATTERN.exec(command);
  if (staticHtmlMatch?.[1]) {
    return {
      command: process.execPath,
      args: [
        "-e",
        `eval(Buffer.from('${staticHtmlMatch[1]}','base64').toString('utf8'))`
      ],
      shell: false
    };
  }
  return { command, args: [], shell: true };
}
function detectRoot(projectRoot, root) {
  const fsPath = rootFsPath2(projectRoot, root);
  const pkg = readJsonFile2(join7(fsPath, "package.json"));
  const scripts = pkg?.scripts ?? {};
  const packageManager = detectPackageManager2(fsPath);
  const scriptNames = Object.keys(scripts);
  const devScript = firstScript(scripts, ["dev", "start", "serve", "preview"]);
  const verifyScriptNames = [
    ...["typecheck", "lint", "test", "build"].filter(
      (name) => Object.prototype.hasOwnProperty.call(scripts, name)
    )
  ];
  const e2eScriptNames = scriptNamesMatching(
    scripts,
    /(^|:|-)(e2e|browser|ui|acceptance)(:|-|$)|playwright|cypress|puppeteer/i
  );
  const java = javaCommands(fsPath);
  const staticServer = staticHtmlServerCommand(fsPath);
  const urls = defaultUrlFor(root);
  const startCommand = devScript !== null ? scriptCommand(packageManager, devScript) : java.startCommand ?? staticServer;
  const healthCommands = urls.map((url) => `curl -fsS ${url}`);
  const verifyCommands = [
    ...verifyScriptNames.map((name) => scriptCommand(packageManager, name)),
    ...java.verifyCommands,
    ...nativeVerifyCommands(fsPath)
  ];
  const e2eCommands = e2eScriptNames.map((name) => scriptCommand(packageManager, name));
  return {
    name: root.name,
    path: root.path,
    fsPath,
    role: root.role,
    kinds: root.kinds,
    frameworks: root.frameworks,
    packageManager,
    scripts: scriptNames,
    startCommand,
    healthCommands,
    verifyCommands: [...new Set(verifyCommands)],
    e2eCommands: [...new Set(e2eCommands)],
    urls
  };
}
function runtimeDir(projectRoot) {
  return join7(projectRoot, ".curdx");
}
function runtimeStatePath(projectRoot) {
  return join7(runtimeDir(projectRoot), "dev-runtime.json");
}
function serviceLogPath(projectRoot, name) {
  return join7(runtimeDir(projectRoot), `dev-${name.replace(/[^a-z0-9_-]/gi, "-")}.log`);
}
function detectDevRuntime(input = {}) {
  const cwd = resolve4(input.cwd ?? process.cwd());
  const topology = discoverProjectTopology({ cwd });
  const roots = topology.roots.filter((root) => root.access !== "missing-path").map((root) => detectRoot(topology.projectRoot, root));
  const stackProfile = detectStackProfile({ cwd, topology });
  const qualityGates = selectQualityGates({ cwd, topology, stackProfile });
  const suggestedVerifier = selectSuggestedVerifier({
    cwd,
    topology,
    stackProfile,
    qualityGates
  });
  const gaps = [];
  if (topology.workspaceState === "empty") {
    gaps.push("workspace is empty; create or import product/spec context before runtime verification");
  }
  if (roots.every((root) => root.startCommand === null)) {
    gaps.push("no dev/start command detected");
  }
  if (roots.every((root) => root.verifyCommands.length === 0)) {
    gaps.push("no baseline verification command detected");
  }
  if (roots.some((root) => root.kinds.includes("frontend-app")) && roots.every((root) => root.e2eCommands.length === 0)) {
    gaps.push("frontend/browser work has no detected e2e command");
  }
  return {
    version: 1,
    cwd,
    projectRoot: topology.projectRoot,
    workspaceState: topology.workspaceState,
    roots,
    services: roots.filter((root) => root.startCommand !== null).map((root) => ({
      name: root.name,
      root: root.path,
      command: root.startCommand ?? "",
      logPath: serviceLogPath(topology.projectRoot, root.name)
    })),
    health: roots.flatMap(
      (root) => root.healthCommands.map((command) => ({ root: root.path, command }))
    ),
    verification: {
      baselineCommands: roots.flatMap(
        (root) => root.verifyCommands.map((command) => ({ root: root.path, command }))
      ),
      e2eCommands: roots.flatMap(
        (root) => root.e2eCommands.map((command) => ({ root: root.path, command }))
      )
    },
    stackProfile,
    qualityGates,
    suggestedVerifier,
    gaps
  };
}
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function waitForPidExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (!isPidAlive(pid)) return true;
    sleepSync(50);
  } while (Date.now() < deadline);
  return !isPidAlive(pid);
}
function signalPid(pid, signal) {
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    try {
      process.kill(pid, signal);
      return true;
    } catch {
      return false;
    }
  }
}
function terminatePidTree(pid) {
  if (!isPidAlive(pid)) {
    return {
      signalSent: false,
      exited: true,
      forced: false,
      alreadyStopped: true
    };
  }
  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true
    });
    const exited2 = waitForPidExit(pid, 2e3);
    return {
      signalSent: result.status === 0 || exited2,
      exited: exited2,
      forced: result.status === 0,
      alreadyStopped: false
    };
  }
  const signalSent = signalPid(pid, "SIGTERM");
  let exited = waitForPidExit(pid, 750);
  let forced = false;
  if (!exited) {
    forced = signalPid(pid, "SIGKILL");
    exited = waitForPidExit(pid, 1250);
  }
  return {
    signalSent,
    exited,
    forced,
    alreadyStopped: false
  };
}
function readRuntimeState(projectRoot) {
  return readJsonFile2(runtimeStatePath(projectRoot));
}
function startDevRuntime(input = {}) {
  const plan = detectDevRuntime(input);
  mkdirSync3(runtimeDir(plan.projectRoot), { recursive: true });
  const services = [];
  for (const service of plan.services) {
    const root = plan.roots.find((candidate) => candidate.path === service.root);
    if (!root) continue;
    const logFd = openSync(service.logPath, "a");
    let child;
    try {
      const command = spawnCommandFor(service.command);
      child = spawn(command.command, command.args, {
        cwd: root.fsPath,
        shell: command.shell,
        detached: true,
        stdio: ["ignore", logFd, logFd],
        env: process.env,
        windowsHide: true
      });
    } finally {
      closeSync(logFd);
    }
    child.unref();
    if (typeof child.pid === "number") {
      services.push({
        name: service.name,
        root: service.root,
        command: service.command,
        pid: child.pid,
        logPath: service.logPath
      });
    }
  }
  const state2 = {
    version: 1,
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    cwd: plan.cwd,
    projectRoot: plan.projectRoot,
    services,
    gaps: plan.gaps
  };
  writeFileSync3(runtimeStatePath(plan.projectRoot), JSON.stringify(state2, null, 2) + "\n");
  return state2;
}
function healthDevRuntime(input = {}) {
  const plan = detectDevRuntime(input);
  const state2 = readRuntimeState(plan.projectRoot);
  const serviceStatus = (state2?.services ?? []).map((service) => ({
    ...service,
    alive: isPidAlive(service.pid)
  }));
  const commandStatus = input.dryRun === true ? plan.health.map((item) => ({ ...item, skipped: true })) : plan.health.map((item) => {
    const root = plan.roots.find((candidate) => candidate.path === item.root);
    const result = spawnSync(item.command, {
      cwd: root?.fsPath ?? plan.projectRoot,
      shell: true,
      encoding: "utf8",
      timeout: 1e4
    });
    return {
      ...item,
      exitCode: result.status ?? 1,
      ok: result.status === 0,
      stderr: result.stderr?.trim() ?? ""
    };
  });
  const ok = serviceStatus.length > 0 && serviceStatus.every((service) => service.alive) && commandStatus.every((item) => "ok" in item ? item.ok === true : true);
  return {
    ok,
    cwd: plan.cwd,
    projectRoot: plan.projectRoot,
    statePath: runtimeStatePath(plan.projectRoot),
    services: serviceStatus,
    health: commandStatus,
    gaps: plan.gaps
  };
}
function verifyDevRuntime(input = {}) {
  const plan = detectDevRuntime(input);
  const commands = [
    ...plan.verification.baselineCommands,
    ...input.includeE2e === true ? plan.verification.e2eCommands : []
  ];
  if (input.dryRun === true) {
    return {
      ok: commands.length > 0,
      dryRun: true,
      cwd: plan.cwd,
      commands,
      gaps: plan.gaps
    };
  }
  const results = commands.map((item) => {
    const root = plan.roots.find((candidate) => candidate.path === item.root);
    const result = spawnSync(item.command, {
      cwd: root?.fsPath ?? plan.projectRoot,
      shell: true,
      stdio: "inherit",
      env: process.env
    });
    return {
      ...item,
      exitCode: result.status ?? 1,
      ok: result.status === 0
    };
  });
  return {
    ok: commands.length > 0 && results.every((item) => item.ok),
    cwd: plan.cwd,
    commands: results,
    gaps: plan.gaps
  };
}
function stopDevRuntime(input = {}) {
  const plan = detectDevRuntime(input);
  const state2 = readRuntimeState(plan.projectRoot);
  const stopped = (state2?.services ?? []).map((service) => {
    const result = terminatePidTree(service.pid);
    return {
      ...service,
      stopped: result.signalSent || result.exited || result.alreadyStopped,
      alreadyStopped: result.alreadyStopped,
      exited: result.exited,
      forced: result.forced
    };
  });
  rmSync(runtimeStatePath(plan.projectRoot), { force: true });
  return {
    ok: stopped.every((service) => service.stopped || service.alreadyStopped),
    cwd: plan.cwd,
    projectRoot: plan.projectRoot,
    stopped
  };
}

// src/hooks/lib/last-mile-orchestrator.ts
import { basename as basename9 } from "node:path";
import { fileURLToPath as fileURLToPath6 } from "node:url";
var RELEASE_RE2 = /\b(release|publish|deploy|tag|version|changelog)\b|发布|部署|上线|打包|版本|标签|提测|灰度/i;
var NPM_RELEASE_RE3 = /\bnpm\s+(publish|release|version|tag|dist-tag)\b|\bpublish(?:ing)?\s+(?:to\s+)?npm\b|\bnpm\s+package\b/i;
var FAILURE_RE = /\b(fail|failed|failure|error|stuck|retry|debug|broken|regression)\b|失败|报错|卡住|重试|排查|定位|回归|崩溃|阻塞|无法|不通过/i;
function normalize3(value) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}
function unique(values) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
function rec(route2, id) {
  return route2.recommendedCapabilities.find((item) => item.id === id);
}
function hasRec(route2, id) {
  return rec(route2, id) !== void 0;
}
function missingCapabilityIds(route2) {
  return route2.recommendedCapabilities.filter((item) => item.availabilityState === "missing" && item.expectedByDefault).map((item) => item.id);
}
function isReleaseSensitive(goal2, route2) {
  return route2.intent.intentKind === "release" || RELEASE_RE2.test(goal2) || NPM_RELEASE_RE3.test(goal2) || route2.qualityGates.some((gate) => gate.id.endsWith("-release")) || route2.stackProfile.primary === "claude-code-plugin" && RELEASE_RE2.test(goal2);
}
function hasVerificationGap(input, snapshot2) {
  if (input.verification?.ok === false) return true;
  if (input.hookEvent === "TaskCompleted") return true;
  return snapshot2.gates.some(
    (gate) => gate === "completion-unmarked" || gate === "missing-tasks" || gate === "empty-tasks" || gate === "invalid-state"
  );
}
function inferPhase(input, route2, snapshot2, brain) {
  const goal2 = normalize3(input.goal);
  if (isReleaseSensitive(goal2, route2)) return "releasing";
  if (input.verification?.ok === false || brain.recentFailures.length >= 2) return "recovering";
  if (input.hookEvent === "TaskCompleted") return "verifying";
  if (FAILURE_RE.test(goal2)) return "debugging";
  const statePhase = snapshot2.state.phase;
  if (statePhase === "execution") return "implementing";
  if (statePhase === "research") return "discovering";
  if (statePhase === "requirements" || statePhase === "design" || statePhase === "tasks") {
    return "planning";
  }
  if (route2.route === "blocked-ask-user" || route2.route === "product-inception") return "discovering";
  if (route2.shouldCreateSpec) return "planning";
  return "implementing";
}
function inferProblemTypes(input, route2, snapshot2, brain) {
  const goal2 = normalize3(input.goal);
  const out = [];
  if (route2.route === "blocked-ask-user" || route2.intent.missingFacts.length > 0) {
    out.push("missing-context");
  }
  if (hasRec(route2, "ui-ux-pro-max")) out.push("ui-quality-risk");
  if (hasRec(route2, "chrome-devtools-mcp") || hasRec(route2, "browser-verification")) {
    out.push("browser-evidence-needed");
  }
  if (brain.recentFailures.length >= 2 || hasRec(route2, "pua") || /\b(repeated|twice|again)\b|反复|连续|又失败|多次/i.test(goal2)) {
    out.push("repeated-failure");
  }
  if (isReleaseSensitive(goal2, route2)) out.push("release-risk");
  if (hasVerificationGap(input, snapshot2)) out.push("verification-gap");
  if (snapshot2.git.dirty && snapshot2.git.changedFiles > 8 || snapshot2.gates.includes("missing-code-root")) {
    out.push("scope-drift");
  }
  if (missingCapabilityIds(route2).length > 0) out.push("dependency-missing");
  return unique(out);
}
function capabilityAction(recItem) {
  const required = recItem.curdxRole.includes("gate") || recItem.category === "docs" || recItem.category === "verification" || recItem.category === "security" || recItem.id === "pua";
  return {
    id: recItem.id,
    name: recItem.name,
    invocation: recItem.invocation,
    phase: recItem.phase,
    availabilityState: recItem.availabilityState,
    required,
    triggerReason: recItem.triggerReason,
    action: recItem.availabilityState === "missing" ? recItem.fallbackWhenMissing : recItem.instruction,
    fallbackWhenMissing: recItem.fallbackWhenMissing
  };
}
function evidenceRequired(input, route2, snapshot2, problems) {
  const out = route2.qualityGates.filter((gate) => gate.required).map((gate) => gate.command ? `${gate.id}: ${gate.command}` : gate.id);
  const verifier = route2.suggestedVerifier.command ?? route2.suggestedVerifier.fallback;
  if (verifier) out.push(`suggested-verifier: ${verifier}`);
  if (problems.includes("browser-evidence-needed")) {
    out.push("browser evidence: Playwright pass or Chrome DevTools MCP console/network/DOM proof");
  }
  if (problems.includes("release-risk")) {
    out.push("release evidence: curdx-flow doctor, plugin validate, hook freshness, version/tag parity");
  }
  if (problems.includes("verification-gap")) {
    const phase = input.verification?.phase ?? snapshot2.state.phase ?? "execution";
    out.push(`fresh verification block for phase '${phase}'`);
  }
  return unique(out).slice(0, 8);
}
function evidenceSatisfied(snapshot2, brain) {
  const verified = Object.entries(snapshot2.state.verificationBlocks).filter(([, block]) => block?.exitCode === 0 && typeof block.command === "string").map(([phase, block]) => `${phase}: ${block?.command}`);
  return unique([...verified, ...brain.verifierHints.map((hint) => `brain: ${hint}`)]).slice(0, 6);
}
function blockingGates(route2, snapshot2, problems) {
  const out = [...snapshot2.gates];
  if (route2.blockedReason) out.push(`route-blocked: ${route2.blockedReason}`);
  for (const id of missingCapabilityIds(route2)) {
    out.push(`dependency-missing: ${id}`);
  }
  if (problems.includes("release-risk")) out.push("release-gate-required");
  return unique(out);
}
function firstCapability(plan, id) {
  return plan.find((item) => item.id === id);
}
function instructionFor(phase, problems, plan, route2, snapshot2) {
  if (problems.includes("dependency-missing")) {
    const missing = plan.filter((item) => item.availabilityState === "missing").map((item) => item.id).join(", ");
    return `Run curdx-flow doctor and fix missing expected capabilities before relying on them: ${missing}.`;
  }
  if (problems.includes("repeated-failure")) {
    const memory = firstCapability(plan, "claude-mem");
    const pua = firstCapability(plan, "pua");
    const parts = [
      memory ? `${memory.invocation} for prior decisions/failures` : "read .curdx/brain.jsonl for recent failures",
      pua ? `${pua.invocation} for structured recovery or parallel diagnosis` : "switch to systematic recovery before another edit"
    ];
    return `Stop the same edit loop; ${parts.join(", ")}.`;
  }
  if (problems.includes("ui-quality-risk")) {
    const uiUx = firstCapability(plan, "ui-ux-pro-max");
    const design = uiUx !== void 0 && uiUx.availabilityState !== "missing" ? uiUx.invocation : "the available ui-ux-pro-max guidance";
    return `Apply ${design} before changing visible UI, then keep browser evidence as the completion gate.`;
  }
  if (problems.includes("browser-evidence-needed")) {
    return "After implementation, collect browser runtime evidence with Playwright or Chrome DevTools MCP before claiming completion.";
  }
  if (problems.includes("release-risk")) {
    return "Before tag, push, or publish, run the release gate: official Claude Code docs check, curdx-flow doctor, plugin validate, hook freshness, and npm/plugin tag parity.";
  }
  if (problems.includes("verification-gap")) {
    return `Do not finish yet; satisfy the verifier for ${snapshot2.spec?.name ?? "the active spec"} and record fresh evidence.`;
  }
  if (phase === "planning") return "Create or resume the smallest spec/task plan that satisfies the route, then enter implementation.";
  return route2.nextAction;
}
function recoveryFor(problems, plan, input) {
  if (!problems.includes("repeated-failure") && !problems.includes("verification-gap")) return null;
  const phase = input.verification?.phase ?? "current phase";
  const reason = input.verification?.reason ?? "missing or failed evidence";
  const memory = firstCapability(plan, "claude-mem");
  const pua = firstCapability(plan, "pua");
  return [
    `Recovery for ${phase}: ${reason}.`,
    memory ? `First search memory with ${memory.invocation}.` : "First inspect .curdx/brain.jsonl and the failing verifier output.",
    pua ? `If the same fix path already failed, use ${pua.invocation} for decomposition/retry discipline.` : "If the same fix path already failed, decompose before editing again.",
    "Then run the suggested verifier and record the result before completion."
  ].join(" ");
}
function decideLastMile(input = {}) {
  const cwd = input.cwd;
  const goal2 = normalize3(input.goal);
  const snapshot2 = input.snapshot ?? buildWorkflowSnapshot({ cwd, goal: goal2, spec: input.name });
  const route2 = input.routeFacts ?? classifySmartRoute(input);
  const brain = summarizeProjectBrain(cwd);
  const phase = inferPhase(input, route2, snapshot2, brain);
  const problemTypes = inferProblemTypes(input, route2, snapshot2, brain);
  const capabilityPlan = route2.recommendedCapabilities.map(capabilityAction);
  const blocking = blockingGates(route2, snapshot2, problemTypes);
  const coordinatorInstruction = instructionFor(phase, problemTypes, capabilityPlan, route2, snapshot2);
  const recoveryInstruction = recoveryFor(problemTypes, capabilityPlan, input);
  const decision = {
    version: 1,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    phase,
    problemType: problemTypes[0] ?? null,
    problemTypes,
    task: {
      goal: goal2,
      route: route2.route,
      stack: route2.stackProfile.primary,
      risk: route2.policy.risk,
      activeSpec: snapshot2.spec?.name ?? route2.activeSpec?.name ?? null,
      currentTask: snapshot2.tasks.current?.title ?? null
    },
    capabilityPlan,
    evidenceRequired: evidenceRequired(input, route2, snapshot2, problemTypes),
    evidenceSatisfied: evidenceSatisfied(snapshot2, brain),
    blockingGates: blocking,
    coordinatorInstruction,
    recoveryInstruction
  };
  if (input.record === true) {
    appendBrainEvent(cwd, {
      type: "last-mile-decision",
      route: route2.route,
      stack: route2.stackProfile.primary,
      phase,
      reason: [
        `problem=${decision.problemType ?? "none"}`,
        `instruction=${coordinatorInstruction}`
      ].join(" "),
      files: input.toolNames?.length
    });
  }
  return decision;
}
function readArg7(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function parseList4(value) {
  if (!value) return [];
  return value.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean);
}
function main7() {
  const argv = process.argv.slice(2);
  const available = parseList4(readArg7("--available-capabilities", argv));
  const decision = decideLastMile({
    cwd: readArg7("--cwd", argv),
    goal: readArg7("--goal", argv) ?? "",
    name: readArg7("--spec", argv) ?? readArg7("--name", argv),
    changedFiles: parseList4(readArg7("--files", argv)),
    availableCapabilities: available.length > 0 ? available : void 0,
    hookEvent: "runtime",
    record: argv.includes("--record")
  });
  process.stdout.write(JSON.stringify(decision, null, 2) + "\n");
}
function isDirectRun7() {
  try {
    const entry = fileURLToPath6(import.meta.url);
    return process.argv[1] === entry && basename9(entry).startsWith("last-mile-orchestrator.");
  } catch {
    return false;
  }
}
if (isDirectRun7()) {
  main7();
}

// src/hooks/lib/execution-brief.ts
function preferredSkill(route2) {
  switch (route2.route) {
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
function agentPlan(route2) {
  if (route2.route === "direct-change" || route2.route === "blocked-ask-user") return [];
  if (route2.policy.reviewCadence === "strict" || route2.policy.reviewCadence === "periodic") {
    return ["spec-executor", "spec-reviewer", "code-quality-reviewer"];
  }
  if (route2.shouldUseSubagent) return ["spec-executor", "spec-reviewer"];
  return ["self-review before completion"];
}
function isolationPlan(route2) {
  if (route2.policy.risk === "critical" || route2.route === "full-spec" || route2.route === "epic-split") {
    return "prefer worktree isolation for executor tasks; do not touch release metadata unless task scope names it";
  }
  if (route2.route === "direct-change") return "current workspace, minimal touched files";
  return "current workspace with bounded file ownership";
}
function taskShape(route2) {
  if (!route2.shouldCreateTasks) return "single bounded change; no tasks.md";
  const range = route2.policy.taskTargetRange;
  return `${range.min}-${Math.min(range.max, route2.taskCountLimit)} value-slice tasks, each with verifier`;
}
function readFirst(route2, input) {
  const out = [];
  const files = input.changedFiles?.slice(0, Math.max(1, route2.contextBudget.maxReferenceFiles)) ?? [];
  out.push(...files);
  if (route2.stackProfile.primary === "claude-code-plugin") {
    out.push("https://code.claude.com/docs/llms.txt");
    out.push("plugin manifest, hooks.json, touched skill/agent files");
  }
  if (route2.qualityGates.some((gate) => gate.phase === "before-coding" && gate.required)) {
    out.push("official/current docs for the detected stack");
  }
  if (route2.shouldCreateTasks) {
    out.push("nearest spec artifacts and tasks.md before editing");
  }
  if (route2.contextBudget.level === "tiny") {
    return out.slice(0, Math.max(1, route2.contextBudget.maxReferenceFiles));
  }
  return [...new Set(out)].slice(0, route2.contextBudget.maxReferenceFiles);
}
function completionContract(route2, brain) {
  const verifier = route2.suggestedVerifier.command ?? route2.suggestedVerifier.fallback ?? void 0;
  const contract = [
    "Do not claim completion without fresh verification evidence from this turn."
  ];
  if (verifier) {
    const suffix = /[.!?]$/.test(verifier) ? "" : ".";
    contract.push(`Run verifier: ${verifier}${suffix}`);
  }
  if (route2.shouldCreateSpec) {
    contract.push("Record spec evidence with curdx-flow verify run when a spec phase is completed.");
  }
  if (route2.policy.reviewCadence === "strict" || route2.policy.reviewCadence === "periodic") {
    contract.push("Run spec-compliance review before code-quality review; fix blocking findings before proceeding.");
  }
  if (brain.recentFailures.length > 0) {
    contract.push("Check .curdx/brain.jsonl recent failures before reusing the same fix path.");
  }
  return contract;
}
function escalationRules(route2) {
  const rules = [
    "Ask the user only when missing facts change implementation or access is blocked.",
    "If verifier fails twice for the same phase, switch to systematic debugging before more edits."
  ];
  if (route2.route === "blocked-ask-user" && route2.blockedReason) {
    rules.unshift(route2.blockedReason);
  }
  if (route2.policy.risk === "critical") {
    rules.push("For release/security/plugin metadata changes, run official-docs check and plugin validation before tag/push.");
  }
  if (route2.topology?.missingRoots && route2.topology.missingRoots.length > 0) {
    rules.push(route2.topology.accessFix ?? "Add required code roots before editing.");
  }
  return rules;
}
function buildExecutionBrief(input) {
  const route2 = input.routeFacts ?? classifySmartRoute(input);
  const cwd = input.cwd;
  const brain = summarizeProjectBrain(cwd);
  const verifier = route2.suggestedVerifier.command ?? route2.suggestedVerifier.fallback ?? void 0;
  const lastMile2 = decideLastMile({ ...input, routeFacts: route2 });
  const brief = {
    version: 1,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    goal: input.goal ?? "",
    route: route2.route,
    reason: route2.reason,
    stack: route2.stackProfile.primary,
    risk: route2.policy.risk,
    context: {
      budget: route2.contextBudget.level,
      maxReferenceFiles: route2.contextBudget.maxReferenceFiles,
      readFirst: readFirst(route2, input),
      avoid: ["node_modules", "dist/build outputs unless verifying generated artifacts", "old project docs as design authority"]
    },
    execution: {
      mode: route2.policy.executionMode,
      primarySkill: preferredSkill(route2),
      agents: agentPlan(route2),
      isolation: isolationPlan(route2),
      taskShape: taskShape(route2)
    },
    qualityGates: route2.qualityGates.map((gate) => ({
      id: gate.id,
      phase: gate.phase,
      required: gate.required,
      command: gate.command
    })),
    completionContract: completionContract(route2, brain),
    escalationRules: escalationRules(route2),
    lastMile: {
      phase: lastMile2.phase,
      problemType: lastMile2.problemType,
      problemTypes: lastMile2.problemTypes,
      capabilityPlan: lastMile2.capabilityPlan,
      evidenceRequired: lastMile2.evidenceRequired,
      blockingGates: lastMile2.blockingGates,
      coordinatorInstruction: lastMile2.coordinatorInstruction,
      recoveryInstruction: lastMile2.recoveryInstruction
    },
    brain: {
      path: brain.path,
      totalEvents: brain.totalEvents,
      lastUpdated: brain.lastUpdated,
      stackHints: brain.stackHints,
      verifierHints: brain.verifierHints,
      recentFailures: brain.recentFailures
    }
  };
  if (input.record === true) {
    appendBrainEvent(cwd, {
      type: "route-compiled",
      route: route2.route,
      stack: route2.stackProfile.primary,
      verifier,
      reason: route2.reason,
      files: input.changedFiles?.length
    });
  }
  return brief;
}

// src/hooks/lib/goal-bridge.ts
import { basename as basename10 } from "node:path";
import { fileURLToPath as fileURLToPath7 } from "node:url";

// src/core/capabilities/goal-readiness.ts
import { existsSync as existsSync9, readFileSync as readFileSync9 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join as join8 } from "node:path";
var GOAL_CONDITION_LIMIT = 4e3;
var NATIVE_GOAL_REQUIRED_VERSION = "2.1.139";
var OPTION_C_REQUIRED_VERSION = "2.1.154";
function notGeneratedLength() {
  return {
    limit: GOAL_CONDITION_LIMIT,
    actual: null,
    original: null,
    status: "not-generated"
  };
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseClaudeCodeVersion(output) {
  const match = output.match(/\b(\d+)\.(\d+)\.(\d+)\b/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}
function compareVersions(a, b) {
  const left = a.split(".").map((part) => Number(part));
  const right = b.split(".").map((part) => Number(part));
  for (let i = 0; i < 3; i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}
function buildPlatformFloorReadiness(detectedVersion, requiredVersion = OPTION_C_REQUIRED_VERSION) {
  if (detectedVersion === null) {
    return {
      requiredVersion,
      detectedVersion: null,
      meetsFloor: null,
      reason: `Claude Code version could not be detected; curdx-flow requires ${requiredVersion} or newer.`
    };
  }
  const meetsFloor = compareVersions(detectedVersion, requiredVersion) >= 0;
  return {
    requiredVersion,
    detectedVersion,
    meetsFloor,
    reason: meetsFloor ? `Claude Code ${detectedVersion} meets the curdx-flow ${requiredVersion} minimum.` : `Claude Code ${detectedVersion} is below the curdx-flow minimum ${requiredVersion}; update Claude Code to ${requiredVersion} or newer.`
  };
}
function hasBooleanSetting(value, key) {
  if (Array.isArray(value)) {
    return value.some((item) => hasBooleanSetting(item, key));
  }
  if (!isRecord(value)) return false;
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (entryKey === key && entryValue === true) return true;
    if (typeof entryValue === "object" && entryValue !== null && hasBooleanSetting(entryValue, key)) {
      return true;
    }
  }
  return false;
}
function collectBlockers(sources) {
  const blockers = [];
  for (const source of sources) {
    if (source.error || source.settings === void 0) continue;
    const managed = source.managed === true;
    if (hasBooleanSetting(source.settings, "disableAllHooks")) {
      blockers.push({
        id: "disableAllHooks",
        source: source.source,
        managed,
        reason: "disableAllHooks disables Claude Code hooks, which makes native /goal unavailable."
      });
    }
    if (managed && hasBooleanSetting(source.settings, "allowManagedHooksOnly")) {
      blockers.push({
        id: "allowManagedHooksOnly",
        source: source.source,
        managed,
        reason: "Managed allowManagedHooksOnly prevents unmanaged plugin hooks, which blocks native /goal execution."
      });
    }
  }
  return blockers;
}
function fallbackAction(state2, requiredVersion) {
  switch (state2) {
    case "available":
      return null;
    case "update-needed":
      return `Update Claude Code to ${requiredVersion} or newer, then rerun curdx-flow doctor; until then use /curdx-flow:implement --manual and resume explicitly.`;
    case "blocked":
      return "Use /curdx-flow:implement --manual for a resumable single-turn flow, or remove the hook-blocking Claude Code setting and rerun doctor.";
    case "unavailable":
      return "Install or fix the claude CLI, then rerun doctor; until then use manual/resumable curdx-flow commands only.";
    case "unknown":
      return "Use /curdx-flow:implement --manual until native /goal support can be confirmed.";
  }
}
function buildNativeGoalReadiness(input = {}) {
  const requiredVersion = input.requiredVersion ?? NATIVE_GOAL_REQUIRED_VERSION;
  const conditionLength = input.conditionLength ?? notGeneratedLength();
  const settingsSources = input.settingsSources ?? [];
  const settingsErrors = settingsSources.filter((source) => source.error).map((source) => `${source.source}: ${source.error}`);
  const blockers = collectBlockers(settingsSources);
  const probe = input.claudeProbe;
  let detectedVersion = null;
  let state2 = "unknown";
  let supported = "unknown";
  let reason = "Native /goal support is unknown because claude --version was not checked.";
  if (!probe) {
    state2 = "unknown";
  } else if (probe.error || probe.timedOut || probe.exitCode !== 0) {
    state2 = "unavailable";
    supported = false;
    reason = probe.error || probe.stderr.trim() || `claude --version exited ${probe.exitCode}`;
  } else {
    detectedVersion = parseClaudeCodeVersion(`${probe.stdout}
${probe.stderr}`);
    if (!detectedVersion) {
      state2 = "unknown";
      supported = "unknown";
      reason = "Native /goal support is unknown because claude --version output could not be parsed.";
    } else if (compareVersions(detectedVersion, requiredVersion) < 0) {
      state2 = "update-needed";
      supported = false;
      reason = `Claude Code ${detectedVersion} is below native /goal minimum ${requiredVersion}.`;
    } else if (blockers.length > 0) {
      state2 = "blocked";
      supported = false;
      reason = `Native /goal is blocked by Claude Code hook settings: ${blockers.map((blocker) => blocker.id).join(", ")}.`;
    } else if (settingsErrors.length > 0) {
      state2 = "unknown";
      supported = "unknown";
      reason = "Native /goal support is unknown because one or more settings sources could not be read.";
    } else {
      state2 = "available";
      supported = true;
      reason = `Claude Code ${detectedVersion} supports native /goal and no hook-blocking settings were detected.`;
    }
  }
  return {
    state: state2,
    supported,
    requiredVersion,
    detectedVersion,
    reason,
    hooksRequired: true,
    blockers,
    fallbackAction: fallbackAction(state2, requiredVersion),
    recommendedDriver: state2 === "available" ? "native-goal" : "manual-resume",
    conditionLength,
    settingsSources: settingsSources.map((source) => source.source),
    warnings: settingsErrors
  };
}
function evaluateNativeGoalConditionLength(input) {
  const limit = input.limit ?? GOAL_CONDITION_LIMIT;
  const actual = input.condition.length;
  const original = input.originalLength ?? actual;
  const status2 = input.compressed ? actual <= limit ? "compressed" : "over-limit" : actual <= limit ? "within-limit" : "over-limit";
  return { limit, actual, original, status: status2 };
}
function attachNativeGoalConditionLength(readiness, conditionLength) {
  const warnings = [...readiness.warnings];
  if (conditionLength.status === "compressed") {
    warnings.push("Native /goal condition was shortened to fit the 4000 character limit.");
  }
  if (conditionLength.status === "over-limit") {
    warnings.push("Native /goal condition still exceeds the 4000 character limit.");
  }
  return {
    ...readiness,
    conditionLength,
    warnings: [...new Set(warnings)]
  };
}
function settingSourceFromValue(value, source) {
  if (isRecord(value) && "settings" in value) {
    return {
      source: typeof value.source === "string" ? value.source : source,
      managed: value.managed === true,
      exists: value.exists === false ? false : true,
      settings: value.settings,
      ...typeof value.error === "string" ? { error: value.error } : {}
    };
  }
  return { source, exists: true, settings: value };
}
function fixtureSources(raw, source) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item, idx) => settingSourceFromValue(item, `${source}[${idx}]`));
    }
    if (isRecord(parsed) && Array.isArray(parsed.sources)) {
      return parsed.sources.map((item, idx) => settingSourceFromValue(item, `${source}.sources[${idx}]`));
    }
    return [settingSourceFromValue(parsed, source)];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [{ source, exists: true, error: `invalid settings fixture: ${message}` }];
  }
}
function readJsonSettingsFile(path3, source, managed = false) {
  if (!existsSync9(path3)) return null;
  try {
    return {
      source,
      managed,
      exists: true,
      settings: JSON.parse(readFileSync9(path3, "utf8"))
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { source, managed, exists: true, error: message };
  }
}
function readNativeGoalSettingsSources(input) {
  const env = { ...process.env, ...input.env ?? {} };
  const fixture = env.CURDX_FLOW_NATIVE_GOAL_SETTINGS_JSON ?? env.CURDX_FLOW_GOAL_SETTINGS_JSON;
  if (fixture !== void 0) return fixtureSources(fixture, "CURDX_FLOW_NATIVE_GOAL_SETTINGS_JSON");
  if (env.CURDX_FLOW_NATIVE_GOAL_SETTINGS_ERROR) {
    return [{ source: "CURDX_FLOW_NATIVE_GOAL_SETTINGS_ERROR", exists: true, error: env.CURDX_FLOW_NATIVE_GOAL_SETTINGS_ERROR }];
  }
  const home = input.home ?? env.HOME ?? env.USERPROFILE ?? homedir2();
  const candidates = [
    { path: join8(input.cwd, ".claude", "settings.json"), source: "project:.claude/settings.json" },
    { path: join8(input.cwd, ".claude", "settings.local.json"), source: "project-local:.claude/settings.local.json" },
    { path: join8(home, ".claude", "settings.json"), source: "user:~/.claude/settings.json" },
    { path: "/Library/Application Support/ClaudeCode/managed-settings.json", source: "managed:macos", managed: true },
    { path: "/etc/claude-code/managed-settings.json", source: "managed:linux", managed: true }
  ];
  const sources = [];
  for (const candidate of candidates) {
    const source = readJsonSettingsFile(candidate.path, candidate.source, candidate.managed === true);
    if (source) sources.push(source);
  }
  return sources;
}

// src/hooks/lib/goal-bridge.ts
function readArg8(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function normalize4(input) {
  return (input ?? "").trim().replace(/\s+/g, " ");
}
function parsePositiveInt(value, fallback) {
  if (value === void 0) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}
function specLabel(snapshot2, explicitSpec) {
  if (snapshot2.spec?.path) return snapshot2.spec.path;
  if (explicitSpec && explicitSpec.trim()) return explicitSpec.trim();
  return "the active curdx-flow spec";
}
function taskLine(snapshot2) {
  const total = snapshot2.tasks.total;
  const completed = snapshot2.tasks.completed;
  if (total > 0) return `tasks.md shows ${completed}/${total} tasks complete and every remaining task is handled`;
  return "tasks.md is present when the workflow requires tasks, or the route explicitly does not require tasks";
}
function verificationLine(snapshot2) {
  const phase = snapshot2.state.phase ?? "execution";
  const block = snapshot2.state.verificationBlocks[phase];
  if (block?.command) {
    return `the final ${phase} verifier is shown as ${block.command} with exitCode 0`;
  }
  return "the final execution verifier command and exit code 0 are shown in the conversation";
}
function capabilityEvidence(decision) {
  const ids = decision.capabilityPlan.map((item) => item.id);
  const out = [];
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
function evidenceProtocol(snapshot2, decision) {
  return [
    taskLine(snapshot2),
    verificationLine(snapshot2),
    "curdx-flow snapshot or last-mile output shows no blocking gates remain",
    "missingEvidence is shown as empty, converted into a blocker, or explicitly marked manual-confirmation-required",
    "the final verdict is shown as complete only when verifier evidence and gates are visible; otherwise it reports blocked, partial, or manual-confirmation-required",
    "the assistant outputs ALL_TASKS_COMPLETE only after the task and verifier evidence above is visible",
    ...capabilityEvidence(decision)
  ];
}
function compactCondition(parts, warnings) {
  let condition = parts.join(" ");
  const originalLength = condition.length;
  if (condition.length <= GOAL_CONDITION_LIMIT) {
    return {
      condition,
      conditionLength: evaluateNativeGoalConditionLength({ condition, originalLength })
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
      compressed: true
    })
  };
}
function buildGoalBridge(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const snapshot2 = buildWorkflowSnapshot({
    cwd,
    spec: input.spec,
    goal: input.goal
  });
  const decision = decideLastMile({
    cwd,
    name: input.spec,
    goal: input.goal ?? "",
    snapshot: snapshot2,
    hookEvent: "runtime"
  });
  const maxTurns = Math.max(
    1,
    Math.floor(input.maxTurns ?? snapshot2.state.autoPolicy?.maxGlobalIterations ?? 30)
  );
  const warnings = [];
  if (!snapshot2.active) {
    warnings.push("No active spec was resolved; the goal condition uses a generic active-spec target.");
  }
  warnings.push(
    "Native /goal is unavailable if Claude Code hooks are disabled by disableAllHooks or allowManagedHooksOnly."
  );
  const evidence = evidenceProtocol(snapshot2, decision);
  const target = specLabel(snapshot2, input.spec);
  const userGoal = normalize4(input.goal);
  const { condition, conditionLength } = compactCondition(
    [
      `Complete curdx-flow implementation for ${target}.`,
      "This goal is satisfied only when transcript-visible evidence in the conversation visibly shows:",
      evidence.map((item, idx) => `${idx + 1}. ${item}.`).join(" "),
      `Stop after ${maxTurns} goal turns if still incomplete and report the blocker, current task, verifier status, and next action instead of claiming completion.`,
      `If the evidence is not visible, continue by running curdx-flow snapshot/last-mile as needed, executing the next incomplete value-slice task, recording verifier evidence, and updating state.`,
      userGoal ? `User goal context: ${userGoal}.` : ""
    ].filter(Boolean),
    warnings
  );
  const readiness = attachNativeGoalConditionLength(
    input.nativeGoal ?? buildNativeGoalReadiness(),
    conditionLength
  );
  const startPrompt = readiness.recommendedDriver === "native-goal" ? "Run the slashCommand in Claude Code to let native /goal drive follow-up turns. If /goal becomes unavailable, use manual resume and keep the same evidence protocol; do not rely on Stop-hook continuation." : `Native /goal is not available: ${readiness.reason} Use /curdx-flow:implement --manual for one coordinator turn, keep the same evidence protocol, and resume explicitly; do not rely on Stop-hook continuation.`;
  return {
    version: 1,
    condition,
    slashCommand: `/goal ${condition}`,
    startPrompt,
    evidenceProtocol: evidence,
    warnings: [.../* @__PURE__ */ new Set([...warnings, ...readiness.warnings])],
    readiness,
    recommendedDriver: readiness.recommendedDriver,
    fallbackAction: readiness.fallbackAction,
    conditionLength
  };
}
function main8() {
  const argv = process.argv.slice(2);
  const bridge = buildGoalBridge({
    cwd: readArg8("--cwd", argv),
    spec: readArg8("--spec", argv) ?? readArg8("--name", argv),
    goal: readArg8("--goal", argv),
    maxTurns: parsePositiveInt(
      readArg8("--max-turns", argv) ?? readArg8("--max-global-iterations", argv),
      30
    )
  });
  process.stdout.write(JSON.stringify(bridge, null, 2) + "\n");
}
function isDirectRun8() {
  try {
    const entry = fileURLToPath7(import.meta.url);
    return process.argv[1] === entry && basename10(entry).startsWith("goal-bridge.");
  } catch {
    return false;
  }
}
if (isDirectRun8()) {
  main8();
}

// src/core/capabilities/doctor.ts
function tri(value) {
  if (typeof value === "boolean") return value;
  if (value === "skipped") return "skipped";
  return "unknown";
}
function status(input) {
  return {
    schemaVersion: 1,
    ...input,
    degraded: input.state === "degraded",
    unavailable: input.state === "unavailable"
  };
}
function probeStatus(input) {
  const probe = input.probe;
  const checkMode = input.checkMode ?? "fast";
  if (!probe) {
    return status({
      id: input.id,
      label: input.label,
      category: input.category,
      provider: input.provider,
      provisioning: input.provisioning,
      checkMode: "skipped",
      state: "skipped",
      configured: "unknown",
      installed: "unknown",
      callable: "skipped",
      authorized: "unknown",
      reason: `${input.command} was not probed in this doctor run.`,
      skippedReason: `${input.command} was not probed in this doctor run.`,
      evidenceImpact: input.evidenceImpact,
      blocksCompletion: input.blocksCompletion ?? false,
      blocksRelease: input.blocksRelease ?? false,
      remediation: input.remediation,
      durationMs: 0
    });
  }
  if (probe.exitCode === 0 && !probe.error && !probe.timedOut) {
    return status({
      id: input.id,
      label: input.label,
      category: input.category,
      provider: input.provider,
      provisioning: input.provisioning,
      checkMode,
      state: "available",
      configured: true,
      installed: true,
      callable: true,
      authorized: "unknown",
      reason: `${input.command} is callable.`,
      evidenceImpact: input.evidenceImpact,
      blocksCompletion: false,
      blocksRelease: false,
      remediation: null,
      durationMs: probe.durationMs
    });
  }
  const unavailable = probe.exitCode === null || Boolean(probe.error);
  return status({
    id: input.id,
    label: input.label,
    category: input.category,
    provider: input.provider,
    provisioning: input.provisioning,
    checkMode,
    state: unavailable ? "unavailable" : "degraded",
    configured: "unknown",
    installed: unavailable ? false : true,
    callable: false,
    authorized: "unknown",
    reason: probe.error || probe.stderr.trim() || `${input.command} exited ${probe.exitCode}`,
    evidenceImpact: input.evidenceImpact,
    blocksCompletion: input.blocksCompletion ?? unavailable,
    blocksRelease: input.blocksRelease ?? true,
    remediation: input.remediation,
    durationMs: probe.durationMs
  });
}
function pluginValidationStatus(input) {
  if (input.mode === "deep") {
    return probeStatus({
      id: "plugin-validation",
      label: "Claude plugin validation",
      category: "plugin-validation",
      provider: "claude-code",
      provisioning: "workflow",
      probe: input.pluginValidationProbe,
      command: "claude plugin validate",
      checkMode: "deep",
      evidenceImpact: ["plugin release evidence"],
      blocksCompletion: false,
      blocksRelease: true,
      remediation: "claude plugin validate ./plugins/curdx-flow"
    });
  }
  return status({
    id: "plugin-validation",
    label: "Claude plugin validation",
    category: "plugin-validation",
    provider: "claude-code",
    provisioning: "workflow",
    checkMode: "skipped",
    state: "skipped",
    configured: true,
    installed: "unknown",
    callable: "skipped",
    authorized: "unknown",
    reason: "Fast doctor does not run claude plugin validate; this is a deep release check.",
    skippedReason: "Fast doctor does not run claude plugin validate; this is a deep release check.",
    evidenceImpact: ["plugin release evidence"],
    blocksCompletion: false,
    blocksRelease: true,
    remediation: "claude plugin validate ./plugins/curdx-flow",
    durationMs: 0
  });
}
function pluginDependencyStatus(id, label, fact) {
  const configured = fact?.declared === true && fact.marketplaceMatches !== false && fact.crossMarketplaceAllowlisted !== false;
  const readiness = fact?.readiness;
  const installed = tri(fact?.installed);
  const callable = tri(fact?.callable);
  const authorized = tri(fact?.authorized ?? (configured ? true : false));
  const blocksCompletion = typeof fact?.blocksCompletion === "boolean" ? fact.blocksCompletion : id === "chrome-devtools-mcp";
  const blocksRelease = typeof fact?.blocksRelease === "boolean" ? fact.blocksRelease : true;
  if (!configured) {
    const notConfiguredInstalled = fact?.installed === void 0 ? false : installed;
    return status({
      id,
      label,
      category: "plugin-dependency",
      provider: "plugin",
      provisioning: "plugin-dependency",
      checkMode: "fast",
      state: "unavailable",
      configured: false,
      installed: notConfiguredInstalled,
      callable: fact?.callable === void 0 ? "unknown" : callable,
      authorized,
      reason: fact?.reason ?? `${label} is not declared or trusted as a curdx-flow plugin dependency.`,
      evidenceImpact: capabilityImpact(id),
      blocksCompletion,
      blocksRelease,
      remediation: fact?.remediation ?? `Install/enable ${label} from its configured Claude Code marketplace dependency.`,
      durationMs: 0
    });
  }
  const state2 = readiness === "available" ? "available" : readiness === "degraded" ? "degraded" : readiness === "unavailable" ? "unavailable" : callable === false ? "degraded" : installed === false ? "unavailable" : "unknown";
  return status({
    id,
    label,
    category: "plugin-dependency",
    provider: "plugin",
    provisioning: "plugin-dependency",
    checkMode: "fast",
    state: state2,
    configured: true,
    installed,
    callable,
    authorized,
    reason: fact?.reason ?? (callable === false ? `${label} is configured but not callable.` : `${label} is configured; installed/callable status needs dependency readiness check.`),
    evidenceImpact: capabilityImpact(id),
    blocksCompletion,
    blocksRelease,
    remediation: state2 === "available" ? null : fact?.remediation || (callable === false ? `Run Claude Code plugin diagnostics for ${label} and fix the callability error.` : `Run dependency readiness doctor for ${label}.`),
    durationMs: 0
  });
}
function externalMcpStatus(id, fact) {
  const configured = tri(fact?.configured === null ? void 0 : fact?.configured);
  const installed = tri(fact?.installed);
  const callable = tri(fact?.callable);
  const statusValue = fact?.status;
  if (configured !== true) {
    const unknown = configured === "unknown";
    return status({
      id,
      label: id,
      category: "external-mcp",
      provider: "mcp",
      provisioning: "external-mcp",
      checkMode: "fast",
      state: unknown ? "unknown" : "unavailable",
      configured,
      installed: unknown ? "unknown" : false,
      callable: unknown ? "unknown" : false,
      authorized: "unknown",
      reason: unknown ? `${id} readiness is unknown because claude mcp list could not be confirmed.` : `${id} is not configured in Claude MCP list output.`,
      evidenceImpact: capabilityImpact(id),
      blocksCompletion: id === "context7",
      blocksRelease: false,
      remediation: fact?.fallback || fact?.installHint || `Configure the external ${id} MCP server; curdx-flow must not bundle it as a plugin dependency.`,
      durationMs: 0
    });
  }
  const state2 = callable === true || statusValue === "connected" ? "available" : callable === false || statusValue === "error" ? "degraded" : "unknown";
  return status({
    id,
    label: id,
    category: "external-mcp",
    provider: "mcp",
    provisioning: "external-mcp",
    checkMode: "fast",
    state: state2,
    configured: true,
    installed,
    callable,
    authorized: tri(fact?.authorized),
    reason: state2 === "available" ? `${id} is configured and connected as an external MCP.` : state2 === "degraded" ? `${id} is configured but not callable from claude mcp list output.` : `${id} is configured; deep callability can be verified when the route requires it.`,
    evidenceImpact: capabilityImpact(id),
    blocksCompletion: id === "context7" && state2 !== "available",
    blocksRelease: false,
    remediation: state2 === "available" ? null : fact?.fallback || fact?.installHint || `Verify the external ${id} MCP server.`,
    durationMs: 0
  });
}
function capabilityImpact(id) {
  switch (id) {
    case "context7":
      return ["current documentation evidence"];
    case "sequential-thinking":
      return ["high-risk reasoning evidence"];
    case "chrome-devtools-mcp":
      return ["browser evidence", "console/network evidence"];
    case "ui-ux-pro-max":
      return ["UI/UX review evidence"];
    case "claude-mem":
      return ["cross-session memory evidence"];
    case "pua":
      return ["repeated-failure recovery evidence"];
    default:
      return ["capability evidence"];
  }
}
function browserStatuses(input) {
  const playwright = input?.playwright;
  const chrome = input?.chromeDevtoolsMcp;
  const out = [];
  out.push(status({
    id: "playwright",
    label: "Playwright",
    category: "browser",
    provider: "playwright",
    provisioning: "project-script",
    checkMode: playwright?.ready === true ? "skipped" : "fast",
    state: playwright?.ready === true ? "skipped" : "unavailable",
    configured: playwright?.ready === true,
    installed: playwright?.dependency === true ? true : "unknown",
    callable: "skipped",
    authorized: "unknown",
    reason: playwright?.ready === true ? `Playwright verifier candidate found${playwright.recommendedCommand ? `: ${playwright.recommendedCommand}` : ""}. Deep run skipped.` : "No Playwright/browser verifier candidate found.",
    ...playwright?.ready === true ? { skippedReason: "Fast doctor does not run Playwright/browser verification." } : {},
    evidenceImpact: ["browser evidence", "UI journey evidence"],
    blocksCompletion: playwright?.ready !== true,
    blocksRelease: false,
    remediation: playwright?.ready === true ? null : "Add a Playwright/browser verification script or document a blocker.",
    durationMs: 0
  }));
  if (chrome) {
    const ready = chrome.ready === true;
    const dependencyDeclared = chrome.dependencyDeclared === true;
    const chromeInstalled = chrome.chromeInstalled === true;
    out.push(status({
      id: "chrome-runtime",
      label: "Chrome runtime for Chrome DevTools MCP",
      category: "browser",
      provider: "chrome",
      provisioning: "local-command",
      checkMode: "fast",
      state: ready ? "available" : dependencyDeclared && !chromeInstalled ? "degraded" : "unavailable",
      configured: dependencyDeclared,
      installed: chromeInstalled,
      callable: ready ? "unknown" : false,
      authorized: "unknown",
      reason: ready ? "Chrome DevTools MCP dependency is declared and Chrome is installed." : dependencyDeclared ? "Chrome DevTools MCP is declared but Chrome is not installed or not discoverable." : "Chrome DevTools MCP is not declared.",
      evidenceImpact: capabilityImpact("chrome-devtools-mcp"),
      blocksCompletion: false,
      blocksRelease: false,
      remediation: ready ? null : "Install Chrome and enable chrome-devtools-mcp before relying on browser runtime evidence.",
      durationMs: 0
    }));
  }
  return out;
}
function hookFreshnessStatus(input) {
  if (input?.sourceAvailable !== true) {
    return status({
      id: "hook-freshness",
      label: "Hook bundle freshness",
      category: "hook",
      provider: "curdx-flow",
      provisioning: "workflow",
      checkMode: "skipped",
      state: "skipped",
      configured: "skipped",
      installed: "skipped",
      callable: "skipped",
      authorized: "skipped",
      reason: "Hook source is not available in this installed runtime; freshness is a source checkout check.",
      evidenceImpact: ["plugin release evidence"],
      blocksCompletion: false,
      blocksRelease: false,
      remediation: null,
      durationMs: 0
    });
  }
  const fresh = input.fresh === true;
  return status({
    id: "hook-freshness",
    label: "Hook bundle freshness",
    category: "hook",
    provider: "curdx-flow",
    provisioning: "workflow",
    checkMode: "fast",
    state: fresh ? "available" : "unavailable",
    configured: true,
    installed: true,
    callable: fresh,
    authorized: "skipped",
    reason: fresh ? "Generated hook bundles are fresh." : "Generated hook bundles are stale.",
    evidenceImpact: ["plugin release evidence", "hook protocol evidence"],
    blocksCompletion: false,
    blocksRelease: !fresh,
    remediation: fresh ? null : input.checkCommand ?? "npm run check:hooks-fresh",
    durationMs: 0
  });
}
function nativeGoalStatus(input) {
  const readiness = input ?? buildNativeGoalReadiness();
  const state2 = readiness.state === "available" ? "available" : readiness.state === "unknown" ? "unknown" : "unavailable";
  const detected = readiness.detectedVersion !== null;
  return {
    ...status({
      id: "native-goal",
      label: "Native /goal",
      category: "core",
      provider: "claude-code",
      provisioning: "workflow",
      checkMode: "fast",
      state: state2,
      configured: readiness.blockers.length > 0 ? false : detected ? true : "unknown",
      installed: detected ? true : readiness.state === "unavailable" ? false : "unknown",
      callable: readiness.state === "available" ? true : readiness.state === "unknown" ? "unknown" : false,
      authorized: readiness.state === "available" ? true : readiness.blockers.length > 0 ? false : "unknown",
      reason: readiness.reason,
      evidenceImpact: ["long-task execution evidence", "transcript-visible completion evidence"],
      blocksCompletion: readiness.state !== "available",
      blocksRelease: false,
      remediation: readiness.fallbackAction,
      durationMs: 0
    }),
    supported: readiness.supported,
    requiredVersion: readiness.requiredVersion,
    detectedVersion: readiness.detectedVersion,
    goalState: readiness.state,
    blockers: readiness.blockers,
    fallbackAction: readiness.fallbackAction,
    recommendedDriver: readiness.recommendedDriver,
    conditionLength: readiness.conditionLength,
    warnings: readiness.warnings
  };
}
function staticStatuses(input) {
  const packageManager = input.packageManager;
  return [
    status({
      id: "node",
      label: "Node.js",
      category: "core",
      provider: "node",
      provisioning: "local-command",
      checkMode: "fast",
      state: "available",
      configured: true,
      installed: true,
      callable: true,
      authorized: "skipped",
      reason: `Current runtime is ${process.version}.`,
      evidenceImpact: ["command evidence", "plugin runtime evidence"],
      blocksCompletion: false,
      blocksRelease: false,
      remediation: null,
      durationMs: 0
    }),
    status({
      id: "package-manager",
      label: "Package manager",
      category: "package-manager",
      provider: "npm",
      provisioning: "local-command",
      checkMode: "fast",
      state: packageManager ? "available" : "unavailable",
      configured: packageManager ? true : false,
      installed: packageManager ? "unknown" : false,
      callable: "unknown",
      authorized: "skipped",
      reason: packageManager ? `Detected package manager: ${packageManager}.` : "No package manager marker found.",
      evidenceImpact: ["command evidence", "verification command evidence"],
      blocksCompletion: packageManager === null,
      blocksRelease: false,
      remediation: packageManager ? null : "Add package.json/lockfile or document the project verifier command.",
      durationMs: 0
    }),
    nativeGoalStatus(input.nativeGoal),
    pluginValidationStatus(input),
    status({
      id: "release-readiness",
      label: "Release readiness",
      category: "release",
      provider: "curdx-flow",
      provisioning: "workflow",
      checkMode: "fast",
      state: input.release?.ready === false ? "degraded" : input.release?.ready === true ? "available" : "unknown",
      configured: true,
      installed: "skipped",
      callable: input.release?.ready === false ? false : "unknown",
      authorized: "unknown",
      reason: input.release?.ready === false ? "Release readiness has one or more unresolved checks." : "Release readiness did not report a blocking failure.",
      evidenceImpact: ["release evidence"],
      blocksCompletion: false,
      blocksRelease: input.release?.ready === false,
      remediation: input.release?.ready === false ? "Run release readiness checks before tag/publish." : null,
      durationMs: 0
    })
  ];
}
function sortCapabilities(capabilities) {
  return [...capabilities].sort((a, b) => a.id.localeCompare(b.id));
}
function buildCapabilityMatrix(input) {
  const pluginDeps = input.plugin?.dependencies?.dependencies ?? [];
  const externalServers = input.externalMcp?.servers ?? [];
  const capabilities = [
    ...staticStatuses(input),
    probeStatus({
      id: "claude-code",
      label: "Claude Code CLI",
      provider: "claude-code",
      category: "core",
      provisioning: "local-command",
      probe: input.claudeProbe,
      command: "claude --version",
      evidenceImpact: ["plugin validation evidence", "MCP/plugin command evidence", "native /goal evidence"],
      blocksCompletion: true,
      blocksRelease: true,
      remediation: "Install or update Claude Code and ensure the claude command is callable."
    }),
    probeStatus({
      id: "npm",
      label: "npm",
      provider: "npm",
      category: "package-manager",
      provisioning: "local-command",
      probe: input.npmProbe,
      command: "npm --version",
      evidenceImpact: ["package verification evidence", "release evidence"],
      blocksCompletion: false,
      blocksRelease: true,
      remediation: "Install npm or configure the project package manager verifier."
    }),
    ...CURDX_PLUGIN_DEPENDENCIES.map(
      (dependency) => pluginDependencyStatus(
        dependency.id,
        dependency.name,
        pluginDeps.find((fact) => fact.name === dependency.name)
      )
    ),
    ...CURDX_EXTERNAL_MCPS.map(
      (mcp) => externalMcpStatus(
        mcp.id,
        externalServers.find((server) => server.id === mcp.id)
      )
    ),
    ...browserStatuses(input.browserVerification),
    hookFreshnessStatus(input.hookFreshness)
  ];
  const deduped = /* @__PURE__ */ new Map();
  for (const capability of capabilities) deduped.set(capability.id, capability);
  const sorted = sortCapabilities([...deduped.values()]);
  const blockers = sorted.filter(
    (capability) => (capability.state === "unavailable" || capability.state === "degraded") && (capability.blocksCompletion || capability.blocksRelease)
  );
  const degraded = sorted.filter((capability) => capability.state === "degraded");
  const nextActions = sorted.filter((capability) => capability.remediation && capability.state !== "available").map((capability) => ({
    capabilityId: capability.id,
    action: capability.remediation,
    priority: capability.blocksRelease || capability.blocksCompletion ? "high" : capability.state === "degraded" ? "medium" : "low"
  }));
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
    cwd: input.cwd,
    mode: input.mode ?? "fast",
    summary: {
      blockers: blockers.length,
      degraded: degraded.length,
      unavailable: sorted.filter((capability) => capability.state === "unavailable").length,
      skippedDeepChecks: sorted.filter((capability) => capability.checkMode === "skipped").length
    },
    capabilities: sorted,
    blockers,
    degraded,
    nextActions
  };
}

// src/core/capabilities/probes.ts
import { spawnSync as spawnSync2 } from "node:child_process";
function fixtureMap(env) {
  const raw = env.CURDX_FLOW_CAPABILITY_PROBES;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function fixtureResult(input, fixture) {
  return {
    id: input.id,
    command: [input.command, ...input.args ?? []].join(" "),
    exitCode: fixture.exitCode ?? 0,
    stdout: fixture.stdout ?? "",
    stderr: fixture.stderr ?? "",
    ...fixture.error ? { error: fixture.error } : {},
    durationMs: fixture.durationMs ?? 0,
    timedOut: fixture.timedOut ?? false,
    source: "fixture"
  };
}
function probeCommand(input) {
  const env = { ...process.env, ...input.env ?? {} };
  const fixture = fixtureMap(env)[input.id];
  if (fixture) return fixtureResult(input, fixture);
  const startedAt = Date.now();
  const result = spawnSync2(input.command, input.args ?? [], {
    cwd: input.cwd,
    env,
    encoding: "utf8",
    timeout: input.timeoutMs ?? 1e3,
    maxBuffer: input.maxBuffer ?? 256 * 1024
  });
  const durationMs = Date.now() - startedAt;
  const error = result.error;
  const timedOut = error?.code === "ETIMEDOUT" || result.signal === "SIGTERM";
  const errorMessage = timedOut ? `command timed out after ${input.timeoutMs ?? 1e3}ms` : error?.message;
  return {
    id: input.id,
    command: [input.command, ...input.args ?? []].join(" "),
    exitCode: result.status ?? null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    ...errorMessage ? { error: errorMessage } : {},
    durationMs,
    timedOut,
    source: "exec"
  };
}

// src/core/capabilities/readiness.ts
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringValue(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function booleanTri(value) {
  return typeof value === "boolean" ? value : "unknown";
}
function splitPluginId(id) {
  const at = id.lastIndexOf("@");
  if (at <= 0) return { name: id, marketplace: "" };
  return {
    name: id.slice(0, at),
    marketplace: id.slice(at + 1)
  };
}
function parsePluginListJson(raw) {
  if (raw === void 0) {
    return { ok: false, plugins: [], parseError: null };
  }
  try {
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : isRecord2(parsed) && Array.isArray(parsed.plugins) ? parsed.plugins : null;
    if (!items) {
      return { ok: false, plugins: [], parseError: "invalid plugin list json: expected an array or { plugins: [] }" };
    }
    const plugins = [];
    for (const item of items) {
      if (!isRecord2(item) || typeof item.id !== "string" || item.id.length === 0) continue;
      const parts = splitPluginId(item.id);
      plugins.push({
        id: item.id,
        name: stringValue(item.name) ?? parts.name,
        marketplace: stringValue(item.marketplace) ?? parts.marketplace,
        ...stringValue(item.version) ? { version: stringValue(item.version) } : {},
        ...stringValue(item.scope) ? { scope: stringValue(item.scope) } : {},
        ...typeof item.enabled === "boolean" ? { enabled: item.enabled } : {}
      });
    }
    return { ok: true, plugins, parseError: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, plugins: [], parseError: `invalid plugin list json: ${message}` };
  }
}
function pluginBlocksCompletion(id) {
  return id === "chrome-devtools-mcp";
}
function dependencyRemediation(name, marketplace, issue) {
  if (issue === "degraded") {
    return `Enable ${name} from the ${marketplace} marketplace at user scope and rerun curdx-flow doctor.`;
  }
  if (issue === "unavailable") {
    return `Install/enable ${name}@${marketplace} as a Claude Code plugin dependency; curdx-flow must not vendor or silently skip it.`;
  }
  return `Run claude plugin list --json and confirm ${name}@${marketplace} is installed and enabled.`;
}
function buildPluginDependencyReadiness(input) {
  const source = input.pluginListSource ?? "not-probed";
  const exitCode = input.pluginListExitCode ?? (input.pluginListJson === void 0 ? null : 0);
  const commandError = input.pluginListError ?? null;
  const allowlist = new Set(input.marketplaceAllowlist ?? []);
  const parsed = exitCode === 0 && !commandError ? parsePluginListJson(input.pluginListJson) : { ok: false, plugins: [], parseError: null };
  const expectedScope = input.expectedScope ?? "user";
  const dependencies = input.expected.map((expected) => {
    const actual = (input.manifestDependencies ?? []).find((item) => item.name === expected.name);
    const marketplace = actual?.marketplace ?? null;
    const declared = actual !== void 0;
    const marketplaceMatches = marketplace === expected.marketplace;
    const crossMarketplaceAllowlisted = allowlist.has(expected.marketplace);
    const trustSatisfied = declared && marketplaceMatches && crossMarketplaceAllowlisted;
    const exactInstalled = parsed.plugins.find((plugin) => plugin.id === expected.pluginId);
    const sameNameInstalled = parsed.plugins.find(
      (plugin) => plugin.name === expected.name && plugin.id !== expected.pluginId
    );
    const scope = exactInstalled?.scope ?? (exactInstalled ? expectedScope : null);
    const enabled = exactInstalled ? booleanTri(exactInstalled.enabled) : parsed.ok ? false : "unknown";
    const drift = [];
    if (!declared) drift.push("manifest-missing");
    if (declared && !marketplaceMatches) drift.push("manifest-marketplace-mismatch");
    if (!crossMarketplaceAllowlisted) drift.push("marketplace-allowlist-missing");
    if (parsed.parseError) drift.push("plugin-list-malformed");
    if (commandError || exitCode !== 0) drift.push("plugin-list-unavailable");
    if (parsed.ok && !exactInstalled) {
      drift.push(sameNameInstalled ? "plugin-id-mismatch" : "plugin-missing");
    }
    if (exactInstalled && scope !== expectedScope) drift.push("plugin-scope-mismatch");
    if (exactInstalled && exactInstalled.enabled === false) drift.push("plugin-disabled");
    const manifestDrift = drift.some(
      (item) => item === "manifest-missing" || item === "manifest-marketplace-mismatch" || item === "marketplace-allowlist-missing" || item === "plugin-id-mismatch"
    );
    const installed = exactInstalled ? true : parsed.ok ? false : "unknown";
    const installedScope = scope;
    const installedVersion = exactInstalled?.version ?? null;
    const authorized = trustSatisfied ? true : false;
    let callable = "unknown";
    let readiness = "unknown";
    if (!trustSatisfied || manifestDrift) {
      readiness = "unavailable";
      callable = false;
    } else if (!parsed.ok || commandError || exitCode !== 0) {
      readiness = "unknown";
      callable = "unknown";
    } else if (!exactInstalled) {
      readiness = "unavailable";
      callable = false;
    } else if (scope !== expectedScope || exactInstalled.enabled === false) {
      readiness = "degraded";
      callable = false;
    } else if (exactInstalled.enabled === true) {
      readiness = "available";
      callable = true;
    }
    const reason = readiness === "available" ? `${expected.name}@${expected.marketplace} is installed at ${installedScope} scope and enabled.` : readiness === "unknown" ? `${expected.name}@${expected.marketplace} readiness is unknown because installed plugin state was not confirmed.` : drift.length > 0 ? `${expected.name}@${expected.marketplace} readiness failed: ${drift.join(", ")}.` : `${expected.name}@${expected.marketplace} is not ready.`;
    return {
      id: expected.id,
      name: expected.name,
      type: "plugin",
      expectedMarketplace: expected.marketplace,
      expectedPluginId: expected.pluginId,
      declared,
      marketplace,
      marketplaceMatches,
      crossMarketplaceAllowlisted,
      versionConstraint: actual?.version ?? null,
      installed,
      installedScope,
      installedVersion,
      enabled,
      callable,
      authorized,
      trustSatisfied,
      readiness,
      blocksCompletion: pluginBlocksCompletion(expected.id) && readiness !== "available",
      blocksRelease: readiness !== "available",
      drift,
      reason,
      remediation: readiness === "available" ? "" : dependencyRemediation(expected.name, expected.marketplace, readiness),
      pluginListSource: source,
      pluginListExitCode: exitCode
    };
  });
  return {
    ready: dependencies.every((dependency) => dependency.readiness === "available"),
    source,
    exitCode,
    parseError: parsed.parseError,
    commandError,
    dependencies
  };
}
function parseMcpListOutput(raw) {
  const entries = [];
  const ignoredPluginProvidedServers = [];
  const malformedLines = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^Checking\b/i.test(line)) continue;
    if (line.startsWith("plugin:")) {
      ignoredPluginProvidedServers.push(line);
      continue;
    }
    const colonIdx = line.indexOf(":");
    if (colonIdx <= 0) {
      malformedLines.push(line);
      continue;
    }
    const name = line.slice(0, colonIdx).trim();
    if (!name || /\s/.test(name)) {
      malformedLines.push(line);
      continue;
    }
    const status2 = /✗|failed|error|not connected|disconnected/i.test(line) ? "error" : /✓|\bconnected\b/i.test(line) ? "connected" : "unknown";
    entries.push({ name, rawLine: line, status: status2 });
  }
  return { entries, ignoredPluginProvidedServers, malformedLines };
}
function externalMcpFallback(id) {
  if (id === "context7") {
    return "Fallback: use official docs/web evidence or manual confirmation; latest Claude Code/plugin/MCP behavior remains uncertain until context7 is connected.";
  }
  if (id === "sequential-thinking") {
    return "Fallback: perform explicit local reasoning and manual risk review; high-risk reasoning evidence remains degraded until sequential-thinking is connected.";
  }
  return "Fallback: document manual confirmation before relying on this external MCP evidence.";
}
function buildExternalMcpReadiness(input) {
  const source = input.mcpListSource ?? "not-probed";
  const exitCode = input.mcpListExitCode ?? (input.mcpListOutput === void 0 ? null : 0);
  const commandError = input.mcpListError ?? null;
  if (exitCode !== 0 || commandError) {
    return {
      ready: false,
      source,
      exitCode,
      commandError: commandError ?? `claude mcp list exited ${exitCode}`,
      malformedLines: [],
      ignoredPluginProvidedServers: [],
      servers: input.expected.map((expected) => ({
        id: expected.id,
        type: "mcp",
        expectedExternal: true,
        bundledByCurdxFlow: false,
        configured: "unknown",
        installed: "unknown",
        callable: "unknown",
        authorized: "unknown",
        status: "unknown",
        rawLine: null,
        installHint: expected.installHint,
        fallback: externalMcpFallback(expected.id),
        source
      }))
    };
  }
  const parsed = parseMcpListOutput(input.mcpListOutput ?? "");
  const servers = input.expected.map((expected) => {
    const entry = parsed.entries.find(
      (candidate) => expected.match.test(candidate.name) || expected.match.test(candidate.rawLine)
    );
    if (!entry) {
      return {
        id: expected.id,
        type: "mcp",
        expectedExternal: true,
        bundledByCurdxFlow: false,
        configured: false,
        installed: false,
        callable: false,
        authorized: "unknown",
        status: "missing",
        rawLine: null,
        installHint: expected.installHint,
        fallback: externalMcpFallback(expected.id),
        source
      };
    }
    return {
      id: expected.id,
      type: "mcp",
      expectedExternal: true,
      bundledByCurdxFlow: false,
      configured: true,
      installed: true,
      callable: entry.status === "connected" ? true : entry.status === "error" ? false : "unknown",
      authorized: "unknown",
      status: entry.status,
      rawLine: entry.rawLine,
      installHint: expected.installHint,
      fallback: entry.status === "connected" ? "" : externalMcpFallback(expected.id),
      source
    };
  });
  return {
    ready: servers.every((server) => server.status === "connected"),
    source,
    exitCode,
    commandError: null,
    malformedLines: parsed.malformedLines,
    ignoredPluginProvidedServers: parsed.ignoredPluginProvidedServers,
    servers
  };
}

// src/core/capabilities/renderer.ts
function overall(matrix) {
  if (matrix.summary.blockers > 0) return "blocked";
  if (matrix.summary.degraded > 0 || matrix.summary.unavailable > 0 || matrix.summary.skippedDeepChecks > 0) return "degraded";
  return "ready";
}
function tri2(value) {
  return String(value);
}
function row(capability) {
  return [
    capability.id,
    capability.state,
    `configured=${tri2(capability.configured)}`,
    `installed=${tri2(capability.installed)}`,
    `callable=${tri2(capability.callable)}`,
    `authorized=${tri2(capability.authorized)}`,
    capability.reason
  ].join(" | ");
}
function renderCapabilityMatrix(matrix) {
  const degraded = matrix.capabilities.filter(
    (capability) => capability.state === "degraded" || capability.state === "unavailable"
  );
  const impacts = degraded.flatMap(
    (capability) => capability.evidenceImpact.map((impact) => `- ${capability.id}: affects ${impact}`)
  );
  const nextActions = matrix.nextActions.length > 0 ? matrix.nextActions.map((action, index) => `${index + 1}. ${action.capabilityId}: ${action.action}`) : ["none"];
  return [
    "# curdx-flow Doctor",
    "",
    `Overall: ${overall(matrix)}`,
    `Blockers: ${matrix.summary.blockers}`,
    `Degraded: ${matrix.summary.degraded}`,
    `Unavailable: ${matrix.summary.unavailable}`,
    `Skipped deep checks: ${matrix.summary.skippedDeepChecks}`,
    "",
    "## Capability Matrix",
    ...matrix.capabilities.map(row),
    "",
    "## Evidence Impact",
    ...impacts.length > 0 ? impacts : ["none"],
    "",
    "## Next Actions",
    ...nextActions,
    ""
  ].join("\n");
}

// src/hooks/lib/runtime-cli.ts
function readArg9(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function parseList5(value) {
  if (!value) return [];
  return value.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean);
}
function printJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}
function usage(exitCode = 1) {
  const text = [
    "usage: curdx-flow <command> [args]",
    "",
    "commands:",
    "  route --goal <text> [--name <spec>] [--flags <args>] [--cwd <dir>] [--compile] [--record]",
    "  goal [--spec <name-or-path>] [--goal <text>] [--cwd <dir>] [--max-turns <n>]",
    "  last-mile --goal <text> [--spec <name-or-path>] [--cwd <dir>] [--record]",
    "  snapshot [--spec <name-or-path>] [--goal <text>] [--cwd <dir>] [--session-id <id>]",
    "  specs dirs [--cwd <dir>]",
    "  specs list [--cwd <dir>]",
    "  specs find <name> [--cwd <dir>]",
    "  specs resolve [name-or-path] [--cwd <dir>] [--session-id <id>]",
    "  specs bind-session <name-or-path> --session-id <id> [--cwd <dir>]",
    "  state merge <state-file> <json-patch>",
    "  tasks count <tasks.md>",
    "  dev detect [--cwd <dir>]",
    "  dev up [--cwd <dir>]",
    "  dev health [--cwd <dir>] [--dry-run]",
    "  dev verify [--cwd <dir>] [--dry-run] [--include-e2e]",
    "  dev down [--cwd <dir>]",
    "  verify run --command <cmd> [--phase execution] [--spec <name-or-path>] [--cwd <dir>] [--description <text>]",
    "  verify-blocks [--cwd <dir>] [--spec <name-or-path>]",
    "  doctor [--cwd <dir>] [--goal <text>]"
  ].join("\n");
  process.stderr.write(text + "\n");
  process.exit(exitCode);
}
function scriptRoot() {
  return dirname(fileURLToPath8(import.meta.url));
}
function pluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || resolve5(scriptRoot(), "..", "..", "..");
}
function repoRootFromPlugin() {
  return resolve5(pluginRoot(), "..", "..");
}
function runBundled(scriptName, args, cwd) {
  const script = join9(scriptRoot(), `${scriptName}.mjs`);
  const result = spawnSync3(process.execPath, [script, ...args], {
    cwd: cwd ?? process.cwd(),
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"]
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    process.stderr.write(`${scriptName}: ${result.error.message}
`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}
function route(argv) {
  const estimatedRaw = readArg9("--estimated-files", argv);
  const taskRaw = readArg9("--task-count", argv);
  const availableRaw = readArg9("--available-capabilities", argv);
  const input = {
    goal: readArg9("--goal", argv) ?? "",
    name: readArg9("--name", argv),
    flags: readArg9("--flags", argv) ?? "",
    cwd: readArg9("--cwd", argv),
    changedFiles: parseList5(readArg9("--files", argv)),
    availableCapabilities: availableRaw === void 0 ? void 0 : parseList5(availableRaw),
    estimatedFiles: estimatedRaw === void 0 ? void 0 : Number(estimatedRaw),
    taskCount: taskRaw === void 0 ? void 0 : Number(taskRaw)
  };
  if (hasFlag2(argv, "--compile")) {
    printJson(buildExecutionBrief({ ...input, record: hasFlag2(argv, "--record") }));
    return;
  }
  printJson(classifySmartRoute(input));
}
function snapshot(argv) {
  printJson(
    buildWorkflowSnapshot({
      cwd: readArg9("--cwd", argv),
      spec: readArg9("--spec", argv),
      goal: readArg9("--goal", argv),
      sessionId: readArg9("--session-id", argv)
    })
  );
}
function lastMile(argv) {
  const available = parseList5(readArg9("--available-capabilities", argv));
  printJson(
    decideLastMile({
      cwd: readArg9("--cwd", argv),
      goal: readArg9("--goal", argv) ?? "",
      name: readArg9("--spec", argv) ?? readArg9("--name", argv),
      changedFiles: parseList5(readArg9("--files", argv)),
      availableCapabilities: available.length > 0 ? available : void 0,
      hookEvent: "runtime",
      record: hasFlag2(argv, "--record")
    })
  );
}
function goal(argv) {
  const maxTurnsRaw = readArg9("--max-turns", argv) ?? readArg9("--max-global-iterations", argv);
  const cwd = resolve5(readArg9("--cwd", argv) ?? process.cwd());
  const claudeBin = process.env.CURDX_FLOW_CLAUDE_BIN ?? "claude";
  const claudeProbe = probeCommand({
    id: "claude-version",
    command: claudeBin,
    args: ["--version"],
    cwd,
    env: process.env,
    timeoutMs: 1e3
  });
  const nativeGoal = buildNativeGoalReadiness({
    claudeProbe,
    settingsSources: readNativeGoalSettingsSources({ cwd, env: process.env })
  });
  printJson(
    buildGoalBridge({
      cwd,
      spec: readArg9("--spec", argv) ?? readArg9("--name", argv),
      goal: readArg9("--goal", argv),
      maxTurns: maxTurnsRaw === void 0 ? void 0 : Number(maxTurnsRaw),
      nativeGoal
    })
  );
}
function firstPositional(argv) {
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (!value) continue;
    if (value.startsWith("--")) {
      i += 1;
      continue;
    }
    return value;
  }
  return void 0;
}
function hasFlag2(argv, flag) {
  return argv.includes(flag);
}
function isDirectory(path3) {
  try {
    return statSync6(path3).isDirectory();
  } catch {
    return false;
  }
}
function readJsonFile3(path3) {
  try {
    return JSON.parse(readFileSync10(path3, "utf8"));
  } catch {
    return null;
  }
}
function detectPackageManager3(cwd) {
  if (existsSync10(join9(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync10(join9(cwd, "bun.lockb")) || existsSync10(join9(cwd, "bun.lock"))) return "bun";
  if (existsSync10(join9(cwd, "yarn.lock"))) return "yarn";
  if (existsSync10(join9(cwd, "package-lock.json"))) return "npm";
  if (existsSync10(join9(cwd, "package.json"))) return "npm";
  return null;
}
function scriptCommand2(packageManager, scriptName) {
  switch (packageManager) {
    case "pnpm":
      return `pnpm run ${scriptName}`;
    case "yarn":
      return `yarn ${scriptName}`;
    case "bun":
      return `bun run ${scriptName}`;
    default:
      return `npm run ${scriptName}`;
  }
}
function shellToken(value) {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}
function pluginDependencyDoctor() {
  const manifest = readJsonFile3(join9(pluginRoot(), ".claude-plugin", "plugin.json"));
  const marketplace = readJsonFile3(
    join9(repoRootFromPlugin(), ".claude-plugin", "marketplace.json")
  );
  const declared = manifest?.dependencies ?? [];
  const allowlist = new Set(marketplace?.allowCrossMarketplaceDependenciesOn ?? []);
  const envJson = process.env.CURDX_FLOW_PLUGIN_LIST_JSON;
  const envExitCode = process.env.CURDX_FLOW_PLUGIN_LIST_EXIT_CODE;
  const envError = process.env.CURDX_FLOW_PLUGIN_LIST_ERROR;
  const bin = process.env.CURDX_FLOW_CLAUDE_BIN ?? "claude";
  let source = "claude plugin list --json";
  let pluginListJson;
  let exitCode = null;
  let error = null;
  if (envJson !== void 0) {
    source = "CURDX_FLOW_PLUGIN_LIST_JSON";
    pluginListJson = envJson;
    exitCode = envExitCode ? Number(envExitCode) : 0;
    error = envError ?? null;
  } else {
    let result = spawnSync3(bin, ["plugin", "list", "--json"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 3e3,
      maxBuffer: 1024 * 1024
    });
    source = "direct exec";
    pluginListJson = result.stdout ?? "";
    exitCode = result.status ?? null;
    if (result.error) {
      error = result.error.message;
    } else if (exitCode !== 0 && result.stderr) {
      error = result.stderr.trim();
    }
  }
  const readiness = buildPluginDependencyReadiness({
    expected: CURDX_PLUGIN_DEPENDENCIES,
    manifestDependencies: declared,
    marketplaceAllowlist: [...allowlist],
    pluginListJson,
    pluginListSource: source,
    pluginListExitCode: exitCode,
    pluginListError: error
  });
  return {
    ...readiness,
    warnings: readiness.dependencies.filter((item) => item.versionConstraint === null).map(
      (item) => `${item.name} has no dependency version constraint; keep this intentional unless upstream tags are confirmed.`
    )
  };
}
function externalMcpDoctor() {
  const envOutput = process.env.CURDX_FLOW_MCP_LIST_OUTPUT;
  const envExitCode = process.env.CURDX_FLOW_MCP_LIST_EXIT_CODE;
  const envError = process.env.CURDX_FLOW_MCP_LIST_ERROR;
  const bin = process.env.CURDX_FLOW_CLAUDE_BIN ?? "claude";
  let source = "claude mcp list";
  let output = "";
  let exitCode = null;
  let error = null;
  if (envOutput !== void 0) {
    source = "CURDX_FLOW_MCP_LIST_OUTPUT";
    output = envOutput;
    exitCode = envExitCode ? Number(envExitCode) : 0;
    error = envError ?? null;
  } else {
    let result = spawnSync3(bin, ["mcp", "list"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 3e3,
      maxBuffer: 1024 * 1024
    });
    source = "direct exec";
    output = `${result.stdout ?? ""}
${result.stderr ?? ""}`;
    exitCode = result.status ?? null;
    if (result.error) {
      error = result.error.message;
    } else if (exitCode !== 0 && result.stderr) {
      error = result.stderr.trim();
    }
  }
  const readiness = buildExternalMcpReadiness({
    expected: CURDX_EXTERNAL_MCPS,
    mcpListOutput: output,
    mcpListSource: source,
    mcpListExitCode: exitCode,
    mcpListError: error
  });
  return {
    ...readiness,
    command: `${bin} mcp list`,
    error: readiness.commandError,
    note: "curdx-flow does not bundle these MCP servers; setup scripts or user MCP config own installation."
  };
}
function externalMcpWarnings(externalMcp) {
  if (externalMcp.ready === true) return [];
  const unknown = externalMcp.servers?.filter((server) => server.status !== "connected").map((server) => `${server.id ?? "unknown"}:${server.status ?? "unknown"}`) ?? [];
  const suffix = unknown.length > 0 ? ` (${unknown.join(", ")})` : "";
  const command = externalMcp.error ? `; command error: ${externalMcp.error}` : typeof externalMcp.exitCode === "number" ? `; exitCode=${externalMcp.exitCode}` : "";
  return [
    `Expected external MCP readiness is not confirmed${suffix}${command}. curdx-flow will not bundle duplicate MCP config; fix Claude MCP setup before relying on context7 or sequential-thinking.`
  ];
}
function releaseDoctor() {
  const pkg = readJsonFile3(join9(repoRootFromPlugin(), "package.json"));
  const lock = readJsonFile3(
    join9(repoRootFromPlugin(), "package-lock.json")
  );
  const manifest = readJsonFile3(join9(pluginRoot(), ".claude-plugin", "plugin.json"));
  const marketplace = readJsonFile3(
    join9(repoRootFromPlugin(), ".claude-plugin", "marketplace.json")
  );
  const marketplaceEntry = marketplace?.plugins?.find((item) => item.name === "curdx-flow");
  const versions = {
    packageJson: pkg?.version ?? null,
    packageLockRoot: lock?.version ?? null,
    packageLockPackage: lock?.packages?.[""]?.version ?? null,
    pluginManifest: manifest?.version ?? null,
    marketplace: marketplaceEntry?.version ?? null
  };
  const values = Object.values(versions);
  const aligned = values.every((value) => value !== null && value === values[0]);
  const version = aligned ? values[0] : null;
  const tagParity = version ? releaseTagParityDoctor(version) : null;
  return {
    ready: aligned && tagParity?.ready !== false,
    aligned,
    versions,
    expectedNpmTag: version ? `v${version}` : null,
    expectedPluginTag: version ? `curdx-flow--v${version}` : null,
    tagParity,
    warnings: tagParity?.state === "incomplete" ? ["npm tag and Claude Code plugin tag are out of sync for the aligned release version."] : [],
    commands: [
      "npm run check-versions",
      "claude plugin validate ./plugins/curdx-flow",
      "npm run verify",
      "claude plugin tag --push",
      version ? `git tag v${version} && git push origin v${version}` : "git tag vX.Y.Z && git push origin vX.Y.Z"
    ]
  };
}
function isPluginSmokeScript(name, command) {
  return /claudecc|claude-code|claude code|plugin[-:]?smoke|plugin validate/i.test(`${name} ${command}`);
}
function detectProjectScripts(cwd) {
  const pkg = readJsonFile3(join9(cwd, "package.json"));
  const packageManager = detectPackageManager3(cwd);
  const scripts = pkg?.scripts ?? {};
  const allDependencies = { ...pkg?.dependencies ?? {}, ...pkg?.devDependencies ?? {} };
  const dependencyNames = Object.keys(allDependencies).filter(
    (name) => /playwright|puppeteer|cypress|selenium|webdriver/i.test(name)
  );
  const entries = Object.entries(scripts);
  const browserEntries = entries.filter(([name, command]) => !isPluginSmokeScript(name, command));
  const e2e = entries.filter(
    ([name, command]) => !isPluginSmokeScript(name, command) && /(^|:|-)(e2e|browser|ui|acceptance)(:|-|$)|playwright|cypress|puppeteer|selenium/i.test(
      `${name} ${command}`
    )
  ).map(([name]) => name);
  const devServer = entries.filter(([name]) => /^(dev|start|serve|preview)$|(^|:|-)(dev|serve|preview)(:|-|$)/i.test(name)).map(([name]) => name);
  const playwrightScripts = browserEntries.filter(([name, command]) => /playwright/i.test(`${name} ${command}`)).map(([name]) => name);
  const pluginSmokeScripts = entries.filter(([name, command]) => isPluginSmokeScript(name, command)).map(([name]) => name);
  return {
    packageJson: pkg !== null,
    packageManager,
    e2e,
    devServer,
    playwrightScripts,
    pluginSmokeScripts,
    dependencies: dependencyNames
  };
}
function detectConfigFiles(cwd, filenames) {
  return filenames.filter((name) => existsSync10(join9(cwd, name)));
}
function detectChrome() {
  const envPath = process.env.CHROME_PATH;
  if (envPath && existsSync10(envPath)) {
    return { installed: true, path: envPath, source: "CHROME_PATH" };
  }
  if (process.platform === "darwin") {
    const path3 = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    return existsSync10(path3) ? { installed: true, path: path3, source: "macos-default" } : { installed: false, path: null, source: null };
  }
  if (process.platform === "win32") {
    const suffixes = [
      join9("Google", "Chrome SxS", "Application", "chrome.exe"),
      join9("Google", "Chrome", "Application", "chrome.exe")
    ];
    const prefixes = [
      process.env.LOCALAPPDATA,
      process.env.PROGRAMFILES,
      process.env["PROGRAMFILES(X86)"]
    ].filter((value) => Boolean(value));
    for (const prefix of prefixes) {
      for (const suffix of suffixes) {
        const candidate = join9(prefix, suffix);
        if (existsSync10(candidate)) {
          return { installed: true, path: candidate, source: "windows-default" };
        }
      }
    }
    return { installed: false, path: null, source: null };
  }
  for (const bin of ["google-chrome", "chromium", "chromium-browser"]) {
    const found = spawnSync3("which", [bin], { encoding: "utf8" });
    if (found.status === 0) {
      return { installed: true, path: found.stdout.trim() || bin, source: "PATH" };
    }
  }
  return { installed: false, path: null, source: null };
}
function detectChromeDevtoolsDependency() {
  const manifest = readJsonFile3(join9(pluginRoot(), ".claude-plugin", "plugin.json"));
  const dependency = manifest?.dependencies?.find((item) => item.name === "chrome-devtools-mcp");
  return {
    declared: dependency !== void 0,
    marketplace: dependency?.marketplace ?? null
  };
}
function browserVerificationDoctor(cwd) {
  const scripts = detectProjectScripts(cwd);
  const playwrightConfigFiles = detectConfigFiles(cwd, [
    "playwright.config.ts",
    "playwright.config.js",
    "playwright.config.mjs",
    "playwright.config.cjs",
    "playwright.config.mts",
    "playwright.config.cts"
  ]);
  const e2eConfigFiles = detectConfigFiles(cwd, [
    ...playwrightConfigFiles,
    "cypress.config.ts",
    "cypress.config.js",
    "cypress.json",
    ".cypressrc",
    "wdio.conf.ts",
    "wdio.conf.js"
  ]);
  const hasPlaywrightDependency = scripts.dependencies.some((name) => /(^@playwright\/test$|^playwright$|playwright-core)/i.test(name));
  const playwrightScriptCandidates = [.../* @__PURE__ */ new Set([...scripts.playwrightScripts, ...scripts.e2e])];
  const recommendedPlaywrightCommand = playwrightScriptCandidates[0] !== void 0 ? scriptCommand2(scripts.packageManager, playwrightScriptCandidates[0]) : hasPlaywrightDependency || playwrightConfigFiles.length > 0 ? "npx playwright test" : null;
  const chrome = detectChrome();
  const chromeDevtools = detectChromeDevtoolsDependency();
  return {
    policy: "Playwright CLI by default; Chrome DevTools MCP for GIS/WebGL/canvas/map/GPU, console/network/performance, or flaky Playwright.",
    project: {
      packageJson: scripts.packageJson,
      packageManager: scripts.packageManager,
      devServerScripts: scripts.devServer,
      e2eScripts: scripts.e2e,
      pluginSmokeScripts: scripts.pluginSmokeScripts,
      browserAutomationDependencies: scripts.dependencies,
      e2eConfigFiles
    },
    playwright: {
      ready: recommendedPlaywrightCommand !== null || scripts.e2e.length > 0 || playwrightConfigFiles.length > 0,
      dependency: hasPlaywrightDependency,
      configFiles: playwrightConfigFiles,
      scripts: playwrightScriptCandidates,
      recommendedCommand: recommendedPlaywrightCommand
    },
    chromeDevtoolsMcp: {
      ready: chromeDevtools.declared && chrome.installed,
      dependencyDeclared: chromeDevtools.declared,
      marketplace: chromeDevtools.marketplace,
      chromeInstalled: chrome.installed,
      chromePath: chrome.path,
      chromeSource: chrome.source
    },
    highFidelityUseCases: [
      "GIS/map tiles",
      "WebGL/canvas/GPU rendering",
      "console/network/performance diagnosis",
      "Playwright flaky or insufficient evidence"
    ]
  };
}
function remoteTagExists(output, tag) {
  const ref = `refs/tags/${tag}`;
  return output.split(/\r?\n/).some((line) => line.includes(ref));
}
function releaseTagParityDoctor(version) {
  const repoRoot = repoRootFromPlugin();
  const npmTag = `v${version}`;
  const pluginTag = `curdx-flow--v${version}`;
  const command = `git -C ${shellToken(repoRoot)} ls-remote --tags origin ${shellToken(npmTag)} ${shellToken(pluginTag)}`;
  const envOutput = process.env.CURDX_FLOW_GIT_LS_REMOTE_OUTPUT;
  const envExitCode = process.env.CURDX_FLOW_GIT_LS_REMOTE_EXIT_CODE;
  let output = "";
  let exitCode = null;
  let error = null;
  let checked = true;
  let source = "git ls-remote";
  if (envOutput !== void 0) {
    output = envOutput;
    exitCode = envExitCode === void 0 ? 0 : Number(envExitCode);
    source = "CURDX_FLOW_GIT_LS_REMOTE_OUTPUT";
  } else if (!existsSync10(join9(repoRoot, ".git"))) {
    checked = false;
    source = "not-git-worktree";
  } else {
    const result = spawnSync3("git", [
      "-C",
      repoRoot,
      "ls-remote",
      "--tags",
      "origin",
      npmTag,
      pluginTag
    ], {
      encoding: "utf8",
      timeout: 5e3,
      maxBuffer: 1024 * 1024
    });
    output = `${result.stdout ?? ""}
${result.stderr ?? ""}`;
    exitCode = result.status ?? null;
    if (result.error) error = result.error.message;
  }
  if (!checked || exitCode !== 0) {
    return {
      ready: null,
      checked,
      source,
      command,
      exitCode,
      error,
      state: "unknown",
      npmTag: { name: npmTag, exists: null },
      pluginTag: { name: pluginTag, exists: null },
      action: "Run this check from a git checkout with access to origin before publishing."
    };
  }
  const npmTagExists = remoteTagExists(output, npmTag);
  const pluginTagExists = remoteTagExists(output, pluginTag);
  const state2 = npmTagExists && pluginTagExists ? "complete" : !npmTagExists && !pluginTagExists ? "not-published" : "incomplete";
  return {
    ready: state2 !== "incomplete",
    checked: true,
    source,
    command,
    exitCode,
    error,
    state: state2,
    npmTag: { name: npmTag, exists: npmTagExists },
    pluginTag: { name: pluginTag, exists: pluginTagExists },
    action: state2 === "incomplete" ? "Restore tag parity: run `claude plugin tag --push` for the plugin tag before relying on the npm release tag." : null
  };
}
function collectCommandHooks(config) {
  const root = pluginRoot();
  const prefix = "${CLAUDE_PLUGIN_ROOT}/";
  const out = [];
  for (const [event, matchers] of Object.entries(config?.hooks ?? {})) {
    if (!Array.isArray(matchers)) continue;
    for (const matcher of matchers) {
      if (!Array.isArray(matcher.hooks)) continue;
      for (const hook of matcher.hooks) {
        if (hook.type !== "command") continue;
        const command = typeof hook.command === "string" ? hook.command : null;
        const args = Array.isArray(hook.args) ? hook.args.filter((arg) => typeof arg === "string") : [];
        const scriptArg = args[0] ?? null;
        const scriptPath = scriptArg?.startsWith(prefix) === true ? join9(root, scriptArg.slice(prefix.length)) : null;
        out.push({
          event,
          command,
          args,
          shell: typeof hook.shell === "string" ? hook.shell : null,
          execForm: command === "node" && scriptArg !== null && scriptArg.startsWith(prefix),
          scriptArg,
          scriptPath,
          scriptExists: scriptPath === null ? null : existsSync10(scriptPath)
        });
      }
    }
  }
  return out;
}
function pluginHealthDoctor() {
  const root = pluginRoot();
  const manifestPath = join9(root, ".claude-plugin", "plugin.json");
  const hooksPath = join9(root, "hooks", "hooks.json");
  const binPath = join9(root, "bin", "curdx-flow");
  const manifest = readJsonFile3(manifestPath);
  const hooksConfig = readJsonFile3(hooksPath);
  const commandHooks = collectCommandHooks(hooksConfig);
  const shellFormHooks = commandHooks.filter((hook) => !hook.execForm || hook.shell !== null);
  const missingScripts = commandHooks.filter((hook) => hook.scriptExists === false);
  const validHooksObject = hooksConfig !== null && typeof hooksConfig.hooks === "object" && hooksConfig.hooks !== null;
  const ready = existsSync10(root) && manifest !== null && manifest.name === "curdx-flow" && existsSync10(binPath) && validHooksObject && commandHooks.length > 0 && shellFormHooks.length === 0 && missingScripts.length === 0;
  return {
    ready,
    root,
    dataDir: process.env.CLAUDE_PLUGIN_DATA ?? null,
    manifest: {
      path: manifestPath,
      exists: existsSync10(manifestPath),
      valid: manifest !== null,
      name: manifest?.name ?? null,
      version: manifest?.version ?? null
    },
    dependencies: pluginDependencyDoctor(),
    hooks: {
      path: hooksPath,
      exists: existsSync10(hooksPath),
      valid: validHooksObject,
      commandHookCount: commandHooks.length,
      execForm: shellFormHooks.length === 0,
      shellFormHooks: shellFormHooks.map((hook) => ({
        event: hook.event,
        command: hook.command,
        args: hook.args,
        shell: hook.shell
      })),
      missingScripts: missingScripts.map((hook) => ({
        event: hook.event,
        scriptArg: hook.scriptArg,
        scriptPath: hook.scriptPath
      }))
    },
    bin: {
      curdxFlow: existsSync10(binPath),
      path: binPath
    }
  };
}
function hookFreshnessDoctor() {
  const sourceRoot = join9(repoRootFromPlugin(), "src", "hooks");
  const bundleRoot = join9(pluginRoot(), "hooks", "scripts");
  const pairs = [
    ["user-prompt-expansion-guard.ts", "user-prompt-expansion-guard.mjs"],
    ["user-prompt-submit-autopilot.ts", "user-prompt-submit-autopilot.mjs"],
    ["post-tool-batch-snapshot.ts", "post-tool-batch-snapshot.mjs"],
    ["post-compact-recorder.ts", "post-compact-recorder.mjs"],
    ["task-completed-verifier.ts", "task-completed-verifier.mjs"],
    [join9("lib", "smart-route.ts"), join9("lib", "smart-route.mjs")],
    [join9("lib", "tool-capabilities.ts"), join9("lib", "tool-capabilities.mjs")],
    [join9("lib", "stack-capabilities.ts"), join9("lib", "stack-capabilities.mjs")],
    [join9("lib", "dev-runtime.ts"), join9("lib", "dev-runtime.mjs")],
    [join9("lib", "last-mile-orchestrator.ts"), join9("lib", "last-mile-orchestrator.mjs")],
    [join9("lib", "runtime-cli.ts"), join9("lib", "runtime-cli.mjs")]
  ];
  const entries = pairs.map(([srcRel, bundleRel]) => {
    const sourcePath = join9(sourceRoot, srcRel);
    const bundlePath = join9(bundleRoot, bundleRel);
    const sourceExists = existsSync10(sourcePath);
    const bundleExists = existsSync10(bundlePath);
    const sourceMtime = sourceExists ? statSync6(sourcePath).mtimeMs : null;
    const bundleMtime = bundleExists ? statSync6(bundlePath).mtimeMs : null;
    return {
      source: srcRel,
      bundle: bundleRel,
      sourceExists,
      bundleExists,
      fresh: sourceMtime === null || bundleMtime === null ? false : bundleMtime >= sourceMtime
    };
  });
  const sourceAvailable = existsSync10(sourceRoot);
  return {
    sourceAvailable,
    bundleRoot,
    fresh: entries.every((entry) => entry.fresh),
    stale: entries.filter((entry) => !entry.fresh),
    entries,
    checkCommand: "npm run check:hooks-fresh"
  };
}
function resolveSpecPathForOutput(cwd, path3) {
  const fsPath = isAbsolute6(path3) ? path3 : join9(cwd, path3);
  return { path: path3, fsPath };
}
function specs(argv) {
  const [sub, ...rest] = argv;
  const cwd = resolve5(readArg9("--cwd", rest) ?? process.cwd());
  if (sub === "dirs") {
    printJson({
      defaultDir: getDefaultDir({ cwd }),
      dirs: getSpecsDirs({ cwd })
    });
    return;
  }
  if (sub === "list") {
    printJson({
      defaultDir: getDefaultDir({ cwd }),
      active: resolveCurrent({ cwd, sessionId: readArg9("--session-id", rest) }),
      specs: listSpecs({ cwd })
    });
    return;
  }
  if (sub === "find") {
    const name = firstPositional(rest);
    if (!name) usage();
    const result = findSpec(name, { cwd });
    printJson(result);
    if (result.ok) return;
    process.exit(result.reason === "ambiguous" ? 2 : 1);
  }
  if (sub === "resolve") {
    const input = firstPositional(rest);
    const target = input ?? resolveCurrent({ cwd, sessionId: readArg9("--session-id", rest) }) ?? void 0;
    if (!target) {
      printJson({ ok: false, reason: "no-current" });
      process.exit(1);
    }
    if (target.startsWith("./") || target.startsWith("../") || target.includes("/") || isAbsolute6(target)) {
      const resolved2 = resolveSpecPathForOutput(cwd, target);
      if (!isDirectory(resolved2.fsPath)) {
        printJson({ ok: false, reason: "not-found", path: target });
        process.exit(1);
      }
      printJson({ ok: true, name: basename11(target), ...resolved2 });
      return;
    }
    const found = findSpec(target, { cwd });
    if (!found.ok) {
      printJson(found);
      process.exit(found.reason === "ambiguous" ? 2 : 1);
    }
    const resolved = resolveSpecPathForOutput(cwd, found.path);
    printJson({ ok: true, name: basename11(found.path), ...resolved });
    return;
  }
  if (sub === "bind-session") {
    const sessionId = readArg9("--session-id", rest);
    const input = firstPositional(rest);
    if (!sessionId || !input) usage();
    let specPath = input;
    if (!(input.startsWith("./") || input.startsWith("../") || input.includes("/") || isAbsolute6(input))) {
      const found = findSpec(input, { cwd });
      if (!found.ok) {
        printJson(found);
        process.exit(found.reason === "ambiguous" ? 2 : 1);
      }
      specPath = found.path;
    }
    const result = bindSessionSpec(specPath, {
      cwd,
      sessionId,
      source: "runtime-cli"
    });
    printJson(result);
    if (!result.ok) process.exit(1);
    return;
  }
  usage();
}
function state(argv) {
  const sub = argv[0];
  if (sub !== "merge") usage();
  const stateFile = argv[1];
  const patch = argv[2];
  if (!stateFile || !patch) usage();
  return runBundled("merge-state", [stateFile, patch]);
}
function tasks(argv) {
  const sub = argv[0];
  if (sub !== "count") usage();
  const tasksFile = argv[1];
  if (!tasksFile) usage();
  return runBundled("count-tasks", [tasksFile]);
}
function dev(argv) {
  const [sub, ...rest] = argv;
  const cwd = readArg9("--cwd", rest);
  switch (sub) {
    case "detect":
      printJson(detectDevRuntime({ cwd }));
      return;
    case "up":
      printJson(startDevRuntime({ cwd }));
      return;
    case "health":
      printJson(healthDevRuntime({ cwd, dryRun: hasFlag2(rest, "--dry-run") }));
      return;
    case "verify": {
      const result = verifyDevRuntime({
        cwd,
        dryRun: hasFlag2(rest, "--dry-run"),
        includeE2e: hasFlag2(rest, "--include-e2e")
      });
      printJson(result);
      if (result.ok === false && !hasFlag2(rest, "--dry-run")) process.exit(1);
      return;
    }
    case "down":
      printJson(stopDevRuntime({ cwd }));
      return;
    default:
      usage();
  }
}
async function verify(argv) {
  const [sub, ...rest] = argv;
  if (sub !== "run") usage();
  const command = readArg9("--command", rest);
  if (!command) usage();
  const cwd = resolve5(readArg9("--cwd", rest) ?? process.cwd());
  const phase = readArg9("--phase", rest) ?? "execution";
  if (!["research", "requirements", "design", "tasks", "execution"].includes(phase)) {
    process.stderr.write(`verify run: unsupported phase: ${phase}
`);
    process.exit(2);
  }
  const snap = buildWorkflowSnapshot({
    cwd,
    spec: readArg9("--spec", rest),
    sessionId: readArg9("--session-id", rest)
  });
  if (!snap.spec?.fsPath || !snap.spec.statePath) {
    process.stderr.write("verify run: no active spec\n");
    process.exit(2);
  }
  const result = spawnSync3(command, {
    cwd,
    shell: true,
    stdio: "inherit",
    env: process.env
  });
  const exitCode = result.status ?? 1;
  if (result.error) {
    process.stderr.write(`verify run: ${result.error.message}
`);
  }
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const srcMtime = await walkSrcTree(snap.spec.fsPath);
  const block = {
    command,
    exitCode,
    timestamp,
    srcMtime,
    description: readArg9("--description", rest) ?? `Verification for ${phase}`
  };
  if (phase === "execution") {
    const stateTaskIndex = snap.state?.taskIndex;
    if (typeof stateTaskIndex === "number" && Number.isInteger(stateTaskIndex) && stateTaskIndex >= 0) {
      block.taskIndex = stateTaskIndex;
    }
  }
  if (exitCode !== 0) {
    block.failedReason = result.error ? result.error.message : `command exited ${exitCode}`;
  }
  const patch = JSON.stringify({
    verificationBlocks: {
      [phase]: block
    }
  });
  const merge = spawnSync3(process.execPath, [join9(scriptRoot(), "merge-state.mjs"), snap.spec.statePath, patch], {
    cwd,
    encoding: "utf8",
    stdio: ["inherit", "ignore", "pipe"]
  });
  if (merge.stderr) process.stderr.write(merge.stderr);
  if (merge.error) {
    process.stderr.write(`verify run: failed to record verification: ${merge.error.message}
`);
    process.exit(1);
  }
  if (merge.status !== 0) {
    process.exit(merge.status ?? 1);
  }
  appendBrainEvent(cwd, {
    type: "verification-run",
    phase,
    command,
    exitCode,
    reason: exitCode === 0 ? "verification passed" : `command exited ${exitCode}`
  });
  process.exit(exitCode);
}
async function verifyBlocks(argv) {
  const cwd = readArg9("--cwd", argv);
  const snap = buildWorkflowSnapshot({
    cwd,
    spec: readArg9("--spec", argv),
    sessionId: readArg9("--session-id", argv)
  });
  if (!snap.spec?.fsPath) {
    process.stderr.write("verify-blocks: no active spec\n");
    process.exit(2);
  }
  const result = await runVerificationCheck({ repoRoot: cwd ?? process.cwd() });
  if (result.ok) process.stdout.write(result.message);
  else process.stderr.write(result.message);
  process.exit(result.code);
}
function doctor(argv) {
  const cwd = resolve5(readArg9("--cwd", argv) ?? process.cwd());
  const mode = hasFlag2(argv, "--deep") ? "deep" : "fast";
  const human = hasFlag2(argv, "--human") || readArg9("--format", argv) === "human";
  const snap = buildWorkflowSnapshot({
    cwd,
    spec: readArg9("--spec", argv),
    sessionId: readArg9("--session-id", argv)
  });
  const goal2 = readArg9("--goal", argv) ?? "";
  const routeFacts = classifySmartRoute({ cwd, goal: goal2 });
  const topology = discoverProjectTopology({ cwd, goal: goal2 });
  const stackProfile = detectStackProfile({ cwd, goal: goal2, topology, route: routeFacts.route, risk: routeFacts.policy.risk });
  const qualityGates = selectQualityGates({ cwd, goal: goal2, topology, route: routeFacts.route, risk: routeFacts.policy.risk, stackProfile });
  const suggestedVerifier = selectSuggestedVerifier({ cwd, goal: goal2, topology, route: routeFacts.route, risk: routeFacts.policy.risk, stackProfile, qualityGates });
  const contextBudget = selectContextBudget({ cwd, goal: goal2, topology, route: routeFacts.route, risk: routeFacts.policy.risk, stackProfile });
  const brain = summarizeProjectBrain(cwd);
  const executionBrief = buildExecutionBrief({ cwd, goal: goal2, routeFacts });
  const lastMileDecision = decideLastMile({ cwd, goal: goal2, routeFacts });
  const expected = [
    join9(scriptRoot(), "workflow-snapshot.mjs"),
    join9(scriptRoot(), "smart-route.mjs"),
    join9(scriptRoot(), "last-mile-orchestrator.mjs"),
    join9(scriptRoot(), "stack-capabilities.mjs"),
    join9(scriptRoot(), "merge-state.mjs"),
    join9(scriptRoot(), "count-tasks.mjs")
  ];
  const runtimeReady = expected.every((p) => existsSync10(p));
  const plugin = pluginHealthDoctor();
  const pluginDependenciesReady = plugin.dependencies?.ready === true;
  const hookFreshness = hookFreshnessDoctor();
  const release = releaseDoctor();
  const externalMcp = externalMcpDoctor();
  const browserVerification = browserVerificationDoctor(cwd);
  const packageManager = detectPackageManager3(cwd);
  const claudeBin = process.env.CURDX_FLOW_CLAUDE_BIN ?? "claude";
  const claudeProbe = probeCommand({
    id: "claude-version",
    command: claudeBin,
    args: ["--version"],
    cwd,
    env: process.env,
    timeoutMs: 1e3
  });
  const nativeGoal = buildNativeGoalReadiness({
    claudeProbe,
    settingsSources: readNativeGoalSettingsSources({ cwd, env: process.env })
  });
  const platformFloor = buildPlatformFloorReadiness(nativeGoal.detectedVersion);
  const capabilityMatrix = buildCapabilityMatrix({
    cwd,
    mode,
    packageManager,
    claudeProbe,
    npmProbe: probeCommand({
      id: "npm-version",
      command: "npm",
      args: ["--version"],
      cwd,
      env: process.env,
      timeoutMs: 1e3
    }),
    plugin,
    externalMcp,
    nativeGoal,
    browserVerification,
    hookFreshness,
    release,
    ...mode === "deep" ? {
      pluginValidationProbe: probeCommand({
        id: "plugin-validation",
        command: claudeBin,
        args: ["plugin", "validate", pluginRoot()],
        cwd,
        env: process.env,
        timeoutMs: 1e4
      })
    } : {}
  });
  if (human) {
    process.stdout.write(renderCapabilityMatrix(capabilityMatrix));
    process.stdout.write(`
Platform floor: ${platformFloor.reason}
`);
    return;
  }
  const warnings = [
    ...externalMcpWarnings(externalMcp),
    ...platformFloor.meetsFloor === false ? [platformFloor.reason] : []
  ];
  const root = pluginRoot();
  printJson({
    ok: runtimeReady && plugin.ready === true && pluginDependenciesReady && nativeGoal.state === "available" && externalMcp.ready === true && release.ready !== false && (hookFreshness.sourceAvailable !== true || hookFreshness.fresh === true),
    warnings,
    diagnostics: {
      externalMcpReady: externalMcp.ready === true,
      pluginDependenciesReady,
      nativeGoalReady: nativeGoal.state === "available",
      goalExecutionDriver: nativeGoal.recommendedDriver,
      hookFreshnessFresh: hookFreshness.sourceAvailable !== true || hookFreshness.fresh === true,
      releaseReady: release.ready !== false,
      platformFloorMet: platformFloor.meetsFloor
    },
    capabilityMatrix,
    nativeGoal,
    platformFloor,
    cwd,
    scripts: Object.fromEntries(expected.map((p) => [basename11(p), existsSync10(p)])),
    runtime: {
      ready: runtimeReady,
      scripts: Object.fromEntries(expected.map((p) => [basename11(p), existsSync10(p)]))
    },
    plugin,
    hookFreshness,
    release,
    docsSensitiveWarnings: [
      "Claude Code plugin, skill, agent, hook, dependency, marketplace, and tag behavior must be verified against https://code.claude.com/docs/llms.txt before release-facing changes.",
      "context7 and sequential-thinking are expected external MCP servers in this environment; curdx-flow should diagnose them but not bundle duplicate MCP config."
    ],
    route: routeFacts.route,
    stackProfile,
    qualityGates,
    suggestedVerifier,
    contextBudget,
    brain,
    executionBrief,
    lastMile: lastMileDecision,
    externalMcp,
    browserVerification,
    active: snap.active,
    spec: snap.spec,
    gates: snap.gates,
    nextAction: snap.nextAction,
    recommendations: [
      { id: "workflow", action: snap.nextAction },
      { id: "plugin-validate", command: `claude plugin validate ${root}` },
      {
        id: "plugin-smoke",
        command: "CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc"
      }
    ]
  });
}
async function main9() {
  const [command, ...argv] = process.argv.slice(2);
  switch (command) {
    case "route":
      route(argv);
      return;
    case "goal":
      goal(argv);
      return;
    case "last-mile":
      lastMile(argv);
      return;
    case "snapshot":
      snapshot(argv);
      return;
    case "specs":
      specs(argv);
      return;
    case "state":
      state(argv);
      return;
    case "tasks":
      tasks(argv);
      return;
    case "dev":
      dev(argv);
      return;
    case "verify":
      await verify(argv);
      return;
    case "verify-blocks":
      await verifyBlocks(argv);
      return;
    case "doctor":
      doctor(argv);
      return;
    case "-h":
    case "--help":
    case void 0:
      usage(command ? 0 : 1);
  }
  process.stderr.write(`curdx-flow: unknown command: ${command}
`);
  usage();
}
function isDirectRun9() {
  try {
    const entry = fileURLToPath8(import.meta.url);
    return process.argv[1] === entry && basename11(entry).startsWith("runtime-cli.");
  } catch {
    return false;
  }
}
if (isDirectRun9()) {
  void main9();
}
//# sourceMappingURL=runtime-cli.mjs.map
