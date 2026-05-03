// src/hooks/lib/merge-state.ts
//
// CLI utility: deep-merge a JSON patch into a state file, atomically.
//
// Replacement for the v6 shell pattern:
//   jq '.fieldA.fieldB = "value"' state.json > tmp && mv tmp state.json
//
// Usage:
//   node merge-state.mjs <state-file> <json-patch>
//
// - Reads the existing state file (treats missing/empty as `{}`).
// - Parses the patch JSON string from argv[1].
// - Deep-merges (objects recurse; arrays/primitives replace whole).
// - Atomically writes the merged JSON back to the state file.
// - Prints the merged JSON to stdout so callers can pipe further.
//
// Spec: specs/cross-platform-support/design.md → "Lib utilities → merge-state".

import { readFileSync, existsSync } from "node:fs";
import { writeFileAtomic } from "../_shared/atomic-write.js";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function isPlainObject(v: unknown): v is { [key: string]: JsonValue } {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

/**
 * Deep-merge `patch` into `base`. Object keys recurse; arrays and primitives
 * replace whole. Returns a new value (does not mutate inputs).
 */
function deepMerge(base: JsonValue, patch: JsonValue): JsonValue {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch;
  }
  const out: { [key: string]: JsonValue } = { ...base };
  for (const [key, patchVal] of Object.entries(patch)) {
    const existing = out[key];
    if (existing !== undefined) {
      out[key] = deepMerge(existing, patchVal);
    } else {
      out[key] = patchVal;
    }
  }
  return out;
}

function main(): void {
  const args = process.argv.slice(2);
  const stateFile = args[0];
  const patchStr = args[1];
  if (stateFile === undefined || patchStr === undefined) {
    process.stderr.write(
      "usage: merge-state <state-file> <json-patch>\n",
    );
    process.exit(1);
  }

  let base: JsonValue = {};
  if (existsSync(stateFile)) {
    const raw = readFileSync(stateFile, "utf8").trim();
    if (raw.length > 0) {
      try {
        base = JSON.parse(raw) as JsonValue;
      } catch (err) {
        process.stderr.write(
          `merge-state: failed to parse state file ${stateFile}: ${
            (err as Error).message
          }\n`,
        );
        process.exit(1);
      }
    }
  }

  let patch: JsonValue;
  try {
    patch = JSON.parse(patchStr) as JsonValue;
  } catch (err) {
    process.stderr.write(
      `merge-state: failed to parse patch JSON: ${(err as Error).message}\n`,
    );
    process.exit(1);
  }

  const merged = deepMerge(base, patch);
  // Compact form: matches `jq -c` output style and keeps the file's keys
  // dense (Done-when grep `'"a":1'` depends on the no-space form).
  const serialized = JSON.stringify(merged) + "\n";
  writeFileAtomic(stateFile, serialized);
  process.stdout.write(serialized);
}

main();
