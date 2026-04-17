---
description: Execute the active feature's tasks autonomously. Stop-hook drives the loop, dispatching each task to a fresh curdx-builder subagent.
argument-hint: [--safe]
allowed-tools: Read, Write, Edit, Bash, Task, Skill
---

You are running `/curdx:implement`. This is the **Stop-hook loop entrypoint**. Your job in this turn is to:

1. Validate prerequisites
2. Update state to `phase=execution`
3. Dispatch the **first** task to a `curdx-builder` subagent
4. Then return — the Stop hook (`hooks/implement-loop.sh`) takes over and re-fires on every Claude `Stop` event with the next task, until `ALL_TASKS_COMPLETE` is emitted.

## Pre-checks

1. Read `.curdx/state.json`. Confirm `active_feature` and `total_tasks > 0`.
2. Confirm `.curdx/features/{active_feature}/tasks.md` exists.
3. Read `.curdx/config.json`. Note `implement_loop.yolo_mode` and `--safe` arg:
   - `--safe` flag OR `yolo_mode: false` → after each task pause and wait for user (`awaiting_approval: true`).
   - default → autonomous; loop runs until completion.
4. Confirm `.claude/rules/constitution.md` exists (PreToolUse hooks rely on it).

## Steps

### 1. Update state

```bash
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/state-io.sh"
yolo_mode=$(cat .curdx/config.json | jq -r '.implement_loop.yolo_mode')
if [ "$1" = "--safe" ]; then yolo_mode=false; fi
state_merge "{\"phase\": \"execution\", \"task_index\": 0, \"global_iteration\": 1, \"yolo_mode\": $yolo_mode, \"awaiting_approval\": false}"
```

### 2. Read first task

Parse `.curdx/features/{active_feature}/tasks.md` to extract the **first task block** (id `T001` typically). Capture:
- `<name>`, `<read_first>`, `<files>`, `<action>`, `<acceptance_criteria>`, `<verify>`, `<commit>`, `<requirements_refs>`

Use a small awk / sed script. Pseudo:

```bash
task_xml=$(awk '/^<task /,/^<\/task>/' .curdx/features/{active_feature}/tasks.md | head -100)
```

### 3. Dispatch curdx-builder

Use `Task` tool with `subagent_type=curdx-builder`. Payload:

```
You are a fresh-context builder executing exactly ONE task.

Feature: {active_feature}
Task ID: {task_id} ({task_index + 1} of {total_tasks})

CRITICAL CONTRACT:
- You MUST read every file in <read_first> BEFORE any Edit/Write. The curdx-read-first skill enforces this.
- You MUST follow <action> exactly — no scope creep, no "while I'm here" cleanups.
- You MUST verify <acceptance_criteria> by running real commands. Per curdx-verify-evidence skill,
  every claim of completion needs THIS-TURN command output.
- You MUST commit atomically with the <commit> message after acceptance criteria pass.
- You MUST NOT modify .curdx/state.json or .curdx/features/{active_feature}/tasks.md (orchestrator owns those).

Task XML:
{task_xml}

Project context:
@.curdx/config.json
@.claude/rules/constitution.md
@.curdx/features/{active_feature}/plan.md

Skills auto-loaded (relevant to this task):
- curdx-tdd (if task touches src/** with new behavior)
- curdx-read-first (always)

After completing OR failing this task, return EXACTLY one of:
- DONE: <one-line summary>
- DONE_WITH_CONCERNS: <summary> | <concerns>
- NEEDS_CONTEXT: <what info you need>
- BLOCKED: <why>

If this is the LAST task ({task_index + 1} == {total_tasks}) AND you complete it,
emit additionally on a NEW line: ALL_TASKS_COMPLETE
```

### 4. After builder returns

Parse the builder's status:

- **DONE** → mark task complete in tasks.md (replace `<task id="T001"` with `<task id="T001" status="done"`), increment task_index, update state. The Stop hook will re-fire and dispatch the next task.
- **DONE_WITH_CONCERNS** → same as DONE but log concerns to `.curdx/features/{active_feature}/concerns.log`.
- **NEEDS_CONTEXT** → DO NOT increment task_index. Re-dispatch with the missing context. If the same task NEEDS_CONTEXT 5 times in a row (`task_iteration >= 5`), escalate to BLOCKED.
- **BLOCKED** → set `awaiting_approval: true`, surface the blocker to the user, stop the loop.

For YOLO mode (`yolo_mode: true`), also check `--safe` flag presence — if present, set `awaiting_approval: true` after every task to wait for user.

### 5. State update for the next iteration

```bash
state_merge "{\"task_index\": $((task_index + 1)), \"task_iteration\": 1, \"global_iteration\": $((global_iteration + 1))}"
```

### 6. End of turn — Stop hook takes over

Print a brief status line and return. The Stop hook (registered in `hooks/hooks.json`) will check `.curdx/state.json` `phase == "execution"` and emit a `decision: block` JSON to keep Claude going until completion.

## Termination

The loop exits cleanly when:
- Builder emits `ALL_TASKS_COMPLETE` (Stop hook detects in transcript and lets Claude stop)
- `task_index >= total_tasks` AND all tasks in tasks.md show `status="done"`
- `global_iteration >= max_global_iterations` (safety cap, default 100)
- `awaiting_approval: true` (user gate)
- User runs `/curdx:cancel` (Round 3)

## Safety

- This loop is autonomous and modifies code + creates commits. Use `--safe` if you want per-task confirmation.
- The constitution PreToolUse hooks block any constitution-violating action even in YOLO mode.
- The `--safe` flag adds an `awaiting_approval: true` after each task — Stop hook will let Claude stop instead of re-firing.
