#!/usr/bin/env bash
# Generate (or re-validate) baseline outputs for v6 hook scripts.
#
# Usage:
#   tests/hooks/baselines/generate.sh                  # use checked-out v6.0.6 worktree at /tmp/v6
#   HOOKS_ROOT=/path/to/hooks/scripts ... generate.sh  # point at any v6-compatible hook tree
#
# Outputs into tests/hooks/baselines/v6.0.6/<hook>/<fixture>.txt (combined stdout+stderr).
# For update-spec-index, also captures the generated index files alongside.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
FIXTURES_DIR="$REPO_ROOT/tests/hooks/fixtures"
BASELINES_DIR="${BASELINES_DIR:-$REPO_ROOT/tests/hooks/baselines/v6.0.6}"
HOOKS_ROOT="${HOOKS_ROOT:-/tmp/v6/plugins/curdx-flow/hooks/scripts}"

if [ ! -d "$HOOKS_ROOT" ]; then
    echo "ERROR: HOOKS_ROOT not found: $HOOKS_ROOT" >&2
    echo "  Hint: git worktree add /tmp/v6 v6.0.6" >&2
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    echo "ERROR: jq is required (brew install jq)" >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Provision frozen fixture workspaces
# ---------------------------------------------------------------------------

provision_workspaces() {
    rm -rf /tmp/curdx-fixture-empty \
           /tmp/curdx-fixture-spec \
           /tmp/curdx-fixture-quick \
           /tmp/curdx-fixture-corrupt \
           /tmp/curdx-fixture-completed \
           /tmp/curdx-fixture-transcripts

    mkdir -p /tmp/curdx-fixture-empty
    mkdir -p /tmp/curdx-fixture-transcripts
    echo "Just some random log text" > /tmp/curdx-fixture-transcripts/empty.txt
    printf 'line one\nline two\nline three\nALL_TASKS_COMPLETE\n' \
        > /tmp/curdx-fixture-transcripts/complete.txt

    # Spec mid-execution
    mkdir -p /tmp/curdx-fixture-spec/specs/demo-spec
    echo "demo-spec" > /tmp/curdx-fixture-spec/specs/.current-spec
    cat > /tmp/curdx-fixture-spec/specs/demo-spec/.curdx-state.json <<'JSON'
{
  "source": "spec",
  "name": "demo-spec",
  "basePath": "./specs/demo-spec",
  "phase": "execution",
  "taskIndex": 1,
  "totalTasks": 3,
  "taskIteration": 1,
  "maxTaskIterations": 5,
  "globalIteration": 5,
  "maxGlobalIterations": 100,
  "commitSpec": true,
  "quickMode": false,
  "awaitingApproval": false,
  "recoveryMode": false,
  "nativeSyncEnabled": false,
  "granularity": "fine"
}
JSON
    cat > /tmp/curdx-fixture-spec/specs/demo-spec/tasks.md <<'MD'
# Demo Tasks

- [x] 1.1 First task
  - **Do**: Step one
  - **Files**: src/a.ts
  - **Done when**: a.ts exists
  - **Verify**: `test -f src/a.ts`
  - **Commit**: `feat(a): add a`

- [ ] 1.2 Second task
  - **Do**: Step two
  - **Files**: src/b.ts
  - **Done when**: b.ts exists
  - **Verify**: `test -f src/b.ts`
  - **Commit**: `feat(b): add b`

- [ ] 1.3 Third task
  - **Do**: Step three
  - **Files**: src/c.ts
  - **Done when**: c.ts exists
  - **Verify**: `test -f src/c.ts`
  - **Commit**: `feat(c): add c`
MD
    cat > /tmp/curdx-fixture-spec/specs/demo-spec/.progress.md <<'MD'
# Demo Spec Progress

## Original Goal
A frozen demo goal for byte-equal regression testing.

## Completed Tasks
- [x] 1.1 First task - abc1234

## Current Task
1.2 Second task

## Learnings
- Stable fixture snapshot
MD

    # Quick mode spec
    mkdir -p /tmp/curdx-fixture-quick/specs/quick-spec
    echo "quick-spec" > /tmp/curdx-fixture-quick/specs/.current-spec
    cat > /tmp/curdx-fixture-quick/specs/quick-spec/.curdx-state.json <<'JSON'
{
  "source": "spec",
  "name": "quick-spec",
  "basePath": "./specs/quick-spec",
  "phase": "design",
  "taskIndex": 0,
  "totalTasks": 0,
  "taskIteration": 1,
  "maxTaskIterations": 5,
  "globalIteration": 2,
  "maxGlobalIterations": 100,
  "commitSpec": true,
  "quickMode": true,
  "awaitingApproval": false,
  "recoveryMode": false,
  "nativeSyncEnabled": false,
  "granularity": "fine"
}
JSON

    # Corrupt JSON state
    mkdir -p /tmp/curdx-fixture-corrupt/specs/corrupt-spec
    echo "corrupt-spec" > /tmp/curdx-fixture-corrupt/specs/.current-spec
    printf '{ this is not valid json\n' \
        > /tmp/curdx-fixture-corrupt/specs/corrupt-spec/.curdx-state.json

    # Completed spec (taskIndex >= totalTasks, all [x] in tasks.md)
    mkdir -p /tmp/curdx-fixture-completed/specs/done-spec
    echo "done-spec" > /tmp/curdx-fixture-completed/specs/.current-spec
    cat > /tmp/curdx-fixture-completed/specs/done-spec/.curdx-state.json <<'JSON'
{
  "source": "spec",
  "name": "done-spec",
  "basePath": "./specs/done-spec",
  "phase": "execution",
  "taskIndex": 2,
  "totalTasks": 2,
  "taskIteration": 1,
  "maxTaskIterations": 5,
  "globalIteration": 4,
  "maxGlobalIterations": 100,
  "commitSpec": true,
  "quickMode": false,
  "awaitingApproval": false,
  "recoveryMode": false,
  "nativeSyncEnabled": false,
  "granularity": "fine"
}
JSON
    cat > /tmp/curdx-fixture-completed/specs/done-spec/tasks.md <<'MD'
# Done Spec Tasks

- [x] 1.1 First task
  - **Do**: Step one
  - **Done when**: criterion
  - **Verify**: `true`
  - **Commit**: `feat(a): add a`

- [x] 1.2 Second task
  - **Do**: Step two
  - **Done when**: criterion
  - **Verify**: `true`
  - **Commit**: `feat(b): add b`
MD
}

# ---------------------------------------------------------------------------
# Per-hook drivers
# ---------------------------------------------------------------------------

# Run a stdin-based hook with a fixture and capture combined stdout+stderr.
# Note: stdout/stderr ordering is preserved by piping both into the same file
# (subshell with `2>&1` aggregates them in stream order).
run_stdin_hook() {
    local hook_name="$1"   # script basename without .sh
    local fixture_file="$2"
    local out_file="$3"
    local script_path="$HOOKS_ROOT/${hook_name}.sh"

    set +e
    cat "$fixture_file" \
        | env CLAUDE_PLUGIN_ROOT="$(dirname "$(dirname "$script_path")")" \
              bash "$script_path" \
              > "$out_file" 2>&1
    local rc=$?
    set -e
    printf 'EXIT_CODE=%s\n' "$rc" >> "$out_file"
}

# Normalize non-deterministic content so the baseline can be byte-equal compared
# across runs. v6 update-spec-index emits an ISO-8601 timestamp; we rewrite it
# to a fixed sentinel. The byte-equal test (3.6) must apply the same normalizer
# to the v7 .mjs output before diffing.
NORMALIZED_TIMESTAMP="0000-00-00T00:00:00Z"
normalize_timestamps() {
    local file="$1"
    # Match ISO-8601 like 2026-05-03T15:02:39Z
    sed -E -i.bak \
        -e "s/\"updated\": \"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z\"/\"updated\": \"$NORMALIZED_TIMESTAMP\"/" \
        -e "s/\*\*Last updated:\*\* [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z/**Last updated:** $NORMALIZED_TIMESTAMP/" \
        "$file"
    rm -f "${file}.bak"
}

run_update_spec_index() {
    local fixture_file="$1"
    local out_file="$2"
    local cwd args
    cwd=$(jq -r '.cwd' "$fixture_file")
    args=$(jq -r '.args | @sh' "$fixture_file")
    local script_path="$HOOKS_ROOT/update-spec-index.sh"

    # Ensure no stale .index from a previous run
    rm -rf "$cwd/specs/.index"

    set +e
    # eval-expand the @sh-quoted args
    (cd "$cwd" && eval "bash \"$script_path\" $args" > "$out_file" 2>&1)
    local rc=$?
    set -e
    printf 'EXIT_CODE=%s\n' "$rc" >> "$out_file"

    # Append generated index files into the same baseline (so v7 must reproduce
    # both stdout AND filesystem effect)
    local marker_state="--- generated:specs/.index/index-state.json ---"
    local marker_md="--- generated:specs/.index/index.md ---"
    if [ -f "$cwd/specs/.index/index-state.json" ]; then
        printf '\n%s\n' "$marker_state" >> "$out_file"
        cat "$cwd/specs/.index/index-state.json" >> "$out_file"
    fi
    if [ -f "$cwd/specs/.index/index.md" ]; then
        printf '\n%s\n' "$marker_md" >> "$out_file"
        cat "$cwd/specs/.index/index.md" >> "$out_file"
    fi

    normalize_timestamps "$out_file"
}

# ---------------------------------------------------------------------------
# Drive everything
# ---------------------------------------------------------------------------

main() {
    provision_workspaces
    mkdir -p "$BASELINES_DIR"/{load-spec-context,quick-mode-guard,stop-watcher,update-spec-index}

    local count=0
    local fixture name out

    for fixture in "$FIXTURES_DIR/load-spec-context/"*.json; do
        [ -e "$fixture" ] || continue
        name=$(basename "$fixture" .json)
        out="$BASELINES_DIR/load-spec-context/${name}.txt"
        run_stdin_hook "load-spec-context" "$fixture" "$out"
        echo "  -> load-spec-context/$name"
        count=$((count + 1))
    done

    for fixture in "$FIXTURES_DIR/quick-mode-guard/"*.json; do
        [ -e "$fixture" ] || continue
        name=$(basename "$fixture" .json)
        out="$BASELINES_DIR/quick-mode-guard/${name}.txt"
        run_stdin_hook "quick-mode-guard" "$fixture" "$out"
        echo "  -> quick-mode-guard/$name"
        count=$((count + 1))
    done

    for fixture in "$FIXTURES_DIR/stop-watcher/"*.json; do
        [ -e "$fixture" ] || continue
        name=$(basename "$fixture" .json)
        out="$BASELINES_DIR/stop-watcher/${name}.txt"
        run_stdin_hook "stop-watcher" "$fixture" "$out"
        echo "  -> stop-watcher/$name"
        count=$((count + 1))
    done

    for fixture in "$FIXTURES_DIR/update-spec-index/"*.json; do
        [ -e "$fixture" ] || continue
        name=$(basename "$fixture" .json)
        out="$BASELINES_DIR/update-spec-index/${name}.txt"
        run_update_spec_index "$fixture" "$out"
        echo "  -> update-spec-index/$name"
        count=$((count + 1))
    done

    echo
    echo "Generated $count baseline files in $BASELINES_DIR"
}

main "$@"
