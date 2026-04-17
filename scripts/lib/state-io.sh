#!/usr/bin/env bash
# state-io.sh — atomic JSON read/write helpers for hooks and commands
#
# Source this file in any bash script that needs to mutate .curdx/state.json
# safely. Uses tmp+rename atomicity (gstack pattern). Requires jq.
#
# Usage:
#   . "$(dirname "$0")/lib/state-io.sh"
#   state_get '.phase'                    # read
#   state_set '.phase' '"execution"'      # write (value is jq-quoted JSON)
#   state_merge '{"task_index": 3}'       # deep-merge an object

set -eu

CURDX_STATE_FILE="${CURDX_STATE_FILE:-.curdx/state.json}"

_state_require_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "[curdx] jq required" >&2
    return 1
  fi
}

state_init_if_missing() {
  _state_require_jq || return 1
  if [ ! -f "$CURDX_STATE_FILE" ]; then
    mkdir -p "$(dirname "$CURDX_STATE_FILE")"
    cat > "$CURDX_STATE_FILE" <<'EOF'
{
  "schema_version": 1,
  "phase": "init",
  "active_feature": null,
  "task_index": 0,
  "total_tasks": 0,
  "task_iteration": 1,
  "max_task_iterations": 5,
  "global_iteration": 1,
  "max_global_iterations": 100,
  "awaiting_approval": false,
  "started_at": null,
  "last_updated": null
}
EOF
  fi
}

state_get() {
  _state_require_jq || return 1
  if [ ! -f "$CURDX_STATE_FILE" ]; then echo "null"; return 0; fi
  jq -r "$1 // empty" "$CURDX_STATE_FILE"
}

# state_set <jq-path> <jq-value>
# example: state_set '.phase' '"execution"'
state_set() {
  _state_require_jq || return 1
  state_init_if_missing
  local tmp="${CURDX_STATE_FILE}.tmp.$$"
  jq "$1 = $2 | .last_updated = (now | todate)" "$CURDX_STATE_FILE" > "$tmp"
  mv "$tmp" "$CURDX_STATE_FILE"
}

# state_merge <json-object>
# example: state_merge '{"task_index": 3, "phase": "execution"}'
state_merge() {
  _state_require_jq || return 1
  state_init_if_missing
  local tmp="${CURDX_STATE_FILE}.tmp.$$"
  jq --argjson patch "$1" '. * $patch | .last_updated = (now | todate)' "$CURDX_STATE_FILE" > "$tmp"
  mv "$tmp" "$CURDX_STATE_FILE"
}

# state_print — full JSON to stdout
state_print() {
  if [ ! -f "$CURDX_STATE_FILE" ]; then echo "{}"; return; fi
  cat "$CURDX_STATE_FILE"
}
