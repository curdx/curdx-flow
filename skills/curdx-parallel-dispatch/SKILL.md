---
name: curdx-parallel-dispatch
description: Use when a task group in tasks.md has [P] markers and multiple builders can run concurrently. Dispatches each builder in its own git worktree SEQUENTIALLY (to avoid .git/config.lock contention), lets them execute in parallel, then merges back to main branch with "main always wins" for orchestrator-owned files.
---

# Parallel Dispatch (curdx-parallel-dispatch)

## When this skill activates

- The Stop-hook loop's next task is part of a `[P]` group (identified by the
  loop extracting consecutive `[P]` tasks up to 5 at a time)
- The orchestrator (in `/curdx:implement` or explicit `/curdx:tasks` parallel path)
  is about to dispatch multiple builders

## The critical gotcha (why this skill exists)

**`git worktree add` acquires an exclusive lock on `.git/config.lock`.**

If you dispatch multiple `Task` calls in a single Claude Code message (the
normal "parallel tool calls" pattern), each subagent races to create its
worktree and they all contend for `.git/config.lock`. Most will fail with
`fatal: Unable to create '.git/config.lock': File exists`.

This was found the hard way in gsd-build's execute-phase.md:
> "Sequential dispatch for parallel execution: When spawning multiple agents
> in a wave, dispatch each Task() call one at a time with
> run_in_background: true — do NOT send all Task calls in a single message."

## The protocol

Given a parallel group of N tasks (N ≤ 5):

### 1. Sequential worktree creation

For each task in the group, create its worktree **before dispatching any
builder**:

```bash
for task in "${GROUP[@]}"; do
  WT_BRANCH="parallel/${FEATURE_ID}/${task}"
  WT_PATH=".worktrees/${FEATURE_ID}-${task}"
  # one worktree add at a time — NOT in parallel
  git worktree add -b "$WT_BRANCH" "$WT_PATH" HEAD
done
```

Between iterations, add a small `sleep 0.2` if you see any config.lock
flakiness — some platforms release the lock after a brief delay.

### 2. Parallel builder dispatch

Once all worktrees exist, the actual subagent work IS safe to parallelize.
Dispatch Task calls in a single message:

```
// parallel — one Task tool call per task, all in ONE assistant message
Task({ subagent_type: "curdx-builder", prompt: <task-1 payload with cwd=WT_PATH_1> }, run_in_background: true)
Task({ subagent_type: "curdx-builder", prompt: <task-2 payload with cwd=WT_PATH_2> }, run_in_background: true)
Task({ subagent_type: "curdx-builder", prompt: <task-3 payload with cwd=WT_PATH_3> }, run_in_background: true)
...
```

Each builder's payload must include:
- `cwd` pointing to its worktree (so its Edits/Writes land in the worktree)
- `WORKTREE_BRANCH` env hint (so it can emit the atomic commit on the right branch)
- The task XML with its `<files>` list (for intra-wave conflict detection)
- A `<parallel_execution>` block explicitly telling it:
  - use `--no-verify` on commits (pre-commit hooks have lock contention too)
  - do NOT modify `.curdx/state.json` or the shared tasks.md
  - do NOT touch files outside its `<files>` list
  - write progress to a task-local file `.progress-task-<id>.md` (not the
    shared `.progress.md`)

### 3. Wait for all builders

Poll task statuses using Claude Code's Task system (TaskList / TaskGet).
When all return DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED:

- If any returned NEEDS_CONTEXT or BLOCKED → handle those tasks individually
  (take them out of the parallel group, retry sequentially with orchestrator
  providing context)
- If all DONE or DONE_WITH_CONCERNS → proceed to merge

### 4. Merge back — "main always wins" for orchestrator-owned files

This is borrowed from gsd's wave-merge protocol:

```bash
# SNAPSHOT orchestrator-owned files from main BEFORE any merge
MAIN_STATE=".curdx/state.json"
MAIN_TASKS=".curdx/features/${FEATURE_ID}/tasks.md"
SNAPSHOT_DIR=$(mktemp -d)
cp "$MAIN_STATE" "$SNAPSHOT_DIR/state.json"
cp "$MAIN_TASKS" "$SNAPSHOT_DIR/tasks.md"

for WT_PATH in "${WORKTREES[@]}"; do
  WT_BRANCH=$(git -C "$WT_PATH" rev-parse --abbrev-ref HEAD)

  # Pre-merge safety: the worktree branch must not delete orchestrator-owned files
  deleted=$(git diff --name-only main.."$WT_BRANCH" -- "$MAIN_STATE" "$MAIN_TASKS" 2>/dev/null | xargs -r -I{} sh -c '[ ! -f "{}" ] && echo "{}"' || true)
  if [ -n "$deleted" ]; then
    echo "worktree $WT_BRANCH would delete orchestrator-owned files: $deleted — skipping"
    continue
  fi

  # merge — no-ff, no-edit, with a structured message
  git merge --no-ff --no-edit \
    -m "chore: merge parallel builder worktree $WT_BRANCH into $FEATURE_ID" \
    "$WT_BRANCH"
done

# Restore orchestrator-owned files (main always wins)
cp "$SNAPSHOT_DIR/state.json" "$MAIN_STATE"
cp "$SNAPSHOT_DIR/tasks.md"  "$MAIN_TASKS"
rm -rf "$SNAPSHOT_DIR"
```

After merge, the orchestrator updates state.json + tasks.md (mark the group's
tasks `status="done"`, increment `task_index` past the whole group).

### 5. Post-merge validation

Run pre-commit hooks and the test suite ONCE after all worktree merges (since
builders used `--no-verify` to avoid lock contention):

```bash
# run pre-commit hook chain once
git hook run pre-commit 2>&1

# run tests detected from .curdx/config.json
TEST_CMD=$(jq -r '.testing.runner' .curdx/config.json)
case "$TEST_CMD" in
  vitest|jest|npm-test) npm test 2>&1 ;;
  pytest) pytest 2>&1 ;;
  go-test) go test ./... 2>&1 ;;
  cargo-test) cargo test 2>&1 ;;
esac
```

If tests fail post-merge:
- This is the **Generator self-evaluation blind spot** (per Anthropic harness
  research) — each builder reported DONE in isolation, but their combined
  effect broke something
- STRONG recommendation to pause the outer loop and invoke `/curdx:debug` on
  the specific failure
- Increment `.wave_failure_count` in state.json; after 2 cumulative wave
  failures, degrade to sequential dispatch for remaining waves

### 6. Worktree cleanup

```bash
for WT_PATH in "${WORKTREES[@]}"; do
  WT_BRANCH=$(git -C "$WT_PATH" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  git worktree remove "$WT_PATH" --force 2>/dev/null || true
  [ -n "$WT_BRANCH" ] && git branch -D "$WT_BRANCH" 2>/dev/null || true
done
```

## Safety-check: submodules

If the project uses git submodules (`.gitmodules` present), worktrees are
**unreliable** — submodule state is fragile across worktree boundaries.
In that case, fall back to sequential dispatch:

```bash
if [ -f .gitmodules ]; then
  echo "git submodules detected; disabling parallel dispatch for safety"
  # fall back to sequential single-builder dispatch
fi
```

## Intra-wave conflict detection

Before dispatching a wave, the orchestrator should double-check the planner's
`[P]` decision:

```bash
# Collect all <files> lists from the parallel group
declare -A seen
conflict=false
for task in "${GROUP[@]}"; do
  for file in $(task_files "$task"); do
    if [ -n "${seen[$file]:-}" ]; then
      echo "conflict: $file is in both ${seen[$file]} and $task"
      conflict=true
    fi
    seen[$file]="$task"
  done
done

if [ "$conflict" = "true" ]; then
  echo "planner marked conflicting tasks as [P] — disabling parallel for this wave"
  # fall back to sequential
fi
```

This is belt-and-suspenders: the planner is SUPPOSED to only mark non-overlapping
tasks as `[P]`, but catches planner mistakes before they cause merge conflicts.

## Concurrency limits

- Max parallel group size: **5** (per `.curdx/config.json` `parallelization.max_concurrent_agents`)
- Hard floor: 2 tasks (< 2 is just sequential; the overhead isn't worth it; `parallelization.min_plans_for_parallel: 2`)
- `[VERIFY]` checkpoints always break a parallel group (no parallel verification)

## Anti-patterns

- **Dispatching Task calls in one message for parallel execution** —
  `git worktree add` lock contention. Use sequential dispatch for worktree
  CREATION, parallel for EXECUTION.
- **Shared state file writes from builders** — builders writing to
  `.curdx/state.json` or shared `tasks.md` creates lost-update bugs. Use
  per-task progress files and let the orchestrator consolidate.
- **Running pre-commit hooks per-builder** — another source of lock
  contention on shared git infrastructure. Use `--no-verify` per builder
  and run hooks ONCE after merge.
- **Merging partial-failure waves** — if 3 of 5 builders returned DONE and
  2 returned BLOCKED, DO NOT merge the 3 successful worktrees and call the
  wave done. Leave the wave open, resolve the 2 blocked tasks, then merge
  all 5 together. Partial merges leave the feature in an inconsistent state.

## Self-review before returning to orchestrator

- [ ] All worktrees created successfully (sequentially)
- [ ] All builders returned a status (none stuck in limbo)
- [ ] Orchestrator-owned files (state.json, tasks.md) restored to main's version
- [ ] Post-merge test suite passed (or flagged `wave_failure_count++` if not)
- [ ] All worktrees cleaned up (removed + branches deleted)
- [ ] Any task with NEEDS_CONTEXT / BLOCKED is handled (NOT silently skipped)
