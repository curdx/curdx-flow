---
description: Decompose the active plan into atomic XML tasks (tasks.md) — TDD-sequenced, with read_first gates and grep-verifiable acceptance criteria.
argument-hint: (no arguments)
allowed-tools: Read, Write, Edit, Bash, Task
---

You are running `/curdx:tasks`. Your job is to delegate to a planner subagent to decompose the active feature's plan into atomic tasks ready for the Stop-hook implement loop.

In Round 1, the planner is `curdx-architect` with a different prompt. Round 2 introduces a dedicated `curdx-planner` agent.

## Pre-checks

1. Read `.curdx/state.json`. Confirm `active_feature` is set.
2. Confirm `.curdx/features/{active_feature}/plan.md` exists.

## Steps

### 1. Update state

```bash
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/state-io.sh"
state_merge '{"phase": "tasks", "awaiting_approval": false}'
```

### 2. Dispatch planner subagent

Use `Task` with `subagent_type=curdx-architect` (Round 1) or `curdx-planner` (Round 2). Payload:

```
You are decomposing a plan into atomic tasks for autonomous execution.

Feature: {active_feature}
Spec: .curdx/features/{active_feature}/spec.md
Plan: .curdx/features/{active_feature}/plan.md
Output: .curdx/features/{active_feature}/tasks.md
Template: ${CLAUDE_PLUGIN_ROOT}/templates/tasks-template.md

Project context:
@.curdx/config.json
@.claude/rules/constitution.md

Constraints:
1. Each task ≤ 5 minutes for a builder subagent in fresh context.
2. Sequence: Setup → Foundation → per-User-Story (always [RED] failing test → [GREEN] minimal impl pair) → Polish.
3. Each task has:
   - <name> action-oriented title; tag [P] only if it can run in parallel with adjacent [P] tasks
     (no file overlap, no output dependency, not a checkpoint).
   - <read_first> list of files the builder MUST read before any edit (HARD GATE).
   - <files> list of files the builder will modify (used for parallel-conflict detection).
   - <action> concrete instructions with exact identifiers, signatures, expected outputs.
     No vague verbs like "improve" or "handle properly".
   - <acceptance_criteria> grep-verifiable, file-based, or exit-code-based. NOT subjective.
     Examples: "tests/foo.test.ts exists", "npm test exits 0", "grep -q 'export function' src/x.ts".
   - <verify> a single bash command that confirms the task succeeded.
   - <commit> the conventional commit message for the atomic commit. Empty for non-code tasks.
   - <requirements_refs> which FR/AC IDs from spec/plan this task satisfies.
4. The LAST task must be the Polish task that runs full verification and emits the literal
   string `ALL_TASKS_COMPLETE` for the Stop hook to exit cleanly.
5. Use sequential-thinking MCP if dependency analysis is non-obvious.

Use sequential-thinking MCP to:
- Identify dependencies between tasks (sets wave numbers)
- Detect [P] eligible tasks (4 conditions: no file overlap, no output dep, not checkpoint, no shared config)
- Group into waves; cap parallel groups at 5 tasks

Output: write tasks.md atomically. Return STATUS (DONE | BLOCKED) + total task count + wave count.
```

### 3. After planner returns

Read `tasks.md`. Count tasks via `grep -c '^<task ' tasks.md`. Update state:

```bash
total=$(grep -c '^<task ' .curdx/features/{active_feature}/tasks.md)
state_merge "{\"phase\": \"tasks-complete\", \"total_tasks\": $total, \"task_index\": 0, \"awaiting_approval\": true}"
```

### 4. Print

```
tasks written: .curdx/features/{active_feature}/tasks.md

  total tasks: {{total}}
  waves:       {{n_waves}}
  parallel:    {{n_parallel_tasks}} tasks marked [P]

next:
  /curdx:implement  — kick off Stop-hook driven autonomous execution
  /curdx:refactor   — edit tasks.md
```

## Notes

- Don't include verify/review/ship tasks in tasks.md — those are separate `/curdx:verify`, `/curdx:review`, `/curdx:ship` commands (Round 2/3).
- The Stop hook reads tasks.md every iteration to find the next unchecked task. It does NOT cache. So if the planner needs to add tasks mid-execution, just write them and the loop picks them up.
