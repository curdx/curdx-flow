import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/lib/capability-normalization.ts
var KNOWN_CAPABILITY_TOKEN_RE = /\b(?:claude-mem|context7|sequential-thinking|chrome-devtools-mcp|chrome devtools mcp|frontend[\s_-]*design|front[\s_-]*end[\s_-]*design|ui[\s_-]*ux[\s_-]*(?:pro[\s_-]*)?max|pua)\b/gi;
function stripKnownCapabilityTokens(input) {
  return (input ?? "").replace(KNOWN_CAPABILITY_TOKEN_RE, " ");
}
export {
  stripKnownCapabilityTokens
};
//# sourceMappingURL=capability-normalization.mjs.map
