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
function meaningfulProjectEntries(projectRoot) {
  try {
    return readdirSync2(projectRoot).filter((name) => {
      if (name === ".git" || name === ".hg" || name === ".svn") return false;
      if (name === ".DS_Store" || name === "Thumbs.db") return false;
      if (name === ".claude" || name === ".curdx") return false;
      if (name === "specs") return false;
      return true;
    });
  } catch {
    return [];
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
function hasManifestOrSource(rootAbs) {
  return [
    "package.json",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "go.mod",
    "pyproject.toml",
    "Cargo.toml",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    "src",
    "app",
    "packages"
  ].some((entry) => existsSync2(path.join(rootAbs, entry)));
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
function detectWorkspaceState(projectRoot, roots) {
  const meaningfulEntries = meaningfulProjectEntries(projectRoot);
  if (meaningfulEntries.length === 0) return "empty";
  const accessibleRoots = roots.filter((root) => root.access !== "missing-path");
  const hasFrontend = accessibleRoots.some(
    (root) => root.role === "frontend" || root.kinds.includes("frontend-app")
  );
  const hasBackend = accessibleRoots.some(
    (root) => root.role === "backend" || root.kinds.includes("backend-service")
  );
  const hasMultipleRoots = new Set(accessibleRoots.map((root) => root.path)).size > 1;
  if (hasMultipleRoots && hasFrontend && hasBackend) return "split-repo";
  const current = accessibleRoots.find((root) => root.path === ".");
  const currentAbs = projectRoot;
  const currentKnown = current !== void 0 && current.kinds.some((kind) => kind !== "unknown" && kind !== "infra");
  if (currentKnown || hasManifestOrSource(currentAbs)) return "existing";
  return "scaffolded";
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
  const workspaceState = detectWorkspaceState(projectRoot, roots);
  return {
    version: 1,
    cwd,
    projectRoot,
    workspaceState,
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
    `Workspace state: ${topology.workspaceState}`,
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
    workspaceState: topology.workspaceState,
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

// src/hooks/lib/smart-route.ts
import { existsSync as existsSync6, readFileSync as readFileSync6 } from "node:fs";
import { basename as basename6, join as join5 } from "node:path";
import { fileURLToPath as fileURLToPath5 } from "node:url";

// src/hooks/lib/auto-policy.ts
import { fileURLToPath as fileURLToPath3 } from "node:url";
import { basename as basename4 } from "node:path";
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
function readArg3(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function main3() {
  const argv = process.argv.slice(2);
  const goal = readArg3("--goal", argv) ?? "";
  const flags = readArg3("--flags", argv) ?? "";
  const files = parseList(readArg3("--files", argv));
  const estimatedRaw = readArg3("--estimated-files", argv);
  const taskRaw = readArg3("--task-count", argv);
  const policy = classifyAutoPolicy({
    goal,
    flags,
    changedFiles: files,
    estimatedFiles: estimatedRaw === void 0 ? void 0 : Number(estimatedRaw),
    taskCount: taskRaw === void 0 ? void 0 : Number(taskRaw)
  });
  process.stdout.write(JSON.stringify(policy, null, 2) + "\n");
}
function isDirectRun3() {
  try {
    const entry = fileURLToPath3(import.meta.url);
    return process.argv[1] === entry && basename4(entry).startsWith("auto-policy.");
  } catch {
    return false;
  }
}
if (isDirectRun3()) {
  main3();
}

// src/hooks/lib/tool-capabilities.ts
import { basename as basename5 } from "node:path";
import { fileURLToPath as fileURLToPath4 } from "node:url";

// src/hooks/lib/capability-normalization.ts
var KNOWN_CAPABILITY_TOKEN_RE = /\b(?:claude-mem|context7|sequential-thinking|chrome-devtools-mcp|chrome devtools mcp|ui-ux-pro-max|pua)\b/gi;
function stripKnownCapabilityTokens(input) {
  return (input ?? "").replace(KNOWN_CAPABILITY_TOKEN_RE, " ");
}

// src/hooks/lib/tool-capabilities.ts
var CAPABILITIES = {
  "context7": {
    id: "context7",
    name: "Context7",
    type: "mcp",
    ownedBy: "context7",
    provisioning: "external-mcp",
    curdxRole: ["recommend", "gate"],
    doNotReimplement: true,
    expectedByDefault: true,
    invocation: "Context7 MCP",
    summary: "current docs for libraries, SDKs, APIs, and frameworks",
    useWhen: "use the Context7 MCP before implementation when external library, SDK, API, or framework behavior matters.",
    skipWhen: "Skip for pure local logic, typos, and code paths fully understood from this repository.",
    missingAction: "Enable the external context7 MCP server from your setup script or configure https://mcp.context7.com/mcp."
  },
  "claude-mem": {
    id: "claude-mem",
    name: "claude-mem",
    type: "plugin",
    ownedBy: "claude-mem",
    provisioning: "plugin-dependency",
    curdxRole: ["recommend"],
    doNotReimplement: true,
    expectedByDefault: true,
    invocation: "/claude-mem:mem-search",
    summary: "cross-session memory search and phased plan/execution commands",
    useWhen: "Use /claude-mem:mem-search when similar work, prior decisions, or repeated failures may exist; use /claude-mem:make-plan only for genuinely phased work.",
    skipWhen: "Skip when the task is new, obvious, and smaller than a short local edit.",
    missingAction: "Install/enable claude-mem from the thedotmack marketplace dependency."
  },
  "sequential-thinking": {
    id: "sequential-thinking",
    name: "sequential-thinking",
    type: "mcp",
    ownedBy: "sequential-thinking",
    provisioning: "external-mcp",
    curdxRole: ["recommend"],
    doNotReimplement: true,
    expectedByDefault: true,
    invocation: "sequential-thinking MCP",
    summary: "structured hypothesis breakdown for hard architecture and debugging problems",
    useWhen: "Use for architecture tradeoffs, migrations, security/data/release risk, or debugging where assumptions may change.",
    skipWhen: "Skip for direct edits, simple lookups, and deterministic fixes.",
    missingAction: "Enable the external sequential-thinking MCP server from your setup script."
  },
  "chrome-devtools-mcp": {
    id: "chrome-devtools-mcp",
    name: "Chrome DevTools MCP",
    type: "plugin",
    ownedBy: "chrome-devtools-mcp",
    provisioning: "plugin-dependency",
    curdxRole: ["recommend", "gate"],
    doNotReimplement: true,
    expectedByDefault: true,
    invocation: "Chrome DevTools MCP",
    summary: "real browser console, network, DOM, performance, and screenshot/snapshot verification",
    useWhen: "Use for browser runtime behavior, UI regressions, DOM/CSS issues, network failures, and frontend verification.",
    skipWhen: "Skip for backend-only code with no browser-facing behavior.",
    missingAction: "Install/enable chrome-devtools-mcp and make sure Chrome is installed."
  },
  "ui-ux-pro-max": {
    id: "ui-ux-pro-max",
    name: "ui-ux-pro-max",
    type: "plugin",
    ownedBy: "ui-ux-pro-max",
    provisioning: "plugin-dependency",
    curdxRole: ["recommend"],
    doNotReimplement: true,
    expectedByDefault: true,
    invocation: "ui-ux-pro-max plugin skills",
    summary: "frontend UX/design guidance for UI pages, components, and interaction polish",
    useWhen: "Use when building or changing visible UI, interaction design, frontend layout, or visual quality.",
    skipWhen: "Skip for backend-only changes, copy-only edits, and internal CLI/library work.",
    missingAction: "Install/enable ui-ux-pro-max from the ui-ux-pro-max-skill marketplace dependency."
  },
  "pua": {
    id: "pua",
    name: "pua",
    type: "plugin",
    ownedBy: "pua",
    provisioning: "plugin-dependency",
    curdxRole: ["recommend"],
    doNotReimplement: true,
    expectedByDefault: true,
    invocation: "/pua:pua-loop or /pua:p9",
    summary: "structured retries and parallel task decomposition",
    useWhen: "Use after multiple failed attempts or for truly independent parallel work slices.",
    skipWhen: "Skip on first-attempt failures, known fixes, and work that is sequential by dependency.",
    missingAction: "Install/enable pua from the pua-skills marketplace dependency."
  },
  "docs-query": {
    id: "docs-query",
    name: "Docs query",
    type: "workflow",
    ownedBy: "curdx-flow",
    provisioning: "workflow",
    curdxRole: ["gate"],
    doNotReimplement: false,
    expectedByDefault: true,
    invocation: "Context7 or official docs",
    summary: "phase-specific grounding against current documentation",
    useWhen: "Use before implementation when quality gates mark docs as required.",
    skipWhen: "Skip when local code fully defines the behavior and no external API/version matters."
  },
  "browser-verification": {
    id: "browser-verification",
    name: "Browser verification",
    type: "workflow",
    ownedBy: "curdx-flow",
    provisioning: "workflow",
    curdxRole: ["gate", "record-evidence"],
    doNotReimplement: false,
    expectedByDefault: true,
    invocation: "Playwright or Chrome DevTools MCP",
    summary: "repeatable browser/runtime proof for UI and full-stack behavior",
    useWhen: "Use when browser-facing quality gates are required or suggested.",
    skipWhen: "Skip for backend-only and CLI-only work."
  },
  "tdd-cycle": {
    id: "tdd-cycle",
    name: "TDD cycle",
    type: "workflow",
    ownedBy: "curdx-flow",
    provisioning: "workflow",
    curdxRole: ["gate"],
    doNotReimplement: false,
    expectedByDefault: true,
    invocation: "RED/GREEN/VERIFY loop",
    summary: "test-first implementation for behavior changes",
    useWhen: "Use when route/risk indicates implementation should be protected by a regression test.",
    skipWhen: "Skip for docs-only edits and pure mechanical metadata updates."
  },
  "security-review": {
    id: "security-review",
    name: "Security review",
    type: "workflow",
    ownedBy: "curdx-flow",
    provisioning: "workflow",
    curdxRole: ["gate"],
    doNotReimplement: false,
    expectedByDefault: true,
    invocation: "read-only security review",
    summary: "focused review of auth, secrets, injection, release, and dependency risk",
    useWhen: "Use when quality gates indicate auth/security/release risk.",
    skipWhen: "Skip for isolated copy edits with no executable behavior."
  },
  "stack-specific-verification": {
    id: "stack-specific-verification",
    name: "Stack-specific verification",
    type: "workflow",
    ownedBy: "curdx-flow",
    provisioning: "workflow",
    curdxRole: ["gate", "record-evidence"],
    doNotReimplement: false,
    expectedByDefault: true,
    invocation: "curdx-flow route qualityGates",
    summary: "run the verifier that matches the detected stack profile",
    useWhen: "Use before completion whenever smart-route returns a suggestedVerifier.",
    skipWhen: "Skip only when no stack profile is detected and no repo verifier exists."
  },
  "context-budget": {
    id: "context-budget",
    name: "Context budget",
    type: "policy",
    ownedBy: "curdx-flow",
    provisioning: "workflow",
    curdxRole: ["route", "compile-brief"],
    doNotReimplement: false,
    expectedByDefault: true,
    invocation: "curdx-flow route contextBudget",
    summary: "limit reference loading by route and stack confidence",
    useWhen: "Use for every non-trivial route to keep the session focused.",
    skipWhen: "Skip only for no-op direct changes."
  }
};
var ORDER = [
  "context7",
  "docs-query",
  "claude-mem",
  "ui-ux-pro-max",
  "chrome-devtools-mcp",
  "browser-verification",
  "tdd-cycle",
  "security-review",
  "stack-specific-verification",
  "context-budget",
  "sequential-thinking",
  "pua"
];
var EXTERNAL_DOCS_RE = /\b(api|sdk|library|libraries|framework|version|upgrade|dependency|dependencies|official docs?|latest docs?|claude code|plugin|mcp|hook|hooks|skill|skills|agent|agents|scaffold|starter|template|generator|initializer|initializr|react|vue|spring|spring boot|spring cloud|next\.?js|vite|webpack|npm|node|go|python|rust|cargo|maven|gradle|cookiecutter)\b|最新|依赖|框架|插件|官方|联网|搜索|文档|脚手架|初始化|生成器|模板/i;
var MEMORY_RE = /\b(previous|before|again|remember|memory|history|similar|repeated|regression|already solved|same bug|past decision)\b|之前|上次|记得|历史|做过|又|重复|老问题/i;
var UI_RE = /\b(ui|ux|frontend|front-end|browser|chrome|dom|css|html|layout|component|page|form|modal|responsive|visual|render|react|vue|vite|next\.?js|screenshot|interaction)\b|前端|页面|浏览器|样式|交互|组件|布局|视觉|截图/i;
var BROWSER_VERIFY_RE = /\b(browser|chrome|dom|css|network|console|performance|render|screenshot|e2e|playwright|visual regression|interaction)\b|浏览器|控制台|网络|性能|渲染|截图|端到端/i;
var COMPLEX_RE = /\b(architecture|architect|migration|migrate|security|auth|authentication|authorization|permission|oauth|payment|billing|database|schema|release|publish|npm|tag|hook|subagent|multi[- ]?repo|monorepo|cross[- ]?system|concurrency|race|cache|rewrite|refactor)\b|架构|迁移|安全|权限|认证|数据库|发布|重写|并发|跨仓库|多仓库/i;
var STUCK_RE = /\b(stuck|failed|failure|fails|flaky|retry|debug|investigate|root cause|not working|broken|regression)\b|卡住|失败|报错|不行|修不好|定位|排查/i;
var REPEATED_FAILURE_RE = /\b(repeated|multiple failed|failed twice|failed 2|again failed|keeps failing|stuck again)\b|连续失败|多次失败|失败两次|又失败|反复失败|一直失败/i;
var PARALLEL_RE = /\b(parallel|multi-agent|team|decompose|split|epic|multiple subsystems|large refactor)\b|并行|多智能体|拆分|史诗|多模块/i;
var LOW_RISK_LOCAL_RE = /\b(typo|readme|docs?|comment|comments|copy|wording|rename label|format text)\b|错别字|注释|文案/i;
function normalize2(input) {
  return (input ?? "").trim().replace(/\s+/g, " ");
}
function hasAny(values, candidates) {
  const set = new Set((values ?? []).map((v) => v.toLowerCase()));
  return candidates.some((candidate) => set.has(candidate.toLowerCase()));
}
function capabilityAvailability(id, available) {
  const cap = CAPABILITIES[id];
  if (cap.type === "workflow" || cap.type === "policy") {
    return { availability: "known-available", availabilityState: "workflow" };
  }
  const expectedAvailability = cap.provisioning === "external-mcp" ? "external-expected" : "plugin-dependency";
  if (available === null) {
    return {
      availability: cap.expectedByDefault ? expectedAvailability : "check-if-installed",
      availabilityState: cap.expectedByDefault ? "expected" : "missing"
    };
  }
  if (available.has(id)) {
    return { availability: "known-available", availabilityState: "available" };
  }
  return {
    availability: cap.expectedByDefault ? expectedAvailability : "check-if-installed",
    availabilityState: "missing"
  };
}
function pushRecommendation(out, available, id, phase, reason, instruction, extra = {}) {
  const availability = capabilityAvailability(id, available);
  if (out.some((rec2) => rec2.id === id)) return;
  const cap = CAPABILITIES[id];
  out.push({
    id,
    name: cap.name,
    type: cap.type,
    invocation: cap.invocation,
    phase,
    ...extra,
    availability: availability.availability,
    availabilityState: availability.availabilityState,
    ownedBy: cap.ownedBy,
    provisioning: cap.provisioning,
    curdxRole: cap.curdxRole,
    doNotReimplement: cap.doNotReimplement,
    expectedByDefault: cap.expectedByDefault,
    ...availability.availabilityState === "missing" && cap.missingAction ? { missingAction: cap.missingAction } : {},
    reason,
    instruction,
    triggerReason: reason,
    requiredWhen: cap.curdxRole.includes("gate") ? "Required when this route reaches its matching quality gate." : "Use when the coordinator is in the matching phase and the task context still fits this reason.",
    fallbackWhenMissing: cap.missingAction ?? (cap.doNotReimplement ? "Do not rebuild this capability inside curdx-flow; continue with the local workflow only if the evidence gate can still be satisfied." : "Use the local curdx-flow workflow path for this capability.")
  });
}
function sortRecommendations(recs) {
  return [...recs].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
}
function recommendToolCapabilities(input) {
  const goal = normalize2(input.goal);
  const semanticGoal = normalize2(stripKnownCapabilityTokens(goal));
  const route = normalize2(input.route);
  const risk = normalize2(input.risk);
  const topologyKinds2 = input.topologyKinds ?? [];
  const topologyFrameworks2 = input.topologyFrameworks ?? [];
  const stackProfile = input.stackProfile;
  const qualityGates = input.qualityGates ?? [];
  const contextBudget = input.contextBudget;
  const missingRoots = input.missingRoots ?? 0;
  const available = input.availableCapabilities === void 0 ? null : new Set(input.availableCapabilities.filter(Boolean));
  const recs = [];
  if (missingRoots > 0) {
    return recs;
  }
  const externalDocsRelevant = EXTERNAL_DOCS_RE.test(semanticGoal);
  const localLowRisk = LOW_RISK_LOCAL_RE.test(semanticGoal) && route === "direct-change" && !externalDocsRelevant;
  if (localLowRisk) {
    return recs;
  }
  const hasFrontend = UI_RE.test(semanticGoal) || hasAny(topologyKinds2, ["frontend-app"]) || hasAny(topologyFrameworks2, ["react", "vue", "next.js", "vite"]);
  const browserRuntime = BROWSER_VERIFY_RE.test(semanticGoal) || hasFrontend;
  const complex = COMPLEX_RE.test(semanticGoal) && route !== "direct-change" || risk === "high" || risk === "critical" || route === "full-spec" || route === "epic-split";
  const stuck = STUCK_RE.test(semanticGoal);
  const repeatedFailure = REPEATED_FAILURE_RE.test(semanticGoal) || (input.recentFailures ?? 0) >= 2;
  const parallel = PARALLEL_RE.test(semanticGoal) || route === "epic-split";
  const stackIds = stackProfile?.detected.map((stack) => stack.id) ?? [];
  const docsGate = qualityGates.find((gate) => gate.id.endsWith("-docs"));
  const browserGate = qualityGates.find((gate) => gate.id.endsWith("-browser"));
  const tddGate = qualityGates.find((gate) => gate.id.endsWith("-tdd"));
  const securityGate = qualityGates.find((gate) => gate.id.endsWith("-security-review"));
  const baselineGate = qualityGates.find((gate) => gate.id.endsWith("-baseline"));
  if (externalDocsRelevant || docsGate?.required === true) {
    pushRecommendation(
      recs,
      available,
      "context7",
      "before-coding",
      docsGate?.reason ?? "external documentation or current API behavior is likely relevant",
      stackProfile?.primary === "claude-code-plugin" ? "Start from official Claude Code docs; use Context7 only for external library/framework docs." : "Use Context7 before editing so version-specific library behavior is grounded in current docs.",
      { category: "docs", stackIds }
    );
    pushRecommendation(
      recs,
      available,
      "docs-query",
      "before-coding",
      docsGate?.reason ?? "documentation grounding should happen before implementation",
      "Query official/current docs first, then summarize only the decisions that affect this route.",
      { category: "docs", stackIds }
    );
  }
  if (MEMORY_RE.test(semanticGoal) || stuck || route === "full-spec" || route === "epic-split") {
    pushRecommendation(
      recs,
      available,
      "claude-mem",
      "planning",
      "similar prior work or longer-running plan may exist",
      "Search memory before planning; use make-plan only when the work is genuinely phased.",
      { category: "context", stackIds }
    );
  }
  if (hasFrontend) {
    pushRecommendation(
      recs,
      available,
      "ui-ux-pro-max",
      "implementation",
      "visible frontend behavior or UI quality is in scope",
      "Use ui-ux-pro-max guidance for UI structure, interaction, responsive behavior, and visual polish.",
      { category: "verification", stackIds }
    );
  }
  if (browserRuntime || browserGate !== void 0) {
    pushRecommendation(
      recs,
      available,
      "chrome-devtools-mcp",
      "verification",
      browserGate?.reason ?? "browser runtime behavior should be verified in a real browser",
      "Use Chrome DevTools MCP for console, network, DOM, performance, or visual proof after implementation.",
      { category: "verification", stackIds }
    );
    pushRecommendation(
      recs,
      available,
      "browser-verification",
      "verification",
      browserGate?.reason ?? "browser-facing behavior needs repeatable runtime evidence",
      "Prefer Playwright for repeatable E2E; use Chrome DevTools MCP when high-fidelity runtime inspection is needed.",
      { category: "verification", stackIds }
    );
  }
  if (tddGate?.required === true) {
    pushRecommendation(
      recs,
      available,
      "tdd-cycle",
      "implementation",
      tddGate.reason,
      "Start with a focused failing test or reproduction when behavior is changing; keep the test in the final verifier.",
      { category: "tdd", stackIds }
    );
  }
  if (securityGate !== void 0 || COMPLEX_RE.test(semanticGoal)) {
    pushRecommendation(
      recs,
      available,
      "security-review",
      "verification",
      securityGate?.reason ?? "the task touches a risk surface that benefits from security review",
      "Run a read-only security pass over auth, input validation, secrets, dependencies, and release metadata before completion.",
      { category: "security", stackIds }
    );
  }
  if ((baselineGate !== void 0 || stackProfile?.primary !== "unknown") && route !== "direct-change") {
    pushRecommendation(
      recs,
      available,
      "stack-specific-verification",
      "verification",
      baselineGate?.reason ?? "detected stack should drive the final verifier",
      baselineGate?.command ? `Run the stack verifier: ${baselineGate.command}.` : "Use the repository's documented verifier for the detected stack.",
      { category: "verification", stackIds }
    );
  }
  if (contextBudget !== void 0 && route !== "direct-change") {
    pushRecommendation(
      recs,
      available,
      "context-budget",
      "planning",
      `context budget is ${contextBudget.level}`,
      contextBudget.strategy,
      { category: "context", stackIds }
    );
  }
  if (complex || stuck) {
    pushRecommendation(
      recs,
      available,
      "sequential-thinking",
      "planning",
      "risk or uncertainty requires explicit hypothesis management",
      "Use sequential-thinking to break assumptions before choosing the implementation path.",
      { category: "context", stackIds }
    );
  }
  if (stuck && repeatedFailure || parallel) {
    pushRecommendation(
      recs,
      available,
      "pua",
      stuck ? "recovery" : "planning",
      stuck ? "the goal indicates repeated failure or debugging difficulty" : "large work may contain independent parallel slices",
      stuck ? "Use /pua:pua-loop only after local triage confirms the first fix path is not working." : "Use /pua:p9 only after dependencies prove the slices can run independently.",
      { category: stuck ? "recovery" : "context", stackIds }
    );
  }
  return sortRecommendations(recs);
}
function parseList2(value) {
  if (!value) return [];
  return value.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}
function readArg4(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function main4() {
  const argv = process.argv.slice(2);
  const recommendations = recommendToolCapabilities({
    goal: readArg4("--goal", argv),
    route: readArg4("--route", argv),
    risk: readArg4("--risk", argv),
    topologyKinds: parseList2(readArg4("--topology-kinds", argv)),
    topologyFrameworks: parseList2(readArg4("--topology-frameworks", argv)),
    missingRoots: Number(readArg4("--missing-roots", argv) ?? 0),
    availableCapabilities: readArg4("--available-capabilities", argv) ? parseList2(readArg4("--available-capabilities", argv)) : void 0
  });
  process.stdout.write(JSON.stringify(recommendations, null, 2) + "\n");
}
function isDirectRun4() {
  try {
    const entry = fileURLToPath4(import.meta.url);
    return process.argv[1] === entry && basename5(entry).startsWith("tool-capabilities.");
  } catch {
    return false;
  }
}
if (isDirectRun4()) {
  main4();
}

// src/hooks/lib/project-brain.ts
import { appendFileSync, existsSync as existsSync4, mkdirSync, readFileSync as readFileSync4, statSync as statSync4, writeFileSync } from "node:fs";
import { join as join3, resolve as resolve2 } from "node:path";
var MAX_REASON = 240;
var MAX_COMMAND = 180;
var MAX_BRAIN_BYTES = 64 * 1024;
var MAX_BRAIN_LINES = 400;
function normalizeCwd(cwd) {
  return resolve2(cwd ?? process.cwd());
}
function brainPath(cwd) {
  return join3(normalizeCwd(cwd), ".curdx", "brain.jsonl");
}
function truncate(value, limit) {
  if (value === void 0) return void 0;
  const compact = value.trim().replace(/\s+/g, " ");
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, Math.max(0, limit - 3))}...`;
}
function normalizeEvent(event) {
  const out = {
    version: 1,
    type: event.type,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (event.route) out.route = event.route;
  if (event.stack) out.stack = event.stack;
  if (event.phase) out.phase = event.phase;
  if (event.command) out.command = truncate(event.command, MAX_COMMAND);
  if (typeof event.exitCode === "number" && Number.isFinite(event.exitCode)) {
    out.exitCode = event.exitCode;
  }
  if (event.verifier) out.verifier = truncate(event.verifier, MAX_COMMAND);
  if (event.reason) out.reason = truncate(event.reason, MAX_REASON);
  if (typeof event.files === "number" && Number.isFinite(event.files)) {
    out.files = Math.max(0, Math.floor(event.files));
  }
  return out;
}
function appendBrainEvent(cwd, event) {
  const path2 = brainPath(cwd);
  if (process.env.CURDX_FLOW_BRAIN === "off") return { ok: true, path: path2 };
  try {
    mkdirSync(join3(normalizeCwd(cwd), ".curdx"), { recursive: true });
    appendFileSync(path2, JSON.stringify(normalizeEvent(event)) + "\n", "utf8");
    compactBrainIfNeeded(path2);
    return { ok: true, path: path2 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, path: path2, error: message };
  }
}
function compactBrainIfNeeded(path2) {
  try {
    if (statSync4(path2).size <= MAX_BRAIN_BYTES) return;
    const lines = readFileSync4(path2, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-MAX_BRAIN_LINES);
    writeFileSync(path2, lines.join("\n") + (lines.length > 0 ? "\n" : ""), "utf8");
  } catch {
  }
}
function parseBrainLine(line) {
  try {
    const parsed = JSON.parse(line);
    if (parsed.version !== 1) return null;
    if (parsed.type !== "route-compiled" && parsed.type !== "edit-batch" && parsed.type !== "verification-run" && parsed.type !== "verification-blocked" && parsed.type !== "last-mile-decision") {
      return null;
    }
    if (typeof parsed.timestamp !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}
function readBrainEvents(cwd, limit = 100) {
  const path2 = brainPath(cwd);
  if (!existsSync4(path2)) return [];
  try {
    const lines = readFileSync4(path2, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const parsed = lines.slice(Math.max(0, lines.length - Math.max(1, limit))).map(parseBrainLine).filter((event) => event !== null);
    return parsed;
  } catch {
    return [];
  }
}
function uniqueRecent(values, limit) {
  const out = [];
  for (const value of values.reverse()) {
    if (!value || out.includes(value)) continue;
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}
function summarizeProjectBrain(cwd) {
  const path2 = brainPath(cwd);
  const events = readBrainEvents(cwd, 200);
  const failures = events.filter((event) => event.type === "verification-blocked" || event.exitCode !== void 0 && event.exitCode !== 0).slice(-5).reverse().map((event) => ({
    timestamp: event.timestamp,
    type: event.type,
    phase: event.phase,
    command: event.command,
    reason: event.reason
  }));
  const verifierHints = uniqueRecent(
    events.filter((event) => event.type === "verification-run" && event.exitCode === 0).map((event) => event.command ?? event.verifier),
    5
  );
  return {
    path: path2,
    exists: existsSync4(path2),
    totalEvents: events.length,
    lastUpdated: events.length > 0 ? events[events.length - 1]?.timestamp ?? null : null,
    stackHints: uniqueRecent(events.map((event) => event.stack), 5),
    verifierHints,
    recentFailures: failures
  };
}

// src/hooks/lib/stack-capabilities.ts
import { existsSync as existsSync5, readFileSync as readFileSync5, readdirSync as readdirSync3 } from "node:fs";
import { isAbsolute as isAbsolute4, join as join4, resolve as resolve3 } from "node:path";
var STACKS = {
  "typescript": {
    id: "typescript",
    name: "TypeScript",
    frameworks: ["typescript"],
    goalPattern: /\b(ts|typescript|typecheck|tsconfig)\b/i,
    manifestHints: ["tsconfig.json", "tsconfig.*.json"],
    docsQuery: "TypeScript official documentation for compiler and project configuration",
    tdd: "Write focused tests first when behavior changes; keep typecheck as a mandatory gate.",
    security: "Review unsafe casts, unchecked external input, and dependency/script changes.",
    verifierCommands: ["npm run typecheck", "npm test", "npm run build"],
    releaseCommands: ["npm run verify"],
    browser: false,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "react": {
    id: "react",
    name: "React",
    frameworks: ["react"],
    goalPattern: /\b(react|jsx|tsx|component|hook|frontend|ui)\b|前端|组件|页面/i,
    manifestHints: ["package.json:react"],
    docsQuery: "React official documentation for current component and hook behavior",
    tdd: "Prefer component or interaction tests for user-visible behavior.",
    security: "Review XSS, unsafe HTML, auth state leaks, and client-side permission assumptions.",
    verifierCommands: ["npm run typecheck", "npm test", "npm run build"],
    releaseCommands: ["npm run test:e2e"],
    browser: true,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "vue": {
    id: "vue",
    name: "Vue",
    frameworks: ["vue", "vite"],
    goalPattern: /\b(vue|vue3|vite|pinia|vue router|component|frontend|ui)\b|前端|组件|页面/i,
    manifestHints: ["package.json:vue", "vite.config.*"],
    docsQuery: "Vue and Vite official documentation for current project setup and runtime behavior",
    tdd: "Prefer component or interaction tests; keep vue-tsc/typecheck and build gates.",
    security: "Review template injection, route guards, auth state leaks, and unsafe dynamic HTML.",
    verifierCommands: ["npm run typecheck", "npm test", "npm run build"],
    releaseCommands: ["npm run test:e2e"],
    browser: true,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "next": {
    id: "next",
    name: "Next.js",
    frameworks: ["next"],
    goalPattern: /\b(next\.?js|next|app router|server action|route handler)\b/i,
    manifestHints: ["next.config.*", "package.json:next"],
    docsQuery: "Next.js official documentation for routing, server actions, rendering, and build behavior",
    tdd: "Test server/client boundaries and route handlers before broad UI changes.",
    security: "Review server/client data exposure, auth, cookies, headers, and route handlers.",
    verifierCommands: ["npm run typecheck", "npm test", "npm run build"],
    releaseCommands: ["npm run test:e2e"],
    browser: true,
    contextBudget: {
      "direct-change": "focused",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "node": {
    id: "node",
    name: "Node.js",
    frameworks: ["node-api", "nestjs", "fastify", "hono"],
    goalPattern: /\b(node|api|express|fastify|nestjs|hono|server)\b/i,
    manifestHints: ["package.json"],
    docsQuery: "Node.js and framework official documentation for current API behavior",
    tdd: "Use unit/integration tests around API behavior and error paths.",
    security: "Review input validation, auth, command execution, secrets, and dependency scripts.",
    verifierCommands: ["npm test", "npm run typecheck", "npm run build"],
    releaseCommands: ["npm run verify"],
    browser: false,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "spring-boot": {
    id: "spring-boot",
    name: "Spring Boot",
    frameworks: ["spring-boot"],
    goalPattern: /\b(spring boot|spring|maven|gradle|controller|service|repository)\b|后端|接口/i,
    manifestHints: ["pom.xml:spring-boot", "build.gradle:spring-boot"],
    docsQuery: "Spring Boot official documentation for current runtime, testing, and actuator behavior",
    tdd: "Use slice or integration tests for controller/service/repository behavior.",
    security: "Review auth filters, authorization, validation, configuration, and secret exposure.",
    verifierCommands: ["./mvnw test", "./gradlew test", "mvn test", "gradle test"],
    releaseCommands: ["./mvnw verify", "./gradlew build"],
    browser: false,
    contextBudget: {
      "direct-change": "focused",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "spring-cloud": {
    id: "spring-cloud",
    name: "Spring Cloud",
    frameworks: ["spring-cloud"],
    goalPattern: /\b(spring cloud|gateway|config server|eureka|openfeign|resilience4j)\b/i,
    manifestHints: ["pom.xml:spring-cloud", "build.gradle:spring-cloud"],
    docsQuery: "Spring Cloud official documentation for current integration, gateway, and config behavior",
    tdd: "Prefer integration tests or contract tests for cross-service behavior.",
    security: "Review gateway filters, service auth, config leakage, and network boundaries.",
    verifierCommands: ["./mvnw test", "./gradlew test", "mvn test", "gradle test"],
    releaseCommands: ["./mvnw verify", "./gradlew build"],
    browser: false,
    contextBudget: {
      "direct-change": "focused",
      "lite-spec": "standard",
      "full-spec": "expanded",
      "epic-split": "expanded"
    }
  },
  "python": {
    id: "python",
    name: "Python",
    frameworks: ["python", "fastapi", "django", "flask"],
    goalPattern: /\b(python|pytest|fastapi|django|flask|pyproject|ruff)\b/i,
    manifestHints: ["pyproject.toml", "requirements.txt"],
    docsQuery: "Python framework official documentation for current API and testing behavior",
    tdd: "Use pytest around behavior and regression reproduction.",
    security: "Review deserialization, SQL/query construction, auth, secrets, and dependency pinning.",
    verifierCommands: ["pytest", "python -m pytest", "ruff check .", "mypy ."],
    releaseCommands: ["python -m build"],
    browser: false,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "go": {
    id: "go",
    name: "Go",
    frameworks: ["go"],
    goalPattern: /\b(go|golang|go test|go mod|goroutine|grpc)\b/i,
    manifestHints: ["go.mod"],
    docsQuery: "Go official documentation for current standard library and tooling behavior",
    tdd: "Use table-driven tests and keep go test ./... as the baseline gate.",
    security: "Review context cancellation, goroutine leaks, input validation, auth, and unsafe file/network paths.",
    verifierCommands: ["go test ./...", "go vet ./...", "go build ./..."],
    releaseCommands: ["go test ./..."],
    browser: false,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "rust": {
    id: "rust",
    name: "Rust",
    frameworks: ["rust"],
    goalPattern: /\b(rust|cargo|crate|tokio|axum)\b/i,
    manifestHints: ["Cargo.toml"],
    docsQuery: "Rust and crate official documentation for current API and safety behavior",
    tdd: "Use cargo test and focused regression tests before implementation changes.",
    security: "Review unsafe blocks, parsing, auth, IO boundaries, and dependency features.",
    verifierCommands: ["cargo test", "cargo clippy -- -D warnings", "cargo build"],
    releaseCommands: ["cargo test"],
    browser: false,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "claude-code-plugin": {
    id: "claude-code-plugin",
    name: "Claude Code plugin",
    frameworks: ["claude-code-plugin"],
    goalPattern: /\b(claude code|plugin|skill|agent|hook|hooks|mcp|marketplace|tag|release)\b/i,
    manifestHints: [
      ".claude-plugin/plugin.json",
      "hooks/hooks.json",
      "skills/*/SKILL.md",
      "plugins/*/.claude-plugin/plugin.json",
      "plugins/*/hooks/hooks.json",
      "plugins/*/skills/*/SKILL.md"
    ],
    docsQuery: "Claude Code official docs for plugins, skills, agents, hooks, dependencies, and release tags",
    tdd: "Use focused hook/runner tests and the real Claude Code smoke path before release.",
    security: "Review hook fail-open behavior, plugin metadata, dependency declarations, and release tags.",
    verifierCommands: [
      "npm run check:hooks-fresh",
      "npm run typecheck",
      "npm run test:runner",
      "CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc"
    ],
    releaseCommands: ["claude plugin validate ./plugins/curdx-flow", "npm run verify"],
    browser: false,
    contextBudget: {
      "direct-change": "focused",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  }
};
var STACK_PRIORITY = {
  "claude-code-plugin": 110,
  "next": 100,
  "react": 90,
  "vue": 90,
  "spring-cloud": 85,
  "spring-boot": 80,
  "go": 75,
  "rust": 75,
  "python": 75,
  "typescript": 30,
  "node": 20
};
function normalizeText(input) {
  return (input ?? "").trim().replace(/\s+/g, " ");
}
function rootFsPath(projectRoot, root) {
  return isAbsolute4(root.path) ? resolve3(root.path) : resolve3(projectRoot, root.path);
}
function readText2(file) {
  try {
    return readFileSync5(file, "utf8");
  } catch {
    return "";
  }
}
function packageJsonContains(rootAbs, pattern) {
  return pattern.test(readText2(join4(rootAbs, "package.json")));
}
function globSegmentToRegExp(segment) {
  return new RegExp(
    `^${segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`
  );
}
function globPathExists(rootAbs, hint) {
  const parts = hint.split("/").filter(Boolean);
  function walk(dir, idx) {
    if (idx >= parts.length) return existsSync5(dir);
    const part = parts[idx];
    if (!part) return false;
    if (!part.includes("*")) return walk(join4(dir, part), idx + 1);
    let entries;
    try {
      entries = readdirSync3(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    const pattern = globSegmentToRegExp(part);
    return entries.some((entry) => pattern.test(entry.name) && walk(join4(dir, entry.name), idx + 1));
  }
  return walk(rootAbs || ".", 0);
}
function hasManifestHint(rootAbs, hint) {
  if (hint.includes(":")) {
    const [file, needle] = hint.split(":", 2);
    if (!file || !needle) return false;
    return readText2(join4(rootAbs, file)).toLowerCase().includes(needle.toLowerCase());
  }
  if (hint.includes("*")) {
    return globPathExists(rootAbs, hint);
  }
  return existsSync5(join4(rootAbs, hint));
}
function scoreStack(stack, roots, projectRoot, goal) {
  const evidence = [];
  let score = 0;
  if (stack.goalPattern.test(goal)) {
    score += stack.id === "claude-code-plugin" ? 0.46 : ["react", "vue", "next", "spring-cloud", "spring-boot"].includes(stack.id) ? 0.32 : 0.24;
    evidence.push("goal keyword");
  }
  for (const root of roots) {
    const rootAbs = rootFsPath(projectRoot, root);
    const frameworkHits = root.frameworks.filter(
      (framework) => stack.frameworks.includes(framework)
    );
    if (frameworkHits.length > 0) {
      score += 0.34;
      evidence.push(`${root.path}: framework ${frameworkHits.join(",")}`);
    }
    for (const hint of stack.manifestHints) {
      if (hasManifestHint(rootAbs, hint)) {
        score += 0.18;
        evidence.push(`${root.path}: ${hint}`);
      }
    }
    if (stack.id === "typescript" && packageJsonContains(rootAbs, /"typescript"\s*:/i)) {
      score += 0.2;
      evidence.push(`${root.path}: package.json:typescript`);
    }
  }
  if (score <= 0) return null;
  const confidence = Math.max(0.1, Math.min(0.99, Number(score.toFixed(2))));
  return {
    id: stack.id,
    name: stack.name,
    confidence,
    evidence: [...new Set(evidence)].slice(0, 5)
  };
}
function detectStackProfile(input) {
  const goal = normalizeText(stripKnownCapabilityTokens(input.goal));
  const roots = input.topology.roots;
  const detected = Object.values(STACKS).map((stack) => scoreStack(stack, roots, input.topology.projectRoot, goal)).filter((item) => item !== null).sort(
    (a, b) => b.confidence - a.confidence || STACK_PRIORITY[b.id] - STACK_PRIORITY[a.id]
  );
  const primary = detected[0]?.id ?? "unknown";
  const confidence = detected[0]?.confidence ?? 0;
  const warnings = [];
  if (primary === "unknown") {
    warnings.push("No first-class stack profile detected; use repository scripts as the verifier source.");
  }
  if (detected.length > 1 && detected[0] && detected[1] && detected[1].confidence > 0.5) {
    warnings.push("Multiple stack profiles are relevant; keep verification multi-root and avoid single-stack assumptions.");
  }
  return {
    version: 1,
    primary,
    detected,
    confidence,
    evidence: detected.flatMap((item) => item.evidence).slice(0, 8),
    warnings
  };
}
function stackFor(profile) {
  return profile.primary === "unknown" ? null : STACKS[profile.primary];
}
function selectCommand(commands, roots, projectRoot) {
  for (const command of commands) {
    if (command.startsWith("./mvnw") && !roots.some((root) => existsSync5(join4(rootFsPath(projectRoot, root), "mvnw")))) {
      continue;
    }
    if (command.startsWith("./gradlew") && !roots.some((root) => existsSync5(join4(rootFsPath(projectRoot, root), "gradlew")))) {
      continue;
    }
    return command;
  }
  return commands[0] ?? null;
}
function selectQualityGates(input) {
  const stack = stackFor(input.stackProfile);
  const route = input.route ?? "";
  const risk = input.risk ?? "";
  if (stack === null) {
    return [
      {
        id: "repo-verification",
        phase: "verification",
        required: route !== "direct-change",
        command: null,
        reason: "No stack profile matched; use the repository's documented verification command."
      }
    ];
  }
  const primaryCommand = selectCommand(stack.verifierCommands, input.topology.roots, input.topology.projectRoot);
  const gates = [
    {
      id: `${stack.id}-docs`,
      phase: "before-coding",
      required: /plugin|hook|skill|agent|latest|official|framework|api|sdk/i.test(
        stripKnownCapabilityTokens(input.goal)
      ) || stack.id === "claude-code-plugin",
      command: null,
      reason: stack.docsQuery
    },
    {
      id: `${stack.id}-tdd`,
      phase: "implementation",
      required: route !== "direct-change" && risk !== "low",
      command: null,
      reason: stack.tdd
    },
    {
      id: `${stack.id}-baseline`,
      phase: "verification",
      required: true,
      command: primaryCommand,
      reason: `Baseline verification for ${stack.name}.`
    }
  ];
  if (stack.browser) {
    gates.push({
      id: `${stack.id}-browser`,
      phase: "verification",
      required: route !== "direct-change",
      command: "npm run test:e2e",
      reason: "Browser-facing behavior needs Playwright or Chrome DevTools MCP evidence."
    });
  }
  const semanticGoal = stripKnownCapabilityTokens(input.goal);
  if (risk === "high" || risk === "critical" || /auth|security|permission|oauth|secret|release|publish|tag/i.test(semanticGoal)) {
    gates.push({
      id: `${stack.id}-security-review`,
      phase: "verification",
      required: risk === "critical" || /auth|security|permission|oauth|secret/i.test(semanticGoal),
      command: null,
      reason: stack.security
    });
  }
  if (route === "epic-split" || /release|publish|tag|npm/i.test(semanticGoal)) {
    gates.push({
      id: `${stack.id}-release`,
      phase: "release",
      required: /release|publish|tag|npm/i.test(semanticGoal),
      command: selectCommand(stack.releaseCommands, input.topology.roots, input.topology.projectRoot),
      reason: `Release-facing ${stack.name} work needs the stricter release gate.`
    });
  }
  return gates;
}
function selectSuggestedVerifier(input) {
  const browserGate = input.qualityGates.find((gate) => gate.id.endsWith("-browser"));
  const semanticGoal = stripKnownCapabilityTokens(input.goal);
  if (browserGate && /ui|browser|frontend|page|component|css|layout|交互|页面|前端/i.test(semanticGoal)) {
    return {
      kind: "browser",
      command: browserGate.command,
      fallback: "Chrome DevTools MCP",
      needsRuntime: true,
      reason: browserGate.reason
    };
  }
  if (input.stackProfile.primary === "claude-code-plugin") {
    return {
      kind: "plugin-smoke",
      command: "CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc",
      fallback: "claude plugin validate ./plugins/curdx-flow",
      needsRuntime: false,
      reason: "Claude Code plugin changes need real plugin validation in addition to unit tests."
    };
  }
  const baseline = input.qualityGates.find((gate) => gate.id.endsWith("-baseline"));
  return {
    kind: baseline?.command?.includes("build") ? "build" : "unit",
    command: baseline?.command ?? null,
    fallback: "Use the repository's documented verify command.",
    needsRuntime: false,
    reason: baseline?.reason ?? "Use local verification evidence before completion."
  };
}
function selectContextBudget(input) {
  const stack = stackFor(input.stackProfile);
  const route = input.route ?? "full-spec";
  const routeDefault = route === "direct-change" ? "tiny" : route === "scaffold" || route === "prototype" || route === "lite-spec" ? "focused" : route === "epic-split" ? "expanded" : "standard";
  const level = stack?.contextBudget[route] ?? routeDefault;
  const limits = {
    tiny: 2,
    focused: 4,
    standard: 8,
    expanded: 12
  };
  return {
    level,
    maxReferenceFiles: limits[level],
    strategy: level === "tiny" ? "Read only the directly touched files plus one local convention file." : level === "focused" ? "Read the target files, nearest tests, and one relevant reference before editing." : level === "standard" ? "Use bounded discovery across source, tests, docs, and official references." : "Split discovery by subsystem and summarize before implementation."
  };
}
function readArg5(name, argv) {
  const idx = argv.indexOf(name);
  return idx === -1 ? void 0 : argv[idx + 1];
}
function main5() {
  const argv = process.argv.slice(2);
  const cwd = readArg5("--cwd", argv);
  const goal = readArg5("--goal", argv) ?? "";
  const route = readArg5("--route", argv);
  const risk = readArg5("--risk", argv);
  const topology = discoverProjectTopology({ cwd, goal });
  const stackProfile = detectStackProfile({ cwd, goal, topology, route, risk });
  const qualityGates = selectQualityGates({ cwd, goal, topology, route, risk, stackProfile });
  const suggestedVerifier = selectSuggestedVerifier({ cwd, goal, topology, route, risk, stackProfile, qualityGates });
  const contextBudget = selectContextBudget({ cwd, goal, topology, route, risk, stackProfile });
  process.stdout.write(JSON.stringify({
    stackProfile,
    qualityGates,
    suggestedVerifier,
    contextBudget
  }, null, 2) + "\n");
}
function isDirectRun5() {
  try {
    return process.argv[1]?.endsWith("stack-capabilities.mjs") === true;
  } catch {
    return false;
  }
}
if (isDirectRun5()) {
  main5();
}

// src/hooks/lib/smart-route.ts
function normalizeText2(input) {
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
function readArg6(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function specNameFromPath2(specPath) {
  const parts = specPath.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? specPath;
}
function loadActiveSpecFromPath(cwd, specPath) {
  const statePath = join5(cwd, specPath, ".curdx-state.json");
  let phase = "unknown";
  let completed = false;
  if (existsSync6(statePath)) {
    try {
      const parsed = JSON.parse(readFileSync6(statePath, "utf8"));
      if (typeof parsed.phase === "string" && parsed.phase.trim().length > 0) {
        phase = parsed.phase;
      }
      completed = parsed.completed === true;
    } catch {
      phase = "unknown";
    }
  } else if (existsSync6(join5(cwd, specPath, "tasks.md"))) {
    phase = "execution";
  } else if (existsSync6(join5(cwd, specPath, "design.md"))) {
    phase = "tasks";
  } else if (existsSync6(join5(cwd, specPath, "requirements.md"))) {
    phase = "design";
  } else if (existsSync6(join5(cwd, specPath, "research.md"))) {
    phase = "requirements";
  }
  return {
    name: specNameFromPath2(specPath),
    path: specPath,
    phase,
    completed
  };
}
function findActiveSpec(input) {
  const cwd = input.cwd ?? process.cwd();
  const fresh = hasFlag(input.flags, "--fresh");
  if (fresh) return void 0;
  const explicitName = normalizeText2(input.name);
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
var STACK_RE = /\b(vue|vue3|vite|pinia|vue router|react|next\.?js|nuxt|spring|spring boot|spring cloud|maven|gradle|java|node|nestjs|fastapi|go|postgres|mysql|redis|docker)\b|前端|后端|全栈|全家桶/i;
var ARTIFACT_RE = /\b(prd|spec|requirements?|design doc|figma|wireframe|openapi|swagger|api doc|接口文档|产品文档|需求文档|设计稿|原型图)\b/i;
var SCAFFOLD_RE = /\b(scaffold|bootstrap|init|starter|template|skeleton|create project|create app|new project|setup project)\b|脚手架|初始化|搭建项目|创建项目|项目骨架|先搭骨架|搭骨架/i;
var PROTOTYPE_RE = /\b(prototype|poc|demo|spike|experiment|technical validation|prove|验证|原型|演示|技术验证|试验)\b/i;
var PRODUCT_RE = /\b(app|application|system|platform|saas|crm|dashboard|admin|portal|product|service|tool)\b|系统|平台|后台|管理端|应用|产品|工具|开发一套|做一个|做一套/i;
var PRODUCT_DOMAIN_HINT_RE = /\b(crm|customer|order|inventory|invoice|booking|calendar|todo|task|project|ticket|commerce|shop|blog|cms|dashboard|admin|user|auth|report)\b|客户|订单|库存|合同|发票|预约|日历|待办|任务|项目|工单|商城|电商|博客|内容|后台|用户|权限|登录|报表/i;
var FIX_RE = /\b(fix|bug|debug|repair|resolve|broken|regression|修复|报错|失败|排查|定位)\b/i;
var REFACTOR_RE = /\b(refactor|rewrite|cleanup|restructure|重构|重写|整理)\b/i;
var RELEASE_RE = /\b(release|publish|deploy|ship|tag|npm|上线|发布|部署|打包)\b/i;
var DEMO_RE = /\b(demo|prototype|poc|演示|原型)\b/i;
var PRODUCTION_RE = /\b(production|prod|ship|launch|deploy|release|上线|生产|发布|可用|能用)\b/i;
function classifyIntent(goal, topology) {
  const semanticGoal = stripKnownCapabilityTokens(goal);
  const artifactProvided = ARTIFACT_RE.test(semanticGoal);
  const stackSpecified = STACK_RE.test(semanticGoal);
  let intentKind = "unknown";
  if (artifactProvided) intentKind = "import-spec";
  else if (SCAFFOLD_RE.test(semanticGoal)) intentKind = "scaffold";
  else if (PROTOTYPE_RE.test(semanticGoal)) intentKind = "prototype";
  else if (RELEASE_RE.test(semanticGoal)) intentKind = "release";
  else if (FIX_RE.test(semanticGoal)) intentKind = "fix";
  else if (REFACTOR_RE.test(semanticGoal)) intentKind = "refactor";
  else if (PRODUCT_RE.test(semanticGoal)) intentKind = "product";
  else if (goal.length > 0) intentKind = "feature";
  let deliveryExpectation = "maintenance";
  if (DEMO_RE.test(semanticGoal)) deliveryExpectation = "demo";
  else if (PRODUCTION_RE.test(semanticGoal)) deliveryExpectation = "production";
  else if (intentKind === "product" || topology.workspaceState === "empty") {
    deliveryExpectation = "usable-app";
  }
  const missingFacts = [];
  if (topology.workspaceState === "empty" && intentKind === "product" && !artifactProvided && !PRODUCT_DOMAIN_HINT_RE.test(semanticGoal)) {
    missingFacts.push("product domain, target user, MVP acceptance criteria");
  }
  if (topology.workspaceState === "empty" && (intentKind === "product" || intentKind === "feature") && !stackSpecified) {
    missingFacts.push("preferred stack or permission to choose defaults");
  }
  if (intentKind === "prototype" && !/success|metric|prove|验证|成功|标准/i.test(semanticGoal)) {
    missingFacts.push("prototype success criterion");
  }
  let clarity = "medium";
  if (artifactProvided || intentKind === "scaffold") clarity = "high";
  else if (missingFacts.length > 0) clarity = "low";
  else if (stackSpecified || intentKind === "fix" || intentKind === "refactor") clarity = "high";
  let confidence = 0.62;
  if (artifactProvided || SCAFFOLD_RE.test(semanticGoal) || PROTOTYPE_RE.test(semanticGoal)) confidence += 0.22;
  if (stackSpecified) confidence += 0.08;
  if (missingFacts.length > 0) confidence -= 0.18;
  confidence = Math.max(0.1, Math.min(0.98, Number(confidence.toFixed(2))));
  let recommendedAction = "route with deterministic policy";
  if (topology.workspaceState === "empty") {
    if (intentKind === "scaffold") {
      recommendedAction = "select an official/ecosystem scaffold source when available, create the requested skeleton, then run baseline verification";
    } else if (intentKind === "import-spec") {
      recommendedAction = "import the provided artifact, derive plan/tasks, then implement";
    } else if (intentKind === "prototype") {
      recommendedAction = "create a bounded prototype spec with an explicit success criterion";
    } else if (clarity === "low") {
      recommendedAction = "perform product inception before writing application code";
    } else {
      recommendedAction = "create greenfield spec with constitution and walking skeleton tasks";
    }
  }
  return {
    workspaceState: topology.workspaceState,
    intentKind,
    clarity,
    stackSpecified,
    artifactProvided,
    deliveryExpectation,
    missingFacts,
    confidence,
    recommendedAction
  };
}
function routeFromIntent(intent, policy) {
  if (intent.workspaceState === "empty") {
    switch (intent.intentKind) {
      case "scaffold":
        return "scaffold";
      case "import-spec":
        return "import-spec";
      case "prototype":
        return "prototype";
      case "product":
        return intent.clarity === "low" ? "product-inception" : "greenfield-spec";
      case "feature":
        return intent.clarity === "low" ? "product-inception" : "greenfield-spec";
      default:
        return "product-inception";
    }
  }
  return routeFromPolicy(policy);
}
function reasonForRoute(route, policy, intent) {
  if (route === "scaffold" || route === "product-inception" || route === "greenfield-spec" || route === "prototype" || route === "import-spec") {
    return intent.recommendedAction;
  }
  return policy.reasons[0] ?? "deterministic policy classification";
}
function routeDefaults(route) {
  switch (route) {
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
    case "scaffold":
      return {
        nextAction: "Select an official/ecosystem scaffold source when available, create the requested skeleton, record assumptions, then run baseline verification.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: false,
        taskCountLimit: 1
      };
    case "product-inception":
      return {
        nextAction: "Create product context first: mission, constraints, roadmap, tech-stack assumptions, and project constitution before application code.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: true,
        taskCountLimit: 0
      };
    case "greenfield-spec":
      return {
        nextAction: "Create a greenfield spec with constitution, technical plan, walking skeleton, and vertical-slice tasks.",
        shouldCreateSpec: true,
        shouldCreateTasks: true,
        shouldUseSubagent: true,
        taskCountLimit: 10
      };
    case "prototype":
      return {
        nextAction: "Create a bounded prototype spec, define the success criterion, implement the thinnest proof, and verify it.",
        shouldCreateSpec: true,
        shouldCreateTasks: true,
        shouldUseSubagent: false,
        taskCountLimit: 5
      };
    case "import-spec":
      return {
        nextAction: "Import the provided PRD/spec/design/API artifact, normalize it into curdx-flow artifacts, then plan implementation.",
        shouldCreateSpec: true,
        shouldCreateTasks: true,
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
    workspaceState: topology.workspaceState,
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
  const goal = normalizeText2(input.goal);
  const cwd = input.cwd ?? process.cwd();
  const activeSpec = findActiveSpec({ ...input, cwd });
  const topology = discoverProjectTopology({ cwd, goal });
  const intent = classifyIntent(goal, topology);
  const policy = classifyAutoPolicy({
    goal,
    flags: input.flags,
    changedFiles: input.changedFiles,
    estimatedFiles: input.estimatedFiles,
    taskCount: input.taskCount
  });
  const routeCandidate = routeFromIntent(intent, policy);
  const stackProfile = detectStackProfile({
    cwd,
    goal,
    topology,
    route: routeCandidate,
    risk: policy.risk
  });
  const qualityGates = selectQualityGates({
    cwd,
    goal,
    topology,
    route: routeCandidate,
    risk: policy.risk,
    stackProfile
  });
  const suggestedVerifier = selectSuggestedVerifier({
    cwd,
    goal,
    topology,
    route: routeCandidate,
    risk: policy.risk,
    stackProfile,
    qualityGates
  });
  const contextBudget = selectContextBudget({
    cwd,
    goal,
    topology,
    route: routeCandidate,
    risk: policy.risk,
    stackProfile
  });
  const brain = summarizeProjectBrain(cwd);
  const recommendations = recommendToolCapabilities({
    goal,
    route: routeCandidate,
    risk: policy.risk,
    topologyKinds: topologyKinds(topology),
    topologyFrameworks: topologyFrameworks(topology),
    stackProfile,
    qualityGates,
    contextBudget,
    missingRoots: topology.missingRoots.length,
    availableCapabilities: input.availableCapabilities,
    recentFailures: brain.recentFailures.length
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
      intent,
      stackProfile,
      qualityGates,
      suggestedVerifier,
      contextBudget,
      recommendedCapabilities: [],
      policy: publicPolicy(policy),
      reasons: ["active unfinished spec"]
    };
  }
  if (activeSpec !== void 0 && !activeSpec.completed && normalizeText2(input.name).length > 0 && goal.length > 0) {
    return {
      version: 1,
      route: "blocked-ask-user",
      reason: "requested spec already exists and is unfinished",
      activeSpec,
      blockedReason: "Ask whether to resume the existing spec or rerun with --fresh for new work.",
      ...routeDefaults("blocked-ask-user"),
      topology: publicTopology(topology),
      intent,
      stackProfile,
      qualityGates,
      suggestedVerifier,
      contextBudget,
      recommendedCapabilities: recommendations,
      policy: publicPolicy(policy),
      reasons: ["existing unfinished spec with new goal text"]
    };
  }
  const explicitName = normalizeText2(input.name);
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
        intent,
        stackProfile,
        qualityGates,
        suggestedVerifier,
        contextBudget,
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
      intent,
      stackProfile,
      qualityGates,
      suggestedVerifier,
      contextBudget,
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
      intent,
      stackProfile,
      qualityGates,
      suggestedVerifier,
      contextBudget,
      recommendedCapabilities: [],
      policy: publicPolicy(policy),
      reasons: ["related code root is outside current Claude Code access"]
    };
  }
  const route = routeCandidate;
  const defaults = routeDefaults(route);
  return {
    version: 1,
    route,
    reason: reasonForRoute(route, policy, intent),
    ...defaults,
    topology: publicTopology(topology),
    intent,
    stackProfile,
    qualityGates,
    suggestedVerifier,
    contextBudget,
    recommendedCapabilities: recommendations,
    policy: publicPolicy(policy),
    reasons: policy.reasons
  };
}
function main6() {
  const argv = process.argv.slice(2);
  const goal = readArg6("--goal", argv) ?? "";
  const name = readArg6("--name", argv);
  const flags = readArg6("--flags", argv) ?? "";
  const cwd = readArg6("--cwd", argv);
  const files = parseList3(readArg6("--files", argv));
  const availableCapabilities = parseList3(readArg6("--available-capabilities", argv));
  const estimatedRaw = readArg6("--estimated-files", argv);
  const taskRaw = readArg6("--task-count", argv);
  const route = classifySmartRoute({
    goal,
    name,
    flags,
    cwd,
    changedFiles: files,
    availableCapabilities: availableCapabilities.length > 0 ? availableCapabilities : void 0,
    estimatedFiles: estimatedRaw === void 0 ? void 0 : Number(estimatedRaw),
    taskCount: taskRaw === void 0 ? void 0 : Number(taskRaw)
  });
  process.stdout.write(JSON.stringify(route, null, 2) + "\n");
}
function isDirectRun6() {
  try {
    const entry = fileURLToPath5(import.meta.url);
    return process.argv[1] === entry && basename6(entry).startsWith("smart-route.");
  } catch {
    return false;
  }
}
if (isDirectRun6()) {
  main6();
}

// src/hooks/lib/last-mile-orchestrator.ts
import { basename as basename7 } from "node:path";
import { fileURLToPath as fileURLToPath6 } from "node:url";
var RELEASE_RE2 = /\b(release|publish|deploy|ship|tag|npm|version|changelog)\b|发布|部署|上线|打包|版本|标签/i;
var FAILURE_RE = /\b(fail|failed|failure|error|stuck|retry|debug|broken|regression)\b|失败|报错|卡住|重试|排查|定位|回归/i;
function normalize3(value) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}
function unique(values) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
function rec(route, id) {
  return route.recommendedCapabilities.find((item) => item.id === id);
}
function hasRec(route, id) {
  return rec(route, id) !== void 0;
}
function missingCapabilityIds(route) {
  return route.recommendedCapabilities.filter((item) => item.availabilityState === "missing" && item.expectedByDefault).map((item) => item.id);
}
function isReleaseSensitive(goal, route) {
  return route.intent.intentKind === "release" || RELEASE_RE2.test(goal) || route.qualityGates.some((gate) => gate.id.endsWith("-release")) || route.stackProfile.primary === "claude-code-plugin" && RELEASE_RE2.test(goal);
}
function hasVerificationGap(input, snapshot) {
  if (input.verification?.ok === false) return true;
  if (input.hookEvent === "TaskCompleted") return true;
  return snapshot.gates.some(
    (gate) => gate === "completion-unmarked" || gate === "missing-tasks" || gate === "empty-tasks" || gate === "invalid-state"
  );
}
function inferPhase(input, route, snapshot, brain) {
  const goal = normalize3(input.goal);
  if (isReleaseSensitive(goal, route)) return "releasing";
  if (input.verification?.ok === false || brain.recentFailures.length >= 2) return "recovering";
  if (input.hookEvent === "TaskCompleted") return "verifying";
  if (FAILURE_RE.test(goal)) return "debugging";
  const statePhase = snapshot.state.phase;
  if (statePhase === "execution") return "implementing";
  if (statePhase === "research") return "discovering";
  if (statePhase === "requirements" || statePhase === "design" || statePhase === "tasks") {
    return "planning";
  }
  if (route.route === "blocked-ask-user" || route.route === "product-inception") return "discovering";
  if (route.shouldCreateSpec) return "planning";
  return "implementing";
}
function inferProblemTypes(input, route, snapshot, brain) {
  const goal = normalize3(input.goal);
  const out = [];
  if (route.route === "blocked-ask-user" || route.intent.missingFacts.length > 0) {
    out.push("missing-context");
  }
  if (hasRec(route, "ui-ux-pro-max")) out.push("ui-quality-risk");
  if (hasRec(route, "chrome-devtools-mcp") || hasRec(route, "browser-verification")) {
    out.push("browser-evidence-needed");
  }
  if (brain.recentFailures.length >= 2 || hasRec(route, "pua") || /\b(repeated|twice|again)\b|反复|连续|又失败|多次/i.test(goal)) {
    out.push("repeated-failure");
  }
  if (isReleaseSensitive(goal, route)) out.push("release-risk");
  if (hasVerificationGap(input, snapshot)) out.push("verification-gap");
  if (snapshot.git.dirty && snapshot.git.changedFiles > 8 || snapshot.gates.includes("missing-code-root")) {
    out.push("scope-drift");
  }
  if (missingCapabilityIds(route).length > 0) out.push("dependency-missing");
  return unique(out);
}
function capabilityAction(recItem) {
  const required = recItem.curdxRole.includes("gate") || recItem.category === "docs" || recItem.category === "verification" || recItem.category === "security" || recItem.id === "pua";
  return {
    id: recItem.id,
    name: recItem.name,
    invocation: recItem.invocation,
    phase: recItem.phase,
    availabilityState: recItem.availabilityState,
    required,
    triggerReason: recItem.triggerReason,
    action: recItem.availabilityState === "missing" ? recItem.fallbackWhenMissing : recItem.instruction,
    fallbackWhenMissing: recItem.fallbackWhenMissing
  };
}
function evidenceRequired(input, route, snapshot, problems) {
  const out = route.qualityGates.filter((gate) => gate.required).map((gate) => gate.command ? `${gate.id}: ${gate.command}` : gate.id);
  const verifier = route.suggestedVerifier.command ?? route.suggestedVerifier.fallback;
  if (verifier) out.push(`suggested-verifier: ${verifier}`);
  if (problems.includes("browser-evidence-needed")) {
    out.push("browser evidence: Playwright pass or Chrome DevTools MCP console/network/DOM proof");
  }
  if (problems.includes("release-risk")) {
    out.push("release evidence: curdx-flow doctor, plugin validate, hook freshness, version/tag parity");
  }
  if (problems.includes("verification-gap")) {
    const phase = input.verification?.phase ?? snapshot.state.phase ?? "execution";
    out.push(`fresh verification block for phase '${phase}'`);
  }
  return unique(out).slice(0, 8);
}
function evidenceSatisfied(snapshot, brain) {
  const verified = Object.entries(snapshot.state.verificationBlocks).filter(([, block]) => block?.exitCode === 0 && typeof block.command === "string").map(([phase, block]) => `${phase}: ${block?.command}`);
  return unique([...verified, ...brain.verifierHints.map((hint) => `brain: ${hint}`)]).slice(0, 6);
}
function blockingGates(route, snapshot, problems) {
  const out = [...snapshot.gates];
  if (route.blockedReason) out.push(`route-blocked: ${route.blockedReason}`);
  for (const id of missingCapabilityIds(route)) {
    out.push(`dependency-missing: ${id}`);
  }
  if (problems.includes("release-risk")) out.push("release-gate-required");
  return unique(out);
}
function firstCapability(plan, id) {
  return plan.find((item) => item.id === id);
}
function instructionFor(phase, problems, plan, route, snapshot) {
  if (problems.includes("dependency-missing")) {
    const missing = plan.filter((item) => item.availabilityState === "missing").map((item) => item.id).join(", ");
    return `Run curdx-flow doctor and fix missing expected capabilities before relying on them: ${missing}.`;
  }
  if (problems.includes("repeated-failure")) {
    const memory = firstCapability(plan, "claude-mem");
    const pua = firstCapability(plan, "pua");
    const parts = [
      memory ? `${memory.invocation} for prior decisions/failures` : "read .curdx/brain.jsonl for recent failures",
      pua ? `${pua.invocation} for structured recovery or parallel diagnosis` : "switch to systematic recovery before another edit"
    ];
    return `Stop the same edit loop; ${parts.join(", ")}.`;
  }
  if (problems.includes("ui-quality-risk")) {
    return "Apply ui-ux-pro-max guidance before changing visible UI, then keep browser evidence as the completion gate.";
  }
  if (problems.includes("browser-evidence-needed")) {
    return "After implementation, collect browser runtime evidence with Playwright or Chrome DevTools MCP before claiming completion.";
  }
  if (problems.includes("release-risk")) {
    return "Before tag, push, or publish, run the release gate: official Claude Code docs check, curdx-flow doctor, plugin validate, hook freshness, and npm/plugin tag parity.";
  }
  if (problems.includes("verification-gap")) {
    return `Do not finish yet; satisfy the verifier for ${snapshot.spec?.name ?? "the active spec"} and record fresh evidence.`;
  }
  if (phase === "planning") return "Create or resume the smallest spec/task plan that satisfies the route, then enter implementation.";
  return route.nextAction;
}
function recoveryFor(problems, plan, input) {
  if (!problems.includes("repeated-failure") && !problems.includes("verification-gap")) return null;
  const phase = input.verification?.phase ?? "current phase";
  const reason = input.verification?.reason ?? "missing or failed evidence";
  const memory = firstCapability(plan, "claude-mem");
  const pua = firstCapability(plan, "pua");
  return [
    `Recovery for ${phase}: ${reason}.`,
    memory ? `First search memory with ${memory.invocation}.` : "First inspect .curdx/brain.jsonl and the failing verifier output.",
    pua ? `If the same fix path already failed, use ${pua.invocation} for decomposition/retry discipline.` : "If the same fix path already failed, decompose before editing again.",
    "Then run the suggested verifier and record the result before completion."
  ].join(" ");
}
function decideLastMile(input = {}) {
  const cwd = input.cwd;
  const goal = normalize3(input.goal);
  const snapshot = input.snapshot ?? buildWorkflowSnapshot({ cwd, goal, spec: input.name });
  const route = input.routeFacts ?? classifySmartRoute(input);
  const brain = summarizeProjectBrain(cwd);
  const phase = inferPhase(input, route, snapshot, brain);
  const problemTypes = inferProblemTypes(input, route, snapshot, brain);
  const capabilityPlan = route.recommendedCapabilities.map(capabilityAction);
  const blocking = blockingGates(route, snapshot, problemTypes);
  const coordinatorInstruction = instructionFor(phase, problemTypes, capabilityPlan, route, snapshot);
  const recoveryInstruction = recoveryFor(problemTypes, capabilityPlan, input);
  const decision = {
    version: 1,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    phase,
    problemType: problemTypes[0] ?? null,
    problemTypes,
    task: {
      goal,
      route: route.route,
      stack: route.stackProfile.primary,
      risk: route.policy.risk,
      activeSpec: snapshot.spec?.name ?? route.activeSpec?.name ?? null,
      currentTask: snapshot.tasks.current?.title ?? null
    },
    capabilityPlan,
    evidenceRequired: evidenceRequired(input, route, snapshot, problemTypes),
    evidenceSatisfied: evidenceSatisfied(snapshot, brain),
    blockingGates: blocking,
    coordinatorInstruction,
    recoveryInstruction
  };
  if (input.record === true) {
    appendBrainEvent(cwd, {
      type: "last-mile-decision",
      route: route.route,
      stack: route.stackProfile.primary,
      phase,
      reason: [
        `problem=${decision.problemType ?? "none"}`,
        `instruction=${coordinatorInstruction}`
      ].join(" "),
      files: input.toolNames?.length
    });
  }
  return decision;
}
function compactLastMileDecision(decision) {
  const caps = decision.capabilityPlan.slice(0, 5).map(
    (item) => item.availabilityState === "missing" ? `${item.id}:missing` : item.id
  ).join(",");
  const evidence = decision.evidenceRequired.slice(0, 3).join(" | ") || "none";
  return [
    `lastMile(phase=${decision.phase}`,
    `problem=${decision.problemType ?? "none"}`,
    `route=${decision.task.route}`,
    `stack=${decision.task.stack}`,
    `caps=${caps || "none"}`,
    `evidence=${evidence})`
  ].join(" ");
}
function readArg7(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function parseList4(value) {
  if (!value) return [];
  return value.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean);
}
function main7() {
  const argv = process.argv.slice(2);
  const available = parseList4(readArg7("--available-capabilities", argv));
  const decision = decideLastMile({
    cwd: readArg7("--cwd", argv),
    goal: readArg7("--goal", argv) ?? "",
    name: readArg7("--spec", argv) ?? readArg7("--name", argv),
    changedFiles: parseList4(readArg7("--files", argv)),
    availableCapabilities: available.length > 0 ? available : void 0,
    hookEvent: "runtime",
    record: argv.includes("--record")
  });
  process.stdout.write(JSON.stringify(decision, null, 2) + "\n");
}
function isDirectRun7() {
  try {
    const entry = fileURLToPath6(import.meta.url);
    return process.argv[1] === entry && basename7(entry).startsWith("last-mile-orchestrator.");
  } catch {
    return false;
  }
}
if (isDirectRun7()) {
  main7();
}

// src/hooks/lib/execution-brief.ts
function preferredSkill(route) {
  switch (route.route) {
    case "direct-change":
      return "direct edit in current turn";
    case "lite-spec":
      return "/curdx-flow:start with lightweight spec";
    case "full-spec":
      return "/curdx-flow:start full spec workflow";
    case "epic-split":
      return "/curdx-flow:triage";
    case "scaffold":
      return "/curdx-flow:start scaffold path";
    case "product-inception":
      return "/curdx-flow:start product inception";
    case "greenfield-spec":
      return "/curdx-flow:start greenfield spec";
    case "prototype":
      return "/curdx-flow:start prototype spec";
    case "import-spec":
      return "/curdx-flow:start import spec";
    case "resume-current":
      return "/curdx-flow:implement or next missing phase";
    case "blocked-ask-user":
      return "ask one focused question";
  }
}
function agentPlan(route) {
  if (route.route === "direct-change" || route.route === "blocked-ask-user") return [];
  if (route.policy.reviewCadence === "strict" || route.policy.reviewCadence === "periodic") {
    return ["spec-executor", "spec-reviewer", "code-quality-reviewer"];
  }
  if (route.shouldUseSubagent) return ["spec-executor", "spec-reviewer"];
  return ["self-review before completion"];
}
function isolationPlan(route) {
  if (route.policy.risk === "critical" || route.route === "full-spec" || route.route === "epic-split") {
    return "prefer worktree isolation for executor tasks; do not touch release metadata unless task scope names it";
  }
  if (route.route === "direct-change") return "current workspace, minimal touched files";
  return "current workspace with bounded file ownership";
}
function taskShape(route) {
  if (!route.shouldCreateTasks) return "single bounded change; no tasks.md";
  const range = route.policy.taskTargetRange;
  return `${range.min}-${Math.min(range.max, route.taskCountLimit)} value-slice tasks, each with verifier`;
}
function readFirst(route, input) {
  const out = [];
  const files = input.changedFiles?.slice(0, Math.max(1, route.contextBudget.maxReferenceFiles)) ?? [];
  out.push(...files);
  if (route.stackProfile.primary === "claude-code-plugin") {
    out.push("https://code.claude.com/docs/llms.txt");
    out.push("plugin manifest, hooks.json, touched skill/agent files");
  }
  if (route.qualityGates.some((gate) => gate.phase === "before-coding" && gate.required)) {
    out.push("official/current docs for the detected stack");
  }
  if (route.shouldCreateTasks) {
    out.push("nearest spec artifacts and tasks.md before editing");
  }
  if (route.contextBudget.level === "tiny") {
    return out.slice(0, Math.max(1, route.contextBudget.maxReferenceFiles));
  }
  return [...new Set(out)].slice(0, route.contextBudget.maxReferenceFiles);
}
function completionContract(route, brain) {
  const verifier = route.suggestedVerifier.command ?? route.suggestedVerifier.fallback ?? void 0;
  const contract = [
    "Do not claim completion without fresh verification evidence from this turn."
  ];
  if (verifier) {
    const suffix = /[.!?]$/.test(verifier) ? "" : ".";
    contract.push(`Run verifier: ${verifier}${suffix}`);
  }
  if (route.shouldCreateSpec) {
    contract.push("Record spec evidence with curdx-flow verify run when a spec phase is completed.");
  }
  if (route.policy.reviewCadence === "strict" || route.policy.reviewCadence === "periodic") {
    contract.push("Run spec-compliance review before code-quality review; fix blocking findings before proceeding.");
  }
  if (brain.recentFailures.length > 0) {
    contract.push("Check .curdx/brain.jsonl recent failures before reusing the same fix path.");
  }
  return contract;
}
function escalationRules(route) {
  const rules = [
    "Ask the user only when missing facts change implementation or access is blocked.",
    "If verifier fails twice for the same phase, switch to systematic debugging before more edits."
  ];
  if (route.route === "blocked-ask-user" && route.blockedReason) {
    rules.unshift(route.blockedReason);
  }
  if (route.policy.risk === "critical") {
    rules.push("For release/security/plugin metadata changes, run official-docs check and plugin validation before tag/push.");
  }
  if (route.topology?.missingRoots && route.topology.missingRoots.length > 0) {
    rules.push(route.topology.accessFix ?? "Add required code roots before editing.");
  }
  return rules;
}
function buildExecutionBrief(input) {
  const route = input.routeFacts ?? classifySmartRoute(input);
  const cwd = input.cwd;
  const brain = summarizeProjectBrain(cwd);
  const verifier = route.suggestedVerifier.command ?? route.suggestedVerifier.fallback ?? void 0;
  const lastMile = decideLastMile({ ...input, routeFacts: route });
  const brief = {
    version: 1,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    goal: input.goal ?? "",
    route: route.route,
    reason: route.reason,
    stack: route.stackProfile.primary,
    risk: route.policy.risk,
    context: {
      budget: route.contextBudget.level,
      maxReferenceFiles: route.contextBudget.maxReferenceFiles,
      readFirst: readFirst(route, input),
      avoid: ["node_modules", "dist/build outputs unless verifying generated artifacts", "old project docs as design authority"]
    },
    execution: {
      mode: route.policy.executionMode,
      primarySkill: preferredSkill(route),
      agents: agentPlan(route),
      isolation: isolationPlan(route),
      taskShape: taskShape(route)
    },
    qualityGates: route.qualityGates.map((gate) => ({
      id: gate.id,
      phase: gate.phase,
      required: gate.required,
      command: gate.command
    })),
    completionContract: completionContract(route, brain),
    escalationRules: escalationRules(route),
    lastMile: {
      phase: lastMile.phase,
      problemType: lastMile.problemType,
      problemTypes: lastMile.problemTypes,
      capabilityPlan: lastMile.capabilityPlan,
      evidenceRequired: lastMile.evidenceRequired,
      blockingGates: lastMile.blockingGates,
      coordinatorInstruction: lastMile.coordinatorInstruction,
      recoveryInstruction: lastMile.recoveryInstruction
    },
    brain: {
      path: brain.path,
      totalEvents: brain.totalEvents,
      lastUpdated: brain.lastUpdated,
      stackHints: brain.stackHints,
      verifierHints: brain.verifierHints,
      recentFailures: brain.recentFailures
    }
  };
  if (input.record === true) {
    appendBrainEvent(cwd, {
      type: "route-compiled",
      route: route.route,
      stack: route.stackProfile.primary,
      verifier,
      reason: route.reason,
      files: input.changedFiles?.length
    });
  }
  return brief;
}
function compactExecutionBrief(brief, options = {}) {
  const verifier = brief.qualityGates.find((gate) => gate.required && gate.command !== null)?.command ?? "repo verifier";
  const agents = brief.execution.agents.length > 0 ? brief.execution.agents.join("+") : "none";
  const includeLastMile = options.includeLastMile ?? true;
  const parts = [
    `brief(route=${brief.route}`,
    `stack=${brief.stack}`,
    `risk=${brief.risk}`,
    `read<=${brief.context.maxReferenceFiles}`,
    `skill=${brief.execution.primarySkill}`,
    `agents=${agents}`,
    `verifier=${verifier})`
  ];
  if (includeLastMile) {
    parts.push(compactLastMileDecision({
      version: 1,
      generatedAt: brief.generatedAt,
      phase: brief.lastMile.phase,
      problemType: brief.lastMile.problemType,
      problemTypes: brief.lastMile.problemTypes,
      task: {
        goal: brief.goal,
        route: brief.route,
        stack: brief.stack,
        risk: brief.risk,
        activeSpec: null,
        currentTask: null
      },
      capabilityPlan: brief.lastMile.capabilityPlan,
      evidenceRequired: brief.lastMile.evidenceRequired,
      evidenceSatisfied: [],
      blockingGates: brief.lastMile.blockingGates,
      coordinatorInstruction: brief.lastMile.coordinatorInstruction,
      recoveryInstruction: brief.lastMile.recoveryInstruction
    }));
  }
  return parts.join(" ");
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

// src/hooks/post-tool-batch-snapshot.ts
var MAX_ADDITIONAL_CONTEXT_CHARS = 1e3;
function limitContext(value) {
  if (value.length <= MAX_ADDITIONAL_CONTEXT_CHARS) return value;
  return `${value.slice(0, MAX_ADDITIONAL_CONTEXT_CHARS - 15)} ...[truncated]`;
}
async function main8() {
  let input;
  try {
    input = await readStdinJson();
  } catch {
    return;
  }
  const calls = input.tool_calls ?? [];
  const touchedWriteTool = calls.some(
    (call) => /^(Write|Edit|MultiEdit|Bash)$/.test(call.tool_name ?? "")
  );
  if (!touchedWriteTool) return;
  try {
    const snapshot = buildWorkflowSnapshot({ cwd: input.cwd });
    const route = classifySmartRoute({ cwd: input.cwd });
    const brief = buildExecutionBrief({ cwd: input.cwd, routeFacts: route });
    const lastMile = decideLastMile({
      cwd: input.cwd,
      snapshot,
      routeFacts: route,
      hookEvent: "PostToolBatch",
      toolNames: calls.map((call) => call.tool_name ?? "unknown"),
      record: true
    });
    const missingVerifier = route.suggestedVerifier.command ?? route.suggestedVerifier.fallback ?? "repo verifier";
    const qualityGateText = route.qualityGates.filter((gate) => gate.required).slice(0, 3).map((gate) => gate.command ? `${gate.id} (${gate.command})` : gate.id).join(", ");
    appendBrainEvent(input.cwd, {
      type: "edit-batch",
      route: route.route,
      stack: route.stackProfile.primary,
      verifier: missingVerifier,
      files: calls.length
    });
    const additionalContext = `curdx-flow snapshot gates after batch: ${snapshot.gates.join(", ")}. Stack: ${route.stackProfile.primary}. Quality gates: ${qualityGateText || "none"}. Suggested verifier: ${missingVerifier}. ${compactExecutionBrief(brief, { includeLastMile: false })}. ${compactLastMileDecision(lastMile)}. Autopilot: ${lastMile.coordinatorInstruction}. Next action: ${snapshot.nextAction}`;
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolBatch",
          additionalContext: limitContext(additionalContext)
        }
      })
    );
  } catch {
  }
}
void main8();
//# sourceMappingURL=post-tool-batch-snapshot.mjs.map
