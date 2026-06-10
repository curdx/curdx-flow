import { readFileSync, existsSync } from "node:fs";
import { writeFileAtomic } from "../_shared/atomic-write.js";
import path from "node:path";

function main(): void {
  const args = process.argv.slice(2);
  const entry = args[0];
  if (entry === undefined || entry.length === 0) {
    process.stderr.write("usage: ensure-gitignore <entry>\n");
    process.exit(1);
  }

  const file = path.resolve(process.cwd(), ".gitignore");

  if (!existsSync(file)) {
    writeFileAtomic(file, entry + "\n");
    return;
  }

  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    process.stderr.write(
      `ensure-gitignore: failed to read ${file}: ${(err as Error).message}\n`,
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
