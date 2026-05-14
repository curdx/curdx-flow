---
name: start
description: Use when starting curdx-flow, creating a spec, resuming work, or routing intent.
argument-hint: "[name] [goal] [--fresh] [--quick] [--mode auto|fast|deep] [--task-granularity auto|coarse|standard|fine] [--review minimal|standard|strict] [--commit-spec] [--no-commit-spec] [--specs-dir <path>]"
allowed-tools: "Read Write Edit Bash Agent Skill AskUserQuestion"
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
   For routes that are not `direct-change` or `blocked-ask-user`, compile the
   execution contract before planning:
   ```bash
   curdx-flow route --compile --record \
     --name "$name" \
     --goal "$goal" \
     --flags "$ARGUMENTS"
   ```
3. Run the last-mile autopilot:
   ```bash
   curdx-flow last-mile \
     --name "$name" \
     --goal "$goal"
   ```
   Treat `phase`, `problemTypes`, `capabilityPlan`, `evidenceRequired`, and
   `coordinatorInstruction` as the automatic execution policy. Do not ask the
   user which skill to run when the autopilot already identifies the needed
   capability.
4. Treat the returned `route` and `intent` as the source of truth. Do not invent a different workflow unless the router says `blocked-ask-user` and the user's answer changes the facts.
4. Always read these adaptive facts before acting:
   - `topology.workspaceState`: `empty`, `scaffolded`, `existing`, or `split-repo`
   - `intent.intentKind`: `scaffold`, `product`, `prototype`, `import-spec`, `feature`, `fix`, `refactor`, `release`, or `unknown`
   - `intent.clarity`, `intent.stackSpecified`, `intent.artifactProvided`, `intent.deliveryExpectation`, and `intent.missingFacts`
5. If the router returns `recommendedCapabilities`, treat them as phase-specific hints, not mandatory steps. `availabilityState` is the operational signal: `available` means visible now, `expected` means the environment should provide it, and `missing` means skip or fix setup before relying on it. `availability: plugin-dependency` means a Claude Code plugin dependency; `availability: external-expected` means an MCP provided by the user's external setup such as `context7` or `sequential-thinking`. curdx-flow recommends existing wheels (`context7`, `claude-mem`, `frontend-design`, `ui-ux-pro-max`, `chrome-devtools-mcp`, `sequential-thinking`, `pua`) and must not reimplement or bundle duplicate MCP config for them. Workflow/policy hints such as `docs-query`, `tdd-cycle`, `security-review`, `stack-specific-verification`, and `context-budget` need no installation.
6. For last-mile phase/capability/evidence interpretation, use `${CLAUDE_PLUGIN_ROOT}/references/last-mile-autopilot.md`.
7. For stack profile, quality gates, suggested verifier, and context-budget interpretation, use `${CLAUDE_PLUGIN_ROOT}/references/intelligent-routing.md` only when the compact router output is insufficient.
8. For execution brief fields, completion contract, and `.curdx/brain.jsonl` interpretation, use `${CLAUDE_PLUGIN_ROOT}/references/execution-brief.md` only when the compact brief output is insufficient.

## Route Actions

| Route | Action |
|---|---|
| `resume-current` | Resume the active spec at `nextAction`. Do not create a new spec. |
| `direct-change` | Handle the change directly in the current turn. Do not create a spec or `tasks.md`. |
| `lite-spec` | Create a lightweight spec, then generate 1-3 value-slice tasks. |
| `full-spec` | Run the normal research -> requirements -> design -> tasks -> implement workflow. |
| `epic-split` | Invoke `/curdx-flow:triage` with the same goal. Do not force the work into one spec. |
| `scaffold` | Select the best scaffold source, create only the explicitly requested skeleton, write assumptions, then run baseline verification. |
| `product-inception` | Create product context before application code: mission, constraints, roadmap, tech-stack assumptions, and constitution. |
| `greenfield-spec` | Create a greenfield spec with product context, technical plan, walking skeleton, and vertical-slice tasks. |
| `prototype` | Create a bounded prototype spec with an explicit success criterion and minimal verification loop. |
| `import-spec` | Import the provided PRD/spec/design/API artifact into curdx-flow phase artifacts, then plan implementation. |
| `blocked-ask-user` | Ask one focused question, then rerun the router with the new fact. |

If `blocked-ask-user` includes `topology.missingRoots`, do not ask an open-ended question. Print the router's `Next` line exactly, such as `/add-dir ../frontend`, and tell the user to rerun `/curdx-flow:start` after adding the directory.

## Hard Rules

- Use behavior route names exactly as returned: `direct-change`, `lite-spec`, `full-spec`, `epic-split`, `scaffold`, `product-inception`, `greenfield-spec`, `prototype`, `import-spec`, `resume-current`, `blocked-ask-user`.
- Top-level tasks are value slices. Never split a slice into separate "write test", "write implementation", "run test", or "commit" tasks.
- If the route says `direct-change`, skip branch prompts, spec creation, phase documents, task planning, and subagents unless the user explicitly asks for them.
- If the route says `scaffold`, do only what the user explicitly asked to scaffold. Prefer official or ecosystem-maintained generators for the named stack when current docs show one exists; self-author the skeleton only when that is safer, smaller, or no trustworthy generator exists. Record assumptions in `CLAUDE.md` or `.curdx/assumptions.md` when no project convention exists, then run the best detected baseline command through `curdx-flow dev verify` or the project equivalent.
- If the route says `product-inception`, do not write application source yet. Produce compact product context artifacts and ask at most the missing high-leverage questions from `intent.missingFacts`.
- If the route says `greenfield-spec`, bootstrap curdx-flow artifacts before app code: product context, constitution, requirements, design, tasks, then implementation.
- If the route says `prototype`, constrain scope to a success criterion; do not silently expand it into a production product.
- If the route says `import-spec`, preserve source artifact traceability in research/requirements/design/tasks rather than re-interviewing from scratch.
- If `recommendedCapabilities` includes tool, workflow, or policy hints, use the recommendation only at its listed phase and only when it materially reduces uncertainty, improves context efficiency, or verifies real behavior. If a future recommendation is marked `check-if-installed`, skip silently when that capability is absent.
- If the route says `epic-split`, stop single-spec creation and run triage.
- If a spec state is created, store `autoPolicy` for compatibility and set `maxGlobalIterations` from policy, defaulting to 30 if the helper fails.

## Empty Workspace Rules

An empty folder is not a small feature request. When
`topology.workspaceState == "empty"`, route by intent:

- `scaffold`: the user named a stack or starter and expects files now.
- `product-inception`: the user has a product idea but missing domain, user,
  MVP, or acceptance facts.
- `greenfield-spec`: the product and stack are clear enough to plan a usable
  app.
- `prototype`: the user wants a demo/POC/spike.
- `import-spec`: the user supplied or referenced a PRD, design, OpenAPI, or
  other source artifact.

For greenfield work, create or preserve these context artifacts before coding:

```text
docs/mission.md          # product/user/problem
docs/roadmap.md          # first usable slice and later slices
docs/tech-stack.md       # chosen stack and assumptions
docs/constitution.md     # quality, testing, security, UX, deployment rules
```

If the user already has equivalent files, reuse them. Do not create a separate
methodology folder when the repository has a better convention.

The first implementation task in a greenfield app must be a walking skeleton:
selected runtime roots, contract, dev environment, and verification command run
together. For example, a full-stack app should prove a real UI route can call
a real service health/status endpoint before business features begin.

Use `${CLAUDE_PLUGIN_ROOT}/references/greenfield-delivery.md` as the detailed
contract for these artifacts and tasks.

## Scaffold Source Selection

For `scaffold`, choose the source before writing files:

1. Identify the requested target shape: frontend app, backend service,
   full-stack workspace, CLI, library, plugin, data tool, or another explicit
   shape from the user.
2. When the user named a stack or framework, check the latest official docs or
   trusted ecosystem docs for the current scaffold command/API before running
   it. Treat package-manager create flows, documented remote initializer APIs,
   framework CLIs, templates, and project-local generators as candidates. Do
   not make any single stack special in the route logic.
3. Prefer non-global, repeatable commands (`npm create`, `pnpm create`,
   `npx`, package-manager `dlx`, `curl` to a documented initializer API, or a
   project-local generator). Avoid installing global CLIs.
4. If the generator is interactive and missing choices materially affect the
   result, ask one focused question. Otherwise choose conservative defaults
   from the user's request and record them.
5. Self-author the scaffold only when no trustworthy generator exists, the
   generator cannot satisfy the requested constraints, the requested skeleton is
   intentionally smaller than the generator output, or a custom skeleton is
   clearly easier to verify. Record the reason.
6. After generation, normalize scripts and run baseline verification. Do not
   claim the scaffold works without evidence.

## New Spec Creation

For `lite-spec`, `full-spec`, `greenfield-spec`, `prototype`, and `import-spec`:

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
     "executionDriver": "goal",
     "autoPolicy": "<POLICY_JSON object>",
     "route": "<ROUTE_JSON compact object>",
     "intent": "<ROUTE_JSON.intent object>",
     "completed": false
   }
   ```
8. Create `.progress.md` with the original goal and the selected behavior route.

If policy computation fails, use this fallback cap:

```json
{ "maxGlobalIterations": 30 }
```

For `lite-spec`, keep interviews minimal and generate only 1-3 value-slice tasks.
For `full-spec`, continue with research and the normal phase flow.
For `greenfield-spec`, include product context and constitution before design,
then require a walking-skeleton task before feature slices.
For `prototype`, keep tasks bounded to the success criterion.
For `import-spec`, keep traceability to the imported source artifact in every
phase artifact.

When a spec state is created and router output includes `topology`, `intent`, or `recommendedCapabilities`, store compact copies in `.curdx-state.json` as `projectTopology`, `intent`, and `recommendedCapabilities`. If last-mile output is available, store a compact `lastMile` object with `phase`, `problemType`, `problemTypes`, `capabilityPlan`, `evidenceRequired`, and `lastDecisionAt`.

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
- If implementation is completed in the same quick run, run the final task's exact **Verify** command through the runtime recorder before marking completion:
  ```bash
  curdx-flow verify run --phase execution --command "<exact Verify command>" --spec "$name"
  ```
  This command actually executes the verification, records `.curdx-state.json::verificationBlocks.execution` with the command, exit code, timestamp, and source mtime, and returns the verification exit code. If the verification fails, do not set `completed: true`; fix the issue and rerun the recorder.
- After recorded verification passes, mark the checkbox `[x]`, set `completed: true`, and leave `taskIndex` equal to the number of top-level checkbox tasks.

## Skill Discovery

Only scan and invoke additional skills when the route is `lite-spec`, `full-spec`, `greenfield-spec`, `prototype`, or `import-spec`. Match skills by semantic relevance to the goal. Skip discovery for `direct-change` and `scaffold` unless the user explicitly asks to use a skill.

## Output

Always start with a short routing summary:

```text
Route: <route>
Reason: <reason>
Next: <nextAction>
```

Then perform the next action. If the route is `blocked-ask-user`, ask exactly one focused question.
