---
spec: spec-analyze-real-transcript
phase: tasks
granularity: fine
created: 2026-05-07
---

# Tasks: spec-analyze-real-transcript

> Epic: observability-v2 | Total: 9 | E2E: integration test (CURDX_TRANSCRIPT_FIXTURE env var)

## POC Milestone
Task 1.3 — `resolveTranscriptSource()` wired into index.ts; integration test green via `CURDX_TRANSCRIPT_FIXTURE`; `npm run typecheck` passes.

---

## Phase 1 — POC (Make It Work)

- [x] 1.1 Create `src/analyze/transcript-path.ts` with resolver, encoding, glob, realpath cache, error class
  - **Do**:
    1. Define `TranscriptSource` union type and `ResolveOpts` interface (see design Component 1 API)
    2. Implement `resolveTranscriptSource(opts?)`: if `fixtureOverride` → return `{kind:'fixture', paths:[fixtureOverride], cwd}`; else `realpath(cwd)` (cached in module-level Map), encode `/`→`-`, `readdirSync` 1-level, filter `.isFile() && name.endsWith('.jsonl')`, apply `sessionFilter` if present, throw `TranscriptNotFoundError` if empty/dir-missing
    3. Export `TranscriptNotFoundError extends Error` with `path` and `hint` fields
  - **Files**: `src/analyze/transcript-path.ts` (NEW)
  - **Done when**: `tsc --noEmit` clean on this file; module exports all 3 symbols
  - **Verify**: `npm run typecheck 2>&1 | grep -c "error TS" | grep -q "^0$" && echo TYPE_PASS`
  - **Commit**: `feat(analyze): add transcript-path resolver with encoding + glob + realpath cache`
  - _Requirements: AC1, AC2, AC3, AC4 | Design: Component 1, D1, D3, D4_

- [x] 1.2 Replace 5 fixture sites in `index.ts` + wire `--session` arg + top-level error catch
  - **Do**:
    1. Delete L23 `POC_FIXTURE_REL` const
    2. L112: replace `path.resolve(cwd, POC_FIXTURE_REL)` with `const source = resolveTranscriptSource({ cwd, fixtureOverride: process.env.CURDX_TRANSCRIPT_FIXTURE, sessionFilter: args.session })`
    3. L116: replace single-file `statSync(fixturePath)` with `for (const p of source.paths) statSync(p)` — collect max mtime
    4. L150: replace `parseTranscript(fixturePath, ...)` with loop over `source.paths`; merge-sort events by `.ts`
    5. L203: replace `state.files[fixturePath] = ...` with loop over `source.paths`
    6. Add `session: { type: 'string', description: 'Filter to single session UUID' }` to citty `defineCommand` args
    7. Wrap top-level catch: `if (err instanceof TranscriptNotFoundError) { process.stderr.write(...2-line friendly...); process.exit(1); }`
  - **Files**: `src/analyze/index.ts` (EDIT)
  - **Done when**: All 5 fixture references removed; `args.session` accepted; exit 1 path reachable
  - **Verify**: `grep -c "POC_FIXTURE_REL\|fixturePath" src/analyze/index.ts | grep -q "^0$" && echo SITES_CLEAN`
  - **Commit**: `feat(analyze): replace 5 fixture sites with resolveTranscriptSource + --session flag + exit 1 on missing`
  - _Requirements: AC1, AC2, AC3, AC4 | Design: Component 2, 4, 5_

- [x] 1.3 [VERIFY] POC checkpoint — integration test compat via env var
  - **Do**:
    1. Edit `tests/analyze/integration.test.ts`: add `beforeAll(() => { process.env.CURDX_TRANSCRIPT_FIXTURE = path.resolve('tests/analyze/fixtures/sample.jsonl') })` and matching `afterAll(() => { delete process.env.CURDX_TRANSCRIPT_FIXTURE })`
    2. Run typecheck + integration test suite
  - **Files**: `tests/analyze/integration.test.ts` (EDIT)
  - **Done when**: Existing integration test snapshots unchanged; no type errors
  - **Verify**: `npm run typecheck && npm run test:analyze -- --reporter=verbose 2>&1 | grep -q "PASS\|pass\|✓" && echo POC_PASS`
  - **Commit**: `test(analyze): wire CURDX_TRANSCRIPT_FIXTURE in integration test beforeAll`
  - _Requirements: AC4, AC6 | Design: Component 7, FR-T2_

---

## Phase 2 — Core (Unit Tests + State GC)

- [x] 2.1 [P] Add 5 unit tests in `tests/analyze/transcript-path.test.ts`
  - **Do**:
    1. Test 1 — encoding: `resolveTranscriptSource` with mock homedir dir; assert `encodedDir` ends with `-Users-x-foo`
    2. Test 2 — multi-session glob: create 3 temp `.jsonl` files in encoded dir; assert `paths.length === 3`
    3. Test 3 — missing project dir: assert throws `TranscriptNotFoundError` with correct `path` and `hint` fields
    4. Test 4 — fixture override: set `fixtureOverride` to existing file path; assert `kind === 'fixture'`, no glob
    5. Test 5 — `--session` filter: 3 files, `sessionFilter = 'abc'`; only file starting `abc` returned
  - **Files**: `tests/analyze/transcript-path.test.ts` (NEW)
  - **Done when**: All 5 cases defined; `npm run test:analyze` shows 5 passing
  - **Verify**: `npm run test:analyze 2>&1 | grep -E "transcript-path" | grep -q "pass\|✓\|5" && echo UNIT_PASS`
  - **Commit**: `test(analyze): 5 unit tests for resolveTranscriptSource`
  - _Requirements: AC1, AC2, AC3, AC4 | Design: Component 7_

- [x] 2.2 [P] Add `cleanupOrphanState()` + 3 state GC unit tests
  - **Do**:
    1. Implement `cleanupOrphanState(state, currentPaths)` in `src/analyze/index.ts` per design Component 3 (pass 1: drop mtime > 30d OR `!existsSync`; pass 2: sort by `lastModifiedMs`, drop oldest if > 100; `console.warn` dropped count); wrap call in `finally` block before `writeState()` in try/catch (fail-open)
    2. In `tests/analyze/transcript-path.test.ts` (or new `state-gc.test.ts`), add 3 GC cases: (a) 31d-old entry dropped, (b) 101 entries → oldest 1 dropped, (c) file-gone entry dropped
  - **Files**: `src/analyze/index.ts` (EDIT), `tests/analyze/transcript-path.test.ts` (EDIT)
  - **Done when**: GC helper exists; 3 GC tests pass; fail-open wrapping in place
  - **Verify**: `npm run test:analyze 2>&1 | grep -E "GC|orphan|state" | grep -q "pass\|✓" && echo GC_PASS`
  - **Commit**: `feat(analyze): add cleanupOrphanState GC (mtime>30d OR >100 keys) + 3 unit tests`
  - _Requirements: AC5 | Design: Component 3, D2_

- [ ] 2.3 [VERIFY] Phase 2 quality checkpoint — typecheck + full test:analyze
  - **Do**: Run full quality suite to confirm all 8 tests pass (5 resolver + 3 GC) and no type errors
  - **Verify**: `npm run typecheck && npm run test:analyze 2>&1 | tail -5`
  - **Done when**: `typecheck` exits 0; `test:analyze` shows 0 failures; GC + resolver + integration all green
  - **Commit**: `chore(analyze): pass Phase 2 quality checkpoint` (only if fixes needed)
  - _Requirements: AC5, AC6_

---

## Phase 3 — Quality + Release

- [x] 3.1 CHANGELOG entry for OB-1 fix
  - **Do**: Prepend under `### Fixed` in the latest unreleased section: `- **analyze**: read real \`~/.claude/projects/<encoded-cwd>/*.jsonl\` transcripts instead of hardcoded fixture; add \`--session <uuid>\` flag; state file GC (mtime > 30 days or > 100 keys); \`CURDX_TRANSCRIPT_FIXTURE\` env var for test isolation (OB-1, resolves B1 critical bug)`
  - **Files**: `CHANGELOG.md` (EDIT)
  - **Done when**: Entry present under `### Fixed`; no duplicate
  - **Verify**: `grep -q "CURDX_TRANSCRIPT_FIXTURE" CHANGELOG.md && echo CHANGELOG_PASS`
  - **Commit**: `chore(changelog): document OB-1 real transcript resolver fix`
  - _Design: File Structure_

- [ ] V4 [VERIFY] Full local CI: typecheck + test:analyze + verify
  - **Do**: Run complete local CI suite
  - **Verify**: `npm run typecheck && npm run test:analyze && npm run verify`
  - **Done when**: All commands exit 0; 0 type errors; 0 test failures; build succeeds
  - **Commit**: `chore(analyze): pass full local CI` (if fixes needed)

- [ ] V6 [VERIFY] AC checklist — programmatic verification
  - **Do**: Verify each AC is satisfied via grep/test commands
  - **Verify**:
    - AC1 (cwd encoding): `grep -q "replace.*\/.*-" src/analyze/transcript-path.ts && echo AC1_PASS`
    - AC2 (multi-session): `npm run test:analyze -- --grep "multi-session" 2>&1 | grep -q "✓\|pass" && echo AC2_PASS`
    - AC3 (exit 1 on missing): `grep -q "process.exit(1)" src/analyze/index.ts && echo AC3_PASS`
    - AC4 (fixture env var): `grep -q "CURDX_TRANSCRIPT_FIXTURE" tests/analyze/integration.test.ts && echo AC4_PASS`
    - AC5 (5 unit tests): `npm run test:analyze -- --grep "transcript-path" 2>&1 | grep -q "5 pass\|5 ✓\|passed" && echo AC5_PASS`
    - AC6 (integration not broken): `npm run test:analyze 2>&1 | grep -q "0 failed\|0 failures" && echo AC6_PASS`
  - **Done when**: All 6 AC checks emit PASS
  - **Commit**: None

## Notes

- POC shortcuts: Phase 1 skips lint; merge-sort on L150 uses simple `Array.sort` by `.ts`
- Production TODOs: Windows path encoding (backslash + drive letter) deferred to future spec per design Out-of-Scope
- State GC race condition (parallel analyze processes) accepted as low-risk per design Risk #2 — atomic write already in place
- `test:analyze` is the only test scope relevant here; `npm run verify` runs full suite including hooks
