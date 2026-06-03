import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/stop-failure-handler.ts
import process2 from "node:process";

// src/hooks/lib/project-brain.ts
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
var MAX_REASON = 240;
var MAX_COMMAND = 180;
var MAX_SUMMARY = 900;
var MAX_PATH = 400;
var MAX_AGENT_FIELD = 120;
var MAX_BRAIN_BYTES = 64 * 1024;
var MAX_BRAIN_LINES = 400;
function normalizeCwd(cwd) {
  return resolve(cwd ?? process.cwd());
}
function brainPath(cwd) {
  return join(normalizeCwd(cwd), ".curdx", "brain.jsonl");
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
  const path = brainPath(cwd);
  if (process.env.CURDX_FLOW_BRAIN === "off") return { ok: true, path };
  try {
    mkdirSync(join(normalizeCwd(cwd), ".curdx"), { recursive: true });
    appendFileSync(path, JSON.stringify(normalizeEvent(event)) + "\n", "utf8");
    compactBrainIfNeeded(path);
    return { ok: true, path };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, path, error: message };
  }
}
function compactBrainIfNeeded(path) {
  try {
    if (statSync(path).size <= MAX_BRAIN_BYTES) return;
    const lines = readFileSync(path, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-MAX_BRAIN_LINES);
    writeFileSync(path, lines.join("\n") + (lines.length > 0 ? "\n" : ""), "utf8");
  } catch {
  }
}

// src/hooks/stop-failure-handler.ts
var ERROR_TYPE_DESCRIPTIONS = {
  rate_limit: "Anthropic API 429 \u2014 request throttled",
  authentication_failed: "Anthropic API 401 \u2014 credentials rejected",
  oauth_org_not_allowed: "Org-level OAuth deny \u2014 workspace not permitted",
  billing_error: "Account billing fault \u2014 payment / quota issue",
  invalid_request: "Malformed request from Claude \u2014 client-side bug",
  model_not_found: "Requested model unavailable",
  server_error: "Anthropic 5xx \u2014 upstream server error",
  max_output_tokens: "Hit response token limit \u2014 output truncated",
  unknown: "Catch-all \u2014 Claude Code did not classify the failure"
};
function readStdin() {
  return new Promise((resolve2, reject) => {
    const chunks = [];
    process2.stdin.on("data", (chunk) => chunks.push(chunk));
    process2.stdin.on("end", () => resolve2(Buffer.concat(chunks).toString("utf8")));
    process2.stdin.on("error", reject);
  });
}
function readString(obj, key) {
  const value = obj[key];
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function extractErrorType(obj) {
  for (const key of ["error_type", "errorType", "matcher"]) {
    const value = readString(obj, key);
    if (value) return value;
  }
  for (const value of Object.values(obj)) {
    if (typeof value === "string" && value in ERROR_TYPE_DESCRIPTIONS && value !== "unknown") {
      return value;
    }
  }
  return "unknown";
}
async function main() {
  let raw = "";
  try {
    raw = await readStdin();
  } catch {
    process2.stderr.write("stop-failure-handler: stdin read failed\n");
    process2.exit(0);
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    process2.exit(0);
  }
  let payload;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    process2.stderr.write("stop-failure-handler: malformed stdin\n");
    process2.exit(0);
  }
  if (typeof payload !== "object" || payload === null) {
    process2.exit(0);
  }
  const obj = payload;
  const errorType = extractErrorType(obj);
  const cwd = readString(obj, "cwd");
  const description = ERROR_TYPE_DESCRIPTIONS[errorType] ?? "unrecognised error_type (echoed verbatim from stdin)";
  if (cwd !== void 0) {
    appendBrainEvent(cwd, {
      type: "last-mile-decision",
      phase: "recovering",
      reason: `StopFailure ${errorType}: ${description}`
    });
  }
  process2.stderr.write(`[StopFailure:${errorType}] ${description}
`);
  process2.exit(0);
}
main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process2.stderr.write(`stop-failure-handler: ${msg}
`);
  process2.exit(0);
});
//# sourceMappingURL=stop-failure-handler.mjs.map
