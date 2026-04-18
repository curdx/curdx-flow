#!/usr/bin/env bash
# test-context-monitor.sh — verifies the statusline + context-monitor chain
#
# Confirms:
#   - statusline writes a valid bridge file at /tmp/curdx-ctx-{sid}.json
#   - statusline rejects malicious session IDs
#   - context-monitor stays silent above warning threshold (>35%)
#   - context-monitor emits WARNING at 30%
#   - context-monitor emits CRITICAL at 20%
#   - debounce works (consecutive calls at same level get suppressed)
#   - severity escalation (warning → critical) bypasses debounce
#   - missing bridge file → silent exit (subagent / fresh session)

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
. "$SCRIPT_DIR/lib/assert.sh"

STATUSLINE="$PLUGIN_ROOT/hooks/statusline.sh"
MONITOR="$PLUGIN_ROOT/hooks/context-monitor.sh"

echo "test-context-monitor.sh"
echo

assert_file_exists "$STATUSLINE"
assert_file_exists "$MONITOR"
assert "statusline.sh executable" test -x "$STATUSLINE"
assert "context-monitor.sh executable" test -x "$MONITOR"

# Per-test session id keeps tests hermetic
SID="curdx-test-$$-$(date +%s)"
BRIDGE="${TMPDIR:-/tmp}/curdx-ctx-${SID}.json"
WARN_FILE="${TMPDIR:-/tmp}/curdx-ctx-${SID}-warned.json"
trap 'rm -f "$BRIDGE" "$WARN_FILE"' EXIT

run_statusline() {
  local remaining="$1" used="$2"
  jq -n --arg sid "$SID" --argjson r "$remaining" --argjson u "$used" '{
    session_id: $sid,
    model: {display_name: "Sonnet"},
    workspace: {current_dir: "/tmp"},
    context_window: {remaining_percentage: $r, used_percentage: $u}
  }' | bash "$STATUSLINE" >/dev/null 2>&1
}

run_monitor() {
  jq -n --arg sid "$SID" '{session_id: $sid}' | bash "$MONITOR" 2>/dev/null
}

# ─── Bridge write ──────────────────────────────────────────────────
echo "  [bridge] statusline writes valid JSON bridge"
run_statusline 80 20
assert_file_exists "$BRIDGE"
if [ -f "$BRIDGE" ]; then
  assert "bridge is valid JSON" jq empty "$BRIDGE"
  ACTUAL_REM=$(jq -r '.remaining_percentage' "$BRIDGE")
  assert "bridge has remaining_percentage=80" test "$ACTUAL_REM" = "80"
fi

# ─── Path traversal rejection ──────────────────────────────────────
echo "  [security] statusline rejects path-traversal session_id"
EVIL_SID="../../etc/passwd"
EVIL_BRIDGE="${TMPDIR:-/tmp}/curdx-ctx-${EVIL_SID}.json"
jq -n --arg sid "$EVIL_SID" --argjson r 80 --argjson u 20 '{
  session_id: $sid,
  context_window: {remaining_percentage: $r, used_percentage: $u}
}' | bash "$STATUSLINE" >/dev/null 2>&1
assert_file_absent "$EVIL_BRIDGE" "no bridge written for path-traversal session_id"

# ─── Above threshold → silent ──────────────────────────────────────
echo "  [silent] monitor stays silent above 35%"
rm -f "$WARN_FILE"
run_statusline 80 20
OUT=$(run_monitor)
assert "monitor at 80%: empty output" test -z "$OUT"

# ─── Warning level ─────────────────────────────────────────────────
echo "  [warning] monitor fires at 30%"
rm -f "$WARN_FILE"
run_statusline 30 70
OUT=$(run_monitor)
assert "monitor at 30%: outputs JSON" test -n "$OUT"
LEVEL=$(echo "$OUT" | jq -r '.hookSpecificOutput.additionalContext // empty' | grep -oE 'WARNING|CRITICAL' | head -1)
assert "monitor at 30%: level=WARNING" test "$LEVEL" = "WARNING"

# ─── Debounce: same level, immediate re-call → silent ──────────────
echo "  [debounce] same-level repeat suppressed"
OUT=$(run_monitor)
assert "monitor at 30% repeat: empty (debounced)" test -z "$OUT"

# ─── Severity escalation bypasses debounce ─────────────────────────
echo "  [escalate] warning→critical bypasses debounce"
run_statusline 20 80
OUT=$(run_monitor)
LEVEL=$(echo "$OUT" | jq -r '.hookSpecificOutput.additionalContext // empty' | grep -oE 'WARNING|CRITICAL' | head -1)
assert "monitor at 20% (after WARNING): level=CRITICAL despite debounce" test "$LEVEL" = "CRITICAL"

# ─── Missing bridge (subagent) → silent ───────────────────────────
echo "  [silent] missing bridge → silent exit"
rm -f "$BRIDGE" "$WARN_FILE"
OUT=$(run_monitor)
assert "monitor with no bridge: empty output" test -z "$OUT"

# ─── Stale bridge → silent ─────────────────────────────────────────
echo "  [stale] stale bridge (>60s) → silent"
jq -n --arg sid "$SID" '{session_id:$sid, remaining_percentage:30, used_pct:70, timestamp:0}' \
  > "$BRIDGE"
OUT=$(run_monitor)
assert "monitor with stale bridge (ts=0): empty output" test -z "$OUT"

# ─── Missing jq guard (skip — would require uninstalling jq) ──────
# Documented behavior: hooks exit silently if jq missing. Cannot test
# hermetically without disrupting host system.

# ─── No statusline registered: hook must not error ────────────────
echo "  [graceful] without statusline running, monitor exits 0"
rm -f "$BRIDGE" "$WARN_FILE"
jq -n --arg sid "$SID" '{session_id: $sid}' | bash "$MONITOR" >/dev/null 2>&1
assert "monitor exit code 0 with no bridge" test $? -eq 0

finish_test "test-context-monitor.sh"
