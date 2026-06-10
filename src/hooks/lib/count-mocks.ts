import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const TEST_FILE_RE = /\.(test|spec)\.(t|j)sx?$/;
const MOCK_USAGE_RE =
  /\b(?:vi|jest)\.mock\s*\(|\bmock\.fn\s*\(|\b(?:vi|jest)\.fn\s*\(/g;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "coverage"]);

function* walkTests(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    process.stderr.write(
      `count-mocks: failed to read ${dir}: ${(err as Error).message}\n`,
    );
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = path.join(dir, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      yield* walkTests(abs);
    } else if (st.isFile() && TEST_FILE_RE.test(name)) {
      yield abs;
    }
  }
}

function countMocksInFile(file: string): number {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    process.stderr.write(
      `count-mocks: failed to read ${file}: ${(err as Error).message}\n`,
    );
    return 0;
  }
  const matches = raw.match(MOCK_USAGE_RE);
  return matches ? matches.length : 0;
}

function main(): void {
  const args = process.argv.slice(2);
  const rootArg = args[0];
  const root = rootArg === undefined ? process.cwd() : rootArg;

  let tests = 0;
  let mockUsages = 0;

  try {
    const st = statSync(root);
    if (!st.isDirectory()) {
      process.stderr.write(`count-mocks: not a directory: ${root}\n`);
      process.exit(1);
    }
  } catch (err) {
    process.stderr.write(
      `count-mocks: cannot stat ${root}: ${(err as Error).message}\n`,
    );
    process.exit(1);
  }

  for (const file of walkTests(root)) {
    tests++;
    mockUsages += countMocksInFile(file);
  }

  const ratio = tests > 0 ? mockUsages / tests : 0;
  process.stdout.write(
    JSON.stringify({ tests, mockUsages, ratio }) + "\n",
  );
}

main();
