import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute, join, posix } from "node:path";

/**
 * Path policy: fs IO uses native `join`; values serialized to JSON, stdout,
 * or state files use `posix.join` so output stays byte-stable across
 * platforms. Public resolvers (`findSpec`, `resolveCurrent`, `listSpecs`)
 * return posix-form paths; callers re-anchoring them to the filesystem must
 * use the native `join` (Node tolerates mixed separators on Windows).
 */

const DEFAULT_SPECS_DIR = "./specs";
const SETTINGS_REL_PATH = ".claude/curdx-flow.local.md";

export interface ResolverOptions {
  /** Falls back to `CURDX_CWD` env then `process.cwd()`. */
  cwd?: string;
  /** When present, session-scoped spec binding wins. */
  sessionId?: string;
}

export interface SessionSpecBinding {
  version: 1;
  sessionId: string;
  specPath: string;
  specName: string;
  lastSeenAt: string;
  source: string;
}

function resolveCwd(opts: ResolverOptions | undefined): string {
  return opts?.cwd ?? process.env["CURDX_CWD"] ?? process.cwd();
}

function warn(msg: string): void {
  process.stderr.write(`[curdx-warn] ${msg}\n`);
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function sanitizeSessionId(sessionId: string | undefined): string | null {
  const raw = sessionId?.trim();
  if (!raw) return null;
  const safe = raw.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 120);
  return safe.length > 0 ? safe : null;
}

function specPathExists(cwd: string, specPath: string): boolean {
  const fsPath = isAbsolute(specPath) ? specPath : join(cwd, specPath);
  return isDir(fsPath);
}

export function sessionBindingPath(opts?: ResolverOptions): string | null {
  const cwd = resolveCwd(opts);
  const sessionId = sanitizeSessionId(opts?.sessionId);
  if (!sessionId) return null;
  return join(cwd, ".curdx", "sessions", `${sessionId}.json`);
}

export function readSessionSpecBinding(opts?: ResolverOptions): SessionSpecBinding | null {
  const cwd = resolveCwd(opts);
  const path = sessionBindingPath(opts);
  if (!path || !existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<SessionSpecBinding>;
    if (parsed.version !== 1) return null;
    if (typeof parsed.sessionId !== "string" || typeof parsed.specPath !== "string") return null;
    if (!specPathExists(cwd, parsed.specPath)) return null;
    return {
      version: 1,
      sessionId: parsed.sessionId,
      specPath: parsed.specPath,
      specName: typeof parsed.specName === "string" ? parsed.specName : basename(parsed.specPath),
      lastSeenAt: typeof parsed.lastSeenAt === "string" ? parsed.lastSeenAt : "",
      source: typeof parsed.source === "string" ? parsed.source : "unknown",
    };
  } catch {
    return null;
  }
}

export function bindSessionSpec(
  specPath: string,
  opts?: ResolverOptions & { source?: string },
): { ok: true; path: string } | { ok: false; reason: string; path?: string } {
  const cwd = resolveCwd(opts);
  const sessionId = sanitizeSessionId(opts?.sessionId);
  if (!sessionId) return { ok: false, reason: "missing-session-id" };
  if (!specPath || !specPathExists(cwd, specPath)) {
    return { ok: false, reason: "spec-not-found" };
  }
  const bindingPath = sessionBindingPath({ cwd, sessionId });
  if (!bindingPath) return { ok: false, reason: "missing-session-id" };
  const binding: SessionSpecBinding = {
    version: 1,
    sessionId,
    specPath,
    specName: basename(specPath),
    lastSeenAt: new Date().toISOString(),
    source: opts?.source ?? "runtime",
  };
  try {
    mkdirSync(join(cwd, ".curdx", "sessions"), { recursive: true });
    writeFileSync(bindingPath, JSON.stringify(binding, null, 2) + "\n", "utf8");
    return { ok: true, path: bindingPath };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, reason, path: bindingPath };
  }
}

function normalizePath(input: string): string {
  if (!input) return ".";
  let p = input.replace(/\/+$/, "");
  if (p === "") p = ".";
  return p;
}

// Returns `start` itself when no `.git` or settings marker is found.
export function findRepoRoot(start?: string): string {
  const origin = start ?? process.cwd();
  let cur = origin;
  // Hard hop cap guards against pathological symlink loops.
  for (let i = 0; i < 64; i++) {
    if (isDir(join(cur, ".git"))) return cur;
    if (existsSync(join(cur, SETTINGS_REL_PATH))) return cur;
    const parent = join(cur, "..");
    if (parent === cur) break;
    cur = parent;
  }
  return origin;
}

// Parses `specs_dirs: ["./specs", ...]` from the YAML frontmatter of
// `.claude/curdx-flow.local.md`; not yet validated against the filesystem.
function parseSpecsDirsFromSettings(settingsPath: string): string[] {
  let raw: string;
  try {
    raw = readFileSync(settingsPath, "utf8");
  } catch {
    return [];
  }
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*$/m);
  const block = fmMatch?.[1] ?? raw;
  const line = block
    .split(/\r?\n/)
    .find((l) => /^\s*specs_dirs\s*:/.test(l));
  if (!line) return [];
  const value = line.replace(/^\s*specs_dirs\s*:\s*/, "");
  return value
    .replace(/[\[\]"']/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function getSpecsDirs(opts?: ResolverOptions): string[] {
  const cwd = resolveCwd(opts);
  if (!isDir(cwd)) {
    warn(`CURDX_CWD does not exist: ${cwd}`);
    return [DEFAULT_SPECS_DIR];
  }

  const settingsPath = join(cwd, SETTINGS_REL_PATH);
  const raw = existsSync(settingsPath)
    ? parseSpecsDirsFromSettings(settingsPath)
    : [];

  if (raw.length === 0) return [DEFAULT_SPECS_DIR];

  const validated: string[] = [];
  for (const entry of raw) {
    const dir = normalizePath(entry);
    const absoluteOutsideCwd = isAbsolute(dir) && !dir.startsWith(cwd);
    if (absoluteOutsideCwd) {
      if (!isDir(dir)) {
        warn(
          `Skipping invalid absolute path in specs_dirs: ${dir} (does not exist)`,
        );
        continue;
      }
    } else {
      const resolved = isAbsolute(dir) ? dir : join(cwd, dir);
      if (!isDir(resolved)) {
        warn(
          `Skipping invalid path in specs_dirs: ${dir} (directory not found at ${resolved})`,
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

export const resolveSpecsDirs = getSpecsDirs;

export function getDefaultDir(opts?: ResolverOptions): string {
  const dirs = getSpecsDirs(opts);
  return normalizePath(dirs[0] ?? DEFAULT_SPECS_DIR);
}

export type FindSpecResult =
  | { ok: true; path: string }
  | { ok: false; reason: "not-found"; name: string }
  | { ok: false; reason: "ambiguous"; name: string; matches: string[] };

// Returns a posix-joined path so it can be written into state files unchanged.
export function findSpec(name: string, opts?: ResolverOptions): FindSpecResult {
  if (!name) {
    return { ok: false, reason: "not-found", name: "" };
  }
  const cwd = resolveCwd(opts);
  if (!isDir(cwd)) {
    return { ok: false, reason: "not-found", name };
  }

  let cleaned = normalizePath(name);
  if (cleaned.startsWith("./")) cleaned = cleaned.slice(2);

  const matches: string[] = [];
  for (const entry of getSpecsDirs(opts)) {
    const dir = normalizePath(entry);
    const candidateFs = isAbsolute(dir)
      ? join(dir, cleaned)
      : join(cwd, dir, cleaned);
    if (isDir(candidateFs)) {
      matches.push(posix.join(dir, cleaned));
    }
  }

  if (matches.length === 0) {
    return { ok: false, reason: "not-found", name: cleaned };
  }
  if (matches.length === 1) {
    return { ok: true, path: matches[0]! };
  }
  return { ok: false, reason: "ambiguous", name: cleaned, matches };
}

// A project-root `.current-spec` is accepted as a defensive fallback because
// older quick-mode instructions occasionally wrote the marker there.
export function resolveCurrent(opts?: ResolverOptions): string | null {
  const cwd = resolveCwd(opts);
  if (!isDir(cwd)) return null;

  const sessionBinding = readSessionSpecBinding(opts);
  if (sessionBinding) return sessionBinding.specPath;

  const defaultDir = getDefaultDir(opts);
  const markerFs = [
    join(cwd, defaultDir, ".current-spec"),
    join(cwd, ".current-spec"),
  ].find((candidate) => existsSync(candidate));
  if (!markerFs) return null;

  let content: string;
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

export interface SpecEntry {
  name: string;
  /** POSIX separators — safe to embed in state files. */
  path: string;
}

export function listSpecs(opts?: ResolverOptions): SpecEntry[] {
  const cwd = resolveCwd(opts);
  if (!isDir(cwd)) return [];

  const out: SpecEntry[] = [];
  for (const entry of getSpecsDirs(opts)) {
    const dir = normalizePath(entry);
    const rootFs = isAbsolute(dir) ? dir : join(cwd, dir);
    if (!isDir(rootFs)) continue;
    let children: string[];
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
        path: posix.join(dir, child),
      });
    }
  }
  return out;
}
