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
  if (typeof event.files === "number" && Number.isFinite(event.files)) {
    out.files = Math.max(0, Math.floor(event.files));
  }
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
  return new Promise((resolve2, reject) => {
    const chunks = [];
    process2.stdin.on("data", (chunk) => chunks.push(chunk));
    process2.stdin.on(
      "end",
      () => resolve2(Buffer.concat(chunks).toString("utf8"))
    );
    process2.stdin.on("error", reject);
  });
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
  const matcher = typeof payload === "object" && payload !== null && "matcher" in payload && typeof payload.matcher === "string" ? payload.matcher : "unknown";
  const cwd = typeof payload === "object" && payload !== null && "cwd" in payload && typeof payload.cwd === "string" ? payload.cwd : void 0;
  const description = MATCHER_DESCRIPTIONS[matcher] ?? `unrecognised matcher (echoed verbatim from stdin)`;
  if (cwd !== void 0) {
    appendBrainEvent(cwd, {
      type: "last-mile-decision",
      phase: "recovering",
      reason: `StopFailure ${matcher}: ${description}`
    });
  }
  process2.stderr.write(`[StopFailure:${matcher}] ${description}
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
