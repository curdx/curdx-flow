export interface CurdxPluginDependencySpec {
  id: "pua" | "claude-mem" | "chrome-devtools-mcp" | "ui-ux-pro-max";
  name: string;
  marketplace: string;
  marketplaceSource: string;
  pluginId: string;
  description: string;
  whenToUse: string;
  slashNamespace?: string;
  required: true;
}

export interface CurdxExternalMcpSpec {
  id: "context7" | "sequential-thinking";
  match: RegExp;
  installHint: string;
}

export const CURDX_PLUGIN_DEPENDENCIES = [
  {
    id: "pua",
    name: "pua",
    marketplace: "pua-skills",
    marketplaceSource: "tanweai/pua",
    pluginId: "pua@pua-skills",
    description: "tanweai/pua - Chinese Claude Code skills bundle",
    whenToUse:
      "auto-fires on 2+ failures or user frustration; sub-modes p7 / p9 / pro / loop. Skip on first-attempt failures or when a known fix is executing.",
    slashNamespace: "/pua:*",
    required: true,
  },
  {
    id: "claude-mem",
    name: "claude-mem",
    marketplace: "thedotmack",
    marketplaceSource: "thedotmack/claude-mem",
    pluginId: "claude-mem@thedotmack",
    description: "thedotmack/claude-mem - persistent cross-session memory for Claude Code",
    whenToUse:
      'for cross-session memory search ("did we solve this before?"), phased planning (`make-plan`), or phased execution (`do`).',
    slashNamespace: "/claude-mem:*",
    required: true,
  },
  {
    id: "chrome-devtools-mcp",
    name: "chrome-devtools-mcp",
    marketplace: "chrome-devtools-plugins",
    marketplaceSource: "ChromeDevTools/chrome-devtools-mcp",
    pluginId: "chrome-devtools-mcp@chrome-devtools-plugins",
    description: "ChromeDevTools/chrome-devtools-mcp - drive a real Chrome from Claude Code",
    whenToUse:
      "when debugging code that runs in a browser: perf traces, network / console inspection, DOM / CSS issues. Prefer snapshot over screenshot.",
    required: true,
  },
  {
    id: "ui-ux-pro-max",
    name: "ui-ux-pro-max",
    marketplace: "ui-ux-pro-max-skill",
    marketplaceSource: "nextlevelbuilder/ui-ux-pro-max-skill",
    pluginId: "ui-ux-pro-max@ui-ux-pro-max-skill",
    description: "nextlevelbuilder/ui-ux-pro-max-skill - UI/UX design intelligence",
    whenToUse:
      "auto-fires when building UI / UX / web components / pages. Best where visual quality, accessibility, responsive behavior, or design systems matter.",
    required: true,
  },
] as const satisfies readonly CurdxPluginDependencySpec[];

export const CURDX_EXTERNAL_MCPS = [
  {
    id: "context7",
    match: /context7|mcp\.context7\.com/i,
    installHint: "Installed externally by setup script; expected to appear in `claude mcp list`.",
  },
  {
    id: "sequential-thinking",
    match: /sequential[- ]thinking|server-sequential-thinking/i,
    installHint: "Installed externally by setup script; expected to appear in `claude mcp list`.",
  },
] as const satisfies readonly CurdxExternalMcpSpec[];

export type CurdxPluginDependencyId = (typeof CURDX_PLUGIN_DEPENDENCIES)[number]["id"];
export type CurdxExternalMcpId = (typeof CURDX_EXTERNAL_MCPS)[number]["id"];

export const CURDX_PACKAGE_ALIASES: Record<string, CurdxPluginDependencyId> = {
  uiuxmax: "ui-ux-pro-max",
  "ui-ux-max": "ui-ux-pro-max",
  "ui ux pro max": "ui-ux-pro-max",
};

export function canonicalPkgId(id: string): string {
  const normalized = id.trim().toLowerCase().replace(/_/g, "-");
  return CURDX_PACKAGE_ALIASES[normalized] ?? normalized;
}

export function pluginDependencySpec(id: CurdxPluginDependencyId): CurdxPluginDependencySpec {
  const spec = CURDX_PLUGIN_DEPENDENCIES.find((item) => item.id === id);
  if (!spec) throw new Error(`unknown curdx plugin dependency: ${id}`);
  return spec;
}

// A plugin the @curdx/flow bootstrap can install via the native plugin-CLI: the
// curdx-flow product itself plus the four soft-detected companions. Same shape as
// CurdxPluginDependencySpec but with a plain string id so the self entry fits.
export interface PluginCompanion {
  id: string;
  name: string;
  marketplace: string;
  marketplaceSource: string;
  pluginId: string;
  description: string;
  whenToUse: string;
  slashNamespace?: string;
  required: boolean;
}

export const CURDX_FLOW_SELF_SPEC: PluginCompanion = {
  id: "curdx-flow",
  name: "curdx-flow",
  marketplace: "curdx",
  marketplaceSource: "curdx/curdx-flow",
  pluginId: "curdx-flow@curdx",
  description: "curdx-flow — spec-driven dev with autonomous task execution",
  whenToUse:
    "for spec-driven multi-task work — research → requirements → design → tasks → autonomous execution per task. Use when starting a feature that benefits from upfront spec; skip for one-shot fixes or simple edits.",
  slashNamespace: "/curdx-flow:*",
  required: true,
};

// The one model the native-first bootstrap, status, and CLAUDE.md sync all consume:
// installable plugins (curdx-flow + companions) and detect-only external MCPs.
export function companionPlugins(): PluginCompanion[] {
  return [CURDX_FLOW_SELF_SPEC, ...CURDX_PLUGIN_DEPENDENCIES];
}

export function externalMcps(): readonly CurdxExternalMcpSpec[] {
  return CURDX_EXTERNAL_MCPS;
}

export const CURDX_TOOL_CAPABILITIES = {
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
    missingAction: "Install/enable ui-ux-pro-max from the ui-ux-pro-max-skill marketplace dependency.",
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
} as const;

export type CurdxToolCapabilityId = keyof typeof CURDX_TOOL_CAPABILITIES;

export const CURDX_TOOL_CAPABILITY_ORDER = [
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
  "pua",
] as const satisfies readonly CurdxToolCapabilityId[];
