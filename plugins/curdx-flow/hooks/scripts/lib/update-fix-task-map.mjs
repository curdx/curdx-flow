import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/lib/update-fix-task-map.ts
import { readFileSync, existsSync } from "node:fs";

// src/hooks/_shared/atomic-write.ts
import { writeFileSync, renameSync } from "node:fs";
import { randomBytes } from "node:crypto";
function writeFileAtomic(path, data) {
  const tmp = `${path}.tmp.${process.pid}.${randomBytes(6).toString("hex")}`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

// src/hooks/lib/update-fix-task-map.ts
function dotsIn(s) {
  let n = 0;
  for (const ch of s) if (ch === ".") n++;
  return n;
}
function main() {
  const args = process.argv.slice(2);
  const stateFile = args[0];
  const originalId = args[1];
  const fixId = args[2];
  const reason = args[3] ?? "";
  if (stateFile === void 0 || originalId === void 0 || fixId === void 0) {
    process.stderr.write(
      "usage: update-fix-task-map <state-file> <originalTaskId> <fixTaskId> [<reason>]\n"
    );
    process.exit(1);
  }
  let state = {};
  if (existsSync(stateFile)) {
    const raw = readFileSync(stateFile, "utf8").trim();
    if (raw.length > 0) {
      try {
        state = JSON.parse(raw);
      } catch (err) {
        process.stderr.write(
          `update-fix-task-map: failed to parse ${stateFile}: ${err.message}
`
        );
        process.exit(1);
      }
    }
  }
  const map = state.fixTaskMap ?? {};
  const entry = map[originalId] ?? { count: 0, depth: 0, fixes: [] };
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
//# sourceMappingURL=update-fix-task-map.mjs.map
