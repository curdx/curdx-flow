# Story 5.4: Same-Path Retry and Before/After Verdict

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为等待失败修复结果的用户，
我希望 curdx-flow 在修复后重跑同一条失败路径，并把修复前、修复后和重跑结果关联起来，
以便成功结论来自真实验证，而不是“代码改了所以应该好了”。

## Acceptance Criteria

1. **Same-path retry planning：** 给定 fix attempt 已完成，当 retry planner 准备验证修复结果，必须使用原失败路径的同一入口、同一用户动作、同一 API/命令或等价可证明路径；如果路径被改变，evidence 必须标记 degraded，verdict 不得为 complete。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.4`; `_bmad-output/planning-artifacts/architecture.md#IP-RETRY-001 Same-Path Retry`; `_bmad-output/planning-artifacts/prd.md#FR30`]
2. **Before/fix/retry evidence chain：** 给定同路径重跑执行，当 retry 产生新 evidence，新 evidence 必须关联 before failure evidence、fix attempt 和 retry attemptId；报告必须展示 before/after/retry 链路。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.4`; `_bmad-output/planning-artifacts/prd.md#FR31`; `_bmad-output/implementation-artifacts/5-3-fix-attempt-lineage-risk-aware-execution.md`]
3. **Verdict transition only after retry：** 给定重跑通过所有原失败断言和必要 evidence requirements，当 verdict evaluator 重新计算，verdict 可以从 blocked/failed 变为 complete 或 partial；必须说明哪些 evidence 支撑该变化。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.4`; `src/runtime/verdict/evaluator.ts`; `tests/runtime/verdict/verdict-evaluator.test.ts`]
4. **Failed retry classification：** 给定重跑仍然失败，当 recovery state 更新，系统必须记录失败是否同因、变因或新失败；根据 retry cap 决定继续诊断、生成新修复计划或输出 blocker。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.4`; `_bmad-output/planning-artifacts/prd.md#FR32`; `_bmad-output/implementation-artifacts/5-1-failure-evidence-capture-taxonomy.md`]
5. **Path changed degradation：** 给定修复后只跑了不同命令、不同页面、mock 路径或跳过失败步骤，当 report 生成，报告必须标记为 degraded 或 manual-confirmation-required；不得把该结果包装成 same-path success。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.4`; `_bmad-output/planning-artifacts/architecture.md#IP-RETRY-001 Same-Path Retry`]
6. **验证覆盖：** 给定 Story 5.4 完成，当执行验证，最小验证命令必须包含 `npm run typecheck`、same-path retry tests、verdict transition tests；测试必须覆盖同路径成功、同路径失败、路径改变降级、before/after evidence 链接、新失败分类、verdict 转换。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.4`]

## Tasks / Subtasks

- [x] 定义 same-path retry contract（AC: 1-6）
  - [x] 在 `src/runtime/recovery/types.ts` 增加 retry 输入、路径比较、retry evidence link、retry report、verdict transition 类型。
  - [x] 新增 `src/runtime/recovery/same-path-retry.ts`，导出 `planSamePathRetry()` 或等价纯函数。
  - [x] 输入必须消费 5.2 `RecoveryPlan.retryPath`、5.3 `FixAttemptRecord`、retry observation/evidence、verdict requirements/state。
  - [x] 输出必须包含 retryAttemptId、samePath、pathComparison、beforeEvidenceRefs、fixAttemptId、retryEvidenceRefs、classification、verdictTransition、report、nextAction。
  - [x] 本 story 不直接执行命令、浏览器、API 或外部 MCP；只评估 retry 是否同路径、链接 evidence 并驱动 verdict evaluator。

- [x] 实现 same-path comparison 和 degradation（AC: 1,5）
  - [x] 比较 command、actionId、method、url、target、reproductionSteps，允许等价字段完全一致或由输入显式证明 equivalent。
  - [x] 不同命令、页面、API、target、mock 路径或跳过步骤必须标记 `samePath: false`。
  - [x] path changed 时 retry evidence/report 必须 degraded，verdictTransition 不得为 `complete`。
  - [x] report 必须说明 path mismatch 字段和 nextAction。

- [x] 实现 before/fix/retry evidence chain（AC: 2）
  - [x] retry evidence refs 必须关联 original failure evidence refs、fix attempt id、retry attempt id。
  - [x] report 必须展示 beforeEvidenceRefs、fixAttemptId、fixGeneratedEvidenceRefs、retryEvidenceRefs。
  - [x] retry 结果不得覆盖 before/fix 记录。

- [x] 实现 verdict transition（AC: 3）
  - [x] 对 same-path passed retry，调用/复用 `evaluateCompletionVerdict()` 计算 completion/partial verdict。
  - [x] verdictTransition 必须包含 from、to、supportingEvidenceRefs、why。
  - [x] 即使 fix attempt result 是 success，也必须等待 retry evidence 才能 complete。

- [x] 实现 failed/new-failure retry 分类（AC: 4）
  - [x] failed same-path retry 必须分类为 `same-cause`、`changed-cause` 或 `new-failure`。
  - [x] 可复用 5.1 taxonomy 来比较 failure category/id/signals。
  - [x] retry cap 逻辑只做输入驱动判断；达到上限时输出 blocker/nextAction，不继续修。

- [x] 增加 same-path retry tests（AC: 6）
  - [x] 新增 `tests/runtime/recovery/same-path-retry.test.ts`。
  - [x] 测试覆盖 same-path success verdict transition、same-path failed retry、新 failure 分类、path changed degraded、before/fix/retry evidence chain、retry cap blocker。
  - [x] 继续使用 `npm run test:recovery`，并保持 `npm run verify` 覆盖。

- [x] 验证和记录（AC: 6）
  - [x] 运行 `npm run test:recovery`。
  - [x] 运行 `npm run test:verdict`。
  - [x] 运行 `npm run typecheck`。
  - [x] 运行 `npm run verify`。
  - [x] 将验证命令和结果写入本 story 的 Dev Agent Record。

## Dev Notes

### 当前发现

- 5.2 `RecoveryPlan.retryPath` 已保留 command/actionId/API/data journey 字段，并固定 `samePathRequired: true`。
- 5.3 `FixAttemptRecord` 已包含 parent failure evidence、generated evidence、retryPath、validationCommands、result、actionLog 和 report；5.4 应直接消费，不要重做 fix attempt lineage。
- `src/runtime/verdict/evaluator.ts` 已能基于 evidence requirements 计算 complete/partial/blocked/manual-confirmation-required。5.4 应把 retry evidence 转成 evaluator 输入，而不是另写一套 verdict 判定。
- 5.1 taxonomy 可复用来判断 retry failure 是同因、变因还是新失败。

### Previous Story Intelligence

- 5.3 明确 attempt report 的 `verdictEligible` 始终为 false；5.4 是第一个允许 retry evidence 推动 verdict transition 的 story。
- 5.3 review 修复了 blocker nextAction 和 actionLog 状态。5.4 report/nextAction 必须继续保持结构化，不得字符串化对象。
- 5.2 report-only/status 语义要求当前 mode/action 匹配；5.4 path-changed 或 degraded retry 不能被包装为 successful same-path evidence。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 用户需要知道修复是否真的解决原失败，而不是只看到代码改动或不同路径通过。 |
| Runtime Directories | `src/runtime/recovery/**`，复用 `src/runtime/verdict/**` 和 `src/runtime/contracts` EvidenceBlock。 |
| Plugin Surface | 不新增 slash command、skill、agent、hook、manifest dependency。 |
| Schema | 默认不新增 persisted schema；使用 TypeScript contract。若新增落盘 retry schema，必须补 contracts/tests。 |
| Contract Test | Runtime typed contract + `tests/runtime/recovery/**`。 |
| Runtime Test | `tests/runtime/recovery/same-path-retry.test.ts`。 |
| Fixture | 复用 5.1 failure records、5.2 recovery plan helpers、5.3 fix attempt helpers。 |
| Evidence Output | before/fix/retry evidence chain；retry evidence 可 degraded，但不得覆盖旧 evidence。 |
| Report Surface | retry attempt id、samePath/pathComparison、beforeEvidenceRefs、fixAttemptId、retryEvidenceRefs、classification、verdictTransition、nextAction。 |
| Failure Mode | path changed、same failure still failing、new failure、retry cap reached、missing retry evidence。 |
| Verification Commands | `npm run test:recovery`, `npm run test:verdict`, `npm run typecheck`, `npm run verify`。 |

### Architecture Guardrails

- same-path 是硬门槛：路径不同只能 degraded/manual-confirmation-required，不能 complete。
- Fix attempt success 不等于 task success；completion verdict 只能来自 retry evidence + evaluator。
- Retry report 必须 transcript/report 可见，不能只藏在 artifact。
- Retry cap 不在本 story 做循环执行，只根据输入判断是否应继续诊断或输出 blocker。
- 不调用真实 browser/API/command；外层 runner 负责执行，runtime 负责链路和判定。

### Files To Read Before Editing

**UPDATE candidates:**

- `src/runtime/recovery/types.ts`
- `src/runtime/recovery/index.ts`

**NEW expected:**

- `src/runtime/recovery/same-path-retry.ts`
- `tests/runtime/recovery/same-path-retry.test.ts`

**Read-only context:**

- `src/runtime/recovery/fix-attempt-lineage.ts`
- `tests/runtime/recovery/fix-attempt-lineage.test.ts`
- `src/runtime/recovery/recovery-planner.ts`
- `src/runtime/recovery/failure-taxonomy.ts`
- `src/runtime/verdict/evaluator.ts`
- `tests/runtime/verdict/verdict-evaluator.test.ts`
- `src/runtime/contracts/index.ts`
- `_bmad-output/implementation-artifacts/5-3-fix-attempt-lineage-risk-aware-execution.md`

### Latest Claude Code Context

- Official Claude Code docs were checked from `https://code.claude.com/docs/llms.txt` during this sprint continuation. 5.4 stays inside runtime recovery/verdict contracts and does not require plugin manifest/hook/skill/agent metadata changes.
- If implementation unexpectedly touches plugin hooks/manifest/skills, re-check official docs and run plugin-specific gates before marking done.

## References

- `_bmad-output/planning-artifacts/epics.md#Story 5.4`
- `_bmad-output/planning-artifacts/prd.md#FR30`
- `_bmad-output/planning-artifacts/prd.md#FR31`
- `_bmad-output/planning-artifacts/prd.md#FR32`
- `_bmad-output/planning-artifacts/architecture.md#IP-RETRY-001 Same-Path Retry`
- `_bmad-output/implementation-artifacts/5-2-root-cause-recovery-plan.md`
- `_bmad-output/implementation-artifacts/5-3-fix-attempt-lineage-risk-aware-execution.md`

## Dev Agent Record

### Agent Model Used

GPT-5

### Debug Log References

- `npx vitest run tests/runtime/recovery/same-path-retry.test.ts`：通过，5 tests。
- `npm run test:recovery`：通过，29 tests。
- `npm run test:verdict`：通过，21 tests。
- `npm run typecheck`：首次暴露 `not-releasable` verdict status 类型遗漏，已修复；复跑通过。
- `npm run verify`：通过。
- Code review：发现 path-changed retry 只降级 result/report，未降级输出 retry evidence；补红测后修复，复跑验证均通过。

### Completion Notes List

- 新增 `planSamePathRetry()`，消费 5.2 retryPath、5.3 fix attempt、retry evidence/state/requirements，输出 same-path comparison、evidence chain、failure classification、verdict transition、report 和 nextAction。
- same-path passed retry 复用 `evaluateCompletionVerdict()`，只有 retry evidence 满足 requirements 才能转为 complete/partial。
- path changed/mock/skipped step 会标记 degraded，输出 retry evidence 也规范化为 degraded，不能支持 complete verdict。
- failed retry 会分类为 same-cause、changed-cause、new-failure 或 unknown；retry cap 达到上限时输出 user-owned blocker。
- Review 修复：`RetryVerdictTransition.from` 覆盖 `not-releasable`，path-changed evidence 显式降级。

### File List

- `src/runtime/recovery/types.ts`
- `src/runtime/recovery/same-path-retry.ts`
- `src/runtime/recovery/index.ts`
- `tests/runtime/recovery/same-path-retry.test.ts`
- `_bmad-output/implementation-artifacts/5-4-same-path-retry-before-after-verdict.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Started dev-story implementation.
- 2026-05-17: Implemented same-path retry, before/fix/retry evidence chain, verdict transition, retry failure classification, and review fixes; marked story done.

## Senior Developer Review (AI)

### Review Date

2026-05-17

### Review Outcome

Approve

### Findings

- Fixed [Med]: path-changed retry only marked the result/report as degraded while leaving output retry evidence unchanged. Added normalized retry evidence output so changed/mock/skipped retry paths cannot appear as verified same-path success.
- Fixed [Low]: `RetryVerdictTransition.from` did not include `not-releasable`, which strict TypeScript exposed from `StateLedger.verdictStatus`. Expanded the contract type.

### Action Items

- [x] [Med] Degrade output retry evidence when same-path comparison fails.
- [x] [Low] Include `not-releasable` in retry transition source status type.

### Verification

- `npx vitest run tests/runtime/recovery/same-path-retry.test.ts`：通过，5 tests。
- `npm run test:recovery`：通过，29 tests。
- `npm run test:verdict`：通过，21 tests。
- `npm run typecheck`：通过。
- `npm run verify`：通过。
