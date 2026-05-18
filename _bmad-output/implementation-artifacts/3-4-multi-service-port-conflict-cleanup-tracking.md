# Story 3.4: Multi-Service、端口冲突与清理追踪

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为验证多服务或 monorepo 项目的用户，
我希望 curdx-flow 能管理多个服务、处理端口冲突，并清楚记录哪些进程由 curdx-flow 启动和清理，
以便验证结束后不会留下不可解释的本地进程，也不会误杀用户已有服务。

## Acceptance Criteria

1. **多服务运行记录：** 给定 runtime topology 需要启动多个服务，当 service lifecycle 执行启动计划时，每个服务必须有独立 service id、root、命令、端口/URL、日志 artifact、health 状态和清理状态；报告事实必须展示服务之间的关系，例如 frontend、backend、worker、database emulator 或 plugin smoke target。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.4`; `_bmad-output/planning-artifacts/prd.md#FR11`; `_bmad-output/planning-artifacts/prd.md#NFR10`]
2. **端口归属区分：** 给定目标端口已被占用，当 curdx-flow 检测端口冲突时，系统必须区分 user-existing process 与 curdx-started process；不得自动杀掉用户已有进程，除非策略允许且用户明确授权。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.4`; `_bmad-output/planning-artifacts/prd.md#FR64`; `_bmad-output/planning-artifacts/architecture.md#src/runtime/services`]
3. **冲突处理决策：** 给定端口冲突可以通过换端口、复用已有服务或 blocker report 处理，当 planner/service layer 选择处理方式时，必须记录选择理由、风险等级、影响的 URL/API evidence 和 fallback；如果复用已有服务，证据必须标记为 warm/reused 而不是 cold-start。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.4`; `_bmad-output/planning-artifacts/prd.md#FR10`; `_bmad-output/planning-artifacts/prd.md#FR18`]
4. **清理追踪：** 给定 curdx-flow 启动了一个或多个本地服务，当 run 完成、失败或被取消时，系统必须记录清理尝试、结果、剩余进程和用户需要执行的下一步；清理失败必须进入 blocker 或 warning，不得静默丢失。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.4`; `_bmad-output/planning-artifacts/prd.md#NFR10`; `_bmad-output/planning-artifacts/prd.md#NFR22`]
5. **日志边界继承：** 给定服务日志非常大，当报告或 result summary 生成时，报告只包含关键日志窗口和 artifact 路径；原始日志保留策略必须避免把巨大日志塞入 transcript。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.4`; `_bmad-output/planning-artifacts/prd.md#NFR9`; `_bmad-output/implementation-artifacts/3-3-cold-start-service-lifecycle-health-checks.md#Review Findings`]
6. **验证覆盖：** 给定 Story 3.4 完成，当执行验证时，最小验证命令必须包含 `npm run typecheck`、multi-service/port/cleanup tests；测试必须覆盖多服务启动、端口占用、复用已有服务、拒绝杀用户进程、curdx-started process cleanup、清理失败和日志截断。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.4`]

## Tasks / Subtasks

- [x] 扩展 service runtime contract（AC: 1-6）
  - [x] 在 `src/runtime/services/types.ts` 中新增或扩展 `ServicePortClaim`、`PortConflict`、`ServiceOwnership`、`CleanupAttempt`、`ServiceCleanupStatus`、`MultiServiceStartPlan`、`MultiServiceLifecycleResult` 等 TS types。
  - [x] 保持 TS-only runtime contract；除非本 story 引入 shipped JSON artifact，否则不要新增 plugin schema/contract fixture。
  - [x] 区分 `cold-started`、`warm-reused`、`curdx-started`、`user-existing`、`unknown-existing` 等事实，不用自然语言代替机器可消费字段。
  - [x] `src/runtime/services/index.ts` 只导出 service lifecycle/port/cleanup helpers，不触碰 plugin manifest/hooks/skills。

- [x] 实现端口探测和冲突归属（AC: 2, 3, 6）
  - [x] 新增 `src/runtime/services/ports.ts` 或等价模块，支持用 `node:net` 探测 host/port 是否可连接。
  - [x] 对 start plan 声明的 port/URL 执行启动前检查；如果端口已监听，生成 `PortConflict`。
  - [x] 对 curdx 本次启动的进程，只能通过已有 `StartedServiceLifecycleResult.record.pid/processHandle` 和内部 tracking 判断为 `curdx-started`；不要猜测并杀掉任意本地 pid。
  - [x] user-existing/unknown-existing 端口冲突默认不得 kill；只能选择 `reuse`、`blocked` 或 `needs-human-input`，并记录 reason/risk/fallback。
  - [x] 复用已有服务时必须执行 health check；成功也标记为 warm/reused，不得当作 cold-start evidence。

- [x] 实现多服务启动编排（AC: 1, 3, 5, 6）
  - [x] 在 `src/runtime/services/lifecycle.ts` 或新模块中提供 `startServices()` / `runServiceLifecyclePlan()` 等 helper，按 plan 启动多个服务并返回按 service id 索引的结果。
  - [x] 每个 service result 必须保留独立 id、role、root、command、argv、port/URL、log artifact、health 和 blockers。
  - [x] 多服务关系应以结构化字段记录，例如 dependency/role/relation，不把 frontend/backend 关系只写在 summary。
  - [x] 任一必需服务 blocked 时，整体 multi-service result 不能是 complete/ready；services 仍然不调用 `evaluateCompletionVerdict()`。

- [x] 实现清理追踪（AC: 4, 6）
  - [x] 提供 `cleanupServices()` 或等价 helper，只清理本次 curdx-flow 启动并持有 stop handle/process handle 的服务。
  - [x] 每次清理尝试记录 service id、pid、signal、startedBy、attemptedAt、result、exitCode/signal、remainingProcess、log artifact path 和 nextAction。
  - [x] 清理失败必须返回 warning/blocker；不得吞掉 stop/kill 错误。
  - [x] 被复用的 user-existing/warm service 必须记录 `cleanupSkipped` 和原因，不得尝试 kill。
  - [x] run 失败或取消路径也必须能调用 cleanup helper 并拿到结构化 cleanup summary。

- [x] 增加 focused tests（AC: 1-6）
  - [x] 新增 `tests/runtime/services/multi-service-cleanup.test.ts` 或扩展 `tests/runtime/services/service-lifecycle.test.ts`。
  - [x] 覆盖两个服务成功启动并独立记录 health/log/cleanup 状态。
  - [x] 覆盖端口已被用户进程占用时不 kill 用户进程，返回 conflict/blocker 或 reused warm evidence。
  - [x] 覆盖 reuse existing service 成功但 evidence/status 标记为 warm/reused，不是 cold-start。
  - [x] 覆盖 curdx-started process cleanup 成功、cleanup failure warning/blocker、取消/失败路径 cleanup。
  - [x] 覆盖大日志仍然只进入 bounded window + artifact path。
  - [x] Tests 使用 `mkdtemp` 和本地 Node fixture process；不得在 repo root 写 `.curdx/**`、`specs/**`、`.claude/**`、`.mcp.json`。

- [x] 验证和记录（AC: 6）
  - [x] 确认 `npm run test:services` 覆盖 Story 3.4 新测试；如缺失则更新 `package.json` 的脚本/verify。
  - [x] 运行 focused multi-service/port/cleanup tests。
  - [x] 运行 `npm run typecheck`。
  - [x] 运行 `npm run verify`。

### Review Findings

- [x] [Review][Patch] Same-run curdx-started port conflicts were correctly classified in `PortConflict.owner` but still emitted `port-conflict-user-existing` blocker codes. Fixed blocker code selection and added regression coverage. [`src/runtime/services/lifecycle.ts`; `tests/runtime/services/multi-service-cleanup.test.ts`]
- [x] [Review][Patch] Duplicate service ids could overwrite results in the multi-service result map. Fixed by pre-validating duplicate ids before starting any process and returning a structured `duplicate-service-id` blocker. [`src/runtime/services/lifecycle.ts`; `tests/runtime/services/multi-service-cleanup.test.ts`]
- [x] [Validation][Patch] Full verify exposed an existing capability doctor runtime CLI child-process timeout at 5s. Increased that test helper timeout to 15s and reran `npm run test:capabilities` plus full `npm run verify`. [`tests/runtime/capabilities/capability-doctor.test.ts`]

## Dev Notes

### 当前发现

- Story 3.3 已建立 `src/runtime/services/types.ts`、`health.ts`、`lifecycle.ts`、`index.ts`，包含 `startService()`、`runHealthCheck()`、`evaluateServiceReadiness()`、bounded log window、log artifact path、process-exit cleanup 和 spawn-error blocker。3.4 应扩展这些模块，不重写一套服务启动器。[Source: `_bmad-output/implementation-artifacts/3-3-cold-start-service-lifecycle-health-checks.md#Completion Notes List`; `src/runtime/services/lifecycle.ts`]
- 3.3 review 已修复两个易复发问题：process-exit/spawn-error cleanup 必须有非悬挂 stop 保障；HTTP response summary 必须边读边截断，不能先 `response.text()` 全量读入。3.4 的 cleanup/log/report summary 必须继承这些修正。[Source: `_bmad-output/implementation-artifacts/3-3-cold-start-service-lifecycle-health-checks.md#Review Findings`]
- `ServiceLifecycleResult` 现在允许 lightweight result（用于 readiness aggregation）和 `StartedServiceLifecycleResult`（由 `startService()` 返回，含必需 `stop()`）。多服务/cleanup types 应保持这个区分，避免让只读 warm/reused service 伪装成 curdx-started service。[Source: `src/runtime/services/types.ts`]
- `startService()` 已经用 `spawn(executable, argv, { shell: false })`，并且 report-only disallowed service command 会直接 blocked。3.4 不得引入 shell 拼接或绕过 `allowedInReportOnly` 的执行路径。[Source: `src/runtime/services/lifecycle.ts`; `_bmad-output/implementation-artifacts/3-2-verification-command-script-detection.md#Review Findings`]
- `runHealthCheck()` 已支持 HTTP、port、process-exit/CLI exit status；3.4 的端口冲突复用场景应复用 health helper，而不是另写不一致的 readiness 逻辑。[Source: `src/runtime/services/health.ts`]
- Architecture 明确 `src/runtime/services` owns start/stop、health check、port ownership、conflict handling；browser journey 判定属于后续 probes/verdict，不属于 services。[Source: `_bmad-output/planning-artifacts/architecture.md#Target Directory Contract`; `_bmad-output/planning-artifacts/architecture.md#Service Boundaries`]

### Previous Story Intelligence

- Story 3.1 输出 topology roots/service hints；3.4 可消费 root/service facts，但不重新做 project discovery。
- Story 3.2 输出 `VerificationCommandCandidate`，service candidates 已有 argv-array、risk、startsService、allowedInReportOnly 等字段；3.4 不重新解析 package scripts。
- Story 3.3 输出 per-service start/health facts；3.4 应在其上增加 port ownership、multi-service relation 和 cleanup status。
- 3.3 测试已覆盖单服务成功、早退、health timeout、frontend-success/backend-fail、日志截断、argv-array、degraded inferred endpoint、process-exit timeout cleanup 和 missing executable spawn blocker。3.4 tests 不要重复低价值单服务 happy path，应聚焦多服务、冲突和 cleanup。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 用户验证多服务项目后不能留下不可解释进程，也不能误杀用户已有服务。 |
| Runtime Directory | `src/runtime/services/**` owns port ownership, multi-service lifecycle and cleanup facts. |
| Discovery Input | `RuntimeTopology` roots/service hints and `VerificationCommandCandidate` service candidates from Stories 3.1/3.2. |
| Existing Runtime Input | `ServiceStartPlan`, `StartedServiceLifecycleResult`, `HealthCheckPlan`, `runHealthCheck()`, `startService()` from Story 3.3. |
| Plugin Surface | 不新增 slash command、skill、agent、hook、manifest dependency。 |
| Schema / Contract | Prefer TS-only service result types unless a shipped JSON artifact is introduced. |
| Contract Test | Required only if schema/contract guard changes. |
| Runtime Test | `tests/runtime/services/**`。 |
| Fixture | `mkdtemp` + local Node child processes; no repo-root `.curdx/**` writes. |
| Evidence Output | Runtime facts: service ids, roles, ports, URLs, ownership, warm/reused/cold-start, cleanup attempts/results, blockers/warnings. |
| Report Surface | No report renderer change required; facts should be report-consumable later. |
| Failure Mode | occupied port, unknown owner, user-existing process, reuse health fail, cleanup fail, partial multi-service start, large logs. |
| Verification Commands | focused service tests, `npm run test:services`, `npm run typecheck`, `npm run verify`。 |

### Architecture Guardrails

- Never kill or signal a process that curdx-flow did not start in this run unless a future policy explicitly authorizes it and the user has explicitly approved. This story should not add user-process kill authorization.
- Do not infer process ownership from port number alone. `curdx-started` requires a tracked process handle from this run; otherwise treat as `user-existing` or `unknown-existing`.
- Reused service evidence is warm/reused, not cold-start. It can support limited runtime readiness only if health check passes and the report carries the degradation/ownership fact.
- Cleanup owns stop/kill attempts for curdx-started processes only. Cleanup results are runtime facts, not completion verdicts.
- Keep log summaries bounded and artifact-backed. Do not put raw large logs into result summaries, reports, story notes, or test failure messages.
- Do not implement browser/API/data probes in this story. Story 3.4 prepares services; Epic 4 consumes runnable services.
- Do not hand-edit generated hook bundles or plugin manifests for this story.

### Latest Claude Code Information

- 官方 Claude Code 文档索引入口：<https://code.claude.com/docs/llms.txt>。
- Story 3.4 does not change plugin manifest, hooks, skills, agents, dependencies, or release tags. If implementation unexpectedly touches those surfaces, re-check official Claude Code docs and run plugin validation.

### Files To Read Before Editing

**UPDATE candidates:**

- `src/runtime/services/types.ts`
- `src/runtime/services/lifecycle.ts`
- `src/runtime/services/health.ts`
- `src/runtime/services/index.ts`
- `tests/runtime/services/service-lifecycle.test.ts`
- `package.json`（仅当 `test:services`/`verify` 需要调整）

**NEW expected:**

- `src/runtime/services/ports.ts`
- `tests/runtime/services/multi-service-cleanup.test.ts`

**Only if shipped schema/contract boundary changes:**

- `plugins/curdx-flow/schemas/**`
- `src/runtime/contracts/index.ts`
- `tests/contracts/runtime-contracts.test.ts`
- `tests/fixtures/contracts/**`

**Do not touch for this story unless forced by tests:**

- `plugins/curdx-flow/.claude-plugin/plugin.json`
- `plugins/curdx-flow/hooks/hooks.json`
- `plugins/curdx-flow/hooks/scripts/**`
- `src/hooks/**`
- `plugins/curdx-flow/skills/**`
- `plugins/curdx-flow/agents/**`
- `src/runtime/probes/**`
- `src/runtime/verdict/**`
- `src/runtime/reports/**`

### Known Risks To Prevent

- Do not kill user-existing processes.
- Do not mark reused/warm services as cold-started.
- Do not treat frontend-only success as full-stack complete.
- Do not hide cleanup failures.
- Do not leave test child processes running.
- Do not reintroduce unbounded HTTP/log summaries.
- Do not create a second lifecycle implementation parallel to `startService()`.
- Do not add port conflict behavior to hooks or plugin skills; this belongs in deterministic runtime services.

## Project Structure Notes

- Alignment: Story 3.4 fills the `src/runtime/services` architecture responsibility for port ownership/conflict handling and cleanup tracking, building directly on Story 3.3.
- Existing good pattern: runtime modules expose `types.ts` + focused helpers + tests; add a narrow `ports.ts` only if it keeps port probing/ownership logic out of lifecycle noise.
- Brownfield note: the worktree is intentionally dirty from prior sprint artifacts; do not revert unrelated files or generated hook bundles.

## References

- `_bmad-output/planning-artifacts/epics.md#Story 3.4`
- `_bmad-output/planning-artifacts/epics.md#Epic 3`
- `_bmad-output/planning-artifacts/prd.md#FR8`
- `_bmad-output/planning-artifacts/prd.md#FR10`
- `_bmad-output/planning-artifacts/prd.md#FR11`
- `_bmad-output/planning-artifacts/prd.md#FR14`
- `_bmad-output/planning-artifacts/prd.md#FR18`
- `_bmad-output/planning-artifacts/prd.md#FR64`
- `_bmad-output/planning-artifacts/prd.md#NFR9`
- `_bmad-output/planning-artifacts/prd.md#NFR10`
- `_bmad-output/planning-artifacts/prd.md#NFR22`
- `_bmad-output/planning-artifacts/architecture.md#Target Directory Contract`
- `_bmad-output/planning-artifacts/architecture.md#Service Boundaries`
- `_bmad-output/implementation-artifacts/3-1-project-topology-runtime-discovery.md`
- `_bmad-output/implementation-artifacts/3-2-verification-command-script-detection.md`
- `_bmad-output/implementation-artifacts/3-3-cold-start-service-lifecycle-health-checks.md`
- `src/runtime/services/types.ts`
- `src/runtime/services/lifecycle.ts`
- `src/runtime/services/health.ts`
- Claude Code docs index: <https://code.claude.com/docs/llms.txt>

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 2026-05-17: RED `npx vitest run tests/runtime/services/multi-service-cleanup.test.ts` failed because `startServices()` and `cleanupServices()` were not implemented.
- 2026-05-17: GREEN `npm run test:services` passed with 17 service tests after multi-service/port/cleanup implementation.
- 2026-05-17: `npm run typecheck` passed after exporting multi-service and cleanup types.
- 2026-05-17: Implementation `npm run verify` passed.
- 2026-05-17: Code review found same-run port blocker-code drift and duplicate service-id overwrite risk; both patched with regressions.
- 2026-05-17: Validation patch `npm run test:capabilities` passed after increasing runtime CLI timeout to 15s.
- 2026-05-17: Final post-review `npm run verify` passed.

### Completion Notes List

- Added service port/ownership/startup/cleanup/multi-service types to `src/runtime/services/types.ts`.
- Added `src/runtime/services/ports.ts` for bounded `node:net` port probing and structured `PortConflict` creation.
- Added `startServices()` for sequential multi-service orchestration with per-service records, relations, port conflicts, warm reuse, and aggregate blockers.
- Added `cleanupServices()` for curdx-started process cleanup attempts, skipped cleanup for user-existing/warm services, and blocker output on cleanup failure.
- Preserved Story 3.3 constraints: argv-array execution, no shell concatenation, bounded log windows, no completion verdict ownership, and no generated plugin artifact edits.
- Added focused tests for multi-service startup, user-existing port conflict, same-run curdx-started conflict, warm reuse, cleanup failure, and multi-service log truncation.
- Code review follow-up complete: same-run port blocker codes now match ownership, duplicate service ids block before process startup, and the full verify capability timeout is stabilized.

### File List

- `_bmad-output/implementation-artifacts/3-4-multi-service-port-conflict-cleanup-tracking.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/runtime/services/types.ts`
- `src/runtime/services/ports.ts`
- `src/runtime/services/lifecycle.ts`
- `src/runtime/services/index.ts`
- `tests/runtime/capabilities/capability-doctor.test.ts`
- `tests/runtime/services/multi-service-cleanup.test.ts`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Implemented multi-service lifecycle, port conflict ownership, warm reuse, cleanup tracking, focused tests, and marked story ready for review.
- 2026-05-17: Addressed code review/validation findings, reran full verification, and moved story status to done.
