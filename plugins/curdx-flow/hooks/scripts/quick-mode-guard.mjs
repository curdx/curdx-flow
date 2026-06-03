import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/quick-mode-guard.ts
import { readFileSync as readFileSync3, existsSync as existsSync2 } from "node:fs";
import { join as join2 } from "node:path";

// src/hooks/_shared/run-hook.ts
import path2 from "node:path";
import process4 from "node:process";

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
import process2 from "node:process";
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
    process2.stderr.write("[error-logger] settings.json missing/corrupt, defaulting errorLogEnabled=true\n");
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
    const target = path.join(dir, `errors.${iso}-${process2.pid}.jsonl`);
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
function logHookError(ctx, err) {
  logHookEvent({ ...ctx, level: "error", kind: ctx.kind ?? "unknown" }, err);
}

// src/hooks/_shared/stdin.ts
import process3 from "node:process";
async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process3.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process3.stderr.write(`[hook] invalid stdin JSON: ${msg}
`);
    throw e;
  }
}

// src/hooks/_shared/run-hook.ts
function deriveHookName() {
  const entry = process4.argv[1];
  if (!entry) return "unknown-hook";
  return path2.basename(entry).replace(/\.(mjs|js|ts)$/, "");
}
async function runHook(handler, options = {}) {
  const { readStdin = true } = options;
  const hookName = deriveHookName();
  let stdinForCtx = {};
  try {
    try {
      stdinForCtx = readStdin ? await readStdinJson() : {};
    } catch (parseErr) {
      const e = parseErr instanceof Error ? parseErr : new Error(String(parseErr));
      logHookError(
        {
          hook: hookName,
          event: "stdin_parse",
          msg: e.message,
          stack: e.stack ?? ""
        },
        e
      );
      throw e;
    }
    const output = await handler(stdinForCtx);
    if (output !== void 0 && output !== null) {
      process4.stdout.write(JSON.stringify(output) + "\n");
    }
    process4.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack ?? "" : "";
    logHookError(
      {
        hook: hookName,
        event: "uncaught",
        msg,
        stack,
        ...typeof stdinForCtx.cwd === "string" ? { cwd: stdinForCtx.cwd } : {},
        ...typeof stdinForCtx.transcript_path === "string" ? { transcript_path: stdinForCtx.transcript_path } : {}
      },
      err instanceof Error ? err : void 0
    );
    process4.stderr.write(`[hook] ${msg}
`);
    process4.exit(0);
  }
}

// src/hooks/_shared/path-resolver.ts
import {
  existsSync,
  mkdirSync as mkdirSync2,
  readFileSync as readFileSync2,
  readdirSync as readdirSync2,
  statSync as statSync2,
  writeFileSync
} from "node:fs";
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
    return statSync2(p).isDirectory();
  } catch {
    return false;
  }
}
function sanitizeSessionId(sessionId) {
  const raw = sessionId?.trim();
  if (!raw) return null;
  const safe = raw.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 120);
  return safe.length > 0 ? safe : null;
}
function specPathExists(cwd, specPath) {
  const fsPath = isAbsolute(specPath) ? specPath : join(cwd, specPath);
  return isDir(fsPath);
}
function sessionBindingPath(opts) {
  const cwd = resolveCwd(opts);
  const sessionId = sanitizeSessionId(opts?.sessionId);
  if (!sessionId) return null;
  return join(cwd, ".curdx", "sessions", `${sessionId}.json`);
}
function readSessionSpecBinding(opts) {
  const cwd = resolveCwd(opts);
  const path3 = sessionBindingPath(opts);
  if (!path3 || !existsSync(path3)) return null;
  try {
    const parsed = JSON.parse(readFileSync2(path3, "utf8"));
    if (parsed.version !== 1) return null;
    if (typeof parsed.sessionId !== "string" || typeof parsed.specPath !== "string") return null;
    if (!specPathExists(cwd, parsed.specPath)) return null;
    return {
      version: 1,
      sessionId: parsed.sessionId,
      specPath: parsed.specPath,
      specName: typeof parsed.specName === "string" ? parsed.specName : basename(parsed.specPath),
      lastSeenAt: typeof parsed.lastSeenAt === "string" ? parsed.lastSeenAt : "",
      source: typeof parsed.source === "string" ? parsed.source : "unknown"
    };
  } catch {
    return null;
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
    raw = readFileSync2(settingsPath, "utf8");
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
  const sessionBinding = readSessionSpecBinding(opts);
  if (sessionBinding) return sessionBinding.specPath;
  const defaultDir = getDefaultDir(opts);
  const markerFs = [
    join(cwd, defaultDir, ".current-spec"),
    join(cwd, ".current-spec")
  ].find((candidate) => existsSync(candidate));
  if (!markerFs) return null;
  let content;
  try {
    content = readFileSync2(markerFs, "utf8");
  } catch {
    return null;
  }
  content = content.replace(/\s+/g, "");
  if (!content) {
    warn(".current-spec file is empty");
    return null;
  }
  const normalized = normalizePath(content);
  if (normalized.startsWith("./") || normalized.startsWith("../") || normalized.includes("/") || isAbsolute(normalized)) {
    return normalized;
  }
  return posix.join(defaultDir, normalized);
}

// src/hooks/quick-mode-guard.ts
var QUICK_MODE_REASON = "Quick mode active: do NOT ask the user any questions. Make opinionated decisions autonomously. Choose the simplest, most conventional approach.";
var DENY = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: QUICK_MODE_REASON
  }
};
runHook(async (input) => {
  const cwd = input?.cwd;
  if (!cwd) {
    return;
  }
  const specPath = resolveCurrent({ cwd, sessionId: input.session_id });
  if (!specPath) {
    return;
  }
  const stateFile = join2(cwd, specPath, ".curdx-state.json");
  if (!existsSync2(stateFile)) {
    return;
  }
  let state;
  try {
    state = JSON.parse(readFileSync3(stateFile, "utf8"));
  } catch {
    return;
  }
  if (state.quickMode === true) {
    return DENY;
  }
  return;
});
//# sourceMappingURL=quick-mode-guard.mjs.map
