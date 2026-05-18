# Story 1.5: 人类可读与机器可读的证据报告

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为需要验收 AI 编码结果的用户、QA 或技术负责人，
我希望 curdx-flow 输出一份一眼可判断的 Markdown 报告和一份机器可读 JSON 报告，
以便我能知道任务是否完成、真实验证了什么、缺什么证据、哪些能力降级、下一步谁负责。

## Acceptance Criteria

1. **报告产物：** 给定一个 run 已经产生 state、evidence、artifact index、blockers 和 completion verdict，report generator 必须生成 `.curdx/reports/<run-id>.report.md` 和 `.curdx/reports/<run-id>.report.json`，JSON 报告必须通过 shipped schema 或 TypeScript guard 校验。[Source: `_bmad-output/planning-artifacts/epics.md#Story 1.5`]
2. **顶部一眼可判定：** Markdown 顶部必须回答现在完成了吗、真实验证了什么、缺什么证据、哪些能力降级、下一步谁负责、能不能发布；不得只输出“完成了”或“测试通过”。[Source: `_bmad-output/planning-artifacts/architecture.md#User-Facing Verdict & Evidence Experience Model`]
3. **Evidence 摘要：** 每条 evidence 必须显示简短摘要、状态、trust level、freshness、artifact 引用、未验证范围或降级原因；日志、请求响应、截图、trace 等 artifact 只展示安全摘要和路径，不泄露 secret、cookie、token 或完整生产数据。[Source: `_bmad-output/planning-artifacts/epics.md#Story 1.5`]
4. **非完成状态分组：** verdict 为 `blocked`、`partial` 或 `manual-confirmation-required` 时，报告必须按 blocker、missing evidence、manual confirmation、next action 分组；每个 next action 必须有 owner、risk level 和可执行说明。[Source: `_bmad-output/planning-artifacts/epics.md#Story 1.5`]
5. **Transcript-visible summary：** runtime 生成的 summary 必须包含 verifier command、exit code、关键 evidence digest、missingEvidence 和最终 verdict，并避免长日志和敏感内容。[Source: `_bmad-output/planning-artifacts/epics.md#Story 1.5`]
6. **Report-only 模式：** report-only 模式下，报告必须清楚标记没有源码修改；如果发现问题，只能输出复现路径、严重等级、证据和建议，不得暗示已自动修复。[Source: `_bmad-output/planning-artifacts/prd.md#Command Structure And Output Formats`]
7. **验证覆盖：** 最小验证命令必须包含 `npm run typecheck`、report schema/guard 测试和 report renderer 测试；测试必须覆盖 passed、blocked、partial、manual-confirmation-required、degraded capability、大日志摘要、敏感字段脱敏和 report-only 场景。[Source: `_bmad-output/planning-artifacts/epics.md#Story 1.5`]

## Tasks / Subtasks

- [x] 固定 reports runtime 边界（AC: 1-7）
  - [x] 完整读取 `plugins/curdx-flow/schemas/verification-report.schema.json`、`plugins/curdx-flow/schemas/evidence.schema.json`、`plugins/curdx-flow/schemas/artifact-index.schema.json`、`plugins/curdx-flow/schemas/completion-verdict.schema.json`、`src/runtime/contracts/index.ts`。
  - [x] 完整读取 Story 1.2 `src/runtime/evidence/**`、Story 1.3 `src/runtime/state/**`、Story 1.4 `src/runtime/verdict/**`，只消费其输出，不复制判定或 ledger 写入逻辑。
  - [x] 不修改 `src/hooks/**` 或 `plugins/curdx-flow/hooks/scripts/**`；本 story 不实现 hook gate、browser/API probes、release dry-run 或 verdict evaluator。

- [x] 补强 verification report 合同（AC: 1, 3, 4, 5, 7）
  - [x] 若现有 `verification-report.schema.json` / TypeScript interface / runtime guard 缺少 story 必需字段或嵌套约束，补齐 schema、guard、fixtures 和合同测试。
  - [x] Machine report 至少表达 `runId`、`goalId`、`status`、`verdict`、`summary`、`evidenceRefs`、`artifactIndex`、`blockers`、`missingEvidence`、`generatedAt`、`privacy`，并允许 unknown future fields。
  - [x] 如新增 report-specific fields（例如 `sections`、`transcriptSummary`、`sourceChanges`、`reportOnly`），必须同步 schema、TypeScript、guard、fixtures、tests。

- [x] 实现 `src/runtime/reports/**`（AC: 1-6）
  - [x] 新建 `src/runtime/reports/types.ts`，定义 `ReportInput`、`RenderedReport`、`EvidenceSummary`、`ArtifactSummary`、`TranscriptSummary`、`ReportWriteResult` 或等价 API。
  - [x] 新建 `src/runtime/reports/renderer.ts`，提供 `renderVerificationReport(input)`，返回 Markdown 和 JSON object，不直接执行外部工具。
  - [x] 新建 `src/runtime/reports/summary.ts`，提供 transcript-visible summary builder，控制长度并避免敏感内容。
  - [x] 新建 `src/runtime/reports/redaction.ts`，复用或等价实现 Story 1.2 privacy/redaction 规则，截断大日志并隐藏 token/cookie/secret。
  - [x] 新建 `src/runtime/reports/store.ts` 或等价文件写入 helper，写 `.curdx/reports/<run-id>.report.md` 和 `.curdx/reports/<run-id>.report.json`，使用 same-directory temp file + atomic rename，失败返回结构化 blocker/degraded。
  - [x] 新建 `src/runtime/reports/index.ts` 作为 public barrel。

- [x] 实现 Markdown 报告结构（AC: 2, 3, 4, 6）
  - [x] 顶部必须包含一眼可读的 verdict、完成状态、真实验证摘要、缺失证据、降级能力、下一步 owner/action、release readiness。
  - [x] Evidence section 必须按 status/trust/source 展示摘要、freshness、artifact 路径、安全摘要、unverified scope 或 degraded reason。
  - [x] Blocked/partial/manual-confirmation-required 必须分组展示 blockers、missingEvidence、manual confirmation、nextAction。
  - [x] Report-only 模式必须明确显示“未修改源码”，并避免任何“已自动修复”的暗示。
  - [x] Markdown 不得包含完整长日志、secret、cookie、token、Authorization header 或完整生产数据。

- [x] 实现 machine-readable JSON 与 transcript summary（AC: 1, 5）
  - [x] JSON report 必须通过 `validateContract('verificationReport', report)` 或更强 guard。
  - [x] JSON report 必须包含 verdict object、evidence refs、artifact summaries、blockers、missingEvidence、privacy metadata。
  - [x] Transcript summary 必须包含 verifier command、exit code、关键 evidence digest、missingEvidence 和最终 verdict，且长度受控。
  - [x] Summary 只能是报告摘要，不得成为新的事实来源或覆盖 evidence/verdict。

- [x] 增加合同、运行时测试与 fixtures（AC: 1-7）
  - [x] 扩展 `tests/contracts/runtime-contracts.test.ts` 或新增 targeted contract test，覆盖 verification report schema/guard parity、unknown fields、嵌套摘要字段。
  - [x] 新建 `tests/runtime/reports/report-renderer.test.ts`，覆盖 passed、blocked、partial、manual-confirmation-required、degraded capability、大日志摘要、敏感字段脱敏、report-only、atomic write failure。
  - [x] 测试必须使用 `mkdtemp` 临时 workspace；不得在仓库根创建真实 `.curdx/**`。
  - [x] 复用 `tests/fixtures/contracts/valid/contracts.json` 中 state/evidence/verdict/report 基线，必要时新增 `tests/fixtures/runtime/reports/**`。

- [x] 更新脚本、验证和 story 记录（AC: 7）
  - [x] 新增 `npm run test:reports` 并接入 `npm run verify`，或确保 report runtime tests 被 release-quality gate 明确覆盖。
  - [x] 运行 `npm run test:contracts`、`npm run test:reports`、`npm run test:evidence`、`npm run test:state`、`npm run test:verdict`、`npm run typecheck`、`npm run verify`。
  - [x] 若修改 plugin-facing schema，运行 `claude plugin validate ./plugins/curdx-flow`。
  - [x] 在 Dev Agent Record 记录实现计划、验证命令、文件列表和任何未覆盖风险。

## Dev Notes

### 当前发现

- Story 1.1 已建立 `verification-report.schema.json`、`VerificationReport` interface 和 runtime contract guard；当前合同包含 report 最小机器可读字段，但可能需要补强嵌套 report sections / transcript summary。
- Story 1.2 已建立 evidence ledger、artifact index、privacy/redaction helper 和 evidence tests；Story 1.5 应复用 artifact/evidence shape，不重新定义 ledger。
- Story 1.3 已建立 `.curdx/state/**` store 和 generated file classification；Story 1.5 的 report writer 必须写目标 workspace `.curdx/reports/**`，不得写 shipped plugin source。
- Story 1.4 已建立 completion verdict evaluator；Story 1.5 必须消费 verdict，不重新计算 completion verdict。
- 当前还没有 `src/runtime/reports/**`。本 story 是 report renderer 的入口；不要把 report rendering 放进 verdict/evidence/state/hooks。

### Previous Story Intelligence

- Story 1.4 review 发现空 requirements 和不相关 manual confirmation 都可能造成 false completion。Story 1.5 报告必须原样呈现 missingEvidence/manual confirmation 关系，不得在展示层抹平缺口。
- Story 1.4 输出的 `CompletionVerdict` 使用 shipped schema 字段 `verdict/why/evidenceRefs/missingEvidence/nextAction/owner/riskLevel/confidence/unverifiedScope`；Story 1.5 应以这些字段为报告事实源。
- Story 1.2 privacy/redaction 已处理 secret、cookie、token 等敏感摘要；Story 1.5 的 Markdown/summary 不得绕过该类红线。
- Story 1.2/1.3/1.4 的验证链路已通过 `npm run test:contracts`、`npm run test:evidence`、`npm run test:state`、`npm run test:verdict`、`npm run typecheck`、`npm run verify` 和 `claude plugin validate ./plugins/curdx-flow`。Story 1.5 不得降低这些 gate。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| Runtime Directory | 新增 `src/runtime/reports/**`。 |
| Contract Surface | 可能补强 `verification-report.schema.json`、`src/runtime/contracts/index.ts`、contract fixtures。 |
| Input Sources | `StateLedger`、`EvidenceBlock[]`、`ArtifactIndexEntry[]`、`CompletionVerdict`、blockers、mode/policy metadata。 |
| Output | Markdown string、JSON `VerificationReport` object、transcript-visible summary、`.curdx/reports/<run-id>.report.md`、`.curdx/reports/<run-id>.report.json`。 |
| Runtime Test | 新增 `tests/runtime/reports/**` 覆盖 renderer/store/redaction/summary。 |
| Contract Test | 扩展 `tests/contracts/**` 覆盖 verification report schema/guard parity。 |
| Failure Mode | write failure、schema mismatch、sensitive leakage、large log overflow、report-only misleading copy、blocked/partial/manual grouping missing。 |
| Verification Commands | `npm run test:contracts`、`npm run test:reports`、`npm run test:evidence`、`npm run test:state`、`npm run test:verdict`、`npm run typecheck`、`npm run verify`、必要时 `claude plugin validate ./plugins/curdx-flow`。 |

### Implementation Shape Guidance

建议 public API 形态：

```ts
renderVerificationReport({
  state,
  evidence,
  artifactIndex,
  verdict,
  blockers,
  mode,
  generatedAt,
}): RenderedReport
```

```ts
writeVerificationReport({
  workspaceRoot,
  runId,
  report,
}): Promise<ReportWriteResult>
```

Markdown 顶部建议固定结构：

```md
# Verification Report: <runId>

Status: <verdict>
Can release: <yes/no/unknown>
Verified: <short digest>
Missing evidence: <count + top items>
Degraded capabilities: <count + names>
Next action: <owner> - <summary>
Report-only: <yes/no>
```

Transcript summary 必须短，可用 5-8 行，最长不应包含完整日志或响应体。

### Files To Read Before Editing

**UPDATE candidates:**

- `src/runtime/contracts/index.ts`
- `plugins/curdx-flow/schemas/verification-report.schema.json`
- `tests/contracts/runtime-contracts.test.ts`
- `tests/fixtures/contracts/valid/contracts.json`
- `tests/fixtures/contracts/valid/unknown-fields.json`
- `tests/fixtures/contracts/invalid/*.json`
- `package.json`

**READ for context:**

- `src/runtime/evidence/artifacts.ts`
- `src/runtime/evidence/privacy.ts`
- `src/runtime/evidence/types.ts`
- `src/runtime/evidence/index.ts`
- `src/runtime/state/index.ts`
- `src/runtime/state/types.ts`
- `src/runtime/verdict/index.ts`
- `src/runtime/verdict/types.ts`
- `tests/runtime/evidence/evidence-ledger.test.ts`
- `tests/runtime/state/state-store.test.ts`
- `tests/runtime/verdict/verdict-evaluator.test.ts`

**NEW expected:**

- `src/runtime/reports/index.ts`
- `src/runtime/reports/types.ts`
- `src/runtime/reports/renderer.ts`
- `src/runtime/reports/summary.ts`
- `src/runtime/reports/redaction.ts`
- `src/runtime/reports/store.ts`
- `tests/runtime/reports/report-renderer.test.ts`
- Optional fixtures under `tests/fixtures/runtime/reports/**`

### Architecture Guardrails

- `src/runtime/reports/` owns markdown/json renderers and artifact summaries；不得做核心通过/失败判定、不得调用外部工具、不得写 evidence ledger。[Source: `_bmad-output/planning-artifacts/architecture.md#Target Directory Contract`]
- 展示面不拥有事实来源；reports 只能渲染 state/evidence/verdict/blockers，不能覆盖 verdict 或创造新 evidence。[Source: `_bmad-output/planning-artifacts/architecture.md#Control Plane, Execution Plane, Display Plane`]
- 输出格式至少包括 human-readable Markdown 和 machine-readable JSON；关键证据摘要必须进入对话或报告。[Source: `_bmad-output/planning-artifacts/prd.md#Command Structure And Output Formats`]
- 报告顶部必须回答当前完成状态、卡点、真实验证项、模型判断项、release readiness、下一步 owner。[Source: `_bmad-output/planning-artifacts/architecture.md#User-Facing Verdict & Evidence Experience Model`]
- 能力降级可以继续工作，但不能伪装成完整验证；报告必须说明不可用能力、fallback、可信度下降和是否需要人工确认。[Source: `_bmad-output/planning-artifacts/architecture.md#Degraded Mode Experience`]
- Report-only 不得修改源码；报告只能输出复现路径、严重等级、证据和建议。[Source: `_bmad-output/planning-artifacts/prd.md#Command Structure And Output Formats`]

### Latest Claude Code / Library Information

- 官方 Claude Code 文档入口仍以 <https://code.claude.com/docs/llms.txt> 为准；本 story 不改 plugin manifest、hooks、skills、agents、dependencies 或 release tags。
- 本 story 若只新增 runtime report renderer，不需要 `npm run build:hooks`；但 `npm run verify` 会检查 hook freshness，不得留下 generated hook drift。
- 若补强 `verification-report.schema.json`，必须运行 `claude plugin validate ./plugins/curdx-flow`。

### Known Risks To Prevent

- 不要重新计算 completion verdict；报告层消费 Story 1.4 输出。
- 不要把 Markdown 文案当作事实源；machine JSON 必须可被 guard 验证。
- 不要泄露 secrets、cookies、tokens、Authorization header、完整生产数据或完整长日志。
- 不要在 report-only 模式暗示系统已自动修改或修复源码。
- 不要把 artifact index 藏成 report 私有数组而丢失路径/隐私摘要；artifact summary 必须可追溯。
- 不要实现 Story 1.6 hook gate 或 Epic 6 release dry-run。
- 不要修改 `plugins/curdx-flow/hooks/scripts/**`；它们只能由 hook build 生成，本 story 不触达。

## Project Structure Notes

- Alignment: Story 1.5 接续 Story 1.1 verification report 合同、Story 1.2 evidence/artifact index、Story 1.3 state generated-file boundary、Story 1.4 completion verdict。
- Detected conflict: architecture mapping 提到 `.verdict.json`，Story 1.5 AC 明确要求 `.report.json`；本 story 应生成 `.report.json`，可在 JSON 内嵌 verdict。
- UX note: 报告第一屏服务于验收判断，必须密集、可扫描、证据导向，不做营销式说明。

## References

- `_bmad-output/planning-artifacts/epics.md#Story 1.5`
- `_bmad-output/planning-artifacts/epics.md#Story Requirement Trace`
- `_bmad-output/planning-artifacts/prd.md#Reporting & Review`
- `_bmad-output/planning-artifacts/prd.md#Command Structure And Output Formats`
- `_bmad-output/planning-artifacts/architecture.md#User-Facing Verdict & Evidence Experience Model`
- `_bmad-output/planning-artifacts/architecture.md#Degraded Mode Experience`
- `_bmad-output/planning-artifacts/architecture.md#FR47-FR52 Reports`
- `_bmad-output/planning-artifacts/architecture.md#Target Directory Contract`
- `_bmad-output/project-context.md`
- `_bmad-output/implementation-artifacts/1-2-append-only-evidence-ledger-artifact-index.md`
- `_bmad-output/implementation-artifacts/1-3-run-state-recovery-context-workspace-boundary.md`
- `_bmad-output/implementation-artifacts/1-4-completion-verdict-evaluator.md`
- Claude Code docs index: <https://code.claude.com/docs/llms.txt>

## Dev Agent Record

### Agent Model Used

GPT-5 (Codex)

### Debug Log References

- 2026-05-17: Added failing `tests/runtime/reports/report-renderer.test.ts`; initial failure confirmed missing `src/runtime/reports/index.ts`.
- 2026-05-17: Implemented reports runtime, verification report schema/guard updates, fixtures, and `test:reports` script.
- 2026-05-17: Validation passed: `npm run test:contracts`, `npm run test:reports`, `npm run test:evidence`, `npm run test:state`, `npm run test:verdict`, `npm run typecheck`, `npm run verify`, `claude plugin validate ./plugins/curdx-flow`.
- 2026-05-17: Code review found structured verdict array truncation could break `completionVerdict` shape; fixed redaction to preserve array item types and added regression coverage.

### Completion Notes List

- Implemented `renderVerificationReport(input)` to produce schema-valid machine JSON and human-readable Markdown from state, evidence, artifact index, blockers, and completion verdict without recalculating verdicts.
- Added transcript-visible summaries, report-only source-change labeling, degraded capability grouping, blocker/missing/manual/next-action sections, safe artifact/evidence summaries, and report privacy metadata.
- Added report redaction/truncation for long logs and sensitive token/cookie/secret/Authorization content.
- Added atomic same-directory report writes to `.curdx/reports/<run-id>.report.md` and `.curdx/reports/<run-id>.report.json` with structured blocked write failures.
- No `src/hooks/**` or generated `plugins/curdx-flow/hooks/scripts/**` source was modified for this story.

### File List

- `package.json`
- `plugins/curdx-flow/schemas/verification-report.schema.json`
- `src/runtime/contracts/index.ts`
- `src/runtime/reports/index.ts`
- `src/runtime/reports/types.ts`
- `src/runtime/reports/renderer.ts`
- `src/runtime/reports/summary.ts`
- `src/runtime/reports/redaction.ts`
- `src/runtime/reports/store.ts`
- `tests/contracts/runtime-contracts.test.ts`
- `tests/fixtures/contracts/valid/contracts.json`
- `tests/fixtures/contracts/valid/unknown-fields.json`
- `tests/runtime/reports/report-renderer.test.ts`

### Change Log

- 2026-05-17: Implemented Story 1.5 report renderer/runtime store, report contract/schema updates, focused tests, and release-quality verification.
- 2026-05-17: Addressed code review finding by preserving structured array shapes during report redaction and reran full validation.

## Review Findings

- 2026-05-17: Fixed one medium-risk finding: generic report sanitization previously truncated long arrays by appending a string placeholder, which could invalidate `verdict.unverifiedScope` when the completion verdict contract expected object items. Added regression coverage for 25-item unverified scope with sensitive text redaction.
- 2026-05-17: Final review outcome: pass. No open findings remain after `npm run verify` and `claude plugin validate ./plugins/curdx-flow`.
