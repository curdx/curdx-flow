// src/hooks/lib/ensure-gitignore.ts
//
// CLI utility: idempotently append an entry to .gitignore in CWD.
//
// Replacement for the v6 shell pattern:
//   grep -qxF "<entry>" .gitignore || echo "<entry>" >> .gitignore
//
// Usage:
//   node ensure-gitignore.mjs <entry>
//
// - If `.gitignore` does not exist in CWD, creates it with the entry + newline.
// - If it exists and already contains the entry on its own line (whitespace-
//   trimmed exact match), exits 0 silently (idempotent).
// - If it exists but lacks the entry, appends the entry preceded by a newline
//   when the file does not already end with one. Uses atomic write.
// - Empty entry → stderr usage + exit 1.
//
// Spec: specs/cross-platform-support/design.md → "Lib utilities → ensure-gitignore".

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

  // Scan each line, trimmed, for exact match.
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (line.trim() === entry) {
      // Already present — idempotent no-op.
      return;
    }
  }

  // Append; ensure the existing content ends with a newline first.
  const needsLeadingNewline = raw.length > 0 && !raw.endsWith("\n");
  const next = raw + (needsLeadingNewline ? "\n" : "") + entry + "\n";
  writeFileAtomic(file, next);
}

main();
