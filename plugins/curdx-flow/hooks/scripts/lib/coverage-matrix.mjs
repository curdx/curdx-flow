import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/_shared/markdown-task-parser.ts
var TASK_LINE_RE = /^- \[[ x]\]/;
var INDENTED_RE = /^  /;
var BLANK_RE = /^\s*$/;
var TASK_HEADER_RE = /^- \[([ x])\]\s+(?:(\d+(?:\.\d+)*)\s+)?(.*)$/;
function normalize(input) {
  if (!input) return "";
  let s = input;
  if (s.charCodeAt(0) === 65279) s = s.slice(1);
  return s.replace(/\r\n?/g, "\n");
}
function trimTrailingBlankLines(lines) {
  let end = lines.length;
  while (end > 0 && BLANK_RE.test(lines[end - 1] ?? "")) end--;
  return lines.slice(0, end);
}
function parseTaskList(markdown) {
  if (!markdown) return [];
  const lines = normalize(markdown).split("\n");
  const tasks = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    const trimmed = trimTrailingBlankLines(current.lines);
    const lineEnd = current.lineStart + trimmed.length - 1;
    tasks.push({
      ...current.meta,
      raw: trimmed.join("\n"),
      lineEnd
    });
    current = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineNo = i + 1;
    if (TASK_LINE_RE.test(line)) {
      flush();
      const m = line.match(TASK_HEADER_RE);
      const completed = m ? m[1] === "x" : false;
      const id = m && m[2] ? m[2] : void 0;
      const title = m && m[3] !== void 0 ? m[3] : line;
      current = {
        lines: [line],
        lineStart: lineNo,
        lineEnd: lineNo,
        meta: { id, title, completed }
      };
      continue;
    }
    if (!current) continue;
    if (INDENTED_RE.test(line) || BLANK_RE.test(line)) {
      current.lines.push(line);
      continue;
    }
    flush();
  }
  flush();
  return tasks;
}

// src/hooks/lib/coverage-matrix.ts
var ID_RE = /(?:FR|NFR|SC|AC|US)-\d+(?:\.\d+)*/g;
var TABLE_DEF_RE = /^ {0,3}\|\s*\*{0,2}((?:FR|NFR)-\d+)\*{0,2}\s*\|/;
var HEADING_DEF_RE = /^#{1,6}\s+\*{0,2}((?:FR|NFR|SC|AC|US)-\d+(?:\.\d+)*)\*{0,2}\s*[:.]?/;
var BULLET_DEF_RE = /^\s*[-*]\s+\*{0,2}((?:FR|NFR|SC|AC|US)-\d+(?:\.\d+)*)\*{0,2}\s*[:.]/;
var FOOTNOTE_RE = /_Requirements:\s*([^_]*)_/g;
var CRITICAL_KINDS = /* @__PURE__ */ new Set(["FR", "SC"]);
function kindOf(id) {
  return id.slice(0, id.indexOf("-"));
}
function parseRequirementIds(requirementsText) {
  if (!requirementsText) return [];
  const lines = requirementsText.replace(/\r\n?/g, "\n").split("\n");
  const seen = /* @__PURE__ */ new Set();
  const defs = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const match = line.match(TABLE_DEF_RE) ?? line.match(HEADING_DEF_RE) ?? line.match(BULLET_DEF_RE);
    const id = match?.[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    defs.push({ id, kind: kindOf(id), line: i + 1 });
  }
  return defs;
}
function parseTaskRequirementRefs(tasksText) {
  const tasks = parseTaskList(tasksText);
  return tasks.map((task, index) => {
    const refs = /* @__PURE__ */ new Set();
    for (const footnote of task.raw.matchAll(FOOTNOTE_RE)) {
      for (const ref of (footnote[1] ?? "").matchAll(ID_RE)) {
        refs.add(ref[0]);
      }
    }
    return {
      taskId: task.id ?? `#${index + 1}`,
      taskTitle: task.title,
      completed: task.completed,
      refs: [...refs]
    };
  });
}
function buildCoverageReport(input) {
  const requirements = parseRequirementIds(input.requirementsText);
  const taskRefs = parseTaskRequirementRefs(input.tasksText);
  const known = new Set(requirements.map((def) => def.id));
  const tasksByRequirement = /* @__PURE__ */ new Map();
  const orphans = [];
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
  const covered = [];
  const uncovered = [];
  for (const def of requirements) {
    const tasks = tasksByRequirement.get(def.id) ?? [];
    const entry = {
      id: def.id,
      kind: def.kind,
      critical: CRITICAL_KINDS.has(def.kind),
      tasks
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
    orphans
  };
}
function renderCoverageReport(report, specName) {
  const lines = [];
  const byKind = /* @__PURE__ */ new Map();
  for (const def of report.requirements) {
    byKind.set(def.kind, (byKind.get(def.kind) ?? 0) + 1);
  }
  const kindSummary = [...byKind.entries()].map(([kind, count]) => `${kind} ${count}`).join(", ");
  lines.push(`coverage: ${specName}`);
  lines.push("");
  lines.push(
    `requirements: ${report.requirements.length}${kindSummary ? ` (${kindSummary})` : ""}`
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
      entry.critical ? `  CRITICAL ${entry.id} \u2014 no task references this ${entry.kind}` : `  ${entry.id} (advisory)`
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
      "RESULT: CANNOT EVALUATE \u2014 requirements.md defines no stable requirement IDs (FR-#/NFR-#/SC-#/AC-#.#/US-#); rewrite it using the templates/requirements.md format"
    );
  } else if (report.ok) {
    lines.push("RESULT: PASS \u2014 every FR/SC id has at least one referencing task");
  } else {
    lines.push(
      `RESULT: FAIL \u2014 ${report.criticalGaps.length} critical gap(s): ${report.criticalGaps.join(", ")}`
    );
  }
  lines.push("");
  return lines.join("\n");
}
export {
  buildCoverageReport,
  parseRequirementIds,
  parseTaskRequirementRefs,
  renderCoverageReport
};
//# sourceMappingURL=coverage-matrix.mjs.map
