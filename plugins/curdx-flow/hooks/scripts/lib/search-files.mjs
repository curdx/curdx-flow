import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/lib/search-files.ts
import {
  readdirSync,
  readFileSync,
  statSync
} from "node:fs";
import path from "node:path";
var SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", "dist", ".git"]);
function* walk(dir) {
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
function searchFile(file, re, nameOnly, emit) {
  let content;
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
    if (line === void 0) continue;
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
function main() {
  const argv = process.argv.slice(2);
  const nameOnly = argv.includes("--name-only");
  const positional = argv.filter((a) => a !== "--name-only");
  if (positional.length < 2) {
    process.stderr.write(
      "usage: search-files <pattern> <root> [--name-only]\n"
    );
    process.exit(1);
  }
  const pattern = positional[0];
  const rootArg = positional[1];
  if (pattern === void 0 || rootArg === void 0) {
    process.stderr.write(
      "usage: search-files <pattern> <root> [--name-only]\n"
    );
    process.exit(1);
  }
  let re;
  try {
    re = new RegExp(pattern);
  } catch (err) {
    process.stderr.write(
      `search-files: invalid regex: ${err.message}
`
    );
    process.exit(1);
  }
  const root = path.resolve(process.cwd(), rootArg);
  let st;
  try {
    st = statSync(root);
  } catch (err) {
    process.stderr.write(
      `search-files: cannot stat ${rootArg}: ${err.message}
`
    );
    process.exit(1);
  }
  const emit = (s) => {
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
      `search-files: ${rootArg} is neither a file nor a directory
`
    );
    process.exit(1);
  }
}
main();
//# sourceMappingURL=search-files.mjs.map
