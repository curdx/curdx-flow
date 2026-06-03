import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/core/capabilities/tokens.ts
var KNOWN_CAPABILITY_TOKEN_PATTERN = String.raw`\b(?:claude-mem|context7|sequential-thinking|chrome-devtools-mcp|chrome devtools mcp|ui[\s_-]*ux[\s_-]*(?:pro[\s_-]*)?max|pua)\b`;
function knownCapabilityTokenRegex() {
  return new RegExp(KNOWN_CAPABILITY_TOKEN_PATTERN, "gi");
}

// src/hooks/lib/capability-normalization.ts
function stripKnownCapabilityTokens(input) {
  return (input ?? "").replace(knownCapabilityTokenRegex(), " ");
}
export {
  stripKnownCapabilityTokens
};
//# sourceMappingURL=capability-normalization.mjs.map
