// src/hooks/lib/project-topology.ts
//
// Cheap project topology detector for curdx-flow.
//
// This helper intentionally reads only durable project-context files
// (CLAUDE.md, curdx-flow settings, package/build manifests, and shallow
// sibling directory names). It does not deep-scan source trees. The output is
// designed for LLM routing: short root roles, framework hints, and exact
// access-fix instructions when a related root sits outside the current
// Claude Code working directory.

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import path, { basename, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findRepoRoot } from "../_shared/path-resolver.js";

export type CodeRootRole =
  | "auto"
  | "frontend"
  | "backend"
  | "shared"
  | "plugin"
  | "infra"
  | "mobile"
  | "database"
  | "unknown";

export type CodeRootKind =
  | "frontend-app"
  | "backend-service"
  | "shared-library"
  | "cli"
  | "claude-code-plugin"
  | "infra"
  | "mobile-app"
  | "unknown";

export type CodeRootSource =
  | "cwd"
  | "claude-md"
  | "curdx-settings"
  | "sibling-scan";

export type RootAccess =
  | "inside-working-directory"
  | "configured-additional-directory"
  | "outside-working-directory"
  | "missing-path";

export type WorkspaceState =
  | "empty"
  | "scaffolded"
  | "existing"
  | "split-repo";

export interface CodeRoot {
  name: string;
  path: string;
  role: CodeRootRole;
  kinds: CodeRootKind[];
  frameworks: string[];
  packageManager?: string;
  access: RootAccess;
  source: CodeRootSource;
  confidence: number;
}

export interface RequiredRoot {
  name: string;
  path: string;
  reason: string;
  access: RootAccess;
}

export interface ProjectTopology {
  version: 1;
  cwd: string;
  projectRoot: string;
  workspaceState: WorkspaceState;
  devContextFound: boolean;
  roots: CodeRoot[];
  requiredRoots: RequiredRoot[];
  missingRoots: RequiredRoot[];
  accessFix?: string;
  warnings: string[];
}

interface RawRoot {
  name: string;
  path: string;
  role: CodeRootRole;
  source: CodeRootSource;
  confidence: number;
}

interface DiscoveryOptions {
  cwd?: string;
  goal?: string;
}

const FRONTEND_KEY_RE = /^(frontend|front-end|web|ui|client|admin|前端)$/i;
const BACKEND_KEY_RE = /^(backend|back-end|api|server|service|后端)$/i;
const SHARED_KEY_RE = /^(shared|common|contracts?|types?|sdk|共享|协议)$/i;
const INFRA_KEY_RE = /^(infra|infrastructure|deploy|ops|devops|docker|k8s)$/i;
const MOBILE_KEY_RE = /^(mobile|ios|android|app)$/i;
const DATABASE_KEY_RE = /^(database|db|mysql|postgres|postgresql|redis|mongo|数据库)$/i;

const UI_GOAL_RE =
  /\b(ui|ux|frontend|front-end|react|vue|vite|next|nuxt|page|screen|component|button|form|css|style|layout|页面|前端|组件|样式)\b/i;
const BACKEND_GOAL_RE =
  /\b(backend|back-end|api|endpoint|controller|service|spring|spring boot|spring cloud|dto|entity|repository|database|db|migration|接口|后端|数据库)\b/i;
const CONTRACT_GOAL_RE =
  /\b(contract|openapi|swagger|api response|dto|schema|client generation|接口字段|接口返回|契约)\b/i;
const AUTH_GOAL_RE =
  /\b(auth|login|logout|session|permission|oauth|jwt|登录|鉴权|权限)\b/i;

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function readText(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function meaningfulProjectEntries(projectRoot: string): string[] {
  try {
    return readdirSync(projectRoot).filter((name) => {
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

function normalizeSerializedPath(input: string): string {
  const trimmed = input.trim().replace(/^["'`]+|["'`]+$/g, "");
  if (!trimmed || trimmed === "./") return ".";
  return trimmed.replace(/\\/g, "/").replace(/\/+$/, "") || ".";
}

function toPosixPath(p: string): string {
  return p.split(path.sep).join("/");
}

function relativeOrDot(from: string, to: string): string {
  const rel = toPosixPath(relative(from, to));
  return rel.length === 0 ? "." : rel;
}

function roleFromKey(key: string): CodeRootRole {
  const normalized = key.trim().toLowerCase();
  if (FRONTEND_KEY_RE.test(normalized)) return "frontend";
  if (BACKEND_KEY_RE.test(normalized)) return "backend";
  if (SHARED_KEY_RE.test(normalized)) return "shared";
  if (INFRA_KEY_RE.test(normalized)) return "infra";
  if (MOBILE_KEY_RE.test(normalized)) return "mobile";
  if (DATABASE_KEY_RE.test(normalized)) return "database";
  return "auto";
}

function rootNameFromRole(role: CodeRootRole, fallbackPath: string): string {
  if (role !== "auto" && role !== "unknown") return role;
  const base = basename(fallbackPath);
  return base === "." || base === ".." || base.length === 0 ? "current" : base;
}

function extractFrontmatter(raw: string): string {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*/);
  return match?.[1] ?? raw;
}

function cleanScalar(value: string): string {
  return value
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\s+#.*$/, "")
    .trim();
}

function parseCodeRootsFromCurdxSettings(projectRoot: string): RawRoot[] {
  const settingsPath = path.join(projectRoot, ".claude", "curdx-flow.local.md");
  if (!isFile(settingsPath)) return [];
  const block = extractFrontmatter(readText(settingsPath));
  const lines = block.split(/\r?\n/);
  const roots: RawRoot[] = [];
  let inCodeRoots = false;
  let current: Partial<RawRoot> | undefined;

  function flush(): void {
    if (!current?.path) return;
    const role = current.role ?? "auto";
    roots.push({
      name: current.name ?? rootNameFromRole(role, current.path),
      path: normalizeSerializedPath(current.path),
      role,
      source: "curdx-settings",
      confidence: 0.99,
    });
    current = undefined;
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
        const key = inlineMatch[1];
        const value = cleanScalar(inlineMatch[2]);
        if (key === "name") current.name = value;
        if (key === "path") current.path = value;
        if (key === "role" || key === "kind") {
          current.role = roleFromKey(value);
        }
      }
      continue;
    }
    const propMatch = line.match(/^\s+(name|path|role|kind)\s*:\s*(.+)$/);
    if (!propMatch?.[1] || propMatch[2] === undefined) continue;
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

function claudeMdCandidates(projectRoot: string): string[] {
  return [
    path.join(projectRoot, "CLAUDE.md"),
    path.join(projectRoot, ".claude", "CLAUDE.md"),
    path.join(projectRoot, "CLAUDE.local.md"),
  ];
}

function extractDevBlocks(raw: string): string[] {
  const lines = raw.split(/\r?\n/);
  const blocks: string[] = [];
  let activeLevel = 0;
  let current: string[] = [];

  function flush(): void {
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
      if (
        /\b(dev|development|local services|local development)\b/i.test(title) ||
        /(开发|本地开发|开发环境)/.test(title)
      ) {
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

function parseRootsFromDevText(text: string): RawRoot[] {
  const roots: RawRoot[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:[-*]\s*)?([A-Za-z\u4e00-\u9fa5][\w\u4e00-\u9fa5 -]{0,40})\s*[:：]\s*(.+?)\s*$/,
    );
    if (!match?.[1] || match[2] === undefined) continue;
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
      confidence: 0.95,
    });
  }
  return roots;
}

function parseRootsFromClaudeMd(projectRoot: string): {
  roots: RawRoot[];
  devContextFound: boolean;
  warnings: string[];
} {
  const roots: RawRoot[] = [];
  const warnings: string[] = [];
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
          "Dev context mentions database or sensitive-looking values; topology output stores only paths and omits credentials.",
        );
      }
    }
  }
  return { roots, devContextFound, warnings };
}

function readJsonObject(file: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function stringRecord(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function hasDep(pkg: Record<string, unknown> | undefined, name: string): boolean {
  if (!pkg) return false;
  const deps = {
    ...stringRecord(pkg["dependencies"]),
    ...stringRecord(pkg["devDependencies"]),
    ...stringRecord(pkg["peerDependencies"]),
  };
  return Object.prototype.hasOwnProperty.call(deps, name);
}

function hasAnyDep(pkg: Record<string, unknown> | undefined, names: string[]): boolean {
  return names.some((name) => hasDep(pkg, name));
}

function detectPackageManager(rootAbs: string): string | undefined {
  if (isFile(path.join(rootAbs, "pnpm-lock.yaml")) || isFile(path.join(rootAbs, "pnpm-workspace.yaml"))) {
    return "pnpm";
  }
  if (isFile(path.join(rootAbs, "yarn.lock"))) return "yarn";
  if (isFile(path.join(rootAbs, "package-lock.json"))) return "npm";
  if (isFile(path.join(rootAbs, "bun.lockb")) || isFile(path.join(rootAbs, "bun.lock"))) return "bun";
  if (isFile(path.join(rootAbs, "pom.xml"))) return "maven";
  if (isFile(path.join(rootAbs, "build.gradle")) || isFile(path.join(rootAbs, "build.gradle.kts"))) return "gradle";
  return undefined;
}

function hasManifestOrSource(rootAbs: string): boolean {
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
    "packages",
  ].some((entry) => existsSync(path.join(rootAbs, entry)));
}

function pushUnique<T extends string>(items: T[], item: T): void {
  if (!items.includes(item)) items.push(item);
}

function classifyRoot(rootAbs: string, role: CodeRootRole): {
  kinds: CodeRootKind[];
  frameworks: string[];
  packageManager?: string;
} {
  const kinds: CodeRootKind[] = [];
  const frameworks: string[] = [];
  const pkg = readJsonObject(path.join(rootAbs, "package.json"));
  const pom = readText(path.join(rootAbs, "pom.xml"));
  const gradle = [
    readText(path.join(rootAbs, "build.gradle")),
    readText(path.join(rootAbs, "build.gradle.kts")),
  ].join("\n");
  const buildText = `${pom}\n${gradle}`;

  if (
    isFile(path.join(rootAbs, "index.html")) &&
    (isFile(path.join(rootAbs, "app.js")) || isFile(path.join(rootAbs, "styles.css")))
  ) {
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
    if (
      hasDep(pkg, "vite") ||
      isFile(path.join(rootAbs, "vite.config.ts")) ||
      isFile(path.join(rootAbs, "vite.config.js"))
    ) {
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
    if (typeof pkg["bin"] === "string" || (pkg["bin"] && typeof pkg["bin"] === "object")) {
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
  if (isDir(path.join(rootAbs, "src", "main", "java"))) {
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
  if (
    isFile(path.join(rootAbs, "Dockerfile")) ||
    isFile(path.join(rootAbs, "docker-compose.yml")) ||
    isFile(path.join(rootAbs, "docker-compose.yaml"))
  ) {
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
    packageManager: detectPackageManager(rootAbs),
  };
}

function settingsAdditionalDirectories(projectRoot: string): string[] {
  const entries: string[] = [];
  const candidates: Array<{ file: string; base: string }> = [
    { file: path.join(projectRoot, ".claude", "settings.json"), base: projectRoot },
    { file: path.join(projectRoot, ".claude", "settings.local.json"), base: projectRoot },
    { file: path.join(homedir(), ".claude", "settings.json"), base: path.join(homedir(), ".claude") },
  ];
  for (const candidate of candidates) {
    const parsed = readJsonObject(candidate.file);
    const dirs = parsed?.["additionalDirectories"];
    if (!Array.isArray(dirs)) continue;
    for (const dir of dirs) {
      if (typeof dir !== "string" || dir.trim().length === 0) continue;
      entries.push(isAbsolute(dir) ? resolve(dir) : resolve(candidate.base, dir));
    }
  }
  return [...new Set(entries)];
}

function containsPath(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function rootAccess(rootAbs: string, cwd: string, additionalDirs: string[]): RootAccess {
  if (!existsSync(rootAbs)) return "missing-path";
  if (containsPath(cwd, rootAbs)) return "inside-working-directory";
  if (additionalDirs.some((dir) => containsPath(dir, rootAbs))) {
    return "configured-additional-directory";
  }
  return "outside-working-directory";
}

function addOrMergeRoot(map: Map<string, RawRoot>, root: RawRoot, projectRoot: string): void {
  const abs = isAbsolute(root.path) ? resolve(root.path) : resolve(projectRoot, root.path);
  const key = abs;
  const existing = map.get(key);
  if (!existing || root.confidence > existing.confidence) {
    map.set(key, root);
  }
}

function siblingCandidates(projectRoot: string): RawRoot[] {
  const currentBase = basename(projectRoot).toLowerCase();
  const parent = resolve(projectRoot, "..");
  if (!isDir(parent)) return [];
  const currentLooksBackend = /^(backend|api|server|service|services)$/.test(currentBase);
  const currentLooksFrontend = /^(frontend|web|ui|client|admin)$/.test(currentBase);
  if (!currentLooksBackend && !currentLooksFrontend) return [];

  const names = readdirSync(parent).slice(0, 80);
  const out: RawRoot[] = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const abs = path.join(parent, name);
    if (abs === projectRoot || !isDir(abs)) continue;
    const lower = name.toLowerCase();
    if (currentLooksBackend && /^(frontend|web|ui|client|admin)$/.test(lower)) {
      out.push({
        name: lower,
        path: relativeOrDot(projectRoot, abs),
        role: "frontend",
        source: "sibling-scan",
        confidence: 0.72,
      });
    }
    if (currentLooksFrontend && /^(backend|api|server|service)$/.test(lower)) {
      out.push({
        name: lower,
        path: relativeOrDot(projectRoot, abs),
        role: "backend",
        source: "sibling-scan",
        confidence: 0.72,
      });
    }
  }
  return out;
}

function detectWorkspaceState(projectRoot: string, roots: CodeRoot[]): WorkspaceState {
  const meaningfulEntries = meaningfulProjectEntries(projectRoot);
  if (meaningfulEntries.length === 0) return "empty";

  const accessibleRoots = roots.filter((root) => root.access !== "missing-path");
  const hasFrontend = accessibleRoots.some(
    (root) => root.role === "frontend" || root.kinds.includes("frontend-app"),
  );
  const hasBackend = accessibleRoots.some(
    (root) => root.role === "backend" || root.kinds.includes("backend-service"),
  );
  const hasMultipleRoots = new Set(accessibleRoots.map((root) => root.path)).size > 1;
  if (hasMultipleRoots && hasFrontend && hasBackend) return "split-repo";

  const current = accessibleRoots.find((root) => root.path === ".");
  const currentAbs = projectRoot;
  const currentKnown =
    current !== undefined &&
    current.kinds.some((kind) => kind !== "unknown" && kind !== "infra");
  if (currentKnown || hasManifestOrSource(currentAbs)) return "existing";

  return "scaffolded";
}

function discoverRawRoots(projectRoot: string): {
  roots: RawRoot[];
  devContextFound: boolean;
  warnings: string[];
} {
  const fromClaude = parseRootsFromClaudeMd(projectRoot);
  const map = new Map<string, RawRoot>();
  addOrMergeRoot(map, {
    name: "current",
    path: ".",
    role: "auto",
    source: "cwd",
    confidence: 0.5,
  }, projectRoot);
  for (const root of parseCodeRootsFromCurdxSettings(projectRoot)) addOrMergeRoot(map, root, projectRoot);
  for (const root of fromClaude.roots) addOrMergeRoot(map, root, projectRoot);
  for (const root of siblingCandidates(projectRoot)) addOrMergeRoot(map, root, projectRoot);
  return {
    roots: [...map.values()],
    devContextFound: fromClaude.devContextFound,
    warnings: fromClaude.warnings,
  };
}

function buildAccessFix(missingRoots: RequiredRoot[]): string | undefined {
  const addDirs = missingRoots
    .filter((root) => root.access === "outside-working-directory")
    .map((root) => `/add-dir ${root.path}`);
  const missingPaths = missingRoots
    .filter((root) => root.access === "missing-path")
    .map((root) => `Path not found: ${root.path}`);
  const lines = [...addDirs, ...missingPaths];
  return lines.length > 0 ? lines.join("\n") : undefined;
}

function rootMatches(root: CodeRoot, role: "frontend" | "backend" | "shared" | "plugin"): boolean {
  if (root.role === role) return true;
  if (role === "frontend") return root.kinds.includes("frontend-app");
  if (role === "backend") return root.kinds.includes("backend-service");
  if (role === "shared") return root.kinds.includes("shared-library");
  return root.kinds.includes("claude-code-plugin");
}

export function inferRequiredRoots(goal: string | undefined, roots: CodeRoot[]): RequiredRoot[] {
  const text = (goal ?? "").trim();
  if (text.length === 0) return [];
  const required = new Map<string, RequiredRoot>();
  const frontendRoots = roots.filter((root) => rootMatches(root, "frontend"));
  const backendRoots = roots.filter((root) => rootMatches(root, "backend"));
  const sharedRoots = roots.filter((root) => rootMatches(root, "shared"));

  function add(root: CodeRoot, reason: string): void {
    required.set(root.name, {
      name: root.name,
      path: root.path,
      reason,
      access: root.access,
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

export function discoverProjectTopology(options: DiscoveryOptions = {}): ProjectTopology {
  const cwd = resolve(options.cwd ?? process.cwd());
  const projectRoot = findRepoRoot(cwd);
  const additionalDirs = settingsAdditionalDirectories(projectRoot);
  const raw = discoverRawRoots(projectRoot);
  const roots: CodeRoot[] = [];

  for (const root of raw.roots) {
    const rootAbs = isAbsolute(root.path) ? resolve(root.path) : resolve(projectRoot, root.path);
    const classified = classifyRoot(rootAbs, root.role);
    roots.push({
      name: root.name,
      path: normalizeSerializedPath(root.path),
      role: root.role,
      kinds: classified.kinds,
      frameworks: classified.frameworks,
      ...(classified.packageManager ? { packageManager: classified.packageManager } : {}),
      access: rootAccess(rootAbs, cwd, additionalDirs),
      source: root.source,
      confidence: root.confidence,
    });
  }

  const requiredRoots = inferRequiredRoots(options.goal, roots);
  const missingRoots = requiredRoots.filter(
    (root) => root.access === "outside-working-directory" || root.access === "missing-path",
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
    ...(missingRoots.length > 0 ? { accessFix: buildAccessFix(missingRoots) } : {}),
    warnings: [...new Set(raw.warnings)],
  };
}

export function renderContextMap(topology: ProjectTopology): string {
  const lines = [
    "# Project Context Map",
    "",
    `Project root: ${topology.projectRoot}`,
    `Workspace state: ${topology.workspaceState}`,
    `Dev context found: ${topology.devContextFound ? "yes" : "no"}`,
    "",
    "## Code Roots",
    "",
  ];
  for (const root of topology.roots) {
    const frameworks = root.frameworks.length > 0 ? `; frameworks: ${root.frameworks.join(", ")}` : "";
    const packageManager = root.packageManager ? `; package manager: ${root.packageManager}` : "";
    lines.push(
      `- ${root.name}: ${root.path} (${root.role}; ${root.kinds.join(", ")}; ${root.access}${frameworks}${packageManager})`,
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
  return `${lines.join("\n")}\n`;
}

function readArg(name: string, argv: string[]): string | undefined {
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

function main(): void {
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

function isDirectRun(): boolean {
  try {
    const entry = fileURLToPath(import.meta.url);
    return process.argv[1] === entry && basename(entry).startsWith("project-topology.");
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main();
}
