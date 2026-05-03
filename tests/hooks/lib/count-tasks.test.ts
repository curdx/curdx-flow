import { describe, it, expect } from "vitest";
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runLib, makeTmpDir } from "./_lib-helpers.js";

describe("count-tasks", () => {
  it("happy: counts checked + unchecked tasks in tasks.md", () => {
    const dir = makeTmpDir("counttasks");
    const tasks = path.join(dir, "tasks.md");
    writeFileSync(
      tasks,
      "- [x] 1.1 done\n  - **Do**: a\n- [ ] 1.2 pending\n  - **Do**: b\n- [ ] 1.3 pending\n  - **Do**: c\n",
    );
    try {
      const r = runLib("count-tasks", [tasks]);
      expect(r.exitCode).toBe(0);
      expect(r.json).toEqual({ total: 3, completed: 1, pending: 2 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("missing file → exit 1 with stderr", () => {
    const dir = makeTmpDir("counttasks-missing");
    try {
      const r = runLib("count-tasks", [path.join(dir, "nope.md")]);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toMatch(/tasks file not found/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
