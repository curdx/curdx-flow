---
spec: spec-subagent-context-reinjection
epic: superpowers-uplift
phase: requirements
created: 2026-05-07
---

# Requirements: spec-subagent-context-reinjection

## Goal

在 `SubagentStart` 事件处注入压缩版 spec context + iron-law 1-liner，让 dispatched subagent 启动时立即拿到 phase / spec 路径 / 验证纪律，preempt superpowers issue #237 (closed wontfix upstream)。

## Success Criteria

- 新 SubagentStart hook fires + 注入 ≤2KB payload (target 100-150B) in 100% of subagent dispatches with valid `.curdx-state.json`
- Iron-law 1-liner ("No completion claim without fresh verification.") 字节级匹配 `references/iron-law-verification.md` canonical source
- SessionStart `load-spec-context.mjs` 外部行为零回归（byte-equal regression baseline 通过）
- 7 hook unit tests + 1 drift test 全绿；fail-open 在 state 缺失/JSON 损坏/payload 超限三种情况下都返回 `{continue: true}` 不崩 subagent

## Glossary

- **SubagentStart hook**: Claude Code GA event，每次 Task() dispatch subagent 时 fire；observability/injection-only，不能 block
- **additionalContext**: hook 输出 `hookSpecificOutput.additionalContext` 字段；subagent 收到为 `<system-reminder>` 块（非 system-prompt）
- **Iron-law summary**: 单句纪律 "No completion claim without fresh verification."；canonical 源在 `plugins/curdx-flow/references/iron-law-verification.md`
- **Shared context builder**: 新 lib `src/hooks/lib/build-context-payload.ts`，被 SessionStart 和 SubagentStart 双向 import
- **Fail-open policy**: 任何错误（state 不存在、JSON 解析失败、超 budget）→ 输出 `{continue: true}` no-op；永不 abort subagent dispatch
- **Byte-equal baseline**: `tests/hooks/byte-equal.test.ts` 冻结的 hook 输出快照；refactor 必须不改变 SessionStart 输出字节

## Personas

### Primary: Subagent (Claude in dispatched role)

**Context**: Dispatched via `Task()` with narrow scope (e.g., Explore for file search, qa-engineer for test plan). Does NOT inherit parent's loaded `<system-reminder>` blocks.

**Pain today**: 启动时不知道 spec phase / 不知道 iron-law / 不知道 spec 路径；可能在 spec 已 completed 时仍被分派 work，或在 quick-mode 下放松验证。

**Need**: 启动 stdin 中带 `<system-reminder>` containing `phase`, `specPath`, `ironLawSummary`，无需主动读 state 文件。

### Secondary: Spec author / coordinator

**Context**: 在父会话运行 `/curdx-flow:implement` 等命令；通过 Task tool dispatch subagent 完成子任务。

**Pain today**: subagent 未收到纪律 → 可能跳过验证宣称 done → coordinator 必须二次校验，浪费 turn。

**Need**: 隐式注入纪律到所有 subagent；SessionStart 现有行为零回归（不破坏现有 setup）。

## User Stories

### US-1: SubagentStart hook fires and injects payload
**As a** dispatched subagent
**I want to** receive `<system-reminder>` block with phase + specPath + ironLawSummary at start
**So that** I know spec context without reading state file

**ACs:**
- [ ] AC-1.1: Spawn subagent → stdout JSON contains `hookSpecificOutput.additionalContext`
- [ ] AC-1.2: `additionalContext` 包含 `phase`, `specPath`, `ironLawSummary` 三字段
- [ ] AC-1.3: Hook exit code === 0

### US-2: Payload ≤ 2KB hard cap
**As a** spec author
**I want to** payload never exceed 2KB
**So that** subagent context window is not bloated

**ACs:**
- [ ] AC-2.1: `JSON.stringify(additionalContext).length ≤ 2048` for all valid states
- [ ] AC-2.2: Typical payload size 100-150B (assertion in test)
- [ ] AC-2.3: Over-budget edge case → fail-open `{continue: true}`

### US-3: Iron-law 1-liner verbatim from canonical reference
**As a** spec author
**I want to** ironLawSummary 字节级 === canonical 源
**So that** drift between docs and runtime impossible

**ACs:**
- [ ] AC-3.1: `ironLawSummary === "No completion claim without fresh verification."` (test e)
- [ ] AC-3.2: Drift test asserts lib constant matches `references/iron-law-verification.md` lines 8-18
- [ ] AC-3.3: Reference doc edit without lib edit → drift test fails CI

### US-4: Shared lib eliminates SessionStart/SubagentStart duplication
**As a** maintainer
**I want to** single `buildContextPayload()` function used by both hooks
**So that** payload-shape changes happen in one place

**ACs:**
- [ ] AC-4.1: `src/hooks/lib/build-context-payload.ts` exported function
- [ ] AC-4.2: Both `load-spec-context.ts` and `subagent-context-injector.ts` import it (no duplicated payload-build code)
- [ ] AC-4.3: `forSubagent: true/false` opt switches between full / compressed payload

### US-5: SessionStart refactor preserves external behavior
**As a** existing curdx-flow user
**I want to** SessionStart hook output unchanged byte-for-byte
**So that** my existing setup keeps working

**ACs:**
- [ ] AC-5.1: `tests/hooks/byte-equal.test.ts` baseline test passes pre/post-refactor
- [ ] AC-5.2: `load-spec-context.test.ts` (92 LOC) all green unchanged
- [ ] AC-5.3: SessionStart payload size in 400-550B range (current behavior)

### US-6: Fail-open on missing/malformed state
**As a** subagent
**I want to** continue dispatch even if state read fails
**So that** my work is never blocked by hook bug

**ACs:**
- [ ] AC-6.1: State file absent → hook outputs `{continue: true}`, exit 0
- [ ] AC-6.2: State JSON malformed → exit 0 + stderr error trace
- [ ] AC-6.3: Lib throws unexpected exception → caught at hook handler, fail-open

### US-7: Hooks.json registration follows pattern
**As a** plugin user
**I want to** new SubagentStart hook auto-register at install time
**So that** I don't run extra setup steps

**ACs:**
- [ ] AC-7.1: `plugins/curdx-flow/hooks/hooks.json` adds `SubagentStart` entry
- [ ] AC-7.2: Entry mirrors SessionStart pattern (command + matchers)
- [ ] AC-7.3: `npm run build:hooks` produces `subagent-context-injector.mjs` bundle

### US-8: 7 unit tests cover happy path + edge cases
**As a** maintainer
**I want to** comprehensive unit tests
**So that** future edits surface regressions

**ACs:**
- [ ] AC-8.1: Tests (a)–(g) from research §recommended-test-cases all green
- [ ] AC-8.2: `npm run test:hooks` includes new SubagentStart suite
- [ ] AC-8.3: Coverage hits all 4 fail-open branches

### US-9: Byte-equal regression baseline added
**As a** CI gate
**I want to** SubagentStart hook output frozen to baseline
**So that** silent payload drift caught at PR review

**ACs:**
- [ ] AC-9.1: New baseline fixture in `tests/hooks/byte-equal.test.ts`
- [ ] AC-9.2: SessionStart baseline preserved (no diff)
- [ ] AC-9.3: Byte-equal test green in CI

### US-10: CHANGELOG entry on release
**As a** plugin consumer
**I want to** v7.1.7 release notes mention new hook
**So that** I know SubagentStart support shipped

**ACs:**
- [ ] AC-10.1: `CHANGELOG.md` v7.1.7 section adds entry under `Added`
- [ ] AC-10.2: Entry references spec ID + superpowers #237 context
- [ ] AC-10.3: Same release line as A/B/C (epic batch)

## Functional Requirements

| ID | Requirement | Priority | Acceptance |
|---|---|---|---|
| FR-1 | New `src/hooks/subagent-context-injector.ts` handler reads stdin → loads state → calls shared lib → emits `hookSpecificOutput.additionalContext` → exit 0 | High | Hook fires on Task dispatch; AC-1.1 |
| FR-2 | New shared `src/hooks/lib/build-context-payload.ts` with `buildContextPayload(state, specDir, opts)` returning JSON-serialized payload string | High | Both hooks import; AC-4.1, AC-4.2 |
| FR-3 | `forSubagent: true` opt produces compressed payload `{phase, specPath, ironLawSummary}` only; excludes goal/progress/discoveredSkills/taskIndex | High | Test (a); AC-2.2 |
| FR-4 | `forSubagent: false` (default) produces existing SessionStart payload shape — byte-equal | High | Byte-equal test green; AC-5.1 |
| FR-5 | `IRON_LAW_SUMMARY` constant in lib === canonical 1-liner from reference doc; drift test enforces equality | High | AC-3.1, AC-3.2 |
| FR-6 | Surgical refactor of `load-spec-context.ts` — extract payload build to lib import; preserve all 3 existing functions' external signatures | High | AC-5.2 |
| FR-7 | `plugins/curdx-flow/hooks/hooks.json` registers `SubagentStart` event → `subagent-context-injector.mjs` | High | AC-7.1 |
| FR-8 | `scripts/build-hooks.mjs` adds entry for new hook source → emits bundled `.mjs` to `plugins/curdx-flow/hooks/scripts/` | High | AC-7.3 |
| FR-9 | Fail-open: state file missing → `{continue: true}` exit 0 | High | Test (b); AC-6.1 |
| FR-10 | Fail-open: malformed JSON → stderr trace + exit 0 + no-op output | High | Test (c); AC-6.2 |
| FR-11 | Fail-open: completed spec (`state.completed === true`) → no injection, output `{continue: true}` | Medium | Test (f) |
| FR-12 | Quick-mode spec (`state.quickMode === true`) → still injects (discipline applies in quick mode) | Medium | Test (g) |
| FR-13 | 7 unit tests under `tests/hooks/subagent-context-injector.test.ts` matching cases (a)–(g) | High | AC-8.1 |
| FR-14 | Byte-equal regression baseline extends `tests/hooks/byte-equal.test.ts` for new hook output | Medium | AC-9.1 |
| FR-15 | `CHANGELOG.md` v7.1.7 entry under `Added` referencing spec ID + closes-link to superpowers #237 | Medium | AC-10.1 |

## Non-Functional Requirements

| ID | Requirement | Metric | Target |
|---|---|---|---|
| NFR-1 | Payload size budget | `JSON.stringify(additionalContext).length` | ≤ 2048 bytes; typical 100-150B |
| NFR-2 | Hook overhead per fire | wall-clock from stdin read to exit | < 30ms (file I/O dominated) |
| NFR-3 | SessionStart backwards-compat | byte-equal baseline diff | 0 bytes changed |
| NFR-4 | Cross-platform | CI matrix (linux/macOS/windows) | All pass; no fs/path platform forks |
| NFR-5 | Fail-open enforcement | failure injection coverage | 100% of error paths return exit 0 + `{continue: true}` |
| NFR-6 | Code coverage of new lib | line coverage | ≥ 90% on `build-context-payload.ts` |

## Out of Scope

- Filtering by `agent_type` (universal injection in v1; e.g., spec-executor / qa-engineer all receive same payload — revisit if perf data shows issue)
- Per-subagent customized payloads (single shape for all subagent types)
- Replacing system-reminder channel with system-prompt (issue #23885 closed wontfix; not negotiable upstream)
- Backporting to older Claude Code versions lacking SubagentStart event (require GA version; runtime warn only)
- Migrating SessionStart payload shape (refactor is surgical extract-only; no shape changes)
- Embedding full goal text or .progress.md log in subagent payload (excluded by NFR-1 budget)

## Dependencies

### Internal

- **spec-verification-iron-law (✅ DONE)** — provides canonical iron-law 1-liner in `plugins/curdx-flow/references/iron-law-verification.md`; this spec imports as constant + drift-test source

### External

- **Claude Code SubagentStart event GA** — verified 2026-05; no `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` flag required (Anthropic Hooks reference + Subagents docs)
- **Existing test infra**: `createFixtureSpec()` + `runHook()` helpers in `tests/hooks/_fixtures/` (no new tooling)
- **esbuild + tsup** (existing build chain; no new dep)

## Open Questions for Design

1. **Iron-law summary read strategy**: hardcoded constant in `lib/build-context-payload.ts` (startup-fast) vs read from reference doc at runtime (drift-resilient)? Research recommends hardcoded + drift test; design must finalize.
2. **agent_type filter**: research recommends NO filter in v1 (universal injection). Design must confirm or pre-bake filter hook for future extension.
3. **Payload format inside additionalContext**: JSON object embedded in `additionalContext.text` (system-reminder-friendly) vs prose string. Research recommends JSON; design must specify exact serialization (pretty vs compact).
4. **Refactor scope of `load-spec-context.ts`**: surgical (extract `buildContextPayload`, leave handler shape unchanged) vs larger (move handler logic into lib). Research recommends surgical; design must lock.
5. **Completion marker behavior**: `state.completed === true` → output `{continue: true}` (no injection). Should we instead inject "spec complete" reminder so subagent knows to refuse work? Design decision.

## Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | SessionStart byte-equal regression from refactor | Low | High | Byte-equal baseline test + CI gate (AC-5.1); refactor strictly extract-only, no shape changes |
| R2 | Hook fires too often → cumulative latency on high-volume Team API sessions (50+ subagent spawns) | Low | Medium | NFR-2 budget (<30ms/fire); manual smoke on 50+ dispatch session; cumulative budget ~1.5s per session |
| R3 | Iron-law string drift between lib constant + reference doc | Medium | Medium | Drift test asserts byte-equal at CI; reference doc lines 8-18 anchored as canonical source |
| R4 | Cross-platform test fixture path issues (windows backslash, eol) | Low | Low | Reuse existing `createFixtureSpec()` + `runHook()` (research E2 confirmed cross-platform-clean) |
| R5 | SubagentStart event behavior change in future Claude Code release | Low | Medium | Runtime version warning Task 0 + fail-open policy ensure no hard break |
| R6 | Payload exceeds 2KB on edge case state shapes | Low | Low | NFR-1 hard cap + fail-open `{continue: true}` if over budget (AC-2.3) |

## Validation Strategy

### Unit tests (7 cases from research §recommended-test-cases)

| # | Case | Fixture | Expected |
|---|---|---|---|
| (a) | Happy path | `createFixtureSpec()` default | `additionalContext` with phase + specPath + ironLawSummary |
| (b) | State absent | `noStateFile: true` | `{continue: true}` no-op (fail-open) |
| (c) | State malformed JSON | invalid JSON in `.curdx-state.json` | exit 0 + stderr trace, no crash |
| (d) | Payload size ≤ 2KB | any | `JSON.stringify(r.json).length ≤ 2048` |
| (e) | Iron-law verbatim | (a) | `ironLawSummary === "No completion claim without fresh verification."` |
| (f) | Completed spec | `state: { completed: true }` | `{continue: true}` (no injection) |
| (g) | Quick-mode spec | `state: { quickMode: true }` | injection still present |

### Additional gates

- **Drift test**: `expect(IRON_LAW_SUMMARY).toBe(canonicalFromReferenceDoc)` — single test ensures lib constant matches `references/iron-law-verification.md` (lines 8-18)
- **Byte-equal regression**: SessionStart baseline preserved + new SubagentStart baseline added in `tests/hooks/byte-equal.test.ts` (currently 502 LOC, frozen v6.0.6 baselines)
- **Manual smoke test**: Spawn a real subagent via Task tool → inspect transcript JSONL for `<system-reminder>` block containing phase + specPath + ironLawSummary
- **CI gates**: `npm run typecheck` (lib + hook source) + `npm run check:hooks-fresh` (bundle freshness) + `npm run test:hooks` (all unit + new SubagentStart) + `npm run verify` (full chain)
- **Coverage gate**: `build-context-payload.ts` ≥ 90% line coverage (NFR-6)

## Next Steps

1. Run `/curdx-flow:design` to lock 5 open design questions (iron-law constant location, agent_type filter, payload serialization format, refactor surgical scope, completion-state behavior)
2. Pre-check Task 0 spec runtime version warning script (no defer needed — GA confirmed)
3. Generate task list (`/curdx-flow:tasks`) — expect 8-12 tasks: 1 GA pre-check + 1 lib + 1 new hook + 1 SessionStart refactor + 1 hooks.json reg + 1 build reg + 7 tests + 1 drift test + 1 byte-equal + 1 CHANGELOG
4. Implement (`/curdx-flow:implement`) within v7.1.7 release line alongside specs A/B/C
