import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/stop-failure-handler.ts
import process from "node:process";
var MATCHER_DESCRIPTIONS = {
  rate_limit: "Anthropic API 429 \u2014 request throttled",
  authentication_failed: "Anthropic API 401 \u2014 credentials rejected",
  oauth_org_not_allowed: "Org-level OAuth deny \u2014 workspace not permitted",
  billing_error: "Account billing fault \u2014 payment / quota issue",
  invalid_request: "Malformed request from Claude \u2014 client-side bug",
  server_error: "Anthropic 5xx \u2014 upstream server error",
  max_output_tokens: "Hit response token limit \u2014 output truncated",
  unknown: "Catch-all \u2014 Claude Code did not classify the failure"
};
function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on(
      "end",
      () => resolve(Buffer.concat(chunks).toString("utf8"))
    );
    process.stdin.on("error", reject);
  });
}
async function main() {
  let raw = "";
  try {
    raw = await readStdin();
  } catch {
    process.stderr.write("stop-failure-handler: stdin read failed\n");
    process.exit(0);
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    process.exit(0);
  }
  let payload;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    process.stderr.write("stop-failure-handler: malformed stdin\n");
    process.exit(0);
  }
  const matcher = typeof payload === "object" && payload !== null && "matcher" in payload && typeof payload.matcher === "string" ? payload.matcher : "unknown";
  const description = MATCHER_DESCRIPTIONS[matcher] ?? `unrecognised matcher (echoed verbatim from stdin)`;
  process.stderr.write(`[StopFailure:${matcher}] ${description}
`);
  process.exit(0);
}
main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`stop-failure-handler: ${msg}
`);
  process.exit(0);
});
//# sourceMappingURL=stop-failure-handler.mjs.map
