---
name: curdx-core
description: Use when handling curdx-flow flags, state files, delegation, execution loops, or skill entrypoint rules.
when_to_use: Use when user mentions curdx-flow flags, quick mode, commit spec, max iterations, .curdx-state.json, execution loop, coordinator behavior, or subagent delegation.
version: 0.2.0
user-invocable: false
---

# curdx-core

Core skill for curdx-flow plugin. Defines common arguments, execution modes, shared behaviors, and coordinator delegation rules.

## Runtime CLI

The plugin ships a Bash-visible executable: `curdx-flow`.

Use it instead of repeating fragile shell snippets:

```bash
curdx-flow route --goal "$GOAL" --flags "$ARGUMENTS"
curdx-flow snapshot --spec "$SPEC" --goal "$GOAL"
curdx-flow state merge "$SPEC_PATH/.curdx-state.json" '{"phase":"tasks"}'
curdx-flow tasks count "$SPEC_PATH/tasks.md"
curdx-flow verify run --phase execution --command "npm test" --spec "$SPEC_PATH"
curdx-flow doctor
```

The CLI is a thin wrapper around bundled TypeScript helpers under
`${CLAUDE_PLUGIN_ROOT}/hooks/scripts/lib/`. It is the default source of truth
for route facts, active spec facts, task counts, and state merge operations.
`curdx-flow verify run` is the preferred way to perform final task/spec
verification because it runs the command and records the resulting
`verificationBlocks.<phase>` evidence in one step.
`curdx-flow doctor` also reports browser verification readiness: detected E2E
scripts, Playwright dependencies/config files, chrome-devtools-mcp dependency
declaration, and local Chrome availability.

## Common Arguments

All curdx-flow public entrypoint skills support these standard arguments:

| Argument | Short | Description | Default |
|----------|-------|-------------|---------|
| `--quick` | `-q` | Skip interactive phases, auto-generate artifacts, start execution immediately | false |
| `--mode` | | Execution policy override: `auto`, `fast`, or `deep` | auto |
| `--commit-spec` | | Commit and push spec files after each phase | true (normal), false (quick) |
| `--no-commit-spec` | | Explicitly disable committing spec files | - |
| `--max-task-iterations` | `-m` | Max retries per failed task before stopping | 5 |
| `--max-global-iterations` | | Max whole-spec loop iterations before stopping | 30 |
| `--fresh` | `-f` | Force new spec/feature, overwrite if exists | false |
| `--tasks-size` | | Task sizing override: `auto`, `coarse`, `standard`, or `fine` | auto |
| `--review` | | Review override: `minimal`, `standard`, or `strict` | policy-derived |

Argument precedence: `--no-commit-spec` > `--commit-spec` > mode default.

## Execution Modes

### Auto Policy (Default)

Every new spec runs deterministic policy classification before expensive model work:

```bash
curdx-flow route --goal "$GOAL" --flags "$ARGUMENTS"
```

Persist the JSON as `.curdx-state.json::autoPolicy`. Later phases must obey it
instead of asking the user to choose fast/deep. Policy controls:
- behavior-route compatibility fields
- risk level
- task target range
- review cadence
- verification level
- subagent policy
- Stop-hook continuation length

### Normal Mode (Interactive)

- User reviews artifacts between phases
- Phase transitions require explicit `/curdx-flow:*` skill invocation
- Each phase sets `awaitingApproval: true`
- Commits spec files by default

### Quick Mode (`--quick`)

- Skip all interactive prompts, interviews, and approval pauses
- Run the same phase agents (research, requirements, design, tasks) sequentially
- Agents receive a "be more opinionated" directive since there is no user feedback
- spec-reviewer validates each artifact (max 3 iterations)
- Immediately start execution after all phases complete
- Do NOT commit spec files by default (use `--commit-spec` to override)
- Still delegate to subagents (delegation is mandatory)

## State File

curdx-flow uses `.curdx-state.json` for execution state. New state files use
`version: 2`; legacy state may be reinitialized rather than migrated. See
`references/state-file-schema.md` for the current schema.

Key fields: `phase`, `taskIndex`, `totalTasks`, `taskIteration`, `maxTaskIterations`, `awaitingApproval`.

Phase skills must start by running `curdx-flow snapshot`. Treat the snapshot's
`gates` list as blocking unless the current skill explicitly owns that gate.

## Commit Behavior

When `commitSpec` is true:

1. Stage spec/feature files after generation
2. Commit with message: `chore(<plugin>): commit spec files before implementation`
3. Push to current branch

When `commitSpec` is false:

- Files remain uncommitted
- User can manually commit later

## Task Execution Loop

curdx-flow v3.0.0+ has a self-contained execution loop via the stop-hook. Companion plugins and MCPs improve routing, memory, docs, UI, browser proof, reasoning, and recovery, but the stop-hook loop itself does not delegate to an external orchestrator.

Key signals:
- `TASK_COMPLETE` - executor finished task
- `ALL_TASKS_COMPLETE` - coordinator ends loop

## Error Handling

When `taskIteration > maxTaskIterations`: block task, suggest manual intervention.

If state file missing/invalid: output error, suggest re-running `/curdx-flow:implement`.

## Branch Management

curdx-flow follows a consistent branch strategy:

1. Check current branch before starting
2. If on default branch (main/master): prompt for branch strategy
3. If on feature branch: offer to continue or create new
4. Quick mode: auto-create branch, no prompts

## Coordinator Behavior

The main agent is a coordinator, not an implementer. Delegate all work to subagents.

## Skill Entrypoints

curdx-flow is skills-only at the plugin surface.

- Public `/curdx-flow:*` entries live in `skills/<name>/SKILL.md`.
- Shared/background behavior lives in support skills such as `spec-workflow`, `curdx-core`, and `interview-framework`.
- Keep phase-changing entry skills explicit with `disable-model-invocation: true`; let support skills handle automatic guidance.

### Coordinator Responsibilities

1. Parse user input and determine intent
2. Read state files for context
3. Delegate work to subagents via Task tool
4. Report results to user

### Do Not

- Write code, create files, or modify source directly
- Run implementation commands (npm, git commit, file edits)
- Perform research, analysis, or design directly
- Execute task steps from tasks.md

### Delegation Mapping

| Work Type | Delegate To |
|-----------|-------------|
| Research | Bounded parallel direct `Task(...)` dispatch to `research-analyst` / Explore-style research |
| Requirements | product-manager subagent |
| Design | architect-reviewer subagent |
| Task planning | task-planner subagent |
| Task execution | spec-executor subagent |

Quick mode still requires delegation.
