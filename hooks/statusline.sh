#!/usr/bin/env bash
# statusline.sh — Claude Code statusline + context bridge writer
#
# Two jobs in one script:
#   1. Print a one-line status to stdout (Claude Code shows this to the user)
#   2. Write context window metrics to /tmp/curdx-ctx-{session_id}.json so
#      hooks/context-monitor.sh can inject warnings into the agent's context
#      when context is running low.
#
# Pattern source: GSD `gsd-statusline.js` (/tmp/gsd/hooks/gsd-statusline.js)
# adapted from JS to bash + jq for consistency with curdx's other hooks.
#
# Statusline contract: read JSON from stdin, write a single line to stdout,
# exit 0. Anything written to stderr is hidden from the user.
#
# Statusline JSON fields used (Claude Code official spec):
#   .session_id
#   .model.display_name
#   .workspace.current_dir
#   .context_window.remaining_percentage
#   .context_window.used_percentage
#
# To enable:
#   add to ~/.claude/settings.json (or .claude/settings.json in project):
#     "statusLine": {
#       "type": "command",
#       "command": "bash /path/to/curdx-flow/hooks/statusline.sh"
#     }
#   /curdx:doctor will detect whether this is wired and suggest how to add it.

set -eu

command -v jq >/dev/null 2>&1 || {
  # Without jq we can't do anything useful — print a minimal line and exit
  printf '[curdx] '
  exit 0
}

INPUT="$(cat)"
[ -z "$INPUT" ] && exit 0

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || true)
MODEL=$(echo "$INPUT" | jq -r '.model.display_name // "Claude"' 2>/dev/null || echo "Claude")
DIR=$(echo "$INPUT" | jq -r '.workspace.current_dir // empty' 2>/dev/null || true)
[ -z "$DIR" ] && DIR="$PWD"
DIRNAME=$(basename "$DIR")

REMAINING=$(echo "$INPUT" | jq -r '.context_window.remaining_percentage // empty' 2>/dev/null || true)
USED=$(echo "$INPUT" | jq -r '.context_window.used_percentage // empty' 2>/dev/null || true)

# ---------- write bridge file (for context-monitor.sh) ----------

# Reject session IDs with path traversal or separators — these get used as
# /tmp filenames and a malicious session_id could escape the temp dir.
if [ -n "$SESSION_ID" ] && [ -n "$REMAINING" ]; then
  case "$SESSION_ID" in
    */*|*\\*|*..*)
      ;;  # invalid — skip bridge write
    *)
      BRIDGE="${TMPDIR:-/tmp}/curdx-ctx-${SESSION_ID}.json"
      TMP="${BRIDGE}.tmp.$$"
      NOW=$(date +%s)
      USED_VAL="${USED:-0}"
      jq -n \
        --arg sid "$SESSION_ID" \
        --argjson remaining "$REMAINING" \
        --argjson used "$USED_VAL" \
        --argjson ts "$NOW" \
        '{session_id:$sid, remaining_percentage:$remaining, used_pct:$used, timestamp:$ts}' \
        > "$TMP" 2>/dev/null && mv "$TMP" "$BRIDGE" 2>/dev/null || rm -f "$TMP"
      ;;
  esac
fi

# ---------- read curdx state (if initialized) ----------

CURDX_LINE=""
if [ -f .curdx/state.json ]; then
  PHASE=$(jq -r '.phase // empty' .curdx/state.json 2>/dev/null || true)
  ACTIVE=$(jq -r '.active_feature // empty' .curdx/state.json 2>/dev/null || true)
  TASK_IDX=$(jq -r '.task_index // 0' .curdx/state.json 2>/dev/null || echo 0)
  TOTAL=$(jq -r '.total_tasks // 0' .curdx/state.json 2>/dev/null || echo 0)
  if [ -n "$ACTIVE" ] && [ -n "$PHASE" ]; then
    if [ "$TOTAL" -gt 0 ]; then
      CURDX_LINE=" │ ${PHASE}: ${ACTIVE} (${TASK_IDX}/${TOTAL})"
    else
      CURDX_LINE=" │ ${PHASE}: ${ACTIVE}"
    fi
  fi
fi

# ---------- format context bar ----------

CTX_LINE=""
if [ -n "$USED" ]; then
  USED_INT=$(printf '%.0f' "$USED" 2>/dev/null || echo 0)
  FILLED=$((USED_INT / 10))
  [ "$FILLED" -gt 10 ] && FILLED=10
  EMPTY=$((10 - FILLED))
  BAR=""
  i=0
  while [ "$i" -lt "$FILLED" ]; do BAR="${BAR}█"; i=$((i+1)); done
  i=0
  while [ "$i" -lt "$EMPTY" ]; do BAR="${BAR}░"; i=$((i+1)); done
  CTX_LINE=" │ ${BAR} ${USED_INT}%"
fi

printf '%s │ %s%s%s' "$MODEL" "$DIRNAME" "$CURDX_LINE" "$CTX_LINE"
