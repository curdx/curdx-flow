---
spec: spec-verification-iron-law
phase: tasks
granularity: fine
created: 2026-05-06
---

# Tasks: spec-verification-iron-law

> Epic: superpowers-uplift | Total: 54 tasks across 5 phases | E2E: enabled (fixture-based)

## POC Milestone

Task 1.8 — Stop hook reads `verificationBlocks` from `.curdx-state.json` and returns exit 2 when block missing for current phase; passes when block is valid. Single-phase ("execution") only; stale-detection and TaskCompleted hook deferred to Phase 2.

---

## Phase 1 — POC (~8 tasks)

Goal: prove Stop hook can read verificationBlocks and gate phase exit. Minimal scope: schema + shared lib skeleton + Stop hook wired up for one case (missing block → block). No TaskCompleted hook, no CLI, no npm verify extension, no skill rename yet.

### Task 1.1: Add VerificationBlock types to CurdxState

- **Do**:
  1. Open `src/hooks/_shared/types.ts`
  2. Add `VerificationPhase` union type: `"research" | "requirements" | "design" | "tasks" | "execution"`
  3. Add `VerificationBlock` interface with required `{command: string, exitCode: number, timestamp: string, srcMtime: number}` and optional `{description?: string, failedReason?: string}`
  4. Add `verificationBlocks?: Partial<Record<VerificationPhase, VerificationBlock>>` field to `CurdxState` after `epicName`
- **Files**: `src/hooks/_shared/types.ts`
- **Done when**: `VerificationPhase`, `VerificationBlock` exported; `CurdxState.verificationBlocks` optional field present; no TS errors
- **Verify**: `npm run typecheck`
- **Commit**: `feat(types): add VerificationBlock and verificationBlocks field to CurdxState`

### Task 1.2 [P]: Add verificationBlocks to JSON schema

- **Do**:
  1. Open `plugins/curdx-flow/schemas/spec.schema.json`
  2. Add `verificationBlocks` property under root `properties` (object, additionalProperties false, 5 named phase keys each `$ref: "#/$defs/verificationBlock"`)
  3. Add `$defs.verificationBlock` with required `["command","exitCode","timestamp","srcMtime"]` and all 6 properties (command string minLen 1, exitCode integer, timestamp string format date-time, srcMtime number min 0, description string, failedReason string), additionalProperties false
- **Files**: `plugins/curdx-flow/schemas/spec.schema.json`
- **Done when**: schema validates a state file with a `verificationBlocks.execution` block; `additionalProperties: false` preserved at root
- **Verify**: `node -e "const s=require('./plugins/curdx-flow/schemas/spec.schema.json'); const b=s.properties.verificationBlocks; console.assert(b && b.properties.execution, 'schema missing'); console.log('PASS')"`
- **Commit**: `feat(schema): add verificationBlocks property and verificationBlock def`

### Task 1.3: Create verify-blocks shared lib (skeleton)

- **Do**:
  1. Create `src/hooks/lib/verify-blocks.ts`
  2. Export `verifyPhaseBlock(state: CurdxState, phase: VerificationPhase, specDir: string): { ok: boolean; reason?: string; command?: string }`:
     - If `state.verificationBlocks?.[phase]` is undefined → return `{ok: false, reason: "missing", command: ""}` (stale-check deferred to Phase 2)
     - If `block.exitCode !== 0` → return `{ok: false, reason: block.failedReason ?? "verification failed", command: block.command}`
     - Else return `{ok: true}`
  3. Export `walkSrcTree(dir: string): Promise<number>` stub that returns `Date.now()` (full impl in Phase 2)
- **Files**: `src/hooks/lib/verify-blocks.ts`
- **Done when**: both functions exported; compiles without error; stub walkSrcTree acceptable for POC
- **Verify**: `npm run typecheck`
- **Commit**: `feat(verify-blocks): add verifyPhaseBlock and walkSrcTree skeleton`

### Task 1.4 [VERIFY]: POC typecheck checkpoint

- **Do**: Run typecheck and build:hooks to confirm schema + types + new lib compile cleanly
- **Files**: (none — run-only)
- **Done when**: both commands exit 0
- **Verify**: `npm run typecheck && npm run build:hooks`
- **Commit**: (none)

### Task 1.5: Wire stop_hook_active early-exit into stop-watcher

- **Do**:
  1. Open `src/hooks/stop-watcher.ts`
  2. Locate the main `runStopHook()` / dispatch function entry point
  3. Ensure `stop_hook_active === true` check is the FIRST line before any other logic (design D5 contract); the existing check at line 639/698 may already exist — if it's not the absolute first line of `runStopHook()`, move it to be first; if it already is first, add a comment `// D5: canonical early-exit guard — owned by spec A`
  4. Do NOT change the logic, only position and comment
- **Files**: `src/hooks/stop-watcher.ts`
- **Done when**: `stop_hook_active === true` guard is first conditional in the main hook entry; existing behavior preserved
- **Verify**: `grep -n "stop_hook_active" src/hooks/stop-watcher.ts | head -5 && npm run typecheck`
- **Commit**: `refactor(stop-watcher): confirm stop_hook_active early-exit is first guard (D5)`

### Task 1.6: Add verifyPhaseBlock call to stop-watcher

- **Do**:
  1. In `src/hooks/stop-watcher.ts`, import `verifyPhaseBlock` from `../lib/verify-blocks`
  2. Import `VerificationPhase` from `../_shared/types`
  3. After the existing `ALL_TASKS_COMPLETE` logic determines the active phase from state, call `verifyPhaseBlock(state, phase as VerificationPhase, specDir)`
  4. If result is `!ok`: return a block decision with `reason` containing the fix command — message format: `"Phase '<phase>' has no verification block. Run: <command>. Then try again."` (or `failedReason` / stale message per error-handling table)
  5. If result is `ok`: continue existing flow
- **Files**: `src/hooks/stop-watcher.ts`
- **Done when**: stop-watcher imports and calls verifyPhaseBlock; typecheck passes; existing tests still pass
- **Verify**: `npm run typecheck && npm run test:hooks`
- **Commit**: `feat(stop-watcher): call verifyPhaseBlock after phase detection (Layer-1 gate)`

### Task 1.7 [VERIFY]: Build hooks and run existing tests

- **Do**: Rebuild hook bundles and run full test:hooks suite to confirm no regressions
- **Files**: (none — run-only)
- **Done when**: build:hooks exits 0; test:hooks exits 0; check:hooks-fresh exits 0
- **Verify**: `npm run build:hooks && npm run check:hooks-fresh && npm run test:hooks`
- **Commit**: (none)

### Task 1.8: Add 3 new stop-watcher test cases (POC gate)

- **Do**:
  1. Open `tests/hooks/stop-watcher.test.ts`
  2. Add fixture helper that writes a minimal `.curdx-state.json` with `verificationBlocks.execution` populated (valid block: exitCode 0, timestamp now, srcMtime now-1000)
  3. Add test case (a): valid verificationBlocks.execution block → stop hook continues (does not block)
  4. Add test case (b): missing verificationBlocks field entirely → stop hook returns block decision, stderr includes "no verification block"
  5. Add test case (c): `stop_hook_active=true` with missing block → hook returns early without blocking (anti-loop guard)
- **Files**: `tests/hooks/stop-watcher.test.ts`
- **Done when**: 3 new tests pass; existing tests unaffected
- **Verify**: `npm run test:hooks`
- **Commit**: `test(stop-watcher): add POC gate tests — valid block pass, missing block, stop_hook_active early-exit`

---

## Phase 2 — Core (~25 tasks)

Goal: implement all 9 components from design.md. Dependency order: verify-blocks full impl → merge-state → Stop hook stale/failed cases → TaskCompleted hook → hooks.json → skill rename → reference doc → npm verify gate → CLI check command.

### Task 2.1: Implement walkSrcTree in verify-blocks (full impl)

- **Do**:
  1. In `src/hooks/lib/verify-blocks.ts`, replace the stub `walkSrcTree` with real implementation
  2. Use `fs.promises.readdir(dir, {withFileTypes: true})` recursively, depth cap 6
  3. Skip directories: `.git`, `node_modules`, `dist`, `.curdx`, `.claude`
  4. Return `Promise<number>` = max `mtimeMs` across all files found using `fs.promises.stat(filepath).mtimeMs`
  5. Use `path.join` for all path ops (cross-platform AC-7.2)
- **Files**: `src/hooks/lib/verify-blocks.ts`
- **Done when**: walkSrcTree recursively walks directory, respects skip list, returns max mtime in ms; depth ≤ 6
- **Verify**: `npm run typecheck`
- **Commit**: `feat(verify-blocks): implement walkSrcTree with depth-6 cap and skip list`

### Task 2.2: Add stale-detection to verifyPhaseBlock

- **Do**:
  1. In `src/hooks/lib/verify-blocks.ts`, update `verifyPhaseBlock` to call `await walkSrcTree(specDir)` after the exitCode check
  2. Compare `block.srcMtime > Date.parse(block.timestamp)` (both in ms, per AC-7.3) — if true → return `{ok: false, reason: "Stale evidence: src changed at <srcMtime iso>, last verified at <timestamp>. Re-run: <command>.", command: block.command}`
  3. Make `verifyPhaseBlock` async; update all call sites in stop-watcher.ts to `await`
- **Files**: `src/hooks/lib/verify-blocks.ts`, `src/hooks/stop-watcher.ts`
- **Done when**: stale check runs after exitCode check; comparison uses ms not seconds; stop-watcher awaits the async call
- **Verify**: `npm run typecheck`
- **Commit**: `feat(verify-blocks): add stale-detection via srcMtime vs timestamp comparison`

### Task 2.3: Update stop-watcher error messages for all 3 block-fail classes

- **Do**:
  1. In `src/hooks/stop-watcher.ts`, update the block decision construction to use all 3 message formats from design error-handling table:
     - Missing: `"Phase '<phase>' has no verification block. Run: <recommended cmd>. Then try again."`
     - Failed: `"Verification failed: <failedReason>. Fix and re-run: <cmd>."`
     - Stale: `"Stale evidence: src changed at <iso>, last verified at <iso>. Re-run: <cmd>."`
  2. Malformed verificationBlocks (JSON parse error): catch and emit `"verificationBlocks malformed in .curdx-state.json. See references/iron-law-verification.md."`
- **Files**: `src/hooks/stop-watcher.ts`
- **Done when**: all 4 error messages match design table; typecheck passes
- **Verify**: `npm run typecheck && npm run test:hooks`
- **Commit**: `feat(stop-watcher): implement all 3 block-fail error message formats`

### Task 2.4 [VERIFY]: Checkpoint — verify-blocks + stop-watcher full suite

- **Do**: Run typecheck + build + test:hooks
- **Files**: (none — run-only)
- **Done when**: all commands exit 0
- **Verify**: `npm run typecheck && npm run build:hooks && npm run test:hooks`
- **Commit**: (none)

### Task 2.5: Add stale + failed stop-watcher test cases

- **Do**:
  1. Open `tests/hooks/stop-watcher.test.ts`
  2. Add test case (d): `block.exitCode !== 0` with `failedReason` set → hook blocks, stderr contains failedReason text
  3. Add test case (e): `block.srcMtime > Date.parse(block.timestamp)` (srcMtime = now, timestamp = 1 hour ago) → hook blocks, stderr contains "Stale evidence"
  4. Add test case (f): existing `ALL_TASKS_COMPLETE` behavior preserved — write a fixture where all tasks are checked and verificationBlocks is valid → hook continues
- **Files**: `tests/hooks/stop-watcher.test.ts`
- **Done when**: 3 new cases pass; total stop-watcher test suite still green
- **Verify**: `npm run test:hooks`
- **Commit**: `test(stop-watcher): add stale, failed, and ALL_TASKS_COMPLETE preservation cases`

### Task 2.6: Add verify-on-write validation to merge-state.ts

- **Do**:
  1. Open `src/hooks/lib/merge-state.ts`
  2. After the patch is applied, if `patch` contains a `verificationBlocks` key, run a minimal field-presence validator (no Ajv — hand-rolled): for each phase block present, assert required fields `{command, exitCode, timestamp, srcMtime}` are present with correct types; throw with actionable message if invalid
  3. Confirm `$unset: ["verificationBlocks.research"]` syntax still deletes single phase without touching siblings (add inline comment)
- **Files**: `src/hooks/lib/merge-state.ts`
- **Done when**: invalid verificationBlocks write throws; `$unset` of single phase works; typecheck passes
- **Verify**: `npm run typecheck`
- **Commit**: `feat(merge-state): validate verificationBlocks fields on write`

### Task 2.7: Extend merge-state tests

- **Do**:
  1. Open or create `tests/hooks/lib/` — check if merge-state.test.ts exists, extend it
  2. Add test: atomic write of full `verificationBlocks` object → reads back correctly
  3. Add test: `$unset: ["verificationBlocks.research"]` removes only that phase, siblings preserved
  4. Add test: writing a block missing required field `command` → throws/errors with readable message
- **Files**: `tests/hooks/lib/merge-state.test.ts` (extend or create)
- **Done when**: 3 new merge-state tests pass
- **Verify**: `npm run test:hooks`
- **Commit**: `test(merge-state): add verificationBlocks write, $unset sibling, and invalid-block tests`

### Task 2.8 [VERIFY]: Checkpoint — merge-state

- **Do**: Full typecheck + build + test:hooks
- **Files**: (none)
- **Done when**: all exit 0
- **Verify**: `npm run typecheck && npm run build:hooks && npm run check:hooks-fresh && npm run test:hooks`
- **Commit**: (none)

### Task 2.9: Create TaskCompleted hook source

- **Do**:
  1. Create `src/hooks/task-completed-verifier.ts`
  2. Parse stdin JSON; if `hook_event_name !== "TaskCompleted"` or `task_id` absent → `process.stdout.write(JSON.stringify({continue:true}))` and exit 0 (AC-2.4 defensive guard)
  3. If no `.curdx-state.json` found in cwd → pass-through (not a curdx spec)
  4. Read state, compute current phase, call `verifyPhaseBlock(state, phase, specDir)` (same shared lib as Stop hook)
  5. On `!ok`: `process.stdout.write(JSON.stringify({decision:"block", reason: result.reason}))` + exit 2
  6. On `ok`: exit 0
  7. Wrap in try/catch: unexpected error → exit 2 with `reason: "internal error in verify-blocks; see logs"` + stack to stderr
- **Files**: `src/hooks/task-completed-verifier.ts`
- **Done when**: hook handles all 5 paths (invalid event, no state, valid, failed, error); typecheck passes
- **Verify**: `npm run typecheck`
- **Commit**: `feat(task-completed-verifier): create Layer-2 opt-in TaskCompleted hook`

### Task 2.10: Register task-completed-verifier in build-hooks.mjs

- **Do**:
  1. Open `scripts/build-hooks.mjs`
  2. Add `'src/hooks/task-completed-verifier.ts'` to `HOOK_ENTRIES` array
  3. Run `npm run build:hooks` to generate `plugins/curdx-flow/hooks/scripts/task-completed-verifier.mjs`
- **Files**: `scripts/build-hooks.mjs`
- **Done when**: `plugins/curdx-flow/hooks/scripts/task-completed-verifier.mjs` exists; check:hooks-fresh passes
- **Verify**: `npm run build:hooks && npm run check:hooks-fresh`
- **Commit**: `feat(build-hooks): add task-completed-verifier to HOOK_ENTRIES`

### Task 2.11: Register TaskCompleted event in hooks.json

- **Do**:
  1. Open `plugins/curdx-flow/hooks/hooks.json`
  2. Add `"TaskCompleted"` top-level key with one hook entry: `{type: "command", command: "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/task-completed-verifier.mjs\"", shell: "bash"}` — no matcher (runs on all TaskCompleted dispatches)
- **Files**: `plugins/curdx-flow/hooks/hooks.json`
- **Done when**: JSON valid; TaskCompleted entry present; existing Stop/SessionStart/PreToolUse entries unchanged
- **Verify**: `node -e "const h=require('./plugins/curdx-flow/hooks/hooks.json'); console.assert(h.hooks.TaskCompleted, 'missing'); console.log('PASS')"`
- **Commit**: `feat(hooks.json): register TaskCompleted event for Layer-2 verifier hook`

### Task 2.12 [VERIFY]: Checkpoint — TaskCompleted hook

- **Do**: Typecheck + build + check-fresh + existing tests
- **Files**: (none)
- **Done when**: all exit 0
- **Verify**: `npm run typecheck && npm run build:hooks && npm run check:hooks-fresh && npm run test:hooks`
- **Commit**: (none)

### Task 2.13: Write TaskCompleted hook unit tests

- **Do**:
  1. Create `tests/hooks/task-completed-verifier.test.ts`
  2. Test (a): valid block present → exit 0 / continue
  3. Test (b): verificationBlocks missing for phase → exit 2 / decision block
  4. Test (c): stale timestamp (srcMtime > timestamp) → exit 2 / "Stale evidence"
  5. Test (d): malformed stdin (missing task_id) → exit 0 pass-through
  6. Test (e): absent `.curdx-state.json` → exit 0 pass-through
- **Files**: `tests/hooks/task-completed-verifier.test.ts`
- **Done when**: 5 tests pass; test:hooks green
- **Verify**: `npm run test:hooks`
- **Commit**: `test(task-completed-verifier): add 5 unit tests covering all paths`

### Task 2.14 [P]: Move skill to verification-before-completion

- **Do**:
  1. Read `plugins/curdx-flow/skills/reality-verification/SKILL.md` (full current content)
  2. Create directory `plugins/curdx-flow/skills/verification-before-completion/`
  3. Write `plugins/curdx-flow/skills/verification-before-completion/SKILL.md` — preserve existing content verbatim; update `name:` frontmatter to `verification-before-completion`; append scope-expansion section: "This skill was expanded in v7.x to cover phase-exit / commit / tag / release boundaries beyond the original task-level VF scope. Triggers retained: verify a fix, reproduce failure, BEFORE/AFTER, VF task, reality check, mock-only tests, phase exit."
  4. Confirm `description` field is ≤ 1,536 chars (AC-4.3)
- **Files**: `plugins/curdx-flow/skills/verification-before-completion/SKILL.md`
- **Done when**: new SKILL.md exists with correct name and expanded description ≤ 1,536 chars
- **Verify**: `wc -m plugins/curdx-flow/skills/verification-before-completion/SKILL.md`
- **Commit**: `feat(skills): create verification-before-completion skill (moved from reality-verification)`

### Task 2.15 [P]: Move reference docs into new skill directory

- **Do**:
  1. Create `plugins/curdx-flow/skills/verification-before-completion/references/`
  2. Copy `plugins/curdx-flow/skills/reality-verification/references/goal-detection-patterns.md` → `plugins/curdx-flow/skills/verification-before-completion/references/goal-detection-patterns.md`
  3. Copy `plugins/curdx-flow/skills/reality-verification/references/mock-quality-checks.md` → `plugins/curdx-flow/skills/verification-before-completion/references/mock-quality-checks.md`
  4. Verify both files exist at new path before deleting originals (do NOT delete yet — alias task handles old dir)
- **Files**: `plugins/curdx-flow/skills/verification-before-completion/references/goal-detection-patterns.md`, `plugins/curdx-flow/skills/verification-before-completion/references/mock-quality-checks.md`
- **Done when**: both files present at new path with identical content
- **Verify**: `diff plugins/curdx-flow/skills/reality-verification/references/goal-detection-patterns.md plugins/curdx-flow/skills/verification-before-completion/references/goal-detection-patterns.md && diff plugins/curdx-flow/skills/reality-verification/references/mock-quality-checks.md plugins/curdx-flow/skills/verification-before-completion/references/mock-quality-checks.md && echo PASS`
- **Commit**: `feat(skills): copy reference docs to verification-before-completion skill directory`

### Task 2.16: Replace old reality-verification dir with alias stub

- **Do**:
  1. Delete `plugins/curdx-flow/skills/reality-verification/references/` directory and its contents (already copied in 2.15)
  2. Overwrite `plugins/curdx-flow/skills/reality-verification/SKILL.md` with alias stub from design D4:
     - frontmatter: `name: reality-verification`, `description: DEPRECATED ALIAS...`, `user-invocable: false`
     - Body: "This skill was renamed in v7.x. See `skills/verification-before-completion/SKILL.md`..."
  3. Verify no other files remain in `plugins/curdx-flow/skills/reality-verification/` except `SKILL.md`
- **Files**: `plugins/curdx-flow/skills/reality-verification/SKILL.md`
- **Done when**: alias stub in place; `ls plugins/curdx-flow/skills/reality-verification/` returns only `SKILL.md`
- **Verify**: `ls plugins/curdx-flow/skills/reality-verification/ && grep "DEPRECATED ALIAS" plugins/curdx-flow/skills/reality-verification/SKILL.md`
- **Commit**: `feat(skills): replace reality-verification with alias stub (D4 compat)`

### Task 2.17: Update 4 downstream references from reality-verification to verification-before-completion

- **Do**:
  1. `plugins/curdx-flow/agents/task-planner.md` line 290: replace `skills/reality-verification/SKILL.md` → `skills/verification-before-completion/SKILL.md`
  2. `src/hooks/lib/count-mocks.ts` line 5: update comment from `reality-verification skill` → `verification-before-completion skill`
  3. `src/hooks/lib/README.md` line 42: update `reality-verification VE2` reference → `verification-before-completion VE2`
  4. If `plugins/curdx-flow/skills/reality-verification/.curdx-state.json` exists, update skill name field there
- **Files**: `plugins/curdx-flow/agents/task-planner.md`, `src/hooks/lib/count-mocks.ts`, `src/hooks/lib/README.md`
- **Done when**: `grep -r "reality-verification" --include="*.md" --include="*.ts" --include="*.json" --exclude-dir=node_modules .` returns ONLY the alias stub file
- **Verify**: `grep -r "reality-verification" --include="*.md" --include="*.ts" --include="*.json" --exclude-dir=node_modules . | grep -v "skills/reality-verification/SKILL.md" | wc -l | xargs -I{} test {} -eq 0 && echo PASS`
- **Commit**: `feat(refs): update 4 downstream references from reality-verification to verification-before-completion`

### Task 2.18 [VERIFY]: Checkpoint — skill rename complete

- **Do**: Typecheck + grep reality-verification leak check
- **Files**: (none)
- **Done when**: typecheck exits 0; no leaked references
- **Verify**: `npm run typecheck && grep -r "reality-verification" --include="*.md" --include="*.ts" --exclude-dir=node_modules . | grep -v "skills/reality-verification/SKILL.md" | wc -l | xargs -I{} test {} -eq 0 && echo PASS`
- **Commit**: (none)

### Task 2.19: Create iron-law-verification.md reference doc

- **Do**:
  1. Create `plugins/curdx-flow/references/iron-law-verification.md`
  2. Section 1 — Iron Law statement (one paragraph): "No completion claim without fresh verification."
  3. Section 2 — Two-layer model: Layer-1 (Stop hook, GA, mandatory) and Layer-2 (TaskCompleted, opt-in via `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`); state that Layer-1 alone is sufficient
  4. Section 3 — VerificationBlock field reference: copy of D2 schema with examples for each field
  5. Section 4 — Phase boundary checklist: exact `npm run verify` invocations + which `verificationBlocks.<phase>` keys must be present and fresh for commit / tag / release
  6. Section 5 — Failure recovery cookbook: for missing / failed / stale, the exact fix command
  7. Section 6 — Cross-references: link to `verification-before-completion` skill, hook source paths
- **Files**: `plugins/curdx-flow/references/iron-law-verification.md`
- **Done when**: all 6 sections present; commands in section 4 match actual `package.json` scripts
- **Verify**: `test -f plugins/curdx-flow/references/iron-law-verification.md && grep -c "##" plugins/curdx-flow/references/iron-law-verification.md | xargs -I{} test {} -ge 6 && echo PASS`
- **Commit**: `docs(references): create iron-law-verification.md — compaction-resilient iron law doc`

### Task 2.20 [P]: Create scripts/check-verification-blocks.mjs

- **Do**:
  1. Create `scripts/check-verification-blocks.mjs`
  2. Read active spec's `.curdx-state.json` (infer path: check `.curdx/active-spec` pointer first; fall back to latest-mtime spec dir under `./specs/`)
  3. For each present phase block in `verificationBlocks`: assert `exitCode === 0` and `Date.parse(block.timestamp) >= block.srcMtime`
  4. If `verificationBlocks` missing/empty → exit 2 with stderr: "No verificationBlocks found. Run the appropriate phase verification command."
  5. If any block fails: exit 2 with stderr listing which phase failed and which command to re-run
  6. On all-pass: exit 0 with stdout "All verificationBlocks valid."
- **Files**: `scripts/check-verification-blocks.mjs`
- **Done when**: script exits 2 when no state; exits 0 with a valid fixture state; stderr is actionable
- **Verify**: `node -e "process.exit(0)" && echo SCRIPT_EXISTS && test -f scripts/check-verification-blocks.mjs && echo PASS`
- **Commit**: `feat(scripts): create check-verification-blocks.mjs for release-time gate`

### Task 2.21 [P]: Append check-verification-blocks to npm run verify chain

- **Do**:
  1. Open `package.json`
  2. In `scripts.verify`, append `&& node scripts/check-verification-blocks.mjs` at the end of the existing chain (after `test:analyze`)
  3. Confirm order: typecheck → check-versions → check:hooks-fresh → build → check:bundle → test:hooks → test:analyze → check-verification-blocks
- **Files**: `package.json`
- **Done when**: `npm run verify` chain includes the new script at tail; `npm run verify` still exits 0 on a clean repo (script finds no active spec during CI → must handle gracefully — exit 0 if no `.curdx/active-spec` and no spec dirs)
- **Verify**: `node -e "const p=require('./package.json'); console.assert(p.scripts.verify.includes('check-verification-blocks'), 'missing'); console.log('PASS')"`
- **Commit**: `feat(package.json): append check-verification-blocks to npm run verify chain (D3)`

### Task 2.22 [VERIFY]: Checkpoint — npm verify chain

- **Do**: Run npm run verify (should pass; check-verification-blocks exits 0 when no active spec)
- **Files**: (none)
- **Done when**: `npm run verify` exits 0
- **Verify**: `npm run verify`
- **Commit**: (none)

### Task 2.23: Create CLI check command

- **Do**:
  1. Create `src/cli/commands/check.ts`
  2. Export async `runCheckCommand(args: string[]): Promise<void>`
  3. Import the same verification logic used by `scripts/check-verification-blocks.mjs` — extract the core logic into a shared `src/hooks/lib/check-verification-blocks.ts` lib function so both CLI and script share one source
  4. On fail: `process.stderr.write(errorMsg)` + `process.exit(2)`
  5. On pass: `process.stdout.write("All verificationBlocks valid.\n")` + `process.exit(0)`
- **Files**: `src/cli/commands/check.ts`, `src/hooks/lib/check-verification-blocks.ts`
- **Done when**: `runCheckCommand` exported; typecheck passes; both CLI and script import from shared lib
- **Verify**: `npm run typecheck`
- **Commit**: `feat(cli): create check command wrapping shared check-verification-blocks lib`

### Task 2.24: Wire check command into CLI dispatcher

- **Do**:
  1. Find the existing CLI dispatcher in `src/` (likely `src/index.ts` or `src/cli/index.ts` — check `dist/index.mjs` entry)
  2. Add `check` subcommand: if `process.argv[2] === 'check'`, call `runCheckCommand(process.argv.slice(3))`
  3. Update `--help` output to include `check` subcommand description
- **Files**: `src/index.ts` or equivalent CLI entry
- **Done when**: `node dist/index.mjs check --help` exits 0 without error; typecheck passes
- **Verify**: `npm run build && node dist/index.mjs check --help 2>&1 | grep -i "check" && echo PASS`
- **Commit**: `feat(cli): wire check subcommand into CLI dispatcher`

### Task 2.25 [VERIFY]: Final Phase 2 quality checkpoint

- **Do**: Full suite — typecheck + build:hooks + check:hooks-fresh + verify + test:hooks
- **Files**: (none)
- **Done when**: all exit 0
- **Verify**: `npm run typecheck && npm run build:hooks && npm run check:hooks-fresh && npm run test:hooks`
- **Commit**: (none)

---

## Phase 3 — Testing (~12 tasks)

Goal: full test coverage per design §Test Strategy. 5 test files, E2E flow, iron-law doc drift check, CLI check test.

### Task 3.1: Extend buildFreshness.test.ts — schema migration compatibility

- **Do**:
  1. Open `tests/runner/buildFreshness.test.ts`
  2. Add test: load old state JSON without `verificationBlocks` field → parses without error, `state.verificationBlocks` is `undefined`, existing fields intact
  3. Add test: load new state JSON with full `verificationBlocks` object → round-trips through merge-state write and re-read unchanged
- **Files**: `tests/runner/buildFreshness.test.ts`
- **Done when**: 2 new schema migration tests pass
- **Verify**: `npm run test:hooks`
- **Commit**: `test(buildFreshness): add verificationBlocks schema migration compatibility tests`

### Task 3.2: Extend claudeMd.test.ts — skill alias resolution

- **Do**:
  1. Open `tests/runner/claudeMd.test.ts`
  2. Add test: `plugins/curdx-flow/skills/reality-verification/SKILL.md` exists and contains `DEPRECATED ALIAS` in body
  3. Add test: `plugins/curdx-flow/skills/verification-before-completion/SKILL.md` exists with `name: verification-before-completion` in frontmatter
  4. Add test: both skill directories exist; new skill dir contains `references/` subdirectory
- **Files**: `tests/runner/claudeMd.test.ts`
- **Done when**: 3 new skill alias tests pass
- **Verify**: `npm run test:hooks`
- **Commit**: `test(claudeMd): add skill alias resolution and verification-before-completion presence tests`

### Task 3.3 [VERIFY]: Checkpoint — extended existing tests

- **Do**: Run test:hooks
- **Files**: (none)
- **Done when**: test:hooks exits 0
- **Verify**: `npm run test:hooks`
- **Commit**: (none)

### Task 3.4: Create iron-law-doc.test.ts

- **Do**:
  1. Create `tests/runner/iron-law-doc.test.ts`
  2. Read `plugins/curdx-flow/references/iron-law-verification.md`
  3. Extract all command strings matching `` `npm run <script>` `` pattern
  4. Read `package.json` scripts
  5. Assert every extracted script name exists in `package.json.scripts`
  6. Assert the file contains at least 6 `##` section headers (completeness check)
- **Files**: `tests/runner/iron-law-doc.test.ts`
- **Done when**: test passes; any future drift between doc and package.json causes test failure
- **Verify**: `npm run test:hooks`
- **Commit**: `test(iron-law-doc): add drift-detection test for iron-law-verification.md`

### Task 3.5: Create e2e-verification-flow.test.ts (VE1)

- **Do**:
  1. Create `tests/runner/e2e-verification-flow.test.ts`
  2. Setup: use `fs.mkdtempSync(path.join(os.tmpdir(), 'curdx-e2e-'))` as fixture dir
  3. Write a minimal `.curdx-state.json` to fixture dir: `{phase: "execution", specName: "e2e-test"}` (no verificationBlocks)
  4. Test (a) — claim done without block: spawn stop-watcher.mjs with fixture dir as cwd, stdin has `{hook_event_name:"Stop", stop_hook_active:false, cwd: fixtureDir}`; assert exit code 2 and stderr contains "no verification block"
- **Files**: `tests/runner/e2e-verification-flow.test.ts`
- **Done when**: test (a) passes — stop hook blocks when no verificationBlocks present
- **Verify**: `npm run test:hooks`
- **Commit**: `test(e2e): add fixture-based e2e test — claim done without block → exit 2`

### Task 3.6: Extend e2e-verification-flow.test.ts — write block then pass (VE2)

- **Do**:
  1. In `tests/runner/e2e-verification-flow.test.ts`, add test (b):
  2. Use merge-state lib to write a valid `verificationBlocks.execution` block to fixture `.curdx-state.json`: `{command: "npm run verify", exitCode: 0, timestamp: new Date().toISOString(), srcMtime: Date.now() - 5000}`
  3. Spawn stop-watcher.mjs again with same fixture dir
  4. Assert exit code 0 (hook passes)
  5. Add test (c) — stale block: write block with `srcMtime = Date.now() + 10000` (future mtime, simulating src change after verification); assert exit code 2 and stderr contains "Stale evidence"
- **Files**: `tests/runner/e2e-verification-flow.test.ts`
- **Done when**: tests (b) and (c) pass; full e2e flow proven
- **Verify**: `npm run test:hooks`
- **Commit**: `test(e2e): extend e2e flow — write valid block passes, stale block blocks`

### Task 3.7: Add e2e performance assertion (VE3 + NFR-1)

- **Do**:
  1. In `tests/runner/e2e-verification-flow.test.ts`, add performance test:
  2. Run the stop-watcher fixture 20 iterations in sequence on a fixture state ≤ 100KB
  3. Record each run duration via `performance.now()`
  4. Assert `mean ≤ 200ms` and `P95 ≤ 500ms` (NFR-1)
  5. Cleanup: `fs.rmSync(fixtureDir, {recursive: true})` in afterAll
- **Files**: `tests/runner/e2e-verification-flow.test.ts`
- **Done when**: performance test runs; assertions cover mean and P95; cleanup removes tmpdir
- **Verify**: `npm run test:hooks`
- **Commit**: `test(e2e): add performance budget assertion — mean ≤200ms, P95 ≤500ms (NFR-1)`

### Task 3.8 [VERIFY]: Checkpoint — e2e and perf tests

- **Do**: Full test:hooks run
- **Files**: (none)
- **Done when**: test:hooks exits 0; all e2e tests pass within perf budget
- **Verify**: `npm run test:hooks`
- **Commit**: (none)

### Task 3.9: Add CLI check command tests

- **Do**:
  1. Create or extend `tests/cli/check.test.ts`
  2. Test: spawn `node dist/index.mjs check` with a fixture `.curdx-state.json` that has valid verificationBlocks → exits 0
  3. Test: spawn with fixture missing verificationBlocks → exits 2, stderr actionable
  4. Prerequisite: run `npm run build` before spawning
- **Files**: `tests/cli/check.test.ts`
- **Done when**: 2 CLI check tests pass
- **Verify**: `npm run build && npm run test:hooks`
- **Commit**: `test(cli-check): add check command unit tests — valid returns 0, missing returns 2`

### Task 3.10: Add cross-platform stderr normalization to all new tests

- **Do**:
  1. Audit all new test files (`stop-watcher.test.ts` new cases, `task-completed-verifier.test.ts`, `e2e-verification-flow.test.ts`)
  2. For every `stderr` or `stdout` string assertion, wrap with `.replace(/\r\n/g, "\n")` before comparison (AC-7.5)
  3. Confirm no hardcoded `/tmp` paths — all use `os.tmpdir()` + `mkdtempSync` (AC-7.4)
- **Files**: `tests/hooks/stop-watcher.test.ts`, `tests/hooks/task-completed-verifier.test.ts`, `tests/runner/e2e-verification-flow.test.ts`
- **Done when**: all stderr string comparisons use normalized newlines; no `/tmp` literals in new tests
- **Verify**: `grep -n "/tmp" tests/hooks/task-completed-verifier.test.ts tests/runner/e2e-verification-flow.test.ts | wc -l | xargs -I{} test {} -eq 0 && echo PASS`
- **Commit**: `fix(tests): normalize CRLF and replace /tmp hardcodes with os.tmpdir() (AC-7.5, AC-7.4)`

### Task 3.11 [VERIFY]: Full test suite checkpoint

- **Do**: typecheck + build:hooks + check:hooks-fresh + test:hooks
- **Files**: (none)
- **Done when**: all exit 0
- **Verify**: `npm run typecheck && npm run build:hooks && npm run check:hooks-fresh && npm run test:hooks`
- **Commit**: (none)

---

## Phase 4 — Quality (~4 tasks)

Goal: DRY audit, error-message polish, NFR coverage confirmation, iron-law doc final review.

### Task 4.1: Audit verify-blocks.ts for DRY between Stop and TaskCompleted

- **Do**:
  1. Read `src/hooks/stop-watcher.ts` and `src/hooks/task-completed-verifier.ts` side-by-side
  2. Identify any duplicated logic NOT already in `src/hooks/lib/verify-blocks.ts` (error message construction, phase detection, state file path resolution)
  3. Extract duplicated logic into verify-blocks.ts or a new helper in `src/hooks/lib/`
  4. Update both hook files to import the extracted helper
- **Files**: `src/hooks/lib/verify-blocks.ts`, `src/hooks/stop-watcher.ts`, `src/hooks/task-completed-verifier.ts`
- **Done when**: no logic duplicated between two hook files; all shared logic in lib; typecheck passes
- **Verify**: `npm run typecheck && npm run test:hooks`
- **Commit**: `refactor(verify-blocks): DRY extraction — shared phase-detection and error-message builders`

### Task 4.2: Polish error messages for NFR-3 compliance

- **Do**:
  1. For each block class (missing / failed / stale / malformed), verify stderr output contains: block phase id + fix command + spec context (directory path)
  2. Update message templates in verify-blocks.ts / stop-watcher.ts if any field is missing
  3. Confirm `npx curdx-flow check` output matches same format as Stop hook output
- **Files**: `src/hooks/lib/verify-blocks.ts`, `src/hooks/stop-watcher.ts`
- **Done when**: all 4 error scenarios include phase id + fix command + spec context in message; test assertions updated if needed
- **Verify**: `npm run typecheck && npm run test:hooks`
- **Commit**: `fix(verify-blocks): ensure all error messages include phase id + fix command + spec context (NFR-3)`

### Task 4.3 [VERIFY]: Full local CI

- **Do**: Run complete local CI suite matching the verify chain
- **Files**: (none)
- **Done when**: all commands exit 0
- **Verify**: `npm run typecheck && npm run build:hooks && npm run check:hooks-fresh && npm run test:hooks && npm run verify`
- **Commit**: `chore(quality): pass full local CI` (only if fixes were needed)

### Task 4.4: Update CHANGELOG.md

- **Do**:
  1. Open `CHANGELOG.md`
  2. Prepend new section `## X.Y.Z — 2026-05-06` (use current version from package.json)
  3. Under `### Added`: TaskCompleted hook (Layer-2 opt-in), verificationBlocks state schema field, iron-law-verification.md reference doc, verification-before-completion skill, check-verification-blocks.mjs release gate, `npx curdx-flow check` CLI subcommand
  4. Under `### Changed`: stop-watcher extended with verifyPhaseBlock gate, reality-verification renamed (alias preserved), npm run verify extended with check-verification-blocks step
- **Files**: `CHANGELOG.md`
- **Done when**: new section prepended; entries match actual shipped surfaces; format matches existing entries
- **Verify**: `head -30 CHANGELOG.md | grep -E "Added|Changed" && echo PASS`
- **Commit**: `chore(changelog): add v7.x entry for spec-verification-iron-law surfaces`

---

## Phase 5 — Release (~5 tasks)

### Task 5.1 [V4]: Full local CI gate

- **Do**: Run complete suite including npm run verify
- **Files**: (none)
- **Done when**: all commands exit 0
- **Verify**: `npm run typecheck && npm run build:hooks && npm run check:hooks-fresh && npm run test:hooks && npm run verify`
- **Commit**: (none — or fix commit if needed)

### Task 5.2 [V5]: CI pipeline passes

- **Do**:
  1. Verify current branch is `epic/superpowers-uplift` or a sub-branch: `git branch --show-current`
  2. Push branch: `git push -u origin $(git branch --show-current)`
  3. Create PR: `gh pr create --title "feat: verification iron law — dual-layer completion gate" --body "$(cat <<'EOF'\n## Summary\n- Adds verificationBlocks field to CurdxState schema\n- Stop hook (Layer-1, GA) blocks phase exit when block missing/failed/stale\n- TaskCompleted hook (Layer-2, opt-in) reinforces for Agent Teams users\n- iron-law-verification.md reference doc (compaction-resilient)\n- verification-before-completion skill (renamed from reality-verification, alias preserved)\n- npm run verify extended with check-verification-blocks gate\n- npx curdx-flow check CLI subcommand\n\n## Test plan\n- All new cases in stop-watcher.test.ts, task-completed-verifier.test.ts pass\n- e2e-verification-flow.test.ts: fixture-based end-to-end flow\n- iron-law-doc.test.ts: drift detection\n- npm run verify exits 0\nEOF\n)"`
  4. Wait for CI: `gh pr checks --watch`
- **Files**: (none)
- **Done when**: CI pipeline shows all checks green
- **Verify**: `gh pr checks`
- **Commit**: (none)

### Task 5.3 [V6]: AC checklist verification

- **Do**: Programmatically verify each acceptance criterion is met:
  - AC-1.x (Stop hook blocks all 3 cases): grep test assertions in stop-watcher.test.ts
  - AC-2.x (TaskCompleted hook): grep task-completed-verifier.test.ts for all 5 paths
  - AC-3.x (State schema): `node -e "require('./plugins/curdx-flow/schemas/spec.schema.json').properties.verificationBlocks"` exits 0
  - AC-4.x (Skill rename): `test -f plugins/curdx-flow/skills/verification-before-completion/SKILL.md`
  - AC-5.x (Backwards compat): buildFreshness test passes
  - AC-6.x (stop_hook_active early-exit): grep stop-watcher.ts for D5 comment
  - AC-7.x (Cross-platform): check os.tmpdir() usage, .replace(/\\r\\n/g,"\\n") in test files
  - AC-8.x (npm verify gate): grep package.json verify script for check-verification-blocks
  - AC-9.x (actionable errors): grep verify-blocks.ts for phase + command in error strings
- **Files**: (none)
- **Done when**: all AC checks pass via automated commands
- **Verify**: `npm run test:hooks && node -e "const s=require('./plugins/curdx-flow/schemas/spec.schema.json'); console.assert(s.properties.verificationBlocks,'missing'); console.log('AC-3 PASS')" && test -f plugins/curdx-flow/skills/verification-before-completion/SKILL.md && echo "AC-4 PASS" && node -e "const p=require('./package.json'); console.assert(p.scripts.verify.includes('check-verification-blocks'),'missing'); console.log('AC-8 PASS')"`
- **Commit**: (none)

### Task 5.4 [VE1]: E2E startup — run fixture-based e2e test suite

- **Do**:
  1. Run the full e2e test suite (fixture-based, no dev server needed)
  2. Confirm: claim-without-block → exit 2; write-valid-block → exit 0; stale-block → exit 2
  3. Confirm performance budget: mean ≤ 200ms, P95 ≤ 500ms
- **Files**: (none)
- **Done when**: `e2e-verification-flow.test.ts` all tests pass within perf budget
- **Verify**: `npm run test:hooks 2>&1 | grep -E "e2e-verification|PASS|FAIL" && echo VE1_PASS`
- **Commit**: (none)

### Task 5.5 [VE2]: E2E cleanup + final state check

- **Do**:
  1. Confirm no stale tmpdir fixtures left: `ls /tmp/curdx-e2e-* 2>/dev/null | wc -l` should be 0 (afterAll cleanup ran)
  2. Confirm no new files untracked outside expected paths: `git status --short | grep -v "^?? specs/" | grep -v ".curdx"`
  3. Run `npm run verify` one final time — the complete release gate
- **Files**: (none)
- **Done when**: no tmpdir leaks; git status clean (only spec dir untracked); npm run verify exits 0
- **Verify**: `npm run verify && echo VE2_PASS`
- **Commit**: (none)

---

## Implementation Order

1. Phase 1 (1.1 → 1.8) — schema + shared lib + Stop hook minimal gate + 3 POC tests
2. Phase 2 dependency order:
   1. Tasks 2.1-2.3: verify-blocks full impl (stale + all error messages)
   2. Tasks 2.5-2.8: Stop hook remaining test cases + merge-state write validation
   3. Tasks 2.9-2.13: TaskCompleted hook + hooks.json registration + unit tests
   4. Tasks 2.14-2.18: Skill rename + alias stub + downstream ref updates
   5. Tasks 2.19-2.22: Reference doc + npm verify gate
   6. Tasks 2.23-2.25: CLI check command
3. Phase 3: All test files (schema migration, alias resolution, e2e flow, perf, CLI)
4. Phase 4: DRY audit, error polish, CHANGELOG
5. Phase 5: Full CI gate, PR, AC checklist, E2E validation

## Parallel-safe tasks [P]

- 1.2 [P]: schema edit — different file from 1.1 (types.ts vs spec.schema.json)
- 2.14 [P] and 2.15 [P]: both create files in new verification-before-completion dir, no overlap with each other's output
- 2.20 [P] and 2.21 [P]: different files (scripts/check-verification-blocks.mjs vs package.json); 2.21 does NOT depend on 2.20's output (only appends to verify chain), though logically they ship together — mark parallel since file overlap is zero

## Notes

- **POC shortcuts in Phase 1**: `walkSrcTree` stub returns `Date.now()` (always fresh); stale-detection deferred to Phase 2; only "missing block" case tested in POC
- **open question resolution**: walkSrcTree uses `src/**` scope for `npm run verify` path; spec dir for hooks; Ajv is NOT added as runtime dep — hand-rolled field-presence validator in merge-state.ts
- **check-verification-blocks.mjs graceful no-op**: when no `.curdx/active-spec` and no specs dir, exits 0 (avoids breaking CI on non-spec repos)
- **D5 contract enforced**: `stop_hook_active` early-exit is FIRST line; Task 1.5 confirms/locks this; spec E must not alter `runStopHook()` entry
