#!/usr/bin/env bash
# detect-complexity.sh — blast-radius classifier for free-form work requests
#
# Outputs JSON { tier, tokens, branch, dirty, churn_2d, goals, reason,
#                signals_used[], confidence }
# where tier ∈ { trivial, small, medium, large }.
#
# Routing:
#   trivial → inline fix (no plan, no subagent, one commit)
#   small   → /curdx:quick (PLAN.md skips spec/research)
#   medium  → /curdx:spec full pipeline
#   large   → /curdx:triage decompose into multiple specs (Round 3)
#
# Heuristics layered — deterministic signals first, LLM tie-break only for
# the small↔medium ambiguous band. Never relies purely on file count.
#
# Pattern source: BMAD's blast-radius rule ("when uncertain → plan-code-review"),
# gsd's INLINE_THRESHOLD, gstack's keyword routing, Anthropic's harness
# engineering ("models perform worse at longer context lengths").
#
# Usage:
#   detect-complexity.sh "<free-form user request>"
# Output on stdout: a single-line JSON object.
# Respects user override via $CURDX_SIZE env var.

set -eu

command -v jq >/dev/null 2>&1 || {
  echo '{"error":"jq required"}' >&2
  exit 1
}

REQUEST="${1:-}"
[ -z "$REQUEST" ] && {
  echo '{"error":"usage: detect-complexity.sh <request text>"}' >&2
  exit 2
}

TIER="medium"  # BMAD default when uncertain: plan-first
SIGNALS="[]"

add_signal() {
  SIGNALS=$(echo "$SIGNALS" | jq --arg s "$1" '. + [$s]')
}

# ---- 0. Explicit override wins ----
if [ -n "${CURDX_SIZE:-}" ]; then
  case "$CURDX_SIZE" in
    trivial|small|medium|large)
      TIER="$CURDX_SIZE"
      add_signal "env:CURDX_SIZE=$CURDX_SIZE"
      ;;
    *) ;;  # invalid value — ignore
  esac
fi

# ---- 1. Trivial fast-path (zero blast radius) ----
if [ -z "${CURDX_SIZE:-}" ]; then
  tokens=$(echo "$REQUEST" | wc -w | tr -d ' ')
  if echo "$REQUEST" | grep -iqE '^[[:space:]]*(fix|remove|rename|add|update)[[:space:]]+(typo|a[[:space:]]+comment|comments?|formatting|indentation|whitespace)\b'; then
    TIER="trivial"
    add_signal "keyword:trivial-fix"
  elif echo "$REQUEST" | grep -iqE '\b(bump|upgrade)[[:space:]]+(version|dep(endency)?|pkg|package)\b'; then
    TIER="trivial"
    add_signal "keyword:bump-version"
  elif [ "$tokens" -lt 8 ] && echo "$REQUEST" | grep -iqE '\b(lint|format|prettier|eslint|fmt)\b'; then
    TIER="trivial"
    add_signal "keyword:lint-format"
  fi
fi

# ---- 2. Large floor (cross-cutting / system-level) ----
if [ -z "${CURDX_SIZE:-}" ] && [ "$TIER" != "trivial" ]; then
  if echo "$REQUEST" | grep -iqE '\b(build|implement|create|design)[[:space:]]+((a|an|the)[[:space:]]+)?(auth(entication)?|authorization|login|signup|signin|user[[:space:]]+(management|system)|permission[[:space:]]*system|notification|billing|subscription|payment|checkout|dashboard|admin|multi[[:space:]-]?tenant)\b'; then
    TIER="large"
    add_signal "keyword:system-level"
  elif echo "$REQUEST" | grep -iqE '\b(redesign|rewrite|migrate[[:space:]]+(the[[:space:]]+)?(database|db|schema)|port[[:space:]]+from|refactor[[:space:]]+(the[[:space:]]+)?(whole|entire|all))\b'; then
    TIER="large"
    add_signal "keyword:large-refactor"
  fi
fi

# ---- 3. Multi-goal detector (BMAD single-goal filter) ----
if [ -z "${CURDX_SIZE:-}" ] && [ "$TIER" != "trivial" ]; then
  # count top-level conjunctions that suggest multiple deliverables
  goals=$(echo "$REQUEST" | grep -oiE '\b(and|then|; |,[[:space:]]+(also|plus|and)\b)' | wc -l | tr -d ' ')
  tokens=$(echo "$REQUEST" | wc -w | tr -d ' ')
  if [ "$goals" -ge 2 ] && [ "$tokens" -gt 80 ]; then
    TIER="large"
    add_signal "multi-goal:$goals-conjunctions"
  fi
fi

# ---- 4. Git state ----
BRANCH=""
DIRTY=0
CHURN=0
if git rev-parse --git-dir >/dev/null 2>&1; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  CHURN=$(git log --since="2 days ago" --pretty=tformat: --numstat 2>/dev/null | awk '{a+=$1+$2} END{print a+0}')

  # on main/master + non-trivial → floor to medium (force feature branch)
  if [ "$TIER" = "trivial" ] || [ "$TIER" = "small" ]; then
    case "$BRANCH" in
      main|master|trunk|develop)
        TIER="medium"
        add_signal "branch:$BRANCH-protected-floor-medium"
        ;;
    esac
  fi

  # recent big refactor + requesting large → downgrade (don't pile on)
  if [ "$TIER" = "large" ] && [ "$CHURN" -gt 500 ]; then
    TIER="medium"
    add_signal "churn:${CHURN}loc-last-2d-downgrade-from-large"
  fi
fi

# ---- 5. Existing spec match (snap to small/medium) ----
if [ -z "${CURDX_SIZE:-}" ] && [ -d .curdx/features ]; then
  # search spec files for overlap with request keywords (take 2-3 significant words)
  keywords=$(echo "$REQUEST" | tr ' ' '\n' | grep -iE '^[a-z]{4,}$' | head -3 | tr '\n' '|' | sed 's/|$//')
  if [ -n "$keywords" ]; then
    hit=$(grep -lri -E "$keywords" .curdx/features/ 2>/dev/null | head -1 || true)
    if [ -n "$hit" ]; then
      case "$TIER" in
        large) TIER="medium"; add_signal "existing-spec:downgrade-large-to-medium" ;;
        medium) TIER="small"; add_signal "existing-spec:downgrade-medium-to-small" ;;
      esac
    fi
  fi
fi

# ---- 6. Token-size heuristic ----
if [ -z "${CURDX_SIZE:-}" ]; then
  tokens=$(echo "$REQUEST" | wc -w | tr -d ' ')
  if [ "$tokens" -lt 12 ] && [ "$TIER" = "medium" ]; then
    TIER="small"
    add_signal "tokens:$tokens-short-downgrade"
  fi
  if [ "$tokens" -gt 400 ] && [ "$TIER" = "small" ]; then
    TIER="medium"
    add_signal "tokens:$tokens-long-upgrade"
  fi
fi

# ---- 7. LLM tie-break for small↔medium only ----
# Trivial and large are decided deterministically; ambiguous middle band
# gets one `claude -p` call for a tie-break. Respects CURDX_NO_LLM env var.
USED_LLM=false
if [ -z "${CURDX_NO_LLM:-}" ] && [ -z "${CURDX_SIZE:-}" ] && command -v claude >/dev/null 2>&1; then
  if [ "$TIER" = "small" ] || [ "$TIER" = "medium" ]; then
    # bounded query — one token of answer ideally
    LLM_OUT=$(claude -p --max-output-tokens=20 "Classify blast radius for this coding request as one word: trivial, small, medium, or large.

Request: $REQUEST

Context:
- git branch: ${BRANCH:-none}
- uncommitted changes: $DIRTY files
- recent churn (2d): $CHURN lines

Rules:
- trivial = zero blast radius (typo, formatting)
- small = one file, reversible, clear approach
- medium = multi-file feature with architecture decisions
- large = cross-cutting or multiple deliverables

Answer with only the one word." 2>/dev/null | tr -d '[:space:]' | tr 'A-Z' 'a-z' || echo "")
    case "$LLM_OUT" in
      trivial|small|medium|large)
        if [ "$LLM_OUT" != "$TIER" ]; then
          add_signal "llm:tiebreak-suggested-$LLM_OUT-was-$TIER"
          # only accept adjacent tiers to avoid wild swings
          case "${TIER}_${LLM_OUT}" in
            small_medium|medium_small)
              TIER="$LLM_OUT"
              USED_LLM=true
              ;;
          esac
        fi
        ;;
    esac
  fi
fi

# ---- 8. Confidence score (0..1) — rough ----
N_SIGNALS=$(echo "$SIGNALS" | jq 'length')
CONFIDENCE=0.5
if [ "$N_SIGNALS" -ge 3 ]; then
  CONFIDENCE=0.85
elif [ "$N_SIGNALS" -ge 1 ]; then
  CONFIDENCE=0.65
fi

# ---- output ----
REASON=$(echo "$REQUEST" | head -c 120 | tr -d '\n')
tokens=$(echo "$REQUEST" | wc -w | tr -d ' ')
goals=$(echo "$REQUEST" | grep -oiE '\b(and|then|; |,[[:space:]]+(also|plus)\b)' | wc -l | tr -d ' ')

jq -n \
  --arg tier "$TIER" \
  --argjson tokens "$tokens" \
  --arg branch "$BRANCH" \
  --argjson dirty "$DIRTY" \
  --argjson churn "$CHURN" \
  --argjson goals "$goals" \
  --arg reason "$REASON" \
  --argjson signals "$SIGNALS" \
  --argjson used_llm "$USED_LLM" \
  --argjson confidence "$CONFIDENCE" \
  '{
    tier: $tier,
    tokens: $tokens,
    branch: $branch,
    dirty: $dirty,
    churn_2d: $churn,
    goals: $goals,
    reason: $reason,
    signals_used: $signals,
    used_llm_tiebreak: $used_llm,
    confidence: $confidence
  }'
