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
 * Path resolution for curdx-flow hooks (ES module port of path-resolver.sh).
 *
 * Behaviour mirrors the v6 bash helper:
 *   - `getSpecsDirs()`           ← curdx_get_specs_dirs
 *   - `getDefaultDir()`          ← curdx_get_default_dir
 *   - `findSpec(name)`           ← curdx_find_spec
 *   - `listSpecs()`              ← curdx_list_specs
 *   - `resolveCurrent()`         ← curdx_resolve_current
 *
 * Plus a small helper `findRepoRoot(start)` that walks up looking for
 * either a `.git` directory or a `.claude/curdx-flow.local.md` marker —
 * v6 implicitly assumed `cwd === repo root`; the TS port makes that walk
 * explicit so hooks invoked from sub-directories still resolve.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Path-handling policy (NFR-7, design.md "Cross-Platform Path Handling")
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Two `node:path` namespaces, two distinct uses:
 *
 *   1. fs IO operations (readFileSync, writeFileSync, statSync, existsSync,
 *      readdirSync, unlinkSync, mkdirSync, spawn target, etc.)
 *      → use `path.join` / `path.resolve`
 *      Reason: the OS gets its native separator (`/` on POSIX, `\\` on
 *      Windows). Node's fs APIs accept both on Windows but native sep is
 *      the canonical form and matches what `process.cwd()` returns.
 *
 *   2. Path serialization to JSON, stdout, env vars, hook continuation
 *      prompts, markdown columns, or any cross-process / on-disk channel
 *      → use `path.posix.join` (alias `posix.join` here)
 *      Reason: the output must be byte-stable across operating systems.
 *      A path written into `.curdx-state.json` on Windows must read back
 *      identically on macOS — `\\` vs `/` would break diffs, hashes, and
 *      string comparisons in downstream tooling.
 *
 * Rule of thumb:
 *   - Path goes into `node:fs`              → `path.join`
 *   - Path goes into a JSON file / stdout
 *     / env var / cross-process channel     → `path.posix.join`
 *
 * Both are equivalent on POSIX (single sep). The split only matters on
 * Windows, where `path.join` produces `\\` and `path.posix.join` produces `/`.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * This module's contract
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Resolvers in this file return *posix-form* paths from their public surface
 * (`findSpec`, `resolveCurrent`, `listSpecs` → `SpecEntry.path`) because
 * those values are typically embedded in `.curdx-state.json` or printed
 * to stdout. Callers that re-anchor those paths to the local filesystem
 * (e.g., `existsSync(join(cwd, specPath, ".curdx-state.json"))`) MUST use
 * `path.join` for the fs side — Node tolerates the mixed separators on
 * Windows and the fs path stays correct.
 *
 * Internal helpers in this file use `path.join` for filesystem walks
 * (`findRepoRoot`, `isDir(join(cwd, dir))`, `readdirSync(rootFs)`) and
 * `posix.join` only at the public-return boundary.
 */

const DEFAULT_SPECS_DIR = "./specs";
const SETTINGS_REL_PATH = ".claude/curdx-flow.local.md";

export interface ResolverOptions {
  /** Working directory; falls back to `CURDX_CWD` env then `process.cwd()`. */
  cwd?: string;
  /** Claude Code session id. When present, session-scoped spec binding wins. */
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

/**
 * Strip trailing slashes (preserves "/" root, collapses to "." if input was
 * only slashes — same contract as `_curdx_normalize_path` in the bash source).
 */
function normalizePath(input: string): string {
  if (!input) return ".";
  // Strip trailing slashes (but not a leading single "/").
  let p = input.replace(/\/+$/, "");
  if (p === "") p = "."; // input was just "/" or empty after strip
  return p;
}

/**
 * Walk up from `start` until we find a `.git` dir or a curdx-flow settings
 * file. Returns the first match, or `start` itself if nothing was found
 * (matches v6 behaviour of treating cwd as the repo root by default).
 */
export function findRepoRoot(start?: string): string {
  const origin = start ?? process.cwd();
  let cur = origin;
  // Hard cap in case of pathological symlinks; 64 hops > any sane tree.
  for (let i = 0; i < 64; i++) {
    if (isDir(join(cur, ".git"))) return cur;
    if (existsSync(join(cur, SETTINGS_REL_PATH))) return cur;
    const parent = join(cur, "..");
    // Resolved root → parent === cur on POSIX/Windows alike.
    if (parent === cur) break;
    cur = parent;
  }
  return origin;
}

/**
 * Parse `specs_dirs: ["./specs", "./packages/api/specs"]` from the YAML
 * frontmatter of `.claude/curdx-flow.local.md`. Returns the raw list (not
 * yet validated against the filesystem). Empty array if the key is absent.
 */
function parseSpecsDirsFromSettings(settingsPath: string): string[] {
  let raw: string;
  try {
    raw = readFileSync(settingsPath, "utf8");
  } catch {
    return [];
  }
  // Extract YAML frontmatter (between the first two `---` lines).
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*$/m);
  const block = fmMatch?.[1] ?? raw;
  const line = block
    .split(/\r?\n/)
    .find((l) => /^\s*specs_dirs\s*:/.test(l));
  if (!line) return [];
  // Drop key prefix → "['./specs', './x']" or "./specs, ./x"
  const value = line.replace(/^\s*specs_dirs\s*:\s*/, "");
  return value
    .replace(/[\[\]"']/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Returns the configured specs directories, validated and normalized. */
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

/** Convenience: alias for callers preferring the bash-style name. */
export const resolveSpecsDirs = getSpecsDirs;

/** First entry of `getSpecsDirs()` — used as the home for new specs. */
export function getDefaultDir(opts?: ResolverOptions): string {
  const dirs = getSpecsDirs(opts);
  // Non-empty by contract — `getSpecsDirs` always falls back to default.
  return normalizePath(dirs[0] ?? DEFAULT_SPECS_DIR);
}

export type FindSpecResult =
  | { ok: true; path: string }
  | { ok: false; reason: "not-found"; name: string }
  | { ok: false; reason: "ambiguous"; name: string; matches: string[] };

/**
 * Search every configured specs directory for a child folder named `name`.
 * Returns the serialized path (`<dir>/<name>` joined with **posix** seps so
 * it can be written into state files unchanged).
 *
 * Mirrors v6 exit codes: 0 → found, 1 → not found, 2 → ambiguous (≥2 hits).
 */
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
      // Serialized form uses POSIX separators for cross-platform stability.
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

/**
 * Read `<defaultDir>/.current-spec` and resolve it to a full (serialized)
 * spec path. A project-root `.current-spec` is accepted as a defensive
 * fallback because older/ambiguous quick-mode instructions occasionally wrote
 * the marker there. Returns `null` when the marker file is missing or empty —
 * v6 used exit code 1 for that case; TS callers branch on `=== null`.
 */
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
  // Strip ALL whitespace — matches `tr -d '[:space:]'` semantics.
  content = content.replace(/\s+/g, "");
  if (!content) {
    warn(".current-spec file is empty");
    return null;
  }

  const normalized = normalizePath(content);
  if (normalized.startsWith("./") || normalized.startsWith("../") || normalized.includes("/") || isAbsolute(normalized)) {
    return normalized;
  }
  // Bare name → prepend default dir using POSIX separators (serialized form).
  return posix.join(defaultDir, normalized);
}

export interface SpecEntry {
  name: string;
  /** Serialized path (POSIX separators) — safe to embed in state files. */
  path: string;
}

/** Enumerate every spec under every configured root. Hidden dirs skipped. */
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
