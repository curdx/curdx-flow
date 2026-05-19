import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

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

// src/hooks/_shared/stdin.ts
import process2 from "node:process";
async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process2.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process2.stderr.write(`[hook] invalid stdin JSON: ${msg}
`);
    throw e;
  }
}

// src/hooks/subagent-stop-recorder.ts
async function main() {
  let input;
  try {
    input = await readStdinJson();
  } catch {
    return;
  }
  const cwd = input.cwd;
  if (!cwd) return;
  appendBrainEvent(cwd, {
    type: "subagent-stopped",
    sessionId: typeof input.session_id === "string" ? input.session_id : void 0,
    agentId: typeof input.agent_id === "string" ? input.agent_id : void 0,
    agentType: typeof input.agent_type === "string" ? input.agent_type : void 0,
    parentAgentId: typeof input.parent_agent_id === "string" ? input.parent_agent_id : void 0,
    transcriptPath: typeof input.transcript_path === "string" ? input.transcript_path : void 0,
    stopReason: typeof input.stop_reason === "string" ? input.stop_reason : void 0
  });
}
void main();
//# sourceMappingURL=subagent-stop-recorder.mjs.map
