import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runHook } from "./_helpers.js";
import { createFixtureSpec, type FixtureSpec } from "./_fixture-setup.js";

/**
 * update-spec-index reads cwd from the fixture (or options.cwd override),
 * ignores stdin, and writes specs/.index/{index-state.json,index.md} as a
 * side-effect. Each test cleans the index dir before running so assertions
 * reflect this invocation only.
 *
 * Cross-platform fix (v7.0.0-beta.1): pre-fix the fixtures embedded
 * `/tmp/curdx-fixture-spec` etc. as `cwd` — those paths exist on the macOS
 * dev box but not on Windows runners. Now each test creates its own temp dir
 * via `createFixtureSpec()` and passes it via `runHook(..., { cwd })` which
 * takes precedence over the fixture's `cwd` field.
 */
function cleanIndex(cwd: string) {
  const indexDir = path.join(cwd, "specs/.index");
  if (existsSync(indexDir)) {
    rmSync(indexDir, { recursive: true, force: true });
  }
}

describe("update-spec-index (CLI hook for spec index regeneration)", () => {
  let withSpec: FixtureSpec;
  let emptyCwd: FixtureSpec;

  beforeEach(() => {
    withSpec = createFixtureSpec();
    emptyCwd = createFixtureSpec({ noCurrentSpec: true });
  });

  afterEach(() => {
    withSpec.cleanup();
    emptyCwd.cleanup();
  });

  it("happy: cwd has one spec → exit 0, stderr 'Updated' lines, index files written with spec entry", () => {
    cleanIndex(withSpec.cwd);
    const r = runHook(
      "update-spec-index",
      "tests/hooks/fixtures/update-spec-index/with-spec.json",
      { cwd: withSpec.cwd },
    );
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain("Updated");
    expect(r.stderr).toContain("1 specs in 1 directories");

    const stateJson = JSON.parse(
      readFileSync(path.join(withSpec.cwd, "specs/.index/index-state.json"), "utf8"),
    );
    expect(stateJson.specs).toHaveLength(1);
    expect(stateJson.specs[0]).toMatchObject({
      name: "demo-spec",
      phase: "execution",
      taskIndex: 1,
      totalTasks: 3,
    });
  });

  it("edge: empty cwd with --quiet → exit 0, no stderr 'Updated' chatter, but files still written", () => {
    cleanIndex(emptyCwd.cwd);
    const r = runHook(
      "update-spec-index",
      "tests/hooks/fixtures/update-spec-index/empty-quiet.json",
      { cwd: emptyCwd.cwd },
    );
    expect(r.exitCode).toBe(0);
    // --quiet suppresses the "Updated ..." progress lines
    expect(r.stderr).not.toContain("Updated");
    // Side-effect still runs
    expect(existsSync(path.join(emptyCwd.cwd, "specs/.index/index-state.json"))).toBe(true);
    const stateJson = JSON.parse(
      readFileSync(path.join(emptyCwd.cwd, "specs/.index/index-state.json"), "utf8"),
    );
    expect(stateJson.specs).toHaveLength(0);
  });

  it("error: bogus argv flags → exit 0 (FR-8 never block) and still produces output", () => {
    cleanIndex(emptyCwd.cwd);
    const r = runHook(
      "update-spec-index",
      "tests/hooks/fixtures/update-spec-index/error-bogus-args.json",
      { cwd: emptyCwd.cwd },
    );
    expect(r.exitCode).toBe(0);
    // The hook must not crash on unknown flags; index should still be written
    expect(existsSync(path.join(emptyCwd.cwd, "specs/.index/index-state.json"))).toBe(true);
  });

  /**
   * Regression: AC-checklist pollution.
   *
   * Pre-fix: v6's loose `- [.]` regex counted any markdown checkbox, so the
   * `- [ ] AC-1.1` lines that task-planner's V6 task body emits inflated the
   * task denominator and produced misleading `0/N` reports.
   *
   * Post-fix: progress regex requires a task-id token (1.1, V1, VE1, VF) and
   * explicitly excludes AC/FR/NFR/US prefixes, so AC entries are ignored.
   */
  it("regression: AC-checklist `- [ ] AC-X.Y` lines must NOT inflate task counts", () => {
    cleanIndex(withSpec.cwd);
    const specDir = path.join(withSpec.cwd, "specs", withSpec.specName);
    // Drop the state file so the fallback parser is exercised.
    rmSync(path.join(specDir, ".curdx-state.json"), { force: true });
    writeFileSync(
      path.join(specDir, "tasks.md"),
      "# Tasks\n" +
        "\n" +
        "- [x] 1.1 First task\n" +
        "- [x] 1.2 Second task\n" +
        "- [x] V1 [VERIFY] Quality checkpoint\n" +
        "  - **AC checklist**:\n" +
        "    - [ ] AC-1.1 — covered by test_default_name\n" +
        "    - [ ] AC-1.2 — covered by test_explicit_name\n" +
        "    - [ ] AC-2.1 — covered by E2E smoke\n" +
        "    - [ ] FR-1 — argparse parsing\n" +
        "    - [ ] NFR-1 — stdlib only\n",
    );

    const r = runHook(
      "update-spec-index",
      "tests/hooks/fixtures/update-spec-index/with-spec.json",
      { cwd: withSpec.cwd },
    );
    expect(r.exitCode).toBe(0);

    const stateJson = JSON.parse(
      readFileSync(path.join(withSpec.cwd, "specs/.index/index-state.json"), "utf8"),
    );
    expect(stateJson.specs[0]).toMatchObject({
      phase: "completed",
      taskIndex: 3,
      totalTasks: 3,
    });
  });

  /**
   * Regression: test003/specs/helloworld reality (May 2026).
   *
   * Real-world fail mode: an LLM emitted tasks.md using `### Task X.Y …`
   * headlines AND the V6 AC checklist as `- [ ] AC-X.Y` items, with no
   * standard list-item tasks. Pre-fix output was `0/10 in tasks phase`.
   *
   * Post-fix: regex matches zero tasks (AC items excluded, headlines not
   * tracked); fallback recognizes `.progress.md` presence as the
   * "implement loop already cleaned up state on success" signal and
   * reports `phase: completed` without fabricating counts.
   */
  it("regression: test003-style headline tasks + AC pollution + .progress.md → phase=completed, no fake counts", () => {
    cleanIndex(withSpec.cwd);
    const specDir = path.join(withSpec.cwd, "specs", withSpec.specName);
    rmSync(path.join(specDir, ".curdx-state.json"), { force: true });
    writeFileSync(
      path.join(specDir, "tasks.md"),
      "# Tasks: helloworld\n" +
        "\n" +
        "## Phase 1: Make It Work (POC)\n" +
        "\n" +
        "### Task 1.1: Implement CLI package and unittest suite [x]\n" +
        "\n" +
        "### Task 1.2: [VERIFY] Quality checkpoint — full unittest suite green\n" +
        "\n" +
        "## Phase 4: Quality Gates\n" +
        "\n" +
        "### Task 4.1: [VERIFY] E2E shell smoke — real CLI process\n" +
        "\n" +
        "### Task 4.2: [VERIFY] Final quality-gate sweep — tests + smoke + AC checklist\n" +
        "\n" +
        "**AC checklist** (all must be ticked):\n" +
        "- [ ] AC-1.1 — covered by Task 4.1 + step 2 above\n" +
        "- [ ] AC-1.2 — exit 0 on default invocation\n" +
        "- [ ] AC-1.3 — `main([])` writes `hello, world\\n`\n" +
        "- [ ] AC-2.1 — `--name Alice` prints `hello, Alice\\n`\n" +
        "- [ ] AC-2.2 — `main([\"--name\",\"Alice\"])`\n" +
        "- [ ] AC-2.3 — `main([\"--name\",\"\"])`\n" +
        "- [ ] AC-3.1 — `unittest discover` exits 0\n" +
        "- [ ] AC-3.2 — suite contains 3 named tests\n" +
        "- [ ] AC-3.3 — exact-string asserts incl. `\\n`\n" +
        "- [ ] AC-3.4 — stdlib-only imports\n",
    );
    // .progress.md is already written by the fixture helper, simulating the
    // post-implement state where state.json was deleted on success.

    const r = runHook(
      "update-spec-index",
      "tests/hooks/fixtures/update-spec-index/with-spec.json",
      { cwd: withSpec.cwd },
    );
    expect(r.exitCode).toBe(0);

    const stateJson = JSON.parse(
      readFileSync(path.join(withSpec.cwd, "specs/.index/index-state.json"), "utf8"),
    );
    expect(stateJson.specs[0].phase).toBe("completed");
    // Honesty contract: when the regex can't recognize any task lines we do
    // NOT fabricate `taskIndex` / `totalTasks` from AC items.
    expect(stateJson.specs[0].taskIndex).toBeUndefined();
    expect(stateJson.specs[0].totalTasks).toBeUndefined();
  });
});
