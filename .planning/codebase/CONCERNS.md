# Codebase Concerns

**Analysis Date:** 2026-05-19

---

## Tech Debt

### `analyze_internal_error` missing from `EventKind` union

- **Issue:** `recommend.ts` and `cost.ts` both note in comments that internal rule errors should route to `logHookEvent({kind:'analyze_internal_error'})` but that kind does not exist in the closed `EventKind` union in `error-logger.ts`. Until it is added, rule-level exceptions silently degrade to no findings with no structured log trace.
- **Files:**
  - `src/analyze/recommend.ts:13` — file-level comment deferral
  - `src/analyze/recommend.ts:677` — inline comment inside rule catch block
  - `src/analyze/cost.ts:335` — inline comment
  - `src/hooks/_shared/error-logger.ts:102–113` — `EventKind` union (gap visible)
- **Impact:** Silent failure of analysis rules goes undetected in production. When a rule throws, the full recommendation surface for that rule disappears with no log evidence.
- **Severity:** Medium
- **Effort:** S — add `'analyze_internal_error'` to `EventKind`, update `KNOWN_KINDS`, call `logHookEvent` in the two catch blocks.

---

### Dual `project-topology.ts` implementations with no shared contract

- **Issue:** Two independent implementations of project topology discovery exist in parallel:
  - `src/hooks/lib/project-topology.ts` (825 lines) — synchronous, used by all hook scripts
  - `src/runtime/discovery/project-topology.ts` (757 lines) — async, used by the runtime subsystem
  They solve the same problem (locate project roots, detect frameworks, assess workspace state) but share no types, no tests, and no cross-import.
- **Files:**
  - `src/hooks/lib/project-topology.ts`
  - `src/runtime/discovery/project-topology.ts`
  - `src/runtime/discovery/types.ts`
- **Impact:** Any change to topology logic (e.g., new framework detection, new root kind) must be applied twice. Divergence is already observable in type names (`CodeRoot` vs `ProjectRootTopology`, `ProjectTopology` vs `RuntimeTopology`).
- **Severity:** Medium
- **Effort:** L — define a shared `TopologyCore` contract and migrate one implementation to re-export from the other.

---

### `runner/` module has near-zero test coverage

- **Issue:** `src/runner/` (state.ts 297 lines, claudeMd.ts 244 lines, ensureBun.ts 77 lines, exec.ts 50 lines, buildFreshness.ts 62 lines) is tested by a single file `tests/runner/capabilities.test.ts` (114 lines). The file mutation logic in `claudeMd.ts` (`upsertBlock`, `removeBlock`, `syncClaudeMd`) that writes to `~/.claude/CLAUDE.md` has no dedicated unit tests.
- **Files:**
  - `src/runner/claudeMd.ts:171–212` — `syncClaudeMd` and `upsertBlock`
  - `src/runner/state.ts` — plugin/MCP cache management
  - `tests/runner/capabilities.test.ts` — only existing test
- **Impact:** Regressions in `~/.claude/CLAUDE.md` mutation are not caught until end-to-end smoke tests. The `d77e537` commit (labelled "fix bug") deleted 188 files including previous `tests/runner/` test files, removing coverage that once existed.
- **Severity:** Medium
- **Effort:** M — restore or rewrite unit tests for `upsertBlock`, `removeBlock`, `syncClaudeMd`, and `state.ts` cache logic.

---

### Hook source files have almost no dedicated unit tests

- **Issue:** `src/hooks/` contains 45 TypeScript source files. The `tests/hooks/` directory contains only 2 test files (`hook-boundary.test.ts` and `smart-route-runtime.test.ts`). Critical logic files with no test coverage include: `auto-policy.ts`, `dev-runtime.ts`, `execution-brief.ts`, `goal-bridge.ts`, `last-mile-orchestrator.ts`, `merge-state.ts`, `stack-capabilities.ts`, `runtime-cli.ts`, and `project-topology.ts`.
- **Files:** `tests/hooks/` — all present tests
- **Impact:** The three most-recently fixed hooks (`dev-runtime.ts`, `runtime-cli.ts`, `auto-policy.ts`) are tested only via the 21-line addition in `smart-route-runtime.test.ts`. Regression risk is high on future refactors.
- **Severity:** High
- **Effort:** L — systematic test addition across the hook library modules.

---

### `d77e537` ("fix bug") bulk-deleted 188 files including test coverage and docs

- **Issue:** Commit `d77e537` is labelled "fix bug" but deleted 188 files totalling 32,769 lines including `CHANGELOG.md`, `README.md`, `README.zh-CN.md`, `docs/MIGRATION-V7.md`, all architecture SVGs, multiple `tests/runner/` files, `specs/.index/`, and plugin files. This is structurally a "fork takeover" cleanup but leaves the repository with no changelog, no user-facing migration docs, and no clear audit trail of what was intentionally removed versus accidentally deleted. The `README.md` and `docs/` are now being regenerated (both appear as untracked in current `git status`).
- **Files:** All in the commit diff of `d77e537`
- **Impact:** `CHANGELOG.md` is missing from published npm package (listed in `package.json#files`). Migration path from v6→v7 is undocumented. `docs/assets/readme` is about to be added to `package.json#files` in the uncommitted diff but the directory does not exist yet.
- **Severity:** Medium
- **Effort:** M — restore `CHANGELOG.md` and migration docs; validate `package.json#files` against actual disk contents before next publish.

---

## Security Considerations

### `verify run` command accepts arbitrary shell string with `shell: true`

- **Issue:** `runtime-cli.ts:1030–1051` reads a `--command` CLI argument and passes it directly to `spawnSync(command, { shell: true })`. Because `shell: true` is used and the command string is un-sanitized, any caller that controls `--command` can execute arbitrary shell code.
- **Files:** `src/hooks/lib/runtime-cli.ts:1030–1051`
- **Current mitigation:** The `verify run` subcommand is invoked by hook scripts that construct the command string from project-detected scripts (e.g., `npm run typecheck`). Command values are not derived from user-typed input in the normal flow.
- **Risk:** If a malicious `package.json` script name or a tampered `.curdx-state.json` file can influence the command string, arbitrary code execution is possible in the agent's process.
- **Severity:** Medium
- **Effort:** S — validate that `command` matches an allowlist of known script patterns before spawning, or use `spawnSync(argv[0], argv.slice(1), { shell: false })` after splitting.

### `startDevRuntime` inherits full `process.env` and uses `shell: true` for project scripts

- **Issue:** `dev-runtime.ts:489–498` spawns user-detected start commands (from `package.json#scripts`) with `shell: true` and `env: process.env` (which includes the agent's complete environment). `healthDevRuntime` and `verifyDevRuntime` similarly use `shell: true`.
- **Files:**
  - `src/hooks/lib/dev-runtime.ts:488–498` — `startDevRuntime` spawn
  - `src/hooks/lib/dev-runtime.ts:534–539` — `healthDevRuntime` health check spawn
  - `src/hooks/lib/dev-runtime.ts:578–585` — `verifyDevRuntime` command spawn
- **Current mitigation:** Commands are taken from `package.json#scripts` keys (well-known names only) or from hardcoded patterns like `maven spring-boot:run`.
- **Risk:** A compromised or malicious `package.json` in a target project can inject shell metacharacters via script values, gaining execution in the hook process which inherits the agent's secrets.
- **Severity:** Medium
- **Effort:** M — strip `process.env` to a minimal safe subset before spawning; consider `shell: false` with explicit argv splitting for known script runners.

### `context7` API key written to `~/.claude.json` in plaintext

- **Issue:** The installer flow in `src/registry/mcps/context7.ts:38–39` passes the user's API key as a `--header` argument to `claude mcp add`, which stores it in `~/.claude.json` in plaintext. The i18n string `context7.keyWarning` (en.ts:67) acknowledges this. No file-permission hardening is applied after write.
- **Files:**
  - `src/registry/mcps/context7.ts:37–39`
  - `src/i18n/en.ts:67`
- **Current mitigation:** User is warned via a `p.note()` UI prompt before entering the key.
- **Risk:** On multi-user systems or systems with lax umask, `~/.claude.json` may be world-readable.
- **Severity:** Low (user is warned; key is optional)
- **Effort:** S — recommend `chmod 600 ~/.claude.json` post-write, or note the risk in the warning.

### Busy-spin in `safeRename` blocks the event loop

- **Issue:** `src/hooks/_shared/error-logger.ts:173` contains a synchronous busy-spin (`while (Date.now() < end) {}`) in the Windows EBUSY retry path. On a loaded system this can block the Node.js main thread for up to 750 ms (50+200+500 ms retry chain).
- **Files:** `src/hooks/_shared/error-logger.ts:168–180`
- **Current mitigation:** Comment says "spin: hooks are short-lived, no await available". Hook processes are indeed single-purpose.
- **Risk:** On Windows or NFS volumes under load, hook latency spikes up to ~750 ms per rename can materially delay agent responses.
- **Severity:** Low
- **Effort:** S — document the worst-case latency in the function comment; no code change strictly required for correctness.

---

## Performance Bottlenecks

### `Atomics.wait` synchronous sleep in PID-tree termination

- **Issue:** `dev-runtime.ts:401–412` implements `sleepSync` using `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)` and uses it in a polling loop (`waitForPidExit`) with 50 ms intervals, up to 750 ms for SIGTERM then 1250 ms for SIGKILL. Total worst-case blocking time per service is 2000 ms.
- **Files:** `src/hooks/lib/dev-runtime.ts:401–412`, `dev-runtime.ts:405–411`
- **Impact:** `stopDevRuntime` is synchronous and called from within hook scripts. Stopping N services multiplies worst-case blocking time by N.
- **Severity:** Medium
- **Effort:** M — convert `stopDevRuntime` to async and use `setInterval`-based polling; or use `waitpid` via a compiled native binding.

### Very large bundle files shipped in git

- **Issue:** The 10 largest `.mjs` bundles in `plugins/curdx-flow/hooks/scripts/` range from 63 KB (`load-spec-context.mjs`) to 253 KB (`runtime-cli.mjs`). Each bundle has a corresponding `.map` file of similar or larger size. These are committed into git per project policy (marketplace git-source distribution requires it) but bloat clone and diff operations.
- **Files:** `plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs` (253 KB), `plugins/curdx-flow/hooks/scripts/task-completed-verifier.mjs` (143 KB), etc.
- **Impact:** `git log -p` and `git blame` on hook commits are slow. PR diffs include hundreds of lines of minified JS noise.
- **Severity:** Low
- **Effort:** M — add `.gitattributes` to mark `.mjs.map` files as `binary` and `linguist-generated`; consider `.mjs` similarly to reduce diff noise.

---

## Fragile Areas

### Static HTML inline-server as base64-encoded `eval` string

- **Issue:** `dev-runtime.ts:227–251` constructs a complete Node.js HTTP server as a minified inline string, base64-encodes it, and returns a `node -e "eval(...)"` command. A regex (`STATIC_HTML_NODE_EVAL_PATTERN`) later parses this command back out in `spawnCommandFor` to detect it and avoid spawning with `shell: true`. The pattern and the encoder must stay in exact sync.
- **Files:**
  - `src/hooks/lib/dev-runtime.ts:98–99` — pattern definition
  - `src/hooks/lib/dev-runtime.ts:227–266` — encoder + decoder
- **Impact:** If the inline script changes (e.g., port interpolation, MIME type additions), the pattern may fail to match, causing the command to fall through to `shell: true` with the full eval string, which could silently work but loses the safety guarantee.
- **Risk:** Three recent commits (`907eb87`, `6f24c89`, `a291d6f`) all touched `dev-runtime.ts` specifically to fix static HTML flow issues, suggesting this area is actively fragile.
- **Severity:** Medium
- **Effort:** M — extract the static HTML server to a bundled helper `.mjs` file on disk instead of embedding it as a base64 blob; eliminates the pattern/encoder coupling entirely.

### `runtime-cli.ts` is a 1338-line monolith CLI dispatcher

- **Issue:** `src/hooks/lib/runtime-cli.ts` is the single entry point for all hook CLI operations (route, snapshot, lastMile, goal, verify, dev, plugin-list, mcp-list, git, etc.). At 1338 lines with no clear internal module boundary, adding a new subcommand or modifying existing ones risks unintended interactions.
- **Files:** `src/hooks/lib/runtime-cli.ts`
- **Impact:** Multiple contributors touching the same file; merge conflicts likely. `main()` function uses a flat string-switch dispatch with fallthrough.
- **Severity:** Low
- **Effort:** M — extract each subcommand into a separate `commands/<name>.ts` module and reduce `runtime-cli.ts` to a thin dispatcher.

### `stop-watcher.ts` is 734 lines with no unit test

- **Issue:** `src/hooks/stop-watcher.ts` is the primary stop-hook entrypoint (734 lines) and has no dedicated test file. It contains the completion-gate logic (`isSpecDone`, `mustBlockCompletion`, `buildStopMessage`) that controls whether Claude Code is allowed to stop.
- **Files:** `src/hooks/stop-watcher.ts`
- **Impact:** Regressions in the completion gate go undetected until an agent session blocks or allows completion incorrectly.
- **Severity:** High
- **Effort:** M — port the five core decision functions to unit tests using the existing `hook-boundary.test.ts` harness.

---

## Dependencies at Risk

### `tinyexec` unknown error behavior on non-zero exit

- **Issue:** `src/runner/exec.ts:11` calls `x(cmd, args, { throwOnError: false })` from `tinyexec@^1.0.0`. If `tinyexec` changes its error behavior or stdout-streaming API in a patch, `runStreaming` (used for all `claude plugin` / `claude mcp` commands) may silently return empty results rather than throwing.
- **Files:** `src/runner/exec.ts:10–40`
- **Impact:** Plugin install/uninstall flows fail silently if `tinyexec` produces no stdout.
- **Severity:** Low
- **Effort:** S — pin `tinyexec` to an exact version; add a CI smoke test that asserts non-zero exit produces non-empty stderr.

---

## Test Coverage Gaps

### `src/hooks/lib/` — 29 of 33 library modules have no test file

- **What's not tested:** `auto-policy.ts`, `build-context-payload.ts`, `capability-normalization.ts`, `check-verification-blocks.ts`, `cleanup-files.ts`, `count-mocks.ts`, `count-tasks.ts`, `dev-runtime.ts`, `ensure-gitignore.ts`, `execution-brief.ts`, `get-default-branch.ts`, `goal-bridge.ts`, `init-execution-state.ts`, `kill-port.ts`, `last-mile-orchestrator.ts`, `merge-state.ts`, `project-brain.ts`, `project-topology.ts`, `runtime-cli.ts`, `search-files.ts`, `stack-capabilities.ts`, `tool-capabilities.ts`, `update-modification-map.ts`, `verify-blocks.ts`, `workflow-snapshot.ts`
- **Files:** `src/hooks/lib/*.ts` (29 files without test counterparts)
- **Risk:** Hook logic that controls agent stopping, verification gating, and spec state mutation is untested at the unit level. The existing `hook-boundary.test.ts` tests the boundary protocol but not the logic inside individual library modules.
- **Priority:** High

### `src/runner/` — 4 of 5 modules have no test file

- **What's not tested:** `claudeMd.ts` (writes `~/.claude/CLAUDE.md`), `state.ts` (manages plugin/MCP cache), `ensureBun.ts` (runs shell install), `buildFreshness.ts` (build staleness detection)
- **Files:** `src/runner/` (4 untested files)
- **Risk:** Mutations to `~/.claude/CLAUDE.md` and the install state cache are not regression-tested. The `d77e537` commit deleted previous runner tests.
- **Priority:** Medium

---

## Known Issues / In-Flight Items

### Uncommitted `docs/` and `README.md` changes

- **Issue:** `git status` shows `README.md` and `docs/` as untracked. `package.json` has an uncommitted addition of `"docs/assets/readme"` to the `files` array. If these files are missing at publish time, the npm package will be published with an empty `docs/assets/readme` directory entry.
- **Files:** `package.json` (uncommitted diff), `docs/` (untracked), `README.md` (untracked)
- **Risk:** Broken npm publish if `docs/assets/readme` is referenced but not committed.
- **Severity:** Medium
- **Effort:** S — commit `docs/` and `README.md`, or revert the `package.json#files` change.

### `AGENTS.md` has an uncommitted timestamp update

- **Issue:** `AGENTS.md` is modified (not staged) with a `claude-mem` session timestamp bump. This is a routine auto-memory update but it means the next commit will silently include a contextual timestamp in a file that is part of the project's agent instructions.
- **Files:** `AGENTS.md`
- **Severity:** Low
- **Effort:** S — either commit the update with a chore commit or add `AGENTS.md` to `.gitignore` if it contains ephemeral session data.

---

*Concerns audit: 2026-05-19*
