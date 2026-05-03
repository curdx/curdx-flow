import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/lib/update-modification-map.ts
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// src/hooks/_shared/atomic-write.ts
import { writeFileSync, renameSync } from "node:fs";
import { randomBytes } from "node:crypto";
function writeFileAtomic(path, data) {
  const tmp = `${path}.tmp.${process.pid}.${randomBytes(6).toString("hex")}`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

// src/hooks/lib/update-modification-map.ts
function main() {
  const args = process.argv.slice(2);
  const target = args[0];
  const taskId = args[1];
  const files = args.slice(2);
  if (target === void 0 || taskId === void 0 || files.length === 0) {
    process.stderr.write(
      "usage: update-modification-map <state-file-or-spec-dir> <taskId> <file1> [file2 ...]\n"
    );
    process.exit(1);
  }
  const statePath = target.endsWith(".json") ? target : join(target, ".file-modifications.json");
  let data = {};
  if (existsSync(statePath)) {
    const raw = readFileSync(statePath, "utf8").trim();
    if (raw.length > 0) {
      try {
        data = JSON.parse(raw);
      } catch (err) {
        process.stderr.write(
          `update-modification-map: failed to parse ${statePath}: ${err.message}
`
        );
        process.exit(1);
      }
    }
  }
  const existing = Array.isArray(data[taskId]) ? data[taskId] : [];
  const merged = Array.from(/* @__PURE__ */ new Set([...existing, ...files]));
  data[taskId] = merged;
  writeFileAtomic(statePath, JSON.stringify(data) + "\n");
  process.stdout.write(JSON.stringify({ [taskId]: merged }) + "\n");
}
main();
//# sourceMappingURL=update-modification-map.mjs.map
