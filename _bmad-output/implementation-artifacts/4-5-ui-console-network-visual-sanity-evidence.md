# Story 4.5: UI 状态、Console/Network 与视觉 Sanity Evidence

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为验证前端体验是否可交付的用户，
我希望 curdx-flow 不只确认页面打开，还检查关键 UI 状态、console 错误、network 问题和明显视觉缺陷，
以便报告能证明用户可用性达到最低标准。

## Acceptance Criteria

1. **UI 状态矩阵：** 给定 user journey 包含 UI 交互或页面状态变化，当 browser probe 执行完成，evidence 必须记录关键 UI 状态，例如 loading、success、empty、error、disabled、validation failed、submitting、success-after-submit 中适用的状态；无法触发的状态必须说明原因和剩余风险。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.5`; `_bmad-output/planning-artifacts/architecture.md#IP-UI-003 Visual State Matrix`; `_bmad-output/planning-artifacts/prd.md#FR25`]
2. **Console/Network 诊断：** 给定页面运行过程中出现 console error、uncaught exception、failed network request 或相关 warning，当 probe 收集浏览器诊断，报告必须列出问题摘要、关联动作、严重等级和 evidenceRefs；关键运行时错误不得被忽略为成功。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.5`; `_bmad-output/planning-artifacts/prd.md#FR20`; `_bmad-output/planning-artifacts/prd.md#NFR22`]
3. **视觉 sanity：** 给定页面截图或 DOM/CSS 诊断可用，当系统执行视觉 sanity check，必须检查明显重叠、文字截断、横向溢出、关键按钮/输入不可点击、固定头尾遮挡、移动端主流程不可完成等问题；发现问题时必须标记 failed、partial 或 manual-confirmation-required。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.5`; `_bmad-output/planning-artifacts/architecture.md#IP-UI-002 Screenshot or Trace Required`; `_bmad-output/planning-artifacts/architecture.md#IP-UI-004 Observable Styling Standard`]
4. **ui-ux-pro-max 降级：** 给定 ui-ux-pro-max 可用，当任务涉及视觉、响应式、交互或可用性质量，routing 可以调用该能力产生 UX evidence；缺失该能力时必须说明降级影响，而不是跳过 UI/UX 检查并成功。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.5`; `_bmad-output/planning-artifacts/prd.md#NFR19`; `_bmad-output/planning-artifacts/prd.md#NFR20`]
5. **响应式/移动端证据：** 给定页面需要响应式或移动端验证，当 viewport evidence 被要求，系统必须记录检查 viewport、截图或 trace；未检查的 viewport 必须出现在 missingEvidence 或 remainingRisk 中。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.5`; `_bmad-output/planning-artifacts/architecture.md#IP-UI-004 Observable Styling Standard`]
6. **验证覆盖：** 给定 Story 4.5 完成，当执行验证，最小验证命令必须包含 `npm run typecheck`、UI/browser diagnostics tests；测试必须覆盖 console error、network failure、空白页、视觉重叠、移动端缺证据、ui-ux-pro-max unavailable degraded、状态矩阵摘要。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.5`]

## Tasks / Subtasks

- [x] 定义 UI diagnostics evidence contract（AC: 1-6）
  - [x] 在 `src/runtime/adapters/browser/` 新增 UI diagnostics evaluator 或等价 probe contract，复用 `AdapterResult`、`EvidenceBlock`、`UserJourney.expectedUi[]`、4.2 `BrowserActionOutcome`。
  - [x] Observed UI diagnostics 必须支持 UI state observations、console issues、network issues、visual issues、checked viewports、required viewports、ui-ux-pro-max capability status。
  - [x] Result 必须输出 `source: 'browser'` evidence、blockers、diagnostics、state matrix summary、missingEvidence/remainingRisk 风格字段；不得输出 completion verdict。

- [x] 实现 UI state / console / network / visual evaluator（AC: 1-5）
  - [x] 按 expected UI actionId 绑定状态观察；状态缺失、不可触发或未说明原因不得 passed。
  - [x] console error、uncaught exception、failed network request 必须 failed；warning 可 degraded，但必须进入 diagnostics/evidenceRefs。
  - [x] 空白页、明显重叠、文字截断、横向溢出、不可点击控件、固定头尾遮挡、移动端主流程不可完成必须产生 structured blocker。
  - [x] ui-ux-pro-max 不可用时返回 degraded blocker，说明失去的视觉/交互质量证据；不得跳过后成功。
  - [x] required viewport 未检查时返回 degraded blocker 或 missingEvidence；mobile 主流程缺证据不得 passed。

- [x] 安全摘要和 artifact 边界（AC: 2-5）
  - [x] console/network/DOM 摘要必须脱敏 token/cookie/password/api key/session/secret。
  - [x] 不写完整 console dump、network payload 或 DOM 快照到 evidence summary；如需 artifact，路径仍必须由 4.2 browser artifact path 规则约束。
  - [x] Evidence privacy 必须包含 classification、containsSensitiveData、redacted、summaryTruncated。

- [x] 增加 UI/browser diagnostics tests（AC: 1-6）
  - [x] 新增 `tests/runtime/probes/browser/ui-diagnostics.test.ts` 或等价 focused tests。
  - [x] 覆盖 console error、network failure、空白页、视觉重叠、移动端缺证据、ui-ux-pro-max unavailable degraded、状态矩阵摘要。
  - [x] Tests 使用 fake browser diagnostics；不依赖真实浏览器、截图、网络或 MCP。

- [x] 验证和记录（AC: 6）
  - [x] 运行 `npm run test:browser`。
  - [x] 运行 `npm run typecheck`。
  - [x] 运行 `npm run verify`。
  - [x] 将验证命令和结果写入本 story 的 Dev Agent Record。

### Review Findings

- [x] [Review][Patch] Skipped/degraded UI states could lack an explicit reason and still avoid blocking — fixed by blocking unexplained skipped/degraded state observations.
- [x] [Review][Patch] A required viewport could be marked checked without screenshot/trace evidenceRefs — fixed by degrading viewport checks that have no evidence reference.

## Dev Notes

### 当前发现

- Story 4.5 扩展 4.2 browser evidence，不替换 4.2 的 `executeBrowserJourney()`。优先新增纯 evaluator，让真实 Playwright/Chrome/DevTools 观察结果后续可作为输入。[Source: `src/runtime/adapters/browser/types.ts`; `src/runtime/adapters/browser/executor.ts`]
- `EvidenceBlock.source` 没有 `ux`，UI diagnostics evidence 应继续使用 `source: 'browser'`，并通过 capabilityId / diagnostics 区分 `ui-ux-pro-max` 或 browser diagnostics。[Source: `src/runtime/contracts/index.ts`]
- Architecture 要求 UI 任务至少有核心状态截图；4.5 的 evaluator 不需要生成截图，但必须能识别空白/无关/缺 viewport/视觉问题，不能把“页面打开”当作 UI 可交付。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-UI-002 Screenshot or Trace Required`; `_bmad-output/planning-artifacts/architecture.md#IP-UI-004 Observable Styling Standard`]
- 4.3/4.4 均已建立 no-false-completion 模式：缺验证结果时 blocked/degraded，mock/fixture 不能 passed，敏感摘要必须 redacted。4.5 应沿用同样风格处理 console/network/visual evidence。[Source: `_bmad-output/implementation-artifacts/4-3-user-action-api-request-response-evidence.md#Review Findings`; `_bmad-output/implementation-artifacts/4-4-data-persistence-readback-verification.md#Review Findings`]

### Previous Story Intelligence

- 4.2 browser adapter 已有 action outcomes、artifact quality、blank/unrelated/terminal/missing-change-area 截图 blocker。4.5 不要重复 artifact 写入逻辑，只消费或总结 browser diagnostics。
- 4.3 API evidence 强化了 literal matching 和 required validation 不得 passed；4.5 的 UI state/viewport matching 也应避免相似状态或相似 viewport 误匹配。
- 4.4 data evidence 强化了 metadata、fixture/manual degradation 和 sensitive redaction；4.5 的 console/network/DOM 摘要也必须避免 secret 泄露。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 页面能打开不代表 UI 可交付；console/network/视觉问题必须进入证据链。 |
| Runtime Directories | `src/runtime/adapters/browser/**`。 |
| Inputs | `UserJourney.expectedUi[]`, browser action outcomes, UI state observations, console/network/visual observations, viewport requirements, ux capability status. |
| Outputs | `AdapterResult` with `source: 'browser'` evidence, blockers, diagnostics, state matrix, missing viewports, visual issues. |
| Plugin Surface | 不新增 slash command、skill、agent、hook、manifest dependency。 |
| Runtime Test | `tests/runtime/probes/browser/**`。 |
| Failure Mode | console error, failed network request, blank page, visual overlap, missing mobile viewport, ui-ux-pro-max unavailable, missing state observation. |
| Verification Commands | `npm run test:browser`, `npm run typecheck`, `npm run verify`。 |

### Architecture Guardrails

- Browser/UI diagnostics adapter 只输出 evidence/blockers/diagnostics，不决定 completion verdict。
- Do not call real browser, screenshot parser, MCP, or network in unit tests. Fake observed diagnostics are enough for this story.
- Do not add plugin dependencies or MCP config; ui-ux-pro-max is an existing required companion capability to detect/degrade around.
- Critical console/runtime/network errors cannot be downgraded to passed because screenshot exists.
- Missing mobile/viewport evidence is at least degraded and must be visible in evidence unverifiedScope/missing viewports.
- If visual observation source is manual/mock/fixture, evidence cannot be verified; mark degraded unless explicitly manual-confirmed outside this adapter.

### Files To Read Before Editing

**UPDATE candidates:**

- `src/runtime/adapters/browser/index.ts`
- `src/runtime/adapters/browser/types.ts`
- `src/runtime/adapters/index.ts`

**NEW expected:**

- `src/runtime/adapters/browser/ui-diagnostics.ts`
- `src/runtime/adapters/browser/ui-diagnostics-types.ts`
- `tests/runtime/probes/browser/ui-diagnostics.test.ts`

**Read-only context:**

- `src/runtime/adapters/browser/executor.ts`
- `src/runtime/evidence/privacy.ts`
- `src/runtime/contracts/index.ts`
- `src/runtime/planner/types.ts`
- `src/runtime/adapters/api-data/data-readback.ts`

## References

- `_bmad-output/planning-artifacts/epics.md#Story 4.5`
- `_bmad-output/planning-artifacts/prd.md#FR19`
- `_bmad-output/planning-artifacts/prd.md#FR20`
- `_bmad-output/planning-artifacts/prd.md#FR25`
- `_bmad-output/planning-artifacts/prd.md#FR26`
- `_bmad-output/planning-artifacts/prd.md#NFR19`
- `_bmad-output/planning-artifacts/prd.md#NFR20`
- `_bmad-output/planning-artifacts/prd.md#NFR21`
- `_bmad-output/planning-artifacts/prd.md#NFR22`
- `_bmad-output/planning-artifacts/architecture.md#IP-UI-001 Journey Evidence`
- `_bmad-output/planning-artifacts/architecture.md#IP-UI-002 Screenshot or Trace Required`
- `_bmad-output/planning-artifacts/architecture.md#IP-UI-003 Visual State Matrix`
- `_bmad-output/planning-artifacts/architecture.md#IP-UI-004 Observable Styling Standard`
- `_bmad-output/implementation-artifacts/4-2-browser-adapter-screenshot-trace-evidence.md`
- `_bmad-output/implementation-artifacts/4-3-user-action-api-request-response-evidence.md`
- `_bmad-output/implementation-artifacts/4-4-data-persistence-readback-verification.md`
- `src/runtime/adapters/browser/types.ts`
- `src/runtime/adapters/browser/executor.ts`
- `src/runtime/evidence/privacy.ts`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `npm run test:browser` — red phase failed before implementation because `evaluateUiDiagnosticsEvidence` did not exist.
- `npm run test:browser` — passed, 20 tests after review fixes.
- `npm run typecheck` — passed.
- `npx vitest run tests/runtime/planner tests/runtime/probes/browser tests/runtime/probes/api tests/runtime/probes/data` — passed, 52 tests.
- `npm run verify` — passed.

### Completion Notes List

- Added browser UI diagnostics evaluator under `src/runtime/adapters/browser/`.
- UI diagnostics evidence records expected UI state matrix, console issues, network issues, visual issues, checked viewports, missing viewports, and ui-ux-pro-max capability degradation.
- Critical console errors, failed network requests, and visual sanity defects produce failed browser evidence; missing viewport or missing UI/UX capability produces degraded evidence.
- UI states that are skipped/degraded without a reason now block completion, and required viewports need screenshot/trace evidence references.
- Sensitive console/network summaries are redacted and truncated before entering evidence, blockers, or diagnostics.
- The adapter returns `AdapterResult`-compatible `source: 'browser'` evidence only; it does not emit completion verdicts.

### File List

- `src/runtime/adapters/browser/ui-diagnostics-types.ts`
- `src/runtime/adapters/browser/ui-diagnostics.ts`
- `src/runtime/adapters/browser/index.ts`
- `src/runtime/adapters/index.ts`
- `tests/runtime/probes/browser/ui-diagnostics.test.ts`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Started dev-story implementation.
- 2026-05-17: Implemented UI diagnostics evaluator and focused browser diagnostics tests.
- 2026-05-17: `npm run test:browser`, `npm run typecheck`, Epic 4 focused tests, and `npm run verify` passed; story marked review.
- 2026-05-17: Code review fixes applied for unexplained skipped UI states and viewport checks without evidence refs.
- 2026-05-17: `npm run test:browser`, `npm run typecheck`, and `npm run verify` passed after review fixes; story marked done.
