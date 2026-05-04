import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/lib/merge-state.ts
import { readFileSync, existsSync } from "node:fs";

// src/hooks/_shared/atomic-write.ts
import { writeFileSync, renameSync } from "node:fs";
import { randomBytes } from "node:crypto";
function writeFileAtomic(path, data) {
  const tmp = `${path}.tmp.${process.pid}.${randomBytes(6).toString("hex")}`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

// src/hooks/lib/merge-state.ts
function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}
function deepMerge(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch;
  }
  const out = { ...base };
  for (const [key, patchVal] of Object.entries(patch)) {
    const existing = out[key];
    if (existing !== void 0) {
      out[key] = deepMerge(existing, patchVal);
    } else {
      out[key] = patchVal;
    }
  }
  return out;
}
function stripUnset(patch) {
  if (!isPlainObject(patch)) return patch;
  const { $unset: _drop, ...rest } = patch;
  return rest;
}
function applyUnset(target, patch) {
  if (!isPlainObject(target) || !isPlainObject(patch)) return target;
  const unsetVal = patch["$unset"];
  if (unsetVal === void 0) return target;
  if (!Array.isArray(unsetVal) || !unsetVal.every((k) => typeof k === "string")) {
    process.stderr.write("merge-state: $unset must be string[]\n");
    process.exit(1);
  }
  const out = { ...target };
  for (const key of unsetVal) delete out[key];
  return out;
}
function main() {
  const args = process.argv.slice(2);
  const stateFile = args[0];
  const patchStr = args[1];
  if (stateFile === void 0 || patchStr === void 0) {
    process.stderr.write(
      "usage: merge-state <state-file> <json-patch>\n"
    );
    process.exit(1);
  }
  let base = {};
  if (existsSync(stateFile)) {
    const raw = readFileSync(stateFile, "utf8").trim();
    if (raw.length > 0) {
      try {
        base = JSON.parse(raw);
      } catch (err) {
        process.stderr.write(
          `merge-state: failed to parse state file ${stateFile}: ${err.message}
`
        );
        process.exit(1);
      }
    }
  }
  let patch;
  try {
    patch = JSON.parse(patchStr);
  } catch (err) {
    process.stderr.write(
      `merge-state: failed to parse patch JSON: ${err.message}
`
    );
    process.exit(1);
  }
  const cleanPatch = stripUnset(patch);
  let merged = deepMerge(base, cleanPatch);
  merged = applyUnset(merged, patch);
  const serialized = JSON.stringify(merged) + "\n";
  writeFileAtomic(stateFile, serialized);
  process.stdout.write(serialized);
}
main();
//# sourceMappingURL=merge-state.mjs.map
