---
description: Cross-artifact consistency audit of spec.md, plan.md, and tasks.md. Produces a findings table (6 categories × 4 severity levels) + coverage table + metrics. Read-only.
argument-hint: (no arguments)
allowed-tools: Read, Grep, Glob, Bash, Task
---

You are running `/curdx:analyze`. Your job is to delegate to `curdx-spec-reviewer` in analyze-mode — a non-destructive audit across spec, plan, tasks, and constitution. Analyze is essentially "Stage 1 of review, run pre-implementation" — it's checking the artifacts against each other, not checking code against artifacts. The spec-reviewer agent knows how to judge spec consistency; we reuse it here.

This command is **read-only**. It writes `analysis.md` but does not modify spec/plan/tasks.

## Pre-checks

1. Read `.curdx/state.json`. Must have `active_feature`.
2. Confirm spec.md, plan.md, tasks.md all exist.

## Steps

### 1. Update state

```bash
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/state-io.sh"
state_merge '{"phase": "analyze"}'
```

### 2. Dispatch curdx-spec-reviewer in analyze mode

Use `Task` with `subagent_type: curdx-spec-reviewer`. Payload:

```
You are running /curdx:analyze for feature {active}.

Inputs (read-only):
  @.curdx/features/{active}/spec.md
  @.curdx/features/{active}/plan.md
  @.curdx/features/{active}/tasks.md
  @.claude/rules/constitution.md

Output: .curdx/features/{active}/analysis.md (read-only audit; do not
modify spec/plan/tasks).

Per spec-kit's /speckit.analyze 6-category taxonomy:

## 6 categories — prefix severity with a letter

1. **D** = Duplication — near-duplicate requirements / overlapping AC / redundant user stories
2. **A** = Ambiguity — vague qualifiers ("fast", "scalable", "secure", "simple") without
   measurable targets; unresolved placeholders (TODO, TKTK, ???, [NEEDS CLARIFICATION])
3. **U** = Underspecification — incomplete verb-object pairs, user stories without
   acceptance criteria, tasks referencing undefined files
4. **C** = Constitution Alignment — any MUST violation from .claude/rules/constitution.md.
   Auto-promotes to CRITICAL severity.
5. **G** = Coverage Gaps — requirements with no tasks; tasks with no requirement ref;
   excludes business KPIs (those are success signals, not verification gaps)
6. **I** = Inconsistency — terminology drift; entities in plan but not spec; task ordering
   contradictions; conflicting stack choices

## Severity levels

- CRITICAL: constitution MUST violations, zero-coverage blockers
- HIGH: conflicting/duplicate requirements, untestable acceptance, ambiguous
  security/performance with no target
- MEDIUM: terminology drift, missing NFR coverage
- LOW: style / wording

## Output format — analysis.md

### Findings table (max 50 rows; overflow summarized)

| ID      | Category | Severity | Location(s)         | Summary | Recommendation |
|---------|----------|----------|---------------------|---------|----------------|
| C-1     | Constitution | CRITICAL | plan.md:L42 | Plan says "skip TDD for this feature" which violates Rule 2 | Re-plan or amend constitution |
| G-1     | Coverage | HIGH     | spec.md:FR-5        | FR-5 has no task in tasks.md | Add task or remove FR-5 |
| A-1     | Ambiguity | MEDIUM   | spec.md:NFR-2       | "fast page load" — no target | Replace with "< 2s on 4G" |
| ...     |          |          |                     |         |                |

### Coverage table

| Requirement | Has task? | Task IDs | Notes |
|-------------|-----------|----------|-------|
| FR-1        | yes       | T003, T004 | TDD-paired |
| FR-2        | yes       | T005       | |
| FR-3        | **no**    | —        | GAP |
| AC-1.1      | yes       | T003     | |
| SC-1        | yes       | verify.md AC-1.1 | |

### Metrics

- Total requirements (FR + NFR + AC): {N}
- Total tasks: {M}
- Coverage: {N_covered}/{N} = {percent}%
- Ambiguity count: {A_count}
- Duplication count: {D_count}
- Constitution CRITICAL count: {C_crit_count}

### Recommended next actions

Ordered by impact:
1. Address all CRITICAL (including C-1, ...) before /curdx:implement
2. Resolve HIGH via /curdx:clarify or /curdx:refactor
3. MEDIUM can ship; track in review.md backlog
4. LOW is noise; ignore unless pattern-concerning

## Return

DONE: <n> critical, <m> high, <k> medium, <j> low; coverage <pct>%
BLOCKED: <why — e.g., tasks.md missing>
```

### 3. After reviewer returns

Update state:

```bash
state_merge '{"phase": "analyze-complete"}'
```

### 4. Print

```
analysis complete: .curdx/features/{active}/analysis.md

  total findings: {n}
    critical: {c}   ← block /curdx:implement until resolved
    high:     {h}
    medium:   {m}
    low:      {l}

  coverage: {pct}% ({covered}/{total} requirements have tasks)

next (ordered by priority):
  {c}x CRITICAL — fix via /curdx:refactor or /curdx:clarify
  {h}x HIGH     — same
  /curdx:implement — proceed if no criticals remain
```

## Notes

- This is purely informational. The analyzer does NOT edit anything.
- CRITICAL findings should block `/curdx:implement` — the orchestrator enforces this by reading `.curdx/features/<active>/analysis.md` and refusing to enter execution phase if criticals remain.
- If the analyzer reports zero findings in all categories, it must list what it checked (to prevent rubber-stamp audits).
