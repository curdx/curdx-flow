---
description: Two-stage adversarial review — fresh-context spec-reviewer first, then (if clean) fresh-context quality-reviewer. Findings are Critical/Important/Minor. Split into two agents so context pollution from Stage 1 doesn't bias Stage 2 (superpowers' proven pattern).
argument-hint: [--stage {1|2|both}] (default — both, sequential)
allowed-tools: Read, Write, Edit, Bash, Task
---

You are running `/curdx:review`. Your job is to orchestrate the two-stage adversarial review by dispatching two DIFFERENT subagents — never one agent called twice. Fresh context per stage is the whole point.

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

### 2. Stage 1 — dispatch `curdx-spec-reviewer`

Use the `Task` tool with `subagent_type: curdx-spec-reviewer`. Fresh context — the agent has never seen Stage 2 concerns. Payload:

```
You are running STAGE 1 (Spec Compliance) for feature {feature_id}.

Inputs:
  Spec: .curdx/features/{feature_id}/spec.md
  Plan: .curdx/features/{feature_id}/plan.md
  Tasks: .curdx/features/{feature_id}/tasks.md
  Git diff: git log --oneline main..HEAD AND per-commit `git show <sha>`

Output: append to .curdx/features/{feature_id}/review.md under
        `## Stage 1: Spec Compliance (iteration N)` where N is
        the next integer given how many Stage 1 sections already exist.

Per agents/curdx-spec-reviewer.md:
- Compare implementation against every FR, AC, Out-of-Scope, plan decision
- Verify via Read/Grep/Bash; don't trust builder DONE claims
- Severity: Critical / Important / Minor
- Stay in spec-compliance scope — style/readability/perf → "Stage 2 concern"
- Final line: SPEC_COMPLIANT | SPEC_ISSUES: <n> crit, <m> imp, <k> min | BLOCKED: <why>

The curdx-no-sycophancy skill is auto-loaded. Do not soften criticism.
```

### 3. Handle Stage 1 result

- **SPEC_COMPLIANT** → proceed to Stage 2 (if requested by `--stage both` or `--stage 2`).
- **SPEC_ISSUES**:
  - Parse counts. If any Critical: the builder must fix before Stage 2.
  - Dispatch `curdx-builder` with the Stage 1 findings as task description. The builder fixes each, atomically commits, returns DONE.
  - After builder returns: re-dispatch `curdx-spec-reviewer` in FRESH context (iteration 2). Loop cap: 3 iterations. Past 3 → escalate BLOCKED.
- **BLOCKED** → surface to user, stop.

### 4. Stage 2 — dispatch `curdx-quality-reviewer` (NOT `curdx-spec-reviewer` again)

Only if Stage 1 is SPEC_COMPLIANT and `--stage` is `2` or `both`.

Use the `Task` tool with `subagent_type: curdx-quality-reviewer`. Fresh context — the agent has never seen Stage 1's findings. Payload:

```
You are running STAGE 2 (Code Quality) for feature {feature_id}.

Inputs (same source files as Stage 1; you're looking at them for a DIFFERENT question):
  Spec: .curdx/features/{feature_id}/spec.md
  Plan: .curdx/features/{feature_id}/plan.md
  Tasks: .curdx/features/{feature_id}/tasks.md
  Existing review: .curdx/features/{feature_id}/review.md (read the Stage 1
    section for CONTEXT only — do not re-adjudicate spec compliance)

Output: append to .curdx/features/{feature_id}/review.md under
        `## Stage 2: Code Quality (iteration N)`.

Per agents/curdx-quality-reviewer.md Stage 2 checklist:
- Readability, error handling, input validation, test quality, duplication,
  complexity, SOLID, security, performance, observability
- Compare against 3-5 similar files in the codebase for convention parity
- Severity: Critical / Important / Minor
- Stay in quality scope — FR-missing is a Stage 1 escalation, not a Q-finding
- Final line: QUALITY_APPROVED | QUALITY_ISSUES: <n>, <m>, <k> | BLOCKED: <why>
```

### 5. Handle Stage 2 result

- **QUALITY_APPROVED** → update state, print summary, suggest `/curdx:verify` (if not done) or `/curdx:ship`.
- **QUALITY_ISSUES**:
  - Critical/Important: dispatch `curdx-builder` to fix, then re-dispatch `curdx-quality-reviewer` in FRESH context (iteration 2).
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
  /curdx:ship      — commit and push
```

## Why two separate agents (not one agent called twice)

Stage 1 and Stage 2 ask DIFFERENT questions. Loading both questions into one agent's prompt — even across two fresh dispatches — bleeds stage-2-shaped thinking into stage 1 and vice versa, because the prompt itself contains both rule sets. obra proved this in `superpowers:subagent-driven-development` (`skills/subagent-driven-development/SKILL.md:47-79`) and split into three dedicated agents: implementer / spec-reviewer / code-quality-reviewer. We do the same here.

The payoff is subtle but real: Stage 1 can't rationalize "this FR is missing but the code is so clean it deserves compliance"; Stage 2 can't rationalize "the code is a mess but it matches the spec so approved". Separate prompts, separate judgments.

## Notes

- The reviewer agents NEVER edit source; the builder does. Reviewers write findings to review.md; the orchestrator dispatches the builder to fix.
- Stage 2 runs from a fresh reviewer context, NOT continuing from Stage 1's context.
- Minor findings do not block. They are recorded in review.md and surfaced in `/curdx:status` output.
- If the user wants only one stage: `/curdx:review --stage 1` or `/curdx:review --stage 2` (the latter requires a prior clean Stage 1).

## When Stage 1 exposes a spec problem

Sometimes the reviewer finds that the spec itself is ambiguous or wrong — not just the implementation. In that case, the reviewer returns `SPEC_ISSUES` with a finding tagged `SPEC-AMBIGUITY: ...`. Handle:

- Surface to user: "The spec is ambiguous on X. Options: /curdx:clarify to resolve via Q&A, or /curdx:refactor --file spec to edit directly."
- Do NOT just have the builder pick one interpretation — that's silent spec erosion.
