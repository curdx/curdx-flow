import {
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";

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

function hasGlobMeta(pattern: string): boolean {
  return /[*?]/.test(pattern);
}

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

// Refuse anything that escapes CWD: absolute paths or `..` segments.
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
