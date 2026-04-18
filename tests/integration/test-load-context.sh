#!/usr/bin/env bash
# test-load-context.sh — integration tests for hooks/load-context.sh
#
# Covers the 4 injection paths introduced by P0 (auto-dispatch) + the
# pre-existing update-check and global-protocols layers. These tests are
# the "production canary" for SessionStart hook output — regressions here
# silently break every session so we want loud failures.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$PLUGIN_ROOT/hooks/load-context.sh"
. "$SCRIPT_DIR/lib/assert.sh"

echo "test-load-context.sh"
echo "  plugin root: $PLUGIN_ROOT"
echo

# Isolated sandbox for every assertion so tests don't interfere
SANDBOX=$(mktemp -d)
STATE_DIR="$SANDBOX/state"
mkdir -p "$STATE_DIR"
trap 'rm -rf "$SANDBOX"' EXIT

run_hook() {
  # run_hook <cwd> — emits JSON on stdout or empty on silent-exit paths
  local cwd="$1"
  echo "{\"cwd\":\"$cwd\",\"session_id\":\"test\",\"matcher\":\"startup\"}" \
    | CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" \
      CURDX_STATE_DIR="$STATE_DIR" \
      HOME="$SANDBOX" \
      bash "$HOOK" 2>/dev/null || true
}

# ─── Scenario 1: inside curdx-initialized project ──────────────────────
echo "scenario 1: inside curdx project"
PROJ="$SANDBOX/myproj"
mkdir -p "$PROJ/.curdx"
echo '{"phase":"init-complete","active_feature":null,"task_index":0,"total_tasks":0}' \
  > "$PROJ/.curdx/state.json"
echo '{"project_name":"myproj","stack":{"backend":{"language":"node"},"frontend":{"framework":"none"}},"browser_testing":{"mode":"none"}}' \
  > "$PROJ/.curdx/config.json"

OUT_INSIDE=$(run_hook "$PROJ")
CTX_INSIDE=$(echo "$OUT_INSIDE" | jq -r '.hookSpecificOutput.additionalContext // empty')

assert "hook emitted JSON envelope" test -n "$OUT_INSIDE"
assert "additionalContext is non-empty"    test -n "$CTX_INSIDE"
if [ -n "$CTX_INSIDE" ]; then
  echo "$CTX_INSIDE" > "$SANDBOX/ctx1.txt"
  assert_contains "$SANDBOX/ctx1.txt" "<EXTREMELY-IMPORTANT>" "<EXTREMELY-IMPORTANT> wrapper present"
  assert_contains "$SANDBOX/ctx1.txt" "curdx-using-skills"    "using-skills meta-skill loaded"
  assert_contains "$SANDBOX/ctx1.txt" "# Global Protocols"     "global protocols present"
  assert_contains "$SANDBOX/ctx1.txt" "curdx-flow session context" "project context block present"
  # Ordering: using-skills block MUST come before global protocols
  # (so it shapes every response, not just those far past context-window top).
  SKILL_LINE=$(grep -n "<EXTREMELY-IMPORTANT>" "$SANDBOX/ctx1.txt" | head -1 | cut -d: -f1)
  PROTO_LINE=$(grep -n "# Global Protocols"   "$SANDBOX/ctx1.txt" | head -1 | cut -d: -f1)
  assert "using-skills block appears BEFORE global protocols" \
    [ -n "$SKILL_LINE" ] && [ -n "$PROTO_LINE" ] && [ "$SKILL_LINE" -lt "$PROTO_LINE" ]
fi

echo

# ─── Scenario 2: outside any curdx project ─────────────────────────────
echo "scenario 2: non-curdx cwd"
NON_CURDX="$SANDBOX/elsewhere"
mkdir -p "$NON_CURDX"

OUT_OUTSIDE=$(run_hook "$NON_CURDX")
CTX_OUTSIDE=$(echo "$OUT_OUTSIDE" | jq -r '.hookSpecificOutput.additionalContext // empty')

if [ -n "$CTX_OUTSIDE" ]; then
  echo "$CTX_OUTSIDE" > "$SANDBOX/ctx2.txt"
  assert_not_contains "$SANDBOX/ctx2.txt" "<EXTREMELY-IMPORTANT>" "using-skills NOT injected outside curdx"
  assert_not_contains "$SANDBOX/ctx2.txt" "curdx-flow session context" "project context NOT injected"
  # Global Protocols SHOULD still be there — they're unconditional by design
  assert_contains     "$SANDBOX/ctx2.txt" "# Global Protocols" "global protocols STILL present (unconditional)"
fi

echo

# ─── Scenario 3: opt-out via ~/.curdx/no-auto-dispatch ─────────────────
echo "scenario 3: opt-out marker suppresses using-skills"
mkdir -p "$SANDBOX/.curdx"
touch "$SANDBOX/.curdx/no-auto-dispatch"

OUT_OPTOUT=$(run_hook "$PROJ")
CTX_OPTOUT=$(echo "$OUT_OPTOUT" | jq -r '.hookSpecificOutput.additionalContext // empty')

if [ -n "$CTX_OPTOUT" ]; then
  echo "$CTX_OPTOUT" > "$SANDBOX/ctx3.txt"
  assert_not_contains "$SANDBOX/ctx3.txt" "<EXTREMELY-IMPORTANT>" "using-skills suppressed by opt-out"
  assert_contains     "$SANDBOX/ctx3.txt" "# Global Protocols" "global protocols still fire (independent opt-out)"
  assert_contains     "$SANDBOX/ctx3.txt" "curdx-flow session context" "project context still present"
fi
rm -f "$SANDBOX/.curdx/no-auto-dispatch"

echo

# ─── Scenario 4: upgrade-cached → notice injected at the top ───────────
echo "scenario 4: upgrade-available notice composes with using-skills"
echo "UPGRADE_AVAILABLE 0.1.0 9.9.9" > "$STATE_DIR/.last-update-check"

OUT_UPG=$(run_hook "$PROJ")
CTX_UPG=$(echo "$OUT_UPG" | jq -r '.hookSpecificOutput.additionalContext // empty')

if [ -n "$CTX_UPG" ]; then
  echo "$CTX_UPG" > "$SANDBOX/ctx4.txt"
  assert_contains "$SANDBOX/ctx4.txt" "curdx-flow 9.9.9 available" "upgrade notice present"
  assert_contains "$SANDBOX/ctx4.txt" "<EXTREMELY-IMPORTANT>" "using-skills still present alongside notice"
  UPG_LINE=$(grep -n "9.9.9 available" "$SANDBOX/ctx4.txt" | head -1 | cut -d: -f1)
  SKILL_LINE=$(grep -n "<EXTREMELY-IMPORTANT>" "$SANDBOX/ctx4.txt" | head -1 | cut -d: -f1)
  assert "upgrade notice appears BEFORE using-skills block" \
    [ "$UPG_LINE" -lt "$SKILL_LINE" ]
fi
rm -f "$STATE_DIR/.last-update-check"

echo

# ─── Scenario 5: hook is syntactically clean ───────────────────────────
echo "scenario 5: static checks"
assert_exit 0 bash -n "$HOOK"
assert_exit 0 bash -n "$PLUGIN_ROOT/scripts/update-check.sh"
assert_exit 0 bash -n "$PLUGIN_ROOT/hooks/enforce-constitution.sh"

finish_test "test-load-context.sh"
