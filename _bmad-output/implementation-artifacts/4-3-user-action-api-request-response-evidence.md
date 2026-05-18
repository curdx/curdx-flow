# Story 4.3: 用户动作绑定的 API 请求与响应证据

Status: done

完成说明：已实现用户动作绑定的 API request/response evidence，并完成代码审查修复与验证。

## Story

作为验证全栈功能的用户，
我希望 curdx-flow 能证明页面上的用户动作触发了预期 API 请求，并记录真实响应结果，
以便报告能说明前端和后端真的联通，而不是孤立 curl 或 mock 响应。

## Acceptance Criteria

1. **动作绑定 API evidence：** 给定 user journey plan 中包含需要触发 API 的用户动作，当 browser/API probe 执行动作时，系统必须捕获该动作关联的 API 请求、方法、URL、状态码、请求摘要、响应摘要和时间关系；API evidence 必须绑定到具体 action id，不得作为孤立请求冒充用户旅程证据。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.3`; `_bmad-output/planning-artifacts/prd.md#FR21`; `_bmad-output/planning-artifacts/architecture.md#IP-UI-006 API Evidence Bound to User Action`]
2. **响应要求验证：** 给定 API 响应需要符合任务要求，当 response 被检查时，系统必须验证状态码、响应体关键字段、错误码或 schema/contract 结果；不符合要求时必须生成 blocker 或 failed evidence。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.3`; `_bmad-output/planning-artifacts/prd.md#FR22`; `_bmad-output/planning-artifacts/prd.md#NFR22`]
3. **请求缺失阻断：** 给定前端操作未触发预期 API 请求，当 network/API 观察结束时，verdict 不得为 complete；报告必须说明缺失的请求、用户动作和可能层级。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.3`; `_bmad-output/planning-artifacts/prd.md#FR18`; `_bmad-output/planning-artifacts/prd.md#FR21`]
4. **UI/API 不一致：** 给定 API 请求成功但响应体与 UI 或数据状态不一致，当 API evidence 被写入时，evidence 必须标记为 failed 或 inconclusive；后续必须由 data/UI closure 验证决定最终 verdict。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.3`; `_bmad-output/planning-artifacts/prd.md#FR23`; `_bmad-output/planning-artifacts/architecture.md#IP-UI-005 UI/API/Data Closure`]
5. **Mock/curl 降级：** 给定只能通过人工 curl、mock server 或 fixture 响应构造 API 结果，当没有用户动作绑定时，evidence 必须标记 degraded；不得单独支撑前端/全栈用户旅程完成。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.3`; `_bmad-output/planning-artifacts/architecture.md#IP-UI-007 Mock Is Degraded Evidence`]
6. **敏感响应安全摘要：** 给定 API response 包含敏感字段、token、cookie 或大量数据，当写入 artifact 和报告时，系统必须保留安全摘要或 redaction 后内容；不得默认把完整敏感响应写入 transcript。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.3`; `_bmad-output/planning-artifacts/prd.md#NFR21`; `_bmad-output/planning-artifacts/prd.md#NFR25`]
7. **验证覆盖：** 给定 Story 4.3 完成，当执行验证时，最小验证命令必须包含 `npm run typecheck`、API probe/contract tests；测试必须覆盖用户动作绑定请求、请求缺失、错误状态码、schema mismatch、mock degraded、敏感响应摘要、UI/API 不一致。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.3`]

## Tasks / Subtasks

- [x] 定义 action-bound API evidence contract（AC: 1-7）
  - [x] 新增 `src/runtime/adapters/api-data/` 或 `src/runtime/probes/api/` TS-only contract，优先复用 `AdapterResult`、`EvidenceBlock`、`ArtifactIndexInput`、`ExpectedApiInteraction`、`UserJourney`、4.2 `BrowserActionOutcome`。
  - [x] API event 必须包含 actionId、method、url、status、requestSummary、responseSummary、startedAt/completedAt 或相对时间、source/trust、mock/fixture 标记。
  - [x] API result 必须输出 `source: 'api'` evidence、blockers、diagnostics、redactions、unverifiedScope，不得输出 completion verdict。

- [x] 实现 API request/response matcher（AC: 1-4）
  - [x] 新增纯函数/adapter，例如 `evaluateActionApiEvidence()`，消费 journey expectedApi 与 observed API events。
  - [x] 按 actionId + method + urlPattern 绑定请求；孤立 curl 或未绑定 actionId 只能 degraded，不能 passed。
  - [x] 验证 expectedStatus、可选 responseShape/schema/关键字段、错误码；不匹配返回 failed/blocked evidence。
  - [x] API 成功但 UI/data closure 标记不一致时，返回 failed/inconclusive 并保留后续 data/UI closure next action。

- [x] 安全摘要和 artifact 输出（AC: 6）
  - [x] 对 request/response 摘要复用 `redactSensitiveText()` 或等价红线，隐藏 token/cookie/password/api key。
  - [x] 限制摘要长度，不默认写完整 response body；artifact path 如有持久化必须 workspace-relative 且位于 `.curdx/artifacts/<runId>/api/`。
  - [x] Privacy classification 必须存在；敏感内容 redacted 后仍标记 containsSensitiveData。

- [x] 建立 degraded/blocker 规则（AC: 2-5）
  - [x] 缺请求、错误状态码、schema mismatch、actionId 不匹配、mock-only、UI/API 不一致都必须有结构化 blocker/degraded/failed result。
  - [x] Blocker 必须包含 actionId、expected method/url/status、observed summary、possible layer、next action、owner、riskLevel。

- [x] 增加 API probe/contract tests（AC: 1-7）
  - [x] 新增 `tests/runtime/probes/api/action-api-evidence.test.ts` 或等价 focused tests。
  - [x] 覆盖用户动作绑定请求、请求缺失、错误状态码、schema mismatch、mock degraded、敏感响应摘要、UI/API 不一致。
  - [x] Tests 使用 fake observed API events；不依赖真实网络、curl、browser 或服务。

- [x] 验证和记录（AC: 7）
  - [x] 运行 API focused tests。
  - [x] 运行 `npm run typecheck`。
  - [x] 运行 `npm run verify`。
  - [x] 将验证命令和结果写入本 story 的 Dev Agent Record。

### Review Findings

- [x] [Review][Patch] Required response shape without schema validation could pass — fixed by adding `api-schema-unverified` blocker and regression coverage.
- [x] [Review][Patch] Literal URL pattern matching could overmatch similarly named endpoints — fixed by making simple path/URL patterns exact except query strings, with regression coverage.
- [x] [Review][Patch] Sensitive JSON token variants such as `accessToken` and `refresh_token` were not covered by the local API summary redactor — fixed and covered in the sensitive summary test.

## Dev Notes

### 当前发现

- Story 4.1 已要求 API expectation 必须绑定 journey action id，并在 invalid binding 时输出 missing evidence。4.3 应消费这些 validated expectations，不重新发明 journey/action 语言。[Source: `_bmad-output/implementation-artifacts/4-1-user-journey-verification-plan.md#Review Findings`; `src/runtime/planner/types.ts`]
- Story 4.2 已定义 browser action outcome、browser evidence 和 artifact/blocker patterns。4.3 应复用 actionId、runId、goalId、journeyId、capabilityId 和 blocker 风格，避免 API evidence 与 browser evidence 脱节。[Source: `_bmad-output/implementation-artifacts/4-2-browser-adapter-screenshot-trace-evidence.md#Completion Notes List`; `src/runtime/adapters/browser/types.ts`]
- `EvidenceBlock` 已支持 `source: 'api'`，`ArtifactIndexEntry` 已支持 `request`/`response` artifact 类型。优先复用，不新增平行 evidence schema。[Source: `src/runtime/contracts/index.ts`; `plugins/curdx-flow/schemas/evidence.schema.json`; `plugins/curdx-flow/schemas/artifact-index.schema.json`]
- Architecture 明确 API/data adapter 属于 `src/runtime/adapters/api-data/`，API probe 属于 `src/runtime/probes/api/`，adapter 不能做 business verdict。[Source: `_bmad-output/planning-artifacts/architecture.md#Target Directory Contract`; `_bmad-output/planning-artifacts/architecture.md#IP-ADAPTER-003 Adapter Has No Business Verdict`]
- IP-UI-006 禁止孤立 curl、mock 请求或人工构造响应单独支撑用户旅程完成；mock/fixture/stub/dev-only data 必须 degraded。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-UI-006 API Evidence Bound to User Action`; `_bmad-output/planning-artifacts/architecture.md#IP-UI-007 Mock Is Degraded Evidence`]

### Previous Story Intelligence

- 4.2 review 修复了 artifact path 越界、port 少报计划动作、report-only 直接执行 unsafe action、截图无质量元数据被误用等问题。4.3 需要同样防止“部分观察结果冒充完整 API evidence”。
- 4.2 新增 `test:browser` 并接入 `verify`；4.3 如果新增 `test:api`，也应接入 `verify`，否则全量门禁不会跑 API tests。
- 4.2 tests 使用 fake ports/temp workspace。4.3 tests 应使用 fake observed API events，禁止真实网络依赖。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 证明用户动作真的触发后端 API，而不是孤立 curl/mock。 |
| Runtime Directories | `src/runtime/adapters/api-data/**` 或 `src/runtime/probes/api/**`。 |
| Inputs | `UserJourney.expectedApi[]`, observed API events, browser action outcomes, runId, goalId, mode, capabilityId. |
| Outputs | `AdapterResult` with `source: 'api'` evidence, blockers, diagnostics, sanitized summaries, redactions. |
| Plugin Surface | 不新增 slash command、skill、agent、hook、manifest dependency。 |
| Runtime Test | `tests/runtime/probes/api/**`。 |
| Failure Mode | missing request, wrong status, schema mismatch, mock-only, unbound curl, UI/API mismatch, sensitive payload. |
| Verification Commands | API focused tests, `npm run typecheck`, `npm run verify`。 |

### Architecture Guardrails

- API adapter/probe executes matching and summarization; verdict evaluator remains the only completion authority.
- Do not call real curl/fetch/network in tests. Fake observed events are enough for this story.
- Do not persist full sensitive payloads. Redact Authorization/Cookie/Set-Cookie/Bearer/token/api_key/secret/password/session/cookie patterns.
- If actionId is missing or does not match a planned action, evidence cannot be `passed`.
- If API event comes from mock/fixture/curl without action binding, evidence is degraded even if status is 200.
- If response status/body/schema mismatch occurs, return failed evidence or blocker with expected vs observed summary.
- UI/API/data closure remains multi-story: 4.3 can flag inconsistency and next action, but 4.4 owns data readback closure.

### Files To Read Before Editing

**UPDATE candidates:**

- `package.json`（if adding `test:api` and wiring verify）
- `src/runtime/adapters/index.ts`（if exporting API adapter）
- `src/runtime/contracts/index.ts`（only if existing contracts cannot represent API result）

**NEW expected:**

- `src/runtime/adapters/api-data/types.ts`
- `src/runtime/adapters/api-data/action-api-evidence.ts`
- `src/runtime/adapters/api-data/index.ts`
- `tests/runtime/probes/api/action-api-evidence.test.ts`

**Read-only context:**

- `src/runtime/planner/types.ts`
- `src/runtime/adapters/browser/types.ts`
- `src/runtime/evidence/privacy.ts`
- `src/runtime/contracts/index.ts`
- `src/runtime/verdict/evaluator.ts`

## References

- `_bmad-output/planning-artifacts/epics.md#Story 4.3`
- `_bmad-output/planning-artifacts/prd.md#FR21`
- `_bmad-output/planning-artifacts/prd.md#FR22`
- `_bmad-output/planning-artifacts/prd.md#FR23`
- `_bmad-output/planning-artifacts/prd.md#NFR21`
- `_bmad-output/planning-artifacts/prd.md#NFR22`
- `_bmad-output/planning-artifacts/prd.md#NFR25`
- `_bmad-output/planning-artifacts/architecture.md#IP-UI-005 UI/API/Data Closure`
- `_bmad-output/planning-artifacts/architecture.md#IP-UI-006 API Evidence Bound to User Action`
- `_bmad-output/planning-artifacts/architecture.md#IP-UI-007 Mock Is Degraded Evidence`
- `_bmad-output/implementation-artifacts/4-1-user-journey-verification-plan.md`
- `_bmad-output/implementation-artifacts/4-2-browser-adapter-screenshot-trace-evidence.md`
- `src/runtime/planner/types.ts`
- `src/runtime/adapters/browser/types.ts`
- `src/runtime/evidence/privacy.ts`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `npm run test:api` — passed, 9 tests.
- `npm run typecheck` — passed.
- `npm run verify` — passed.

### Completion Notes List

- Added action-bound API evidence adapter under `src/runtime/adapters/api-data/`.
- API evidence is bound by `actionId + method + urlPattern`; unbound mock/curl/fixture/manual observations cannot pass.
- Expected status, schema/contract result, UI consistency, and data consistency produce structured failed/blocked/degraded outcomes.
- Sensitive request/response summaries are redacted and capped before entering evidence, blockers, or match summaries.
- No completion verdict is emitted by the adapter; it returns `AdapterResult`-compatible evidence for later verdict evaluation.

### File List

- `src/runtime/adapters/api-data/types.ts`
- `src/runtime/adapters/api-data/action-api-evidence.ts`
- `src/runtime/adapters/api-data/index.ts`
- `src/runtime/adapters/index.ts`
- `tests/runtime/probes/api/action-api-evidence.test.ts`
- `package.json`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Started dev-story implementation.
- 2026-05-17: Implemented action-bound API evidence adapter and API focused tests.
- 2026-05-17: Code review fixes applied for schema-unverified blocking, literal URL matching, evidence timing, and sensitive token redaction.
- 2026-05-17: `npm run test:api`, `npm run typecheck`, and `npm run verify` passed; story marked done.
