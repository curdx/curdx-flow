#!/usr/bin/env bash
# implement-loop.sh — Stop-hook driver for /curdx:implement
#
# Reads Claude Code Stop-hook JSON from stdin. If we're in execution phase
# and there are unfinished tasks, emits {"decision":"block","reason":"..."}
# JSON to stdout to make Claude continue with the next task.
#
# Patterns borrowed from smart-ralph's hooks/scripts/stop-watcher.sh:
# - Race-condition mtime check on state.json (sleep 1 if < 2s old)
# - ALL_TASKS_COMPLETE detection in transcript tail
# - stop_hook_active guard against infinite re-invocation
# - global_iteration cap as safety net
#
# Hook contract (https://code.claude.com/docs/en/hooks):
#   stdin:  JSON with { transcript_path, cwd, session_id, stop_hook_active, ... }
#   stdout: empty = let Claude stop; JSON = control flow
#   exit:   0 = normal; 2 = blocking error (stderr surfaces to Claude)

set -eu

# ---------- defensive bail-outs (silent exits = let Claude stop normally) ----------

command -v jq >/dev/null 2>&1 || exit 0

# read hook payload
INPUT="$(cat)"
[ -z "$INPUT" ] && exit 0

CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // empty')
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')

[ -z "$CWD" ] && exit 0
cd "$CWD" 2>/dev/null || exit 0

STATE_FILE=".curdx/state.json"
[ -f "$STATE_FILE" ] || exit 0

# stop_hook_active guards against infinite re-invocation when our own
# block-decision triggers another stop event during the same continuation
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

# ---------- race condition: state file just written by orchestrator ----------

state_age_seconds() {
  if [ "$(uname)" = "Darwin" ]; then
    local mtime
    mtime=$(stat -f %m "$STATE_FILE" 2>/dev/null || echo 0)
    echo $(( $(date +%s) - mtime ))
  else
    local mtime
    mtime=$(stat -c %Y "$STATE_FILE" 2>/dev/null || echo 0)
    echo $(( $(date +%s) - mtime ))
  fi
}

if [ "$(state_age_seconds)" -lt 2 ]; then
  sleep 1
fi

# validate JSON
if ! jq empty "$STATE_FILE" 2>/dev/null; then
  echo "[curdx-flow] state.json corrupt; please run /curdx:doctor" >&2
  cat <<EOF
{"decision":"block","reason":"curdx-flow state file is corrupt at $STATE_FILE. Please run /curdx:doctor or restore from git history before continuing."}
EOF
  exit 0
fi

# ---------- read state ----------

PHASE=$(jq -r '.phase // "unknown"' "$STATE_FILE")
ACTIVE_FEATURE=$(jq -r '.active_feature // empty' "$STATE_FILE")
TASK_INDEX=$(jq -r '.task_index // 0' "$STATE_FILE")
TOTAL_TASKS=$(jq -r '.total_tasks // 0' "$STATE_FILE")
TASK_ITERATION=$(jq -r '.task_iteration // 1' "$STATE_FILE")
MAX_TASK_ITERATIONS=$(jq -r '.max_task_iterations // 5' "$STATE_FILE")
GLOBAL_ITERATION=$(jq -r '.global_iteration // 1' "$STATE_FILE")
MAX_GLOBAL_ITERATIONS=$(jq -r '.max_global_iterations // 100' "$STATE_FILE")
AWAITING_APPROVAL=$(jq -r '.awaiting_approval // false' "$STATE_FILE")
YOLO_MODE=$(jq -r '.yolo_mode // true' "$STATE_FILE")

# only act in execution phase
if [ "$PHASE" != "execution" ]; then
  exit 0
fi

# user gate: respect awaiting_approval (e.g., --safe mode after each task)
if [ "$AWAITING_APPROVAL" = "true" ]; then
  exit 0
fi

# safety cap
if [ "$GLOBAL_ITERATION" -ge "$MAX_GLOBAL_ITERATIONS" ]; then
  echo "[curdx-flow] global_iteration $GLOBAL_ITERATION reached cap $MAX_GLOBAL_ITERATIONS; stopping for safety. run /curdx:status to inspect." >&2
  exit 0
fi

# task budget per-task
if [ "$TASK_ITERATION" -ge "$MAX_TASK_ITERATIONS" ]; then
  echo "[curdx-flow] task_iteration $TASK_ITERATION reached cap $MAX_TASK_ITERATIONS for task index $TASK_INDEX; escalating to user." >&2
  cat <<EOF
{"decision":"block","reason":"Task index $TASK_INDEX has been retried $TASK_ITERATION times without DONE. The plan or task may be flawed. Run /curdx:refactor to fix tasks.md, then resume with /curdx:implement, or /curdx:cancel to abort."}
EOF
  exit 0
fi

# ---------- ALL_TASKS_COMPLETE detection ----------

if [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then
  # search the last 500 transcript lines for the literal terminator
  if tail -n 500 "$TRANSCRIPT" 2>/dev/null | grep -q '\bALL_TASKS_COMPLETE\b'; then
    # let Claude stop. The orchestrator will pick up the completed state on
    # next /curdx:status or /curdx:verify.
    exit 0
  fi
fi

# ---------- task completion check ----------

[ -z "$ACTIVE_FEATURE" ] && exit 0

TASKS_FILE=".curdx/features/${ACTIVE_FEATURE}/tasks.md"
[ -f "$TASKS_FILE" ] || exit 0

# count remaining tasks (those without status="done" attribute)
# grep -c with no matches returns exit 1 + "0" on stdout; ` || true ` neutralises it.
REMAINING=$(grep -c '^<task id=' "$TASKS_FILE" 2>/dev/null || true)
COMPLETED=$(grep -c '^<task id=.*status="done"' "$TASKS_FILE" 2>/dev/null || true)
[ -z "$REMAINING" ] && REMAINING=0
[ -z "$COMPLETED" ] && COMPLETED=0
PENDING=$((REMAINING - COMPLETED))

# if task_index >= total_tasks AND no pending tasks, all done — let Claude stop
if [ "$TASK_INDEX" -ge "$TOTAL_TASKS" ] && [ "$PENDING" -eq 0 ]; then
  exit 0
fi

# if task_index >= total_tasks BUT pending tasks remain, builder didn't emit
# ALL_TASKS_COMPLETE. block with explicit instruction.
if [ "$TASK_INDEX" -ge "$TOTAL_TASKS" ] && [ "$PENDING" -gt 0 ]; then
  cat <<EOF
{"decision":"block","reason":"task_index ($TASK_INDEX) >= total_tasks ($TOTAL_TASKS) but $PENDING tasks in tasks.md still lack status=\"done\". Find the unchecked tasks in $TASKS_FILE, dispatch curdx-builder for each, and emit ALL_TASKS_COMPLETE on the final task."}
EOF
  exit 0
fi

# ---------- extract next task ----------

# Find the Nth unchecked task (where N = number of "done" tasks + 1).
# Uses awk to walk task XML blocks and pick the first one whose opening
# tag does NOT have status="done".
NEXT_TASK_XML=$(awk '
  /^<task id=/ {
    in_task = 1
    is_done = ($0 ~ /status="done"/)
    block = $0 "\n"
    next
  }
  in_task {
    block = block $0 "\n"
    if ($0 ~ /^<\/task>/) {
      if (!is_done) { print block; exit }
      in_task = 0
      block = ""
    }
  }
' "$TASKS_FILE")

if [ -z "$NEXT_TASK_XML" ]; then
  # nothing pending — shouldn't reach here given checks above, but fail safe
  exit 0
fi

NEXT_TASK_ID=$(echo "$NEXT_TASK_XML" | head -1 | sed -E 's/^<task id="([^"]+)".*/\1/')

# ---------- emit continuation block ----------

# escape the task XML for safe JSON embedding
TASK_XML_JSON=$(echo "$NEXT_TASK_XML" | jq -Rs .)

# build the reason text (becomes the new user message)
REASON=$(cat <<INNER
Continue /curdx:implement loop.

Active feature: $ACTIVE_FEATURE
Task: $NEXT_TASK_ID (index $TASK_INDEX of $TOTAL_TASKS, iteration $TASK_ITERATION/$MAX_TASK_ITERATIONS, global $GLOBAL_ITERATION/$MAX_GLOBAL_ITERATIONS)

Dispatch curdx-builder via the Task tool with this exact task XML and the orchestrator contract from commands/implement.md. Do NOT execute the task in your own context — fresh subagent only.

Task XML:
$NEXT_TASK_XML

After the builder returns:
- DONE: mark the task done in tasks.md (add status="done" to opening tag), atomic-commit if applicable, increment task_index in state.json, return briefly so this Stop hook re-fires for the next task.
- DONE_WITH_CONCERNS: same as DONE but append concerns to .curdx/features/$ACTIVE_FEATURE/concerns.log first.
- NEEDS_CONTEXT: increment task_iteration, provide the missing context, re-dispatch the builder for THIS task (do not advance task_index).
- BLOCKED: set awaiting_approval=true in state.json, surface the blocker, return.

If this is the last task ($((TASK_INDEX+1)) == $TOTAL_TASKS) and the builder returns DONE, the builder should also emit ALL_TASKS_COMPLETE which terminates this loop.
INNER
)

REASON_JSON=$(echo "$REASON" | jq -Rs .)
SYSTEM_MSG="curdx-flow iteration $GLOBAL_ITERATION | task $((TASK_INDEX+1))/$TOTAL_TASKS"
SYSTEM_MSG_JSON=$(echo "$SYSTEM_MSG" | jq -Rs .)

# emit JSON via printf for safe interpolation
printf '{"decision":"block","reason":%s,"systemMessage":%s}\n' "$REASON_JSON" "$SYSTEM_MSG_JSON"
exit 0
