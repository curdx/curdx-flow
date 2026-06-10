import { writeFileSync, renameSync } from "node:fs";
import { randomBytes } from "node:crypto";

/**
 * The temp file must live next to the destination (NOT in `os.tmpdir()`) so
 * the rename never crosses volumes — rename is atomic on POSIX and on
 * same-volume NTFS.
 */
export function writeFileAtomic(path: string, data: string | Buffer): void {
  const tmp = `${path}.tmp.${process.pid}.${randomBytes(6).toString("hex")}`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}
