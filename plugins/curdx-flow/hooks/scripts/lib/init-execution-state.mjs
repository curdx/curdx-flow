import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/lib/init-execution-state.ts
import { readFileSync, existsSync } from "node:fs";
import { join, isAbsolute, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// src/hooks/_shared/atomic-write.ts
import { writeFileSync, renameSync } from "node:fs";
import { randomBytes } from "node:crypto";
function writeFileAtomic(path, data) {
  const tmp = `${path}.tmp.${process.pid}.${randomBytes(6).toString("hex")}`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

// src/hooks/lib/init-execution-state.ts
var EMBEDDED_TEMPLATE = {
  phase: "execution",
  taskIndex: 0,
  totalTasks: 0,
  taskIteration: 1,
  maxTaskIterations: 5,
  globalIteration: 1,
  maxGlobalIterations: 100,
  recoveryMode: false,
  fixTaskMap: {},
  modificationMap: {},
  nativeTaskMap: {},
  nativeSyncEnabled: true,
  nativeSyncFailureCount: 0
};
function loadTemplate() {
  const cwdPath = join(
    process.cwd(),
    "plugins",
    "curdx-flow",
    "templates",
    ".curdx-state.template.json"
  );
  if (existsSync(cwdPath)) {
    return readFileSync(cwdPath, "utf8");
  }
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const adjacent = resolve(here, "..", "..", "templates", ".curdx-state.template.json");
    if (existsSync(adjacent)) {
      return readFileSync(adjacent, "utf8");
    }
  } catch {
  }
  return JSON.stringify(EMBEDDED_TEMPLATE) + "\n";
}
function main() {
  const args = process.argv.slice(2);
  const specDir = args[0];
  const force = args.includes("--force");
  if (specDir === void 0 || specDir.startsWith("--")) {
    process.stderr.write("usage: init-execution-state <spec-dir> [--force]\n");
    process.exit(1);
  }
  const absSpecDir = isAbsolute(specDir) ? specDir : resolve(process.cwd(), specDir);
  const target = join(absSpecDir, ".curdx-state.json");
  if (existsSync(target) && !force) {
    process.stderr.write(
      `init-execution-state: ${target} already exists; pass --force to overwrite
`
    );
    process.exit(1);
  }
  const tpl = loadTemplate();
  writeFileAtomic(target, tpl);
  process.stdout.write(target + "\n");
}
main();
//# sourceMappingURL=init-execution-state.mjs.map
