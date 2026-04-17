# Workflow: how curdx-flow drives a feature from idea to commit

This document walks through the end-to-end workflow for one feature, with the artifacts produced at each phase, the agents involved, and the contract enforced by hooks and skills.

## The pipeline

```
                 ┌──────────────────┐
   one-time:     │  /curdx:init     │  detects stack, copies constitution,
                 │                  │  scaffolds .curdx/
                 └────────┬─────────┘
                          │
                          ▼
   per-feature:   ┌──────────────────┐
                  │  /curdx:spec     │  curdx-analyst writes spec.md
                  │                  │  (User Stories + AC + Out of Scope)
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │  /curdx:plan     │  curdx-architect writes plan.md
                  │                  │  (Constitution Check + stack + design)
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │  /curdx:tasks    │  curdx-architect (Round 1) writes
                  │                  │  tasks.md (XML atomic tasks, TDD-paired)
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐    ┌────────────────────────┐
                  │  /curdx:implement├───▶│ Stop-hook loop drives  │
                  │  (kicks off T1)  │    │ T2..Tn via fresh       │
                  └──────────────────┘    │ curdx-builder subagents│
                                          │ Each task = 1 commit.  │
                                          │ Loop ends when builder │
                                          │ emits ALL_TASKS_COMPLETE│
                                          └────────────────────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │  /curdx:status   │  inspect anytime; pure read
                  └──────────────────┘
```

## What each phase produces

| Phase | Command | Subagent | Artifact |
|-------|---------|----------|----------|
| init | `/curdx:init` | none | `.curdx/config.json`, `.claude/rules/constitution.md`, `.curdx/state.json` |
| spec | `/curdx:spec <slug>` | curdx-analyst | `.curdx/features/NNN-slug/spec.md` |
| plan | `/curdx:plan` | curdx-architect (plan mode) | `.curdx/features/NNN-slug/plan.md` |
| tasks | `/curdx:tasks` | curdx-architect (tasks mode) | `.curdx/features/NNN-slug/tasks.md` |
| implement | `/curdx:implement` | curdx-builder × N (one per task) | code + N atomic git commits |

Round 2 will add: `/curdx:clarify` (after spec), `/curdx:analyze` (after tasks), `/curdx:review` and `/curdx:verify` (after implement), `/curdx:debug` (sideways from implement), `/curdx:refactor` (sideways from spec/plan/tasks), `/curdx:quick` (full-pipeline bypass for trivial work).

Round 3 will add: `/curdx:ship` (commit + push), `/curdx:resume`, `/curdx:cancel`, `/curdx:doctor`, `/curdx:help`.

## The Stop-hook loop in detail

The loop is the autonomous execution engine. It works like this:

1. User runs `/curdx:implement`. Orchestrator (Claude in main context) reads `tasks.md`, finds the first task, dispatches a `curdx-builder` subagent with a fresh context. Sets `phase: execution` in `state.json`.
2. Builder runs to completion of its **single** task, returns `DONE` (or one of the other 3 statuses), then Claude Code fires the `Stop` event.
3. The Stop hook (`hooks/implement-loop.sh`) wakes up. It reads:
   - `.curdx/state.json` (phase, task_index, total_tasks, etc.)
   - The transcript tail (last 500 lines)
4. Decision tree:
   - **Phase != execution?** → silent exit, let Claude stop normally
   - **`stop_hook_active=true`?** → silent exit (recursion guard)
   - **`ALL_TASKS_COMPLETE` in transcript?** → silent exit, loop done
   - **`task_index >= total_tasks` AND tasks.md all marked done?** → silent exit
   - **`task_index >= total_tasks` BUT pending tasks remain?** → emit recovery `block` JSON
   - **`global_iteration >= 100`?** → safety cap, silent exit with stderr warning
   - **`task_iteration >= 5` for current task?** → escalate to user via block JSON
   - **`awaiting_approval=true`?** → silent exit (user gate)
   - **Otherwise:** extract next task XML, build continuation prompt, emit `{"decision":"block","reason":"...","systemMessage":"..."}` JSON
5. Claude Code reads the block JSON, treats `reason` as the new user message, and re-invokes the model. The orchestrator dispatches the next builder. Loop repeats.

When the **last task** completes, the builder is instructed (via `commands/implement.md` and `agents/curdx-builder.md`) to emit the literal string `ALL_TASKS_COMPLETE` on a new line. The Stop hook detects this and exits silently, letting Claude stop normally.

## The 4-status protocol

Every builder must end its turn with exactly one of these on its own line:

- `DONE: <summary>` — task complete, acceptance criteria verified, commit made
- `DONE_WITH_CONCERNS: <summary> | <observation>` — task complete but a non-blocking observation (e.g., file getting too large) is recorded
- `NEEDS_CONTEXT: <what info is missing>` — orchestrator provides info, re-dispatches; counts toward task_iteration cap
- `BLOCKED: <why>` — orchestrator escalates to user, sets `awaiting_approval`

This is borrowed from [obra/superpowers' subagent-driven-development skill](https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/SKILL.md). It gives the orchestrator a clean state machine to branch on without parsing free-form output.

## What the constitution enforces

`.claude/rules/constitution.md` is loaded by Claude Code at every session start (per the [memory docs](https://code.claude.com/docs/en/memory)). It contains 5 hard rules; PreToolUse hooks (Round 2) block tool calls that violate them. The 5 defaults:

1. NO CODE WITHOUT SPEC — modifying `src/**` requires a spec to exist
2. NO PRODUCTION CODE WITHOUT FAILING TEST — TDD cycle enforced
3. NO FIX WITHOUT ROOT CAUSE — bug-fix tasks must walk systematic-debug
4. NO COMPLETION WITHOUT EVIDENCE — completion claims need this-turn command output
5. NO SECRETS IN COMMITS — `git commit` is intercepted, staged files scanned

Soft rules and advisory rules can be added by the user. See `rules/constitution.md` for the template.

## How TDD is enforced

The `curdx-tdd` skill auto-loads when a builder works on production source files. It enforces RED → Verify-RED → GREEN → Verify-GREEN → REFACTOR. The planner sequences tasks in TDD order: every `[GREEN]` task is preceded by a `[RED]` task that writes the failing test. The builder cannot skip the RED step because:

- The constitution's hard rule 2 blocks production-code edits without a corresponding failing test
- The `<read_first>` gate (curdx-read-first skill) requires reading the test file before editing the production file
- The `<acceptance_criteria>` for `[GREEN]` tasks require `npm test` (or equivalent) to exit 0, which can't be faked

## How memory works

curdx-flow does NOT reinvent cross-session memory. Three layers:

1. **Claude Code's native auto memory** at `~/.claude/projects/<project>/memory/MEMORY.md` — automatically loaded at session start (first 200 lines / 25KB). Claude writes to it when something is "worth remembering". Users browse via `/memory`.
2. **claude-mem's SQLite + Chroma layer** — installed as a plugin dependency. Provides 13 MCP tools (`mem-search`, `timeline`, `get_observations`, etc.) for semantic search over historical sessions. Hooks auto-inject relevant memory at session start and on every user prompt.
3. **curdx-flow's per-feature artifacts** at `.curdx/features/NNN-slug/` — task state, specs, plans. This is the only layer we own.

When `curdx-analyst` writes a spec, it first searches claude-mem for similar prior decisions. When `curdx-architect` plans, it searches for prior architecture choices. This gives Claude a "what did we already learn about this codebase" sense without you doing anything special.

## What's NOT in the workflow yet

Round 1 shipped the skeleton. **Round 2 shipped the quality loop** (this is v0.2, currently in place):

- `/curdx:clarify` resolves ambiguity via 9-category scan with 5-question cap
- `/curdx:analyze` cross-artifact audit (spec/plan/tasks/constitution); CRITICAL findings block `/curdx:implement`
- `/curdx:review` two-stage adversarial review (spec compliance → fresh-context code quality)
- `/curdx:verify` evidence-based completion check with screenshots + stdout + exit codes
- `/curdx:debug <slug>` persistent systematic-debug session; Reality Check BEFORE/AFTER; survives compaction
- `/curdx:refactor --file ...` cascade-aware editing of spec/plan/tasks/constitution with .history/ snapshots
- `/curdx:quick <desc>` complexity-routed bypass; trivial → inline, small → PLAN.md, medium/large → redirect to full pipeline
- Frontend testing via `curdx-browser-test` skill — auto-routes to Playwright CLI (generated verify.spec.ts) or chrome-devtools-mcp (29 tools for WebGL/canvas/maps/perf)
- Path-scoped rules (`rules/tdd.md`, `rules/no-sycophancy.md`) that Claude Code loads NATIVELY (not as skills) so compaction doesn't drop them
- 6 new hooks: constitution enforcement at tool level, careful-bash with secret scanning, session context injection, phase-guard nudges, failure escalation (4 levels), compaction state journal

### Still deferred to Round 3

- `/curdx:ship` — commit + push (commit/push only, no PR creation; CI adapter layer explicitly cut per user direction)
- `/curdx:resume`, `/curdx:cancel`, `/curdx:doctor`, `/curdx:help`
- `/curdx:triage` — large-tier decomposition into multiple features
- `curdx-parallel-dispatch` skill — worktree-based parallel [P] task execution (with the gsd-identified git config.lock sequential-dispatch pattern)
- `curdx-writing-skills` meta-skill — TDD-for-skill-authoring
- Migration framework
- Evals test suite

See `CHANGELOG.md` for what's actually shipped per version.
