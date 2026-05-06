/**
 * CLI `check` subcommand tests (Task 3.9).
 *
 * Spec: spec-verification-iron-law (tasks.md Task 3.9).
 *
 * Spawns `node dist/index.mjs check` against hand-built tmpdir fixtures
 * to exercise the two canonical paths the gate guards:
 *   (1) `verificationBlocks` present + valid     → exit 0, stdout headline
 *   (2) `verificationBlocks` present but empty {} → exit 2, stderr actionable
 *
 * Note on "missing verificationBlocks":
 *   The check lib (`src/hooks/lib/check-verification-blocks.ts`) treats two
 *   shapes differently:
 *     - field WHOLLY ABSENT (`undefined`)     → exit 0 (graceful no-op,
 *       "treat as initial state, predates iron-law").
 *     - field present but EMPTY OBJECT (`{}`) → exit 2 (regression: someone
 *       wiped the blocks but kept the field).
 *   Task 3.9 step 3 calls "missing verificationBlocks → exits 2"; per the
 *   gate's design (Task 2.21 self-bootstrap branch), the failure case is the
 *   empty-object shape. We use `verificationBlocks: {}` to trip exit 2 — that
 *   matches the lib's documented "regression signal" semantics.
 *
 * Build prerequisite (task step 4):
 *   `beforeAll` runs `npm run build` to (re)generate `dist/index.mjs`.
 *   `dist/index.mjs` calls `assertFreshLocalBuild()` early — without a fresh
 *   build, any src .ts edit since the last build would make the CLI throw.
 *
 * Cross-platform (AC-7.4 / 7.5):
 *   - tmpdir via `mkdtempSync(os.tmpdir(), ...)` — never hardcode `/tmp`.
 *   - all stderr/stdout assertions normalize CRLF to LF before matching.
 *
 * Glob coverage note:
 *   `vitest.config.ts` `include` covers `tests` recursively, so this file
 *   is discovered by both `npx vitest run` and any `vitest run tests/cli/...`.
 *   The repo's `npm run test:hooks` script narrows to `tests/hooks` only,
 *   matching the pattern already used by `tests/runner/` and
 *   `tests/analyze/`. Verified separately via `npx vitest run tests/cli/`.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const CLI_ENTRY = path.join(REPO_ROOT, "dist", "index.mjs");

/** Normalize stderr/stdout for cross-platform string assertions (AC-7.5). */
function normalize(s: string): string {
  return s.replace(/\r\n/g, "\n");
}

/**
 * Build a one-shot tmpdir fixture that contains:
 *   <tmpdir>/specs/.current-spec               (pointer file)
 *   <tmpdir>/specs/<specName>/.curdx-state.json (state with given blocks)
 *
 * Returns the tmpdir path; caller is responsible for `rmSync` cleanup.
 */
function makeFixture(opts: {
  specName: string;
  verificationBlocks: unknown; // include the literal shape — could be {} or {execution:{...}}
}): string {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), "curdx-cli-check-"));
  const specsDir = path.join(fixtureDir, "specs");
  const specDir = path.join(specsDir, opts.specName);
  mkdirSync(specDir, { recursive: true });

  // Pointer so resolveActiveSpecDir picks the fixture spec deterministically.
  writeFileSync(path.join(specsDir, ".current-spec"), opts.specName);

  // Minimal state with the requested verificationBlocks shape spliced in.
  // Other fields mirror the canonical state shape so any future schema
  // tightening doesn't false-fail this fixture; the gate only inspects the
  // verificationBlocks subtree.
  const state = {
    source: "spec",
    name: opts.specName,
    basePath: `./specs/${opts.specName}`,
    phase: "execution",
    taskIndex: 1,
    totalTasks: 1,
    taskIteration: 1,
    maxTaskIterations: 5,
    globalIteration: 1,
    maxGlobalIterations: 100,
    commitSpec: true,
    quickMode: false,
    awaitingApproval: false,
    recoveryMode: false,
    nativeSyncEnabled: false,
    granularity: "fine",
    completed: false,
    verificationBlocks: opts.verificationBlocks,
  };
  writeFileSync(
    path.join(specDir, ".curdx-state.json"),
    JSON.stringify(state, null, 2),
  );
  return fixtureDir;
}

/** Spawn `node dist/index.mjs check` against the given cwd. */
function spawnCheck(cwd: string) {
  const result = spawnSync("node", [CLI_ENTRY, "check"], {
    cwd,
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env },
  });
  return {
    status: result.status,
    stdout: normalize(result.stdout ?? ""),
    stderr: normalize(result.stderr ?? ""),
  };
}

describe("CLI `check` subcommand (Task 3.9)", () => {
  // Task step 4: ensure dist/index.mjs is fresh before spawning. Running
  // `npm run build` once for the suite is far cheaper than per-test rebuilds.
  beforeAll(() => {
    const built = spawnSync("npm", ["run", "build"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 120_000,
      env: { ...process.env },
    });
    if (built.status !== 0) {
      throw new Error(
        `prerequisite \`npm run build\` failed (status=${String(built.status)}):\n` +
          `stdout:\n${built.stdout ?? ""}\n` +
          `stderr:\n${built.stderr ?? ""}`,
      );
    }
  }, 120_000);

  it("exits 0 when verificationBlocks contains a valid block", () => {
    // Build a valid execution block: exitCode 0, well-formed timestamp,
    // srcMtime that predates the verification (verification ran AFTER the
    // last src edit — the freshness contract).
    const now = Date.now();
    const block = {
      command: "npm run verify",
      exitCode: 0,
      timestamp: new Date(now).toISOString(),
      srcMtime: now - 60_000, // 1 minute before timestamp → not stale
    };
    const fixtureDir = makeFixture({
      specName: "valid-fixture",
      verificationBlocks: { execution: block },
    });
    try {
      const r = spawnCheck(fixtureDir);
      expect(r.status, `unexpected exit\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0);
      // Canonical pass headline goes to stdout; spec/phase info to stderr.
      expect(r.stdout).toContain("All verificationBlocks valid.");
      // Phase echo lives in stderr (informational), confirms the right block
      // was inspected — guards against false-positive "skipped" passes.
      expect(r.stderr).toContain("execution");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("exits 2 with actionable stderr when verificationBlocks is empty", () => {
    // verificationBlocks: {} = "field present but no phases recorded" — per
    // the gate's design this is a regression signal, not initial-state.
    const fixtureDir = makeFixture({
      specName: "empty-fixture",
      verificationBlocks: {},
    });
    try {
      const r = spawnCheck(fixtureDir);
      expect(r.status, `unexpected exit\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(2);
      // Stderr must be actionable: the canonical message points the user at
      // both the failing spec and the reference doc with the recovery cookbook.
      expect(r.stderr).toContain("No verificationBlocks found");
      expect(r.stderr).toContain("empty-fixture");
      expect(r.stderr).toContain("iron-law-verification.md");
      // Stdout must NOT carry the success headline — guards against the lib
      // accidentally writing the pass message on the failure branch.
      expect(r.stdout).not.toContain("All verificationBlocks valid.");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
