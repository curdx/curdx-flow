# Story 3.5: Runtime Readiness Fixtures and Blocker Reports

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为 curdx-flow 维护者，
我希望项目识别、命令检测、冷启动、健康检查和服务清理都有可运行 fixtures 和标准 blocker reports，
以便后续 browser/API/data 验证建立在可复现的运行准备能力上。

## Acceptance Criteria

1. **Fixture 覆盖：** 给定 Epic 3 的 runtime readiness 能力被实现，当测试 fixtures 运行时，`tests/fixtures/**` 或等价 fixture 目录必须覆盖至少 frontend-app、api-app、fullstack-app、monorepo、unknown/broken app、Claude Code plugin-like project；每个 fixture 都必须有 expected topology、expected commands、expected health result 或 expected blocker。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.5`; `_bmad-output/planning-artifacts/architecture.md#Fixture and Evidence Rules`]
2. **结构化 blocker report：** 给定 fixture 代表依赖安装失败、启动失败、health 失败、端口占用、前端成功后端失败或 unknown project，当 runtime readiness 运行时，系统必须输出结构化 blocker report；blocker 必须包含 `category`、`message`、`reproduction`、`attemptedActions`、`nextAction`、`owner`、`riskLevel`、`evidenceRefs`。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.5`; `_bmad-output/planning-artifacts/prd.md#FR10`; `_bmad-output/planning-artifacts/prd.md#FR18`; `_bmad-output/planning-artifacts/prd.md#NFR22`]
3. **L2 runtime evidence：** 给定 fixture 代表成功运行准备，当 runtime readiness 完成时，必须产生 L2 runtime evidence，包括 command、service state、health check 和 artifact index；该 evidence 可被 Epic 4 browser/API/data verification 复用。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.5`; `_bmad-output/planning-artifacts/prd.md#FR12`; `_bmad-output/planning-artifacts/prd.md#FR13`; `_bmad-output/planning-artifacts/prd.md#FR14`; `_bmad-output/planning-artifacts/architecture.md#FR12-FR18 Evidence and Artifact Ledger`]
4. **Human-readable report：** 给定 blocker report 被人类可读报告渲染，当用户查看报告时，用户必须能看出卡在哪里、哪个命令失败、关键日志在哪里、下一步做什么；不得需要用户自己翻大量日志猜原因。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.5`; `_bmad-output/planning-artifacts/prd.md#FR17`; `_bmad-output/planning-artifacts/prd.md#NFR9`; `_bmad-output/planning-artifacts/architecture.md#User-Facing Verdict & Evidence Experience Model`]
5. **测试可控：** 给定 fixture 运行在 CI 或本地测试中，当依赖外部端口、浏览器或全局工具不可用时，测试必须使用可控 fake service/fake adapter 或明确 skip-with-reason；不得依赖用户机器上的偶然运行状态。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.5`; `_bmad-output/project-context.md#Testing Rules`]
6. **验证覆盖：** 给定 Story 3.5 完成，当执行验证时，最小验证命令必须包含 `npm run typecheck`、runtime readiness fixture tests；测试必须覆盖 successful readiness、blocked readiness、unknown project、port conflict、frontend-only success with backend failure、artifact lifecycle。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.5`]

## Tasks / Subtasks

- [x] 定义 runtime readiness contract（AC: 1-6）
  - [x] 新增 `src/runtime/readiness/types.ts` 或等价模块，定义 `RuntimeReadinessInput`、`RuntimeReadinessResult`、`RuntimeReadinessFixtureExpectation`、`RuntimeBlockerReport`、`RuntimeEvidenceBundle`。
  - [x] `RuntimeBlockerReport` 必须机器可消费地包含 `category`、`message`、`reproduction`、`attemptedActions`、`nextAction`、`owner`、`riskLevel`、`evidenceRefs`；不要只复用自然语言 `ServiceBlocker.summary`。
  - [x] `RuntimeReadinessResult` 只输出 facts、blockers、evidence bundle 和 report，不调用或拥有 `evaluateCompletionVerdict()`。
  - [x] 保持 TS-only runtime contract，除非产生新的 shipped JSON artifact；如果新增 shipped schema，必须同步 `plugins/curdx-flow/schemas/**`、contract types 和 contract tests。

- [x] 建立可复现 readiness fixtures（AC: 1, 5, 6）
  - [x] 新增 `tests/fixtures/runtime-readiness/frontend-app`、`api-app`、`fullstack-app`、`monorepo`、`unknown-broken-app`、`claude-code-plugin-like` 或等价路径。
  - [x] 每个 fixture 包含最小 `package.json` / plugin manifest / source marker 和 `expected-readiness.json` 或等价 expected 数据，覆盖 expected topology、expected commands、expected health result 或 expected blocker。
  - [x] Fixture 里的 service scripts 优先使用 Node 内置模块 fake server/fake CLI，避免 npm install、浏览器、全局 Claude CLI 或偶然端口依赖。
  - [x] Tests 必须复制 fixture 到 `mkdtemp` workspace 后执行；不得在 repo root 写真实 `.curdx/**`、`specs/**`、`.claude/**`、`.mcp.json`。

- [x] 实现 readiness 聚合器（AC: 1-4, 6）
  - [x] 新增 `src/runtime/readiness/index.ts`、`evaluator.ts`、`blockers.ts`、`evidence.ts`、`report.ts` 或等价窄模块。
  - [x] 复用 `discoverRuntimeTopology()`，不要重新实现 project scanner。
  - [x] 复用 `detectVerificationCommands()` 和 `createServiceStartPlanFromCandidate()`，不要重新解析 package scripts 或 shell command。
  - [x] 复用 `startService()` / `startServices()` / `cleanupServices()` / `runHealthCheck()`，不要创建第二套 service lifecycle。
  - [x] 对 unknown project、malformed package、无 service command、启动失败、health 失败、端口冲突、依赖安装失败等场景归一化为 `RuntimeBlockerReport`。
  - [x] 对 full-stack 需求继续复用 `evaluateServiceReadiness()` 防止 frontend-only success 被误认为全栈 ready。
  - [x] 成功 readiness 必须输出 command facts、service records、health summaries、cleanup summary、artifact refs，并明确 cold-start 与 warm/reused 区别。

- [x] 产生 L2 runtime evidence 和 artifact index（AC: 3, 6）
  - [x] 复用 `src/runtime/evidence/ledger.ts`、`artifacts.ts`、`types.ts` 的 `EvidenceBlock` / `ArtifactIndexInput` / `appendEvidence()` contract。
  - [x] Evidence source 应为 `service` 或 `command`，`trustLevel` 对真实 health pass 使用 `verified`，对 inferred/warm/skip 使用 `degraded`。
  - [x] Artifact index 至少记录 service log artifact、readiness report artifact 或 fixture report artifact；路径必须 workspace-relative。
  - [x] Tests 使用 fake IO 或 temp workspace 验证 ledger + artifact index lifecycle，避免污染 repo root。

- [x] 渲染人类可读 runtime readiness report（AC: 2, 4）
  - [x] 提供 `renderRuntimeReadinessReport()` 或等价 helper，输出短 markdown/string summary，必须包含 blocker category/message、失败命令、关键日志 artifact、attempted actions、owner、risk、next action、evidence refs。
  - [x] 报告只包含 bounded log window 和 artifact path，不塞入完整日志。
  - [x] 若选择复用 `src/runtime/reports/**`，保持 generic report contract 不被 readiness-only 字段污染；必要时在 `src/runtime/readiness/report.ts` 做专用渲染。

- [x] 增加 focused runtime readiness tests（AC: 1-6）
  - [x] 新增 `tests/runtime/readiness/runtime-readiness-fixtures.test.ts` 或等价文件。
  - [x] 覆盖 successful readiness：frontend/api/fullstack 至少一个通过 cold-start health 并写入 L2 evidence + artifact index。
  - [x] 覆盖 blocked readiness：启动失败、health 失败、unknown/broken project、依赖安装失败或无可执行 service command 至少各有结构化 blocker。
  - [x] 覆盖 port conflict：user-existing port 默认 blocked 且不 kill；allow reuse 只作为 warm/reused degraded/verified evidence。
  - [x] 覆盖 frontend-only success with backend failure：frontend pass + backend fail 仍然 blocked，并生成对应 blocker report。
  - [x] 覆盖 Claude Code plugin-like project：发现 plugin root 和 plugin-validation command，但测试不要求真实 `claude plugin validate` 可用；不可用时必须 fake 或 skip-with-reason。
  - [x] 更新 `package.json` 增加 `test:readiness` 并接入 `npm run verify`，除非新测试已被现有脚本稳定覆盖。

- [x] 验证和记录（AC: 6）
  - [x] 先跑新增 readiness focused tests。
  - [x] 运行 `npm run typecheck`。
  - [x] 运行 `npm run verify`。
  - [x] 将验证命令和结果写入本 story 的 Dev Agent Record。

### Review Findings

- [x] [Review][Patch] Readiness report artifact was written before evidence summaries were attached, so the persisted `.curdx/artifacts/readiness/*.md` could lack the evidence section even though the returned report had it. Split evidence bundle creation from persistence, render the final report with evidence first, then write the report artifact and append ledger/index entries. [`src/runtime/readiness/evidence.ts`; `src/runtime/readiness/evaluator.ts`; `tests/runtime/readiness/runtime-readiness-fixtures.test.ts`]
- [x] [Review][Patch] Warm-reused user-existing services with passing health could produce `verified` runtime evidence trust, making reused services indistinguishable from cold-started services at evidence level. Evidence trust now requires cold-started + verified health; warm reuse remains reusable but degraded evidence, with regression coverage. [`src/runtime/readiness/evidence.ts`; `tests/runtime/readiness/runtime-readiness-fixtures.test.ts`]
- [x] [Review][Patch] Multiple selected service commands for the same root could create no-service-plan skip noise after one health-checkable service plan had already covered the root. Readiness now suppresses redundant selected service candidates once a candidate-backed plan covers that root. [`src/runtime/readiness/evaluator.ts`; `tests/runtime/readiness/runtime-readiness-fixtures.test.ts`]

## Dev Notes

### 当前发现

- Story 3.1 已建立 `RuntimeTopology`、`ProjectRootTopology`、`DiscoveryHint`、`runtime-topology.schema.json` 和 `discoverRuntimeTopology()`；3.5 必须消费这些 facts，不重新扫描项目或重新定义 topology contract。[Source: `_bmad-output/implementation-artifacts/3-1-project-topology-runtime-discovery.md#Completion Notes List`; `src/runtime/discovery/project-topology.ts`; `src/runtime/discovery/types.ts`]
- Story 3.2 已建立 `VerificationCommandCandidate` 和 `detectVerificationCommands()`，命令以 executable + argv array 表示，并带 `startsService`、`riskLevel`、`allowedInReportOnly`、`evidencePurpose`；3.5 不得引入 shell 拼接命令或重新解析 package scripts。[Source: `_bmad-output/implementation-artifacts/3-2-verification-command-script-detection.md#Completion Notes List`; `src/runtime/discovery/command-detection.ts`]
- Story 3.3 已建立 `startService()`、`runHealthCheck()`、`evaluateServiceReadiness()`、bounded log window、health blocker 和 service log artifact path；3.5 应把这些转成 runtime readiness evidence/blocker，不重写启动器。[Source: `_bmad-output/implementation-artifacts/3-3-cold-start-service-lifecycle-health-checks.md#Completion Notes List`; `src/runtime/services/lifecycle.ts`; `src/runtime/services/health.ts`]
- Story 3.4 已建立 `startServices()`、`cleanupServices()`、端口冲突归属、warm reuse、same-run curdx-started conflict、duplicate service id blocker 和 cleanup summary；3.5 的 port conflict/cleanup fixture 必须复用这些事实。[Source: `_bmad-output/implementation-artifacts/3-4-multi-service-port-conflict-cleanup-tracking.md#Completion Notes List`; `src/runtime/services/ports.ts`; `src/runtime/services/types.ts`]
- `src/runtime/evidence/ledger.ts` 已提供 `appendEvidence()`，会校验 `EvidenceBlock` 并追加 ledger 与 artifact index；3.5 应复用它验证 L2 runtime evidence lifecycle。[Source: `src/runtime/evidence/ledger.ts`; `src/runtime/evidence/artifacts.ts`; `src/runtime/contracts/index.ts`]
- `src/runtime/reports/renderer.ts` 是通用 verification report；3.5 可以新增 readiness 专用 report helper，除非确实需要改 generic renderer。[Source: `src/runtime/reports/renderer.ts`; `_bmad-output/planning-artifacts/architecture.md#Target Directory Contract`]

### Previous Story Intelligence

- 3.1 review 修复过 escaped path 和 workspace aggregator 问题；fixture expected paths 必须保持 workspace-relative，不输出绝对路径或 `../`。
- 3.2 review 修复过 destructive script risk 和 scriptName 选择；readiness 不得在 report-only 场景执行 `allowedInReportOnly === false` 的命令。
- 3.3 review 修复过 process-exit/spawn-error cleanup 防悬挂，以及 HTTP response summary 边读边截断；readiness report 不得重新引入无界日志/响应摘要。
- 3.4 review 修复过 same-run port blocker code 和 duplicate service id overwrite；readiness aggregation 不得覆盖同名 service result，也不得把 `port-conflict-curdx-started` 写回 user-existing。
- 最近 full verify 曾因 capability doctor 子进程 5s timeout 不稳而修到 15s；readiness tests 要保持短超时但必须能稳定 cleanup，不依赖机器速度。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 后续 browser/API/data verification 需要一个可复现、可审查的 runtime readiness 基线，而不是偶然通过的本机服务状态。 |
| Runtime Directory | 优先新增 `src/runtime/readiness/**`；复用 `src/runtime/discovery/**`、`src/runtime/services/**`、`src/runtime/evidence/**`。 |
| Discovery Input | `RuntimeTopology` roots/service/plugin facts from Story 3.1。 |
| Command Input | `VerificationCommandPlan` and selected command/service candidates from Story 3.2。 |
| Service Input | `ServiceStartPlan`、`MultiServiceStartPlan`、`ServiceLifecycleResult`、`MultiServiceLifecycleResult` from Stories 3.3/3.4。 |
| Plugin Surface | 不新增 slash command、skill、agent、hook、manifest dependency。Claude plugin-like fixture 是目标项目 fixture，不是 shipped plugin surface 变更。 |
| Schema / Contract | Prefer TS-only readiness types. Only add shipped schema if a persisted JSON artifact requires it. |
| Contract Test | Required only if shipped schema/contract guard changes. |
| Runtime Test | `tests/runtime/readiness/**`。 |
| Fixture | `tests/fixtures/runtime-readiness/**`，复制到 temp workspace 后运行。 |
| Evidence Output | L2 runtime evidence: command facts、service state、health check、cleanup summary、artifact index refs。 |
| Report Surface | `renderRuntimeReadinessReport()` 或等价专用 renderer；human-readable blocker summary。 |
| Failure Mode | unknown project、malformed package、missing command、dependency/install blocker、spawn failure、health failure、port conflict、frontend pass/backend fail、artifact write failure。 |
| Verification Commands | readiness focused tests, `npm run typecheck`, `npm run verify`。 |

### Architecture Guardrails

- Runtime readiness 是 facts/evidence/blocker 聚合层，不是 completion verdict。不要调用 `evaluateCompletionVerdict()`，不要输出“任务完成”结论。
- 不要实现 browser/API/data probes；Epic 4 会消费 readiness 输出再做 journey verification。
- 不要 kill user-existing process。端口冲突默认 blocker；warm reuse 必须带 ownership/startupMode 降级或验证事实。
- 不要把 warm/reused service 当 cold-start evidence。
- 不要把 dependency install 失败伪装成测试失败摘要；它必须是 blocker report，含 reproduction、attemptedActions、nextAction、owner、riskLevel、evidenceRefs。
- 不要要求 tests 真实执行 `npm install`、浏览器、全局 Claude CLI 或外部 MCP。需要时使用 fake adapter 或 skip-with-reason。
- 不要在 repo root 写 `.curdx/**`、`.claude/**`、`.mcp.json`、`specs/**`。所有 artifact lifecycle tests 使用 temp workspace 或 fake IO。
- 不要手改 generated hook bundles 或 plugin manifest。当前 story 不需要 `plugins/curdx-flow/hooks/scripts/**`、`src/hooks/**`、`plugins/curdx-flow/skills/**`、`plugins/curdx-flow/agents/**`。
- 大日志只保留 bounded window + artifact path；不要把完整 stdout/stderr 塞进 markdown report 或 test snapshots。

### Latest Claude Code Information

- 官方 Claude Code 文档索引入口已刷新：<https://code.claude.com/docs/llms.txt>。
- Story 3.5 只新增目标项目 Claude Code plugin-like fixture，不修改 curdx-flow shipped plugin manifest、hooks、skills、agents、dependencies 或 release tags。若实现意外触碰这些 surface，必须重新查官方 docs 并运行 plugin validation/smoke。

### Files To Read Before Editing

**UPDATE candidates:**

- `package.json`（新增 `test:readiness` 并接入 `verify`）
- `src/runtime/services/types.ts`（仅当 readiness contract 需要小幅补充 service facts）
- `src/runtime/services/lifecycle.ts`（仅当 fixture 暴露复用/cleanup bug）
- `src/runtime/services/index.ts`（仅当新增导出需要）

**NEW expected:**

- `src/runtime/readiness/types.ts`
- `src/runtime/readiness/evaluator.ts`
- `src/runtime/readiness/blockers.ts`
- `src/runtime/readiness/evidence.ts`
- `src/runtime/readiness/report.ts`
- `src/runtime/readiness/index.ts`
- `tests/runtime/readiness/runtime-readiness-fixtures.test.ts`
- `tests/fixtures/runtime-readiness/frontend-app/**`
- `tests/fixtures/runtime-readiness/api-app/**`
- `tests/fixtures/runtime-readiness/fullstack-app/**`
- `tests/fixtures/runtime-readiness/monorepo/**`
- `tests/fixtures/runtime-readiness/unknown-broken-app/**`
- `tests/fixtures/runtime-readiness/claude-code-plugin-like/**`

**Only if persisted JSON schema changes:**

- `plugins/curdx-flow/schemas/**`
- `src/runtime/contracts/index.ts`
- `tests/contracts/**`
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
- release/version/tag files

### Known Risks To Prevent

- Reinventing discovery, command detection, service lifecycle, evidence ledger, or report redaction.
- Running shell-concatenated commands from fixture scripts.
- Depending on installed package dependencies in fixtures.
- Writing absolute artifact paths into evidence or artifact index.
- Treating unknown project as success because no command was found.
- Treating frontend health success as full-stack readiness when backend/API failed.
- Hiding cleanup failures after blocked readiness.
- Regressing port conflict owner classification.
- Letting fake service child processes survive failed tests.

## Project Structure Notes

- Alignment: Story 3.5 fills the architecture gap for runtime readiness fixtures and blocker normalization while keeping service execution in `src/runtime/services` and evidence persistence in `src/runtime/evidence`。
- Existing good pattern: runtime modules use `types.ts` + focused helpers + Vitest coverage; mirror that pattern under `src/runtime/readiness/**`。
- Fixture rule: `tests/fixtures/**` should represent user project shapes, not implementation internals. Keep expected files explicit and small.
- Brownfield note: the worktree is intentionally dirty from prior sprint artifacts; do not revert unrelated files or generated hook bundles.

## References

- `_bmad-output/planning-artifacts/epics.md#Story 3.5`
- `_bmad-output/planning-artifacts/epics.md#Epic 3`
- `_bmad-output/planning-artifacts/prd.md#FR8`
- `_bmad-output/planning-artifacts/prd.md#FR9`
- `_bmad-output/planning-artifacts/prd.md#FR10`
- `_bmad-output/planning-artifacts/prd.md#FR11`
- `_bmad-output/planning-artifacts/prd.md#FR12`
- `_bmad-output/planning-artifacts/prd.md#FR13`
- `_bmad-output/planning-artifacts/prd.md#FR14`
- `_bmad-output/planning-artifacts/prd.md#FR17`
- `_bmad-output/planning-artifacts/prd.md#FR18`
- `_bmad-output/planning-artifacts/prd.md#NFR1`
- `_bmad-output/planning-artifacts/prd.md#NFR9`
- `_bmad-output/planning-artifacts/prd.md#NFR10`
- `_bmad-output/planning-artifacts/prd.md#NFR22`
- `_bmad-output/planning-artifacts/architecture.md#Target Directory Contract`
- `_bmad-output/planning-artifacts/architecture.md#Service Boundaries`
- `_bmad-output/planning-artifacts/architecture.md#Fixture and Evidence Rules`
- `_bmad-output/implementation-artifacts/3-1-project-topology-runtime-discovery.md`
- `_bmad-output/implementation-artifacts/3-2-verification-command-script-detection.md`
- `_bmad-output/implementation-artifacts/3-3-cold-start-service-lifecycle-health-checks.md`
- `_bmad-output/implementation-artifacts/3-4-multi-service-port-conflict-cleanup-tracking.md`
- `src/runtime/discovery/project-topology.ts`
- `src/runtime/discovery/command-detection.ts`
- `src/runtime/services/lifecycle.ts`
- `src/runtime/services/types.ts`
- `src/runtime/evidence/ledger.ts`
- Claude Code docs index: <https://code.claude.com/docs/llms.txt>

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 2026-05-17: RED `npx vitest run tests/runtime/readiness/runtime-readiness-fixtures.test.ts` failed because `src/runtime/readiness/index.ts` did not exist.
- 2026-05-17: GREEN `npm run test:readiness` passed with 5 readiness fixture tests.
- 2026-05-17: `npm run test:services` passed with 18 existing service lifecycle tests.
- 2026-05-17: `npm run typecheck` passed after tightening readiness override types.
- 2026-05-17: Implementation `npm run verify` passed after adding `test:readiness` to the full gate.
- 2026-05-17: Code review found stale persisted report evidence section, warm reuse trust drift, and redundant service-command skip noise; all patched with focused coverage.
- 2026-05-17: Post-review `npm run test:readiness` passed with 6 readiness fixture tests.
- 2026-05-17: Final post-review `npm run verify` passed.

### Completion Notes List

- Added `src/runtime/readiness/**` with TS-only runtime readiness contracts, evaluator, blocker normalization, L2 evidence bundle creation, and human-readable report rendering.
- Runtime readiness now reuses project topology discovery, verification command detection, service lifecycle, health checks, cleanup, and evidence ledger helpers instead of duplicating those systems.
- Added structured `RuntimeBlockerReport` output with category, message, reproduction, attempted actions, next action, owner, risk level, evidence refs, and bounded stdout/stderr windows.
- Added deterministic runtime-readiness fixtures for frontend, API, full-stack, monorepo, unknown/broken, and Claude Code plugin-like projects.
- Added focused tests for successful cold-start readiness with ledger/artifact index writes, dependency/topology blockers, user-existing port conflict safety, warm reuse degraded evidence trust, frontend pass/backend fail blocking, and plugin validation skip-with-reason.
- Added `npm run test:readiness` and wired it into `npm run verify`.
- Code review follow-up complete: persisted report artifacts now include evidence summaries, warm reuse no longer gets cold-start-level trust, and duplicate selected service command skips are suppressed after a root has a service plan.

### File List

- `_bmad-output/implementation-artifacts/3-5-runtime-readiness-fixtures-blocker-reports.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `package.json`
- `src/runtime/readiness/types.ts`
- `src/runtime/readiness/blockers.ts`
- `src/runtime/readiness/evidence.ts`
- `src/runtime/readiness/report.ts`
- `src/runtime/readiness/evaluator.ts`
- `src/runtime/readiness/index.ts`
- `tests/runtime/readiness/runtime-readiness-fixtures.test.ts`
- `tests/fixtures/runtime-readiness/frontend-app/package.json`
- `tests/fixtures/runtime-readiness/frontend-app/package-lock.json`
- `tests/fixtures/runtime-readiness/frontend-app/index.html`
- `tests/fixtures/runtime-readiness/frontend-app/scripts/fake-server.mjs`
- `tests/fixtures/runtime-readiness/frontend-app/expected-readiness.json`
- `tests/fixtures/runtime-readiness/api-app/package.json`
- `tests/fixtures/runtime-readiness/api-app/package-lock.json`
- `tests/fixtures/runtime-readiness/api-app/src/server.ts`
- `tests/fixtures/runtime-readiness/api-app/prisma/schema.prisma`
- `tests/fixtures/runtime-readiness/api-app/scripts/fake-server.mjs`
- `tests/fixtures/runtime-readiness/api-app/expected-readiness.json`
- `tests/fixtures/runtime-readiness/fullstack-app/package.json`
- `tests/fixtures/runtime-readiness/fullstack-app/package-lock.json`
- `tests/fixtures/runtime-readiness/fullstack-app/app/api/users/route.ts`
- `tests/fixtures/runtime-readiness/fullstack-app/scripts/fake-server.mjs`
- `tests/fixtures/runtime-readiness/fullstack-app/scripts/fail-server.mjs`
- `tests/fixtures/runtime-readiness/fullstack-app/expected-readiness.json`
- `tests/fixtures/runtime-readiness/monorepo/package.json`
- `tests/fixtures/runtime-readiness/monorepo/package-lock.json`
- `tests/fixtures/runtime-readiness/monorepo/apps/web/package.json`
- `tests/fixtures/runtime-readiness/monorepo/apps/web/index.html`
- `tests/fixtures/runtime-readiness/monorepo/apps/web/scripts/fake-server.mjs`
- `tests/fixtures/runtime-readiness/monorepo/apps/api/package.json`
- `tests/fixtures/runtime-readiness/monorepo/apps/api/src/server.ts`
- `tests/fixtures/runtime-readiness/monorepo/apps/api/scripts/fake-server.mjs`
- `tests/fixtures/runtime-readiness/monorepo/expected-readiness.json`
- `tests/fixtures/runtime-readiness/unknown-broken-app/README.md`
- `tests/fixtures/runtime-readiness/unknown-broken-app/expected-readiness.json`
- `tests/fixtures/runtime-readiness/claude-code-plugin-like/.claude-plugin/plugin.json`
- `tests/fixtures/runtime-readiness/claude-code-plugin-like/hooks/hooks.json`
- `tests/fixtures/runtime-readiness/claude-code-plugin-like/skills/help/SKILL.md`
- `tests/fixtures/runtime-readiness/claude-code-plugin-like/bin/curdx-flow`
- `tests/fixtures/runtime-readiness/claude-code-plugin-like/expected-readiness.json`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Started dev-story implementation.
- 2026-05-17: Implemented runtime readiness fixtures, blocker reports, evidence bundle, report renderer, focused tests, and marked story ready for review.
- 2026-05-17: Addressed code review findings, reran full verification, and moved story status to done.
