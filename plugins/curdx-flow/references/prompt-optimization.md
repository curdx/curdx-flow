# Prompt Optimization

Use this reference for `/curdx-flow:prompt-optimize`.

## Boundary

Prompt optimization is advisory only. It never implements the task, writes files,
creates specs, runs implementation commands, commits, pushes, or tags.
When it runs `curdx-flow route --compile`, do not pass `--record`; prompt
optimization must not write `.curdx/brain.jsonl`.

## Diagnosis Checklist

- What is the user's actual goal?
- What route should curdx-flow use?
- Which stack profile is likely relevant?
- Which skill or agent should be invoked later?
- Which existing wheel owns the needed capability?
- What acceptance criteria are missing?
- What context should be read first?
- What quality gates prove completion?
- What risks must be named before execution?

## Optimized Prompt Shape

An optimized prompt should be directly pasteable as a normal curdx-flow task
request. It should include:

- Goal
- Current project or stack facts
- In-scope behavior
- Out-of-scope behavior
- Acceptance criteria
- Suggested curdx-flow route or skill
- Required verification evidence
- Release constraints when relevant

## Wheel-First Policy

Do not ask curdx-flow to rebuild capabilities already owned by companion tools:

- `claude-mem`: cross-session memory and prior-observation search.
- `pua`: recovery after repeated failures or bounded parallel decomposition.
- `chrome-devtools-mcp`: real Chrome console, network, DOM, performance, and
  visual evidence.
- `frontend-design`: visible UI, interaction, layout, and visual quality.
- `context7`: current external library, SDK, API, and framework docs.
- `sequential-thinking`: high-risk architecture, debugging, and assumption
  analysis.

curdx-flow's role is route selection, quality gates, execution brief, and
evidence recording. If `availabilityState` is `missing`, say the optimized
prompt should either skip that wheel or fix setup first.
Do not ask curdx-flow to add plugin-local MCP config for `context7` or
`sequential-thinking`; they are expected external MCPs in this environment.

## Missing Context Policy

Ask for missing facts only when they materially alter route, architecture,
security, data model, verification, or release behavior. Otherwise state a
conservative assumption in the optimized prompt.

## Risk Policy

Always surface these risks when present:

- Claude Code plugin docs-sensitive behavior
- auth, permission, secrets, payments, database, or release changes
- browser-facing behavior without repeatable browser proof
- multi-root or split-repo changes
- unclear MVP/success criteria in empty workspaces
