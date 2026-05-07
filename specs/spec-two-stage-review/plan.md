---
spec: spec-two-stage-review
epic: superpowers-uplift
phase: triage
created: 2026-05-06
---

# Plan: spec-two-stage-review

> Epic: [`specs/_epics/superpowers-uplift/epic.md`](../_epics/superpowers-uplift/epic.md)
> Absorbs the legacy `superpowers-inline-review` placeholder scope (verdict: dropped from independent track, merged here).

## Goal

在 phase 边界（post-design / post-tasks / pre-commit）跑 spec-compliance + code-quality 双审查，把现有 spec-reviewer 收窄到 spec-compliance only，新增独立 `code-quality-reviewer` agent 给独立 prompt + 独立 context。

## Acceptance Criteria

- 新增 `agents/code-quality-reviewer.md`：检查 code smell / 安全 / 实现质量 / 可读性，**禁止**重复 spec-compliance 检查
- 现有 `agents/spec-reviewer.md`（internal）prompt 收窄到 spec-compliance only，删除任何 code-quality 字样
- 双 reviewer 在 phase 边界并行 dispatch（依赖 spec C 的 bounded-parallel-dispatch reference）
- 任一 reviewer block → coordinator 不得继续；两 reviewer 通过才能进下一个 phase
- 验证证据由 spec A 的 `TaskCompleted` hook 校验，不重复实现
- 新增 `CHANGELOG.md` 条目（按 Added/Changed/Fixed 分类）

## Size

M (8-20 tasks)

## Dependencies

- **A** (spec-verification-iron-law): consume A's verification token as review-passing 凭证
- **C** (spec-bounded-parallel-dispatch) — **hard dep**: B's phase-boundary parallel reviewer dispatch must read C's reference + anti-pattern list, must not inline-duplicate

## Interface Contract

| Surface | Detail |
|---|---|
| New agent | `plugins/curdx-flow/agents/code-quality-reviewer.md` |
| Modified agent | `plugins/curdx-flow/agents/spec-reviewer.md` (description + prompt narrowed) |
| New reference | `plugins/curdx-flow/references/two-stage-review.md` (boundary, responsibility split, anti-rationalization rules) |
| Coordinator integration | At each phase exit, Team API parallel-dispatches both reviewers (independent context); coordinator collects two verdicts |
| Schema | **No change** — review results write through existing spec-reviewer protocol |

## Owner Files

- `plugins/curdx-flow/agents/code-quality-reviewer.md` (new)
- `plugins/curdx-flow/agents/spec-reviewer.md` (edit)
- `plugins/curdx-flow/references/two-stage-review.md` (new)
- `plugins/curdx-flow/commands/*.md` — phase-boundary reviewer-call sections (edit; enumerate exact files in design phase)

## Open Design-Phase Question

> 现有 `agents/spec-reviewer.md` 的 rubrics（Patterns / Principles / Holistic Awareness / Quality Gates）横跨 spec-compliance vs code-quality 两个域。spec-reviewer 收窄边界**必须在 design.md 中定稿**，不能在 triage 默认成立。

## Validation Hint

- Fixture spec: 写一个 spec-compliant 但有 SQL injection 的实现 → 确认 spec-reviewer 通过、code-quality-reviewer block
- Fixture spec: 双 reviewer 都通过 → 确认 coordinator 进入下一 phase
- Quick mode bypass: 确认 `quickMode: true` 下 code-quality reviewer 降级为 advisory（warning，不 block）

## Notes from Triage

- Validation pass spotted: existing spec-reviewer rubrics straddle compliance/quality boundary — design phase must settle the split
- Validation pass spotted: `commands/*.md` enumeration must be done in design (not triage)
- Risk R4 (phase exit blocking in quick mode): mitigation = quickMode bypass already wired

## Related Research

- `specs/_epics/superpowers-uplift/research.md` §External Research, §Codebase Analysis
- Anthropic Code Review architecture (parallel reviewers + verification step)
- codex CLI synthesis: "在 phase 边界做，不要每个 task review"
