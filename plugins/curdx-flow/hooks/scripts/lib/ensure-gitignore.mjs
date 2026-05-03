import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/lib/ensure-gitignore.ts
import { readFileSync, existsSync } from "node:fs";

// src/hooks/_shared/atomic-write.ts
import { writeFileSync, renameSync } from "node:fs";
import { randomBytes } from "node:crypto";
function writeFileAtomic(path2, data) {
  const tmp = `${path2}.tmp.${process.pid}.${randomBytes(6).toString("hex")}`;
  writeFileSync(tmp, data);
  renameSync(tmp, path2);
}

// src/hooks/lib/ensure-gitignore.ts
import path from "node:path";
function main() {
  const args = process.argv.slice(2);
  const entry = args[0];
  if (entry === void 0 || entry.length === 0) {
    process.stderr.write("usage: ensure-gitignore <entry>\n");
    process.exit(1);
  }
  const file = path.resolve(process.cwd(), ".gitignore");
  if (!existsSync(file)) {
    writeFileAtomic(file, entry + "\n");
    return;
  }
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    process.stderr.write(
      `ensure-gitignore: failed to read ${file}: ${err.message}
`
    );
    process.exit(1);
  }
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (line.trim() === entry) {
      return;
    }
  }
  const needsLeadingNewline = raw.length > 0 && !raw.endsWith("\n");
  const next = raw + (needsLeadingNewline ? "\n" : "") + entry + "\n";
  writeFileAtomic(file, next);
}
main();
//# sourceMappingURL=ensure-gitignore.mjs.map
