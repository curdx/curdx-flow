---
name: implement
description: Use when a spec has tasks.md and should enter autonomous task execution.
argument-hint: "[--max-task-iterations 5] [--max-global-iterations 30] [--goal-turns 30] [--manual] [--quick] [--recovery-mode]"
allowed-tools: "Read Write Edit Agent Bash Skill"
disable-model-invocation: true
---


# Start Execution

You are starting the task execution loop.

## Coordinator Checklist

Complete these coordination steps in order; do not create user-facing implementation tasks from this checklist:

1. **Validate prerequisites** -- check spec and tasks.md exist
2. **Parse arguments** -- extract flags and options
3. **Initialize state** -- write .curdx-state.json
4. **Start goal-driven execution** -- compile native /goal condition and delegate tasks via coordinator pattern
5. **Handle completion** -- cleanup and output ALL_TASKS_COMPLETE

## Step 1: Determine Active Spec and Validate

**Resolve**:
1. Run `curdx-flow snapshot --spec "$ARGUMENTS"` when `$ARGUMENTS` begins with a spec name; otherwise run `curdx-flow snapshot`.
2. If `snapshot.active` is false, error: "No active spec. Run /curdx-flow:new <name> first."
3. Set `$SPEC_PATH` to `snapshot.spec.fsPath`.

**Validate**:
1. Check the resolved spec directory exists
2. Check `snapshot.artifacts.tasks.exists`. If false: error "Tasks not found. Run /curdx-flow:tasks first."
3. Set `$SPEC_PATH` to the resolved spec directory path. All references use this variable.

## Step 2: Parse Arguments

From `$ARGUMENTS`:
- **--max-task-iterations**: Max retries per task (default: 5). Cap on per-task retry loop; when hit, the current task is marked failed and the retry loop breaks (US-2 / AC-2.2). Override example: `--max-task-iterations 10`.
- **--max-global-iterations**: Max total loop iterations (default: 30 per FR-D1; tightened from legacy 100 to bound cost runaway blast radius). Safety limit to prevent infinite execution loops; when hit, the coordinator halts entirely (US-1 / AC-1.1). Override example: `--max-global-iterations 100` to opt back into legacy cap. Mirrors `--max-task-iterations` parse pattern: flag value propagates into `state.maxGlobalIterations` at init.
- **--goal-turns**: Max native `/goal` turns before reporting an incomplete blocker (default: same as `--max-global-iterations`).
- **--manual**: Do not ask the user to set native `/goal`; run one coordinator turn and leave a resumable status. Use only when `/goal` is unavailable because hooks are disabled or managed policy disallows it.
- **--quick**: Non-interactive mode. Skip all confirmation prompts (branch selection, worktree creation, review approval). Branch handling per `references/branch-management.md` § Quick Mode: on the default branch auto-create a feature branch in place without prompting; on a non-default branch stay put. Quick mode also short-circuits review approval prompts in earlier phases (research, requirements, design, tasks) and trusts `autoPolicy.reviewCadence` to gate verification. Use for CI, scripted runs, or experienced users who want minimum interruption.
- **--recovery-mode**: Enable iterative failure recovery (default: false). When enabled, failed tasks trigger automatic fix task generation instead of stopping. Only affects execution failures; verification failures (Layer-3 review) follow `references/verification-layers.md` rules regardless of this flag.

Read existing `.curdx-state.json::autoPolicy` before applying defaults:
- If no explicit `--max-task-iterations`, use `autoPolicy.maxTaskIterations` when present, else 5.
- If no explicit `--max-global-iterations`, use `autoPolicy.maxGlobalIterations` when present, else 30.
- If no explicit `--goal-turns`, use the parsed max-global value.
- Ignore legacy continuation policy keys from older state files; native `/goal` is the default execution driver.

## Step 3: Initialize Execution State

Count tasks using the runtime CLI:

```bash
TASKS_JSON=$(curdx-flow tasks count "$SPEC_PATH/tasks.md")
TOTAL=$(printf '%s' "$TASKS_JSON" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>process.stdout.write(String(JSON.parse(s).total)))')
COMPLETED=$(printf '%s' "$TASKS_JSON" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>process.stdout.write(String(JSON.parse(s).completed)))')
FIRST_INCOMPLETE=$((COMPLETED))
```

**CRITICAL: Merge into existing state -- do NOT overwrite the file.**

Read the existing `.curdx-state.json` first, then **merge** the execution fields into it.
This preserves fields set by earlier phases (e.g., `source`, `name`, `basePath`, `commitSpec`, `relatedSpecs`).

Update `.curdx-state.json` by merging these fields into the existing object:
```json
{
  "phase": "execution",
  "taskIndex": "<first incomplete>",
  "totalTasks": "<count>",
  "taskIteration": 1,
  "maxTaskIterations": "<parsed from --max-task-iterations or default 5>",
  "recoveryMode": "<true if --recovery-mode flag present, false otherwise>",
  "maxFixTasksPerOriginal": 3,
  "maxFixTaskDepth": 3,
  "globalIteration": 1,
  "maxGlobalIterations": "<parsed from --max-global-iterations or default 30 (FR-D1; legacy 100 preserved on existing state files per FR-C1)>",
  "fixTaskMap": {},
  "modificationMap": {},
  "maxModificationsPerTask": 3,
  "maxModificationDepth": 2,
  "awaitingApproval": false,
  "executionDriver": "<'manual' when --manual is present, otherwise 'goal'>",
  "nativeTaskMap": {},
  "nativeSyncEnabled": true,
  "nativeSyncFailureCount": 0
}
```

Use the merge-state lib to preserve existing fields (atomic deep-merge, cross-platform):
```bash
PATCH=$(FIRST_INCOMPLETE="$FIRST_INCOMPLETE" TOTAL="$TOTAL" MAX_TASK_ITER="$MAX_TASK_ITER" RECOVERY_MODE="$RECOVERY_MODE" MAX_GLOBAL_ITER="$MAX_GLOBAL_ITER" MANUAL_MODE="$MANUAL_MODE" node -e '
const bool = (name) => /^(1|true|yes)$/i.test(process.env[name] || "");
const num = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};
console.log(JSON.stringify({
  phase: "execution",
  taskIndex: num("FIRST_INCOMPLETE", 0),
  totalTasks: num("TOTAL", 0),
  taskIteration: 1,
  maxTaskIterations: num("MAX_TASK_ITER", 5),
  recoveryMode: bool("RECOVERY_MODE"),
  maxFixTasksPerOriginal: 3,
  maxFixTaskDepth: 3,
  globalIteration: 1,
  maxGlobalIterations: num("MAX_GLOBAL_ITER", 30),
  fixTaskMap: {},
  modificationMap: {},
  maxModificationsPerTask: 3,
  maxModificationDepth: 2,
  awaitingApproval: false,
  executionDriver: bool("MANUAL_MODE") ? "manual" : "goal",
  nativeTaskMap: {},
  nativeSyncEnabled: true,
  nativeSyncFailureCount: 0
}));
')
curdx-flow state merge "$SPEC_PATH/.curdx-state.json" "$PATCH"
```

Where `$FIRST_INCOMPLETE` and `$TOTAL` come from the task count command, and `$MAX_TASK_ITER`, `$RECOVERY_MODE`, `$MAX_GLOBAL_ITER`, and `$MANUAL_MODE` come from parsed arguments (Step 2). The merge-state lib handles atomic write internally — no tmp+mv needed.

**Preserved fields** (set by earlier phases, must NOT be removed):
- `source`, `name`, `basePath`, `commitSpec`, `relatedSpecs`

**State v2 policy**: New execution state uses `version: 2`. If a legacy state blocks execution, reinitialize with `/curdx-flow:start --fresh` or rerun this skill after replacing the state file; do not silently migrate malformed state.

## Step 4: Start Goal-Driven Execution

After writing the state file, compile the native Claude Code `/goal` bridge:

```bash
curdx-flow goal --cwd "$PWD" --spec "$SPEC_PATH" --max-turns "$GOAL_TURNS"
```

Treat the JSON as the execution driver contract:
- `slashCommand` is the exact native `/goal` condition to run for unattended multi-turn execution.
- `readiness` says whether native `/goal` is actually available in this Claude Code environment. Only recommend native `/goal` when `recommendedDriver` is `native-goal`.
- `conditionLength` must be within the Claude Code limit; if it is `compressed`, keep the warning visible so the user knows the condition was shortened.
- `condition` is transcript-verifiable. Claude must surface every proof needed by the goal evaluator; the evaluator will not run commands or read files by itself.
- `evidenceProtocol` lists the proof that must appear before `ALL_TASKS_COMPLETE`.
- `warnings` explains fallback cases such as `disableAllHooks`, managed `allowManagedHooksOnly`, update-needed Claude Code versions, or condition compression.

Default path:
1. If `recommendedDriver` is `native-goal`, show the `slashCommand` prominently before the coordinator prompt.
2. Tell the user that native `/goal` drives follow-up turns. Do not claim unattended continuation unless that slash command is active and readiness is available.
3. Continue with the first coordinator turn using the prompt below.

Manual fallback:
- If `--manual` is present or `recommendedDriver` is `manual-resume`, run only the current coordinator turn.
- Leave `.curdx-state.json` resumable and print the next action instead of relying on any Stop-hook continuation.
- The Stop hook is now a deterministic safety/completion gate only; it must not be treated as the execution loop driver.

Before dispatching the first task, run:

```bash
curdx-flow last-mile --cwd "$PWD" --spec "$SPEC_PATH" --record
```

Treat the JSON as the execution autopilot contract:
- `phase` tells whether the coordinator is planning, implementing, verifying, recovering, or releasing.
- `problemTypes` tells what is currently risky: missing context, UI quality, browser evidence, repeated failure, release risk, verification gap, scope drift, or missing dependency.
- `capabilityPlan` tells when to use dependency wheels. Use `claude-mem`, `pua`, `ui-ux-pro-max`, or Chrome DevTools MCP only when their `availabilityState` is available/expected; if missing, follow `fallbackWhenMissing` and do not reimplement the wheel inside curdx-flow.
- `evidenceRequired` and `blockingGates` are completion gates. Do not output `ALL_TASKS_COMPLETE` while they are unsatisfied.
- `coordinatorInstruction` is the next action for this loop iteration.

### Coordinator Prompt

Output this prompt directly to start execution:

```text
You are the execution COORDINATOR for spec: $spec
```

Then Read and follow these references in order. They contain the complete coordinator logic:

1. **Core delegation pattern**: Read `${CLAUDE_PLUGIN_ROOT}/references/coordinator-pattern.md` and follow it.
   This covers: role definition, integrity rules, reading state, checking completion, parsing tasks, parallel group detection, task delegation (sequential, parallel, [VERIFY] tasks), modification request handling, verification layers, state updates, progress merge, completion signal, and PR lifecycle loop.

2. **Last-mile autopilot**: Read `${CLAUDE_PLUGIN_ROOT}/references/last-mile-autopilot.md` and follow it.
   This covers automatic phase detection, capability routing, dependency plugin use, evidence gates, and recovery escalation.

3. **Failure handling**: Read `${CLAUDE_PLUGIN_ROOT}/references/failure-recovery.md` and follow it.
   This covers: parsing failure output, fix task generation, fix task limits and depth checks, iterative recovery orchestrator, fix task insertion into tasks.md, fixTaskMap state tracking, and progress logging for fix chains.

4. **Verification after each task**: Read `${CLAUDE_PLUGIN_ROOT}/references/verification-layers.md` and follow it.
   This covers: 3 layers (contradiction detection, TASK_COMPLETE signal, periodic artifact review via spec-reviewer). All must pass before advancing.

5. **Phase-specific behavior**: Read `${CLAUDE_PLUGIN_ROOT}/references/phase-rules.md` and follow it.
   This covers: POC-first workflow (Phase 1-4), phase distribution, quality checkpoints, and phase-specific constraints.

6. **Commit conventions**: Read `${CLAUDE_PLUGIN_ROOT}/references/commit-discipline.md` and follow it.
   This covers: one commit per task, commit message format, spec file staging, and when to commit.

Before dispatching any task, read `.curdx-state.json::autoPolicy` and obey:
- `executionDriver`: `goal` means native `/goal` owns follow-up turns; `manual` means return a resumable status after the current turn.
- `subagentPolicy`: no implementation subagent for `none`; on-demand delegation for `on-demand`; one focused subagent per vertical slice for `per-slice`.
- `reviewCadence`: artifact review only at the cadence selected by policy.
- `verificationLevel`: targeted/standard/strict verification depth.

### Pre-Dispatch Cap Check (MANDATORY — runs every iteration, before any Agent(...) call)

CRITICAL: At the top of every iteration loop body, immediately after reading `.curdx-state.json` and BEFORE any `Agent(...)` delegation call, the coordinator MUST evaluate the cost-runaway caps. This is the coordinator-side enforcement of `maxGlobalIterations` / `maxTaskIterations` (spec-cost-runaway-guards FR-E1 / US-1 / US-2 / AC-1.1 / AC-2.2). The stop-watcher hook is the last-mile safety net; this pre-check is the first-line defense and avoids burning a dispatch round-trip when the cap is already breached.

**Step A: Read caps from state**

After reading `.curdx-state.json`, extract:
- `globalIter = state.globalIteration` (default `1` if missing)
- `maxGlobal = state.maxGlobalIterations` (default `30` per FR-D1; legacy state files may store `100` — preserve as-is)
- `taskIter = state.taskIteration` (default `1` if missing)
- `maxTask = state.maxTaskIterations` (default `5`)

**Step B: Global cap pre-check (halts loop entirely)**

If `globalIteration >= maxGlobalIterations`:
1. Do NOT delegate. Do NOT call `Agent(...)`. Do NOT advance `taskIndex`.
2. Output the D4 cost-runaway STOP message verbatim (mirrors `buildCostRunawayBlock` in `src/hooks/stop-watcher.ts` so user sees identical wording from either surface):

   ```text
   Cost runaway guard tripped: globalIteration={globalIter} >= maxGlobalIterations={maxGlobal}.
   Loop blocked. Either:
   - Investigate why your loop ran {globalIter} iterations (check .progress.md)
   - Override with: /curdx-flow:implement --max-global-iterations <higher-cap>
   - Reset by editing {state-file-path}: set globalIteration to a lower value

   Spec: {specName}  Phase: implement
   ```

3. Halt the coordinator loop. Do NOT output `ALL_TASKS_COMPLETE` (tasks remain incomplete). Do NOT output `TASK_COMPLETE`.

**Step C: Task-level cap pre-check (fails current task, breaks retry loop)**

Else if `taskIteration >= maxTaskIterations`:
1. Do NOT delegate the current task again. Mark the current task as failed in `.progress.md` (append a Learnings entry: `Task ${taskIndex} hit taskIteration cap (${taskIter} >= ${maxTask}) — marked failed, retry loop broken`).
2. Output the task-level D4 message variant verbatim:

   ```text
   Cost runaway guard tripped: taskIteration={taskIter} >= maxTaskIterations={maxTask}.
   Loop blocked. Either:
   - Investigate why your loop ran {taskIter} iterations (check .progress.md)
   - Override with: /curdx-flow:implement --max-task-iterations <higher-cap>
   - Reset by editing {state-file-path}: set taskIteration to a lower value

   Spec: {specName}  Phase: implement
   ```

3. Break the per-task retry loop. Do not advance `taskIndex` automatically — surface the failure so the user can decide whether to override the cap, fix the underlying problem, or accept the partial completion. Do NOT output `ALL_TASKS_COMPLETE`.

**Step D: Caps OK → proceed to standard delegation**

Only when both `globalIteration < maxGlobalIterations` AND `taskIteration < maxTaskIterations`, fall through to the standard task-delegation flow defined in `coordinator-pattern.md` (Parse Current Task → Parallel Group Detection → Task Delegation).

> **Defense-in-depth note**: The stop-watcher hook re-evaluates the same condition via `buildCostRunawayBlock(state)` and emits the identical message string. If this coordinator pre-check is somehow skipped (e.g., manual override of state mid-iteration), the hook still blocks. Both surfaces use the same template so the user never sees split error wording.

### Key Coordinator Behaviors (quick reference — see coordinator-pattern.md for authoritative details)

- **You are a COORDINATOR, not an implementer.** Delegate via Agent tool. Never implement yourself.
- **Fully autonomous.** Never ask questions or wait for user input.
- **State-driven loop.** Read .curdx-state.json each iteration to determine current task.
- **Completion check.** If taskIndex >= totalTasks, verify all [x] marks, mark state completed for audit, output ALL_TASKS_COMPLETE.
- **Agent delegation.** Extract full task block from tasks.md, delegate to spec-executor (or qa-engineer for [VERIFY] tasks).
- **After TASK_COMPLETE.** Run all 3 verification layers, then update state (advance taskIndex, reset taskIteration).
- **On failure.** Parse failure output, increment taskIteration. If recovery-mode: generate fix task. If max retries exceeded: error and stop.
- **Modification requests.** If TASK_MODIFICATION_REQUEST in output, process SPLIT_TASK / ADD_PREREQUISITE / ADD_FOLLOWUP per coordinator-pattern.md.

### Error States (never output ALL_TASKS_COMPLETE)

- Missing/corrupt state file: error and suggest re-running /curdx-flow:implement
- Missing tasks.md: error and suggest running /curdx-flow:tasks
- Missing spec directory: error and suggest running /curdx-flow:new
- Max retries exceeded: error with failure details, suggest manual fix then resume
- Max fix task depth/count exceeded (recovery mode): error with fix history

## Step 5: Completion

When all tasks complete (taskIndex >= totalTasks):
1. Verify all tasks marked [x] in tasks.md
2. Record final execution verification before marking completion. Use the final completed task's exact `**Verify**` command from `tasks.md`:
   ```bash
   curdx-flow verify run --phase execution --command "$VERIFY_CMD" --spec "$SPEC_PATH"
   ```
   This command actually executes the verification and writes `.curdx-state.json::verificationBlocks.execution` with the command, exit code, timestamp, and source mtime. If it exits non-zero, do not continue to completion; fix the issue and rerun verification.
3. Mark state as completed (preserve audit fields):
   ```bash
   COMPLETED_AT=$(node -e "process.stdout.write(new Date().toISOString())")
   curdx-flow state merge "$SPEC_PATH/.curdx-state.json" "{\"completed\":true,\"completedAt\":\"$COMPLETED_AT\",\"awaitingApproval\":false}"
   ```
4. Keep .progress.md (preserve learnings and history)
5. Cleanup orphaned temp progress files: `find "$SPEC_PATH" -name ".progress-task-*.md" -mmin +60 -delete 2>/dev/null || true`
6. Update spec index: `node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/update-spec-index.mjs" --quiet`
7. Commit remaining spec changes:
   ```bash
   git add "$SPEC_PATH/tasks.md" "$SPEC_PATH/.progress.md" "$SPEC_PATH/.curdx-state.json" ./specs/.index/
   git diff --cached --quiet || git commit -m "chore(spec): final progress update for $spec"
   ```
8. Check for PR link: `gh pr view --json url -q .url 2>/dev/null`
9. Output: ALL_TASKS_COMPLETE (and PR link if exists)

## Output on Start

```text
Starting execution for '$spec'

Tasks: $completed/$total completed
Starting from task $taskIndex

The execution loop will:
- Execute one task at a time
- Continue until all tasks complete or max iterations reached

Beginning execution...
```
