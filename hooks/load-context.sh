#!/usr/bin/env bash
# load-context.sh — SessionStart hook
#
# Two responsibilities, in this order:
#
# 1. Inject the curdx-flow GLOBAL PROTOCOLS into every session where this
#    plugin is enabled — irrespective of whether the cwd is a curdx project.
#    These are the user's persistent style / language / discipline rules.
#    Resolution order:
#      - $HOME/.curdx/no-global-protocols (touch this file to opt out)
#      - $HOME/.curdx/user-protocols.md (user override; takes precedence)
#      - $CLAUDE_PLUGIN_ROOT/protocols/global-protocols.md (shipped default)
#
# 2. If cwd is inside a curdx-initialized project, ALSO surface the current
#    project state (phase, active feature, artifacts, suggested next step).
#
# Patterns borrowed from pua's hooks/session-restore.sh (additionalContext
# via JSON stdout) and gsd's gsd-statusline.js (walking up the tree for
# .curdx/state.json).
#
# Contract: stdin JSON, stdout JSON with additionalContext OR empty.

set -eu

command -v jq >/dev/null 2>&1 || exit 0

INPUT="$(cat)"
[ -z "$INPUT" ] && exit 0

CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
EVENT=$(echo "$INPUT" | jq -r '.matcher // "startup"')
[ -z "$CWD" ] && exit 0

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')

# log the session-start event before we start pulling state
. "$(dirname "$0")/lib/log-event.sh"
curdx_log "$CWD" "$SESSION_ID" "$(jq -n -c --arg m "$EVENT" '{event: "session_start", matcher: $m}')"

# ---------- 1. global protocols (unconditional, opt-out) ----------
GLOBAL_PROTOCOLS=""
if [ ! -f "$HOME/.curdx/no-global-protocols" ]; then
  if [ -f "$HOME/.curdx/user-protocols.md" ]; then
    GLOBAL_PROTOCOLS=$(cat "$HOME/.curdx/user-protocols.md" 2>/dev/null || true)
  else
    # locate shipped default. CLAUDE_PLUGIN_ROOT is set by Claude Code when
    # the hook is invoked via the plugin system; fall back to walking up
    # from this script if not set (direct invocation in tests).
    PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
    if [ -z "$PLUGIN_ROOT" ]; then
      PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
    fi
    if [ -f "$PLUGIN_ROOT/protocols/global-protocols.md" ]; then
      GLOBAL_PROTOCOLS=$(cat "$PLUGIN_ROOT/protocols/global-protocols.md" 2>/dev/null || true)
    fi
  fi
fi

# ---------- 2. curdx-project context (conditional) ----------
CURDX_CONTEXT=""

# walk up to find .curdx/ (max 10 levels)
dir="$CWD"
PROJECT_ROOT=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if [ -d "$dir/.curdx" ]; then
    PROJECT_ROOT="$dir"
    break
  fi
  parent=$(dirname "$dir")
  [ "$parent" = "$dir" ] && break
  dir="$parent"
done

if [ -n "$PROJECT_ROOT" ] && [ -f "$PROJECT_ROOT/.curdx/state.json" ] && [ -f "$PROJECT_ROOT/.curdx/config.json" ]; then
  cd "$PROJECT_ROOT"

  STATE=$(cat .curdx/state.json)
  CONFIG=$(cat .curdx/config.json)

  PHASE=$(echo "$STATE" | jq -r '.phase // "unknown"')
  ACTIVE=$(echo "$STATE" | jq -r '.active_feature // empty')
  TASK_IDX=$(echo "$STATE" | jq -r '.task_index // 0')
  TOTAL=$(echo "$STATE" | jq -r '.total_tasks // 0')
  PROJECT=$(echo "$CONFIG" | jq -r '.project_name // ""')
  BACKEND=$(echo "$CONFIG" | jq -r '.stack.backend.language // "?"')
  FRONTEND=$(echo "$CONFIG" | jq -r '.stack.frontend.framework // "?"')
  BROWSER=$(echo "$CONFIG" | jq -r '.browser_testing.mode // "none"')

  # check for compaction journal (PreCompact hook writes this)
  JOURNAL=".curdx/memory/builder-journal.md"
  JOURNAL_NOTE=""
  if [ -f "$JOURNAL" ]; then
    AGE_SEC=0
    if [ "$(uname)" = "Darwin" ]; then
      MTIME=$(stat -f %m "$JOURNAL" 2>/dev/null || echo 0)
    else
      MTIME=$(stat -c %Y "$JOURNAL" 2>/dev/null || echo 0)
    fi
    AGE_SEC=$(( $(date +%s) - MTIME ))
    if [ "$AGE_SEC" -lt 86400 ]; then
      JOURNAL_NOTE="A compaction journal exists at $JOURNAL (written $((AGE_SEC/60)) min ago). Read it to restore in-progress state.\n"
    fi
  fi

  # active-feature artifacts summary
  ARTIFACTS=""
  if [ -n "$ACTIVE" ]; then
    FDIR=".curdx/features/$ACTIVE"
    [ -f "$FDIR/spec.md" ]          && ARTIFACTS="${ARTIFACTS}spec "
    [ -f "$FDIR/clarifications.md" ] && ARTIFACTS="${ARTIFACTS}clarify "
    [ -f "$FDIR/plan.md" ]          && ARTIFACTS="${ARTIFACTS}plan "
    [ -f "$FDIR/tasks.md" ]         && ARTIFACTS="${ARTIFACTS}tasks "
    [ -f "$FDIR/analysis.md" ]      && ARTIFACTS="${ARTIFACTS}analysis "
    [ -f "$FDIR/review.md" ]        && ARTIFACTS="${ARTIFACTS}review "
    [ -f "$FDIR/verification.md" ]  && ARTIFACTS="${ARTIFACTS}verify "
  fi

  # next-step hint derived from phase
  NEXT=""
  case "$PHASE" in
    init|init-complete) NEXT="/curdx:spec <slug>" ;;
    spec-complete)      NEXT="/curdx:clarify or /curdx:plan" ;;
    plan-complete)      NEXT="/curdx:tasks" ;;
    tasks-complete)     NEXT="/curdx:implement" ;;
    execution)          NEXT="(Stop-hook loop should be running; /curdx:status to inspect)" ;;
    verify-gaps)        NEXT="/curdx:debug <gap> or /curdx:refactor" ;;
    verify-complete)    NEXT="/curdx:review then /curdx:ship" ;;
    review-complete)    NEXT="/curdx:verify (if not done) or /curdx:ship" ;;
    debug)              NEXT="resume debug session" ;;
  esac

  CURDX_CONTEXT=$(cat <<EOF
## curdx-flow session context

**Project:** ${PROJECT}
**Stack:** ${BACKEND} backend / ${FRONTEND} frontend / browser-test: ${BROWSER}
**Phase:** ${PHASE}
**Active feature:** ${ACTIVE:-none}
**Artifacts:** ${ARTIFACTS:-(none yet)}
**Task progress:** ${TASK_IDX} / ${TOTAL}

${JOURNAL_NOTE}${NEXT:+**Suggested next:** $NEXT}

The curdx-flow constitution is loaded from .claude/rules/constitution.md.
Hard rules are enforced by PreToolUse hooks (enforce-constitution.sh and
careful-bash.sh); do not attempt to circumvent them. If a rule blocks a
legitimate action, fix the underlying state (run /curdx:init if needed,
or /curdx:refactor to amend the spec/plan/tasks).
EOF
  )
fi

# ---------- assemble final additionalContext ----------
# Compose: protocols on top (most fundamental), curdx context below (situational).
# Skip emit entirely if both are empty (truly nothing to inject).
if [ -z "$GLOBAL_PROTOCOLS" ] && [ -z "$CURDX_CONTEXT" ]; then
  exit 0
fi

if [ -n "$GLOBAL_PROTOCOLS" ] && [ -n "$CURDX_CONTEXT" ]; then
  CONTEXT="${GLOBAL_PROTOCOLS}

---

${CURDX_CONTEXT}"
elif [ -n "$GLOBAL_PROTOCOLS" ]; then
  CONTEXT="$GLOBAL_PROTOCOLS"
else
  CONTEXT="$CURDX_CONTEXT"
fi

jq -n --arg ctx "$CONTEXT" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $ctx
  }
}'

exit 0
