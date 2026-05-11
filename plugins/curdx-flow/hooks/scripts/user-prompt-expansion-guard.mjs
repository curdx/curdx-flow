import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/lib/workflow-snapshot.ts
import { execFileSync } from "node:child_process";
import { existsSync as existsSync3, readFileSync as readFileSync3, statSync as statSync3 } from "node:fs";
import { basename as basename3, isAbsolute as isAbsolute3, join as join2 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

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

// src/hooks/_shared/markdown-task-parser.ts
var TASK_LINE_RE = /^- \[[ x]\]/;
var INDENTED_RE = /^  /;
var BLANK_RE = /^\s*$/;
var TASK_HEADER_RE = /^- \[([ x])\]\s+(?:(\d+(?:\.\d+)*)\s+)?(.*)$/;
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
function parseTaskList(markdown) {
  if (!markdown) return [];
  const lines = normalize(markdown).split("\n");
  const tasks = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    const trimmed = trimTrailingBlankLines(current.lines);
    const lineEnd = current.lineStart + trimmed.length - 1;
    tasks.push({
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
  return tasks;
}

// src/hooks/lib/project-topology.ts
import {
  existsSync as existsSync2,
  readFileSync as readFileSync2,
  readdirSync as readdirSync2,
  statSync as statSync2
} from "node:fs";
import { homedir } from "node:os";
import path, { basename as basename2, isAbsolute as isAbsolute2, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
  const base = basename2(fallbackPath);
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
  const currentBase = basename2(projectRoot).toLowerCase();
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
function readArg(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function main() {
  const argv = process.argv.slice(2);
  const cwd = readArg("--cwd", argv);
  const goal = readArg("--goal", argv);
  const format = readArg("--format", argv) ?? "json";
  const topology = discoverProjectTopology({ cwd, goal });
  if (format === "context-map") {
    process.stdout.write(renderContextMap(topology));
    return;
  }
  process.stdout.write(JSON.stringify(topology, null, 2) + "\n");
}
function isDirectRun() {
  try {
    const entry = fileURLToPath(import.meta.url);
    return process.argv[1] === entry && basename2(entry).startsWith("project-topology.");
  } catch {
    return false;
  }
}
if (isDirectRun()) {
  main();
}

// src/hooks/lib/workflow-snapshot.ts
function readArg2(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function normalizeSpecPath(cwd, specPath) {
  if (isAbsolute3(specPath)) return specPath;
  return join2(cwd, specPath);
}
function specNameFromPath(specPath) {
  const parts = specPath.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? basename3(specPath);
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
function readJsonFile(path2) {
  try {
    return { ok: true, value: JSON.parse(readFileSync3(path2, "utf8")) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
function artifact(specFs, filename) {
  const p = join2(specFs, filename);
  if (!existsSync3(p)) return { exists: false, path: p };
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
function buildTaskSnapshot(specFs, state) {
  const tasksPath = join2(specFs, "tasks.md");
  if (!existsSync3(tasksPath)) {
    return { total: 0, completed: 0, pending: 0, currentIndex: 0 };
  }
  let tasks = [];
  try {
    tasks = parseTaskList(readFileSync3(tasksPath, "utf8"));
  } catch {
    tasks = [];
  }
  const total = tasks.length;
  const completed = tasks.reduce((n, task) => n + (task.completed ? 1 : 0), 0);
  const pending = total - completed;
  const rawIndex = typeof state?.taskIndex === "number" ? state.taskIndex : completed;
  const currentIndex = Math.max(0, Math.min(rawIndex, Math.max(total - 1, 0)));
  const currentTask = tasks[currentIndex];
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
function isLiteSpecState(state) {
  const route = state?.route?.route;
  return state?.autoPolicy?.executionMode === "spec-lite" || route === "lite-spec";
}
function inferNextAction(state, artifacts, tasks) {
  if (state?.completed === true) return "Spec is completed. Use /curdx-flow:refactor for follow-up changes.";
  if (isLiteSpecState(state)) {
    if (!artifacts.tasks.exists) return "Run /curdx-flow:tasks.";
    if (tasks.pending > 0) return "Run /curdx-flow:implement.";
    return "All task checkboxes are complete; run verification/refactor or mark complete.";
  }
  if (!artifacts.research.exists) return "Run /curdx-flow:research.";
  if (!artifacts.requirements.exists) return "Run /curdx-flow:requirements.";
  if (!artifacts.design.exists) return "Run /curdx-flow:design.";
  if (!artifacts.tasks.exists) return "Run /curdx-flow:tasks.";
  if (tasks.pending > 0) return "Run /curdx-flow:implement.";
  return "All task checkboxes are complete; run verification/refactor or mark complete.";
}
function buildGates(stateInfo, artifacts, tasks, topology) {
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
  if (artifacts.tasks.exists && tasks.total === 0) gates.push("empty-tasks");
  if (tasks.total > 0 && stateInfo.phase === "execution" && tasks.pending === 0 && !stateInfo.completed) {
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
        research: { exists: false, path: join2(cwd, "research.md") },
        requirements: { exists: false, path: join2(cwd, "requirements.md") },
        design: { exists: false, path: join2(cwd, "design.md") },
        tasks: { exists: false, path: join2(cwd, "tasks.md") },
        progress: { exists: false, path: join2(cwd, ".progress.md") }
      },
      tasks: { total: 0, completed: 0, pending: 0, currentIndex: 0 },
      topology,
      git,
      nextAction: "No active spec. Run /curdx-flow:start <name> <goal>.",
      gates: ["no-active-spec"]
    };
  }
  const specFs = normalizeSpecPath(cwd, specPath);
  const statePath = join2(specFs, ".curdx-state.json");
  let state = null;
  const stateInfo = {
    exists: existsSync3(statePath),
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
      state = parsed.value;
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
  const tasks = buildTaskSnapshot(specFs, state);
  return {
    version: 2,
    cwd,
    active: existsSync3(specFs),
    spec: {
      name: specNameFromPath(specPath),
      path: specPath,
      fsPath: specFs,
      statePath
    },
    state: stateInfo,
    artifacts,
    tasks,
    topology,
    git,
    nextAction: inferNextAction(state, artifacts, tasks),
    gates: buildGates(stateInfo, artifacts, tasks, topology)
  };
}
function main2() {
  const argv = process.argv.slice(2);
  const snapshot = buildWorkflowSnapshot({
    cwd: readArg2("--cwd", argv),
    spec: readArg2("--spec", argv),
    goal: readArg2("--goal", argv)
  });
  process.stdout.write(JSON.stringify(snapshot, null, 2) + "\n");
}
function isDirectRun2() {
  try {
    const entry = fileURLToPath2(import.meta.url);
    return process.argv[1] === entry && basename3(entry).startsWith("workflow-snapshot.");
  } catch {
    return false;
  }
}
if (isDirectRun2()) {
  main2();
}

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

// src/hooks/user-prompt-expansion-guard.ts
var KNOWN = /* @__PURE__ */ new Set([
  "curdx-flow:cancel",
  "curdx-flow:design",
  "curdx-flow:feedback",
  "curdx-flow:help",
  "curdx-flow:implement",
  "curdx-flow:index",
  "curdx-flow:new",
  "curdx-flow:refactor",
  "curdx-flow:requirements",
  "curdx-flow:research",
  "curdx-flow:start",
  "curdx-flow:status",
  "curdx-flow:switch",
  "curdx-flow:tasks",
  "curdx-flow:triage"
]);
async function main3() {
  let input;
  try {
    input = await readStdinJson();
  } catch {
    return;
  }
  if (input.expansion_type !== "slash_command") return;
  const commandName = input.command_name ?? "";
  if (!commandName.startsWith("curdx-flow:")) return;
  if (!KNOWN.has(commandName)) {
    process.stdout.write(
      JSON.stringify({
        decision: "block",
        reason: `Unknown curdx-flow skill: ${commandName}`,
        hookSpecificOutput: {
          hookEventName: "UserPromptExpansion",
          additionalContext: "Run /curdx-flow:help to list supported curdx-flow skills."
        }
      })
    );
    return;
  }
  try {
    const snapshot = buildWorkflowSnapshot({
      cwd: input.cwd,
      goal: input.command_args
    });
    const context = [
      "curdx-flow expansion context:",
      `active=${snapshot.active}`,
      `next=${snapshot.nextAction}`,
      `gates=${snapshot.gates.join(",") || "none"}`
    ].join(" ");
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptExpansion",
          additionalContext: context
        }
      })
    );
  } catch {
  }
}
void main3();
//# sourceMappingURL=user-prompt-expansion-guard.mjs.map
