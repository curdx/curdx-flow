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

function readState(specFs: string): CurdxState | null {
  const stateFile = join(specFs, ".curdx-state.json");
  if (!existsSync(stateFile)) return null;
  try {
    return JSON.parse(readFileSync(stateFile, "utf8")) as CurdxState;
  } catch {
    return null;
  }
}

const TASK_LIST_PATTERN =
  /^[-*]\s+\[([ xX])\]\s+(?:\d+\.\d+|V\d+|VE\d+|VF)(?:\s|$)/gm;

function countTasks(raw: string): { completed: number; total: number } {
  let completed = 0;
  let total = 0;
  for (const m of raw.matchAll(TASK_LIST_PATTERN)) {
    total++;
    if (m[1] === "x" || m[1] === "X") completed++;
  }
  return { completed, total };
}

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

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function buildSpecRecord(
  entry: SpecEntry,
  cwd: string,
  specsDirs: string[],
): SpecRecord {
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

    const inferred = inferPhaseFromFiles(specFs);
  record.phase = inferred.phase;
  if (inferred.total > 0) {
    record.taskIndex = inferred.completed;
    record.totalTasks = inferred.total;
  }
  return record;
}

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

function formatIndexJson(state: IndexState): string {
  return JSON.stringify(state, null, 2) + "\n";
}

function log(opts: CliOptions, msg: string): void {
  if (!opts.quiet) {
    process.stderr.write(`${msg}\n`);
  }
}

runHook(
  async () => {
    const opts = parseArgs(process.argv.slice(2));

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
