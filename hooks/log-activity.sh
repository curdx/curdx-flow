#!/usr/bin/env bash
# log-activity.sh — catch-all tool-use logger.
#
# Registered for BOTH PreToolUse(*) and PostToolUse(*). Runs alongside the
# specialized hooks (enforce-constitution, careful-bash, failure-escalate) —
# those make decisions; this one just records every tool invocation + result
# into .curdx/logs/events.jsonl.
#
# Captures what the specialized hooks miss:
# - Task (subagent dispatches) — tool_name="Task", subagent_type extracted
# - Skill (skill activations) — tool_name="Skill", skill name extracted
# - mcp__<server>__<tool> (MCP calls) — tool_name already namespaced
# - Read, Grep, Glob, Write — informational; useful for session-flow analysis
#
# Never blocks anything. Exit 0 always. stdout must stay empty (other hooks
# for the same event need a clean slate).

set -eu

command -v jq >/dev/null 2>&1 || exit 0

INPUT="$(cat)"
[ -z "$INPUT" ] && exit 0

. "$(dirname "$0")/lib/log-event.sh"

CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // "unknown"')
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

[ -z "$TOOL_NAME" ] && exit 0

if [ "$HOOK_EVENT" = "PreToolUse" ]; then
  # extract tool-specific identifier to make the log useful:
  #   Task → .tool_input.subagent_type
  #   Skill → .tool_input.skill
  #   Bash → first word of .tool_input.command
  #   Edit / Write → .tool_input.file_path (basename only, to avoid leaking paths)
  extra="{}"
  case "$TOOL_NAME" in
    Task)
      sub=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // ""')
      extra=$(jq -n -c --arg s "$sub" '{subagent: $s}')
      ;;
    Skill)
      skill=$(echo "$INPUT" | jq -r '.tool_input.skill // ""')
      extra=$(jq -n -c --arg s "$skill" '{skill: $s}')
      ;;
    Bash)
      cmd_first=$(echo "$INPUT" | jq -r '.tool_input.command // ""' | awk '{print $1}' | head -c 40)
      extra=$(jq -n -c --arg c "$cmd_first" '{command: $c}')
      ;;
    Edit|Write)
      fp=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')
      # basename only; full path goes to transcript, not log
      base=$(basename "$fp" 2>/dev/null || echo "")
      extra=$(jq -n -c --arg f "$base" '{file: $f}')
      ;;
    Read|Grep|Glob)
      # no extra fields — just note the tool
      ;;
    mcp__*)
      # MCP tool name is already descriptive (e.g., mcp__context7__resolve-library-id)
      ;;
  esac

  evt=$(jq -n -c \
    --arg tool "$TOOL_NAME" \
    --argjson extra "$extra" \
    '{event: "tool_call", tool: $tool} * $extra')
  curdx_log "$CWD" "$SESSION_ID" "$evt"

elif [ "$HOOK_EVENT" = "PostToolUse" ]; then
  # capture exit code + success for Bash; generic note for others
  exit_code=$(echo "$INPUT" | jq -r '.tool_response.exit_code // .tool_result.exit_code // null' 2>/dev/null)
  if [ "$TOOL_NAME" = "Bash" ] && [ -n "$exit_code" ] && [ "$exit_code" != "null" ]; then
    evt=$(jq -n -c \
      --arg tool "$TOOL_NAME" \
      --argjson code "$exit_code" \
      '{event: "tool_result", tool: $tool, exit_code: $code}')
  else
    evt=$(jq -n -c --arg tool "$TOOL_NAME" '{event: "tool_result", tool: $tool}')
  fi
  curdx_log "$CWD" "$SESSION_ID" "$evt"
fi

exit 0
