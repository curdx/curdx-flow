import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/update-spec-index.ts
import { existsSync as existsSync2, mkdirSync, readFileSync as readFileSync2, readdirSync as readdirSync2, statSync as statSync2 } from "node:fs";
import { join as join2, posix as posix2 } from "node:path";
import process4 from "node:process";

// src/hooks/_shared/atomic-write.ts
import { writeFileSync, renameSync } from "node:fs";
import { randomBytes } from "node:crypto";
function writeFileAtomic(path, data) {
  const tmp = `${path}.tmp.${process.pid}.${randomBytes(6).toString("hex")}`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
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
function findRepoRoot(start) {
  const origin = start ?? process.cwd();
  let cur = origin;
  for (let i = 0; i < 64; i++) {
    if (isDir(join(cur, ".git"))) return cur;
    if (existsSync(join(cur, SETTINGS_REL_PATH))) return cur;
    const parent = join(cur, "..");
    if (parent === cur) break;
    cur = parent;
  }
  return origin;
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
function listSpecs(opts) {
  const cwd = resolveCwd(opts);
  if (!isDir(cwd)) return [];
  const out = [];
  for (const entry of getSpecsDirs(opts)) {
    const dir = normalizePath(entry);
    const rootFs = isAbsolute(dir) ? dir : join(cwd, dir);
    if (!isDir(rootFs)) continue;
    let children;
    try {
      children = readdirSync(rootFs);
    } catch {
      continue;
    }
    for (const child of children) {
      if (child.startsWith(".")) continue;
      const childFs = join(rootFs, child);
      if (!isDir(childFs)) continue;
      out.push({
        name: basename(child),
        path: posix.join(dir, child)
      });
    }
  }
  return out;
}

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

// src/hooks/update-spec-index.ts
function parseArgs(argv) {
  return {
    quiet: argv.includes("--quiet"),
    dryRun: argv.includes("--dry-run")
  };
}
function isDir2(p) {
  try {
    return statSync2(p).isDirectory();
  } catch {
    return false;
  }
}
function countSpecsIn(dirFs) {
  if (!isDir2(dirFs)) return 0;
  let entries;
  try {
    entries = readdirSync2(dirFs);
  } catch {
    return 0;
  }
  let n = 0;
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    if (isDir2(join2(dirFs, name))) n++;
  }
  return n;
}
function specsDirFs(serialized, cwd) {
  if (serialized.startsWith("/") || /^[A-Za-z]:[\\/]/.test(serialized)) {
    return serialized;
  }
  return join2(cwd, serialized);
}
function preserveDotPrefix(specPath, specsDirs) {
  for (const dir of specsDirs) {
    if (!dir.startsWith("./")) continue;
    const body = dir.slice(2);
    if (body && specPath.startsWith(`${body}/`)) {
      return `./${specPath}`;
    }
  }
  return specPath;
}
function readState(specFs) {
  const stateFile = join2(specFs, ".curdx-state.json");
  if (!existsSync2(stateFile)) return null;
  try {
    return JSON.parse(readFileSync2(stateFile, "utf8"));
  } catch {
    return null;
  }
}
var TASK_LIST_PATTERN = /^[-*]\s+\[([ xX])\]\s+(?:\d+\.\d+|V\d+|VE\d+|VF)(?:\s|$)/gm;
function countTasks(raw) {
  let completed = 0;
  let total = 0;
  for (const m of raw.matchAll(TASK_LIST_PATTERN)) {
    total++;
    if (m[1] === "x" || m[1] === "X") completed++;
  }
  return { completed, total };
}
function inferPhaseFromFiles(specFs) {
  const tasksFile = join2(specFs, "tasks.md");
  if (existsSync2(tasksFile)) {
    let raw = "";
    try {
      raw = readFileSync2(tasksFile, "utf8");
    } catch {
      raw = "";
    }
    const { completed, total } = countTasks(raw);
    if (total > 0 && completed === total) {
      return { phase: "completed", completed, total };
    }
    if (total === 0 && existsSync2(join2(specFs, ".progress.md"))) {
      return { phase: "completed", completed: 0, total: 0 };
    }
    return { phase: "tasks", completed, total };
  }
  if (existsSync2(join2(specFs, "design.md"))) {
    return { phase: "design", completed: 0, total: 0 };
  }
  if (existsSync2(join2(specFs, "requirements.md"))) {
    return { phase: "requirements", completed: 0, total: 0 };
  }
  if (existsSync2(join2(specFs, "research.md"))) {
    return { phase: "research", completed: 0, total: 0 };
  }
  return { phase: "new", completed: 0, total: 0 };
}
function isoNow() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
}
function buildSpecRecord(entry, cwd, specsDirs) {
  const specFs = entry.path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(entry.path) ? entry.path : join2(cwd, entry.path);
  const state = readState(specFs);
  const record = {
    name: entry.name,
    path: preserveDotPrefix(entry.path, specsDirs),
    phase: "unknown"
  };
  if (state) {
    const phase = state.phase ?? "unknown";
    const taskIndex = typeof state.taskIndex === "number" ? state.taskIndex : 0;
    const totalTasks = typeof state.totalTasks === "number" ? state.totalTasks : 0;
    const awaiting = state.awaitingApproval === true;
    record.phase = phase;
    if (phase === "execution" || totalTasks > 0) {
      record.taskIndex = taskIndex;
      record.totalTasks = totalTasks;
    }
    if (awaiting) {
      record.awaitingApproval = true;
    }
    return record;
  }
  const inferred = inferPhaseFromFiles(specFs);
  record.phase = inferred.phase;
  if (inferred.total > 0) {
    record.taskIndex = inferred.completed;
    record.totalTasks = inferred.total;
  }
  return record;
}
function buildIndexState(cwd) {
  const opts = { cwd };
  const defaultDir = getDefaultDir(opts);
  const specsDirs = getSpecsDirs(opts);
  const directories = specsDirs.map((dir) => ({
    path: dir,
    specsCount: countSpecsIn(specsDirFs(dir, cwd)),
    isDefault: dir === defaultDir
  }));
  const specs = listSpecs(opts).map(
    (s) => buildSpecRecord(s, cwd, specsDirs)
  );
  return {
    version: "1.0",
    updated: isoNow(),
    directories,
    specs
  };
}
function buildIndexMarkdown(state, cwd) {
  const dirCount = state.directories.length;
  const totalSpecs = state.directories.reduce(
    (acc, d) => acc + d.specsCount,
    0
  );
  const lines = [];
  lines.push("# Spec Index");
  lines.push("");
  lines.push(
    "Auto-generated summary of all specs across configured directories."
  );
  lines.push("See [index-state.json](./index-state.json) for machine-readable data.");
  lines.push("");
  lines.push(`**Last updated:** ${state.updated}`);
  lines.push("");
  lines.push(`## Directories (${dirCount})`);
  lines.push("");
  lines.push("| Directory | Specs | Default |");
  lines.push("|-----------|-------|---------|");
  for (const d of state.directories) {
    const marker = d.isDefault ? "Yes" : "";
    lines.push(`| ${d.path} | ${d.specsCount} | ${marker} |`);
  }
  lines.push("");
  lines.push(`## All Specs (${totalSpecs})`);
  lines.push("");
  lines.push("| Spec | Directory | Phase | Status |");
  lines.push("|------|-----------|-------|--------|");
  const specsDirs = getSpecsDirs({ cwd });
  for (const entry of listSpecs({ cwd })) {
    const restored = preserveDotPrefix(entry.path, specsDirs);
    const dir = posix2.dirname(restored);
    const specFs = entry.path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(entry.path) ? entry.path : join2(cwd, entry.path);
    const status = computeStatusCell(specFs);
    const phase = computePhaseCell(specFs);
    lines.push(`| ${entry.name} | ${dir} | ${phase} | ${status} |`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("**Commands:**");
  lines.push("- `/curdx-flow:status` - Show detailed status");
  lines.push("- `/curdx-flow:switch <name>` - Switch active spec");
  lines.push("- `/curdx-flow:start <name>` - Create or resume spec");
  lines.push("");
  return lines.join("\n");
}
function computePhaseCell(specFs) {
  const state = readState(specFs);
  if (state) return state.phase ?? "unknown";
  return inferPhaseFromFiles(specFs).phase;
}
function computeStatusCell(specFs) {
  const state = readState(specFs);
  if (state) {
    const phase = state.phase ?? "unknown";
    const taskIndex = typeof state.taskIndex === "number" ? state.taskIndex : 0;
    const totalTasks = typeof state.totalTasks === "number" ? state.totalTasks : 0;
    const awaiting = state.awaitingApproval === true;
    if (phase === "execution") return `${taskIndex}/${totalTasks} tasks`;
    if (awaiting) return "awaiting approval";
    return "";
  }
  const inferred = inferPhaseFromFiles(specFs);
  if (inferred.phase === "completed") return "done";
  if (inferred.phase === "tasks") {
    return `${inferred.completed}/${inferred.total} tasks`;
  }
  return "";
}
function formatIndexJson(state) {
  return JSON.stringify(state, null, 2) + "\n";
}
function log(opts, msg) {
  if (!opts.quiet) {
    process4.stderr.write(`${msg}
`);
  }
}
runHook(
  async () => {
    const opts = parseArgs(process4.argv.slice(2));
    const cwd = findRepoRoot();
    const state = buildIndexState(cwd);
    const markdown = buildIndexMarkdown(state, cwd);
    const jsonText = formatIndexJson(state);
    if (opts.dryRun) {
      process4.stdout.write(jsonText);
      return;
    }
    const defaultDir = getDefaultDir({ cwd });
    const indexDirFs = join2(cwd, defaultDir, ".index");
    mkdirSync(indexDirFs, { recursive: true });
    const jsonOut = join2(indexDirFs, "index-state.json");
    const mdOut = join2(indexDirFs, "index.md");
    writeFileAtomic(jsonOut, jsonText);
    log(opts, `Updated ${jsonOut}`);
    writeFileAtomic(mdOut, markdown);
    log(opts, `Updated ${mdOut}`);
    const totalSpecs = state.directories.reduce(
      (acc, d) => acc + d.specsCount,
      0
    );
    log(
      opts,
      `Spec index updated: ${totalSpecs} specs in ${state.directories.length} directories`
    );
  },
  { readStdin: false }
);
//# sourceMappingURL=update-spec-index.mjs.map
