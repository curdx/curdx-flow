#!/usr/bin/env bash
# find-polluter.sh — binary-search for a test that pollutes shared state
#
# When test X fails only if it runs after tests A, B, C, ... (but passes in
# isolation), one of the preceding tests is leaving state that X depends on.
# This script bisects the ordered test list to find which one.
#
# Pattern borrowed from superpowers' skills/systematic-debugging/find-polluter.sh.
#
# Usage:
#   ./find-polluter.sh <test-runner-command> <test-that-fails>
#
# Example:
#   ./find-polluter.sh "npm test --" "tests/user-service.test.ts::user creation"
#
# Requires: bash, jq, the test runner must support running a file at a time
# and ordered execution.

set -eu

if [ $# -lt 2 ]; then
  echo "usage: $0 <test-runner-command> <test-identifier>" >&2
  echo "example: $0 'npm test --' 'tests/user.test.ts::creates user'" >&2
  exit 2
fi

RUNNER="$1"
FAILING_TEST="$2"

# ---- step 1: collect the ordered list of all test files ----

# adapter per runner — detect by command substring
case "$RUNNER" in
  *vitest*|*"npm test"*|*"npx jest"*|*jest*)
    # jest / vitest — list all *.test.* files
    FILES=$(find . \( -path ./node_modules -prune -o -path ./dist -prune -o -path ./build -prune \) -o \
            -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.test.js' -o \
            -name '*.spec.ts' -o -name '*.spec.tsx' -o -name '*.spec.js' -print | sort)
    ;;
  *pytest*)
    FILES=$(find . \( -path ./node_modules -prune -o -path '*/.venv/*' -prune \) -o \
            -name 'test_*.py' -o -name '*_test.py' -print | sort)
    ;;
  *go*)
    FILES=$(find . -name '*_test.go' | sort)
    ;;
  *cargo*)
    echo "cargo test: isolate tests via #[test] attribute ordering; this helper doesn't apply directly. Try:" >&2
    echo "  cargo test -- --test-threads=1 <name>" >&2
    exit 2
    ;;
  *)
    echo "unknown runner: $RUNNER — this helper supports jest/vitest/pytest/go test." >&2
    exit 2
    ;;
esac

N=$(echo "$FILES" | grep -c . || echo 0)
if [ "$N" -lt 2 ]; then
  echo "only $N test files found — nothing to bisect." >&2
  exit 2
fi

echo "[find-polluter] $N test files found. Binary-searching for polluter of: $FAILING_TEST"

# ---- step 2: verify baseline — failing test passes alone, fails with ALL prior tests ----

runs_pass() {
  local file_list="$1"  # newline-separated files
  local log
  log=$(mktemp)
  # shellcheck disable=SC2086
  eval "$RUNNER" $(echo "$file_list" | tr '\n' ' ') >"$log" 2>&1
  local rc=$?
  if [ $rc -eq 0 ]; then
    rm "$log"
    return 0
  fi
  # did the specific failing test fail? (heuristic — failing test name in output)
  if grep -q "$FAILING_TEST" "$log"; then
    rm "$log"
    return 1
  fi
  # something else failed
  rm "$log"
  echo "[find-polluter] unrelated failure during bisection — can't proceed cleanly" >&2
  return 2
}

# find the failing test's own file
TARGET_FILE=$(echo "$FILES" | while read f; do
  if grep -q "$(echo "$FAILING_TEST" | sed 's|.*::||')" "$f" 2>/dev/null; then
    echo "$f"
    break
  fi
done)
if [ -z "$TARGET_FILE" ]; then
  echo "[find-polluter] could not locate the failing test in any file — provide a more specific identifier" >&2
  exit 2
fi

# baseline: run TARGET alone → should pass
echo "[find-polluter] baseline: running $TARGET_FILE alone..."
if ! runs_pass "$TARGET_FILE"; then
  echo "[find-polluter] target fails even in isolation — not a polluter problem, it's a real bug." >&2
  exit 0
fi

# baseline: run ALL prior + TARGET → should fail
PRIOR=$(echo "$FILES" | grep -v "^$TARGET_FILE$")
echo "[find-polluter] baseline: running all $N files including target..."
if runs_pass "$(printf '%s\n%s\n' "$PRIOR" "$TARGET_FILE")"; then
  echo "[find-polluter] target passes when all run together — not reproducible; exiting." >&2
  exit 0
fi

# ---- step 3: bisect ----

# prior files are candidates; split in half, test which half contains the polluter

bisect() {
  local candidates="$1"
  local count
  count=$(echo "$candidates" | wc -l)
  if [ "$count" -le 1 ]; then
    echo "$candidates"
    return
  fi
  local mid=$((count / 2))
  local first_half second_half
  first_half=$(echo "$candidates" | head -n "$mid")
  second_half=$(echo "$candidates" | tail -n "+$((mid + 1))")

  # does second_half alone + target fail? (try it first — often smaller subset)
  if ! runs_pass "$(printf '%s\n%s\n' "$second_half" "$TARGET_FILE")"; then
    echo "[find-polluter] polluter in second half ($((count - mid)) files)" >&2
    bisect "$second_half"
  elif ! runs_pass "$(printf '%s\n%s\n' "$first_half" "$TARGET_FILE")"; then
    echo "[find-polluter] polluter in first half ($mid files)" >&2
    bisect "$first_half"
  else
    # neither half alone pollutes → interaction between halves
    echo "[find-polluter] polluter is an INTERACTION — multiple tests collectively pollute" >&2
    echo "$candidates"
  fi
}

RESULT=$(bisect "$PRIOR")

echo ""
echo "[find-polluter] polluter(s) isolated to:"
echo "$RESULT"
echo ""
echo "next: open each file and look for:"
echo "  - global state mutations (window.*, process.env.*, module-level variables)"
echo "  - unclosed resources (files, DB connections, timers, intervals)"
echo "  - missing afterEach / afterAll teardown hooks"
echo "  - shared fixtures without reset"
