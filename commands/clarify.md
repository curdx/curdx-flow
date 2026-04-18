---
description: Resolve ambiguity in the active spec by asking up-to-5 targeted clarification questions. 9-category taxonomy, multiple-choice format, atomic writeback to spec.md.
argument-hint: (no arguments)
allowed-tools: Read, Write, Edit, Bash, Task, AskUserQuestion
user-invocable: false
---

You are running `/curdx:clarify`. Your job is to dispatch `curdx-analyst` in clarification mode to resolve `[NEEDS CLARIFICATION]` markers and surface latent ambiguity.

## Pre-checks

1. Read `.curdx/state.json`. Must have `active_feature`.
2. Read `.curdx/features/<active>/spec.md`. Scan for `[NEEDS CLARIFICATION]` markers — there should be at least one, or the spec should show categories with low confidence.
3. If no markers and user just wants an audit: proceed with the 9-category ambiguity scan anyway.

## Steps

### 1. Update state

```bash
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/state-io.sh"
state_merge '{"phase": "clarify", "awaiting_approval": false}'
```

### 2. Dispatch curdx-analyst

Use the `Task` tool with `subagent_type: curdx-analyst`. Payload:

```
You are running /curdx:clarify for feature {active}.

Input: .curdx/features/{active}/spec.md
Output: .curdx/features/{active}/clarifications.md (new file)
Also update spec.md atomically with resolved ambiguities.

Per agents/curdx-analyst.md + spec-kit /speckit.clarify taxonomy:

## 9-category ambiguity scan

For each category, rate the spec as Clear / Partial / Missing:
1. Functional Scope & Behavior
2. Domain & Data Model
3. Interaction & UX Flow
4. Non-Functional Quality Attributes (perf, scalability, reliability, observability, security/privacy, compliance)
5. Integration & External Dependencies
6. Edge Cases & Failure Handling
7. Constraints & Tradeoffs
8. Terminology & Consistency
9. Completion Signals

## Question generation — HARD CAP 5 questions per session

- Prioritize by impact × uncertainty
- Each question is multiple-choice (2-5 options via AskUserQuestion) OR
  short-answer (≤5 words)
- For each MC question, first option is your "recommended default"
  with 1-2 sentences of reason
- Ask ONE question at a time. Record the answer. Proceed to next.
- Never exceed 5 questions — if more ambiguity remains, mark it for
  the NEXT clarify session and surface as "deferred" in clarifications.md

## Write-back

After each accepted answer:
- Append to clarifications.md:
  `## Session YYYY-MM-DD\n- Q: <question> → A: <final answer>`
- Patch the relevant section of spec.md atomically (tmp + mv)
- Validate spec.md: ≤5 new bullets total, no duplicates, no remaining
  vague placeholders in the patched section, valid markdown

## Return

DONE: clarifications written, <N> questions asked, <M> spec sections updated, <K> deferred
BLOCKED: <why — e.g., user wants to change a hard constitution rule>
```

### 3. After analyst returns

- **DONE**:
  - Update state to `phase: clarify-complete`, `awaiting_approval: true`
  - Print summary (Q&A count, sections touched, deferred items)

- **BLOCKED**:
  - Surface blocker. Common cause: user wants to amend a hard constitution rule — route to `/curdx:refactor --file constitution`.

### 4. Print

```
clarifications written: .curdx/features/{active}/clarifications.md

  questions asked:    {N}
  spec sections updated:  {M}
  deferred to next session: {K}
  coverage table: see clarifications.md

next:
  /curdx:plan     — proceed to architecture now that spec is sharper
  /curdx:clarify  — if there are still deferred items and you want them resolved now
```

## Notes

- The 9-category taxonomy is from spec-kit's `/speckit.clarify` — proven to catch the ambiguity classes that most often produce rework.
- Hard cap of 5 is a feature: too many questions in one session drains the user and produces shallow answers. Quality over coverage.
- Each Q's "recommended default" gives the user a fast-path: they can accept with a letter / "yes" / "recommended".
- If the clarification exposes a spec change that's actually a plan-level decision ("what framework should we use for auth"), redirect: "That's a plan decision — capture it in `/curdx:plan` instead."
