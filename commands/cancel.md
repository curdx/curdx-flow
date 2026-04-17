---
description: Cancel the active feature OR an active debug session. Offers keep-state, revert-code, or delete-feature options. Never destructive without confirmation.
argument-hint: [<feature-id> | --debug <slug> | --all-quick]
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion
---

You are running `/curdx:cancel`. Your job is to cleanly abort an in-progress session without leaving orphaned state or breaking other features' data.

## Pre-checks

1. Parse args:
   - `<feature-id>` → cancel that specific feature (override `state.active_feature`)
   - `--debug <slug>` → cancel a debug session
   - `--all-quick` → clean up all completed `.curdx/quick/` entries
   - No args → cancel current `state.active_feature` (or `state.active_debug_slug` if set)

2. Refuse to run while `state.phase == execution` AND a task iteration is in progress (`task_iteration > 1`) — the Stop hook may be about to re-fire. Ask the user to wait or explicitly force with `--force`.

## Steps

### Case: cancel a feature

```bash
TARGET="${1:-$(jq -r '.active_feature // empty' .curdx/state.json)}"
[ -z "$TARGET" ] && { echo "no active feature to cancel"; exit 0; }
FDIR=".curdx/features/$TARGET"
[ -d "$FDIR" ] || { echo "feature $TARGET not found at $FDIR"; exit 1; }
```

### 1. Summarize what would be affected

Show to user:

```
Cancel feature: $TARGET

artifacts present:
  spec.md:          yes / no
  plan.md:          yes / no
  tasks.md:         yes / no (N total, M done)
  analysis.md:      yes / no
  review.md:        yes / no
  verification.md:  yes / no
  evidence dir:     yes (K files) / no

commits referencing this feature (git log --grep):
  abc123  feat(x): task 1
  def456  feat(x): task 2
  ...

Choose:
  [k] Keep — leave .curdx/features/$TARGET intact, just clear active_feature from state
  [s] Soft — move to .curdx/features/_canceled/$TARGET (preserve artifacts, out of active list)
  [d] Delete — rm -rf the feature dir (IRREVERSIBLE; prior commits remain in git history)
  [r] Revert — git revert every commit referencing this feature (requires feature branch, not main)
  [c] Cancel this cancel — do nothing
```

Use `AskUserQuestion` to present these 5 options.

### 2. Execute chosen action

Per option:

- **k (Keep)**: update state.json, clear `active_feature`. `phase` → "init-complete" or equivalent. Done.
- **s (Soft)**:
  ```bash
  mkdir -p .curdx/features/_canceled
  mv "$FDIR" ".curdx/features/_canceled/$TARGET"
  ```
  Then k.
- **d (Delete)**:
  Confirm by asking user to type the feature id: "Type $TARGET to confirm delete". If match:
  ```bash
  rm -rf "$FDIR"
  ```
  Then k.
- **r (Revert)**:
  ```bash
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  case "$CURRENT_BRANCH" in main|master|trunk) echo "Cannot revert on $CURRENT_BRANCH; switch to a feature branch first"; exit 1 ;; esac
  slug_part="${TARGET#[0-9]*-}"
  commits=$(git log --reverse --format=%H --grep="$slug_part")
  for c in $commits; do
    git revert --no-edit "$c" || { echo "revert failed at $c; fix conflicts and re-run"; exit 1; }
  done
  ```
  Then ask about also doing s or d for the artifacts.
- **c**: print "canceled; no changes made" and exit.

### 3. Update state

```bash
state_merge '{"phase": "init-complete", "active_feature": null, "awaiting_approval": false}'
```

### Case: cancel a debug session

```bash
SLUG="${DEBUG_SLUG}"
DFILE=".curdx/debug/$SLUG.md"
[ -f "$DFILE" ] || { echo "no debug session $SLUG"; exit 1; }
```

Ask user:
- [k] Keep — leave debug file, just clear `active_debug_slug`
- [s] Soft — move to `.curdx/debug/resolved/` with status `abandoned`
- [d] Delete — rm the file (irreversible)
- [c] Cancel this cancel

### Case: --all-quick

Clean up old `.curdx/quick/` entries that are more than 7 days old:

```bash
find .curdx/quick/ -maxdepth 1 -type d -mtime +7 -print
# ask user if they want to delete all printed
# if yes:
find .curdx/quick/ -maxdepth 1 -type d -mtime +7 -exec rm -rf {} \;
```

## Safety

- Every destructive operation requires a second confirmation (typing the feature id, answering y/n after seeing the affected files).
- Never runs destructive ops on git history without being on a feature branch.
- `--force` bypasses the "don't cancel mid-execution" check but still asks for the destructive-action confirmation.
- Logs the cancellation in `.curdx/memory/decisions.md` so claude-mem indexes it as a "feature X was canceled because Y" decision.

## Why keep the _canceled/ dir

Canceled work is NOT waste — the spec/plan may contain useful insights for future work. `.curdx/features/_canceled/` preserves them with claude-mem-searchable content. Only `d` (hard delete) removes traces.
