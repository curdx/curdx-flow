import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/lib/count-tasks.ts
import { readFileSync, existsSync } from "node:fs";

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

// src/hooks/lib/count-tasks.ts
function main() {
  const args = process.argv.slice(2);
  const tasksFile = args[0];
  if (tasksFile === void 0) {
    process.stderr.write("usage: count-tasks <tasks.md>\n");
    process.exit(1);
  }
  if (!existsSync(tasksFile)) {
    process.stderr.write(
      `count-tasks: tasks file not found: ${tasksFile}
`
    );
    process.exit(1);
  }
  let raw;
  try {
    raw = readFileSync(tasksFile, "utf8");
  } catch (err) {
    process.stderr.write(
      `count-tasks: failed to read ${tasksFile}: ${err.message}
`
    );
    process.exit(1);
  }
  const tasks = parseTaskList(raw);
  const total = tasks.length;
  const completed = tasks.reduce((n, t) => n + (t.completed ? 1 : 0), 0);
  const pending = total - completed;
  process.stdout.write(JSON.stringify({ total, completed, pending }) + "\n");
}
main();
//# sourceMappingURL=count-tasks.mjs.map
