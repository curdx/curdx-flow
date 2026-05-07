---
spec: spec-bounded-parallel-dispatch
phase: tasks
granularity: fine
created: 2026-05-06
---

# Tasks: spec-bounded-parallel-dispatch

> Epic: superpowers-uplift | Total: 8 tasks across compressed 4 phases | E2E: drift test (Task 3.1)

## POC Milestone

Task 1.2 — both files in place: `bounded-parallel-dispatch.md` (9 sections, ≥13 anti-patterns, 3 criteria) + `parallel-research.md` stub redirect. Doc change proven via file-system grep.

---

## Phase 1 — POC: New doc + stub redirect

Goal: create the renamed doc with full content and replace the old path with a stub.

- [x] 1.1 Create `bounded-parallel-dispatch.md` with 9 sections
  - **Do**:
    1. Read `plugins/curdx-flow/references/parallel-research.md` verbatim (160 LOC baseline)
    2. Create `plugins/curdx-flow/references/bounded-parallel-dispatch.md`: copy old content for §1/§6/§7/§8/§9 (PRESERVE VERBATIM per FR-Doc-5); add 1-line cross-link to `coordinator-pattern.md` at end of §1; INSERT §2 Domain Coverage (table: Research/Review/Debug rows per design.md shape); INSERT §3 Independence Criteria (3-item checklist, exact wording from design.md §3 shape); INSERT §4 Per-Domain Anti-patterns (3 research preserved + 5 review NEW + 5 debug NEW = 13 total, each shaped as "1-sentence + Coordinator: do this instead"); INSERT §5 Subagent-vs-Grep (Anthropic citation verbatim from design.md §5 shape)
  - **Files**: `plugins/curdx-flow/references/bounded-parallel-dispatch.md`
  - **Done when**: File exists; 9 H2 sections present; §4 contains ≥10 numbered anti-pattern items total; §3 contains all 3 independence criterion strings
  - **Verify**: `grep -c "^## " plugins/curdx-flow/references/bounded-parallel-dispatch.md | xargs -I{} sh -c 'test {} -ge 9 && echo SECTIONS_PASS || echo SECTIONS_FAIL' && grep -q "Independent input" plugins/curdx-flow/references/bounded-parallel-dispatch.md && grep -q "Independent output" plugins/curdx-flow/references/bounded-parallel-dispatch.md && grep -q "Independent context" plugins/curdx-flow/references/bounded-parallel-dispatch.md && echo CRITERIA_PASS`
  - **Commit**: `feat(references): create bounded-parallel-dispatch.md with review and debug domain rules`
  - _Design: New Doc Structure §1-§9, §2 shape, §3 shape, §4 shape, §5 shape, D2, D3_

- [x] 1.2 Replace `parallel-research.md` with 1-line stub redirect
  - **Do**: Overwrite `plugins/curdx-flow/references/parallel-research.md` with exactly: `> Moved to [bounded-parallel-dispatch.md](./bounded-parallel-dispatch.md). Documentation expanded to cover review and debug domains, not only research.`
  - **Files**: `plugins/curdx-flow/references/parallel-research.md`
  - **Done when**: File is ≤3 lines; contains "Moved to" and "bounded-parallel-dispatch.md"
  - **Verify**: `wc -l < plugins/curdx-flow/references/parallel-research.md | xargs -I{} sh -c 'test {} -le 3 && echo LINE_PASS || echo LINE_FAIL' && grep -q "Moved to" plugins/curdx-flow/references/parallel-research.md && echo STUB_PASS`
  - **Commit**: `feat(references): replace parallel-research.md with stub redirect`
  - _Design: Old Path Stub Content, FR-Path-2, NFR-1_

- [ ] 1.3 [VERIFY] POC checkpoint — both files valid
  - **Do**: Confirm new doc exists with required structure; confirm stub is in place; no broken internal links
  - **Verify**: `test -f plugins/curdx-flow/references/bounded-parallel-dispatch.md && test -f plugins/curdx-flow/references/parallel-research.md && grep -q "coordinator-pattern.md" plugins/curdx-flow/references/bounded-parallel-dispatch.md && echo POC_PASS`
  - **Done when**: Both files exist, cross-link to coordinator-pattern.md present in new doc
  - **Commit**: None

---

## Phase 2 — Inbound refs: update 3 hard-path consumers

Goal: update the 3 confirmed hard path references from `parallel-research.md` → `bounded-parallel-dispatch.md`; grep-verify soft consumers and edit only those with literal old-path strings.

- [x] 2.1 Update hard-path refs in `commands/research.md`, `commands/start.md`, `references/triage-flow.md`; grep-verify soft consumers
  - **Do**:
    1. In `plugins/curdx-flow/commands/research.md`: replace all occurrences of `references/parallel-research.md` with `references/bounded-parallel-dispatch.md` (2 confirmed occurrences at lines 78, 103)
    2. In `plugins/curdx-flow/commands/start.md`: replace `references/parallel-research.md` with `references/bounded-parallel-dispatch.md` (1 confirmed occurrence at line 193)
    3. In `plugins/curdx-flow/references/triage-flow.md`: replace `references/parallel-research.md` with `references/bounded-parallel-dispatch.md` (1 confirmed occurrence at line 46)
    4. Grep-verify soft consumers: `grep -l "parallel-research.md" plugins/curdx-flow/commands/requirements.md plugins/curdx-flow/commands/design.md plugins/curdx-flow/commands/tasks.md 2>/dev/null` — edit any file that has a literal match (per design.md open question resolution); these 3 had no matches per pre-task verification so no edit expected
  - **Files**: `plugins/curdx-flow/commands/research.md`, `plugins/curdx-flow/commands/start.md`, `plugins/curdx-flow/references/triage-flow.md`
  - **Done when**: Zero remaining `parallel-research.md` literal strings in all `commands/` and `references/` files (excluding the stub itself)
  - **Verify**: `grep -rn "parallel-research\.md" plugins/curdx-flow/commands/ plugins/curdx-flow/references/ --include="*.md" | grep -v "^plugins/curdx-flow/references/parallel-research.md" && echo STALE_REFS_FOUND || echo NO_STALE_REFS_PASS`
  - **Commit**: `feat(commands,references): update parallel-research.md → bounded-parallel-dispatch.md path refs`
  - _Design: File Structure table, FR-Refs-1, FR-Refs-2, Open Questions §1_

- [ ] 2.2 [VERIFY] Inbound refs checkpoint — no stale paths remain
  - **Do**: Scan all plugin command and reference files for any remaining literal `parallel-research.md` string (excluding the stub redirect itself)
  - **Verify**: `result=$(grep -rn "parallel-research\.md" plugins/curdx-flow/commands/ plugins/curdx-flow/references/ --include="*.md" | grep -v "^plugins/curdx-flow/references/parallel-research.md:"); [ -z "$result" ] && echo REFS_CLEAN_PASS || (echo "STALE:" && echo "$result" && exit 1)`
  - **Done when**: Zero stale references found
  - **Commit**: None

---

## Phase 3 — Drift test

Goal: add `bounded-parallel-dispatch-doc.test.ts` with 8 assertions per design.md test strategy table — this serves as E2E validation.

- [ ] 3.1 Create `tests/runner/bounded-parallel-dispatch-doc.test.ts` with 8 assertions
  - **Do**: Mirror `tests/runner/iron-law-doc.test.ts` structure. Implement all 8 tests from design.md Test Strategy table:
    1. `new-doc-exists` — file exists at `plugins/curdx-flow/references/bounded-parallel-dispatch.md`
    2. `old-stub-redirect` — old path file exists, ≤3 lines (or exactly 1 content line), matches `/Moved to.*bounded-parallel-dispatch\.md/`
    3. `anti-pattern-count-total` — count numbered list items under §4 heading; assert ≥10
    4. `anti-pattern-count-per-domain` — research subsection ≥3, review subsection ≥3, debug subsection ≥3 (D2)
    5. `independence-criteria-present` — all 3 strings present: "Independent input", "Independent output", "Independent context"
    6. `path-consistency-commands` — all 6 `commands/*.md` files: zero matches for `parallel-research.md` (excluding stub); confirm new path present where doc was previously referenced
    7. `subagent-vs-grep-section-present` — new doc contains "predilection for subagents"
    8. `5-step-pattern-preserved` — new doc contains the 5-step dispatch pattern section heading verbatim
  - **Files**: `tests/runner/bounded-parallel-dispatch-doc.test.ts`
  - **Done when**: All 8 test cases defined; `npm run verify` exits 0 with all new tests passing
  - **Verify**: `npm run verify 2>&1 | tail -20`
  - **Commit**: `test(runner): add bounded-parallel-dispatch-doc drift detection (8 assertions)`
  - _Design: Test Strategy table, D2, FR-Test-1/2/3/4, AC-1.1/1.3/2.1/2.2/2.3/3.1/3.2/3.3/6.1_

---

## Phase 4 — Quality gates + PR

- [ ] 4.1 CHANGELOG entry
  - **Do**: Prepend new section in `CHANGELOG.md` under the current unreleased heading (or create one if absent); categorize as: **Added** — review/debug domain rules, 3-criteria independence checklist, subagent-vs-grep guidance; **Changed** — rename `parallel-research.md` → `bounded-parallel-dispatch.md`, cross-link to `coordinator-pattern.md` in §1; match Keep-a-Changelog format per CLAUDE.md Release SOP §3
  - **Files**: `CHANGELOG.md`
  - **Done when**: CHANGELOG has new entry referencing `bounded-parallel-dispatch.md` and listing Added/Changed categories
  - **Verify**: `grep -A 10 "bounded-parallel-dispatch" CHANGELOG.md | grep -q "Added\|Changed" && echo CHANGELOG_PASS`
  - **Commit**: `chore(changelog): add bounded-parallel-dispatch rename and domain extension entry`
  - _Design: D1, CLAUDE.md Release SOP §3_

- [ ] V4 [VERIFY] Full local CI: typecheck + verify
  - **Do**: Run complete local quality suite
  - **Verify**: `npm run typecheck && npm run verify && echo CI_PASS`
  - **Done when**: Both commands exit 0; new drift test passes; no type errors
  - **Commit**: `chore(spec-bounded-parallel-dispatch): pass local CI` (only if fixes needed)

- [ ] V6 [VERIFY] AC checklist
  - **Do**: Programmatically verify all acceptance criteria via grep/file checks
  - **Verify**: `test -f plugins/curdx-flow/references/bounded-parallel-dispatch.md && grep -q "Independent input" plugins/curdx-flow/references/bounded-parallel-dispatch.md && grep -q "predilection for subagents" plugins/curdx-flow/references/bounded-parallel-dispatch.md && grep -q "Moved to" plugins/curdx-flow/references/parallel-research.md && ! grep -rn "parallel-research\.md" plugins/curdx-flow/commands/ --include="*.md" 2>/dev/null | grep -q . && echo AC_ALL_PASS`
  - **Done when**: All checks pass; zero stale refs in commands/; both doc files present with required content
  - **Commit**: None

  AC coverage (plain bullets — not task checkboxes):
  - AC-1.1 — new doc exists at correct path (test 1 + V6 grep)
  - AC-1.3 — 5-step pattern preserved verbatim (test 8)
  - AC-2.1/2.2/2.3 — stub redirect exists, ≤3 lines, matches moved-to pattern (test 2)
  - AC-3.1/3.2/3.3 — all 3 independence criterion strings present (test 5 + V6 grep)
  - AC-6.1 — zero stale path refs in commands/ (test 6 + V6 grep)
  - AC-7.1 — CHANGELOG entry present (Task 4.1 verify)

---

## Notes

- POC shortcuts: Phase 1 creates doc content inline (no intermediate refactoring needed — doc-only spec)
- Phases 2/3 merged: refactoring N/A; testing IS the E2E validation (drift test = functional verification)
- Soft consumers (`requirements.md`, `design.md`, `tasks.md`) verified at pre-task grep — no literal `parallel-research.md` found; tasks.md only edits if grep finds a match (open question resolved)
- VE tasks omitted: Library/no-server project — drift test via `npm run verify` serves as E2E (per VE Library/No-Tooling Fallback rule)
- Phase 5 (PR Lifecycle): run `gh pr create` after V6 passes; monitor with `gh pr checks --watch`; resolve any review comments; spec complete when CI all-green and no unresolved comments
