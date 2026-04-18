#!/usr/bin/env bash
# test-verify-runnable.sh — coverage for scripts/verify-runnable.sh
#
# Each scenario builds a hermetic project in mktemp -d, runs the harness,
# and asserts on the JSON output + exit code. Scenarios cover the three
# primary stacks (node, go, python) across clean/fail states, and all
# three preflight outcomes (blocker-fail, advisory-fail, empty).
#
# Skipped gracefully if a required toolchain is missing — the test prints
# a SKIP note rather than failing.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
. "$SCRIPT_DIR/lib/assert.sh"

HARNESS="$PLUGIN_ROOT/scripts/verify-runnable.sh"

echo "test-verify-runnable.sh"
echo

assert_file_exists "$HARNESS"
assert "$(basename "$HARNESS") is executable" test -x "$HARNESS"

# One tmp root for the whole test, cleaned up at the end.
TMPROOT=$(mktemp -d)
trap 'rm -rf "$TMPROOT"' EXIT
HARNESS_EXIT=0

# run_harness populates two files:
#   $TMPROOT/out.json   — harness stdout (JSON)
#   $TMPROOT/out.exit   — harness exit code
# We avoid the "subshell eats HARNESS_EXIT" trap by writing to disk and
# reading back. The test then uses $JSON and $HARNESS_EXIT from disk.
run_harness() {
  local dir="$1"; shift
  ( cd "$dir" && bash "$HARNESS" --quiet "$@" 2>/dev/null ) > "$TMPROOT/out.json"
  echo $? > "$TMPROOT/out.exit"
  JSON=$(cat "$TMPROOT/out.json")
  HARNESS_EXIT=$(cat "$TMPROOT/out.exit")
}

# jq_get <json> <jq-expr>
jq_get() {
  echo "$1" | jq -r "$2"
}

# ─── Scenario 1: node clean → all gates pass or skip ──────────────────
echo "  [scenario 1] node clean project"
S1="$TMPROOT/s1-node-clean"
mkdir -p "$S1"
cat > "$S1/package.json" <<'EOF'
{"name":"s1","version":"0.0.0","scripts":{"typecheck":"true"}}
EOF
(cd "$S1" && npm install --package-lock-only --silent --no-audit --no-fund >/dev/null 2>&1)
run_harness "$S1"
assert "s1: exit 0" test "$HARNESS_EXIT" = "0"
assert "s1: status=pass" test "$(jq_get "$JSON" '.status')" = "pass"
assert "s1: gate A pass" test "$(jq_get "$JSON" '.gates.A.status')" = "pass"
assert "s1: gate B pass" test "$(jq_get "$JSON" '.gates.B.status')" = "pass"

# ─── Scenario 2: node lockfile drift → gate A fail ───────────────────
echo "  [scenario 2] node lockfile drift"
S2="$TMPROOT/s2-node-drift"
cp -r "$S1" "$S2"
# Edit package.json so it references a dep not in the lockfile
cat > "$S2/package.json" <<'EOF'
{"name":"s2","version":"0.0.0","scripts":{"typecheck":"true"},"dependencies":{"chalk":"^5.3.0"}}
EOF
run_harness "$S2"
assert "s2: exit 1" test "$HARNESS_EXIT" = "1"
assert "s2: gate A fail" test "$(jq_get "$JSON" '.gates.A.status')" = "fail"
assert "s2: failures[] mentions gate A" test "$(jq_get "$JSON" '.failures | map(select(.gate=="A")) | length')" -gt 0

# ─── Scenario 3: node typecheck fail → gate B fail ───────────────────
echo "  [scenario 3] node typecheck fail"
S3="$TMPROOT/s3-node-typeerr"
mkdir -p "$S3"
cat > "$S3/package.json" <<'EOF'
{"name":"s3","version":"0.0.0","scripts":{"typecheck":"exit 1"}}
EOF
(cd "$S3" && npm install --package-lock-only --silent --no-audit --no-fund >/dev/null 2>&1)
run_harness "$S3"
assert "s3: exit 1" test "$HARNESS_EXIT" = "1"
assert "s3: gate A pass" test "$(jq_get "$JSON" '.gates.A.status')" = "pass"
assert "s3: gate B fail" test "$(jq_get "$JSON" '.gates.B.status')" = "fail"

# ─── Scenario 4: go clean → all gates pass ───────────────────────────
echo "  [scenario 4] go clean project"
if ! command -v go >/dev/null 2>&1; then
  echo "    SKIP: go not on PATH"
else
  S4="$TMPROOT/s4-go-clean"
  mkdir -p "$S4"
  (cd "$S4" && go mod init example.com/s4 >/dev/null 2>&1)
  cat > "$S4/main.go" <<'EOF'
package main
func main() {}
EOF
  run_harness "$S4"
  assert "s4: exit 0" test "$HARNESS_EXIT" = "0"
  assert "s4: gate A pass" test "$(jq_get "$JSON" '.gates.A.status')" = "pass"
  assert "s4: gate B pass" test "$(jq_get "$JSON" '.gates.B.status')" = "pass"
fi

# ─── Scenario 5: go build error → gate B fail ────────────────────────
echo "  [scenario 5] go build error"
if ! command -v go >/dev/null 2>&1; then
  echo "    SKIP: go not on PATH"
else
  S5="$TMPROOT/s5-go-builderr"
  mkdir -p "$S5"
  (cd "$S5" && go mod init example.com/s5 >/dev/null 2>&1)
  # intentional syntax error
  cat > "$S5/main.go" <<'EOF'
package main
func main() { this is not go }
EOF
  run_harness "$S5"
  assert "s5: exit 1" test "$HARNESS_EXIT" = "1"
  assert "s5: gate B fail" test "$(jq_get "$JSON" '.gates.B.status')" = "fail"
fi

# ─── Scenario 6: python syntax error → gate B fail ───────────────────
echo "  [scenario 6] python syntax error"
if ! command -v python3 >/dev/null 2>&1; then
  echo "    SKIP: python3 not on PATH"
else
  S6="$TMPROOT/s6-python-syntaxerr"
  mkdir -p "$S6"
  # detect-stack only returns "python" if one of these markers is present
  touch "$S6/requirements.txt"
  cat > "$S6/broken.py" <<'EOF'
def x(:
    pass
EOF
  run_harness "$S6"
  assert "s6: backend=python" test "$(jq_get "$JSON" '.stack.backend')" = "python"
  assert "s6: gate B fail" test "$(jq_get "$JSON" '.gates.B.status')" = "fail"
  assert "s6: exit 1" test "$HARNESS_EXIT" = "1"
fi

# ─── Scenario 7: findings blocker fail → gate D fail, exit 1 ─────────
echo "  [scenario 7] findings blocker preflight fails"
S7="$TMPROOT/s7-findings-blocker"
mkdir -p "$S7/.curdx/features/001-t"
cat > "$S7/.curdx/state.json" <<'EOF'
{"schema_version":1,"phase":"verify","active_feature":"001-t"}
EOF
cat > "$S7/.curdx/features/001-t/findings.json" <<'EOF'
{
  "schema_version": 1,
  "feature_id": "001-t",
  "generated_at": "2026-04-18T00:00:00Z",
  "findings": [
    {
      "id": "F1",
      "kind": "env",
      "subject": "NEVER_SET_ENV",
      "assertion": "env var must be set",
      "severity": "blocker",
      "preflight_cmd": "[ -n \"${NEVER_SET_ENV:-}\" ]"
    }
  ]
}
EOF
run_harness "$S7" --preflight-only
assert "s7: exit 1" test "$HARNESS_EXIT" = "1"
assert "s7: gate D fail" test "$(jq_get "$JSON" '.gates.D.status')" = "fail"
assert "s7: F1 in failures" test "$(jq_get "$JSON" '.failures | map(select(.message | contains("F1"))) | length')" -gt 0

# ─── Scenario 8: advisory preflight fail → gate D pass, warning only ─
echo "  [scenario 8] findings advisory preflight fails"
S8="$TMPROOT/s8-findings-advisory"
mkdir -p "$S8/.curdx/features/001-t"
cat > "$S8/.curdx/state.json" <<'EOF'
{"schema_version":1,"phase":"verify","active_feature":"001-t"}
EOF
cat > "$S8/.curdx/features/001-t/findings.json" <<'EOF'
{
  "schema_version": 1,
  "feature_id": "001-t",
  "generated_at": "2026-04-18T00:00:00Z",
  "findings": [
    {
      "id": "F1",
      "kind": "api",
      "subject": "some-deprecated-api",
      "assertion": "api version is current",
      "severity": "advisory",
      "source": "https://example.com/changelog",
      "preflight_cmd": "false"
    }
  ]
}
EOF
run_harness "$S8" --preflight-only
assert "s8: exit 0 (advisory never blocks)" test "$HARNESS_EXIT" = "0"
assert "s8: status=pass" test "$(jq_get "$JSON" '.status')" = "pass"
assert "s8: gate D pass" test "$(jq_get "$JSON" '.gates.D.status')" = "pass"
assert "s8: F1 in warnings" test "$(jq_get "$JSON" '.warnings | map(select(.message | contains("F1"))) | length')" -gt 0

# ─── Scenario 9: empty findings array → gate D pass ──────────────────
echo "  [scenario 9] findings empty array"
S9="$TMPROOT/s9-findings-empty"
mkdir -p "$S9/.curdx/features/001-t"
cat > "$S9/.curdx/state.json" <<'EOF'
{"schema_version":1,"phase":"verify","active_feature":"001-t"}
EOF
cat > "$S9/.curdx/features/001-t/findings.json" <<'EOF'
{"schema_version":1,"feature_id":"001-t","generated_at":"2026-04-18T00:00:00Z","findings":[]}
EOF
run_harness "$S9" --preflight-only
assert "s9: exit 0" test "$HARNESS_EXIT" = "0"
assert "s9: gate D pass" test "$(jq_get "$JSON" '.gates.D.status')" = "pass"

# ─── Flag sanity: --skip-preflight suppresses gate D ─────────────────
echo "  [flag] --skip-preflight"
run_harness "$S7" --skip-preflight
# S7 has a blocker; with skip-preflight, gate D must be skip and status pass (if A/B/C allow)
assert "skip-preflight: gate D skip" test "$(jq_get "$JSON" '.gates.D.status')" = "skip"

# ─── Flag sanity: --preflight-only + --skip-preflight → invocation error ─
echo "  [flag] mutually exclusive flags reject"
if (cd "$S9" && bash "$HARNESS" --preflight-only --skip-preflight >/dev/null 2>&1); then
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo "  ✗ --preflight-only + --skip-preflight should exit non-zero" >&2
else
  PASS_COUNT=$((PASS_COUNT + 1))
  echo "  ✓ --preflight-only + --skip-preflight exits non-zero"
fi

finish_test "test-verify-runnable.sh"
