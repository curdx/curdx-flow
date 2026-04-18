---
description: Decompose a large-tier effort into multiple independently-shippable features. Writes an epic manifest and creates N feature directories with cross-references. Use when detect-complexity classifies work as "large" or a feature spans 5+ user stories.
argument-hint: <epic-name> <goal>
allowed-tools: Read, Write, Edit, Bash, Task, AskUserQuestion
user-invocable: false
---

You are running `/curdx:triage <epic-name> <goal>`. Your job is to break a large effort into vertical slices that can each go through `/curdx:spec` → `/curdx:plan` → ... → `/curdx:ship` independently.

**Pattern source:** smart-ralph's `triage-analyst` agent ("user journey, not technical layer") + gsd's phase-based decomposition + spec-kit's feature-dir-per-numbered-spec.

## Pre-checks

1. `<epic-name>` required, kebab-case, ≤40 chars.
2. `<goal>` required, the full user-intent paragraph.
3. Check if epic already exists: `.curdx/epics/<epic-name>/`. If so, ask whether to continue in place or abort.
4. Recommended (not enforced): run `detect-complexity.sh` first and confirm this is "large" tier. If smaller, suggest `/curdx:spec` directly instead.

## Steps

### 1. Create epic directory

```bash
mkdir -p ".curdx/epics/$EPIC_NAME"
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/state-io.sh"
state_merge "{\"phase\": \"triage\", \"active_epic\": \"$EPIC_NAME\", \"awaiting_approval\": false}"
```

### 2. Phase 1 — exploration research

Dispatch `curdx-analyst` in "epic research" mode. Use claude-mem search for any prior similar effort + context7 MCP for external references.

```
You are running TRIAGE research phase for epic $EPIC_NAME.

Goal: $GOAL
Output: .curdx/epics/$EPIC_NAME/research.md

Your job:
1. Summarize the problem space — who's affected, what user journeys exist,
   what's the business outcome
2. Map 3-7 distinct USER JOURNEYS (not technical subsystems). Each is a
   discrete "a user wants to {verb} and gets {outcome}" path.
3. Identify natural seams — where one journey's output becomes another's input
4. Surface high-uncertainty areas (interviewing users / market research /
   competitive analysis if relevant via WebSearch)
5. Note existing related specs in .curdx/features/ that touch this area

Return DONE with paths + 1-para summary, or BLOCKED.
```

### 3. Phase 2 — decomposition

Dispatch a specialized subagent (use `curdx-architect` with triage prompt for now; Round 3+ may add dedicated `curdx-triage-analyst`):

```
You are decomposing epic $EPIC_NAME into independently-shippable features.

Input:
  @.curdx/epics/$EPIC_NAME/research.md

Output: .curdx/epics/$EPIC_NAME/epic.md

Per template: ${CLAUDE_PLUGIN_ROOT}/templates/epic-template.md (if not
present, create one — see structure below)

Process:
1. Map each user journey from research.md to one candidate feature.
2. For each candidate, write:
   - Goal (one-line, user-language)
   - Acceptance Criteria (independently testable — if the AC requires another
     feature to ship first, this isn't independent)
   - MVP Scope: what's in v1 of this feature
   - Dependencies: which other features in the epic must ship first (kept to
     a MINIMUM — prefer interface contracts over shared state)
   - Interface Contracts: what this feature EXPOSES to others and CONSUMES
     from others (data shapes, events, endpoints)
   - Size estimate: S (< 1 day), M (1-3 days), L (3-7 days), XL (refactor)
3. Produce a dependency graph (mermaid) showing feature-to-feature ordering.
4. Per-decomposition rules (HARD):
   - Each feature must be INDEPENDENTLY DELIVERABLE — either it ships without
     the others, or it has an explicit dep declared
   - Interface contracts are the #1 artifact — more important than
     implementation sketches
   - Prefer 3-5 features over 8-10 (decomposition should SIMPLIFY, not create
     a coordination problem)
   - NEVER produce features that can "only ship together"
5. Ask user via AskUserQuestion to refine: merge too-small, split too-large,
   adjust deps, confirm interface contracts, validate MVP scope per feature.

Return DONE with feature count + spec-ready list.
```

### 4. Phase 3 — validation research

Dispatch `curdx-analyst` once more to sanity-check the decomposition:

```
Validate the epic decomposition for $EPIC_NAME.

Input: .curdx/epics/$EPIC_NAME/epic.md

Check:
- Each feature is INDEPENDENTLY BUILDABLE (no hidden shared modules)
- Interface contracts are technically valid (data types, event shapes are
  consistent between producers and consumers)
- Scope is realistic (no "build all of Stripe" as a single feature)
- Missing features (gaps in user journey coverage)
- Unnecessary features (duplicate coverage)
- Dependency graph has no cycles

Append findings to .curdx/epics/$EPIC_NAME/research.md under
"## Validation findings". Flag issues the user should resolve before
creating individual feature dirs.
```

### 5. Phase 4 — create feature directories

After user approves the decomposition:

For each feature in epic.md, offer two options:

```
How do you want to track these features?
  [a] file system only — create .curdx/features/NNN-<slug>/spec.md stubs
      that reference epic.md; user works through them one by one
  [b] both — create dirs AND github/gitlab issues (requires gh/glab;
      epic.md has feature IDs cross-referenced to issue numbers)
  [c] issues only — create platform issues, do NOT create feature dirs
      yet (useful for planning-only mode)
```

For option (a) and (b), use `create-new-feature.sh` equivalent logic:
- Find next `NNN` across existing features
- Create `.curdx/features/NNN-<slug>/`
- Seed `spec.md` with a STUB referring to epic.md — user still runs
  `/curdx:spec <slug>` when they start the feature, which fills in the
  full spec using the epic context

For option (b) and (c), integrate with gh/glab **only if they're already
installed and authenticated** — never prompt for tokens. If absent, fall
back to option (a) with a warning.

### 6. Initialize epic-state.json

```json
{
  "name": "<epic-name>",
  "goal": "<goal>",
  "created_at": "<ISO>",
  "features": [
    {
      "id": "001-xxx",
      "status": "pending",
      "dependencies": [],
      "interface_exposes": [...],
      "interface_consumes": [...]
    }
  ]
}
```

Written to `.curdx/epics/<epic-name>/epic-state.json` (atomic).

### 7. Update state

```bash
state_merge "{\"phase\": \"triage-complete\", \"awaiting_approval\": true, \"active_feature\": null}"
```

### 8. Print summary

```
triage complete: .curdx/epics/$EPIC_NAME/

  features created: $N
  dependency graph: $EPIC_DIR/epic.md
  epic state:       $EPIC_DIR/epic-state.json

features (in suggested order per dependency graph):
  001-user-model       [S]   no deps
  002-auth-tokens      [M]   depends on: 001
  003-password-reset   [M]   depends on: 002
  004-admin-dashboard  [L]   depends on: 001, 002

next:
  /curdx:spec 001-user-model  — start with the first feature (no deps)
  /curdx:status               — see overall epic progress

this is an EPIC session. As you run /curdx:spec for each feature, the
spec.md is pre-populated from epic.md context. claude-mem will index
epic-level decisions separately from feature-level ones.
```

## Template for epic.md

If `templates/epic-template.md` doesn't exist (first use), create it at the same time. Suggested structure:

```markdown
# Epic: {{EPIC_NAME}}

**Goal:** {{one-paragraph user-intent}}
**Created:** {{ISO}}

## Vision

{{what does the world look like when this epic is done}}

## Success criteria (epic-level)

{{3-5 bullets; each references the features that validate it}}

## Features

### 001-xxx
**Goal:** (user-story format)
**AC:** (3-5 independently-testable criteria)
**MVP scope:**
  In:  ...
  Out: ...
**Dependencies:** (other feature IDs)
**Interface contracts:**
  Exposes: (what this feature makes available to others)
  Consumes: (what this feature requires from others)
**Size:** S | M | L | XL
**Architecture notes (advisory):** (one paragraph — NOT binding; actual plan
  happens in /curdx:plan)

### 002-xxx
...

## Dependency graph

\`\`\`mermaid
graph TD
  001-user-model --> 002-auth-tokens
  002-auth-tokens --> 003-password-reset
  001-user-model --> 004-admin-dashboard
  002-auth-tokens --> 004-admin-dashboard
\`\`\`

## Notes

{{anything else — rejected decompositions, deferred features, risks}}
```

## Constraints

- This is a heavyweight command — only use for genuinely large work. Medium-tier features should go straight to `/curdx:spec`.
- The decomposition is NEVER final — users can split/merge features as they go. Epic-state.json tracks status transitions.
- claude-mem indexes the epic.md separately, so future "did we already plan something like this?" queries can surface the epic.

## Constitution interaction

- The epic itself isn't subject to constitution hard rules (it's planning, not code).
- Individual features inside the epic go through the normal constitution gates when they reach `/curdx:implement`.
- The constitution's `.claude/rules/constitution.md` applies to code across features; if a new hard rule is added mid-epic, `/curdx:analyze` each active feature and `/curdx:refactor` what doesn't conform.
