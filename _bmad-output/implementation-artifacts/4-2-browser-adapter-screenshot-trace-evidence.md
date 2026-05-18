# Story 4.2: Browser Adapter and Screenshot/Trace Evidence

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为验证前端或全栈功能的用户，
我希望 curdx-flow 能使用可用的浏览器能力打开真实页面、执行用户动作并保存截图或 trace，
以便报告中有可复查的页面行为证据，而不是只说“页面看起来正常”。

## Acceptance Criteria

1. **真实页面执行：** 给定 user journey plan 包含入口 URL 和用户动作序列，当 browser adapter 执行验证时，它必须打开实际页面、执行计划动作、记录访问 URL、动作结果、页面状态和截图/trace artifact；evidence 必须关联 runId、journey id、action id 和 capabilityId。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.2`; `_bmad-output/planning-artifacts/prd.md#FR16`; `_bmad-output/planning-artifacts/prd.md#FR19`; `_bmad-output/planning-artifacts/architecture.md#IP-UI-001 Journey Evidence`]
2. **Playwright 优先可复跑证据：** 给定 Playwright/project E2E 可用，当需要可复跑 browser evidence 时，系统应优先生成或调用可复跑路径；输出必须包含命令、exit code、trace/screenshot 路径和失败摘要。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.2`; `_bmad-output/planning-artifacts/prd.md#FR26`; `_bmad-output/planning-artifacts/architecture.md#IP-UI-002 Screenshot or Trace Required`]
3. **Chrome DevTools MCP/Claude Chrome 降级定位：** 给定 Chrome DevTools MCP 或 Claude Chrome 可用，当需要真实浏览器现场诊断、登录态、console、network、DOM/CSS 或 performance 观察时，browser adapter 可以使用该能力；报告必须说明其用途和与 Playwright 可复跑证据的差异。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.2`; `_bmad-output/planning-artifacts/prd.md#NFR19`; `_bmad-output/planning-artifacts/prd.md#NFR20`]
4. **失败与 blocker：** 给定 browser capability 不可用、页面无法打开、选择器失败或操作超时，当 adapter 返回结果时，必须生成 blocker 或 degraded evidence；blocker 必须包含 URL、动作、失败原因、可用 fallback 和下一步动作。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.2`; `_bmad-output/planning-artifacts/prd.md#FR18`; `_bmad-output/planning-artifacts/prd.md#NFR22`; `_bmad-output/planning-artifacts/architecture.md#IP-BLOCKER-001 Blocker Shape`]
5. **截图质量门槛：** 给定页面截图为空白、无关首页、终端截图或未覆盖变更区域，当 report 评估该 artifact 时，该截图不得支撑成功 browser evidence；必须要求重新截图、trace 或人工确认。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.2`; `_bmad-output/planning-artifacts/architecture.md#IP-UI-002 Screenshot or Trace Required`; `_bmad-output/planning-artifacts/architecture.md#IP-UI-004 Observable Styling Standard`]
6. **验证覆盖：** 给定 Story 4.2 完成，当执行验证时，最小验证命令必须包含 `npm run typecheck`、browser adapter/probe tests；测试必须覆盖 Playwright 可用、Chrome DevTools MCP unavailable、页面打开失败、操作超时、截图 artifact、trace artifact、空白截图降级。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.2`]

## Tasks / Subtasks

- [x] 定义 browser adapter/probe contract（AC: 1-6）
  - [x] 新增 `src/runtime/adapters/browser/` 和/或 `src/runtime/probes/browser/` 的 TS-only contract，除非必须扩展已 shipped schema，否则不要修改 `plugins/curdx-flow/schemas/**`。
  - [x] Contract 必须兼容现有 `AdapterResult`、`EvidenceBlock`、`ArtifactIndexInput`、`UserJourneyVerificationPlan`、`UserJourney`、`JourneyStep`、`CapabilityRoutingPlan`。
  - [x] Browser result 必须表达 `runId`、`goalId`、`journeyId`、`actionId`、`capabilityId`、visited URL、action result、page state、screenshot/trace artifact refs、diagnostics、blockers、retryable、confidence、durationMs。
  - [x] Adapter 只能输出 execution/evidence facts，不得输出 completion verdict、release verdict 或修改 planner state。

- [x] 实现可注入 browser execution adapter（AC: 1-4）
  - [x] 新增 adapter 主入口，例如 `executeBrowserJourney()`，输入为已生成的 `UserJourneyVerificationPlan` 或单个 journey/action execution plan。
  - [x] 通过注入的 browser port/fake port 执行 navigate/click/fill/select/submit/observe/run-check/capture-screenshot/capture-trace；测试不得依赖真实浏览器或外部 MCP。
  - [x] Playwright/project E2E route 可用时优先标记为 rerunnable/verified，并记录 executable + argv array、exitCode、截图/trace 路径和失败摘要；不得拼接 shell 字符串。
  - [x] Chrome DevTools MCP/Claude Chrome route 只能作为 live diagnostic/degraded/manual-confirmation path，不能等同 Playwright rerunnable evidence。
  - [x] Report-only 模式不得执行会修改目标项目状态的动作；只能观察、运行只读检查、保存报告 artifact 或返回 blocking/degraded result。

- [x] 保存和标准化 screenshot/trace artifacts（AC: 1, 2, 5）
  - [x] artifact 路径必须 workspace-relative，建议位于 `.curdx/artifacts/<runId>/screenshots/` 和 `.curdx/artifacts/<runId>/traces/`。
  - [x] Artifact index entries 必须使用现有 `ArtifactIndexInput`/`ArtifactIndexEntry` 形状，包含 `type`、`path`、`summary`、privacy classification。
  - [x] Evidence block 必须使用 `source: 'browser'`，并明确 `trustLevel`：Playwright/project E2E 为 `verified`，Chrome/DevTools fallback 为 `degraded` 或 `manual-confirmed`。
  - [x] 不写 cookies、tokens、full DOM、完整 network payload 或大日志；只保存安全摘要和必要 artifact 路径。

- [x] 建立 failure/degraded/blocker 规则（AC: 3-5）
  - [x] capability unavailable、page open failed、selector/action timeout、blank screenshot、trace missing、artifact write failed 都必须转成 structured blocker 或 degraded evidence。
  - [x] Blocker 必须包含 URL、journey/action id、失败原因、attempted actions、available fallback、next action、owner、riskLevel、evidence/artifact refs。
  - [x] 空白截图、无关首页、终端截图或没有覆盖变更区域的截图不得产生 `passed` browser evidence；应返回 `degraded`/`failed`/`blocked` 并要求重新截图、trace 或人工确认。
  - [x] Adapter 返回空成功对象是禁止行为；所有失败路径必须有 diagnostics 和下一步。

- [x] 增加 browser adapter/probe tests（AC: 1-6）
  - [x] 新增 `tests/runtime/probes/browser/` 或 `tests/adapters/browser/` focused tests，使用 fake browser port 和 temp workspace。
  - [x] 覆盖 Playwright 可用：真实 URL/action 记录、verified browser evidence、screenshot artifact、trace artifact、command/exitCode/failure summary。
  - [x] 覆盖 Chrome DevTools MCP unavailable 或 fallback：明确 degraded/manual-confirmation，不冒充可复跑 Playwright evidence。
  - [x] 覆盖页面打开失败、选择器失败、操作超时：structured blocker 包含 URL、action、reason、fallback、next action。
  - [x] 覆盖空白截图或不相关截图：不得支撑 passed browser evidence。
  - [x] 覆盖 artifact path/privacy：workspace-relative、无绝对路径、无 `..`、privacy/redaction 字段存在。

- [x] 验证和记录（AC: 6）
  - [x] 运行 browser adapter/probe focused tests。
  - [x] 运行 `npm run typecheck`。
  - [x] 运行 `npm run verify`。
  - [x] 将验证命令和结果写入本 story 的 Dev Agent Record。

### Review Findings

- Fixed: artifact paths were only checked as workspace-relative, which could allow a port-provided path such as `package.json` to overwrite project files. Browser artifacts are now constrained to `.curdx/artifacts/<runId>/...`.
- Fixed: a browser port could return `passed` while omitting planned journey actions; adapter now blocks with `browser-action-missing` for every planned action without an execution result.
- Fixed: report-only mode did not have an adapter-level guard against unsafe journey actions; adapter now blocks before calling the port when any action is not `allowedInReportOnly`.
- Fixed: screenshots without explicit quality metadata are now treated as unsupported quality instead of silently supporting success.
- Final review status: no open findings after patch and verification.

## Dev Notes

### 当前发现

- Story 4.1 已提供 `UserJourneyVerificationPlan`、`UserJourney`、`JourneyStep` 和 missing evidence/remaining risk 结构。4.2 应消费该 plan，不重新推断用户旅程，也不得把 planning readiness 当 completion verdict。[Source: `_bmad-output/implementation-artifacts/4-1-user-journey-verification-plan.md#Completion Notes List`; `src/runtime/planner/user-journey.ts`]
- `src/runtime/planner/capability-routing.ts` 已区分 Playwright primary browser evidence 与 Chrome DevTools MCP/chrome-runtime fallback；fallback 对 browser evidence 是 lower-trust/degraded，不能支撑完整完成。[Source: `src/runtime/planner/capability-routing.ts`; `_bmad-output/implementation-artifacts/4-1-user-journey-verification-plan.md#Review Findings`]
- `AdapterResult` contract 已存在于 `src/runtime/contracts/index.ts` 和 `plugins/curdx-flow/schemas/adapter-result.schema.json`，包含 `ok/status/capabilityId/inputs/evidence/blockers/artifacts/diagnostics/retryable/confidence/durationMs`。优先复用，不要新建平行 adapter 结果语言。[Source: `src/runtime/contracts/index.ts`; `plugins/curdx-flow/schemas/adapter-result.schema.json`]
- `EvidenceBlock` 已支持 `source: 'browser'`，`ArtifactIndexEntry` 已支持 `type: 'screenshot' | 'trace'`，并要求 workspace-relative artifact path 和 privacy 字段。4.2 应输出这些结构或可直接写入这些结构的 inputs。[Source: `src/runtime/contracts/index.ts`; `plugins/curdx-flow/schemas/evidence.schema.json`; `plugins/curdx-flow/schemas/artifact-index.schema.json`; `src/runtime/evidence/types.ts`]
- Architecture 规定 `src/runtime/probes` 执行 browser/API/data 探针，`src/runtime/adapters` 适配外部能力，`src/runtime/evidence` 存 evidence ledger，`src/runtime/verdict` 才做完成判定。4.2 不应让 adapter 直接 claim complete。[Source: `_bmad-output/planning-artifacts/architecture.md#Target Directory Contract`; `_bmad-output/planning-artifacts/architecture.md#IP-ADAPTER-003 Adapter Has No Business Verdict`]
- IP-UI-002 明确截图必须覆盖实际变更区域，不接受空白页、终端截图或无关首页；多步操作、表单、导航、异步请求、登录态、保存动作应优先提供 trace。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-UI-002 Screenshot or Trace Required`]
- PRD 要求浏览器证据覆盖真实页面打开、用户操作、console/network 状态和 screenshot/trace；关键证据缺失只能降级或阻塞，不能被包装成成功。[Source: `_bmad-output/planning-artifacts/prd.md#FR16`; `_bmad-output/planning-artifacts/prd.md#FR19`; `_bmad-output/planning-artifacts/prd.md#NFR20`; `_bmad-output/planning-artifacts/prd.md#NFR25`]

### Previous Story Intelligence

- 4.1 review 修复了 report-only action 被误标可执行、API/data expectation 没绑定 action id、data readback 缺失仍可通过、显式空 actions 避免人工输入等问题。4.2 执行动作时必须保留这些 action id 和 missing evidence，不要绕过 planner 的缺口。
- 4.1 所有 tests 使用纯 fake facts，不启动服务或浏览器。4.2 可以有 temp workspace artifact 写入，但浏览器能力必须 fake/injected，不能让 CI 依赖真实 Playwright/Chrome/MCP。
- 3.5 readiness 修复过 warm-reused service trust drift。4.2 browser evidence 如果基于 user-existing/warm service 或 Chrome live diagnostic，应标记 degraded/manual confirmation，不应等同 cold-start verified path。
- 3.4 端口冲突规则仍适用：browser adapter 不负责 kill/重启服务；服务生命周期和端口归属由 `src/runtime/services/**` 管理。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 用户要可复查的真实页面行为证据，而不是模型口头说页面正常。 |
| Runtime Directories | `src/runtime/adapters/browser/**`、`src/runtime/probes/browser/**`、必要时 `src/runtime/adapters/types.ts`。 |
| Inputs | `UserJourneyVerificationPlan`/journey/action, capability route, mode, runId, goalId, workspaceRoot, browser port/fake port. |
| Outputs | `AdapterResult` with browser `EvidenceBlock[]`, `ArtifactIndexInput[]`, blockers, diagnostics, retryable, confidence. |
| Evidence Source | `source: 'browser'`; artifact types `screenshot` and `trace`。 |
| Plugin Surface | 不新增 slash command、skill、agent、hook、manifest dependency。 |
| Schema / Contract | Prefer existing adapter/evidence/artifact schemas; only update shipped schemas if TS result cannot be represented. |
| Runtime Test | `tests/runtime/probes/browser/**` or `tests/adapters/browser/**`。 |
| Fixture | Fake browser port + temp workspace artifacts; no real browser/MCP network dependency. |
| Failure Mode | capability unavailable, page open fail, selector missing, timeout, blank/unrelated screenshot, trace/artifact write failure. |
| Verification Commands | browser focused tests, `npm run typecheck`, `npm run verify`。 |

### Architecture Guardrails

- Planner plans; browser adapter/probe executes; evidence module persists; verdict evaluates. Do not collapse these layers.
- Adapter/probe must not import concrete planner internals beyond public exported types/functions. Prefer public `src/runtime/planner/index.ts` exports.
- Do not add Playwright as a hard dependency unless package policy and lockfile are intentionally updated. Use an injected port/fake port for tests and optional project command route for Playwright/project E2E.
- If invoking commands, use executable + argv arrays. Do not build shell-concatenated commands.
- Do not call Chrome DevTools MCP from tests. Represent MCP/Chrome through capability route and fake port behavior.
- Artifact paths must be workspace-relative and pass existing artifact index validation. No absolute paths, no path traversal, no null bytes.
- Do not write secrets, cookies, tokens, full DOM dumps, full network payloads, or massive logs to transcript/artifact summaries by default.
- Report-only mode can collect observation artifacts but must not mutate source files or execute recovery. If a planned user action is unsafe for report-only, return blocker/degraded result.
- Browser adapter failures must be actionable: URL, journey/action id, reason, attempted action, fallback, next action, owner, risk.
- A blank or unrelated screenshot is failed/degraded evidence, not successful browser evidence.

### Latest Technical Information

- Current Playwright docs show `page.screenshot({ path })` for saving screenshots to a file path and `browserContext.tracing.start({ screenshots: true, snapshots: true })` followed by `tracing.stop({ path: 'trace.zip' })` for programmatic trace export. Use this as the concrete API shape if a future concrete Playwright port is added; this story can model it through an injected port. [Source: Context7 `/microsoft/playwright`, queried 2026-05-17]
- Official Claude Code docs index remains the current entry point for plugin-specific behavior: <https://code.claude.com/docs/llms.txt>. Story 4.2 does not change plugin manifest/hooks/skills/agents/dependencies; if implementation unexpectedly touches those surfaces, re-check the official docs and run plugin validation/smoke.

### Files To Read Before Editing

**UPDATE candidates:**

- `src/runtime/planner/types.ts`（only if browser execution needs a public type export from 4.1 plan）
- `src/runtime/planner/index.ts`（only if new public types need re-export）
- `src/runtime/contracts/index.ts`（only if existing `AdapterResult`/`EvidenceBlock` cannot express required browser fields）
- `src/runtime/evidence/types.ts`（only if artifact input needs a compatible helper type）
- `package.json`（only if adding a targeted `test:browser` script; otherwise focused `vitest run ...` is enough）

**NEW expected:**

- `src/runtime/adapters/browser/types.ts`
- `src/runtime/adapters/browser/index.ts`
- `src/runtime/adapters/browser/executor.ts` or `src/runtime/probes/browser/executor.ts`
- `tests/runtime/probes/browser/browser-adapter.test.ts` or `tests/adapters/browser/browser-adapter.test.ts`

**Read-only context:**

- `src/runtime/planner/user-journey.ts`
- `src/runtime/planner/capability-routing.ts`
- `src/runtime/contracts/index.ts`
- `src/runtime/evidence/artifacts.ts`
- `src/runtime/evidence/paths.ts`
- `src/runtime/evidence/privacy.ts`
- `src/runtime/services/types.ts`
- `src/runtime/capabilities/types.ts`

**Do not touch for this story unless forced by tests:**

- `src/runtime/verdict/**`
- `src/runtime/services/**`
- `src/hooks/**`
- `plugins/curdx-flow/hooks/**`
- `plugins/curdx-flow/skills/**`
- `plugins/curdx-flow/agents/**`
- `plugins/curdx-flow/.claude-plugin/plugin.json`

### Known Risks To Prevent

- Returning `ok: true` with no evidence/artifacts after browser execution did nothing.
- Treating Chrome DevTools MCP fallback as equivalent to Playwright/project E2E rerunnable evidence.
- Letting blank/unrelated screenshot support successful browser evidence.
- Writing absolute artifact paths or leaking local secrets/cookies/network payloads.
- Making tests depend on installed browsers, real MCP servers, network, or user login state.
- Having adapter decide completion or call `evaluateCompletionVerdict()`.
- Retrying/repairing source code inside browser adapter instead of returning structured failure for Epic 5 recovery.

## Project Structure Notes

- Alignment: Story 4.2 is the first executable browser surface after 4.1 planner. Keep it behind injected ports and typed result boundaries so later Stories 4.3-4.5 can add API/data/console/network closure without reworking browser result shape.
- Existing good pattern: runtime modules expose focused pure/async functions plus fakeable IO interfaces; tests use temp workspaces and no global user machine state.
- Brownfield note: worktree contains prior sprint artifacts and unrelated generated hook diffs. Do not clean, revert, or normalize unrelated files.

## References

- `_bmad-output/planning-artifacts/epics.md#Story 4.2`
- `_bmad-output/planning-artifacts/epics.md#Epic 4`
- `_bmad-output/planning-artifacts/prd.md#FR16`
- `_bmad-output/planning-artifacts/prd.md#FR19`
- `_bmad-output/planning-artifacts/prd.md#FR20`
- `_bmad-output/planning-artifacts/prd.md#FR26`
- `_bmad-output/planning-artifacts/prd.md#FR41`
- `_bmad-output/planning-artifacts/prd.md#NFR19`
- `_bmad-output/planning-artifacts/prd.md#NFR20`
- `_bmad-output/planning-artifacts/prd.md#NFR21`
- `_bmad-output/planning-artifacts/prd.md#NFR22`
- `_bmad-output/planning-artifacts/prd.md#NFR25`
- `_bmad-output/planning-artifacts/architecture.md#Adapter Contract Model`
- `_bmad-output/planning-artifacts/architecture.md#Target Directory Contract`
- `_bmad-output/planning-artifacts/architecture.md#IP-ADAPTER-003 Adapter Has No Business Verdict`
- `_bmad-output/planning-artifacts/architecture.md#IP-UI-001 Journey Evidence`
- `_bmad-output/planning-artifacts/architecture.md#IP-UI-002 Screenshot or Trace Required`
- `_bmad-output/planning-artifacts/architecture.md#IP-UI-004 Observable Styling Standard`
- `_bmad-output/implementation-artifacts/4-1-user-journey-verification-plan.md`
- `src/runtime/contracts/index.ts`
- `plugins/curdx-flow/schemas/adapter-result.schema.json`
- `plugins/curdx-flow/schemas/evidence.schema.json`
- `plugins/curdx-flow/schemas/artifact-index.schema.json`
- Claude Code docs index: <https://code.claude.com/docs/llms.txt>
- Playwright docs via Context7 `/microsoft/playwright` query on screenshot and trace APIs, 2026-05-17

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 2026-05-17: Red phase confirmed with `npx vitest run tests/runtime/probes/browser/browser-adapter.test.ts` failing because browser adapter module did not exist.
- 2026-05-17: Ran `npm run test:browser` - passed, 6 tests.
- 2026-05-17: Ran `npx vitest run tests/runtime/planner tests/runtime/probes/browser` - passed, 20 tests.
- 2026-05-17: Ran `npm run typecheck` - passed.
- 2026-05-17: Ran `npm run verify` - passed.
- 2026-05-17: Review patch added artifact directory enforcement, missing action blockers, report-only pre-execution guard, and screenshot quality fallback.
- 2026-05-17: Ran `npm run test:browser` after review patch - passed, 9 tests.
- 2026-05-17: Ran `npx vitest run tests/runtime/planner tests/runtime/probes/browser` after review patch - passed, 23 tests.
- 2026-05-17: Ran `npm run typecheck` after review patch - passed.
- 2026-05-17: Ran `npm run verify` after review patch - passed.

### Completion Notes List

- Added a TS-only browser adapter contract with injectable `BrowserAutomationPort`, browser action outcomes, artifact captures, structured blockers, diagnostics, command metadata, and `BrowserAdapterResult`.
- Implemented `executeBrowserJourney()` as an adapter-layer executor that consumes a planned `UserJourney`, calls an injected port, materializes screenshot/trace artifacts under workspace-relative `.curdx/artifacts/<runId>/...`, and returns `AdapterResult`-compatible browser evidence.
- Preserved adapter boundaries: no Playwright hard dependency, no real Chrome/MCP calls in tests, no completion verdict, no planner state mutation, no evidence ledger write.
- Added trust/status rules: Playwright/project E2E yields `verified` passed evidence when artifacts/actions are valid; Chrome/DevTools live diagnostics are degraded; page open/action timeout/artifact write/path failures produce actionable browser blockers.
- Added screenshot quality handling so blank/unrelated/non-supporting artifacts cannot produce successful browser evidence.
- Hardened review edge cases: artifacts cannot be written outside the run artifact directory, every planned action must be represented in port results, and report-only unsafe actions are blocked before execution.
- Added `test:browser` and wired it into `npm run verify`.

### File List

- `_bmad-output/implementation-artifacts/4-2-browser-adapter-screenshot-trace-evidence.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `package.json`
- `src/runtime/adapters/index.ts`
- `src/runtime/adapters/browser/executor.ts`
- `src/runtime/adapters/browser/index.ts`
- `src/runtime/adapters/browser/types.ts`
- `tests/runtime/probes/browser/browser-adapter.test.ts`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Started dev-story implementation.
- 2026-05-17: Added browser adapter contract/executor, focused tests, artifact materialization, blocker/degraded rules, and verify integration.
- 2026-05-17: Story implementation verified and marked ready for review.
- 2026-05-17: Addressed code review findings and marked story done.
