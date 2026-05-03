import { writeFileSync, renameSync } from "node:fs";
import { randomBytes } from "node:crypto";

/**
 * Atomically writes data to `path`.
 *
 * Strategy: write to a sibling temp file (same directory = same volume),
 * then `renameSync` over the destination. On POSIX, rename(2) is atomic.
 * On Windows/NTFS, MoveFile on the same volume is atomic. Cross-platform
 * equivalent of the `mktemp + mv` pattern used by the v6 shell hooks.
 *
 * The temp file lives next to the destination (NOT in `os.tmpdir()`) so the
 * rename never crosses volumes — see design.md "Cross-Platform Path Handling".
 */
export function writeFileAtomic(path: string, data: string | Buffer): void {
  const tmp = `${path}.tmp.${process.pid}.${randomBytes(6).toString("hex")}`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}
