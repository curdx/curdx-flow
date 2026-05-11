import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/lib/runtime-cli.ts
import { spawnSync } from "node:child_process";
import { existsSync as existsSync6, readFileSync as readFileSync6, statSync as statSync5 } from "node:fs";
import { basename as basename7, dirname, isAbsolute as isAbsolute4, join as join4, resolve as resolve2 } from "node:path";
import { fileURLToPath as fileURLToPath6 } from "node:url";

// src/hooks/lib/smart-route.ts
import { existsSync as existsSync3, readFileSync as readFileSync3 } from "node:fs";
import { basename as basename5, join as join2 } from "node:path";
import { fileURLToPath as fileURLToPath4 } from "node:url";

// src/hooks/lib/auto-policy.ts
import { fileURLToPath } from "node:url";
import { basename } from "node:path";
var LOW_RISK_RE = /\b(readme|docs?|documentation|typo|copy|wording|comment|comments|changelog|license|format text|rename label|css copy|style text)\b/i;
var HIGH_RISK_RE = /\b(auth|authentication|authorization|permission|permissions|security|secret|secrets|token|password|oauth|payment|billing|invoice|migration|database|schema|release|publish|tag|manifest|plugin\.json|claude-plugin|hooks?\.json|hook|subagent|agent|sandbox|delete|remove|destructive|data loss|concurrency|race|cache|cost|pricing)\b/i;
var CRITICAL_RISK_RE = /\b(payment|billing|security|secret|secrets|password|token|oauth|authorization|permission|migration|data loss|release|publish|tag|hooks?\.json|plugin\.json|claude-plugin)\b/i;
var XL_RE = /\b(epic|multi-spec|multiple specs|multiple subsystems|cross-system|whole app|entire app|rewrite|rebuild|platform|framework migration|全量|重写|多个子系统|史诗)\b/i;
var ADD_OR_FIX_RE = /\b(add|build|create|implement|support|fix|debug|repair|resolve|refactor|change|modify|update)\b/i;
function normalizeWords(input) {
  return (input ?? "").trim().replace(/\s+/g, " ");
}
function parseFlags(flags) {
  const text = ` ${flags ?? ""} `;
  const modeMatch = text.match(/\s--mode\s+(auto|fast|deep)(?=\s|$)/);
  const tasksMatch = text.match(
    /\s--tasks-size\s+(auto|coarse|standard|fine)(?=\s|$)/
  );
  const reviewMatch = text.match(
    /\s--review\s+(minimal|standard|strict)(?=\s|$)/
  );
  return {
    mode: modeMatch?.[1] ?? "auto",
    tasksSize: tasksMatch?.[1],
    review: reviewMatch?.[1]
  };
}
function countDistinctDirs(files) {
  const dirs = /* @__PURE__ */ new Set();
  for (const file of files) {
    const parts = file.split(/[\\/]+/).filter(Boolean);
    if (parts.length <= 1) {
      dirs.add(".");
    } else {
      dirs.add(parts.slice(0, Math.min(2, parts.length - 1)).join("/"));
    }
  }
  return dirs.size;
}
function bumpRisk(a, b) {
  const order = ["low", "medium", "high", "critical"];
  return order[Math.max(order.indexOf(a), order.indexOf(b))];
}
function classifyRisk(goal, files, fileCount) {
  let risk = "medium";
  const reasons = [];
  if (LOW_RISK_RE.test(goal)) {
    risk = "low";
    reasons.push("low-risk wording/docs signal");
  }
  if (!ADD_OR_FIX_RE.test(goal) && fileCount <= 2) {
    risk = bumpRisk(risk, "low");
    reasons.push("small unclear change; keep validation targeted");
  }
  if (HIGH_RISK_RE.test(goal) || files.some((f) => HIGH_RISK_RE.test(f))) {
    risk = bumpRisk(risk, "high");
    reasons.push("high-risk domain or publish-critical file");
  }
  if (CRITICAL_RISK_RE.test(goal) || files.some((f) => CRITICAL_RISK_RE.test(f))) {
    risk = bumpRisk(risk, "critical");
    reasons.push("critical security/data/release/plugin surface");
  }
  if (fileCount >= 9) {
    risk = bumpRisk(risk, "high");
    reasons.push("large file surface");
  }
  if (countDistinctDirs(files) >= 4) {
    risk = bumpRisk(risk, "high");
    reasons.push("cross-directory blast radius");
  }
  return { risk, reasons };
}
function classifySize(args) {
  const reasons = [];
  let size;
  if (XL_RE.test(args.goal) || args.fileCount >= 16 || args.dirCount >= 6 || typeof args.taskCount === "number" && args.taskCount > 12) {
    size = "XL";
    reasons.push("epic or oversized task/file surface");
  } else if (args.risk === "critical" || args.fileCount >= 9) {
    size = "L";
    reasons.push("critical/high blast radius requires deep spec");
  } else if (args.risk === "high" || args.fileCount >= 4) {
    size = "M";
    reasons.push("moderate implementation surface");
  } else if (args.risk === "low" && args.fileCount <= 1) {
    size = "XS";
    reasons.push("single low-risk change");
  } else if (args.fileCount <= 3) {
    size = "S";
    reasons.push("small bounded change");
  } else {
    size = "M";
    reasons.push("default standard slice");
  }
  if (args.mode === "deep" && size !== "XL") {
    size = size === "XS" || size === "S" ? "M" : "L";
    reasons.push("explicit deep mode");
  }
  if (args.mode === "fast" && size === "L" && args.risk !== "critical") {
    size = "M";
    reasons.push("explicit fast mode without critical risk");
  }
  return { size, reasons };
}
function policyForSize(size) {
  switch (size) {
    case "XS":
      return {
        executionMode: "direct",
        taskGranularity: "none",
        taskTargetRange: { min: 0, max: 1 },
        reviewCadence: "minimal",
        verificationLevel: "targeted",
        subagentPolicy: "none",
        stopHookPolicy: "disabled",
        maxGlobalIterations: 5,
        maxTaskIterations: 2
      };
    case "S":
      return {
        executionMode: "spec-lite",
        taskGranularity: "coarse",
        taskTargetRange: { min: 1, max: 3 },
        reviewCadence: "minimal",
        verificationLevel: "targeted",
        subagentPolicy: "none",
        stopHookPolicy: "disabled",
        maxGlobalIterations: 8,
        maxTaskIterations: 3
      };
    case "M":
      return {
        executionMode: "standard",
        taskGranularity: "standard",
        taskTargetRange: { min: 3, max: 7 },
        reviewCadence: "final",
        verificationLevel: "standard",
        subagentPolicy: "on-demand",
        stopHookPolicy: "short-continuation",
        maxGlobalIterations: 18,
        maxTaskIterations: 4
      };
    case "L":
      return {
        executionMode: "deep-spec",
        taskGranularity: "standard",
        taskTargetRange: { min: 5, max: 12 },
        reviewCadence: "periodic",
        verificationLevel: "strict",
        subagentPolicy: "per-slice",
        stopHookPolicy: "short-continuation",
        maxGlobalIterations: 30,
        maxTaskIterations: 5
      };
    case "XL":
      return {
        executionMode: "epic-triage",
        taskGranularity: "standard",
        taskTargetRange: { min: 5, max: 10 },
        reviewCadence: "strict",
        verificationLevel: "strict",
        subagentPolicy: "per-slice",
        stopHookPolicy: "short-continuation",
        maxGlobalIterations: 30,
        maxTaskIterations: 5
      };
  }
}
function applyOverrides(policy, overrides) {
  const next = { ...policy };
  if (overrides.tasksSize !== void 0 && overrides.tasksSize !== "auto") {
    next.taskGranularity = overrides.tasksSize;
    next.reasons = [...next.reasons, `explicit tasks-size=${overrides.tasksSize}`];
  }
  if (overrides.review === "minimal") {
    next.reviewCadence = "minimal";
    next.reasons = [...next.reasons, "explicit review=minimal"];
  } else if (overrides.review === "strict") {
    next.reviewCadence = "strict";
    next.verificationLevel = "strict";
    next.reasons = [...next.reasons, "explicit review=strict"];
  }
  return next;
}
function classifyAutoPolicy(input) {
  const goal = normalizeWords(input.goal);
  const flags = parseFlags(input.flags);
  const changedFiles = input.changedFiles ?? [];
  const estimatedFiles = typeof input.estimatedFiles === "number" && Number.isFinite(input.estimatedFiles) ? Math.max(0, Math.floor(input.estimatedFiles)) : changedFiles.length;
  const fileCount = Math.max(estimatedFiles, changedFiles.length);
  const dirCount = countDistinctDirs(changedFiles);
  const riskResult = classifyRisk(goal, changedFiles, fileCount);
  const sizeResult = classifySize({
    goal,
    risk: riskResult.risk,
    fileCount,
    dirCount,
    taskCount: input.taskCount,
    mode: flags.mode
  });
  const base = policyForSize(sizeResult.size);
  const taskCount = input.taskCount;
  const shouldSplitSpec = sizeResult.size === "XL" || typeof taskCount === "number" && taskCount > base.taskTargetRange.max;
  return applyOverrides(
    {
      version: 1,
      mode: flags.mode,
      size: sizeResult.size,
      risk: riskResult.risk,
      shouldSplitSpec,
      reasons: [...riskResult.reasons, ...sizeResult.reasons],
      ...base
    },
    flags
  );
}
function parseList(value) {
  if (!value) return [];
  return value.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}
function readArg(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function main() {
  const argv = process.argv.slice(2);
  const goal = readArg("--goal", argv) ?? "";
  const flags = readArg("--flags", argv) ?? "";
  const files = parseList(readArg("--files", argv));
  const estimatedRaw = readArg("--estimated-files", argv);
  const taskRaw = readArg("--task-count", argv);
  const policy = classifyAutoPolicy({
    goal,
    flags,
    changedFiles: files,
    estimatedFiles: estimatedRaw === void 0 ? void 0 : Number(estimatedRaw),
    taskCount: taskRaw === void 0 ? void 0 : Number(taskRaw)
  });
  process.stdout.write(JSON.stringify(policy, null, 2) + "\n");
}
function isDirectRun() {
  try {
    const entry = fileURLToPath(import.meta.url);
    return process.argv[1] === entry && basename(entry).startsWith("auto-policy.");
  } catch {
    return false;
  }
}
if (isDirectRun()) {
  main();
}

// src/hooks/lib/project-topology.ts
import {
  existsSync as existsSync2,
  readFileSync as readFileSync2,
  readdirSync as readdirSync2,
  statSync as statSync2
} from "node:fs";
import { homedir } from "node:os";
import path, { basename as basename3, isAbsolute as isAbsolute2, relative, resolve } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/hooks/_shared/path-resolver.ts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename as basename2, isAbsolute, join, posix } from "node:path";
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
function findSpec(name, opts) {
  if (!name) {
    return { ok: false, reason: "not-found", name: "" };
  }
  const cwd = resolveCwd(opts);
  if (!isDir(cwd)) {
    return { ok: false, reason: "not-found", name };
  }
  let cleaned = normalizePath(name);
  if (cleaned.startsWith("./")) cleaned = cleaned.slice(2);
  const matches = [];
  for (const entry of getSpecsDirs(opts)) {
    const dir = normalizePath(entry);
    const candidateFs = isAbsolute(dir) ? join(dir, cleaned) : join(cwd, dir, cleaned);
    if (isDir(candidateFs)) {
      matches.push(posix.join(dir, cleaned));
    }
  }
  if (matches.length === 0) {
    return { ok: false, reason: "not-found", name: cleaned };
  }
  if (matches.length === 1) {
    return { ok: true, path: matches[0] };
  }
  return { ok: false, reason: "ambiguous", name: cleaned, matches };
}
function resolveCurrent(opts) {
  const cwd = resolveCwd(opts);
  if (!isDir(cwd)) return null;
  const defaultDir = getDefaultDir(opts);
  const markerFs = [
    join(cwd, defaultDir, ".current-spec"),
    join(cwd, ".current-spec")
  ].find((candidate) => existsSync(candidate));
  if (!markerFs) return null;
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
  if (normalized.startsWith("./") || normalized.startsWith("../") || normalized.includes("/") || isAbsolute(normalized)) {
    return normalized;
  }
  return posix.join(defaultDir, normalized);
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
        name: basename2(child),
        path: posix.join(dir, child)
      });
    }
  }
  return out;
}

// src/hooks/lib/project-topology.ts
var FRONTEND_KEY_RE = /^(frontend|front-end|web|ui|client|admin|前端)$/i;
var BACKEND_KEY_RE = /^(backend|back-end|api|server|service|后端)$/i;
var SHARED_KEY_RE = /^(shared|common|contracts?|types?|sdk|共享|协议)$/i;
var INFRA_KEY_RE = /^(infra|infrastructure|deploy|ops|devops|docker|k8s)$/i;
var MOBILE_KEY_RE = /^(mobile|ios|android|app)$/i;
var DATABASE_KEY_RE = /^(database|db|mysql|postgres|postgresql|redis|mongo|数据库)$/i;
var UI_GOAL_RE = /\b(ui|ux|frontend|front-end|react|vue|vite|next|nuxt|page|screen|component|button|form|css|style|layout|页面|前端|组件|样式)\b/i;
var BACKEND_GOAL_RE = /\b(backend|back-end|api|endpoint|controller|service|spring|spring boot|spring cloud|dto|entity|repository|database|db|migration|接口|后端|数据库)\b/i;
var CONTRACT_GOAL_RE = /\b(contract|openapi|swagger|api response|dto|schema|client generation|接口字段|接口返回|契约)\b/i;
var AUTH_GOAL_RE = /\b(auth|login|logout|session|permission|oauth|jwt|登录|鉴权|权限)\b/i;
function isDir2(p) {
  try {
    return statSync2(p).isDirectory();
  } catch {
    return false;
  }
}
function isFile(p) {
  try {
    return statSync2(p).isFile();
  } catch {
    return false;
  }
}
function readText(file) {
  try {
    return readFileSync2(file, "utf8");
  } catch {
    return "";
  }
}
function normalizeSerializedPath(input) {
  const trimmed = input.trim().replace(/^["'`]+|["'`]+$/g, "");
  if (!trimmed || trimmed === "./") return ".";
  return trimmed.replace(/\\/g, "/").replace(/\/+$/, "") || ".";
}
function toPosixPath(p) {
  return p.split(path.sep).join("/");
}
function relativeOrDot(from, to) {
  const rel = toPosixPath(relative(from, to));
  return rel.length === 0 ? "." : rel;
}
function roleFromKey(key) {
  const normalized = key.trim().toLowerCase();
  if (FRONTEND_KEY_RE.test(normalized)) return "frontend";
  if (BACKEND_KEY_RE.test(normalized)) return "backend";
  if (SHARED_KEY_RE.test(normalized)) return "shared";
  if (INFRA_KEY_RE.test(normalized)) return "infra";
  if (MOBILE_KEY_RE.test(normalized)) return "mobile";
  if (DATABASE_KEY_RE.test(normalized)) return "database";
  return "auto";
}
function rootNameFromRole(role, fallbackPath) {
  if (role !== "auto" && role !== "unknown") return role;
  const base = basename3(fallbackPath);
  return base === "." || base === ".." || base.length === 0 ? "current" : base;
}
function extractFrontmatter(raw) {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*/);
  return match?.[1] ?? raw;
}
function cleanScalar(value) {
  return value.trim().replace(/^["']|["']$/g, "").replace(/\s+#.*$/, "").trim();
}
function parseCodeRootsFromCurdxSettings(projectRoot) {
  const settingsPath = path.join(projectRoot, ".claude", "curdx-flow.local.md");
  if (!isFile(settingsPath)) return [];
  const block = extractFrontmatter(readText(settingsPath));
  const lines = block.split(/\r?\n/);
  const roots = [];
  let inCodeRoots = false;
  let current;
  function flush() {
    if (!current?.path) return;
    const role = current.role ?? "auto";
    roots.push({
      name: current.name ?? rootNameFromRole(role, current.path),
      path: normalizeSerializedPath(current.path),
      role,
      source: "curdx-settings",
      confidence: 0.99
    });
    current = void 0;
  }
  for (const line of lines) {
    if (/^\s*code_roots\s*:/.test(line)) {
      inCodeRoots = true;
      continue;
    }
    if (!inCodeRoots) continue;
    if (/^\S/.test(line) && !/^\s*-/.test(line)) {
      flush();
      break;
    }
    const itemMatch = line.match(/^\s*-\s*(.*)$/);
    if (itemMatch) {
      flush();
      current = {};
      const inline = itemMatch[1]?.trim() ?? "";
      const inlineMatch = inline.match(/^(\w+)\s*:\s*(.+)$/);
      if (inlineMatch?.[1] && inlineMatch[2]) {
        const key2 = inlineMatch[1];
        const value2 = cleanScalar(inlineMatch[2]);
        if (key2 === "name") current.name = value2;
        if (key2 === "path") current.path = value2;
        if (key2 === "role" || key2 === "kind") {
          current.role = roleFromKey(value2);
        }
      }
      continue;
    }
    const propMatch = line.match(/^\s+(name|path|role|kind)\s*:\s*(.+)$/);
    if (!propMatch?.[1] || propMatch[2] === void 0) continue;
    current ??= {};
    const key = propMatch[1];
    const value = cleanScalar(propMatch[2]);
    if (key === "name") current.name = value;
    if (key === "path") current.path = value;
    if (key === "role" || key === "kind") current.role = roleFromKey(value);
  }
  flush();
  return roots.filter((r) => r.role !== "database");
}
function claudeMdCandidates(projectRoot) {
  return [
    path.join(projectRoot, "CLAUDE.md"),
    path.join(projectRoot, ".claude", "CLAUDE.md"),
    path.join(projectRoot, "CLAUDE.local.md")
  ];
}
function extractDevBlocks(raw) {
  const lines = raw.split(/\r?\n/);
  const blocks = [];
  let activeLevel = 0;
  let current = [];
  function flush() {
    if (current.length > 0) {
      blocks.push(current.join("\n"));
      current = [];
    }
  }
  for (const line of lines) {
    const header = line.match(/^(#{1,4})\s+(.+?)\s*$/);
    if (header?.[1] && header[2]) {
      const level = header[1].length;
      const title = header[2].trim().toLowerCase();
      if (activeLevel > 0 && level <= activeLevel) {
        flush();
        activeLevel = 0;
      }
      if (/\b(dev|development|local services|local development)\b/i.test(title) || /(开发|本地开发|开发环境)/.test(title)) {
        activeLevel = level;
        current = [];
      }
      continue;
    }
    if (activeLevel > 0) current.push(line);
  }
  flush();
  return blocks;
}
function parseRootsFromDevText(text) {
  const roots = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:[-*]\s*)?([A-Za-z\u4e00-\u9fa5][\w\u4e00-\u9fa5 -]{0,40})\s*[:：]\s*(.+?)\s*$/
    );
    if (!match?.[1] || match[2] === void 0) continue;
    const key = match[1].trim();
    const role = roleFromKey(key);
    if (role === "database" || role === "unknown") continue;
    const value = normalizeSerializedPath(match[2].split(/\s+/)[0] ?? "");
    if (!value || value.includes("://") || value.startsWith("$")) continue;
    roots.push({
      name: rootNameFromRole(role, value),
      path: value,
      role,
      source: "claude-md",
      confidence: 0.95
    });
  }
  return roots;
}
function parseRootsFromClaudeMd(projectRoot) {
  const roots = [];
  const warnings = [];
  let devContextFound = false;
  for (const file of claudeMdCandidates(projectRoot)) {
    if (!isFile(file)) continue;
    const raw = readText(file);
    const blocks = extractDevBlocks(raw);
    if (blocks.length === 0) continue;
    devContextFound = true;
    for (const block of blocks) {
      roots.push(...parseRootsFromDevText(block));
      if (/(password|passwd|token|secret|jdbc:|mysql:\/\/|postgres:\/\/|mongodb:\/\/|redis:\/\/)/i.test(block)) {
        warnings.push(
          "Dev context mentions database or sensitive-looking values; topology output stores only paths and omits credentials."
        );
      }
    }
  }
  return { roots, devContextFound, warnings };
}
function readJsonObject(file) {
  try {
    const parsed = JSON.parse(readFileSync2(file, "utf8"));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function stringRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}
function hasDep(pkg, name) {
  if (!pkg) return false;
  const deps = {
    ...stringRecord(pkg["dependencies"]),
    ...stringRecord(pkg["devDependencies"]),
    ...stringRecord(pkg["peerDependencies"])
  };
  return Object.prototype.hasOwnProperty.call(deps, name);
}
function hasAnyDep(pkg, names) {
  return names.some((name) => hasDep(pkg, name));
}
function detectPackageManager(rootAbs) {
  if (isFile(path.join(rootAbs, "pnpm-lock.yaml")) || isFile(path.join(rootAbs, "pnpm-workspace.yaml"))) {
    return "pnpm";
  }
  if (isFile(path.join(rootAbs, "yarn.lock"))) return "yarn";
  if (isFile(path.join(rootAbs, "package-lock.json"))) return "npm";
  if (isFile(path.join(rootAbs, "bun.lockb")) || isFile(path.join(rootAbs, "bun.lock"))) return "bun";
  if (isFile(path.join(rootAbs, "pom.xml"))) return "maven";
  if (isFile(path.join(rootAbs, "build.gradle")) || isFile(path.join(rootAbs, "build.gradle.kts"))) return "gradle";
  return void 0;
}
function pushUnique(items, item) {
  if (!items.includes(item)) items.push(item);
}
function classifyRoot(rootAbs, role) {
  const kinds = [];
  const frameworks = [];
  const pkg = readJsonObject(path.join(rootAbs, "package.json"));
  const pom = readText(path.join(rootAbs, "pom.xml"));
  const gradle = [
    readText(path.join(rootAbs, "build.gradle")),
    readText(path.join(rootAbs, "build.gradle.kts"))
  ].join("\n");
  const buildText = `${pom}
${gradle}`;
  if (isFile(path.join(rootAbs, ".claude-plugin", "plugin.json"))) {
    pushUnique(kinds, "claude-code-plugin");
    frameworks.push("claude-code-plugin");
  }
  if (pkg) {
    if (hasDep(pkg, "react") || hasDep(pkg, "next")) {
      pushUnique(kinds, "frontend-app");
      frameworks.push(hasDep(pkg, "next") ? "next" : "react");
    }
    if (hasDep(pkg, "vue") || hasDep(pkg, "nuxt")) {
      pushUnique(kinds, "frontend-app");
      frameworks.push(hasDep(pkg, "nuxt") ? "nuxt" : "vue");
    }
    if (hasDep(pkg, "vite") || isFile(path.join(rootAbs, "vite.config.ts")) || isFile(path.join(rootAbs, "vite.config.js"))) {
      pushUnique(kinds, "frontend-app");
      if (!frameworks.includes("vite")) frameworks.push("vite");
    }
    if (hasAnyDep(pkg, ["express", "fastify", "koa", "@nestjs/core", "hono"])) {
      pushUnique(kinds, "backend-service");
      if (hasDep(pkg, "@nestjs/core")) frameworks.push("nestjs");
      else if (hasDep(pkg, "fastify")) frameworks.push("fastify");
      else if (hasDep(pkg, "hono")) frameworks.push("hono");
      else frameworks.push("node-api");
    }
    if (typeof pkg["bin"] === "string" || pkg["bin"] && typeof pkg["bin"] === "object") {
      pushUnique(kinds, "cli");
    }
    if (role === "shared") pushUnique(kinds, "shared-library");
  }
  if (/spring-boot-starter/i.test(buildText)) {
    pushUnique(kinds, "backend-service");
    frameworks.push("spring-boot");
  }
  if (/spring-cloud/i.test(buildText)) {
    pushUnique(kinds, "backend-service");
    frameworks.push("spring-cloud");
  }
  if (isDir2(path.join(rootAbs, "src", "main", "java"))) {
    pushUnique(kinds, "backend-service");
    if (!frameworks.includes("java")) frameworks.push("java");
  }
  if (isFile(path.join(rootAbs, "go.mod"))) {
    pushUnique(kinds, "backend-service");
    frameworks.push("go");
  }
  if (isFile(path.join(rootAbs, "pyproject.toml"))) {
    const pyproject = readText(path.join(rootAbs, "pyproject.toml"));
    if (/(fastapi|django|flask)/i.test(pyproject)) {
      pushUnique(kinds, "backend-service");
      frameworks.push(/fastapi/i.test(pyproject) ? "fastapi" : /django/i.test(pyproject) ? "django" : "flask");
    }
  }
  if (isFile(path.join(rootAbs, "Dockerfile")) || isFile(path.join(rootAbs, "docker-compose.yml")) || isFile(path.join(rootAbs, "docker-compose.yaml"))) {
    pushUnique(kinds, "infra");
  }
  if (role === "frontend") pushUnique(kinds, "frontend-app");
  if (role === "backend") pushUnique(kinds, "backend-service");
  if (role === "plugin") pushUnique(kinds, "claude-code-plugin");
  if (role === "infra") pushUnique(kinds, "infra");
  if (role === "mobile") pushUnique(kinds, "mobile-app");
  if (kinds.length === 0) kinds.push("unknown");
  return {
    kinds,
    frameworks: [...new Set(frameworks)],
    packageManager: detectPackageManager(rootAbs)
  };
}
function settingsAdditionalDirectories(projectRoot) {
  const entries = [];
  const candidates = [
    { file: path.join(projectRoot, ".claude", "settings.json"), base: projectRoot },
    { file: path.join(projectRoot, ".claude", "settings.local.json"), base: projectRoot },
    { file: path.join(homedir(), ".claude", "settings.json"), base: path.join(homedir(), ".claude") }
  ];
  for (const candidate of candidates) {
    const parsed = readJsonObject(candidate.file);
    const dirs = parsed?.["additionalDirectories"];
    if (!Array.isArray(dirs)) continue;
    for (const dir of dirs) {
      if (typeof dir !== "string" || dir.trim().length === 0) continue;
      entries.push(isAbsolute2(dir) ? resolve(dir) : resolve(candidate.base, dir));
    }
  }
  return [...new Set(entries)];
}
function containsPath(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || !rel.startsWith("..") && !isAbsolute2(rel);
}
function rootAccess(rootAbs, cwd, additionalDirs) {
  if (!existsSync2(rootAbs)) return "missing-path";
  if (containsPath(cwd, rootAbs)) return "inside-working-directory";
  if (additionalDirs.some((dir) => containsPath(dir, rootAbs))) {
    return "configured-additional-directory";
  }
  return "outside-working-directory";
}
function addOrMergeRoot(map, root, projectRoot) {
  const abs = isAbsolute2(root.path) ? resolve(root.path) : resolve(projectRoot, root.path);
  const key = abs;
  const existing = map.get(key);
  if (!existing || root.confidence > existing.confidence) {
    map.set(key, root);
  }
}
function siblingCandidates(projectRoot) {
  const currentBase = basename3(projectRoot).toLowerCase();
  const parent = resolve(projectRoot, "..");
  if (!isDir2(parent)) return [];
  const currentLooksBackend = /^(backend|api|server|service|services)$/.test(currentBase);
  const currentLooksFrontend = /^(frontend|web|ui|client|admin)$/.test(currentBase);
  if (!currentLooksBackend && !currentLooksFrontend) return [];
  const names = readdirSync2(parent).slice(0, 80);
  const out = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const abs = path.join(parent, name);
    if (abs === projectRoot || !isDir2(abs)) continue;
    const lower = name.toLowerCase();
    if (currentLooksBackend && /^(frontend|web|ui|client|admin)$/.test(lower)) {
      out.push({
        name: lower,
        path: relativeOrDot(projectRoot, abs),
        role: "frontend",
        source: "sibling-scan",
        confidence: 0.72
      });
    }
    if (currentLooksFrontend && /^(backend|api|server|service)$/.test(lower)) {
      out.push({
        name: lower,
        path: relativeOrDot(projectRoot, abs),
        role: "backend",
        source: "sibling-scan",
        confidence: 0.72
      });
    }
  }
  return out;
}
function discoverRawRoots(projectRoot) {
  const fromClaude = parseRootsFromClaudeMd(projectRoot);
  const map = /* @__PURE__ */ new Map();
  addOrMergeRoot(map, {
    name: "current",
    path: ".",
    role: "auto",
    source: "cwd",
    confidence: 0.5
  }, projectRoot);
  for (const root of parseCodeRootsFromCurdxSettings(projectRoot)) addOrMergeRoot(map, root, projectRoot);
  for (const root of fromClaude.roots) addOrMergeRoot(map, root, projectRoot);
  for (const root of siblingCandidates(projectRoot)) addOrMergeRoot(map, root, projectRoot);
  return {
    roots: [...map.values()],
    devContextFound: fromClaude.devContextFound,
    warnings: fromClaude.warnings
  };
}
function buildAccessFix(missingRoots) {
  const addDirs = missingRoots.filter((root) => root.access === "outside-working-directory").map((root) => `/add-dir ${root.path}`);
  const missingPaths = missingRoots.filter((root) => root.access === "missing-path").map((root) => `Path not found: ${root.path}`);
  const lines = [...addDirs, ...missingPaths];
  return lines.length > 0 ? lines.join("\n") : void 0;
}
function rootMatches(root, role) {
  if (root.role === role) return true;
  if (role === "frontend") return root.kinds.includes("frontend-app");
  if (role === "backend") return root.kinds.includes("backend-service");
  if (role === "shared") return root.kinds.includes("shared-library");
  return root.kinds.includes("claude-code-plugin");
}
function inferRequiredRoots(goal, roots) {
  const text = (goal ?? "").trim();
  if (text.length === 0) return [];
  const required = /* @__PURE__ */ new Map();
  const frontendRoots = roots.filter((root) => rootMatches(root, "frontend"));
  const backendRoots = roots.filter((root) => rootMatches(root, "backend"));
  const sharedRoots = roots.filter((root) => rootMatches(root, "shared"));
  function add(root, reason) {
    required.set(root.name, {
      name: root.name,
      path: root.path,
      reason,
      access: root.access
    });
  }
  if (UI_GOAL_RE.test(text)) {
    for (const root of frontendRoots) add(root, "goal mentions UI/frontend behavior");
  }
  if (BACKEND_GOAL_RE.test(text)) {
    for (const root of backendRoots) add(root, "goal mentions backend/API behavior");
  }
  if (CONTRACT_GOAL_RE.test(text)) {
    for (const root of backendRoots) add(root, "API contract work needs backend source");
    for (const root of frontendRoots) add(root, "API contract work needs consuming frontend source");
    for (const root of sharedRoots) add(root, "API contract work may use shared contracts");
  }
  if (AUTH_GOAL_RE.test(text) && frontendRoots.length > 0 && backendRoots.length > 0) {
    for (const root of backendRoots) add(root, "auth flow spans backend behavior");
    for (const root of frontendRoots) add(root, "auth flow spans frontend behavior");
  }
  return [...required.values()];
}
function discoverProjectTopology(options = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());
  const projectRoot = findRepoRoot(cwd);
  const additionalDirs = settingsAdditionalDirectories(projectRoot);
  const raw = discoverRawRoots(projectRoot);
  const roots = [];
  for (const root of raw.roots) {
    const rootAbs = isAbsolute2(root.path) ? resolve(root.path) : resolve(projectRoot, root.path);
    const classified = classifyRoot(rootAbs, root.role);
    roots.push({
      name: root.name,
      path: normalizeSerializedPath(root.path),
      role: root.role,
      kinds: classified.kinds,
      frameworks: classified.frameworks,
      ...classified.packageManager ? { packageManager: classified.packageManager } : {},
      access: rootAccess(rootAbs, cwd, additionalDirs),
      source: root.source,
      confidence: root.confidence
    });
  }
  const requiredRoots = inferRequiredRoots(options.goal, roots);
  const missingRoots = requiredRoots.filter(
    (root) => root.access === "outside-working-directory" || root.access === "missing-path"
  );
  return {
    version: 1,
    cwd,
    projectRoot,
    devContextFound: raw.devContextFound,
    roots,
    requiredRoots,
    missingRoots,
    ...missingRoots.length > 0 ? { accessFix: buildAccessFix(missingRoots) } : {},
    warnings: [...new Set(raw.warnings)]
  };
}
function renderContextMap(topology) {
  const lines = [
    "# Project Context Map",
    "",
    `Project root: ${topology.projectRoot}`,
    `Dev context found: ${topology.devContextFound ? "yes" : "no"}`,
    "",
    "## Code Roots",
    ""
  ];
  for (const root of topology.roots) {
    const frameworks = root.frameworks.length > 0 ? `; frameworks: ${root.frameworks.join(", ")}` : "";
    const packageManager = root.packageManager ? `; package manager: ${root.packageManager}` : "";
    lines.push(
      `- ${root.name}: ${root.path} (${root.role}; ${root.kinds.join(", ")}; ${root.access}${frameworks}${packageManager})`
    );
  }
  if (topology.requiredRoots.length > 0) {
    lines.push("", "## Required For Current Goal", "");
    for (const root of topology.requiredRoots) {
      lines.push(`- ${root.name}: ${root.reason}; access: ${root.access}`);
    }
  }
  if (topology.missingRoots.length > 0) {
    lines.push("", "## Access Fix", "", topology.accessFix ?? "");
  }
  if (topology.warnings.length > 0) {
    lines.push("", "## Warnings", "");
    for (const warning of topology.warnings) lines.push(`- ${warning}`);
  }
  return `${lines.join("\n")}
`;
}
function readArg2(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function main2() {
  const argv = process.argv.slice(2);
  const cwd = readArg2("--cwd", argv);
  const goal = readArg2("--goal", argv);
  const format = readArg2("--format", argv) ?? "json";
  const topology = discoverProjectTopology({ cwd, goal });
  if (format === "context-map") {
    process.stdout.write(renderContextMap(topology));
    return;
  }
  process.stdout.write(JSON.stringify(topology, null, 2) + "\n");
}
function isDirectRun2() {
  try {
    const entry = fileURLToPath2(import.meta.url);
    return process.argv[1] === entry && basename3(entry).startsWith("project-topology.");
  } catch {
    return false;
  }
}
if (isDirectRun2()) {
  main2();
}

// src/hooks/lib/tool-capabilities.ts
import { basename as basename4 } from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
var CAPABILITIES = {
  "context7": {
    id: "context7",
    name: "Context7",
    type: "mcp",
    invocation: "Context7 MCP",
    summary: "current official docs for libraries, SDKs, APIs, and Claude Code",
    useWhen: "use the Context7 MCP before implementation when external library, SDK, API, framework, or Claude Code behavior matters.",
    skipWhen: "Skip for pure local logic, typos, and code paths fully understood from this repository."
  },
  "claude-mem": {
    id: "claude-mem",
    name: "claude-mem",
    type: "plugin",
    invocation: "/claude-mem:mem-search",
    summary: "cross-session memory search and phased plan/execution commands",
    useWhen: "Use /claude-mem:mem-search when similar work, prior decisions, or repeated failures may exist; use /claude-mem:make-plan only for genuinely phased work.",
    skipWhen: "Skip when the task is new, obvious, and smaller than a short local edit."
  },
  "sequential-thinking": {
    id: "sequential-thinking",
    name: "sequential-thinking",
    type: "mcp",
    invocation: "sequential-thinking MCP",
    summary: "structured hypothesis breakdown for hard architecture and debugging problems",
    useWhen: "Use for architecture tradeoffs, migrations, security/data/release risk, or debugging where assumptions may change.",
    skipWhen: "Skip for direct edits, simple lookups, and deterministic fixes."
  },
  "chrome-devtools-mcp": {
    id: "chrome-devtools-mcp",
    name: "Chrome DevTools MCP",
    type: "plugin",
    invocation: "Chrome DevTools MCP",
    summary: "real browser console, network, DOM, performance, and screenshot/snapshot verification",
    useWhen: "Use for browser runtime behavior, UI regressions, DOM/CSS issues, network failures, and frontend verification.",
    skipWhen: "Skip for backend-only code with no browser-facing behavior."
  },
  "frontend-design": {
    id: "frontend-design",
    name: "frontend-design",
    type: "plugin",
    invocation: "frontend-design plugin skills",
    summary: "frontend UX/design guidance for UI pages, components, and interaction polish",
    useWhen: "Use when building or changing visible UI, interaction design, frontend layout, or visual quality.",
    skipWhen: "Skip for backend-only changes, copy-only edits, and internal CLI/library work."
  },
  "pua": {
    id: "pua",
    name: "pua",
    type: "plugin",
    invocation: "/pua:pua-loop or /pua:p9",
    summary: "structured retries and parallel task decomposition",
    useWhen: "Use after multiple failed attempts or for truly independent parallel work slices.",
    skipWhen: "Skip on first-attempt failures, known fixes, and work that is sequential by dependency."
  }
};
var ORDER = [
  "context7",
  "claude-mem",
  "frontend-design",
  "chrome-devtools-mcp",
  "sequential-thinking",
  "pua"
];
var CORE_REQUIRED = /* @__PURE__ */ new Set([
  "context7",
  "claude-mem",
  "frontend-design",
  "chrome-devtools-mcp",
  "sequential-thinking",
  "pua"
]);
var EXTERNAL_DOCS_RE = /\b(api|sdk|library|libraries|framework|version|upgrade|dependency|dependencies|official docs?|latest docs?|claude code|plugin|mcp|hook|hooks|skill|skills|agent|agents|react|vue|spring|spring boot|spring cloud|next\.?js|vite|webpack|npm|node)\b|最新|依赖|框架|插件|官方|联网|搜索|文档.*(最新|官方|API|SDK|框架|插件|依赖)/i;
var MEMORY_RE = /\b(previous|before|again|remember|memory|history|similar|repeated|regression|already solved|same bug|past decision)\b|之前|上次|记得|历史|做过|又|重复|老问题/i;
var UI_RE = /\b(ui|ux|frontend|front-end|browser|chrome|dom|css|html|layout|component|page|form|modal|responsive|visual|render|react|vue|vite|next\.?js|screenshot|interaction)\b|前端|页面|浏览器|样式|交互|组件|布局|视觉|截图/i;
var BROWSER_VERIFY_RE = /\b(browser|chrome|dom|css|network|console|performance|render|screenshot|e2e|playwright|visual regression|interaction)\b|浏览器|控制台|网络|性能|渲染|截图|端到端/i;
var COMPLEX_RE = /\b(architecture|architect|migration|migrate|security|auth|authentication|authorization|permission|oauth|payment|billing|database|schema|release|publish|npm|tag|hook|subagent|multi[- ]?repo|monorepo|cross[- ]?system|concurrency|race|cache|rewrite|refactor)\b|架构|迁移|安全|权限|认证|数据库|发布|重写|并发|跨仓库|多仓库/i;
var STUCK_RE = /\b(stuck|failed|failure|fails|flaky|retry|debug|investigate|root cause|not working|broken|regression)\b|卡住|失败|报错|不行|修不好|定位|排查/i;
var PARALLEL_RE = /\b(parallel|multi-agent|team|decompose|split|epic|multiple subsystems|large refactor)\b|并行|多智能体|拆分|史诗|多模块/i;
var LOW_RISK_LOCAL_RE = /\b(typo|readme|docs?|comment|comments|copy|wording|rename label|format text)\b|错别字|注释|文案/i;
function normalize(input) {
  return (input ?? "").trim().replace(/\s+/g, " ");
}
function hasAny(values, candidates) {
  const set = new Set((values ?? []).map((v) => v.toLowerCase()));
  return candidates.some((candidate) => set.has(candidate.toLowerCase()));
}
function capabilityAvailability(id, available) {
  if (CORE_REQUIRED.has(id)) return "core-required";
  if (available === null) return "check-if-installed";
  return available.has(id) ? "known-available" : null;
}
function pushRecommendation(out, available, id, phase, reason, instruction) {
  const availability = capabilityAvailability(id, available);
  if (availability === null) return;
  if (out.some((rec) => rec.id === id)) return;
  const cap = CAPABILITIES[id];
  out.push({
    id,
    name: cap.name,
    type: cap.type,
    invocation: cap.invocation,
    phase,
    availability,
    reason,
    instruction
  });
}
function sortRecommendations(recs) {
  return [...recs].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
}
function recommendToolCapabilities(input) {
  const goal = normalize(input.goal);
  const route2 = normalize(input.route);
  const risk = normalize(input.risk);
  const topologyKinds2 = input.topologyKinds ?? [];
  const topologyFrameworks2 = input.topologyFrameworks ?? [];
  const missingRoots = input.missingRoots ?? 0;
  const available = input.availableCapabilities === void 0 ? null : new Set(input.availableCapabilities.filter(Boolean));
  const recs = [];
  if (missingRoots > 0) {
    return recs;
  }
  const externalDocsRelevant = EXTERNAL_DOCS_RE.test(goal);
  const localLowRisk = LOW_RISK_LOCAL_RE.test(goal) && route2 === "direct-change" && !externalDocsRelevant;
  if (localLowRisk) {
    return recs;
  }
  const hasFrontend = UI_RE.test(goal) || hasAny(topologyKinds2, ["frontend-app"]) || hasAny(topologyFrameworks2, ["react", "vue", "next.js", "vite"]);
  const browserRuntime = BROWSER_VERIFY_RE.test(goal) || hasFrontend;
  const complex = COMPLEX_RE.test(goal) && route2 !== "direct-change" || risk === "high" || risk === "critical" || route2 === "full-spec" || route2 === "epic-split";
  const stuck = STUCK_RE.test(goal);
  const parallel = PARALLEL_RE.test(goal) || route2 === "epic-split";
  if (externalDocsRelevant) {
    pushRecommendation(
      recs,
      available,
      "context7",
      "before-coding",
      "external documentation or current API behavior is likely relevant",
      "Use Context7 before editing so version-specific behavior is grounded in current docs."
    );
  }
  if (MEMORY_RE.test(goal) || stuck || route2 === "full-spec" || route2 === "epic-split") {
    pushRecommendation(
      recs,
      available,
      "claude-mem",
      "planning",
      "similar prior work or longer-running plan may exist",
      "Search memory before planning; use make-plan only when the work is genuinely phased."
    );
  }
  if (hasFrontend) {
    pushRecommendation(
      recs,
      available,
      "frontend-design",
      "implementation",
      "visible frontend behavior or UI quality is in scope",
      "Use frontend-design guidance for UI structure, interaction, responsive behavior, and visual polish."
    );
  }
  if (browserRuntime) {
    pushRecommendation(
      recs,
      available,
      "chrome-devtools-mcp",
      "verification",
      "browser runtime behavior should be verified in a real browser",
      "Use Chrome DevTools MCP for console, network, DOM, performance, or visual proof after implementation."
    );
  }
  if (complex || stuck) {
    pushRecommendation(
      recs,
      available,
      "sequential-thinking",
      "planning",
      "risk or uncertainty requires explicit hypothesis management",
      "Use sequential-thinking to break assumptions before choosing the implementation path."
    );
  }
  if (stuck || parallel) {
    pushRecommendation(
      recs,
      available,
      "pua",
      stuck ? "recovery" : "planning",
      stuck ? "the goal indicates repeated failure or debugging difficulty" : "large work may contain independent parallel slices",
      stuck ? "Use /pua:pua-loop only after local triage confirms the first fix path is not working." : "Use /pua:p9 only after dependencies prove the slices can run independently."
    );
  }
  return sortRecommendations(recs);
}
function parseList2(value) {
  if (!value) return [];
  return value.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}
function readArg3(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function main3() {
  const argv = process.argv.slice(2);
  const recommendations = recommendToolCapabilities({
    goal: readArg3("--goal", argv),
    route: readArg3("--route", argv),
    risk: readArg3("--risk", argv),
    topologyKinds: parseList2(readArg3("--topology-kinds", argv)),
    topologyFrameworks: parseList2(readArg3("--topology-frameworks", argv)),
    missingRoots: Number(readArg3("--missing-roots", argv) ?? 0),
    availableCapabilities: readArg3("--available-capabilities", argv) ? parseList2(readArg3("--available-capabilities", argv)) : void 0
  });
  process.stdout.write(JSON.stringify(recommendations, null, 2) + "\n");
}
function isDirectRun3() {
  try {
    const entry = fileURLToPath3(import.meta.url);
    return process.argv[1] === entry && basename4(entry).startsWith("tool-capabilities.");
  } catch {
    return false;
  }
}
if (isDirectRun3()) {
  main3();
}

// src/hooks/lib/smart-route.ts
function normalizeText(input) {
  return (input ?? "").trim().replace(/\s+/g, " ");
}
function hasFlag(flags, flag) {
  return new RegExp(`(^|\\s)${flag.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(\\s|$)`).test(
    flags ?? ""
  );
}
function parseList3(value) {
  if (!value) return [];
  return value.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}
function readArg4(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function specNameFromPath(specPath) {
  const parts = specPath.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? specPath;
}
function loadActiveSpecFromPath(cwd, specPath) {
  const statePath = join2(cwd, specPath, ".curdx-state.json");
  let phase = "unknown";
  let completed = false;
  if (existsSync3(statePath)) {
    try {
      const parsed = JSON.parse(readFileSync3(statePath, "utf8"));
      if (typeof parsed.phase === "string" && parsed.phase.trim().length > 0) {
        phase = parsed.phase;
      }
      completed = parsed.completed === true;
    } catch {
      phase = "unknown";
    }
  } else if (existsSync3(join2(cwd, specPath, "tasks.md"))) {
    phase = "execution";
  } else if (existsSync3(join2(cwd, specPath, "design.md"))) {
    phase = "tasks";
  } else if (existsSync3(join2(cwd, specPath, "requirements.md"))) {
    phase = "design";
  } else if (existsSync3(join2(cwd, specPath, "research.md"))) {
    phase = "requirements";
  }
  return {
    name: specNameFromPath(specPath),
    path: specPath,
    phase,
    completed
  };
}
function findActiveSpec(input) {
  const cwd = input.cwd ?? process.cwd();
  const fresh = hasFlag(input.flags, "--fresh");
  if (fresh) return void 0;
  const explicitName = normalizeText(input.name);
  if (explicitName) {
    const found = findSpec(explicitName, { cwd });
    if (found.ok) return loadActiveSpecFromPath(cwd, found.path);
    return void 0;
  }
  const current = resolveCurrent({ cwd });
  if (current === null) return void 0;
  return loadActiveSpecFromPath(cwd, current);
}
function nextActionForActiveSpec(spec) {
  if (spec.completed) {
    return `Active spec '${spec.name}' is completed; start a new spec or run /curdx-flow:refactor ${spec.name}.`;
  }
  switch (spec.phase) {
    case "research":
      return `Continue '${spec.name}' with /curdx-flow:requirements after reviewing research.md.`;
    case "requirements":
      return `Continue '${spec.name}' with /curdx-flow:design.`;
    case "design":
      return `Continue '${spec.name}' with /curdx-flow:tasks.`;
    case "tasks":
      return `Continue '${spec.name}' with /curdx-flow:implement.`;
    case "execution":
      return `Resume '${spec.name}' with /curdx-flow:implement.`;
    default:
      return `Inspect '${spec.name}' with /curdx-flow:status, then continue the next missing phase.`;
  }
}
function publicPolicy(policy) {
  return {
    mode: policy.mode,
    risk: policy.risk,
    executionMode: policy.executionMode,
    taskGranularity: policy.taskGranularity,
    taskTargetRange: policy.taskTargetRange,
    reviewCadence: policy.reviewCadence,
    verificationLevel: policy.verificationLevel,
    subagentPolicy: policy.subagentPolicy,
    stopHookPolicy: policy.stopHookPolicy,
    maxGlobalIterations: policy.maxGlobalIterations,
    maxTaskIterations: policy.maxTaskIterations,
    shouldSplitSpec: policy.shouldSplitSpec
  };
}
function routeFromPolicy(policy) {
  if (policy.shouldSplitSpec || policy.executionMode === "epic-triage") {
    return "epic-split";
  }
  if (policy.executionMode === "direct") return "direct-change";
  if (policy.executionMode === "spec-lite") return "lite-spec";
  return "full-spec";
}
function routeDefaults(route2) {
  switch (route2) {
    case "direct-change":
      return {
        nextAction: "Handle directly in the current turn; do not create a spec or tasks.md.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: false,
        taskCountLimit: 1
      };
    case "lite-spec":
      return {
        nextAction: "Create a lightweight spec and 1-3 value-slice tasks, then execute without unnecessary subagents.",
        shouldCreateSpec: true,
        shouldCreateTasks: true,
        shouldUseSubagent: false,
        taskCountLimit: 3
      };
    case "full-spec":
      return {
        nextAction: "Run the full research, requirements, design, tasks, and implementation workflow.",
        shouldCreateSpec: true,
        shouldCreateTasks: true,
        shouldUseSubagent: true,
        taskCountLimit: 12
      };
    case "epic-split":
      return {
        nextAction: "Run /curdx-flow:triage; do not force this work into one oversized spec.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: true,
        taskCountLimit: 12
      };
    case "resume-current":
      return {
        nextAction: "Resume the active spec at its next incomplete phase.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: true,
        taskCountLimit: 12
      };
    case "blocked-ask-user":
      return {
        nextAction: "Ask one focused question before continuing.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: false,
        taskCountLimit: 0
      };
  }
}
function publicTopology(topology) {
  return {
    devContextFound: topology.devContextFound,
    roots: topology.roots,
    requiredRoots: topology.requiredRoots,
    missingRoots: topology.missingRoots,
    ...topology.accessFix ? { accessFix: topology.accessFix } : {},
    warnings: topology.warnings
  };
}
function topologyKinds(topology) {
  return [...new Set(topology.roots.flatMap((root) => root.kinds))];
}
function topologyFrameworks(topology) {
  return [...new Set(topology.roots.flatMap((root) => root.frameworks))];
}
function classifySmartRoute(input) {
  const goal = normalizeText(input.goal);
  const cwd = input.cwd ?? process.cwd();
  const activeSpec = findActiveSpec({ ...input, cwd });
  const topology = discoverProjectTopology({ cwd, goal });
  const policy = classifyAutoPolicy({
    goal,
    flags: input.flags,
    changedFiles: input.changedFiles,
    estimatedFiles: input.estimatedFiles,
    taskCount: input.taskCount
  });
  const recommendations = recommendToolCapabilities({
    goal,
    route: routeFromPolicy(policy),
    risk: policy.risk,
    topologyKinds: topologyKinds(topology),
    topologyFrameworks: topologyFrameworks(topology),
    missingRoots: topology.missingRoots.length,
    availableCapabilities: input.availableCapabilities
  });
  if (activeSpec !== void 0 && !activeSpec.completed && goal.length === 0) {
    return {
      version: 1,
      route: "resume-current",
      reason: "active unfinished spec found and no new goal was provided",
      activeSpec,
      ...routeDefaults("resume-current"),
      nextAction: nextActionForActiveSpec(activeSpec),
      topology: publicTopology(topology),
      recommendedCapabilities: [],
      policy: publicPolicy(policy),
      reasons: ["active unfinished spec"]
    };
  }
  if (activeSpec !== void 0 && !activeSpec.completed && normalizeText(input.name).length > 0 && goal.length > 0) {
    return {
      version: 1,
      route: "blocked-ask-user",
      reason: "requested spec already exists and is unfinished",
      activeSpec,
      blockedReason: "Ask whether to resume the existing spec or rerun with --fresh for new work.",
      ...routeDefaults("blocked-ask-user"),
      topology: publicTopology(topology),
      recommendedCapabilities: recommendations,
      policy: publicPolicy(policy),
      reasons: ["existing unfinished spec with new goal text"]
    };
  }
  const explicitName = normalizeText(input.name);
  if (explicitName && !hasFlag(input.flags, "--fresh")) {
    const found = findSpec(explicitName, { cwd });
    if (!found.ok && found.reason === "ambiguous") {
      return {
        version: 1,
        route: "blocked-ask-user",
        reason: "multiple specs match the requested name",
        blockedReason: `Ambiguous spec '${explicitName}': ${found.matches.join(", ")}`,
        ...routeDefaults("blocked-ask-user"),
        topology: publicTopology(topology),
        recommendedCapabilities: recommendations,
        policy: publicPolicy(policy),
        reasons: ["ambiguous spec name"]
      };
    }
  }
  if (goal.length === 0) {
    return {
      version: 1,
      route: "blocked-ask-user",
      reason: "no goal and no resumable active spec",
      blockedReason: "Ask for the goal or a spec name.",
      ...routeDefaults("blocked-ask-user"),
      topology: publicTopology(topology),
      recommendedCapabilities: [],
      policy: publicPolicy(policy),
      reasons: ["missing goal"]
    };
  }
  if (topology.missingRoots.length > 0) {
    const missing = topology.missingRoots.map((root) => `${root.name} (${root.path})`).join(", ");
    return {
      version: 1,
      route: "blocked-ask-user",
      reason: "related code root is not accessible",
      blockedReason: `Goal requires ${missing}. ${topology.accessFix ?? "Add the missing root before continuing."}`,
      ...routeDefaults("blocked-ask-user"),
      nextAction: topology.accessFix ?? "Add the missing code root, then rerun /curdx-flow:start.",
      topology: publicTopology(topology),
      recommendedCapabilities: [],
      policy: publicPolicy(policy),
      reasons: ["related code root is outside current Claude Code access"]
    };
  }
  const route2 = routeFromPolicy(policy);
  const defaults = routeDefaults(route2);
  return {
    version: 1,
    route: route2,
    reason: policy.reasons[0] ?? "deterministic policy classification",
    ...defaults,
    topology: publicTopology(topology),
    recommendedCapabilities: recommendations,
    policy: publicPolicy(policy),
    reasons: policy.reasons
  };
}
function main4() {
  const argv = process.argv.slice(2);
  const goal = readArg4("--goal", argv) ?? "";
  const name = readArg4("--name", argv);
  const flags = readArg4("--flags", argv) ?? "";
  const cwd = readArg4("--cwd", argv);
  const files = parseList3(readArg4("--files", argv));
  const availableCapabilities = parseList3(readArg4("--available-capabilities", argv));
  const estimatedRaw = readArg4("--estimated-files", argv);
  const taskRaw = readArg4("--task-count", argv);
  const route2 = classifySmartRoute({
    goal,
    name,
    flags,
    cwd,
    changedFiles: files,
    availableCapabilities: availableCapabilities.length > 0 ? availableCapabilities : void 0,
    estimatedFiles: estimatedRaw === void 0 ? void 0 : Number(estimatedRaw),
    taskCount: taskRaw === void 0 ? void 0 : Number(taskRaw)
  });
  process.stdout.write(JSON.stringify(route2, null, 2) + "\n");
}
function isDirectRun4() {
  try {
    const entry = fileURLToPath4(import.meta.url);
    return process.argv[1] === entry && basename5(entry).startsWith("smart-route.");
  } catch {
    return false;
  }
}
if (isDirectRun4()) {
  main4();
}

// src/hooks/lib/workflow-snapshot.ts
import { execFileSync } from "node:child_process";
import { existsSync as existsSync4, readFileSync as readFileSync4, statSync as statSync3 } from "node:fs";
import { basename as basename6, isAbsolute as isAbsolute3, join as join3 } from "node:path";
import { fileURLToPath as fileURLToPath5 } from "node:url";

// src/hooks/_shared/markdown-task-parser.ts
var TASK_LINE_RE = /^- \[[ x]\]/;
var INDENTED_RE = /^  /;
var BLANK_RE = /^\s*$/;
var TASK_HEADER_RE = /^- \[([ x])\]\s+(?:(\d+(?:\.\d+)*)\s+)?(.*)$/;
function normalize2(input) {
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
function parseTaskList(markdown) {
  if (!markdown) return [];
  const lines = normalize2(markdown).split("\n");
  const tasks2 = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    const trimmed = trimTrailingBlankLines(current.lines);
    const lineEnd = current.lineStart + trimmed.length - 1;
    tasks2.push({
      ...current.meta,
      raw: trimmed.join("\n"),
      lineEnd
    });
    current = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineNo = i + 1;
    if (TASK_LINE_RE.test(line)) {
      flush();
      const m = line.match(TASK_HEADER_RE);
      const completed = m ? m[1] === "x" : false;
      const id = m && m[2] ? m[2] : void 0;
      const title = m && m[3] !== void 0 ? m[3] : line;
      current = {
        lines: [line],
        lineStart: lineNo,
        lineEnd: lineNo,
        meta: { id, title, completed }
      };
      continue;
    }
    if (!current) continue;
    if (INDENTED_RE.test(line) || BLANK_RE.test(line)) {
      current.lines.push(line);
      continue;
    }
    flush();
  }
  flush();
  return tasks2;
}

// src/hooks/lib/workflow-snapshot.ts
function readArg5(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function normalizeSpecPath(cwd, specPath) {
  if (isAbsolute3(specPath)) return specPath;
  return join3(cwd, specPath);
}
function specNameFromPath2(specPath) {
  const parts = specPath.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? basename6(specPath);
}
function resolveSpecPath(input) {
  const cwd = input.cwd ?? process.cwd();
  const explicit = input.spec?.trim();
  if (explicit) {
    if (explicit.startsWith("./") || explicit.startsWith("../") || isAbsolute3(explicit)) {
      return explicit;
    }
    const found = findSpec(explicit, { cwd });
    if (found.ok) return found.path;
    return explicit;
  }
  return resolveCurrent({ cwd }) ?? void 0;
}
function readJsonFile(path3) {
  try {
    return { ok: true, value: JSON.parse(readFileSync4(path3, "utf8")) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
function artifact(specFs, filename) {
  const p = join3(specFs, filename);
  if (!existsSync4(p)) return { exists: false, path: p };
  try {
    const st = statSync3(p);
    return {
      exists: true,
      path: p,
      mtimeMs: st.mtimeMs,
      bytes: st.size
    };
  } catch {
    return { exists: true, path: p };
  }
}
function extractVerify(raw) {
  const m = raw.match(/^\s+- \*\*Verify\*\*:\s*(.+)$/m);
  return m?.[1]?.trim();
}
function extractFiles(raw) {
  const m = raw.match(/^\s+- \*\*Files\*\*:\s*(.+)$/m);
  const value = m?.[1]?.trim();
  if (!value) return [];
  return value.split(/[,;]/).map((part) => part.trim().replace(/^`|`$/g, "")).filter(Boolean);
}
function buildTaskSnapshot(specFs, state2) {
  const tasksPath = join3(specFs, "tasks.md");
  if (!existsSync4(tasksPath)) {
    return { total: 0, completed: 0, pending: 0, currentIndex: 0 };
  }
  let tasks2 = [];
  try {
    tasks2 = parseTaskList(readFileSync4(tasksPath, "utf8"));
  } catch {
    tasks2 = [];
  }
  const total = tasks2.length;
  const completed = tasks2.reduce((n, task) => n + (task.completed ? 1 : 0), 0);
  const pending = total - completed;
  const rawIndex = typeof state2?.taskIndex === "number" ? state2.taskIndex : completed;
  const currentIndex = Math.max(0, Math.min(rawIndex, Math.max(total - 1, 0)));
  const currentTask = tasks2[currentIndex];
  return {
    total,
    completed,
    pending,
    currentIndex,
    ...currentTask ? {
      current: {
        ...currentTask.id ? { id: currentTask.id } : {},
        title: currentTask.title,
        lineStart: currentTask.lineStart,
        lineEnd: currentTask.lineEnd,
        ...extractVerify(currentTask.raw) ? { verify: extractVerify(currentTask.raw) } : {},
        files: extractFiles(currentTask.raw)
      }
    } : {}
  };
}
function gitSnapshot(cwd) {
  try {
    const branch = execFileSync("git", ["branch", "--show-current"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).split(/\r?\n/).filter(Boolean);
    return {
      available: true,
      ...branch ? { branch } : {},
      dirty: status.length > 0,
      changedFiles: status.length
    };
  } catch {
    return { available: false, dirty: false, changedFiles: 0 };
  }
}
function compactTopology(topology) {
  return {
    devContextFound: topology.devContextFound,
    roots: topology.roots,
    requiredRoots: topology.requiredRoots,
    missingRoots: topology.missingRoots,
    ...topology.accessFix ? { accessFix: topology.accessFix } : {},
    warnings: topology.warnings
  };
}
function isLiteSpecState(state2) {
  const route2 = state2?.route?.route;
  return state2?.autoPolicy?.executionMode === "spec-lite" || route2 === "lite-spec";
}
function inferNextAction(state2, artifacts, tasks2) {
  if (state2?.completed === true) return "Spec is completed. Use /curdx-flow:refactor for follow-up changes.";
  if (isLiteSpecState(state2)) {
    if (!artifacts.tasks.exists) return "Run /curdx-flow:tasks.";
    if (tasks2.pending > 0) return "Run /curdx-flow:implement.";
    return "All task checkboxes are complete; run verification/refactor or mark complete.";
  }
  if (!artifacts.research.exists) return "Run /curdx-flow:research.";
  if (!artifacts.requirements.exists) return "Run /curdx-flow:requirements.";
  if (!artifacts.design.exists) return "Run /curdx-flow:design.";
  if (!artifacts.tasks.exists) return "Run /curdx-flow:tasks.";
  if (tasks2.pending > 0) return "Run /curdx-flow:implement.";
  return "All task checkboxes are complete; run verification/refactor or mark complete.";
}
function buildGates(stateInfo, artifacts, tasks2, topology) {
  const gates = [];
  const isLiteSpec = stateInfo.autoPolicy?.executionMode === "spec-lite";
  if (!stateInfo.exists) gates.push("missing-state");
  if (stateInfo.exists && !stateInfo.valid) gates.push("invalid-state");
  if (topology && topology.missingRoots.length > 0) gates.push("missing-code-root");
  if (isLiteSpec) {
    if (!artifacts.tasks.exists) gates.push("missing-tasks");
  } else {
    if (!artifacts.research.exists) gates.push("missing-research");
    if (!artifacts.requirements.exists && artifacts.research.exists) gates.push("missing-requirements");
    if (!artifacts.design.exists && artifacts.requirements.exists) gates.push("missing-design");
    if (!artifacts.tasks.exists && artifacts.design.exists) gates.push("missing-tasks");
  }
  if (artifacts.tasks.exists && tasks2.total === 0) gates.push("empty-tasks");
  if (tasks2.total > 0 && stateInfo.phase === "execution" && tasks2.pending === 0 && !stateInfo.completed) {
    gates.push("completion-unmarked");
  }
  return gates;
}
function buildWorkflowSnapshot(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const specPath = resolveSpecPath({ ...input, cwd });
  const topology = compactTopology(discoverProjectTopology({ cwd, goal: input.goal ?? "" }));
  const git = gitSnapshot(cwd);
  if (!specPath) {
    return {
      version: 2,
      cwd,
      active: false,
      state: {
        exists: false,
        valid: false,
        completed: false,
        awaitingApproval: false,
        quickMode: false,
        recommendedCapabilities: [],
        verificationBlocks: {}
      },
      artifacts: {
        research: { exists: false, path: join3(cwd, "research.md") },
        requirements: { exists: false, path: join3(cwd, "requirements.md") },
        design: { exists: false, path: join3(cwd, "design.md") },
        tasks: { exists: false, path: join3(cwd, "tasks.md") },
        progress: { exists: false, path: join3(cwd, ".progress.md") }
      },
      tasks: { total: 0, completed: 0, pending: 0, currentIndex: 0 },
      topology,
      git,
      nextAction: "No active spec. Run /curdx-flow:start <name> <goal>.",
      gates: ["no-active-spec"]
    };
  }
  const specFs = normalizeSpecPath(cwd, specPath);
  const statePath = join3(specFs, ".curdx-state.json");
  let state2 = null;
  const stateInfo = {
    exists: existsSync4(statePath),
    valid: false,
    completed: false,
    awaitingApproval: false,
    quickMode: false,
    recommendedCapabilities: [],
    verificationBlocks: {}
  };
  if (stateInfo.exists) {
    const parsed = readJsonFile(statePath);
    if (parsed.ok) {
      state2 = parsed.value;
      stateInfo.valid = true;
      stateInfo.version = parsed.value.version;
      stateInfo.phase = parsed.value.phase;
      stateInfo.completed = parsed.value.completed === true;
      stateInfo.awaitingApproval = parsed.value.awaitingApproval === true;
      stateInfo.quickMode = parsed.value.quickMode === true;
      stateInfo.autoPolicy = parsed.value.autoPolicy;
      stateInfo.recommendedCapabilities = parsed.value.recommendedCapabilities ?? [];
      stateInfo.projectTopology = parsed.value.projectTopology;
      stateInfo.verificationBlocks = parsed.value.verificationBlocks ?? {};
    } else {
      stateInfo.error = parsed.error;
    }
  }
  const artifacts = {
    research: artifact(specFs, "research.md"),
    requirements: artifact(specFs, "requirements.md"),
    design: artifact(specFs, "design.md"),
    tasks: artifact(specFs, "tasks.md"),
    progress: artifact(specFs, ".progress.md")
  };
  const tasks2 = buildTaskSnapshot(specFs, state2);
  return {
    version: 2,
    cwd,
    active: existsSync4(specFs),
    spec: {
      name: specNameFromPath2(specPath),
      path: specPath,
      fsPath: specFs,
      statePath
    },
    state: stateInfo,
    artifacts,
    tasks: tasks2,
    topology,
    git,
    nextAction: inferNextAction(state2, artifacts, tasks2),
    gates: buildGates(stateInfo, artifacts, tasks2, topology)
  };
}
function main5() {
  const argv = process.argv.slice(2);
  const snapshot2 = buildWorkflowSnapshot({
    cwd: readArg5("--cwd", argv),
    spec: readArg5("--spec", argv),
    goal: readArg5("--goal", argv)
  });
  process.stdout.write(JSON.stringify(snapshot2, null, 2) + "\n");
}
function isDirectRun5() {
  try {
    const entry = fileURLToPath5(import.meta.url);
    return process.argv[1] === entry && basename6(entry).startsWith("workflow-snapshot.");
  } catch {
    return false;
  }
}
if (isDirectRun5()) {
  main5();
}

// src/hooks/lib/check-verification-blocks.ts
import { readFileSync as readFileSync5, readdirSync as readdirSync3, statSync as statSync4, existsSync as existsSync5 } from "node:fs";
import path2 from "node:path";
var VERIFICATION_PHASES = [
  "research",
  "requirements",
  "design",
  "tasks",
  "execution"
];
async function runVerificationCheck(opts = {}) {
  const repoRoot = opts.repoRoot ?? process.cwd();
  const env = opts.env ?? process.env;
  const specsDir = path2.join(repoRoot, "specs");
  const specDir = resolveActiveSpecDir(specsDir);
  if (!specDir) {
    return {
      ok: true,
      code: 0,
      skipped: true,
      message: "check-verification-blocks: no active spec found, skipping.\n"
    };
  }
  if (env.CURDX_VERIFY_SKIP_BLOCKS === "1") {
    return {
      ok: true,
      code: 0,
      skipped: true,
      specDir,
      message: "[check-verification-blocks] CURDX_VERIFY_SKIP_BLOCKS=1 \u2014 skipping gate.\n"
    };
  }
  const stateFile = path2.join(specDir, ".curdx-state.json");
  let state2;
  try {
    state2 = JSON.parse(readFileSync5(stateFile, "utf8"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: 2,
      specDir,
      message: `\u2717 failed to read ${path2.relative(repoRoot, stateFile)}: ${msg}
`
    };
  }
  if (typeof state2 !== "object" || state2 === null || !("verificationBlocks" in state2)) {
    const rel2 = path2.relative(repoRoot, specDir);
    return {
      ok: true,
      code: 0,
      skipped: true,
      specDir,
      message: `[check-verification-blocks] No verificationBlocks defined \u2014 skipping (treat as initial state)
  Active spec: ${rel2}
`
    };
  }
  const blocks = state2.verificationBlocks;
  const blocksObj = blocks && typeof blocks === "object" && !Array.isArray(blocks) ? blocks : null;
  const presentPhases = blocksObj ? Object.keys(blocksObj).filter(
    (p) => blocksObj[p] !== void 0 && blocksObj[p] !== null
  ) : [];
  if (!blocksObj || presentPhases.length === 0) {
    const rel2 = path2.relative(repoRoot, specDir);
    return {
      ok: false,
      code: 2,
      specDir,
      message: `\u2717 No verificationBlocks found. Run the appropriate phase verification command.
  Active spec: ${rel2}
  Hint: each phase must record an entry in .curdx-state.json::verificationBlocks
        (see plugins/curdx-flow/references/iron-law-verification.md).
`
    };
  }
  const failures = [];
  for (const phase of presentPhases) {
    if (!VERIFICATION_PHASES.includes(phase)) {
      failures.push({
        phase,
        reason: `unknown phase key "${phase}"`,
        command: "(remove from state)"
      });
      continue;
    }
    const raw = blocksObj[phase];
    if (typeof raw !== "object" || raw === null) {
      failures.push({
        phase,
        reason: "block is not an object",
        command: "(rewrite block)"
      });
      continue;
    }
    const block = raw;
    const command = typeof block.command === "string" ? block.command : "(unknown command)";
    const exitCode = block.exitCode;
    const timestamp = block.timestamp;
    const srcMtime = block.srcMtime;
    const failedReason = block.failedReason;
    if (exitCode !== 0) {
      failures.push({
        phase,
        reason: typeof failedReason === "string" && failedReason.length > 0 ? `verification failed: ${failedReason} (exitCode=${String(exitCode)})` : `verification failed (exitCode=${String(exitCode)})`,
        command
      });
      continue;
    }
    const ts = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
    if (Number.isNaN(ts)) {
      failures.push({
        phase,
        reason: `invalid timestamp "${String(timestamp)}"`,
        command
      });
      continue;
    }
    if (typeof srcMtime !== "number" || !Number.isFinite(srcMtime) || srcMtime < 0) {
      failures.push({
        phase,
        reason: `invalid srcMtime ${String(srcMtime)}`,
        command
      });
      continue;
    }
    if (ts < srcMtime) {
      const srcIso = new Date(srcMtime).toISOString();
      failures.push({
        phase,
        reason: `stale evidence: src changed at ${srcIso}, last verified at ${String(timestamp)}`,
        command
      });
    }
  }
  if (failures.length > 0) {
    const rel2 = path2.relative(repoRoot, specDir);
    let message = "\u2717 verificationBlocks gate failed:\n";
    message += `  Active spec: ${rel2}
`;
    for (const f of failures) {
      message += `  - phase "${f.phase}": ${f.reason}
`;
      message += `      Re-run: ${f.command}
`;
    }
    message += "\n";
    message += "See plugins/curdx-flow/references/iron-law-verification.md for the full checklist.\n";
    return { ok: false, code: 2, specDir, message };
  }
  const rel = path2.relative(repoRoot, specDir);
  return {
    ok: true,
    code: 0,
    specDir,
    message: `All verificationBlocks valid.
  Active spec: ${rel}
  Phases verified: ${presentPhases.join(", ")}
`
  };
}
function resolveActiveSpecDir(specsDir) {
  const pointer = path2.join(specsDir, ".current-spec");
  if (existsSync5(pointer)) {
    try {
      const name = readFileSync5(pointer, "utf8").trim();
      if (name) {
        const dir = path2.join(specsDir, name);
        if (existsSync5(path2.join(dir, ".curdx-state.json"))) return dir;
      }
    } catch {
    }
  }
  if (!existsSync5(specsDir)) return null;
  let entries;
  try {
    entries = readdirSync3(specsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  let latest = null;
  let latestMtime = 0;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".") || e.name.startsWith("_")) continue;
    const stateFile = path2.join(specsDir, e.name, ".curdx-state.json");
    if (!existsSync5(stateFile)) continue;
    try {
      const st = statSync4(stateFile);
      if (st.mtimeMs > latestMtime) {
        latestMtime = st.mtimeMs;
        latest = path2.join(specsDir, e.name);
      }
    } catch {
    }
  }
  return latest;
}

// src/hooks/lib/runtime-cli.ts
function readArg6(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function parseList4(value) {
  if (!value) return [];
  return value.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean);
}
function printJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}
function usage(exitCode = 1) {
  const text = [
    "usage: curdx-flow <command> [args]",
    "",
    "commands:",
    "  route --goal <text> [--name <spec>] [--flags <args>] [--cwd <dir>]",
    "  snapshot [--spec <name-or-path>] [--goal <text>] [--cwd <dir>]",
    "  specs dirs [--cwd <dir>]",
    "  specs list [--cwd <dir>]",
    "  specs find <name> [--cwd <dir>]",
    "  specs resolve [name-or-path] [--cwd <dir>]",
    "  state merge <state-file> <json-patch>",
    "  tasks count <tasks.md>",
    "  verify-blocks [--cwd <dir>] [--spec <name-or-path>]",
    "  doctor [--cwd <dir>]"
  ].join("\n");
  process.stderr.write(text + "\n");
  process.exit(exitCode);
}
function scriptRoot() {
  return dirname(fileURLToPath6(import.meta.url));
}
function pluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || resolve2(scriptRoot(), "..", "..", "..");
}
function runBundled(scriptName, args, cwd) {
  const script = join4(scriptRoot(), `${scriptName}.mjs`);
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: cwd ?? process.cwd(),
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"]
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    process.stderr.write(`${scriptName}: ${result.error.message}
`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}
function route(argv) {
  const estimatedRaw = readArg6("--estimated-files", argv);
  const taskRaw = readArg6("--task-count", argv);
  printJson(
    classifySmartRoute({
      goal: readArg6("--goal", argv) ?? "",
      name: readArg6("--name", argv),
      flags: readArg6("--flags", argv) ?? "",
      cwd: readArg6("--cwd", argv),
      changedFiles: parseList4(readArg6("--files", argv)),
      availableCapabilities: parseList4(readArg6("--available-capabilities", argv)),
      estimatedFiles: estimatedRaw === void 0 ? void 0 : Number(estimatedRaw),
      taskCount: taskRaw === void 0 ? void 0 : Number(taskRaw)
    })
  );
}
function snapshot(argv) {
  printJson(
    buildWorkflowSnapshot({
      cwd: readArg6("--cwd", argv),
      spec: readArg6("--spec", argv),
      goal: readArg6("--goal", argv)
    })
  );
}
function firstPositional(argv) {
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (!value) continue;
    if (value.startsWith("--")) {
      i += 1;
      continue;
    }
    return value;
  }
  return void 0;
}
function isDirectory(path3) {
  try {
    return statSync5(path3).isDirectory();
  } catch {
    return false;
  }
}
function readJsonFile2(path3) {
  try {
    return JSON.parse(readFileSync6(path3, "utf8"));
  } catch {
    return null;
  }
}
function detectPackageManager2(cwd) {
  if (existsSync6(join4(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync6(join4(cwd, "bun.lockb")) || existsSync6(join4(cwd, "bun.lock"))) return "bun";
  if (existsSync6(join4(cwd, "yarn.lock"))) return "yarn";
  if (existsSync6(join4(cwd, "package-lock.json"))) return "npm";
  if (existsSync6(join4(cwd, "package.json"))) return "npm";
  return null;
}
function scriptCommand(packageManager, scriptName) {
  switch (packageManager) {
    case "pnpm":
      return `pnpm run ${scriptName}`;
    case "yarn":
      return `yarn ${scriptName}`;
    case "bun":
      return `bun run ${scriptName}`;
    default:
      return `npm run ${scriptName}`;
  }
}
function detectProjectScripts(cwd) {
  const pkg = readJsonFile2(join4(cwd, "package.json"));
  const packageManager = detectPackageManager2(cwd);
  const scripts = pkg?.scripts ?? {};
  const allDependencies = { ...pkg?.dependencies ?? {}, ...pkg?.devDependencies ?? {} };
  const dependencyNames = Object.keys(allDependencies).filter(
    (name) => /playwright|puppeteer|cypress|selenium|webdriver/i.test(name)
  );
  const entries = Object.entries(scripts);
  const e2e = entries.filter(
    ([name, command]) => /(^|:|-)(e2e|browser|ui|acceptance)(:|-|$)|playwright|cypress|puppeteer|selenium/i.test(
      `${name} ${command}`
    )
  ).map(([name]) => name);
  const devServer = entries.filter(([name]) => /^(dev|start|serve|preview)$|(^|:|-)(dev|serve|preview)(:|-|$)/i.test(name)).map(([name]) => name);
  const playwrightScripts = entries.filter(([name, command]) => /playwright/i.test(`${name} ${command}`)).map(([name]) => name);
  return {
    packageJson: pkg !== null,
    packageManager,
    e2e,
    devServer,
    playwrightScripts,
    dependencies: dependencyNames
  };
}
function detectConfigFiles(cwd, filenames) {
  return filenames.filter((name) => existsSync6(join4(cwd, name)));
}
function detectChrome() {
  const envPath = process.env.CHROME_PATH;
  if (envPath && existsSync6(envPath)) {
    return { installed: true, path: envPath, source: "CHROME_PATH" };
  }
  if (process.platform === "darwin") {
    const path3 = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    return existsSync6(path3) ? { installed: true, path: path3, source: "macos-default" } : { installed: false, path: null, source: null };
  }
  if (process.platform === "win32") {
    const suffixes = [
      join4("Google", "Chrome SxS", "Application", "chrome.exe"),
      join4("Google", "Chrome", "Application", "chrome.exe")
    ];
    const prefixes = [
      process.env.LOCALAPPDATA,
      process.env.PROGRAMFILES,
      process.env["PROGRAMFILES(X86)"]
    ].filter((value) => Boolean(value));
    for (const prefix of prefixes) {
      for (const suffix of suffixes) {
        const candidate = join4(prefix, suffix);
        if (existsSync6(candidate)) {
          return { installed: true, path: candidate, source: "windows-default" };
        }
      }
    }
    return { installed: false, path: null, source: null };
  }
  for (const bin of ["google-chrome", "chromium", "chromium-browser"]) {
    const found = spawnSync("which", [bin], { encoding: "utf8" });
    if (found.status === 0) {
      return { installed: true, path: found.stdout.trim() || bin, source: "PATH" };
    }
  }
  return { installed: false, path: null, source: null };
}
function detectChromeDevtoolsDependency() {
  const manifest = readJsonFile2(join4(pluginRoot(), ".claude-plugin", "plugin.json"));
  const dependency = manifest?.dependencies?.find((item) => item.name === "chrome-devtools-mcp");
  return {
    declared: dependency !== void 0,
    marketplace: dependency?.marketplace ?? null
  };
}
function browserVerificationDoctor(cwd) {
  const scripts = detectProjectScripts(cwd);
  const playwrightConfigFiles = detectConfigFiles(cwd, [
    "playwright.config.ts",
    "playwright.config.js",
    "playwright.config.mjs",
    "playwright.config.cjs",
    "playwright.config.mts",
    "playwright.config.cts"
  ]);
  const e2eConfigFiles = detectConfigFiles(cwd, [
    ...playwrightConfigFiles,
    "cypress.config.ts",
    "cypress.config.js",
    "cypress.json",
    ".cypressrc",
    "wdio.conf.ts",
    "wdio.conf.js"
  ]);
  const hasPlaywrightDependency = scripts.dependencies.some((name) => /(^@playwright\/test$|^playwright$|playwright-core)/i.test(name));
  const playwrightScriptCandidates = [.../* @__PURE__ */ new Set([...scripts.playwrightScripts, ...scripts.e2e])];
  const recommendedPlaywrightCommand = playwrightScriptCandidates[0] !== void 0 ? scriptCommand(scripts.packageManager, playwrightScriptCandidates[0]) : hasPlaywrightDependency || playwrightConfigFiles.length > 0 ? "npx playwright test" : null;
  const chrome = detectChrome();
  const chromeDevtools = detectChromeDevtoolsDependency();
  return {
    policy: "Playwright CLI by default; Chrome DevTools MCP for GIS/WebGL/canvas/map/GPU, console/network/performance, or flaky Playwright.",
    project: {
      packageJson: scripts.packageJson,
      packageManager: scripts.packageManager,
      devServerScripts: scripts.devServer,
      e2eScripts: scripts.e2e,
      browserAutomationDependencies: scripts.dependencies,
      e2eConfigFiles
    },
    playwright: {
      ready: recommendedPlaywrightCommand !== null || scripts.e2e.length > 0 || playwrightConfigFiles.length > 0,
      dependency: hasPlaywrightDependency,
      configFiles: playwrightConfigFiles,
      scripts: playwrightScriptCandidates,
      recommendedCommand: recommendedPlaywrightCommand
    },
    chromeDevtoolsMcp: {
      ready: chromeDevtools.declared && chrome.installed,
      dependencyDeclared: chromeDevtools.declared,
      marketplace: chromeDevtools.marketplace,
      chromeInstalled: chrome.installed,
      chromePath: chrome.path,
      chromeSource: chrome.source
    },
    highFidelityUseCases: [
      "GIS/map tiles",
      "WebGL/canvas/GPU rendering",
      "console/network/performance diagnosis",
      "Playwright flaky or insufficient evidence"
    ]
  };
}
function resolveSpecPathForOutput(cwd, path3) {
  const fsPath = isAbsolute4(path3) ? path3 : join4(cwd, path3);
  return { path: path3, fsPath };
}
function specs(argv) {
  const [sub, ...rest] = argv;
  const cwd = resolve2(readArg6("--cwd", rest) ?? process.cwd());
  if (sub === "dirs") {
    printJson({
      defaultDir: getDefaultDir({ cwd }),
      dirs: getSpecsDirs({ cwd })
    });
    return;
  }
  if (sub === "list") {
    printJson({
      defaultDir: getDefaultDir({ cwd }),
      active: resolveCurrent({ cwd }),
      specs: listSpecs({ cwd })
    });
    return;
  }
  if (sub === "find") {
    const name = firstPositional(rest);
    if (!name) usage();
    const result = findSpec(name, { cwd });
    printJson(result);
    if (result.ok) return;
    process.exit(result.reason === "ambiguous" ? 2 : 1);
  }
  if (sub === "resolve") {
    const input = firstPositional(rest);
    const target = input ?? resolveCurrent({ cwd }) ?? void 0;
    if (!target) {
      printJson({ ok: false, reason: "no-current" });
      process.exit(1);
    }
    if (target.startsWith("./") || target.startsWith("../") || target.includes("/") || isAbsolute4(target)) {
      const resolved2 = resolveSpecPathForOutput(cwd, target);
      if (!isDirectory(resolved2.fsPath)) {
        printJson({ ok: false, reason: "not-found", path: target });
        process.exit(1);
      }
      printJson({ ok: true, name: basename7(target), ...resolved2 });
      return;
    }
    const found = findSpec(target, { cwd });
    if (!found.ok) {
      printJson(found);
      process.exit(found.reason === "ambiguous" ? 2 : 1);
    }
    const resolved = resolveSpecPathForOutput(cwd, found.path);
    printJson({ ok: true, name: basename7(found.path), ...resolved });
    return;
  }
  usage();
}
function state(argv) {
  const sub = argv[0];
  if (sub !== "merge") usage();
  const stateFile = argv[1];
  const patch = argv[2];
  if (!stateFile || !patch) usage();
  return runBundled("merge-state", [stateFile, patch]);
}
function tasks(argv) {
  const sub = argv[0];
  if (sub !== "count") usage();
  const tasksFile = argv[1];
  if (!tasksFile) usage();
  return runBundled("count-tasks", [tasksFile]);
}
async function verifyBlocks(argv) {
  const cwd = readArg6("--cwd", argv);
  const snap = buildWorkflowSnapshot({
    cwd,
    spec: readArg6("--spec", argv)
  });
  if (!snap.spec?.fsPath) {
    process.stderr.write("verify-blocks: no active spec\n");
    process.exit(2);
  }
  const result = await runVerificationCheck({ repoRoot: cwd ?? process.cwd() });
  if (result.ok) process.stdout.write(result.message);
  else process.stderr.write(result.message);
  process.exit(result.code);
}
function doctor(argv) {
  const cwd = resolve2(readArg6("--cwd", argv) ?? process.cwd());
  const snap = buildWorkflowSnapshot({ cwd, spec: readArg6("--spec", argv) });
  const expected = [
    join4(scriptRoot(), "workflow-snapshot.mjs"),
    join4(scriptRoot(), "smart-route.mjs"),
    join4(scriptRoot(), "merge-state.mjs"),
    join4(scriptRoot(), "count-tasks.mjs")
  ];
  printJson({
    ok: expected.every((p) => existsSync6(p)),
    cwd,
    scripts: Object.fromEntries(expected.map((p) => [basename7(p), existsSync6(p)])),
    browserVerification: browserVerificationDoctor(cwd),
    active: snap.active,
    spec: snap.spec,
    gates: snap.gates,
    nextAction: snap.nextAction
  });
}
async function main6() {
  const [command, ...argv] = process.argv.slice(2);
  switch (command) {
    case "route":
      route(argv);
      return;
    case "snapshot":
      snapshot(argv);
      return;
    case "specs":
      specs(argv);
      return;
    case "state":
      state(argv);
      return;
    case "tasks":
      tasks(argv);
      return;
    case "verify-blocks":
      await verifyBlocks(argv);
      return;
    case "doctor":
      doctor(argv);
      return;
    case "-h":
    case "--help":
    case void 0:
      usage(command ? 0 : 1);
  }
  process.stderr.write(`curdx-flow: unknown command: ${command}
`);
  usage();
}
function isDirectRun6() {
  try {
    const entry = fileURLToPath6(import.meta.url);
    return process.argv[1] === entry && basename7(entry).startsWith("runtime-cli.");
  } catch {
    return false;
  }
}
if (isDirectRun6()) {
  void main6();
}
//# sourceMappingURL=runtime-cli.mjs.map
