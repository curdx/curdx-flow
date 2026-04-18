#!/usr/bin/env bash
# load-context.sh — SessionStart hook
#
# Three responsibilities, in this order:
#
# 1. Inject the curdx-flow GLOBAL PROTOCOLS into every session where this
#    plugin is enabled — irrespective of whether the cwd is a curdx project.
#    These are the user's persistent style / language / discipline rules.
#    Resolution order:
#      - $HOME/.curdx/no-global-protocols (touch this file to opt out)
#      - $HOME/.curdx/user-protocols.md (user override; takes precedence)
#      - $CLAUDE_PLUGIN_ROOT/protocols/global-protocols.md (shipped default)
#
# 1b. Run a throttled npm-registry update check, inject a one-line notice if a
#     newer curdx-flow is available (see scripts/update-check.sh).
#
# 2. If cwd is inside a curdx-initialized project:
#    - Load the `curdx-using-skills` META-SKILL as additionalContext, wrapped in
#      <EXTREMELY-IMPORTANT> — this is the auto-dispatch layer: it teaches the
#      agent to map user intent to curdx commands WITHOUT the user having to
#      remember slash commands. Pattern from obra's superpowers:using-superpowers.
#    - Surface the current project state (phase, active feature, artifacts, next).
#
# Patterns borrowed from pua's hooks/session-restore.sh (additionalContext
# via JSON stdout) and gsd's gsd-statusline.js (walking up the tree for
# .curdx/state.json) and obra's superpowers session-start hook (EXTREMELY-
# IMPORTANT wrapped skill injection).
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

# ---------- 1b. update-check (unconditional, opt-out, cached) ----------
# Query npm registry at most once / 24h, cache the result, inject a one-line
# notice when a newer curdx-flow version is available. Script exits silently
# on network failure, missing tools, or when the user has opted out via
# ~/.curdx/no-update-check. See scripts/update-check.sh and docs/INSTALL.md.
UPDATE_NOTICE=""
UPDATE_SCRIPT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}/scripts/update-check.sh"
if [ -x "$UPDATE_SCRIPT" ]; then
  # run with a hard wall-clock timeout so a slow registry can never block
  # SessionStart past the hook's declared timeout in hooks/hooks.json
  UPDATE_RAW=$(timeout 4 bash "$UPDATE_SCRIPT" 2>/dev/null || true)
  case "$UPDATE_RAW" in
    UPGRADE_AVAILABLE\ *)
      OLD_VER=$(echo "$UPDATE_RAW" | awk '{print $2}')
      NEW_VER=$(echo "$UPDATE_RAW" | awk '{print $3}')
      UPDATE_NOTICE=$(printf 'curdx-flow %s available (you have %s). Upgrade: `npx curdx-flow@latest install --force`.\nSilence this for good: `touch ~/.curdx/no-update-check`.' "$NEW_VER" "$OLD_VER")
      ;;
  esac
fi

# ---------- 2. curdx-project context + auto-dispatch meta-skill (conditional) ----------
CURDX_CONTEXT=""
USING_SKILLS_CONTENT=""

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

  # ---- 2a. Load the curdx-using-skills meta-skill for auto-dispatch ----
  # Only inject when the project is curdx-initialized; otherwise the skill's
  # intent-map references commands the user hasn't enabled for this repo.
  # Opt-out: touch ~/.curdx/no-auto-dispatch
  if [ ! -f "$HOME/.curdx/no-auto-dispatch" ]; then
    PLUGIN_ROOT_FOR_SKILL="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
    SKILL_FILE="$PLUGIN_ROOT_FOR_SKILL/skills/curdx-using-skills/SKILL.md"
    if [ -f "$SKILL_FILE" ]; then
      USING_SKILLS_CONTENT=$(cat "$SKILL_FILE" 2>/dev/null || true)
    fi
  fi

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
# Compose order (top → bottom of the injected block):
#   1. update notice (most transient, flagged with `>` blockquote)
#   2. using-skills meta-skill, wrapped in <EXTREMELY-IMPORTANT> (the hardest rule)
#   3. global protocols (persistent user rules)
#   4. curdx-project situational context (current phase, active feature)
#
# The using-skills block goes near the top because it shapes EVERY response
# that follows — it's the auto-dispatch layer. If buried under protocols +
# context, attention dilutes and the 1% rule weakens. Pattern from obra's
# superpowers hooks/session-start:37-44 wrapping using-superpowers in
# <EXTREMELY_IMPORTANT>.
#
# Skip emit entirely if all four pieces are empty.
if [ -z "$GLOBAL_PROTOCOLS" ] && [ -z "$CURDX_CONTEXT" ] && [ -z "$UPDATE_NOTICE" ] && [ -z "$USING_SKILLS_CONTENT" ]; then
  exit 0
fi

CONTEXT=""
if [ -n "$UPDATE_NOTICE" ]; then
  CONTEXT="> $UPDATE_NOTICE"
fi
if [ -n "$USING_SKILLS_CONTENT" ]; then
  WRAPPED_SKILL="<EXTREMELY-IMPORTANT>
You are in a curdx-initialized project. The following meta-skill governs how
you route user intent to curdx commands. Follow it BEFORE any other response.
Auto-dispatching is the default — slash commands are a manual override.

${USING_SKILLS_CONTENT}
</EXTREMELY-IMPORTANT>"
  if [ -n "$CONTEXT" ]; then
    CONTEXT="${CONTEXT}

---

${WRAPPED_SKILL}"
  else
    CONTEXT="$WRAPPED_SKILL"
  fi
fi
if [ -n "$GLOBAL_PROTOCOLS" ]; then
  if [ -n "$CONTEXT" ]; then
    CONTEXT="${CONTEXT}

---

${GLOBAL_PROTOCOLS}"
  else
    CONTEXT="$GLOBAL_PROTOCOLS"
  fi
fi
if [ -n "$CURDX_CONTEXT" ]; then
  if [ -n "$CONTEXT" ]; then
    CONTEXT="${CONTEXT}

---

${CURDX_CONTEXT}"
  else
    CONTEXT="$CURDX_CONTEXT"
  fi
fi

jq -n --arg ctx "$CONTEXT" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $ctx
  }
}'

exit 0
