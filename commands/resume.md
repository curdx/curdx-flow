---
description: Resume curdx-flow work after a session break. Reads .curdx/state.json + optional .continue-here.md, reconstructs context, suggests next action.
argument-hint: (no arguments)
allowed-tools: Read, Bash, Grep
---

You are running `/curdx:resume`. Pure read-only. Use after:
- Closing and reopening Claude Code
- Context compaction
- Switching between projects
- Starting a new session on an in-progress feature

## Steps

### 1. Read state

```bash
[ -f .curdx/state.json ] || {
  echo "curdx-flow not initialized here. Run /curdx:init first."
  exit 0
}
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/state-io.sh"
state=$(cat .curdx/state.json)
```

### 2. Check for compaction journal

If `.curdx/memory/builder-journal.md` exists AND is less than 24h old, load it and surface a summary:

```bash
if [ -f .curdx/memory/builder-journal.md ]; then
  if [ "$(uname)" = "Darwin" ]; then
    MTIME=$(stat -f %m .curdx/memory/builder-journal.md)
  else
    MTIME=$(stat -c %Y .curdx/memory/builder-journal.md)
  fi
  AGE=$(( $(date +%s) - MTIME ))
  if [ "$AGE" -lt 86400 ]; then
    echo "## Compaction journal found ($((AGE/60)) min old)"
    head -40 .curdx/memory/builder-journal.md
  fi
fi
```

### 3. Check for handoff file

`.curdx/.continue-here.md` is written by explicit pause points (rare; mostly legacy). If present, read it and show its current_state / remaining_work / next_action sections.

### 4. Derive the "where were we" summary

From state.json, extract:
- phase
- active_feature
- active_debug_slug (if in a debug session)
- active_quick_id (if in a /curdx:quick session)
- task_index / total_tasks (if in execution)
- awaiting_approval (important — indicates user-gate pending)

### 5. Check active-feature artifacts

If `active_feature` is set:

```bash
FDIR=".curdx/features/$ACTIVE"
[ -f "$FDIR/spec.md" ] && echo "  spec:           $(wc -l < $FDIR/spec.md) lines"
[ -f "$FDIR/plan.md" ] && echo "  plan:           $(wc -l < $FDIR/plan.md) lines"
[ -f "$FDIR/tasks.md" ] && echo "  tasks:          $(grep -c '^<task id=' $FDIR/tasks.md) total, $(grep -c 'status=\"done\"' $FDIR/tasks.md) done"
[ -f "$FDIR/analysis.md" ] && echo "  analysis:       ✓"
[ -f "$FDIR/review.md" ] && echo "  review:         ✓"
[ -f "$FDIR/verification.md" ] && echo "  verification:   $(grep 'Result:' $FDIR/verification.md | head -1 | sed 's/\*\*Result:\*\* //')"
```

### 6. Check recent commits

```bash
slug_part="${ACTIVE#[0-9]*-}"
git log --oneline -10 --grep="$slug_part" 2>/dev/null
```

### 7. Derive the next suggested action

Use the phase → next-action table from `/curdx:status`:

| phase | suggested next |
|-------|----------------|
| init-complete | `/curdx:spec <slug>` |
| spec | (in progress — analyst is working; /curdx:status to check) |
| spec-complete | `/curdx:clarify` or `/curdx:plan` |
| plan | (in progress) |
| plan-complete | `/curdx:tasks` |
| tasks | (in progress) |
| tasks-complete | `/curdx:analyze` (if you want an audit first) or `/curdx:implement` |
| execution | (Stop-hook loop should resume automatically — check /curdx:status; if stuck, inspect state.task_iteration and last builder output) |
| verify | (in progress) |
| verify-complete | `/curdx:review` or `/curdx:ship` |
| verify-gaps | `/curdx:debug <failing-criterion>` or `/curdx:refactor` |
| review | (in progress) |
| review-complete | `/curdx:verify` (if not done) or `/curdx:ship` |
| debug | resume the debug session in `.curdx/debug/$active_debug_slug.md` |
| ship | `/curdx:ship` (not yet pushed) |
| shipped | done; create a new feature with `/curdx:spec <slug>` |
| refactor | (in progress) |

### 8. Print dashboard

```
curdx-flow resume

  phase:          {phase}
  active feature: {active_feature or "none"}
  active debug:   {active_debug_slug or "none"}
  active quick:   {active_quick_id or "none"}
  awaiting user:  {yes | no}

artifacts for {active_feature}:
  spec:           ✓ / —
  plan:           ✓ / —
  tasks:          N total, M done
  ...

task progress:  [####..............] 25% (3/12)
last updated:   {last_updated from state}

recent commits:
  abc123  feat(x): ...
  ...

{compaction journal summary if < 24h}

{handoff content if .continue-here.md exists}

**Suggested next:** {from phase table}
```

## Notes

- Resume is pure read — never modifies files.
- The Stop-hook loop (`implement-loop.sh`) does NOT automatically re-fire just because this command ran. If state.phase == execution but no loop is running, the user needs to re-run `/curdx:implement` to re-enter the loop (or the Stop hook will re-fire after the next Claude turn ends naturally).
- If compaction happened recently, the SessionStart hook already injected the context — resume's job is to surface a more verbose version on demand.
