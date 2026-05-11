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
   curdx-flow route \
     --name "$name" \
     --goal "$goal" \
     --flags "$ARGUMENTS"
   ```
3. Treat the returned `route` as the source of truth. Do not invent a different workflow unless the router says `blocked-ask-user` and the user's answer changes the facts.
4. If the router returns `recommendedCapabilities`, treat them as tool-use hints, not mandatory steps. `availability: core-required` means the curdx-flow bundle expects that companion to be installed by default (`context7`, `claude-mem`, `frontend-design`, `chrome-devtools-mcp`, `sequential-thinking`, `pua`). `availability: check-if-installed` is reserved for future non-core capabilities; check the current Claude Code tool/skill surface before invoking those.

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
- If `recommendedCapabilities` includes `context7`, `claude-mem`, `frontend-design`, `chrome-devtools-mcp`, `sequential-thinking`, or `pua`, use the recommendation only at its listed phase and only when it materially reduces uncertainty or verifies real behavior. If a future recommendation is marked `check-if-installed`, skip silently when that capability is absent.
- If the route says `epic-split`, stop single-spec creation and run triage.
- If a spec state is created, store `autoPolicy` for compatibility and set `maxGlobalIterations` from policy, defaulting to 30 if the helper fails.

## New Spec Creation

For `lite-spec` and `full-spec`:

1. Ensure the current branch is appropriate using `${CLAUDE_PLUGIN_ROOT}/references/branch-management.md`.
2. Validate or ask for a kebab-case spec name only if missing.
3. Validate or ask for the goal only if missing.
4. Resolve the spec directory from `--specs-dir` or the default specs dir.
5. Create the spec directory, update `$defaultDir/.current-spec`, and ensure `.gitignore` covers `$defaultDir/.current-spec`, `$defaultDir/.current-epic`, and `**/.progress.md`.
   - If writing the marker under the default specs dir, write only the bare spec name, e.g. `greet-helper`.
   - If writing a non-default spec root, write the relative path, e.g. `packages/api/specs/auth-flow`.
   - Do not write `specs/<name>` for default-root specs; that can be interpreted as a path by newer runtime resolvers.
   - Do not write a project-root `.current-spec`; runtime state lives under the configured specs root.
   - Preferred write pattern:
     ```bash
     mkdir -p "$defaultDir"
     if [ "$basePath" = "$defaultDir/$name" ]; then
       printf '%s\n' "$name" > "$defaultDir/.current-spec"
     else
       printf '%s\n' "$basePath" > "$defaultDir/.current-spec"
     fi
     ```
6. Compute compatibility policy:
   ```bash
   ROUTE_JSON=$(curdx-flow route --name "$name" --goal "$goal" --flags "$ARGUMENTS")
   POLICY_JSON=$(printf '%s' "$ROUTE_JSON" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>process.stdout.write(JSON.stringify(JSON.parse(s).policy)))')
   ```
7. Initialize `.curdx-state.json` with:
   ```json
   {
     "version": 2,
     "source": "spec",
     "name": "$name",
     "basePath": "$basePath",
     "identity": { "name": "$name", "basePath": "$basePath", "goal": "$goal" },
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
     "route": "<ROUTE_JSON compact object>",
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

## Quick Artifact Contract

When `--quick` causes this skill to generate phase artifacts inline instead of delegating through each phase command:

- `tasks.md` must still use the task-planner format contract.
- Start `tasks.md` with `## Source Coverage Audit`.
- Every executable top-level task must be a checkbox list item, not a heading:

```markdown
- [ ] 1.1 Implement greet helper
  - **Do**:
    1. Edit `src/greet.js`
    2. Run `npm test`
  - **Files**: `src/greet.js`, `test/greet.test.js`
  - **Done when**: `greet(" Ada ")` and empty-name fallback pass
  - **Verify**: `npm test`
  - **Commit**: `feat(greet): implement greeting helper`
  - _Requirements: FR-1, AC-1_
```

- Do not create heading-only task sections such as `## T1`; runtime task parsing ignores them and `/curdx-flow:status` will report `empty-tasks`.
- If implementation is completed in the same quick run, mark the checkbox `[x]`, set `completed: true`, and leave `taskIndex` equal to the number of top-level checkbox tasks.

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
