---
spec: spec-cost-runaway-guards
epic: superpowers-uplift
phase: triage
created: 2026-05-06
---

# Plan: spec-cost-runaway-guards

> Epic: [`specs/_epics/superpowers-uplift/epic.md`](../_epics/superpowers-uplift/epic.md)
> Direct mitigation for research.md §Pitfalls P5 / P6 / P10.

## Goal

给所有 autonomous loop / Stop hook 加成本护栏：StopFailure 区分、`stop_hook_active` 显性检查、`maxGlobalIterations` / `maxTaskIterations` 默认值收紧 + CLI flag enforcement、cache-TTL 文档化。

## Acceptance Criteria

- **Pre-check (Task 0)**: 验证 `StopFailure` 事件在目标 Claude Code 版本已 GA — 若未 GA，将本 spec scope 缩到只做 `stop_hook_active` guard + 复用 `maxGlobalIterations/maxTaskIterations` 默认值收紧 + cache-TTL 文档，不实现 StopFailure handler
- `stop-watcher.mjs` 在入口立即检查 `stop_hook_active`，true 时直接 `{continue: false}` 返回（防止递归）
- 新增 `StopFailure` matcher：rate_limit / max_output_tokens / api_died 走独立路径，不当 model-finished 处理
- coordinator + execution loop **复用 schema 已有字段** `maxGlobalIterations` (default 100, schema line 62-67) + `maxTaskIterations` (default 5, schema line 50-55)：
  - 不新增字段
  - 收紧默认值（globalIteration 100 → 30）
  - 暴露 CLI flags `--max-global-iterations` / `--max-task-iterations`
  - coordinator + execution loop 显性读取并 enforce
- 新 reference：`references/cache-ttl-and-cost.md`，明确"5 min cache TTL → stop loop sleep > 5min = 5-10× cost multiplier"
- 不与 spec A 重复：A 管"声称 done 必须有证据"，E 管"loop 必须有上限与失败区分"
- 新增 `CHANGELOG.md` 条目（按 Added/Changed/Fixed 分类）

## Size

M (8-20 tasks)

## Dependencies

- **A** (spec-verification-iron-law): A 先落 Stop hook 框架；E 后扩 matcher / guards on the same surface
- **External**: `state-completion-marker` (51 tasks in execution) must complete first; both touch state schema (E only adjusts defaults, but still needs schema stability)

## Interface Contract

| Surface | Detail |
|---|---|
| Hook event extension | `hooks.json` 新增 `StopFailure` 事件 + 现有 `Stop` 加 `stop_hook_active` guard |
| New hook script | `plugins/curdx-flow/hooks/scripts/stop-failure-handler.mjs`, source `src/hooks/stop-failure-handler.ts` |
| State schema | **No new fields** — reuse existing `maxGlobalIterations` / `maxTaskIterations` (schema 已 ship); only adjust defaults + enforce paths |
| New reference | `plugins/curdx-flow/references/cache-ttl-and-cost.md` |
| CLI flags | `--max-global-iterations` and `--max-task-iterations` exposed via `src/cli/`, default tightened to 30 (was 100) |

## Owner Files

- `plugins/curdx-flow/hooks/hooks.json` (edit)
- `plugins/curdx-flow/hooks/scripts/stop-watcher.mjs` (edit — add `stop_hook_active` guard)
- `plugins/curdx-flow/hooks/scripts/stop-failure-handler.mjs` (new)
- `src/hooks/stop-failure-handler.ts` (new)
- `src/hooks/stop-watcher.ts` (edit — A first lays framework, E adds matchers + guards on top, no behavior break)
- `plugins/curdx-flow/references/cache-ttl-and-cost.md` (new)

## Validation Hint

- Pre-check: confirm `StopFailure` GA (defer matcher impl if not)
- Mock a rate_limit StopFailure → confirm independent path is taken
- Mock a stop loop without `stop_hook_active` set → confirm guard immediately stops it
- Run a fixture spec → confirm `globalIteration` reaching cap triggers graceful exit
- Run a fixture spec with `--max-task-iterations 3` flag → confirm enforced

## Notes from Triage

- Validation pass spotted CRITICAL bug: original epic invented `globalIterationMax/taskIterationMax` field names that **collide** with existing `maxGlobalIterations/maxTaskIterations` (schema line 50, 62) — fixed: reuse, don't add
- Validation pass: "must sequence after marker" guidance is sound but reason is schema stability, not field collision (no actual conflict with marker's `completed`/`completedAt`)
- Risk R3 (hook surface): A and E both touch `stop-watcher.mjs` — A merges first, E extends on top
- Risk R6 (autonomous loop cost regression): E is the direct mitigation

## Related Research

- `specs/_epics/superpowers-uplift/research.md` §Pitfalls P5 / P6 / P10
- Cache TTL regression GH #46829
- Huntley Ralph blog: "engineers still needed"
- claudefa.st `stop_hook_active` undocumented flag
