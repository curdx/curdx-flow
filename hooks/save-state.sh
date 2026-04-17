#!/usr/bin/env bash
# save-state.sh — PreCompact hook
#
# Serializes curdx-flow's in-progress state to a journal so SessionStart can
# restore it after Claude Code's automatic context compaction.
#
# Pattern borrowed from pua's session-restore.sh (compaction-recovery via
# journal mtime check) and claude-mem's SessionStart-after-compact behavior.
#
# Writes: .curdx/memory/builder-journal.md
# SessionStart hook (load-context.sh) notes if journal is < 24h old.
#
# Contract: stdin JSON, stdout empty, exit 0. PreCompact hooks cannot block
# compaction; they just capture state.

set -eu

command -v jq >/dev/null 2>&1 || exit 0

INPUT="$(cat)"
[ -z "$INPUT" ] && exit 0

CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
[ -z "$CWD" ] && exit 0
cd "$CWD" 2>/dev/null || exit 0

# bail if not initialized
[ -f .curdx/state.json ] || exit 0

. "$(dirname "$0")/lib/log-event.sh"
curdx_log "$CWD" "$SESSION_ID" '{"event":"pre_compact"}'

mkdir -p .curdx/memory

STATE=$(cat .curdx/state.json)
PHASE=$(echo "$STATE" | jq -r '.phase // "unknown"')
ACTIVE=$(echo "$STATE" | jq -r '.active_feature // empty')
TASK_IDX=$(echo "$STATE" | jq -r '.task_index // 0')
TOTAL=$(echo "$STATE" | jq -r '.total_tasks // 0')
ITER=$(echo "$STATE" | jq -r '.task_iteration // 1')
GLOBAL_ITER=$(echo "$STATE" | jq -r '.global_iteration // 1')

# active-feature artifacts
SPEC_SUM=""
PLAN_SUM=""
TASK_CURRENT=""
DEBUG_SLUG=$(echo "$STATE" | jq -r '.active_debug_slug // empty')

if [ -n "$ACTIVE" ]; then
  FDIR=".curdx/features/$ACTIVE"
  if [ -f "$FDIR/spec.md" ]; then
    # first 3 non-empty lines of spec to give context
    SPEC_SUM=$(grep -v '^[[:space:]]*$' "$FDIR/spec.md" 2>/dev/null | head -5 | sed 's/^/  /')
  fi
  if [ -f "$FDIR/plan.md" ]; then
    PLAN_SUM=$(grep -v '^[[:space:]]*$' "$FDIR/plan.md" 2>/dev/null | head -5 | sed 's/^/  /')
  fi
  # current task if in execution
  if [ "$PHASE" = "execution" ] && [ -f "$FDIR/tasks.md" ]; then
    # extract (task_index+1)-th task block
    TASK_CURRENT=$(awk -v n="$((TASK_IDX + 1))" '
      /^<task id=/ { i++; if (i == n) { p = 1; print; next } }
      p && /^<\/task>/ { print; exit }
      p { print }
    ' "$FDIR/tasks.md" | head -40)
  fi
fi

# recent decisions from memory/decisions.md if present (claude-mem writes this)
RECENT_DECISIONS=""
if [ -f .curdx/memory/decisions.md ]; then
  RECENT_DECISIONS=$(tail -20 .curdx/memory/decisions.md)
fi

# recent commits on current branch
RECENT_COMMITS=""
if git rev-parse --git-dir >/dev/null 2>&1; then
  RECENT_COMMITS=$(git log --oneline -5 2>/dev/null || true)
fi

# debug session context if active
DEBUG_CONTEXT=""
if [ -n "$DEBUG_SLUG" ] && [ -f ".curdx/debug/$DEBUG_SLUG.md" ]; then
  DEBUG_CONTEXT=$(head -40 ".curdx/debug/$DEBUG_SLUG.md")
fi

# write journal atomically
TMP=".curdx/memory/builder-journal.md.tmp.$$"
cat > "$TMP" <<EOF
# curdx-flow builder journal

Written by PreCompact hook at $(date -u +%Y-%m-%dT%H:%M:%SZ).
Use this to restore state after context compaction.

## State snapshot

- **Phase:** $PHASE
- **Active feature:** ${ACTIVE:-none}
- **Task progress:** $TASK_IDX / $TOTAL
- **Task iteration:** $ITER
- **Global iteration:** $GLOBAL_ITER
- **Active debug slug:** ${DEBUG_SLUG:-none}

## Active spec (head)

${SPEC_SUM:-(no active spec)}

## Active plan (head)

${PLAN_SUM:-(no active plan)}

## Current task (execution only)

\`\`\`xml
${TASK_CURRENT:-(not in execution)}
\`\`\`

## Recent commits

\`\`\`
${RECENT_COMMITS:-(no git history)}
\`\`\`

## Recent decisions (from .curdx/memory/decisions.md)

${RECENT_DECISIONS:-(no decisions logged)}

## Active debug session (if any)

${DEBUG_CONTEXT:-(no active debug)}

---

After compact, re-read .curdx/state.json for authoritative state. This
journal is a narrative supplement, not a source of truth.
EOF

mv "$TMP" .curdx/memory/builder-journal.md
exit 0
