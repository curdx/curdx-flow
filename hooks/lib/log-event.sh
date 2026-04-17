#!/usr/bin/env bash
# hooks/lib/log-event.sh — shared event-logging helper for all curdx-flow hooks.
#
# Sourced at the top of every hook script. Provides curdx_log which writes a
# single JSONL line to .curdx/logs/events.jsonl in the active project.
#
# The events log is what /curdx:snapshot bundles for debugging. Keep entries
# SMALL and STRUCTURED — full command text / prompts / outputs go to Claude
# Code's native transcript (~/.claude/projects/<proj>/<session>.jsonl), not here.
#
# Usage:
#   . "$(dirname "$0")/lib/log-event.sh"
#   curdx_log "$CWD" "$SESSION_ID" '{"event":"hook_fired","hook":"enforce-constitution"}'
#
# Safety:
# - Silently no-ops if jq missing, .curdx absent, or user isn't in a curdx project.
# - Auto-creates .curdx/logs/ on first write.
# - Rotates events.jsonl when it exceeds 5 MB (to events.jsonl.1, overwriting).
# - POSIX: small append is atomic, safe for concurrent hooks.

curdx_log() {
  local cwd="$1" session="$2" user_json="$3"
  [ -z "$cwd" ] && return 0
  [ -z "$user_json" ] && return 0
  command -v jq >/dev/null 2>&1 || return 0

  # walk up to find .curdx/ (max 10 levels)
  local root="$cwd" i=0
  while [ "$i" -lt 10 ]; do
    [ -d "$root/.curdx" ] && break
    local parent
    parent=$(dirname "$root")
    [ "$parent" = "$root" ] && return 0
    root="$parent"
    i=$((i + 1))
  done
  [ ! -d "$root/.curdx" ] && return 0

  local logs_dir="$root/.curdx/logs"
  mkdir -p "$logs_dir" 2>/dev/null || return 0

  local log_file="$logs_dir/events.jsonl"

  # rotate if > 5 MB
  if [ -f "$log_file" ]; then
    local size
    if [ "$(uname)" = "Darwin" ]; then
      size=$(stat -f %z "$log_file" 2>/dev/null || echo 0)
    else
      size=$(stat -c %s "$log_file" 2>/dev/null || echo 0)
    fi
    if [ "$size" -gt 5242880 ]; then
      mv "$log_file" "${log_file}.1" 2>/dev/null
    fi
  fi

  # pull phase + active_feature from state.json (best effort; default to uninitialized)
  local phase="uninitialized" active=""
  if [ -f "$root/.curdx/state.json" ]; then
    phase=$(jq -r '.phase // "unknown"' "$root/.curdx/state.json" 2>/dev/null || echo "unknown")
    active=$(jq -r '.active_feature // ""' "$root/.curdx/state.json" 2>/dev/null || echo "")
  fi

  local ts
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # merge common fields with the caller's JSON fragment
  local full
  full=$(jq -c -n \
    --arg ts "$ts" \
    --arg session "$session" \
    --arg phase "$phase" \
    --arg active "$active" \
    --argjson user "$user_json" \
    '{ts: $ts, session: $session, phase: $phase, active_feature: $active} * $user' 2>/dev/null) || return 0

  [ -z "$full" ] && return 0

  # append atomically
  echo "$full" >> "$log_file" 2>/dev/null || true
}
