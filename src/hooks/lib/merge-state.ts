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
 * `delete` each listed path from `target`. Each path is either a plain root key
 * (e.g. `"completedAt"`) or a dot-separated nested path
 * (e.g. `"verificationBlocks.research"`) — the latter walks the object,
 * cloning containers along the way (immutability), and deletes only the leaf.
 * Sibling keys at every level are untouched: `$unset:["verificationBlocks.research"]`
 * removes ONLY the `research` block and leaves `verificationBlocks.execution`,
 * `.tasks`, etc. intact (design.md L216 contract).
 *
 * Path semantics:
 * - Each segment must be a string key on a plain object; if any intermediate
 *   segment is missing or non-object, the unset is a silent no-op for that path.
 * - Arrays and primitives along the path are not traversed (no array index).
 *
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
  let out: { [key: string]: JsonValue } = { ...target };
  for (const rawPath of unsetVal as string[]) {
    const segments = rawPath.split(".");
    if (segments.length === 1) {
      // Root-level key: classic $unset behavior.
      delete out[segments[0]!];
      continue;
    }
    // Nested dot-path (e.g. "verificationBlocks.research"): walk + clone +
    // delete leaf. Siblings at every depth are preserved by spread copies.
    out = unsetNested(out, segments);
  }
  return out;
}

/**
 * Walk `root` along `segments`, returning a new object identical to `root`
 * except that the leaf segment has been deleted from its (cloned) parent.
 * Intermediate non-object segments are a silent no-op (returns `root`
 * structurally unchanged, but with shallow clone). Pure / non-mutating.
 */
function unsetNested(
  root: { [key: string]: JsonValue },
  segments: string[],
): { [key: string]: JsonValue } {
  const head = segments[0]!;
  const rest = segments.slice(1);
  const child = root[head];
  if (rest.length === 0) {
    const next = { ...root };
    delete next[head];
    return next;
  }
  if (!isPlainObject(child)) {
    // Path dives into a non-object — silent no-op for this path.
    return root;
  }
  const nextChild = unsetNested(child, rest);
  // Reference-equal child means nothing changed downstream; bubble up unchanged.
  if (nextChild === child) return root;
  return { ...root, [head]: nextChild };
}

/**
 * Hand-rolled field-presence validator for `verificationBlocks` (no Ajv —
 * tasks-phase decision: don't add a runtime dep). Runs ONLY when the patch
 * carries a `verificationBlocks` key, so existing flows (no verificationBlocks
 * patch) take no perf hit.
 *
 * For each phase entry present in `merged.verificationBlocks`, asserts the 4
 * required fields are present with the right types:
 *   - command:  non-empty string
 *   - exitCode: integer (Number.isInteger)
 *   - timestamp: string parseable by Date.parse
 *   - srcMtime: non-negative finite number
 *
 * Throws an actionable Error on the first violation. Optional fields
 * (`description`, `failedReason`) are not type-checked; unknown extra fields
 * are tolerated (schema-level enforcement lives in spec.schema.json).
 *
 * Mirrors the schema definition in
 * `plugins/curdx-flow/schemas/spec.schema.json#/$defs/verificationBlock`.
 */
function validateVerificationBlocks(merged: JsonValue): void {
  if (!isPlainObject(merged)) return;
  const blocks = merged["verificationBlocks"];
  if (blocks === undefined || blocks === null) return;
  if (!isPlainObject(blocks)) {
    throw new Error(
      "invalid verificationBlocks: expected object map keyed by phase, got " +
        (Array.isArray(blocks) ? "array" : typeof blocks),
    );
  }
  for (const [phase, block] of Object.entries(blocks)) {
    if (!isPlainObject(block)) {
      throw new Error(
        `invalid verificationBlocks.${phase}: expected object, got ${
          Array.isArray(block) ? "array" : typeof block
        }`,
      );
    }
    const cmd = block["command"];
    if (typeof cmd !== "string" || cmd.length === 0) {
      throw new Error(
        `invalid verificationBlocks.${phase}: missing/wrong-type field "command" (expected non-empty string)`,
      );
    }
    const exitCode = block["exitCode"];
    if (typeof exitCode !== "number" || !Number.isInteger(exitCode)) {
      throw new Error(
        `invalid verificationBlocks.${phase}: missing/wrong-type field "exitCode" (expected integer)`,
      );
    }
    const ts = block["timestamp"];
    if (typeof ts !== "string" || Number.isNaN(Date.parse(ts))) {
      throw new Error(
        `invalid verificationBlocks.${phase}: missing/wrong-type field "timestamp" (expected ISO date-time string)`,
      );
    }
    const srcMtime = block["srcMtime"];
    if (
      typeof srcMtime !== "number" ||
      !Number.isFinite(srcMtime) ||
      srcMtime < 0
    ) {
      throw new Error(
        `invalid verificationBlocks.${phase}: missing/wrong-type field "srcMtime" (expected non-negative number)`,
      );
    }
  }
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

  // Verify-on-write gate: when the patch touches `verificationBlocks`, hand-
  // validate the merged result before the atomic write so we never persist a
  // malformed block (NFR-3 actionable errors, no Ajv runtime dep). Only fires
  // when the patch actually carries `verificationBlocks` to keep existing
  // flows (state-completion-marker writes, taskIndex bumps, etc.) zero-cost.
  // `$unset` of a single phase (e.g. `["verificationBlocks.research"]`) leaves
  // siblings intact (see applyUnset / unsetNested above), so the resulting
  // `verificationBlocks` object — if any phase entries remain — is re-validated
  // here too, catching writes that delete one phase but introduce a malformed
  // one in the same patch.
  const patchTouchesVerificationBlocks =
    isPlainObject(patch) &&
    (Object.prototype.hasOwnProperty.call(patch, "verificationBlocks") ||
      (Array.isArray((patch as { [key: string]: JsonValue })["$unset"]) &&
        (
          (patch as { [key: string]: JsonValue })["$unset"] as JsonValue[]
        ).some(
          (p) => typeof p === "string" && p.startsWith("verificationBlocks"),
        )));
  if (patchTouchesVerificationBlocks) {
    try {
      validateVerificationBlocks(merged);
    } catch (err) {
      process.stderr.write(`merge-state: ${(err as Error).message}\n`);
      process.exit(1);
    }
  }

  // Compact form (no whitespace between tokens) keeps the file's keys dense
  // and matches the verify gate `grep '"a":1'` (no-space-after-colon).
  const serialized = JSON.stringify(merged) + "\n";
  writeFileAtomic(stateFile, serialized);
  process.stdout.write(serialized);
}

main();
