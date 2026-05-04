// src/hooks/lib/merge-state.ts
//
// CLI utility: deep-merge a JSON patch into a state file, atomically.
//
// Replacement for the v6 shell pattern that did `<query-tool> '.fieldA.fieldB =
// "value"' state.json > tmp && mv tmp state.json` — i.e. parse JSON, mutate a
// nested field, write atomically.
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

/**
 * Return a shallow copy of `patch` with the reserved `$unset` key removed.
 * Used so deepMerge does not see `$unset` as a regular field. If `patch` is
 * not a plain object, returns it unchanged.
 */
function stripUnset(patch: JsonValue): JsonValue {
  if (!isPlainObject(patch)) return patch;
  const { $unset: _drop, ...rest } = patch as { [key: string]: JsonValue };
  return rest as JsonValue;
}

/**
 * Apply MongoDB-style `$unset` semantics: read `patch.$unset` (string[]) and
 * `delete` each listed key from `target` at the root level only (no recursion).
 * Validates shape — non-array or non-string elements exit 1 with stderr.
 * Returns `target` unchanged when `$unset` is absent.
 */
function applyUnset(target: JsonValue, patch: JsonValue): JsonValue {
  if (!isPlainObject(target) || !isPlainObject(patch)) return target;
  const unsetVal = patch["$unset"];
  if (unsetVal === undefined) return target;
  if (
    !Array.isArray(unsetVal) ||
    !unsetVal.every((k) => typeof k === "string")
  ) {
    process.stderr.write("merge-state: $unset must be string[]\n");
    process.exit(1);
  }
  const out: { [key: string]: JsonValue } = { ...target };
  for (const key of unsetVal as string[]) delete out[key];
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

  const cleanPatch = stripUnset(patch);
  let merged = deepMerge(base, cleanPatch);
  merged = applyUnset(merged, patch);
  // Compact form (no whitespace between tokens) keeps the file's keys dense
  // and matches the verify gate `grep '"a":1'` (no-space-after-colon).
  const serialized = JSON.stringify(merged) + "\n";
  writeFileAtomic(stateFile, serialized);
  process.stdout.write(serialized);
}

main();
