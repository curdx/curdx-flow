/**
 * Spec Index Updater for curdx-flow.
 *
 * Behaviour mirrors v6 `update-spec-index.sh` (275 LOC):
 *   1. For every directory in `getSpecsDirs()`, count immediate non-hidden
 *      sub-dirs → "specsCount" entry in the directories array.
 *   2. For every spec returned by `listSpecs()`, read `<path>/.curdx-state.json`
 *      and surface phase/taskIndex/totalTasks/awaitingApproval. Fall back to
 *      file-based phase detection when the state file is missing or unreadable.
 *   3. Atomically write two outputs into `<defaultDir>/.index/`:
 *        - `index-state.json`  machine-readable shape
 *        - `index.md`          human-readable Markdown summary
 *
 * CLI flags (kept minimal, parity with v6 + spec):
 *   --quiet     suppress info log lines on stderr
 *   --dry-run   print resulting `index-state.json` to stdout, do NOT write
 *               either file. Used by the task verify pipeline.
 *
 * Path discipline (design.md "Cross-Platform Path Handling"):
 *   - `path.join`        for any path that hits the filesystem.
 *   - `path.posix.join`  for paths embedded in JSON/markdown so the on-disk
 *                        index stays byte-equal across operating systems.
 *
 * Error policy (FR-8): any thrown error → stderr log + `process.exit(0)`.
 * The script is invoked from other hooks/commands; never block callers.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import process from "node:process";
import { writeFileAtomic } from "./_shared/atomic-write.js";
import {
  findRepoRoot,
  getDefaultDir,
  getSpecsDirs,
  listSpecs,
  type SpecEntry,
} from "./_shared/path-resolver.js";

interface CliOptions {
  quiet: boolean;
  dryRun: boolean;
}

interface DirectoryRecord {
  path: string;
  specsCount: number;
  isDefault: boolean;
}

interface SpecRecord {
  name: string;
  path: string;
  phase: string;
  taskIndex?: number;
  totalTasks?: number;
  awaitingApproval?: true;
}

interface IndexState {
  version: "1.0";
  updated: string;
  directories: DirectoryRecord[];
  specs: SpecRecord[];
}

interface CurdxState {
  phase?: string;
  taskIndex?: number;
  totalTasks?: number;
  awaitingApproval?: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  return {
    quiet: argv.includes("--quiet"),
    dryRun: argv.includes("--dry-run"),
  };
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Count immediate non-hidden sub-directories of `dirFs` (filesystem path). */
function countSpecsIn(dirFs: string): number {
  if (!isDir(dirFs)) return 0;
  let entries: string[];
  try {
    entries = readdirSync(dirFs);
  } catch {
    return 0;
  }
  let n = 0;
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    if (isDir(join(dirFs, name))) n++;
  }
  return n;
}

/** Resolve a (possibly relative) serialized specs-dir to a filesystem path. */
function specsDirFs(serialized: string, cwd: string): string {
  // Absolute paths pass through; relative paths anchor at cwd.
  if (serialized.startsWith("/") || /^[A-Za-z]:[\\/]/.test(serialized)) {
    return serialized;
  }
  return join(cwd, serialized);
}

/**
 * `path-resolver.listSpecs()` returns paths joined via `posix.join`, which
 * strips a leading `./`. v6 bash kept the `./` prefix for relative dirs, so
 * for byte-equal-ish parity we re-attach it whenever the source specs-dir
 * was relative-with-dot-prefix. Absolute paths and bare relatives pass
 * through unchanged.
 */
function preserveDotPrefix(specPath: string, specsDirs: string[]): string {
  // If any configured dir is the literal "./..." form whose body matches the
  // start of `specPath`, re-attach the "./".
  for (const dir of specsDirs) {
    if (!dir.startsWith("./")) continue;
    const body = dir.slice(2); // strip "./"
    if (body && specPath.startsWith(`${body}/`)) {
      return `./${specPath}`;
    }
  }
  return specPath;
}

/**
 * Read `<specPath>/.curdx-state.json` if present. Returns null when missing
 * or unparseable — callers fall back to file-based phase detection.
 */
function readState(specFs: string): CurdxState | null {
  const stateFile = join(specFs, ".curdx-state.json");
  if (!existsSync(stateFile)) return null;
  try {
    return JSON.parse(readFileSync(stateFile, "utf8")) as CurdxState;
  } catch {
    return null;
  }
}

/**
 * Mirrors v6 fallback phase detection used when no state file exists.
 * Returns phase + completed/total task counts (counts only meaningful for
 * the `tasks`/`completed` phases).
 */
function inferPhaseFromFiles(specFs: string): {
  phase: string;
  completed: number;
  total: number;
} {
  const tasksFile = join(specFs, "tasks.md");
  if (existsSync(tasksFile)) {
    let raw = "";
    try {
      raw = readFileSync(tasksFile, "utf8");
    } catch {
      raw = "";
    }
    // v6 used `grep -c '\- \[x\]'` and `grep -c '\- \[.\]'`.
    const completed = (raw.match(/- \[x\]/g) ?? []).length;
    const total = (raw.match(/- \[.\]/g) ?? []).length;
    if (total > 0 && completed === total) {
      return { phase: "completed", completed, total };
    }
    return { phase: "tasks", completed, total };
  }
  if (existsSync(join(specFs, "design.md"))) {
    return { phase: "design", completed: 0, total: 0 };
  }
  if (existsSync(join(specFs, "requirements.md"))) {
    return { phase: "requirements", completed: 0, total: 0 };
  }
  if (existsSync(join(specFs, "research.md"))) {
    return { phase: "research", completed: 0, total: 0 };
  }
  return { phase: "new", completed: 0, total: 0 };
}

/** ISO-8601 UTC timestamp without milliseconds — matches v6 `date -u +%FT%TZ`. */
function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Build the SpecRecord for one spec entry. Always returns `phase`; the
 * task counters and `awaitingApproval` keys are conditionally emitted to
 * match v6's JSON shape exactly.
 */
function buildSpecRecord(
  entry: SpecEntry,
  cwd: string,
  specsDirs: string[],
): SpecRecord {
  // Resolve the serialized spec path back to a filesystem path for IO.
  const specFs = entry.path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(entry.path)
    ? entry.path
    : join(cwd, entry.path);

  const state = readState(specFs);
  const record: SpecRecord = {
    name: entry.name,
    path: preserveDotPrefix(entry.path, specsDirs),
    phase: "unknown",
  };

  if (state) {
    const phase = state.phase ?? "unknown";
    const taskIndex =
      typeof state.taskIndex === "number" ? state.taskIndex : 0;
    const totalTasks =
      typeof state.totalTasks === "number" ? state.totalTasks : 0;
    const awaiting = state.awaitingApproval === true;

    record.phase = phase;
    if (phase === "execution" || totalTasks > 0) {
      record.taskIndex = taskIndex;
      record.totalTasks = totalTasks;
    }
    if (awaiting) {
      record.awaitingApproval = true;
    }
    return record;
  }

  // No state file → infer phase from sibling files.
  const inferred = inferPhaseFromFiles(specFs);
  record.phase = inferred.phase;
  if (inferred.total > 0) {
    record.taskIndex = inferred.completed;
    record.totalTasks = inferred.total;
  }
  return record;
}

/** Compose the index-state.json content (machine-readable). */
function buildIndexState(cwd: string): IndexState {
  const opts = { cwd };
  const defaultDir = getDefaultDir(opts);
  const specsDirs = getSpecsDirs(opts);

  const directories: DirectoryRecord[] = specsDirs.map((dir) => ({
    path: dir,
    specsCount: countSpecsIn(specsDirFs(dir, cwd)),
    isDefault: dir === defaultDir,
  }));

  const specs: SpecRecord[] = listSpecs(opts).map((s) =>
    buildSpecRecord(s, cwd, specsDirs),
  );

  return {
    version: "1.0",
    updated: isoNow(),
    directories,
    specs,
  };
}

/**
 * Build the human-readable index.md. Mirrors v6 layout exactly:
 *   header + Directories table + All Specs table + footer with command list.
 */
function buildIndexMarkdown(state: IndexState, cwd: string): string {
  const dirCount = state.directories.length;
  const totalSpecs = state.directories.reduce(
    (acc, d) => acc + d.specsCount,
    0,
  );

  const lines: string[] = [];
  lines.push("# Spec Index");
  lines.push("");
  lines.push(
    "Auto-generated summary of all specs across configured directories.",
  );
  lines.push("See [index-state.json](./index-state.json) for machine-readable data.");
  lines.push("");
  lines.push(`**Last updated:** ${state.updated}`);
  lines.push("");
  lines.push(`## Directories (${dirCount})`);
  lines.push("");
  lines.push("| Directory | Specs | Default |");
  lines.push("|-----------|-------|---------|");
  for (const d of state.directories) {
    const marker = d.isDefault ? "Yes" : "";
    lines.push(`| ${d.path} | ${d.specsCount} | ${marker} |`);
  }
  lines.push("");
  lines.push(`## All Specs (${totalSpecs})`);
  lines.push("");
  lines.push("| Spec | Directory | Phase | Status |");
  lines.push("|------|-----------|-------|--------|");

  const specsDirs = getSpecsDirs({ cwd });
  for (const entry of listSpecs({ cwd })) {
    // Compute directory column = posix dirname of the (dot-preserved) path.
    const restored = preserveDotPrefix(entry.path, specsDirs);
    const dir = posix.dirname(restored);
    const specFs = entry.path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(entry.path)
      ? entry.path
      : join(cwd, entry.path);
    const status = computeStatusCell(specFs);
    const phase = computePhaseCell(specFs);
    lines.push(`| ${entry.name} | ${dir} | ${phase} | ${status} |`);
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("**Commands:**");
  lines.push("- `/curdx-flow:status` - Show detailed status");
  lines.push("- `/curdx-flow:switch <name>` - Switch active spec");
  lines.push("- `/curdx-flow:start <name>` - Create or resume spec");
  lines.push("");
  return lines.join("\n");
}

function computePhaseCell(specFs: string): string {
  const state = readState(specFs);
  if (state) return state.phase ?? "unknown";
  return inferPhaseFromFiles(specFs).phase;
}

function computeStatusCell(specFs: string): string {
  const state = readState(specFs);
  if (state) {
    const phase = state.phase ?? "unknown";
    const taskIndex =
      typeof state.taskIndex === "number" ? state.taskIndex : 0;
    const totalTasks =
      typeof state.totalTasks === "number" ? state.totalTasks : 0;
    const awaiting = state.awaitingApproval === true;
    if (phase === "execution") return `${taskIndex}/${totalTasks} tasks`;
    if (awaiting) return "awaiting approval";
    return "";
  }
  const inferred = inferPhaseFromFiles(specFs);
  if (inferred.phase === "completed") return "done";
  if (inferred.phase === "tasks") {
    return `${inferred.completed}/${inferred.total} tasks`;
  }
  return "";
}

/** Pretty-print `index-state.json` matching v6 indentation (2 spaces). */
function formatIndexJson(state: IndexState): string {
  return JSON.stringify(state, null, 2) + "\n";
}

function log(opts: CliOptions, msg: string): void {
  if (!opts.quiet) {
    process.stderr.write(`${msg}\n`);
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  // Anchor on the repo root rather than naked cwd so this hook still works
  // when invoked from a sub-directory.
  const cwd = findRepoRoot();
  const state = buildIndexState(cwd);
  const markdown = buildIndexMarkdown(state, cwd);
  const jsonText = formatIndexJson(state);

  if (opts.dryRun) {
    process.stdout.write(jsonText);
    return;
  }

  const defaultDir = getDefaultDir({ cwd });
  const indexDirFs = join(cwd, defaultDir, ".index");
  mkdirSync(indexDirFs, { recursive: true });

  const jsonOut = join(indexDirFs, "index-state.json");
  const mdOut = join(indexDirFs, "index.md");
  writeFileAtomic(jsonOut, jsonText);
  log(opts, `Updated ${jsonOut}`);
  writeFileAtomic(mdOut, markdown);
  log(opts, `Updated ${mdOut}`);

  const totalSpecs = state.directories.reduce(
    (acc, d) => acc + d.specsCount,
    0,
  );
  log(
    opts,
    `Spec index updated: ${totalSpecs} specs in ${state.directories.length} directories`,
  );
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[update-spec-index] error: ${msg}\n`);
  // Never block callers — exit 0 even on unexpected errors.
  process.exit(0);
});
