---
spec: spec-two-stage-review
phase: tasks
granularity: fine
created: 2026-05-07
---

# Tasks: spec-two-stage-review

> Epic: superpowers-uplift | Total: 19 tasks across 5 POC-first phases | E2E: drift test (library project, no dev server)

## POC Milestone

Task 1.5 — typecheck passes + drift test asserts spec-reviewer.md has no quality keywords + code-quality-reviewer.md skeleton exists with ≥4 exclusion markers.

---

## Phase 1 — POC (~6 tasks)

Goal: prove schema change + 1 narrowing pass + code-quality-reviewer skeleton + minimal drift test are self-consistent and typecheck-clean.

- [x] 1.1 [P] Schema + types: add `reviews` field to VerificationBlock
  - **Do**:
    1. Open `src/hooks/_shared/types.ts`; append `ReviewVerdict` interface and add optional `reviews?: { specCompliance?: ReviewVerdict; codeQuality?: ReviewVerdict }` to `VerificationBlock`
    2. Open `plugins/curdx-flow/schemas/spec.schema.json`; add optional `reviews` sub-schema under `verificationBlocks` item definition (additionalProperties preserved, backwards-compat)
  - **Files**: `src/hooks/_shared/types.ts`, `plugins/curdx-flow/schemas/spec.schema.json`
  - **Done when**: Both files compile; `ReviewVerdict` and `reviews` field exist; no existing schema fields removed
  - **Verify**: `npm run typecheck 2>&1 | grep -c "error" | xargs -I{} sh -c '[ {} -eq 0 ] && echo SCHEMA_PASS'`
  - **Commit**: `feat(types): add ReviewVerdict + VerificationBlock.reviews keyed field (D3)`
  - _Design: Component 4, D3_

- [x] 1.2 [P] Create `code-quality-reviewer.md` skeleton
  - **Do**:
    1. Create `plugins/curdx-flow/agents/code-quality-reviewer.md` with frontmatter (`name`, `description`, `model: sonnet`, `color: orange`)
    2. Add skeleton sections: Role boundary (stub), Exclusion list with exactly these 4 items: `traceability to requirements`, `phase artifact structure`, `requirement coverage`, `artifact format / front-matter`
    3. Add placeholder rubrics section header and output protocol stanza (`REVIEW_PASS` / `REVIEW_FAIL` final-line)
  - **Files**: `plugins/curdx-flow/agents/code-quality-reviewer.md`
  - **Done when**: File exists; grep finds all 4 exclusion keywords; final-line protocol stanza present
  - **Verify**: `grep -c "traceability to requirements\|phase artifact structure\|requirement coverage\|artifact format" plugins/curdx-flow/agents/code-quality-reviewer.md | xargs -I{} sh -c '[ {} -ge 4 ] && echo EXCLUSION_PASS'`
  - **Commit**: `feat(agents): add code-quality-reviewer.md skeleton with 3-layer drift defense (D1)`
  - _Design: Component 2_

- [x] 1.3 Spec-reviewer narrow Pass-1: cut Design/Principles block
  - **Do**:
    1. Open `plugins/curdx-flow/agents/spec-reviewer.md`
    2. Delete the entire Design / Principles subsection (7 items: SOLID/DRY/KISS/YAGNI/etc.) — these are all `[QUALITY]` and belong to code-quality-reviewer
    3. Preserve REVIEW_PASS / REVIEW_FAIL final-line protocol byte-for-byte
  - **Files**: `plugins/curdx-flow/agents/spec-reviewer.md`
  - **Done when**: File no longer contains any of: `SOLID`, `DRY`, `KISS`, `YAGNI`; final-line protocol still present
  - **Verify**: `grep -E "SOLID|KISS|YAGNI" plugins/curdx-flow/agents/spec-reviewer.md && echo FAIL || echo PASS`
  - **Commit**: `refactor(agents): spec-reviewer narrow Pass-1 — cut Design/Principles 7-item block (E1)`
  - _Design: Component 1_

- [x] 1.4 Create minimal drift test asserting POC invariants
  - **Do**:
    1. Create `tests/runner/two-stage-review.test.ts`
    2. Add 3 test cases: (a) `spec-reviewer.md` has zero hits for `["code quality","smell","security","readability"]`; (b) `code-quality-reviewer.md` exists and contains ≥4 exclusion keywords; (c) `REVIEW_PASS` and `REVIEW_FAIL` strings are identical (byte-equal) across both agent files
  - **Files**: `tests/runner/two-stage-review.test.ts`
  - **Done when**: Test file created; all 3 cases are assertions (not stubs); test runner can discover file
  - **Verify**: `npm run test:hooks 2>&1 | grep -E "two-stage-review" | grep -v "FAIL" && echo TEST_DISCOVERABLE`
  - **Commit**: `test(runner): add two-stage-review drift test — POC invariants (FR-N5, AC-8.1)`
  - _Design: Component 7_

- [ ] 1.5 [VERIFY] POC checkpoint: typecheck + drift test pass
  - **Do**:
    1. Run `npm run typecheck`
    2. Run `npm run test:hooks -- --testPathPattern two-stage-review`
  - **Verify**: `npm run typecheck && npm run test:hooks -- --testPathPattern two-stage-review && echo POC_PASS`
  - **Done when**: Zero type errors; all drift test cases green
  - **Commit**: None

---

## Phase 2 — Core (~8 tasks)

Goal: complete all 4 narrowing passes on spec-reviewer, fill code-quality-reviewer rubrics, wire parallel dispatch in both commands, write reference doc.

- [x] 2.1 Spec-reviewer narrow Pass-2: split Design/Holistic-Awareness (5 → 2 keep)
  - **Do**:
    1. In `plugins/curdx-flow/agents/spec-reviewer.md` find Design / Holistic-Awareness block (5 items)
    2. Keep: `cross-cutting impact on other specs`, `design decisions traceable to requirements`
    3. Remove: `architectural thinking`, `system-wide consistency`, and any item that evaluates implementation quality rather than spec-compliance
  - **Files**: `plugins/curdx-flow/agents/spec-reviewer.md`
  - **Done when**: Holistic-Awareness block has ≤3 items; removed items contain no forward-reference to spec-compliance concepts
  - **Verify**: `grep -c "Holistic" plugins/curdx-flow/agents/spec-reviewer.md && echo NARROWED_PASS`
  - **Commit**: `refactor(agents): spec-reviewer narrow Pass-2 — Holistic-Awareness 5→2 keep (E1)`
  - _Design: Component 1_

- [x] 2.2 Spec-reviewer narrow Pass-3 + Pass-4: Quality-Gates trim + move Execution/No-Hallucinations
  - **Do**:
    1. In Tasks / Quality-Gates: keep only `tasks-exist` item; remove `frequency-optimal` (belongs to code-quality)
    2. In Execution / No-Hallucinations: move all 6 items verbatim to a TODO comment block in `code-quality-reviewer.md` (will be activated in 2.3); delete from spec-reviewer
  - **Files**: `plugins/curdx-flow/agents/spec-reviewer.md`, `plugins/curdx-flow/agents/code-quality-reviewer.md`
  - **Done when**: spec-reviewer has 0 instances of `hallucination` keyword; code-quality-reviewer has a TODO block with the 6 moved items
  - **Verify**: `grep -i "hallucination" plugins/curdx-flow/agents/spec-reviewer.md && echo FAIL || echo PASS`
  - **Commit**: `refactor(agents): spec-reviewer narrow Pass-3/4 — Quality-Gates trim + move No-Hallucinations (E1)`
  - _Design: Component 1_

- [ ] 2.3 [VERIFY] Phase 2 narrowing checkpoint
  - **Do**:
    1. Run `npm run typecheck`
    2. Run `npm run test:hooks -- --testPathPattern two-stage-review`
  - **Verify**: `npm run typecheck && npm run test:hooks -- --testPathPattern two-stage-review && echo NARROW_GATE_PASS`
  - **Done when**: Zero type errors; all drift test cases still green (no regressions from narrowing)
  - **Commit**: None

- [x] 2.4 [P] Fill code-quality-reviewer rubrics (~30 items)
  - **Do**:
    1. Activate the TODO block from 2.2: convert 6 No-Hallucinations items to live rubric entries
    2. Add 17 adapted [QUALITY] items from original spec-reviewer (before narrowing): code smell, security, implementation quality, readability, test quality — use concrete sub-bullets per category
    3. Add 7 straddling items (design anti-patterns, task sizing, error handling patterns) adapted from E1 audit
    4. Ensure each rubric item starts with an action verb; no compliance-domain language
  - **Files**: `plugins/curdx-flow/agents/code-quality-reviewer.md`
  - **Done when**: File has ≥28 distinct rubric items; grep finds none of `traceability|requirement coverage|artifact format` in rubric items (exclusion list respected)
  - **Verify**: `grep -c "^- " plugins/curdx-flow/agents/code-quality-reviewer.md | xargs -I{} sh -c '[ {} -ge 28 ] && echo RUBRIC_PASS'`
  - **Commit**: `feat(agents): code-quality-reviewer full rubrics — 30 items adapted from E1 audit (D1)`
  - _Design: Component 2, D1_

- [ ] 2.5 [P] Create `references/two-stage-review.md` reference doc
  - **Do**:
    1. Create `plugins/curdx-flow/references/two-stage-review.md`
    2. Add 5 sections: (1) domain boundary table spec-compliance vs code-quality, (2) anti-rationalization rule, (3) SLSA-shape verdict field glossary, (4) 3-layer drift defense implementation details, (5) exclusion list minimum keyword set
  - **Files**: `plugins/curdx-flow/references/two-stage-review.md`
  - **Done when**: All 5 sections present; domain boundary table has both `specCompliance` and `codeQuality` columns
  - **Verify**: `grep -c "specCompliance\|codeQuality\|anti-rationalization\|3-layer" plugins/curdx-flow/references/two-stage-review.md | xargs -I{} sh -c '[ {} -ge 3 ] && echo REFSDOC_PASS'`
  - **Commit**: `docs(references): add two-stage-review.md domain boundary + SLSA shape (AC-12.4)`
  - _Design: Component 6_

- [ ] 2.6 Finalize `code-quality-reviewer.md`: add role boundary + link reference doc
  - **Do**:
    1. Replace Role boundary stub with concrete paragraph: cite `references/two-stage-review.md`, state domain scope (code smell / security / implementation quality / readability / test quality)
    2. Add `do NOT comment on` section header with the 4 exclusion items as a formatted bulleted list
    3. Verify output protocol section has `REVIEW_PASS` / `REVIEW_FAIL` identical strings to `spec-reviewer.md` (byte-equal check)
  - **Files**: `plugins/curdx-flow/agents/code-quality-reviewer.md`
  - **Done when**: Role boundary references two-stage-review.md; exclusion list has ≥4 formatted bullets; output protocol has correct final-line strings
  - **Verify**: `grep "two-stage-review" plugins/curdx-flow/agents/code-quality-reviewer.md && grep "REVIEW_PASS" plugins/curdx-flow/agents/code-quality-reviewer.md && echo AGENT_FINAL_PASS`
  - **Commit**: `feat(agents): code-quality-reviewer — role boundary + exclusion list + output protocol (AC-10.2, FR-A4)`
  - _Design: Component 2_

- [ ] 2.7 [P] Edit `commands/design.md`: parallel dispatch Step 4 + QuickMode branch
  - **Do**:
    1. Locate Step 4 (Artifact Review) in `plugins/curdx-flow/commands/design.md`
    2. Replace single `Task(spec-reviewer)` call with the 6-step parallel dispatch block (per design Component 3): read bounded-parallel-dispatch ref, ONE message dispatch both reviewers, wait, reconcile (no cross-pollination), merge-state append reviews, QuickMode branch (D5 pseudocode)
    3. Add link to `references/bounded-parallel-dispatch.md` + `references/two-stage-review.md`
  - **Files**: `plugins/curdx-flow/commands/design.md`
  - **Done when**: File contains `bounded-parallel-dispatch`, both `spec-reviewer` and `code-quality-reviewer` Task calls, and `state.quickMode` branch logic
  - **Verify**: `grep -c "bounded-parallel-dispatch\|code-quality-reviewer\|quickMode" plugins/curdx-flow/commands/design.md | xargs -I{} sh -c '[ {} -ge 3 ] && echo DESIGN_CMD_PASS'`
  - **Commit**: `feat(commands): design.md parallel dispatch + QuickMode branch at Step 4 (D4, D5, FR-D1/D2)`
  - _Design: Component 3, D4, D5_

- [ ] 2.8 [P] Edit `commands/tasks.md`: mirror parallel dispatch from design.md
  - **Do**:
    1. Locate Step 4 (Artifact Review) in `plugins/curdx-flow/commands/tasks.md`
    2. Apply identical parallel dispatch block as 2.7 (verbatim parallel structure — same 6 steps, same links)
    3. Ensure `state.quickMode` branch logic is identical to design.md (copy-consistent)
  - **Files**: `plugins/curdx-flow/commands/tasks.md`
  - **Done when**: File contains same 3 grep targets as design.md (bounded-parallel-dispatch, code-quality-reviewer, quickMode)
  - **Verify**: `grep -c "bounded-parallel-dispatch\|code-quality-reviewer\|quickMode" plugins/curdx-flow/commands/tasks.md | xargs -I{} sh -c '[ {} -ge 3 ] && echo TASKS_CMD_PASS'`
  - **Commit**: `feat(commands): tasks.md parallel dispatch + QuickMode branch at Step 4 (mirror design.md)`
  - _Design: Component 3_

- [ ] 2.9 [VERIFY] Phase 2 full checkpoint: typecheck + hooks-fresh + drift test
  - **Do**:
    1. Run `npm run typecheck`
    2. Run `npm run build:hooks && npm run check:hooks-fresh`
    3. Run `npm run test:hooks -- --testPathPattern two-stage-review`
  - **Verify**: `npm run typecheck && npm run build:hooks && npm run check:hooks-fresh && npm run test:hooks -- --testPathPattern two-stage-review && echo PHASE2_GATE_PASS`
  - **Done when**: Zero type errors; hooks build is fresh; all drift assertions pass
  - **Commit**: None

---

## Phase 3 — Testing (~3 tasks)

Goal: extend drift test to full coverage (dispatch wiring, REVIEW_PASS/FAIL byte-equal, QuickMode bypass, verdict schema backwards-compat).

- [ ] 3.1 Extend drift test: dispatch wiring + byte-equal assertions
  - **Do**:
    1. In `tests/runner/two-stage-review.test.ts` add test cases: (a) both `commands/design.md` and `commands/tasks.md` contain `bounded-parallel-dispatch` link and dual Task call pattern (FR-D1/D2); (b) `REVIEW_PASS` and `REVIEW_FAIL` strings are byte-equal across both agent files (NFR-1, FR-X3)
    2. Add drift fixture test: mock a finding that crosses domain (e.g. `"spec-reviewer"` finding contains `"code smell"`) and assert it gets flagged as advisory (FR-X2)
  - **Files**: `tests/runner/two-stage-review.test.ts`
  - **Done when**: Test file has ≥6 distinct test cases; byte-equal assertion uses exact string comparison
  - **Verify**: `npm run test:hooks -- --testPathPattern two-stage-review && echo DRIFT_EXTENDED_PASS`
  - **Commit**: `test(runner): extend drift test — dispatch wiring + byte-equal + drift fixture (FR-D1, FR-X3, AC-8.1/8.2)`
  - _Design: Component 7, Test Strategy_

- [ ] 3.2 Verdict schema backwards-compat test + QuickMode bypass test
  - **Do**:
    1. In `tests/runner/buildFreshness.test.ts` (or a new describe block): add test that a `verificationBlocks` entry WITHOUT `reviews` field still validates (optional field, backwards-compat, FR-T1/T2)
    2. In `tests/hooks/quick-mode-guard.test.ts` (or new describe block): add two fixture tests — (a) `state.quickMode = true` + `codeQuality.verdict = "FAIL"` → output contains `advisory:true`, coordinator continues; (b) `state.quickMode = true` + `specCompliance.verdict = "FAIL"` → coordinator blocks (FR-M1, FR-M2)
  - **Files**: `tests/runner/buildFreshness.test.ts`, `tests/hooks/quick-mode-guard.test.ts`
  - **Done when**: Both tests exist; QuickMode FAIL-specCompliance case explicitly asserts block (not advisory)
  - **Verify**: `npm run test:hooks && echo VERDICT_TESTS_PASS`
  - **Commit**: `test(hooks): verdict schema backwards-compat + QuickMode bypass assertions (FR-M1, FR-M2, FR-T1)`
  - _Design: Test Strategy, D2, D5_

- [ ] 3.3 [VERIFY] Phase 3 checkpoint: all tests pass
  - **Do**:
    1. Run `npm run test:hooks` (all test files)
  - **Verify**: `npm run test:hooks && echo PHASE3_TESTS_PASS`
  - **Done when**: All test suites exit 0; no skipped assertions
  - **Commit**: None

---

## Phase 4 — Quality (~2 tasks)

Goal: DRY audit between the two reviewer prompts; CHANGELOG entry; no residual cross-domain leakage.

- [ ] 4.1 [P] DRY audit + residual-leakage grep gate
  - **Do**:
    1. Grep `plugins/curdx-flow/agents/spec-reviewer.md` for quality-domain keywords: `["code quality","smell","security","readability","hallucination"]` — must be 0 hits
    2. Grep `plugins/curdx-flow/agents/code-quality-reviewer.md` for compliance-domain keywords: `["traceability","requirement coverage","artifact format","phase structure"]` in rubric items (exclusion list section itself is OK) — must be 0 hits outside exclusion section
    3. If any hit found, remove the offending line
  - **Files**: `plugins/curdx-flow/agents/spec-reviewer.md`, `plugins/curdx-flow/agents/code-quality-reviewer.md`
  - **Done when**: Both grep commands return 0 hits (exit 1); FR-N5 satisfied
  - **Verify**: `grep -iE "code quality|smell|security|readability|hallucination" plugins/curdx-flow/agents/spec-reviewer.md && echo LEAKAGE_FOUND || echo FR_N5_PASS`
  - **Commit**: `fix(agents): resolve residual cross-domain leakage if found (FR-N5)`
  - _Design: Component 1, Risk 1_

- [ ] 4.2 [P] CHANGELOG entry
  - **Do**:
    1. Prepend new section to `CHANGELOG.md` for current version under development
    2. Add under `### Added`: `code-quality-reviewer agent (3-layer drift defense, 30 rubrics)`, `two-stage-review.md reference doc`, `parallel dispatch at design/tasks phase boundaries`
    3. Add under `### Changed`: `spec-reviewer narrowed to spec-compliance only (E1 13-item map)`, `VerificationBlock.reviews keyed-object field (additive, backwards-compatible)`
    4. Add note: `REVIEW_PASS / REVIEW_FAIL final-line protocol unchanged (NFR-1)`
  - **Files**: `CHANGELOG.md`
  - **Done when**: CHANGELOG has new section with both Added and Changed subsections; backward-compat note present
  - **Verify**: `grep -c "code-quality-reviewer\|spec-reviewer narrowed\|REVIEW_PASS.*unchanged" CHANGELOG.md | xargs -I{} sh -c '[ {} -ge 2 ] && echo CHANGELOG_PASS'`
  - **Commit**: `chore(release): CHANGELOG — code-quality-reviewer + spec-reviewer narrowed (two-stage-review)`
  - _Design: File Structure_

---

## Phase 5 — Release (~3 tasks)

- [ ] V4 [VERIFY] Full local CI: typecheck + build:hooks + check:hooks-fresh + test:hooks
  - **Do**:
    1. Run `npm run typecheck`
    2. Run `npm run build:hooks && npm run check:hooks-fresh`
    3. Run `npm run test:hooks`
  - **Verify**: `npm run typecheck && npm run build:hooks && npm run check:hooks-fresh && npm run test:hooks && echo LOCAL_CI_PASS`
  - **Done when**: All commands exit 0; zero type errors; zero hook drift; all test suites green
  - **Commit**: `fix(quality): resolve any remaining CI issues` (only if fixes needed)

- [ ] V5 [VERIFY] CI pipeline passes
  - **Do**:
    1. Push current branch: `git push`
    2. Wait for GitHub Actions to complete
    3. Check PR checks: `gh pr checks --watch`
  - **Verify**: `gh pr checks 2>&1 | grep -v "pass\|✓" | grep -c "fail\|✗" | xargs -I{} sh -c '[ {} -eq 0 ] && echo CI_GREEN'`
  - **Done when**: All CI checks show passing; no failures
  - **Commit**: None

- [ ] V6 [VERIFY] AC checklist
  - **Do**: Programmatically verify all acceptance criteria:
    - AC-8.1/8.2 `REVIEW_PASS`/`REVIEW_FAIL` byte-equal: `grep "REVIEW_PASS" plugins/curdx-flow/agents/spec-reviewer.md plugins/curdx-flow/agents/code-quality-reviewer.md`
    - AC-10.2 exclusion list ≥4 items: `grep -c "do NOT comment on\|traceability\|phase artifact\|requirement coverage\|artifact format" plugins/curdx-flow/agents/code-quality-reviewer.md`
    - AC-12.4 reference doc linked from both agents + both commands: `grep -l "two-stage-review" plugins/curdx-flow/agents/*.md plugins/curdx-flow/commands/design.md plugins/curdx-flow/commands/tasks.md`
    - FR-N5 spec-reviewer zero quality keywords: `grep -iE "code quality|smell" plugins/curdx-flow/agents/spec-reviewer.md && echo FAIL || echo PASS`
    - FR-D1/D2 parallel dispatch wired: `grep "code-quality-reviewer" plugins/curdx-flow/commands/design.md plugins/curdx-flow/commands/tasks.md`
    - D3 reviews field in types.ts: `grep "ReviewVerdict" src/hooks/_shared/types.ts`
  - **Verify**: `npm run verify && echo AC_ALL_PASS`
  - **Done when**: All grep commands return expected results; `npm run verify` exits 0
  - **Commit**: None

---

## Notes

- **POC shortcuts**: Phase 1 only does Pass-1 narrowing (Design/Principles); full 4-pass narrowing deferred to Phase 2
- **Phase 2 parallelism**: Tasks 2.4+2.5 are `[P]` (different files); 2.7+2.8 are `[P]` (different files); 2.1→2.2 are sequential (same file)
- **E2E strategy**: Library project — no dev server; drift test in `tests/runner/two-stage-review.test.ts` IS the e2e (per spec instructions)
- **D2 advisory**: JSON schema validates but schema mismatch writes `advisory: true` label, not a block; no test needed to verify non-blocking behavior
- **Production TODOs**: execution phase dual-review (v2), per-task review opt-in (v2), hard-gate schema validation (v2 after data collection)
