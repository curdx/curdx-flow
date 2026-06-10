import {
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

// Symlinks are skipped entirely to avoid traversal cycles.
function* walk(dir: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const dirent of entries) {
    if (dirent.isSymbolicLink()) continue;
    const abs = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      if (SKIP_DIRS.has(dirent.name)) continue;
      yield* walk(abs);
    } else if (dirent.isFile()) {
      yield abs;
    }
  }
}

function searchFile(
  file: string,
  re: RegExp,
  nameOnly: boolean,
  emit: (line: string) => void,
): boolean {
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    return false;
  }
  if (content.length === 0) return false;

  const lines = content.split("\n");
  let matched = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (re.test(line)) {
      matched = true;
      if (nameOnly) {
        emit(file);
        return true;
      }
      emit(`${file}:${i + 1}:${line}`);
    }
  }
  return matched;
}

function main(): void {
  const argv = process.argv.slice(2);
  const nameOnly = argv.includes("--name-only");
  const positional = argv.filter((a) => a !== "--name-only");

  if (positional.length < 2) {
    process.stderr.write(
      "usage: search-files <pattern> <root> [--name-only]\n",
    );
    process.exit(1);
  }

  const pattern = positional[0];
  const rootArg = positional[1];
  if (pattern === undefined || rootArg === undefined) {
    process.stderr.write(
      "usage: search-files <pattern> <root> [--name-only]\n",
    );
    process.exit(1);
  }

  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch (err) {
    process.stderr.write(
      `search-files: invalid regex: ${(err as Error).message}\n`,
    );
    process.exit(1);
  }

  const root = path.resolve(process.cwd(), rootArg);
  let st;
  try {
    st = statSync(root);
  } catch (err) {
    process.stderr.write(
      `search-files: cannot stat ${rootArg}: ${(err as Error).message}\n`,
    );
    process.exit(1);
  }

  const emit = (s: string): void => {
    process.stdout.write(s + "\n");
  };

  if (st.isFile()) {
    searchFile(root, re, nameOnly, emit);
  } else if (st.isDirectory()) {
    for (const file of walk(root)) {
      searchFile(file, re, nameOnly, emit);
    }
  } else {
    process.stderr.write(
      `search-files: ${rootArg} is neither a file nor a directory\n`,
    );
    process.exit(1);
  }
}

main();
