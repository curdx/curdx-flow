import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/subagent-context-injector.ts
import { existsSync as existsSync2, readFileSync as readFileSync3 } from "node:fs";
import { join as join2 } from "node:path";
import process5 from "node:process";

// src/hooks/_shared/run-hook.ts
import path2 from "node:path";
import process4 from "node:process";

// src/hooks/_shared/error-logger.ts
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
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
function logHookError(ctx, err) {
  try {
    if (!readEnabled()) return;
    const stack = ctx.stack ?? err?.stack;
    const msg = ctx.msg ?? err?.message;
    const record = {
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      level: "error",
      hook: trunc(ctx.hook, STR_MAX) ?? "",
      event: trunc(ctx.event, STR_MAX) ?? ""
    };
    const optionalEntries = [
      ["msg", trunc(msg, MSG_MAX)],
      ["cwd", trunc(ctx.cwd, STR_MAX)],
      ["transcript_path", trunc(ctx.transcript_path, STR_MAX)],
      ["spec", trunc(ctx.spec, STR_MAX)],
      ["path", trunc(ctx.path, STR_MAX)],
      ["stack", trunc(stack, STACK_MAX)]
    ];
    for (const [k, v] of optionalEntries) {
      if (v !== void 0) record[k] = v;
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
    try {
      mkdirSync(ERRORS_DIR, { recursive: true });
    } catch {
    }
    appendFileSync(ERRORS_LOG, line + "\n");
  } catch {
  }
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
import { existsSync, readFileSync as readFileSync2, readdirSync, statSync } from "node:fs";
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
  const defaultDir = getDefaultDir(opts);
  const markerFs = join(cwd, defaultDir, ".current-spec");
  if (!existsSync(markerFs)) return null;
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
  if (normalized.startsWith("./") || isAbsolute(normalized)) {
    return normalized;
  }
  return posix.join(defaultDir, normalized);
}

// src/hooks/lib/build-context-payload.ts
import { basename as basename2 } from "node:path";
var IRON_LAW_SUMMARY = "No completion claim without fresh verification.";
var DEFAULT_MAX_BYTES = 2048;
var PayloadOverBudgetError = class extends Error {
  /** Actual byte length of the over-budget payload. */
  byteLength;
  /** Configured byte ceiling at the time of build. */
  maxBytes;
  constructor(byteLength, maxBytes) {
    super(
      `curdx context payload exceeds budget: ${byteLength}B > ${maxBytes}B`
    );
    this.name = "PayloadOverBudgetError";
    this.byteLength = byteLength;
    this.maxBytes = maxBytes;
  }
};
function buildSessionStartPayload(state, specDir) {
  const specName = basename2(specDir);
  const payload = { specName };
  if (state.completed === true) {
    payload.phase = "completed";
    payload.awaitingApproval = false;
    return payload;
  }
  if (typeof state.phase === "string") {
    payload.phase = state.phase;
  }
  if (typeof state.taskIndex === "number") {
    payload.taskIndex = state.taskIndex;
  }
  if (typeof state.totalTasks === "number") {
    payload.totalTasks = state.totalTasks;
  }
  if (state.awaitingApproval === true) {
    payload.awaitingApproval = true;
  } else if (state.awaitingApproval === false) {
    payload.awaitingApproval = false;
  }
  return payload;
}
function buildSubagentBlock(state, specDir) {
  const phase = typeof state.phase === "string" ? state.phase : "unknown";
  return [
    "<curdx-spec-context>",
    `phase: ${phase}`,
    `spec: ${specDir}`,
    `iron-law: ${IRON_LAW_SUMMARY}`,
    "</curdx-spec-context>"
  ].join("\n");
}
function buildContextPayload(state, specDir, opts) {
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
  const out = opts?.forSubagent ? buildSubagentBlock(state, specDir) : JSON.stringify(buildSessionStartPayload(state, specDir));
  const byteLength = Buffer.byteLength(out, "utf8");
  if (byteLength > maxBytes) {
    throw new PayloadOverBudgetError(byteLength, maxBytes);
  }
  return out;
}

// src/hooks/subagent-context-injector.ts
var FAIL_OPEN = { continue: true };
runHook(async (input) => {
  try {
    const eventName = input?.hook_event_name;
    if (typeof eventName === "string" && eventName !== "SubagentStart") {
      return FAIL_OPEN;
    }
    const cwd = input?.cwd;
    if (typeof cwd !== "string" || cwd.length === 0) {
      return FAIL_OPEN;
    }
    const specPath = resolveCurrent({ cwd });
    if (!specPath) {
      return FAIL_OPEN;
    }
    const specDirFs = join2(cwd, specPath);
    const stateFile = join2(specDirFs, ".curdx-state.json");
    if (!existsSync2(stateFile)) {
      return FAIL_OPEN;
    }
    let state;
    try {
      state = JSON.parse(readFileSync3(stateFile, "utf8"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      process5.stderr.write(
        `[subagent-context-injector] state parse failed: ${msg}
`
      );
      return FAIL_OPEN;
    }
    if (state.completed === true) {
      return FAIL_OPEN;
    }
    const additionalContext = buildContextPayload(state, specPath, {
      forSubagent: true
    });
    const out = {
      hookSpecificOutput: {
        hookEventName: "SubagentStart",
        additionalContext
      },
      continue: true
    };
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process5.stderr.write(`[subagent-context-injector] ${msg}
`);
    return FAIL_OPEN;
  }
});
//# sourceMappingURL=subagent-context-injector.mjs.map
