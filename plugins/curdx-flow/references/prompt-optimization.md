# Prompt Optimization

Use this reference for `/curdx-flow:prompt-optimize`.

## Boundary

Prompt optimization is advisory only. It never implements the task, writes files,
creates specs, runs implementation commands, commits, pushes, or tags.

## Diagnosis Checklist

- What is the user's actual goal?
- What route should curdx-flow use?
- Which stack profile is likely relevant?
- Which skill or agent should be invoked later?
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
