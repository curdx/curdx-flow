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
  readdirSync as readdirSync2,
  statSync as statSync2,
  unlinkSync
} from "node:fs";
import { spawn } from "node:child_process";
import { basename as basename2, dirname, join as join2 } from "node:path";
import { fileURLToPath } from "node:url";
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
    process3.exit(0);
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

// src/hooks/_shared/atomic-write.ts
import { writeFileSync, renameSync } from "node:fs";
import { randomBytes } from "node:crypto";
function writeFileAtomic(path3, data) {
  const tmp = `${path3}.tmp.${process.pid}.${randomBytes(6).toString("hex")}`;
  writeFileSync(tmp, data);
  renameSync(tmp, path3);
}

// src/hooks/_shared/markdown-task-parser.ts
var TASK_LINE_RE = /^- \[[ x]\]/;
var INDENTED_RE = /^  /;
var BLANK_RE = /^\s*$/;
function normalize(input) {
  if (!input) return "";
  let s = input;
  if (s.charCodeAt(0) === 65279) s = s.slice(1);
  return s.replace(/\r\n?/g, "\n");
}
function trimTrailingBlankLines(lines) {
  let end = lines.length;
  while (end > 0 && BLANK_RE.test(lines[end - 1] ?? "")) end--;
  return lines.slice(0, end);
}
function extractTaskBlock(markdown, taskIndex) {
  if (!markdown) return "";
  if (!Number.isFinite(taskIndex) || taskIndex < 0) return "";
  const lines = normalize(markdown).split("\n");
  let count = 0;
  let found = false;
  const out = [];
  for (const line of lines) {
    if (TASK_LINE_RE.test(line)) {
      if (count === taskIndex) {
        found = true;
        out.push(line);
        continue;
      }
      if (found) break;
      count++;
      continue;
    }
    if (!found) continue;
    if (INDENTED_RE.test(line)) {
      out.push(line);
      continue;
    }
    if (BLANK_RE.test(line)) {
      out.push(line);
      continue;
    }
    break;
  }
  if (!found) return "";
  return trimTrailingBlankLines(out).join("\n");
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
function defaultTrueIfFalsyOrNull(value) {
  if (value === null || value === void 0) return true;
  if (value === false) return true;
  if (value === true) return true;
  return true;
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
    mtimeMs = statSync2(stateFile).mtimeMs;
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
  const epicStateFile = join2(
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
  const target = join2(scriptDir, "update-spec-index.mjs");
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
    entries = readdirSync2(specDirFs);
  } catch {
    return;
  }
  const now = Date.now();
  const sixtyMinMs = 60 * 60 * 1e3;
  for (const name of entries) {
    if (!name.startsWith(".progress-task-") || !name.endsWith(".md")) continue;
    const fp = join2(specDirFs, name);
    let mtimeMs;
    try {
      mtimeMs = statSync2(fp).mtimeMs;
    } catch {
      continue;
    }
    if (now - mtimeMs > sixtyMinMs) {
      try {
        unlinkSync(fp);
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
function extractParallelGroupBlock(markdown, taskIndex, maxGroup = 5) {
  if (!markdown) return "";
  if (!Number.isFinite(taskIndex) || taskIndex < 0) return "";
  const lines = normalizeText(markdown).split("\n");
  let count = 0;
  let pcount = 0;
  let found = false;
  let block = "";
  for (const line of lines) {
    if (/^- \[[ x]\]/.test(line)) {
      if (count >= taskIndex) {
        if (/\[P\]/.test(line) && pcount < maxGroup) {
          found = true;
          pcount++;
          block += line + "\n";
          count++;
          continue;
        } else if (found) {
          break;
        }
      }
      count++;
      continue;
    }
    if (!found) continue;
    if (/^  /.test(line)) {
      block += line + "\n";
      continue;
    }
    if (/^\s*$/.test(line)) {
      block += line + "\n";
      continue;
    }
    break;
  }
  return block.replace(/\n+$/, "");
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
function buildQuickModeBlock(phase, specName) {
  const reason = `Quick mode active \u2014 do NOT stop. Continue spec phase: ${phase} for ${specName}.

You are running in quick mode. Do NOT stop, do NOT ask the user questions.
Continue generating artifacts for the current phase (${phase}) and proceed to the next phase.
Make strong, opinionated decisions autonomously.`;
  return {
    decision: "block",
    reason,
    systemMessage: `curdx-flow quick mode: continue ${phase} phase`
  };
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
function buildContinuationBlock(args) {
  const taskHeader = args.isParallel ? "## Current Task Group (PARALLEL)" : "## Current Task";
  const parallelInstructions = args.isParallel ? `
PARALLEL: These are [P] tasks -- dispatch ALL in ONE message via Task tool. Each gets progressFile: .progress-task-$INDEX.md. After all complete: merge progress, advance taskIndex past group.` : "";
  const reason = `Continue spec: ${args.specName} (Task ${args.taskIndex + 1}/${args.totalTasks}, Iter ${args.globalIteration})

## State
Path: ${args.specPath} | Index: ${args.taskIndex} | Iteration: ${args.taskIteration}/${args.maxTaskIter} | Recovery: ${args.recoveryMode} | NativeSync: ${args.nativeSync}

${taskHeader}
${args.taskBlock}
${parallelInstructions}

## Resume
1. Read ${args.specPath}/.curdx-state.json for current state
2. Native sync (if NativeSync != false): (a) if nativeTaskMap is empty, rebuild from tasks.md (TaskCreate all, store IDs in state), (b) TaskUpdate current task to in_progress with activeForm
3. Delegate the task above to spec-executor (or qa-engineer for [VERIFY])
4. On TASK_COMPLETE: verify, update state, advance. Then TaskUpdate task to completed (if NativeSync != false)
5. If taskIndex >= totalTasks: finalize all native tasks to completed (if NativeSync != false), read ${args.specPath}/tasks.md to verify all [x], delete state file, output ALL_TASKS_COMPLETE

## Critical
- Delegate via Task tool - do NOT implement yourself
- Verify all 3 layers before advancing (see verification-layers.md)
- Do NOT push after every commit - batch pushes per phase or every 5 commits (see coordinator-pattern.md \xA7 'Git Push Strategy')
- On failure: increment taskIteration, retry or generate fix task if recoveryMode
- On TASK_MODIFICATION_REQUEST: validate, insert tasks, update state (see coordinator-pattern.md \xA7 'Modification Request Handler')`;
  let systemMessage = `curdx-flow iteration ${args.globalIteration} | Task ${args.taskIndex + 1}/${args.totalTasks}`;
  if (args.isParallel) systemMessage += " (PARALLEL GROUP)";
  return { decision: "block", reason, systemMessage };
}
runHook(async (input) => {
  const cwd = input?.cwd;
  if (!cwd) return;
  const settingsPath = join2(cwd, SETTINGS_REL_PATH2);
  if (existsSync2(settingsPath)) {
    const enabled = readEnabledSetting(settingsPath);
    if (enabled === "false") return;
  }
  const rawSpecPath = resolveCurrent({ cwd });
  if (!rawSpecPath) return;
  const specPath = preserveDotPrefix(rawSpecPath, getSpecsDirs({ cwd }));
  const specName = basename2(specPath);
  const stateFile = join2(cwd, specPath, ".curdx-state.json");
  if (!existsSync2(stateFile)) return;
  await maybeWaitForRecentStateFile(stateFile);
  const transcriptPath = input.transcript_path;
  if (transcriptPath && existsSync2(transcriptPath)) {
    const handleCompletion = (variant) => {
      const label = variant === "primary" ? "[curdx-flow] ALL_TASKS_COMPLETE detected in transcript" : "[curdx-flow] ALL_TASKS_COMPLETE detected in transcript (tail-end)";
      process5.stderr.write(label + "\n");
      let epicName;
      try {
        const st = JSON.parse(readFileSync3(stateFile, "utf8"));
        epicName = typeof st.epicName === "string" && st.epicName.length > 0 ? st.epicName : void 0;
      } catch {
        epicName = void 0;
      }
      const currentEpicFile = join2(cwd, "specs", ".current-epic");
      if (epicName && existsSync2(currentEpicFile)) {
        markSpecCompletedInEpic(cwd, epicName, specName);
      }
      fireUpdateSpecIndex();
    };
    if (tailContainsCompletionMarker(transcriptPath, 500)) {
      handleCompletion("primary");
      return;
    }
    if (tailContainsCompletionMarker(transcriptPath, 20)) {
      handleCompletion("fallback");
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
  const taskIteration = typeof state.taskIteration === "number" ? state.taskIteration : 1;
  const quickMode = state.quickMode === true;
  const nativeSync = defaultTrueIfFalsyOrNull(state.nativeSyncEnabled);
  const globalIteration = typeof state.globalIteration === "number" ? state.globalIteration : 1;
  const maxGlobal = typeof state.maxGlobalIterations === "number" ? state.maxGlobalIterations : 100;
  if (globalIteration >= maxGlobal) {
    process5.stderr.write(
      `[curdx-flow] ERROR: Maximum global iterations (${maxGlobal}) reached. Review .progress.md for failure patterns.
`
    );
    process5.stderr.write(
      `[curdx-flow] Recovery: fix issues manually, then run /curdx-flow:implement or /curdx-flow:cancel
`
    );
    return;
  }
  if (quickMode && phase !== "execution") {
    if (input.stop_hook_active === true) {
      process5.stderr.write(
        `[curdx-flow] stop_hook_active=true in quick mode, allowing stop to prevent loop
`
      );
      return;
    }
    return buildQuickModeBlock(phase, specName);
  }
  if (phase === "execution") {
    process5.stderr.write(
      `[curdx-flow] Session stopped during spec: ${specName} | Task: ${taskIndex + 1}/${totalTasks} | Attempt: ${taskIteration}
`
    );
  }
  if (phase === "execution" && taskIndex >= totalTasks && totalTasks > 0) {
    const tasksFile = join2(cwd, specPath, "tasks.md");
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
    const recoveryMode = state.recoveryMode === true;
    const maxTaskIter = typeof state.maxTaskIterations === "number" ? state.maxTaskIterations : 5;
    if (input.stop_hook_active === true) {
      process5.stderr.write(
        `[curdx-flow] stop_hook_active=true, skipping continuation to prevent re-invocation loop
`
      );
      return;
    }
    const tasksFile = join2(cwd, specPath, "tasks.md");
    let taskBlock = "";
    if (existsSync2(tasksFile)) {
      let tasksMd = "";
      try {
        tasksMd = readFileSync3(tasksFile, "utf8");
      } catch {
        tasksMd = "";
      }
      taskBlock = extractTaskBlock(tasksMd, taskIndex);
    }
    const firstLine = taskBlock.split("\n", 1)[0] ?? "";
    let isParallel = /\[P\]/.test(firstLine);
    if (isParallel && existsSync2(tasksFile)) {
      let tasksMd = "";
      try {
        tasksMd = readFileSync3(tasksFile, "utf8");
      } catch {
        tasksMd = "";
      }
      const parallelTasks = extractParallelGroupBlock(tasksMd, taskIndex);
      if (parallelTasks.length > 0) {
        taskBlock = parallelTasks;
      } else {
        isParallel = false;
      }
    }
    cleanupStaleProgressFiles(join2(cwd, specPath));
    return buildContinuationBlock({
      specName,
      specPath,
      taskIndex,
      totalTasks,
      taskIteration,
      maxTaskIter,
      globalIteration,
      recoveryMode,
      nativeSync,
      taskBlock,
      isParallel
    });
  }
  cleanupStaleProgressFiles(join2(cwd, specPath));
});
//# sourceMappingURL=stop-watcher.mjs.map
