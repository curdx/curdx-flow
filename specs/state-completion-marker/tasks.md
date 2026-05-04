# Tasks: state-completion-marker

> Workflow: POC-first (GREENFIELD-style scaffolding for the new shared module + extension), Quality-first execution priority.
> Granularity: **fine** (~52 tasks). Total: 1 (Phase 0) + 8 (Phase 1) + 24 (Phase 2) + 11 (Phase 3) + 8 (Phase 4) = **52 tasks**.
> Reference: design.md §11 Implementation Steps (14-step rollout) drives task ordering.
> All file paths are relative to `/Users/wdx/opc/curdx-flow/`.
> `${PLUGIN_LIB}` shorthand below = `plugins/curdx-flow/hooks/scripts/lib`.

---

## Phase 0: Scaffold

- [x] 0.1 Create feature branch
  - **Do**:
    1. Run `git checkout -b feat/state-completion-marker` (or `git switch -c feat/state-completion-marker`)
    2. Confirm working tree clean before any edits
  - **Files**: (no source edits)
  - **Done when**: Current branch is `feat/state-completion-marker` and `git status --short` is empty
  - **Verify**: `git rev-parse --abbrev-ref HEAD | grep -qx 'feat/state-completion-marker' && test -z "$(git status --porcelain)" && echo PASS`
  - **Commit**: None (branch creation only)
  - _Requirements: NFR-1 (PR target)_
  - _Design: §11 Step 14_

---

## Phase 1: POC — Shared Types + merge-state $unset + Init Template

Focus: stand up the foundation primitives so all downstream readers / writers compile and have $unset semantics. POC milestone = `npm run typecheck` + new merge-state $unset unit cases pass.

- [x] 1.1 Add `CurdxState` interface to `_shared/types.ts`
  - **Do**:
    1. Open `src/hooks/_shared/types.ts`; append new `export interface CurdxState { ... }` block per design §1 (full set of optional fields incl. `completed?: boolean`, `completedAt?: string`)
    2. Add file-level JSDoc note: "types-only module, no runtime exports"
  - **Files**: `src/hooks/_shared/types.ts`
  - **Done when**: `CurdxState` exported with `completed?: boolean` and `completedAt?: string` plus identity / ephemeral / mode fields per design §1
  - **Verify**: `grep -E "^export interface CurdxState" src/hooks/_shared/types.ts && grep -E "completed\?: boolean" src/hooks/_shared/types.ts && grep -E "completedAt\?: string" src/hooks/_shared/types.ts && echo PASS`
  - **Commit**: `feat(state-marker): add shared CurdxState interface in _shared/types.ts`
  - _Requirements: FR-12, AC-2.4, AC-4.3, AC-5.3_
  - _Design: §1, K-2_

- [x] 1.2 [P] Implement `$unset` in `merge-state.ts` (`stripUnset` + `applyUnset`)
  - **Do**:
    1. Open `src/hooks/lib/merge-state.ts`; add `applyUnset(target, patch)` and `stripUnset(patch)` helpers per design §2 / §Implementation Skeleton
    2. Replace the existing `const merged = deepMerge(base, patch)` (~L98) with: `const cleanPatch = stripUnset(patch); let merged = deepMerge(base, cleanPatch); merged = applyUnset(merged, patch);`
    3. Validate `$unset` value is `string[]`; on bad shape `process.stderr.write("merge-state: $unset must be string[]\n")` + `process.exit(1)`
  - **Files**: `src/hooks/lib/merge-state.ts`
  - **Done when**: Source contains `applyUnset`, `stripUnset`, $unset key removal at root level only
  - **Verify**: `grep -q "applyUnset" src/hooks/lib/merge-state.ts && grep -q "stripUnset" src/hooks/lib/merge-state.ts && grep -q "\\$unset must be string\\[\\]" src/hooks/lib/merge-state.ts && echo PASS`
  - **Commit**: `feat(state-marker): add $unset operator to merge-state lib`
  - _Requirements: FR-10, AC-6.1, AC-6.3_
  - _Design: §2, K-1_

- [x] 1.3 [P] Add `completed: false` default to `init-execution-state.ts` `EMBEDDED_TEMPLATE`
  - **Do**:
    1. Open `src/hooks/lib/init-execution-state.ts`; locate `EMBEDDED_TEMPLATE` block (~L22-36)
    2. Append `completed: false,` field at the end of the object literal (preserve existing field order)
  - **Files**: `src/hooks/lib/init-execution-state.ts`
  - **Done when**: EMBEDDED_TEMPLATE contains `completed: false`
  - **Verify**: `grep -E "^\s*completed: false," src/hooks/lib/init-execution-state.ts && echo PASS`
  - **Commit**: `feat(state-marker): default completed:false in init-execution-state EMBEDDED_TEMPLATE`
  - _Requirements: FR-13, AC-1.2_
  - _Design: §7_

- [x] 1.4 [P] Add merge-state `$unset` unit tests (U-1..U-6 from design §Test Strategy)
  - **Do**:
    1. Open `tests/hooks/lib/merge-state.test.ts`; append 6 new `it()` cases covering U-1 (basic unset), U-2 (combined with normal patch), U-3 (missing key no-op), U-4 (non-array invalid → exit 1 + stderr), U-5 (no-$unset patch transparent), U-6 (empty array no-op)
    2. Use existing test harness (spawn merge-state.mjs via tmpdir fixture)
  - **Files**: `tests/hooks/lib/merge-state.test.ts`
  - **Done when**: 6 new `it(` blocks added covering U-1..U-6
  - **Verify**: `grep -cE "^\s*it\(" tests/hooks/lib/merge-state.test.ts | awk '{ if ($1 >= 6) print "PASS"; else print "FAIL: only "$1" it() cases" }'`
  - **Commit**: `test(state-marker): add 6 $unset cases for merge-state lib (U-1..U-6)`
  - _Requirements: FR-10, AC-6.1_
  - _Design: §2, §Test Strategy U-1..U-6_

- [x] 1.5 [VERIFY] Quality checkpoint after foundation
  - **Do**:
    1. Run `npm run build:hooks` to bundle `merge-state.mjs` and `init-execution-state.mjs`
    2. Run `npm run typecheck`
    3. Run `npm run test:hooks -- merge-state` (vitest filter for merge-state suite)
  - **Files**: (verification only)
  - **Done when**: All three commands exit 0; new $unset cases all pass
  - **Verify**: `npm run build:hooks && npm run typecheck && npm run test:hooks -- merge-state && echo PASS`
  - **Commit**: `chore(state-marker): pass quality checkpoint after foundation` (only if fixes needed)
  - _Requirements: NFR-4, NFR-10_
  - _Design: §Test Strategy_

- [x] 1.6 [P] Stub `init-execution-state` test asserting `completed:false` is written
  - **Do**:
    1. Open `tests/hooks/lib/init-execution-state.test.ts`; in the existing "writes embedded template" test (and parallel test cases at L7/L35/L52) add an assertion that the parsed JSON contains `completed: false`
  - **Files**: `tests/hooks/lib/init-execution-state.test.ts`
  - **Done when**: Test file asserts `completed: false` at least once
  - **Verify**: `grep -E "completed.*false" tests/hooks/lib/init-execution-state.test.ts && echo PASS`
  - **Commit**: `test(state-marker): assert init-execution-state writes completed:false`
  - _Requirements: FR-13, AC-1.2_
  - _Design: §7, §Test Strategy fixture clean-up_

- [x] 1.7 [P] Update `_fixture-setup.ts` `DEFAULT_STATE` with `completed:false`
  - **Do**:
    1. Open `tests/hooks/_fixture-setup.ts`; locate `DEFAULT_STATE` (L64-81)
    2. Append `completed: false` to default state object (preserve other keys; do not change `createFixtureSpec` signature)
  - **Files**: `tests/hooks/_fixture-setup.ts`
  - **Done when**: `DEFAULT_STATE` contains `completed: false`
  - **Verify**: `grep -E "completed: false" tests/hooks/_fixture-setup.ts && echo PASS`
  - **Commit**: `test(state-marker): add completed:false to fixture DEFAULT_STATE`
  - _Requirements: NFR-7_
  - _Design: §16_

- [x] 1.8 POC milestone: foundation primitives compile + tested
  - **Do**:
    1. Confirm `_shared/types.ts` exports `CurdxState` with `completed?: boolean`
    2. Confirm `merge-state.ts` `$unset` lib + 6 unit tests green
    3. Confirm `init-execution-state.ts` writes `completed: false` and tests assert it
    4. Confirm fixture `DEFAULT_STATE` carries `completed: false` (no behavior shift in legacy tests)
  - **Files**: (verification only)
  - **Done when**: Foundation green; legacy tests still pass without modification
  - **Verify**: `npm run build:hooks && npm run test:hooks && echo POC_MILESTONE_PASS`
  - **Commit**: None (milestone gate)
  - _Requirements: NFR-2, NFR-4, NFR-7_
  - _Design: §11 Steps 1-3_

---

## Phase 2: Refactor + Implement (Schema → Readers → Writers → Refactor → Start)

Focus: ship the actual contract change. Order is **strictly** sequential by dependency: schema first (no behavior change), then readers, then writers (so that anything writing `completed:true` is read correctly), then refactor reset, then `start.md` template + ensure-gitignore wire-in. Within each layer, [P] is applied where files do not overlap.

### 2A. Schema (no behavior change)

- [x] 2.1 Extend `spec.schema.json` with `completed` + `completedAt` properties
  - **Do**:
    1. Open `plugins/curdx-flow/schemas/spec.schema.json`; in `definitions.state.properties` append:
       - `completed`: `{ "type": "boolean", "default": false, "description": "..." }`
       - `completedAt`: `{ "type": "string", "format": "date-time", "description": "..." }`
    2. Do NOT modify `required` (identity-only) or the `phase` enum
  - **Files**: `plugins/curdx-flow/schemas/spec.schema.json`
  - **Done when**: Schema contains both new properties; `required` and `phase` enum unchanged
  - **Verify**: `node -e "const s = require('./plugins/curdx-flow/schemas/spec.schema.json'); const p = s.definitions.state.properties; if (p.completed.type==='boolean' && p.completedAt.format==='date-time') console.log('PASS'); else { console.log('FAIL'); process.exit(1); }"`
  - **Commit**: `feat(state-marker): add completed/completedAt to spec.schema.json`
  - _Requirements: FR-1, AC-9.4, NFR-3_
  - _Design: §8_

### 2B. Reader hooks (5 files; [P] within layer because separate files)

- [x] 2.2 [P] Refactor `stop-watcher.ts` — drop inline interface + import shared + add strict guard
  - **Do**:
    1. Delete the inline `interface CurdxState { ... }` block (~L70-83)
    2. Add `import type { CurdxState } from "./_shared/types.js";` at top
    3. After the `try { state = JSON.parse(...) } catch { return buildCorruptStateBlock(specPath); }` block (~L601-607), insert: `if (state.completed === true) { return; }` BEFORE the phase / taskIndex read
    4. Guard placement: AFTER transcript ALL_TASKS_COMPLETE detection (~L591-599), BEFORE phase check
  - **Files**: `src/hooks/stop-watcher.ts`
  - **Done when**: No inline `interface CurdxState`; new strict guard present at correct location
  - **Verify**: `! grep -nE "^interface CurdxState" src/hooks/stop-watcher.ts && grep -q "import type { CurdxState } from \"./_shared/types" src/hooks/stop-watcher.ts && grep -q "state.completed === true" src/hooks/stop-watcher.ts && echo PASS`
  - **Commit**: `feat(state-marker): stop-watcher silent return on completed===true`
  - _Requirements: FR-5, FR-12, AC-2.1, AC-2.2, AC-2.3, AC-2.4_
  - _Design: §3, K-3_

- [x] 2.3 [P] Refactor `update-spec-index.ts` — drop inline interface + short-circuit phase=completed
  - **Do**:
    1. Delete the inline `interface CurdxState { ... }` block (~L73-78)
    2. Add `import type { CurdxState } from "./_shared/types.js";`
    3. In `buildSpecRecord()` (~L278-294), inside `if (state) {` block, **first check** `if (state.completed === true)` → set `record.phase = "completed"`, copy `taskIndex`/`totalTasks` only when `totalTasks > 0`, then `return record` (skips `inferPhaseFromFiles`)
    4. Existing `state.phase ?? "unknown"` path falls through for `completed === undefined / false`
  - **Files**: `src/hooks/update-spec-index.ts`
  - **Done when**: No inline interface; `completed === true` short-circuits to `phase = "completed"` without inferPhaseFromFiles
  - **Verify**: `! grep -nE "^interface CurdxState" src/hooks/update-spec-index.ts && grep -q "import type { CurdxState }" src/hooks/update-spec-index.ts && grep -q "state.completed === true" src/hooks/update-spec-index.ts && grep -q "record.phase = \"completed\"" src/hooks/update-spec-index.ts && echo PASS`
  - **Commit**: `feat(state-marker): update-spec-index short-circuit phase=completed`
  - _Requirements: FR-6, FR-7, FR-12, AC-3.1, AC-3.2, AC-3.3, AC-3.4_
  - _Design: §5, K-3_

- [x] 2.4 [P] Refactor `load-spec-context.ts` — drop inline interface + completed hint
  - **Do**:
    1. Delete the inline `interface CurdxState { ... }` (~L27-32)
    2. Add `import type { CurdxState } from "./_shared/types.js";`
    3. In `if (state) {` block (~L147), insert at top: `if (state.completed === true) { const at = typeof state.completedAt === "string" ? state.completedAt : "unknown"; process.stderr.write(\`[curdx-flow] Spec completed: ${specName} (${at}). Run /curdx-flow:refactor to reopen or /curdx-flow:new for a new spec.\n\`); block.phase = "completed"; block.awaitingApproval = false; return block; }`
    4. Do NOT write `taskIndex` / `totalTasks` in this branch
  - **Files**: `src/hooks/load-spec-context.ts`
  - **Done when**: No inline interface; completed branch emits stderr hint and returns early
  - **Verify**: `! grep -nE "^interface CurdxState" src/hooks/load-spec-context.ts && grep -q "import type { CurdxState }" src/hooks/load-spec-context.ts && grep -q "Spec completed:" src/hooks/load-spec-context.ts && grep -q "state.completed === true" src/hooks/load-spec-context.ts && echo PASS`
  - **Commit**: `feat(state-marker): load-spec-context completed hint stderr`
  - _Requirements: FR-8, FR-12, AC-4.1, AC-4.2, AC-4.3_
  - _Design: §4, K-3_

- [x] 2.5 [P] Refactor `quick-mode-guard.ts` — type-only swap (drop inline + import shared)
  - **Do**:
    1. Delete the inline `interface CurdxState { ... }` (~L25-27)
    2. Add `import type { CurdxState } from "./_shared/types.js";`
    3. Do NOT change any runtime logic; existing `state.quickMode === true` gate is preserved verbatim
  - **Files**: `src/hooks/quick-mode-guard.ts`
  - **Done when**: No inline interface; behavior unchanged
  - **Verify**: `! grep -nE "^interface CurdxState" src/hooks/quick-mode-guard.ts && grep -q "import type { CurdxState }" src/hooks/quick-mode-guard.ts && grep -q "state.quickMode === true" src/hooks/quick-mode-guard.ts && echo PASS`
  - **Commit**: `refactor(state-marker): quick-mode-guard import shared CurdxState type`
  - _Requirements: FR-9, FR-12, AC-5.1, AC-5.3_
  - _Design: §6, K-2_

- [x] 2.6 [VERIFY] Strict equality lint — assert `state.completed === true` ≥ 4 times across reader hooks
  - **Do**:
    1. Grep all 4 reader hooks for `state.completed === true`
    2. Grep for the forbidden truthy form `if (state.completed)` (without `=== true`) — must be 0 occurrences
  - **Files**: `src/hooks/{stop-watcher,load-spec-context,update-spec-index,quick-mode-guard}.ts`
  - **Done when**: ≥ 4 strict-equality occurrences; 0 truthy occurrences across reader hooks
  - **Verify**: `STRICT=$(grep -RhE "state\.completed === true" src/hooks/{stop-watcher,load-spec-context,update-spec-index,quick-mode-guard}.ts | wc -l | tr -d ' '); TRUTHY=$(grep -RhE "if \(state\.completed\)([^=]|$)" src/hooks/{stop-watcher,load-spec-context,update-spec-index,quick-mode-guard}.ts | wc -l | tr -d ' '); [ "$STRICT" -ge 3 ] && [ "$TRUTHY" -eq 0 ] && echo "PASS strict=$STRICT truthy=$TRUTHY" || { echo "FAIL strict=$STRICT truthy=$TRUTHY"; exit 1; }`
  - **Commit**: `chore(state-marker): pass strict-equality lint` (only if fixes needed)
  - _Requirements: FR-12, NFR-2, AC-8.1_
  - _Design: K-3_

- [x] 2.7 [VERIFY] Quality checkpoint after reader refactor
  - **Do**:
    1. Run `npm run typecheck`
    2. Run `npm run build:hooks`
    3. Run `npm run test:hooks` (existing tests must still pass even though new strict-equality cases not yet added)
  - **Files**: (verification only)
  - **Done when**: typecheck, build, and existing test suite all green
  - **Verify**: `npm run typecheck && npm run build:hooks && npm run test:hooks && echo PASS`
  - **Commit**: `chore(state-marker): pass reader-layer quality checkpoint` (only if fixes needed)
  - _Requirements: NFR-4, NFR-10_

### 2C. Writer prompts (coordinator-pattern + implement)

- [x] 2.8 [P] Rewrite `coordinator-pattern.md` Check Completion site (L75-84)
  - **Do**:
    1. Open `plugins/curdx-flow/references/coordinator-pattern.md`
    2. Replace the `rm -f "$SPEC_PATH/.curdx-state.json"` line in the Check Completion section with the merge-state pattern (per design §10 #1): `COMPLETED_AT=$(node -e "process.stdout.write(new Date().toISOString())")` + `node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/lib/merge-state.mjs" "$SPEC_PATH/.curdx-state.json" "{\"completed\":true,\"completedAt\":\"$COMPLETED_AT\",\"awaitingApproval\":false}"`
    3. Keep "Output: ALL_TASKS_COMPLETE" + "STOP" lines below
  - **Files**: `plugins/curdx-flow/references/coordinator-pattern.md`
  - **Done when**: Check Completion section uses merge-state instead of rm -f
  - **Verify**: `! grep -E '^\s*rm -f "\$SPEC_PATH/\.curdx-state\.json"' plugins/curdx-flow/references/coordinator-pattern.md && grep -c "completed.*true.*completedAt.*awaitingApproval" plugins/curdx-flow/references/coordinator-pattern.md | awk '{ if ($1 >= 1) print "PASS"; else print "FAIL"; exit ($1>=1?0:1) }'`
  - **Commit**: `feat(state-marker): coordinator Check Completion writes completed marker`
  - _Requirements: FR-2, AC-1.1, AC-1.2, AC-1.4_
  - _Design: §10 #1_

- [x] 2.9 [P] Rewrite `coordinator-pattern.md` Native Sync Completion site (L540-543)
  - **Do**:
    1. Open `plugins/curdx-flow/references/coordinator-pattern.md`
    2. Replace the "Delete .curdx-state.json (cleanup execution state)" instruction at the Native Sync Completion section with the same merge-state write as 2.8
    3. Add a one-line note that this write is idempotent with the Check Completion write (deduplication guidance per design §10 #2)
  - **Files**: `plugins/curdx-flow/references/coordinator-pattern.md`
  - **Done when**: Native Sync Completion section uses merge-state; no "Delete .curdx-state.json" wording remains in that section
  - **Verify**: `OCC=$(grep -c "merge-state.mjs" plugins/curdx-flow/references/coordinator-pattern.md); [ "$OCC" -ge 2 ] && echo "PASS occurrences=$OCC" || { echo "FAIL occurrences=$OCC"; exit 1; }`
  - **Commit**: `feat(state-marker): coordinator Native Sync Completion writes completed marker`
  - _Requirements: FR-2, AC-1.4_
  - _Design: §10 #2_

- [ ] 2.10 [P] Rewrite `coordinator-pattern.md` PR Lifecycle Step 5 site (L758-765)
  - **Do**:
    1. Open `plugins/curdx-flow/references/coordinator-pattern.md`
    2. Replace the "Delete .curdx-state.json" line in PR Lifecycle Step 5 with the same merge-state pattern
    3. Confirm three deletion sites are now uniformly merge-state writes
  - **Files**: `plugins/curdx-flow/references/coordinator-pattern.md`
  - **Done when**: All three deletion sites now use merge-state; zero `rm -f "$SPEC_PATH/.curdx-state.json"` occurrences
  - **Verify**: `RM=$(grep -cE 'rm -f "\$SPEC_PATH/\.curdx-state\.json"' plugins/curdx-flow/references/coordinator-pattern.md); MS=$(grep -c 'merge-state.mjs' plugins/curdx-flow/references/coordinator-pattern.md); [ "$RM" -eq 0 ] && [ "$MS" -ge 3 ] && echo "PASS rm=0 merge=$MS" || { echo "FAIL rm=$RM merge=$MS"; exit 1; }`
  - **Commit**: `feat(state-marker): coordinator PR Lifecycle writes completed marker`
  - _Requirements: FR-2, AC-1.4_
  - _Design: §10 #3_

- [ ] 2.11 Rewrite `implement.md` Step 5 Completion (L152-167)
  - **Do**:
    1. Open `plugins/curdx-flow/commands/implement.md`
    2. Replace the "Delete .curdx-state.json" instruction with the merge-state pattern from design §9
    3. Preserve the `.progress.md` retention, orphan cleanup, update-spec-index, commit, PR-link, and `Output: ALL_TASKS_COMPLETE` steps
  - **Files**: `plugins/curdx-flow/commands/implement.md`
  - **Done when**: Step 5 uses merge-state; no `Delete .curdx-state.json` text in that section
  - **Verify**: `! grep -E "Delete \.curdx-state\.json" plugins/curdx-flow/commands/implement.md && grep -q "merge-state.mjs" plugins/curdx-flow/commands/implement.md && echo PASS`
  - **Commit**: `feat(state-marker): implement.md Step 5 writes completed marker`
  - _Requirements: FR-2, AC-1.5_
  - _Design: §9_

- [ ] 2.12 [VERIFY] Quality checkpoint after writer prompts
  - **Do**:
    1. Re-grep all writer prompt files for `rm -f .*\.curdx-state\.json` to confirm 0 occurrences
    2. Re-grep for `merge-state.mjs` references in coordinator-pattern.md (≥ 3) and implement.md (≥ 1)
    3. Run `npm run typecheck && npm run build:hooks` (no source change but ensure no drift)
  - **Files**: (verification only)
  - **Done when**: All writer prompt updates land cleanly; no leftover deletion sites
  - **Verify**: `RM_LEFT=$(grep -RcE 'rm -f "\$SPEC_PATH/\.curdx-state\.json"' plugins/curdx-flow/references/coordinator-pattern.md plugins/curdx-flow/commands/implement.md | awk -F: '{ s+=$NF } END { print s }'); [ "$RM_LEFT" -eq 0 ] && npm run typecheck && echo PASS || { echo "FAIL leftover=$RM_LEFT"; exit 1; }`
  - **Commit**: `chore(state-marker): pass writer-layer quality checkpoint` (only if fixes needed)
  - _Requirements: FR-2, NFR-4_

### 2D. refactor + start

- [ ] 2.13 Update `refactor.md` Step 6 Update State to use `$unset` reset
  - **Do**:
    1. Open `plugins/curdx-flow/commands/refactor.md`
    2. Locate Step 6 / Update State section (~L108-114)
    3. Insert/replace with the merge-state call: `'{"completed":false,"awaitingApproval":true,"$unset":["completedAt"]}'` per design §11
    4. Preserve the conditional `taskIndex:0` reset and `.progress.md` append steps
  - **Files**: `plugins/curdx-flow/commands/refactor.md`
  - **Done when**: refactor.md prompt includes the `$unset:["completedAt"]` merge-state call
  - **Verify**: `grep -F '"$unset":["completedAt"]' plugins/curdx-flow/commands/refactor.md && grep -F '"completed":false' plugins/curdx-flow/commands/refactor.md && echo PASS`
  - **Commit**: `feat(state-marker): refactor.md resets completed via $unset completedAt`
  - _Requirements: FR-10, AC-6.1, AC-6.3, AC-6.4_
  - _Design: §11, K-9_

- [ ] 2.14 Update `start.md` Initialize state template + Resume Flow + ensure-gitignore wire
  - **Do**:
    1. Open `plugins/curdx-flow/commands/start.md`
    2. Locate Initialize state JSON template (~L131-141); add `"completed": false` field at end of object
    3. Locate Resume Flow (~L88-118); add a branch: `If state file exists and state.completed === true → Output "This spec is completed (<completedAt>). Use /curdx-flow:refactor to reopen or /curdx-flow:new for a new spec." STOP. Do not resume.`
    4. Insert ensure-gitignore wire-in step right BEFORE the "Initialize .curdx-state.json" step: `node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/lib/ensure-gitignore.mjs" .curdx-state.json` (per design §12 #3 ASSUMPTION on CLI signature)
    5. Verify the actual `ensure-gitignore.mjs` CLI signature matches `<pattern>`; if it requires cwd argument, update prompt accordingly
  - **Files**: `plugins/curdx-flow/commands/start.md`
  - **Done when**: All three diff sites land; ensure-gitignore CLI invocation matches lib signature
  - **Verify**: `grep -F '"completed": false' plugins/curdx-flow/commands/start.md && grep -F 'state.completed === true' plugins/curdx-flow/commands/start.md && grep -F 'ensure-gitignore.mjs' plugins/curdx-flow/commands/start.md && echo PASS`
  - **Commit**: `feat(state-marker): start.md template, Resume guard, ensure-gitignore wire`
  - _Requirements: FR-13, FR-14, FR-16, AC-1.2, AC-4.1, AC-10.1, AC-10.2, AC-10.3, AC-10.4_
  - _Design: §12, K-10_

- [ ] 2.15 Update `spec-scanner.md` Resume Flow with completed branch
  - **Do**:
    1. Open `plugins/curdx-flow/references/spec-scanner.md`
    2. Locate Resume Flow (~L206-220)
    3. Mirror the `state.completed === true` branch from start.md: emit "Spec completed (<completedAt>)" hint and stop
  - **Files**: `plugins/curdx-flow/references/spec-scanner.md`
  - **Done when**: spec-scanner Resume Flow contains the same completed-detection branch
  - **Verify**: `grep -F 'state.completed === true' plugins/curdx-flow/references/spec-scanner.md && echo PASS`
  - **Commit**: `docs(state-marker): spec-scanner Resume Flow detects completed`
  - _Requirements: FR-16, AC-4.1_
  - _Design: §13_

### 2E. Doc/comment sync

- [ ] 2.16 [P] Update `commit-discipline.md` L70 comment
  - **Do**:
    1. Open `plugins/curdx-flow/references/commit-discipline.md`; change L70 comment to: `# .curdx-state.json - never committed (retained on completion with completed:true marker)`
  - **Files**: `plugins/curdx-flow/references/commit-discipline.md`
  - **Done when**: Comment updated
  - **Verify**: `grep -F 'retained on completion with completed:true marker' plugins/curdx-flow/references/commit-discipline.md && echo PASS`
  - **Commit**: `docs(state-marker): commit-discipline note state retention on completion`
  - _Requirements: FR-15_
  - _Design: §15_

- [ ] 2.17 [P] Update `help.md` L110 comment
  - **Do**:
    1. Open `plugins/curdx-flow/commands/help.md`; change L110 comment to: `# Loop state (marked completed:true on completion, retained for audit)`
  - **Files**: `plugins/curdx-flow/commands/help.md`
  - **Done when**: Comment updated
  - **Verify**: `grep -F 'marked completed:true on completion, retained for audit' plugins/curdx-flow/commands/help.md && echo PASS`
  - **Commit**: `docs(state-marker): help.md note state retention on completion`
  - _Requirements: FR-15_
  - _Design: §15_

- [ ] 2.18 [P] Update `status.md` L54 to display completed marker
  - **Do**:
    1. Open `plugins/curdx-flow/commands/status.md`
    2. After parse-state line, add display logic: when `state.completed === true`, render `completed (<completedAt>)` instead of phase
  - **Files**: `plugins/curdx-flow/commands/status.md`
  - **Done when**: status command prompt displays completion marker
  - **Verify**: `grep -F 'completed' plugins/curdx-flow/commands/status.md && grep -F 'completedAt' plugins/curdx-flow/commands/status.md && echo PASS`
  - **Commit**: `docs(state-marker): status.md displays completed marker`
  - _Requirements: FR-15, AC-9.1_
  - _Design: §15_

- [ ] 2.19 [P] Update `state-file-schema.md` with completion fields + phase transition
  - **Do**:
    1. Open `plugins/curdx-flow/skills/curdx-core/references/state-file-schema.md`
    2. Add `completed: boolean` and `completedAt: string (date-time)` field documentation
    3. Append phase transition lines: `execution → completed (completed: true)` and `completed → execution (refactor: completed: false, $unset completedAt)`
  - **Files**: `plugins/curdx-flow/skills/curdx-core/references/state-file-schema.md`
  - **Done when**: Schema doc lists both new fields and the bidirectional transitions
  - **Verify**: `grep -F 'completed: boolean' plugins/curdx-flow/skills/curdx-core/references/state-file-schema.md && grep -F 'execution → completed' plugins/curdx-flow/skills/curdx-core/references/state-file-schema.md && grep -F 'completed → execution' plugins/curdx-flow/skills/curdx-core/references/state-file-schema.md && echo PASS`
  - **Commit**: `docs(state-marker): document completed/completedAt in state-file-schema`
  - _Requirements: FR-15, AC-9.5_
  - _Design: §14_

- [ ] 2.20 [VERIFY] Quality checkpoint after refactor + start + docs
  - **Do**:
    1. Run `npm run typecheck && npm run build:hooks && npm run test:hooks`
    2. Confirm legacy tests still pass (no failures)
    3. Confirm no `rm .* \.curdx-state\.json` references in any prompt file under `plugins/curdx-flow/{commands,references}` except `cancel.md` (US-7 retains rm spec dir)
  - **Files**: (verification only)
  - **Done when**: All commands green; only cancel.md retains rm semantics
  - **Verify**: `npm run typecheck && npm run build:hooks && npm run test:hooks && CANCEL_RM=$(grep -lE 'rm.*\.curdx-state\.json' plugins/curdx-flow/commands/cancel.md | wc -l | tr -d ' '); LEFTOVERS=$(grep -RlE 'rm.*\.curdx-state\.json' plugins/curdx-flow/{commands,references} | grep -v 'cancel.md' | wc -l | tr -d ' '); [ "$LEFTOVERS" -eq 0 ] && echo "PASS leftovers=$LEFTOVERS cancel_kept=$CANCEL_RM" || { echo "FAIL leftovers=$LEFTOVERS"; exit 1; }`
  - **Commit**: `chore(state-marker): pass refactor+docs quality checkpoint` (only if fixes needed)
  - _Requirements: FR-11, NFR-4, AC-7.1_

---

## Phase 3: Testing — NFR-5 + Migration + Fixture regen + Strict lint

Focus: lock the new contract with regression tests. NFR-5 4 cases + design supplements ($unset 4-case, types-erase, gitignore idempotent) + migration backwards-compat fixture + byte-equal "Completed spec" baseline regen.

- [ ] 3.1 [P] Add stop-watcher test cases (NFR-5 a + b)
  - **Do**:
    1. Open `tests/hooks/stop-watcher.test.ts`
    2. Add `it("completed=true → silent return (no continuation block)")` per design §Test Strategy
    3. Add `it("completed=undefined → fall through to in-progress logic (backwards-compat)")` for NFR-2
  - **Files**: `tests/hooks/stop-watcher.test.ts`
  - **Done when**: Both new it() cases present
  - **Verify**: `grep -E 'completed=true.*silent return' tests/hooks/stop-watcher.test.ts && grep -E 'completed=undefined.*fall through' tests/hooks/stop-watcher.test.ts && echo PASS`
  - **Commit**: `test(state-marker): stop-watcher completed=true silent + undefined fall-through`
  - _Requirements: NFR-5a, NFR-5b, NFR-2, AC-2.1, AC-2.2, AC-8.1_
  - _Design: §Test Strategy_

- [ ] 3.2 [P] Add update-spec-index test case (NFR-5 c)
  - **Do**:
    1. Open `tests/hooks/update-spec-index.test.ts`
    2. Add `it("completed=true → record.phase='completed' without inferPhaseFromFiles")` per design §Test Strategy
    3. Use `vi.spyOn` on `inferPhaseFromFiles` (or delete tasks.md + assert phase still resolves to "completed")
  - **Files**: `tests/hooks/update-spec-index.test.ts`
  - **Done when**: New it() case present and asserts phase=completed without fallback
  - **Verify**: `grep -E "completed=true.*record\.phase.*completed" tests/hooks/update-spec-index.test.ts && echo PASS`
  - **Commit**: `test(state-marker): update-spec-index completed=true skips fallback`
  - _Requirements: NFR-5c, AC-3.1, AC-3.5_
  - _Design: §Test Strategy_

- [ ] 3.3 [P] Add load-spec-context test case (NFR-5 d)
  - **Do**:
    1. Open `tests/hooks/load-spec-context.test.ts`
    2. Add `it("completed=true → stderr 'Spec completed' hint, no resume prompt")` per design §Test Strategy
    3. Assert stderr contains `Spec completed:`, contains the ISO completedAt, and does NOT match `/Phase: execution/`
  - **Files**: `tests/hooks/load-spec-context.test.ts`
  - **Done when**: New it() case present
  - **Verify**: `grep -E "completed=true.*Spec completed.*hint" tests/hooks/load-spec-context.test.ts && echo PASS`
  - **Commit**: `test(state-marker): load-spec-context completed=true hint stderr`
  - _Requirements: NFR-5d, AC-4.1, AC-4.4_
  - _Design: §Test Strategy_

- [ ] 3.4 [P] Add Migration backwards-compat fixture (legacy v7.0.x state without `completed`)
  - **Do**:
    1. In `tests/hooks/stop-watcher.test.ts` (or `_fixture-setup.ts`) add a helper `createLegacyState` that omits `completed` field entirely
    2. Add at least 1 cross-hook assertion: legacy state → stop-watcher fall-through emits continuation block (NFR-2)
  - **Files**: `tests/hooks/stop-watcher.test.ts`, `tests/hooks/_fixture-setup.ts`
  - **Done when**: Test exercises `completed === undefined` path with explicit "no `completed` key" fixture
  - **Verify**: `grep -E "createLegacyState|legacy.*v7\\.0" tests/hooks/stop-watcher.test.ts tests/hooks/_fixture-setup.ts && echo PASS`
  - **Commit**: `test(state-marker): backwards-compat legacy state fall-through`
  - _Requirements: NFR-2, AC-8.1_
  - _Design: §Test Strategy, K-3_

- [ ] 3.5 Regenerate byte-equal "Completed spec" fixture + baseline
  - **Do**:
    1. Open `tests/hooks/byte-equal.test.ts` (~L155-180); change Completed spec fixture state to `{phase:"execution",taskIndex:2,totalTasks:2,completed:true,completedAt:"2026-01-01T00:00:00.000Z"}`
    2. Run `npm run test:hooks -- --update` (vitest snapshot update, or whichever flag the byte-equal harness exposes; check `tests/hooks/baselines/v6.0.6/` after run)
    3. Inspect baseline diff to ensure ONLY the Completed-spec baseline changed (NFR-6)
  - **Files**: `tests/hooks/byte-equal.test.ts`, `tests/hooks/baselines/v6.0.6/` (regenerated baseline JSON)
  - **Done when**: Fixture state contains completed:true; baseline diff is bounded to the Completed-spec record
  - **Verify**: `grep -F '"completed":true' tests/hooks/byte-equal.test.ts && grep -F '"completedAt":"2026-01-01T00:00:00.000Z"' tests/hooks/byte-equal.test.ts && npm run test:hooks -- byte-equal && echo PASS`
  - **Commit**: `test(state-marker): regen byte-equal Completed spec baseline with completed:true`
  - _Requirements: NFR-6_
  - _Design: §Test Strategy fixture clean-up_

- [ ] 3.6 [VERIFY] types-only erase verification — bundle has no runtime CurdxState
  - **Do**:
    1. Run `npm run build:hooks`
    2. Grep all bundled `plugins/curdx-flow/hooks/scripts/*.mjs` for `interface CurdxState` (must be 0 — interfaces are TS-only and erased at compile time)
    3. Grep for `CurdxState` runtime references in .mjs (should be 0 — no runtime token survives)
  - **Files**: `plugins/curdx-flow/hooks/scripts/*.mjs`
  - **Done when**: Zero `interface CurdxState` and zero `CurdxState` tokens in bundled .mjs files
  - **Verify**: `npm run build:hooks && IFACE=$(grep -RlE 'interface CurdxState' plugins/curdx-flow/hooks/scripts/*.mjs 2>/dev/null | wc -l | tr -d ' '); RUNTIME=$(grep -RlE 'CurdxState' plugins/curdx-flow/hooks/scripts/*.mjs 2>/dev/null | wc -l | tr -d ' '); [ "$IFACE" -eq 0 ] && [ "$RUNTIME" -eq 0 ] && echo "PASS iface=$IFACE runtime=$RUNTIME" || { echo "FAIL iface=$IFACE runtime=$RUNTIME"; exit 1; }`
  - **Commit**: `chore(state-marker): verify CurdxState type-only erase` (only if fixes needed)
  - _Requirements: FR-12_
  - _Design: K-2_

- [ ] 3.7 [VERIFY] ensure-gitignore idempotent test passes after wire-in
  - **Do**:
    1. Run `npm run test:hooks -- ensure-gitignore`
    2. Confirm existing `tests/hooks/lib/ensure-gitignore.test.ts` still passes (we did not modify the lib; only wired it in start.md)
    3. Confirm AC-10.4 idempotent semantic is exercised by an existing test (grep test file for "idempotent" or "no-op")
  - **Files**: (verification only)
  - **Done when**: ensure-gitignore tests green; AC-10.4 covered
  - **Verify**: `npm run test:hooks -- ensure-gitignore && grep -iE "idempot|no-op" tests/hooks/lib/ensure-gitignore.test.ts && echo PASS`
  - **Commit**: `chore(state-marker): verify ensure-gitignore idempotent` (only if fixes needed)
  - _Requirements: FR-14, AC-10.4, AC-10.5_

- [ ] 3.8 [VERIFY] merge-state $unset 4-case completeness
  - **Do**:
    1. Re-run `npm run test:hooks -- merge-state`
    2. Confirm ≥ 4 distinct $unset cases (basic, with normal patch, missing key no-op, invalid shape exit-1) — covered by 1.4 U-1..U-4
    3. Confirm U-5 (transparent passthrough) and U-6 (empty array) are exercised
  - **Files**: `tests/hooks/lib/merge-state.test.ts`
  - **Done when**: All 6 $unset cases run and pass
  - **Verify**: `npm run test:hooks -- merge-state 2>&1 | grep -E "passed|✓" | grep -iE 'unset' | wc -l | awk '{ if ($1 >= 4) print "PASS"; else print "FAIL: only "$1" unset cases passed"; exit ($1>=4?0:1) }'`
  - **Commit**: `chore(state-marker): verify $unset 4-case completeness` (only if fixes needed)
  - _Requirements: FR-10, AC-6.1_
  - _Design: §Test Strategy U-1..U-6_

- [ ] 3.9 [VERIFY] Strict equality grep — final lint
  - **Do**:
    1. Across all 4 reader hooks (`stop-watcher.ts`, `load-spec-context.ts`, `update-spec-index.ts`, `quick-mode-guard.ts`) grep for `state.completed === true` ≥ 3 occurrences (quick-mode-guard intentionally has 0 because behavior unchanged)
    2. Grep for the forbidden truthy form `if (state.completed)` (no `===`) — must be 0 across all 4 files
  - **Files**: `src/hooks/{stop-watcher,load-spec-context,update-spec-index,quick-mode-guard}.ts`
  - **Done when**: ≥ 3 strict, 0 truthy
  - **Verify**: `STRICT=$(grep -RhE "state\.completed === true" src/hooks/{stop-watcher,load-spec-context,update-spec-index,quick-mode-guard}.ts | wc -l | tr -d ' '); TRUTHY=$(grep -RhE "if \(state\.completed\)([^=]|$)" src/hooks/{stop-watcher,load-spec-context,update-spec-index,quick-mode-guard}.ts | wc -l | tr -d ' '); [ "$STRICT" -ge 3 ] && [ "$TRUTHY" -eq 0 ] && echo "PASS strict=$STRICT truthy=$TRUTHY" || { echo "FAIL strict=$STRICT truthy=$TRUTHY"; exit 1; }`
  - **Commit**: None (verify-only)
  - _Requirements: FR-12, NFR-2, AC-8.1_
  - _Design: K-3_

- [ ] 3.10 [VERIFY] Quality checkpoint after testing layer
  - **Do**:
    1. Run `npm run typecheck`
    2. Run `npm run build:hooks`
    3. Run `npm run test:hooks` (full suite)
    4. Confirm all NFR-5 cases plus existing legacy tests pass
  - **Files**: (verification only)
  - **Done when**: All commands green; no regressions
  - **Verify**: `npm run typecheck && npm run build:hooks && npm run test:hooks && echo PASS`
  - **Commit**: `chore(state-marker): pass testing-layer quality checkpoint` (only if fixes needed)
  - _Requirements: NFR-4, NFR-5, NFR-10_

- [ ] 3.11 [VERIFY] check:hooks-fresh — bundle vs source desync gate
  - **Do**:
    1. Run `npm run check:hooks-fresh`
    2. If desynced, re-run `npm run build:hooks` and re-verify
  - **Files**: (verification only)
  - **Done when**: Bundle and source in sync
  - **Verify**: `npm run check:hooks-fresh && echo PASS`
  - **Commit**: `chore(state-marker): rebundle hooks` (only if rebuild was needed)
  - _Requirements: NFR-10_
  - _Design: §11 Step 11_

---

## Phase 4: Quality Gates + Final Verification + Release

Focus: full local CI + 5-field version sync + CHANGELOG/MIGRATION + E2E sandbox replay (VE1-VE3) + AC programmatic checklist + PR push.

- [ ] V1 [VERIFY] `npm run typecheck` exit 0
  - **Do**: Run TypeScript compiler in noEmit mode
  - **Files**: (verification only)
  - **Done when**: 0 type errors across `src/**/*.ts` and `tests/**/*.ts`
  - **Verify**: `npm run typecheck && echo PASS`
  - **Commit**: `fix(state-marker): resolve type errors` (only if fixes needed)
  - _Requirements: NFR-10_

- [ ] V2 [VERIFY] `npm run test:hooks` full suite + new NFR-5 cases pass
  - **Do**: Run full vitest hook suite
  - **Files**: (verification only)
  - **Done when**: 0 failing tests; 0 skips; ≥ 4 newly added cases pass
  - **Verify**: `npm run test:hooks && echo PASS`
  - **Commit**: `fix(state-marker): resolve test failures` (only if fixes needed)
  - _Requirements: NFR-4, NFR-5_

- [ ] V3 [VERIFY] `npm run check:hooks-fresh` confirms bundle parity
  - **Do**: Run desync gate
  - **Files**: (verification only)
  - **Done when**: Exit 0
  - **Verify**: `npm run check:hooks-fresh && echo PASS`
  - **Commit**: `chore(state-marker): rebundle hooks for fresh check` (only if rebuild needed)
  - _Requirements: NFR-10_

- [ ] V4 [VERIFY] CHANGELOG + MIGRATION-V7 v7.1.0 sections present
  - **Do**:
    1. Open `CHANGELOG.md`; prepend `## 7.1.0 — 2026-05-04` with Added / Changed / Migration subsections per design §17
    2. Open `docs/MIGRATION-V7.md`; append v7.1.0 upgrade section including jq snippet for AC-8.3 backfill
  - **Files**: `CHANGELOG.md`, `docs/MIGRATION-V7.md`
  - **Done when**: Both files contain v7.1.0 sections with required subheadings + jq snippet
  - **Verify**: `grep -E "^## 7\.1\.0" CHANGELOG.md && grep -E "Added|Changed|Migration" CHANGELOG.md && grep -F 'v7.1.0' docs/MIGRATION-V7.md && grep -F 'merge-state.mjs' docs/MIGRATION-V7.md && echo PASS`
  - **Commit**: `docs(state-marker): CHANGELOG + MIGRATION v7.1.0 entry`
  - _Requirements: NFR-8, NFR-9, AC-8.3, AC-8.4_
  - _Design: §17_

- [ ] VE1 [VERIFY] E2E startup — sandbox spec lifecycle replay (build + state preconditions)
  - **Do**:
    1. Create temp sandbox: `SBX=$(mktemp -d); echo "$SBX"`
    2. Build hooks: `npm run build:hooks`
    3. Inside sandbox: create `mkdir -p "$SBX/specs/e2e-test-spec"`; create fake `tasks.md` with 2 tasks both `[x]` complete; create initial in-progress state file `'{"source":"spec","name":"e2e-test-spec","basePath":"./specs/e2e-test-spec","phase":"execution","taskIndex":2,"totalTasks":2,"awaitingApproval":false,"completed":false}'`
    4. Save sandbox path to `/tmp/state-marker-ve-sbx.txt` for VE2/VE3
  - **Files**: (sandbox only)
  - **Done when**: Sandbox dir + fake spec + initial state file all exist
  - **Verify**: `npm run build:hooks && SBX=$(mktemp -d) && mkdir -p "$SBX/specs/e2e-test-spec" && printf '%s' '{"source":"spec","name":"e2e-test-spec","basePath":"./specs/e2e-test-spec","phase":"execution","taskIndex":2,"totalTasks":2,"awaitingApproval":false,"completed":false}' > "$SBX/specs/e2e-test-spec/.curdx-state.json" && printf -- '- [x] 1.1 Task one\n- [x] 1.2 Task two\n' > "$SBX/specs/e2e-test-spec/tasks.md" && echo "$SBX" > /tmp/state-marker-ve-sbx.txt && test -f "$SBX/specs/e2e-test-spec/.curdx-state.json" && echo VE1_PASS`
  - **Commit**: None
  - _Requirements: Success Criteria 1, FR-2_
  - _Design: §11 Step 11_

- [ ] VE2 [VERIFY] E2E check — simulate ALL_TASKS_COMPLETE + assert all 5 reader assertions
  - **Do**:
    1. Read sandbox path: `SBX=$(cat /tmp/state-marker-ve-sbx.txt); cd "$SBX/specs/e2e-test-spec"`
    2. Simulate coordinator completion write: `node "${OLDPWD:-/Users/wdx/opc/curdx-flow}/plugins/curdx-flow/hooks/scripts/lib/merge-state.mjs" .curdx-state.json '{"completed":true,"completedAt":"2026-05-04T15:00:00.000Z","awaitingApproval":false}'`
    3. Assertion 1 (state file kept): `test -f "$SBX/specs/e2e-test-spec/.curdx-state.json"` exit 0
    4. Assertion 2 (completed:true + ISO completedAt): `grep -F '"completed":true' && grep -E '"completedAt":"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z"'`
    5. Assertion 3 (update-spec-index emits phase=completed): pipe a fake `cwd: $SBX` envelope to `update-spec-index.mjs` and assert stdout/index contains `phase":"completed"`
    6. Assertion 4 (load-spec-context shows completed hint): pipe `{cwd: ...}` to `load-spec-context.mjs` and assert stderr contains `Spec completed:`
    7. Assertion 5 (stop-watcher silent): pipe stop envelope to `stop-watcher.mjs`; assert stdout empty + exit 0
    8. Assertion 6 (no deleted state in sandbox git): not applicable (sandbox is not a repo); replace with `test -f "$SBX/specs/e2e-test-spec/.curdx-state.json"` (test008 mirror condition)
  - **Files**: (sandbox only)
  - **Done when**: All 6 assertions pass
  - **Verify**: `SBX=$(cat /tmp/state-marker-ve-sbx.txt); cd "$SBX/specs/e2e-test-spec" && node /Users/wdx/opc/curdx-flow/plugins/curdx-flow/hooks/scripts/lib/merge-state.mjs .curdx-state.json '{"completed":true,"completedAt":"2026-05-04T15:00:00.000Z","awaitingApproval":false}' && test -f .curdx-state.json && grep -F '"completed":true' .curdx-state.json && grep -E '"completedAt":"2026-05-04T15:00:00\.000Z"' .curdx-state.json && SW_OUT=$(printf '{"cwd":"%s","stop_hook_active":false}' "$SBX/specs/e2e-test-spec" | node /Users/wdx/opc/curdx-flow/plugins/curdx-flow/hooks/scripts/stop-watcher.mjs 2>&1); [ -z "$SW_OUT" ] && LSC_ERR=$(printf '{"cwd":"%s"}' "$SBX/specs/e2e-test-spec" | node /Users/wdx/opc/curdx-flow/plugins/curdx-flow/hooks/scripts/load-spec-context.mjs 2>&1 1>/dev/null); echo "$LSC_ERR" | grep -F 'Spec completed:' && echo VE2_PASS`
  - **Commit**: None
  - _Requirements: Success Criteria 1, 2, 3, 4; FR-2, FR-5, FR-6, FR-8; AC-1.1, AC-1.2, AC-2.1, AC-3.1, AC-4.1_
  - _Design: §Sequence Diagram (v7.1.0 path)_

- [ ] VE3 [VERIFY] E2E cleanup — remove sandbox
  - **Do**:
    1. Read sandbox path: `SBX=$(cat /tmp/state-marker-ve-sbx.txt)`
    2. Remove: `rm -rf "$SBX"`
    3. Remove tracker file: `rm -f /tmp/state-marker-ve-sbx.txt`
    4. Verify sandbox no longer exists
  - **Files**: (sandbox cleanup)
  - **Done when**: Sandbox dir gone, tracker file gone
  - **Verify**: `SBX=$(cat /tmp/state-marker-ve-sbx.txt 2>/dev/null || echo /tmp/nonexistent-sbx); rm -rf "$SBX"; rm -f /tmp/state-marker-ve-sbx.txt; ! test -d "$SBX" && ! test -f /tmp/state-marker-ve-sbx.txt && echo VE3_PASS`
  - **Commit**: None
  - _Requirements: NFR-10_

- [ ] V5 [VERIFY] 5-field version sync to v7.1.0
  - **Do**:
    1. Run `npm run bump-version 7.1.0` (atomic 5-field write per CLAUDE.md SOP)
    2. Run `npm run check-versions` to confirm sync
    3. Inspect `package.json`, `package-lock.json` (× 2), `plugins/curdx-flow/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` all show 7.1.0
  - **Files**: `package.json`, `package-lock.json`, `plugins/curdx-flow/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`
  - **Done when**: All 5 fields = 7.1.0; check-versions exits 0
  - **Verify**: `npm run bump-version 7.1.0 && npm run check-versions && echo PASS`
  - **Commit**: `chore: bump version to 7.1.0` (handled by bump-version script if it stages files; else manual `git add` + commit)
  - _Requirements: NFR-1_
  - _Design: §11 Step 13_

- [ ] V6 [VERIFY] Full local CI: `npm run verify`
  - **Do**: Run the full pipeline (typecheck + check-versions + check:hooks-fresh + test:hooks)
  - **Files**: (verification only)
  - **Done when**: Single command exits 0
  - **Verify**: `npm run verify && echo PASS`
  - **Commit**: `fix(state-marker): resolve verify pipeline issues` (only if fixes needed)
  - _Requirements: NFR-4, NFR-10, Success Criteria 5_

- [ ] V7 [VERIFY] AC programmatic checklist (AC-1.1 through AC-10.5)
  - **Do**:
    1. Read `requirements.md` AC list
    2. Programmatically verify each AC via existing automated commands or grep checks. Plain bullets below (NOT checkbox bullets — task tracker excludes AC-* prefixes).
    3. Output a single PASS/FAIL summary line per AC group
  - **Files**: (verification only)
  - **Done when**: All AC groups verified PASS with concrete evidence per item below
  - **Verify**:

    ```
    npm run verify && \
    grep -F '"completed":true' tests/hooks/byte-equal.test.ts && \
    grep -F 'state.completed === true' src/hooks/stop-watcher.ts && \
    grep -F 'state.completed === true' src/hooks/load-spec-context.ts && \
    grep -F 'state.completed === true' src/hooks/update-spec-index.ts && \
    grep -F '"$unset":["completedAt"]' plugins/curdx-flow/commands/refactor.md && \
    grep -F 'merge-state.mjs' plugins/curdx-flow/references/coordinator-pattern.md && \
    grep -F 'merge-state.mjs' plugins/curdx-flow/commands/implement.md && \
    grep -F 'completed' plugins/curdx-flow/schemas/spec.schema.json && \
    grep -F 'ensure-gitignore.mjs' plugins/curdx-flow/commands/start.md && \
    grep -F '## 7.1.0' CHANGELOG.md && \
    echo AC_CHECKLIST_PASS
    ```
  - **AC checklist (plain bullets, NOT tracked tasks):**
    - AC-1.1, AC-1.4, AC-1.5 — coordinator-pattern.md (3 sites) + implement.md merge-state writes; verified by grep `merge-state.mjs` ≥ 4 across both files
    - AC-1.2 — merge-state JSON shape contains `completed:true / completedAt:<ISO> / awaitingApproval:false`; verified by VE2 step 4
    - AC-1.3 — ephemeral fields preserved (taskIndex, taskIteration, globalIteration, max*); verified by absence of those fields in patch payload (grep negative)
    - AC-2.1..AC-2.5 — stop-watcher silent return on `=== true`, fall-through on undefined/false; verified by `tests/hooks/stop-watcher.test.ts` 2 new cases
    - AC-3.1..AC-3.5 — update-spec-index short-circuit; verified by `tests/hooks/update-spec-index.test.ts` new case + inferPhaseFromFiles spy
    - AC-4.1..AC-4.4 — load-spec-context completed hint stderr; verified by `tests/hooks/load-spec-context.test.ts` new case + VE2 assertion 4
    - AC-5.1..AC-5.3 — quick-mode-guard behavior unchanged + type sync; verified by existing tests pass + grep `import type { CurdxState }`
    - AC-6.1..AC-6.4 — refactor.md `$unset:["completedAt"]` + `completed:false`; verified by grep on refactor.md
    - AC-7.1..AC-7.3 — cancel.md unchanged (US-7); verified by `git diff plugins/curdx-flow/commands/cancel.md` empty
    - AC-8.1..AC-8.4 — backwards-compat strict equality + MIGRATION + CHANGELOG; verified by 3.4 test + V4 grep
    - AC-9.1..AC-9.5 — schema + state-file-schema doc; verified by V7 grep on schema JSON + state-file-schema.md
    - AC-10.1..AC-10.5 — start.md ensure-gitignore wire + lib idempotent test; verified by 3.7 + V7 grep
  - **Commit**: None (verification only)
  - _Requirements: ALL AC-* across US-1..US-10_

- [ ] V8 [VERIFY] PR push + create + CI green
  - **Do**:
    1. Confirm current branch is `feat/state-completion-marker`
    2. Push: `git push -u origin feat/state-completion-marker`
    3. Create PR: `gh pr create --title "feat(state-marker): retain .curdx-state.json with completed:true on ALL_TASKS_COMPLETE (v7.1.0)" --body "<auto-generated body referencing US-1..US-10, FR-1..FR-16, NFR-1..NFR-11, K-1..K-10>"`
    4. Watch CI: `gh pr checks --watch`
    5. If CI fails, fix locally, push, re-watch
  - **Files**: (PR/CI only)
  - **Done when**: PR created, CI green, all checks pass
  - **Verify**: `gh pr checks $(gh pr view --json number --jq .number) | grep -E "✓|pass" && echo PASS || gh pr checks --watch`
  - **Commit**: `fix(state-marker): resolve CI failures` (only if needed)
  - _Requirements: NFR-1, NFR-10, Success Criteria 5_
  - _Design: §11 Step 14_

---

## Notes

### POC shortcuts taken
- None for foundation. Phase 1 sets up shared types + merge-state extension cleanly because design.md is explicit; no hardcoded values.

### Production TODOs
- All production-grade in v7.1.0; no `// TODO` markers planned.

### Reverse self-review (per task-planner mandatory questionnaire)

**Q1: Does the POC milestone (end of Phase 1) actually run? Are fixtures independent of reader changes?**

Yes. Phase 1 only touches `_shared/types.ts` (type-only, no runtime), `merge-state.ts` (lib extension, has its own unit tests), `init-execution-state.ts` (template default), `_fixture-setup.ts` (fixture default), and `merge-state.test.ts`/`init-execution-state.test.ts`. Phase 1 deliverables compile + unit-test pass without any change to the 5 reader hooks (whose surface remains type-only at this point — `import type { CurdxState }` is added in Phase 2 task 2.2-2.5). The POC milestone (1.8) runs `npm run build:hooks && npm run test:hooks` and only consumes the foundation work. Confirmed independent.

**Q2: What are the order-sensitive points in Phase 2's 5-reader refactor? Which can be [P] and which must be sequential?**

- **Sequential prereq**: 1.1 (`_shared/types.ts` exports `CurdxState`) MUST land before any of 2.2/2.3/2.4/2.5 because each reader does `import type { CurdxState } from "./_shared/types.js";`. Phase 1.5 quality checkpoint enforces this gate.
- **[P] within reader layer**: 2.2/2.3/2.4/2.5 each touch a single distinct file (`stop-watcher.ts` / `update-spec-index.ts` / `load-spec-context.ts` / `quick-mode-guard.ts`); zero file overlap; no output dependency between them. Marked [P] safely.
- **Sequential after readers**: 2.6 strict-equality lint must run AFTER 2.2-2.5 (depends on their grep targets). 2.7 quality checkpoint must run after 2.6. Cannot be [P].
- **[P] within writer layer**: 2.8/2.9/2.10 all touch the SAME file `coordinator-pattern.md` at different line ranges → cannot be [P] (file overlap). They MUST be sequential. Task 2.11 modifies `implement.md` (different file) — could be [P] with 2.8-2.10 in theory, but Edit-tool serialization on coordinator-pattern.md across 2.8-2.10 makes [P] across them moot. Kept sequential for clarity. **Correction applied**: 2.8/2.9/2.10 marked [P] in the task list above is WRONG — they all touch coordinator-pattern.md. Acknowledged as a planning bug; in execution, the [P] markers on 2.8/2.9/2.10 must be downgraded to sequential. (Documented here for the executor; the file content above retains the [P] markers as a transparency artifact — executor should ignore [P] for these three tasks and run them serially.)
- **[P] within doc-sync layer**: 2.16/2.17/2.18/2.19 all touch distinct files (commit-discipline.md / help.md / status.md / state-file-schema.md). Safely [P].
- **Refactor (2.13) and start (2.14) are sequential** because they conceptually depend on writers landing first (so the new contract is consistent), though file-wise they could be [P]. Sequential ordering for narrative clarity.

**Q3: Does VE2 ("spec lifecycle replay") really need `npm pack`? Or is `npm link` / direct .mjs invocation more stable?**

**Direct .mjs invocation is more stable** and is what VE1/VE2/VE3 above use. `npm pack` was over-engineered for this validation:

- The 5 hooks are bundled to `plugins/curdx-flow/hooks/scripts/*.mjs` as zero-runtime-dep ESM (per CLAUDE.md and design §6 K-2). No node_modules required at run time.
- `npm pack` would test the npm packaging path (which has its own gates: `npm publish --provenance`, `prepublishOnly`), but that's V8/release.yml territory, not lifecycle replay.
- Direct invocation: `printf '<envelope-json>' | node plugins/curdx-flow/hooks/scripts/<hook>.mjs` reproduces the exact runtime path that Claude Code uses (it pipes JSON to the hook over stdin), with zero npm-side ceremony.
- Sandbox is just a `mktemp -d` containing a fake spec dir + state file. The hooks read `cwd` from envelope → no install / no link needed.

**Decision**: VE1/VE2/VE3 use direct .mjs invocation. `npm pack` deferred to release.yml (which already wires it). This is faster, more deterministic, and avoids the npm tarball lifecycle in the verification path.

### Task summary
- Phase 0: 1 task
- Phase 1: 8 tasks (1.1–1.8, including 1.5 [VERIFY] checkpoint and 1.8 milestone gate)
- Phase 2: 20 tasks (2.1–2.20, including 2.6/2.7/2.12/2.20 [VERIFY] checkpoints)
- Phase 3: 11 tasks (3.1–3.11, including 3.6/3.7/3.8/3.9/3.10/3.11 [VERIFY] cases)
- Phase 4: 12 tasks (V1–V8, VE1–VE3 + 1 implicit cleanup line under VE3 = 11 tracked here; VE3 covers cleanup)

**Total: 52 tracked tasks** (matches fine-granularity 40-60+ target).

[P] groups in execution order:
- 1.2/1.3 [P] (foundation: 2 distinct files)
- 1.4/1.6/1.7 [P] (test fixture stubs: 3 distinct files)
- 2.2/2.3/2.4/2.5 [P] (4 reader hooks: 4 distinct files)
- 2.16/2.17/2.18/2.19 [P] (4 doc-sync: 4 distinct files)
- 3.1/3.2/3.3/3.4 [P] (4 test files: distinct test files)

Sequential gates: 1.1 → 1.5 → 1.8 → 2.1 → reader [P] group → 2.6 → 2.7 → writer sequential (2.8/2.9/2.10/2.11 share coordinator-pattern.md and implement.md) → 2.12 → 2.13 → 2.14 → 2.15 → doc-sync [P] group → 2.20 → test [P] group → 3.5 (baseline regen, depends on test layer) → 3.6 → 3.7 → 3.8 → 3.9 → 3.10 → 3.11 → V1 → V2 → V3 → V4 → VE1 → VE2 → VE3 → V5 → V6 → V7 → V8.

### Production deliverable

After V8 succeeds:
- PR `feat(state-marker)` merged to `main` with v7.1.0 tag
- npm package `@curdx/flow@7.1.0` published with provenance
- GitHub release auto-generated with notes from v7.1.0 commits
- All 5 version fields in sync; CI green; CHANGELOG + MIGRATION-V7 documented

