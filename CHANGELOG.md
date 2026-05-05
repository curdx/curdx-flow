# Changelog

All notable changes to `@curdx/flow` are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/) and the project follows [Semantic Versioning](https://semver.org/).

## 7.1.2 — 2026-05-04

### Added

- **Auto-detect-and-install Bun when installing `claude-mem`.** The `claude-mem` plugin's runtime hooks shell out to `node scripts/bun-runner.js` which requires Bun on `PATH` or `~/.bun/bin/bun(.exe)` — Windows users without Bun previously hit `Error: Bun not found` at every Claude Code session start. The installer now runs `ensureBun()` as a `prereqCheck` before installing `claude-mem`: detects Bun via `which`/`where` plus the standard fallback paths (mirrors `bun-runner.js`'s discovery order), and if missing prompts `Auto-install Bun now? (default: No)`. On accept, runs the official installer (`curl -fsSL https://bun.sh/install | bash` on macOS/Linux, `powershell -c "irm bun.sh/install.ps1 | iex"` on Windows). On decline, the installer surfaces a `skip` row for `claude-mem` and continues with the rest of the bundle — other packages are unaffected. Existing users with Bun already installed (e.g. all macOS users who manually ran the installer earlier) see zero behavior change.
  - New module: `src/runner/ensureBun.ts` (~75 LoC) — exports `findBun()` and `ensureBun(t)`.
  - `src/registry/plugins/claude-mem.ts` declares `prereqCheck: (t) => ensureBun(t)` (one-line wire-in via the existing `Pkg.prereqCheck` contract that `chrome-devtools-mcp` already uses).
  - i18n: 9 new `bun.*` keys in `src/i18n/{zh,en}.ts`.

## 7.1.1 — 2026-05-04

### Fixed

- **Windows Chrome detection in the installer's `chrome-devtools-mcp` pre-req check.** `src/registry/plugins/chrome-devtools-mcp.ts`'s `checkChrome()` previously ran `test -x /Applications/...` plus `which google-chrome` / `which chromium` on every platform — none of which work on Windows (`test` is a Unix builtin, `which` isn't on `cmd`/PowerShell PATH by default, and the macOS app-bundle path doesn't exist). Result: the installer rejected Windows machines with Chrome installed, reporting "需要本机已安装 Chrome / Requires Chrome installed locally". Detection is now per-platform, mirroring `GoogleChrome/chrome-launcher`'s `chrome-finder` strategy: on `win32`, scan `LOCALAPPDATA` / `PROGRAMFILES` / `PROGRAMFILES(X86)` for `Google\Chrome\Application\chrome.exe` and `Google\Chrome SxS\Application\chrome.exe` (Canary) via `fs.existsSync`; on `darwin`, check the canonical app-bundle path; on Linux, the existing `which` lookup. A `CHROME_PATH` env var now overrides on all platforms (matches chrome-launcher / Lighthouse convention).



### Added

- **`completed: boolean` and `completedAt: string` fields in `.curdx-state.json` schema.** New optional fields on the spec state file (`schemas/spec.schema.json`). `completed === true` flips the spec into "done, retained for audit" mode; `completedAt` carries an ISO 8601 timestamp (`new Date().toISOString()`, includes milliseconds, e.g. `2026-05-04T20:17:00.123Z`). Legacy v7.0.x state files with `completed === undefined` continue to be treated as in-progress (backwards-compat — see Migration).
- **`merge-state` `$unset` operator.** `plugins/curdx-flow/hooks/scripts/lib/merge-state.mjs` now accepts a JSON patch with `"$unset": ["key1", "key2"]` to remove specific fields atomically. Used by `/curdx-flow:refactor` to clear `completedAt` when a spec is intentionally re-opened. Patches without `$unset` behave exactly as before (zero-behavior-change for existing callers).
- **`ensure-gitignore` wire-in to `/curdx-flow:start`.** The `ensure-gitignore` lib utility (already shipped in v7.0.0 but not invoked) is now called from `commands/start.md` so first-spec creation guarantees `**/.progress.md` is gitignored. Closes the "working tree permanently dirty" footgun that motivated this spec.
- **Shared `CurdxState` interface in `src/hooks/_shared/types.ts`.** Single source of truth for the `.curdx-state.json` shape across all 4 reader hooks (`load-spec-context`, `quick-mode-guard`, `stop-watcher`, `update-spec-index`). Type-only export — esbuild erases at bundle time, zero runtime cost.

### Changed

- **`.curdx-state.json` is no longer deleted on `ALL_TASKS_COMPLETE`.** Coordinator and `commands/implement.md` Step 5 now write `{"completed":true,"completedAt":"<ISO>","awaitingApproval":false}` via `merge-state` instead of `rm -f .curdx-state.json`. The state file is **retained** as the structured source of truth for completed specs (audit trail: `discoveredSkills`, `granularity`, `commitSpec`, `quickMode` interview decisions all survive). Eliminates the test008-class regression where state-deletion left a permanently-dirty working tree, and lets `update-spec-index` short-circuit to `phase=completed` without falling back to fragile markdown reverse-parsing.
- **5 reader hooks now use strict `state.completed === true` equality.** `stop-watcher.ts:601`, `load-spec-context.ts:147`, `update-spec-index.ts:278` (plus `quick-mode-guard.ts` type-import sync) check `state.completed === true` (never `if (state.completed)`). This is the backwards-compat contract: legacy v7.0.x state files with `completed === undefined` falsy-evaluate and behave identically to pre-7.1.0. Lint-enforced via grep gate (≥3 strict-equality occurrences, 0 truthy-checks).
- **`update-spec-index` short-circuits to `phase=completed`** when `state.completed === true`, without invoking `inferPhaseFromFiles()`. The fallback path (markdown reverse-parse) remains as a second-tier safety net for human-deleted state files / third-party forks / pre-v7 residue.
- **`/curdx-flow:refactor` resets via `merge-state $unset` instead of state file deletion.** When a completed spec is re-opened for refactor, `commands/refactor.md` now runs `merge-state .curdx-state.json '{"$unset":["completedAt"],"completed":false}'` rather than `rm -f`. Preserves audit history; matches the v7.1.0 retention model end-to-end.

### Migration

- Backwards-compatible by design — `completed === undefined` (legacy v7.0.x state files) is treated as in-progress, no manual migration required.
- See [docs/MIGRATION-V7.md → v7.1.0](./docs/MIGRATION-V7.md#v710-state-retention--completion-marker) for the full upgrade note + a `jq`-style snippet to backfill `completed:true` on specs whose `.curdx-state.json` was deleted under v7.0.x (AC-8.3).

## 7.0.2 — 2026-05-04

### Fixed

- **`update-spec-index` fallback no longer mis-counts AC/FR/NFR/US checklist items as tasks.** Inherited from the v6 `update-spec-index.sh` shell baseline, the fallback regex (`/- \[x\]/g`, `/- \[.\]/g`) counted any markdown checkbox in `tasks.md` — including `- [ ] AC-1.1: …` lines that task-planner's V6 verify task body emits as the AC enumeration. Real-world breakage: `test003/specs/helloworld` (a fully-completed 4-task spec authored with `### Task X.Y: … [x]` headlines + 10 `- [ ] AC-X.Y` entries) reported as `0/10 tasks` in `tasks` phase. Verified the same bug reproduces 1:1 in upstream `ralph-specum`'s shell hook — this is an inherited issue, not a v7 regression.
  - **Tracker pattern is now strict and aligned with OpenSpec's tracker** (`^[-*]\s+\[[\sxX]\]`): `^[-*]\s+\[([ xX])\]\s+(?:\d+\.\d+|V\d+|VE\d+|VF)(?:\s|$)` — checkbox MUST be followed by a recognized task-id token (`1.1`, `V1`, `VE1`, `VF`). AC/FR/NFR/US prefixes are excluded.
  - **`.curdx-state.json` missing + zero recognizable tasks + `.progress.md` present → `phase: completed`** (no fabricated `taskIndex` / `totalTasks`). Honest "I can't reliably parse this format" silence over a half-confident count.
  - **Format contract published in two places**: `agents/task-planner.md` gains a "Tasks.md Format Contract" mandatory section + Quality Checklist entries; `schemas/spec.schema.json` documents the regex and the reserved id prefixes on the `task` definition.
  - Files: `src/hooks/update-spec-index.ts`, `plugins/curdx-flow/agents/task-planner.md`, `plugins/curdx-flow/schemas/spec.schema.json`, `tests/hooks/update-spec-index.test.ts` (+2 regression tests: AC pollution + test003 reality). All 57 hook tests + 16 byte-equal v6.0.6 baselines pass.

## 7.0.1 — 2026-05-03

### Fixed

- **`/curdx-flow:start` and any non-quick command crashed at the first `AskUserQuestion`** (branch decision, specs-dir prompt, goal clarification, etc.). Root cause: v7.0.0's `quick-mode-guard.mjs` (PreToolUse hook) emitted `{decision:"allow"}` on the allow path and `{decision:"deny", reason:..., ...}` on the deny path. Claude Code's PreToolUse output schema rejects `decision` values other than `"approve"|"block"`, causing `Hook JSON output validation failed — (root): Invalid input` and silently blocking `AskUserQuestion`. The v6 bash baseline emitted nothing on allow (`exit 0`) and only `{hookSpecificOutput:{permissionDecision:"deny"}, systemMessage:"..."}` on deny — fixed by reverting v7's output to byte-equal v6 shape. Files: `src/hooks/quick-mode-guard.ts`, `src/hooks/_shared/types.ts` (removed `AllowDecisionOutput`, narrowed `DenyDecisionOutput`), `tests/hooks/quick-mode-guard.test.ts` (updated assertions). All 55 hook tests + 16 byte-equal regression tests against v6.0.6 pass.

## 7.0.0-beta.2 — 2026-05-03

### Fixed

- **Hybrid release.yml trigger.** beta.1's `workflow_run`-only trigger didn't fire because that trigger requires the workflow file on the default branch (release.yml lives on the feature branch). v7.0.0-beta.2 fixes this by also accepting `push: tags: ['v*']` events with a concurrency guard against double-publish. Future releases from main will use the workflow_run path; pre-release tags from feature branches use push:tags directly. No code changes — just a CI plumbing fix.

### Notes

- v7.0.0-beta.1 was tagged but did not publish to npm due to the trigger mismatch above. v7.0.0-beta.2 IS the first beta on npm.
- All Windows-specific test failures from v7.0.0-beta.0 were already fixed in v7.0.0-beta.1's commits (Bug 1: stdout undefined; Bug 2: hardcoded /tmp fixture paths). CI run 25292873783 confirmed Windows / Node 22 PASS at the beta.1 commit, so beta.2 should also pass cleanly.

## 7.0.0-beta.1 — 2026-05-03

### Fixed

- **Windows hook tests now pass.** beta.0's 6-leg CI matrix exposed 8 Windows-specific failures (3 update-spec-index TypeError + 5 hook tests asserting `undefined`/`active:false`). Two distinct bugs fixed in test infrastructure (no hook source changes):
  - **Bug 1 (`tests/hooks/_helpers.ts:87`)**: `result.stdout.trim()` crashed with `TypeError: Cannot read properties of undefined` on Windows when `spawnSync` returned `stdout === undefined` for child processes that exited before producing output. Fix: nullish-coalesce both `stdout` and `stderr` (`result.stdout ?? ""`) before any string operations.
  - **Bug 2 (hardcoded `/tmp/curdx-fixture-*` paths)**: 4 fixture JSONs embedded `cwd` paths that existed on the macOS dev box (created during task 3.2 baseline generation) but did NOT exist on GitHub's Windows runner. Hooks resolved `active:false` because the spec dir was missing. Fix: new `tests/hooks/_fixture-setup.ts` exports `createFixtureSpec()` which builds a self-contained spec via `mkdtempSync(os.tmpdir(), 'curdx-fixture-')` per test + cleanup in `afterEach`. `_helpers.ts.runHook(..., { cwd })` now also rewrites the stdin fixture's `cwd` field to the runtime temp path. Both hook smoke tests (load-spec-context, quick-mode-guard, stop-watcher) and the update-spec-index invocation-spec tests refactored to per-test fixture setup.

### Notes

- **Test count unchanged (55/55).** No tests removed or skipped — only restructured to be cross-platform-safe.
- **Beta.0 served its purpose.** The 3-OS CI matrix surfaced 2 distinct Windows bugs that the POSIX-only dev box could not have caught — exactly the gating outcome the alpha→beta→rc rhythm was designed for.

## 7.0.0 — 2026-05-03

### Breaking

- **`jq` is no longer required.** All 30 plugin markdown jq invocations replaced with Node `node -e` inline scripts or bundled lib utilities. NFR-6 verified: `! grep -rn '\bjq\b' plugins/curdx-flow` exits 0. **Action required**: see [docs/MIGRATION-V7.md](./docs/MIGRATION-V7.md) for details — most users need no manual change, but anyone forking the v6 `.sh` files breaks.
- **`hooks.json` invocation contract changed.** v6 invoked hooks via `bash *.sh`; v7 invokes via `node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/*.mjs"` with `shell: bash` for cross-platform routing and `async: true` on SessionStart (Issue #34457 mitigation).
- **Legacy `.sh` files deleted.** `load-spec-context.sh`, `quick-mode-guard.sh`, `stop-watcher.sh`, `update-spec-index.sh`, `path-resolver.sh`, plus `test-path-resolver.sh` / `test-multi-dir-integration.sh`. Anyone forking the v6 `.sh` paths must port to TypeScript or pin to v6.0.6.
- **Node ≥20.12 required** (was Node 18+ in v6). esbuild output target. See migration guide for upgrade paths.
- **Spec ordering in `update-spec-index` is now alphabetical** (was filesystem-inode order in v6). Output bytes change but content equivalent.
- **mtime precision in `stop-watcher` is now milliseconds** (was seconds via `stat -f %m`/`stat -c %Y`).

### Added

- **Cross-platform plugin runtime.** 4 hooks (load-spec-context, quick-mode-guard, stop-watcher, update-spec-index) bundled to single-file ESM `.mjs` via esbuild. Sources in `src/hooks/`.
- **10 lib utilities.** cleanup-files, count-mocks, count-tasks, ensure-gitignore, get-default-branch, init-execution-state, kill-port, merge-state, search-files, update-modification-map. Each ~30-100 LOC, single-responsibility CLIs callable from markdown.
- **`scripts/build-hooks.mjs`** esbuild driver — single-file ESM, node20 target, atomic-write helper, cross-platform path utilities, awk-parity markdown task parser.
- **`scripts/check-hooks-fresh.mjs`** CI gate — detects source/bundle drift via rebuild + git diff.
- **`npm run verify`** aggregate script — typecheck + check-versions + check:hooks-fresh + test:hooks.
- **6-leg GitHub Actions matrix.** ubuntu × node[20,22], macos × 22, windows × 22. New `typecheck` / `check-fresh` / `test-matrix` / `all-green` jobs.
- **Vitest test suite.** 55 tests: 12 hook smoke + 10 lib unit + 16 byte-equal regression vs v6.0.6 baseline + 17 carry-over.
- **`.gitattributes`** LF pinning for cross-platform line endings.
- **Colocated `package.json {"type":"module"}`** in `plugins/curdx-flow/hooks/scripts/` — npm Issue #267 mitigation for Windows nvm + .mjs ESM resolution.
- **Release workflow gating.** `release.yml` now waits for CI green via `workflow_run` trigger before publishing.

### Changed

- **`CLAUDE.md` build pipeline section** updated. Old "shipped as static files — no build step" replaced with two-category description (static manifests + built `.mjs` bundles via esbuild). Cross-references `specs/cross-platform-support/design.md`.
- **`scripts/bump-version.mjs`** regex extended to accept SemVer pre-release labels (`-alpha.N`, `-beta.N`, `-rc.N`).

### Notes

- **Pre-release rhythm**: v7.0.0-alpha.0 (2026-05-03, POC checkpoint) → v7.0.0-beta.0 (Phase 4 close, CI matrix validated) → v7.0.0-rc.0 (Phase 5, docs freeze + 2-week soak) → 7.0.0 (final).
- **See [docs/MIGRATION-V7.md](./docs/MIGRATION-V7.md)** for upgrade steps, downgrade path, FAQ, and verification checklist.

## 7.0.0-beta.0 — 2026-05-03

### Added

- **3-OS CI matrix runs against bundled .mjs.** First exposure of v7 hooks/lib on `windows-latest` (PowerShell + Git Bash routing), `macos-latest`, and `ubuntu-latest` (Node 20 + 22). 6 legs total + typecheck + check-fresh + all-green aggregator.
- **`scripts/check-hooks-fresh.mjs`** + `npm run check:hooks-fresh` CI gate — detects source/bundle drift via rebuild + git diff.
- **`npm run verify`** aggregate — typecheck + check-versions + check:hooks-fresh + test:hooks chain.
- **Vitest test suite (55 tests)** — 12 hook smoke + 10 lib unit + 16 byte-equal regression vs v6.0.6 baseline + carry-over.
- **Hardened `prepublishOnly`** — now also runs check:hooks-fresh, preventing published tarball with stale .mjs vs src.
- **`docs/MIGRATION-V7.md`** migration guide (8 sections: TL;DR, Breaking, Why, Upgrade steps, Custom .sh fork users, Downgrade, FAQ, Verification checklist).
- **Refactored hooks**: `_shared/types.ts` (HookStdin/HookOutput tagged union) + `_shared/run-hook.ts` (global try/catch wrapper, FR-8 contract).
- **Lib catalog converged to 10** (was 11) — `update-fix-task-map` dropped due to schema mismatch with spec.schema.json; `_shared/atomic-write` adopted as canonical state-mutation pattern.
- **Path-handling policy** documented in `_shared/path-resolver.ts` (NFR-7): `path.join` for fs IO, `path.posix.join` for serialization.

### Changed

- **Release workflow gated on CI green.** `release.yml` now uses `workflow_run` trigger waiting for ci.yml `conclusion: 'success'` before publishing. Compared to alpha.0 (direct tag-push trigger), beta.0+ requires Windows + macOS + ubuntu CI legs all green before npm publish fires.
- **`tests/hooks/baselines/v6.0.6/`** — 16 frozen byte-equal reference outputs (4 hooks × 4 fixtures) generated from v6.0.6 worktree, normalized for cross-platform/timestamp divergences.

### Notes

- This is the **second pre-release** in the v7 rhythm: alpha.0 (POC) → **beta.0 (CI matrix validated)** → rc.0 (docs freeze) → 7.0.0 (final).
- See [docs/MIGRATION-V7.md](./docs/MIGRATION-V7.md) for upgrade guidance.

## 7.0.0-alpha.0 — 2026-05-03

### Added

- **Cross-platform plugin runtime.** Bundled hooks and lib utilities now run as ESM `.mjs` instead of bash `.sh`. 4 hooks (load-spec-context, quick-mode-guard, stop-watcher, update-spec-index) + 11 lib utilities (cleanup-files, count-mocks, count-tasks, ensure-gitignore, get-default-branch, init-execution-state, kill-port, merge-state, search-files, update-fix-task-map, update-modification-map). Sources in `src/hooks/`; bundled via esbuild to `plugins/curdx-flow/hooks/scripts/`.
- **`scripts/build-hooks.mjs`** esbuild driver — single-file ESM bundles, node20 target, atomic-write helper, cross-platform path utilities, awk-parity markdown task parser.
- **`.gitattributes`** pinning `*.sh`, `*.mjs`, `*.cjs`, `*.js` to LF line endings for Windows compatibility.
- **`hooks/scripts/package.json`** with `"type": "module"` to mitigate npm `.mjs` ESM-resolution edge case (Node #267) on Windows nvm.

### Breaking

- **`hooks.json` changes invocation contract from `bash *.sh` to `node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/*.mjs`** with `"shell": "bash"` for cross-platform routing and `"async": true` on SessionStart (mitigates Anthropic CC #34457 Windows event-loop deadlock).
- **Legacy bash hook scripts deleted**: `load-spec-context.sh`, `quick-mode-guard.sh`, `stop-watcher.sh`, `update-spec-index.sh`, `path-resolver.sh`, plus `test-path-resolver.sh` / `test-multi-dir-integration.sh`. Anyone forking the v6 `.sh` paths will break — switch to the `.mjs` invocations.
- **`jq` is no longer a runtime dependency.** All 30 markdown sweep occurrences replaced (lib calls, inline `node -e`, prose rewords, `gh --jq` → pipe-to-Node). NFR-6 verified by `! grep -rn '\bjq\b' plugins/curdx-flow`.

### Notes

- **Pre-release validation** — this is a POC checkpoint at the end of Phase 1 of `specs/cross-platform-support/`. CI matrix expansion to Windows + macOS lands in Phase 4. For now, ubuntu-latest CI run on the alpha.0 tag validates the toolchain end-to-end. Phase 2 (refactoring) and Phase 3 (vitest smoke tests) follow before `7.0.0-beta.0`.
- **CLAUDE.md** updated to describe the new build pipeline (replaces the v6 "no build step" sentence).
- **Schema mismatch flagged** for follow-up: `lib/update-fix-task-map.mjs` schema (`{count, depth, fixes}`) diverges from `spec.schema.json` and prose docs (`{attempts, fixTaskIds, lastError}`). Markdown sweep used inline `node -e` over the lib to preserve doc-schema consistency. Will reconcile in Phase 2.

## 6.0.6 — 2026-04-29

### Removed

- **Legacy plugin migration code path.** `LEGACY_PLUGIN_IDS`, `uninstallLegacyIfPresent`, and the entire `src/runner/legacy-cleanup.ts` file removed. Users still on v3.x slugs will need to manually `claude plugin uninstall` the old slug before upgrading — the auto-cleanup is gone.
- **Historical CHANGELOG entries for the v3.x rename releases** (3.4.0, 3.5.0, 4.0.0, 4.0.1) deleted. Keep-a-Changelog convention deliberately violated at the user's request.
- LICENSE copyright line and NOTICE.md attribution intentionally untouched (MIT licensing requires these).

## 6.0.5 — 2026-04-29

### Changed

- **Drop legacy upstream-attribution chrome from user-facing surfaces.** Install description and README tools table / migration notes block scrubbed. MIT `LICENSE` copyright line and `NOTICE.md` attribution preserved verbatim (legal requirement).

## 6.0.4 — 2026-04-29

### Changed

- **Drop `Available tools/plugins` listing from injected `~/.claude/CLAUDE.md` block.** Each plugin's own SKILL.md `description` is already injected into Claude Code's system prompt at session start, so re-listing every tool's name + version + `whenToUse` was duplicate context that cost tokens for no judgement value. `renderBlock` now emits only the three decision sections — `Tool Combination Patterns`, `Skip Rules`, `Decision Tree` — which carry the cross-tool routing logic that single-skill descriptions cannot. `renderItemLine` removed (dead code); `ManagedItem`'s `name` / `version` / `slashNamespace` / `whenToUse` fields kept for forward compat with any external consumers, but no longer rendered.

## 6.0.3 — 2026-04-29

### Changed

- **`~/.claude/CLAUDE.md` injected block now uses combination-pattern playbook instead of flat rules list.** `src/runner/claudeMd.ts::renderBlock` emits three new sections — `Tool Combination Patterns`, `Skip Rules`, `Decision Tree` — all conditional on installed package ids so users only see guidance for tools they actually have. Previous `ALWAYS_ON_RULES` + `buildConditionalRules` (4 short bullets) replaced by `buildCombinationPatterns` / `buildSkipRules` / `buildDecisionTree` (≈40 lines). BEGIN/END markers + idempotent upsert behavior unchanged, so existing user-authored content above/below the block is preserved.

## 6.0.2 — 2026-04-29

### Added

- **`CLAUDE.md` release runbook.** Documents the 5-field version-sync gate (`package.json` + `package-lock.json` root / `packages[""]` + `plugin.json` + `marketplace.json`), the tag-triggered npm publish workflow, and the historical drift incidents (v5.0.0 marketplace, v6.0.0 lockfile) so future sessions have a single-source SOP for cutting releases.
- **`scripts/bump-version.mjs` + `npm run bump-version`.** Atomically writes the target version into all 5 fields, then shells out to `check-versions` to confirm. `npm version` handles `package.json` + lockfile; the two plugin manifests are patched via targeted regex so inline arrays (e.g. `plugin.json`'s `keywords`) stay byte-identical. Supports `<X.Y.Z|patch|minor|major>` and `--dry-run`.

### Notes

- Both additions are repo-internal — neither file ships in the npm tarball (`files: ["dist", "CHANGELOG.md"]` is unchanged), so the published artifact is byte-identical to 6.0.1 modulo version metadata. This release exists to dogfood the new `bump-version` flow end-to-end.

## 3.3.2 — 2026-04-27

### Fixed

- **CLAUDE.md sync no longer skipped on the "nothing selected" path** — when a user upgraded flow with all tools already installed and ran `install`, the multiselect would show nothing pre-checked; pressing enter without a selection caused the flow to early-return before reaching the sync step, so the managed block was never added to CLAUDE.md. Each of `install` / `update` / `uninstall` now wraps its body in `try / finally` and runs the sync at the end of any non-cancelled exit (including "nothing to do" paths). User-cancelled flows (Ctrl+C, multiselect cancel, uninstall confirm "no") still skip the sync to respect intent.

## 3.3.1 — 2026-04-27

### Fixed

- **Silent stalls between phases** — added spinners to the previously-silent windows where flow shells out to `claude plugin list --json` and `claude mcp list` (the latter performs an MCP server health check and can take 5-15 seconds). Affected sites: `install` (state-derivation between marketplace refresh and the multiselect), `update` and `uninstall` (state-derivation at flow entry), and the post-flow CLAUDE.md sync (after install/update/uninstall busts the cache, sync re-queries state). Each now shows `Checking installed state… (claude plugin list / mcp list)` with a result line so the run no longer feels frozen.
- **CLAUDE.md sync feedback** — replaced the post-hoc `p.log.info` line with a live spinner that converts to a final status line on completion, matching the marketplace-refresh and per-item install UX.

## 3.3.0 — 2026-04-27

### Added

- **CLAUDE.md sync** — every successful `install` / `update` / `uninstall` now rewrites a small managed block in `~/.claude/CLAUDE.md` so Claude Code has session-start knowledge of which tools are installed and when to use each. The block lives between `<!-- BEGIN @curdx/flow v1 -->` / `<!-- END @curdx/flow v1 -->` markers; everything outside is preserved verbatim. Uninstalling all managed items removes the block entirely.
- **`Pkg.whenToUse` and `Pkg.slashNamespace`** — two new optional registry fields. `whenToUse` is the English trigger fragment shown in the CLAUDE.md "Available tools/plugins" list (e.g. "auto-fires on 2+ failures..."). `slashNamespace` is the slash invocation pattern (e.g. `/pua:*`) — only set on plugins that expose one. Both populated for the six bundled items, sourced from each upstream's own documentation.
- **Conditional Rules section** — the block's `Rules:` lines are emitted only for currently-installed tools, so the block never advises Claude to use a tool that isn't there. The "plan first" rule names whichever planners (`sequential-thinking`, `claude-mem`) are installed.
- **`--no-claude-md` flag and `CURDX_FLOW_NO_CLAUDE_MD` env var** — opt out of the CLAUDE.md sync (CI, locked-down filesystems, or users who prefer to manage CLAUDE.md by hand).

### Notes

- Sync is **safe by default**: writes are atomic (tmp + `fs.rename`), partial CLAUDE.md changes are impossible, and a failed sync prints a warning but never aborts a successful install.
- Forward-compatible: the BEGIN/END regex matches any `v\d+` suffix, so a future `v2` block format will silently replace any pre-existing `v1` block.
- Block content is always English regardless of `--lang`. CLAUDE.md's audience is Claude itself; English keeps instructions stable and avoids diff churn from alternating language runs.

## 3.2.0 — 2026-04-26

### Added

- **Version-aware install** — `flow install` now detects already-installed items with newer versions available upstream and presents a third state `↑ installed v3.0.0 → v3.2.3 available` in the multiselect. Items with updates are pre-selected by default alongside not-installed items, so a single Enter ships "install missing + upgrade outdated".
- **Smart dispatch** — selected items route to the right operation:
  - not installed → `install` (full)
  - update available → `update` (incremental, via `claude plugin update <id>`)
  - already installed but selected → reinstall confirmation prompt (uninstall + install)
- **Marketplace cache refresh** — install flow runs `claude plugin marketplace update <name>` for each pkg's marketplace before reading `latestVersion`. Skipped per-marketplace if its cache mtime is within 1 hour. New flag `--no-refresh` to opt out entirely (CI / offline use).
- **`flow status --json` enriched** — now includes `installedVersion`, `latestVersion`, and `updateAvailable` fields for each item, so external scripts can detect upgrade candidates without parsing the multiselect UI.
- **`Pkg.installedVersion` / `Pkg.latestVersion` / `Pkg.marketplaces`** — optional methods on the registry interface. Implemented for `pua` and `claude-mem` (the two items whose marketplaces declare `version` in `.claude-plugin/marketplace.json`). Other items gracefully fall back to the boolean installed/not-installed display when versions aren't available.

### Notes

Of the 6 bundled items, only `pua` and `claude-mem` expose comparable versions. `chrome-devtools-mcp` and `frontend-design` (Anthropic official marketplace) don't declare `version` in marketplace metadata and so always render as "installed" without version. Both MCP servers (`sequential-thinking`, `context7`) have no installed-version concept (`npx -y` auto-fetches latest each launch / remote HTTP) and behave the same way.

## 3.1.0 — 2026-04-26

Major rewrite preserving the same goal (one-command installer for Claude Code plugins and MCP servers) with a cleaner internal architecture and broader coverage.

### Added

- **Bilingual UI** — every interactive run starts with a 中文 / English picker; default is auto-detected from `$LANG`. No config file is written.
- **Two new MCP servers**:
  - `sequential-thinking` (`@modelcontextprotocol/server-sequential-thinking`)
  - `context7` (Upstash HTTP MCP) with optional API key prompt at install time
- **`citty` subcommand mode** — `npx @curdx/flow install|uninstall|update|status` for non-interactive / CI use, alongside the original interactive menu.
- **`status --json`** — machine-readable install state for scripting.
- **`install --all --yes`** — non-interactive bulk install.
- **`Pkg` registry abstraction** (`src/registry/types.ts`) — every installable item declares `isInstalled / install / uninstall / update / prereqCheck / configPrompts` once, and the four flows (install / uninstall / update / status) use the same interface. Future additions are a single file in `src/registry/`.
- **Idempotency layer** — every flow pre-checks state via cached `claude plugin list --json` / `claude mcp list` parsing, so re-running after a partial install is safe.
- **`prereqCheck` for `chrome-devtools-mcp`** — detects Node ≥ 20.19 and a locally installed Chrome before attempting install.
- **GitHub Actions CI + Release workflows** — Node 20 + 22 matrix on PRs; `v*` tag triggers `npm publish --provenance --access public` and an auto-noted GitHub Release.

### Changed

- `@clack/prompts` upgraded **0.8.x → 1.2.x** (Node ≥ 20.12 required).
- Bundler: now `tsup` producing a single 35 KB ESM file (`dist/index.mjs`) with shebang banner — no more multi-file dist.
- Plugin registry now uses the **real marketplace name** from `.claude-plugin/marketplace.json`, not the GitHub repo path. Specifically `chrome-devtools-mcp` lives in marketplace `chrome-devtools-plugins`, not `chrome-devtools-mcp`.

### Removed

- `~/.curdx-flow/config.json` — language preference is no longer persisted; the picker runs every interactive session.
