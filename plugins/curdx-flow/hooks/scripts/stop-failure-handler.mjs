import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/stop-failure-handler.ts
import process2 from "node:process";

// src/hooks/_shared/correlation.ts
import { basename } from "node:path";
function buildCorrelationId(stdin, state) {
  const transcriptPath = stdin?.transcript_path;
  const sessionId = transcriptPath ? basename(transcriptPath).replace(/\.(jsonl|json)$/, "") : "unknown";
  const taskIdx = state?.taskIndex ?? 0;
  const iter = state?.phase === "execution" ? state?.taskIteration ?? 1 : state?.globalIteration ?? 1;
  return `${sessionId}:${taskIdx}:${iter}`;
}

// src/hooks/_shared/error-logger.ts
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
var SETTINGS_PATH = path.join(homedir(), ".claude", "settings.json");
var ERRORS_DIR = path.join(homedir(), ".claude", "curdx-flow");
var ERRORS_LOG = path.join(ERRORS_DIR, "errors.jsonl");
var MAX_LINE_BYTES = 4096;
var MSG_MAX = 500;
var STACK_MAX = 2e3;
var STR_MAX = 500;
var ROTATE_SIZE_BYTES = 10 * 1024 * 1024;
var ROTATE_AGE_MS = 30 * 24 * 60 * 60 * 1e3;
var ROTATE_THROTTLE_N = 10;
var ROTATE_KEEP = 5;
var RENAME_RETRY_DELAYS_MS = [50, 200, 500];
var cachedEnabled = null;
function readEnabled() {
  if (cachedEnabled !== null) return cachedEnabled;
  try {
    const raw = readFileSync(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.errorLogEnabled === "boolean") {
      cachedEnabled = parsed.errorLogEnabled;
      return cachedEnabled;
    }
    cachedEnabled = true;
    return cachedEnabled;
  } catch {
    process.stderr.write("[error-logger] settings.json missing/corrupt, defaulting errorLogEnabled=true\n");
    cachedEnabled = true;
    return cachedEnabled;
  }
}
function trunc(s, max) {
  if (typeof s !== "string") return void 0;
  return s.length <= max ? s : s.slice(0, max);
}
var KNOWN_KINDS = /* @__PURE__ */ new Set([
  "stop_block_continuation",
  "stop_block_cost_runaway",
  "stop_block_verification_failed",
  "stop_allow_early_exit",
  "task_verify_pass",
  "task_verify_fail",
  "subagent_context_injected",
  "subagent_injection_failed",
  "stop_failure_rate_limit",
  "stop_failure_other",
  "unknown"
]);
function coerceKind(raw) {
  return typeof raw === "string" && KNOWN_KINDS.has(raw) ? raw : "unknown";
}
function shouldRotate(filePath) {
  try {
    const st = statSync(filePath);
    if (st.size > ROTATE_SIZE_BYTES) return true;
    if (Date.now() - st.mtimeMs > ROTATE_AGE_MS) return true;
    return false;
  } catch {
    return false;
  }
}
function safeRename(from, to) {
  try {
    try {
      renameSync(from, to);
      return;
    } catch (e) {
      const code = e.code;
      if (code === "EBUSY" || code === "EPERM") {
        for (const ms of RENAME_RETRY_DELAYS_MS) {
          const end = Date.now() + ms;
          while (Date.now() < end) {
          }
          try {
            renameSync(from, to);
            return;
          } catch {
          }
        }
      }
      try {
        copyFileSync(from, to);
        unlinkSync(from);
      } catch {
      }
    }
  } catch {
  }
}
function pruneRotatedFiles(dir) {
  try {
    const entries = readdirSync(dir);
    const rotated = [];
    for (const name of entries) {
      if (!name.startsWith("errors.") || !name.endsWith(".jsonl")) continue;
      if (name === "errors.jsonl") continue;
      const full = path.join(dir, name);
      try {
        rotated.push({ p: full, m: statSync(full).mtimeMs });
      } catch {
      }
    }
    rotated.sort((a, b) => b.m - a.m);
    for (const { p } of rotated.slice(ROTATE_KEEP)) {
      try {
        unlinkSync(p);
      } catch {
      }
    }
  } catch {
  }
}
var rotateCounter = 0;
function rotateIfNeeded(filePath) {
  try {
    rotateCounter = (rotateCounter + 1) % ROTATE_THROTTLE_N;
    if (rotateCounter !== 0) return;
    if (!shouldRotate(filePath)) return;
    const iso = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const dir = path.dirname(filePath);
    const target = path.join(dir, `errors.${iso}-${process.pid}.jsonl`);
    safeRename(filePath, target);
    pruneRotatedFiles(dir);
  } catch {
  }
}
function logHookEvent(input, err) {
  try {
    if (!readEnabled()) return;
    const stack = input.stack ?? err?.stack;
    const msg = input.msg ?? err?.message;
    const level = input.level ?? "info";
    const kind = coerceKind(input.kind);
    const record = {
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      hook: trunc(input.hook, STR_MAX) ?? "",
      event: trunc(input.event, STR_MAX) ?? "",
      kind
    };
    const optionalEntries = [
      ["msg", trunc(msg, MSG_MAX)],
      ["cwd", trunc(input.cwd, STR_MAX)],
      ["transcript_path", trunc(input.transcript_path, STR_MAX)],
      ["spec", trunc(input.spec, STR_MAX)],
      ["path", trunc(input.path, STR_MAX)],
      ["stack", trunc(stack, STACK_MAX)],
      ["correlationId", trunc(input.correlationId, STR_MAX)]
    ];
    for (const [k, v] of optionalEntries) {
      if (v !== void 0) record[k] = v;
    }
    if (input.payload !== void 0) {
      record.payload = input.payload;
    }
    let line = JSON.stringify(record);
    if (Buffer.byteLength(line + "\n", "utf8") > MAX_LINE_BYTES) {
      delete record.stack;
      line = JSON.stringify(record);
    }
    if (Buffer.byteLength(line + "\n", "utf8") > MAX_LINE_BYTES) {
      delete record.msg;
      line = JSON.stringify(record);
    }
    if (Buffer.byteLength(line + "\n", "utf8") > MAX_LINE_BYTES) {
      delete record.payload;
      line = JSON.stringify(record);
    }
    try {
      mkdirSync(ERRORS_DIR, { recursive: true });
    } catch {
    }
    rotateIfNeeded(ERRORS_LOG);
    appendFileSync(ERRORS_LOG, line + "\n");
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
  return new Promise((resolve, reject) => {
    const chunks = [];
    process2.stdin.on("data", (chunk) => chunks.push(chunk));
    process2.stdin.on(
      "end",
      () => resolve(Buffer.concat(chunks).toString("utf8"))
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
    logHookEvent({
      hook: "stop-failure-handler",
      event: "StopFailure",
      level: "error",
      kind: "unknown",
      msg: "malformed stdin",
      correlationId: buildCorrelationId(null, null)
    });
    process2.exit(0);
  }
  const matcher = typeof payload === "object" && payload !== null && "matcher" in payload && typeof payload.matcher === "string" ? payload.matcher : "unknown";
  const description = MATCHER_DESCRIPTIONS[matcher] ?? `unrecognised matcher (echoed verbatim from stdin)`;
  process2.stderr.write(`[StopFailure:${matcher}] ${description}
`);
  if (matcher === "rate_limit") {
    logHookEvent({
      hook: "stop-failure-handler",
      event: "StopFailure",
      level: "info",
      kind: "stop_failure_rate_limit",
      payload: { matcher, description },
      correlationId: buildCorrelationId(null, null)
    });
  } else {
    logHookEvent({
      hook: "stop-failure-handler",
      event: "StopFailure",
      level: "info",
      kind: "stop_failure_other",
      payload: { matcher, description },
      correlationId: buildCorrelationId(null, null)
    });
  }
  process2.exit(0);
}
main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process2.stderr.write(`stop-failure-handler: ${msg}
`);
  process2.exit(0);
});
//# sourceMappingURL=stop-failure-handler.mjs.map
