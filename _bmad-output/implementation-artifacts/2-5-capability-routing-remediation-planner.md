# Story 2.5: Capability Routing 与 Remediation Planner

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为不想手动选择底层工具的用户，
我希望 curdx-flow 根据任务类型、项目形态、风险等级、可用能力和证据需求自动选择验证能力，
以便系统能说明为什么用 Playwright、Chrome DevTools MCP、API checks、ui-ux-pro-max、context7、claude-mem、pua 或 sequential-thinking，并在能力缺失时给出补救路径。

## Acceptance Criteria

1. **证据需求路由：** 给定 runtime planner 收到任务类型、项目 topology、mode policy、capability status 和 evidence requirements，当生成验证计划时，每项 evidence requirement 必须映射到一个首选 capability、fallback capability 或 blocker；计划必须记录选择理由、降级影响、trust level、是否需要人工确认和是否阻塞 completion。[Source: `_bmad-output/planning-artifacts/epics.md#Story 2.5`; `_bmad-output/planning-artifacts/prd.md#FR42`]
2. **Browser evidence 策略：** 给定前端或全栈任务需要 browser evidence，当 Playwright、Chrome DevTools MCP、Claude Chrome 或相关能力可用性不同，routing 必须优先选择可复跑证据路径，说明真实浏览器诊断与可复跑 E2E 的差异；缺少关键 browser capability 时不得静默通过。[Source: `_bmad-output/planning-artifacts/epics.md#Story 2.5`; `_bmad-output/planning-artifacts/architecture.md#Frontend Architecture`]
3. **Intelligence capability 路由：** 给定任务需要最新官方文档、历史失败检索、复杂并行诊断或高风险架构推理，当 context7、claude-mem、pua、sequential-thinking 可用性被检测时，routing 必须选择合适能力或生成 degraded/blocker；不得 vendor、复制或重实现这些能力。[Source: `_bmad-output/planning-artifacts/prd.md#FR45`; `_bmad-output/project-context.md#Product Surface`]
4. **Remediation plan：** 给定某个缺失能力可以通过安装、启用、更新或配置修复，当 remediation planner 生成补救方案时，输出必须包含具体动作、风险等级、policy decision、是否需要用户授权、预期恢复的 evidence capability、验证命令、失败 fallback；高风险或全局配置动作不得自动执行，除非策略允许并有明确授权。[Source: `_bmad-output/planning-artifacts/prd.md#FR44`; `_bmad-output/planning-artifacts/prd.md#FR68`; `_bmad-output/implementation-artifacts/2-4-report-only-fix-mode-risk-policy.md#Review Findings`]
5. **Remediation 后仍不可调用：** 给定 remediation 执行或被建模为已尝试后能力仍不可调用，当 doctor 或 planner 重新检查时，状态必须保持 degraded/unavailable；报告必须说明已尝试动作、失败原因、下一步和对完成结论的影响。[Source: `_bmad-output/planning-artifacts/prd.md#FR69`; `_bmad-output/planning-artifacts/prd.md#FR70`]
6. **Fallback 不伪装完整验证：** 给定 routing 选择 fallback capability，当该 fallback 只提供较低信任等级 evidence，completion verdict 必须保留 degraded、partial 或 manual-confirmation-required 信息；不得把 fallback evidence 包装成完整验证。[Source: `_bmad-output/planning-artifacts/architecture.md#Degraded Mode Experience`; `_bmad-output/planning-artifacts/prd.md#FR43`]
7. **验证覆盖：** 给定 Story 2.5 完成，当执行验证时，最小验证命令必须包含 `npm run typecheck`、runtime planner routing tests、capability/remediation tests；测试必须覆盖 browser evidence routing、API routing、external MCP unavailable、plugin dependency unavailable、remediation success/failure、fallback degraded verdict。[Source: `_bmad-output/planning-artifacts/epics.md#Story 2.5`]

## Tasks / Subtasks

- [x] 固定 Story 2.5 范围和复用边界（AC: 1-7）
  - [x] 完整读取 `src/runtime/capabilities/**`、`src/runtime/policy/**`、`src/runtime/verdict/**`、`src/runtime/reports/**`、`src/runtime/contracts/index.ts` 和相关 tests。
  - [x] 本 story 建立 routing/remediation 的 deterministic runtime contract；planner 只读输入并输出计划，不执行 Playwright、MCP、shell、install、push、tag、publish 或源码修复。
  - [x] 真实能力执行仍属于 future adapters/Epic 4/Epic 5/Epic 6；本 story 可以通过 fake adapter facts 和 capability matrix fixtures 证明路由/补救决策。

- [x] 新增 runtime planner routing contract（AC: 1, 2, 3, 6, 7）
  - [x] 新建 `src/runtime/planner/types.ts`、`src/runtime/planner/capability-routing.ts`、`src/runtime/planner/index.ts` 或等价模块。
  - [x] 定义 `EvidenceRoutingRequirement`、`CapabilityRouteDecision`、`CapabilityRoutingPlan`：至少包含 requirement id/source、primary capability、fallback capabilities、decision、reason、trustLevel、degradedReason、manualConfirmationRequired、blocksCompletion、blockers、remediationRefs。
  - [x] 未新增 shipped JSON contract；本 story 使用显式 TypeScript boundary 和 runtime tests，未触达 plugin/CLI JSON boundary。
  - [x] planner 输入必须接受 `CapabilityMatrix`、`ActionRiskPolicy`/policy decisions、task type、topology hints、evidence requirements；不得读取文件系统或调用外部工具。

- [x] 实现 evidence requirement 到 capability 的路由规则（AC: 1, 2, 3, 6）
  - [x] Browser/frontend/fullstack：优先 `browser.playwright` 或现有 `playwright` capability 作为可复跑证据；`chrome-devtools-mcp` 用于真实浏览器现场诊断；Claude Chrome 只能作为辅助或 manual/degraded 路径，不得作为唯一 release-grade rerunnable evidence。
  - [x] API/data/backend：路由到 command/API/data capability 或 blocker；如果缺少项目 topology/API hints，应输出 degraded/manual-confirmation-required，不得臆造 endpoint。
  - [x] UX evidence：路由到 `ui-ux-pro-max` plugin dependency；不可用时生成 degraded/manual confirmation 或 blocker，并说明视觉/响应式/交互证据缺口。
  - [x] 最新官方文档：路由到 `context7` external MCP；不可用时标记 latest-doc lookup degraded/blocked，不能用陈旧本地文档伪装已确认。
  - [x] 历史失败检索：路由到 `claude-mem` plugin dependency；不可用时保留 degraded，不能假装历史失败已检索。
  - [x] 并行诊断/复杂 agent 分解：路由到 `pua` plugin dependency；复杂高风险推理路由到 `sequential-thinking` external MCP；不可用时输出 fallback 和信任降低。

- [x] 新增 remediation planner（AC: 4, 5, 7）
  - [x] 新建 `src/runtime/capabilities/remediation.ts` 或在 planner 下建立清晰模块；保持纯函数、可 fixture 测试、无真实 shell/global config 写入。
  - [x] 为缺失/disabled/untrusted plugin dependency 生成 Claude Code plugin dependency remediation：安装/启用/更新提示、marketplace trust 说明、`claude plugin list --json` 或 `claude plugin validate ./plugins/curdx-flow` 验证步骤。
  - [x] 为 external MCP 缺失生成外部配置 remediation：说明 `context7`、`sequential-thinking` 是 expected external MCP，不写入 plugin dependencies，不生成 plugin-local `.mcp.json` 静默配置。
  - [x] 为 browser/Playwright 缺失生成 remediation：例如项目内安装/启用 Playwright、运行可复跑 E2E 或选择 report-only degraded path；不得直接执行 install。
  - [x] 每条 remediation action 必须调用或复用 `evaluateActionPolicy()` 产出 risk/policy decision/action log 形状；高风险、global config、release/publish/tag/push 默认 blocked。
  - [x] 支持 attempted remediation fact 输入：当 action 已尝试但 capability 仍不可调用，输出 failure reason、preserved degraded/unavailable state、completion impact 和 next action。

- [x] 接入 verdict/report projection（AC: 5, 6）
  - [x] 扩展 `evaluateCompletionVerdict()` 或其输入 normalization，使 routing fallback/degraded/blocker 能转成 missing evidence、unverified scope、manual confirmation 或 blocker。
  - [x] 扩展 `renderVerificationReport()` 或 report sections，显示 routing choices、capability blockers、remediation plan、attempted remediation failure 和 fallback trust downgrade。
  - [x] Report markdown/JSON 必须清楚区分：selected primary capability、fallback capability、not attempted、policy blocked、attempted but still unavailable。
  - [x] 不改变 Story 2.4 的 report-only source-change 边界；report-only 下 remediation 只能作为建议/plan/artifact 输出，不得暗示已执行修复。

- [x] Runtime CLI/doctor 集成只做必要最小面（AC: 1, 4, 7）
  - [x] 未新增 runtime CLI surface；routing/remediation 作为纯 runtime helpers 暴露给后续 stories 消费。
  - [x] 未触碰 `src/hooks/**` 或 `src/hooks/lib/runtime-cli.ts`；`npm run verify` 仍跑过 `check:hooks-fresh` 和 `test:hooks`。
  - [x] 只新增纯 runtime helpers，未增加 plugin slash command 或 manifest surface。

- [x] 增加 focused tests 和 fixtures（AC: 1-7）
  - [x] 新增 `tests/runtime/planner/capability-routing.test.ts`：覆盖 browser evidence routing、API/data routing、UX routing、latest-doc/history/parallel-diagnostic routing、fallback degraded、manual confirmation。
  - [x] 新增或扩展 `tests/runtime/capabilities/remediation-planner.test.ts`：覆盖 plugin dependency missing/disabled/trust drift、external MCP missing、Playwright missing、remediation attempted but still unavailable。
  - [x] 扩展 `tests/runtime/verdict/verdict-evaluator.test.ts`：fallback degraded 不能 complete；critical capability blocker 进入 blocked；manual-allowed fallback 进入 manual-confirmation-required。
  - [x] 扩展 `tests/runtime/reports/report-renderer.test.ts`：report 显示 routing reason、remediation plan、policy blocked action、attempted failure 和 degraded trust。
  - [x] 未新增 contract schema；无需扩展 contract fixtures。
  - [x] Tests 必须使用 fixtures 或 `mkdtemp`，不得依赖真实 `~/.claude`、真实 MCP、真实 plugin install、真实 browser、真实 npm install 或网络。

- [x] 验证和记录（AC: 7）
  - [x] 运行 `npm run typecheck`、`npm run test:capabilities`、planner focused vitest path、`npm run test:verdict`、`npm run test:reports`。
  - [x] 如新增 `test:planner` script，把它纳入 `npm run verify`，避免 Story 2.4 刚修过的 focused tests 漏跑问题重现。
  - [x] 未发生 contract/schema 变更；`npm run verify` 仍包含并通过 `npm run test:contracts`。
  - [x] 未发生 runtime CLI/hook bundle source 变更；`npm run verify` 仍包含并通过 `npm run check:hooks-fresh`、`npm run test:hooks`。
  - [x] 未发生 plugin-facing manifest/skill/runtime surface 变更；无需运行额外 Claude plugin validate/smoke。
  - [x] 在 Dev Agent Record 记录实现摘要、验证命令、文件列表、deferred scope 和任何 review findings。

### Review Findings

- [x] [Review][Patch] Playwright fast-doctor `skipped` verifier candidate was selected for routing but still produced `remediate-playwright` references — fixed by suppressing remediation refs for selected routes and excluding configured/callable-skipped Playwright candidates from remediation planning. [`src/runtime/planner/capability-routing.ts`; `src/runtime/capabilities/remediation.ts`]
- [x] [Review][Patch] UX/visual/responsive evidence without an explicit `capabilityId` routed to generic manual evidence instead of `ui-ux-pro-max` — fixed by adding UX keyword routing and regression coverage. [`src/runtime/planner/capability-routing.ts`; `tests/runtime/planner/capability-routing.test.ts`]

## Dev Notes

### 当前发现

- `src/runtime/capabilities/types.ts` 已有 `CapabilityMatrix`、`CapabilityStatus`、configured/installed/callable/authorized/degraded/unavailable 字段，可直接作为 routing 输入；不要另造“存在/不存在”二态模型。[Source: `src/runtime/capabilities/types.ts`]
- `src/runtime/capabilities/readiness.ts` 已区分 plugin dependencies 与 external MCP。`pua`、`claude-mem`、`chrome-devtools-mcp`、`ui-ux-pro-max` 是 plugin dependencies；`context7`、`sequential-thinking` 是 expected external MCP。Story 2.5 必须复用这条边界。[Source: `src/runtime/capabilities/readiness.ts`; `_bmad-output/project-context.md#Product Surface`]
- `src/runtime/capabilities/doctor.ts` 已能把 plugin、external MCP、browser、hook freshness、native `/goal`、release 等事实汇聚成 matrix；routing planner 应读取 matrix 中的 state/reason/evidenceImpact/remediation，而不是重复执行 doctor probe。[Source: `src/runtime/capabilities/doctor.ts`]
- `src/runtime/policy/action-risk-policy.ts` 已提供 `buildDefaultActionRiskPolicy()`、`classifyActionRisk()`、`validateModeWriteBoundary()`、`evaluateActionPolicy()`、action log 和 high/critical command classification。Remediation planner 必须通过这些 API 表达安装/配置/启用/发布相关动作风险。[Source: `src/runtime/policy/action-risk-policy.ts`]
- `evaluateCompletionVerdict()` 已消费 `state.policy.actionDecisions`/`policyEffects`，并会把 blocked/skipped/manual-confirmation-required policy decision 转成 blocked 或 partial；Story 2.5 应沿用该通道输出 routing degradation 和 remediation blockers。[Source: `src/runtime/verdict/evaluator.ts`]
- `renderVerificationReport()` 已能显示 degraded capabilities、policy effects、action logs 和 report-only issues；Story 2.5 应扩展 report sections，不要重写报告系统。[Source: `src/runtime/reports/renderer.ts`; `src/runtime/reports/types.ts`]
- `package.json` 已有 `test:capabilities`、`test:policy` 并已把它们纳入 `verify`；目前没有 `test:planner`。若新增 planner tests，建议新增 script 并纳入 `verify`。[Source: `package.json`]

### Previous Story Intelligence

- Story 2.1 的核心教训：configured 或 skipped 不等于 ready。Story 2.5 的 route decision 必须区分 available/degraded/unavailable/skipped/unknown，并说明证据影响。[Source: `_bmad-output/implementation-artifacts/2-1-capability-model-doctor-matrix.md#Review Findings`]
- Story 2.2 的核心教训：plugin dependencies 与 external MCP 的 provisioning model 不同。不要把 `context7`、`sequential-thinking` 加进 plugin manifest dependencies，也不要在 plugin-local `.mcp.json` 静默配置它们。[Source: `_bmad-output/implementation-artifacts/2-2-plugin-dependencies-external-mcp-readiness.md#Dev Notes`]
- Story 2.3 的核心教训：native `/goal` 只在版本、hooks/settings 和 condition 长度都满足时可用；planner 可推荐 execution driver，但不得用 Stop hook 构建第二套 continuation loop。[Source: `_bmad-output/implementation-artifacts/2-3-native-goal-detection-manual-fallback.md#Completion Notes List`]
- Story 2.4 的 code review 教训必须直接应用：report-only write roots 不可被配置扩宽到 `.curdx/**` 外；raw irreversible commands 必须 critical + authorization gated；focused tests 必须进入 `verify`。[Source: `_bmad-output/implementation-artifacts/2-4-report-only-fix-mode-risk-policy.md#Review Findings`]

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 用户不想手选工具，也不想在缺工具时得到“看起来成功”的假结果。 |
| Runtime Directory | `src/runtime/planner/**` owns route decision; `src/runtime/capabilities/**` owns remediation plan facts; `src/runtime/policy/**` gates remediation actions. |
| Plugin Surface | Indirect unless implementation exposes runtime CLI JSON. No new slash command required by default. |
| Schema / Contract | Prefer explicit `CapabilityRoutingPlan` TypeScript contract; add shipped schema only if report/CLI/plugin boundary consumes it. |
| Contract Test | Required if schema/contract registry expands. |
| Runtime Test | `tests/runtime/planner/capability-routing.test.ts` and `tests/runtime/capabilities/remediation-planner.test.ts`. |
| Adapter Test | Not required unless concrete adapters are added; use fake capability facts instead of real tools. |
| Fixture | Capability matrix fixtures for available/degraded/unavailable/skipped and attempted remediation failure. |
| Evidence Output | Route decisions point to required `EvidenceRequirement` and future evidence capability id; fallback trust downgrade must become verdict/report fact. |
| Report Surface | Markdown/JSON shows routing reason, selected/fallback capability, blocker, remediation plan and attempted failure. |
| Failure Mode | Missing browser capability, external MCP unavailable, plugin dependency unavailable, policy blocked remediation, attempted remediation still not callable. |
| Verification Commands | `npm run typecheck`, `npm run test:capabilities`, planner focused tests, `npm run test:verdict`, `npm run test:reports`, `npm run test:contracts` if schema changes. |

### Architecture Guardrails

- Runtime planner 是控制面：只读取 goal/state/evidence/policy/capability status，输出下一步计划、所需证据和 verdict 输入；不直接执行外部工具、不拥有 evidence 真相、不替代 adapters。[Source: `_bmad-output/planning-artifacts/architecture.md#Runtime Boundary Hardening`]
- Capability adapter model 是检测、路由、验证或降级外部能力，不 vendor、不重实现 `pua`、`claude-mem`、`chrome-devtools-mcp`、`ui-ux-pro-max`、`context7`、`sequential-thinking`。[Source: `_bmad-output/planning-artifacts/architecture.md#Security Architecture`]
- Degraded capability 可以继续工作，但必须输出不可用能力、原本要验证什么、fallback、信任下降、是否需要人工确认、是否禁止完成或发布。[Source: `_bmad-output/planning-artifacts/architecture.md#Degraded Mode Experience`]
- Browser verification 分工：Playwright/project E2E 是可复跑验收和长期回归；Chrome DevTools MCP 是真实浏览器现场诊断；Claude Chrome 只能辅助用户真实浏览器/登录态，不能作为唯一 release gate；ui-ux-pro-max 覆盖视觉、交互、响应式和可用性检查。[Source: `_bmad-output/planning-artifacts/architecture.md#Frontend Architecture`]
- Report-only 下 remediation 只能作为建议/计划输出；fix mode 中普通 dev dependency/source mutation 也必须 action log + same-path retry；global config、push/tag/npm publish/plugin release/destructive action 必须显式授权或 release-stage。[Source: `_bmad-output/implementation-artifacts/2-4-report-only-fix-mode-risk-policy.md#Architecture Guardrails`]
- Hooks 不得成为 planner 入口；如需要 runtime CLI surface，hook 只读取轻量 JSON/状态或输出 gate/context，不执行长时间 remediation。[Source: `_bmad-output/project-context.md#Hook Runtime Contracts`]

### Latest Claude Code Information

- 官方 Claude Code 文档索引已核对：`https://code.claude.com/docs/llms.txt` 是当前 docs 入口，插件、hooks、MCP、plugin dependencies 行为以该入口和本机 `claude` CLI 为准。
- Plugin dependencies 是 Claude Code plugin manifest/marketplace 的安装关系；external MCP 仍是用户环境能力。Story 2.5 的 remediation 文案必须继续区分二者，不能把 external MCP 写成 plugin dependency。Source: <https://code.claude.com/docs/en/plugin-dependencies>.
- MCP Tool Search 会按需暴露 MCP 工具 schema，降低 context 压力；curdx-flow 应保持能力描述简洁，通过 routing 决定何时需要 `context7` 或 `sequential-thinking`，不要在 prompt 中复制大型 MCP 工具说明。Source: <https://code.claude.com/docs/en/mcp>.
- Claude Code hooks/permissions 文档强调 tool execution 和 hook decisions 是权限边界；remediation planner 只能输出 policy-gated action plan，不能绕过用户授权执行高风险命令。Source: <https://code.claude.com/docs/en/hooks>.

### Files To Read Before Editing

**UPDATE candidates:**

- `src/runtime/capabilities/types.ts`
- `src/runtime/capabilities/readiness.ts`
- `src/runtime/capabilities/doctor.ts`
- `src/runtime/capabilities/renderer.ts`
- `src/runtime/capabilities/index.ts`
- `src/runtime/policy/action-risk-policy.ts`
- `src/runtime/policy/types.ts`
- `src/runtime/policy/index.ts`
- `src/runtime/verdict/evaluator.ts`
- `src/runtime/verdict/types.ts`
- `src/runtime/reports/renderer.ts`
- `src/runtime/reports/types.ts`
- `src/runtime/contracts/index.ts`
- `tests/runtime/capabilities/capability-doctor.test.ts`
- `tests/runtime/policy/action-risk-policy.test.ts`
- `tests/runtime/verdict/verdict-evaluator.test.ts`
- `tests/runtime/reports/report-renderer.test.ts`
- `package.json`

**NEW expected:**

- `src/runtime/planner/types.ts`
- `src/runtime/planner/capability-routing.ts`
- `src/runtime/planner/index.ts`
- `src/runtime/capabilities/remediation.ts`
- `tests/runtime/planner/capability-routing.test.ts`
- `tests/runtime/capabilities/remediation-planner.test.ts`
- Optional if shipped boundary is needed: `plugins/curdx-flow/schemas/capability-routing-plan.schema.json`

**Only if runtime CLI or plugin-facing hook surface changes:**

- `src/hooks/lib/runtime-cli.ts`
- `plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs`
- `plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs.map`

### Known Risks To Prevent

- Do not implement real install/update/enable/global MCP config writes in this story unless they are behind an injected executor, policy authorization, and tests that never touch real user state.
- Do not call `claude plugin install`, `claude mcp add`, `npm install`, Playwright, browser, external MCP, git push/tag, npm publish, or plugin release from tests.
- Do not treat `configured: true` or `callable: unknown` as available.
- Do not let fallback evidence complete frontend/fullstack/release-grade checks when browser/API/data evidence is still missing.
- Do not duplicate capability definitions that already live in `src/registry/capabilities.ts` and `src/runtime/capabilities/**`.
- Do not add plugin dependencies for `context7` or `sequential-thinking`.
- Do not make report-only remediation text imply a fix was executed.
- Do not write artifacts under repo root `.curdx/**` during tests; use `mkdtemp`.
- Do not hand-edit generated hook bundles.

## Project Structure Notes

- Alignment: Story 2.5 is the bridge from capability readiness/policy to later browser/API/data verification and failure recovery. It should produce planner facts that Epic 4 and Epic 5 can consume without changing evidence/verdict truth.
- Existing good pattern: Stories 2.1-2.4 used pure runtime helpers, strict TypeScript contracts and focused Vitest tests. Keep this shape; avoid pushing planner logic into skills or hooks.
- Backcompat note: Existing reports and verdict already accept unknown future fields in `state.policy`; routing facts can first use future-compatible policy/report sections before adding a shipped schema.
- Testing note: Prefer small capability matrix builders in tests over full doctor CLI. Use real CLI only for smoke if runtime surface changes.

## References

- `_bmad-output/planning-artifacts/epics.md#Story 2.5`
- `_bmad-output/planning-artifacts/epics.md#Story Requirement Trace`
- `_bmad-output/planning-artifacts/prd.md#Capability Routing & Dependency Readiness`
- `_bmad-output/planning-artifacts/prd.md#Tool Installation & Capability Remediation`
- `_bmad-output/planning-artifacts/architecture.md#Security Architecture`
- `_bmad-output/planning-artifacts/architecture.md#Frontend Architecture`
- `_bmad-output/planning-artifacts/architecture.md#Runtime Boundary Hardening`
- `_bmad-output/planning-artifacts/architecture.md#Degraded Mode Experience`
- `_bmad-output/planning-artifacts/architecture.md#IP-ARCH-001 Runtime Module Ownership`
- `_bmad-output/project-context.md`
- `_bmad-output/implementation-artifacts/2-1-capability-model-doctor-matrix.md`
- `_bmad-output/implementation-artifacts/2-2-plugin-dependencies-external-mcp-readiness.md`
- `_bmad-output/implementation-artifacts/2-3-native-goal-detection-manual-fallback.md`
- `_bmad-output/implementation-artifacts/2-4-report-only-fix-mode-risk-policy.md`
- `src/runtime/capabilities/types.ts`
- `src/runtime/capabilities/readiness.ts`
- `src/runtime/capabilities/doctor.ts`
- `src/runtime/policy/action-risk-policy.ts`
- `src/runtime/verdict/evaluator.ts`
- `src/runtime/reports/renderer.ts`
- Claude Code docs index: <https://code.claude.com/docs/llms.txt>
- Claude Code plugin dependencies docs: <https://code.claude.com/docs/en/plugin-dependencies>
- Claude Code MCP docs: <https://code.claude.com/docs/en/mcp>
- Claude Code hooks docs: <https://code.claude.com/docs/en/hooks>

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 2026-05-17: 红灯测试先行：`npx vitest run tests/runtime/planner tests/runtime/capabilities/remediation-planner.test.ts tests/runtime/verdict tests/runtime/reports` 失败于 planner 模块不存在、remediation planner 未导出、verdict/report 未消费 routing/remediation facts。
- 2026-05-17: Focused tests 转绿：`npx vitest run tests/runtime/planner tests/runtime/capabilities/remediation-planner.test.ts tests/runtime/verdict tests/runtime/reports`。
- 2026-05-17: 验证通过：`npm run typecheck`、`npm run test:planner`、`npm run test:capabilities`、`npm run test:verdict`、`npm run test:reports`。
- 2026-05-17: 全量回归通过：`npm run verify`。
- 2026-05-17: Code review found 2 patch findings; both were fixed and revalidated with `npx vitest run tests/runtime/planner tests/runtime/capabilities/remediation-planner.test.ts`, `npm run typecheck`, and `npm run verify`.

### Completion Notes List

- 新增 `src/runtime/planner/**` 纯函数 routing planner，读取 `CapabilityMatrix` 和 evidence requirements，输出 selected/fallback/degraded/blocked route decisions，不执行外部工具。
- 新增 `src/runtime/capabilities/remediation.ts` remediation planner，按 plugin dependency、external MCP、Playwright/browser 等能力生成 policy-gated plan，并复用 `evaluateActionPolicy()` 记录风险/授权边界。
- 将 capability route facts 接入 completion verdict：core route blocker 会 blocked；degraded/fallback route 会进入 unverified scope，避免 fallback 被包装成 complete。
- 将 routing/remediation facts 接入 verification report Markdown/JSON sections，显示 selected/fallback capability、trust downgrade、policy blocked remediation、attempted failure。
- 新增 `npm run test:planner` 并纳入 `npm run verify`，避免 focused planner tests 漏跑。
- Code review follow-up complete：修复 Playwright fast-skip remediation 误报和 UX 默认路由缺口，并补回归测试。
- Deferred scope：未执行真实 install/update/enable/MCP config、未新增 runtime CLI/slash command、未新增 shipped JSON schema；真实 browser/API/data adapter 执行留给 Epic 4/5 后续 stories。

### File List

- `package.json`
- `src/runtime/capabilities/index.ts`
- `src/runtime/capabilities/remediation.ts`
- `src/runtime/planner/capability-routing.ts`
- `src/runtime/planner/index.ts`
- `src/runtime/planner/types.ts`
- `src/runtime/reports/index.ts`
- `src/runtime/reports/renderer.ts`
- `src/runtime/reports/types.ts`
- `src/runtime/verdict/evaluator.ts`
- `tests/runtime/capabilities/remediation-planner.test.ts`
- `tests/runtime/planner/capability-routing.test.ts`
- `tests/runtime/reports/report-renderer.test.ts`
- `tests/runtime/verdict/verdict-evaluator.test.ts`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Implemented capability routing planner, remediation planner, verdict/report projections, planner test script, and focused coverage. Status moved to review.
- 2026-05-17: Addressed code review findings (2 patch items) and moved story status to done.
