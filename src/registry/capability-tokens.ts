export const KNOWN_CAPABILITY_TOKEN_PATTERN =
  String.raw`\b(?:claude-mem|context7|sequential-thinking|chrome-devtools-mcp|chrome devtools mcp|ui[\s_-]*ux[\s_-]*(?:pro[\s_-]*)?max|pua)\b`;

export function knownCapabilityTokenRegex(): RegExp {
  return new RegExp(KNOWN_CAPABILITY_TOKEN_PATTERN, "gi");
}
