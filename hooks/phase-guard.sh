#!/usr/bin/env bash
# phase-guard.sh — UserPromptSubmit hook
#
# Detects when the user's prompt is asking to write code but the state
# shows no active spec. Injects a soft nudge to go through the proper
# pipeline. Does NOT block — only informs.
#
# Also detects frustration keywords and suggests /curdx:debug instead
# of ad-hoc retries.
#
# Contract: stdin JSON, stdout JSON with additionalContext OR empty.

set -eu

command -v jq >/dev/null 2>&1 || exit 0

INPUT="$(cat)"
[ -z "$INPUT" ] && exit 0

CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
PROMPT=$(echo "$INPUT" | jq -r '.user_prompt_text // .prompt // empty')
[ -z "$CWD" ] && exit 0
[ -z "$PROMPT" ] && exit 0

# bail if no .curdx (user not initialized — don't nag)
[ -f "$CWD/.curdx/state.json" ] || exit 0

STATE=$(cat "$CWD/.curdx/state.json")
PHASE=$(echo "$STATE" | jq -r '.phase // "unknown"')
ACTIVE=$(echo "$STATE" | jq -r '.active_feature // empty')

# ---- detect "write code" intent with no spec ----
code_intent=false
if echo "$PROMPT" | grep -iqE '\b(implement|build|write|add|create|develop|code up|make)\b.*\b(feature|function|endpoint|component|module|page|service|api|route)\b'; then
  code_intent=true
fi
# also keyword triggers
if echo "$PROMPT" | grep -iqE '\b(let.?s (build|make|create|add)|i (want|need) (a|to))\b'; then
  code_intent=true
fi

if [ "$code_intent" = "true" ]; then
  case "$PHASE" in
    init|init-complete)
      cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"**curdx-flow phase-guard:** you're asking to build something, but curdx-flow is in phase `init-complete` with no active feature. The recommended entry point is `/curdx:spec <slug>` to capture what/why before writing code. If this is genuinely trivial (typo / comment / one-line fix), use `/curdx:quick` to bypass the full pipeline.\n\n(If the user insists, you can proceed without the spec — but Rule 1 PreToolUse hook will block edits to src/** until state.phase is `execution`, `quick`, or `debug`.)"}}
EOF
      exit 0
      ;;
    spec|spec-complete)
      if [ -n "$ACTIVE" ]; then
        cat <<EOF
{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"**curdx-flow phase-guard:** a spec exists for ${ACTIVE} but no plan/tasks yet. The next step is \`/curdx:plan\`, then \`/curdx:tasks\`, then \`/curdx:implement\`. Avoid editing src/** directly — the PreToolUse hook will block it."}}
EOF
        exit 0
      fi
      ;;
    plan|plan-complete)
      cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"**curdx-flow phase-guard:** plan exists but tasks not generated. Run `/curdx:tasks` next, then `/curdx:implement`."}}
EOF
      exit 0
      ;;
  esac
fi

# ---- detect frustration / re-try-please keywords — suggest /curdx:debug ----
if echo "$PROMPT" | grep -iqE '\b(it.?s (broken|not working|still failing)|try again|fix it|why (is )?(it|this) (broken|failing|not working)|keeps failing|the bug is back|same error|still erroring)\b'; then
  if [ "$PHASE" != "debug" ]; then
    cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"**curdx-flow phase-guard:** frustration detected. Instead of ad-hoc retries (which accumulate technical debt — see Rule 3 NO FIX WITHOUT ROOT CAUSE), start a `/curdx:debug <brief-description>` session. That walks the 4-phase methodology: root-cause investigation → pattern analysis → hypothesis → implementation. Persistent session file at `.curdx/debug/<slug>.md` survives compaction."}}
EOF
    exit 0
  fi
fi

# ---- detect bare "ship it" before verify ----
if echo "$PROMPT" | grep -iqE '\b(ship it|push|create (a )?pr|merge (it|this)|let.?s deploy)\b'; then
  if [ "$PHASE" != "verify-complete" ] && [ "$PHASE" != "review-complete" ]; then
    cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"**curdx-flow phase-guard:** shipping request detected but verification / review not complete for this feature. Per Rule 4 (NO COMPLETION WITHOUT EVIDENCE), run `/curdx:verify` first. If verify passes and you want a final independent check, run `/curdx:review`."}}
EOF
    exit 0
  fi
fi

# nothing to say — allow normally
exit 0
