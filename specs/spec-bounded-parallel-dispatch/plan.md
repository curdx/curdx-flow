---
spec: spec-bounded-parallel-dispatch
epic: superpowers-uplift
phase: triage
created: 2026-05-06
---

# Plan: spec-bounded-parallel-dispatch

> Epic: [`specs/_epics/superpowers-uplift/epic.md`](../_epics/superpowers-uplift/epic.md)
> Doc-only spec — no skill bloat, no hook surface change.

## Goal

把"按独立域扇出 + coordinator 单真相源"从 research 场景泛化到 review / debug 场景，formalize anti-pattern，避免 Anthropic best-practices 的 "predilection for subagents" 警告。

## Acceptance Criteria

- `references/parallel-research.md` 重命名为 `references/bounded-parallel-dispatch.md`，新增 review / debug 域规则
- 显性化 anti-patterns：依赖型任务并行化、context 互相干扰、coordinator 不再做 reconciliation、subagent 反而比 grep 慢
- 新增"扇出前自检清单"：3 项独立性检查（独立输入 / 独立输出 / 独立上下文）
- **不**新增 skill（避免 skill bloat 触顶）；通过 commands / agents 显性 read 这份 reference 来生效
- 与 spec B 的双审查并行调用契约对齐
- 新增 `CHANGELOG.md` 条目（按 Added/Changed/Fixed 分类）

## Size

S (≤8 tasks)

## Dependencies

- **none** — can start in parallel with A
- **Required-by**: spec B (hard dep) — must merge before B enters implementation

## Interface Contract

| Surface | Detail |
|---|---|
| Reference rename | `references/parallel-research.md` → `references/bounded-parallel-dispatch.md` (旧文件保留 stub 重定向防破坏) |
| Doc-level contract | All `commands/*.md` parallel-dispatch passages link to this reference |
| Hooks / agents / state / schema | **No change** |

## Owner Files

- `plugins/curdx-flow/references/bounded-parallel-dispatch.md` (new + rename old to stub)
- `plugins/curdx-flow/commands/*.md` (minimal link updates only)

## Validation Hint

- Text check: all reviewer / research dispatch passages reference the new doc
- Search: anti-pattern list is actually cited by `commands/*.md`
- Confirm: no new SKILL.md added (skill count unchanged)

## Notes from Triage

- Validation pass: ~70% of new content is genuinely new (review domain rules + anti-pattern catalog), ~30% is rename + cross-link
- Validation pass: not duplicating existing `parallel-research.md` (formalizes new domains)
- Risk R1 (skill bloat): C is doc-only by design — no skill added

## Related Research

- `specs/_epics/superpowers-uplift/research.md` §External Research "don't lead with multi-agent"
- codex CLI synthesis: "受控并行（按独立域扇出）"
- Anthropic best practices §Subagent overuse warning
