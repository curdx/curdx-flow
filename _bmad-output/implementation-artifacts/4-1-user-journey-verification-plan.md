# Story 4.1: User Journey Verification Plan

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为希望证明功能真实可用的用户，
我希望 curdx-flow 能把用户请求转换成具体用户旅程验证计划，
以便系统知道要打开哪个页面、执行哪些动作、期待哪些 API/data/UI 结果，而不是只跑通用 build/test。

## Acceptance Criteria

1. **明确旅程计划：** 给定用户请求验证一个前端或全栈功能，当 planner 读取用户意图、runtime topology、capability status 和 evidence requirements 时，它必须生成 user journey verification plan；plan 必须包含入口 URL/服务、动作序列、期望 UI 状态、期望 API 请求/响应、期望数据落点、所需 artifacts、缺失能力和剩余风险。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.1`; `_bmad-output/planning-artifacts/prd.md#FR15`; `_bmad-output/planning-artifacts/prd.md#FR19`; `_bmad-output/planning-artifacts/prd.md#FR26`; `_bmad-output/planning-artifacts/architecture.md#IP-UI-001 Journey Evidence`]
2. **推断置信度与人工输入：** 给定用户没有明确提供旅程细节，当 planner 只能从代码、路由、脚本或变更范围推断时，plan 必须标记 inferred confidence；若核心路径不明确，verdict 必须为 `needs-human-input`、`partial` 或 `blocked`，不得假装已知。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.1`; `_bmad-output/planning-artifacts/prd.md#NFR1`; `_bmad-output/planning-artifacts/prd.md#NFR2`]
3. **Evidence 缺口：** 给定前端或全栈任务缺少 browser/API/data 其中之一的关键验证要求，当 planner 生成计划时，`missingEvidence` 必须被列入计划；后续 verdict 不得在缺口未处理时为 complete。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.1`; `_bmad-output/planning-artifacts/prd.md#FR26`; `_bmad-output/planning-artifacts/prd.md#NFR20`; `_bmad-output/planning-artifacts/prd.md#NFR25`]
4. **Report-only 边界：** 给定 report-only 模式，当 planner 生成用户旅程验证计划时，计划不得包含源码修改或测试文件生成动作；只能包含只读观察、运行检查、截图/trace/report artifact 生成。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.1`; `_bmad-output/planning-artifacts/prd.md#FR33`; `_bmad-output/planning-artifacts/prd.md#NFR5`]
5. **Fix mode handoff：** 给定 fix mode，当 planner 生成用户旅程验证计划时，计划可以包含修复前复现、修复动作、same-path retry；修复动作必须由 Epic 5 recovery flow 接管，不得在 journey plan 中直接执行。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.1`; `_bmad-output/planning-artifacts/prd.md#FR34`; `_bmad-output/planning-artifacts/architecture.md#Target Directory Contract`]
6. **验证覆盖：** 给定 Story 4.1 完成，当执行验证时，最小验证命令必须包含 `npm run typecheck`、journey planner tests；测试必须覆盖明确旅程、推断旅程、缺 browser/API/data evidence、report-only、fix mode handoff 和 unknown route。[Source: `_bmad-output/planning-artifacts/epics.md#Story 4.1`]

## Tasks / Subtasks

- [x] 定义 user journey planner contract（AC: 1-6）
  - [x] 在 `src/runtime/planner/types.ts` 或新 `src/runtime/planner/user-journey-types.ts` 中新增 `UserJourneyVerificationPlan`、`UserJourney`、`JourneyStep`、`ExpectedUiState`、`ExpectedApiInteraction`、`ExpectedDataOutcome`、`JourneyArtifactRequirement`、`JourneyMissingEvidence`、`JourneyPlanningVerdict`。
  - [x] Plan 必须引用或兼容现有 `EvidenceRequirement`、`CapabilityRoutingPlan`、`RuntimeTopology`、`RuntimeReadinessResult` facts，不新建平行 evidence/verdict 语言。
  - [x] Plan status/verdict 只能表达 planning readiness，例如 `ready`、`partial`、`needs-human-input`、`blocked`；不得声明任务 complete。
  - [x] 保持 TS-only contract；除非落地 shipped JSON schema，否则不要修改 `plugins/curdx-flow/schemas/**`。

- [x] 实现 journey plan 生成器（AC: 1-5）
  - [x] 新增 `src/runtime/planner/user-journey.ts` 或等价模块，导出 `planUserJourneyVerification()`。
  - [x] 输入应包含用户意图、task type/mode、runtime topology、runtime readiness facts、capability matrix 或 capability routes、evidence requirements、可选显式 journey hints。
  - [x] 明确 journey hints 时，按用户提供的 entry/action/UI/API/data 生成高置信 plan。
  - [x] 无明确 journey hints 时，只能从 topology browser/api/data hints、routes、service URLs、changed paths 或 command facts 推断，并标记 `inferred: true` 与 confidence。
  - [x] unknown route、无 entry URL、无 action sequence、无 browser/API/data capability 时，生成 missingEvidence 和 blocker/degraded planning verdict，不得假装有核心路径。
  - [x] Report-only 模式只允许 observe/run/check/capture/report 类型步骤，不允许 source edit、test file generation、migration 或 recovery execution。
  - [x] Fix mode 可以声明 reproduce-before-fix、handoff-to-recovery、same-path-retry planning steps，但不直接执行修复。

- [x] 集成 capability routing 和 evidence requirements（AC: 1, 3, 4, 5）
  - [x] 复用 `planCapabilityRoutes()` 或消费 `CapabilityRoutingPlan`，将 browser/API/data/UX capability 状态映射到 `requiredArtifacts`、`missingEvidence`、`remainingRisks`。
  - [x] 对 frontend task 默认要求 browser evidence；对 fullstack task 默认要求 browser + API + data evidence，除非输入明确证明不适用。
  - [x] API evidence 必须绑定用户动作，例如 action id -> expected request/response，不接受孤立 curl 作为完整 journey evidence。
  - [x] Data evidence 必须说明 expected persistence/readback target；无法验证时标记 degraded 或 missing。
  - [x] Capability unavailable/degraded 时，plan 中必须有缺失能力、fallback 和下一步，不得静默跳过。

- [x] 增加 focused journey planner tests（AC: 1-6）
  - [x] 新增 `tests/runtime/planner/user-journey-plan.test.ts` 或等价文件。
  - [x] 覆盖明确旅程：入口 URL、动作序列、UI/API/data expectations、artifacts、capability routes 都进入 plan。
  - [x] 覆盖推断旅程：从 frontend/fullstack topology hints 推断入口和缺失动作，带 confidence 与 needs-human-input/partial。
  - [x] 覆盖缺 browser/API/data evidence：missingEvidence 阻止 ready/complete 假象。
  - [x] 覆盖 report-only：无 write/edit/generate-test/recovery execute action。
  - [x] 覆盖 fix mode handoff：包含 reproduce + recovery handoff + same-path retry plan，但不执行源码修改。
  - [x] 覆盖 unknown route：无 entry URL 或 route 不明确时 blocked/needs-human-input。

- [x] 验证和记录（AC: 6）
  - [x] 运行 journey planner focused tests。
  - [x] 运行 `npm run typecheck`。
  - [x] 运行 `npm run verify`。
  - [x] 将验证命令和结果写入本 story 的 Dev Agent Record。

### Review Findings

- Fixed: report-only mode previously allowed explicit non-read-only journey actions by marking them allowed; planner now converts mutating browser actions to observation-only steps and redacts forbidden source/test/migration/recovery actions into blocking `missingEvidence`.
- Fixed: API/UI/data expectations could reference action ids that were not present in the journey action sequence; planner now emits source-specific missing evidence for invalid bindings.
- Fixed: full-stack/data plans could accept data expectations without readback proof; planner now marks missing data readback as partial.
- Fixed: explicit journeys with an entry URL but no action sequence could avoid the same human-input guard as inferred journeys; planner now records `journey-actions-missing`.
- Final review status: no open findings after patch and verification.

## Dev Notes

### 当前发现

- Epic 3 已完成 deterministic runtime readiness 基线：`discoverRuntimeTopology()`、`detectVerificationCommands()`、`startServices()`、`cleanupServices()`、`evaluateRuntimeReadiness()`、L2 runtime evidence 和 readiness blocker report。Story 4.1 应消费这些 facts 来规划 browser/API/data journey，不重新启动服务或执行 probe。[Source: `_bmad-output/implementation-artifacts/3-5-runtime-readiness-fixtures-blocker-reports.md#Completion Notes List`; `src/runtime/readiness/evaluator.ts`]
- `src/runtime/planner/capability-routing.ts` 已能按 `EvidenceRequirement` 和 `CapabilityMatrix` 路由 Playwright、Chrome DevTools MCP、API/data capability、ui-ux-pro-max、context7、claude-mem、pua、sequential-thinking。4.1 应复用或组合该 routing，不重写能力选择规则。[Source: `src/runtime/planner/capability-routing.ts`; `tests/runtime/planner/capability-routing.test.ts`]
- `EvidenceRequirement` 位于 `src/runtime/verdict/types.ts`，source 已覆盖 `command`、`service`、`browser`、`api`、`data`、`log`、`manual`、`release`、`hook`。Journey planner 应输出这些 requirements/missingEvidence，供 verdict evaluator 后续消费。[Source: `src/runtime/verdict/types.ts`]
- Architecture 明确 `src/runtime/planner` owns goal/story 分解、验证计划、恢复计划；它不得调用 browser/MCP/API adapter，也不得直接写 evidence ledger。[Source: `_bmad-output/planning-artifacts/architecture.md#Target Directory Contract`; `_bmad-output/planning-artifacts/architecture.md#Component Boundaries`]
- IP-UI-001 要求每个 journey 至少声明入口页面或服务地址、用户动作、期望 UI、期望 API、期望数据、artifact 和剩余风险。4.1 的计划结构必须直接表达这些字段，不只输出 prose。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-UI-001 Journey Evidence`]
- Report renderer/verdict 已存在，但 4.1 不应修改 completion verdict evaluator，除非发现 evidence requirement gap 无法表达。更安全的路径是在 planner 输出 `missingEvidence`/`remainingRisks`，后续 verdict 读取。[Source: `src/runtime/verdict/evaluator.ts`; `src/runtime/reports/renderer.ts`]

### Previous Story Intelligence

- 3.5 review 修复过 report artifact evidence section 滞后和 warm reuse trust drift。4.1 不得把 warm/reused readiness 当成 full cold-start journey evidence；plan 要保留 remaining risk。
- 3.5 readiness tests 使用 `tests/fixtures/runtime-readiness/**` 和 temp workspace，不依赖用户机器状态。4.1 planner tests 应继续纯数据/fake facts，不启动浏览器或服务。
- 3.4 端口冲突规则仍适用：journey plan 可以指出换端口/复用/blocked，但不能 kill user-existing process。
- 3.2 命令 facts 始终是 executable + argv array；journey plan 中的 command references 不得退化成 shell 拼接字符串。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 用户要证明真实业务流执行，而不是只跑 build/test。 |
| Runtime Directory | `src/runtime/planner/**`。 |
| Inputs | User intent, task type/mode, `RuntimeTopology`, `RuntimeReadinessResult`, `CapabilityMatrix`/`CapabilityRoutingPlan`, `EvidenceRequirement[]`, optional explicit journey hints. |
| Outputs | `UserJourneyVerificationPlan` with journeys, steps, expectations, artifacts, missingEvidence, capability gaps, remainingRisks, planning verdict. |
| Plugin Surface | 不新增 slash command、skill、agent、hook、manifest dependency。 |
| Schema / Contract | Prefer TS-only planner types. Only add shipped schema if persisted JSON contract is introduced. |
| Runtime Test | `tests/runtime/planner/user-journey-plan.test.ts`。 |
| Fixture | Pure data fixtures or inline fake topology/capability facts; no browser/service execution. |
| Evidence Output | Requirements only; no ledger write in this story. |
| Report Surface | Optional plan summary helper only if tests need it; do not change generic reports unless necessary. |
| Failure Mode | unclear route, missing browser/API/data evidence, unavailable capability, report-only forbidden write action, fix mode direct execution risk. |
| Verification Commands | journey planner focused tests, `npm run typecheck`, `npm run verify`。 |

### Architecture Guardrails

- Journey planner plans; probes execute. Do not import or call Playwright, Chrome DevTools MCP, fetch/curl, API/data adapters, or `appendEvidence()` in this story.
- Do not call `evaluateCompletionVerdict()` or claim completion. Planning verdict is not completion verdict.
- Do not implement browser adapter, screenshot/trace capture, API request execution, or data readback; those belong to Stories 4.2-4.4.
- Do not modify source files, generate tests, run migrations, or execute recovery inside plan generation. Report-only and fix-mode behavior must be represented as planned actions/handoff only.
- Missing browser/API/data evidence must remain explicit and blocking/degraded where core.
- API expectations must bind to journey action ids.
- Data expectations must include target/readback description or be marked missing/degraded.
- Keep all artifact paths workspace-relative. Do not store secrets, cookies, production data, or full logs in plan objects.

### Latest Claude Code Information

- 官方 Claude Code 文档索引入口已刷新：<https://code.claude.com/docs/llms.txt>。
- Story 4.1 does not change shipped Claude Code plugin manifests, hooks, skills, agents, dependency metadata, or release tags. If implementation unexpectedly touches those surfaces, re-check official docs and run plugin validation/smoke.

### Files To Read Before Editing

**UPDATE candidates:**

- `src/runtime/planner/types.ts`
- `src/runtime/planner/index.ts`
- `package.json`（仅当需要新增 `test:journey`；否则 `test:planner` 已覆盖）

**NEW expected:**

- `src/runtime/planner/user-journey.ts`
- `tests/runtime/planner/user-journey-plan.test.ts`

**Read-only context:**

- `src/runtime/planner/capability-routing.ts`
- `src/runtime/verdict/types.ts`
- `src/runtime/discovery/types.ts`
- `src/runtime/readiness/types.ts`
- `src/runtime/capabilities/types.ts`

**Do not touch for this story unless forced by tests:**

- `src/runtime/probes/**`
- `src/runtime/adapters/**`
- `src/runtime/evidence/**`
- `src/runtime/verdict/**`
- `src/runtime/services/**`
- `plugins/curdx-flow/.claude-plugin/plugin.json`
- `plugins/curdx-flow/hooks/**`
- `plugins/curdx-flow/skills/**`
- `plugins/curdx-flow/agents/**`

### Known Risks To Prevent

- Generating a vague prose plan that cannot drive later probes.
- Treating inferred route/action as certain.
- Letting missing API/data evidence disappear from the plan.
- Adding browser/API execution into planner.
- Allowing report-only plans to include writes.
- Allowing fix mode to directly execute recovery instead of handing off to Epic 5.
- Treating Chrome DevTools MCP fallback as equivalent to rerunnable Playwright evidence.
- Treating mock/dev-only data as full-stack evidence.

## Project Structure Notes

- Alignment: Story 4.1 begins Epic 4 by adding planner output only. The executable adapters and probes remain future stories.
- Existing good pattern: planner modules expose focused pure functions and tests under `tests/runtime/planner/**`; follow that pattern.
- Brownfield note: worktree contains previous sprint artifacts and unrelated generated bundle diffs; do not revert or normalize unrelated files.

## References

- `_bmad-output/planning-artifacts/epics.md#Story 4.1`
- `_bmad-output/planning-artifacts/epics.md#Epic 4`
- `_bmad-output/planning-artifacts/prd.md#FR15`
- `_bmad-output/planning-artifacts/prd.md#FR19`
- `_bmad-output/planning-artifacts/prd.md#FR20`
- `_bmad-output/planning-artifacts/prd.md#FR21`
- `_bmad-output/planning-artifacts/prd.md#FR22`
- `_bmad-output/planning-artifacts/prd.md#FR23`
- `_bmad-output/planning-artifacts/prd.md#FR24`
- `_bmad-output/planning-artifacts/prd.md#FR25`
- `_bmad-output/planning-artifacts/prd.md#FR26`
- `_bmad-output/planning-artifacts/prd.md#FR33`
- `_bmad-output/planning-artifacts/prd.md#FR34`
- `_bmad-output/planning-artifacts/prd.md#NFR1`
- `_bmad-output/planning-artifacts/prd.md#NFR2`
- `_bmad-output/planning-artifacts/prd.md#NFR5`
- `_bmad-output/planning-artifacts/prd.md#NFR20`
- `_bmad-output/planning-artifacts/prd.md#NFR25`
- `_bmad-output/planning-artifacts/architecture.md#IP-UI-001 Journey Evidence`
- `_bmad-output/planning-artifacts/architecture.md#Target Directory Contract`
- `_bmad-output/implementation-artifacts/3-5-runtime-readiness-fixtures-blocker-reports.md`
- `src/runtime/planner/capability-routing.ts`
- `src/runtime/planner/types.ts`
- `src/runtime/verdict/types.ts`
- Claude Code docs index: <https://code.claude.com/docs/llms.txt>

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 2026-05-17: Reviewed Story 4.1 diff against AC and architecture guardrails; focused on report-only boundaries, action binding, data readback, and planning-vs-completion separation.
- 2026-05-17: Ran `npx vitest run tests/runtime/planner/user-journey-plan.test.ts` - passed, 10 tests.
- 2026-05-17: Ran `npm run test:planner` - passed, 14 tests.
- 2026-05-17: Ran `npm run typecheck` - passed.
- 2026-05-17: Ran `npm run verify` - passed.

### Completion Notes List

- Added TS-only journey planner contract exported from `src/runtime/planner/index.ts`; no shipped plugin schema or manifest changes were introduced.
- Implemented `planUserJourneyVerification()` as a pure planner that consumes topology, readiness, capability routes/matrix, evidence requirements, and optional journey hints without executing browser/API/data probes or writing evidence.
- Default evidence requirements now distinguish frontend browser evidence and full-stack browser/API/data evidence, with required artifacts and missing evidence surfaced in the plan.
- Report-only and fix mode are represented as planning constraints: report-only remains read-only/observation-only, and fix mode records recovery handoff plus same-path retry without executing repairs.
- Focused tests cover explicit journeys, inferred journeys, browser/API/data gaps, report-only sanitization, fix mode handoff, unknown routes, invalid action bindings, missing data readback, and empty action sequences.

### File List

- `src/runtime/planner/types.ts`
- `src/runtime/planner/index.ts`
- `src/runtime/planner/user-journey.ts`
- `tests/runtime/planner/user-journey-plan.test.ts`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Started dev-story implementation.
- 2026-05-17: Added user journey verification planner contract, implementation, and focused planner tests.
- 2026-05-17: Review patch added report-only action sanitization, expectation action-id validation, data readback checks, and explicit empty-action handling.
- 2026-05-17: Story verified and marked done.
