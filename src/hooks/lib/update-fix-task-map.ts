// src/hooks/lib/update-fix-task-map.ts
//
// CLI utility: maintain `fixTaskMap` inside `.curdx-state.json`.
//
// Tracks fix-tasks created in response to a failing original task. Records the
// fix id, an optional reason, the running count, and the maximum nesting depth
// (extra dot-segments compared with the original task id).
//
// Usage:
//   node update-fix-task-map.mjs <state-file> <originalTaskId> <fixTaskId> [<reason>]
//
// - Loads the state file (defaults to `{}` when missing/empty).
// - Mutates state.fixTaskMap[originalTaskId]:
//     { count, depth, fixes: [{ id, reason }, ...] }
// - Atomically writes the result back.
// - Prints compact JSON of the updated entry on stdout.

import { readFileSync, existsSync } from "node:fs";
import { writeFileAtomic } from "../_shared/atomic-write.js";

interface FixEntry {
  id: string;
  reason: string;
}

interface FixTaskMapEntry {
  count: number;
  depth: number;
  fixes: FixEntry[];
}

interface State {
  fixTaskMap?: Record<string, FixTaskMapEntry>;
  [key: string]: unknown;
}

function dotsIn(s: string): number {
  let n = 0;
  for (const ch of s) if (ch === ".") n++;
  return n;
}

function main(): void {
  const args = process.argv.slice(2);
  const stateFile = args[0];
  const originalId = args[1];
  const fixId = args[2];
  const reason = args[3] ?? "";
  if (stateFile === undefined || originalId === undefined || fixId === undefined) {
    process.stderr.write(
      "usage: update-fix-task-map <state-file> <originalTaskId> <fixTaskId> [<reason>]\n",
    );
    process.exit(1);
  }

  let state: State = {};
  if (existsSync(stateFile)) {
    const raw = readFileSync(stateFile, "utf8").trim();
    if (raw.length > 0) {
      try {
        state = JSON.parse(raw) as State;
      } catch (err) {
        process.stderr.write(
          `update-fix-task-map: failed to parse ${stateFile}: ${(err as Error).message}\n`,
        );
        process.exit(1);
      }
    }
  }

  const map = state.fixTaskMap ?? {};
  const entry: FixTaskMapEntry = map[originalId] ?? { count: 0, depth: 0, fixes: [] };
  entry.fixes.push({ id: fixId, reason });
  entry.count += 1;
  const newDepth = dotsIn(fixId) - dotsIn(originalId);
  if (newDepth > entry.depth) entry.depth = newDepth;
  map[originalId] = entry;
  state.fixTaskMap = map;

  writeFileAtomic(stateFile, JSON.stringify(state) + "\n");
  process.stdout.write(JSON.stringify({ [originalId]: entry }) + "\n");
}

main();
