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
import { runHook } from "./_shared/run-hook.js";
import type { HookOutput as _HookOutputRef } from "./_shared/types.js";
import type { CurdxState } from "./_shared/types.js";
type _UnusedHookOutput = _HookOutputRef;

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

function specsDirFs(serialized: string, cwd: string): string {
    if (serialized.startsWith("/") || /^[A-Za-z]:[\\/]/.test(serialized)) {
    return serialized;
  }
  return join(cwd, serialized);
}

function preserveDotPrefix(specPath: string, specsDirs: string[]): string {
      for (const dir of specsDirs) {
    if (!dir.startsWith("./")) continue;
    const body = dir.slice(2);     if (body && specPath.startsWith(`${body}/`)) {
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
 * Task-line pattern for fallback progress detection.
 *
 * Why this precise pattern (vs v6's loose `- [x]` / `- [.]` greps):
 *
 * v6 counted any markdown checkbox, including AC/FR/NFR reference lists that
 * task-planner's V6 task body embeds for the AC-checklist verify
 * (`- [ ] AC-1.1: …`). Those are NOT tasks, but v6 treated them as such — so
 * a finished spec whose tasks used `### Task X.Y … [x]` headlines (a
 * non-standard LLM-written form) and whose only `- [ ]` lines were 10 AC
 * items reported `0/10 in tasks phase`. Real-world repro:
 * test003/specs/helloworld (May 2026).
 *
 * Aligning with OpenSpec's tracker (`^[-*]\s+\[[\sxX]\]`), we additionally
 * REQUIRE a task-id token immediately after the checkbox, matching the
 * curdx-flow convention from `templates/tasks.md` / `agents/task-planner.md`:
 *   - `- [ ] 1.1 …`           regular task (Phase.Task numbering)
 *   - `- [ ] 1.2 [P] …`       parallel task
 *   - `- [ ] 1.3 [VERIFY] …`  verify task
 *   - `- [ ] V1 [VERIFY] …`   quality-gate task
 *   - `- [ ] VE1 [VERIFY] …`  E2E task
 *   - `- [ ] VF [VERIFY] …`   bug-fix verification
 * AC/FR/NFR/US tokens are reserved for reference lists and are explicitly
 * excluded — those don't represent units of execution work.
 *
 * Non-standard formats (`### Task` headlines, etc.) are intentionally NOT
 * counted. The fallback prefers honest "I can't parse this" silence over
 * a half-confident count: when no list-items match we still infer the
 * lifecycle phase from `.progress.md` presence, but we do not fabricate
 * task numerators/denominators we can't justify.
 */
const TASK_LIST_PATTERN =
  /^[-*]\s+\[([ xX])\]\s+(?:\d+\.\d+|V\d+|VE\d+|VF)(?:\s|$)/gm;

/** Count completed and total tasks in tasks.md content. */
function countTasks(raw: string): { completed: number; total: number } {
  let completed = 0;
  let total = 0;
  for (const m of raw.matchAll(TASK_LIST_PATTERN)) {
    total++;
    if (m[1] === "x" || m[1] === "X") completed++;
  }
  return { completed, total };
}

/**
 * Fallback phase detection used when `.curdx-state.json` is absent.
 *
 * Phase resolution order:
 *   1. tasks.md present + every task `[x]` → "completed"
 *   2. tasks.md present + zero task lines recognized + .progress.md present
 *      → "completed" (lifecycle: implement loop deletes state on success
 *      while preserving .progress.md; tasks.md may be in any format)
 *   3. tasks.md present + at least one task line                → "tasks"
 *   4. design.md / requirements.md / research.md presence       → that phase
 *   5. nothing                                                  → "new"
 *
 * The completed/total counts are returned but only treated as meaningful by
 * `buildSpecRecord` / `computeStatusCell` when total > 0. A "completed via
 * .progress.md presence" branch returns 0/0 — we don't fabricate task
 * counts when we couldn't actually parse any.
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
    const { completed, total } = countTasks(raw);
    if (total > 0 && completed === total) {
      return { phase: "completed", completed, total };
    }
    if (total === 0 && existsSync(join(specFs, ".progress.md"))) {
      return { phase: "completed", completed: 0, total: 0 };
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
    // v7.1.0 completion marker: when the executor has written
    // `completed: true`, surface phase=completed in the index regardless of
    // any stale `phase` field. Short-circuits inferPhaseFromFiles entirely
    // (FR-6, AC-3.1/3.2). Only emit task counters when totalTasks > 0 so
    // we don't fabricate `0/0 tasks` for state that lacks the counter.
    if (state.completed === true) {
      record.phase = "completed";
      const totalTasks =
        typeof state.totalTasks === "number" ? state.totalTasks : 0;
      if (totalTasks > 0) {
        const taskIndex =
          typeof state.taskIndex === "number" ? state.taskIndex : 0;
        record.taskIndex = taskIndex;
        record.totalTasks = totalTasks;
      }
      return record;
    }

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

// CLI driver — invoked as `node update-spec-index.mjs [--quiet] [--dry-run]`.
// `runHook(..., { readStdin: false })` skips stdin parsing (would hang on TTY)
// while still owning the global try/catch + exit-0-always contract (FR-8).
//
// Handler returns `void`: dry-run mode writes JSON directly to stdout (no
// HookOutput envelope), and write mode produces no stdout payload — runHook
// emits nothing in either case, byte-equal to the v6 baseline.
runHook(
  async () => {
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
  },
  { readStdin: false },
);
