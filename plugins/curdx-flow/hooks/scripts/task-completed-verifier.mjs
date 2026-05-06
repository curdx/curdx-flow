import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/task-completed-verifier.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { join as join3 } from "node:path";
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
import { join as join2 } from "node:path";
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
    return {
      ok: false,
      reason: `Stale evidence: src changed at ${srcIso}, last verified at ${block.timestamp}. Re-run: ${block.command}.`,
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

// src/hooks/task-completed-verifier.ts
function passThrough() {
  process3.stdout.write(JSON.stringify({ continue: true }));
  process3.exit(0);
}
function emitBlock(reason) {
  process3.stdout.write(JSON.stringify({ decision: "block", reason }));
  process3.exit(2);
}
async function main() {
  let input;
  try {
    input = await readStdinJson();
  } catch {
    passThrough();
  }
  if (input.hook_event_name !== "TaskCompleted") {
    passThrough();
  }
  if (typeof input.task_id !== "string" || input.task_id.length === 0) {
    passThrough();
  }
  const cwd = typeof input.cwd === "string" && input.cwd.length > 0 ? input.cwd : process3.cwd();
  const specPath = resolveCurrent({ cwd });
  if (!specPath) {
    passThrough();
  }
  const specDir = join3(cwd, specPath);
  const stateFile = join3(specDir, ".curdx-state.json");
  if (!existsSync2(stateFile)) {
    passThrough();
  }
  let state;
  try {
    state = JSON.parse(readFileSync2(stateFile, "utf8"));
  } catch {
    passThrough();
  }
  const phase = getVerificationPhase(state);
  if (phase === null) {
    passThrough();
  }
  const result = await verifyPhaseBlock(state, phase, specDir);
  if (!result.ok) {
    emitBlock(result.reason ?? "verification failed");
  }
  process3.exit(0);
}
main().catch((err) => {
  const stack = err instanceof Error ? err.stack ?? err.message : String(err);
  process3.stderr.write(`[task-completed-verifier] ${stack}
`);
  emitBlock("internal error in verify-blocks; see logs");
});
//# sourceMappingURL=task-completed-verifier.mjs.map
