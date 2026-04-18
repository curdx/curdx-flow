#!/usr/bin/env bash
# test-reviewer-split.sh — P1a: structural assertions for the two-agent split.
#
# The point of splitting curdx-reviewer into spec-reviewer + quality-reviewer
# is fresh context per stage. If someone later silently re-merges them (or
# commands/review.md stops dispatching both), these tests fail loudly.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
. "$SCRIPT_DIR/lib/assert.sh"

echo "test-reviewer-split.sh"
echo

# ─── Structural: two new files exist, old one is gone ───────────
AGENTS="$PLUGIN_ROOT/agents"

assert_file_absent "$AGENTS/curdx-reviewer.md"       "old curdx-reviewer.md removed"
assert_file_exists "$AGENTS/curdx-spec-reviewer.md"
assert_file_exists "$AGENTS/curdx-quality-reviewer.md"

# ─── Frontmatter contracts ────────────────────────────────────
SPEC_AGENT="$AGENTS/curdx-spec-reviewer.md"
QUAL_AGENT="$AGENTS/curdx-quality-reviewer.md"

assert_regex "$SPEC_AGENT" "^name: curdx-spec-reviewer$"    "spec-reviewer frontmatter name"
assert_regex "$QUAL_AGENT" "^name: curdx-quality-reviewer$" "quality-reviewer frontmatter name"

# ─── Return-contract language: each agent mentions its own status strings ───
assert_contains "$SPEC_AGENT" "SPEC_COMPLIANT"  "spec-reviewer returns SPEC_COMPLIANT"
assert_contains "$SPEC_AGENT" "SPEC_ISSUES"     "spec-reviewer returns SPEC_ISSUES"
assert_contains "$QUAL_AGENT" "QUALITY_APPROVED" "quality-reviewer returns QUALITY_APPROVED"
assert_contains "$QUAL_AGENT" "QUALITY_ISSUES"   "quality-reviewer returns QUALITY_ISSUES"

# ─── Scope discipline: each agent rejects the other's concerns ───
# spec-reviewer must NOT grade quality issues as findings; quality-reviewer must NOT grade spec issues.
assert_contains "$SPEC_AGENT" "Stage 2 concern"          "spec-reviewer escalates (not grades) quality issues"
assert_contains "$QUAL_AGENT" "Stage 1 escalation"       "quality-reviewer escalates (not grades) spec issues"

# ─── commands/review.md wires both ─────────────────────────────
REVIEW_CMD="$PLUGIN_ROOT/commands/review.md"
assert_file_exists "$REVIEW_CMD"
assert_contains "$REVIEW_CMD" "subagent_type: curdx-spec-reviewer"   "review.md dispatches curdx-spec-reviewer"
assert_contains "$REVIEW_CMD" "subagent_type: curdx-quality-reviewer" "review.md dispatches curdx-quality-reviewer"
assert_not_contains "$REVIEW_CMD" "subagent_type: curdx-reviewer"    "review.md does NOT reference old unified agent"
# Ordering: spec dispatch precedes quality dispatch
SPEC_LINE=$(grep -n "subagent_type: curdx-spec-reviewer" "$REVIEW_CMD" | head -1 | cut -d: -f1)
QUAL_LINE=$(grep -n "subagent_type: curdx-quality-reviewer" "$REVIEW_CMD" | head -1 | cut -d: -f1)
assert "Stage 1 (spec) is documented BEFORE Stage 2 (quality) in review.md" \
  [ -n "$SPEC_LINE" ] && [ -n "$QUAL_LINE" ] && [ "$SPEC_LINE" -lt "$QUAL_LINE" ]

# ─── Fresh-context invariant: both agents document the "separate dispatch" principle ───
assert_regex "$SPEC_AGENT" "(fresh|different|separate) (context|subagent|dispatch)" \
  "spec-reviewer documents fresh-context invariant"
assert_regex "$QUAL_AGENT" "(fresh|different|separate) (context|subagent|dispatch)" \
  "quality-reviewer documents fresh-context invariant"

# ─── No OTHER commands/agents/skills/templates still dispatch the deleted agent ─
# CHANGELOG.md mentions it as historical record — exempt. The self-test file
# mentions the name to assert absence — exempt. Everything else must be clean
# (most importantly: no `subagent_type: curdx-reviewer` dispatches).
BROKEN_REFS=$(grep -rln "curdx-reviewer\b" \
    "$PLUGIN_ROOT/commands" \
    "$PLUGIN_ROOT/agents" \
    "$PLUGIN_ROOT/skills" \
    "$PLUGIN_ROOT/rules" \
    "$PLUGIN_ROOT/templates" \
    "$PLUGIN_ROOT/hooks" \
    "$PLUGIN_ROOT/scripts" \
    2>/dev/null \
  | grep -vE "(spec-reviewer|quality-reviewer|CHANGELOG)" \
  || true)
if [ -n "$BROKEN_REFS" ]; then
  echo "  ! stale reference(s) to deleted curdx-reviewer found:" >&2
  echo "$BROKEN_REFS" | sed 's/^/      - /' >&2
fi
assert "no stale references to deleted curdx-reviewer agent" test -z "$BROKEN_REFS"

finish_test "test-reviewer-split.sh"
