// src/hooks/lib/init-execution-state.ts
//
// CLI utility: copy `.curdx-state.template.json` into a spec directory as
// `.curdx-state.json`, idempotent unless `--force` is passed.
//
// Replacement for the v6 shell pattern: `cp templates/.curdx-state.template.json
// "$SPEC_DIR/.curdx-state.json"`. Falls back to an embedded default template
// if the project-relative template is missing.
//
// Usage:
//   node init-execution-state.mjs <spec-dir> [--force]
//
// - Refuses to overwrite an existing `.curdx-state.json` unless `--force`.
// - Atomically writes the template to the target.
// - Prints the absolute path of the written file on stdout.

import { readFileSync, existsSync } from "node:fs";
import { join, isAbsolute, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "../_shared/atomic-write.js";

const EMBEDDED_TEMPLATE = {
  phase: "execution",
  taskIndex: 0,
  totalTasks: 0,
  taskIteration: 1,
  maxTaskIterations: 5,
  globalIteration: 1,
  maxGlobalIterations: 30,
  recoveryMode: false,
  fixTaskMap: {},
  modificationMap: {},
  nativeTaskMap: {},
  nativeSyncEnabled: true,
  nativeSyncFailureCount: 0,
  completed: false,
};

function loadTemplate(): string {
  // 1. Project-relative: plugins/curdx-flow/templates/.curdx-state.template.json
  const cwdPath = join(
    process.cwd(),
    "plugins",
    "curdx-flow",
    "templates",
    ".curdx-state.template.json",
  );
  if (existsSync(cwdPath)) {
    return readFileSync(cwdPath, "utf8");
  }
  // 2. Adjacent to the bundle: __dirname/../../templates/...
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const adjacent = resolve(here, "..", "..", "templates", ".curdx-state.template.json");
    if (existsSync(adjacent)) {
      return readFileSync(adjacent, "utf8");
    }
  } catch {
    // import.meta.url may not be available in some contexts; fall through.
  }
  // 3. Embedded fallback.
  return JSON.stringify(EMBEDDED_TEMPLATE) + "\n";
}

function main(): void {
  const args = process.argv.slice(2);
  const specDir = args[0];
  const force = args.includes("--force");
  if (specDir === undefined || specDir.startsWith("--")) {
    process.stderr.write("usage: init-execution-state <spec-dir> [--force]\n");
    process.exit(1);
  }

  const absSpecDir = isAbsolute(specDir) ? specDir : resolve(process.cwd(), specDir);
  const target = join(absSpecDir, ".curdx-state.json");

  if (existsSync(target) && !force) {
    process.stderr.write(
      `init-execution-state: ${target} already exists; pass --force to overwrite\n`,
    );
    process.exit(1);
  }

  const tpl = loadTemplate();
  writeFileAtomic(target, tpl);
  process.stdout.write(target + "\n");
}

main();
