---
spec: spec-decision-event-logging
phase: tasks
granularity: fine
created: 2026-05-07
---

# Tasks: spec-decision-event-logging

> Epic: observability-v2 | Total: 12 | E2E: round-trip + rotation tests

## POC Milestone
Task 1.4 — schema 扩展 + logHookEvent + stop-failure-handler 最小接入 + typecheck 通过

## Phase 1 — POC (4 tasks)

Focus: schema 升级 + logHookEvent + 最小接入证明可行。不加测试，不 wire 所有 sites。

- [x] 1.1 [P] Extend error-logger.ts: 4-field schema + logHookEvent + coerceKind
  - **Do**:
    1. Add `EventLevel`, `EventKind` type exports to `src/hooks/_shared/error-logger.ts`
    2. Add `LogHookEventInput` interface with `level?`, `kind?`, `payload?`, `correlationId?` optional fields
    3. Add `logHookEvent(input: LogHookEventInput): void` — NEVER-throw wrapper, calls `redactPayload`, calls `rotateIfNeeded`, then `appendFileSync`
    4. Redirect existing `logHookError` to `logHookEvent({ ...ctx, level: 'error', kind: ctx.kind ?? 'unknown' })`
  - **Files**: `src/hooks/_shared/error-logger.ts`
  - **Done when**: `logHookEvent` exported, `logHookError` still exported with same signature, `npm run typecheck` exits 0
  - **Verify**: `npm run typecheck && grep -c 'export function logHookEvent' src/hooks/_shared/error-logger.ts | grep -q 1 && echo PASS`
  - **Commit**: `feat(error-logger): add 4-field schema + logHookEvent + coerceKind`
  - _Design: Component 1, Component 2_

- [x] 1.2 [P] Add rotation helpers to error-logger.ts: rotateIfNeeded + safeRename + prune
  - **Do**:
    1. Add `rotateIfNeeded(filePath: string)` with throttle counter N=10, `shouldRotate` (size >10MB OR age >30d)
    2. Add `safeRename(src, dst)` — 4-step: renameSync → EBUSY retry chain (50/200/500ms) → EXDEV copy+unlink → silent give-up
    3. Add `pruneRotated(dir, keep=5)` — glob `errors.*.jsonl`, sort by mtime desc, unlink oldest beyond keep
    4. Rotation suffix format: `errors.<ISO-ts>-<pid>.jsonl` where ISO-ts is `20260507T143205Z` style
  - **Files**: `src/hooks/_shared/error-logger.ts`
  - **Done when**: `rotateIfNeeded` called inside `logHookEvent` before `appendFileSync`; `npm run typecheck` exits 0
  - **Verify**: `npm run typecheck && grep -c 'safeRename\|pruneRotated\|rotateIfNeeded' src/hooks/_shared/error-logger.ts | grep -qv '^0' && echo PASS`
  - **Commit**: `feat(error-logger): add rotation + safeRename + prune (D2 retention=5, D3 suffix)`
  - _Design: Component 3, Component 4, Component 5_

- [ ] 1.3 [P] New correlation.ts: buildCorrelationId 3-segment helper
  - **Do**:
    1. Create `src/hooks/_shared/correlation.ts`
    2. Export `buildCorrelationId(stdin: HookStdin, state: CurdxState | null): string`
    3. Return `${sessionId.slice(0, 8)}.${specName}.${phase}` with `'no-session'`/`'no-spec'`/`'no-phase'` fallbacks
  - **Files**: `src/hooks/_shared/correlation.ts`
  - **Done when**: File exists with named export; `npm run typecheck` exits 0
  - **Verify**: `npm run typecheck && grep 'export function buildCorrelationId' src/hooks/_shared/correlation.ts && echo PASS`
  - **Commit**: `feat(correlation): add buildCorrelationId 3-segment helper`
  - _Design: Component 6_

- [ ] 1.4 [VERIFY] Wire stop-failure-handler.ts (3 sites) + POC checkpoint
  - **Do**:
    1. Import `logHookEvent` and `buildCorrelationId` in `src/hooks/stop-failure-handler.ts`
    2. Add `logHookEvent` call at all 3 decision sites: matcher hit (`kind: 'matcher_hit'`), matcher miss (`kind: 'matcher_miss'`), unknown (`kind: 'unknown'`)
    3. Verify typecheck + 3 sites wired
  - **Files**: `src/hooks/stop-failure-handler.ts`
  - **Done when**: `grep 'logHookEvent' src/hooks/stop-failure-handler.ts` shows 3 matches; typecheck passes
  - **Verify**: `npm run typecheck && [ "$(grep -c 'logHookEvent' src/hooks/stop-failure-handler.ts)" -eq 3 ] && echo POC_PASS`
  - **Commit**: `feat(stop-failure-handler): wire 3 logHookEvent sites (POC validation)`
  - _Design: Component 7, D1_

## Phase 2 — Core Hook Wiring (4 tasks)

Focus: Wire remaining 31 sites across 3 hooks. Each hook is one atomic task.

- [ ] 2.1 Wire stop-watcher.ts (14 sites)
  - **Do**:
    1. Import `logHookEvent`, `buildCorrelationId` at top of `src/hooks/stop-watcher.ts`
    2. Add `logHookEvent` at all 14 decision sites: 8 allow (`kind: 'stop_allow'`), 5 block (`kind: 'stop_block'`), 1 side-effect (`kind: 'stop_side_effect'`)
    3. Pass `level: 'decision'` for all; include `payload: { specName, iteration }` where available
  - **Files**: `src/hooks/stop-watcher.ts`
  - **Done when**: `grep -c 'logHookEvent' src/hooks/stop-watcher.ts` equals 14
  - **Verify**: `[ "$(grep -c 'logHookEvent' src/hooks/stop-watcher.ts)" -eq 14 ] && npm run typecheck && echo PASS`
  - **Commit**: `feat(stop-watcher): wire 14 logHookEvent decision sites`
  - _Design: Component 7_

- [ ] 2.2 Wire task-completed-verifier.ts (9 sites)
  - **Do**:
    1. Import `logHookEvent`, `buildCorrelationId` in `src/hooks/task-completed-verifier.ts`
    2. Add `logHookEvent` at 9 sites: 7 guards (`kind: 'task_completion_block'`), 1 block, 1 success (`kind: 'task_completion_pass'`)
    3. Include relevant payload fields per site context
  - **Files**: `src/hooks/task-completed-verifier.ts`
  - **Done when**: `grep -c 'logHookEvent' src/hooks/task-completed-verifier.ts` equals 9
  - **Verify**: `[ "$(grep -c 'logHookEvent' src/hooks/task-completed-verifier.ts)" -eq 9 ] && npm run typecheck && echo PASS`
  - **Commit**: `feat(task-completed-verifier): wire 9 logHookEvent decision sites`
  - _Design: Component 7_

- [ ] 2.3 Wire subagent-context-injector.ts (8 sites)
  - **Do**:
    1. Import `logHookEvent`, `buildCorrelationId` in `src/hooks/subagent-context-injector.ts`
    2. Add `logHookEvent` at 8 sites: 6 fail-open (`kind: 'context_inject_fail_open'`), 1 success (`kind: 'context_inject_success'`), 1 error (`kind: 'unknown'`)
    3. Include `level: 'info'` for success, `level: 'error'` for error, `level: 'decision'` for fail-open
  - **Files**: `src/hooks/subagent-context-injector.ts`
  - **Done when**: `grep -c 'logHookEvent' src/hooks/subagent-context-injector.ts` equals 8
  - **Verify**: `[ "$(grep -c 'logHookEvent' src/hooks/subagent-context-injector.ts)" -eq 8 ] && npm run typecheck && echo PASS`
  - **Commit**: `feat(subagent-context-injector): wire 8 logHookEvent decision sites`
  - _Design: Component 7_

- [ ] 2.4 [VERIFY] Site-count guard: total logHookEvent calls >= 33
  - **Do**:
    1. Count all `logHookEvent` calls across 4 hook files
    2. Verify sum >= 33 (design specifies 33 as lower bound, 34 with buffer site)
    3. Run typecheck + build:hooks
  - **Files**: none (verification only)
  - **Done when**: Total site count >= 33; `npm run build:hooks` exits 0
  - **Verify**: `TOTAL=$(grep -rh 'logHookEvent' src/hooks/stop-watcher.ts src/hooks/task-completed-verifier.ts src/hooks/subagent-context-injector.ts src/hooks/stop-failure-handler.ts | grep -c 'logHookEvent'); [ "$TOTAL" -ge 33 ] && npm run typecheck && npm run build:hooks && echo "SITES=$TOTAL PASS"`
  - **Commit**: none
  - _Design: Component 7, Risk R4_

## Phase 3 — Parser + Tests (3 tasks)

- [ ] 3.1 [P] Extend parser.ts + types.ts: EventLogRow with ?? defaults
  - **Do**:
    1. Add `EventLogRow` interface to `src/analyze/types.ts` as superset of existing `ErrorLogEntry` (add `level`, `kind`, `payload`, `correlationId` fields)
    2. Keep `ErrorLogEntry` type alias for backward compat
    3. In `src/analyze/parser.ts`, add `parseEventLine` using `?? 'error'`, `?? 'unknown'`, `?? null` defaults for old-format rows
    4. Export `coerceKind` using `KNOWN_KINDS` Set
  - **Files**: `src/analyze/types.ts`, `src/analyze/parser.ts`
  - **Done when**: `npm run test:analyze` passes; old-format rows parse with default values
  - **Verify**: `npm run typecheck && npm run test:analyze && echo PASS`
  - **Commit**: `feat(parser): extend EventLogRow 4-field read with ?? defaults + coerceKind`
  - _Design: Component 8, Component 9_

- [ ] 3.2 Add tests/hooks/event-logger.test.ts (7 cases)
  - **Do**:
    1. Create `tests/hooks/event-logger.test.ts` with vitest
    2. Cases: rotation throttle N=10 (skip 9/10), size >10MB triggers rotate, age >30d triggers rotate, payload redact white-list pass-through, correlationId 3-segment format, round-trip old-format row parses with defaults, coerceKind unknown value → `'unknown'`
    3. Use mock fs for safeRename EBUSY retry path
  - **Files**: `tests/hooks/event-logger.test.ts`
  - **Done when**: All 7 cases present and `npm run test:hooks` passes
  - **Verify**: `npm run test:hooks && echo PASS`
  - **Commit**: `test(event-logger): add 7 cases — rotation/redact/correlationId/round-trip`
  - _Design: Component 10, Test Strategy_

- [ ] 3.3 [VERIFY] Full test suite: test:hooks + test:analyze + typecheck
  - **Do**:
    1. Run full test suite for both test namespaces
    2. Run typecheck
    3. Run check:hooks-fresh to verify built hooks are in sync
  - **Files**: none
  - **Done when**: All commands exit 0; no regressions in existing `tests/hooks/error-logger.test.ts` 4 cases
  - **Verify**: `npm run typecheck && npm run test:hooks && npm run test:analyze && npm run check:hooks-fresh && echo ALL_PASS`
  - **Commit**: none
  - _Design: Test Strategy, AC1_

## Phase 4 — Release (1 task)

- [ ] 4.1 CHANGELOG entry + V4/V6 full local CI
  - **Do**:
    1. Prepend OB-2 entry to `CHANGELOG.md`: schema upgrade (4 fields), logHookEvent API, 33+ hook sites, rotation + safeRename, D1-D4 decisions
    2. Run full local CI: `npm run verify`
    3. Verify AC checklist: AC1 (schema + old-row parse), AC2 (B2-B6 fixes — level not hardcoded, EventKind enum, rotation, correlationId, payload redact); grep site counts; confirm `grep -c 'logHookEvent' src/hooks/*.ts` totals >= 33
  - **Files**: `CHANGELOG.md`
  - **Done when**: `npm run verify` exits 0; all AC confirmed via grep/test commands
  - **Verify**: `npm run verify && [ "$(grep -rh 'logHookEvent' src/hooks/stop-watcher.ts src/hooks/task-completed-verifier.ts src/hooks/subagent-context-injector.ts src/hooks/stop-failure-handler.ts | grep -c 'logHookEvent')" -ge 33 ] && echo V4_V6_PASS`
  - **Commit**: `chore(changelog): add OB-2 entry — decision event logging`
  - _Design: D1-D4, Component 10_

## Notes

- POC shortcuts: 1.1-1.3 skip tests; only stop-failure-handler (smallest, 3 sites) wired in Phase 1
- Phase 2 tasks 2.1/2.2/2.3 cannot be [P] — all import from the same shared `error-logger.ts` and `correlation.ts`, but files don't overlap (safe to parallelize); marked sequentially for safety given shared import chain
- R4 site-count drift guard: task 2.4 runs `grep -c logHookEvent` across all 4 hook files as CI proxy; real CI grep guard is a follow-up in `.github/workflows/ci.yml` (out-of-scope for this spec per design)
- Production TODOs: CI grep guard in `.github/workflows/ci.yml`; settings.json retentionCount config (D2 v2 work); OB-3 cost analytics consumer spec
