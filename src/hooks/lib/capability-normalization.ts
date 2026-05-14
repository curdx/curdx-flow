// Known companion capability names are routing inputs, not product stack facts.
// Strip them before running goal regexes that infer frontend/browser/runtime
// intent, otherwise names such as "frontend-design", "ui-ux-pro-max", or
// "uiuxmax" look like UI work.

const KNOWN_CAPABILITY_TOKEN_RE =
  /\b(?:claude-mem|context7|sequential-thinking|chrome-devtools-mcp|chrome devtools mcp|frontend[\s_-]*design|front[\s_-]*end[\s_-]*design|ui[\s_-]*ux[\s_-]*(?:pro[\s_-]*)?max|pua)\b/gi;

export function stripKnownCapabilityTokens(input: string | undefined): string {
  return (input ?? "").replace(KNOWN_CAPABILITY_TOKEN_RE, " ");
}
