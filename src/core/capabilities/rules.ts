const RULES = {
  context7: {
    invocation: "Context7 MCP",
    useWhen: "use the Context7 MCP before implementation when external library, SDK, API, or framework behavior matters.",
    skipWhen: "Skip for pure local logic, typos, and code paths fully understood from this repository.",
  },
  "claude-mem": {
    invocation: "/claude-mem:mem-search",
    useWhen: "Use /claude-mem:mem-search when similar work, prior decisions, or repeated failures may exist; use /claude-mem:make-plan only for genuinely phased work.",
    skipWhen: "Skip when the task is new, obvious, and smaller than a short local edit.",
  },
  "ui-ux-pro-max": {
    invocation: "ui-ux-pro-max plugin skills",
    useWhen: "Use when building or changing visible UI, interaction design, frontend layout, or visual quality.",
    skipWhen: "Skip for backend-only changes, copy-only edits, and internal CLI/library work.",
  },
  "chrome-devtools-mcp": {
    invocation: "Chrome DevTools MCP",
    useWhen: "Use for browser runtime behavior, UI regressions, DOM/CSS issues, network failures, and frontend verification.",
    skipWhen: "Skip for backend-only code with no browser-facing behavior.",
  },
  "sequential-thinking": {
    invocation: "sequential-thinking MCP",
    useWhen: "Use for architecture tradeoffs, migrations, security/data/release risk, or debugging where assumptions may change.",
    skipWhen: "Skip for direct edits, simple lookups, and deterministic fixes.",
  },
  pua: {
    invocation: "/pua:pua-loop or /pua:p9",
    useWhen: "Use after multiple failed attempts or for truly independent parallel work slices.",
    skipWhen: "Skip on first-attempt failures, known fixes, and work that is sequential by dependency.",
  },
} as const;

const RULE_ORDER = [
  "context7",
  "claude-mem",
  "ui-ux-pro-max",
  "chrome-devtools-mcp",
  "sequential-thinking",
  "pua",
] as const;

export function renderCurdxInstalledCapabilityRules(availableCapabilities: Iterable<string>): string[] {
  const available = new Set(availableCapabilities);
  const lines: string[] = [
    "Use installed capabilities by trigger, not by habit. Prefer the first matching rule; skip absent capabilities.",
  ];

  for (const id of RULE_ORDER) {
    if (!available.has(id)) continue;
    const cap = RULES[id];
    lines.push(`- ${cap.invocation}: ${cap.useWhen} ${cap.skipWhen}`);
  }

  return lines;
}

export function renderCurdxCapabilityDecisionTree(availableCapabilities: Iterable<string>): string[] {
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
  if (available.has("ui-ux-pro-max") || available.has("chrome-devtools-mcp")) {
    rules.push("Is visible frontend behavior in scope? -> Use ui-ux-pro-max for UI decisions and Chrome DevTools MCP for runtime proof when installed.");
  }
  if (available.has("sequential-thinking")) {
    rules.push("Is the work high-risk, architectural, or assumption-heavy? -> Use sequential-thinking after reading the relevant code.");
  }
  if (available.has("pua")) {
    rules.push("Are there repeated failed attempts or truly independent parallel slices? -> Use `/pua:pua-loop` for recovery or `/pua:p9` for bounded parallel planning.");
  }
  return rules.map((rule, idx) => `${idx + 1}. ${rule}`);
}
