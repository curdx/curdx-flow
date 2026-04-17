# Changelog

All notable changes to curdx-flow will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] — Round 2 quality loop

Makes the constitution real, adds the two-stage review, evidence-based verification, systematic debugging, browser testing, smart complexity routing, and a full set of session-context hooks.

### Added

**Hooks (6 new, total 7)**
- `hooks/enforce-constitution.sh` (PreToolUse Edit|Write) — denies edits to src/** when phase wrong or [GREEN] task has no test file. 7 fixture scenarios tested.
- `hooks/careful-bash.sh` (PreToolUse Bash) — deny/ask on rm -rf (with whitelist for node_modules/.next/dist/etc.), DROP/TRUNCATE, git push --force (deny on main), git reset --hard, kubectl delete, docker prune, chmod 777, device writes (/dev/sd*, dd of=/dev/). Also enforces Rule 5 (NO SECRETS IN COMMITS) by scanning staged diffs for sk-*/ghp_*/glpat-*/AKIA*/AIza*/PEM private keys/DB URLs with embedded creds/.env files.
- `hooks/load-context.sh` (SessionStart) — walks up for .curdx/, injects project/stack/phase/active-feature/artifacts summary as additionalContext; surfaces compaction journal if < 24h old.
- `hooks/phase-guard.sh` (UserPromptSubmit) — detects "build X feature" without spec, frustration keywords, "ship it" before verify. Never hard-blocks; injects additionalContext.
- `hooks/failure-escalate.sh` (PostToolUse Bash) — 4-level escalation per session (silent → L1 switch strategy → L2 mandatory 7-point checklist → L3 strongly recommend /curdx:debug). Counter at ~/.curdx/.failure-count-<session-id>, resets on success.
- `hooks/save-state.sh` (PreCompact) — serializes state + current task + active spec/plan heads + recent commits + decisions to .curdx/memory/builder-journal.md for compaction recovery.

**Slash commands (7 new, total 13)**
- `/curdx:clarify` — 9-category ambiguity scan, hard cap 5 questions, atomic spec.md writeback
- `/curdx:analyze` — cross-artifact audit; 6 finding categories × 4 severities; CRITICAL findings block /curdx:implement
- `/curdx:review` — two-stage adversarial review; Stage 2 runs in FRESH context after Stage 1 returns clean
- `/curdx:verify` — dispatches curdx-verifier for evidence-based completion check
- `/curdx:debug <slug>` — persistent systematic-debug session; Reality Check BEFORE/AFTER; survives compaction via .curdx/debug/<slug>.md
- `/curdx:refactor --file {spec|plan|tasks|constitution}` — edit with cascade detection; snapshots to .history/ before overwrite
- `/curdx:quick <desc>` — pipeline bypass for small work; routes via detect-complexity.sh

**Agents (4 new, total 7)**
- `curdx-planner` — dedicated task decomposer (separated from Round 1 shared architect role)
- `curdx-reviewer` — two-stage adversarial; 5 status strings (SPEC_COMPLIANT/SPEC_ISSUES/QUALITY_APPROVED/QUALITY_ISSUES/BLOCKED)
- `curdx-verifier` — evidence camera, not judge; read-only; re-runs every AC + <verify>; captures screenshots + stdout + exit codes to evidence/
- `curdx-debugger` — phase-gated walker through 4 systematic-debug phases; Reality Check BEFORE/AFTER; 3-attempt cap then Phase 4.5 architecture question

**Skills (4 new, total 6)**
- `curdx-verify-evidence` — 10-row evidence table mapping claim types to required this-turn proof; forbidden phrase list; 5-step gate protocol
- `curdx-no-sycophancy` — forbidden phrase list ("You're absolutely right!"); 3-step feedback protocol; "Strange things are afoot at the Circle K" escape hatch
- `curdx-systematic-debug` — 4 phases, Phase 4.5 trigger after 3 attempts, 11-row rationalization counter table
- `curdx-browser-test` — dual-mode routing (playwright via CLI with generated verify.spec.ts; chrome-devtools-mcp via 29 tools for WebGL/canvas/maps/perf); VE1/VE2/VE3 protocol with mandatory trap-based cleanup

**Helper scripts**
- `scripts/detect-complexity.sh` — BMAD blast-radius classifier; 8-layer decision pipeline; emits gsd-style JSON inventory
- `skills/curdx-systematic-debug/references/find-polluter.sh` — binary-search bisection for test pollution; adapter-per-runner for jest/vitest/pytest/go test

**Path-scoped rules (new directory pattern)**
- `rules/tdd.md` — loaded conditionally when Claude reads src/**/*.{ts,py,go,rs,...}
- `rules/no-sycophancy.md` — loaded unscoped every session

**Templates (2 new)**
- `templates/review-template.md` — accumulating review.md structure with per-iteration Stage 1 / Stage 2 blocks
- `templates/verification-template.md` — AC-by-AC evidence format with BEFORE/AFTER regression proof section for bug fixes

### Changed

- `hooks/hooks.json` — now registers all 7 hook events across 6 matchers (SessionStart / UserPromptSubmit / PreToolUse × 2 / PostToolUse / PreCompact / Stop).

### Known limitations (deferred to Round 3)

- `/curdx:ship`, `/curdx:resume`, `/curdx:cancel`, `/curdx:doctor`, `/curdx:help` commands
- `/curdx:triage` for large-tier decomposition into multiple features
- `curdx-parallel-dispatch` skill (worktree-based parallel [P] task execution)
- `curdx-writing-skills` meta-skill (TDD-for-skill-authoring)
- Migration framework (migrations/v*.js runner)
- `evals/` test suite

### Statistics

- 31 files added + 1 modified (hooks.json)
- 13 commands, 7 agents, 6 skills, 7 hooks
- Total repo: 63 files, ~7000 lines

## [0.1.0] — Round 1 skeleton

The first end-to-end working version. A solo developer can take a feature from idea to atomic commits using the linear `init → spec → plan → tasks → implement` pipeline with TDD enforcement.

### Added

**Plugin scaffold**
- `.claude-plugin/plugin.json` declaring dependencies (claude-mem, pua) and MCP servers (sequential-thinking, context7) for Claude Code's plugin system to auto-install
- `.claude-plugin/marketplace.json` for `claude plugin marketplace add` discovery
- `package.json` for `npx curdx-flow install` distribution

**Installer**
- `scripts/install.js` — idempotent npx installer with PID lock, atomic state writes, dependency chaining (claude-mem → pua → curdx-flow), `--dry-run` / `--force` / `--repair` / `--no-deps` / `--skip-claude` flags

**Detection**
- `scripts/detect-stack.sh` — backend (node/python/go/rust/java/ruby/php), frontend (next/nuxt/sveltekit/vite/react/vue/svelte/solid), test runner (vitest/jest/pytest/go-test/cargo-test/maven/gradle/rspec/phpunit)
- `scripts/detect-browser-test.sh` — playwright vs chrome-devtools-mcp vs both vs prompt vs none, based on package.json deps and grep for `getContext('webgl')`

**Slash commands** (6)
- `/curdx:init` — bootstrap `.curdx/`, copy constitution, detect stack, idempotent
- `/curdx:spec <slug>` — dispatch curdx-analyst for spec.md
- `/curdx:plan` — dispatch curdx-architect for plan.md (Constitution Check)
- `/curdx:tasks` — dispatch curdx-architect for tasks.md (XML atomic tasks)
- `/curdx:implement` — kicks off the Stop-hook driven loop
- `/curdx:status` — read-only dashboard

**Subagents** (3)
- `curdx-analyst` — requirements clarification + spec writing, banned-vague-words list
- `curdx-architect` — dual-mode (plan/tasks); Karpathy rule + Constitution Check
- `curdx-builder` — single-task fresh-context executor; 4-status return contract

**Skills** (2)
- `curdx-tdd` — RED → Verify-RED → GREEN → Verify-GREEN → REFACTOR; rationalization-counter table; 3 hard testing anti-patterns
- `curdx-read-first` — HARD GATE before any Edit/Write; mandates reading every file in task's `<read_first>` list this turn

**Hooks** (1)
- `hooks/implement-loop.sh` — Stop-hook loop driver. Reads state, detects ALL_TASKS_COMPLETE in transcript, extracts next task, emits block JSON to continue. Race-condition mtime check, stop_hook_active recursion guard, global_iteration safety cap, task_iteration retry budget.

**Templates and rules**
- `templates/spec-template.md` — User Stories + falsifiable AC + Out of Scope + Open Questions
- `templates/plan-template.md` — Constitution Check + Complexity Tracking + architecture
- `templates/tasks-template.md` — gsd-style XML with read_first / acceptance_criteria / verify / commit
- `templates/config-template.json` — `.curdx/config.json` defaults
- `rules/constitution.md` — 5 hard rules (NO CODE WITHOUT SPEC, NO PRODUCTION CODE WITHOUT TEST, NO FIX WITHOUT ROOT CAUSE, NO COMPLETION WITHOUT EVIDENCE, NO SECRETS IN COMMITS), copied to `.claude/rules/` on init for native Claude Code loading

**Documentation**
- `README.md` — user-facing intro
- `CLAUDE.md` — plugin-development conventions
- `docs/INSTALL.md` — install paths, troubleshooting
- `docs/WORKFLOW.md` — end-to-end pipeline walkthrough

### Known limitations

- Round 1 is the skeleton only. The following are deferred:
  - `/curdx:clarify`, `/curdx:analyze`, `/curdx:review`, `/curdx:verify`, `/curdx:debug`, `/curdx:refactor`, `/curdx:quick`, `/curdx:ship`, `/curdx:resume`, `/curdx:cancel`, `/curdx:doctor`, `/curdx:help` (Rounds 2 and 3)
  - Frontend testing skill (curdx-browser-test) — Round 2
  - Two-stage review (curdx-reviewer) — Round 2
  - Evidence verification (curdx-verifier) — Round 2
  - Systematic debugging (curdx-debugger) — Round 2
  - Constitution PreToolUse enforcement hooks — Round 2
  - SessionStart context injection hook — Round 2
  - Failure-detection PostToolUse hook — Round 2 (using pua plugin instead of writing our own)
  - Parallel `[P]` task dispatch via worktrees — Round 3
  - PR lifecycle / CI integration — explicitly out of scope (per user direction)
- Slash command names assume Claude Code's plugin namespacing produces `/curdx:command`. If your Claude Code version produces a different format (`/curdx-command`, `/curdx.command`), the documentation reflects that automatically.
- claude-mem's worker on `localhost:37777` requires `npx claude-mem install --ide claude-code` to be run once. The `npx curdx-flow install` path does this; the lightweight `claude plugin install` path does not (you'll need to run claude-mem's installer separately).
