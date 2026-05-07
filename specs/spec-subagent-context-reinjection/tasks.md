---
spec: spec-subagent-context-reinjection
phase: tasks
granularity: fine
created: 2026-05-07
---

# Tasks: spec-subagent-context-reinjection

> Epic: superpowers-uplift | Total: 14 | E2E: hook unit tests + drift test

## POC Milestone

Task 1.5 — shared lib + new hook source compile + minimal hook fires and emits valid additionalContext output.

---

## Phase 1 — POC (~5 tasks)

Focus: get lib + hook compiling and firing end-to-end. Skip polish, accept hardcoded exit paths.

- [x] 1.1 Create shared lib `build-context-payload.ts`
  - **Do**:
    1. Create `src/hooks/lib/build-context-payload.ts`
    2. Export `IRON_LAW_SUMMARY = "No completion claim without fresh verification."`
    3. Export `BuildContextPayloadOpts` interface (`forSubagent?: boolean; maxBytes?: number`)
    4. Export `buildContextPayload(state, specDir, opts?)`: when `forSubagent===true` return `<curdx-spec-context>\nphase: <state.phase>\nspec: <specDir>\niron-law: <IRON_LAW_SUMMARY>\n</curdx-spec-context>`; default branch return existing SessionStart payload shape (specName, phase, taskIndex, totalTasks, goal, awaitingApproval); throw `PayloadOverBudgetError` when output byte length > `opts.maxBytes ?? 2048`
  - **Files**: `src/hooks/lib/build-context-payload.ts`
  - **Done when**: File exports compile under `npm run typecheck`
  - **Verify**: `npm run typecheck && echo PASS`
  - **Commit**: `feat(subagent-injector): add build-context-payload shared lib with IRON_LAW_SUMMARY`
  - _Requirements: FR-1, FR-5, FR-7 | Design: Component 1, D1, D3_

- [x] 1.2 Create `subagent-context-injector.ts` hook handler
  - **Do**:
    1. Create `src/hooks/subagent-context-injector.ts`
    2. Import existing `readStdinJson` (lib/stdin.ts), `resolveActiveSpec` (lib/spec-resolver.ts), `readStateFile` (lib/state.ts), and new `buildContextPayload` + `IRON_LAW_SUMMARY`
    3. Implement flow per design §Component 2: stdin parse → resolveActiveSpec → readStateFile → skip if `state.completed===true` → `buildContextPayload(state, specDir, {forSubagent:true})` → emit `{hookSpecificOutput:{hookEventName:"SubagentStart",additionalContext:<text>},continue:true}`
    4. Wrap entire body in try/catch: on any throw write stderr trace + emit `{continue:true}` + exit 0 (fail-open D2)
  - **Files**: `src/hooks/subagent-context-injector.ts`
  - **Done when**: File imports resolve + `npm run typecheck` passes
  - **Verify**: `npm run typecheck && echo PASS`
  - **Commit**: `feat(subagent-injector): add SubagentStart hook handler with fail-open error paths`
  - _Requirements: FR-1, FR-9, FR-10, FR-11 | Design: Component 2, D2_

- [x] 1.3 [P] Register hook in `scripts/build-hooks.mjs`
  - **Do**:
    1. Open `scripts/build-hooks.mjs`, locate `HOOK_ENTRIES` array
    2. Append `'src/hooks/subagent-context-injector.ts'` entry
    3. Run `npm run build:hooks` to produce `plugins/curdx-flow/hooks/scripts/subagent-context-injector.mjs`
  - **Files**: `scripts/build-hooks.mjs`
  - **Done when**: `npm run build:hooks` exits 0 and `plugins/curdx-flow/hooks/scripts/subagent-context-injector.mjs` exists
  - **Verify**: `npm run build:hooks && ls plugins/curdx-flow/hooks/scripts/subagent-context-injector.mjs && echo PASS`
  - **Commit**: `feat(subagent-injector): register subagent-context-injector in build-hooks HOOK_ENTRIES`
  - _Design: Component 5_

- [ ] 1.4 [P] Register `SubagentStart` event in `hooks.json`
  - **Do**:
    1. Open `plugins/curdx-flow/hooks/hooks.json`
    2. Add top-level `"SubagentStart"` key with same shape as existing `"SessionStart"` entry:
       ```json
       "SubagentStart": [{"hooks":[{"type":"command","command":"node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/subagent-context-injector.mjs\""}]}]
       ```
    3. No matcher field (fires on all dispatches per D2)
  - **Files**: `plugins/curdx-flow/hooks/hooks.json`
  - **Done when**: JSON is valid; key `SubagentStart` present
  - **Verify**: `node -e "JSON.parse(require('fs').readFileSync('plugins/curdx-flow/hooks/hooks.json','utf8'))" && grep -q "SubagentStart" plugins/curdx-flow/hooks/hooks.json && echo PASS`
  - **Commit**: `feat(subagent-injector): register SubagentStart hook event in hooks.json`
  - _Design: Component 4_

- [ ] 1.5 POC Checkpoint — hook fires and emits valid output
  - **Do**:
    1. Build hooks: `npm run build:hooks`
    2. Smoke-fire the built hook with minimal fixture stdin (no active spec → fail-open path): `echo '{"session_id":"s1","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"SubagentStart","agent_type":"general-purpose"}' | node plugins/curdx-flow/hooks/scripts/subagent-context-injector.mjs`
    3. Verify output is valid JSON with `continue:true`
    4. Run `npm run check:hooks-fresh` to confirm bundle is in sync with source
  - **Done when**: Hook exits 0, output parses as JSON with `continue:true`, `check:hooks-fresh` passes
  - **Verify**: `echo '{"session_id":"s1","transcript_path":"/tmp/t","cwd":"/tmp","hook_event_name":"SubagentStart","agent_type":"general-purpose"}' | node plugins/curdx-flow/hooks/scripts/subagent-context-injector.mjs | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));process.exit(d.continue===true?0:1)" && npm run check:hooks-fresh && echo POC_PASS`
  - **Commit**: `feat(subagent-injector): complete POC — SubagentStart hook fires fail-open end-to-end`
  - _Requirements: FR-1, NFR-2 | Design: §Data flow_

---

## Phase 2 — Core Refactor (~3 tasks)

Focus: surgical refactor of `load-spec-context.ts` to use shared lib; byte-equal baseline must hold.

- [ ] 2.1 Surgical refactor `load-spec-context.ts` to import shared lib
  - **Do**:
    1. Open `src/hooks/load-spec-context.ts`
    2. Add import: `import { buildContextPayload } from "./lib/build-context-payload"`
    3. Locate the inline payload-construction block (the section that assembles the additionalContext string/object)
    4. Replace that block with `buildContextPayload(state, dir)` (default `forSubagent:false`)
    5. Do NOT touch `readEnabledSetting`, `readGoalFromProgress`, `loadSpecContextHandler`, stderr banner, settings.json opt-out branch, or JSON.stringify form
  - **Files**: `src/hooks/load-spec-context.ts`
  - **Done when**: Diff touches ≤50 lines; `npm run typecheck` passes; no handler logic changed
  - **Verify**: `npm run typecheck && echo PASS`
  - **Commit**: `refactor(load-spec-context): extract inline payload build to shared lib (D4 surgical)`
  - _Requirements: FR-2, AC-4.2 | Design: Component 3, D4_

- [ ] 2.2 [VERIFY] Phase 2 quality gate — build + hooks-fresh + SessionStart byte-equal
  - **Do**:
    1. Rebuild hooks: `npm run build:hooks`
    2. Confirm bundle freshness: `npm run check:hooks-fresh`
    3. Run SessionStart baseline test to confirm byte-equal regression is zero: `npm run test:hooks -- --grep "byte-equal"`
    4. Run full typecheck: `npm run typecheck`
  - **Verify**: `npm run build:hooks && npm run check:hooks-fresh && npm run typecheck && echo PHASE2_PASS`
  - **Done when**: All commands exit 0; byte-equal test green; no type errors
  - **Commit**: `chore(subagent-injector): pass Phase 2 quality gate`
  - _Requirements: NFR-3, AC-5.1 | Design: D4, R1 mitigation_

---

## Phase 3 — Testing (~4 tasks)

Focus: 7 unit cases + drift test + byte-equal extension.

- [ ] 3.1 Create `tests/hooks/subagent-context-injector.test.ts` — cases (a)-(e)
  - **Do**:
    1. Create `tests/hooks/subagent-context-injector.test.ts` using existing `createFixtureSpec()` + `runHook()` test infra
    2. Case (a) happy path: spec active + valid state → `additionalContext` contains `phase:`, `spec:`, `iron-law:`
    3. Case (b) state absent: no `.curdx-state.json` → output `{continue:true}`, exit 0
    4. Case (c) state malformed: bad JSON in state → exit 0 + stderr contains trace
    5. Case (d) payload size: `JSON.stringify(output).length <= 2048` AND `additionalContext.length <= 200`
    6. Case (e) iron-law verbatim: `additionalContext` contains exact `IRON_LAW_SUMMARY` string
  - **Files**: `tests/hooks/subagent-context-injector.test.ts`
  - **Done when**: 5 test cases written; `npm run test:hooks -- --grep "subagent-context-injector"` runs (may fail at this point — green expected after 3.2)
  - **Verify**: `npm run test:hooks -- --grep "subagent-context-injector" 2>&1 | grep -E "pass|fail|✓|✗|×" | head -10 && echo TEST_RAN`
  - **Commit**: `test(subagent-injector): add unit cases a-e (happy path, fail-open, size, iron-law)`
  - _Requirements: FR-9, FR-10, NFR-1 | Design: §Test Strategy (a)-(e)_

- [ ] 3.2 Extend `tests/hooks/subagent-context-injector.test.ts` — cases (f)-(g) + extend byte-equal
  - **Do**:
    1. In same test file, add case (f): `state.completed===true` → output `{continue:true}`, no `additionalContext`
    2. Add case (g): quick-mode flag set in state → injection still present (universal D2)
    3. Open `tests/hooks/byte-equal.test.ts`, add SubagentStart fixture baseline (freeze current output as expected snapshot)
  - **Files**: `tests/hooks/subagent-context-injector.test.ts`, `tests/hooks/byte-equal.test.ts`
  - **Done when**: All 7 cases present; byte-equal test file extended
  - **Verify**: `npm run test:hooks -- --grep "subagent-context-injector" && echo UNIT_PASS`
  - **Commit**: `test(subagent-injector): add cases f-g + SubagentStart byte-equal baseline`
  - _Requirements: FR-11, FR-12, AC-9.1 | Design: §Test Strategy (f)-(g)_

- [ ] 3.3 Create drift test `tests/runner/subagent-context-doc.test.ts`
  - **Do**:
    1. Create `tests/runner/subagent-context-doc.test.ts`
    2. Import `IRON_LAW_SUMMARY` from `../../src/hooks/lib/build-context-payload`
    3. Read `plugins/curdx-flow/references/iron-law-verification.md` with `readFileSync`
    4. Assert `refContent.includes(IRON_LAW_SUMMARY)` — byte-level substring match
  - **Files**: `tests/runner/subagent-context-doc.test.ts`
  - **Done when**: ~25 LOC; test passes against current reference doc
  - **Verify**: `npx vitest run tests/runner/subagent-context-doc.test.ts && echo DRIFT_PASS`
  - **Commit**: `test(subagent-injector): add iron-law drift gate — IRON_LAW_SUMMARY must exist in reference doc`
  - _Requirements: FR-5, AC-3.2, AC-3.3 | Design: D1, §Component 6_

- [ ] 3.4 [VERIFY] Phase 3 quality gate — all tests green
  - **Do**:
    1. Run full hook test suite: `npm run test:hooks`
    2. Run drift test: `npx vitest run tests/runner/subagent-context-doc.test.ts`
    3. Run typecheck: `npm run typecheck`
    4. Confirm check:hooks-fresh still green: `npm run check:hooks-fresh`
  - **Verify**: `npm run test:hooks && npx vitest run tests/runner/subagent-context-doc.test.ts && npm run typecheck && npm run check:hooks-fresh && echo PHASE3_PASS`
  - **Done when**: All commands exit 0; 7 unit cases + 1 drift test + byte-equal tests all green
  - **Commit**: `chore(subagent-injector): pass Phase 3 quality gate`
  - _Design: §Test Strategy, R1/R2 mitigations_

---

## Phase 4 — Quality (~1 task)

- [ ] 4.1 Append CHANGELOG entry for v7.1.7
  - **Do**:
    1. Open `CHANGELOG.md`
    2. In the `## 7.1.7` section (create if absent: `## 7.1.7 — 2026-05-07`), append under `### Added`:
       `- \`SubagentStart\` hook injects compressed spec context + iron-law summary into every dispatched subagent (spec-subagent-context-reinjection; closes superpowers#237 with local fix)`
    3. Match tone and format of existing changelog entries
  - **Files**: `CHANGELOG.md`
  - **Done when**: Entry present under correct version heading
  - **Verify**: `grep -q "SubagentStart" CHANGELOG.md && grep -q "superpowers#237" CHANGELOG.md && echo CHANGELOG_PASS`
  - **Commit**: `chore(release): add v7.1.7 CHANGELOG entry for SubagentStart hook`
  - _Design: Component 7_

---

## Phase 5 — Quality Gates & PR (~2 tasks)

- [ ] V4 [VERIFY] Full local CI gate
  - **Do**:
    1. Run complete verify suite: `npm run verify`
    2. This runs: typecheck → check-versions → check:hooks-fresh → build → check:bundle → test:hooks → test:analyze → check-verification-blocks
    3. Fix any failures before proceeding
  - **Verify**: `npm run verify && echo LOCAL_CI_PASS`
  - **Done when**: `npm run verify` exits 0; all checks green
  - **Commit**: `chore(subagent-injector): pass full local CI` (if fixes needed)

- [ ] V5 [VERIFY] CI pipeline passes
  - **Do**:
    1. Verify on feature branch: `git branch --show-current` (must not be `main`)
    2. Push branch: `git push -u origin <current-branch>`
    3. Create PR: `gh pr create --title "feat: SubagentStart hook injects compressed spec context into dispatched subagents" --body "$(cat <<'EOF'\n## Summary\n- Adds \`SubagentStart\` hook (\`subagent-context-injector\`) that injects ~120B spec context + iron-law into every dispatched subagent\n- Extracts shared \`buildContextPayload()\` lib used by both SessionStart and SubagentStart hooks (surgical D4 refactor)\n- Drift test gates \`IRON_LAW_SUMMARY\` constant against reference doc at CI time\n\n## Test plan\n- [ ] \`npm run test:hooks\` — 7 unit cases (a-g) + byte-equal baselines all green\n- [ ] \`npx vitest run tests/runner/subagent-context-doc.test.ts\` — drift test green\n- [ ] \`npm run verify\` — full local CI gate passes\n- [ ] \`gh pr checks\` — CI pipeline green\n\nCloses superpowers#237 with local fix.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\nEOF\n)"`
    4. Monitor CI: `gh pr checks --watch`
  - **Verify**: `gh pr checks 2>&1 | grep -v "^$" | tail -5 && echo CI_MONITORED`
  - **Done when**: All CI checks show passing; PR open for review
  - **Commit**: None

- [ ] V6 [VERIFY] AC checklist
  - **Do**: Programmatically verify each acceptance criterion is satisfied:
    - AC-1.1/1.2 — `grep -r "additionalContext" plugins/curdx-flow/hooks/scripts/subagent-context-injector.mjs`
    - AC-2.1/2.2 — case (d) test passes (size ≤ 2048 / ≤ 200B)
    - AC-3.1/3.2/3.3 — drift test passes + `grep "IRON_LAW_SUMMARY" src/hooks/lib/build-context-payload.ts`
    - AC-4.2 — `grep "buildContextPayload" src/hooks/load-spec-context.ts`
    - AC-5.1 — byte-equal test green from `npm run test:hooks`
    - AC-6.1/6.2 — cases (b) and (c) tests pass
    - AC-8.2 — `npm run test:hooks` exits 0
    - AC-9.1 — byte-equal extension present in `tests/hooks/byte-equal.test.ts`
  - **Verify**: `grep -q "additionalContext" plugins/curdx-flow/hooks/scripts/subagent-context-injector.mjs && grep -q "buildContextPayload" src/hooks/load-spec-context.ts && npm run test:hooks && echo AC_PASS`
  - **Done when**: All acceptance criteria confirmed met via grep + test commands
  - **Commit**: None

---

## Notes

- POC shortcuts taken: Phase 1 smoke test uses fail-open (no active spec) path only — happy path proven in Phase 3 unit tests
- Production TODOs: none — D1-D4 fully specified; `agent_type` filter deferred to v2 per D2
- Parallel-safe: tasks 1.3 and 1.4 are `[P]` (disjoint files: `build-hooks.mjs` vs `hooks.json`); all others sequential due to import dependencies
- Byte-equal risk (R1): mitigated by task 2.2 running baseline test immediately after refactor
- Drift risk (R2): mitigated by task 3.3 drift test gated at CI via `npm run test:hooks`
