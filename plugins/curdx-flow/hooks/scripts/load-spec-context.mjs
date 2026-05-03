import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/load-spec-context.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { basename as basename2, join as join2 } from "node:path";
import process4 from "node:process";

// src/hooks/_shared/run-hook.ts
import process3 from "node:process";

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
    process2.exit(0);
  }
}

// src/hooks/_shared/run-hook.ts
async function runHook(handler, options = {}) {
  const { readStdin = true } = options;
  try {
    const stdin = readStdin ? await readStdinJson() : {};
    const output = await handler(stdin);
    if (output !== void 0 && output !== null) {
      process3.stdout.write(JSON.stringify(output) + "\n");
    }
    process3.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process3.stderr.write(`[hook] ${msg}
`);
    process3.exit(0);
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

// src/hooks/load-spec-context.ts
var SETTINGS_REL_PATH2 = ".claude/curdx-flow.local.md";
var INACTIVE = { active: false };
function readEnabledSetting(settingsPath) {
  let raw;
  try {
    raw = readFileSync2(settingsPath, "utf8");
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
function readGoalFromProgress(progressPath) {
  let raw;
  try {
    raw = readFileSync2(progressPath, "utf8");
  } catch {
    return null;
  }
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (/^## Original Goal\s*$/.test(lines[i] ?? "")) {
      const next = lines[i + 1] ?? "";
      const trimmed = next.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
  }
  return null;
}
runHook(async (input) => {
  const cwd = input?.cwd;
  if (!cwd) {
    return INACTIVE;
  }
  const settingsPath = join2(cwd, SETTINGS_REL_PATH2);
  if (existsSync2(settingsPath)) {
    const enabled = readEnabledSetting(settingsPath);
    if (enabled === "false") {
      return INACTIVE;
    }
  }
  const specRelativePath = resolveCurrent({ cwd });
  if (!specRelativePath) {
    return INACTIVE;
  }
  const specPath = join2(cwd, specRelativePath);
  const specName = basename2(specRelativePath);
  try {
    const { statSync: statSync2 } = await import("node:fs");
    if (!statSync2(specPath).isDirectory()) {
      return INACTIVE;
    }
  } catch {
    return INACTIVE;
  }
  const stateFile = join2(specPath, ".curdx-state.json");
  const progressFile = join2(specPath, ".progress.md");
  process4.stderr.write(`[curdx-flow] Active spec detected: ${specName}
`);
  const block = {
    active: true,
    specName,
    specPath: specRelativePath
  };
  let state = null;
  if (existsSync2(stateFile)) {
    try {
      state = JSON.parse(readFileSync2(stateFile, "utf8"));
    } catch {
      state = null;
    }
  }
  if (state) {
    const phase = state.phase ?? "unknown";
    const taskIndex = typeof state.taskIndex === "number" ? state.taskIndex : 0;
    const totalTasks = typeof state.totalTasks === "number" ? state.totalTasks : 0;
    const awaiting = state.awaitingApproval === true;
    block.phase = phase;
    block.taskIndex = taskIndex;
    block.totalTasks = totalTasks;
    block.awaitingApproval = awaiting;
    process4.stderr.write(
      `[curdx-flow] Phase: ${phase} | Task: ${taskIndex + 1}/${totalTasks} | Awaiting approval: ${awaiting}
`
    );
    if (phase === "execution" && !awaiting) {
      process4.stderr.write(
        `[curdx-flow] Execution in progress. Run /curdx-flow:implement to continue.
`
      );
    } else if (awaiting) {
      switch (phase) {
        case "research":
          process4.stderr.write(
            `[curdx-flow] Research complete. Run /curdx-flow:requirements to continue.
`
          );
          break;
        case "requirements":
          process4.stderr.write(
            `[curdx-flow] Requirements complete. Run /curdx-flow:design to continue.
`
          );
          break;
        case "design":
          process4.stderr.write(
            `[curdx-flow] Design complete. Run /curdx-flow:tasks to continue.
`
          );
          break;
        case "tasks":
          process4.stderr.write(
            `[curdx-flow] Tasks complete. Run /curdx-flow:implement to start execution.
`
          );
          break;
      }
    }
  } else {
    if (existsSync2(join2(specPath, "tasks.md"))) {
      process4.stderr.write(
        `[curdx-flow] Tasks defined but no execution state. Run /curdx-flow:implement to start.
`
      );
    } else if (existsSync2(join2(specPath, "design.md"))) {
      process4.stderr.write(
        `[curdx-flow] Design exists. Run /curdx-flow:tasks to generate tasks.
`
      );
    } else if (existsSync2(join2(specPath, "requirements.md"))) {
      process4.stderr.write(
        `[curdx-flow] Requirements exist. Run /curdx-flow:design to continue.
`
      );
    } else if (existsSync2(join2(specPath, "research.md"))) {
      process4.stderr.write(
        `[curdx-flow] Research exists. Run /curdx-flow:requirements to continue.
`
      );
    }
  }
  if (existsSync2(progressFile)) {
    const goal = readGoalFromProgress(progressFile);
    if (goal) {
      block.goal = goal;
      process4.stderr.write(`[curdx-flow] Goal: ${goal}
`);
    }
  }
  return block;
});
//# sourceMappingURL=load-spec-context.mjs.map
