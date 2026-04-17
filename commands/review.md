---
description: Two-stage review of the active feature. Stage 1 spec-compliance then (if clean) Stage 2 code-quality. Findings are Critical/Important/Minor; reviewer is adversarial by construction.
argument-hint: [--stage {1|2|both}] (default — both, sequential)
allowed-tools: Read, Write, Edit, Bash, Task
---

You are running `/curdx:review`. Your job is to orchestrate the two-stage adversarial review loop.

## Pre-checks

1. Read `.curdx/state.json`. Must have `active_feature`.
2. Confirm `.curdx/features/<active>/spec.md`, `plan.md`, `tasks.md` all exist.
3. Parse args: `--stage 1`, `--stage 2`, `--stage both` (default both).

## Workflow

### 1. Update state

```bash
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/state-io.sh"
state_merge '{"phase": "review", "awaiting_approval": false}'
```

### 2. Stage 1 — Spec Compliance

Dispatch `curdx-reviewer` via `Task`. Payload:

```
You are running STAGE 1 (Spec Compliance) for feature {feature_id}.

Spec: .curdx/features/{feature_id}/spec.md
Plan: .curdx/features/{feature_id}/plan.md
Tasks: .curdx/features/{feature_id}/tasks.md
Output: .curdx/features/{feature_id}/review.md (append under ## Stage 1)

Per agents/curdx-reviewer.md:
- Compare implementation against every FR, AC, Out-of-Scope, and plan decision
- Do not trust builder DONE reports; verify via Read, Grep, Bash
- Return findings with file:line + concrete fix suggestion
- Severity: Critical / Important / Minor
- Final line: SPEC_COMPLIANT | SPEC_ISSUES: <counts> | BLOCKED: <why>

The curdx-no-sycophancy skill is auto-loaded. Do not soften criticism.
Do not produce a zero-findings review without listing what you checked.
```

### 3. Handle Stage 1 result

- **SPEC_COMPLIANT** → proceed to Stage 2 (if requested).
- **SPEC_ISSUES**:
  - Parse counts. If any Critical: the builder must fix before Stage 2.
  - Dispatch `curdx-builder` with the Stage 1 findings as task description. The builder fixes each, atomically commits, returns DONE.
  - After builder returns: re-dispatch `curdx-reviewer` Stage 1 (iteration 2). Loop cap: 3 iterations. Past 3 → escalate BLOCKED.
- **BLOCKED** → surface to user, stop.

### 4. Stage 2 — Code Quality

Only if Stage 1 is SPEC_COMPLIANT and `--stage` is `2` or `both`.

Dispatch `curdx-reviewer` Stage 2. Payload:

```
You are running STAGE 2 (Code Quality) for feature {feature_id}.

Inputs: same as Stage 1 plus the existing .curdx/features/{feature_id}/review.md
Output: .curdx/features/{feature_id}/review.md (append under ## Stage 2)

Per agents/curdx-reviewer.md Stage 2 checklist:
- Readability, error handling, input validation, test quality,
  duplication, complexity, SOLID, security, performance, observability
- Compare against 3-5 similar files in the codebase for convention parity
- Severity: Critical / Important / Minor
- Final line: QUALITY_APPROVED | QUALITY_ISSUES: <counts> | BLOCKED: <why>
```

### 5. Handle Stage 2 result

- **QUALITY_APPROVED** → update state, print summary, suggest `/curdx:verify` (if not done) or `/curdx:ship`.
- **QUALITY_ISSUES**:
  - Critical/Important: dispatch `curdx-builder` to fix, then re-review.
  - Minor-only: surface to user; they decide whether to fix now or track in a backlog.

### 6. Update state and print summary

```bash
state_merge '{"phase": "review-complete", "awaiting_approval": true}'
```

```
review complete: .curdx/features/{feature_id}/review.md

  Stage 1 (spec compliance):   {clean | N iterations needed}
  Stage 2 (code quality):      {clean | M criticals resolved}
  remaining minor findings:    {K} (tracked in review.md)

next:
  /curdx:verify    — produce evidence (if not already run)
  /curdx:ship      — commit and push (Round 3)
```

## Notes

- The reviewer NEVER edits source; the builder does. The reviewer writes findings; the orchestrator dispatches the builder to fix.
- Stage 2 runs from a fresh reviewer context, NOT continuing from Stage 1's context. This enforces the "stage 2 is a separate judgment" rule from superpowers' pattern.
- If the user wants only one stage: `/curdx:review --stage 1` or `/curdx:review --stage 2` (the latter requires a prior clean Stage 1).
- Minor findings do not block. They are recorded in review.md and surfaced in `/curdx:status` output.

## When Stage 1 exposes a spec problem

Sometimes the reviewer finds that the spec itself is ambiguous or wrong — not just the implementation. In that case, the reviewer returns `SPEC_ISSUES` with a finding tagged `SPEC-AMBIGUITY: ...`. Handle:

- Surface to user: "The spec is ambiguous on X. Options: /curdx:clarify to resolve via Q&A, or /curdx:refactor --file spec to edit directly."
- Do NOT just have the builder pick one interpretation — that's silent spec erosion.
