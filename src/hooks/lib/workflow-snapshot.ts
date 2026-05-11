// src/hooks/lib/workflow-snapshot.ts
//
// Read-only phase initializer for curdx-flow skills and hooks.
//
// The snapshot is deliberately a fact surface, not a state mutator. Skills use
// it as the first operation in a phase so routing, artifact gates, task counts,
// verification state, topology, and capability hints come from one deterministic
// source instead of repeated ad hoc Bash snippets.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CurdxState, VerificationBlock } from "../_shared/types.js";
import { findSpec, resolveCurrent } from "../_shared/path-resolver.js";
import { parseTaskList, type TaskMeta } from "../_shared/markdown-task-parser.js";
import { discoverProjectTopology, type ProjectTopology } from "./project-topology.js";

export interface WorkflowSnapshotInput {
  cwd?: string;
  spec?: string;
  goal?: string;
}

export interface ArtifactSnapshot {
  exists: boolean;
  path: string;
  mtimeMs?: number;
  bytes?: number;
}

export interface TaskSnapshot {
  total: number;
  completed: number;
  pending: number;
  currentIndex: number;
  current?: {
    id?: string;
    title: string;
    lineStart: number;
    lineEnd: number;
    verify?: string;
    files: string[];
  };
}

export interface GitSnapshot {
  available: boolean;
  branch?: string;
  dirty: boolean;
  changedFiles: number;
}

export interface WorkflowSnapshot {
  version: 2;
  cwd: string;
  active: boolean;
  spec?: {
    name: string;
    path: string;
    fsPath: string;
    statePath: string;
  };
  state: {
    exists: boolean;
    valid: boolean;
    version?: number | string;
    phase?: string;
    completed: boolean;
    awaitingApproval: boolean;
    quickMode: boolean;
    autoPolicy?: CurdxState["autoPolicy"];
    recommendedCapabilities: NonNullable<CurdxState["recommendedCapabilities"]>;
    projectTopology?: CurdxState["projectTopology"];
    verificationBlocks: Partial<Record<string, VerificationBlock>>;
    error?: string;
  };
  artifacts: Record<"research" | "requirements" | "design" | "tasks" | "progress", ArtifactSnapshot>;
  tasks: TaskSnapshot;
  topology?: Pick<ProjectTopology, "devContextFound" | "roots" | "requiredRoots" | "missingRoots" | "accessFix" | "warnings">;
  git: GitSnapshot;
  nextAction: string;
  gates: string[];
}

function readArg(name: string, argv: string[]): string | undefined {
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

function normalizeSpecPath(cwd: string, specPath: string): string {
  if (isAbsolute(specPath)) return specPath;
  return join(cwd, specPath);
}

function specNameFromPath(specPath: string): string {
  const parts = specPath.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? basename(specPath);
}

function resolveSpecPath(input: WorkflowSnapshotInput): string | undefined {
  const cwd = input.cwd ?? process.cwd();
  const explicit = input.spec?.trim();
  if (explicit) {
    if (explicit.startsWith("./") || explicit.startsWith("../") || isAbsolute(explicit)) {
      return explicit;
    }
    const found = findSpec(explicit, { cwd });
    if (found.ok) return found.path;
    return explicit;
  }
  return resolveCurrent({ cwd }) ?? undefined;
}

function readJsonFile<T>(path: string): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, "utf8")) as T };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function artifact(specFs: string, filename: string): ArtifactSnapshot {
  const p = join(specFs, filename);
  if (!existsSync(p)) return { exists: false, path: p };
  try {
    const st = statSync(p);
    return {
      exists: true,
      path: p,
      mtimeMs: st.mtimeMs,
      bytes: st.size,
    };
  } catch {
    return { exists: true, path: p };
  }
}

function extractVerify(raw: string): string | undefined {
  const m = raw.match(/^\s+- \*\*Verify\*\*:\s*(.+)$/m);
  return m?.[1]?.trim();
}

function extractFiles(raw: string): string[] {
  const m = raw.match(/^\s+- \*\*Files\*\*:\s*(.+)$/m);
  const value = m?.[1]?.trim();
  if (!value) return [];
  return value
    .split(/[,;]/)
    .map((part) => part.trim().replace(/^`|`$/g, ""))
    .filter(Boolean);
}

function buildTaskSnapshot(specFs: string, state: CurdxState | null): TaskSnapshot {
  const tasksPath = join(specFs, "tasks.md");
  if (!existsSync(tasksPath)) {
    return { total: 0, completed: 0, pending: 0, currentIndex: 0 };
  }
  let tasks: TaskMeta[] = [];
  try {
    tasks = parseTaskList(readFileSync(tasksPath, "utf8"));
  } catch {
    tasks = [];
  }

  const total = tasks.length;
  const completed = tasks.reduce((n, task) => n + (task.completed ? 1 : 0), 0);
  const pending = total - completed;
  const rawIndex = typeof state?.taskIndex === "number" ? state.taskIndex : completed;
  const currentIndex = Math.max(0, Math.min(rawIndex, Math.max(total - 1, 0)));
  const currentTask = tasks[currentIndex];

  return {
    total,
    completed,
    pending,
    currentIndex,
    ...(currentTask
      ? {
          current: {
            ...(currentTask.id ? { id: currentTask.id } : {}),
            title: currentTask.title,
            lineStart: currentTask.lineStart,
            lineEnd: currentTask.lineEnd,
            ...(extractVerify(currentTask.raw) ? { verify: extractVerify(currentTask.raw) } : {}),
            files: extractFiles(currentTask.raw),
          },
        }
      : {}),
  };
}

function gitSnapshot(cwd: string): GitSnapshot {
  try {
    const branch = execFileSync("git", ["branch", "--show-current"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split(/\r?\n/)
      .filter(Boolean);
    return {
      available: true,
      ...(branch ? { branch } : {}),
      dirty: status.length > 0,
      changedFiles: status.length,
    };
  } catch {
    return { available: false, dirty: false, changedFiles: 0 };
  }
}

function compactTopology(topology: ProjectTopology): WorkflowSnapshot["topology"] {
  return {
    devContextFound: topology.devContextFound,
    roots: topology.roots,
    requiredRoots: topology.requiredRoots,
    missingRoots: topology.missingRoots,
    ...(topology.accessFix ? { accessFix: topology.accessFix } : {}),
    warnings: topology.warnings,
  };
}

function isLiteSpecState(state: CurdxState | null): boolean {
  const route = state?.route?.route;
  return state?.autoPolicy?.executionMode === "spec-lite" || route === "lite-spec";
}

function inferNextAction(
  state: CurdxState | null,
  artifacts: WorkflowSnapshot["artifacts"],
  tasks: TaskSnapshot,
): string {
  if (state?.completed === true) return "Spec is completed. Use /curdx-flow:refactor for follow-up changes.";
  if (isLiteSpecState(state)) {
    if (!artifacts.tasks.exists) return "Run /curdx-flow:tasks.";
    if (tasks.pending > 0) return "Run /curdx-flow:implement.";
    return "All task checkboxes are complete; run verification/refactor or mark complete.";
  }
  if (!artifacts.research.exists) return "Run /curdx-flow:research.";
  if (!artifacts.requirements.exists) return "Run /curdx-flow:requirements.";
  if (!artifacts.design.exists) return "Run /curdx-flow:design.";
  if (!artifacts.tasks.exists) return "Run /curdx-flow:tasks.";
  if (tasks.pending > 0) return "Run /curdx-flow:implement.";
  return "All task checkboxes are complete; run verification/refactor or mark complete.";
}

function buildGates(
  stateInfo: WorkflowSnapshot["state"],
  artifacts: WorkflowSnapshot["artifacts"],
  tasks: TaskSnapshot,
  topology: WorkflowSnapshot["topology"],
): string[] {
  const gates: string[] = [];
  const isLiteSpec = stateInfo.autoPolicy?.executionMode === "spec-lite";
  if (!stateInfo.exists) gates.push("missing-state");
  if (stateInfo.exists && !stateInfo.valid) gates.push("invalid-state");
  if (topology && topology.missingRoots.length > 0) gates.push("missing-code-root");
  if (isLiteSpec) {
    if (!artifacts.tasks.exists) gates.push("missing-tasks");
  } else {
    if (!artifacts.research.exists) gates.push("missing-research");
    if (!artifacts.requirements.exists && artifacts.research.exists) gates.push("missing-requirements");
    if (!artifacts.design.exists && artifacts.requirements.exists) gates.push("missing-design");
    if (!artifacts.tasks.exists && artifacts.design.exists) gates.push("missing-tasks");
  }
  if (artifacts.tasks.exists && tasks.total === 0) gates.push("empty-tasks");
  if (tasks.total > 0 && stateInfo.phase === "execution" && tasks.pending === 0 && !stateInfo.completed) {
    gates.push("completion-unmarked");
  }
  return gates;
}

export function buildWorkflowSnapshot(input: WorkflowSnapshotInput = {}): WorkflowSnapshot {
  const cwd = input.cwd ?? process.cwd();
  const specPath = resolveSpecPath({ ...input, cwd });
  const topology = compactTopology(discoverProjectTopology({ cwd, goal: input.goal ?? "" }));
  const git = gitSnapshot(cwd);

  if (!specPath) {
    return {
      version: 2,
      cwd,
      active: false,
      state: {
        exists: false,
        valid: false,
        completed: false,
        awaitingApproval: false,
        quickMode: false,
        recommendedCapabilities: [],
        verificationBlocks: {},
      },
      artifacts: {
        research: { exists: false, path: join(cwd, "research.md") },
        requirements: { exists: false, path: join(cwd, "requirements.md") },
        design: { exists: false, path: join(cwd, "design.md") },
        tasks: { exists: false, path: join(cwd, "tasks.md") },
        progress: { exists: false, path: join(cwd, ".progress.md") },
      },
      tasks: { total: 0, completed: 0, pending: 0, currentIndex: 0 },
      topology,
      git,
      nextAction: "No active spec. Run /curdx-flow:start <name> <goal>.",
      gates: ["no-active-spec"],
    };
  }

  const specFs = normalizeSpecPath(cwd, specPath);
  const statePath = join(specFs, ".curdx-state.json");
  let state: CurdxState | null = null;
  const stateInfo: WorkflowSnapshot["state"] = {
    exists: existsSync(statePath),
    valid: false,
    completed: false,
    awaitingApproval: false,
    quickMode: false,
    recommendedCapabilities: [],
    verificationBlocks: {},
  };

  if (stateInfo.exists) {
    const parsed = readJsonFile<CurdxState>(statePath);
    if (parsed.ok) {
      state = parsed.value;
      stateInfo.valid = true;
      stateInfo.version = parsed.value.version;
      stateInfo.phase = parsed.value.phase;
      stateInfo.completed = parsed.value.completed === true;
      stateInfo.awaitingApproval = parsed.value.awaitingApproval === true;
      stateInfo.quickMode = parsed.value.quickMode === true;
      stateInfo.autoPolicy = parsed.value.autoPolicy;
      stateInfo.recommendedCapabilities = parsed.value.recommendedCapabilities ?? [];
      stateInfo.projectTopology = parsed.value.projectTopology;
      stateInfo.verificationBlocks = parsed.value.verificationBlocks ?? {};
    } else {
      stateInfo.error = parsed.error;
    }
  }

  const artifacts = {
    research: artifact(specFs, "research.md"),
    requirements: artifact(specFs, "requirements.md"),
    design: artifact(specFs, "design.md"),
    tasks: artifact(specFs, "tasks.md"),
    progress: artifact(specFs, ".progress.md"),
  } satisfies WorkflowSnapshot["artifacts"];
  const tasks = buildTaskSnapshot(specFs, state);

  return {
    version: 2,
    cwd,
    active: existsSync(specFs),
    spec: {
      name: specNameFromPath(specPath),
      path: specPath,
      fsPath: specFs,
      statePath,
    },
    state: stateInfo,
    artifacts,
    tasks,
    topology,
    git,
    nextAction: inferNextAction(state, artifacts, tasks),
    gates: buildGates(stateInfo, artifacts, tasks, topology),
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  const snapshot = buildWorkflowSnapshot({
    cwd: readArg("--cwd", argv),
    spec: readArg("--spec", argv),
    goal: readArg("--goal", argv),
  });
  process.stdout.write(JSON.stringify(snapshot, null, 2) + "\n");
}

function isDirectRun(): boolean {
  try {
    const entry = fileURLToPath(import.meta.url);
    return process.argv[1] === entry && basename(entry).startsWith("workflow-snapshot.");
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main();
}
