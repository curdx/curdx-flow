# Story 5.2: Root-Cause Oriented Recovery Plan

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为想让系统自动恢复失败的用户，
我希望 curdx-flow 在修复前先生成基于失败证据的恢复计划，
以便系统优先定位根因，而不是盲目反复编辑代码。

## Acceptance Criteria

1. **Evidence-backed recovery plan：** 给定 failure taxonomy 已输出失败分类和 evidenceRefs，当 recovery planner 生成恢复计划，计划必须包含 suspected root cause、需要补充的诊断证据、候选修复动作、风险等级、模式限制、预计重跑路径和停止条件；不得在没有失败证据的情况下直接生成修复动作。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.2`; `_bmad-output/planning-artifacts/prd.md#FR29`; `_bmad-output/planning-artifacts/prd.md#FR74`; `_bmad-output/implementation-artifacts/5-1-failure-evidence-capture-taxonomy.md`]
2. **不可自动修复 blocker：** 给定失败属于能力缺失、环境缺口、缺密钥、数据库不可用或外部服务不可用，当 recovery planner 评估可修复性，计划必须说明是 agent 可修复、用户负责、外部系统负责还是 manual-confirmation-required；不得把不可自动修复的问题包装成代码修复任务。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.2`; `_bmad-output/planning-artifacts/architecture.md#Capability Degradation Model`; `_bmad-output/planning-artifacts/architecture.md#IP-MODE-001 Report-Only and Fix Mode`]
3. **历史失败复用：** 给定失败曾在 claude-mem 或历史记录中出现过，当历史能力可用，recovery planner 可以引用历史失败模式和已验证修复路径；必须说明引用来源摘要和可信度，不得直接照搬敏感内容。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.2`; `_bmad-output/planning-artifacts/prd.md#claude-mem`]
4. **诊断能力降级：** 给定失败需要最新官方文档或高风险架构判断，当 context7 或 sequential-thinking 可用，recovery planner 可以把它们作为诊断能力；不可用时必须说明降级影响或要求人工确认。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.2`; `_bmad-output/planning-artifacts/architecture.md#expected external MCP`]
5. **Bounded parallel diagnosis：** 给定失败需要并行诊断，当 pua 或等价并行能力可用，planner 可以生成 bounded parallel diagnosis plan；必须限制范围，避免多个 worker 修改同一文件或重复修复同一问题。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.2`; `_bmad-output/planning-artifacts/prd.md#pua`]
6. **验证覆盖：** 给定 Story 5.2 完成，当执行验证，最小验证命令必须包含 `npm run typecheck`、recovery planner tests；测试必须覆盖 evidence-backed plan、缺证据不修复、环境 blocker、外部服务 blocker、history degraded、parallel diagnosis ownership、unknown root cause。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.2`]

## Tasks / Subtasks

- [x] 定义 recovery planner contract（AC: 1-6）
  - [x] 在 `src/runtime/recovery/` 新增 recovery plan 类型和 `planRecovery()` 或等价函数。
  - [x] 输入必须消费 5.1 `FailureEvidenceCaptureResult` 或 `CapturedFailureRecord[]`，并包含 mode、capability availability、history matches、diagnostic capability status。
  - [x] 输出包含 suspectedRootCause、requiredDiagnostics、candidateActions、riskLevel、modeRestrictions、retryPath、stopConditions、ownership、degradedCapabilities、parallelDiagnosisPlan。
  - [x] Planner 不执行修复、不写文件、不调用真实外部 MCP；只生成计划。

- [x] 实现 evidence-backed planning 和 no-evidence blocker（AC: 1）
  - [x] 缺少 failure evidence/evidenceRefs 时，不得生成 candidate fix action；必须返回 blocked/manual-confirmation-required plan。
  - [x] 有 taxonomy/evidence 时，suspected root cause 必须引用 primary failure id/category/reason/evidenceRefs。
  - [x] retryPath 必须指向原 command/action/API/data journey，供 5.4 same-path retry 使用。

- [x] 实现 ownership 和 mode restrictions（AC: 2）
  - [x] environment、missing secret、database unavailable、dependency/capability unavailable、externalService 必须映射到 user/external-system/manual-confirmation-required，不得伪装为 agent 可直接修代码。
  - [x] agent 可修复动作必须受 mode 限制；report-only 不得生成 mutating action。
  - [x] high/critical 风险动作必须标记 requiresAuthorization。

- [x] 实现 history/docs/reasoning/parallel capability degraded handling（AC: 3-5）
  - [x] history matches 可用时输出 sanitized sourceSummary、confidence、suggestedFixPattern；不可用或 degraded 时记录 degradedCapabilities。
  - [x] context7/sequential-thinking 不可用时记录 degraded diagnostic impact 或 manual confirmation requirement。
  - [x] pua 可用时生成 bounded parallel diagnosis plan，包含 disjoint ownership/scope；不可用时说明影响。

- [x] 增加 recovery planner tests（AC: 6）
  - [x] 新增 `tests/runtime/recovery/recovery-planner.test.ts`。
  - [x] 测试覆盖 evidence-backed plan、缺证据不修复、环境 blocker、外部服务 blocker、history degraded、parallel diagnosis ownership、unknown root cause。
  - [x] 继续使用 `npm run test:recovery`，并保持 `npm run verify` 覆盖。

- [x] 验证和记录（AC: 6）
  - [x] 运行 `npm run test:recovery`。
  - [x] 运行 `npm run typecheck`。
  - [x] 运行 `npm run verify`。
  - [x] 将验证命令和结果写入本 story 的 Dev Agent Record。

## Dev Notes

### 当前发现

- 5.1 已提供 `captureFailureEvidence()`、`CapturedFailureRecord`、`FailureEvidenceCaptureResult`、taxonomy、primary 和 secondary symptoms。5.2 应直接消费这些类型，不要重做 taxonomy。
- 5.2 只生成 recovery plan，不执行 fix attempt；5.3 才负责修复尝试 lineage 和 mode/risk 执行。
- Architecture 明确 `src/runtime/recovery` 可拥有 recovery plan，但不得直接编辑源码、直接发布或跳过 policy。
- PRD 指定 `claude-mem` 用历史失败复用，`context7` 用最新官方文档，`sequential-thinking` 用高风险架构推理，`pua` 用并行诊断。这些在 5.2 应作为 capability status/plan 输入，不直接调用真实工具。

### Previous Story Intelligence

- 5.1 review 修复了外部服务分类和敏感字段脱敏。5.2 history/source summaries 和 candidate action summaries 也必须脱敏，不得把历史敏感内容照搬到 plan。
- 5.1 unknown category 的 nextAction 要求更多诊断证据。5.2 对 unknown root cause 应生成 diagnostic-first plan，而不是 fix-first plan。
- 5.1 保留 evidenceRefs/artifactRefs/reproductionSteps。5.2 retryPath 和 requiredDiagnostics 应沿用这些字段，为 5.4 same-path retry 留链路。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 用户需要先知道根因和安全恢复路径，而不是让 agent 盲目改代码。 |
| Runtime Directories | `src/runtime/recovery/**`。 |
| Plugin Surface | 不新增 slash command、skill、agent、hook、manifest dependency。 |
| Schema | 不新增 persisted schema；使用 TypeScript contract。若后续落盘，必须同步 schema/test。 |
| Contract Test | Runtime typed contract + `tests/runtime/recovery/**`；如新增 schema 字段，补 `tests/contracts/**`。 |
| Runtime Test | `tests/runtime/recovery/recovery-planner.test.ts`。 |
| Fixture | 复用 `tests/fixtures/broken-app/` 和 5.1 failure records。 |
| Evidence Output | Recovery plan 引用 evidenceRefs/artifactRefs，但不写 ledger。 |
| Report Surface | suspected root cause、required diagnostics、candidate actions、ownership、mode restrictions、retry path、stop conditions、degraded capabilities。 |
| Failure Mode | 缺 failure evidence、environment blocker、external service blocker、history degraded、parallel ownership conflict、unknown root cause。 |
| Verification Commands | `npm run test:recovery`, `npm run typecheck`, `npm run verify`。 |

### Architecture Guardrails

- Planner 不执行修复、不写文件、不调用真实 MCP，不直接更新 final verdict。
- 不可自动修复问题必须明确 owner 和 blocker，不得包装成 agent code fix。
- report-only 模式不能生成 mutating action；fix mode 也要标记 risk 和 authorization。
- parallel diagnosis plan 必须 bounded，且每个 lane 有不重叠 owner/scope/writeScope。
- history/docs/reasoning 能力缺失必须 degraded 或 manual-confirmation-required，不能静默跳过。

### Files To Read Before Editing

**UPDATE candidates:**

- `src/runtime/recovery/types.ts`
- `src/runtime/recovery/index.ts`
- `package.json`

**NEW expected:**

- `src/runtime/recovery/recovery-planner.ts`
- `tests/runtime/recovery/recovery-planner.test.ts`

**Read-only context:**

- `src/runtime/recovery/failure-taxonomy.ts`
- `tests/runtime/recovery/failure-taxonomy.test.ts`
- `tests/fixtures/broken-app/failures.json`
- `src/runtime/policy/action-risk-policy.ts`

## References

- `_bmad-output/planning-artifacts/epics.md#Story 5.2`
- `_bmad-output/planning-artifacts/prd.md#FR29`
- `_bmad-output/planning-artifacts/prd.md#FR32`
- `_bmad-output/planning-artifacts/prd.md#FR74`
- `_bmad-output/planning-artifacts/architecture.md#src/runtime/recovery`
- `_bmad-output/planning-artifacts/architecture.md#IP-MODE-001 Report-Only and Fix Mode`
- `_bmad-output/planning-artifacts/architecture.md#IP-RETRY-001 Same-Path Retry`
- `_bmad-output/implementation-artifacts/5-1-failure-evidence-capture-taxonomy.md`

## Dev Agent Record

### Agent Model Used

GPT-5

### Implementation Plan

- 复用 5.1 `FailureEvidenceCaptureResult` / `CapturedFailureRecord`，新增纯 planner contract，不执行修复、不写文件、不调用外部 MCP。
- 将 evidence、ownership、mode restriction、history reuse、diagnostic capability degradation、bounded parallel diagnosis 都编码为 typed recovery plan 输出。
- 以 tests-first 方式覆盖 7 个 5.2 核心失败/恢复场景，再跑 release-quality `verify`。

### Debug Log References

- `npx vitest run tests/runtime/recovery/recovery-planner.test.ts`：通过，8 tests。
- `npm run test:recovery`：通过，18 tests。
- `npm run typecheck`：首次暴露一个 TypeScript 窄化冗余分支，已修复；复跑通过。
- `npm run verify`：通过。
- Code review：发现 report-only diagnostic plan 被错误标记为 blocked，补红测后修复；复跑 `npm run test:recovery`、`npm run typecheck`、`npm run verify` 均通过。

### Completion Notes List

- 新增 `planRecovery()`，输出 evidence-backed suspected root cause、required diagnostics、candidate actions、risk/mode restriction、retry path、stop conditions、ownership、degraded capabilities、history references、parallel diagnosis plan 和 next action。
- 缺 failure evidence/evidenceRefs 时返回 blocked plan 且不生成 fix action；unknown root cause 走 diagnostic-first。
- environment/dependency/permission 映射为 user-owned blocker，externalService 映射为 external-system blocker，避免伪装成代码修复。
- history matches 经过脱敏摘要输出；context7/sequential-thinking/pua 不可用时显式记录 degraded impact；pua 可用时生成 read-only、scope/owner 不冲突的 bounded lanes。
- Review 修复：`statusFor()` 现在按当前 mode 是否允许 candidate action 来决定 planned 状态，保证 report-only 非变更诊断计划可执行，release/fix mode 限制不会被绕过。

### File List

- `src/runtime/recovery/types.ts`
- `src/runtime/recovery/recovery-planner.ts`
- `src/runtime/recovery/index.ts`
- `tests/runtime/recovery/recovery-planner.test.ts`
- `_bmad-output/implementation-artifacts/5-2-root-cause-recovery-plan.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Started dev-story implementation.
- 2026-05-17: Implemented root-cause recovery planner contract, tests, and verification; marked ready for review.
- 2026-05-17: Code review completed; fixed report-only status semantics and marked story done.

## Senior Developer Review (AI)

### Review Date

2026-05-17

### Review Outcome

Approve

### Findings

- Fixed [Med]: report-only recovery plans for agent-owned evidence-backed failures generated a non-mutating diagnostic candidate action but were still marked `blocked`, which made mode-restricted diagnostic recovery unusable. Added a regression test and changed status calculation to require at least one candidate action allowed by the current mode before returning `planned`.

### Action Items

- [x] [Med] Add report-only recovery planner test and repair current-mode status calculation.

### Verification

- `npx vitest run tests/runtime/recovery/recovery-planner.test.ts`：通过，8 tests。
- `npm run test:recovery`：通过，18 tests。
- `npm run typecheck`：通过。
- `npm run verify`：通过。
