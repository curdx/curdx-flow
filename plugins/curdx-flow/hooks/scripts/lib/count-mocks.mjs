import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/lib/count-mocks.ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
var TEST_FILE_RE = /\.(test|spec)\.(t|j)sx?$/;
var MOCK_USAGE_RE = /\b(?:vi|jest)\.mock\s*\(|\bmock\.fn\s*\(|\b(?:vi|jest)\.fn\s*\(/g;
var SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", "dist", ".git", "coverage"]);
function* walkTests(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (err) {
    process.stderr.write(
      `count-mocks: failed to read ${dir}: ${err.message}
`
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
function countMocksInFile(file) {
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    process.stderr.write(
      `count-mocks: failed to read ${file}: ${err.message}
`
    );
    return 0;
  }
  const matches = raw.match(MOCK_USAGE_RE);
  return matches ? matches.length : 0;
}
function main() {
  const args = process.argv.slice(2);
  const rootArg = args[0];
  const root = rootArg === void 0 ? process.cwd() : rootArg;
  let tests = 0;
  let mockUsages = 0;
  try {
    const st = statSync(root);
    if (!st.isDirectory()) {
      process.stderr.write(`count-mocks: not a directory: ${root}
`);
      process.exit(1);
    }
  } catch (err) {
    process.stderr.write(
      `count-mocks: cannot stat ${root}: ${err.message}
`
    );
    process.exit(1);
  }
  for (const file of walkTests(root)) {
    tests++;
    mockUsages += countMocksInFile(file);
  }
  const ratio = tests > 0 ? mockUsages / tests : 0;
  process.stdout.write(
    JSON.stringify({ tests, mockUsages, ratio }) + "\n"
  );
}
main();
//# sourceMappingURL=count-mocks.mjs.map
