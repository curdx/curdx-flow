---
name: start
description: Use when starting curdx-flow, creating a spec, resuming work, or routing intent.
argument-hint: "[name] [goal] [--fresh] [--quick] [--mode auto|fast|deep] [--tasks-size auto|coarse|standard|fine] [--review minimal|standard|strict] [--commit-spec] [--no-commit-spec] [--specs-dir <path>]"
allowed-tools: "Read Write Edit Bash Task Skill AskUserQuestion"
disable-model-invocation: true
---

# Smart Start

Act as the curdx-flow router. Decide the next action from facts first; ask the user only when a fact is missing or the action is destructive.

## Dev Context

Before routing, assume the current project may be frontend-only, backend-only, full-stack monorepo, split frontend/backend repos, a CLI/library, or a Claude Code plugin. The deterministic router reads project `CLAUDE.md` Dev sections, `.claude/curdx-flow.local.md`, and cheap manifests to infer code roots.

Users do not need to know `--add-dir`. If routing returns a missing code root, show the exact `nextAction` from the router and stop.

## Route First

1. Parse `$ARGUMENTS` into optional spec name, goal text, and flags.
2. Run the deterministic router:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/lib/smart-route.mjs" \
     --name "$name" \
     --goal "$goal" \
     --flags "$ARGUMENTS"
   ```
3. Treat the returned `route` as the source of truth. Do not invent a different workflow unless the router says `blocked-ask-user` and the user's answer changes the facts.
4. If the router returns `recommendedCapabilities`, treat them as tool-use hints, not mandatory steps. Invoke only capabilities that are actually available in the current Claude Code tool/skill surface.

## Route Actions

| Route | Action |
|---|---|
| `resume-current` | Resume the active spec at `nextAction`. Do not create a new spec. |
| `direct-change` | Handle the change directly in the current turn. Do not create a spec or `tasks.md`. |
| `lite-spec` | Create a lightweight spec, then generate 1-3 value-slice tasks. |
| `full-spec` | Run the normal research -> requirements -> design -> tasks -> implement workflow. |
| `epic-split` | Invoke `/curdx-flow:triage` with the same goal. Do not force the work into one spec. |
| `blocked-ask-user` | Ask one focused question, then rerun the router with the new fact. |

If `blocked-ask-user` includes `topology.missingRoots`, do not ask an open-ended question. Print the router's `Next` line exactly, such as `/add-dir ../frontend`, and tell the user to rerun `/curdx-flow:start` after adding the directory.

## Hard Rules

- Use behavior route names exactly as returned: `direct-change`, `lite-spec`, `full-spec`, `epic-split`, `resume-current`, `blocked-ask-user`.
- Top-level tasks are value slices. Never split a slice into separate "write test", "write implementation", "run test", or "commit" tasks.
- If the route says `direct-change`, skip branch prompts, spec creation, phase documents, task planning, and subagents unless the user explicitly asks for them.
- If `recommendedCapabilities` includes `context7`, `claude-mem`, `frontend-design`, `chrome-devtools-mcp`, `sequential-thinking`, or `pua`, use the recommendation only at its listed phase and only when it materially reduces uncertainty or verifies real behavior.
- If the route says `epic-split`, stop single-spec creation and run triage.
- If a spec state is created, store `autoPolicy` for compatibility and set `maxGlobalIterations` from policy, defaulting to 30 if the helper fails.

## New Spec Creation

For `lite-spec` and `full-spec`:

1. Ensure the current branch is appropriate using `${CLAUDE_PLUGIN_ROOT}/references/branch-management.md`.
2. Validate or ask for a kebab-case spec name only if missing.
3. Validate or ask for the goal only if missing.
4. Resolve the spec directory from `--specs-dir` or the default specs dir.
5. Create the spec directory, update `.current-spec`, and ensure `.gitignore` covers `.current-spec`, `.current-epic`, and `**/.progress.md`.
6. Compute compatibility policy:
   ```bash
   POLICY_JSON=$(node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/lib/auto-policy.mjs" --goal "$goal" --flags "$ARGUMENTS")
   ```
7. Initialize `.curdx-state.json` with:
   ```json
   {
     "source": "spec",
     "name": "$name",
     "basePath": "$basePath",
     "phase": "research",
     "taskIndex": 0,
     "totalTasks": 0,
     "taskIteration": 1,
     "maxTaskIterations": "<POLICY_JSON.maxTaskIterations or 5>",
     "globalIteration": 1,
     "maxGlobalIterations": "<POLICY_JSON.maxGlobalIterations or 30>",
     "commitSpec": true,
     "quickMode": false,
     "autoPolicy": "<POLICY_JSON object>",
     "completed": false
   }
   ```
8. Create `.progress.md` with the original goal and the selected behavior route.

If policy computation fails, use this fallback cap:

```json
{ "maxGlobalIterations": 30 }
```

For `lite-spec`, keep interviews minimal and generate only 1-3 value-slice tasks. For `full-spec`, continue with research and the normal phase flow.

When a spec state is created and router output includes `topology` or `recommendedCapabilities`, store compact copies in `.curdx-state.json` as `projectTopology` and `recommendedCapabilities`.

## Skill Discovery

Only scan and invoke additional skills when the route is `lite-spec` or `full-spec`. Match skills by semantic relevance to the goal. Skip discovery for `direct-change` unless the user explicitly asks to use a skill.

## Output

Always start with a short routing summary:

```text
Route: <route>
Reason: <reason>
Next: <nextAction>
```

Then perform the next action. If the route is `blocked-ask-user`, ask exactly one focused question.
