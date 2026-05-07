import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/task-completed-verifier.ts
import { existsSync as existsSync2, readFileSync as readFileSync3 } from "node:fs";
import { join as join3 } from "node:path";
import process4 from "node:process";

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

// src/hooks/_shared/path-resolver.ts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, isAbsolute, join, posix } from "node:path";
var DEFAULT_SPECS_DIR = "./specs";
var SETTINGS_REL_PATH = ".claude/curdx-flow.local.md";
function resolveCwd(opts) {
  return opts?.cwd ?? process.env["CURDX_CWD"] ?? process.cwd();
}
function warn(msg) {
  process.stderr.write(`[curdx-warn] ${msg}
`);
}
function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
function normalizePath(input) {
  if (!input) return ".";
  let p = input.replace(/\/+$/, "");
  if (p === "") p = ".";
  return p;
}
function parseSpecsDirsFromSettings(settingsPath) {
  let raw;
  try {
    raw = readFileSync(settingsPath, "utf8");
  } catch {
    return [];
  }
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*$/m);
  const block = fmMatch?.[1] ?? raw;
  const line = block.split(/\r?\n/).find((l) => /^\s*specs_dirs\s*:/.test(l));
  if (!line) return [];
  const value = line.replace(/^\s*specs_dirs\s*:\s*/, "");
  return value.replace(/[\[\]"']/g, "").split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}
function getSpecsDirs(opts) {
  const cwd = resolveCwd(opts);
  if (!isDir(cwd)) {
    warn(`CURDX_CWD does not exist: ${cwd}`);
    return [DEFAULT_SPECS_DIR];
  }
  const settingsPath = join(cwd, SETTINGS_REL_PATH);
  const raw = existsSync(settingsPath) ? parseSpecsDirsFromSettings(settingsPath) : [];
  if (raw.length === 0) return [DEFAULT_SPECS_DIR];
  const validated = [];
  for (const entry of raw) {
    const dir = normalizePath(entry);
    const absoluteOutsideCwd = isAbsolute(dir) && !dir.startsWith(cwd);
    if (absoluteOutsideCwd) {
      if (!isDir(dir)) {
        warn(
          `Skipping invalid absolute path in specs_dirs: ${dir} (does not exist)`
        );
        continue;
      }
    } else {
      const resolved = isAbsolute(dir) ? dir : join(cwd, dir);
      if (!isDir(resolved)) {
        warn(
          `Skipping invalid path in specs_dirs: ${dir} (directory not found at ${resolved})`
        );
        continue;
      }
    }
    validated.push(dir);
  }
  if (validated.length === 0) {
    warn(`No valid paths in specs_dirs, using default: ${DEFAULT_SPECS_DIR}`);
    return [DEFAULT_SPECS_DIR];
  }
  return validated;
}
function getDefaultDir(opts) {
  const dirs = getSpecsDirs(opts);
  return normalizePath(dirs[0] ?? DEFAULT_SPECS_DIR);
}
function resolveCurrent(opts) {
  const cwd = resolveCwd(opts);
  if (!isDir(cwd)) return null;
  const defaultDir = getDefaultDir(opts);
  const markerFs = join(cwd, defaultDir, ".current-spec");
  if (!existsSync(markerFs)) return null;
  let content;
  try {
    content = readFileSync(markerFs, "utf8");
  } catch {
    return null;
  }
  content = content.replace(/\s+/g, "");
  if (!content) {
    warn(".current-spec file is empty");
    return null;
  }
  const normalized = normalizePath(content);
  if (normalized.startsWith("./") || isAbsolute(normalized)) {
    return normalized;
  }
  return posix.join(defaultDir, normalized);
}

// src/hooks/lib/verify-blocks.ts
import { promises as fs } from "node:fs";
import { basename as basename2, join as join2 } from "node:path";
var WALK_SKIP_DIRS = /* @__PURE__ */ new Set([
  ".git",
  "node_modules",
  "dist",
  ".curdx",
  ".claude"
]);
var WALK_MAX_DEPTH = 6;
var VERIFICATION_PHASES = [
  "research",
  "requirements",
  "design",
  "tasks",
  "execution"
];
function getVerificationPhase(state) {
  const raw = typeof state.phase === "string" ? state.phase : "";
  if (!VERIFICATION_PHASES.includes(raw)) {
    return null;
  }
  return raw;
}
async function verifyPhaseBlock(state, phase, specDir) {
  const block = state.verificationBlocks?.[phase];
  if (block === void 0) {
    return { ok: false, reason: "missing", command: "" };
  }
  if (block.exitCode !== 0) {
    return {
      ok: false,
      reason: block.failedReason ?? "verification failed",
      command: block.command
    };
  }
  void await walkSrcTree(specDir);
  if (block.srcMtime > Date.parse(block.timestamp)) {
    const srcIso = new Date(block.srcMtime).toISOString();
    const specName = basename2(specDir);
    return {
      ok: false,
      reason: `Stale evidence for phase '${phase}': src changed at ${srcIso}, last verified at ${block.timestamp}. Re-run: ${block.command}. Spec: ${specName}.`,
      command: block.command
    };
  }
  return { ok: true };
}
async function walkSrcTree(dir) {
  let maxMtime = 0;
  async function walk(current, depth) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = join2(current, entry.name);
      if (entry.isDirectory()) {
        if (WALK_SKIP_DIRS.has(entry.name)) continue;
        if (depth >= WALK_MAX_DEPTH) continue;
        await walk(abs, depth + 1);
        continue;
      }
      try {
        const st = await fs.stat(abs);
        if (st.mtimeMs > maxMtime) maxMtime = st.mtimeMs;
      } catch {
      }
    }
  }
  await walk(dir, 0);
  return maxMtime;
}

// src/hooks/_shared/correlation.ts
import { basename as basename3 } from "node:path";
function buildCorrelationId(stdin, state) {
  const transcriptPath = stdin?.transcript_path;
  const sessionId = transcriptPath ? basename3(transcriptPath).replace(/\.(jsonl|json)$/, "") : "unknown";
  const taskIdx = state?.taskIndex ?? 0;
  const iter = state?.phase === "execution" ? state?.taskIteration ?? 1 : state?.globalIteration ?? 1;
  return `${sessionId}:${taskIdx}:${iter}`;
}

// src/hooks/_shared/error-logger.ts
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  readdirSync as readdirSync2,
  readFileSync as readFileSync2,
  renameSync,
  statSync as statSync2,
  unlinkSync
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import process3 from "node:process";
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
    const raw = readFileSync2(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.errorLogEnabled === "boolean") {
      cachedEnabled = parsed.errorLogEnabled;
      return cachedEnabled;
    }
    cachedEnabled = true;
    return cachedEnabled;
  } catch {
    process3.stderr.write("[error-logger] settings.json missing/corrupt, defaulting errorLogEnabled=true\n");
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
    const st = statSync2(filePath);
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
    const entries = readdirSync2(dir);
    const rotated = [];
    for (const name of entries) {
      if (!name.startsWith("errors.") || !name.endsWith(".jsonl")) continue;
      if (name === "errors.jsonl") continue;
      const full = path.join(dir, name);
      try {
        rotated.push({ p: full, m: statSync2(full).mtimeMs });
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
    const target = path.join(dir, `errors.${iso}-${process3.pid}.jsonl`);
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

// src/hooks/task-completed-verifier.ts
function passThrough() {
  process4.stdout.write(JSON.stringify({ continue: true }));
  process4.exit(0);
}
function emitBlock(reason) {
  process4.stdout.write(JSON.stringify({ decision: "block", reason }));
  process4.exit(2);
}
async function main() {
  let input;
  try {
    input = await readStdinJson();
  } catch {
    logHookEvent({
      hook: "task-completed-verifier",
      event: "TaskCompleted",
      level: "info",
      kind: "unknown",
      payload: { reason: "stdin_parse_fail" },
      correlationId: buildCorrelationId(null, null)
    });
    passThrough();
  }
  if (input.hook_event_name !== "TaskCompleted") {
    logHookEvent({
      hook: "task-completed-verifier",
      event: "TaskCompleted",
      level: "info",
      kind: "unknown",
      payload: { reason: "event_mismatch", got: input.hook_event_name },
      correlationId: buildCorrelationId(input, null),
      cwd: typeof input.cwd === "string" ? input.cwd : void 0
    });
    passThrough();
  }
  if (typeof input.task_id !== "string" || input.task_id.length === 0) {
    logHookEvent({
      hook: "task-completed-verifier",
      event: "TaskCompleted",
      level: "info",
      kind: "unknown",
      payload: { reason: "no_task_id" },
      correlationId: buildCorrelationId(input, null),
      cwd: typeof input.cwd === "string" ? input.cwd : void 0
    });
    passThrough();
  }
  const cwd = typeof input.cwd === "string" && input.cwd.length > 0 ? input.cwd : process4.cwd();
  const specPath = resolveCurrent({ cwd });
  if (!specPath) {
    logHookEvent({
      hook: "task-completed-verifier",
      event: "TaskCompleted",
      level: "info",
      kind: "unknown",
      payload: { reason: "no_spec" },
      correlationId: buildCorrelationId(input, null),
      cwd
    });
    passThrough();
  }
  const specDir = join3(cwd, specPath);
  const stateFile = join3(specDir, ".curdx-state.json");
  if (!existsSync2(stateFile)) {
    logHookEvent({
      hook: "task-completed-verifier",
      event: "TaskCompleted",
      level: "info",
      kind: "unknown",
      payload: { reason: "no_state", specPath },
      correlationId: buildCorrelationId(input, null),
      cwd,
      spec: specPath
    });
    passThrough();
  }
  let state;
  try {
    state = JSON.parse(readFileSync3(stateFile, "utf8"));
  } catch {
    logHookEvent({
      hook: "task-completed-verifier",
      event: "TaskCompleted",
      level: "info",
      kind: "unknown",
      payload: { reason: "state_parse_fail", specPath },
      correlationId: buildCorrelationId(input, null),
      cwd,
      spec: specPath,
      path: stateFile
    });
    passThrough();
  }
  const phase = getVerificationPhase(state);
  if (phase === null) {
    logHookEvent({
      hook: "task-completed-verifier",
      event: "TaskCompleted",
      level: "info",
      kind: "unknown",
      payload: {
        reason: "phase_resolve_fail",
        statePhase: state.phase,
        specPath
      },
      correlationId: buildCorrelationId(input, state),
      cwd,
      spec: specPath
    });
    passThrough();
  }
  const result = await verifyPhaseBlock(state, phase, specDir);
  if (!result.ok) {
    logHookEvent({
      hook: "task-completed-verifier",
      event: "TaskCompleted",
      level: "decision",
      kind: "task_verify_fail",
      payload: {
        reason: result.reason ?? "verification failed",
        phase,
        specPath
      },
      correlationId: buildCorrelationId(input, state),
      cwd,
      spec: specPath
    });
    emitBlock(result.reason ?? "verification failed");
  }
  logHookEvent({
    hook: "task-completed-verifier",
    event: "TaskCompleted",
    level: "info",
    kind: "task_verify_pass",
    payload: { phase, specPath },
    correlationId: buildCorrelationId(input, state),
    cwd,
    spec: specPath
  });
  process4.exit(0);
}
main().catch((err) => {
  const stack = err instanceof Error ? err.stack ?? err.message : String(err);
  process4.stderr.write(`[task-completed-verifier] ${stack}
`);
  emitBlock("internal error in verify-blocks; see logs");
});
//# sourceMappingURL=task-completed-verifier.mjs.map
