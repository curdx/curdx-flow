# Story 4.6: Full-Stack Journey Fixtures and Degraded Mock Handling

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为 curdx-flow 维护者，
我希望 Browser/API/Data 用户旅程验证有可运行的全栈 fixtures，并严格区分真实证据和 mock/degraded evidence，
以便 no false completion 能在真实路径和降级路径中都被测试验证。

## Acceptance Criteria

1. **全栈保存/CRUD 成功 fixture：** 给定 Epic 4 用户旅程验证能力被实现，当 fixture tests 运行，必须至少覆盖一个全栈保存或 CRUD 旅程，包含页面操作、API 请求、后端处理、数据读回、UI 回显和截图/trace evidence；成功 fixture 必须产生 L3 user-journey evidence。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.6`; `_bmad-output/planning-artifacts/prd.md#FR15`; `_bmad-output/planning-artifacts/prd.md#FR19-FR26`; `_bmad-output/planning-artifacts/prd.md#FR71`; `_bmad-output/planning-artifacts/architecture.md#Evidence Trust Model`; `_bmad-output/planning-artifacts/architecture.md#IP-UI-001 Journey Evidence`; `_bmad-output/planning-artifacts/architecture.md#IP-UI-005 UI/API/Data Closure`]
2. **mock/stub/fixture/dev-only 降级：** 给定 fixture 使用 mock、stub、fixture data 或 dev-only server，当 evidence 被写入，evidence 必须标记 degraded；verdict 不得因为 mock 路径通过而声明真实全栈 complete。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.6`; `_bmad-output/planning-artifacts/architecture.md#IP-UI-007 Mock Is Degraded Evidence`; `_bmad-output/planning-artifacts/architecture.md#Evidence Trust Model`]
3. **页面通过但 API 失败：** 给定 fixture 模拟页面可访问但 API 失败，当用户旅程运行，报告必须显示 browser evidence 通过但 API evidence 失败；final verdict 必须为 blocked 或 partial。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.6`; `_bmad-output/planning-artifacts/prd.md#FR20-FR23`; `_bmad-output/planning-artifacts/architecture.md#IP-UI-006 API Evidence Bound to User Action`]
4. **API 成功但数据未保存：** 给定 fixture 模拟 API 成功但数据未保存，当 data read-back 运行，报告必须显示 UI/API/data closure 未闭合；final verdict 不得为 complete。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.6`; `_bmad-output/planning-artifacts/prd.md#FR23-FR25`; `_bmad-output/planning-artifacts/architecture.md#IP-UI-005 UI/API/Data Closure`]
5. **Console/Network/视觉失败：** 给定 fixture 模拟 console error、network failure、空白页或视觉遮挡，当 browser diagnostics 运行，report 必须列出相关问题和 artifact；final verdict 必须反映 severity 和 missing/failed evidence。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.6`; `_bmad-output/planning-artifacts/architecture.md#IP-UI-002 Screenshot or Trace Required`; `_bmad-output/planning-artifacts/architecture.md#IP-UI-004 Observable Styling Standard`]
6. **不依赖真实外部 MCP 或用户机器状态：** 给定 CI 或本地测试运行，浏览器、API、data、UX adapter 可使用 fake adapter 或受控 app；若真实浏览器不可用，测试必须提供 skip-with-reason 或替代 fake coverage。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.6`; `_bmad-output/planning-artifacts/architecture.md#Fixture and Evidence Rules`; Claude Code docs checked 2026-05-17: `https://code.claude.com/docs/llms.txt`, `https://code.claude.com/docs/en/chrome.md`]
7. **验证覆盖：** 给定 Story 4.6 完成，当执行验证，最小验证命令必须包含 `npm run typecheck`、full-stack journey fixture tests；测试必须覆盖 happy path、mock degraded、API failure、data failure、console/network failure、screenshot/trace artifact 和 verdict 输出。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.6`; `_bmad-output/planning-artifacts/architecture.md#Story-to-Structure Mapping Contract`]

## Tasks / Subtasks

- [x] 定义全栈 journey fixture harness（AC: 1-7）
  - [x] 新增 `src/runtime/probes/full-stack/` 或等价 runtime composition 模块，负责组合已有 browser/API/data/UI evaluator 和 verdict evaluator。
  - [x] 输入必须包含 `runId`、`goalId`、`mode`、`UserJourney`、browser execution result、observed API events、observed data readbacks、UI diagnostics observations、artifact index、capability status。
  - [x] 输出必须包含 `AdapterResult` 风格分层结果、combined evidence、blockers、diagnostics、artifact refs、final `CompletionVerdict`，但不得让单个 adapter 自行决定 final verdict。
  - [x] Composition 必须复用 `executeBrowserJourney()`、`evaluateActionApiEvidence()`、`evaluateDataReadbackEvidence()`、`evaluateUiDiagnosticsEvidence()`、`evaluateCompletionVerdict()`；不要重写 4.2-4.5 的匹配、脱敏、degraded 和 blocker 规则。

- [x] 建立可运行的 fullstack fixture（AC: 1, 6）
  - [x] 新增 `tests/fixtures/fullstack-app/`，按用户旅程组织，包含最小页面、API handler、内存或文件型数据存储、启动脚本和 README/expected summary。
  - [x] fixture 必须能表达一个保存或 CRUD 旅程，例如 profile save：页面填表/点击保存 -> `PATCH /api/profile` -> 数据写入 -> `GET /api/profile` 读回 -> UI 显示已保存数据。
  - [x] fixture 可以是受控本地 fake app，不依赖真实 Chrome、真实 MCP、真实外部服务、真实数据库或用户登录态。
  - [x] 截图/trace artifact 可使用 fake artifact content/path，但必须走 4.2 artifact indexing/quality 规则，能被 evidence/report/verdict tests 消费。

- [x] 覆盖 happy path L3 evidence 和 complete verdict（AC: 1）
  - [x] happy path 必须产生 `source: 'browser' | 'api' | 'data'` 的 verified passed evidence。
  - [x] browser evidence 必须包含页面动作和截图/trace artifact；API evidence 必须绑定 `actionId + method + urlPattern`；data evidence 必须绑定同一 action/API event 并记录 metadata、privacy、cleanup strategy。
  - [x] final verdict 对 `taskType: 'fullstack'` 必须为 `complete`，并且 evidenceRefs 覆盖 browser/API/data 三类核心 evidence。

- [x] 覆盖 mock/degraded 路径（AC: 2, 6）
  - [x] mock、stub、fixture response、dev-only data、manual/curl 等来源必须在对应 evidence 上保持 `status: 'degraded'` 或 `trustLevel: 'degraded'`。
  - [x] final verdict 对 degraded evidence 必须为 `blocked` 或 `partial`，不得 `complete`。
  - [x] 测试应明确断言 degraded reason 或 unverifiedScope，防止“mock 路径全绿但 verdict complete”回归。

- [x] 覆盖 API failure 和 data failure（AC: 3-4）
  - [x] 页面可访问且 browser evidence passed、API 返回 500/contract mismatch/请求缺失时，report/verdict 必须显示 API evidence failed/blocked，final verdict 不得 complete。
  - [x] API 200 且 UI success 但 data readback `consistent: false` 或 readback unavailable 时，report/verdict 必须显示 UI/API/data closure 未闭合，final verdict 不得 complete。
  - [x] failure blockers 必须保留可执行 nextAction，指向同一路径重跑或检查 frontend/API/backend/data 层。

- [x] 覆盖 console/network/visual artifact 场景（AC: 5）
  - [x] console error、uncaught exception、failed network request、空白页、视觉遮挡至少覆盖其中可复现的关键组合；每类问题必须进入 diagnostics/blockers 和 report artifact/evidence summary。
  - [x] screenshot/trace artifact 的 evidenceRefs 必须能在 report 中看到；空白或视觉遮挡不得被成功截图掩盖。

- [x] 增加 tests 和 package script（AC: 7）
  - [x] 新增 `tests/runtime/probes/full-stack-save.test.ts` 或 `tests/runtime/probes/full-stack/*.test.ts`。
  - [x] 新增 `npm run test:fullstack`，并纳入 `npm run verify`。
  - [x] 最小测试覆盖 happy path、mock degraded、API failure、data failure、console/network failure、screenshot/trace artifact 和 verdict 输出。

- [x] 验证和记录（AC: 7）
  - [x] 运行 `npm run test:fullstack`。
  - [x] 运行 `npm run typecheck`。
  - [x] 运行 Epic 4 focused tests：`npx vitest run tests/runtime/probes/browser tests/runtime/probes/api tests/runtime/probes/data tests/runtime/probes/full-stack-save.test.ts`（按实际路径调整）。
  - [x] 运行 `npm run verify`。
  - [x] 将验证命令和结果写入本 story 的 Dev Agent Record。

### Review Findings

- [x] [Review][Patch] `evaluateFullStackJourney()` returned `result.state` as `running/pending` while the report used the final verdict state — fixed by returning the same finalized `StateLedger` used for report rendering and adding regression assertions.

## Dev Notes

### 当前发现

- 4.2-4.5 已经分别实现 browser execution、action-bound API evidence、data readback、UI diagnostics。4.6 的核心是“组合和 fixture 证明”，不是重做任何单一 evaluator。
- `evaluateCompletionVerdict()` 对 `taskType: 'fullstack'` 默认要求 browser/API/data evidence，且会拒绝 `status !== 'passed'` 或 `trustLevel === 'degraded'` 的 evidence。4.6 应直接利用这个规则证明 no false completion。
- `renderVerificationReport()` 已经能渲染 evidence summaries、artifact refs、missingEvidence、blockers、verdict 和 degraded reason。4.6 的 report 断言应验证这些字段被喂入报告，而不是创建平行报告格式。
- `EvidenceBlock.source` 没有 `ux`；UI diagnostics 继续使用 `source: 'browser'`，不要新增 schema enum，除非同步 contract/schema/tests。
- `tests/fixtures/runtime-readiness/fullstack-app/` 只用于 readiness，不满足 Story 4.6 的 journey fixture 目标；本 story 应新增或迁移到 `tests/fixtures/fullstack-app/`，按用户旅程组织。
- 官方 Claude Code Chrome 文档显示 Chrome 集成可用于本地 web app 测试、console debugging、表单操作和数据提取，但处于 beta 且依赖用户机器/扩展状态。4.6 tests 必须使用 fake/controlled coverage，不应强依赖真实 Chrome 或 MCP。

### Previous Story Intelligence

- 4.5 review 修复了两个容易造成假阳性的点：skipped/degraded UI state 必须有原因；required viewport 即使标记 checked，也必须有 screenshot/trace evidenceRefs。
- 4.4 review 强化了 data metadata、fixture/manual degradation、敏感读回脱敏。4.6 的 happy path data readback 不能缺 `dataIdSummary`、`createdBy`、`cleanupStrategy`、`privacy`。
- 4.3 review 强化了 API literal matching 和 required response shape validation。4.6 的 fixture 不应只断言 `/api/profile` 字符串出现，而应让 expectedApi 和 observed event 通过现有 matcher。
- 4.2 browser adapter 已经有 artifact quality blocker。4.6 只需提供可被 `executeBrowserJourney()` 索引的 fake screenshot/trace artifact，不要手写 artifact index。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 用户不想靠 mock、截图或单独 API 结果猜测全栈功能是否真的完成；需要可复现 fixture 证明 no false completion。 |
| Runtime Directories | `src/runtime/probes/full-stack/**` 或最小 composition helper；复用 `src/runtime/adapters/{browser,api-data}/**`、`src/runtime/verdict/**`、`src/runtime/reports/**`。 |
| Plugin Surface | 不新增 slash command、skill、agent、hook、manifest dependency；本 story 是 runtime/test fixture 层。 |
| Schema | 不新增 schema；复用 `EvidenceBlock`、`AdapterResult`、`CompletionVerdict`、`VerificationReport`。若新增跨边界字段，必须同步 schema/type/contract test。 |
| Contract Test | 现有 `tests/contracts/**` 应继续覆盖 schema；若新增 persisted JSON contract，增加对应 contract test。 |
| Runtime Test | `tests/runtime/probes/full-stack-save.test.ts` 或 `tests/runtime/probes/full-stack/**/*.test.ts`。 |
| Fixture | `tests/fixtures/fullstack-app/`，包含 happy path 和故障模式可控输入。 |
| Evidence Output | `.curdx/evidence/<run-id>.evidence.jsonl` style evidence blocks、`.curdx/artifacts/**` screenshot/trace artifact refs、`.curdx/reports/<run-id>.report.md` / verdict JSON 的可消费结构。 |
| Report Surface | `renderVerificationReport()` 输出 markdown/json 能显示 browser/API/data/UI evidence、artifact refs、blockers、missingEvidence、final verdict。 |
| Failure Mode | mock degraded、API failure、data readback mismatch/unavailable、console/network/visual failure。 |
| Verification Commands | `npm run test:fullstack`, `npm run typecheck`, Epic 4 focused tests, `npm run verify`。 |

### Architecture Guardrails

- Adapter/evaluator 只输出 evidence、blockers、diagnostics；final verdict 只能由 `evaluateCompletionVerdict()` 得出。
- Full-stack completion 必须依赖 browser + API + data verified passed evidence。UI diagnostics 可以增加 browser evidence/remaining risk，但不能替代 data closure。
- Mock、stub、fixture response、dev-only data、manual/curl source 不得升格为 verified L3 evidence。
- 测试不能依赖真实外部 MCP、Chrome 扩展、用户登录态、数据库密钥或端口状态；真实浏览器不可用时用 fake adapter/controlled app 证明 runtime contract。
- 不要在 `src/hooks/**` 实现 journey execution、planner、verdict 或长流程。4.6 不需要改 hooks，也不需要重建 hook bundles。
- 敏感 API/data/UI 摘要必须使用现有 redaction/summarization 路径；不要把完整 response、DOM、console dump 写入 report。
- Worktree 很脏，实施时只改本 story 相关 runtime/tests/package/script 文件，不整理无关变更。

### Files To Read Before Editing

**UPDATE candidates:**

- `package.json`
- `src/runtime/adapters/index.ts`
- `src/runtime/reports/renderer.ts`
- `src/runtime/verdict/evaluator.ts`

**NEW expected:**

- `src/runtime/probes/full-stack/save-journey.ts`
- `src/runtime/probes/full-stack/index.ts`
- `tests/runtime/probes/full-stack-save.test.ts`
- `tests/fixtures/fullstack-app/package.json`
- `tests/fixtures/fullstack-app/scripts/*.mjs`
- `tests/fixtures/fullstack-app/README.md`

**Read-only context:**

- `src/runtime/adapters/browser/executor.ts`
- `src/runtime/adapters/browser/ui-diagnostics.ts`
- `src/runtime/adapters/api-data/action-api-evidence.ts`
- `src/runtime/adapters/api-data/data-readback.ts`
- `src/runtime/verdict/types.ts`
- `src/runtime/reports/types.ts`
- `tests/runtime/probes/browser/browser-adapter.test.ts`
- `tests/runtime/probes/api/action-api-evidence.test.ts`
- `tests/runtime/probes/data/data-readback.test.ts`
- `tests/runtime/verdict/verdict-evaluator.test.ts`

## References

- `_bmad-output/planning-artifacts/epics.md#Story 4.6`
- `_bmad-output/planning-artifacts/prd.md#FR15`
- `_bmad-output/planning-artifacts/prd.md#FR19`
- `_bmad-output/planning-artifacts/prd.md#FR20`
- `_bmad-output/planning-artifacts/prd.md#FR21`
- `_bmad-output/planning-artifacts/prd.md#FR22`
- `_bmad-output/planning-artifacts/prd.md#FR23`
- `_bmad-output/planning-artifacts/prd.md#FR24`
- `_bmad-output/planning-artifacts/prd.md#FR25`
- `_bmad-output/planning-artifacts/prd.md#FR26`
- `_bmad-output/planning-artifacts/prd.md#FR71`
- `_bmad-output/planning-artifacts/architecture.md#Evidence Trust Model`
- `_bmad-output/planning-artifacts/architecture.md#IP-UI-001 Journey Evidence`
- `_bmad-output/planning-artifacts/architecture.md#IP-UI-002 Screenshot or Trace Required`
- `_bmad-output/planning-artifacts/architecture.md#IP-UI-005 UI/API/Data Closure`
- `_bmad-output/planning-artifacts/architecture.md#IP-UI-006 API Evidence Bound to User Action`
- `_bmad-output/planning-artifacts/architecture.md#IP-UI-007 Mock Is Degraded Evidence`
- `_bmad-output/implementation-artifacts/4-2-browser-adapter-screenshot-trace-evidence.md`
- `_bmad-output/implementation-artifacts/4-3-user-action-api-request-response-evidence.md`
- `_bmad-output/implementation-artifacts/4-4-data-persistence-readback-verification.md`
- `_bmad-output/implementation-artifacts/4-5-ui-console-network-visual-sanity-evidence.md`
- `https://code.claude.com/docs/llms.txt`
- `https://code.claude.com/docs/en/chrome.md`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `npx vitest run tests/runtime/probes/full-stack/save-journey.test.ts` — red phase failed before implementation because `src/runtime/probes/full-stack/index.ts` did not exist.
- `npm run test:fullstack` — passed, 6 tests.
- `npm run typecheck` — passed.
- `npx vitest run tests/runtime/probes/browser tests/runtime/probes/api tests/runtime/probes/data tests/runtime/probes/full-stack` — passed, 46 tests.
- `npm run verify` — passed.
- `npm run test:fullstack && npm run typecheck && npx vitest run tests/runtime/probes/browser tests/runtime/probes/api tests/runtime/probes/data tests/runtime/probes/full-stack` — passed after review fix.
- `npm run verify` — passed after review fix.

### Completion Notes List

- Added full-stack journey composition under `src/runtime/probes/full-stack/`.
- The composition reuses existing browser/API/data/UI evaluators, normalizes browser screenshot/trace artifacts into report-consumable artifact index entries, and delegates final completion truth to `evaluateCompletionVerdict()`.
- Added controlled `tests/fixtures/fullstack-app/` journey fixture for profile save scenarios without real Chrome, MCP, database, external services, secrets, or user machine state.
- Added full-stack runtime tests covering happy path complete verdict, mock/fixture degraded evidence, API failure with browser evidence still visible, data readback closure failure, console/network/visual failures, screenshot/trace artifact reporting, and machine report verdict output.
- Added `npm run test:fullstack` and included it in `npm run verify`.
- Resolved review finding by keeping returned full-stack `StateLedger` synchronized with final verdict/report state.

### File List

- `package.json`
- `src/runtime/probes/full-stack/index.ts`
- `tests/runtime/probes/full-stack/save-journey.test.ts`
- `tests/fixtures/fullstack-app/package.json`
- `tests/fixtures/fullstack-app/README.md`
- `tests/fixtures/fullstack-app/scripts/run-journey.mjs`
- `_bmad-output/implementation-artifacts/4-6-full-stack-journey-fixtures-degraded-mock-handling.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Started dev-story implementation.
- 2026-05-17: Implemented full-stack journey fixture composition, controlled fixture app, full-stack tests, and `test:fullstack` verify integration.
- 2026-05-17: `npm run test:fullstack`, `npm run typecheck`, Epic 4 focused tests, and `npm run verify` passed; story marked review.
- 2026-05-17: Code review fix applied for stale returned full-stack state; targeted tests and `npm run verify` passed; story marked done.
