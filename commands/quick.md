---
description: Bypass the full spec→plan→tasks pipeline for small/trivial work. Uses detect-complexity.sh to route; produces .curdx/quick/<id>-<slug>/PLAN.md plus atomic commits. Still enforces constitution hooks.
argument-hint: <description of what to do>
allowed-tools: Read, Write, Edit, Bash, Task
user-invocable: false
---

You are running `/curdx:quick <description>`. This is the escape hatch from the full pipeline for small work — one-file changes, tweaks, typo fixes, small features.

## Pre-checks

1. `<description>` is required. Reject with help text if empty.
2. Read `.curdx/config.json`. If `complexity_router.enabled: false`, skip routing and proceed in "small" mode directly.

## Steps

### 1. Classify

```bash
CLASS=$(bash "${CLAUDE_PLUGIN_ROOT}/scripts/detect-complexity.sh" "$DESCRIPTION")
TIER=$(echo "$CLASS" | jq -r '.tier')
```

### 2. Route based on tier

- **trivial**: inline fix. No PLAN.md. No subagent. One commit with conventional-commit format.
- **small**: continue with `/curdx:quick` flow (PLAN.md in `.curdx/quick/`, single builder dispatch).
- **medium**: **redirect** to the full pipeline. Print:
  ```
  This looks like a medium-complexity task ({signals}). The quick pipeline
  can't do it safely. Use the full pipeline:
    /curdx:spec <slug-derived-from-description>
  ```
  Exit without doing work.
- **large**: **redirect** to triage (Round 3, not yet implemented). Print:
  ```
  This looks like a large effort ({signals}). In Round 3, /curdx:triage
  will decompose it into multiple features. For now, break it down
  manually and run /curdx:spec for each piece.
  ```
  Exit.

### 3. Trivial flow

For inline fixes:

```bash
# Derive a slug (lowercase, hyphens, ≤40 chars)
SLUG=$(echo "$DESCRIPTION" | tr 'A-Z' 'a-z' | tr -cd 'a-z0-9 ' | tr -s ' ' '-' | head -c 40)
ID="$(date -u +%y%m%d)-$(openssl rand -hex 2 2>/dev/null || echo $$)-${SLUG}"

. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/state-io.sh"
state_merge "{\"phase\": \"quick\", \"awaiting_approval\": false, \"active_quick_id\": \"$ID\"}"
```

Do the edit directly (since it's trivial, in your main context). Commit with a derived conventional-commit message (e.g., `chore: fix typo in README`).

After:
```bash
state_merge '{"phase": "quick-complete"}'
```

### 4. Small flow

For one-PLAN.md work:

```bash
SLUG=...  # same derivation
ID="$(date -u +%y%m%d)-<random>-<slug>"
mkdir -p ".curdx/quick/$ID"

state_merge "{\"phase\": \"quick\", \"active_quick_id\": \"$ID\"}"
```

Dispatch `curdx-planner` in quick-mode:

```
You are running a quick-task plan for an ad-hoc change.

Description: {description}
Output: .curdx/quick/{id}/PLAN.md (use tasks-template.md format but
  generate only 3-5 atomic tasks — RED, GREEN, and optionally REFACTOR
  + a final task emitting ALL_TASKS_COMPLETE)

Constraints (different from full pipeline):
- No spec.md — the description IS the spec
- No plan.md architecture section — the plan is the task list
- Each task still follows the TDD sequence if it modifies production
  source (must have [RED] test task before [GREEN] impl task)
- Atomic commits per task
- Last task emits ALL_TASKS_COMPLETE for Stop-hook termination

Return: DONE with task count, or BLOCKED with the actual reason the
task can't be planned at this granularity.
```

After planner returns DONE, dispatch `curdx-builder` for T1 and let the Stop-hook loop take over (same as `/curdx:implement`).

### 5. Print summary

Trivial:
```
quick trivial completed: {commit_sha} — {short description}

no PLAN.md created (trivial tier).
state: quick-complete
```

Small:
```
quick small in progress: .curdx/quick/{id}/

  tier: small
  tasks: {N}
  signals: {signals_from_detect_complexity}

Stop-hook loop will drive tasks to completion. Use /curdx:status to watch.
```

## Constitution still applies

Even in `quick` phase, the PreToolUse hooks still run:
- `enforce-constitution.sh` rule 2 (TDD): skipped for trivial-tier (no `[GREEN]` tag), enforced for small-tier tasks
- `careful-bash.sh`: always on
- All other hooks active

The main difference from the full pipeline is **no spec requirement** (constitution rule 1 is scoped to exempt `quick` phase).

## When to use /curdx:quick vs /curdx:spec

| Characteristic | /curdx:quick | /curdx:spec |
|---------------|--------------|-------------|
| Touches > 5 files | NO | YES |
| Introduces new architecture | NO | YES |
| Multiple user stories | NO | YES |
| Has acceptance criteria that need written agreement | NO | YES |
| Is cross-cutting (auth, billing, etc.) | NO (use spec; quick can't capture the contract) | YES |
| Is a bug fix following `/curdx:debug` | YES (debug session IS the spec) | rarely |
| Is a typo / comment / formatting / version bump | YES (trivial tier) | overkill |

## Rationale

The full pipeline (spec → clarify → plan → analyze → tasks → implement → review → verify) is 8 commands. For a one-line fix that cost is absurd. `/curdx:quick` is the BMAD-style escape hatch (`bmad-quick-dev` in their framework) but routed by an actual classifier, not a hardcoded file-count threshold.
