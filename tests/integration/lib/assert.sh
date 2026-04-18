#!/usr/bin/env bash
# Minimal assertion helpers for integration tests.
# Source this in every test-*.sh. No external deps beyond coreutils + jq.
#
# Contract:
#   - Each assert_* function prints a ✓ line on success, a ✗ line on failure.
#   - On any failure, the containing test script is set up to exit 1 via
#     FAIL_COUNT increment + `set -e` would bypass our counter, so we use
#     `|| true` in loops and check FAIL_COUNT at the end.
#   - Tests must call `finish_test` as their last line so the runner reads
#     an exit code reflecting cumulative pass/fail.

FAIL_COUNT=0
PASS_COUNT=0

assert() {
  # assert <condition-description> <bash-test-expr>
  local desc="$1"; shift
  if "$@"; then
    PASS_COUNT=$((PASS_COUNT + 1))
    printf '  ✓ %s\n' "$desc"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf '  ✗ %s\n' "$desc" >&2
  fi
}

assert_file_exists() {
  local path="$1"
  local desc="${2:-file exists: $path}"
  if [ -f "$path" ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
    printf '  ✓ %s\n' "$desc"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf '  ✗ %s (path: %s)\n' "$desc" "$path" >&2
  fi
}

assert_file_absent() {
  local path="$1"
  local desc="${2:-file absent: $path}"
  if [ ! -e "$path" ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
    printf '  ✓ %s\n' "$desc"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf '  ✗ %s (path exists: %s)\n' "$desc" "$path" >&2
  fi
}

assert_contains() {
  local path="$1" needle="$2"
  local desc="${3:-$(basename "$path") contains: $needle}"
  if [ -f "$path" ] && grep -qF -- "$needle" "$path"; then
    PASS_COUNT=$((PASS_COUNT + 1))
    printf '  ✓ %s\n' "$desc"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf '  ✗ %s\n' "$desc" >&2
  fi
}

assert_not_contains() {
  local path="$1" needle="$2"
  local desc="${3:-$(basename "$path") does NOT contain: $needle}"
  if [ -f "$path" ] && ! grep -qF -- "$needle" "$path"; then
    PASS_COUNT=$((PASS_COUNT + 1))
    printf '  ✓ %s\n' "$desc"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf '  ✗ %s\n' "$desc" >&2
  fi
}

assert_regex() {
  local path="$1" pattern="$2"
  local desc="${3:-$(basename "$path") matches: $pattern}"
  if [ -f "$path" ] && grep -qE -- "$pattern" "$path"; then
    PASS_COUNT=$((PASS_COUNT + 1))
    printf '  ✓ %s\n' "$desc"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf '  ✗ %s\n' "$desc" >&2
  fi
}

assert_count() {
  # assert_count <actual> <expected> <description>
  local actual="$1" expected="$2" desc="$3"
  if [ "$actual" = "$expected" ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
    printf '  ✓ %s (count=%s)\n' "$desc" "$actual"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf '  ✗ %s (expected=%s, got=%s)\n' "$desc" "$expected" "$actual" >&2
  fi
}

assert_exit() {
  # assert_exit <expected-code> <command...>
  local expected="$1"; shift
  local desc_cmd="$*"
  local actual
  "$@" >/dev/null 2>&1
  actual=$?
  if [ "$actual" = "$expected" ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
    printf '  ✓ `%s` exits %s\n' "$desc_cmd" "$expected"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf '  ✗ `%s` expected exit %s, got %s\n' "$desc_cmd" "$expected" "$actual" >&2
  fi
}

finish_test() {
  local name="${1:-$(basename "$0")}"
  printf '\n  %s: %d passed, %d failed\n' "$name" "$PASS_COUNT" "$FAIL_COUNT"
  [ "$FAIL_COUNT" -eq 0 ] || exit 1
  exit 0
}
