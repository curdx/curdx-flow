# Story 1.4: Completion Verdict Evaluator

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为依赖 curdx-flow 判断任务是否完成的用户，
我希望系统基于 state、policy、fresh evidence 和 missing evidence 计算明确 verdict，
以便任何完成声明都能被证明、降级或阻塞，而不是由 agent 自述决定。

## Acceptance Criteria

1. **明确 verdict：** 给定 run state、任务类型、用户旅程、mode policy 和 evidence ledger，verdict evaluator 必须输出 `complete`、`blocked`、`partial`、`manual-confirmation-required` 或 `release-ready` 之一，并包含 `why`、`evidenceRefs`、`missingEvidence`、`nextAction`、`owner`、`riskLevel`、`confidence` 和 `unverifiedScope`。[Source: `_bmad-output/planning-artifacts/epics.md#Story 1.4`]
2. **阻止模型自述完成：** 只有模型自述、任务 marker、代码 diff 或静态检查结果时，前端、全栈、数据保存或发布相关任务不得得到 `complete` 或 `release-ready`，必须列出缺失的 browser/API/data/release evidence 或 blocker report。[Source: `_bmad-output/planning-artifacts/prd.md#Completion Integrity & Reliability`]
3. **Freshness 判定：** 过期 evidence、target hash 不匹配、命令上下文不一致或缺少 freshness 的 evidence 不得支撑成功 verdict，verdict 必须说明证据过期或目标不匹配。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-EVIDENCE-003 Freshness Contract`]
4. **Blocker 优先：** blocker 阻断核心用户旅程或发布门禁时，verdict 必须为 `blocked`，`nextAction` 必须包含可执行修复路径、负责人和风险等级。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-BLOCKER-001 Blocker Shape`]
5. **部分验证与人工确认：** 部分验收路径通过但关键范围未验证时，verdict 必须为 `partial` 或 `manual-confirmation-required`，不得把未验证范围包装成成功结论。[Source: `_bmad-output/planning-artifacts/prd.md#Verification Data & Gap Handling`]
6. **Missing evidence gate：** 用户或 agent 声称任务完成时，如果 `missingEvidence` 不为空且没有人工确认记录，evaluator 必须阻止 `complete` verdict，并输出缺口列表供报告和 `/goal` transcript-visible summary 使用。[Source: `_bmad-output/planning-artifacts/epics.md#Story 1.4`]
7. **验证覆盖：** 最小验证命令必须包含 `npm run typecheck`、completion verdict 合同测试和 runtime evaluator 测试；测试必须覆盖 false completion、过期 evidence、missing evidence、blocker、partial、manual-confirmation-required、release evidence 不足。[Source: `_bmad-output/planning-artifacts/epics.md#Story 1.4`]

## Tasks / Subtasks

- [x] 固定 verdict runtime 边界（AC: 1-7）
  - [x] 完整读取 `plugins/curdx-flow/schemas/completion-verdict.schema.json`、`plugins/curdx-flow/schemas/evidence.schema.json`、`plugins/curdx-flow/schemas/state-ledger.schema.json`、`plugins/curdx-flow/schemas/adapter-result.schema.json`、`src/runtime/contracts/index.ts`。
  - [x] 完整读取 Story 1.2 的 `src/runtime/evidence/**` 和 Story 1.3 的 `src/runtime/state/**`，复用 evidence/state 类型与测试 fixture，不复制账本读写逻辑。
  - [x] 不修改 `src/hooks/**` 或 `plugins/curdx-flow/hooks/scripts/**`；本 story 不实现 hook gate、report renderer、release gate 或 browser/API probes。

- [x] 补强 completion verdict 合同（AC: 1, 5, 6, 7）
  - [x] 若现有 `completion-verdict.schema.json` / TypeScript interface / runtime guard 缺少 story 必需字段或嵌套约束，补齐 schema、guard、fixtures 和合同测试。
  - [x] Completion verdict 至少表达 `verdict`、`why`、`evidenceRefs`、`missingEvidence`、`nextAction`、`owner`、`riskLevel`、`confidence`、`unverifiedScope`。
  - [x] Guard 必须保留 unknown future fields，不得丢弃未来上下文；直接修改 schema 时同步 `tests/fixtures/contracts/**`。

- [x] 实现 `src/runtime/verdict/**`（AC: 1-6）
  - [x] 新建 `src/runtime/verdict/types.ts`，定义 `CompletionVerdictInput`、`EvidenceRequirement`、`EvidenceGap`、`BlockerInput`、`ManualConfirmationInput`、`VerdictEvaluationResult` 或等价 API。
  - [x] 新建 `src/runtime/verdict/evaluator.ts`，提供 `evaluateCompletionVerdict(input)`，只读取传入 state/evidence/policy/blockers/manual confirmations，不执行命令、不读写 `.curdx/**`。
  - [x] 新建 `src/runtime/verdict/freshness.ts`，集中判断 `freshness.validatedAt`、`expiresAt`、`targetHash`、`commandHash`、`environmentId`、`targetSummary` 和 required target context 是否可支撑 verdict。
  - [x] 新建 `src/runtime/verdict/index.ts` 作为 public barrel。
  - [x] Evaluator 输出必须通过 `validateContract('completionVerdict', verdict)` 或等价 guard。

- [x] 实现 no false completion 规则（AC: 2, 3, 5, 6）
  - [x] 静态检查、代码 diff、agent marker、模型自述只能作为低信任或辅助 evidence；不得单独支撑前端、全栈、数据保存或发布任务的 `complete` / `release-ready`。
  - [x] 前端或全栈任务缺少 browser/API evidence 时必须返回 `blocked`、`partial` 或 `manual-confirmation-required`，除非存在明确 blocker。
  - [x] 数据持久化任务缺少 data/API readback evidence 时不得 `complete`。
  - [x] Release 任务缺少 release evidence、release-stage authorization 或 release gate checks 时不得 `release-ready`；不要在本 story 实现 release dry-run。
  - [x] `missingEvidence` 非空且无 manual-confirmed evidence/manual confirmation input 时不得 `complete`。

- [x] 实现 blocker、partial、manual confirmation 判定（AC: 4, 5, 6）
  - [x] 核心 journey 或 release gate blocker 存在时优先返回 `blocked`，并保留 blocker evidence refs、owner、risk level、可执行 next action。
  - [x] 非核心 evidence 缺失或部分路径通过时返回 `partial`，并把未验证范围写入 `unverifiedScope`。
  - [x] 自动证据不足但用户可人工确认的场景返回 `manual-confirmation-required`；只有明确 manual-confirmed evidence 或 manual confirmation input 能支持人工通过。
  - [x] 输出 `why` 必须具体说明支撑证据、缺口或 blocker，不允许泛化为“测试通过”。

- [x] 增加合同、运行时测试与 fixtures（AC: 1-7）
  - [x] 扩展 `tests/contracts/runtime-contracts.test.ts` 或新增 targeted contract test，覆盖 completion verdict 新字段/枚举/unknown fields。
  - [x] 新建 `tests/runtime/verdict/verdict-evaluator.test.ts`，覆盖 complete、blocked、partial、manual-confirmation-required、release-ready/release evidence 不足、false completion、stale evidence、target mismatch、missing freshness。
  - [x] 测试必须使用内存对象或 `mkdtemp` fixture；不得在仓库根创建真实 `.curdx/**`。
  - [x] 复用 `tests/fixtures/contracts/valid/contracts.json` 的 state/evidence/verdict 基线，必要时新增 `tests/fixtures/runtime/verdict/**`。

- [x] 更新脚本、验证和 story 记录（AC: 7）
  - [x] 新增 `npm run test:verdict` 并接入 `npm run verify`，或确保 verdict runtime tests 被 release-quality gate 明确覆盖。
  - [x] 运行 `npm run test:contracts`、`npm run test:verdict`、`npm run test:evidence`、`npm run test:state`、`npm run typecheck`、`npm run verify`。
  - [x] 若修改 plugin-facing schema，运行 `claude plugin validate ./plugins/curdx-flow`。
  - [x] 在 Dev Agent Record 记录实现计划、验证命令、文件列表和任何未覆盖风险。

## Dev Notes

### 当前发现

- Story 1.1 已建立 `completion-verdict.schema.json`、`CompletionVerdict` TypeScript interface 和 runtime contract guard；当前合同已包含 `verdict`、`why`、`evidenceRefs`、`missingEvidence`、`nextAction`、`owner`、`riskLevel`、`confidence`、`unverifiedScope`。
- Story 1.2 已建立 append-only evidence ledger、artifact index、freshness 最小合同和 evidence tests；Story 1.4 只消费 evidence，不写 ledger，不覆盖历史 evidence。
- Story 1.3 已建立 workspace-local state/session store、dirty/generated 文件分类、legacy migration 和 recovery blocker；Story 1.4 可消费 `StateLedger.missingEvidence`、`StateLedger.evidenceIds`、`StateLedger.nextAction`、`StateLedger.verdictStatus`，但不得直接读写 `.curdx/**`。
- 当前还没有 `src/runtime/verdict/**`。本 story 是 verdict evaluator 的入口；不要把 verdict 判定塞进 evidence writer、state store、hooks、reports 或 CLI flow。

### Previous Story Intelligence

- Story 1.3 review 发现不能把未来不支持的 `schemaVersion` 静默降级，也不能在 state/session 文件身份不匹配时继续恢复。Story 1.4 必须对输入合同保持同等严格：unsupported enum/schema mismatch 必须 blocker，不得 fallback 成成功 verdict。
- Story 1.3 的 `buildResumeContext` 已能汇总 currentStep、verifiedEvidenceIds、missingEvidence、nextAction。Story 1.4 可复用这些字段语义，但 verdict 输出仍必须由 explicit evidence/policy/blocker 输入决定。
- Story 1.2 的 freshness guard 要求 evidence 至少包含 `freshness.validatedAt` 和一个目标上下文字段。Story 1.4 必须继续执行 freshness 可用性判定，并额外处理 `expiresAt`、target mismatch 和 command/environment mismatch。
- Story 1.2/1.3 的验证链路已通过 `npm run test:contracts`、`npm run test:evidence`、`npm run test:state`、`npm run typecheck`、`npm run verify` 和 `claude plugin validate ./plugins/curdx-flow`。Story 1.4 不得降低这些 gate。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| Runtime Directory | 新增 `src/runtime/verdict/**`。 |
| Contract Surface | 可能补强 `completion-verdict.schema.json`、`src/runtime/contracts/index.ts`、contract fixtures。 |
| Input Sources | `StateLedger`、`EvidenceBlock[]`、policy object、blockers、manual confirmations、required evidence spec。 |
| Output | `CompletionVerdict` object；可选 `.curdx/reports/<run-id>.verdict.json` 路径只作为后续 report story 输出目标，不在本 story 写文件。 |
| Runtime Test | 新增 `tests/runtime/verdict/**` 覆盖 evaluator 决策矩阵。 |
| Contract Test | 扩展 `tests/contracts/**` 覆盖 verdict schema/guard parity。 |
| Failure Mode | false completion、stale evidence、target mismatch、missing freshness、missing browser/API/data/release evidence、core blocker、partial scope、manual confirmation required。 |
| Verification Commands | `npm run test:contracts`、`npm run test:verdict`、`npm run test:evidence`、`npm run test:state`、`npm run typecheck`、`npm run verify`、必要时 `claude plugin validate ./plugins/curdx-flow`。 |

### Implementation Shape Guidance

建议 public API 形态：

```ts
evaluateCompletionVerdict({
  state,
  evidence,
  requirements,
  blockers,
  manualConfirmations,
  policy,
  now,
}): VerdictEvaluationResult
```

`requirements` 建议显式表达：

```json
{
  "taskType": "frontend",
  "requiredEvidence": ["browser", "api"],
  "coreScope": ["login journey"],
  "releaseStageAuthorized": false,
  "allowManualConfirmation": true
}
```

判定优先级建议固定：

1. Contract/schema invalid 或核心 blocker -> `blocked`
2. Release task 缺 release evidence/release-stage authorization -> `blocked` 或 `manual-confirmation-required`，不得 `release-ready`
3. 缺失核心 required evidence -> `blocked` 或 `manual-confirmation-required`
4. Evidence stale/target mismatch/missing freshness -> 该 evidence 不可用于成功 verdict，并进入 `missingEvidence` 或 `unverifiedScope`
5. 关键范围未验证但有部分 evidence -> `partial`
6. 只有满足 required evidence、freshness、policy 和 no false completion 时才能 `complete`

### Files To Read Before Editing

**UPDATE candidates:**

- `src/runtime/contracts/index.ts`
- `plugins/curdx-flow/schemas/completion-verdict.schema.json`
- `tests/contracts/runtime-contracts.test.ts`
- `tests/fixtures/contracts/valid/contracts.json`
- `tests/fixtures/contracts/valid/unknown-fields.json`
- `tests/fixtures/contracts/invalid/*.json`
- `package.json`

**READ for context:**

- `src/runtime/evidence/index.ts`
- `src/runtime/evidence/ledger.ts`
- `src/runtime/evidence/io.ts`
- `src/runtime/evidence/types.ts`
- `src/runtime/state/index.ts`
- `src/runtime/state/types.ts`
- `src/runtime/state/store.ts`
- `tests/runtime/evidence/evidence-ledger.test.ts`
- `tests/runtime/state/state-store.test.ts`

**NEW expected:**

- `src/runtime/verdict/index.ts`
- `src/runtime/verdict/types.ts`
- `src/runtime/verdict/evaluator.ts`
- `src/runtime/verdict/freshness.ts`
- `tests/runtime/verdict/verdict-evaluator.test.ts`
- Optional fixtures under `tests/fixtures/runtime/verdict/**`

### Architecture Guardrails

- `src/runtime/verdict/` owns evidence + policy 到 completion verdict 的判定；不得调用外部工具、不得写 evidence ledger、不得渲染报告、不得执行 release publish。[Source: `_bmad-output/planning-artifacts/architecture.md#Target Directory Contract`]
- Control plane / execution plane / display plane 必须分离：verdict evaluator 是控制面，只消费结构化事实，不执行 adapter，不生成 UI 报告。[Source: `_bmad-output/planning-artifacts/architecture.md#Completion Verdict Model`]
- Planner、adapter、hook、evidence、state、completion verdict 都必须有显式 schema 或 TypeScript 边界；跨边界数据不得依赖自然语言段落解析。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-SCHEMA-001 Schema First`]
- Evidence 必须记录 freshness；过期 evidence 不得支撑 `complete` 或 `release-ready`。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-EVIDENCE-003 Freshness Contract`]
- 没有 artifact、命令输出、截图、trace、日志摘要、schema 校验结果或其他可复查来源的模型总结不得计入 evidence ledger，也不得支撑完成 verdict。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-EVIDENCE-001 Evidence Block Shape`]
- Blocker 必须包含可执行 next action；没有 next action 的失败报告不合格。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-BLOCKER-001 Blocker Shape`]
- No false completion 不可关闭；缺少 evidence block 或 blocker report 时不得声明完成。[Source: `_bmad-output/planning-artifacts/prd.md#Completion Integrity & Reliability`]

### Latest Claude Code / Library Information

- 官方 Claude Code 文档入口仍以 <https://code.claude.com/docs/llms.txt> 为准；本 story 不改 plugin manifest、hooks、skills、agents、dependencies 或 release tags。
- 本 story 若只新增 runtime verdict evaluator，不需要 `npm run build:hooks`；但 `npm run verify` 会检查 hook freshness，不得留下 generated hook drift。
- 若补强 `completion-verdict.schema.json`，必须运行 `claude plugin validate ./plugins/curdx-flow`。

### Known Risks To Prevent

- 不要把 agent marker、`TASK_COMPLETE`、模型自述、代码 diff 或静态测试单独当成完成证据。
- 不要在 evaluator 内部读取 `.curdx/**`、执行 git/npm/claude/playwright、调用 MCP 或启动服务；这些属于 planner/adapters/probes。
- 不要实现 Story 1.5 report renderer 或 Story 1.6 hook gate；Story 1.4 只返回 structured verdict object。
- 不要实现 Epic 6 release dry-run；只在 release task 缺 evidence/authorization 时阻止 `release-ready`。
- 不要静默忽略 stale/mismatched evidence；被判为不可用的 evidence 必须进入 `missingEvidence`、`unverifiedScope` 或 `why`。
- 不要让 manual confirmation 成为万能通过；必须有明确 manual-confirmed evidence 或 manual confirmation input，并保留 remaining risk。
- 不要修改 `plugins/curdx-flow/hooks/scripts/**`；它们只能由 hook build 生成，本 story不触达。

## Project Structure Notes

- Alignment: Story 1.4 接续 Story 1.1 completion verdict 合同、Story 1.2 evidence ledger/freshness、Story 1.3 state/session recovery。
- Detected conflict: architecture 中 user-facing verdict 字段名有 `status/plainLanguageSummary`，当前 shipped schema 使用 `verdict/why`；本 story 应以 shipped schema + Story 1.4 AC 为准，不在本 story重命名 report-layer 字段。
- UX note: 用户价值是阻止假完成并给出可执行 next action，不是新增 UI 或 Markdown report。

## References

- `_bmad-output/planning-artifacts/epics.md#Story 1.4`
- `_bmad-output/planning-artifacts/epics.md#Story Requirement Trace`
- `_bmad-output/planning-artifacts/prd.md#Work Intake & Completion Definition`
- `_bmad-output/planning-artifacts/prd.md#Completion Integrity & Reliability`
- `_bmad-output/planning-artifacts/prd.md#Verification Data & Gap Handling`
- `_bmad-output/planning-artifacts/architecture.md#Completion Verdict Model`
- `_bmad-output/planning-artifacts/architecture.md#IP-SCHEMA-001 Schema First`
- `_bmad-output/planning-artifacts/architecture.md#IP-EVIDENCE-003 Freshness Contract`
- `_bmad-output/planning-artifacts/architecture.md#IP-BLOCKER-001 Blocker Shape`
- `_bmad-output/planning-artifacts/architecture.md#Target Directory Contract`
- `_bmad-output/project-context.md`
- `_bmad-output/implementation-artifacts/1-1-evidence-status-verdict-report-contract-baseline.md`
- `_bmad-output/implementation-artifacts/1-2-append-only-evidence-ledger-artifact-index.md`
- `_bmad-output/implementation-artifacts/1-3-run-state-recovery-context-workspace-boundary.md`
- Claude Code docs index: <https://code.claude.com/docs/llms.txt>

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 2026-05-17: Created Story 1.4 from sprint backlog and loaded PRD/architecture/epics/story context plus official Claude Code docs index.
- 2026-05-17: Wrote failing verdict evaluator tests before `src/runtime/verdict/**` existed.
- 2026-05-17: `npm run test:verdict` RED due missing `src/runtime/verdict/index.ts`, then GREEN after implementation.
- 2026-05-17: `npm run test:contracts` PASS.
- 2026-05-17: `npm run test:evidence` PASS.
- 2026-05-17: `npm run test:state` PASS.
- 2026-05-17: `npm run test:verdict` PASS.
- 2026-05-17: `npm run typecheck` PASS.
- 2026-05-17: `npm run verify` PASS.
- 2026-05-17: `claude plugin validate ./plugins/curdx-flow` PASS.
- 2026-05-17: Code review found and fixed empty requirements bypass and unrelated manual confirmation masking state missing evidence.
- 2026-05-17: Re-ran `npm run test:verdict`, `npm run typecheck`, `npm run verify`, and `claude plugin validate ./plugins/curdx-flow` after review fixes; all PASS.

### Completion Notes List

- Added pure `src/runtime/verdict/**` evaluator that consumes state/evidence/requirements/blockers/manual confirmations and returns a schema-validated `CompletionVerdict`.
- Added freshness evaluation for `validatedAt`, `expiresAt`, target context, `targetHash`, `commandHash`, `environmentId`, and `targetSummary`.
- Enforced no false completion for self-reported/model-only evidence, stale evidence, target mismatch, missing browser/API/data/release evidence, missing release authorization, state missing evidence, and core blockers.
- Added partial/manual-confirmation-required/release-ready decision paths without implementing report rendering, hook gate, release dry-run, file IO, or external tool calls.
- Strengthened `completion-verdict.schema.json` and runtime guard so `unverifiedScope` entries must be structured objects.
- Added `npm run test:verdict` and included it in `npm run verify`.
- Review fixes: explicit empty requirements now fall back to inferred default requirements; manual confirmations only clear matching missing evidence by requirement id or evidence ref.

### File List

- `package.json`
- `plugins/curdx-flow/schemas/completion-verdict.schema.json`
- `src/runtime/contracts/index.ts`
- `src/runtime/verdict/evaluator.ts`
- `src/runtime/verdict/freshness.ts`
- `src/runtime/verdict/index.ts`
- `src/runtime/verdict/types.ts`
- `tests/contracts/runtime-contracts.test.ts`
- `tests/runtime/verdict/verdict-evaluator.test.ts`

### Change Log

- 2026-05-17: Implemented completion verdict evaluator, freshness checks, no-false-completion decision tests, contract guard update, and verification script coverage.
- 2026-05-17: Addressed code review findings for empty requirement bypass and unrelated manual confirmation masking.

## Senior Developer Review (AI)

### Review Date

2026-05-17

### Review Outcome

Approve

### Findings

- Fixed: Passing `requirements: []` initially meant “no requirements”, which could allow a claimed completion with no evidence. Empty explicit requirements now fall back to inferred default requirements instead of bypassing no-false-completion.
- Fixed: Any manual confirmation initially suppressed all `state.missingEvidence`. Manual confirmation now only clears matching gaps when it references the missing requirement id or related evidence ref.

### Verification

- `npm run test:verdict` PASS
- `npm run typecheck` PASS
- `npm run verify` PASS
- `claude plugin validate ./plugins/curdx-flow` PASS
