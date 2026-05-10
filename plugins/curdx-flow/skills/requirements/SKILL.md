---
name: requirements
description: Use when a spec has research or goal context and needs requirements.
argument-hint: "[spec-name]"
allowed-tools: "Read Write Edit Bash Task AskUserQuestion"
disable-model-invocation: true
---


# Requirements Phase

Generate requirements for the active spec. Running this command implicitly approves research. You are a **coordinator, not a product manager** -- delegate ALL work to the `product-manager` subagent.

## Checklist

Create a task for each item and complete in order:

1. **Gather context** -- resolve spec, read research and goal
2. **Interview** -- brainstorming dialogue (skip if `--quick`)
3. **Execute requirements** -- dispatch product-manager via direct Task; Agent Teams optional
4. **Artifact review** -- spec-reviewer validation loop (only if `--quick`)
5. **Walkthrough & approval** -- display summary, get user approval
6. **Finalize** -- update state, commit, stop

## Step 1: Gather Context

1. If `$ARGUMENTS` contains a spec name, use `curdx_find_spec()` to resolve it; otherwise use `curdx_resolve_current()`
2. If no active spec, error: "No active spec. Run /curdx-flow:new <name> first."
3. Check the resolved spec directory exists
4. Read `.curdx-state.json`; clear approval flag: `awaitingApproval: false`
5. Read context: `research.md` (if exists), `.progress.md`, original goal

## Step 2: Interview (skip if --quick)

Check if `--quick` appears in `$ARGUMENTS`. If present, skip to Step 3.

### Read Context from .progress.md

Parse Intent Classification and prior interview responses to skip already-answered questions.

**Intent-Based Question Counts:**
- TRIVIAL: 1-2 | REFACTOR: 3-5 | GREENFIELD: 5-10 | MID_SIZED: 3-7

### Brainstorming Dialogue

Apply adaptive dialogue from `${CLAUDE_PLUGIN_ROOT}/skills/interview-framework/SKILL.md`. Ask context-driven questions one at a time.

**Requirements Exploration Territory** (hints, not a script):
- **Primary users** -- who will use this feature? Developers, end users, specific roles?
- **Priority tradeoffs** -- speed of delivery vs code quality vs feature completeness
- **Success criteria** -- what does success look like? Metrics, behaviors, user outcomes
- **Scope boundaries** -- what is explicitly out of scope for this iteration?
- **Compliance or regulatory needs** -- security, privacy, or regulatory considerations?

### Requirements Approach Proposals

After dialogue, propose 2-3 scoping approaches. Examples (illustrative only):
- **(A)** Full feature set -- comprehensive user stories covering all use cases
- **(B)** MVP scope -- core user stories only, defer edge cases to v2
- **(C)** Phased delivery -- essential stories now, planned expansion later

### Store Interview & Approach

Append to `.progress.md` under "Interview Responses":
```markdown
### Requirements Interview (from requirements.md)
- [Topic 1]: [response]
- Chosen approach: [name] -- [brief description]
```

Pass combined context to delegation prompt as "Interview Context".

## Step 3: Execute Requirements (Task-Based, Teams Optional)

<mandatory>
**Default path: use the normal `Task` tool with `product-manager`. Do not require Agent Teams.**

Agent Teams are experimental and disabled by default in Claude Code. Use the team lifecycle only when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set and the `TeamCreate` / `TaskCreate` / `TaskList` / `SendMessage` tools are visible in the current session. If any team tool is unavailable or fails, immediately continue with the direct `Task(subagent_type: product-manager)` path. Treat this as the normal path, not a degraded path.

Direct path:

1. Optionally create a visible native task with `TaskCreate(subject: "Generate requirements for $spec", activeForm: "Generating requirements")`. If unavailable or failing, continue without it.
2. Dispatch `Task(subagent_type: product-manager)` with research context, goal, and interview context. Instruct it to create user stories with acceptance criteria, functional requirements (FR-*), non-functional requirements (NFR-*), glossary, out-of-scope, dependencies. Output to `./specs/$spec/requirements.md`.
3. Wait for the Task result, then read `./specs/$spec/requirements.md`.

Optional Agent Teams path:

1. `TeamDelete()` once to release any stale team; errors are harmless.
2. `TeamCreate(team_name: "requirements-$spec")`
3. `TaskCreate(subject: "Generate requirements for $spec", activeForm: "Generating requirements")`
4. `Task(subagent_type: product-manager, team_name: "requirements-$spec", name: "pm-1")` with the same prompt as the direct path.
5. Wait via automatic teammate messages or a single `TaskList` check.
6. `SendMessage(type: "shutdown_request", recipient: "pm-1")`
7. Read `./specs/$spec/requirements.md`, then `TeamDelete()`.
</mandatory>

## Step 4: Artifact Review (only in --quick mode)

<mandatory>
**Review loop must complete before walkthrough. Max 3 iterations.**

If NOT `--quick`, skip to Step 5.

Invoke `spec-reviewer` via Task tool. Follow the standard review loop:
- REVIEW_PASS: log to .progress.md, proceed
- REVIEW_FAIL (iteration < 3): log, re-invoke product-manager with feedback, loop
- REVIEW_FAIL (iteration >= 3): graceful degradation, log warning, proceed
- No signal: treat as REVIEW_PASS (permissive)

**Review delegation**: Include full requirements.md content, iteration count, prior findings. Upstream: research.md.

**Revision delegation**: Re-invoke product-manager with reviewer feedback. Focus on specific issues.

**Error handling**: Reviewer no signal = REVIEW_PASS. Agent failure = retry once, then use original.
</mandatory>

## Step 5: Walkthrough & Approval

<mandatory>
**WALKTHROUGH IS REQUIRED - DO NOT SKIP.**

Read `./specs/$spec/requirements.md` and display:

```
Requirements complete for '$spec'.
Output: $PWD/specs/$spec/requirements.md

## What I Created

**Goal**: [1 sentence summary]

**User Stories** ([count] total):
- US-1: [title]
- US-2: [title]
- US-3: [title]
[list all, keep titles brief]

**Requirements**: [X] functional, [Y] non-functional
```
</mandatory>

### User Approval (skip if --quick)

If `--quick`, skip to Step 6.

Ask ONE question: "How do you want to proceed?" with these options via AskUserQuestion:
1. **Approve** (Recommended) -- Accept artifact as-is, advance to next phase
2. **Run review** -- Spawn spec-reviewer to validate against rubrics, show findings, then loop back to this choice
3. **Request changes** -- Provide specific feedback to revise the artifact

**If "Approve"**: proceed to Step 6.
**If "Run review"**: Invoke spec-reviewer via Task tool with full requirements.md content (upstream: research.md). Display findings table. If REVIEW_PASS, note it. If REVIEW_FAIL, show feedback. Then loop back to this same 3-choice question (user decides next action).
**If "Request changes" or "Other"**:
1. Ask what to change
2. Re-invoke product-manager with direct `Task(subagent_type: product-manager)` and feedback; use the optional team lifecycle only if Agent Teams are enabled and available
3. Re-display walkthrough, ask again with same 3 choices. Loop until approved.

## Step 6: Finalize

### Update State

1. **Merge** into `.curdx-state.json` (preserve all existing fields):
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/lib/merge-state.mjs" \
     "$SPEC_PATH/.curdx-state.json" '{"phase":"requirements","awaitingApproval":true}'
   ```
2. Update `.progress.md`: mark research as implicitly approved, set current phase

### Commit Spec (if enabled)

Read `commitSpec` from `.curdx-state.json`. If true:
```bash
git add ./specs/$spec/requirements.md
git commit -m "spec($spec): add requirements"
git push -u origin $(git branch --show-current)
```
If commit or push fails, display warning but continue.

### Stop

<mandatory>
**STOP HERE. DO NOT PROCEED TO DESIGN.**

(Does not apply in `--quick` mode.)

1. Display: `-> Next: Run /curdx-flow:design`
2. End your response immediately
3. Wait for user to explicitly run `/curdx-flow:design`
</mandatory>
