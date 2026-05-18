# Story 5.1: Failure Evidence Capture and Taxonomy

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为遇到验证失败的用户，
我希望 curdx-flow 能捕获失败症状、复现路径和影响层级，并把失败归类，
以便我知道问题发生在环境、依赖、前端、后端、API、数据、浏览器能力、外部服务还是发布门禁。

## Acceptance Criteria

1. **失败证据捕获：** 给定任一 command、service、browser、API、data、capability 或 release check 失败，当 failure capture 运行，系统必须记录失败来源、复现步骤、命令/动作、关键 stdout/stderr 或浏览器/API/data 摘要、artifactRefs、时间戳和关联 evidence ids；不得只输出一段未分类错误文本。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.1`; `_bmad-output/planning-artifacts/prd.md#FR27`; `_bmad-output/planning-artifacts/architecture.md#FR27-FR32 Failure Recovery`]
2. **Failure taxonomy：** 给定失败被捕获，当 failure taxonomy 归类，必须输出 category，例如 environment、dependency、frontend、backend、api、data、browser、externalService、releaseGate、permission、unknown；分类必须包含 confidence 和选择理由。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.1`; `_bmad-output/planning-artifacts/prd.md#FR28`; `_bmad-output/planning-artifacts/architecture.md#src/runtime/recovery`]
3. **多层失败保真：** 给定同一用户旅程中多个层级失败，当 taxonomy 输出结果，系统必须保留所有失败 evidence，并标记 primary suspected layer 与 secondary symptoms，避免只看最后一个错误。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.1`; `_bmad-output/planning-artifacts/architecture.md#IP-TEST-001 Contract First`]
4. **大日志和敏感内容：** 给定失败日志很大或包含敏感内容，当 failure evidence 写入报告，报告必须使用关键窗口、摘要和 artifact 路径，不得默认泄露 secret、cookie、token、完整生产数据或超大日志。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.1`; `_bmad-output/planning-artifacts/prd.md#NFR11`; `_bmad-output/planning-artifacts/architecture.md#Data Boundaries`]
5. **未知分类不猜修：** 给定 taxonomy 无法确定原因，当输出 failure result，category 可以为 unknown，nextAction 必须要求更多诊断证据，而不是猜测修复。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.1`; `_bmad-output/planning-artifacts/architecture.md#IP-RETRY-001 Same-Path Retry`]
6. **验证覆盖：** 给定 Story 5.1 完成，当执行验证，最小验证命令必须包含 `npm run typecheck`、failure taxonomy tests；测试必须覆盖命令失败、浏览器失败、API 失败、数据失败、能力缺失、多个失败层级、敏感日志摘要和 unknown 分类。[Source: `_bmad-output/planning-artifacts/epics.md#Story 5.1`; `_bmad-output/planning-artifacts/architecture.md#Story-to-Structure Mapping Contract`]

## Tasks / Subtasks

- [x] 定义 failure capture/taxonomy contract（AC: 1-6）
  - [x] 新增 `src/runtime/recovery/` 类型和 evaluator，公开 `captureFailureEvidence()` 或等价函数。
  - [x] 输入支持 command、service、browser、api、data、capability、release failure observations，并包含 runId、goalId、journeyId/actionId、source、evidenceRefs、artifactRefs、timestamp、reproduction steps。
  - [x] 输出包含 failures、taxonomy、primary suspected layer、secondary symptoms、diagnostics、nextAction；不输出修复计划、不修改源码、不直接改 verdict。
  - [x] Category enum 至少覆盖 `environment | dependency | frontend | backend | api | data | browser | externalService | releaseGate | permission | unknown`。

- [x] 实现 failure evidence capture（AC: 1, 3-4）
  - [x] 对 command/service/browser/API/data/capability/release failure 统一生成 structured failure record。
  - [x] 记录 reproduction steps、command/action/API/data target、stdout/stderr 或摘要、artifactRefs、evidenceRefs、startedAt/completedAt 或 observedAt。
  - [x] 多失败层级不得覆盖；必须保留所有 failure records 并产生 secondary symptoms。
  - [x] 摘要必须复用现有 redaction/summarization 思路，避免 secret、cookie、token、api key、session、password 和超长日志进入结果。

- [x] 实现 taxonomy heuristics（AC: 2, 3, 5）
  - [x] 使用 source、failureCode、status、summary patterns、blocker category 和 capability state 推断 category。
  - [x] 输出 confidence、reason 和 matched signals；无法识别时输出 `unknown` 且 confidence 低。
  - [x] primary suspected layer 选择应优先根因信号，例如 environment/dependency/capability unavailable 优先于下游 browser/API/data symptom。
  - [x] unknown nextAction 必须要求补充诊断证据，不得建议具体修复。

- [x] 增加 recovery tests 和 fixture（AC: 6）
  - [x] 新增 `tests/runtime/recovery/failure-taxonomy.test.ts`。
  - [x] 新增或扩展 `tests/fixtures/broken-app/`，提供命令失败、浏览器失败、API 失败、数据失败、能力缺失和 unknown 的可复现输入摘要。
  - [x] 新增 `npm run test:recovery` 并纳入 `npm run verify`。
  - [x] 测试覆盖命令失败、浏览器失败、API 失败、数据失败、能力缺失、多个失败层级、敏感日志摘要和 unknown 分类。

- [x] 验证和记录（AC: 6）
  - [x] 运行 `npm run test:recovery`。
  - [x] 运行 `npm run typecheck`。
  - [x] 运行 `npm run verify`。
  - [x] 将验证命令和结果写入本 story 的 Dev Agent Record。

### Review Findings

- [x] [Review][Patch] External service API failures were classified as generic API failures because source-specific classification ran before external-service signals — fixed by prioritizing external-service signals before API/browser/data source defaults.
- [x] [Review][Patch] Sensitive values in command argv, reproduction steps, URL, and taxonomy signals could leak even when stdout/stderr summaries were redacted — fixed by field-level redaction/truncation and added regression coverage.

## Dev Notes

### 当前发现

- Epic 5 依赖 Epic 4 的 failure evidence。4.6 已经能组合 browser/API/data/UI evidence、blockers、artifactIndex、report 和 final verdict；5.1 应消费这些失败形态，而不是改变 4.6 的 verdict 逻辑。
- `src/runtime/recovery/` 当前不存在；本 story 应建立最小 failure taxonomy 边界，为后续 5.2 recovery planner、5.3 fix attempt lineage、5.4 same-path retry、5.5 retry caps 使用。
- Architecture 明确 `src/runtime/recovery` 负责失败分类、修复计划、same-path retry 状态，但不得直接编辑源码或发布。
- 现有摘要/脱敏可参考 `src/runtime/evidence/privacy.ts`、`src/runtime/reports/redaction.ts`、4.3 API evidence、4.4 data readback、4.5 UI diagnostics。
- Failure capture 是 facts/evidence 层，不是 repair 层。不要在 5.1 生成代码修复动作；unknown 分类必须要求更多诊断证据。

### Previous Story Intelligence

- 4.6 review 修复了返回 state 与 final verdict 不一致的问题。5.1 输出的 failure state/result 也必须避免“报告里是 blocked，但返回结构还像 running/pending”的不一致。
- 4.6 tests 证明 report 可以显示 API/data/UI blockers 和 artifact refs。5.1 应把这些 blocker/evidence/artifact refs 归一化为 failure records。
- 4.3/4.4/4.5 已经建立 API/data/UI blocker code 和 possibleLayer/category 信号；taxonomy 应优先复用这些结构化字段，不要只依赖错误文本 grep。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 用户看到失败时需要知道失败来源、复现路径和影响层级，而不是一段未分类日志。 |
| Runtime Directories | `src/runtime/recovery/**`。 |
| Plugin Surface | 不新增 slash command、skill、agent、hook、manifest dependency。 |
| Schema | 不新增 persisted schema；使用 TypeScript contract。若后续落盘到 `.curdx/state` 或 `.curdx/reports`，必须同步 schema/test。 |
| Contract Test | 本 story 以 runtime typed contract + recovery unit tests 为主；若新增 schema 字段，补 `tests/contracts/**`。 |
| Runtime Test | `tests/runtime/recovery/failure-taxonomy.test.ts`。 |
| Fixture | `tests/fixtures/broken-app/`，包含可复现 failure input 摘要。 |
| Evidence Output | Structured failure records carrying evidenceRefs/artifactRefs; later stories可写入 `.curdx/evidence/**` 或 recovery state。 |
| Report Surface | 结果可被 reports 消费：category、confidence、reason、primary suspected layer、secondary symptoms、nextAction。 |
| Failure Mode | command failure、browser failure、API failure、data failure、capability missing、多层失败、sensitive log、unknown。 |
| Verification Commands | `npm run test:recovery`, `npm run typecheck`, `npm run verify`。 |

### Architecture Guardrails

- 5.1 只做 failure capture/taxonomy，不做修复计划、不执行修复、不做 same-path retry。
- Failure records 必须保留 evidenceRefs/artifactRefs 和 reproduction steps，避免后续 recovery planner 丢失上下文。
- 多层失败必须保留所有记录，primary suspected layer 不能通过“最后一个错误”决定。
- 敏感内容默认脱敏和截断；完整日志只能通过 artifactRefs 指向，不直接塞进 summary。
- Dirty worktree 不清理、不回滚；只改 recovery runtime、tests、fixture、package script 和 story/sprint 文件。

### Files To Read Before Editing

**UPDATE candidates:**

- `package.json`

**NEW expected:**

- `src/runtime/recovery/types.ts`
- `src/runtime/recovery/failure-taxonomy.ts`
- `src/runtime/recovery/index.ts`
- `tests/runtime/recovery/failure-taxonomy.test.ts`
- `tests/fixtures/broken-app/README.md`
- `tests/fixtures/broken-app/failures.json`

**Read-only context:**

- `src/runtime/adapters/api-data/action-api-evidence.ts`
- `src/runtime/adapters/api-data/data-readback.ts`
- `src/runtime/adapters/browser/ui-diagnostics.ts`
- `src/runtime/probes/full-stack/index.ts`
- `src/runtime/evidence/privacy.ts`
- `src/runtime/reports/redaction.ts`

## References

- `_bmad-output/planning-artifacts/epics.md#Story 5.1`
- `_bmad-output/planning-artifacts/prd.md#FR27`
- `_bmad-output/planning-artifacts/prd.md#FR28`
- `_bmad-output/planning-artifacts/architecture.md#src/runtime/recovery`
- `_bmad-output/planning-artifacts/architecture.md#FR27-FR32 Failure Recovery`
- `_bmad-output/planning-artifacts/architecture.md#IP-TEST-001 Contract First`
- `_bmad-output/planning-artifacts/architecture.md#IP-RETRY-001 Same-Path Retry`
- `_bmad-output/implementation-artifacts/4-6-full-stack-journey-fixtures-degraded-mock-handling.md`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `npx vitest run tests/runtime/recovery/failure-taxonomy.test.ts` — red phase failed before implementation because `src/runtime/recovery/index.ts` did not exist.
- `npm run test:recovery` — passed, 9 tests.
- `npm run typecheck` — passed.
- `npm run verify` — passed.
- `npm run test:recovery && npm run typecheck` — passed after review fixes, 10 recovery tests.
- `npm run verify` — passed after review fixes.

### Completion Notes List

- Added typed failure capture/taxonomy contracts under `src/runtime/recovery/`.
- Implemented `captureFailureEvidence()` to normalize command/service/browser/API/data/capability/release failures into structured records with reproduction steps, evidence refs, artifact refs, timestamps, redacted summaries, confidence, reason, and signals.
- Added taxonomy heuristics for environment, dependency, frontend, backend, api, data, browser, externalService, releaseGate, permission, and unknown categories.
- Added primary suspected layer selection with secondary symptoms preserved for multi-layer failures.
- Added unknown nextAction behavior that asks for more diagnostic evidence instead of guessing a fix.
- Added `tests/fixtures/broken-app/` and recovery tests covering command, browser, API, data, capability, multi-layer, sensitive log, and unknown cases.
- Added `npm run test:recovery` and included it in `npm run verify`.
- Resolved review findings for external-service categorization and field-level redaction of command/reproduction/URL/signals.

### File List

- `package.json`
- `src/runtime/recovery/types.ts`
- `src/runtime/recovery/failure-taxonomy.ts`
- `src/runtime/recovery/index.ts`
- `tests/runtime/recovery/failure-taxonomy.test.ts`
- `tests/fixtures/broken-app/README.md`
- `tests/fixtures/broken-app/failures.json`
- `_bmad-output/implementation-artifacts/5-1-failure-evidence-capture-taxonomy.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Started dev-story implementation.
- 2026-05-17: Implemented failure evidence capture/taxonomy, broken-app fixture, recovery tests, and `test:recovery` verify integration.
- 2026-05-17: `npm run test:recovery`, `npm run typecheck`, and `npm run verify` passed; story marked review.
- 2026-05-17: Code review fixes applied for external-service classification and sensitive field redaction; `npm run verify` passed; story marked done.
