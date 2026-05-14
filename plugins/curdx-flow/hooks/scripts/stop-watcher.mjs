import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/stop-watcher.ts
import {
  existsSync as existsSync2,
  readFileSync as readFileSync3,
  readdirSync as readdirSync3,
  statSync as statSync3,
  unlinkSync as unlinkSync2
} from "node:fs";
import { spawn } from "node:child_process";
import { basename as basename3, dirname, join as join3 } from "node:path";
import { fileURLToPath } from "node:url";
import process5 from "node:process";

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

// src/hooks/_shared/atomic-write.ts
import { writeFileSync as writeFileSync2, renameSync as renameSync2 } from "node:fs";
import { randomBytes } from "node:crypto";
function writeFileAtomic(path3, data) {
  const tmp = `${path3}.tmp.${process.pid}.${randomBytes(6).toString("hex")}`;
  writeFileSync2(tmp, data);
  renameSync2(tmp, path3);
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
  if (phase === "execution" && typeof block.taskIndex === "number") {
    const currentTaskIndex = typeof state.taskIndex === "number" ? state.taskIndex : 0;
    if (block.taskIndex !== currentTaskIndex) {
      const specName = basename2(specDir);
      return {
        ok: false,
        reason: `Stale evidence for phase 'execution': block recorded against task index ${block.taskIndex}, current task index is ${currentTaskIndex}. Re-run: ${block.command}. Spec: ${specName}.`,
        command: block.command
      };
    }
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

// src/hooks/stop-watcher.ts
var SETTINGS_REL_PATH2 = ".claude/curdx-flow.local.md";
var ALL_TASKS_COMPLETE_RE = /(^|\W)ALL_TASKS_COMPLETE(\W|$)/;
function preserveDotPrefix(specPath, specsDirs) {
  for (const dir of specsDirs) {
    if (!dir.startsWith("./")) continue;
    const body = dir.slice(2);
    if (body && specPath.startsWith(`${body}/`)) return `./${specPath}`;
    if (body && specPath === body) return `./${specPath}`;
  }
  return specPath;
}
function normalizeText(input) {
  if (!input) return "";
  let s = input;
  if (s.charCodeAt(0) === 65279) s = s.slice(1);
  return s.replace(/\r\n?/g, "\n");
}
function readEnabledSetting(settingsPath) {
  let raw;
  try {
    raw = readFileSync3(settingsPath, "utf8");
  } catch {
    return null;
  }
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*$/m);
  const block = fmMatch?.[1];
  if (!block) return null;
  const line = block.split(/\r?\n/).find((l) => /^enabled\s*:/.test(l));
  if (!line) return null;
  const value = line.replace(/^enabled\s*:\s*/, "");
  const cleaned = value.replace(/[\s"']/g, "").toLowerCase();
  return cleaned || null;
}
async function maybeWaitForRecentStateFile(stateFile) {
  let mtimeMs;
  try {
    mtimeMs = statSync3(stateFile).mtimeMs;
  } catch {
    return;
  }
  const ageMs = Date.now() - mtimeMs;
  if (ageMs < 2e3) {
    await new Promise((r) => setTimeout(r, 1e3));
  }
}
function tailContainsCompletionMarker(transcriptPath, lineCount) {
  let raw;
  try {
    raw = readFileSync3(transcriptPath, "utf8");
  } catch {
    return false;
  }
  const lines = normalizeText(raw).split("\n");
  const slice = lines.slice(Math.max(0, lines.length - lineCount));
  for (const line of slice) {
    if (ALL_TASKS_COMPLETE_RE.test(line)) return true;
  }
  return false;
}
function markSpecCompletedInEpic(cwd, epicName, specName) {
  const epicStateFile = join3(
    cwd,
    "specs",
    "_epics",
    epicName,
    ".epic-state.json"
  );
  if (!existsSync2(epicStateFile)) return;
  let epic;
  try {
    epic = JSON.parse(readFileSync3(epicStateFile, "utf8"));
  } catch {
    return;
  }
  if (!Array.isArray(epic.specs)) return;
  let mutated = false;
  for (const entry of epic.specs) {
    if (entry && entry.name === specName) {
      entry.status = "completed";
      mutated = true;
    }
  }
  if (!mutated) return;
  try {
    writeFileAtomic(epicStateFile, JSON.stringify(epic, null, 2) + "\n");
    process5.stderr.write(
      `[curdx-flow] Updated epic '${epicName}': spec '${specName}' marked completed
`
    );
  } catch {
  }
}
function fireUpdateSpecIndex() {
  let here;
  try {
    here = typeof __filename === "string" && __filename.length > 0 ? __filename : fileURLToPath(import.meta.url);
  } catch {
    here = fileURLToPath(import.meta.url);
  }
  const scriptDir = dirname(here);
  const target = join3(scriptDir, "update-spec-index.mjs");
  if (!existsSync2(target)) return;
  try {
    const child = spawn(process5.execPath, [target, "--quiet"], {
      stdio: ["ignore", "ignore", "ignore"],
      detached: true
    });
    child.unref();
  } catch {
  }
}
function cleanupStaleProgressFiles(specDirFs) {
  let entries;
  try {
    entries = readdirSync3(specDirFs);
  } catch {
    return;
  }
  const now = Date.now();
  const sixtyMinMs = 60 * 60 * 1e3;
  for (const name of entries) {
    if (!name.startsWith(".progress-task-") || !name.endsWith(".md")) continue;
    const fp = join3(specDirFs, name);
    let mtimeMs;
    try {
      mtimeMs = statSync3(fp).mtimeMs;
    } catch {
      continue;
    }
    if (now - mtimeMs > sixtyMinMs) {
      try {
        unlinkSync2(fp);
      } catch {
      }
    }
  }
}
function countUncheckedTasks(tasksFile) {
  let raw;
  try {
    raw = readFileSync3(tasksFile, "utf8");
  } catch {
    return 0;
  }
  const lines = normalizeText(raw).split("\n");
  let n = 0;
  for (const line of lines) {
    if (/^\s*- \[ \]/.test(line)) n++;
  }
  return n;
}
function buildVerificationBlockFailDecision(phase, result, specName) {
  const cmd = typeof result.command === "string" && result.command.length > 0 ? result.command : `/curdx-flow:${phase} (re-run phase to record verification)`;
  let reason;
  let systemMessage;
  if (result.reason === "missing") {
    reason = `Phase '${phase}' has no verification block. Run: ${cmd}. Spec: ${specName}. Then try again.`;
    systemMessage = `curdx-flow: phase '${phase}' missing verification block (spec: ${specName})`;
  } else if (typeof result.reason === "string" && result.reason.startsWith("Stale evidence")) {
    reason = result.reason;
    systemMessage = `curdx-flow: phase '${phase}' verification stale (spec: ${specName})`;
  } else {
    const detail = result.reason ?? "verification failed";
    reason = `Verification failed for phase '${phase}': ${detail}. Fix and re-run: ${cmd}. Spec: ${specName}.`;
    systemMessage = `curdx-flow: phase '${phase}' verification failed (spec: ${specName})`;
  }
  return {
    decision: "block",
    reason,
    systemMessage
  };
}
function buildMalformedVerificationBlock(specName) {
  const reason = `Phase 'unknown' verificationBlocks malformed in .curdx-state.json. Fix: edit ${specName}/.curdx-state.json (or run /curdx-flow:cancel). Spec: ${specName}. See references/iron-law-verification.md.`;
  return {
    decision: "block",
    reason,
    systemMessage: `curdx-flow: verificationBlocks malformed (spec: ${specName})`
  };
}
function buildCorruptStateBlock(specPath) {
  const reason = `ERROR: Corrupt state file at ${specPath}/.curdx-state.json

Recovery options:
1. Reset state: /curdx-flow:implement (reinitializes from tasks.md)
2. Cancel spec: /curdx-flow:cancel`;
  return {
    decision: "block",
    reason,
    systemMessage: "curdx-flow: corrupt state file"
  };
}
function buildCostRunawayBlock(state, specName, stateFilePath) {
  const globalIter = typeof state.globalIteration === "number" ? state.globalIteration : 1;
  const maxGlobal = typeof state.maxGlobalIterations === "number" ? state.maxGlobalIterations : 100;
  const taskIter = typeof state.taskIteration === "number" ? state.taskIteration : 1;
  const maxTask = typeof state.maxTaskIterations === "number" ? state.maxTaskIterations : 5;
  if (globalIter >= maxGlobal) {
    const reason = `Cost runaway guard tripped: globalIteration=${globalIter} >= maxGlobalIterations=${maxGlobal}.
Loop blocked. Either:
- Investigate why your loop ran ${globalIter} iterations (check .progress.md)
- Override with: /curdx-flow:implement --max-global-iterations <higher-cap>
- Reset by editing ${stateFilePath}: set globalIteration to a lower value

Spec: ${specName}  Phase: implement`;
    return {
      decision: "block",
      reason,
      systemMessage: `curdx-flow: cost runaway \u2014 globalIteration cap reached (${specName})`
    };
  }
  if (taskIter >= maxTask) {
    const reason = `Cost runaway guard tripped: taskIteration=${taskIter} >= maxTaskIterations=${maxTask}.
Loop blocked. Either:
- Investigate why your loop ran ${taskIter} iterations (check .progress.md)
- Override with: /curdx-flow:implement --max-task-iterations <higher-cap>
- Reset by editing ${stateFilePath}: set taskIteration to a lower value

Spec: ${specName}  Phase: implement`;
    return {
      decision: "block",
      reason,
      systemMessage: `curdx-flow: cost runaway \u2014 taskIteration cap reached (${specName})`
    };
  }
  return null;
}
function buildUncheckedTasksBlock(specPath, taskIndex, totalTasks, unchecked) {
  const reason = `Tasks incomplete: state index (${taskIndex}) reached total (${totalTasks}), but tasks.md has ${unchecked} unchecked items.

## Action Required
1. Read ${specPath}/tasks.md and find unchecked tasks (- [ ])
2. Execute remaining unchecked tasks via spec-executor
3. Update .curdx-state.json totalTasks to match actual count
4. Only output ALL_TASKS_COMPLETE when every task in tasks.md is checked off
5. Do NOT add new tasks \u2014 complete existing ones only`;
  return {
    decision: "block",
    reason,
    systemMessage: `curdx-flow: ${unchecked} unchecked tasks remain in tasks.md`
  };
}
runHook(async (input) => {
  if (input?.stop_hook_active === true) {
    return;
  }
  const cwd = input?.cwd;
  if (!cwd) return;
  const settingsPath = join3(cwd, SETTINGS_REL_PATH2);
  if (existsSync2(settingsPath)) {
    const enabled = readEnabledSetting(settingsPath);
    if (enabled === "false") return;
  }
  const rawSpecPath = resolveCurrent({ cwd, sessionId: input.session_id });
  if (!rawSpecPath) return;
  const specPath = preserveDotPrefix(rawSpecPath, getSpecsDirs({ cwd }));
  const specName = basename3(specPath);
  const stateFile = join3(cwd, specPath, ".curdx-state.json");
  if (!existsSync2(stateFile)) return;
  await maybeWaitForRecentStateFile(stateFile);
  try {
    const capState = JSON.parse(readFileSync3(stateFile, "utf8"));
    if (capState.completed !== true) {
      const runawayBlock = buildCostRunawayBlock(capState, specName, stateFile);
      if (runawayBlock) return runawayBlock;
    }
  } catch {
  }
  const transcriptPath = input.transcript_path;
  if (transcriptPath && existsSync2(transcriptPath)) {
    const handleCompletion = async (variant) => {
      const label = variant === "primary" ? "[curdx-flow] ALL_TASKS_COMPLETE detected in transcript" : "[curdx-flow] ALL_TASKS_COMPLETE detected in transcript (tail-end)";
      process5.stderr.write(label + "\n");
      let parsedState;
      let stateMalformed = false;
      try {
        parsedState = JSON.parse(readFileSync3(stateFile, "utf8"));
      } catch {
        parsedState = void 0;
        stateMalformed = true;
      }
      if (stateMalformed) {
        return buildMalformedVerificationBlock(specName);
      }
      if (parsedState?.completed === true) {
        return void 0;
      }
      const epicName = parsedState && typeof parsedState.epicName === "string" && parsedState.epicName.length > 0 ? parsedState.epicName : void 0;
      if (parsedState) {
        const knownPhase = getVerificationPhase(parsedState);
        if (knownPhase !== null) {
          let result;
          try {
            result = await verifyPhaseBlock(
              parsedState,
              knownPhase,
              join3(cwd, specPath)
            );
          } catch {
            return buildMalformedVerificationBlock(specName);
          }
          if (!result.ok) {
            return buildVerificationBlockFailDecision(
              knownPhase,
              result,
              specName
            );
          }
        }
      }
      const currentEpicFile = join3(cwd, "specs", ".current-epic");
      if (epicName && existsSync2(currentEpicFile)) {
        markSpecCompletedInEpic(cwd, epicName, specName);
      }
      fireUpdateSpecIndex();
      return void 0;
    };
    if (tailContainsCompletionMarker(transcriptPath, 500)) {
      const blocked = await handleCompletion("primary");
      if (blocked) return blocked;
      return;
    }
    if (tailContainsCompletionMarker(transcriptPath, 20)) {
      const blocked = await handleCompletion("fallback");
      if (blocked) return blocked;
      return;
    }
  }
  let state;
  try {
    state = JSON.parse(readFileSync3(stateFile, "utf8"));
  } catch {
    return buildCorruptStateBlock(specPath);
  }
  if (state.completed === true) {
    return;
  }
  const phase = typeof state.phase === "string" ? state.phase : "unknown";
  const taskIndex = typeof state.taskIndex === "number" ? state.taskIndex : 0;
  const totalTasks = typeof state.totalTasks === "number" ? state.totalTasks : 0;
  if (phase === "execution") {
    process5.stderr.write(
      `[curdx-flow] Session stopped during spec: ${specName} | Task: ${taskIndex + 1}/${totalTasks}
`
    );
  }
  if (phase === "execution" && taskIndex >= totalTasks && totalTasks > 0) {
    const tasksFile = join3(cwd, specPath, "tasks.md");
    if (existsSync2(tasksFile)) {
      const unchecked = countUncheckedTasks(tasksFile);
      if (unchecked > 0) {
        process5.stderr.write(
          `[curdx-flow] State says complete but tasks.md has ${unchecked} unchecked items
`
        );
        return buildUncheckedTasksBlock(
          specPath,
          taskIndex,
          totalTasks,
          unchecked
        );
      }
    }
    process5.stderr.write(
      `[curdx-flow] All tasks verified complete for ${specName}
`
    );
    return;
  }
  if (phase === "execution" && taskIndex < totalTasks) {
    if (state.awaitingApproval === true) {
      process5.stderr.write(
        `[curdx-flow] awaitingApproval=true, allowing stop for user gate
`
      );
      return;
    }
    cleanupStaleProgressFiles(join3(cwd, specPath));
    process5.stderr.write(
      `[curdx-flow] execution remains in progress; native /goal or a later /curdx-flow:implement invocation should drive the next turn
`
    );
    return;
  }
  cleanupStaleProgressFiles(join3(cwd, specPath));
});
//# sourceMappingURL=stop-watcher.mjs.map
