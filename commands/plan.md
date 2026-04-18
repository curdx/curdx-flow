---
description: Architect the active feature — dispatches curdx-architect to produce plan.md (architecture + stack decisions + Constitution Check).
argument-hint: (no arguments — uses active feature from state.json)
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion, Task
user-invocable: false
---

You are running `/curdx:plan`. Your job is to delegate to `curdx-architect` for technical design of the active feature.

## Pre-checks

1. Read `.curdx/state.json`. If `active_feature` is null, instruct user to run `/curdx:spec <slug>` first and stop.
2. Confirm `.curdx/features/{active_feature}/spec.md` exists.
3. Read `.claude/rules/constitution.md`. The architect must explicitly check each hard rule.

## Steps

### 1. Update state

```bash
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/state-io.sh"
state_merge '{"phase": "plan", "awaiting_approval": false}'
```

### 2. Search prior architecture decisions via claude-mem

Call claude-mem `search` with the active feature name + " architecture", filter type `decision`. Inject results.

### 3. Dispatch curdx-architect

Use `Task` tool. Payload:

```
You are designing the technical implementation of a feature.

Feature: {active_feature}
Spec: .curdx/features/{active_feature}/spec.md
Output: .curdx/features/{active_feature}/plan.md
Template: ${CLAUDE_PLUGIN_ROOT}/templates/plan-template.md
Constitution: .claude/rules/constitution.md

Project context:
@.curdx/config.json

Prior architecture decisions (from claude-mem):
{{prior_decisions or "none"}}

Your job:
1. Read the spec carefully. List all FRs and NFRs.
2. Read the constitution. For each hard rule, fill the Constitution Check table truthfully.
   If any rule cannot be honored as-is, STOP and return BLOCKED with a written reason.
3. Read the template.
4. Make architecture decisions. Use sequential-thinking MCP for non-obvious tradeoffs.
   Use context7 MCP to look up current best practices for any library or framework you propose.
5. Fill in: component diagram, stack decisions table (with alternatives rejected),
   data model, API surface, error handling, file structure, test strategy,
   verification commands, risks, existing patterns to follow.
6. Constraints (Karpathy rule + curdx ethos):
   - Minimum architecture. No flexibility / future-proofing unless the spec requires it.
   - Prefer existing patterns in the codebase over novel approaches.
   - Single-responsibility components.
   - If complexity is added beyond simplest path, fill the Complexity Tracking table with justification.
7. Write the plan atomically. Return STATUS (DONE | NEEDS_CONTEXT | BLOCKED) + brief summary.
```

### 4. After architect returns

- **DONE:** Read plan.md. Print a summary (Constitution check results, key stack decisions, complexity flags).
- **NEEDS_CONTEXT:** Provide context, re-dispatch.
- **BLOCKED:** A constitution violation or unresolvable spec ambiguity. Surface to user.

### 5. Update state

```bash
state_merge '{"phase": "plan-complete", "awaiting_approval": true}'
```

Print:

```
plan written: .curdx/features/{active_feature}/plan.md

Constitution check: {{passed|N issues}}
Stack: {{summary line}}

next:
  /curdx:tasks     — decompose plan into atomic tasks
  /curdx:refactor  — edit the plan
```

## Constitution enforcement

If the architect returns BLOCKED for a constitution violation, do NOT silently downgrade. Either:
- Have the user resolve the conflict (e.g., choose a different approach), or
- Have the user formally amend the constitution via `/curdx:refactor --file constitution`

Never write a plan that assumes a hard rule will be skipped.
