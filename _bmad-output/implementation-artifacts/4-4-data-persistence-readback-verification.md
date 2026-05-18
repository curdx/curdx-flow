# Story 4.4: 数据持久化与读回验证

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为验证创建、更新、删除、提交或保存类功能的用户，
我希望 curdx-flow 能证明数据或状态真实持久化，并能通过刷新、重新查询或读回路径确认一致性，
以便 UI 成功提示或 API 200 不会被误判为真正完成。

## Acceptance Criteria

1. **读回验证执行：** 给定 user journey 包含创建、更新、删除、提交、保存、同步或设置变更，当 API/browser action 完成后，data probe 必须执行至少一种读回验证，例如刷新页面、重新查询 API、读取测试数据库状态、检查文件/队列/状态存储或调用项目已有验证命令；data evidence 必须关联具体 user action 和 API evidence。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.4`; `_bmad-output/planning-artifacts/prd.md#FR24`; `_bmad-output/planning-artifacts/architecture.md#IP-UI-005 UI/API/Data Closure`]
2. **UI 成功但数据失败阻断：** 给定 UI 显示成功但数据读回失败，当 data probe 返回结果，verdict 不得为 complete；报告必须说明 UI/API/data closure 未闭合。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.4`; `_bmad-output/planning-artifacts/prd.md#FR25`; `_bmad-output/planning-artifacts/prd.md#NFR20`]
3. **API 成功但读回不一致失败：** 给定 API 返回成功但刷新页面或重新查询后状态不一致，当 closure check 执行，evidence 必须标记 failed；nextAction 必须指出需要检查后端处理、缓存、事务、数据库、状态同步或前端回显层。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.4`; `_bmad-output/planning-artifacts/prd.md#FR23`; `_bmad-output/planning-artifacts/prd.md#FR24`]
4. **测试数据隐私与清理：** 给定数据验证需要测试数据，当系统创建、识别或使用数据记录，必须记录数据标识摘要、创建方式、隐私分类、清理策略和关联 runId；不得默认导出完整生产数据或数据库 dump。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.4`; `_bmad-output/planning-artifacts/prd.md#NFR21`; `_bmad-output/planning-artifacts/prd.md#NFR25`; `_bmad-output/planning-artifacts/architecture.md#Data Boundaries`]
5. **Mock/fixture 降级：** 给定只能使用 mock、fixture、stub 或 dev-only data，当 data evidence 写入，evidence 必须标记 degraded；报告必须说明它不能证明真实持久化。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.4`; `_bmad-output/planning-artifacts/architecture.md#IP-UI-007 Mock Is Degraded Evidence`]
6. **不可执行读回阻断：** 给定数据读回验证不可执行，例如缺数据库、缺密钥、外部服务不可用，当 data probe 失败，必须生成 blocker 或 manual-confirmation-required；不得把 browser/API 成功包装成全栈完成。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.4`; `_bmad-output/planning-artifacts/prd.md#NFR20`; `_bmad-output/planning-artifacts/prd.md#DB/migration/seed 失败`]
7. **验证覆盖：** 给定 Story 4.4 完成，当执行验证，最小验证命令必须包含 `npm run typecheck`、data probe tests；测试必须覆盖保存成功读回、UI 成功数据失败、API 成功读回不一致、mock degraded、缺数据库 blocker、敏感数据摘要。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.4`]

## Tasks / Subtasks

- [x] 定义 data readback evidence contract（AC: 1-7）
  - [x] 新增 `src/runtime/adapters/api-data/data-readback.ts` 与配套 types，或在 `src/runtime/probes/data/` 建立同等 TS-only contract；优先复用 `AdapterResult`、`EvidenceBlock`、`ExpectedDataOutcome`、`UserJourney`、4.3 `ApiEvidenceMatch`。
  - [x] Observed data readback 必须包含 actionId、关联 apiEvidenceId 或 apiEventId、strategy、target、expectedSummary、observedSummary、consistent、source/trust、dataIdSummary、createdBy、cleanupStrategy、privacy、startedAt/completedAt。
  - [x] Result 必须输出 `source: 'data'` evidence、matches、blockers、diagnostics、redactions、unverifiedScope；不得输出 completion verdict。

- [x] 实现 data readback matcher/evaluator（AC: 1-3, 6）
  - [x] 新增纯函数，例如 `evaluateDataReadbackEvidence()`，消费 `UserJourney.expectedData[]`、4.3 API matches/result 和 observed readback records。
  - [x] 按 actionId + expectedData target/readback + API evidence 绑定读回；缺少 actionId 或缺少 API 关联不得 passed。
  - [x] 保存成功且读回一致返回 passed；UI 成功但数据失败、API 成功但读回不一致返回 failed。
  - [x] 缺数据库、缺密钥、外部服务不可用、readback command 不可执行返回 blocked 或 manual-confirmation-required 形态的 blocker；AdapterResult status 仍只能用 `blocked` 表示。
  - [x] nextAction 必须指出可能层级：backend、cache、transaction、database、state-sync、frontend-render 或 external-service。

- [x] 安全摘要、测试数据元数据和 artifact 边界（AC: 4）
  - [x] 对 dataIdSummary、observedSummary、command/log 摘要复用 `summarizeArtifactText()` / `redactSensitiveText()` 或等价 redaction，隐藏 token/cookie/password/api key/session/secret。
  - [x] 不写完整生产数据、数据库 dump 或完整外部 payload；如果后续需要 artifact，路径必须 workspace-relative 且位于 `.curdx/artifacts/<runId>/data/`。
  - [x] Evidence privacy 必须包含 classification、containsSensitiveData、redacted、summaryTruncated；测试数据必须记录创建方式与清理策略。

- [x] 建立 degraded/blocker 规则（AC: 2-6）
  - [x] mock、fixture、stub、dev-only data、manual-only readback 必须 degraded，不能 passed。
  - [x] 缺读回、读回不一致、API evidence 缺失或未绑定、数据源不可用、敏感数据未脱敏都必须产生结构化 blocker/degraded/failed result。
  - [x] Blocker 必须包含 actionId、target/readback、api evidence 关联、observed summary、possibleLayer、nextAction、owner、riskLevel、retryable。

- [x] 增加 data probe/evaluator tests（AC: 1-7）
  - [x] 新增 `tests/runtime/probes/data/data-readback.test.ts` 或等价 focused tests。
  - [x] 覆盖保存成功读回、UI 成功数据失败、API 成功读回不一致、mock degraded、缺数据库 blocker、敏感数据摘要。
  - [x] Tests 使用 fake observed readbacks 与 fake API matches；不依赖真实数据库、真实网络、浏览器或外部服务。

- [x] 验证和记录（AC: 7）
  - [x] 在 `package.json` 增加 `test:data` 并接入 `verify`，除非已有同等 data probe gate。
  - [x] 运行 `npm run test:data`。
  - [x] 运行 `npm run typecheck`。
  - [x] 运行 `npm run verify`。
  - [x] 将验证命令和结果写入本 story 的 Dev Agent Record。

### Review Findings

- [x] [Review][Patch] Data readback could pass without required data metadata — fixed by blocking missing `dataIdSummary`, `cleanupStrategy`, `privacy`, or unknown creation method.
- [x] [Review][Patch] Fixture-created data could pass when `source` looked real — fixed by degrading `createdBy: fixture` and `createdBy: manual` readbacks.
- [x] [Review][Patch] Sensitive readback metadata could be marked sensitive without a recorded redaction — fixed by blocking unredacted sensitive readback evidence.

## Dev Notes

### 当前发现

- Story 4.4 是 Epic 4 的 UI/API/Data closure 中“Data”层。它必须消费 4.1 的 `UserJourney.expectedData[]`、4.2 的 action/browser context、4.3 的 API evidence/matches；不要重新发明 journey/action 标识。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.4`; `src/runtime/planner/types.ts`; `_bmad-output/implementation-artifacts/4-3-user-action-api-request-response-evidence.md#Completion Notes List`]
- `EvidenceBlock` 已支持 `source: 'data'`，`AdapterResult` 已是统一 adapter 输出形态；data adapter/probe 不得直接输出或修改 completion verdict。[Source: `src/runtime/contracts/index.ts`; `_bmad-output/planning-artifacts/architecture.md#IP-ADAPTER-003 Adapter Has No Business Verdict`]
- Architecture 明确 data checks 属于 `src/runtime/probes/data/` 或与 API/data 适配相关的 `src/runtime/adapters/api-data/`。Data 验证可通过 data probes 或 API probes 完成，但 evidence ledger 只记录事实和 artifact，不直接连接目标数据库做业务判定。[Source: `_bmad-output/planning-artifacts/architecture.md#Target Directory Contract`; `_bmad-output/planning-artifacts/architecture.md#Data Boundaries`]
- 4.3 新增 `src/runtime/adapters/api-data/**` 并暴露 `evaluateActionApiEvidence()`、`ApiEvidenceMatch`、`ActionApiEvidenceResult`。4.4 应扩展这个 API/data adapter surface 或新建 `src/runtime/probes/data/`，但输出字段和 blocker 风格要保持一致。[Source: `src/runtime/adapters/api-data/types.ts`; `src/runtime/adapters/api-data/action-api-evidence.ts`; `src/runtime/adapters/index.ts`]
- 4.3 review 修复了两个 no-false-completion 风险：required responseShape 未验证不得 passed；literal URL pattern 不得过宽匹配。4.4 同样必须避免“未执行读回”或“相似 target/readback”被误判为真实持久化成功。[Source: `_bmad-output/implementation-artifacts/4-3-user-action-api-request-response-evidence.md#Review Findings`]

### Previous Story Intelligence

- 4.1 planner 已要求 `ExpectedDataOutcome` 包含 `actionId`、`target`、`expectedState`、可选 `readback`；4.4 应直接消费这些字段。
- 4.2 browser adapter 的 artifact/blocker 结构已经包含 runId、goalId、journeyId、actionId、capabilityId、privacy、retryable 等模式；4.4 blocker 也应包含这些定位信息。
- 4.3 API evidence 已包含 `apiMatches`、`actionIds`、`unverifiedScope`、privacy/redactions 和 sanitized summaries；4.4 必须关联 API evidence id/event id，缺 API 关联时不能 passed。
- 4.3 tests 使用 fake observed events，不依赖真实网络。4.4 tests 应使用 fake readbacks 和 fake API matches，不直接打开数据库、浏览器或外部服务。
- 4.3 已新增 `test:api` 并接入 `verify`；4.4 应新增 `test:data` 并接入 `verify`，否则全量门禁不会覆盖 data probes。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | UI success/API 200 不能证明数据真的保存或状态真的改变。 |
| Runtime Directories | `src/runtime/adapters/api-data/**` 或 `src/runtime/probes/data/**`。 |
| Inputs | `UserJourney.expectedData[]`, API matches/result from 4.3, observed readbacks, runId, goalId, mode, capabilityId. |
| Outputs | `AdapterResult` with `source: 'data'` evidence, blockers, diagnostics, sanitized summaries, redactions, matches. |
| Plugin Surface | 不新增 slash command、skill、agent、hook、manifest dependency。 |
| Runtime Test | `tests/runtime/probes/data/**`。 |
| Failure Mode | missing readback, API evidence missing/unbound, UI success data fail, API success readback mismatch, mock/dev-only degraded, data source unavailable, sensitive data leakage. |
| Verification Commands | data focused tests, `npm run typecheck`, `npm run verify`。 |

### Architecture Guardrails

- Data adapter/probe 只标准化读回结果和 evidence；completion 只能由 verdict evaluator 决定。
- Do not call real database, filesystem mutation, external service, browser, curl, or network in unit tests. Fake observed readbacks are enough for this story.
- Do not persist full sensitive payloads, production rows, database dumps, queue payloads, or secret-bearing logs.
- If readback was not executed, or was executed only against mock/fixture/stub/dev-only/manual data, evidence cannot be `passed`.
- If `ExpectedDataOutcome.readback` exists but the observed readback does not prove that path, return blocked or failed, not passed.
- If API evidence is absent, degraded, failed, blocked, or not tied to the same action id, data evidence cannot close the full-stack journey by itself.
- `trustLevel: verified` may be used for real-source failed evidence; trust describes source quality, not success.

### Files To Read Before Editing

**UPDATE candidates:**

- `package.json`（add `test:data` and wire `verify`）
- `src/runtime/adapters/index.ts`（export data readback adapter if implemented under `api-data`）
- `src/runtime/adapters/api-data/index.ts`（export data readback adapter/types if implemented there）
- `src/runtime/adapters/api-data/types.ts`（only if extending shared API/data types is cleaner than a separate file）

**NEW expected:**

- `src/runtime/adapters/api-data/data-readback.ts` or `src/runtime/probes/data/data-readback.ts`
- `src/runtime/adapters/api-data/data-types.ts` or `src/runtime/probes/data/types.ts`
- `tests/runtime/probes/data/data-readback.test.ts`

**Read-only context:**

- `src/runtime/planner/types.ts`
- `src/runtime/adapters/api-data/types.ts`
- `src/runtime/adapters/api-data/action-api-evidence.ts`
- `src/runtime/adapters/browser/types.ts`
- `src/runtime/evidence/privacy.ts`
- `src/runtime/contracts/index.ts`
- `src/runtime/verdict/evaluator.ts`

## References

- `_bmad-output/planning-artifacts/epics.md#Story 4.4`
- `_bmad-output/planning-artifacts/prd.md#FR23`
- `_bmad-output/planning-artifacts/prd.md#FR24`
- `_bmad-output/planning-artifacts/prd.md#FR25`
- `_bmad-output/planning-artifacts/prd.md#FR71`
- `_bmad-output/planning-artifacts/prd.md#NFR20`
- `_bmad-output/planning-artifacts/prd.md#NFR21`
- `_bmad-output/planning-artifacts/prd.md#NFR25`
- `_bmad-output/planning-artifacts/architecture.md#IP-UI-005 UI/API/Data Closure`
- `_bmad-output/planning-artifacts/architecture.md#IP-UI-006 API Evidence Bound to User Action`
- `_bmad-output/planning-artifacts/architecture.md#IP-UI-007 Mock Is Degraded Evidence`
- `_bmad-output/planning-artifacts/architecture.md#IP-ADAPTER-002 Adapter Non-Negotiables`
- `_bmad-output/planning-artifacts/architecture.md#IP-ADAPTER-003 Adapter Has No Business Verdict`
- `_bmad-output/planning-artifacts/architecture.md#Target Directory Contract`
- `_bmad-output/implementation-artifacts/4-1-user-journey-verification-plan.md`
- `_bmad-output/implementation-artifacts/4-2-browser-adapter-screenshot-trace-evidence.md`
- `_bmad-output/implementation-artifacts/4-3-user-action-api-request-response-evidence.md`
- `src/runtime/planner/types.ts`
- `src/runtime/adapters/api-data/types.ts`
- `src/runtime/adapters/api-data/action-api-evidence.ts`
- `src/runtime/evidence/privacy.ts`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `npx vitest run tests/runtime/probes/data` — red phase failed before implementation because `evaluateDataReadbackEvidence` did not exist.
- `npm run test:data` — passed, 11 tests after review fixes.
- `npm run typecheck` — passed.
- `npx vitest run tests/runtime/planner tests/runtime/probes/browser tests/runtime/probes/api tests/runtime/probes/data` — passed, 40 tests.
- `npm run verify` — passed; includes `test:data`.

### Completion Notes List

- Added data readback evidence evaluator under `src/runtime/adapters/api-data/`.
- Data evidence is bound by user action, expected data target, and matching 4.3 API evidence event id.
- Readback mismatch, missing readback, missing/unbound/failed API evidence, unavailable data source, and degraded mock/fixture/dev-only data all return structured blockers.
- Sensitive data identifiers, readback summaries, and failure summaries are redacted and truncated before entering evidence or blockers.
- Data evidence now blocks incomplete data metadata and unredacted sensitive metadata, and degrades fixture/manual-created data even when the read path is otherwise real.
- The adapter returns `AdapterResult`-compatible `source: 'data'` evidence only; it does not emit completion verdicts.

### File List

- `src/runtime/adapters/api-data/data-types.ts`
- `src/runtime/adapters/api-data/data-readback.ts`
- `src/runtime/adapters/api-data/index.ts`
- `src/runtime/adapters/index.ts`
- `tests/runtime/probes/data/data-readback.test.ts`
- `package.json`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Started dev-story implementation.
- 2026-05-17: Implemented data persistence readback evaluator and focused data tests.
- 2026-05-17: Added `test:data` and wired it into `npm run verify`.
- 2026-05-17: `npm run test:data`, `npm run typecheck`, Epic 4 focused tests, and `npm run verify` passed; story marked review.
- 2026-05-17: Code review fixes applied for required data metadata, fixture/manual-created data degradation, and unredacted sensitive metadata blocking.
- 2026-05-17: `npm run test:data`, `npm run typecheck`, and `npm run verify` passed after review fixes; story marked done.
