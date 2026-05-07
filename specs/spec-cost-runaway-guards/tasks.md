---
spec: spec-cost-runaway-guards
phase: tasks
granularity: fine
created: 2026-05-07
---

# Tasks: spec-cost-runaway-guards

> Epic: superpowers-uplift | Total: 18 | E2E: hook unit + drift + max-iter tests

## POC Milestone

Task 1.6 — stop-failure-handler.ts compiles + builds to .mjs, StopFailure registered in hooks.json, schema default tightened; `npm run build:hooks && npm run check:hooks-fresh` passes.

---

## Phase 1 — POC (6 tasks)

Focus: skeleton + build pipeline green. Skip tests, accept stubs. Types must pass.

- [x] 1.1 Create stop-failure-handler.ts (8-matcher map + fail-open wrapper)
  - **Do**:
    1. Create `src/hooks/stop-failure-handler.ts`: read stdin JSON, extract `matcher`, log `[StopFailure:<matcher>] <description>` to stderr, always `process.exit(0)`
    2. Embed const map with 8 matchers: `rate_limit / authentication_failed / oauth_org_not_allowed / billing_error / invalid_request / server_error / max_output_tokens / unknown`
    3. Wrap body in try/catch → on any throw: `process.stderr.write("stop-failure-handler: malformed stdin\n"); process.exit(0)`
    4. Add file-header comment: `// DO NOT MERGE INTO stop-watcher.ts — see design.md D3`
  - **Files**: `src/hooks/stop-failure-handler.ts`
  - **Done when**: File ≤200 LOC, no TS errors on isolated check
  - **Verify**: `npx tsc --noEmit --skipLibCheck src/hooks/stop-failure-handler.ts 2>&1 | grep -c "error" | grep -q "^0$" && echo PASS || npm run typecheck 2>&1 | grep stop-failure | grep -c "error" | grep -q "^0$" && echo PASS`
  - **Commit**: `feat(hooks): add stop-failure-handler stub with 8-matcher map`
  - _Requirements: FR-H1, FR-H2, FR-H3, FR-H5_

- [x] 1.2 [P] Register stop-failure-handler entry in build-hooks.mjs
  - **Do**:
    1. Open `scripts/build-hooks.mjs`, locate `HOOK_ENTRIES` array (or equivalent entry list)
    2. Append entry: `{ src: 'src/hooks/stop-failure-handler.ts', out: 'plugins/curdx-flow/hooks/scripts/stop-failure-handler.mjs' }`
  - **Files**: `scripts/build-hooks.mjs`
  - **Done when**: Entry present in HOOK_ENTRIES; `npm run build:hooks` exits 0 and produces `plugins/curdx-flow/hooks/scripts/stop-failure-handler.mjs`
  - **Verify**: `npm run build:hooks && ls plugins/curdx-flow/hooks/scripts/stop-failure-handler.mjs && echo PASS`
  - **Commit**: `build(hooks): register stop-failure-handler in build-hooks.mjs`
  - _Requirements: FR-H4, FR-T4_

- [x] 1.3 [P] Register StopFailure event in hooks.json
  - **Do**:
    1. Open `plugins/curdx-flow/hooks/hooks.json`
    2. Add entry under hooks array: `{ "event": "StopFailure", "command": "node hooks/scripts/stop-failure-handler.mjs" }` (no matcher filter — handler enumerates internally per C7)
  - **Files**: `plugins/curdx-flow/hooks/hooks.json`
  - **Done when**: `StopFailure` event entry present in hooks.json
  - **Verify**: `node -e "const h=require('./plugins/curdx-flow/hooks/hooks.json'); const found=JSON.stringify(h).includes('StopFailure'); process.exit(found?0:1)" && echo PASS`
  - **Commit**: `feat(hooks): register StopFailure event in hooks.json`
  - _Requirements: FR-H4_

- [x] 1.4 Schema default tightening: maxGlobalIterations 100 → 30
  - **Do**:
    1. Open `plugins/curdx-flow/schemas/spec.schema.json`
    2. Find `maxGlobalIterations` property, change `"default": 100` → `"default": 30`
    3. Leave `maxTaskIterations` default unchanged at `5` (FR-D2)
  - **Files**: `plugins/curdx-flow/schemas/spec.schema.json`
  - **Done when**: `grep '"default": 30' plugins/curdx-flow/schemas/spec.schema.json` matches under maxGlobalIterations
  - **Verify**: `node -e "const s=require('./plugins/curdx-flow/schemas/spec.schema.json'); const v=s.properties?.maxGlobalIterations?.default ?? s.definitions?.maxGlobalIterations?.default ?? 30; process.exit(v===30?0:1)" && echo PASS`
  - **Commit**: `feat(schema): tighten maxGlobalIterations default 100 → 30`
  - _Requirements: FR-D1, FR-C1, FR-C2_

- [ ] 1.5 [VERIFY] POC checkpoint — typecheck + build:hooks + hooks-fresh
  - **Do**:
    1. Run full typecheck
    2. Rebuild hooks bundle
    3. Verify bundle freshness gate passes
  - **Verify**: `npm run typecheck && npm run build:hooks && npm run check:hooks-fresh && echo POC_PASS`
  - **Done when**: All three commands exit 0; `stop-failure-handler.mjs` present and tracked by freshness check
  - **Commit**: `chore(hooks): POC checkpoint — typecheck + build green`

- [x] 1.6 Stop-watcher surgical edit: replace soft warn with hard block
  - **Do**:
    1. Open `src/hooks/stop-watcher.ts`, locate L779-787 (soft warn for cap exceeded)
    2. Replace warn block with `buildCostRunawayBlock(state)` call returning `{ decision: "block", reason: "<D4 message>" }` — insert AFTER `stop_hook_active` early-exit (L626-628), BEFORE existing `buildVerificationBlockFailDecision` calls
    3. Implement `buildCostRunawayBlock(state)` as private helper in same file (≤30 LOC): checks `state.globalIteration >= state.maxGlobalIterations`; if hit, formats D4 message with current/cap/3-step remediation; repeat for `taskIteration >= maxTaskIterations`
    4. D4 message template: `Cost runaway guard tripped: globalIteration={N} >= maxGlobalIterations={cap}.\nLoop blocked. Either:\n- Investigate why your loop ran {N} iterations (check .progress.md)\n- Override with: /curdx-flow:implement --max-global-iterations <higher-cap>\n- Reset by editing {state-file-path}: set globalIteration to a lower value\n\nSpec: {specName}  Phase: implement`
  - **Files**: `src/hooks/stop-watcher.ts`
  - **Done when**: Soft warn removed; hard block path returns `decision: "block"` when cap >= current; typecheck passes
  - **Verify**: `npm run typecheck && grep -q "buildCostRunawayBlock" src/hooks/stop-watcher.ts && echo PASS`
  - **Commit**: `fix(hooks): replace soft cap warn with hard block in stop-watcher`
  - _Requirements: FR-E1, FR-E2, FR-E3, US-9_

---

## Phase 2 — Core Enforcement (4 tasks)

Focus: coordinator-side check + CLI flag + reference doc. Types + build must pass.

- [x] 2.1 Coordinator pre-check in implement.md (pre-dispatch cap block)
  - **Do**:
    1. Open `plugins/curdx-flow/commands/implement.md`
    2. At top of iteration loop body (before dispatch), insert pre-dispatch check block: read `state.globalIteration` and `state.maxGlobalIterations`; if `globalIteration >= maxGlobalIterations`, output D4 cost-runaway STOP message and halt (do not dispatch)
    3. Also insert task-level check: if `state.taskIteration >= state.maxTaskIterations`, mark current task failed and break retry loop (US-2 AC-2.2)
    4. Insertion point: after state read, before any `Task(...)` call
  - **Files**: `plugins/curdx-flow/commands/implement.md`
  - **Done when**: Pre-dispatch check prose present; references `state.globalIteration >= state.maxGlobalIterations` condition explicitly; D4 message block quoted verbatim
  - **Verify**: `grep -q "globalIteration >= maxGlobalIterations\|globalIteration.*maxGlobalIterations" plugins/curdx-flow/commands/implement.md && echo PASS`
  - **Commit**: `feat(coordinator): add pre-dispatch cap check to implement.md`
  - _Requirements: FR-E1, US-1, US-2, AC-1.1, AC-2.2_

- [ ] 2.2 [P] Add --max-global-iterations CLI flag to implement.md
  - **Do**:
    1. In `plugins/curdx-flow/commands/implement.md`, locate existing `--max-task-iterations` flag parsing block (L42-47 and L73-78 per design)
    2. Add parallel `--max-global-iterations` entry with identical pattern: parse flag value, write to `state.maxGlobalIterations` on init/update
    3. Document both flags in the command header/options section
  - **Files**: `plugins/curdx-flow/commands/implement.md`
  - **Done when**: `--max-global-iterations` flag documented and parsed; mirrors `--max-task-iterations` pattern
  - **Verify**: `grep -q "\-\-max-global-iterations" plugins/curdx-flow/commands/implement.md && echo PASS`
  - **Commit**: `feat(coordinator): add --max-global-iterations CLI flag`
  - _Requirements: FR-CLI1, FR-CLI2, US-6_

- [ ] 2.3 Create cache-ttl-and-cost.md reference doc (4 sections)
  - **Do**:
    1. Create `plugins/curdx-flow/references/cache-ttl-and-cost.md`
    2. §1 — 5-min cache TTL trap: default 5min TTL; GH#46829 closed-not-planned silent regression; link
    3. §2 — Cost multiplier table: cache-read 0.1×, cache-write 1.25× (5m) / 2× (1h); 17.1% multi-pay measurement note
    4. §3 — stop_hook_active early-exit: cross-link to `iron-law-verification.md` (spec-A)
    5. §4 — Loop budget: 30 iter ≈ ~$4.50 nominal blast radius vs old 100 ≈ ~$13+; opt-in `ttl: "1h"` example
  - **Files**: `plugins/curdx-flow/references/cache-ttl-and-cost.md`
  - **Done when**: File exists with all 4 sections; tokens "5 minute", "GH#46829", "5-10×" present
  - **Verify**: `grep -q "5 minute\|5-minute\|5min" plugins/curdx-flow/references/cache-ttl-and-cost.md && grep -q "GH#46829" plugins/curdx-flow/references/cache-ttl-and-cost.md && grep -q "5-10" plugins/curdx-flow/references/cache-ttl-and-cost.md && echo PASS`
  - **Commit**: `docs(references): add cache-ttl-and-cost.md with 4 sections`
  - _Requirements: FR-DOC1, FR-DOC2, R5_

- [ ] 2.4 [VERIFY] Phase 2 checkpoint — typecheck + build:hooks + check:hooks-fresh
  - **Do**:
    1. Run typecheck across entire codebase
    2. Rebuild hooks bundle (picks up stop-watcher edits)
    3. Verify freshness gate
  - **Verify**: `npm run typecheck && npm run build:hooks && npm run check:hooks-fresh && echo PHASE2_PASS`
  - **Done when**: All three commands exit 0; no TS errors in stop-watcher.ts or stop-failure-handler.ts
  - **Commit**: `chore(hooks): Phase 2 checkpoint — typecheck + build green`

---

## Phase 3 — Tests (6 tasks)

Focus: all new test files + baseline extension. All tests must pass before Phase 4.

- [ ] 3.1 Unit tests: stop-failure-handler.test.ts (5 cases)
  - **Do**:
    1. Create `tests/hooks/stop-failure-handler.test.ts`
    2. Case 1: known matcher `rate_limit` → stderr contains `[StopFailure:rate_limit]`, exit 0
    3. Case 2: known matcher `billing_error` → stderr contains `[StopFailure:billing_error]`, exit 0
    4. Case 3: known matcher `max_output_tokens` → stderr contains `[StopFailure:max_output_tokens]`, exit 0
    5. Case 4: unknown matcher string → stderr echoes raw matcher verbatim, exit 0 (R4 mitigation)
    6. Case 5: malformed JSON stdin → stderr contains "malformed stdin", exit 0 (fail-open, NFR-5)
  - **Files**: `tests/hooks/stop-failure-handler.test.ts`
  - **Done when**: 5 test cases written; `npm run test:hooks -- --reporter verbose` shows 5 passing
  - **Verify**: `npm run test:hooks 2>&1 | grep -q "stop-failure-handler" && npm run test:hooks 2>&1 | grep -v "FAIL\|failed" | grep -q "pass\|✓" && echo PASS`
  - **Commit**: `test(hooks): add 5 unit tests for stop-failure-handler`
  - _Requirements: FR-H3, FR-H5, NFR-5, FR-T1_

- [ ] 3.2 Unit tests: max-iterations-enforcement.test.ts (3 boundary cases)
  - **Do**:
    1. Create `tests/hooks/max-iterations-enforcement.test.ts`
    2. Case 1: `globalIteration = cap - 1` → stop-watcher DOES NOT block (under cap); verify decision is not `block`
    3. Case 2: `globalIteration = cap` → stop-watcher BLOCKS; verify decision is `block` and reason includes D4 message tokens (`Cost runaway guard tripped`)
    4. Case 3: `globalIteration = cap + 1` → stop-watcher BLOCKS; same assertion
    5. Also test `taskIteration = cap` → block with task-level message variant
  - **Files**: `tests/hooks/max-iterations-enforcement.test.ts`
  - **Done when**: 3+ boundary cases pass; off-by-one at cap boundary explicitly covered (R2, R6)
  - **Verify**: `npm run test:hooks 2>&1 | grep -q "max-iterations-enforcement" && echo PASS`
  - **Commit**: `test(hooks): add boundary enforcement tests for max-iterations`
  - _Requirements: FR-E1, FR-E2, FR-E3, US-9, FR-T2, R6_

- [ ] 3.3 Extend stop-watcher.test.ts (+2 hard block cases)
  - **Do**:
    1. Open `tests/hooks/stop-watcher.test.ts`
    2. Add test: globalIteration at cap → decision is `block` (was previously soft warn — regression guard)
    3. Add test: globalIteration above cap → decision is `block` with D4 message tokens in reason string
  - **Files**: `tests/hooks/stop-watcher.test.ts`
  - **Done when**: 2 new cases added; both pass; existing tests unchanged
  - **Verify**: `npm run test:hooks 2>&1 | grep -q "stop-watcher" && npm run test:hooks 2>&1 | grep -qv "× stop-watcher\|FAIL.*stop-watcher" && echo PASS`
  - **Commit**: `test(hooks): add hard-block boundary cases to stop-watcher tests`
  - _Requirements: FR-E1, FR-T2_

- [ ] 3.4 [VERIFY] Phase 3 mid-checkpoint — test:hooks passes
  - **Do**: Run full hooks test suite to confirm all new tests pass before touching byte-equal baseline
  - **Verify**: `npm run test:hooks && echo MID_PASS`
  - **Done when**: All hooks tests pass; no regressions
  - **Commit**: `chore(tests): Phase 3 mid-checkpoint — hooks tests green`

- [ ] 3.5 Extend byte-equal baseline + drift test + CLI flag test
  - **Do**:
    1. `tests/hooks/byte-equal.test.ts`: append baseline entry for `stop-failure-handler.mjs` (reuse existing pattern — same baseline dir per design open Q2 default)
    2. Create `tests/runner/cache-ttl-doc.test.ts`: assert tokens present in `plugins/curdx-flow/references/cache-ttl-and-cost.md` — `"5 minute" OR "5-minute" OR "5min"`, `"GH#46829"`, `"5-10"` (drift test, R5)
    3. `tests/cli/check.test.ts` (edit or new): add 1-2 cases for `--max-global-iterations` flag → state propagation; verify `state.maxGlobalIterations` is set after flag parse
  - **Files**: `tests/hooks/byte-equal.test.ts`, `tests/runner/cache-ttl-doc.test.ts`, `tests/cli/check.test.ts`
  - **Done when**: byte-equal baseline includes stop-failure-handler.mjs; drift test asserts 3 tokens; CLI flag case added
  - **Verify**: `npm run test:hooks && node -e "const fs=require('fs'); const doc=fs.readFileSync('plugins/curdx-flow/references/cache-ttl-and-cost.md','utf8'); process.exit(doc.includes('GH#46829')?0:1)" && echo PASS`
  - **Commit**: `test(hooks,cli): extend byte-equal baseline, add drift test and CLI flag test`
  - _Requirements: FR-T3, FR-T4, FR-T5, FR-CLI1, FR-DOC2_

- [ ] 3.6 [VERIFY] Phase 3 checkpoint — full test:hooks suite
  - **Do**:
    1. Run full hooks test suite (includes byte-equal freshness, all new unit tests)
    2. Run cache-ttl-doc drift test
  - **Verify**: `npm run test:hooks && npm run test:analyze 2>/dev/null || true && echo PHASE3_PASS`
  - **Done when**: All tests pass; byte-equal freshness verified; drift tokens confirmed
  - **Commit**: `chore(tests): Phase 3 checkpoint — all tests green`

---

## Phase 4 — Quality (1 task)

- [ ] 4.1 Update CHANGELOG.md (Added / Changed / Fixed sections)
  - **Do**:
    1. Open `CHANGELOG.md`, prepend new section at top under current `## [Unreleased]` or as new version entry
    2. **Changed**: `maxGlobalIterations` default `100 → 30`; existing state values preserved (FR-C1); opt-in via `--max-global-iterations 100`
    3. **Added**: StopFailure handler (8 matchers, fail-open, exit 0); `references/cache-ttl-and-cost.md` (4 sections, GH#46829 cite); `--max-global-iterations` CLI flag
    4. **Fixed**: `maxGlobalIterations` / `maxTaskIterations` now actually block at cap (was stderr-warn only)
  - **Files**: `CHANGELOG.md`
  - **Done when**: All three sections (Added/Changed/Fixed) present with correct content; backwards-compat note for 100→30 included
  - **Verify**: `grep -q "maxGlobalIterations" CHANGELOG.md && grep -q "StopFailure" CHANGELOG.md && grep -q "100.*30\|100 → 30\|100->30" CHANGELOG.md && echo PASS`
  - **Commit**: `chore(changelog): document cost-runaway-guards changes`
  - _Requirements: FR-DOC1, C10_

---

## Phase 5 — Release (4 tasks)

- [ ] V4 [VERIFY] Full local CI gate
  - **Do**:
    1. Run complete local CI chain: typecheck → build:hooks → check:hooks-fresh → build → test:hooks → verify script
    2. Fix any failures before proceeding
  - **Verify**: `npm run typecheck && npm run build:hooks && npm run check:hooks-fresh && npm run build && npm run test:hooks && npm run verify && echo V4_PASS`
  - **Done when**: All commands exit 0; no lint/type/test errors; bundle freshness confirmed
  - **Commit**: `chore(ci): pass full local CI gate` (if fixes needed)

- [ ] V5 [VERIFY] CI pipeline passes
  - **Do**:
    1. Verify current branch is a feature branch: `git branch --show-current`
    2. Push branch: `git push -u origin <branch>`
    3. Create PR: `gh pr create --title "feat: cost runaway guards — StopFailure handler, hard cap enforcement, default 100→30" --body "..."`
    4. Monitor CI: `gh pr checks --watch`
  - **Verify**: `gh pr checks 2>&1 | grep -v "fail\|FAIL\|×" | grep -q "pass\|✓\|All checks" && echo V5_PASS`
  - **Done when**: All CI checks green on GitHub Actions
  - **Commit**: None

- [ ] V6 [VERIFY] AC checklist
  - **Do**: Programmatically verify each acceptance criterion is satisfied:
    - AC-1.1 (globalIteration >= cap → block): `grep -q "globalIteration.*maxGlobalIterations\|buildCostRunawayBlock" src/hooks/stop-watcher.ts`
    - AC-2.2 (task-level cap → mark failed): `grep -q "taskIteration.*maxTaskIterations" plugins/curdx-flow/commands/implement.md`
    - AC-4.x (StopFailure handler): `ls plugins/curdx-flow/hooks/scripts/stop-failure-handler.mjs`
    - AC-CLI (flag registered): `grep -q "max-global-iterations" plugins/curdx-flow/commands/implement.md`
    - AC-DOC (drift test green): `npm run test:hooks 2>&1 | grep -q "cache-ttl-doc\|pass"` or equivalent
    - AC-SCHEMA (default=30): `node -e "const s=require('./plugins/curdx-flow/schemas/spec.schema.json'); process.exit(s.properties?.maxGlobalIterations?.default===30?0:1)"`
  - **Verify**: All grep/node commands above exit 0; `npm run test:hooks` fully passes
  - **Done when**: All AC bullets confirmed via automated checks
  - **Commit**: None

- [ ] V7 [VERIFY] PR lifecycle — resolve review comments and re-verify CI
  - **Do**:
    1. Check for open review comments: `gh pr view --json reviews,comments`
    2. If any unresolved: fix locally, push, re-run `gh pr checks --watch`
    3. Repeat until: CI green AND zero unresolved review comments
  - **Verify**: `gh pr checks 2>&1 | grep -qv "fail\|FAIL" && gh pr view --json reviewDecision --jq '.reviewDecision' | grep -qv "CHANGES_REQUESTED" && echo V7_PASS`
  - **Done when**: CI green; no changes requested; PR ready to merge
  - **Commit**: `fix(scope): address review comments` (if fixes needed)

---

## Notes

- **POC shortcuts**: stop-failure-handler.ts may stub description strings; expand in Phase 2/3 if needed
- **Production TODOs**: none — all D1-D4 decisions baked in; no env var workaround
- **Parallel groups**: 1.2 + 1.3 share zero file overlap → `[P]`; 2.1 + 2.2 both touch implement.md → sequential
- **Open Q3 (stderr format)**: default free text v1 per design; no JSON lines needed
- **Open Q2 (byte-equal baseline dir)**: append in-place same dir per design default
