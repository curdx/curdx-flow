---
spec: spec-verification-iron-law
epic: superpowers-uplift
phase: triage
created: 2026-05-06
---

# Plan: spec-verification-iron-law

> Epic: [`specs/_epics/superpowers-uplift/epic.md`](../_epics/superpowers-uplift/epic.md)
> Foundation spec for the epic — A is the prerequisite for B / D / E.

## Goal

把"没有新鲜证据就不能声称完成"从 reality-verification 单任务作用域提升为通用铁律 hook，覆盖 task / phase exit / commit / tag / release 所有声称点。

## Acceptance Criteria

- 新增 `TaskCompleted` hook：拦截无 "fresh-evidence-token" 的完成声称，blocking exit code 2，stderr 给修复建议
- 新增 `Stop` hook 扩展：phase exit 时校验 phase artifact 包含可机读的 verification block（命令 + 退出码 + 时间戳）
- commit / tag / release 路径走 `references/iron-law-verification.md` 检查清单（`npm run verify` 全绿 + verification block 时间戳 ≥ 最后一次 src 变更）
- 现有 `reality-verification` skill 升级为 `verification-before-completion` 超集（保留 BEFORE/AFTER + VF 任务，新增"任何完成声称"覆盖面），SKILL.md 描述字段在 1,536 char 限内并带 explicit triggers
- compact 抗性：iron law 落在 hook + state + reference doc 三处，**不只**在 SKILL.md prose
- 新增 `CHANGELOG.md` 条目（按 Added/Changed/Fixed 分类）记录本 spec 上线 surface

## Size

L (20-40 tasks)

## Dependencies

- **Internal (epic)**: none — foundation
- **External**: `state-completion-marker` (51 tasks in execution) must complete first; both touch `.curdx-state.json` schema

## Interface Contract

| Surface | Detail |
|---|---|
| New hook event | `TaskCompleted` registered in `plugins/curdx-flow/hooks/hooks.json` |
| New hook script | `src/hooks/task-completed-verifier.ts` → bundled `plugins/curdx-flow/hooks/scripts/task-completed-verifier.mjs` |
| New reference | `plugins/curdx-flow/references/iron-law-verification.md` |
| Skill rename + upgrade | `skills/reality-verification/SKILL.md` → `skills/verification-before-completion/SKILL.md` (alias preserved) |
| State schema extension | `.curdx-state.json` adds `verificationBlocks: { [phase]: { command, exitCode, timestamp, srcMtime } }` |

**冲突点**: state-completion-marker 也在改 schema → must sequence after.

## Owner Files

- `plugins/curdx-flow/hooks/hooks.json` (event registration)
- `plugins/curdx-flow/hooks/scripts/task-completed-verifier.mjs` (new)
- `src/hooks/task-completed-verifier.ts` (new)
- `plugins/curdx-flow/references/iron-law-verification.md` (new)
- `plugins/curdx-flow/skills/verification-before-completion/SKILL.md` (moved from `skills/reality-verification/SKILL.md`)
- `plugins/curdx-flow/skills/verification-before-completion/references/goal-detection-patterns.md` (moved)
- `plugins/curdx-flow/skills/verification-before-completion/references/mock-quality-checks.md` (moved)
- `src/hooks/_shared/types.ts` (edit — add `verificationBlocks` to `CurdxState`; TS interface ↔ schema JSON dual-source sync)
- `src/hooks/lib/merge-state.ts` (edit — verificationBlocks writes funnel through atomic merge)
- `plugins/curdx-flow/hooks/scripts/stop-watcher.mjs` (extend — must NOT break existing `ALL_TASKS_COMPLETE` regex behavior)

## Validation Hint

- Run `npm run verify` — all green
- Fixture spec: run to phase exit without writing verification block → confirm Stop hook returns exit code 2
- Fixture spec: edit a src file then immediately claim done → confirm timestamp comparison fails

## Notes from Triage

- Validation pass spotted: skill rename must move `references/goal-detection-patterns.md` + `references/mock-quality-checks.md` (preserve, don't lose)
- Validation pass spotted: `src/hooks/_shared/types.ts` and `src/hooks/lib/merge-state.ts` are hidden shared modules — included in owner files

## Related Research

- `specs/_epics/superpowers-uplift/research.md` §External Research P5 / Pitfalls P3
- `specs/_epics/superpowers-uplift/research.md` §Validation Findings → spec-A
- codex CLI synthesis: "最高杠杆" (highest leverage)
