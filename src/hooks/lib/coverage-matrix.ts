import { parseTaskList } from "../_shared/markdown-task-parser.js";

export type RequirementKind = "FR" | "NFR" | "SC" | "AC" | "US";

export interface RequirementDef {
  id: string;
  kind: RequirementKind;
  line: number;
}

export interface TaskRequirementRefs {
  taskId: string;
  taskTitle: string;
  completed: boolean;
  refs: string[];
}

export interface CoverageEntry {
  id: string;
  kind: RequirementKind;
  critical: boolean;
  tasks: string[];
}

export interface OrphanReference {
  ref: string;
  taskId: string;
  taskTitle: string;
}

export interface CoverageReport {
  ok: boolean;
  evaluable: boolean;
  requirements: RequirementDef[];
  taskCount: number;
  referencingTaskCount: number;
  covered: CoverageEntry[];
  uncovered: CoverageEntry[];
  criticalGaps: string[];
  orphans: OrphanReference[];
}

export interface CoverageInput {
  requirementsText: string;
  tasksText: string;
}

const ID_RE = /(?:FR|NFR|SC|AC|US)-\d+(?:\.\d+)*/g;
const TABLE_DEF_RE = /^ {0,3}\|\s*\*{0,2}((?:FR|NFR)-\d+)\*{0,2}\s*\|/;
const HEADING_DEF_RE = /^#{1,6}\s+\*{0,2}((?:FR|NFR|SC|AC|US)-\d+(?:\.\d+)*)\*{0,2}\s*[:.]?/;
const BULLET_DEF_RE = /^\s*[-*]\s+\*{0,2}((?:FR|NFR|SC|AC|US)-\d+(?:\.\d+)*)\*{0,2}\s*[:.]/;
const FOOTNOTE_RE = /_Requirements:\s*([^_]*)_/g;
const CRITICAL_KINDS: ReadonlySet<RequirementKind> = new Set(["FR", "SC"]);

function kindOf(id: string): RequirementKind {
  return id.slice(0, id.indexOf("-")) as RequirementKind;
}

export function parseRequirementIds(requirementsText: string): RequirementDef[] {
  if (!requirementsText) return [];
  const lines = requirementsText.replace(/\r\n?/g, "\n").split("\n");
  const seen = new Set<string>();
  const defs: RequirementDef[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const match =
      line.match(TABLE_DEF_RE) ?? line.match(HEADING_DEF_RE) ?? line.match(BULLET_DEF_RE);
    const id = match?.[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    defs.push({ id, kind: kindOf(id), line: i + 1 });
  }
  return defs;
}

export function parseTaskRequirementRefs(tasksText: string): TaskRequirementRefs[] {
  const tasks = parseTaskList(tasksText);
  return tasks.map((task, index) => {
    const refs = new Set<string>();
    for (const footnote of task.raw.matchAll(FOOTNOTE_RE)) {
      for (const ref of (footnote[1] ?? "").matchAll(ID_RE)) {
        refs.add(ref[0]);
      }
    }
    return {
      taskId: task.id ?? `#${index + 1}`,
      taskTitle: task.title,
      completed: task.completed,
      refs: [...refs],
    };
  });
}

export function buildCoverageReport(input: CoverageInput): CoverageReport {
  const requirements = parseRequirementIds(input.requirementsText);
  const taskRefs = parseTaskRequirementRefs(input.tasksText);
  const known = new Set(requirements.map((def) => def.id));
  const tasksByRequirement = new Map<string, string[]>();
  const orphans: OrphanReference[] = [];

  for (const task of taskRefs) {
    for (const ref of task.refs) {
      if (!known.has(ref)) {
        orphans.push({ ref, taskId: task.taskId, taskTitle: task.taskTitle });
        continue;
      }
      const list = tasksByRequirement.get(ref) ?? [];
      list.push(task.taskId);
      tasksByRequirement.set(ref, list);
    }
  }

  const covered: CoverageEntry[] = [];
  const uncovered: CoverageEntry[] = [];
  for (const def of requirements) {
    const tasks = tasksByRequirement.get(def.id) ?? [];
    const entry: CoverageEntry = {
      id: def.id,
      kind: def.kind,
      critical: CRITICAL_KINDS.has(def.kind),
      tasks,
    };
    (tasks.length > 0 ? covered : uncovered).push(entry);
  }

  const criticalGaps = uncovered.filter((entry) => entry.critical).map((entry) => entry.id);
  const evaluable = requirements.length > 0;

  return {
    ok: evaluable && criticalGaps.length === 0,
    evaluable,
    requirements,
    taskCount: taskRefs.length,
    referencingTaskCount: taskRefs.filter((task) => task.refs.length > 0).length,
    covered,
    uncovered,
    criticalGaps,
    orphans,
  };
}

export function renderCoverageReport(report: CoverageReport, specName: string): string {
  const lines: string[] = [];
  const byKind = new Map<RequirementKind, number>();
  for (const def of report.requirements) {
    byKind.set(def.kind, (byKind.get(def.kind) ?? 0) + 1);
  }
  const kindSummary = [...byKind.entries()].map(([kind, count]) => `${kind} ${count}`).join(", ");

  lines.push(`coverage: ${specName}`);
  lines.push("");
  lines.push(
    `requirements: ${report.requirements.length}${kindSummary ? ` (${kindSummary})` : ""}`,
  );
  lines.push(`tasks: ${report.taskCount} (${report.referencingTaskCount} with _Requirements:_ refs)`);
  lines.push("");

  lines.push(`covered (${report.covered.length}):`);
  if (report.covered.length === 0) {
    lines.push("  none");
  }
  for (const entry of report.covered) {
    lines.push(`  ${entry.id} <- ${[...new Set(entry.tasks)].join(", ")}`);
  }
  lines.push("");

  lines.push(`uncovered (${report.uncovered.length}):`);
  if (report.uncovered.length === 0) {
    lines.push("  none");
  }
  for (const entry of report.uncovered) {
    lines.push(
      entry.critical
        ? `  CRITICAL ${entry.id} — no task references this ${entry.kind}`
        : `  ${entry.id} (advisory)`,
    );
  }
  lines.push("");

  lines.push(`orphan references (${report.orphans.length}):`);
  if (report.orphans.length === 0) {
    lines.push("  none");
  }
  for (const orphan of report.orphans) {
    lines.push(`  ${orphan.ref} cited by task ${orphan.taskId} but not defined in requirements.md`);
  }
  lines.push("");

  if (!report.evaluable) {
    lines.push(
      "RESULT: CANNOT EVALUATE — requirements.md defines no stable requirement IDs (FR-#/NFR-#/SC-#/AC-#.#/US-#); rewrite it using the templates/requirements.md format",
    );
  } else if (report.ok) {
    lines.push("RESULT: PASS — every FR/SC id has at least one referencing task");
  } else {
    lines.push(
      `RESULT: FAIL — ${report.criticalGaps.length} critical gap(s): ${report.criticalGaps.join(", ")}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
