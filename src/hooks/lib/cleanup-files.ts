// src/hooks/lib/cleanup-files.ts
//
// CLI utility: glob-match patterns under CWD and unlink matching files.
//
// Replacement for the v6 shell pattern:
//   rm -f mocks/* tmp/scaffold-*.json
//
// Usage:
//   node cleanup-files.mjs [--dry-run] <pattern1> [<pattern2> ...]
//
// - Patterns are CWD-relative shell-style globs (`*`, `**`, `?`).
// - Idempotent: missing files are silently skipped (ENOENT only).
// - Best-effort: non-ENOENT errors are logged to stderr but don't abort.
// - --dry-run lists matches without unlinking.
// - Refuses absolute paths and `..` traversal (stderr-warn, skip).
// - Prints `cleanup: <pattern> → N file(s) removed` per pattern (or
//   `→ N match(es) (dry-run)` when --dry-run).
//
// Spec: specs/cross-platform-support/design.md → "Lib utilities → cleanup-files".

import {
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";

/**
 * Convert a shell-style glob pattern into a RegExp anchored to the full
 * normalized POSIX path. Supports:
 *   - `**`  → cross-segment wildcard (`.*`)
 *   - `*`   → single-segment wildcard (`[^/]*`)
 *   - `?`   → single non-slash char (`[^/]`)
 *   - all other regex specials are escaped literally.
 */
function globToRegExp(pattern: string): RegExp {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === undefined) continue;
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        re += ".*";
        i++;
      } else {
        re += "[^/]*";
      }
    } else if (ch === "?") {
      re += "[^/]";
    } else if (/[.+^${}()|[\]\\]/.test(ch)) {
      re += "\\" + ch;
    } else {
      re += ch;
    }
  }
  return new RegExp("^" + re + "$");
}

/** True if the pattern contains any glob meta-characters. */
function hasGlobMeta(pattern: string): boolean {
  return /[*?]/.test(pattern);
}

/**
 * Recursively walk `dir`, yielding POSIX-normalized paths relative to `root`
 * for every regular file encountered. Symlinks and other non-files are
 * skipped. Errors during traversal of individual entries are logged to
 * stderr and the walk continues.
 */
function* walk(root: string, dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    process.stderr.write(
      `cleanup-files: failed to read ${dir}: ${(err as Error).message}\n`,
    );
    return;
  }
  for (const name of entries) {
    const abs = path.join(dir, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      yield* walk(root, abs);
    } else if (st.isFile()) {
      const rel = path.relative(root, abs).split(path.sep).join("/");
      yield rel;
    }
  }
}

/**
 * Resolve a single pattern to a list of matching CWD-relative file paths.
 * Literal patterns short-circuit to existsSync. Glob patterns walk the tree
 * and filter by RegExp.
 */
function expandPattern(pattern: string, cwd: string): string[] {
  if (!hasGlobMeta(pattern)) {
    const abs = path.resolve(cwd, pattern);
    return existsSync(abs) ? [pattern] : [];
  }
  const re = globToRegExp(pattern);
  const matches: string[] = [];
  for (const rel of walk(cwd, cwd)) {
    if (re.test(rel)) matches.push(rel);
  }
  return matches;
}

/**
 * Refuse anything that escapes CWD: absolute paths or `..` segments.
 * Returns true if the pattern is safe to expand.
 */
function isSafePattern(pattern: string): boolean {
  if (pattern.length === 0) return false;
  if (path.isAbsolute(pattern)) return false;
  const segs = pattern.split(/[\\/]/);
  if (segs.includes("..")) return false;
  return true;
}

function main(): void {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const patterns = argv.filter((a) => a !== "--dry-run");

  if (patterns.length === 0) {
    process.stderr.write(
      "usage: cleanup-files [--dry-run] <pattern> [<pattern> ...]\n",
    );
    process.exit(1);
  }

  const cwd = process.cwd();

  for (const pattern of patterns) {
    if (!isSafePattern(pattern)) {
      process.stderr.write(
        `cleanup-files: refusing unsafe pattern (absolute or contains '..'): ${pattern}\n`,
      );
      continue;
    }

    const matches = expandPattern(pattern, cwd);

    if (dryRun) {
      for (const m of matches) {
        process.stdout.write(`  ${m}\n`);
      }
      process.stdout.write(
        `cleanup: ${pattern} → ${matches.length} match(es) (dry-run)\n`,
      );
      continue;
    }

    let removed = 0;
    for (const m of matches) {
      const abs = path.resolve(cwd, m);
      try {
        unlinkSync(abs);
        removed++;
      } catch (err) {
        const e = err as NodeJS.ErrnoException;
        if (e.code === "ENOENT") {
          // idempotent: already gone
          continue;
        }
        process.stderr.write(
          `cleanup-files: failed to remove ${m}: ${e.message}\n`,
        );
      }
    }
    process.stdout.write(
      `cleanup: ${pattern} → ${removed} file(s) removed\n`,
    );
  }
}

main();
