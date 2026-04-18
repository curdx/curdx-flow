---
description: Resume curdx-flow work after a session break. Reads .curdx/state.json + optional .continue-here.md, reconstructs context, suggests next action.
argument-hint: (no arguments)
allowed-tools: Read, Bash, Grep
user-invocable: false
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

### 6a. Surface review findings (when paused on review)

If `phase` matches `review-stage1-issues` / `review-stage2-issues` / `review-complete` AND `$FDIR/review.md` exists, parse the review file and surface:
- The Stage 1 / Stage 2 verdict line (look for `**Verdict:**`)
- Every `#### S-` finding header + its one-line severity tag (e.g. `S-IMP-1 (Important) — createApp() factory drift`)
- Every `S-AMBIGUITY-*` routed to `/curdx:clarify`
- A one-line recommended action per phase (see table below)

```bash
if [ -f "$FDIR/review.md" ] && echo "$PHASE" | grep -q "^review"; then
  echo "## Review findings (from review.md)"
  echo
  # verdict line(s)
  grep -E '^\*\*Verdict:\*\*' "$FDIR/review.md" | sed 's/^/  /'
  echo
  # finding headers (S-CRIT, S-IMP, S-MIN, S-AMBIGUITY)
  echo "  findings to resolve:"
  grep -E '^#### S-' "$FDIR/review.md" | sed 's/^#### /    - /'
  echo
  # ambiguity section if present
  if grep -q '^### Spec ambiguities' "$FDIR/review.md"; then
    echo "  ambiguities routed to /curdx:clarify:"
    awk '/^### Spec ambiguities/,/^---$/' "$FDIR/review.md" | grep -E '^\| S-' | awk -F '|' '{print "    -" $2 ":" $3}'
  fi
fi
```

Phase → review-specific action hint (appended to the phase table in step 7):

| phase | recommended action when review.md findings present |
|-------|-----------------------------------------------------|
| review-stage1-issues | Triage each Important finding: fix code, or amend plan.md to accept drift. Then `/curdx:clarify` for ambiguities, `/curdx:review` to re-verify Stage 1. |
| review-stage2-issues | Address code-quality findings (see review.md Stage 2 section), commit fixes, `/curdx:review` to re-run. |
| review-complete | No outstanding findings; `/curdx:ship`. |

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
| review-stage1-issues | Read review.md findings (step 6a surfaced them); fix Important items or amend plan, then `/curdx:clarify` for ambiguities and `/curdx:review` to re-verify |
| review-stage2-issues | Read review.md Stage 2 findings; commit code fixes and `/curdx:review` to re-run |
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

{review findings block from step 6a, if phase is review-*}

recent commits:
  abc123  feat(x): ...
  ...

{compaction journal summary if < 24h}

{handoff content if .continue-here.md exists}

**Suggested next:** {from phase table; for review-*-issues phases, cross-reference the review findings block so the user knows exactly which files to touch}
```

## Notes

- Resume is pure read — never modifies files.
- The Stop-hook loop (`implement-loop.sh`) does NOT automatically re-fire just because this command ran. If state.phase == execution but no loop is running, the user needs to re-run `/curdx:implement` to re-enter the loop (or the Stop hook will re-fire after the next Claude turn ends naturally).
- If compaction happened recently, the SessionStart hook already injected the context — resume's job is to surface a more verbose version on demand.
