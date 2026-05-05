/**
 * Cross-platform fixture spec creator for hook smoke tests.
 *
 * Pre-v7.0.0-beta.1 the hook fixtures embedded hardcoded `/tmp/curdx-fixture-*`
 * paths in their JSON envelopes. Those dirs were created (out-of-band) on the
 * macOS dev box during task 3.2 baseline generation, so tests passed locally —
 * but on the Windows GitHub runner `/tmp/curdx-fixture-*` does not exist, so
 * `path-resolver.resolveCurrent()` returned null and 5 hook tests failed.
 *
 * Fix (Bug 2 in fix-task v7.0.0-beta.1): each test that needs a spec-on-disk
 * fixture creates its own temp dir via `os.tmpdir()` + `mkdtempSync` and tears
 * it down in afterEach. The hook is invoked with `runHook(..., { cwd })` and
 * the helper rewrites the fixture's `cwd` field in stdin to point at the
 * freshly created temp dir.
 *
 * Lifetime contract: every `createFixtureSpec(...)` call MUST be paired with
 * either an `afterEach(() => spec.cleanup())` or a try/finally — otherwise
 * the OS temp dir leaks. Vitest's process-wide cleanup is best-effort only.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export interface FixtureSpec {
  /** Absolute path to the temp dir that hosts a `specs/` subdirectory. */
  cwd: string;
  /** The spec name (also serves as `specs/<name>/` subdir). */
  specName: string;
  /** Cleanup function — call from afterEach. */
  cleanup: () => void;
}

export interface CreateFixtureOptions {
  /** Spec name (default: "demo-spec"). */
  specName?: string;
  /**
   * Partial `.curdx-state.json` content. Defaults are applied for fields not
   * provided: phase=execution, taskIndex=1, totalTasks=3 — matching the
   * pre-fix `/tmp/curdx-fixture-spec/specs/demo-spec/.curdx-state.json` shape.
   */
  state?: Record<string, unknown>;
  /**
   * Skip writing `.current-spec` (creates an "empty" cwd with just specs/).
   * Used by tests that exercise the no-active-spec branch.
   */
  noCurrentSpec?: boolean;
  /**
   * Skip writing `.curdx-state.json` (creates a cwd with `.current-spec`
   * pointing at a spec dir that exists but has no state file). Used by
   * tests that exercise the missing-state-file branch.
   */
  noStateFile?: boolean;
  /**
   * Skip writing tasks.md (when only state is needed). Defaults to false.
   */
  noTasksFile?: boolean;
  /**
   * Optional `.progress.md` body. When omitted a minimal goal-bearing body
   * is written so the goal-extraction code path is exercised.
   */
  progressBody?: string;
}

const DEFAULT_STATE = {
  source: "spec" as const,
  name: "demo-spec",
  basePath: "./specs/demo-spec",
  phase: "execution",
  taskIndex: 1,
  totalTasks: 3,
  taskIteration: 1,
  maxTaskIterations: 5,
  globalIteration: 5,
  maxGlobalIterations: 100,
  commitSpec: true,
  quickMode: false,
  awaitingApproval: false,
  recoveryMode: false,
  nativeSyncEnabled: false,
  granularity: "fine",
  completed: false,
};

/**
 * Build a legacy v7.0.x-shaped state object with NO `completed` key at all.
 *
 * Pre-v7.1.0 state files predate the completion marker — the `completed` field
 * did not exist on the wire. NFR-2 backwards-compat requires that all v7.1.0
 * readers treat such states as "in progress" (strict-equality `=== true` guard
 * against the absent key, which surfaces as `undefined`).
 *
 * Unlike spreading `DEFAULT_STATE` (which now carries `completed: false` from
 * task 1.7), this helper builds the v7.0.x shape from scratch so the absence
 * of the key is explicit on disk — `JSON.stringify` cannot drop a key that
 * was never set, making the legacy shape unambiguous.
 *
 * Override semantics: `overrides` is shallow-merged AFTER the base, so callers
 * can pin a different `phase`, `taskIndex`, etc. for their scenario. Passing
 * `completed` here defeats the purpose; use `createFixtureSpec({state:...})`
 * if you want a v7.1.0-shaped state.
 */
export function createLegacyState(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    source: "spec" as const,
    name: "demo-spec",
    basePath: "./specs/demo-spec",
    phase: "execution",
    taskIndex: 1,
    totalTasks: 3,
    taskIteration: 1,
    maxTaskIterations: 5,
    globalIteration: 5,
    maxGlobalIterations: 100,
    commitSpec: true,
    quickMode: false,
    awaitingApproval: false,
    recoveryMode: false,
    nativeSyncEnabled: false,
    granularity: "fine",
    // NOTE: no `completed` key — this is the legacy v7.0.x shape.
    ...overrides,
  };
}

const DEFAULT_TASKS_MD =
  "# Demo Tasks\n" +
  "\n" +
  "- [x] 1.1 First task\n" +
  "  - **Do**: Step one\n" +
  "  - **Files**: src/a.ts\n" +
  "  - **Done when**: a.ts exists\n" +
  "  - **Verify**: `test -f src/a.ts`\n" +
  "  - **Commit**: `feat(a): add a`\n" +
  "\n" +
  "- [ ] 1.2 Second task\n" +
  "  - **Do**: Step two\n" +
  "  - **Files**: src/b.ts\n" +
  "  - **Done when**: b.ts exists\n" +
  "  - **Verify**: `test -f src/b.ts`\n" +
  "  - **Commit**: `feat(b): add b`\n" +
  "\n" +
  "- [ ] 1.3 Third task\n" +
  "  - **Do**: Step three\n" +
  "  - **Files**: src/c.ts\n" +
  "  - **Done when**: c.ts exists\n" +
  "  - **Verify**: `test -f src/c.ts`\n" +
  "  - **Commit**: `feat(c): add c`\n";

const DEFAULT_PROGRESS_MD =
  "# Demo Spec Progress\n" +
  "\n" +
  "## Original Goal\n" +
  "A frozen demo goal for byte-equal regression testing.\n" +
  "\n" +
  "## Completed Tasks\n" +
  "- [x] 1.1 First task - abc1234\n" +
  "\n" +
  "## Current Task\n" +
  "1.2 Second task\n" +
  "\n" +
  "## Learnings\n" +
  "- Stable fixture snapshot\n";

/**
 * Create a self-contained spec fixture in a fresh OS temp dir.
 *
 * Layout produced (defaults):
 *   <tmp>/specs/.current-spec        -> "demo-spec\n"
 *   <tmp>/specs/demo-spec/.curdx-state.json
 *   <tmp>/specs/demo-spec/tasks.md
 *   <tmp>/specs/demo-spec/.progress.md
 *
 * Returns the cwd to pass into `runHook(..., { cwd })` and a `cleanup()` to
 * call from `afterEach`. The helper does NOT register cleanup automatically.
 */
export function createFixtureSpec(
  opts: CreateFixtureOptions = {},
): FixtureSpec {
  const cwd = mkdtempSync(path.join(tmpdir(), "curdx-fixture-"));
  const specsDir = path.join(cwd, "specs");
  mkdirSync(specsDir, { recursive: true });

  const specName = opts.specName ?? "demo-spec";

  if (!opts.noCurrentSpec) {
    writeFileSync(path.join(specsDir, ".current-spec"), specName);
    const specDir = path.join(specsDir, specName);
    mkdirSync(specDir, { recursive: true });

    if (!opts.noStateFile) {
      const merged = { ...DEFAULT_STATE, name: specName, ...opts.state };
      writeFileSync(
        path.join(specDir, ".curdx-state.json"),
        JSON.stringify(merged, null, 2),
      );
    }
    if (!opts.noTasksFile) {
      writeFileSync(path.join(specDir, "tasks.md"), DEFAULT_TASKS_MD);
    }
    writeFileSync(
      path.join(specDir, ".progress.md"),
      opts.progressBody ?? DEFAULT_PROGRESS_MD,
    );
  }

  return {
    cwd,
    specName,
    cleanup: () => {
      try {
        rmSync(cwd, { recursive: true, force: true });
      } catch {
        /* best-effort — Windows occasionally locks files */
      }
    },
  };
}
