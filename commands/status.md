---
description: Show current curdx-flow state — active feature, phase, task progress, recent activity.
argument-hint: (no arguments)
allowed-tools: Read, Bash
---

You are running `/curdx:status`. Read `.curdx/state.json` and `.curdx/config.json`, then print a concise dashboard. Pure read-only.

## Steps

### 1. Read state files

```bash
state=$(cat .curdx/state.json 2>/dev/null || echo '{}')
config=$(cat .curdx/config.json 2>/dev/null || echo '{}')
```

If both are empty/missing, print:
```
curdx-flow not initialized in this project. Run /curdx:init first.
```
and stop.

### 2. Extract fields

```bash
phase=$(echo "$state" | jq -r '.phase // "unknown"')
active_feature=$(echo "$state" | jq -r '.active_feature // "none"')
task_index=$(echo "$state" | jq -r '.task_index // 0')
total_tasks=$(echo "$state" | jq -r '.total_tasks // 0')
global_iteration=$(echo "$state" | jq -r '.global_iteration // 1')
last_updated=$(echo "$state" | jq -r '.last_updated // "never"')
project_name=$(echo "$config" | jq -r '.project_name // "<unnamed>"')
backend=$(echo "$config" | jq -r '.stack.backend.language // "?"')
frontend=$(echo "$config" | jq -r '.stack.frontend.framework // "?"')
test_runner=$(echo "$config" | jq -r '.testing.runner // "?"')
browser=$(echo "$config" | jq -r '.browser_testing.mode // "?"')
```

### 3. Compute progress bar

```bash
if [ "$total_tasks" -gt 0 ]; then
  pct=$(( 100 * task_index / total_tasks ))
  filled=$(( pct / 5 ))
  empty=$(( 20 - filled ))
  bar=$(printf "%${filled}s" | tr ' ' '#')$(printf "%${empty}s" | tr ' ' '.')
else
  bar="...................."
  pct=0
fi
```

### 4. List features

```bash
features=$(ls -1 .curdx/features/ 2>/dev/null | sort)
n_features=$(echo "$features" | grep -c '^[0-9]')
```

For the active feature, count what artifacts exist:

```bash
fdir=".curdx/features/$active_feature"
artifacts=""
[ -f "$fdir/spec.md" ]          && artifacts="$artifacts spec"
[ -f "$fdir/clarifications.md" ] && artifacts="$artifacts clarify"
[ -f "$fdir/plan.md" ]          && artifacts="$artifacts plan"
[ -f "$fdir/tasks.md" ]         && artifacts="$artifacts tasks"
[ -f "$fdir/plan-check.md" ]    && artifacts="$artifacts plan-check"
[ -f "$fdir/findings.json" ]    && artifacts="$artifacts findings"
[ -f "$fdir/review.md" ]        && artifacts="$artifacts review"
[ -f "$fdir/verification.md" ]  && artifacts="$artifacts verify"
```

### 5. Recent commits for active feature

```bash
slug_part=$(echo "$active_feature" | sed 's/^[0-9]*-//')
recent_commits=$(git log --oneline --grep="$slug_part" -5 2>/dev/null)
```

### 6. Print dashboard

Use exactly this format:

```
project: {project_name}
stack:   {backend} backend / {frontend} frontend / {test_runner} tests / {browser} browser

phase:           {phase}
active feature:  {active_feature}
artifacts:      {artifacts or "(none yet)"}
task progress:   [{bar}] {pct}% ({task_index}/{total_tasks})
loop iteration:  {global_iteration}
last updated:    {last_updated}

features ({n_features} total):
  {first 5 from `features` list, with checkmark if status=done}

recent commits for active feature:
  {recent_commits or "(none)"}

next suggested step:
  {derived from phase — see table below}
```

Phase → next step suggestion:

| phase | suggested next |
|-------|----------------|
| init  | `/curdx:spec <slug>` to start your first feature |
| init-complete | `/curdx:spec <slug>` to start your first feature |
| spec-complete | `/curdx:plan` (or `/curdx:clarify` if you need to disambiguate first) |
| plan-complete | `/curdx:tasks` |
| tasks-complete | `/curdx:implement` |
| execution | (loop is running — wait or run `/curdx:cancel` to abort) |
| execution-complete | `/curdx:verify` (Round 2) or `/curdx:ship` (Round 3) |
| spec  | (in progress — analyst is working) |
| plan  | (in progress — architect is working) |
| tasks | (in progress — planner is working) |

Print only the dashboard. Do not perform any actions.
