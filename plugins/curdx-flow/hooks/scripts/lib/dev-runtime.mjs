import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/lib/dev-runtime.ts
import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync as existsSync4,
  mkdirSync as mkdirSync2,
  openSync,
  readFileSync as readFileSync4,
  rmSync,
  writeFileSync as writeFileSync2
} from "node:fs";
import { isAbsolute as isAbsolute4, join as join3, resolve as resolve3 } from "node:path";

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

// src/hooks/_shared/path-resolver.ts
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, isAbsolute, join, posix } from "node:path";
var SETTINGS_REL_PATH = ".claude/curdx-flow.local.md";
function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
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
    "index.html",
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
  if (isFile(path.join(rootAbs, "index.html")) && (isFile(path.join(rootAbs, "app.js")) || isFile(path.join(rootAbs, "styles.css")))) {
    pushUnique(kinds, "frontend-app");
    frameworks.push("static-html");
  }
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

// src/hooks/lib/stack-capabilities.ts
import { existsSync as existsSync3, readFileSync as readFileSync3, readdirSync as readdirSync3 } from "node:fs";
import { isAbsolute as isAbsolute3, join as join2, resolve as resolve2 } from "node:path";

// src/registry/capability-tokens.ts
var KNOWN_CAPABILITY_TOKEN_PATTERN = String.raw`\b(?:claude-mem|context7|sequential-thinking|chrome-devtools-mcp|chrome devtools mcp|ui[\s_-]*ux[\s_-]*(?:pro[\s_-]*)?max|pua)\b`;
function knownCapabilityTokenRegex() {
  return new RegExp(KNOWN_CAPABILITY_TOKEN_PATTERN, "gi");
}

// src/hooks/lib/capability-normalization.ts
function stripKnownCapabilityTokens(input) {
  return (input ?? "").replace(knownCapabilityTokenRegex(), " ");
}

// src/hooks/lib/stack-capabilities.ts
var STACKS = {
  "static-html": {
    id: "static-html",
    name: "Static HTML",
    frameworks: ["static-html"],
    goalPattern: /\b(static html|static frontend|static page|static web|vanilla js|vanilla javascript|plain html|html\/css\/js|index\.html|styles\.css|app\.js)\b|静态页面|原生\s*(js|javascript)/i,
    manifestHints: ["index.html"],
    docsQuery: "MDN documentation for HTML, CSS, DOM events, and browser behavior",
    tdd: "Use small DOM/browser interaction checks for user-visible behavior.",
    security: "Review DOM insertion, event handling, unsafe HTML, and local file serving assumptions.",
    verifierCommands: ["node --check app.js"],
    releaseCommands: ["node --check app.js"],
    browser: true,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
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
    goalPattern: /\b(react|jsx|tsx|react component|react hook)\b/i,
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
    goalPattern: /\b(vue|vue3|vite|pinia|vue router|vue component)\b/i,
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
  "static-html": 95,
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
var RELEASE_GOAL_RE = /\b(release|publish|deploy|tag)\b|发布|部署|上线|打包|标签/i;
var NPM_RELEASE_RE = /\bnpm\s+(publish|release|version|tag|dist-tag)\b|\bpublish(?:ing)?\s+(?:to\s+)?npm\b|\bnpm\s+package\b/i;
function hasReleaseGoal(goal) {
  const text = stripKnownCapabilityTokens(goal);
  return RELEASE_GOAL_RE.test(text) || NPM_RELEASE_RE.test(text);
}
function normalizeText(input) {
  return (input ?? "").trim().replace(/\s+/g, " ");
}
function rootFsPath(projectRoot, root) {
  return isAbsolute3(root.path) ? resolve2(root.path) : resolve2(projectRoot, root.path);
}
function readText2(file) {
  try {
    return readFileSync3(file, "utf8");
  } catch {
    return "";
  }
}
function packageJsonContains(rootAbs, pattern) {
  return pattern.test(readText2(join2(rootAbs, "package.json")));
}
function globSegmentToRegExp(segment) {
  return new RegExp(
    `^${segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`
  );
}
function globPathExists(rootAbs, hint) {
  const parts = hint.split("/").filter(Boolean);
  function walk(dir, idx) {
    if (idx >= parts.length) return existsSync3(dir);
    const part = parts[idx];
    if (!part) return false;
    if (!part.includes("*")) return walk(join2(dir, part), idx + 1);
    let entries;
    try {
      entries = readdirSync3(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    const pattern = globSegmentToRegExp(part);
    return entries.some((entry) => pattern.test(entry.name) && walk(join2(dir, entry.name), idx + 1));
  }
  return walk(rootAbs || ".", 0);
}
function hasManifestHint(rootAbs, hint) {
  if (hint.includes(":")) {
    const [file, needle] = hint.split(":", 2);
    if (!file || !needle) return false;
    return readText2(join2(rootAbs, file)).toLowerCase().includes(needle.toLowerCase());
  }
  if (hint.includes("*")) {
    return globPathExists(rootAbs, hint);
  }
  return existsSync3(join2(rootAbs, hint));
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
    if (command.startsWith("./mvnw") && !roots.some((root) => existsSync3(join2(rootFsPath(projectRoot, root), "mvnw")))) {
      continue;
    }
    if (command.startsWith("./gradlew") && !roots.some((root) => existsSync3(join2(rootFsPath(projectRoot, root), "gradlew")))) {
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
      command: stack.id === "static-html" ? null : "npm run test:e2e",
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
  const releaseGoal = hasReleaseGoal(input.goal);
  if (route === "epic-split" || releaseGoal) {
    gates.push({
      id: `${stack.id}-release`,
      phase: "release",
      required: releaseGoal,
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
function readArg2(name, argv) {
  const idx = argv.indexOf(name);
  return idx === -1 ? void 0 : argv[idx + 1];
}
function main2() {
  const argv = process.argv.slice(2);
  const cwd = readArg2("--cwd", argv);
  const goal = readArg2("--goal", argv) ?? "";
  const route = readArg2("--route", argv);
  const risk = readArg2("--risk", argv);
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
function isDirectRun2() {
  try {
    return process.argv[1]?.endsWith("stack-capabilities.mjs") === true;
  } catch {
    return false;
  }
}
if (isDirectRun2()) {
  main2();
}

// src/hooks/lib/dev-runtime.ts
var DEFAULT_STATIC_HTML_PORT = 8123;
var STATIC_HTML_NODE_EVAL_PATTERN = /^node -e "eval\(Buffer\.from\('([A-Za-z0-9+/=]+)','base64'\)\.toString\('utf8'\)\)"$/;
function staticHtmlPort() {
  const raw = process.env["CURDX_FLOW_STATIC_PORT"];
  if (raw === void 0 || raw.trim() === "") return DEFAULT_STATIC_HTML_PORT;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : DEFAULT_STATIC_HTML_PORT;
}
function readJsonFile(path2) {
  try {
    return JSON.parse(readFileSync4(path2, "utf8"));
  } catch {
    return null;
  }
}
function detectPackageManager2(rootAbs) {
  if (existsSync4(join3(rootAbs, "pnpm-lock.yaml")) || existsSync4(join3(rootAbs, "pnpm-workspace.yaml"))) return "pnpm";
  if (existsSync4(join3(rootAbs, "bun.lockb")) || existsSync4(join3(rootAbs, "bun.lock"))) return "bun";
  if (existsSync4(join3(rootAbs, "yarn.lock"))) return "yarn";
  if (existsSync4(join3(rootAbs, "package-lock.json"))) return "npm";
  if (existsSync4(join3(rootAbs, "package.json"))) return "npm";
  if (existsSync4(join3(rootAbs, "pom.xml"))) return "maven";
  if (existsSync4(join3(rootAbs, "build.gradle")) || existsSync4(join3(rootAbs, "build.gradle.kts"))) return "gradle";
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
function firstScript(scripts, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(scripts, name)) return name;
  }
  return null;
}
function scriptNamesMatching(scripts, pattern) {
  return Object.entries(scripts).filter(([name, command]) => pattern.test(`${name} ${command}`)).map(([name]) => name);
}
function defaultUrlFor(root) {
  if (root.frameworks.includes("static-html")) return [`http://127.0.0.1:${staticHtmlPort()}/`];
  if (root.frameworks.includes("vite")) return ["http://localhost:5173"];
  if (root.frameworks.includes("next") || root.frameworks.includes("react")) return ["http://localhost:3000"];
  if (root.frameworks.includes("spring-boot") || root.frameworks.includes("spring-cloud")) {
    return ["http://localhost:8080/actuator/health", "http://localhost:8080/health"];
  }
  return [];
}
function rootFsPath2(projectRoot, root) {
  return isAbsolute4(root.path) ? resolve3(root.path) : resolve3(projectRoot, root.path);
}
function javaCommands(rootAbs) {
  if (existsSync4(join3(rootAbs, "pom.xml"))) {
    const mvn = existsSync4(join3(rootAbs, "mvnw")) ? "./mvnw" : "mvn";
    return {
      startCommand: `${mvn} spring-boot:run`,
      verifyCommands: [`${mvn} test`]
    };
  }
  if (existsSync4(join3(rootAbs, "build.gradle")) || existsSync4(join3(rootAbs, "build.gradle.kts"))) {
    const gradle = existsSync4(join3(rootAbs, "gradlew")) ? "./gradlew" : "gradle";
    return {
      startCommand: `${gradle} bootRun`,
      verifyCommands: [`${gradle} test`]
    };
  }
  return { startCommand: null, verifyCommands: [] };
}
function nativeVerifyCommands(rootAbs) {
  if (isStaticHtmlRoot(rootAbs) && existsSync4(join3(rootAbs, "app.js"))) {
    return ["node --check app.js"];
  }
  if (existsSync4(join3(rootAbs, "go.mod"))) {
    return ["go test ./...", "go vet ./..."];
  }
  if (existsSync4(join3(rootAbs, "Cargo.toml"))) {
    return ["cargo test", "cargo clippy -- -D warnings"];
  }
  if (existsSync4(join3(rootAbs, "pyproject.toml")) || existsSync4(join3(rootAbs, "requirements.txt"))) {
    return ["pytest", "ruff check ."];
  }
  if (existsSync4(join3(rootAbs, ".claude-plugin", "plugin.json"))) {
    return [
      "npm run check:hooks-fresh",
      "npm run typecheck",
      "CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc"
    ];
  }
  return [];
}
function isStaticHtmlRoot(rootAbs) {
  return existsSync4(join3(rootAbs, "index.html")) && (existsSync4(join3(rootAbs, "app.js")) || existsSync4(join3(rootAbs, "styles.css")));
}
function staticHtmlServerCommand(rootAbs) {
  if (!isStaticHtmlRoot(rootAbs)) return null;
  const port = staticHtmlPort();
  const script = [
    'const http=require("node:http"),fs=require("node:fs"),path=require("node:path");',
    "const root=process.cwd();",
    'const types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8"};',
    "const server=http.createServer((req,res)=>{",
    'let rel=decodeURIComponent(new URL(req.url,"http://127.0.0.1").pathname);',
    'rel=rel==="/"?"index.html":rel.replace(/^[/\\\\]+/,"");',
    "const file=path.resolve(root,path.normalize(rel));",
    'if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end("Forbidden");return;}',
    "fs.readFile(file,(err,data)=>{",
    'if(err){res.writeHead(404);res.end("Not found");return;}',
    'res.writeHead(200,{"Content-Type":types[path.extname(file).toLowerCase()]||"application/octet-stream"});',
    "res.end(data);",
    "});",
    "});",
    `server.listen(${port},"127.0.0.1",()=>console.log("READY:http://127.0.0.1:${port}/"));`,
    'process.on("SIGTERM",()=>server.close(()=>process.exit(0)));',
    'process.on("SIGINT",()=>server.close(()=>process.exit(0)));'
  ].join("");
  const encoded = Buffer.from(script, "utf8").toString("base64");
  return `node -e "eval(Buffer.from('${encoded}','base64').toString('utf8'))"`;
}
function spawnCommandFor(command) {
  const staticHtmlMatch = STATIC_HTML_NODE_EVAL_PATTERN.exec(command);
  if (staticHtmlMatch?.[1]) {
    return {
      command: process.execPath,
      args: [
        "-e",
        `eval(Buffer.from('${staticHtmlMatch[1]}','base64').toString('utf8'))`
      ],
      shell: false
    };
  }
  return { command, args: [], shell: true };
}
function detectRoot(projectRoot, root) {
  const fsPath = rootFsPath2(projectRoot, root);
  const pkg = readJsonFile(join3(fsPath, "package.json"));
  const scripts = pkg?.scripts ?? {};
  const packageManager = detectPackageManager2(fsPath);
  const scriptNames = Object.keys(scripts);
  const devScript = firstScript(scripts, ["dev", "start", "serve", "preview"]);
  const verifyScriptNames = [
    ...["typecheck", "lint", "test", "build"].filter(
      (name) => Object.prototype.hasOwnProperty.call(scripts, name)
    )
  ];
  const e2eScriptNames = scriptNamesMatching(
    scripts,
    /(^|:|-)(e2e|browser|ui|acceptance)(:|-|$)|playwright|cypress|puppeteer/i
  );
  const java = javaCommands(fsPath);
  const staticServer = staticHtmlServerCommand(fsPath);
  const urls = defaultUrlFor(root);
  const startCommand = devScript !== null ? scriptCommand(packageManager, devScript) : java.startCommand ?? staticServer;
  const healthCommands = urls.map((url) => `curl -fsS ${url}`);
  const verifyCommands = [
    ...verifyScriptNames.map((name) => scriptCommand(packageManager, name)),
    ...java.verifyCommands,
    ...nativeVerifyCommands(fsPath)
  ];
  const e2eCommands = e2eScriptNames.map((name) => scriptCommand(packageManager, name));
  return {
    name: root.name,
    path: root.path,
    fsPath,
    role: root.role,
    kinds: root.kinds,
    frameworks: root.frameworks,
    packageManager,
    scripts: scriptNames,
    startCommand,
    healthCommands,
    verifyCommands: [...new Set(verifyCommands)],
    e2eCommands: [...new Set(e2eCommands)],
    urls
  };
}
function runtimeDir(projectRoot) {
  return join3(projectRoot, ".curdx");
}
function runtimeStatePath(projectRoot) {
  return join3(runtimeDir(projectRoot), "dev-runtime.json");
}
function serviceLogPath(projectRoot, name) {
  return join3(runtimeDir(projectRoot), `dev-${name.replace(/[^a-z0-9_-]/gi, "-")}.log`);
}
function detectDevRuntime(input = {}) {
  const cwd = resolve3(input.cwd ?? process.cwd());
  const topology = discoverProjectTopology({ cwd });
  const roots = topology.roots.filter((root) => root.access !== "missing-path").map((root) => detectRoot(topology.projectRoot, root));
  const stackProfile = detectStackProfile({ cwd, topology });
  const qualityGates = selectQualityGates({ cwd, topology, stackProfile });
  const suggestedVerifier = selectSuggestedVerifier({
    cwd,
    topology,
    stackProfile,
    qualityGates
  });
  const gaps = [];
  if (topology.workspaceState === "empty") {
    gaps.push("workspace is empty; create or import product/spec context before runtime verification");
  }
  if (roots.every((root) => root.startCommand === null)) {
    gaps.push("no dev/start command detected");
  }
  if (roots.every((root) => root.verifyCommands.length === 0)) {
    gaps.push("no baseline verification command detected");
  }
  if (roots.some((root) => root.kinds.includes("frontend-app")) && roots.every((root) => root.e2eCommands.length === 0)) {
    gaps.push("frontend/browser work has no detected e2e command");
  }
  return {
    version: 1,
    cwd,
    projectRoot: topology.projectRoot,
    workspaceState: topology.workspaceState,
    roots,
    services: roots.filter((root) => root.startCommand !== null).map((root) => ({
      name: root.name,
      root: root.path,
      command: root.startCommand ?? "",
      logPath: serviceLogPath(topology.projectRoot, root.name)
    })),
    health: roots.flatMap(
      (root) => root.healthCommands.map((command) => ({ root: root.path, command }))
    ),
    verification: {
      baselineCommands: roots.flatMap(
        (root) => root.verifyCommands.map((command) => ({ root: root.path, command }))
      ),
      e2eCommands: roots.flatMap(
        (root) => root.e2eCommands.map((command) => ({ root: root.path, command }))
      )
    },
    stackProfile,
    qualityGates,
    suggestedVerifier,
    gaps
  };
}
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function waitForPidExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (!isPidAlive(pid)) return true;
    sleepSync(50);
  } while (Date.now() < deadline);
  return !isPidAlive(pid);
}
function signalPid(pid, signal) {
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    try {
      process.kill(pid, signal);
      return true;
    } catch {
      return false;
    }
  }
}
function terminatePidTree(pid) {
  if (!isPidAlive(pid)) {
    return {
      signalSent: false,
      exited: true,
      forced: false,
      alreadyStopped: true
    };
  }
  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true
    });
    const exited2 = waitForPidExit(pid, 2e3);
    return {
      signalSent: result.status === 0 || exited2,
      exited: exited2,
      forced: result.status === 0,
      alreadyStopped: false
    };
  }
  const signalSent = signalPid(pid, "SIGTERM");
  let exited = waitForPidExit(pid, 750);
  let forced = false;
  if (!exited) {
    forced = signalPid(pid, "SIGKILL");
    exited = waitForPidExit(pid, 1250);
  }
  return {
    signalSent,
    exited,
    forced,
    alreadyStopped: false
  };
}
function readRuntimeState(projectRoot) {
  return readJsonFile(runtimeStatePath(projectRoot));
}
function startDevRuntime(input = {}) {
  const plan = detectDevRuntime(input);
  mkdirSync2(runtimeDir(plan.projectRoot), { recursive: true });
  const services = [];
  for (const service of plan.services) {
    const root = plan.roots.find((candidate) => candidate.path === service.root);
    if (!root) continue;
    const logFd = openSync(service.logPath, "a");
    let child;
    try {
      const command = spawnCommandFor(service.command);
      child = spawn(command.command, command.args, {
        cwd: root.fsPath,
        shell: command.shell,
        detached: true,
        stdio: ["ignore", logFd, logFd],
        env: process.env,
        windowsHide: true
      });
    } finally {
      closeSync(logFd);
    }
    child.unref();
    if (typeof child.pid === "number") {
      services.push({
        name: service.name,
        root: service.root,
        command: service.command,
        pid: child.pid,
        logPath: service.logPath
      });
    }
  }
  const state = {
    version: 1,
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    cwd: plan.cwd,
    projectRoot: plan.projectRoot,
    services,
    gaps: plan.gaps
  };
  writeFileSync2(runtimeStatePath(plan.projectRoot), JSON.stringify(state, null, 2) + "\n");
  return state;
}
function healthDevRuntime(input = {}) {
  const plan = detectDevRuntime(input);
  const state = readRuntimeState(plan.projectRoot);
  const serviceStatus = (state?.services ?? []).map((service) => ({
    ...service,
    alive: isPidAlive(service.pid)
  }));
  const commandStatus = input.dryRun === true ? plan.health.map((item) => ({ ...item, skipped: true })) : plan.health.map((item) => {
    const root = plan.roots.find((candidate) => candidate.path === item.root);
    const result = spawnSync(item.command, {
      cwd: root?.fsPath ?? plan.projectRoot,
      shell: true,
      encoding: "utf8",
      timeout: 1e4
    });
    return {
      ...item,
      exitCode: result.status ?? 1,
      ok: result.status === 0,
      stderr: result.stderr?.trim() ?? ""
    };
  });
  const ok = serviceStatus.length > 0 && serviceStatus.every((service) => service.alive) && commandStatus.every((item) => "ok" in item ? item.ok === true : true);
  return {
    ok,
    cwd: plan.cwd,
    projectRoot: plan.projectRoot,
    statePath: runtimeStatePath(plan.projectRoot),
    services: serviceStatus,
    health: commandStatus,
    gaps: plan.gaps
  };
}
function verifyDevRuntime(input = {}) {
  const plan = detectDevRuntime(input);
  const commands = [
    ...plan.verification.baselineCommands,
    ...input.includeE2e === true ? plan.verification.e2eCommands : []
  ];
  if (input.dryRun === true) {
    return {
      ok: commands.length > 0,
      dryRun: true,
      cwd: plan.cwd,
      commands,
      gaps: plan.gaps
    };
  }
  const results = commands.map((item) => {
    const root = plan.roots.find((candidate) => candidate.path === item.root);
    const result = spawnSync(item.command, {
      cwd: root?.fsPath ?? plan.projectRoot,
      shell: true,
      stdio: "inherit",
      env: process.env
    });
    return {
      ...item,
      exitCode: result.status ?? 1,
      ok: result.status === 0
    };
  });
  return {
    ok: commands.length > 0 && results.every((item) => item.ok),
    cwd: plan.cwd,
    commands: results,
    gaps: plan.gaps
  };
}
function stopDevRuntime(input = {}) {
  const plan = detectDevRuntime(input);
  const state = readRuntimeState(plan.projectRoot);
  const stopped = (state?.services ?? []).map((service) => {
    const result = terminatePidTree(service.pid);
    return {
      ...service,
      stopped: result.signalSent || result.exited || result.alreadyStopped,
      alreadyStopped: result.alreadyStopped,
      exited: result.exited,
      forced: result.forced
    };
  });
  rmSync(runtimeStatePath(plan.projectRoot), { force: true });
  return {
    ok: stopped.every((service) => service.stopped || service.alreadyStopped),
    cwd: plan.cwd,
    projectRoot: plan.projectRoot,
    stopped
  };
}
export {
  detectDevRuntime,
  healthDevRuntime,
  startDevRuntime,
  stopDevRuntime,
  verifyDevRuntime
};
//# sourceMappingURL=dev-runtime.mjs.map
