---
name: tasks
description: Use when a spec has design.md and needs implementation tasks.
argument-hint: "[spec-name] [--tasks-size auto|coarse|standard|fine]"
allowed-tools: "Read Write Edit Bash Agent AskUserQuestion"
disable-model-invocation: true
---


# Tasks Phase

Generate implementation tasks for the active spec. Running this command implicitly approves design. You are a **coordinator, not a task planner** -- delegate ALL work to the `task-planner` subagent.

## Coordinator Checklist

Complete these coordination steps in order; do not create user-facing implementation tasks from this checklist:

1. **Gather context** -- run workflow snapshot, read design, requirements, research
2. **Interview** -- brainstorming dialogue (skip if `--quick`)
3. **Execute task generation** -- dispatch task-planner via direct Agent; Agent Teams optional
4. **Artifact review** -- parallel two-stage review (`spec-reviewer` + `code-quality-reviewer`); QuickMode bypass per D5
5. **Walkthrough & approval** -- display summary, get user approval
6. **Finalize** -- update state, commit, stop

## Step 1: Gather Context

1. Run `curdx-flow snapshot --spec "$ARGUMENTS"` when `$ARGUMENTS` begins with a spec name; otherwise run `curdx-flow snapshot`.
2. If `snapshot.active` is false, error: "No active spec. Run /curdx-flow:new <name> first."
3. Use `snapshot.spec.fsPath` as `$SPEC_PATH`.
4. If `snapshot.artifacts.design.exists` is false, error: "Design not found. Run /curdx-flow:design first."
5. If `snapshot.artifacts.requirements.exists` is false, error: "Requirements not found. Run /curdx-flow:requirements first."
6. Clear approval flag:
   ```bash
   curdx-flow state merge "$SPEC_PATH/.curdx-state.json" '{"awaitingApproval":false}'
   ```
7. **`--tasks-size` flag handling**: Check `$ARGUMENTS` for `--tasks-size` flag:
   - Valid values: `auto`, `coarse`, `standard`, `fine`
   - If valid: update `granularity` in `.curdx-state.json` and treat it as an explicit override of `autoPolicy.taskGranularity`
   - If invalid: warn the user (`Invalid --tasks-size value "<value>", using autoPolicy/default standard`) and set `"granularity": "auto"`
   - If `--tasks-size` flag is absent: leave `granularity` unchanged in `.curdx-state.json` (preserve any value set by `/curdx-flow:start`)
8. **AutoPolicy default**: If no `autoPolicy` exists in the snapshot, run:
   ```bash
   curdx-flow route --goal "$GOAL" --flags "$ARGUMENTS"
   ```
   Merge the JSON into `.curdx-state.json` as `{ "autoPolicy": <policy>, "granularity": <policy.taskGranularity> }`.
9. Read route context from `.curdx-state.json` when present: `route.stackProfile`, `route.qualityGates`, `route.suggestedVerifier`, and `route.contextBudget`. Use `${CLAUDE_PLUGIN_ROOT}/references/intelligent-routing.md` only when the compact route facts need interpretation.
10. Read context: `requirements.md`, `design.md`, `research.md` (if exists), `.progress.md`

## Step 2: Interview (skip if --quick)

Check if `--quick` appears in `$ARGUMENTS`. If present, skip to Step 3.

### Read Context from .progress.md

Parse Intent Classification and all prior interview responses to skip already-answered questions.

**Intent-Based Question Counts:**
- TRIVIAL: 1-2 | REFACTOR: 3-5 | GREENFIELD: 5-10 | MID_SIZED: 3-7

### Brainstorming Dialogue

Apply adaptive dialogue from `${CLAUDE_PLUGIN_ROOT}/skills/interview-framework/SKILL.md`. Ask context-driven questions one at a time.

**Tasks Exploration Territory** (hints, not a script):
- **Testing thoroughness** -- minimal POC-only tests, standard unit + integration, or comprehensive E2E?
- **Deployment considerations** -- feature flags, database migrations, backward compatibility, rollback plan?
- **Execution priority** -- ship fast with shortcuts, balanced pace, or quality-first from the start?
- **Dependency ordering** -- are there tasks that must complete before others can begin?
- **Team workflow constraints** -- PR review process, CI pipeline requirements, branch strategy?
- **Browser verification** -- ask only when `autoPolicy.verificationLevel` is `strict` or the design has explicit UI/deployment risk; prefer Playwright CLI, but select Chrome DevTools MCP for GIS/WebGL/canvas/map/GPU or console/network/performance debugging.
- **Task granularity** -- do not ask by default. AutoPolicy selects the task target range. Ask only if the user explicitly requests manual sizing.

### Tasks Approach Proposals

After dialogue, propose 2-3 execution strategies. Examples (illustrative only):
- **(A)** Aggressive POC -- fewer tasks, ship in small increments, add polish later
- **(B)** Thorough -- more tasks with full test coverage and quality gates throughout
- **(C)** Phased delivery -- split into multiple PRs with clear milestones

### Store Interview & Approach

Append to `.progress.md` under "Interview Responses":
```markdown
### Tasks Interview (from tasks.md)
- [Topic 1]: [response]
- Browser verification: playwright/chrome-devtools-mcp/none/blocked -- [strategy or "auto"]
- Chosen approach: [name] -- [brief description]
```

Pass combined context to delegation prompt as "Interview Context".

## Step 3: Execute Task Generation (Agent-Based, Teams Optional)

<mandatory>
**Default path: use the normal `Agent` tool with `task-planner`. Do not require Agent Teams.**

ALL specs MUST follow POC-first workflow. Read `${CLAUDE_PLUGIN_ROOT}/references/phase-rules.md` for the mandatory 5-phase structure and phase distribution rules.

Read `${CLAUDE_PLUGIN_ROOT}/references/quality-checkpoints.md` for checkpoint insertion rules (frequency, format, final verification sequence).

Agent Teams are experimental and disabled by default in Claude Code. Use the team lifecycle only when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set and the `TeamCreate` / `TaskCreate` / `TaskList` / `SendMessage` tools are visible in the current session. If any team tool is unavailable or fails, immediately continue with the direct `Agent(agent_type: task-planner)` path. Treat this as the normal path, not a degraded path.

Direct path:

1. Optionally create a visible native task with `TaskCreate(subject: "Generate implementation tasks for $spec", activeForm: "Generating tasks")`. If unavailable or failing, continue without it.
2. Dispatch `Agent(agent_type: task-planner)` with requirements, design, interview context, and the Delegation Context below. Instruct it to:
   - Read `references/workflow-contract.md`, `references/source-coverage-audit.md`, `references/browser-verification-policy.md`, and `references/agent-output-contract.md`
   - Start `tasks.md` with `## Source Coverage Audit`, then `## Browser Verify`
   - Cover every source item; if coverage cannot be complete, stop with `TASKS_BLOCKED`
   - Break implementation into value-slice tasks, using POC-first or TDD phases only as structure
   - Create tasks with Do/Files/Done when/Verify/Commit fields
   - Keep top-level task count inside `autoPolicy.taskTargetRange`; if this requires more than 12 tasks, stop and recommend `/curdx-flow:triage`
   - Insert quality checkpoints according to `autoPolicy.reviewCadence` and `autoPolicy.verificationLevel`
   - Each task = one commit, tasks must be executable without human interaction
   - Count total tasks, output to `./specs/$spec/tasks.md`
   - If quick mode and policy verification is strict: auto-enable VE tasks. Otherwise keep VE tasks risk-triggered. For UI/full-stack work, Browser Verify must select Playwright CLI or Chrome DevTools MCP.
   - When Browser Verify selects Playwright and no E2E package script exists, include a task to add `test:e2e` or the repo's equivalent script before final verification.
   - For greenfield work (`intent.workspaceState == "empty"` or route `greenfield-spec`), include a walking-skeleton task before business slices. It must prove the selected project shape, contract, and dev runtime can start and verify together.
   - For scaffold or greenfield foundation work, prefer official or ecosystem-maintained scaffold generators for named stacks when current docs show one exists; self-author only when no trustworthy generator exists, the requested skeleton is intentionally smaller, or a custom skeleton is safer to verify.
   - Prefer `curdx-flow dev detect`, `curdx-flow dev up`, `curdx-flow dev health`, `curdx-flow dev verify`, and `curdx-flow dev down` for local runtime evidence when project scripts exist.
3. Wait for the Agent result. Require `TASKS_READY` before proceeding; if `TASKS_BLOCKED`, surface the blocking source items and stop.
4. Read `$SPEC_PATH/tasks.md`.

Optional Agent Teams path:

1. `TeamDelete()` once to release any stale team; errors are harmless.
2. `TeamCreate(team_name: "tasks-$spec")`
3. `TaskCreate(subject: "Generate implementation tasks for $spec", activeForm: "Generating tasks")`
4. `Agent(agent_type: task-planner, team_name: "tasks-$spec", name: "planner-1")` with the same prompt as the direct path.
5. Wait via automatic teammate messages or a single `TaskList` check.
6. `SendMessage(type: "shutdown_request", recipient: "planner-1")`
7. Read `./specs/$spec/tasks.md`, then `TeamDelete()`.

> **Delegation Context**: When delegating to task-planner, include these inputs:
> - **AutoPolicy**: full `.curdx-state.json::autoPolicy` JSON
> - **Granularity**: `autoPolicy.taskGranularity`, unless `granularity` explicitly overrides it
> - **Task Target**: `autoPolicy.taskTargetRange`
> - **Review Cadence**: `autoPolicy.reviewCadence`
> - **Verification Level**: `autoPolicy.verificationLevel`
> - **Value Slice Rule**: test/reproduce + implementation + verification + commit stay inside one top-level task
> - **Intent Facts**: full `.curdx-state.json::intent` JSON when present
> - **Project Topology**: full `.curdx-state.json::projectTopology` JSON when present
> - **Greenfield Rule**: if workspace is empty/greenfield, plan foundation as a walking skeleton before business slices
>
> For VE Tasks — VE1 (startup), VE2 (check), VE3 (cleanup) — generation:
> - **Browser Verification**: Playwright CLI by default, Chrome DevTools MCP for GIS/WebGL/canvas/map/GPU/rendering or console/network/performance diagnosis, none only for non-browser work
> - **Verification Tooling**: the Verification Tooling section from research.md (dev server commands, browser deps, ports, health endpoints)
> - **Strategy**: the user's chosen verification strategy, or "auto" in quick mode
</mandatory>

## Step 4: Artifact Review (Parallel Two-Stage)

<mandatory>
**Review loop must complete before walkthrough. Max 3 iterations.**

Read `.curdx-state.json::autoPolicy.reviewCadence`:
- `minimal`: skip subagent artifact review for tasks.md; run the task-planner self-check and proceed to walkthrough.
- `final`, `periodic`, `strict`: run the two-stage review below.

This step runs the **two-stage review protocol** at the tasks phase boundary: `spec-reviewer` (specCompliance) and `code-quality-reviewer` (codeQuality) are dispatched **in parallel**, in ONE message, against the frozen `tasks.md` artifact. Both reviewers must complete before reconciliation.

**Required reading before dispatch** (read once at top of step, do not skip):
- [`bounded-parallel-dispatch.md`](${CLAUDE_PLUGIN_ROOT}/references/bounded-parallel-dispatch.md) — independence criteria + the Review-domain "ALL Agent calls in ONE message" rule (anti-pattern #3 + #5–#8). Both reviewers must be spawned in the SAME message.
- [`two-stage-review.md`](${CLAUDE_PLUGIN_ROOT}/references/two-stage-review.md) — domain boundary table (specCompliance vs codeQuality), 3-layer drift defense, anti-rationalization rule, SLSA-shape verdict glossary, QuickMode behavior contract.

The two reviewers do **not** see each other's output (Layer 2 isolation). The coordinator never arbitrates findings across domains.

### 4.1 Bounded parallel dispatch (direct Agent default)

```
1. Optional TaskCreate(subject: "Spec-compliance review of tasks.md",
                       activeForm: "Reviewing tasks (spec-compliance)")
   Optional TaskCreate(subject: "Code-quality review of tasks.md",
                       activeForm: "Reviewing tasks (code-quality)")
2. # ALL Agent calls in ONE message — see bounded-parallel-dispatch.md anti-pattern #3
   Agent(agent_type: spec-reviewer,
        prompt: "Review ./specs/$spec/tasks.md for spec-compliance ONLY.
                 Upstream: design.md + requirements.md.
                 Your domain: traceability, phase artifact structure, requirement
                 coverage, artifact format. Do NOT comment on code-quality concerns
                 (smell / security / readability / test-shape) — those belong to the
                 peer code-quality-reviewer (which you do NOT see and MUST NOT
                 reference). Emit a markdown findings table and a final line
                 `REVIEW_PASS` or `REVIEW_FAIL` (byte-equal).")
   Agent(agent_type: code-quality-reviewer,
        prompt: "Review ./specs/$spec/tasks.md for code-quality ONLY.
                 Your domain: code smell / security / implementation quality /
                 readability / test quality / no-hallucinations. Do NOT comment
                 on traceability to requirements / phase artifact structure /
                 requirement coverage / artifact format / front-matter — those
                 belong to spec-reviewer (which you do NOT see and MUST NOT
                 reference). Emit a markdown findings table and a final line
                 `REVIEW_PASS` or `REVIEW_FAIL` (byte-equal).")
3. # Wait for both Agent results; collect REVIEW_PASS/REVIEW_FAIL final lines.
4. # Persist verdicts under verificationBlocks.tasks.reviews via merge-state (FR-T3 — never hand-edit state):
   curdx-flow state merge \
     "$SPEC_PATH/.curdx-state.json" \
     '{"verificationBlocks":{"tasks":{"reviews":{
        "specCompliance":{"verdict":"<PASS|FAIL>","findings":[...],"reviewerId":"spec-compliance","timestamp":"<ISO8601>"},
        "codeQuality":{"verdict":"<PASS|FAIL>","findings":[...],"reviewerId":"code-quality","timestamp":"<ISO8601>"}
     }}}}'
```

Optional Agent Teams overlay: if Agent Teams are enabled and available, create `TeamCreate(team_name: "review-tasks-$spec")`, add matching `team_name` and `name` fields to both Agent calls, wait via automatic teammate messages or one `TaskList` check, then `SendMessage(...shutdown_request...)` and `TeamDelete()`. If any team step fails, rerun or continue with the direct dual `Agent(...)` calls above.

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
    merge-state into verificationBlocks.tasks.reviews.codeQuality.advisory = true
    log warning to .progress.md; proceed to Step 5.
else:                                  # normal mode
  if specCompliance.verdict === "FAIL" OR codeQuality.verdict === "FAIL":
    # Either FAIL blocks. Display findings table, ask user (Step 5 "Run review" / "Request changes" loop).
    Iteration < 3: re-invoke task-planner with merged feedback, loop back to 4.1.
    Iteration >= 3: graceful degradation, log warning, proceed (permissive ceiling matches prior behavior).
  else:
    proceed to Step 5.
```

**Anti-rationalization**: the coordinator MUST NOT pass spec-reviewer's findings into the code-quality-reviewer prompt (or vice versa). Both verdicts are stored verbatim under `verificationBlocks.tasks.reviews`. See [`two-stage-review.md`](${CLAUDE_PLUGIN_ROOT}/references/two-stage-review.md) §2.

**Revision delegation**: Re-invoke task-planner with the merged feedback (both reviewers' findings concatenated, attributed by `reviewerId`) and design.md + requirements.md upstream context. Focus on the union of issues.

**Error handling**: Reviewer no signal = treat as REVIEW_PASS for that slot (permissive ceiling). Agent failure = retry once, then use the surviving reviewer's verdict alone (still hard-gate on specCompliance if it survived).

**Fallback**: Direct dual `Agent(...)` calls in ONE message are the default. Team failures are non-blocking unless both reviewers fail to return a verdict.
</mandatory>

## Step 5: Walkthrough & Approval

<mandatory>
**WALKTHROUGH IS REQUIRED - DO NOT SKIP.**

Read `./specs/$spec/tasks.md` and display:

```
Tasks complete for '$spec'.
Output: $PWD/specs/$spec/tasks.md

## What I Planned

**Total**: [X] tasks across 4 phases

**Phase Breakdown**:
- Phase 1 (POC): [count] tasks - proves the idea works
- Phase 2 (Refactor): [count] tasks - clean up
- Phase 3 (Testing): [count] tasks - add coverage
- Phase 4 (Quality): [count] tasks - CI/PR

**POC Milestone**: Task [X.Y] - [brief description of what's working at that point]
```
</mandatory>

### User Approval (skip if --quick)

If `--quick`, skip to Step 6.

Ask ONE question: "How do you want to proceed?" with these options via AskUserQuestion:
1. **Approve** (Recommended) -- Accept artifact as-is, advance to next phase
2. **Run review** -- Spawn spec-reviewer to validate against rubrics, show findings, then loop back to this choice
3. **Request changes** -- Provide specific feedback to revise the artifact

**If "Approve"**: proceed to Step 6.
**If "Run review"**: Invoke spec-reviewer via Agent tool with full tasks.md content (upstream: design.md + requirements.md). Display findings table. If REVIEW_PASS, note it. If REVIEW_FAIL, show feedback. Then loop back to this same 3-choice question (user decides next action).
**If "Request changes" or "Other"**:
1. Ask what to change
2. Re-invoke task-planner with direct `Agent(agent_type: task-planner)` and feedback; use the optional team lifecycle only if Agent Teams are enabled and available
3. Re-display walkthrough, ask again with same 3 choices. Loop until approved.

## Step 6: Finalize

### Update State

1. Count total tasks from generated file
2. Update `.curdx-state.json`: `{ "phase": "tasks", "totalTasks": <count>, "awaitingApproval": true }`
3. Update `.progress.md`: mark design as implicitly approved, set current phase, update task count

### Commit Spec (if enabled)

Read `commitSpec` from `.curdx-state.json`. If true:
```bash
git add ./specs/$spec/tasks.md
git commit -m "spec($spec): add implementation tasks"
git push -u origin $(git branch --show-current)
```
If commit or push fails, display warning but continue.

### Stop

<mandatory>
**STOP HERE. DO NOT PROCEED TO IMPLEMENT.**

(Does not apply in `--quick` mode.)

1. Display: `-> Next: Run /curdx-flow:implement to start execution`
2. End your response immediately
3. Wait for user to explicitly run `/curdx-flow:implement`
</mandatory>
