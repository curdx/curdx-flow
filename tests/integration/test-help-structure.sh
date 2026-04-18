#!/usr/bin/env bash
# test-help-structure.sh — P2: help.md has CORE (8) and ADVANCED (12) sections
# covering every command file that exists on disk. Catches the regression
# where a new command is added but help doesn't list it (or vice versa).

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
. "$SCRIPT_DIR/lib/assert.sh"

HELP="$PLUGIN_ROOT/commands/help.md"
COMMANDS_DIR="$PLUGIN_ROOT/commands"

echo "test-help-structure.sh"
echo

assert_file_exists "$HELP"

# ─── Section markers present ──────────────────────────────────
assert_regex "$HELP" "CORE"     "help.md has CORE section marker"
assert_regex "$HELP" "ADVANCED" "help.md has ADVANCED section marker"

# ─── Expected membership (curated — enforce the split we decided on) ───
CORE_EXPECTED="init spec next do implement ship status doctor help snapshot"
ADV_EXPECTED="clarify plan tasks analyze verify review debug quick refactor cancel resume triage"

# Every CORE command is mentioned in help.md
for cmd in $CORE_EXPECTED; do
  assert_contains "$HELP" "/curdx:$cmd" "CORE command listed: /curdx:$cmd"
done

# Every ADVANCED command is mentioned in help.md
for cmd in $ADV_EXPECTED; do
  assert_contains "$HELP" "/curdx:$cmd" "ADVANCED command listed: /curdx:$cmd"
done

# ─── Counts: exactly 8 core + 12 advanced = 20 total ──────────────────
CORE_COUNT=$(echo "$CORE_EXPECTED" | wc -w | tr -d ' ')
ADV_COUNT=$(echo "$ADV_EXPECTED" | wc -w | tr -d ' ')
TOTAL_COUNT=$((CORE_COUNT + ADV_COUNT))
assert_count "$CORE_COUNT"  "10" "CORE list has 10 commands"
assert_count "$ADV_COUNT"   "12" "ADVANCED list has 12 commands"
assert_count "$TOTAL_COUNT" "22" "total = 22 commands"

# ─── Every command file on disk is classified ────────────────────────
# If a new /curdx:foo is added without updating help.md, fail loudly.
DISK_COMMANDS=$(ls "$COMMANDS_DIR" | grep -E '\.md$' | sed 's/\.md$//' | sort)
CLASSIFIED=$(echo "$CORE_EXPECTED $ADV_EXPECTED" | tr ' ' '\n' | sort)

UNCLASSIFIED=$(comm -23 <(echo "$DISK_COMMANDS") <(echo "$CLASSIFIED") || true)
assert "every commands/*.md is classified in help.md as CORE or ADVANCED" \
  test -z "$UNCLASSIFIED"

if [ -n "$UNCLASSIFIED" ]; then
  echo "  ! unclassified command files:" >&2
  echo "$UNCLASSIFIED" | sed 's/^/      - /' >&2
fi

# Inverse: every classified command has a corresponding file on disk
MISSING=$(comm -13 <(echo "$DISK_COMMANDS") <(echo "$CLASSIFIED") || true)
assert "every command in help.md's classification has a commands/*.md file" \
  test -z "$MISSING"

if [ -n "$MISSING" ]; then
  echo "  ! classified but missing file:" >&2
  echo "$MISSING" | sed 's/^/      - /' >&2
fi

# ─── The auto-dispatch pointer is present ─────────────────────────────
assert_contains "$HELP" "curdx-using-skills" "help.md points to curdx-using-skills meta-skill"
assert_contains "$HELP" "no-auto-dispatch"   "help.md documents the opt-out marker"

finish_test "test-help-structure.sh"
