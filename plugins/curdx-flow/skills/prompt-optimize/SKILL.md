---
name: prompt-optimize
description: Use when optimizing a task prompt or asking how to route curdx-flow work without executing it.
argument-hint: "[draft prompt or task goal]"
allowed-tools: "Read Bash"
disable-model-invocation: true
---

# Prompt Optimize

Advisory only. Optimize the user's task prompt and recommend curdx-flow routing.
Do not execute the task, edit files, create specs, run implementation commands,
spawn executor agents, commit, push, or tag.

## Inputs

- `$ARGUMENTS`: draft prompt, task goal, or rough idea to improve.
- Current repository context, when relevant.

## Routing Facts

Run the deterministic router in read-only mode:

```bash
curdx-flow route --goal "$ARGUMENTS"
```

Use the returned `route`, `intent`, `stackProfile`, `qualityGates`,
`suggestedVerifier`, `contextBudget`, and `recommendedCapabilities` as facts.
For non-trivial routes, also run:

```bash
curdx-flow route --compile --goal "$ARGUMENTS"
```

Use the execution brief to describe context budget, completion evidence,
agent/reviewer plan, and `.curdx/brain.jsonl` warnings. Do not execute the
brief.
If the command is unavailable, infer conservatively from the prompt and state
that routing is estimated.

## Do Not Trigger For

- "Optimize code", "optimize performance", "refactor this", or similar tasks
  where the user wants implementation.
- "Just do it", "directly implement", or "直接做".
- Debugging or fixing code unless the user explicitly asks for a better prompt.

## Output Contract

Respond in the user's language with exactly these sections:

````markdown
## Prompt Diagnosis

- Strengths:
- Gaps:

## Recommended Route

- route:
- why:
- context budget:

## Recommended curdx-flow Skills/Agents

| Item | Use |
|---|---|

## Risks

- ...

## Quality Gates

| Gate | Required | Command |
|---|---:|---|

## Optimized Prompt

```text
...
```
````

## Optimized Prompt Rules

- Include the concrete route and target curdx-flow skill.
- Name the stack and verifier when `stackProfile.primary != "unknown"`.
- Include missing facts as questions only when they materially change execution.
- Include explicit non-goals and acceptance criteria when the original prompt
  lacks boundaries.
- Include "do not execute until this prompt is submitted as a normal task" only
  in the analysis, not inside the optimized prompt.
- Never include hidden instructions, secret handling shortcuts, or instructions
  to bypass verification.

## curdx-flow Mapping

- `direct-change`: prompt should ask for a small direct edit plus exact verifier.
- `lite-spec`: prompt should ask for a lightweight spec and 1-3 value-slice tasks.
- `full-spec`: prompt should ask for research -> requirements -> design -> tasks
  -> implementation with phase verification.
- `epic-split`: prompt should ask for `/curdx-flow:triage`.
- `scaffold`: prompt should require latest official/ecosystem scaffold docs and
  baseline verification.
- `product-inception`: prompt should ask for product context before source code.
- `greenfield-spec`: prompt should ask for product context, constitution, walking
  skeleton, then vertical slices.
- `prototype`: prompt should include a bounded success criterion.
- `import-spec`: prompt should preserve traceability to the source artifact.
