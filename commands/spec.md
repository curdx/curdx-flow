---
description: Create a new feature spec — produces .curdx/features/NNN-slug/spec.md describing what/why (no technology choices).
argument-hint: <feature-slug>
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion, Task
---

You are running `/curdx:spec <slug>`. Your job is to delegate to the `curdx-analyst` subagent to produce a `spec.md` for a new feature.

## Pre-checks

1. Read `.curdx/config.json`. If missing, instruct the user to run `/curdx:init` first and stop.
2. Validate `<slug>`: lowercase letters/digits/hyphens only, ≤ 40 chars. Reject otherwise.
3. Find the next feature number by scanning `.curdx/features/` for existing `NNN-*` directories. Take max + 1, zero-pad to 3 digits.
4. Create the feature directory: `.curdx/features/{NNN}-{slug}/`.

## Steps

### 1. Update state

```bash
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/state-io.sh"
state_merge "{\"phase\": \"spec\", \"active_feature\": \"{NNN}-{slug}\", \"awaiting_approval\": false}"
```

### 2. Search prior decisions via claude-mem

If claude-mem MCP is available, call its `search` tool with the slug as query, type filter `decision`. This surfaces past architectural decisions that may inform the spec. Inject results as context for the analyst.

Skip silently if claude-mem MCP is not available.

### 3. Dispatch curdx-analyst

Use the `Task` tool to dispatch the `curdx-analyst` subagent. Payload:

```
You are writing the feature spec for a new feature in this project.

Feature slug: {NNN}-{slug}
Output path: .curdx/features/{NNN}-{slug}/spec.md
Template: ${CLAUDE_PLUGIN_ROOT}/templates/spec-template.md

Project context:
@.curdx/config.json
@.claude/rules/constitution.md

Prior related decisions (from claude-mem search if any):
{{prior_decisions or "none found"}}

Your job:
1. Read the template.
2. Talk to the user (use AskUserQuestion) to fill in:
   - Goal (one paragraph, user-language, no tech)
   - User Stories (1-5 stories)
   - Acceptance Criteria per story (falsifiable, given/when/then)
   - Functional + Non-Functional Requirements
   - Out of Scope (with reasoning per item)
   - Dependencies and Open Questions
3. Write the filled spec to the output path. Use atomic write (tmp + mv).
4. Return: STATUS (DONE | NEEDS_CONTEXT | BLOCKED) + brief summary of what was captured.

Do NOT propose technology choices, file structures, or implementation details. Those belong in plan.md.
Do NOT skip questions to "save the user time" — clarification now prevents rework later.
```

### 4. After analyst returns

- **DONE:** Read the produced spec. Print a short summary (Goal + #US + #AC + #FR + #Out-of-Scope items) and the next-step prompt.
- **NEEDS_CONTEXT:** Provide the missing context the analyst asked for and re-dispatch.
- **BLOCKED:** Surface the blocker to the user and stop.

### 5. Update state and offer next step

```bash
state_merge "{\"phase\": \"spec-complete\", \"awaiting_approval\": true}"
```

Print exactly:

```
spec written: .curdx/features/{NNN}-{slug}/spec.md

review the spec, then choose:
  /curdx:clarify   — resolve any [NEEDS CLARIFICATION] markers (Round 2)
  /curdx:plan      — proceed to architecture and tech-stack decisions
  /curdx:refactor  — edit the spec
```

## Notes

- The spec must NEVER contain technology terms ("use Postgres", "use React") — those are plan decisions.
- If the user pushes a tech choice into the spec, the analyst should redirect: "That decision belongs in `/curdx:plan`. For the spec, what *user-visible behavior* are you trying to enable?"
