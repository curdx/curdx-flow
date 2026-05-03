import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/lib/cleanup-files.ts
import {
  existsSync,
  readdirSync,
  statSync,
  unlinkSync
} from "node:fs";
import path from "node:path";
function globToRegExp(pattern) {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === void 0) continue;
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
function hasGlobMeta(pattern) {
  return /[*?]/.test(pattern);
}
function* walk(root, dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (err) {
    process.stderr.write(
      `cleanup-files: failed to read ${dir}: ${err.message}
`
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
function expandPattern(pattern, cwd) {
  if (!hasGlobMeta(pattern)) {
    const abs = path.resolve(cwd, pattern);
    return existsSync(abs) ? [pattern] : [];
  }
  const re = globToRegExp(pattern);
  const matches = [];
  for (const rel of walk(cwd, cwd)) {
    if (re.test(rel)) matches.push(rel);
  }
  return matches;
}
function isSafePattern(pattern) {
  if (pattern.length === 0) return false;
  if (path.isAbsolute(pattern)) return false;
  const segs = pattern.split(/[\\/]/);
  if (segs.includes("..")) return false;
  return true;
}
function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const patterns = argv.filter((a) => a !== "--dry-run");
  if (patterns.length === 0) {
    process.stderr.write(
      "usage: cleanup-files [--dry-run] <pattern> [<pattern> ...]\n"
    );
    process.exit(1);
  }
  const cwd = process.cwd();
  for (const pattern of patterns) {
    if (!isSafePattern(pattern)) {
      process.stderr.write(
        `cleanup-files: refusing unsafe pattern (absolute or contains '..'): ${pattern}
`
      );
      continue;
    }
    const matches = expandPattern(pattern, cwd);
    if (dryRun) {
      for (const m of matches) {
        process.stdout.write(`  ${m}
`);
      }
      process.stdout.write(
        `cleanup: ${pattern} \u2192 ${matches.length} match(es) (dry-run)
`
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
        const e = err;
        if (e.code === "ENOENT") {
          continue;
        }
        process.stderr.write(
          `cleanup-files: failed to remove ${m}: ${e.message}
`
        );
      }
    }
    process.stdout.write(
      `cleanup: ${pattern} \u2192 ${removed} file(s) removed
`
    );
  }
}
main();
//# sourceMappingURL=cleanup-files.mjs.map
