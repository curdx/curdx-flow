# Changelog

All notable changes to curdx-flow will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
