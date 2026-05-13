// Known companion capability names are routing inputs, not product stack facts.
// Strip them before running goal regexes that infer frontend/browser/runtime
// intent, otherwise names such as "ui-ux-pro-max" look like UI work.

const KNOWN_CAPABILITY_TOKEN_RE =
  /\b(?:claude-mem|context7|sequential-thinking|chrome-devtools-mcp|chrome devtools mcp|ui-ux-pro-max|pua)\b/gi;

export function stripKnownCapabilityTokens(input: string | undefined): string {
  return (input ?? "").replace(KNOWN_CAPABILITY_TOKEN_RE, " ");
}

