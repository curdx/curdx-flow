// src/hooks/lib/get-default-branch.ts
//
// CLI utility: print the repository's default branch name (cross-platform).
//
// Replacement for the v6 shell pattern:
//   default_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null \
//     | sed 's@^refs/remotes/origin/@@')
//   default_branch=${default_branch:-main}
//
// Usage:
//   node get-default-branch.mjs
//
// Fallback chain:
//   1. `git symbolic-ref --short refs/remotes/origin/HEAD` (strip leading "origin/")
//   2. origin/main exists → "main"
//   3. origin/master exists → "master"
//   4. First remote branch under refs/remotes/origin/ (strip "origin/")
//   5. Exit 1 with stderr message
//
// Spec: specs/cross-platform-support/design.md → "Lib utilities → get-default-branch".
// Requirement: FR-10.
//
// Cross-platform note: uses execFileSync with stdio piped, so the function works
// identically on macOS / Linux / Windows. No shell pipes, no `sed`, no `head`.

import { execFileSync } from "node:child_process";

function tryGit(args: string[]): string | null {
  try {
    const out = execFileSync("git", args, {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    return out.toString().trim();
  } catch {
    return null;
  }
}

function stripOriginPrefix(ref: string): string {
  return ref.startsWith("origin/") ? ref.slice("origin/".length) : ref;
}

function resolveDefaultBranch(): string | null {
  // 1. origin/HEAD symbolic ref (the canonical way)
  const symRef = tryGit([
    "symbolic-ref",
    "--short",
    "refs/remotes/origin/HEAD",
  ]);
  if (symRef && symRef.length > 0) {
    return stripOriginPrefix(symRef);
  }

  // 2. origin/main exists
  if (
    tryGit(["show-ref", "--verify", "--quiet", "refs/remotes/origin/main"]) !==
    null
  ) {
    return "main";
  }

  // 3. origin/master exists
  if (
    tryGit([
      "show-ref",
      "--verify",
      "--quiet",
      "refs/remotes/origin/master",
    ]) !== null
  ) {
    return "master";
  }

  // 4. First remote branch under refs/remotes/origin/
  const allRemotes = tryGit([
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/remotes/origin/",
  ]);
  if (allRemotes && allRemotes.length > 0) {
    const first = allRemotes
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.endsWith("/HEAD"))[0];
    if (first !== undefined) {
      return stripOriginPrefix(first);
    }
  }

  return null;
}

function main(): void {
  const branch = resolveDefaultBranch();
  if (branch === null) {
    process.stderr.write(
      "get-default-branch: unable to determine default branch\n",
    );
    process.exit(1);
  }
  process.stdout.write(branch + "\n");
}

main();
