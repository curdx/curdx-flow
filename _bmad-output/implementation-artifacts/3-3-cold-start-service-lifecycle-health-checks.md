# Story 3.3: Cold-Start Service Lifecycle and Health Checks

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为需要确认项目真的能跑起来的用户，
我希望 curdx-flow 能从冷启动开始启动必要服务、捕获日志、执行健康检查并记录服务状态，
以便页面/API 验证建立在真实可用的运行环境上，而不是依赖已经打开的旧进程或猜测。

## Acceptance Criteria

1. **冷启动服务记录：** 给定 runtime planner 已选择一个或多个 dev/start 命令，当 service lifecycle 启动服务时，必须记录 command、argv、root、PID 或进程句柄、启动时间、环境摘要、日志 artifact 路径和关联 evidence id；不得依赖 repo-relative dev-only 路径或 shell 拼接命令。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.3`; `_bmad-output/planning-artifacts/prd.md#FR8`; `_bmad-output/planning-artifacts/architecture.md#src/runtime/services`]
2. **健康检查证据：** 给定服务启动后需要判断是否可用，当 health check 执行时，系统必须检查配置或推断的 URL、端口、health endpoint、CLI exit status 或可访问状态；成功 evidence 必须包含访问目标、状态、响应摘要或就绪信号。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.3`; `_bmad-output/planning-artifacts/prd.md#FR14`]
3. **失败 blocker：** 给定服务启动失败、超时、端口未监听或 health check 失败，当 runtime 生成结果时，必须输出 blocker，包含命令、exit code、关键 stdout/stderr 摘要、日志窗口、可能层级和下一步动作；不得进入后续 browser/API/data 成功验证。[Source: `_bmad-output/planning-artifacts/prd.md#FR10`; `_bmad-output/planning-artifacts/epics.md#Story 3.3`]
4. **全栈降级：** 给定前端服务启动成功但后端服务失败，当项目被识别为全栈或需要 API/data evidence 时，verdict 不得为 complete；报告事实必须明确“页面可访问不等于全栈完成”。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.3`; `_bmad-output/planning-artifacts/epics.md#Epic 3 Implementation notes`]
5. **推断 endpoint 降级：** 给定 health check 只能通过 inferred endpoint 完成，当 endpoint 置信度不足时，evidence 必须标记 degraded 或 needs-human-input；不得把推断 health 成功当作完整运行证明。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.3`; `_bmad-output/planning-artifacts/prd.md#FR14`]
6. **验证覆盖：** 给定 Story 3.3 完成，当执行验证时，最小验证命令必须包含 `npm run typecheck`、service lifecycle/health check tests；测试必须覆盖成功启动、启动失败、health timeout、前端成功后端失败、日志截断、argv-array 执行、degraded inferred endpoint。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.3`]

## Tasks / Subtasks

- [x] 固定 service runtime contract 和边界（AC: 1-6）
  - [x] 新增 `src/runtime/services/types.ts`，定义 `ServiceStartPlan`、`ServiceRuntimeRecord`、`HealthCheckPlan`、`HealthCheckResult`、`ServiceLifecycleResult`、`ServiceBlocker` 等 TS types。
  - [x] 新增 `src/runtime/services/index.ts`，只导出 service lifecycle/health helpers，不触碰 plugin manifest/hooks/skills。
  - [x] 服务层可以执行显式传入的 argv-array 命令，但不得 shell 拼接，不得自行从用户输入拼命令，不得拥有 completion truth。
  - [x] 日志只保留关键窗口和 artifact path；大日志不得完整进入 result summary。

- [x] 实现受控服务启动记录（AC: 1, 3, 6）
  - [x] 新增 `src/runtime/services/lifecycle.ts` 或等价模块，支持从 `VerificationCommandCandidate`/start plan 生成启动记录。
  - [x] 通过 injectable process adapter 或 Node `spawn` 封装执行，记录 executable、argv、root、pid/process handle、startedAt、env summary、log artifact path、evidence id。
  - [x] 捕获 stdout/stderr rolling window，输出 truncated log window；不得把完整大日志写入对话/summary。
  - [x] 启动失败、spawn error、exit before ready、timeout 必须产生 blocker，包含 exitCode、stdout/stderr 摘要、日志路径和 next action。

- [x] 实现健康检查（AC: 2, 3, 5, 6）
  - [x] 新增 `src/runtime/services/health.ts`，支持 HTTP URL health check、port/URL 可访问检查、process exit status 检查。
  - [x] HTTP health result 应包含 target URL、status code、response summary/ready signal、durationMs。
  - [x] inferred endpoint 必须携带 confidence；低置信度成功只能 `degraded` 或 `needs-human-input`，不能支撑 complete。
  - [x] health timeout 或 non-2xx 响应必须输出 blocker。

- [x] 汇总 runtime readiness，防止前端成功掩盖后端失败（AC: 3, 4, 5）
  - [x] 提供 `evaluateServiceReadiness()` 或等价 helper，汇总多个 service results。
  - [x] 当 topology/full-stack 或 required API/data evidence 存在且 backend/API service failed/blocked 时，整体 result 必须为 `blocked` 或 `partial`，并包含“页面可访问不等于全栈完成”的 missing evidence/blocked reason。
  - [x] 不调用 `evaluateCompletionVerdict()` 伪造 complete；只输出后续 verdict/report 可消费的 runtime facts。

- [x] 增加 focused tests（AC: 1-6）
  - [x] 新增 `tests/runtime/services/service-lifecycle.test.ts` 和/或 `tests/runtime/services/health-check.test.ts`。
  - [x] 覆盖成功启动、启动失败、health timeout、前端成功后端失败、日志截断、argv-array 执行、degraded inferred endpoint。
  - [x] Tests 使用 `mkdtemp` 和本地 Node fixture process；不得在 repo root 写 `.curdx/**`、`specs/**`、`.claude/**`、`.mcp.json`。
  - [x] 测试必须清理由测试启动的进程，避免留下本地服务。

- [x] 验证和记录（AC: 6）
  - [x] 新增 `test:services` script 并接入 `npm run verify`，或确保 `test:discovery`/其他现有 gate 覆盖 service tests。
  - [x] 运行 focused service tests。
  - [x] 运行 `npm run typecheck`。
  - [x] 运行 `npm run verify`。

### Review Findings

- [x] [Review][Patch] Process-exit/spawn-error cleanup could leave a non-hanging guarantee untested. Fixed by racing process-exit health with spawn errors, making `stop()` skip impossible close waits after spawn failure, and adding timeout cleanup/spawn-error regressions. [`src/runtime/services/lifecycle.ts`; `tests/runtime/services/service-lifecycle.test.ts`]
- [x] [Review][Patch] HTTP health response summaries were truncated after `response.text()`, which could read large bodies before bounding evidence. Fixed by reading bounded response chunks and adding large health response coverage. [`src/runtime/services/health.ts`; `tests/runtime/services/service-lifecycle.test.ts`]

## Dev Notes

### 当前发现

- `src/runtime/services/` 当前不存在；architecture 明确把 dev server 生命周期、start/stop、health check、port ownership 和 conflict handling 放在该目录。Story 3.3 先实现 cold-start + health evidence；端口冲突和完整 cleanup tracking 留给 Story 3.4。[Source: `_bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries`; `_bmad-output/planning-artifacts/architecture.md#src/runtime/services`]
- Story 3.2 已新增 `VerificationCommandCandidate`，其中 service candidates 使用 argv-array、`startsService`、`riskLevel`、`allowedInReportOnly` 等字段。3.3 应消费这些候选，不重新解析 shell command。[Source: `_bmad-output/implementation-artifacts/3-2-verification-command-script-detection.md#Completion Notes List`; `src/runtime/discovery/command-detection.ts`]
- Story 3.2 review 已修复 destructive script risk 和 scriptName 选择；3.3 执行层必须继续尊重 `allowedInReportOnly` 和 risk facts，不执行 report-only 禁止动作。[Source: `_bmad-output/implementation-artifacts/3-2-verification-command-script-detection.md#Review Findings`]
- Evidence schema 已支持 `source: "service"` 和 artifacts。3.3 可产生 service/runtime facts 或 evidence-shaped records，但不要直接写 ledger，除非本 story 明确实现 evidence persistence。[Source: `src/runtime/contracts/index.ts`; `src/runtime/evidence/types.ts`]
- Report-only/verification truth 仍由 verdict/report 层决定。Services 输出 blockers、health facts 和 degraded status，不声明 business completion。[Source: `_bmad-output/implementation-artifacts/2-6-qa-report-only-evidence-surface.md`; `src/runtime/verdict/evaluator.ts`]

### Previous Story Intelligence

- Story 3.1：runtime topology 提供 project type/root/plugin facts；unknown 或 malformed 不得被包装成功。
- Story 3.2：command detection 输出 safe argv-array candidates；non-Node 不强行 npm；report-only disallowed risks 已可见。
- 3.3 必须把这些 facts 转成可运行服务/健康检查 evidence，但不做 Story 3.4 的端口冲突归属和完整 cleanup ownership。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 用户需要冷启动真实服务，而不是验证旧进程或猜测页面/API 可用。 |
| Runtime Directory | `src/runtime/services/**` owns service lifecycle and health facts. |
| Discovery Input | `RuntimeTopology` and `VerificationCommandCandidate` from Stories 3.1/3.2. |
| Plugin Surface | 不新增 slash command、skill、agent、hook、manifest dependency。 |
| Schema / Contract | Prefer TS-only service result types unless a shipped JSON artifact is introduced. |
| Contract Test | Required only if schema/contract guard changes. |
| Runtime Test | `tests/runtime/services/**`。 |
| Fixture | `mkdtemp` + local Node child process fixture; no repo-root `.curdx/**` writes. |
| Evidence Output | Service runtime facts: command, argv, pid, log artifact path, health target/status, blockers. |
| Report Surface | No report renderer change required; facts should be report-consumable later. |
| Failure Mode | spawn failure, early exit, timeout, health non-2xx, frontend-only success with backend failure, low-confidence inferred endpoint. |
| Verification Commands | focused service tests, `npm run typecheck`, `npm run verify`。 |

### Architecture Guardrails

- Use executable + argv arrays only. Do not execute through `sh -c` or concatenate command strings.
- Keep service runtime side effects explicit and test-contained. Tests must terminate child processes they start.
- Log output must be bounded. Result summaries should include a window and artifact path, not full raw logs.
- Low-confidence inferred endpoints are degraded facts, not complete runtime proof.
- If backend/API service fails in full-stack context, browser/page success cannot produce complete readiness.
- Service lifecycle can produce blockers and evidence facts; it must not own completion verdict.

### Latest Claude Code Information

- 官方 Claude Code 文档索引入口：<https://code.claude.com/docs/llms.txt>。
- Story 3.3 does not change plugin manifest, hooks, skills, agents, dependencies, or release tags. If implementation touches those surfaces, re-check official Claude Code docs and run plugin validation.

### Files To Read Before Editing

**UPDATE candidates:**

- `package.json`（如新增 `test:services`）
- `src/runtime/discovery/command-detection.ts`
- `src/runtime/discovery/index.ts`
- `src/runtime/evidence/types.ts`
- `src/runtime/contracts/index.ts`
- `src/runtime/verdict/evaluator.ts`

**NEW expected:**

- `src/runtime/services/types.ts`
- `src/runtime/services/lifecycle.ts`
- `src/runtime/services/health.ts`
- `src/runtime/services/index.ts`
- `tests/runtime/services/service-lifecycle.test.ts`

**Do not touch for this story unless forced by tests:**

- `plugins/curdx-flow/.claude-plugin/plugin.json`
- `plugins/curdx-flow/hooks/hooks.json`
- `plugins/curdx-flow/hooks/scripts/**`
- `src/hooks/**`
- `plugins/curdx-flow/skills/**`
- `plugins/curdx-flow/agents/**`

### Known Risks To Prevent

- Do not shell-concatenate command strings.
- Do not execute commands disallowed by report-only/risk policy.
- Do not treat HTTP 200 on frontend as full-stack completion if backend/API failed.
- Do not leave child processes running after tests.
- Do not put huge logs into result summaries.
- Do not add port ownership/kill-user-process behavior in this story; that belongs to 3.4.
- Do not hand-edit generated hook bundles.

## Project Structure Notes

- Alignment: Story 3.3 creates the first `src/runtime/services/**` slice required by architecture, consuming topology and command candidates but leaving port conflict and cleanup ownership to Story 3.4.
- Existing good pattern: runtime modules expose `types.ts` + focused helpers + tests; keep services similarly narrow.
- Brownfield note: implementation should be testable without invoking real user project scripts in the repo root.

## References

- `_bmad-output/planning-artifacts/epics.md#Story 3.3`
- `_bmad-output/planning-artifacts/epics.md#Epic 3`
- `_bmad-output/planning-artifacts/prd.md#FR8`
- `_bmad-output/planning-artifacts/prd.md#FR10`
- `_bmad-output/planning-artifacts/prd.md#FR14`
- `_bmad-output/planning-artifacts/prd.md#NFR8`
- `_bmad-output/planning-artifacts/prd.md#NFR9`
- `_bmad-output/planning-artifacts/prd.md#NFR10`
- `_bmad-output/planning-artifacts/architecture.md#src/runtime/services`
- `_bmad-output/implementation-artifacts/3-1-project-topology-runtime-discovery.md`
- `_bmad-output/implementation-artifacts/3-2-verification-command-script-detection.md`
- `src/runtime/discovery/command-detection.ts`
- `src/runtime/evidence/types.ts`
- Claude Code docs index: <https://code.claude.com/docs/llms.txt>

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 2026-05-17: RED `npx vitest run tests/runtime/services/service-lifecycle.test.ts` failed because `src/runtime/services/index.ts` did not exist.
- 2026-05-17: GREEN `npm run test:services` passed with 8 service lifecycle/health tests.
- 2026-05-17: `npm run typecheck` passed after tightening started-service result types.
- 2026-05-17: Final implementation `npm run verify` passed.
- 2026-05-17: Code review found 2 patch items; added process cleanup/spawn-error and bounded HTTP response summary fixes.
- 2026-05-17: Review patch `npm run test:services` passed with 11 tests.
- 2026-05-17: Final post-review `npm run verify` passed.

### Completion Notes List

- Added service lifecycle runtime types and exports under `src/runtime/services/**` without changing plugin manifest/hooks/skills.
- Added `startService()` using Node `spawn` with `shell: false`, executable + argv arrays, PID/process handle, startedAt, env key summary, evidence id, and log artifact path recording.
- Added bounded stdout/stderr rolling windows and log artifact writing; large logs stay out of result summaries.
- Added structured blockers for spawn/log artifact failures, early exit before readiness, process/health timeout, failed health checks, and report-only execution boundaries.
- Added HTTP, port, and process-exit/CLI health checks with target/status/duration/response summary or ready signal facts.
- Added low-confidence inferred endpoint degradation with `needsHumanInput`, preventing inferred HTTP success from becoming complete proof.
- Added `evaluateServiceReadiness()` to keep full-stack/API/data readiness blocked when frontend succeeds but backend/API evidence fails, including the required “页面可访问不等于全栈完成” fact.
- Added focused service tests and wired `npm run test:services` into `npm run verify`.
- Code review follow-up complete: spawn/process-exit cleanup is covered, missing executable stop handles do not hang, and HTTP health response summaries are bounded before entering evidence.

### File List

- `_bmad-output/implementation-artifacts/3-3-cold-start-service-lifecycle-health-checks.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `package.json`
- `src/runtime/services/types.ts`
- `src/runtime/services/health.ts`
- `src/runtime/services/lifecycle.ts`
- `src/runtime/services/index.ts`
- `tests/runtime/services/service-lifecycle.test.ts`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Implemented cold-start service lifecycle, health checks, readiness aggregation, focused tests, and marked story ready for review.
- 2026-05-17: Addressed code review findings, reran full verification, and moved story status to done.
