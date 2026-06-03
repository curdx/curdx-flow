export const WALK_SKIP_DIRS = new Set<string>([
  ".git",
  "node_modules",
  "dist",
  ".curdx",
  ".claude",
]);

export function isWorkspaceSourceEdit(relPath: string): boolean {
  if (!relPath) return false;
  const norm = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (norm === ".." || norm.startsWith("../")) return false;
  const first = norm.split("/")[0] ?? "";
  return !WALK_SKIP_DIRS.has(first);
}
