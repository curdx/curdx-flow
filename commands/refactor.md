---
description: Edit active feature's spec, plan, or tasks with automatic cascade detection. Changing spec may invalidate plan; changing plan may invalidate tasks. Routes the right re-generation to the right agent.
argument-hint: [--file {spec|plan|tasks|constitution}] [reason]
allowed-tools: Read, Write, Edit, Bash, Task, AskUserQuestion
---

You are running `/curdx:refactor`. Your job is to let the user amend one of the feature's artifacts (or the constitution), then check whether downstream artifacts are now stale and need regeneration.

## Pre-checks

1. Parse `--file {spec|plan|tasks|constitution}`. Default: ask via `AskUserQuestion`.
2. For `spec`, `plan`, `tasks`: require `.curdx/state.json` has `active_feature`.
3. For `constitution`: operates on `.claude/rules/constitution.md` (not feature-scoped).

## Steps

### 1. Update state

```bash
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/state-io.sh"
state_merge '{"phase": "refactor", "awaiting_approval": false}'
```

### 2. Dispatch editor based on file

#### Case: `--file spec`

Open spec.md in an editing turn. Ask user what they want to change (or accept their reason arg). Edit via `Edit` tool. Validate:
- Still conforms to spec-template.md structure
- No [NEEDS CLARIFICATION] markers re-introduced
- AC still falsifiable

Then **cascade check**:
```
Changing spec.md may invalidate:
  - plan.md (architecture / stack / verification commands)
  - tasks.md (task decomposition / acceptance criteria / commits)
  - review.md, verification.md (history, but re-generate if in progress)

Ask user: cascade-regenerate?
  - [r] regenerate plan.md AND tasks.md (recommended if any FR/AC changed)
  - [p] regenerate plan.md only
  - [n] no cascade — leave downstream as-is (risky — analyze will flag inconsistencies)
```

For 'r' / 'p': dispatch `curdx-architect` (plan) and/or `curdx-planner` (tasks) with full context.

#### Case: `--file plan`

Edit plan.md. Validate:
- Constitution Check table still truthful
- Complexity Tracking entries still justify what's added
- Stack decisions coherent

Cascade check:
```
Changing plan.md may invalidate:
  - tasks.md (if stack or file-structure changed)
  - any partially-implemented source files (revert if a stack decision flipped)

Ask user: cascade-regenerate tasks?
  - [y] yes, re-run /curdx:tasks (recommended if file structure / stack changed)
  - [n] no, tasks.md unchanged
```

#### Case: `--file tasks`

Edit tasks.md directly. Validate:
- Every task has required XML fields
- Every `[GREEN]` has preceding `[RED]`
- Last task still emits ALL_TASKS_COMPLETE
- No task has parallel="true" without meeting the 4 conditions

No cascade needed (tasks.md is the leaf).

#### Case: `--file constitution`

This is a project-level change, not feature-scoped. Edit `.claude/rules/constitution.md`. Validate:
- Template structure preserved (Hard Rules / Soft Rules / Advisory sections)
- Hard Rules count ≤ 10 (more than that becomes unenforceable)

**Cascade: audit ALL in-progress features.** For each `.curdx/features/<active>/` where state != "init":
- Re-run `/curdx:analyze` to check whether the new constitution is violated anywhere
- Surface violations; user decides per-feature whether to refactor-down or migrate the feature

### 3. Update state after edit

```bash
state_merge '{"phase": "refactor-complete", "awaiting_approval": true}'
```

If cascade ran, phase may move forward (e.g., back to `plan-complete` if plan was regenerated).

### 4. Print

```
refactored: {file}

changes: {summary}
cascade: {not-run | plan regenerated | plan + tasks regenerated | constitution audit: N issues in {features}}

next:
  /curdx:status   — see current phase
  /curdx:analyze  — re-audit cross-artifact consistency
  /curdx:implement — if tasks.md still valid and phase is tasks-complete
```

## Safety

- Before any overwrite, **snapshot the current version** to `.curdx/features/<active>/.history/<file>.<ts>.bak`. This lets the user roll back if the refactor was a mistake.
- Never refactor the ACTIVE task in tasks.md while a builder is executing it. Check `.curdx/state.json` — if `phase: execution` AND `task_iteration > 1`, warn the user: "A builder is mid-execution on T{index}; refactoring tasks.md now may confuse the Stop-hook loop. Proceed only if you've canceled execution first via /curdx:cancel or completed the current task."
- For constitution changes that tighten a rule (e.g., add a new hard rule), warn that the hook will retroactively start blocking tool calls that were previously allowed. For loosening changes (remove a rule), no retroactive impact.

## When to use /curdx:refactor vs /curdx:clarify

| Situation | Command |
|-----------|---------|
| Spec has ambiguity you didn't know about | /curdx:clarify (interactive Q&A) |
| Spec is wrong — user decided to change the feature | /curdx:refactor --file spec |
| Plan needs a stack change | /curdx:refactor --file plan |
| Tasks need re-sequencing or a new task inserted | /curdx:refactor --file tasks |
| A new hard rule should apply to all projects | /curdx:refactor --file constitution |
