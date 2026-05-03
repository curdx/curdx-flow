import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/lib/get-default-branch.ts
import { execFileSync } from "node:child_process";
function tryGit(args) {
  try {
    const out = execFileSync("git", args, {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8"
    });
    return out.toString().trim();
  } catch {
    return null;
  }
}
function stripOriginPrefix(ref) {
  return ref.startsWith("origin/") ? ref.slice("origin/".length) : ref;
}
function resolveDefaultBranch() {
  const symRef = tryGit([
    "symbolic-ref",
    "--short",
    "refs/remotes/origin/HEAD"
  ]);
  if (symRef && symRef.length > 0) {
    return stripOriginPrefix(symRef);
  }
  if (tryGit(["show-ref", "--verify", "--quiet", "refs/remotes/origin/main"]) !== null) {
    return "main";
  }
  if (tryGit([
    "show-ref",
    "--verify",
    "--quiet",
    "refs/remotes/origin/master"
  ]) !== null) {
    return "master";
  }
  const allRemotes = tryGit([
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/remotes/origin/"
  ]);
  if (allRemotes && allRemotes.length > 0) {
    const first = allRemotes.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0 && !s.endsWith("/HEAD"))[0];
    if (first !== void 0) {
      return stripOriginPrefix(first);
    }
  }
  return null;
}
function main() {
  const branch = resolveDefaultBranch();
  if (branch === null) {
    process.stderr.write(
      "get-default-branch: unable to determine default branch\n"
    );
    process.exit(1);
  }
  process.stdout.write(branch + "\n");
}
main();
//# sourceMappingURL=get-default-branch.mjs.map
