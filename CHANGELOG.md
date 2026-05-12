# Changelog

All notable changes to `@curdx/flow` are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/) and the project follows [Semantic Versioning](https://semver.org/).

## 7.1.26 — 2026-05-12

### Added

- **Execution brief compiler.** `curdx-flow route --compile` now turns smart-route facts into a compact execution contract with context budget, read-first hints, primary skill, agent/reviewer plan, isolation boundary, quality gates, completion evidence, and escalation rules.
- **Project-local brain.** Added `.curdx/brain.jsonl` as a gitignored lightweight event stream for compiled routes, edit batches, verification runs, and verification blocks. The data is advisory only and stores compact stack/verifier/failure facts, not source content or secrets.
- **Execution brief reference.** Added `references/execution-brief.md` and wired `/curdx-flow:start` and `/curdx-flow:prompt-optimize` to use the brief only when compact route output is insufficient.

### Changed

- **Hooks now carry the last mile contract.** UserPromptExpansion and PostToolBatch include a compact execution brief summary; PostToolBatch also records edit-batch hints in `.curdx/brain.jsonl`.
- **Verification evidence becomes learnable.** `curdx-flow verify run` records verifier outcomes in project brain, and TaskCompleted records blocked verification reasons before returning the existing block decision.
- **Doctor is more diagnostic.** `curdx-flow doctor` includes project brain summary and the compiled execution brief alongside stack profile, quality gates, suggested verifier, hook freshness, and docs-sensitive warnings.

### Tests

- Added coverage for project brain persistence, execution brief compilation, `route --compile`, doctor brief/brain output, hook brief injection, PostToolBatch brain events, and TaskCompleted verification-blocked memory.

## 7.1.25 — 2026-05-12

### Added

- **Prompt optimization skill.** Added `/curdx-flow:prompt-optimize`, an advisory-only skill that diagnoses task prompts, recommends route/skills/agents, lists risks and quality gates, and outputs a paste-ready optimized prompt without executing the task.
- **Stack-aware routing data source.** Added a typed stack capability map adapted from ECC for TypeScript, React, Vue, Next.js, Node, Spring Boot/Spring Cloud, Python, Go, Rust, and Claude Code plugin projects.
- **Route quality gates.** `curdx-flow route` now includes `stackProfile`, `qualityGates`, `suggestedVerifier`, and `contextBudget` alongside existing route and capability recommendations.
- **Routing references.** Added `references/intelligent-routing.md` and `references/prompt-optimization.md` so long route, quality gate, and prompt rules stay out of high-frequency skill text.

### Changed

- **Capability recommendations are stage-aware.** Smart-route recommendations now include docs query, browser verification, TDD, security review, stack-specific verification, and context-budget workflow hints while preserving the existing companion tool recommendations.
- **Runtime diagnostics are richer.** `curdx-flow doctor` reports stack profile, quality gates, suggested verifier, docs-sensitive warnings, and hook freshness; `dev-runtime` uses stack-aware fallback verifiers for Go, Rust, Python, and Claude Code plugin projects.
- **Hooks provide compact routing context.** UserPromptExpansion and PostToolBatch now inject stack, verifier, quality gate, and context-budget hints; TaskCompleted failure reasons include a suggested verifier without adding new block conditions.
- **Agent frontmatter is more delegation-friendly.** Agent descriptions now start with natural trigger language; executor guidance explicitly protects release/plugin metadata unless listed in task files.
- **Installer bundle stays slim.** CLAUDE.md sync rendering no longer statically imports the hook capability router, keeping `dist/index.mjs` below the 84KB bundle gate.

### Tests

- Added coverage for stack capabilities, prompt-optimize expansion, PostToolBatch context, stage-aware capabilities, route quality gates, doctor output, and agent/references manifest integrity.

## 7.1.24 — 2026-05-12

### Added

- **Runtime verification recorder.** Added `curdx-flow verify run --phase execution --command "<cmd>"`, which executes the real verification command, records `verificationBlocks.<phase>` with command, exit code, timestamp, and source mtime, and returns the command's exit code.
- **True Claude Code E2E evidence gate.** The real Claude Code E2E now asserts quick/lite specs persist `verificationBlocks.execution` after a passing `npm test`, so completion cannot be only a model claim.

### Changed

- **Plugin hooks now use Claude Code exec form.** `hooks/hooks.json` uses `command: "node"` plus `args` with `${CLAUDE_PLUGIN_ROOT}` for every bundled hook script, matching current Claude Code guidance for path placeholders and avoiding shell quoting issues.
- **Quick/lite completion is verification-backed.** `/curdx-flow:start`, `/curdx-flow:implement`, and coordinator guidance now require final verification through `curdx-flow verify run` before marking a quick/lite spec complete.
- **Runtime health output is more useful.** `curdx-flow doctor` now reports plugin manifest health, hook exec-form status, missing hook scripts, plugin bin readiness, browser verification readiness, and recommended validation commands.
- **Claude CLI smoke scripts support local `claudecc` aliases.** Smoke and E2E scripts can run through zsh login aliases while still supporting `CURDX_FLOW_CLAUDE_BIN=claude` for the official binary.

### Fixed

- **State completion hard gate.** `curdx-flow state merge` now rejects `completed:true` for quick/lite specs unless a passing `verificationBlocks.execution` record already exists.
- **Help/status first-run UX.** Public help/status outputs now suppress unrelated injected hook context, and smoke tests fail if PUA/injection/third-party hook text leaks into those surfaces.

### Tests

- Verified with `npm run verify`, `CURDX_FLOW_CLAUDE_BIN=claudecc npm run test:claudecc`, and real Claude Code E2E `CURDX_FLOW_CLAUDE_BIN=claudecc CURDX_FLOW_E2E_MAX_BUDGET_USD=3 npm run test:claudecc:e2e`.

## 7.1.23 — 2026-05-11

### Changed

- **Playwright verification now requires a repeatable package-script entry when possible.** Browser-facing specs that need new Playwright coverage should add a focused test, config when missing, and `test:e2e` or the repo's equivalent script instead of leaving only an ad hoc `npx playwright test ...` rerun command.

### Tests

- Real Claude Code plugin smoke in a temporary React/Vite fixture generated `playwright.config.ts`, `tests/e2e/login.spec.ts`, installed Chromium, and passed 2 Playwright scenarios. The test also exposed the missing package-script gap fixed in this release.
- Verified with `npx vitest run tests/runner/manifest-integrity.test.ts` and `npm run typecheck`.

## 7.1.22 — 2026-05-11

### Added

- **Browser verification policy for full-stack delivery.** Added a plugin reference that standardizes Playwright CLI as the default repeatable E2E path and Chrome DevTools MCP as the high-fidelity path for GIS, WebGL, canvas, map, GPU, console, network, performance, and flaky Playwright cases.
- **Browser readiness in `curdx-flow doctor`.** Doctor output now reports detected dev-server scripts, E2E scripts, browser automation dependencies, Playwright config files, chrome-devtools-mcp dependency declaration, and local Chrome availability.

### Changed

- **Task planning now requires an explicit Browser Verify decision.** `task-planner`, `/curdx-flow:tasks`, VE references, and task templates now require `playwright`, `chrome-devtools-mcp`, `none`, or `blocked` before implementation tasks.
- **Executor and QA prompts enforce browser evidence.** `spec-executor`, `qa-engineer`, and `verification-before-completion` now reject browser-facing completion claims without fresh Playwright or Chrome DevTools MCP evidence, and explicitly avoid `/ultrareview` as a verification path.
- **Research output feeds browser verification.** `research-analyst` now records Browser Verify strategy alongside dev server, E2E config, browser dependency, port, and health endpoint discovery.

### Tests

- Added runtime CLI coverage for browser readiness in `doctor` output and manifest-integrity coverage that keeps the browser verification policy linked into planning, execution, QA, and skill surfaces.
- Verified with `npm run verify`.

## 7.1.21 — 2026-05-11

### Added

- **Plugin-local runtime CLI and workflow snapshot surface.** `plugins/curdx-flow/bin/curdx-flow` now exposes deterministic `route`, `snapshot`, `specs`, `state`, `tasks`, `verify-blocks`, and `doctor` commands that skills and smoke tests can call without reaching into bundled hook internals.
- **True Claude Code end-to-end flow test.** New `npm run test:claudecc:e2e` creates a temporary failing Node project, runs `/curdx-flow:start` through the real Claude Code CLI with the local plugin, verifies `npm test`, validates spec/task/snapshot invariants, captures `--debug-file`, and writes an `analyze` report.
- **Prompt/batch runtime context hooks.** Added generated hook entrypoints for user-prompt expansion and post-tool-batch snapshots so Claude sees active-spec gates and next actions while a real session is running.

### Changed

- **Quick lite-spec is now a first-class completed workflow.** Runtime snapshots accept completed `spec-lite` quick specs with `tasks.md`, `.progress.md`, and `.curdx-state.json` without requiring full-spec `research.md` / `requirements.md` / `design.md` artifacts.
- **Active spec marker contract is explicit.** `/curdx-flow:start` now instructs Claude to write `$defaultDir/.current-spec` with a bare name for default-root specs, and never to write a project-root `.current-spec`.
- **Hook freshness checking is dirty-worktree friendly.** `check-hooks-fresh` now compares generated hook tree hashes before/after rebuild, preserving CI stale-bundle detection without failing merely because fresh bundles are already uncommitted.

### Fixed

- **`.current-spec` path resolution.** Runtime resolvers now treat relative marker values containing `/` as paths rather than double-prefixing them under `specs/`, and defensively accept a project-root marker if an older run wrote one.
- **Small `npm test` implementation goals no longer route as publish-critical work.** Auto-policy no longer treats the word `npm` itself as high/critical release risk, while release/publish/tag/plugin/hook surfaces remain protected.
- **Claude Code transcript lookup follows current project-dir encoding.** `analyze` now resolves `~/.claude/projects` directories where Claude Code hyphenates non-alphanumeric path characters, with legacy slash-only encoding retained as fallback.
- **`analyze --out` writes the report file.** Markdown/JSON report output now respects `--out` in both fresh and cached-report paths.
- **`analyze` scopes sidecar hook errors to the active project.** Global `~/.claude/curdx-flow/errors.jsonl` rows are now included only when their `cwd` or `transcript_path` matches the analyzed source, preventing stale errors from other sessions from polluting E2E reports.

### Tests

- Added regression coverage for quick lite-spec snapshots, active-spec marker placement, transcript encoding, scoped sidecar hook errors, `analyze --out`, route classification for `npm test`, and the new real Claude Code E2E script.
- Verified with `npm run verify`, `npm run test:claudecc`, and `CURDX_FLOW_E2E_KEEP_TMP=1 npm run test:claudecc:e2e`.

## 7.1.20 — 2026-05-11

### Changed

- **Companion capabilities are now the default required bundle.** `pua`, `claude-mem`, `chrome-devtools-mcp`, `frontend-design`, `sequential-thinking`, and `context7` are marked `required` in the installer alongside `curdx-flow`, so interactive installs show them as always installed and `--ids` installs auto-include missing required companions.
- **Official plugin dependency metadata added.** `curdx-flow` now declares plugin dependencies for `pua`, `claude-mem`, `chrome-devtools-mcp`, and `frontend-design`, and the root marketplace explicitly allows those cross-marketplace dependencies.
- **Capability routing marks bundled companions as `core-required`.** Smart-route recommendations still trigger only when relevant, but recommended bundled capabilities are no longer suppressed by narrow availability filters.

### Tests

- Added registry and manifest regression coverage for the required bundle, expanded capability-router expectations, rebuilt hook bundles, and tightened `claudecc` smoke checks for `core-required` recommendations.

## 7.1.19 — 2026-05-11

### Added

- **Third-party capability graph for smart routing.** New `hooks/scripts/lib/tool-capabilities.mjs` maps installed companion capabilities (`claude-mem`, `context7`, `sequential-thinking`, `chrome-devtools-mcp`, `frontend-design`, and `pua`) to concrete AI-facing triggers, phases, skip rules, and invocations.
- **Capability recommendations in `smart-route`.** Route output now includes `recommendedCapabilities` so `/curdx-flow:start` can choose docs lookup, memory search, UI design, browser verification, structured reasoning, or retry tooling from goal/topology facts without forcing every task through every tool.

### Changed

- **Global CLAUDE.md guidance is generated from the capability graph.** The managed block now emits concise installed-tool routing rules and a decision tree instead of hand-maintained duplicated plugin/MCP prose.
- **Start workflow stores tool hints with spec state.** New specs can persist compact `recommendedCapabilities` next to `projectTopology`, and the state schema/reference docs now declare both fields so later phases can reuse the original routing context without re-deriving it.

### Tests

- Added capability-router unit coverage, smart-route capability filtering checks, CLAUDE.md rendering regression coverage, and claudecc smoke assertions for empty direct-change hints and frontend/browser/docs recommendations.

## 7.1.18 — 2026-05-11

### Added

- **Dev-context project topology detection.** New `hooks/scripts/lib/project-topology.mjs` reads short `CLAUDE.md` Dev sections, optional `.claude/curdx-flow.local.md` `code_roots`, cheap manifests, and obvious sibling repo names to classify roots such as Vue/React frontends, Spring Boot/Spring Cloud backends, shared libraries, CLIs, infra, and Claude Code plugins.
- **Topology-aware smart routing.** `/curdx-flow:start` now blocks early when a goal needs a related code root outside current Claude Code access and returns an exact `/add-dir <path>` fix instead of asking users to understand `--add-dir`.
- **Topology cache guidance for indexing.** `/curdx-flow:index` now generates `specs/.index/project-topology.json` and `specs/.index/context-map.md` before component scanning, and stops with the access fix when related roots are missing.

### Changed

- **Settings and start guidance now favor user-friendly Dev context.** The settings template documents the recommended minimal `CLAUDE.md` form (`frontend`, `backend`, `database`) while keeping structured `code_roots` as an optional advanced override.
- **Sensitive local-service data is omitted from topology output.** Database and credential-looking lines in Dev context produce only a generic warning; real passwords, tokens, and production URLs are not copied into topology JSON or context maps.

### Tests

- Added split-repo topology tests for Vue/React frontends, Spring Boot/Spring Cloud backends, missing frontend access, configured `additionalDirectories`, context-map redaction, and the bundled `project-topology` CLI.

## 7.1.17 — 2026-05-11

### Added

- **Behavior-first smart routing for `/curdx-flow:start`.** New `hooks/scripts/lib/smart-route.mjs` classifies work into action routes (`direct-change`, `lite-spec`, `full-spec`, `epic-split`, `resume-current`, `blocked-ask-user`) so skills can choose the next action without exposing human size labels to the model.
- **Claude Code smoke gate.** Added `npm run test:claudecc`, which validates the plugin with the user's `claudecc` command, runs help/status in an isolated temp directory, and checks `smart-route` output without polluting the repository.
- **Route and skill quality regression tests.** New tests lock direct/lite/full/epic/resume/block routing behavior and prevent public skills from reintroducing mechanical checklist wording or human-size label traps.

### Changed

- **High-frequency skills are shorter and action-oriented.** `/curdx-flow:start`, `/curdx-flow:help`, and `/curdx-flow:status` now focus on route, next action, and recovery instead of loading long manuals into the session.
- **Task planning now speaks value slices.** `task-planner` was compressed from a large rulebook into a focused contract: top-level tasks must be autonomous value slices with automated verification, and oversized work routes to triage instead of inflating one spec.
- **Sizing references no longer ask the AI to reason in abstract shirt sizes.** Planning docs now use route names and concrete task-count limits; legacy `autoPolicy.size` remains only as a compatibility field for existing state and hook behavior.

## 7.1.16 — 2026-05-11

### Fixed

- **Installed plugin load failure on Claude Code 2.1.138.** Removed the duplicate `hooks` path from `plugin.json`; Claude Code auto-discovers the standard `hooks/hooks.json` file, and redeclaring the same path caused `curdx-flow@7.1.15` to fail with `Duplicate hooks file detected` after `claudecc plugin update`.
- **Manifest drift guard for hook discovery.** Runner tests now require `hooks/hooks.json` to exist while forbidding `plugin.json` from redeclaring that standard hook file.

## 7.1.15 — 2026-05-11

### Added

- **Deterministic AutoPolicy execution classifier.** New hook utility `hooks/scripts/lib/auto-policy.mjs` classifies each goal into XS/S/M/L/XL size, risk, execution mode, task target range, review cadence, verification level, subagent policy, Stop-hook behavior, and iteration caps before expensive model work starts.
- **Runtime and schema support for persisted `autoPolicy`.** `.curdx-state.json` now stores the selected policy, schema validation accepts `autoPolicy`, and shared hook types expose the policy contract.
- **Regression tests for policy behavior and workflow drift.** New hook tests lock classifier decisions and Stop-hook policy behavior; runner tests prevent task sizing docs from drifting back to 40+ task defaults.

### Changed

- **Specs now default to automatic strength selection instead of asking users to choose fast/deep or fine/coarse.** `/curdx-flow:start`, `/curdx-flow:new`, `/curdx-flow:tasks`, `/curdx-flow:implement`, help, core references, and task-planner guidance all treat `autoPolicy` as the source of truth while still allowing explicit `--mode`, `--tasks-size`, and `--review` overrides.
- **Task planning is now bounded around vertical slices.** Top-level tasks keep test/reproduce, implementation, verification, and commit together; normal specs target 3-7 or 5-12 tasks, and oversized requests route to triage instead of inflating one spec.
- **Stop-hook continuation is shorter when policy allows it.** Medium and larger specs use a compact continuation prompt; XS/S specs can disable automatic Stop-hook continuation entirely to avoid token-heavy loop prompts.

## 7.1.14 — 2026-05-10

### Fixed

- **Fresh spec state now consistently uses the bounded `maxGlobalIterations: 30` default.** `/curdx-flow:start`, `/curdx-flow:new`, quick mode, and the execution-state hook fallback now agree with the implement skill's cost-runaway contract. Existing legacy state files that already store `100` remain compatible.
- **Agent Teams are no longer documented as the stable default anywhere in the workflow path.** Research, triage, scanner resume guidance, and core delegation rules now use direct `Task(...)` dispatch as the baseline, with Agent Teams only as an optional experimental overlay when enabled and available.
- **Public entrypoint skill tool grants are narrower.** Shipped `/curdx-flow:*` skills no longer use `allowed-tools: "*"`, reducing accidental broad permission grants while preserving the tools each workflow actually needs.
- **Support skills are hidden from the slash menu but remain model-invocable background guidance.** `spec-workflow`, `curdx-core`, `communication-style`, `interview-framework`, and `verification-before-completion` now have trigger-focused descriptions and explicit background-skill metadata.
- **Help and cost references now expose the current iteration-cap interface.** `/curdx-flow:help` documents both `--max-task-iterations` and `--max-global-iterations`; cost docs use the real `/curdx-flow:implement` invocation form.

### Added

- **Runner guards for runtime-contract drift.** Manifest integrity tests now lock bounded iteration defaults, forbid wildcard grants on public entrypoints, require support skills to stay hidden/background-invocable, reject old "research team as default" wording, and verify help documents the global iteration cap.

## 7.1.13 — 2026-05-10

### Changed

- **Public skill descriptions are now trigger-focused.** All 15 `/curdx-flow:*` entrypoint skills now use concise `Use when...` descriptions so Claude Code surfaces user situations instead of workflow summaries.
- **Skill maintenance policy captures the adopted reference-project patterns.** Added `skills/spec-workflow/references/skill-quality-patterns.md`, distilling the useful parts of the official Claude Code skills docs, `gstack`, and `superpowers`: trigger-only descriptions, deliberate manual entrypoints, progressive disclosure, coordinator posture, and verification gates.

### Added

- **Runner guard for skill description quality.** Manifest integrity tests now require public entrypoint descriptions to be trigger-focused and terse, and assert the new skill-quality reference is linked from `spec-workflow`.

## 7.1.12 — 2026-05-10

### Fixed

- **Help output now lists the full skills-only slash surface.** `/curdx-flow:help` now includes all 15 public entrypoint skills, including `triage`, `refactor`, and `index`, so Claude Code and users see the same command surface after the commands-to-skills migration.
- **Epic triage next-step prompts use namespaced slash skills.** Remaining bare `/start` and `/triage` examples were updated to `/curdx-flow:start` and `/curdx-flow:triage`.

### Added

- **Runner guard for help/entrypoint drift.** Manifest integrity tests now assert `/curdx-flow:help` lists every public entrypoint skill and public entrypoint docs do not reintroduce un-namespaced legacy slash command suggestions.

## 7.1.11 — 2026-05-10

### Changed

- **Plugin surface migrated to skills-only.** The legacy `plugins/curdx-flow/commands/` directory has been removed. All former `/curdx-flow:*` entries now live as same-name user-invocable skills under `plugins/curdx-flow/skills/<name>/SKILL.md`, preserving public invocation names while using the current Claude Code skill layout.
- **Entrypoint skills are explicit task skills.** Migrated workflow entrypoints set `disable-model-invocation: true` so phase-changing actions are invoked deliberately; model-invoked guidance remains in support skills such as `spec-workflow`, `curdx-core`, and `interview-framework`.
- **Skills-only architecture docs.** `spec-workflow`, `curdx-core`, `help`, and `spec-workflow/references/entrypoints.md` now describe the skills-only entrypoint policy, global reference usage, and stable `/curdx-flow:*` slash-skill surface.

### Added

- **Runner guard for skills-only migration.** Manifest integrity tests now assert there is no `commands/` directory, `plugin.json` does not declare `commands`, all 15 former slash commands exist as skills, and migrated entrypoint skills are explicit user-invoked tasks.

## 7.1.10 — 2026-05-10

### Changed

- **Skills-first plugin posture.** curdx-flow now documents a clear skills-first, commands-compatible architecture: reusable workflow logic belongs in `skills/`, while `commands/` stays as the stable public `/curdx-flow:*` compatibility surface.
- **Skill invocation metadata tightened.** Core skills now use concise `description` values plus `when_to_use` trigger detail, matching Claude Code's current skill listing behavior and reducing trigger noise.
- **Deprecated verification alias hidden from model invocation.** `reality-verification` now explicitly sets `disable-model-invocation: true`; `verification-before-completion` remains the canonical skill.
- **Help output clarifies the split between skills and commands.** `/curdx-flow:help` now explains that skills carry canonical reusable guidance and commands remain stable user entry points.

### Added

- **`skills/spec-workflow/references/commands-vs-skills.md`.** New policy reference explaining why curdx-flow should not delete commands yet, when a command should become a thin wrapper, and how to avoid accidental same-name skill precedence changes.
- **Runner tests for skills-first regressions.** Manifest integrity checks now enforce concise skill descriptions, deprecated alias hiding, no accidental skill/command name shadowing, and presence of the commands-vs-skills policy.

## 7.1.9 — 2026-05-10

### Changed

- **Claude Code plugin API alignment.** `plugins/curdx-flow/.claude-plugin/plugin.json` now declares repository/homepage metadata and explicit official component paths for `skills`, `commands`, `agents`, and `hooks`. This keeps auto-discovery deterministic while preserving the existing command and skill layout.
- **Agent Teams are now an optional experimental enhancement, not the default execution contract.** Research, requirements, design, tasks, two-stage review, bounded parallel dispatch, quick mode, and parallel execution coordinator docs now default to ordinary `Task(subagent_type: ...)` dispatch. `TeamCreate` / `TaskCreate` / `TaskList` / `SendMessage` flows are only used when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` and the team tools are available; failures fall back to direct Task dispatch without treating the run as degraded.
- **Plugin agents now use official runtime frontmatter.** All shipped agents declare `model`, `effort`, and `maxTurns`; read-only reviewer agents have explicit read-only tool allowlists. This makes model/turn budgeting and reviewer write boundaries visible to Claude Code.
- **Hook UX and safety bounds improved.** Every command hook in `hooks/hooks.json` now declares a `statusMessage` and bounded timeout, matching current Claude Code hook configuration fields while preserving fail-open hook behavior.
- **Slash-command frontmatter now passes `claude plugin validate`.** Command `argument-hint` values are quoted where they contain bracket syntax, and `allowed-tools` declarations use validator-friendly space-separated strings instead of inline YAML arrays.

### Added

- **Runner tests for plugin metadata drift.** `manifest-integrity.test.ts` now validates plugin manifest paths, hook status/timeout fields, agent runtime frontmatter, and reviewer read-only tool boundaries. Existing dispatch drift tests now lock the new direct-Task-first Agent Teams contract.

## 7.1.8 — 2026-05-07

### Fixed

- **stop-watcher: completed specs no longer trigger missing-verification-block error (PR #9).** A spec finalized per NFR-5a (v7.1.0 retain-on-completion) repeatedly emitted `Phase 'execution' has no verification block. Run: /curdx-flow:execution` whenever the user stopped a session and the transcript happened to contain `ALL_TASKS_COMPLETE`. Root cause: `handleCompletion()` in `src/hooks/stop-watcher.ts` ran the iron-law verification gate without checking `state.completed === true` first; the mainline gate at L826 had the check, but handleCompletion exited before reaching it. Fix adds the same short-circuit immediately after the stateMalformed check inside handleCompletion. Mirrors the L826 guard intent — the two paths can't share a single check because handleCompletion returns before the mainline gate runs. Bundle (`plugins/curdx-flow/hooks/scripts/stop-watcher.mjs`) regenerated.
- **tests: cross-platform fixture transcripts via runHook helper (PR #8).** Windows/Node22 CI was red since the OB-3 epic merged: 5/13 stop-watcher POC-gate tests failed because static fixtures (e.g. `all-complete.json`) hardcode `transcript_path: "/tmp/curdx-fixture-transcripts/complete.txt"`, which doesn't reliably resolve on Windows. The `runHook` helper (`tests/hooks/_helpers.ts`) was finished half-way during v7.0.0-beta.1's Bug 2 fix — it rewrote the fixture's `cwd` field to the runtime tmpdir but never gave `transcript_path` the same treatment. This release extends the cwd-rewrite block with a prefix substitution: any `transcript_path` starting with `/tmp/` is replaced with `os.tmpdir()` so the hook reads from the path the test's `beforeEach` actually provisions. No fixture JSON files needed editing. Companion change: `tests/hooks/stop-watcher.test.ts` `beforeEach` now writes to `os.tmpdir()/curdx-fixture-transcripts/...` via `FIXTURE_TRANSCRIPT_DIR`/`FIXTURE_TRANSCRIPT_FILE` constants (6 hardcoded `/tmp/` occurrences replaced).

### Added — quality / CI hardening (no user-facing CLI changes)

- **`tests/hooks/lib/verify-blocks.test.ts` — 13 isolated unit tests for the iron-law gate (PR #11).** verify-blocks is the single source of truth referenced from 4 distinct callers (Stop hook, TaskCompleted hook, npm verify, `curdx-flow check` CLI). Until now its behavior was only locked down via the Stop hook e2e suite — coarse proxy that exercised happy + missing + stale via spawnSync but couldn't isolate `walkSrcTree`'s prune list, depth cap, or the typed-coercion in `getVerificationPhase`. New direct tests cover: VERIFICATION_PHASES order, getVerificationPhase typed coercion + null-on-legacy-"unknown", verifyPhaseBlock 4 design-mandated branches (missing / non-zero-with-failedReason / non-zero-default / stale-evidence / happy), and walkSrcTree's empty-dir-zero / max-mtime-aggregation / WALK_SKIP_DIRS pruning / FR-8 fail-open on non-existent dir. Imports the TS source directly (`../../../src/hooks/lib/verify-blocks.js`) rather than spawning the bundle — verify-blocks is a non-CLI lib per the source comment at L17-21; consistent with `tests/hooks/subagent-context-injector.test.ts:6`.
- **`tests/runner/manifest-integrity.test.ts` — frontmatter + reference-link guard for 31 plugin .md files (PR #12).** 15 commands + 10 agents + 6 skills had **zero automated check** before this release — a typo'd YAML key, renamed reference, or missing description could ship to users with no CI guard. New test validates: discovery sanity (lower bounds catch mass-deletion regressions), commands have non-empty `description`, agents/skills have both `name` + `description`, agent `name` matches filename (Task tool dispatch key), skill `name` matches parent directory (Skill tool dispatch key), every `references/<foo>.md` mention resolves — commands/agents look in global `plugins/curdx-flow/references/`, skills look in their LOCAL `skills/<name>/references/` subdir (the test differentiates the two scopes). Regex parsing only — no `gray-matter` dep, same convention as `claudeMd.test.ts` and `iron-law-doc.test.ts`.
- **`test:runner` npm script + wired into `verify` chain (PR #12).** `tests/runner/` (claudeMd, two-stage-review, iron-law-doc, e2e-verification-flow, etc. — 9 files / 73 tests including the new manifest-integrity) was orphaned from the npm script chain: it ran locally on demand but never as part of `npm run verify` and never in CI. New `test:runner` script runs `vitest run tests/runner`. `verify` chain now: `typecheck && check-versions && check:hooks-fresh && build && check:bundle && test:hooks && test:analyze && test:runner && check-verification-blocks`.
- **CI: bundle-size guard (`check:bundle`) runs on every PR (PR #10).** Validates `dist/index.mjs` against the 84 KB NFR-3 threshold (currently 72.94 KB ≤ 84 KB). Previously buried in `prepublishOnly` — too late to catch drift before merge. The test-matrix job also now runs `npm run build` (tsup) before `check:bundle` so `dist/index.mjs` exists when the guard fires.

### Notes

- **Plugin distribution constraint (re-affirmed):** `marketplace.json` declares `source: "./plugins/curdx-flow"`, so end users get the plugin via git clone (npm tarball ships only `dist/` per `package.json` `files`). Build artifacts under `plugins/curdx-flow/hooks/scripts/**/*.mjs` and `*.mjs.map` therefore **must remain git-tracked** — gitignoring them would break end-user installs. PR #9 includes the rebuilt `stop-watcher.mjs` bundle alongside the TS source change for this reason.
- **Follow-ups deferred (not P0):**
  - **`test:analyze` in CI**: vitest exits with code 2 in GitHub Actions ~300ms after all 106 analyze tests pass; reproducible only in CI, not local macOS. Suspected fork-pool teardown interaction with the preceding `test:hooks` vitest run. Filed for separate investigation; PR #10 added only `check:bundle` to the matrix.
  - **`test:runner` step in `ci.yml`**: script ships in this release, but the matching `- run: npm run test:runner` step is a follow-up commit (avoiding scope creep on the v7.1.8 release wave).

## 7.1.7 — 2026-05-07

### Added — observability-v2 epic (OB-1 + OB-2 error-logger + OB-3, PR #7)

#### OB-3 — cost / time / token analytics (spec-cost-time-token-analytics)
- **`npx curdx-flow analyze --cost-summary` flag suite.** New citty flag turns on cost / time / token aggregation across the spec funnel. Companion flags `--by-spec`, `--by-phase`, `--by-task`, `--top <N>`, and the existing `--since <duration>` compose freely. Off by default — the v7.1.7 baseline `analyze` 7-section report is preserved byte-equal when `--cost-summary` is absent (NFR-6).
- **`src/analyze/pricing.ts` — hardcoded 3-model pricing table + `LAST_UPDATED` constant.** Zero npm runtime deps. Per-1M-token USD for Opus 4.7 / Sonnet 4.6 / Haiku 4.5 across 5 fields each (input / output / cache_read / cache_5m_write / cache_1h_write). `MODEL_ALIASES` maps `claude-haiku-4-5 → claude-haiku-4-5-20251001` defensively. README documents 3-step refresh workflow (WebFetch official → diff `PRICING` → bump `LAST_UPDATED` + CHANGELOG entry).
- **`src/analyze/cost.ts` — `computeCost` + `extractUsageRowsFromEvents` + `extractTrailerUsage` + `aggregateBy(level, ctx)`.** Cost formula `(input·base + 5m·1.25·base + 1h·2·base + read·0.1·base + output·out)/1e6` rounded to 4 decimals. Trailer regex `/<usage>[\s\S]*?total_tokens:\s*(\d+)[\s\S]*?tool_uses:\s*(\d+)[\s\S]*?duration_ms:\s*(\d+)[\s\S]*?<\/usage>/g` parses subagent text-embedded usage (verified empirically, 681 occurrences across 702 transcripts). Three-level aggregation (`spec` / `phase` / `task`) joins via OB-2 correlationId `<sid>:<task>:<iter>`; phase resolution reads `specs/<name>/.curdx-state.json`.
- **`src/analyze/recommend.ts` — 8-rule engine + MAD outlier detection.** Pure-function rules: cache hit-rate, output tokens per turn (split-task signal), hit-cap rate, Opus mix in non-critical phases, MAD-based cost spike, wall-clock p95, cache_creation/read ratio (Anthropic anti-pattern #1), retry/loop count. Modified z-score (Iglewicz & Hoaglin 1993) with `MIN_N=10`, threshold `|z| > 3.5`, `0.6745` scale constant. Fourth severity `insufficient_data` covers small-sample / MAD=0 cases. `REC_THRESHOLDS` const centralizes all 16 numeric thresholds for future tuning.
- **`tests/analyze/fixtures/sample-with-usage.jsonl` (NEW, 7 rows).** Synthetic transcript carrying realistic `assistant.message.usage` nested cache_creation blocks across 3 models, 1 sidechain row, 1 subagent `<usage>` trailer in a tool_result text field, and 1 legacy-schema row (no nested cache_creation) for FR-PARSER-3 backwards-compat.
- **Cost Breakdown report (R1-R7 seven tables).** New markdown section: R1 per-spec / R2 per-phase / R3 per-task (with trailerCount column) / R4 cache hit / R5 wall-clock / R6 model mix (with Opus 4.7 +35% tokenizer footnote) / R7 top-N hot tasks. Each table independently togglable via `--by-spec` / `--by-phase` / `--by-task` filters.
- **Recommendations section + JSON top-level array.** Markdown `## Recommendations` block with 4-color severity prefixes (`[SEV]` red / `[WARN]` yellow / `[INFO]` blue / `[N/A]` gray), `NO_COLOR` env honored. JSON output gains top-level `recommendations: Recommendation[]` array sibling to `costBreakdown`. Top-level `totalCost.usd` mirror preserved (jq Validation Hint compatibility).
- **77 new analyze tests (pricing 11 + cost 15 + recommend 39 incl. 11 MAD edge cases + integration 12 incl. trailer attribution + requestId dedup regression).** Total analyze suite went 36 → 106; integration count 3 → 7.

#### OB-2 — error-logger.ts upgrade (spec-decision-event-logging, partial)
- **`logHookEvent` + 4-field schema (`level` / `kind` / `payload` / `correlationId`).** Extends `src/hooks/_shared/error-logger.ts` with NEVER-throw event-logging API. Legacy `logHookError` preserved as a thin redirect (`logHookEvent({ ...ctx, level: 'error', kind: ctx.kind ?? 'unknown' })`) so existing call sites stay byte-equal. `EventKind` closed type union (10 kinds) + `coerceKind` coercer maps anything outside the closed set to `'unknown'`. `EventLevel` is `'error' | 'info' | 'metric' | 'decision'`.
- **Log rotation (size 10 MB OR age 30 d → `errors.<ISO-ts>-<pid>.jsonl`, retain 5).** New `shouldRotate(filePath)` dual-gate. `pruneRotatedFiles(dir, keep=5)` globs and unlinks oldest beyond retention. Throttled: `rotateIfNeeded` only does the `statSync` check every 10th `logHookEvent` call to keep p99 hot-path budget intact.
- **Cross-platform `safeRename(src, dst)` 4-step fallback chain.** POSIX atomic `renameSync` happy path, Windows `EBUSY` retry chain (50/200/500 ms), `EXDEV` cross-device copy+unlink, silent give-up persistent failure (NEVER-throw contract).
- **7 new tests in `tests/hooks/event-logger.test.ts`.** logHookEvent 4-field write, `coerceKind` unknown→'unknown', rotation triggers (size + age), `buildCorrelationId` 3-segment format, old single-field row round-trip with `??` defaults, NEVER-throws on disk-full mock.
- **Note**: hook-side `logHookEvent` call-site integration (across `stop-watcher` / `task-completed-verifier` / `subagent-context-injector` / `stop-failure-handler`) deferred to a follow-up spec — those hook files were independently rewritten by the v7.1.7 verification-iron-law epic and need re-integration on the new hook structure.

#### OB-1 — analyze reads real transcripts (spec-analyze-real-transcript)
- **🚨 CRITICAL FIX (B1) — `npx curdx-flow analyze` now reads `~/.claude/projects/<encoded-cwd>/*.jsonl` instead of the bundled fixture.** Prior versions (v7.1.6 and earlier) had `POC_FIXTURE_REL = "tests/analyze/fixtures/sample.jsonl"` hardcoded in `src/analyze/index.ts`; 5 separate code paths keyed off it, so the CLI silently emitted *test fixture data* dressed as user analytics for every invocation. Fix replaces all 5 sites with `resolveTranscriptSource({ cwd, fixtureOverride, sessionFilter })`. Major user-impact bug — every prior `analyze` output should be considered invalid.
- **`--session <uuid>` CLI flag.** New citty arg in `src/flows/analyze.ts` filters the per-session multi-glob to a single transcript under `~/.claude/projects/<encoded-cwd>/`.
- **`src/analyze/transcript-path.ts` resolver module.** Exports `resolveTranscriptSource(opts?)`, `TranscriptNotFoundError`, `TranscriptSource` union type. Encodes `realpath(cwd)` (cached) → `~/.claude/projects/<encoded>` layout. Honors `CURDX_TRANSCRIPT_FIXTURE` test-only env var for snapshot test isolation.
- **`cleanupOrphanState` helper in `src/analyze/index.ts`.** Two-pass GC over `state.files`: pass 1 drops entries with `lastModifiedMs > 30 days ago` OR `!existsSync(path)`; pass 2 caps total at 100 entries. Active session paths protected. Fail-open per FR-C3.
- **8 new tests in `tests/analyze/transcript-path.test.ts`.** cwd `/`→`-` encoding, multi-session glob, missing project dir → `TranscriptNotFoundError`, `fixtureOverride` short-circuit, `--session` filter, 30-day GC, 100-entry cap, file-gone GC.

### Added — verification iron law + parallel dispatch + cost-runaway guards (PR #5)

- **Layer-2 opt-in `TaskCompleted` hook (`plugins/curdx-flow/hooks/scripts/task-completed.mjs`).** Fires when a task is marked complete and inspects the active spec's `verificationBlocks` state field; if any block is unresolved, the hook emits a non-blocking warning to remind the executor that the next phase requires real-environment verification proof. Wired into `plugins/curdx-flow/hooks/hooks.json` as opt-in (Layer-2) — disabled by default to keep the baseline path zero-friction; users opt in by enabling the hook entry. Pairs with the `verifyPhaseBlock` gate in `stop-watcher.mjs` (see *Changed*) so blocking enforcement and surfaced reminders share the same state field.
- **`verificationBlocks` state schema field on `.curdx-state.json` (`plugins/curdx-flow/schemas/spec.schema.json`).** Optional array of `{ phase: string, requiredArtifact: string, resolved: boolean }` records. Phase commands write a block when they finish a deliverable that the next phase must verify against the real environment (e.g. design phase produces an architectural claim that tasks-phase implementation must reproduce). The block stays unresolved until a `[VERIFY]` task or VE proof clears it. Legacy state files without the field continue to work — `verificationBlocks === undefined` is treated as "no outstanding blocks", preserving backwards compatibility with v7.0.x and earlier 7.1.x state files.
- **`plugins/curdx-flow/references/iron-law-verification.md` reference doc.** Canonical write-up of the iron-law verification protocol: when a verification block is required, what counts as a "real-environment proof" (API response capture, log line, DB row, screenshot — *not* `tests pass` or `code compiles`), how `[VERIFY]` tasks are inserted, and the failure mode this protects against (LLM-style "looks done" optimism). Cross-referenced from the new skill (below) and from `commands/design.md` / `commands/tasks.md` so phase agents pick up the rule without re-deriving it.
- **`plugins/curdx-flow/skills/verification-before-completion.md` plugin skill.** Triggers on prompts like "verify completion", "check verification blocks", "iron law", "before marking done". Loads the iron-law reference and walks the agent through inspecting `verificationBlocks` on the active spec, collecting evidence per block, and either resolving or escalating each unresolved record. Intended as the entry point for both `[VERIFY]` task agents and human-driven `/curdx-flow:status` audits.
- **`scripts/check-verification-blocks.mjs` release gate.** New verify-chain step (wired into `package.json` `npm run verify`) that walks every `.curdx/specs/*/.curdx-state.json` and exits non-zero if any spec has unresolved `verificationBlocks` while `completed === true`. This makes "claimed-done but not verified" a hard CI failure rather than a silent drift, mirroring the `check-versions.mjs` pattern. Skipped automatically when no specs exist.
- **`npx curdx-flow check` CLI subcommand.** New citty subcommand (`src/flows/check.ts`, registered in `src/index.ts`) that runs the same verification-block walk as the release gate, but locally and outside CI. Useful for pre-commit verification or for spec authors auditing their own state files. Output mirrors the existing `analyze` subcommand's tone: green PASS line per spec, red row + JSON diff for each unresolved block. Exits non-zero on any unresolved block to fit shell pipelines.
- **`plugins/curdx-flow/references/bounded-parallel-dispatch.md` reference doc.** Extends the previous `references/parallel-research.md` from a research-only playbook into a generalized "fan out by independent domain, coordinator is single source of truth" playbook covering the **research / review / debug** domains. New sections: `## Domain Coverage` (per-domain row table), `## Independence Criteria` (a 3-item pre-flight checklist that *all* must pass before fan-out — Independent Input / Independent Output / Independent Context), `## Per-Domain Anti-patterns` (≥10 numbered items: 3 research + 5 review + 5 debug, each shaped as "1-sentence statement; Coordinator: do this instead"), and `## Subagent vs Grep` (verbatim Anthropic best-practices citation: "predilection for subagents"). The pre-existing 5-step dispatch pattern, topic identification, merging, and complexity-scaling sections are preserved verbatim per the spec's drift-test invariant.
- **Drift detection test (`tests/runner/bounded-parallel-dispatch-doc.test.ts`).** Mirrors the `iron-law-doc.test.ts` shape (vitest + `node:fs`/`path`, no extra deps). Eight assertions: new doc exists, old stub is ≤3 lines and contains "Moved to ... bounded-parallel-dispatch.md", §4 has ≥10 numbered anti-patterns total, ≥3 per domain (research/review/debug — catches single-bucket starvation that would silently neuter spec B's review-domain contract), all 3 independence criterion strings present, zero `parallel-research.md` literal matches across the 6 inbound `commands/*.md` files (excluding the stub), the "predilection for subagents" string is preserved, and the 5-step dispatch pattern heading survives the rename verbatim. Test runs in <5 ms.
- **`code-quality-reviewer` agent (3-layer drift defense, 30 rubrics across 6 categories).** New review-domain subagent that audits implementation drift against design-phase claims along three layers (literal-string match, semantic equivalence, behavioral parity) and scores work against 30 rubrics organized into 6 categories (correctness, security, performance, maintainability, observability, test quality). Emits the SLSA verdict shape (`{ pass: bool, severity, rubric_id, evidence }`) so coordinators can merge multi-reviewer output deterministically. Pairs with `spec-reviewer` (narrowed — see *Changed*) so spec-compliance and code-quality concerns no longer overlap.
- **`plugins/curdx-flow/references/two-stage-review.md` reference doc — domain boundary + SLSA verdict shape.** Canonical write-up of the two-stage review protocol: which review domain owns which concern (spec-compliance = `spec-reviewer`, code-quality = `code-quality-reviewer`), the verdict object shape every reviewer must emit (SLSA-style), and the merge rule the coordinator applies when both stages report. Cross-referenced from both reviewer agents and from `commands/design.md` / `commands/tasks.md` so the boundary is locked at every entry point.
- **Parallel dispatch at design/tasks phase boundaries (consumes `bounded-parallel-dispatch.md`).** The design and tasks phase commands now fan out spec-compliance and code-quality reviews concurrently using the bounded-parallel-dispatch playbook (Independent Input / Independent Output / Independent Context). Coordinator merges the two SLSA verdicts into a single `REVIEW_PASS` / `REVIEW_FAIL` final-line protocol verdict — wall-clock for the review step is now bounded by max(stage1, stage2) instead of stage1 + stage2.
- **`SubagentStart` hook (`subagent-context-injector`) — preempts superpowers issue #237 by re-injecting spec context + iron-law summary into every subagent dispatch.** New plugin hook (`plugins/curdx-flow/hooks/scripts/subagent-context-injector.mjs`, bundled from `src/hooks/subagent-context-injector.ts`) fires on every Claude Code `SubagentStart` event and emits a compact `<curdx-spec-context>` block (~120 B; budget ceiling 2 KB) carrying `phase`, `spec`, and `iron-law: <IRON_LAW_SUMMARY>` into the dispatched subagent's `additionalContext`. This sidesteps the upstream superpowers gap (issue #237 was closed wontfix) where subagents lose the parent session's spec framing and iron-law guard the moment they spin up. Wired into `plugins/curdx-flow/hooks/hooks.json` as a baseline (always-on) hook — no opt-in env var required because `SubagentStart` is GA in current Claude Code (unlike the `TaskCompleted` event added in 7.1.7's Layer-2 hook, which still requires an opt-in flag upstream). Fail-open across 5 paths (state-absent / malformed JSON / completed-spec / payload-over-budget / unexpected throw): every failure path emits `{continue:true}` with no `hookSpecificOutput`, never blocks subagent dispatch.
- **Shared `src/hooks/lib/build-context-payload.ts` — single source of truth for SessionStart + SubagentStart context construction (DRY).** New pure-function library exporting `IRON_LAW_SUMMARY` constant (`"No completion claim without fresh verification."`), `BuildContextPayloadOpts` interface (`forSubagent?: boolean; maxBytes?: number`), `PayloadOverBudgetError` class, and `buildContextPayload(state, specDir, opts?)`. The function returns the existing SessionStart JSON shape (specName, phase, taskIndex, totalTasks, goal, awaitingApproval) when `forSubagent !== true`, and a key:value `<curdx-spec-context>…</curdx-spec-context>` text block when `forSubagent === true`. Throws `PayloadOverBudgetError` when the rendered output exceeds `opts.maxBytes ?? 2048` (NFR-1 budget enforcement). Both hooks now consume this lib instead of inlining their own payload construction logic.
- **7 unit tests + drift gate test + byte-equal SubagentStart baseline.** `tests/runner/subagent-context-injector.test.ts` covers cases (a)-(g) — happy path, state-absent, malformed-state, NFR-1 size budget (`additionalContext` ≤ 200 B; full output ≤ 2048 B), `IRON_LAW_SUMMARY` substring presence, `state.completed === true` short-circuit, and quickMode universal-injection (D2). `tests/runner/subagent-context-doc.test.ts` is a single-assertion drift gate that imports `IRON_LAW_SUMMARY` from the shared lib and asserts the constant appears verbatim in `plugins/curdx-flow/references/iron-law-verification.md` — failing CI if either side drifts. `tests/runner/byte-equal.test.ts` gains a frozen `SUBAGENT_START_BASELINE` constant capturing exact `{"hookSpecificOutput":{...},"continue":true}` stdout + `EXIT_CODE=0` for the SubagentStart hook (no v6.0.6 baseline existed since the hook is new — the v7.1.7 output is the new floor). Hook test count moved from 91 → 99 (+8: 7 unit + 1 byte-equal regression).
- **`StopFailure` hook (`stop-failure-handler`) — observability-only handler with 8-matcher map for autonomous-loop failure classification.** New plugin hook (`plugins/curdx-flow/hooks/scripts/stop-failure-handler.mjs`, bundled from `src/hooks/stop-failure-handler.ts`) fires on every Claude Code `StopFailure` event and writes a structured `~/.claude/curdx-flow/stop-failures.jsonl` line (`ts`, `matcher`, `session_id`, `cwd`, `spec`, `phase`) classifying the failure cause into one of 8 known matchers: `rate_limit`, `max_output_tokens`, `api_died`, `network_error`, `auth_error`, `quota_exceeded`, `tool_error`, plus `unknown` fallback for forward-compat with future Anthropic-side matcher additions. **Observability-only by upstream contract** — the hook's stdout/exit-code is fully ignored by Claude Code on `StopFailure` events (per Anthropic docs), so the hook never attempts to block, retry, or alter the loop; it exists purely so `npx curdx-flow analyze` and post-hoc audits can attribute autonomous-loop terminations. Wired into `plugins/curdx-flow/hooks/hooks.json` as a baseline (always-on) hook. Fail-open across every error path: malformed JSON / unwritable log dir / unknown matcher / unexpected throw all emit `{continue:true}` with no side effect on the parent loop.
- **`plugins/curdx-flow/references/cache-ttl-and-cost.md` reference doc (4 sections + GH#46829 cite).** Canonical write-up of the prompt-cache cost calculus that governs autonomous-loop sleep cadence and iteration ceilings: (1) **TTL Window** — Anthropic's 5-minute prompt-cache TTL, why sleeping ≥ 300 s evicts the cache and forces a full uncached read of conversation context on the next wake-up; (2) **Cost Multiplier** — empirical 5-10× cost penalty per cache miss documented in upstream Anthropic discussion `GH#46829` plus the 17.1% over-billed real-money figure measured by spec E's research phase; (3) **Cadence Heuristics** — pick `delaySeconds` under 270 s to stay in cache, or commit to ≥ 1200 s and amortize the single miss; explicitly avoid 300-600 s "worst-of-both" zone; (4) **Iteration Ceiling Math** — at 30-iter cap × ~2 min nominal turn = ~1 hr unattended ceiling × ~$0.15 nominal turn cost = ~$4.50 nominal blast radius. Cross-referenced from `commands/implement.md`, the loop skill, and the new `--max-global-iterations` CLI flag's help text. Drift test (`tests/runner/cache-ttl-doc.test.ts`) locks the four section headings + the `GH#46829` literal cite + the `5-10×` and `17.1%` figures so a silent doc-edit cannot quietly de-fang the cost-multiplier warning.
- **`--max-global-iterations` CLI flag (mirrors `--max-task-iterations`).** New citty flag on `npx curdx-flow implement` (`src/flows/implement.ts`) that overrides `state.maxGlobalIterations` for the current invocation. Mirrors the existing `--max-task-iterations` flag's contract: integer ≥ 1, written into `.curdx-state.json` on next state write, takes precedence over schema defaults but loses to a value already present in legacy state files (so users who set `maxGlobalIterations: 100` in v7.1.6 keep their value). Lets users explicitly opt back into the old 100-iter ceiling via `--max-global-iterations 100` after the default tightening (see *Changed*). i18n: 2 new `implement.flags.maxGlobalIterations.*` keys in `src/i18n/{en,zh}.ts`.
- **5 unit tests + 3 max-iter enforcement tests + drift test + CLI flag tests + byte-equal baseline.** `tests/runner/stop-failure-handler.test.ts` covers the 8-matcher map (one assertion per matcher → log-line shape match) and 5 fail-open cases (no-state, malformed-state, unwritable-log-dir, unknown-matcher, unexpected-throw). `tests/runner/max-iterations-enforcement.test.ts` covers (a) coordinator hard-blocks when `currentIteration >= maxGlobalIterations`, (b) execution-loop hard-blocks when `taskIteration >= maxTaskIterations`, (c) error message contains `current/cap/3-step remediation`. `tests/runner/cache-ttl-doc.test.ts` is the drift gate (5 assertions: 4 section headings + GH#46829 cite). `tests/runner/implement-cli-flags.test.ts` covers `--max-global-iterations` parse + state-write + legacy-state precedence. `tests/runner/byte-equal.test.ts` gains `STOP_FAILURE_BASELINE` frozen constant for the new hook's `{continue:true}` no-op output (new floor — no v6.0.6 baseline existed). Hook test count moved 99 → 113 (+14: 8 matcher + 5 fail-open + 3 max-iter + 1 drift + 1 CLI flag + 1 byte-equal regression… some fold into existing files, net +14 assertions).

### Changed

- **`stop-watcher.mjs` extended with `verifyPhaseBlock` gate.** The stop hook now consults `verificationBlocks` before allowing a phase transition; if the current phase has an unresolved block, the transition is blocked with a structured error pointing the user at `npx curdx-flow check` and the iron-law reference doc. Existing transition rules (state-completion-marker semantics, schema validation) run unchanged ahead of the new gate, so legacy specs without `verificationBlocks` skip the new check entirely.
- **`reality-verification` skill renamed to `verification-before-completion`; legacy alias preserved.** The skill's previous name described the *technique* (reproduce failure before/after); the new name describes *when to invoke it* (before marking work complete), which aligns with how the spec-executor and `[VERIFY]` task agents actually trigger it. The original `reality-verification` skill name is retained as a redirecting alias so existing prompts and references continue to resolve.
- **`npm run verify` chain extended with `check-verification-blocks` step.** The release gate now runs after `test:analyze` and before publish, alongside the existing `check-versions` / `check:hooks-fresh` / `check:bundle` gates. `prepublishOnly` continues to invoke the same chain via `npm run verify`, so local `npm publish` and the CI release workflow both fail fast on unresolved verification blocks.
- **Renamed `plugins/curdx-flow/references/parallel-research.md` → `plugins/curdx-flow/references/bounded-parallel-dispatch.md`.** The old name described only one domain; the new name describes the underlying technique ("bounded parallel dispatch by independent domain"), which is what the doc actually formalizes once review and debug rules are added. The old path retains a 1-line stub redirect (`> Moved to [bounded-parallel-dispatch.md](./bounded-parallel-dispatch.md). ...`) so the 9 soft `specs/*.md` references continue to resolve without churn — only the 4 hard inbound refs were physically rewritten (see below). Backwards-compat preserved for any external link.
- **4 inbound references updated to the new path.** `plugins/curdx-flow/commands/research.md` (×2, lines 78 and 103), `plugins/curdx-flow/commands/start.md` (×1, line 193), and `plugins/curdx-flow/references/triage-flow.md` (×1, line 46) now point at `references/bounded-parallel-dispatch.md`. Soft consumers (`commands/requirements.md` / `design.md` / `tasks.md`) were grep-verified to contain zero literal `parallel-research.md` matches and were left untouched. The drift test's `path-consistency-commands` assertion locks this so a future regression cannot silently re-introduce the old path string.
- **`spec-reviewer` narrowed to spec-compliance only (E1 13-item cut/split/move audit).** The previous `spec-reviewer` covered both spec-conformance and general code-quality concerns, which produced verdict overlap and double-flagging when the same issue tripped both rubric sets. E1 audited the original 13-item rubric and cut/split/moved each item: 5 items stayed (true spec-compliance — schema, phase ordering, state-marker semantics, file scope, commit-message convention), 5 items moved to the new `code-quality-reviewer`, and 3 items were split into both reviewers with non-overlapping evidence requirements. Net: each concern has exactly one owning reviewer, and the merge rule is now deterministic.
- **`VerificationBlock.reviews` keyed-object field on `.curdx-state.json` (additive, backwards-compatible).** Schema gains an optional `reviews: Record<reviewerId, { verdict, severity, rubric_id, evidence }>` map on each `verificationBlock`. Coordinator writes one entry per dispatched reviewer (`spec-reviewer`, `code-quality-reviewer`); legacy state files without the field continue to parse and execute unchanged because `reviews === undefined` is treated as "no reviews recorded yet". Schema validation only enforces the field's *shape* when present.
- **REVIEW_PASS / REVIEW_FAIL final-line protocol byte-equal preserved (NFR-1).** The exact final-line verdict tokens emitted by phase commands and reviewer agents (`REVIEW_PASS` / `REVIEW_FAIL`) are byte-equal to v7.1.6 output. Downstream consumers (stop-watcher, state-completion-marker, external scripts grepping for these tokens) require zero changes. The two-stage review protocol changes *who* produces the verdict (now a coordinator merge of two SLSA verdicts) but not *what bytes appear on the final line*.
- **`SessionStart` hook (`load-spec-context.ts`) refactored to use shared `build-context-payload.ts` lib (surgical, byte-equal preserved).** The previously-inlined payload construction inside `load-spec-context.ts` is now a single `Object.assign(block, JSON.parse(buildContextPayload(state, specPath)))` call shared with the new `SubagentStart` hook (D4 surgical refactor). Source diff was 21 ins / 21 del (well under the 50-LoC ceiling). All 3 function signatures, the `readEnabledSetting` / `readGoalFromProgress` helpers, the stderr banner, and the handler control flow are preserved verbatim — the lib's default-branch fallbacks (`phase ?? "unknown"`, `taskIndex/totalTasks ?? 0`, `awaitingApproval === true`) match the historical inline assignments so byte-equal output holds for any state shape. All 16 v6.0.6 byte-equal regressions in `tests/runner/byte-equal.test.ts` pass unchanged — load-spec-context output is bit-for-bit identical to the pre-refactor binary. Insertion order of keys on `block` is preserved because `Object.assign` keeps existing keys' order and only appends new ones.
- **🚨 USER-VISIBLE DEFAULT CHANGE — `maxGlobalIterations` default tightened: `100` → `30`.** New autonomous-loop initializations now write `maxGlobalIterations: 30` into `.curdx-state.json` instead of the historical `100`. The new ceiling represents a **~1 hour unattended runtime cap** (30 iter × ~2 min nominal turn) and a **~$4.50 nominal blast radius** (30 iter × ~$0.15 nominal turn cost), both calibrated to the 5-min prompt-cache TTL economics documented in the new `references/cache-ttl-and-cost.md` reference (GH#46829: 5-10× cost multiplier per cache miss; 17.1% real-money over-bill measured upstream). **Backwards-compat preserved**: existing `.curdx-state.json` files that already carry `maxGlobalIterations: 100` keep their value untouched — the new default applies only to fresh `npx curdx-flow new` / `implement` initializations. **Opt-in to legacy ceiling**: pass `--max-global-iterations 100` (see *Added*) to restore the v7.1.6 behavior on a per-invocation basis. Rationale: the prior `100` value was both (a) effectively never enforced (stop-watcher only `stderr`-warned, coordinator did not read the field at all — see next bullet) and (b) a user-perceived cap that did not match the real cost-runaway risk profile. Pairs with the *hard-block* enforcement change below — together they make the cap a real ceiling instead of a polite suggestion.
- **🚨 BREAKING-ish — `stop-watcher.mjs` now HARD-BLOCKS (was soft-warn) when `maxGlobalIterations` is hit.** Previously the stop hook merely emitted a `stderr` warning when `state.currentIteration >= state.maxGlobalIterations` and let the autonomous loop continue forever. The hook now emits a structured `{continue: false}` decision with an actionable error message of shape:
  ```
  ❌ Iteration cap reached: <current>/<cap> global iterations.
  Remediation:
  1. Inspect .curdx/specs/<spec>/.curdx-state.json — confirm progress is real, not stuck.
  2. If work is genuinely incomplete and the cap is too tight, raise it: `npx curdx-flow implement --max-global-iterations <N>`
  3. If the loop is stuck, run `npx curdx-flow cancel <spec>` and re-investigate root cause before resuming.
  ```
  Same hard-block treatment is now applied at the **coordinator level** (`src/runner/execution-loop.ts`) for `maxTaskIterations` so per-task cost runaway is also bounded. **Migration**: users who previously relied on the soft-warn behavior to "watch and decide later" must now either set a higher cap (`--max-global-iterations 200`, etc.) or accept the new ~1 hr / ~$4.50 ceiling. The combined default change (100 → 30) + hard-block enforcement is the load-bearing fix in this release for the cost-runaway-guards spec — schema field `maxGlobalIterations` was *declared* in v7.0.x but never *enforced* until now.

> **Note on event GA status:** the `SubagentStart` hook event is **GA** in current Claude Code — no env var opt-in is required, unlike the `TaskCompleted` event added in this same release for the Layer-2 verification-blocks reminder hook (which is still gated behind an opt-in flag upstream). Both hooks coexist cleanly: SubagentStart fires on every subagent dispatch baseline, TaskCompleted fires only when explicitly enabled.

## 7.1.6 — 2026-05-06

### Changed

- **Managed-block body is now English-only; bilingual rendering removed.** `src/runner/claudeMd.ts` previously emitted a Simplified-Chinese body when the installer ran with `--lang zh` (or `CURDX_FLOW_LANG=zh`). The block is injected into `~/.claude/CLAUDE.md` and consumed by Claude as system-prompt context, not by humans, so a Chinese body actually contradicts the very `Language Policy` rule the block itself injects ("Tool and model interaction must be in English"). The body, including section headings, is now always English. The `Language Policy` section is still gated to `zh` mode — that section is what tells Claude to reply to the *user* in Simplified Chinese. Result: one source of truth for the body text, lower per-session token footprint, and one less language-drift risk between zh/en branches. The added test in `tests/runner/claudeMd.test.ts` asserts the rendered block contains no CJK characters even in `zh` mode.
- **Section headings stripped of bilingual suffixes.** Headings such as `## Tool Combination Patterns（组合工作流）` are now plain `## Tool Combination Patterns`. The parenthetical Chinese suffix added no signal for Claude and cost tokens on every session injection.

### Fixed

- **Removed redundant `npx @curdx/flow` install/update/uninstall hint from the injected block.** The line `Run \`npx @curdx/flow\` to install / update / uninstall.` was marketing copy aimed at human readers, not guidance for Claude. It has been stripped from `renderBlock` so it no longer ends up in the system prompt.
- **`/claude-mem:mem-search` is referenced once instead of three times.** It previously appeared as the first step of *Starting a new feature*, the first step of *Debugging and repeated failures*, and the fourth item of the *Decision Tree*. It is now only referenced in the *Decision Tree*, where it belongs as a general "have we seen this before?" question. Removes ~30 tokens of duplicated guidance per session.
- **Aligned the "skip" rule for pua with the "stuck" rule.** `Skip Rules` told Claude not to reach for `/pua:pua` first, while `Tool Combination Patterns` recommended `/pua:pua-loop` only after multiple stuck attempts. The two rules are about the same tool but disagreed on its name, which read as a self-contradiction inside one block. `Skip Rules` now references `/pua:pua-loop` explicitly.
- **Fixed a Chinese-only grammar bug in the "still stuck" line.** When both `pua` and `sequential-thinking` were installed, the joined sentence rendered as `两轮以上仍卡住，再 使用 sequential-thinking MCP 拆假设，或 再进入 \`/pua:pua-loop\` 迭代。` — duplicate "再" and a stray space. The bug is fully eliminated as a side effect of moving to an English-only body; the contributing pattern (verb prefix in the template plus verb prefix in joined items) was also removed in `buildCombinationPatterns`.

## 7.1.5 — 2026-05-06

### Fixed

- **Prevent local source checkouts from silently running a stale CLI bundle.** A repo-local execution path could still write the old `~/.claude/CLAUDE.md` block even after `7.1.4` was published correctly, because `.gitignore` excludes `dist/` and `npx @curdx/flow` run from the source checkout may execute the checkout's local `bin` (`dist/index.mjs`) instead of the freshly published npm tarball. If `src/` had newer changes but `dist/` had not been rebuilt, the user would unknowingly run old installer logic and keep re-injecting the pre-7.1.4 managed block. Added `src/runner/buildFreshness.ts` and wired it into `src/index.ts` startup so source checkouts now fail fast with a clear error when `src/**/*.ts` is newer than `dist/index.mjs`, instructing the user to run `npm run build` or execute the published package explicitly. New tests in `tests/runner/buildFreshness.test.ts` cover both stale and fresh build states.

## 7.1.4 — 2026-05-06

### Changed

- **`~/.claude/CLAUDE.md` managed block is now language-aware.** `src/runner/claudeMd.ts` no longer emits a single Chinese-only block regardless of installer language. The managed `<!-- BEGIN @curdx/flow v1 -->` block now renders in English when the installer runs with `--lang en` (or `CURDX_FLOW_LANG=en`) and in Chinese when it runs with `zh`. This keeps the generated guidance aligned with the installer's selected language instead of mixing an English install flow with Chinese managed instructions.
- **Chinese installs inject an explicit language policy into the managed block.** When the current installer language is `zh`, flow now prepends a `Language Policy` section that instructs Claude to keep tool/model interaction in English while replying to the user in Simplified Chinese. English installs do not inject this section. This behavior is covered by new tests in `tests/runner/claudeMd.test.ts`.
- **Managed-block guidance now uses clearer Claude Code terminology.** The block now distinguishes slash commands from MCP capabilities and plugin skills instead of mixing them together. `claude-mem` calls are rendered as `/claude-mem:...`, Context7 / sequential-thinking / Chrome DevTools are described as MCP capabilities, and the overly-strong `frontend-design` "auto fire" wording was softened to "prioritize, then invoke explicitly if needed". The global decision tree also stopped leaking `TaskCreate` as a user-facing universal rule, matching current Claude Code best-practice guidance more closely.

### Added

- **README alignment for managed `CLAUDE.md` behavior.** `README.md` and `README.zh-CN.md` now document that language selection affects not only the installer UI, but also the rendering of the managed `CLAUDE.md` block, including the extra Chinese-mode language policy injection.

## 7.1.3 — 2026-05-05

### Added

- **`npx @curdx/flow analyze` CLI — local-only plugin self-observation.** New subcommand that parses Claude Code session transcripts (`~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`) merged with curdx-flow's own `~/.claude/curdx-flow/errors.jsonl`, and emits a 7-section markdown report: **Hook Failures Top-N** · **Slash Commands** · **Subagents** · **Spec Funnel** · **Hook Duration P50/P95/P99** · **Schema Drift** · **Parent UUID Chain integrity**. Streaming `node:readline` parser handles 100MB+ transcripts (102 MB tested → 139 MB RSS bounded). Incremental byte-offset state at `~/.claude/curdx-flow/observability-state.json` makes second-run analysis ~31× faster than a cold full scan. Flags: `--json` · `--limit <N>` · `--since <7d|30d|YYYY-MM-DD>` · `--project <name>` · `--include-prompts`. Zero new npm dependencies — uses Node 20+ built-ins only (commit `ae4d7cc..0f87161`).
  - New 5-piece module: `src/analyze/{parser,filter,report,redact,error-logger}.ts` + `index.ts` orchestrator + `types.ts`.
  - New CLI flow: `src/flows/analyze.ts` (lazy `await import('../analyze/index.ts')` so the analyze pipeline only loads when invoked).
  - 4 micro-edits to `src/index.ts` (citty registration: import + `defineCommand` ref + `subCommands` extension + `SUBCOMMANDS.add('analyze')`).
- **Declarative schema map at `plugins/curdx-flow/schemas/transcript-events.json`.** Pattern borrowed from `claude-mem`'s `transcript-watch.json`: `type → action + fields` mapping is JSON config, not hardcoded TypeScript. Ships with the 4 core event types (`hook_success`, `tool_use`, `assistant`, `user`) and is auto-resolved post-bundle via two-probe strategy (`__dirname`-relative + `process.cwd()`-relative); on missing/corrupt, parser falls back to a builtin minimal whitelist with a stderr warning. Unknown event types are silently skipped and counted into `unknown_type_count` so Claude Code schema drift is observable rather than fatal (`R-1` mitigation).
- **Hook error logger at `src/hooks/_shared/error-logger.ts`.** Synchronous `appendFileSync` writer for `~/.claude/curdx-flow/errors.jsonl` — 5 required fields (`ts`/`level`/`hook`/`event`/`msg`) + 5 optional (`session_id`/`cwd`/`spec`/`path`/`stack`), single line `< 4 KB` (POSIX `PIPE_BUF` atomic). Lazy reads `~/.claude/settings.json` once per process (`errorLogEnabled` defaults to `true`; corrupt/missing settings.json defaults `true` + stderr warning). Wired into `_shared/run-hook.ts`'s central catch so all 4 hooks (`load-spec-context` / `quick-mode-guard` / `stop-watcher` / `update-spec-index`) now write structured error trails instead of silently swallowing exceptions. Write failures are themselves swallowed (NFR-9 — never crash a hook trying to log a hook crash). Disable with `errorLogEnabled: false` in `~/.claude/settings.json`.
- **Bundle-size CI gate at `scripts/check-bundle-size.mjs`.** New `npm run check:bundle` script enforces `dist/index.mjs ≤ 84 KB` (NFR-3); wired into the `verify` chain. Pairs with `tsup.config.ts` `splitting: true` so the analyze pipeline emits as a separate content-hashed chunk (`dist/analyze-*.mjs`, ~26 KB) and only loads when the user runs `analyze` — main bundle stayed at **68.46 KB** even after adding ~1500 LoC of analyze code.
- **i18n strings for `analyze`** in `src/i18n/{en,zh}.ts` — 10 + 10 keys (`analyze.description`, `analyze.flags.*`, `analyze.warning.*`).
- **Bilingual README sections** at the end of `README.md` and `README.zh-CN.md` documenting the analyze CLI, the redact-by-default privacy model, the macOS/Linux verification scope (Windows declared supported but not tested — NTFS append atomicity not guaranteed), and the `errorLogEnabled` config.

### Fixed

- **Hook stdin parse failures now reach `errors.jsonl`.** `src/hooks/_shared/stdin.ts` previously called `process.exit(0)` directly on `JSON.parse` failure, short-circuiting `_shared/run-hook.ts`'s outer try/catch — meaning the `logHookError({ event: 'stdin_parse', ... })` call in the wrapper was effectively dead code. Replaced `process.exit(0)` with `throw e;` so the central catch fires the logger and *then* exits 0 (FR-8 graceful-skip semantics preserved end-to-end). Caught by VE2 round-4 reality verification on the real `quick-mode-guard.mjs` bundle (commit `edf417a`).

### Changed

- **`tsup.config.ts`: `splitting: false → true`.** Required to make the new `await import('../analyze/index.ts')` in `src/flows/analyze.ts` actually emit a separate chunk (single-entry tsup with `splitting: false` was inlining the dynamic import, growing main bundle to 94.47 KB). Output now includes `dist/analyze-<hash>.mjs` alongside `dist/index.mjs`. `package.json` `files: ["dist", ...]` already covers the new chunk for `npm publish`.

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
