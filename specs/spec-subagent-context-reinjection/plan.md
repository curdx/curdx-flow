---
spec: spec-subagent-context-reinjection
epic: superpowers-uplift
phase: triage
created: 2026-05-06
---

# Plan: spec-subagent-context-reinjection

> Epic: [`specs/_epics/superpowers-uplift/epic.md`](../_epics/superpowers-uplift/epic.md)
> Defensive fix: preempts superpowers issue #237 (currently OPEN upstream).

## Goal

在 `SubagentStart` 事件接入时立即重新注入 spec context + iron-law 摘要，preempt superpowers issue #237 (subagents 拿不到 SessionStart 注入的纪律).

## Acceptance Criteria

- **Pre-check (Task 0)**: 验证 `SubagentStart` 事件在目标 Claude Code 版本已 GA — 若未 GA，整个 spec defer 直至上游 ship
  - 方法：`claude --version` + 注册一个 no-op SubagentStart hook 起 mock subagent 确认 fire
- 新 hook：`SubagentStart` 调用 `subagent-context-injector.mjs`，注入 `.curdx-state.json` 当前 phase + spec 路径 + iron-law 一句话摘要
- 注入 payload 总大小 ≤ 2 KB（避免 subagent context 通胀）
- 与现有 SessionStart `load-spec-context.mjs` 共享一份 context 构建函数（DRY，单源），**不**复制粘贴
- 测试覆盖：起一个 mock subagent，确认拿到 phase / spec / iron-law
- 新增 `CHANGELOG.md` 条目（按 Added/Changed/Fixed 分类）

## Size

S-M (≤15 tasks)

## Dependencies

- **A** (spec-verification-iron-law): A defines iron-law summary string + generator function; D imports

## Interface Contract

| Surface | Detail |
|---|---|
| New hook event | `SubagentStart` registered in `hooks/hooks.json` |
| New hook script | `plugins/curdx-flow/hooks/scripts/subagent-context-injector.mjs`, source `src/hooks/subagent-context-injector.ts` |
| Shared context lib | `src/hooks/lib/build-context-payload.ts` (imported by both SessionStart and SubagentStart) |
| Existing SessionStart | `load-spec-context.mjs` 轻度重构指向共享 lib，**不**改外部行为 |

## Owner Files

- `plugins/curdx-flow/hooks/hooks.json` (edit)
- `plugins/curdx-flow/hooks/scripts/subagent-context-injector.mjs` (new)
- `src/hooks/subagent-context-injector.ts` (new)
- `src/hooks/lib/build-context-payload.ts` (new — both SessionStart and SubagentStart point here)
- `src/hooks/load-spec-context.ts` (light edit to use shared lib)
- `src/hooks/_shared/types.ts` (edit — payload type definition)
- `src/hooks/_shared/run-hook.ts` (reuse for error handling, not reimplement)

## Validation Hint

- Pre-check: confirm `SubagentStart` event fires with no-op hook (defer if not GA)
- Run a Team API call → dump subagent's system message → confirm contains phase + spec path + iron-law summary
- Confirm payload size ≤ 2 KB

## Notes from Triage

- Validation pass: existing `load-spec-context.ts` is monolithic (~200+ LOC) — extracting payload-building cleanly may need ~5 tasks (not "轻度重构")
- Defensive port: superpowers issue #237 is OPEN; D is decoupled from upstream fix (own SubagentStart hook + own state file)
- Risk R3 (hook surface overlap with E): A and E both touch stop-watcher.mjs; D is independent of that surface

## Related Research

- `specs/_epics/superpowers-uplift/research.md` §Pitfalls P7 (superpowers issue #237 OPEN)
- `specs/_epics/superpowers-uplift/research.md` §Hook Surface Map → SubagentStart marked Critical
