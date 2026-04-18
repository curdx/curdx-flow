---
description: Detect current curdx-flow state and auto-invoke the next logical command. Reads .curdx/state.json + feature artifacts on disk; routes via SlashCommand. Pass --force to bypass safety gates.
argument-hint: "[--force]"
allowed-tools: Read, Bash, Grep, Glob, SlashCommand
---

You are running `/curdx:next`. **Zero-friction advancement** — figure out where the user is in the workflow and invoke the next command without asking. Pattern source: GSD `/gsd-next` (`/tmp/gsd/commands/gsd/next.md`).

## How it decides

Two inputs only — never ask the user:
1. `.curdx/state.json` (phase, active_feature, awaiting_approval, total_tasks, task_index)
2. File presence in `.curdx/features/$ACTIVE/` (spec.md, plan.md, tasks.md, verification.md, review.md)

This must be **deterministic**: same project state → same routing decision. No LLM judgment in the routing logic itself.

## Steps

### 1. Detect init state

```bash
if [ ! -f .curdx/state.json ]; then
  echo "curdx-flow not initialized in this project."
  echo "▶ next: /curdx:init"
  exit 0
fi
```

If no state, route is `/curdx:init`. Invoke it via SlashCommand.

### 2. Parse state

```bash
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/state-io.sh"
PHASE=$(state_get '.phase')
ACTIVE=$(state_get '.active_feature')
AWAITING=$(state_get '.awaiting_approval')
TASK_IDX=$(state_get '.task_index')
TOTAL=$(state_get '.total_tasks')
```

### 3. Safety gates (hard stops — exit unless `--force`)

If `$1` is `--force`, print `⚠ --force: skipping safety gates` and skip to step 4.

**Gate 1: Awaiting approval** — `awaiting_approval == true`
```
⛔ Hard stop: workflow paused for your approval.
The last command set awaiting_approval=true (probably a /curdx:safe loop or
phase boundary). Resolve via /curdx:resume to see what's pending.
Use --force to bypass.
```
Exit (do not route).

**Gate 2: Verification gaps** — `verification.md` exists and contains `**Result:** VERIFICATION_GAPS`
```
⛔ Hard stop: last verification reported gaps.
.curdx/features/$ACTIVE/verification.md shows VERIFICATION_GAPS.
Run /curdx:debug <slug> to address, or /curdx:refactor to amend the spec.
Use --force to bypass (will route to /curdx:ship anyway, which itself blocks).
```
Exit.

**Gate 3: State corruption** — state.json doesn't parse as JSON
```
⛔ Hard stop: .curdx/state.json is corrupt.
Run /curdx:doctor to inspect, or restore from git history.
```
Exit (no `--force` for this — too dangerous).

### 4. Routing rules (apply in order; first match wins)

| # | Condition | Route | Why |
|---|-----------|-------|-----|
| 1 | phase in {init, init-complete} AND active_feature is null/empty | print "describe a feature: /curdx:spec <slug>" | needs slug from user |
| 2 | active_feature exists, no `spec.md` file | `/curdx:spec $ACTIVE_SLUG` | spec missing |
| 3 | `spec.md` contains `[NEEDS CLARIFICATION]` markers | `/curdx:clarify` | resolve ambiguity first |
| 4 | `spec.md` exists, no `plan.md` | `/curdx:plan` | next pipeline step |
| 5 | `plan.md` exists, no `tasks.md` | `/curdx:tasks` | next pipeline step |
| 6 | `tasks.md` exists AND `task_index < total_tasks` | `/curdx:implement` | execution incomplete |
| 7 | All tasks done AND no `verification.md` | `/curdx:verify` | next pipeline step |
| 8 | `verification.md` Result is VERIFIED or VERIFIED_WITH_SHIP_BLOCKERS | `/curdx:ship` | ready to ship |
| 9 | phase is `shipped` | print "feature shipped — describe next: /curdx:spec <slug>" | nothing to advance |
| - | (no rule matched) | print state dump + suggest `/curdx:status` for diagnosis | unknown — surface to user |

`$ACTIVE_SLUG` = strip leading `NNN-` prefix from `$ACTIVE`.

### 5. Display + invoke

Print exactly this format before invoking:

```
## curdx:next

current:  phase=$PHASE  active=$ACTIVE  ($TASK_IDX/$TOTAL tasks)
status:   {one-line description, e.g. "spec exists, plan missing"}

▶ next:   /curdx:<command> [<args>]
          {one-line rationale, e.g. "advance pipeline to architecture phase"}
```

Then **immediately invoke** the routed command via the `SlashCommand` tool. Do not ask for confirmation — the entire point of `/curdx:next` is zero-friction advancement.

For Rule 1 and Rule 9 (which need user input), do NOT auto-invoke; just print the message and stop.

## Why this design

- **Deterministic routing** — same state → same route, no LLM creativity (which is what allows `/curdx:next` to be safe to auto-invoke)
- **Safety gates first** — `awaiting_approval`, `VERIFICATION_GAPS`, and corruption all stop the loop before routing
- **File-presence beats state-flag** — phase field can drift from disk reality (e.g. user manually deleted plan.md); routing uses what's actually on disk
- **No new state mutations** — `/curdx:next` is pure routing; the routed command does its own state updates
