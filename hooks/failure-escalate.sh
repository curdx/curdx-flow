#!/usr/bin/env bash
# failure-escalate.sh — PostToolUse Bash hook
#
# Tracks consecutive Bash command failures per session. When the counter
# hits escalation thresholds, injects guidance to switch to systematic
# debugging instead of brute-force retries.
#
# Levels:
#   L0 (0-1 failures): silent
#   L1 (2 failures):   suggest changing approach — same approach not working
#   L2 (3 failures):   mandate the 7-point checklist from systematic-debug
#   L3 (4+ failures):  strongly suggest /curdx:debug session
#
# Counter is session-scoped (resets on new session_id) and stored at
# ~/.curdx/.failure-count-<session-id>.
#
# Pattern borrowed from pua's hooks/failure-detector.sh (levels and counter).
#
# Contract: stdin JSON, stdout JSON with additionalContext (never blocks).

set -eu

command -v jq >/dev/null 2>&1 || exit 0

INPUT="$(cat)"
[ -z "$INPUT" ] && exit 0

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
[ "$TOOL_NAME" != "Bash" ] && exit 0

# post-hooks get the result — check exit code
EXIT_CODE=$(echo "$INPUT" | jq -r '.tool_result.exit_code // .tool_response.exit_code // 0')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "default"')

# sanitize session id for filename (path-traversal guard borrowed from claude-mem)
SAFE_SID=$(echo "$SESSION_ID" | tr -cd 'a-zA-Z0-9._-' | head -c 64)
[ -z "$SAFE_SID" ] && SAFE_SID=default

COUNT_DIR="$HOME/.curdx"
COUNT_FILE="$COUNT_DIR/.failure-count-$SAFE_SID"
mkdir -p "$COUNT_DIR" 2>/dev/null

# success resets counter
if [ "$EXIT_CODE" = "0" ]; then
  rm -f "$COUNT_FILE"
  exit 0
fi

# non-zero: increment
COUNT=0
if [ -f "$COUNT_FILE" ]; then
  COUNT=$(cat "$COUNT_FILE" 2>/dev/null || echo 0)
  # guard against garbage
  case "$COUNT" in
    ''|*[!0-9]*) COUNT=0 ;;
  esac
fi
COUNT=$((COUNT + 1))
echo "$COUNT" > "$COUNT_FILE.tmp" && mv "$COUNT_FILE.tmp" "$COUNT_FILE"

# decide escalation level
MSG=""
case "$COUNT" in
  0|1)
    # silent
    exit 0
    ;;
  2)
    MSG=$(cat <<'EOF'
**curdx-flow failure-escalate (L1):** that's 2 consecutive Bash failures.

Before you try the same approach again with a small tweak — pause. Ask yourself:
1. Do I actually understand WHY the command failed? Read the error message word by word.
2. Is there a fundamentally different approach? Not a parameter tweak — a different strategy.
3. Do I need more data? Run a diagnostic command (ls / env / cat relevant file) before retrying.

The Constitution's Rule 3 (NO FIX WITHOUT ROOT CAUSE) applies here.
EOF
)
    ;;
  3)
    MSG=$(cat <<'EOF'
**curdx-flow failure-escalate (L2):** 3 consecutive failures.

Mandatory checklist before retrying (curdx-systematic-debug skill, 7 points):
1. Read the failure signal word by word?
2. Searched the core problem with tools (grep / web)?
3. Read source code (not just docs)?
4. Verified pre-conditions / environment?
5. Listed and reversed assumptions?
6. Checked for similar bugs elsewhere in the codebase?
7. Posted concrete evidence of what you tried (stdout/stderr, not a summary)?

If you cannot check all 7, STOP retrying and run the checks first.
EOF
)
    ;;
  *)
    MSG=$(cat <<'EOF'
**curdx-flow failure-escalate (L3):** 4+ consecutive failures.

This is no longer an ad-hoc retry situation. You likely have a wrong mental model of the system. Strong recommendation:

  /curdx:debug <brief-description-of-what-you-were-trying-to-do>

That starts a persistent systematic-debug session — root cause → pattern analysis → single-hypothesis testing → fix with regression proof. The session file at `.curdx/debug/<slug>.md` survives compaction so you won't re-investigate if the session restarts.

Continuing to retry without switching strategies is the definition of the problem (see Constitution Rule 3).
EOF
)
    ;;
esac

if [ -n "$MSG" ]; then
  jq -n --arg m "$MSG" '{
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: $m
    }
  }'
fi

exit 0
