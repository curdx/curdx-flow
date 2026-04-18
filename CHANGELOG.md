# Changelog

All notable changes to curdx-flow will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- **`/curdx:implement` now defaults to SAFE (per-task pause) instead of YOLO.** Previously the autonomous loop ran with no user gate unless `--safe` was passed, which surprised users who didn't expect each of their N tasks to get committed without any chance to review. Now:
  - `templates/config-template.json` ships `implement_loop.yolo_mode: false`
  - `hooks/implement-loop.sh` falls back to `// false` when state.json lacks the flag (was `// true`)
  - `commands/implement.md` flips semantics: `--yolo` opts into autonomous; `--safe` is the default and also an explicit override that wins over config
  - The constitution PreToolUse hooks still block any rule-violating action regardless of yolo setting — yolo controls the user gate, not the rule gate
- **`/curdx:resume` now surfaces `review.md` findings when phase is `review-stage1-issues` / `review-stage2-issues`.** Before, resume just printed the phase name and left the user to go `cat review.md` themselves. New step 6a extracts the Verdict line, every `#### S-*` finding header with its severity, and any `S-AMBIGUITY-*` rows routed to `/curdx:clarify`. The phase→action hint table now has specific guidance per review-* phase.
- **`/curdx:snapshot` now defaults to RAW (no redaction) and captures the full event timeline.** Previously the REPORT.md summary truncated to the last 30 events and every file was run through the sanitize regex by default, which defeated the goal of letting the maintainer reproduce a user's failure from a shipped bundle. New defaults:
  - REPORT.md enumerates **all** events across the current `events.jsonl` and any rotated siblings (`.1`, `.2`, `.3`).
  - Rotated log files are included in the bundle (they were previously dropped on the floor).
  - `features/` now ships every feature directory, not just the active one.
  - `debug/` now ships every debug session.
  - Claude Code's native transcripts are included **by default** (no 5000-line cap). Pass `--no-transcript` to exclude them.
  - New `settings/` directory ships `.claude/settings.json`, `.claude/settings.local.json`, and `~/.claude/settings.json` to surface hook-registration drift.
  - New `hooks/` directory ships the installed plugin hooks so the maintainer can diff them against source.
  - New `git/` directory ships `log.txt` (200 commits), `status.txt`, `diff-HEAD.patch`, `stash.txt`, `remotes.txt`.
  - New `env.txt` captures `CLAUDE_*`/`OTEL_*`/`CURDX_*`/`PATH`/`SHELL`/`LANG`/`TERM`, with obvious secret-looking names filtered out.
- **Redaction is now opt-in** via `--redact` (standard scrubber) or `--strict` (scrubber + emails + IPv4). `--include-transcript` is now a no-op alias kept only for back-compat; use `--no-transcript` to exclude.
- `META.txt` now explicitly states the bundle is raw-by-default and warns the user to re-run with `--redact` before sharing outside a trusted recipient.

## [0.4.0] — Round 4: structured event logging + snapshot bundling

Make curdx-flow self-observable: every session emits a structured event stream
the maintainer can analyze when users report bugs. Fills the gap Claude Code's
native transcripts don't cover (hook decisions, phase transitions, skill
activations) without reinventing what IS covered (tool calls, OTel, debug logs).

### Added

**Event logging**
- `hooks/lib/log-event.sh` — shared `curdx_log` function sourced by every hook.
  Walks up 10 levels to find `.curdx/`, auto-creates `logs/`, rotates at 5 MB,
  augments every line with ts/session/phase/active_feature from state.json.
  Atomic append, safe for concurrent hooks.
- `hooks/log-activity.sh` — NEW catch-all `PreToolUse(*)` + `PostToolUse(*)`
  hook. Extracts `subagent_type` for Task, `skill` for Skill, first word for
  Bash, basename for Edit/Write. MCP calls self-identify via their
  `mcp__<server>__<tool>` names.
- Each existing hook (load-context, phase-guard, careful-bash, enforce-
  constitution, failure-escalate, save-state, implement-loop) now calls
  `curdx_log` at decision points. ~10 event types covered:
  `session_start`, `user_prompt`, `curdx_command`, `tool_call`, `tool_result`,
  `hook_denied`, `hook_asked`, `failure_escalation`, `pre_compact`,
  `stop_loop_continue`.
- `hooks/hooks.json` — registers `log-activity.sh` for both PreToolUse and
  PostToolUse with matcher `*`, alongside the specialized hooks.

**Snapshot (sanitized bundle for sharing)**
- `scripts/lib/sanitize.sh` — regex scrubber. Default mode redacts 14 secret
  classes (Anthropic/OpenAI/GitHub/GitLab/AWS/Google/Slack tokens, PEM
  private keys, bearer tokens, DB URLs with creds, env-style KEY=VAL with
  sensitive-hint keys, JWTs, home directory paths, /var/folders). `--strict`
  adds email + IPv4 redaction. `#` delimiter used on regex-alternation
  patterns to avoid `|`-as-both-delimiter-and-metachar conflicts.
- `scripts/snapshot.sh` — collects + sanitizes + tarballs. Produces
  `~/curdx-snapshot-<ts>.tar.gz` containing REPORT.md (human-readable
  summary: state, recent events table, hook firings summary, git log),
  events.jsonl, state.json, config.json, install-state.json, active
  feature's md files, active debug session, versions.txt, META.txt.
  Confirmation prompt before sealing. `--strict`, `--include-transcript`,
  `--no-preview`, `--here` flags.
- `commands/snapshot.md` — `/curdx:snapshot` slash command. End-to-end
  tested with fake project: 2KB tarball, correct file layout, redactions
  applied (sk-ant-*, env KEY=VAL, /Users/<name>).

**Docs**
- `docs/DIAGNOSTICS.md` — full walkthrough. Explains the 3 observability
  layers (Claude native transcripts, OTel, curdx events), event schema,
  privacy story (structural metadata only, no prompt/output content),
  sanitization catalog, recipient-side analysis tips (jq queries on
  events.jsonl), scope boundaries (per-project, append-only, read-only
  snapshot).

**Updated**
- `commands/init.md` — creates `.curdx/logs/`; adds `.curdx/logs/` to
  suggested .gitignore.
- `commands/help.md` — new `[diagnostics]` section with `/curdx:snapshot`.

### Design decisions (and rejected alternatives)

- **Don't build a backend**: pua's Cloudflare Pages endpoint was rejected;
  bundle + manual share is the minimum viable path. Recipient's email / DM
  / private GitLab issue is infra enough.
- **Don't auto-create GitHub issues**: removed the `--gh` flag considered in
  early design. Users may not have gh CLI or may use private git; the
  maintainer shouldn't force a submission channel.
- **Don't log prompt/output content in events.jsonl**: structural only.
  Full content goes to Claude Code's native transcript (not ours). Avoids
  privacy surprises.
- **Don't reinvent OTel**: Claude Code ships full OpenTelemetry support.
  curdx-flow's events.jsonl is complementary (covers phase transitions and
  hook decisions that OTel doesn't), not redundant.

### Statistics

Round 4: 13 files added/modified across 2-3 commits. Repo total: ~95 files.

## [0.3.0] — Round 3 amplifiers

Rounds 1 and 2 delivered the core pipeline and the quality loop. Round 3 adds the amplifiers: shipping, session continuity, decomposition of large features, worktree-based parallelism, a meta-skill for skill authoring, a migration framework, and testing scaffolding.

Per the v2 design decision, **no CI adapter layer** — `/curdx:ship` ends at `git push`. PR creation and CI monitoring remain the user's platform-specific concern.

### Added

**Commands (6 new, total 19)**
- `/curdx:ship` — commit feature artifacts + `git push`. Refuses to push to main/master/trunk. Surfaces auth / non-fast-forward errors without auto-fixing. No PR creation, no CI polling.
- `/curdx:resume` — read-only dashboard after session break / compaction. Reads state.json + optional .continue-here.md + recent builder-journal.md; derives next action from phase.
- `/curdx:cancel [feature-id | --debug <slug> | --all-quick]` — 5-option cancel menu (Keep / Soft-move / Delete / Revert / Cancel-this-cancel). Refuses to run mid-execution without --force.
- `/curdx:doctor [--fix]` — 12-section diagnostic (core tools, install state, plugin registration, claude-mem worker, MCP declarations, hook events, hook script perms, project init, constitution, path-scoped rules, git state, browser-test setup).
- `/curdx:help [<command>]` — phase-aware command catalog; detail mode for one command.
- `/curdx:triage <epic> <goal>` — 4-phase decomposition (exploration research → decomposition with interface contracts → validation research → feature-dir creation optionally with gh/glab issues). For large-tier features only (per detect-complexity.sh).

**Skills (2 new, total 8)**
- `curdx-parallel-dispatch` — documents the `.git/config.lock` gotcha: SEQUENTIAL worktree creation, then PARALLEL builder execution, then snapshot-and-restore merge with "main always wins" for orchestrator-owned files (state.json + tasks.md). Post-merge one-shot hook + test validation. Submodule detection → fall back to sequential. Intra-wave file-overlap safety check.
- `curdx-writing-skills` (meta) — TDD-for-skill-authoring. 5-phase workflow: identify invariant → write pressure test FIRST → watch it fail (capture verbatim rationalization) → write SKILL.md (with observed excuses in anti-patterns) → re-run pressure test with skill; iterate up to 3 times. Embedded Cialdini-style persuasion guidance.

**Templates (1 new, total 7)**
- `templates/epic-template.md` — epic.md skeleton with mermaid dependency graph, per-feature interface contracts (exposes + consumes), size estimate, advisory-only architecture note, rejected-decompositions section.

**Migrations framework**
- `migrations/README.md` — pattern documentation. Versioned by semver filename (vX.Y.Z.js). Idempotent per migration. Fresh installs skip; upgrades run the diff.
- `migrations/v0.3.0.example.js` — template showing idempotency check, field rename, backfill, cleanup, schema-version bump.

**Testing scaffolding**
- `tests/README.md` — two-layer testing (evals/ for skill pressure tests, e2e/ for pipeline fixtures). Current status: minimum viable; grows with real usage.
- `tests/evals/curdx-tdd/pressure-1-time-pressure.md` — "implement [GREEN] with a stub" adversarial scenario. Grading rubric.
- `tests/evals/curdx-no-sycophancy/pressure-1-angry-user.md` — "user angry about apparent regression" scenario. Compliance = investigate before rewriting.
- `tests/evals/curdx-verify-evidence/pressure-1-friday-evening.md` — "re-run tests vs trust memory" scenario. Compliance = run tests this turn regardless of Friday-evening pressure.
- `tests/e2e/fixture-node-backend/{scenario.md,package.json}` — minimal node backend fixture for the full pipeline.

### Explicitly NOT added (per v2 design cut)

- **CI adapter layer** (GitHub/GitLab/Gitea/Azure/Jenkins platform scripts) — dropped because it added 10+ platform-specific scripts for a use case that varies wildly. Users invoke `gh` / `glab` / `tea` directly after `/curdx:ship`.
- **PR Lifecycle Loop** — 48h autonomous CI-monitoring removed. Too platform-specific; scope-creep risk.
- **Auto-merge** — never was in scope; out of curdx-flow's purview by design.

### Statistics

- 6 new commands (total 19)
- 2 new skills (total 8)
- 1 new template (total 7)
- migrations/ directory + tests/ scaffolding
- Round 3: 17 files added across 7 commits
- Repo total: ~80 files, ~9000 lines

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
