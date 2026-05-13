import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Byte-equal regression test (3.6) — vs the frozen v6.0.6 baselines in
 * tests/hooks/baselines/v6.0.6/.
 *
 * Strategy:
 *   1. Reprovision the snapshot-spec-state workspaces under /tmp/curdx-fixture-*
 *      (mirrors generate.sh's provision_workspaces step).
 *   2. For each baseline, run the corresponding v7 .mjs bundle with the
 *      matching fixture, capturing combined stdout+stderr+EXIT_CODE in the
 *      same shape generate.sh emitted.
 *   3. Apply normalizations that paper over **intentional v6→v7 divergences**
 *      (additive stdout JSON, JSON pretty-print vs single-line, absolute vs
 *      relative path in `Updated` lines, etc.) — see normalize().
 *   4. Skip on Windows: path-separator and mtime-precision divergence is
 *      explicitly out of byte-equal scope per requirements.
 *
 * If a hook regresses on shape, content, or order, this test fails. The
 * baselines themselves are FROZEN (per task 3.2) — never regenerate from a
 * later v6 release; instead, fix the v7 .mjs port or document the intentional
 * divergence here in normalize().
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const PLUGIN_ROOT = path.join(REPO_ROOT, "plugins/curdx-flow");
const HOOKS_DIR = path.join(PLUGIN_ROOT, "hooks/scripts");
const BASELINE_DIR = path.join(REPO_ROOT, "tests/hooks/baselines/v6.0.6");
const FIXTURE_DIR = path.join(REPO_ROOT, "tests/hooks/fixtures");

const HOOKS = ["load-spec-context", "quick-mode-guard", "stop-watcher", "update-spec-index"] as const;

// ---------------------------------------------------------------------------
// Workspace provisioning (mirror of generate.sh provision_workspaces)
// ---------------------------------------------------------------------------

function provisionWorkspaces(): void {
  // NOTE: We deliberately do NOT `rmSync` the top-level `/tmp/curdx-fixture-*`
  // directories. Other test files (update-spec-index.test.ts) run in parallel
  // forks with `cwd: /tmp/curdx-fixture-*` set on their child processes; if we
  // remove the dir while one of those spawns is starting, Node fails with
  // `ENOENT: process.cwd failed`. Idempotent overwrite via `mkdirSync({recursive})`
  // + `writeFileSync` is enough — every file we read in baselines is rewritten
  // here verbatim before each fork's tests run, so prior mutations are reset.
  // (A fork-level beforeAll runs once per fork, not once per test, so this is
  // correct for byte-equal-only fixture invariance.)
  mkdirSync("/tmp/curdx-fixture-empty", { recursive: true });
  mkdirSync("/tmp/curdx-fixture-transcripts", { recursive: true });
  writeFileSync("/tmp/curdx-fixture-transcripts/empty.txt", "Just some random log text\n");
  writeFileSync(
    "/tmp/curdx-fixture-transcripts/complete.txt",
    "line one\nline two\nline three\nALL_TASKS_COMPLETE\n",
  );

  // Spec mid-execution
  mkdirSync("/tmp/curdx-fixture-spec/specs/demo-spec", { recursive: true });
  writeFileSync("/tmp/curdx-fixture-spec/specs/.current-spec", "demo-spec\n");
  writeFileSync(
    "/tmp/curdx-fixture-spec/specs/demo-spec/.curdx-state.json",
    `{
  "source": "spec",
  "name": "demo-spec",
  "basePath": "./specs/demo-spec",
  "phase": "execution",
  "taskIndex": 1,
  "totalTasks": 3,
  "taskIteration": 1,
  "maxTaskIterations": 5,
  "globalIteration": 5,
  "maxGlobalIterations": 100,
  "commitSpec": true,
  "quickMode": false,
  "awaitingApproval": false,
  "recoveryMode": false,
  "nativeSyncEnabled": false,
  "granularity": "fine"
}
`,
  );
  writeFileSync(
    "/tmp/curdx-fixture-spec/specs/demo-spec/tasks.md",
    `# Demo Tasks

- [x] 1.1 First task
  - **Do**: Step one
  - **Files**: src/a.ts
  - **Done when**: a.ts exists
  - **Verify**: \`test -f src/a.ts\`
  - **Commit**: \`feat(a): add a\`

- [ ] 1.2 Second task
  - **Do**: Step two
  - **Files**: src/b.ts
  - **Done when**: b.ts exists
  - **Verify**: \`test -f src/b.ts\`
  - **Commit**: \`feat(b): add b\`

- [ ] 1.3 Third task
  - **Do**: Step three
  - **Files**: src/c.ts
  - **Done when**: c.ts exists
  - **Verify**: \`test -f src/c.ts\`
  - **Commit**: \`feat(c): add c\`
`,
  );
  writeFileSync(
    "/tmp/curdx-fixture-spec/specs/demo-spec/.progress.md",
    `# Demo Spec Progress

## Original Goal
A frozen demo goal for byte-equal regression testing.

## Completed Tasks
- [x] 1.1 First task - abc1234

## Current Task
1.2 Second task

## Learnings
- Stable fixture snapshot
`,
  );

  // Quick mode spec
  mkdirSync("/tmp/curdx-fixture-quick/specs/quick-spec", { recursive: true });
  writeFileSync("/tmp/curdx-fixture-quick/specs/.current-spec", "quick-spec\n");
  writeFileSync(
    "/tmp/curdx-fixture-quick/specs/quick-spec/.curdx-state.json",
    `{
  "source": "spec",
  "name": "quick-spec",
  "basePath": "./specs/quick-spec",
  "phase": "design",
  "taskIndex": 0,
  "totalTasks": 0,
  "taskIteration": 1,
  "maxTaskIterations": 5,
  "globalIteration": 2,
  "maxGlobalIterations": 100,
  "commitSpec": true,
  "quickMode": true,
  "awaitingApproval": false,
  "recoveryMode": false,
  "nativeSyncEnabled": false,
  "granularity": "fine"
}
`,
  );

  // Corrupt JSON state
  mkdirSync("/tmp/curdx-fixture-corrupt/specs/corrupt-spec", { recursive: true });
  writeFileSync("/tmp/curdx-fixture-corrupt/specs/.current-spec", "corrupt-spec\n");
  writeFileSync(
    "/tmp/curdx-fixture-corrupt/specs/corrupt-spec/.curdx-state.json",
    "{ this is not valid json\n",
  );

  // Completed spec
  mkdirSync("/tmp/curdx-fixture-completed/specs/done-spec", { recursive: true });
  writeFileSync("/tmp/curdx-fixture-completed/specs/.current-spec", "done-spec\n");
  writeFileSync(
    "/tmp/curdx-fixture-completed/specs/done-spec/.curdx-state.json",
    `{
  "source": "spec",
  "name": "done-spec",
  "basePath": "./specs/done-spec",
  "phase": "execution",
  "taskIndex": 2,
  "totalTasks": 2,
  "taskIteration": 1,
  "maxTaskIterations": 5,
  "globalIteration": 4,
  "maxGlobalIterations": 100,
  "commitSpec": true,
  "quickMode": false,
  "awaitingApproval": false,
  "recoveryMode": false,
  "nativeSyncEnabled": false,
  "granularity": "fine",
  "completed":true,
  "completedAt":"2026-01-01T00:00:00.000Z"
}
`,
  );
  writeFileSync(
    "/tmp/curdx-fixture-completed/specs/done-spec/tasks.md",
    `# Done Spec Tasks

- [x] 1.1 First task
  - **Do**: Step one
  - **Done when**: criterion
  - **Verify**: \`true\`
  - **Commit**: \`feat(a): add a\`

- [x] 1.2 Second task
  - **Do**: Step two
  - **Done when**: criterion
  - **Verify**: \`true\`
  - **Commit**: \`feat(b): add b\`
`,
  );
}

// ---------------------------------------------------------------------------
// v7 hook drivers (mirror of generate.sh run_stdin_hook + run_update_spec_index)
// ---------------------------------------------------------------------------

interface CapturedOutput {
  combined: string; // stdout+stderr+EXIT_CODE line, plus generated files for update-spec-index
}

function readFixture(fixturePath: string): { stdin: string; cwd: string; args: string[] } {
  const body = readFileSync(fixturePath, "utf8");
  // Try invocation-spec
  try {
    const parsed = JSON.parse(body);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.cwd === "string" &&
      Array.isArray(parsed.args) &&
      typeof parsed.hookEvent !== "string"
    ) {
      return { stdin: "", cwd: parsed.cwd, args: parsed.args };
    }
  } catch {
    // not JSON → raw stdin (e.g., error-malformed)
  }
  return { stdin: body, cwd: REPO_ROOT, args: [] };
}

function runV7StdinHook(hook: string, fixturePath: string): CapturedOutput {
  const { stdin } = readFixture(fixturePath);
  const bundle = path.join(HOOKS_DIR, `${hook}.mjs`);
  const result = spawnSync("node", [bundle], {
    input: stdin,
    cwd: REPO_ROOT,
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
    encoding: "utf8",
    timeout: 5000,
  });
  return {
    // Order matches v6 generate.sh's `> file 2>&1` interleaving: in practice
    // the v7 .mjs hooks write all stderr context lines BEFORE the final JSON
    // stdout payload (see stop-watcher.ts lines 657-660 vs runHook serialize).
    // We mirror that ordering here so the captured combined output matches the
    // baseline byte-for-byte.
    combined: result.stderr + result.stdout + `EXIT_CODE=${result.status ?? -1}\n`,
  };
}

function runV7UpdateSpecIndex(fixturePath: string): CapturedOutput {
  const { cwd, args } = readFixture(fixturePath);
  const bundle = path.join(HOOKS_DIR, `update-spec-index.mjs`);
  // Clear stale .index from previous runs (mirror generate.sh)
  rmSync(path.join(cwd, "specs/.index"), { recursive: true, force: true });

  const result = spawnSync("node", [bundle, ...args], {
    cwd,
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
    encoding: "utf8",
    timeout: 5000,
  });

  let combined = result.stdout + result.stderr + `EXIT_CODE=${result.status ?? -1}\n`;

  const stateJsonPath = path.join(cwd, "specs/.index/index-state.json");
  const indexMdPath = path.join(cwd, "specs/.index/index.md");
  if (existsSync(stateJsonPath)) {
    combined += `\n--- generated:specs/.index/index-state.json ---\n`;
    combined += readFileSync(stateJsonPath, "utf8");
  }
  if (existsSync(indexMdPath)) {
    combined += `\n--- generated:specs/.index/index.md ---\n`;
    combined += readFileSync(indexMdPath, "utf8");
  }

  return { combined };
}

// ---------------------------------------------------------------------------
// Normalizations — collapse intentional v6→v7 divergences
// ---------------------------------------------------------------------------

/**
 * Normalize a captured output (either from baseline or freshly run v7) so that
 * intentional v6→v7 divergences don't trip the byte-equal diff. Each rule is
 * documented inline with a reference to the relevant progress note.
 *
 * Order matters: JSON pretty-print collapse runs before text-line normalization
 * so re-serialized JSON lines look the same as the v7 single-line emit.
 *
 * NOTE: path-separator normalization (`\\` → `/`) is intentionally OMITTED.
 * It would mangle JSON-escaped newlines (`\n` literals inside `reason` strings)
 * into `/n`, breaking byte-equality of stop-watcher block payloads. The
 * Windows divergence is handled by `it.skipIf(process.platform === "win32")`,
 * not by string substitution.
 */
function normalize(s: string): string {
  let out = s;

  // (1) mtime precision: v6 `stat -f %m` (sec) vs v7 `fs.statSync(p).mtimeMs`
  // (ms). Collapse `"mtime": <digits>` to `"mtime":<NUM>` on both sides.
  out = out.replace(/"mtime"\s*:\s*\d+/g, '"mtime":<NUM>');

  // (2) ISO timestamps anywhere (Z or +00:00). The generate.sh runner already
  // normalized `"updated": "..."` and `**Last updated:** ...` to a fixed
  // sentinel, but defensive sweep catches any new emission site.
  out = out.replace(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})/g,
    "0000-00-00T00:00:00Z",
  );

  // (3) `Updated <abs/rel>/specs/.index/...` line: v6 emitted relative path
  // (`./specs/.index/index-state.json`); v7 emits absolute path (which on macOS
  // becomes `/private/tmp/...` due to symlink resolution). Normalize both
  // sides to a sentinel.
  out = out.replace(
    /^Updated .*?specs\/\.index\/(index-state\.json|index\.md)$/gm,
    "Updated <PATH>/specs/.index/$1",
  );

  // (4) Empty-array JSON pretty-print: v6 jq emitted
  //   "specs": [
  //   ]
  // v7 JSON.stringify emits `"specs": []`. Collapse v6's two-line form to v7's.
  out = out.replace(/\[\n\s*\]/g, "[]");

  // (5) v6 stop-watcher bash bug at line 196: `[: 0\n0: integer expression
  // expected` (printf with embedded newline). Documented in progress note 1.17
  // / 580 — DO NOT silently fix in v7; instead strip the buggy stderr lines
  // from the v6 baseline so byte-equal still passes.
  out = out.replace(
    /^.*stop-watcher\.sh: line \d+: \[: \d+\n\d+: integer expression expected\n/gm,
    "",
  );

  // (6) Claude Code renamed the subagent dispatcher from Task to Agent. The
  // v6 baseline remains frozen, but v7 continuation prompts should teach the
  // current tool name. Normalize the intentional wording drift only for the
  // byte-equal historical diff.
  out = out
    .replace(/via Task tool/g, "via Agent tool")
    .replace(/Delegate via Task tool/g, "Delegate via Agent tool");

  // (7) JSON pretty-print collapse: v6 piped through `jq` which pretty-printed
  // top-level JSON objects (newlines + 2-space indent). v7 emits single-line
  // JSON. Collapse any pretty-printed top-level JSON object/array on its own
  // line(s) into a single line. Detect by lines starting with "{" alone, then
  // join until matching "}" alone.
  out = collapseTopLevelJson(out);

  return out;
}

/**
 * Collapse stand-alone pretty-printed JSON blocks (v6 jq style) into single
 * lines (v7 JSON.stringify style). A "block" starts at a line containing only
 * "{" or "[" and ends at the matching "}" or "]" — naively counted by brace
 * depth. Conservative: only collapses when the block starts at column 0.
 */
function collapseTopLevelJson(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line === "{" || line === "[") {
      // Find matching close at column 0
      let depth = 0;
      let j = i;
      let blockEnd = -1;
      for (; j < lines.length; j++) {
        const cur = lines[j] ?? "";
        for (const ch of cur) {
          if (ch === "{" || ch === "[") depth++;
          else if (ch === "}" || ch === "]") depth--;
        }
        if (depth === 0) {
          blockEnd = j;
          break;
        }
      }
      if (blockEnd >= 0) {
        const block = lines.slice(i, blockEnd + 1).join("\n");
        try {
          const parsed = JSON.parse(block);
          out.push(JSON.stringify(parsed));
          i = blockEnd + 1;
          continue;
        } catch {
          // not valid JSON → leave as-is
        }
      }
    }
    out.push(line);
    i++;
  }
  return out.join("\n");
}

/**
 * Reconcile the additive stdout JSON channel that v7 stdin hooks emit but v6
 * either didn't emit at all (load-spec-context, quick-mode-guard allow path,
 * stop-watcher silent branches) or emitted with fewer keys (quick-mode-guard
 * deny path: v7 wraps the v6 payload in a `{decision, reason, ...v6Keys}`
 * envelope per design 1.12).
 *
 * Behavior:
 *   - If v6 has NO JSON line and v7's first line IS a JSON object → drop the
 *     first line of v7 (additive emission, no equivalent in v6).
 *   - If v6 has a JSON line and v7's matching line is also JSON → parse both,
 *     drop any keys from v7 that v6 doesn't have (provided v6's existing keys
 *     are byte-equal in v7), then re-serialize v7's line.
 *   - Otherwise pass v7 through unchanged.
 */
function reconcileAdditiveJson(v6: string, v7: string): string {
  const v6Lines = v6.split("\n");
  const v7Lines = v7.split("\n");
  const v6JsonIdx = v6Lines.findIndex((line) => /^\s*\{.*\}\s*$/.test(line));

  // Case A: v6 has no JSON line. Drop ALL stand-alone JSON-object lines in v7
  // (the additive emission can land anywhere in the combined output once we
  // interleave stderr-then-stdout).
  if (v6JsonIdx === -1) {
    const filtered = v7Lines.filter((line) => !/^\s*\{.*\}\s*$/.test(line));
    return filtered.join("\n");
  }

  // Case B: v6 has a JSON line. Find the matching JSON line in v7 and
  // sub-set-prune v7's extra top-level keys.
  const v7JsonIdx = v7Lines.findIndex((line) => /^\s*\{.*\}\s*$/.test(line));
  if (v7JsonIdx === -1) return v7;
  let v6Obj: Record<string, unknown>;
  let v7Obj: Record<string, unknown>;
  try {
    v6Obj = JSON.parse(v6Lines[v6JsonIdx] ?? "");
    v7Obj = JSON.parse(v7Lines[v7JsonIdx] ?? "");
  } catch {
    return v7; // not parseable → leave alone
  }
  if (typeof v6Obj !== "object" || v6Obj === null) return v7;
  if (typeof v7Obj !== "object" || v7Obj === null) return v7;

  // Verify all v6 keys exist in v7 with byte-equal serialized values; if so,
  // prune v7 down to v6's key set.
  const v6Keys = Object.keys(v6Obj);
  const allMatch = v6Keys.every(
    (k) => k in v7Obj && JSON.stringify(v7Obj[k]) === JSON.stringify(v6Obj[k]),
  );
  if (!allMatch) return v7; // structural divergence — let the diff fail loudly
  const pruned: Record<string, unknown> = {};
  for (const k of v6Keys) pruned[k] = v7Obj[k];
  v7Lines[v7JsonIdx] = JSON.stringify(pruned);
  return v7Lines.join("\n");
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

beforeAll(() => {
  provisionWorkspaces();
});

describe("byte-equal regression vs v6.0.6 baseline", () => {
  for (const hook of HOOKS) {
    const baselineDir = path.join(BASELINE_DIR, hook);
    let baselineFiles: string[] = [];
    try {
      baselineFiles = readdirSync(baselineDir)
        .filter((f) => f.endsWith(".txt"))
        .sort();
    } catch {
      continue;
    }

    for (const baselineFile of baselineFiles) {
      const fixtureName = baselineFile.replace(/\.txt$/, ".json");
      const fixturePath = path.join(FIXTURE_DIR, hook, fixtureName);
      const baselinePath = path.join(baselineDir, baselineFile);

      it.skipIf(process.platform === "win32")(
        `${hook} / ${baselineFile}`,
        () => {
          if (!existsSync(fixturePath)) {
            throw new Error(`Missing fixture for baseline ${hook}/${baselineFile}: ${fixturePath}`);
          }
          const baseline = readFileSync(baselinePath, "utf8");
          const captured =
            hook === "update-spec-index"
              ? runV7UpdateSpecIndex(fixturePath)
              : runV7StdinHook(hook, fixturePath);

          const normalizedBaseline = normalize(baseline);
          let normalizedV7 = normalize(captured.combined);
          normalizedV7 = reconcileAdditiveJson(normalizedBaseline, normalizedV7);

          expect(normalizedV7).toEqual(normalizedBaseline);
        },
      );
    }
  }
});

// ---------------------------------------------------------------------------
// SubagentStart byte-equal baseline (task 3.2)
//
// The SubagentStart hook is brand new in v7.1.7 — there is NO v6.0.6 baseline
// to diff against. Instead we freeze the CURRENT v7.1.7 output as the
// reference and assert byte-for-byte stability on every future run. Once a
// drift lands, this assertion fails loudly; intentional output changes must
// re-freeze the constant below in the same commit (drift gate, not a
// snapshot-update test).
//
// Fixture: tests/hooks/fixtures/subagent-context-injector/with-spec.json
// Workspace: /tmp/curdx-fixture-spec (provisioned by provisionWorkspaces above
// with phase=execution, taskIndex=1, totalTasks=3, completed=false). The
// frozen baseline below is the exact stdout the hook emits against that
// workspace. Stderr is empty on the happy path (no fail-open trace), and the
// hook exits 0 — captured combined output is therefore stdout + EXIT_CODE
// only, mirroring runV7StdinHook's interleaving contract.
// ---------------------------------------------------------------------------

const SUBAGENT_START_BASELINE =
  '{"hookSpecificOutput":{"hookEventName":"SubagentStart",' +
  '"additionalContext":"<curdx-spec-context>\\n' +
  "phase: execution\\n" +
  "spec: specs/demo-spec\\n" +
  "iron-law: No completion claim without fresh verification.\\n" +
  '</curdx-spec-context>"},"continue":true}\n' +
  "EXIT_CODE=0\n";

describe("byte-equal SubagentStart baseline (frozen v7.1.7 output)", () => {
  it.skipIf(process.platform === "win32")(
    "subagent-context-injector / with-spec.json",
    () => {
      const fixturePath = path.join(
        FIXTURE_DIR,
        "subagent-context-injector",
        "with-spec.json",
      );
      if (!existsSync(fixturePath)) {
        throw new Error(`Missing SubagentStart fixture: ${fixturePath}`);
      }
      const captured = runV7StdinHook(
        "subagent-context-injector",
        fixturePath,
      );
      // No normalize() pass needed — output is fully deterministic (no
      // mtimes, no ISO timestamps, no path separators). Compare verbatim.
      expect(captured.combined).toEqual(SUBAGENT_START_BASELINE);
    },
  );
});

// ---------------------------------------------------------------------------
// StopFailure byte-equal baseline (task 3.5)
//
// Mirrors the SubagentStart frozen-baseline pattern above. The
// stop-failure-handler hook is brand new in v7.1.7 (spec E) — there is NO
// v6.0.6 baseline to diff against. We freeze the CURRENT v7.1.7 output for the
// canonical `{"matcher":"rate_limit"}` stdin and assert byte-for-byte stability
// on every future run. Drift fails loudly; intentional output changes must
// re-freeze the constant below in the same commit (drift gate, not a
// snapshot-update test).
//
// Stdin shape: `{"matcher":"rate_limit"}` — the most common StopFailure
// matcher (Anthropic API 429), exercising the canonical happy path through
// MATCHER_DESCRIPTIONS in src/hooks/stop-failure-handler.ts.
//
// Output contract (from src/hooks/stop-failure-handler.ts):
//   - stdout: empty (FR-H3 — observability hook does not emit stdout)
//   - stderr: `[StopFailure:rate_limit] <description>\n` (em-dash U+2014)
//   - exit  : 0 (fail-open per FR-H5 / NFR-5)
// captured.combined therefore equals stderr + stdout + "EXIT_CODE=0\n",
// mirroring runV7StdinHook's interleaving contract.
//
// We invoke the bundle directly via spawnSync (no fixture file) because the
// hook's stdin is a 2-key literal and it does not consume the
// `{cwd, hookEvent, ...}` envelope that runV7StdinHook's readFixture expects.
// ---------------------------------------------------------------------------

const STOP_FAILURE_BASELINE =
  "[StopFailure:rate_limit] Anthropic API 429 — request throttled\n" +
  "EXIT_CODE=0\n";

describe("byte-equal StopFailure baseline (frozen v7.1.7 output)", () => {
  it.skipIf(process.platform === "win32")(
    "stop-failure-handler / rate_limit",
    () => {
      const bundle = path.join(HOOKS_DIR, "stop-failure-handler.mjs");
      if (!existsSync(bundle)) {
        throw new Error(`Missing StopFailure bundle: ${bundle}`);
      }
      const result = spawnSync("node", [bundle], {
        input: '{"matcher":"rate_limit"}',
        cwd: REPO_ROOT,
        env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
        encoding: "utf8",
        timeout: 5000,
      });
      // Same interleaving as runV7StdinHook: stderr first (the hook writes its
      // observability line to stderr only), then stdout (empty), then the
      // exit-code marker.
      const combined =
        (result.stderr ?? "") +
        (result.stdout ?? "") +
        `EXIT_CODE=${result.status ?? -1}\n`;
      // No normalize() pass needed — output is fully deterministic (no
      // mtimes, no ISO timestamps, no path separators). Compare verbatim.
      expect(combined).toEqual(STOP_FAILURE_BASELINE);
    },
  );
});
