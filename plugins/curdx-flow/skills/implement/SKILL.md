---
name: implement
description: Start task execution loop
argument-hint: "[--max-task-iterations 5] [--max-global-iterations 30] [--recovery-mode]"
allowed-tools: "Read Write Edit Task Bash Skill"
disable-model-invocation: true
---


# Start Execution

You are starting the task execution loop.

## Checklist

Create a task for each item and complete in order:

1. **Validate prerequisites** -- check spec and tasks.md exist
2. **Parse arguments** -- extract flags and options
3. **Initialize state** -- write .curdx-state.json
4. **Execute task loop** -- delegate tasks via coordinator pattern
5. **Handle completion** -- cleanup and output ALL_TASKS_COMPLETE

## Step 1: Determine Active Spec and Validate

**Multi-Directory Resolution**: This command uses the path resolver for dynamic spec path resolution.
- `curdx_resolve_current()` -- resolves .current-spec to full path (bare name = ./specs/$name, full path = as-is)
- `curdx_find_spec(name)` -- find spec by name across all configured roots

**Configuration**: Specs directories are configured in `.claude/curdx-flow.local.md`:
```yaml
specs_dirs: ["./specs", "./packages/api/specs", "./packages/web/specs"]
```

**Resolve**:
1. If `$ARGUMENTS` contains a spec name, use `curdx_find_spec()` to resolve it
2. Otherwise, use `curdx_resolve_current()` to get the active spec path
3. If no active spec, error: "No active spec. Run /curdx-flow:new <name> first."

**Validate**:
1. Check the resolved spec directory exists
2. Check the spec's tasks.md exists. If not: error "Tasks not found. Run /curdx-flow:tasks first."
3. Set `$SPEC_PATH` to the resolved spec directory path. All references use this variable.

## Step 2: Parse Arguments

From `$ARGUMENTS`:
- **--max-task-iterations**: Max retries per task (default: 5). Cap on per-task retry loop; when hit, the current task is marked failed and the retry loop breaks (US-2 / AC-2.2). Override example: `--max-task-iterations 10`.
- **--max-global-iterations**: Max total loop iterations (default: 30 per FR-D1; tightened from legacy 100 to bound cost runaway blast radius). Safety limit to prevent infinite execution loops; when hit, the coordinator halts entirely (US-1 / AC-1.1). Override example: `--max-global-iterations 100` to opt back into legacy cap. Mirrors `--max-task-iterations` parse pattern: flag value propagates into `state.maxGlobalIterations` at init.
- **--recovery-mode**: Enable iterative failure recovery (default: false). When enabled, failed tasks trigger automatic fix task generation instead of stopping.

## Step 3: Initialize Execution State

Count tasks using these exact commands:

```bash
TOTAL=$(grep -c -e '- \[.\]' "$SPEC_PATH/tasks.md" 2>/dev/null || echo 0)
COMPLETED=$(grep -c -e '- \[x\]' "$SPEC_PATH/tasks.md" 2>/dev/null || echo 0)
FIRST_INCOMPLETE=$((COMPLETED))
```

Key: Use `-e` flag so grep doesn't interpret the pattern's leading hyphen as an option.

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
  "nativeTaskMap": {},
  "nativeSyncEnabled": true,
  "nativeSyncFailureCount": 0
}
```

Use the merge-state lib to preserve existing fields (atomic deep-merge, cross-platform):
```bash
PATCH=$(node -e "console.log(JSON.stringify({phase:'execution',taskIndex:$FIRST_INCOMPLETE,totalTasks:$TOTAL,taskIteration:1,maxTaskIterations:$MAX_TASK_ITER,recoveryMode:$RECOVERY_MODE,maxFixTasksPerOriginal:3,maxFixTaskDepth:3,globalIteration:1,maxGlobalIterations:$MAX_GLOBAL_ITER,fixTaskMap:{},modificationMap:{},maxModificationsPerTask:3,maxModificationDepth:2,awaitingApproval:false,nativeTaskMap:{},nativeSyncEnabled:true,nativeSyncFailureCount:0}))")
node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/lib/merge-state.mjs" "$SPEC_PATH/.curdx-state.json" "$PATCH"
```

Where `$MAX_TASK_ITER`, `$RECOVERY_MODE`, `$MAX_GLOBAL_ITER` come from parsed arguments (Step 2). The merge-state lib handles atomic write internally — no tmp+mv needed.

**Preserved fields** (set by earlier phases, must NOT be removed):
- `source`, `name`, `basePath`, `commitSpec`, `relatedSpecs`

**Backwards Compatibility**: State files from earlier versions may lack new fields. The system handles missing fields gracefully with defaults (globalIteration: 1, maxGlobalIterations: 30 for new init per FR-D1; legacy state files storing 100 are preserved as-is per FR-C1, maxFixTaskDepth: 3, modificationMap: {}, maxModificationsPerTask: 3, maxModificationDepth: 2, nativeTaskMap: {}, nativeSyncEnabled: true, nativeSyncFailureCount: 0).

## Step 4: Execute Task Loop

After writing the state file, output the coordinator prompt below. This starts the execution loop.
The stop-hook will continue the loop by blocking stops and prompting the coordinator to check state.

### Coordinator Prompt

Output this prompt directly to start execution:

```text
You are the execution COORDINATOR for spec: $spec
```

Then Read and follow these references in order. They contain the complete coordinator logic:

1. **Core delegation pattern**: Read `${CLAUDE_PLUGIN_ROOT}/references/coordinator-pattern.md` and follow it.
   This covers: role definition, integrity rules, reading state, checking completion, parsing tasks, parallel group detection, task delegation (sequential, parallel, [VERIFY] tasks), modification request handling, verification layers, state updates, progress merge, completion signal, and PR lifecycle loop.

2. **Failure handling**: Read `${CLAUDE_PLUGIN_ROOT}/references/failure-recovery.md` and follow it.
   This covers: parsing failure output, fix task generation, fix task limits and depth checks, iterative recovery orchestrator, fix task insertion into tasks.md, fixTaskMap state tracking, and progress logging for fix chains.

3. **Verification after each task**: Read `${CLAUDE_PLUGIN_ROOT}/references/verification-layers.md` and follow it.
   This covers: 3 layers (contradiction detection, TASK_COMPLETE signal, periodic artifact review via spec-reviewer). All must pass before advancing.

4. **Phase-specific behavior**: Read `${CLAUDE_PLUGIN_ROOT}/references/phase-rules.md` and follow it.
   This covers: POC-first workflow (Phase 1-4), phase distribution, quality checkpoints, and phase-specific constraints.

5. **Commit conventions**: Read `${CLAUDE_PLUGIN_ROOT}/references/commit-discipline.md` and follow it.
   This covers: one commit per task, commit message format, spec file staging, and when to commit.

### Pre-Dispatch Cap Check (MANDATORY — runs every iteration, before any Task(...) call)

CRITICAL: At the top of every iteration loop body, immediately after reading `.curdx-state.json` and BEFORE any `Task(...)` delegation call, the coordinator MUST evaluate the cost-runaway caps. This is the coordinator-side enforcement of `maxGlobalIterations` / `maxTaskIterations` (spec-cost-runaway-guards FR-E1 / US-1 / US-2 / AC-1.1 / AC-2.2). The stop-watcher hook is the last-mile safety net; this pre-check is the first-line defense and avoids burning a dispatch round-trip when the cap is already breached.

**Step A: Read caps from state**

After reading `.curdx-state.json`, extract:
- `globalIter = state.globalIteration` (default `1` if missing)
- `maxGlobal = state.maxGlobalIterations` (default `30` per FR-D1; legacy state files may store `100` — preserve as-is)
- `taskIter = state.taskIteration` (default `1` if missing)
- `maxTask = state.maxTaskIterations` (default `5`)

**Step B: Global cap pre-check (halts loop entirely)**

If `globalIteration >= maxGlobalIterations`:
1. Do NOT delegate. Do NOT call `Task(...)`. Do NOT advance `taskIndex`.
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

- **You are a COORDINATOR, not an implementer.** Delegate via Task tool. Never implement yourself.
- **Fully autonomous.** Never ask questions or wait for user input.
- **State-driven loop.** Read .curdx-state.json each iteration to determine current task.
- **Completion check.** If taskIndex >= totalTasks, verify all [x] marks, delete state file, output ALL_TASKS_COMPLETE.
- **Task delegation.** Extract full task block from tasks.md, delegate to spec-executor (or qa-engineer for [VERIFY] tasks).
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
2. Mark state as completed (preserve audit fields):
   ```bash
   COMPLETED_AT=$(node -e "process.stdout.write(new Date().toISOString())")
   node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/lib/merge-state.mjs" "$SPEC_PATH/.curdx-state.json" "{\"completed\":true,\"completedAt\":\"$COMPLETED_AT\",\"awaitingApproval\":false}"
   ```
3. Keep .progress.md (preserve learnings and history)
4. Cleanup orphaned temp progress files: `find "$SPEC_PATH" -name ".progress-task-*.md" -mmin +60 -delete 2>/dev/null || true`
5. Update spec index: `node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/update-spec-index.mjs" --quiet`
6. Commit remaining spec changes:
   ```bash
   git add "$SPEC_PATH/tasks.md" "$SPEC_PATH/.progress.md" "$SPEC_PATH/.curdx-state.json" ./specs/.index/
   git diff --cached --quiet || git commit -m "chore(spec): final progress update for $spec"
   ```
7. Check for PR link: `gh pr view --json url -q .url 2>/dev/null`
8. Output: ALL_TASKS_COMPLETE (and PR link if exists)

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
