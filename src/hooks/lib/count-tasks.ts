import { readFileSync, existsSync } from "node:fs";
import { parseTaskList } from "../_shared/markdown-task-parser.js";

function main(): void {
  const args = process.argv.slice(2);
  const tasksFile = args[0];
  if (tasksFile === undefined) {
    process.stderr.write("usage: count-tasks <tasks.md>\n");
    process.exit(1);
  }

  if (!existsSync(tasksFile)) {
    process.stderr.write(
      `count-tasks: tasks file not found: ${tasksFile}\n`,
    );
    process.exit(1);
  }

  let raw: string;
  try {
    raw = readFileSync(tasksFile, "utf8");
  } catch (err) {
    process.stderr.write(
      `count-tasks: failed to read ${tasksFile}: ${(err as Error).message}\n`,
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
