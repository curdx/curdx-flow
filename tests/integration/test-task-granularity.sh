#!/usr/bin/env bash
# test-task-granularity.sh — P1b: template + planner enforce 2-5min steps.
#
# Every <action> in the template must be a numbered list of steps, NOT a
# prose blob. The planner's hard rules must codify this so the generated
# tasks.md inherits the discipline.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
. "$SCRIPT_DIR/lib/assert.sh"

TEMPLATE="$PLUGIN_ROOT/templates/tasks-template.md"
PLANNER="$PLUGIN_ROOT/agents/curdx-planner.md"

echo "test-task-granularity.sh"
echo

assert_file_exists "$TEMPLATE"
assert_file_exists "$PLANNER"

# ─── Template: every <action> has a numbered-step list ─────────────────
# Extract each <action>...</action> block and verify it contains "1. "
# as the first non-whitespace line (the step marker). Prose blobs fail this.

count_prose_actions=0
count_step_actions=0
in_action=0
action_buf=""

while IFS= read -r line; do
  case "$line" in
    *"<action>"*) in_action=1; action_buf=""; continue ;;
    *"</action>"*)
      in_action=0
      # strip the outer-whitespace prefix from each line, then check if any
      # line starts with "1." — the step-1 marker
      if echo "$action_buf" | grep -qE '^[[:space:]]*1\. '; then
        count_step_actions=$((count_step_actions + 1))
      else
        count_prose_actions=$((count_prose_actions + 1))
        echo "  ! prose action detected (no '1. ' marker): $(echo "$action_buf" | head -1 | cut -c1-60)..."
      fi
      action_buf=""
      continue ;;
  esac
  if [ "$in_action" -eq 1 ]; then
    action_buf="${action_buf}${line}
"
  fi
done < "$TEMPLATE"

assert_count "$count_prose_actions" "0" "template has zero prose-style <action> blocks"
assert "template has at least 4 step-style <action> blocks (setup+foundation+RED+GREEN+polish expected)" \
  [ "$count_step_actions" -ge 4 ]

# ─── Template: TDD pair — [RED] task <action> has ≥3 steps; [GREEN] ≥3 steps ───
# The contract is ≥6 steps across the pair. awk pat1,pat2 extracts the range
# from the [RED]/[GREEN] line through the next </task>; grep counts "N. "
# step markers within that range.
red_steps=$(awk '/\[RED\]/,/<\/task>/' "$TEMPLATE" | grep -cE '^[[:space:]]*[0-9]+\. ')
green_steps=$(awk '/\[GREEN\]/,/<\/task>/' "$TEMPLATE" | grep -cE '^[[:space:]]*[0-9]+\. ')

assert "template [RED] task has ≥3 numbered steps (got $red_steps)"   [ "$red_steps" -ge 3 ]
assert "template [GREEN] task has ≥3 numbered steps (got $green_steps)" [ "$green_steps" -ge 3 ]
assert "template TDD pair has ≥6 steps total (got $((red_steps + green_steps)))" \
  [ $((red_steps + green_steps)) -ge 6 ]

# ─── Template: the Polish task emits ALL_TASKS_COMPLETE ────────────────
assert_contains "$TEMPLATE" "ALL_TASKS_COMPLETE" "polish task emits terminator"

# ─── Template: documents the 2-5 min contract ─────────────────────────
assert_regex "$TEMPLATE" "2-5 min" "template documents 2-5 minute step budget"
assert_regex "$TEMPLATE" "numbered list" "template uses the phrase 'numbered list'"

# ─── Planner: hard rule #2 is the step-granularity rule ───────────────
assert_contains "$PLANNER" "NUMBERED LIST OF STEPS"     "planner rule #2 requires numbered steps"
assert_contains "$PLANNER" "2-5 minutes"                 "planner rule #2 names the 2-5 minute budget"
assert_contains "$PLANNER" "superpowers:writing-plans"   "planner cites the source pattern"
assert_contains "$PLANNER" "fewer than 3 steps"          "planner flags under-specified (<3 step) tasks"
assert_contains "$PLANNER" "more than 8 steps"           "planner flags over-sized (>8 step) tasks"

# ─── Planner: self-review checklist has the new discipline ────────────
assert_regex "$PLANNER" "numbered list of 3-8 steps"    "planner self-review cites the 3-8 step range"
assert_contains "$PLANNER" "No TDD pair has fewer than 6 steps" "planner self-review cites TDD pair minimum"

# ─── Planner: anti-patterns call out the failure modes ────────────────
assert_contains "$PLANNER" "prose instead of a numbered step list" "planner anti-pattern: prose action"
assert_contains "$PLANNER" "Collapsing the TDD cycle into one step" "planner anti-pattern: collapsed RED/GREEN"

finish_test "test-task-granularity.sh"
