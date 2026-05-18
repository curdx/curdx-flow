# Story 5.5: Retry Caps, Blocker Reports and Recovery Fixtures

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为希望自动恢复但不希望系统无限修复的用户，
我希望 curdx-flow 在超过修复上限或无法安全恢复时停止反复修改，并输出可执行 blocker report，
以便我能清楚知道已尝试什么、为什么停下、下一步谁负责。

## Acceptance Criteria

1. **Retry/fix cap blocker report：** 给定 recovery flow 已达到配置的 fix attempt 或 retry 上限，当失败仍未解决，系统必须停止继续自动修改；输出 blocker report，包含失败原因、复现路径、已尝试动作、before/after evidence、剩余风险、nextAction、owner 和 riskLevel。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.5`; `_bmad-output/planning-artifacts/prd.md#FR18`; `_bmad-output/planning-artifacts/prd.md#FR32`; `_bmad-output/planning-artifacts/prd.md#NFR22`]
2. **Non-auto-fix categories：** 给定 failure category 属于权限、外部服务、缺密钥、生产数据、全局配置或 destructive 操作，当 recovery flow 判断无法安全自动修复，必须直接输出 blocker 或 manual-confirmation-required；不得通过降低验证标准获得成功 verdict。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.5`; `_bmad-output/planning-artifacts/prd.md#FR37`; `_bmad-output/planning-artifacts/prd.md#FR40`; `_bmad-output/planning-artifacts/prd.md#FR66`]
3. **Actionable next plan：** 给定 blocker report 被用户或后续 agent 消费，当生成下一步修复计划，blocker 必须足够具体，可转化为后续 story、ticket 或人工操作；不得只有“请检查日志”这种不可执行建议。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.5`; `_bmad-output/planning-artifacts/prd.md#FR74`; `_bmad-output/planning-artifacts/prd.md#FR52`]
4. **Recovery fixtures：** 给定 recovery fixtures 运行，当测试成功恢复、重复失败、权限阻塞、外部服务阻塞、路径改变降级、修复上限超限，每个 fixture 必须产生预期 recovery state、evidence chain 和 final verdict；tests 必须证明 false completion 不会在恢复失败时出现。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.5`; `_bmad-output/planning-artifacts/prd.md#NFR1`; `_bmad-output/planning-artifacts/prd.md#NFR29`]
5. **Default recovery policy：** 给定 retry cap 或 recovery policy 被配置，当 runtime planner 读取配置，配置必须有合理默认值；用户不能通过配置关闭 no false completion。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.5`; `_bmad-output/planning-artifacts/prd.md#FR40`; `_bmad-output/planning-artifacts/prd.md#FR32`]
6. **验证覆盖：** 给定 Story 5.5 完成，当执行验证，最小验证命令必须包含 `npm run typecheck`、recovery fixture tests、blocker report tests；测试必须覆盖 retry cap、manual-confirmation-required、external blocker、permission blocker、blocker-to-next-plan、false completion prevention。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.5`]

## Tasks / Subtasks

- [x] 定义 recovery policy 和 blocker report contract（AC: 1-6）
  - [x] 在 `src/runtime/recovery/types.ts` 增加 recovery policy、cap state、blocker report、next plan、recovery final verdict 类型。
  - [x] 新增 `src/runtime/recovery/blocker-report.ts`，导出 `buildDefaultRecoveryPolicy()`、`buildRecoveryBlockerReport()` 或等价函数。
  - [x] 输入必须消费 5.1 failure taxonomy、5.2 recovery plan、5.3 fix attempts、5.4 retry result。
  - [x] 输出必须包含 failureReason、reproductionPath、attemptedActions、evidenceChain、remainingRisk、owner、riskLevel、nextAction、nextPlan 和 finalVerdict。

- [x] 实现 retry/fix cap 和不可自动修复类别（AC: 1,2,5）
  - [x] 默认 policy 必须包含合理 `maxFixAttempts`、`maxRetries`，且 `noFalseCompletion: true` 不可关闭。
  - [x] 达到 cap 时停止自动修改并输出 blocker。
  - [x] permission、externalService、environment/missing secret、production-data、global config、destructive action 必须直接 blocker/manual-confirmation-required。
  - [x] 不得为了通过而降低 evidence requirements 或 verdict 标准。

- [x] 实现 actionable blocker-to-next-plan（AC: 3）
  - [x] nextPlan 必须包含 owner、summary、steps、requiredEvidenceRefs、blockedBy、riskLevel。
  - [x] nextAction 不得是空泛“check logs”；必须指向具体人工动作、授权、环境恢复、外部服务等待或新 recovery plan。
  - [x] report summary 必须可审查并脱敏。

- [x] 增加 recovery fixtures（AC: 4,6）
  - [x] 新增 `tests/fixtures/recovery-scenarios/recovery-fixtures.json` 或等价 fixture。
  - [x] fixture 覆盖 successful recovery、repeat failure、permission blocker、external blocker、path changed degraded、fix cap reached。
  - [x] 每个 fixture 要有 expected final verdict、owner、riskLevel、evidence chain。

- [x] 增加 blocker report tests（AC: 6）
  - [x] 新增 `tests/runtime/recovery/blocker-report.test.ts`。
  - [x] 测试覆盖 retry cap、manual-confirmation-required、external blocker、permission blocker、blocker-to-next-plan、false completion prevention。
  - [x] 继续使用 `npm run test:recovery`，并保持 `npm run verify` 覆盖。

- [x] 验证和记录（AC: 6）
  - [x] 运行 `npm run test:recovery`。
  - [x] 运行 `npm run typecheck`。
  - [x] 运行 `npm run verify`。
  - [x] 将验证命令和结果写入本 story 的 Dev Agent Record。

## Dev Notes

### 当前发现

- 5.1 提供 `FailureEvidenceCaptureResult` 和 root taxonomy，可判断 permission/externalService/environment/unknown 等 blocker 类别。
- 5.2 `RecoveryPlan` 已包含 ownership、candidateActions、degradedCapabilities、retryPath、stopConditions。
- 5.3 `FixAttemptRecord` 提供 attempted actions、risk、result、actionLog、generatedEvidenceRefs。
- 5.4 `SamePathRetryResult` 提供 samePath、evidenceChain、failureClassification、verdictTransition、blockers。
- `src/runtime/verdict/evaluator.ts` 已保证 noFalseCompletion；5.5 的 final report 不得绕开它。

### Previous Story Intelligence

- 5.2/5.3/5.4 review 均发现了“状态语义看似通过但审计链会误导用户”的问题。5.5 要优先让 report 阻止误导：cap 到达、外部/权限/路径降级时必须明确 blocker，而不是乐观继续。
- 5.4 已在 path-changed 时规范化 retry evidence 为 degraded；5.5 fixtures 必须验证这类 degraded evidence 不会形成 successful final verdict。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 系统不能无限修，也不能把不能自动修的问题伪装成成功。 |
| Runtime Directories | `src/runtime/recovery/**`，复用 `src/runtime/verdict/**`。 |
| Plugin Surface | 不新增 slash command、skill、agent、hook、manifest dependency。 |
| Schema | 默认不新增 persisted schema；使用 TypeScript contract + fixture JSON。 |
| Contract Test | Runtime typed contract + `tests/runtime/recovery/**`。 |
| Runtime Test | `tests/runtime/recovery/blocker-report.test.ts`。 |
| Fixture | `tests/fixtures/recovery-scenarios/`。 |
| Report Surface | failureReason、reproductionPath、attemptedActions、evidenceChain、remainingRisk、owner、riskLevel、nextAction、nextPlan、finalVerdict。 |
| Failure Mode | retry cap、fix cap、manual confirmation、external blocker、permission blocker、path changed degraded、false completion prevention。 |
| Verification Commands | `npm run test:recovery`, `npm run typecheck`, `npm run verify`。 |

### Architecture Guardrails

- noFalseCompletion 不可关闭；配置输入试图关闭时必须恢复或阻断。
- blocker report 是成功 verdict 的替代，不是软警告。
- report 必须能转化成后续人工 action 或新 recovery plan。
- 不执行真实修复/重试；只汇总 state、evidence chain、policy 和 next plan。
- 不新增 plugin 表面；只补 runtime recovery contract 和 tests。

### Files To Read Before Editing

**UPDATE candidates:**

- `src/runtime/recovery/types.ts`
- `src/runtime/recovery/index.ts`

**NEW expected:**

- `src/runtime/recovery/blocker-report.ts`
- `tests/runtime/recovery/blocker-report.test.ts`
- `tests/fixtures/recovery-scenarios/recovery-fixtures.json`

**Read-only context:**

- `src/runtime/recovery/failure-taxonomy.ts`
- `src/runtime/recovery/recovery-planner.ts`
- `src/runtime/recovery/fix-attempt-lineage.ts`
- `src/runtime/recovery/same-path-retry.ts`
- `src/runtime/verdict/evaluator.ts`
- `tests/runtime/recovery/*.test.ts`

### Latest Claude Code Context

- Official Claude Code docs were checked from `https://code.claude.com/docs/llms.txt` during this sprint continuation. 5.5 stays inside runtime recovery contracts and does not require plugin manifest/hook/skill/agent metadata changes.

## References

- `_bmad-output/planning-artifacts/epics.md#Story 5.5`
- `_bmad-output/planning-artifacts/prd.md#FR18`
- `_bmad-output/planning-artifacts/prd.md#FR32`
- `_bmad-output/planning-artifacts/prd.md#FR40`
- `_bmad-output/planning-artifacts/prd.md#FR52`
- `_bmad-output/planning-artifacts/prd.md#FR74`
- `_bmad-output/planning-artifacts/prd.md#NFR1`
- `_bmad-output/planning-artifacts/prd.md#NFR22`
- `_bmad-output/implementation-artifacts/5-4-same-path-retry-before-after-verdict.md`

## Dev Agent Record

### Agent Model Used

GPT-5

### Debug Log References

- `npx vitest run tests/runtime/recovery/blocker-report.test.ts`：通过，6 tests。
- `npm run test:recovery`：通过，35 tests。
- `npm run typecheck`：通过。
- `npm run verify`：通过。
- Code review：发现 high-risk/destructive/global/production-data attempt 仍可能继续自动恢复；补红测后修复，复跑验证均通过。

### Completion Notes List

- 新增 recovery policy 和 blocker report contract，覆盖 fix/retry cap、manual confirmation、external blocker、permission blocker、actionable next plan 和 final verdict。
- 默认 policy 固定 `noFalseCompletion: true`，即使配置输入尝试关闭也会恢复为强制开启。
- blocker report 汇总 failureReason、reproductionPath、attemptedActions、evidenceChain、remainingRisk、owner、riskLevel、nextAction、nextPlan 和 finalVerdict。
- 新增 recovery fixtures 覆盖 successful recovery、repeat failure cap、permission blocker、external service blocker 和 path changed degraded。
- Review 修复：高风险、destructive、global config、production-data attempt 会直接阻断自动恢复，交由用户确认。

### File List

- `src/runtime/recovery/types.ts`
- `src/runtime/recovery/blocker-report.ts`
- `src/runtime/recovery/index.ts`
- `tests/runtime/recovery/blocker-report.test.ts`
- `tests/fixtures/recovery-scenarios/recovery-fixtures.json`
- `_bmad-output/implementation-artifacts/5-5-retry-caps-blocker-reports-recovery-fixtures.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Started dev-story implementation.
- 2026-05-17: Implemented retry cap blocker reports, recovery policy, actionable next plans, recovery fixtures, and review fixes; marked story done.

## Senior Developer Review (AI)

### Review Date

2026-05-17

### Review Outcome

Approve

### Findings

- Fixed [High]: high-risk/destructive/global/production-data recovery attempts could otherwise continue through automatic recovery. Added explicit blocker handling so unsafe attempts produce user-owned blocker/manual confirmation instead of more automated modification.

### Action Items

- [x] [High] Block destructive, global config, production-data, and critical-risk attempts from automatic recovery.

### Verification

- `npx vitest run tests/runtime/recovery/blocker-report.test.ts`：通过，6 tests。
- `npm run test:recovery`：通过，35 tests。
- `npm run typecheck`：通过。
- `npm run verify`：通过。
