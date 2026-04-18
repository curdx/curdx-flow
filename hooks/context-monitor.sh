#!/usr/bin/env bash
# context-monitor.sh — PostToolUse hook that injects context-pressure warnings
#
# Reads the bridge file written by hooks/statusline.sh, and when context
# usage crosses thresholds, emits a `hookSpecificOutput.additionalContext`
# JSON payload that Claude Code injects directly into the agent's context.
#
# Without this, the agent has no idea it's running out of context — only
# the user sees the statusline. Result: agent keeps doing big work, hits
# the wall, gets compacted, loses state. With this hook, agent gets told
# "you have 30% left, wrap up the current task."
#
# Pattern source: GSD `gsd-context-monitor.js`
# (/tmp/gsd/hooks/gsd-context-monitor.js).
#
# Mechanism (verified against Claude Code official docs):
#   - statusline JSON input contains `.context_window.remaining_percentage`
#     (https://code.claude.com/docs/en/statusline)
#   - PostToolUse hooks may return:
#     {"hookSpecificOutput": {"hookEventName": "PostToolUse",
#                              "additionalContext": "..."}}
#     and the additionalContext is injected into the agent's conversation
#     (https://code.claude.com/docs/en/hooks)
#
# Failure modes (all silent, never block tool execution):
#   - statusline not enabled → no bridge file → silent exit
#   - subagent (no bridge for subagent session) → silent exit
#   - jq missing → silent exit
#
# Thresholds:
#   WARNING  remaining ≤ 35%
#   CRITICAL remaining ≤ 25%
#
# Debounce: 5 tool uses between warnings to avoid spam. Severity escalation
# (WARNING → CRITICAL) bypasses debounce.

set -eu

WARNING_THRESHOLD=35
CRITICAL_THRESHOLD=25
STALE_SECONDS=60
DEBOUNCE_CALLS=5

command -v jq >/dev/null 2>&1 || exit 0

INPUT="$(cat)"
[ -z "$INPUT" ] && exit 0

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || true)
[ -z "$SESSION_ID" ] && exit 0

# Reject session IDs with path traversal or separators
case "$SESSION_ID" in
  */*|*\\*|*..*) exit 0 ;;
esac

BRIDGE="${TMPDIR:-/tmp}/curdx-ctx-${SESSION_ID}.json"
[ -f "$BRIDGE" ] || exit 0   # statusline not running, or subagent

# Validate bridge file
jq empty "$BRIDGE" 2>/dev/null || exit 0

REMAINING=$(jq -r '.remaining_percentage // empty' "$BRIDGE")
USED=$(jq -r '.used_pct // 0' "$BRIDGE")
BRIDGE_TS=$(jq -r '.timestamp // 0' "$BRIDGE")

[ -z "$REMAINING" ] && exit 0

# Stale check
NOW=$(date +%s)
AGE=$((NOW - BRIDGE_TS))
[ "$AGE" -gt "$STALE_SECONDS" ] && exit 0

# Comparison: bash can't do float; round to int
REMAINING_INT=$(printf '%.0f' "$REMAINING" 2>/dev/null || echo 100)
USED_INT=$(printf '%.0f' "$USED" 2>/dev/null || echo 0)

# Below warning threshold? exit silently
if [ "$REMAINING_INT" -gt "$WARNING_THRESHOLD" ]; then
  exit 0
fi

# Determine severity
LEVEL="warning"
[ "$REMAINING_INT" -le "$CRITICAL_THRESHOLD" ] && LEVEL="critical"

# Debounce
WARN_FILE="${TMPDIR:-/tmp}/curdx-ctx-${SESSION_ID}-warned.json"
CALLS_SINCE=0
LAST_LEVEL=""
FIRST_WARN=1
if [ -f "$WARN_FILE" ]; then
  if jq empty "$WARN_FILE" 2>/dev/null; then
    CALLS_SINCE=$(jq -r '.callsSinceWarn // 0' "$WARN_FILE")
    LAST_LEVEL=$(jq -r '.lastLevel // ""' "$WARN_FILE")
    FIRST_WARN=0
  fi
fi
CALLS_SINCE=$((CALLS_SINCE + 1))

# Severity escalation bypasses debounce
SEVERITY_ESCALATED=0
if [ "$LEVEL" = "critical" ] && [ "$LAST_LEVEL" = "warning" ]; then
  SEVERITY_ESCALATED=1
fi

if [ "$FIRST_WARN" = "0" ] && [ "$CALLS_SINCE" -lt "$DEBOUNCE_CALLS" ] && [ "$SEVERITY_ESCALATED" = "0" ]; then
  # within debounce window — update counter, exit silent
  jq -n \
    --argjson c "$CALLS_SINCE" \
    --arg l "$LAST_LEVEL" \
    '{callsSinceWarn:$c, lastLevel:$l}' > "${WARN_FILE}.tmp.$$" 2>/dev/null \
    && mv "${WARN_FILE}.tmp.$$" "$WARN_FILE" 2>/dev/null \
    || rm -f "${WARN_FILE}.tmp.$$"
  exit 0
fi

# Reset debounce
jq -n \
  --argjson c 0 \
  --arg l "$LEVEL" \
  '{callsSinceWarn:$c, lastLevel:$l}' > "${WARN_FILE}.tmp.$$" 2>/dev/null \
  && mv "${WARN_FILE}.tmp.$$" "$WARN_FILE" 2>/dev/null \
  || rm -f "${WARN_FILE}.tmp.$$"

# Detect curdx project for tailored advice
HAS_CURDX=0
[ -f .curdx/state.json ] && HAS_CURDX=1

# Build advisory message (advisory only — never imperative override of user)
if [ "$LEVEL" = "critical" ]; then
  if [ "$HAS_CURDX" = "1" ]; then
    MSG="CONTEXT CRITICAL: usage at ${USED_INT}%, remaining ${REMAINING_INT}%. Context is nearly exhausted. Do NOT start new complex work. curdx-flow state is already tracked in .curdx/state.json — inform the user so they can run /curdx:status and pause at the next natural stopping point."
  else
    MSG="CONTEXT CRITICAL: usage at ${USED_INT}%, remaining ${REMAINING_INT}%. Context is nearly exhausted. Inform the user that context is low and ask how they want to proceed. Do NOT autonomously save state or write handoff files unless the user asks."
  fi
else
  if [ "$HAS_CURDX" = "1" ]; then
    MSG="CONTEXT WARNING: usage at ${USED_INT}%, remaining ${REMAINING_INT}%. Context is getting limited. Avoid starting new complex work. If not between defined task steps, inform the user so they can prepare to pause."
  else
    MSG="CONTEXT WARNING: usage at ${USED_INT}%, remaining ${REMAINING_INT}%. Be aware that context is getting limited. Avoid unnecessary exploration or starting new complex work."
  fi
fi

jq -n \
  --arg msg "$MSG" \
  '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $msg}}'
