# Story 5.3: Fix Attempt Lineage and Risk-Aware Execution

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为允许 curdx-flow 进入 fix mode 的开发者，
我希望每次修复尝试都能追踪来源、变更范围、风险等级、执行结果和关联失败证据，
以便自动修复过程可审计、可回溯，并且不会越权修改无关文件。

## Acceptance Criteria

1. **Append-only fix attempt lineage：** 给定 recovery planner 生成了候选修复动作，当 fix mode 执行修复，必须记录 attemptId、parentFailureEvidenceIds、目标文件范围、变更意图、风险等级、执行动作、结果、生成 evidence 和下一步重跑路径；该 attempt 必须追加到 lineage/ledger，不得覆盖旧尝试。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.3`; `_bmad-output/planning-artifacts/prd.md#FR29`; `_bmad-output/planning-artifacts/prd.md#FR31`; `_bmad-output/planning-artifacts/prd.md#FR63`]
2. **Policy-gated execution：** 给定修复动作会修改源码、配置、依赖或验证文件，当执行前检查 policy，系统必须确认当前模式允许该动作；高风险动作必须要求明确授权，否则输出 blocker。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-MODE-001 Report-Only and Fix Mode`; `src/runtime/policy/action-risk-policy.ts`; `tests/runtime/policy/action-risk-policy.test.ts`]
3. **Dirty worktree protection：** 给定工作区有用户既有改动，当 fix attempt 准备写文件，系统必须对比 dirty baseline；不得覆盖、回滚或格式化与本次失败无关的用户改动。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-DIRTY-001 Dirty Worktree Safety`; `_bmad-output/planning-artifacts/prd.md#FR62`; `_bmad-output/planning-artifacts/prd.md#FR65`]
4. **Audit report quality：** 给定 fix attempt 修改了文件，当报告生成，必须列出修改文件、变更意图、风险等级、验证命令和 evidenceRefs；不得只说“已修复”。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.3`; `_bmad-output/planning-artifacts/prd.md#FR48`; `_bmad-output/planning-artifacts/prd.md#FR51`; `_bmad-output/planning-artifacts/prd.md#FR63`]
5. **Partial/failed attempt semantics：** 给定 fix attempt 失败或只部分执行，当 runtime 更新状态，必须记录失败原因、已执行动作、未执行动作和下一步；不得进入成功 verdict，除非同路径重跑通过。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.3`; `_bmad-output/planning-artifacts/architecture.md#IP-RETRY-001 Same-Path Retry`; `_bmad-output/planning-artifacts/prd.md#FR30`; `_bmad-output/planning-artifacts/prd.md#FR32`]
6. **验证覆盖：** 给定 Story 5.3 完成，当执行验证，最小验证命令必须包含 `npm run typecheck`、fix attempt lineage tests、mode/risk policy tests；测试必须覆盖允许修复、未授权高风险动作、dirty worktree 保护、部分修复失败、attempt append-only、报告变更摘要。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.3`]

## Tasks / Subtasks

- [x] 定义 fix attempt lineage contract（AC: 1-6）
  - [x] 在 `src/runtime/recovery/types.ts` 增加 fix attempt 输入、记录、结果、报告、lineage 类型。
  - [x] 新增 `src/runtime/recovery/fix-attempt-lineage.ts`，导出 `planFixAttempt()` / `appendFixAttemptLineage()` 或等价纯函数。
  - [x] 输入必须消费 5.2 `RecoveryPlan` / `RecoveryCandidateAction`、mode、policy、dirty baseline、目标文件、验证命令和执行结果。
  - [x] 输出必须包含 attemptId、parentFailureEvidenceIds、targetFiles、intent、riskLevel、policyDecision、executedActions、skippedActions、result、generatedEvidenceRefs、retryPath、report 和 nextAction。
  - [x] 本 story 不直接编辑源码、不运行真实修复命令、不调用真实外部 MCP；只做风险评估、lineage 记录和报告 contract。

- [x] 实现 policy-gated execution planning（AC: 2）
  - [x] 复用 `evaluateActionPolicy()` / `buildDefaultActionRiskPolicy()`，不得复制 action-risk 规则。
  - [x] report-only 禁止 source/config/dependency/generated verification file mutation。
  - [x] high/critical/destructive/release/global config/production-data 动作在未授权时必须返回 blocker，并记录 policy evidence/action log。
  - [x] allowed medium/low fix-mode action 必须记录 action log，并标记 `requiresSamePathRetry: true`。

- [x] 实现 dirty baseline 写入保护（AC: 3）
  - [x] 从 `DirtyWorktreeBaseline.files` 对比 `targetFiles`。
  - [x] 对已存在用户改动且不属于本 attempt 允许范围的文件返回 blocker。
  - [x] blocker 必须包含 dirty file path、status、owner、nextAction、evidenceRefs；不得把冲突文件标为已修改成功。
  - [x] 不做格式化、不回滚、不清理用户改动。

- [x] 实现 append-only lineage 和 audit report（AC: 1,4）
  - [x] `appendFixAttemptLineage(existing, attempt)` 必须返回追加后的新数组，保留原 attempt 顺序和对象内容。
  - [x] report 必须列出 modifiedFiles/targetFiles、intent、riskLevel、validationCommands、evidenceRefs、policy decision、same-path retry requirement。
  - [x] summary 不得只有“fixed/已修复”等空泛文案；缺字段时必须 degraded/blocked。
  - [x] 生成的 evidenceRefs 必须关联 parent failure evidence 和 fix attempt id。

- [x] 实现 partial/failed attempt 状态（AC: 5）
  - [x] 部分执行必须记录 executedActions、skippedActions、failureReason、nextAction。
  - [x] 失败或部分执行不得输出 successful verdict；只能要求同路径 retry 或重新诊断。
  - [x] retryPath 必须沿用 5.2 `RecoveryPlan.retryPath`，供 5.4 same-path retry 使用。

- [x] 增加 fix attempt lineage tests（AC: 6）
  - [x] 新增 `tests/runtime/recovery/fix-attempt-lineage.test.ts`。
  - [x] 测试覆盖 allowed fix-mode source edit lineage、unauthorized high-risk blocker、report-only mutation blocker、dirty baseline blocker、partial failure、append-only lineage、audit report summary。
  - [x] 继续使用 `npm run test:recovery`，并保持 `npm run verify` 覆盖。

- [x] 验证和记录（AC: 6）
  - [x] 运行 `npm run test:recovery`。
  - [x] 运行 `npm run test:policy`。
  - [x] 运行 `npm run typecheck`。
  - [x] 运行 `npm run verify`。
  - [x] 将验证命令和结果写入本 story 的 Dev Agent Record。

## Dev Notes

### 当前发现

- 5.2 已提供 `planRecovery()`、`RecoveryPlan`、`RecoveryCandidateAction`、`RecoveryRetryPath`、`RecoveryRiskLevel` 等类型。5.3 应直接消费这些 plan/action，不要重做 root-cause planning。
- 5.3 的核心是“attempt lineage + risk-aware execution boundary”，不是实际修复引擎。运行真实编辑/命令应由外层 agent 或后续 executor 承担；runtime 在本 story 中负责判断能不能执行、如何记录、如何报告。
- `src/runtime/policy/action-risk-policy.ts` 已实现 mode/risk/authorization/actionLog/same-path retry 规则。必须复用，不要复制规则或硬编码第二套策略。
- `src/runtime/state/types.ts` 已有 `DirtyWorktreeBaseline`、`DirtyFileRecord`、`GeneratedFileRecord`，可作为 dirty baseline 和 generated files 的类型来源。
- `src/runtime/evidence/ledger.ts` 已有 append-only JSONL evidence writer。本 story 不要求落盘新 schema；如果实现选择落盘，必须同步 schema/tests。更稳妥做法是先实现 TypeScript contract + append-only in-memory lineage helper。

### Previous Story Intelligence

- 5.1 建立 failure taxonomy 和敏感字段脱敏；5.3 的 command/diff/report summary 也必须复用 policy/evidence redaction，不得输出 token、cookie、api_key、secret、password。
- 5.2 review 修复了 report-only plan 状态语义：只有当前 mode 允许的 candidate action 才可使 plan 为 `planned`。5.3 必须延续这个规则，不能在 report-only 中把 mutation 伪装成 executed attempt。
- 5.2 `retryPath.samePathRequired` 始终为 true。5.3 只能把 retryPath 传递给 5.4，不能把“修过代码”当成成功 verdict。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | fix mode 自动修复必须可审计、可回滚思考、可追踪 evidence，不得越权覆盖用户改动。 |
| Runtime Directories | `src/runtime/recovery/**`，复用 `src/runtime/policy/**` 和 `src/runtime/state/types.ts`。 |
| Plugin Surface | 不新增 slash command、skill、agent、hook、manifest dependency。 |
| Schema | 默认不新增 persisted schema；使用 TypeScript contract。若新增落盘 contract，必须补 schema 和 `tests/contracts/**`。 |
| Contract Test | Runtime typed contract + `tests/runtime/recovery/**`。 |
| Runtime Test | `tests/runtime/recovery/fix-attempt-lineage.test.ts`。 |
| Fixture | 可复用 `tests/fixtures/broken-app/`、5.1 failure records、5.2 recovery plan test helper。 |
| Evidence Output | Attempt 记录引用 parent failure evidenceRefs 和 generatedEvidenceRefs；不直接写 verdict。 |
| Report Surface | attempt id、target/modified files、intent、riskLevel、policy decision、validation commands、evidenceRefs、retry path、next action。 |
| Failure Mode | report-only mutation、高风险未授权、dirty baseline 冲突、partial failure、append-only overwrite risk。 |
| Verification Commands | `npm run test:recovery`, `npm run test:policy`, `npm run typecheck`, `npm run verify`。 |

### Architecture Guardrails

- Recovery 模块可以拥有 attempts/lineage/blocker normalization，但不得直接编辑源码、直接发布或跳过 policy。
- mode gate 是硬边界：report-only 不得修改源码；fix mode 可以计划 workspace mutation，但必须记录 action log、risk、diff summary、verification commands。
- dirty worktree 保护必须 conservative：target file 与 user-existing dirty baseline 冲突时 block，除非输入显式声明该文件属于本 attempt 允许范围并有 evidence。
- partial/failed attempt 不能进入成功 verdict；success 只能由 Story 5.4 same-path retry/verdict 更新完成。
- append-only lineage 不得覆盖旧 attempt；实现应复制数组并追加，避免原地 mutate existing records。
- report 文案必须可审计，不得空泛宣称“已修复”；每个结论都要带 evidenceRefs 或 blocker。

### Files To Read Before Editing

**UPDATE candidates:**

- `src/runtime/recovery/types.ts`
- `src/runtime/recovery/index.ts`

**NEW expected:**

- `src/runtime/recovery/fix-attempt-lineage.ts`
- `tests/runtime/recovery/fix-attempt-lineage.test.ts`

**Read-only context:**

- `src/runtime/recovery/recovery-planner.ts`
- `tests/runtime/recovery/recovery-planner.test.ts`
- `src/runtime/policy/action-risk-policy.ts`
- `src/runtime/policy/types.ts`
- `tests/runtime/policy/action-risk-policy.test.ts`
- `src/runtime/state/types.ts`
- `src/runtime/evidence/ledger.ts`
- `_bmad-output/implementation-artifacts/5-2-root-cause-recovery-plan.md`

### Latest Claude Code Context

- Official Claude Code docs were checked from `https://code.claude.com/docs/llms.txt` during this sprint continuation. 5.3 does not add plugin manifest, hook, skill, agent, dependency, marketplace, or release-tag surface, so no Claude Code plugin metadata changes are expected.
- If implementation unexpectedly touches plugin hooks/manifest/skills, re-check official docs and run the plugin-specific gates from project context (`claude plugin validate ./plugins/curdx-flow`, `npm run test:claudecc`) before marking done.

## References

- `_bmad-output/planning-artifacts/epics.md#Story 5.3`
- `_bmad-output/planning-artifacts/prd.md#FR29`
- `_bmad-output/planning-artifacts/prd.md#FR31`
- `_bmad-output/planning-artifacts/prd.md#FR62`
- `_bmad-output/planning-artifacts/prd.md#FR63`
- `_bmad-output/planning-artifacts/prd.md#FR65`
- `_bmad-output/planning-artifacts/prd.md#FR66`
- `_bmad-output/planning-artifacts/architecture.md#IP-MODE-001 Report-Only and Fix Mode`
- `_bmad-output/planning-artifacts/architecture.md#IP-RETRY-001 Same-Path Retry`
- `_bmad-output/planning-artifacts/architecture.md#IP-DIRTY-001 Dirty Worktree Safety`
- `_bmad-output/implementation-artifacts/5-2-root-cause-recovery-plan.md`

## Dev Agent Record

### Agent Model Used

GPT-5

### Debug Log References

- `npx vitest run tests/runtime/recovery/fix-attempt-lineage.test.ts`：通过，6 tests。
- `npm run test:recovery`：通过，24 tests。
- `npm run test:policy`：通过，11 tests。
- `npm run typecheck`：首次暴露一个 TypeScript 数组窄化问题，已修复；复跑通过。
- `npm run verify`：通过。
- Code review：发现 policy blocker `nextAction` 被字符串化为 `[object Object]`，以及 dirty blocker 下 attempt action log 可误记为 `success`；补红测后修复，复跑验证均通过。

### Completion Notes List

- 新增 `planFixAttempt()`，消费 5.2 `RecoveryPlan` 和 candidate action，生成 fix attempt lineage、policy decision、blockers、attempt report 和 next action。
- 新增 `appendFixAttemptLineage()`，以不可变追加方式保留历史 attempt 顺序和内容。
- 复用 action-risk policy，不复制规则；report-only mutation、高风险未授权、dirty baseline 冲突都会阻断执行并记录 blocker。
- partial/failed attempt 保留 executed/skipped/failureReason，并始终要求 same-path retry；attempt report 不允许直接成为成功 verdict。
- Review 修复：attempt action log 现在按 attempt 最终状态记录 blocked/skipped/failed/success，policy blocker nextAction 正确提取 summary。

### File List

- `src/runtime/recovery/types.ts`
- `src/runtime/recovery/fix-attempt-lineage.ts`
- `src/runtime/recovery/index.ts`
- `tests/runtime/recovery/fix-attempt-lineage.test.ts`
- `_bmad-output/implementation-artifacts/5-3-fix-attempt-lineage-risk-aware-execution.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Started dev-story implementation.
- 2026-05-17: Implemented fix attempt lineage, risk-aware policy gating, dirty baseline protection, audit report tests, and review fixes; marked story done.

## Senior Developer Review (AI)

### Review Date

2026-05-17

### Review Outcome

Approve

### Findings

- Fixed [Med]: policy blocker `nextAction` was converted with `String(object)`, producing `[object Object]` in user-facing next action. Replaced it with structured summary extraction and regression coverage.
- Fixed [Med]: dirty-worktree blockers could leave an attempt action log with `result: success` because policy allowed the action before dirty baseline blocking. Added attempt-level action log synthesis so dirty/policy/lineage blockers record `blocked`.

### Action Items

- [x] [Med] Preserve policy blocker nextAction summaries instead of stringifying objects.
- [x] [Med] Make attempt action logs reflect final attempt status, not only policy status.

### Verification

- `npx vitest run tests/runtime/recovery/fix-attempt-lineage.test.ts`：通过，6 tests。
- `npm run test:recovery`：通过，24 tests。
- `npm run test:policy`：通过，11 tests。
- `npm run typecheck`：通过。
- `npm run verify`：通过。
