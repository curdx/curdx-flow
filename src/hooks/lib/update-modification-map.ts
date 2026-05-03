// src/hooks/lib/update-modification-map.ts
//
// CLI utility: maintain `.file-modifications.json` (taskId → list of files).
//
// Replacement for the v6 shell pattern that used a JSON query tool to append
// modified files to a per-task list inside the spec dir.
//
// Usage:
//   node update-modification-map.mjs <state-file-or-spec-dir> <taskId> <file1> [file2 ...]
//
// - If arg1 ends in `.json`, treat as the state file path.
// - Otherwise treat as a spec dir and use `<spec-dir>/.file-modifications.json`.
// - Loads existing JSON (defaults to `{}` when missing/empty).
// - Sets data[taskId] = unique([...existing, ...files]).
// - Atomically writes the result back.
// - Prints compact JSON of the updated entry on stdout.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../_shared/atomic-write.js";

function main(): void {
  const args = process.argv.slice(2);
  const target = args[0];
  const taskId = args[1];
  const files = args.slice(2);
  if (target === undefined || taskId === undefined || files.length === 0) {
    process.stderr.write(
      "usage: update-modification-map <state-file-or-spec-dir> <taskId> <file1> [file2 ...]\n",
    );
    process.exit(1);
  }

  const statePath = target.endsWith(".json")
    ? target
    : join(target, ".file-modifications.json");

  let data: Record<string, string[]> = {};
  if (existsSync(statePath)) {
    const raw = readFileSync(statePath, "utf8").trim();
    if (raw.length > 0) {
      try {
        data = JSON.parse(raw) as Record<string, string[]>;
      } catch (err) {
        process.stderr.write(
          `update-modification-map: failed to parse ${statePath}: ${(err as Error).message}\n`,
        );
        process.exit(1);
      }
    }
  }

  const existing = Array.isArray(data[taskId]) ? data[taskId] : [];
  const merged = Array.from(new Set([...existing, ...files]));
  data[taskId] = merged;

  writeFileAtomic(statePath, JSON.stringify(data) + "\n");
  process.stdout.write(JSON.stringify({ [taskId]: merged }) + "\n");
}

main();
