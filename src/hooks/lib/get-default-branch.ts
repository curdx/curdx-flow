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
  const symRef = tryGit([
    "symbolic-ref",
    "--short",
    "refs/remotes/origin/HEAD",
  ]);
  if (symRef && symRef.length > 0) {
    return stripOriginPrefix(symRef);
  }

  if (
    tryGit(["show-ref", "--verify", "--quiet", "refs/remotes/origin/main"]) !==
    null
  ) {
    return "main";
  }

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
