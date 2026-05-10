---
name: design
description: Use when a spec has requirements.md and needs technical design.
argument-hint: "[spec-name]"
allowed-tools: "Read Write Edit Bash Task AskUserQuestion"
disable-model-invocation: true
---


# Design Phase

Generate technical design for the active spec. Running this command implicitly approves requirements. You are a **coordinator, not an architect** -- delegate ALL work to the `architect-reviewer` subagent.

## Checklist

Create a task for each item and complete in order:

1. **Gather context** -- resolve spec, read requirements and research
2. **Interview** -- brainstorming dialogue (skip if `--quick`)
3. **Execute design** -- dispatch architect-reviewer via direct Task; Agent Teams optional
4. **Artifact review** -- parallel two-stage review (`spec-reviewer` + `code-quality-reviewer`); QuickMode bypass per D5
5. **Walkthrough & approval** -- display summary, get user approval
6. **Finalize** -- update state, commit, stop

## Step 1: Gather Context

1. If `$ARGUMENTS` contains a spec name, use `curdx_find_spec()` to resolve it; otherwise use `curdx_resolve_current()`
2. If no active spec, error: "No active spec. Run /curdx-flow:new <name> first."
3. Check the resolved spec directory exists
4. Check `requirements.md` exists. If not, error: "Requirements not found. Run /curdx-flow:requirements first."
5. Read `.curdx-state.json`; clear approval flag: `awaitingApproval: false`
6. Read context: `requirements.md` (required), `research.md` (if exists), `.progress.md`

## Step 2: Interview (skip if --quick)

Check if `--quick` appears in `$ARGUMENTS`. If present, skip to Step 3.

### Read Context from .progress.md

Parse Intent Classification and all prior interview responses to skip already-answered questions.

**Intent-Based Question Counts:**
- TRIVIAL: 1-2 | REFACTOR: 3-5 | GREENFIELD: 5-10 | MID_SIZED: 3-7

### Brainstorming Dialogue

Apply adaptive dialogue from `${CLAUDE_PLUGIN_ROOT}/skills/interview-framework/SKILL.md`. Ask context-driven questions one at a time.

**Design Exploration Territory** (hints, not a script):
- **Architecture fit** -- extend existing architecture, create isolated module, or require refactor?
- **Technology constraints** -- any required or forbidden libraries, frameworks, or patterns?
- **Integration tightness** -- how tightly should this integrate with existing systems?
- **Failure modes** -- what failure scenarios matter? Graceful degradation, retry logic, alerting?
- **Deployment model** -- feature flags, gradual rollout, migrations, or big-bang?

### Design Approach Proposals

After dialogue, propose 2-3 architectural approaches. Examples (illustrative only):
- **(A)** Extend existing service/module layer -- minimal new abstractions
- **(B)** New isolated component -- clean boundaries, own data layer
- **(C)** Hybrid -- new module with shared infrastructure and data layer

### Store Interview & Approach

Append to `.progress.md` under "Interview Responses":
```markdown
### Design Interview (from design.md)
- [Topic 1]: [response]
- Chosen approach: [name] -- [brief description]
```

Pass combined context to delegation prompt as "Interview Context".

## Step 3: Execute Design (Task-Based, Teams Optional)

<mandatory>
**Default path: use the normal `Task` tool with `architect-reviewer`. Do not require Agent Teams.**

Agent Teams are experimental and disabled by default in Claude Code. Use the team lifecycle only when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set and the `TeamCreate` / `TaskCreate` / `TaskList` / `SendMessage` tools are visible in the current session. If any team tool is unavailable or fails, immediately continue with the direct `Task(subagent_type: architect-reviewer)` path. Treat this as the normal path, not a degraded path.

Direct path:

1. Optionally create a visible native task with `TaskCreate(subject: "Generate technical design for $spec", activeForm: "Generating design")`. If unavailable or failing, continue without it.
2. Dispatch `Task(subagent_type: architect-reviewer)` with requirements, research, and interview context. Instruct it to design architecture with mermaid diagrams, component responsibilities, technical decisions with rationale, file structure, error handling, test strategy. Output to `./specs/$spec/design.md`.
3. Wait for the Task result, then read `./specs/$spec/design.md`.

Optional Agent Teams path:

1. `TeamDelete()` once to release any stale team; errors are harmless.
2. `TeamCreate(team_name: "design-$spec")`
3. `TaskCreate(subject: "Generate technical design for $spec", activeForm: "Generating design")`
4. `Task(subagent_type: architect-reviewer, team_name: "design-$spec", name: "architect-1")` with the same prompt as the direct path.
5. Wait via automatic teammate messages or a single `TaskList` check.
6. `SendMessage(type: "shutdown_request", recipient: "architect-1")`
7. Read `./specs/$spec/design.md`, then `TeamDelete()`.
</mandatory>

## Step 4: Artifact Review (Parallel Two-Stage)

<mandatory>
**Review loop must complete before walkthrough. Max 3 iterations.**

This step runs the **two-stage review protocol** at the design phase boundary: `spec-reviewer` (specCompliance) and `code-quality-reviewer` (codeQuality) are dispatched **in parallel**, in ONE message, against the frozen `design.md` artifact. Both reviewers must complete before reconciliation.

**Required reading before dispatch** (read once at top of step, do not skip):
- [`bounded-parallel-dispatch.md`](${CLAUDE_PLUGIN_ROOT}/references/bounded-parallel-dispatch.md) — independence criteria + the Review-domain "ALL Task calls in ONE message" rule (anti-pattern #3 + #5–#8). Both reviewers must be spawned in the SAME message.
- [`two-stage-review.md`](${CLAUDE_PLUGIN_ROOT}/references/two-stage-review.md) — domain boundary table (specCompliance vs codeQuality), 3-layer drift defense, anti-rationalization rule, SLSA-shape verdict glossary, QuickMode behavior contract.

The two reviewers do **not** see each other's output (Layer 2 isolation). The coordinator never arbitrates findings across domains.

### 4.1 Bounded parallel dispatch (direct Task default)

```
1. Optional TaskCreate(subject: "Spec-compliance review of design.md",
                       activeForm: "Reviewing design (spec-compliance)")
   Optional TaskCreate(subject: "Code-quality review of design.md",
                       activeForm: "Reviewing design (code-quality)")
2. # ALL Task calls in ONE message — see bounded-parallel-dispatch.md anti-pattern #3
   Task(subagent_type: spec-reviewer,
        prompt: "Review ./specs/$spec/design.md for spec-compliance ONLY.
                 Upstream: requirements.md + research.md.
                 Your domain: traceability, phase artifact structure, requirement
                 coverage, artifact format. Do NOT comment on code-quality concerns
                 (smell / security / readability / test-shape) — those belong to the
                 peer code-quality-reviewer (which you do NOT see and MUST NOT
                 reference). Emit a markdown findings table and a final line
                 `REVIEW_PASS` or `REVIEW_FAIL` (byte-equal).")
   Task(subagent_type: code-quality-reviewer,
        prompt: "Review ./specs/$spec/design.md for code-quality ONLY.
                 Your domain: code smell / security / implementation quality /
                 readability / test quality / no-hallucinations. Do NOT comment
                 on traceability to requirements / phase artifact structure /
                 requirement coverage / artifact format / front-matter — those
                 belong to spec-reviewer (which you do NOT see and MUST NOT
                 reference). Emit a markdown findings table and a final line
                 `REVIEW_PASS` or `REVIEW_FAIL` (byte-equal).")
3. # Wait for both Task results; collect REVIEW_PASS/REVIEW_FAIL final lines.
4. # Persist verdicts under verificationBlocks.design.reviews via merge-state (FR-T3 — never hand-edit state):
   node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/lib/merge-state.mjs" \
     "$SPEC_PATH/.curdx-state.json" \
     '{"verificationBlocks":{"design":{"reviews":{
        "specCompliance":{"verdict":"<PASS|FAIL>","findings":[...],"reviewerId":"spec-compliance","timestamp":"<ISO8601>"},
        "codeQuality":{"verdict":"<PASS|FAIL>","findings":[...],"reviewerId":"code-quality","timestamp":"<ISO8601>"}
     }}}}'
```

Optional Agent Teams overlay: if Agent Teams are enabled and available, create `TeamCreate(team_name: "review-design-$spec")`, add matching `team_name` and `name` fields to both Task calls, wait via automatic teammate messages or one `TaskList` check, then `SendMessage(...shutdown_request...)` and `TeamDelete()`. If any team step fails, rerun or continue with the direct dual `Task(...)` calls above.

### 4.2 QuickMode branch (D5)

Read `state.quickMode` from `.curdx-state.json`. **specCompliance is always a hard gate**; QuickMode only relaxes codeQuality.

```
if state.quickMode === true:
  if specCompliance.verdict === "FAIL":
    # Hard gate even in QuickMode — FR-M2 reverse contract.
    block; show findings; do NOT advance to Step 5.
  if codeQuality.verdict === "FAIL":
    # Advisory downgrade — set advisory:true via merge-state, surface findings,
    # continue. Never set advisory on specCompliance.
    merge-state into verificationBlocks.design.reviews.codeQuality.advisory = true
    log warning to .progress.md; proceed to Step 5.
else:                                  # normal mode
  if specCompliance.verdict === "FAIL" OR codeQuality.verdict === "FAIL":
    # Either FAIL blocks. Display findings table, ask user (Step 5 "Run review" / "Request changes" loop).
    Iteration < 3: re-invoke architect-reviewer with merged feedback, loop back to 4.1.
    Iteration >= 3: graceful degradation, log warning, proceed (permissive ceiling matches prior behavior).
  else:
    proceed to Step 5.
```

**Anti-rationalization**: the coordinator MUST NOT pass spec-reviewer's findings into the code-quality-reviewer prompt (or vice versa). Both verdicts are stored verbatim under `verificationBlocks.design.reviews`. See [`two-stage-review.md`](${CLAUDE_PLUGIN_ROOT}/references/two-stage-review.md) §2.

**Revision delegation**: Re-invoke architect-reviewer with the merged feedback (both reviewers' findings concatenated, attributed by `reviewerId`) and requirements.md upstream context. Focus on the union of issues.

**Error handling**: Reviewer no signal = treat as REVIEW_PASS for that slot (permissive ceiling). Agent failure = retry once, then use the surviving reviewer's verdict alone (still hard-gate on specCompliance if it survived).

**Fallback**: Direct dual `Task(...)` calls in ONE message are the default. Team failures are non-blocking unless both reviewers fail to return a verdict.
</mandatory>

## Step 5: Walkthrough & Approval

<mandatory>
**WALKTHROUGH IS REQUIRED - DO NOT SKIP.**

Read `./specs/$spec/design.md` and display:

```
Design complete for '$spec'.
Output: $PWD/specs/$spec/design.md

## What I Designed

**Approach**: [1-2 sentences from Overview]

**Components**:
- [Component A]: [brief purpose]
- [Component B]: [brief purpose]

**Key Decisions**:
- [Decision 1]: [choice made]
- [Decision 2]: [choice made]

**Files**: [X] to create, [Y] to modify
```
</mandatory>

### User Approval (skip if --quick)

If `--quick`, skip to Step 6.

Ask ONE question: "How do you want to proceed?" with these options via AskUserQuestion:
1. **Approve** (Recommended) -- Accept artifact as-is, advance to next phase
2. **Run review** -- Spawn spec-reviewer to validate against rubrics, show findings, then loop back to this choice
3. **Request changes** -- Provide specific feedback to revise the artifact

**If "Approve"**: proceed to Step 6.
**If "Run review"**: Invoke spec-reviewer via Task tool with full design.md content (upstream: research.md + requirements.md). Display findings table. If REVIEW_PASS, note it. If REVIEW_FAIL, show feedback. Then loop back to this same 3-choice question (user decides next action).
**If "Request changes" or "Other"**:
1. Ask what to change
2. Re-invoke architect-reviewer with direct `Task(subagent_type: architect-reviewer)` and feedback; use the optional team lifecycle only if Agent Teams are enabled and available
3. Re-display walkthrough, ask again with same 3 choices. Loop until approved.

## Step 6: Finalize

### Update State

1. **Merge** into `.curdx-state.json` (preserve all existing fields):
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/lib/merge-state.mjs" \
     "$SPEC_PATH/.curdx-state.json" '{"phase":"design","awaitingApproval":true}'
   ```
2. Update `.progress.md`: mark requirements as implicitly approved, set current phase

### Commit Spec (if enabled)

Read `commitSpec` from `.curdx-state.json`. If true:
```bash
git add ./specs/$spec/design.md
git commit -m "spec($spec): add technical design"
git push -u origin $(git branch --show-current)
```
If commit or push fails, display warning but continue.

### Stop

<mandatory>
**STOP HERE. DO NOT PROCEED TO TASKS.**

(Does not apply in `--quick` mode.)

1. Display: `-> Next: Run /curdx-flow:tasks`
2. End your response immediately
3. Wait for user to explicitly run `/curdx-flow:tasks`
</mandatory>
