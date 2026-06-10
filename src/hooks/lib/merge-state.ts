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

// Object keys recurse; arrays and primitives replace whole.
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

function stripUnset(patch: JsonValue): JsonValue {
  if (!isPlainObject(patch)) return patch;
  const { $unset: _drop, ...rest } = patch as { [key: string]: JsonValue };
  return rest as JsonValue;
}

/**
 * `$unset` paths are root keys or dot-separated nested paths; deleting a
 * nested leaf must preserve sibling keys at every level. Missing or
 * non-object intermediate segments are a silent no-op for that path.
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
      delete out[segments[0]!];
      continue;
    }
    out = unsetNested(out, segments);
  }
  return out;
}

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
    return root;
  }
  const nextChild = unsetNested(child, rest);
  if (nextChild === child) return root;
  return { ...root, [head]: nextChild };
}

/**
 * Hand-rolled validator — no Ajv runtime dep by design. Unknown extra fields
 * are tolerated; the canonical schema lives in
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

function patchSetsCompletedTrue(patch: JsonValue): boolean {
  return isPlainObject(patch) && patch["completed"] === true;
}

function isQuickOrLiteSpecState(merged: JsonValue): boolean {
  if (!isPlainObject(merged)) return false;
  if (merged["quickMode"] === true) return true;

  const autoPolicy = merged["autoPolicy"];
  if (isPlainObject(autoPolicy) && autoPolicy["executionMode"] === "spec-lite") {
    return true;
  }

  const route = merged["route"];
  return isPlainObject(route) && route["route"] === "lite-spec";
}

function validateCompletionHasExecutionVerification(merged: JsonValue, patch: JsonValue): void {
  if (!patchSetsCompletedTrue(patch) || !isQuickOrLiteSpecState(merged)) return;
  if (!isPlainObject(merged)) return;
  const blocks = merged["verificationBlocks"];
  const execution = isPlainObject(blocks) ? blocks["execution"] : undefined;
  if (!isPlainObject(execution)) {
    throw new Error(
      "cannot set completed=true for quick/lite spec without verificationBlocks.execution",
    );
  }
  const command = execution["command"];
  const exitCode = execution["exitCode"];
  const timestamp = execution["timestamp"];
  const srcMtime = execution["srcMtime"];
  if (
    typeof command !== "string" ||
    command.length === 0 ||
    exitCode !== 0 ||
    typeof timestamp !== "string" ||
    Number.isNaN(Date.parse(timestamp)) ||
    typeof srcMtime !== "number" ||
    !Number.isFinite(srcMtime) ||
    srcMtime < 0
  ) {
    throw new Error(
      "cannot set completed=true for quick/lite spec without a passing verificationBlocks.execution record",
    );
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
  try {
    validateCompletionHasExecutionVerification(merged, patch);
  } catch (err) {
    process.stderr.write(`merge-state: ${(err as Error).message}\n`);
    process.exit(1);
  }

  // Compact form required: the verify gate greps the no-space-after-colon shape.
  const serialized = JSON.stringify(merged) + "\n";
  writeFileAtomic(stateFile, serialized);
  process.stdout.write(serialized);
}

main();
