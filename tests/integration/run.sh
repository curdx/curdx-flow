#!/usr/bin/env bash
# run.sh — executes every test-*.sh in this directory and reports the tally.
#
# Usage:
#   ./tests/integration/run.sh          — run all tests
#   ./tests/integration/run.sh foo      — run only test-foo.sh (substring match)
#
# Exit codes:
#   0 — all tests passed
#   1 — one or more tests failed
#   2 — no tests found matching filter

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FILTER="${1:-}"

# Collect test files in deterministic order
TESTS=()
for f in "$SCRIPT_DIR"/test-*.sh; do
  [ -f "$f" ] || continue
  if [ -n "$FILTER" ] && ! [[ "$(basename "$f")" == *"$FILTER"* ]]; then
    continue
  fi
  TESTS+=("$f")
done

if [ "${#TESTS[@]}" -eq 0 ]; then
  echo "run.sh: no test files matched filter '$FILTER'" >&2
  exit 2
fi

echo "curdx-flow integration tests"
echo "============================"
echo

PASS=0
FAIL=0
FAILED_NAMES=()

for t in "${TESTS[@]}"; do
  name=$(basename "$t" .sh)
  if bash "$t"; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    FAILED_NAMES+=("$name")
  fi
  echo
done

echo "============================"
printf 'summary: %d/%d tests passed\n' "$PASS" "$((PASS + FAIL))"

if [ "$FAIL" -gt 0 ]; then
  echo
  echo "failures:"
  for n in "${FAILED_NAMES[@]}"; do
    echo "  - $n"
  done
  exit 1
fi

exit 0
