---
stepsCompleted:
  - 1
  - 2
  - 3
  - 4
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/research/technical-claude-code-plugin-latest-architecture-and-release-mechanics-for-curdx-flow-optimization-research-2026-05-15.md'
  - '_bmad-output/planning-artifacts/research/last-mile-reference-synthesis-2026-05-15.md'
---

# curdx-flow - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for curdx-flow, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

#### Work Intake & Completion Definition

- FR1: 用户可以请求 curdx-flow 验证一个 AI 编码任务是否真实完成。
- FR2: 用户可以为一次任务声明期望的用户旅程或核心业务路径。
- FR3: 系统可以根据用户请求识别该任务需要证明的完成条件。
- FR4: 系统可以区分代码完成、运行完成、业务流完成和发布完成。
- FR5: 系统可以在缺少完成证据时阻止任务被声明为完成。

#### Project Understanding & Runtime Readiness

- FR6: 系统可以识别当前项目的类型、入口、运行方式和验证方式。
- FR7: 系统可以识别前端、后端、全栈、CLI、库、monorepo 和 Claude Code plugin 项目。
- FR8: 系统可以生成并执行本地运行准备计划，包括依赖、服务、健康检查和验证入口。
- FR9: 系统可以检测项目已有的测试、脚本、开发服务和验证命令。
- FR10: 系统可以发现阻止项目运行的环境缺口，并把缺口标记为 blocker。
- FR11: 系统可以处理多个服务或多个项目根目录的运行上下文。

#### Evidence-Based Verification

- FR12: 系统可以为每次完成声明生成符合统一 schema 的 evidence block。
- FR13: 系统可以记录命令执行结果、退出码、关键输出和失败摘要。
- FR14: 系统可以验证本地服务是否启动并可访问。
- FR15: 系统可以验证用户指定的核心业务流是否真实执行。
- FR16: 系统可以保存截图、trace、日志片段、请求响应摘要和状态变化证明。
- FR17: 系统可以把关键证据摘要呈现在对话或报告中，供完成判断使用。
- FR18: 系统可以在验证无法完成时生成 blocker report，而不是生成成功声明。

#### Browser, API & Data Flow Assurance

- FR19: 系统可以验证浏览器页面是否真实打开并完成用户操作。
- FR20: 系统可以检查页面运行时错误、console 问题、network 请求和响应状态。
- FR21: 系统可以验证前端操作是否触发预期 API 请求。
- FR22: 系统可以验证 API 响应是否符合任务要求。
- FR23: 系统可以验证后端处理结果是否与前端状态一致。
- FR24: 系统可以验证数据是否真实保存或状态是否真实改变。
- FR25: 系统可以验证 UI 状态是否反映后端或数据层结果。
- FR26: 系统可以对前端或全栈任务要求 browser evidence 和 API evidence，除非存在明确 blocker。

#### Failure Recovery & Same-Path Retry

- FR27: 系统可以在验证失败时记录失败症状、复现路径和影响层级。
- FR28: 系统可以把失败归类为环境、依赖、前端、后端、接口、数据、浏览器能力或外部服务问题。
- FR29: 系统可以生成修复计划并在允许模式下尝试修复。
- FR30: 系统可以在修复后重跑同一条失败路径。
- FR31: 系统可以记录修复前、修复后和重跑结果。
- FR32: 系统可以在超过修复上限时停止反复修改，并输出 root-cause 或人工阻塞报告。

#### Operating Modes & Governance

- FR33: 用户可以选择 report-only 模式，只生成验证报告而不修改代码。
- FR34: 用户可以选择 fix mode，允许系统诊断、修改并重跑验证。
- FR35: 系统可以区分低风险、中风险和高风险动作。
- FR36: 系统可以自动执行低风险和策略允许的中风险动作。
- FR37: 系统可以在高风险动作前要求明确授权或 release-stage 上下文。
- FR38: 团队用户可以配置不同项目类型、风险等级和功能类型的完成标准。
- FR39: 企业用户可以配置证据保留、共享、审计和脱敏策略。
- FR40: 系统可以保证 no false completion 规则不能被关闭。

#### Capability Routing & Dependency Readiness

- FR41: 系统可以检测 Claude Code 版本、插件依赖、外部 MCP、浏览器能力、Playwright、Node 和包管理器状态。
- FR42: 系统可以为每项验证需求选择并调用合适的可用能力，并记录选择理由。
- FR43: 系统可以在关键能力不可用时说明降级影响。
- FR44: 系统可以在能力缺失但可修复时生成 remediation。
- FR45: 系统可以使用历史失败、官方文档和并行诊断能力辅助复杂问题处理。
- FR46: 系统可以维护插件依赖和外部能力的一致性状态。

#### Reporting & Review

- FR47: 用户可以查看一次任务的完整验证报告。
- FR48: 用户可以查看通过项、失败项、阻塞项、修复尝试和最终结论。
- FR49: 技术负责人可以根据报告判断一个任务是否可合并或可交付。
- FR50: QA 用户可以获得包含复现步骤、严重等级和证据链接的 report-only 报告。
- FR51: 系统可以输出 human-readable 和 machine-readable 两类报告，并维护 artifact 索引。
- FR52: 系统可以为日志过大、敏感信息或外部服务缺失场景提供可审查摘要。

#### Plugin Self-Validation & Release Readiness

- FR53: 维护者可以验证 curdx-flow 插件自身是否处于可发布状态。
- FR54: 系统可以检查 plugin manifest、registry、依赖声明和版本一致性。
- FR55: 系统可以验证 hook source 与 generated hook bundles 是否一致。
- FR56: 系统可以验证插件安装态 smoke，而不仅是仓库源码态。
- FR57: 系统可以检查 npm package version 与 Claude Code plugin release tag 是否一致。
- FR58: 系统可以在 push、tag、npm publish 或 plugin release 前要求 release evidence。
- FR59: 系统可以在 release gate 未通过时输出阻塞原因和修复路径。

#### Execution State, Safety & Recovery

- FR60: 系统可以为每次验证创建运行记录，包含任务范围、模式、策略、期望旅程和验证状态。
- FR61: 系统可以在会话中断、上下文压缩或进程重启后恢复未完成验证。
- FR62: 系统可以识别工作区已有改动，并避免覆盖或回滚与本次任务无关的用户改动。
- FR63: 系统可以记录验证和修复过程中执行过的动作、风险等级、结果和证据位置。
- FR64: 系统可以管理由验证启动的本地服务，并在完成或失败时记录清理状态。
- FR65: 系统可以区分源码改动、生成的验证文件、临时 artifact 和用户已有文件。
- FR66: 系统可以对高风险动作请求并记录明确授权。

#### Tool Installation & Capability Remediation

- FR67: 系统可以检测缺失的 companion plugins、MCP servers、skills 和浏览器验证能力。
- FR68: 系统可以在策略允许时自动安装、启用或更新缺失能力。
- FR69: 系统可以验证已安装能力是否真实可调用，而不是只检查配置存在。
- FR70: 系统可以在能力无法启用时输出 remediation plan 和完成阻塞影响。

#### Verification Data & Gap Handling

- FR71: 系统可以创建、识别或检查验证所需的数据记录，以证明状态真实持久化。
- FR72: 系统可以区分自动验证通过、人工确认通过、部分通过和未验证。
- FR73: 系统可以把用户原始需求逐项映射到已有证据，并列出未覆盖 gap。
- FR74: 系统可以从 blocker report 生成下一步可执行修复计划。
- FR75: 系统可以明确列出未验证范围，并禁止把未验证范围包装成成功结论。

#### Release Safety

- FR76: 系统可以执行 release dry-run，验证 push、tag、npm publish 和 plugin release 前置条件，而不实际发布。
- FR77: 系统可以要求显式 release-stage 授权后才允许 push、tag、npm publish 或 plugin release。

### NonFunctional Requirements

#### Completion Integrity & Reliability

- NFR1: 已声明完成的任务必须具备 evidence block 或 blocker report；false completion 目标为 0。
- NFR2: 前端或全栈任务缺少 browser/API/data evidence 时，系统必须标记为 blocker 或未验证，不得标记为完成。
- NFR3: 任何修复后的成功结论必须来自同一失败路径的重跑结果。
- NFR4: 系统必须在长任务、会话中断、上下文压缩或进程重启后保留足够状态，以恢复验证上下文。
- NFR5: report-only 模式不得修改源码；生成的报告或 artifact 必须与源码改动可区分。

#### Performance & Runtime Behavior

- NFR6: hook 检查必须保持低延迟，不得在 hook 内执行长时间浏览器验证、复杂推理或修复循环。
- NFR7: doctor/status 类检查应优先快速给出能力矩阵；耗时检查必须标记为 deep check 或异步验证项。
- NFR8: 长时间验证必须持续输出可见进度、当前阶段和下一步，避免用户误以为流程卡死。
- NFR9: 大日志不得完整塞入对话；系统必须截取关键窗口并保留 artifact 路径。
- NFR10: 多服务启动和清理必须记录服务状态，避免遗留不可解释的本地进程。

#### Security, Privacy & Local Safety

- NFR11: 系统不得默认导出完整 token、cookie、secret、生产数据或数据库 dump。
- NFR12: 本地完整证据可以保留，但 share/export 场景必须支持摘要、脱敏或明确 local-only 标记。
- NFR13: 高风险动作，包括 destructive migration、全局配置变更、push、tag、npm publish 和 plugin release，必须有显式授权或 release-stage 上下文。
- NFR14: 系统必须识别工作区已有改动，并避免覆盖、回滚或混淆用户原有改动。
- NFR15: 自动安装、启用或升级能力时，必须记录动作、范围、结果和失败补救建议。

#### Integration & Compatibility

- NFR16: curdx-flow 必须兼容当前支持的 Claude Code plugin、hooks、`/goal`、MCP 和 plugin dependency 机制。
- NFR17: 涉及最新 Claude Code 行为的实现和文档必须以官方文档或本机 `claude` 行为为准。
- NFR18: 插件依赖、registry、manifest、CLI 和 release gate 中的版本与 marketplace 标识必须保持一致。
- NFR19: 外部 MCP、companion plugins、Playwright、Chrome/DevTools、Node/npm 能力不可用时，系统必须明确降级影响。
- NFR20: 验证能力必须支持降级，但关键证据缺失不得被降级为成功。

#### Evidence Quality & Auditability

- NFR21: evidence block 必须包含任务范围、验证路径、执行结果、关键证据、未验证范围和最终结论。
- NFR22: blocker report 必须包含失败原因、复现路径、影响范围、已尝试动作和下一步修复建议。
- NFR23: 报告必须同时支持人类可读摘要和机器可读 artifact 索引。
- NFR24: 技术负责人或 QA 应能仅凭报告判断任务是否可交付、需修复或需人工确认。
- NFR25: 所有完成结论必须可追溯到命令、浏览器/API/data/log evidence 或明确人工确认。

#### Maintainability & Release Readiness

- NFR26: hook source、generated hook bundles、plugin manifest、registry 和 tests 必须保持同步。
- NFR27: curdx-flow 自身 release 前必须通过 build、typecheck、hook freshness、plugin validate、installed smoke 和 version parity。
- NFR28: release dry-run 必须能在不 push、不 tag、不 publish 的情况下验证发布前置条件。
- NFR29: 插件核心行为必须有回归 fixtures 覆盖前端、后端、全栈和 Claude Code plugin release smoke。
- NFR30: 新增能力必须接入统一 evidence schema 和 runtime planner，避免散落成不可验证提示词。

### Additional Requirements

#### Architecture-Derived Technical Requirements

- AR1: 使用现有 brownfield foundation，不迁移到新的 starter、oclif 或通用 TypeScript 脚手架；首批 stories 应建立 runtime planner、evidence schema、capability doctor、release dry-run 和 fixtures，而不是初始化项目。
- AR2: `plugins/curdx-flow/` 是 shipped Claude Code plugin 产品面，不是 fixture；manifest、skills、agents、hooks、schemas、templates、references、bin 都是公共产品 surface。
- AR3: `src/runtime/**` 是目标 deterministic runtime core；runtime core owns decisions, adapters own side effects, plugin owns distribution surface, hooks own gates, reports own presentation, registry owns declarations。
- AR4: `runtime planner` 必须是一等架构组件，只读取 goal/state/evidence/policy/capability status，输出计划、证据要求和 verdict 输入；不得直接执行工具或拥有 evidence 真相。
- AR5: `evidence schema` 必须成为 CLI、hooks、skills、agents、reports、fixtures 和 release gates 之间的共享语言；模型自述不能计入 evidence ledger。
- AR6: 使用文件型 evidence/state ledger，不引入 SQLite/Postgres/MongoDB；状态、证据、artifact index、capability status、release readiness 使用 JSON/Markdown/JSONL。
- AR7: 关键状态写入必须 atomic，状态迁移必须兼容旧 `.curdx-state.json` 并尽量保留未知字段。
- AR8: Evidence Ledger 必须 append-only；修复、重跑、回滚都追加新 evidence，并通过 `supersedes`、`relatedEvidenceIds` 或等价字段关联旧证据。
- AR9: 每条 evidence 至少包含 `schemaVersion`、`id`、`runId`、`goalId`、`source`、`capabilityId`、`trustLevel`、`status`、`summary`、`artifacts`、`startedAt`、`completedAt`、`freshness`、`privacy`、`redactions`。
- AR10: 证据必须记录 freshness 信息，例如 `commandHash`、`targetHash`、`commitHash`、`environmentId`、`expiresAt`、`validatedAt`；过期证据不得支撑 `complete`、`release-ready` 或 `releasable` verdict。
- AR11: Completion verdict 必须明确输出 `complete`、`blocked`、`partial`、`manual-confirmation-required` 或 `release-ready`。
- AR12: 用户可见报告状态必须统一映射为 `passed`、`failed`、`blocked`、`auto-recovered`、`needs-user-input`、`partial`、`release-ready` 或 `not-releasable`。
- AR13: 报告顶部必须一眼回答：现在完成了吗、真实验证了什么、缺什么证据、哪些能力降级、下一步谁负责、能不能发布。
- AR14: Native `/goal` 是支持环境中的长任务控制入口；hooks 是确定性门禁、cleanup、状态保护和轻量 evidence check，不得形成第二套 continuation loop。
- AR15: `/goal` completion condition 必须要求 transcript-visible evidence；关键证据不能只藏在 hidden artifact 文件中。
- AR16: `/goal` condition 必须包含 turn/time bound，并遵守 4,000 字符上限。
- AR17: `/goal` capability 必须被 doctor 和 goal bridge 显式检测，至少输出 supported、requiredVersion、detectedVersion、hooks/settings blockers、fallback action、condition length warnings。
- AR18: `/goal` 不可用时必须进入 manual/resumable fallback，而不是声称无人值守自动执行可用。
- AR19: Stop hook 不得启动长任务、运行 Playwright、启动 dev server、调用外部 MCP、执行模型推理、自动修复源码、承担 planner 决策或执行 release gate。
- AR20: Hook stdout 只输出 Claude Code 可消费的结构化协议 JSON；diagnostics、debug、warning、异常信息写 stderr 或 runtime log。
- AR21: 每个 hook 必须定义 runtime budget、timeout 行为、失败策略和降级报告；默认 fail-open，只有明确 gate 场景可以 block。
- AR22: 所有外部能力必须通过统一 adapter contract 接入，包含 capability id、availability check、callability check、required inputs、evidence output shape、blocker output shape、degradation behavior、privacy notes、retry safety、mode compatibility。
- AR23: Adapter 返回必须包含 `ok`、`status`、`capabilityId`、`inputs`、`evidence`、`blockers`、`artifacts`、`diagnostics`、`retryable`、`confidence`、`durationMs`。
- AR24: Adapter 不得决定任务是否完成、是否发布或是否降级目标；业务 verdict 只能由 verdict evaluator 读取 evidence/state/policy 后产生。
- AR25: `pua`、`claude-mem`、`chrome-devtools-mcp`、`ui-ux-pro-max` 是 plugin dependencies；`context7`、`sequential-thinking` 是 expected external MCP，不得混同。
- AR26: curdx-flow 只能检测、路由、验证或降级外部能力，不得 vendor、复制或重实现 pua、claude-mem、chrome-devtools-mcp、ui-ux-pro-max、context7、sequential-thinking。
- AR27: Plugin dependencies 必须在 `src/registry/capabilities.ts`、`src/registry/plugins/*`、plugin manifest、repo-root marketplace allowlist、runner tests 和 smoke coverage 中保持一致。
- AR28: Cross-marketplace plugin dependencies 必须依赖 repo-root `.claude-plugin/marketplace.json` 的 `allowCrossMarketplaceDependenciesOn` 明确信任。
- AR29: Capability doctor 必须区分 `configured`、`installed`、`callable`、`authorized`、`degraded`、`unavailable`；配置存在不等于真实可调用。
- AR30: 能力不可用时必须说明原本要验证什么、fallback 是什么、可信度下降在哪里、是否需要人工确认、是否禁止完成或发布。
- AR31: report-only 模式禁止源码修改；fix mode 可以修改源码，但必须记录目标文件范围、变更意图、风险等级、diff 摘要和验证命令。
- AR32: bug fix 或失败恢复后必须沿失败前同一入口、同一用户动作、同一接口或同一命令重跑；换路径、换 mock、跳过失败步骤必须标记 degraded。
- AR33: 前端/全栈任务必须以用户旅程为验证单位，包含入口页面、用户动作、期望 UI 状态、期望 API 请求/响应、期望数据落点、artifact 和剩余风险。
- AR34: 涉及 UI 的改动，报告必须至少包含核心状态截图；多步操作、表单、导航、异步请求、登录态、保存动作应优先提供 Playwright trace。
- AR35: UI/API/Data closure 必须证明 UI 显示成功、API 返回成功且响应体符合预期、刷新页面/重新查询/读取数据后仍一致。
- AR36: Mock、fixture、stub、dev-only data 必须标记 degraded evidence；mock 不能证明真实全栈完成。
- AR37: Release gate 是产品能力，不是脚本清单；release dry-run 是一等能力，但不得 push、tag、npm publish 或 plugin release。
- AR38: 真实 push、tag、npm publish、Claude plugin release 必须同时满足 release gate 通过和显式 release-stage 授权。
- AR39: Release gate 必须检查 version parity、hook freshness、plugin validation、installed smoke、dependency trust、external MCP degradation behavior、tag parity、release-stage 授权和 dry-run 结果。
- AR40: npm release tag `vX.Y.Z` 与 Claude plugin tag `curdx-flow--vX.Y.Z` 是不同发布面，必须保持 paired parity。
- AR41: Plugin release 前必须验证 `claude plugin validate ./plugins/curdx-flow`、`CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc`、`npm run verify`、version parity、hook freshness、dependency doctor、tag parity。
- AR42: `plugins/curdx-flow/bin/curdx-flow` 是安装后的插件运行入口，不得依赖 repo-only TypeScript source、dev dependencies、未构建文件、checkout 相对路径、`_bmad-output/**`、`.agents/**`、`.claude/**`。
- AR43: 目标项目运行时 artifact 默认写到 workspace-local `.curdx/**`，不得提交到 shipped plugin state。
- AR44: `.curdx/**` 中每个 artifact 必须能追溯到 session、goal、run、attempt 和 evidence id。
- AR45: `plugins/curdx-flow/schemas/**` 是 shipped plugin 分发合同；runtime types、schema helpers 和 tests 必须证明与 shipped schema 一致。
- AR46: 新增跨边界数据必须同步 schema、TypeScript type、runtime guard、contract test、fixture 和 shipped skill/reference 文档。
- AR47: 每个 story 必须映射到 user pain、runtime directory、plugin surface、schema、contract test、runtime test、adapter test、fixture、evidence output、report surface、failure mode、verification commands。
- AR48: 首批 entry sprint 必须包含 Contract Baseline、Runtime Skeleton、Hook Boundary Tests、External Capability Degradation、Release Gate Dry-Run Boundary、Runnable Fixtures and Artifact Lifecycle。
- AR49: Entry sprint 完成前不得进入普通功能扩展、release workflow 或用户承诺型能力实现。
- AR50: 首批 stories 必须证明用户少猜端口、API、页面、数据、发布状态和外部能力状态。

#### Claude Code Latest-Mechanics Requirements

- CCR1: 插件结构和行为必须以当前官方 Claude Code docs 与已安装 `claude` CLI 为准，尤其是 plugins、skills、agents、hooks、plugin dependencies、marketplace、MCP、native `/goal`、Chrome integration 和 release tags。
- CCR2: Plugin root 结构必须保持 `.claude-plugin/plugin.json` 位于 `.claude-plugin/`；`skills/`、`agents/`、`hooks/`、`bin/`、`schemas/`、`templates/`、`references/` 位于 plugin root。
- CCR3: Public slash commands 必须保持 `/curdx-flow:<skill>` 命名空间稳定。
- CCR4: Mutating public workflow skills 必须保持 `disable-model-invocation: true`；shipped skills 不得使用 `allowed-tools: "*"`。
- CCR5: Plugin-shipped agents 不得依赖 unsupported frontmatter，例如 `hooks`、`mcpServers`、`permissionMode`。
- CCR6: Hook event semantics 必须按官方事件逐项编码和测试；不能假设所有事件都有相同 block/context 行为。
- CCR7: `TaskCompleted` 和 `PostToolBatch` 可以作为确定性门禁 surface，但必须保持低延迟、协议干净、event-specific 输出正确。
- CCR8: MCP Tool Search 减少 MCP context pressure，但 curdx-flow 仍应保持能力描述简洁并通过 capability routing 使用 MCP。
- CCR9: Chrome integration/Claude Chrome beta 可作为用户真实浏览器和登录态辅助证据路径，但不能取代 Playwright/project E2E 的可复跑 release evidence。
- CCR10: Claude Code channels 属于未来事件驱动扩展，不作为 MVP 前提。
- CCR11: `claude plugin validate <path>`、`claude plugin tag --push`、plugin install/update/list、marketplace trust、dependency resolution 都必须纳入 release/doctor/smoke 的真实验证面。
- CCR12: Plugin dependencies 版本解析依赖 `{plugin-name}--v{version}` tag；release stories 必须覆盖缺 npm tag、缺 plugin tag、两者版本不一致三类失败。
- CCR13: `/goal` 依赖 hooks 系统；`disableAllHooks` 或 managed `allowManagedHooksOnly` 阻断时必须报告为 unattended goal execution blocker。
- CCR14: `/goal` evaluator 不运行工具、不读文件；verifier output、exit code、snapshot/last-mile gate status 必须可见地进入 transcript 或报告。
- CCR15: 非交互 `claude -p "/goal ..."` 可作为未来自动化候选，但必须在 version gating、cost bounds、redacted evidence policy 完成后再引入 release gate。

### UX Design Requirements

无独立 UX Design 输入文档。PRD 和 Architecture 中的前端/全栈用户体验要求已作为 FR19-FR26、FR47-FR52、AR33-AR36 和 IP-UI 规则纳入需求库存；后续 stories 不应生成独立 UI 设计系统工作，除非某个 story 明确触达目标项目的 browser/UI verification surface。

### FR Coverage Map

FR1: Epic 1 - 用户请求 curdx-flow 验证 AI 编码任务是否真实完成，由可信完成判定入口承接。
FR2: Epic 1 - 用户旅程或核心业务路径进入 run record 和 evidence scope。
FR3: Epic 1 - 用户请求被转换为可验证 completion condition。
FR4: Epic 1 - completion verdict 区分代码完成、运行完成、业务流完成和发布完成。
FR5: Epic 1 - 缺少完成证据时由 verdict/gate 阻止成功声明。
FR6: Epic 3 - project discovery 识别项目类型、入口、运行方式和验证方式。
FR7: Epic 3 - discovery 覆盖前端、后端、全栈、CLI、库、monorepo 和 Claude Code plugin 项目。
FR8: Epic 3 - runtime readiness 生成并执行依赖、服务、健康检查和验证入口计划。
FR9: Epic 3 - discovery 检测已有测试、脚本、开发服务和验证命令。
FR10: Epic 3 - runtime readiness 把环境缺口标记为 blocker。
FR11: Epic 3 - service/runtime model 支持多服务和多 root 上下文。
FR12: Epic 1 - evidence ledger 为每次完成声明生成统一 schema 的 evidence block。
FR13: Epic 1 - evidence ledger 记录命令结果、退出码、关键输出和失败摘要。
FR14: Epic 3 - service lifecycle 验证本地服务启动并可访问。
FR15: Epic 4 - journey verification 执行用户指定核心业务流。
FR16: Epic 1 - artifact index 保存截图、trace、日志片段、请求响应摘要和状态变化证明。
FR17: Epic 1 - report/surface 把关键证据摘要呈现在对话或报告中。
FR18: Epic 1 - blocker report 替代无法验证时的成功声明。
FR19: Epic 4 - browser probes 验证页面真实打开并完成用户操作。
FR20: Epic 4 - browser/API probes 检查 console、network 请求和响应状态。
FR21: Epic 4 - browser/API closure 验证前端操作触发预期 API 请求。
FR22: Epic 4 - API/contract checks 验证响应符合任务要求。
FR23: Epic 4 - API/data probes 验证后端处理与前端状态一致。
FR24: Epic 4 - data probes 验证数据真实保存或状态真实改变。
FR25: Epic 4 - UI/data closure 验证 UI 状态反映后端或数据层结果。
FR26: Epic 4 - 前端/全栈任务默认要求 browser evidence 和 API evidence，除非有明确 blocker。
FR27: Epic 5 - failure recovery 记录失败症状、复现路径和影响层级。
FR28: Epic 5 - failure taxonomy 归类环境、依赖、前端、后端、接口、数据、浏览器能力和外部服务问题。
FR29: Epic 5 - recovery planner 在允许模式下生成修复计划并尝试修复。
FR30: Epic 5 - same-path retry 在修复后重跑同一条失败路径。
FR31: Epic 5 - recovery ledger 记录修复前、修复后和重跑结果。
FR32: Epic 5 - retry cap 超限后停止反复修改并输出 root-cause 或人工阻塞报告。
FR33: Epic 2 - mode policy 提供 report-only 模式。
FR34: Epic 2 - mode policy 提供 fix mode。
FR35: Epic 2 - action-risk policy 区分低、中、高风险动作。
FR36: Epic 2 - policy 允许自动执行低风险和策略允许的中风险动作。
FR37: Epic 2 - policy 在高风险动作前要求授权或 release-stage 上下文。
FR38: Epic 2 - completion standard 支持团队按项目类型、风险等级和功能类型配置标准。
FR39: Epic 2 - governance 支持证据保留、共享、审计和脱敏策略。
FR40: Epic 2 - policy 保证 no false completion 不能关闭。
FR41: Epic 2 - capability doctor 检测 Claude Code、插件依赖、外部 MCP、浏览器、Playwright、Node 和包管理器状态。
FR42: Epic 2 - capability routing 选择可用能力并记录理由。
FR43: Epic 2 - degradation model 说明关键能力不可用时的影响。
FR44: Epic 2 - remediation planner 为可修复缺失能力生成补救动作。
FR45: Epic 2 - intelligence routing 使用历史失败、官方文档和并行诊断辅助复杂问题。
FR46: Epic 2 - capability registry 维护插件依赖和外部能力一致性状态。
FR47: Epic 1 - reports 让用户查看完整验证报告。
FR48: Epic 1 - reports 展示通过项、失败项、阻塞项、修复尝试和最终结论。
FR49: Epic 1 - reviewer-readable report 支持技术负责人判断是否可合并或可交付。
FR50: Epic 2 - report-only 模式为 QA 输出复现步骤、严重等级和证据链接。
FR51: Epic 1 - report generator 输出 Markdown 和 JSON，并维护 artifact index。
FR52: Epic 1 - report generator 对大日志、敏感信息和外部服务缺失输出可审查摘要。
FR53: Epic 6 - release gate 验证 curdx-flow 插件自身是否可发布。
FR54: Epic 6 - release checks 检查 plugin manifest、registry、依赖声明和版本一致性。
FR55: Epic 6 - hook freshness checks 验证 hook source 与 generated bundles 一致。
FR56: Epic 6 - installed smoke 验证安装态，而不仅是源码态。
FR57: Epic 6 - tag/version parity 检查 npm package version 与 Claude plugin release tag。
FR58: Epic 6 - release two-key 在 push/tag/npm publish/plugin release 前要求 release evidence。
FR59: Epic 6 - release gate 未通过时输出阻塞原因和修复路径。
FR60: Epic 1 - run record 创建任务范围、模式、策略、期望旅程和验证状态。
FR61: Epic 1 - state ledger 支持会话中断、上下文压缩或进程重启后的恢复。
FR62: Epic 1 - dirty worktree safety 识别已有改动并避免覆盖无关用户改动。
FR63: Epic 1 - action log 记录动作、风险等级、结果和证据位置。
FR64: Epic 3 - service lifecycle 管理由验证启动的本地服务，并记录完成或失败时的清理状态。
FR65: Epic 1 - artifact boundary 区分源码改动、验证文件、临时 artifact 和用户已有文件。
FR66: Epic 2 - action-risk policy 记录高风险动作授权。
FR67: Epic 2 - capability doctor 检测缺失 companion plugins、MCP servers、skills 和浏览器验证能力。
FR68: Epic 2 - remediation 在策略允许时自动安装、启用或更新缺失能力。
FR69: Epic 2 - callability checks 验证能力真实可调用。
FR70: Epic 2 - remediation plan 输出能力无法启用时的补救路径和阻塞影响。
FR71: Epic 4 - data probes 创建、识别或检查验证数据记录以证明状态持久化。
FR72: Epic 1 - verdict model 区分自动验证通过、人工确认通过、部分通过和未验证。
FR73: Epic 1 - gap handling 将用户原始需求逐项映射到证据并列出未覆盖 gap。
FR74: Epic 5 - blocker report 生成下一步可执行修复计划。
FR75: Epic 1 - verdict/report 明确未验证范围并禁止包装成成功。
FR76: Epic 6 - release dry-run 验证发布前置条件且不实际发布。
FR77: Epic 6 - release two-key 要求显式 release-stage 授权后才允许真实发布动作。

## Epic List

### Epic Structure Decision

保持用户价值导向的 6 Epic，不新增独立技术层 Epic。合同层能力通过 Entry Sprint Gate 和 Cross-Cutting Acceptance Contract 强制进入每个 story，而不是被拆成一个只有技术基础设施、缺少用户结果的 Epic。

Epic 顺序表达 curdx-flow 的核心产品原则：完成判定权必须从模型自述迁移到证据链。后续 stories 不得跳过更早的判定基础去实现后面的能力。

### Cross-Cutting Acceptance Contract

所有 stories 必须继承本文件中的 NFR、AR 和 CCR 约束，不能只映射 FR。尤其是 no false completion、hook stdout/stderr 协议、native `/goal` transcript-visible evidence、plugin dependency/external MCP 降级、report-only 不改源码、same-path retry、release two-key、installed plugin runtime boundary、schema/type/test/fixture 同步要求，必须进入相关 story 的验收标准、失败模式和验证命令。

任何 story 如果只说明“实现功能”，但没有说明证据、状态、schema、测试、fixture、降级、报告和失败路径，应视为不可实现。

### Entry Sprint Gate

进入普通功能扩展前，必须先完成 entry sprint 的 P0 validation stories：Contract Baseline、Runtime Skeleton、Hook Boundary Tests、External Capability Degradation、Release Gate Dry-Run Boundary、Runnable Fixtures and Artifact Lifecycle。这些不是独立技术 Epic，而是分布在 Epic 1、Epic 2、Epic 6 并约束全部后续 stories 的开工门槛。

任何后续 story 都必须包含 user pain、runtime directory、plugin surface、schema、contract test、runtime test、adapter test（如适用）、fixture、evidence output、report surface、failure mode 和 verification commands 映射。无法填写完整映射的 story 不可进入实现。

### Entry Sprint Allocation

| P0 Validation Story | Primary Epic | Supporting Epics |
|---|---|---|
| Contract Baseline | Epic 1 | Epic 2, Epic 6 |
| Runtime Skeleton | Epic 1 | Epic 2 |
| Hook Boundary Tests | Epic 1 | Epic 6 |
| External Capability Degradation | Epic 2 | Epic 4 |
| Release Gate Dry-Run Boundary | Epic 6 | Epic 1, Epic 2 |
| Runnable Fixtures and Artifact Lifecycle | Epic 1 | Epic 3, Epic 4, Epic 6 |

### Natural Dependency Order

Epic 1 establishes completion truth and evidence/report foundations. Epic 2 and Epic 3 can begin after the contract baseline exists and may proceed partly in parallel: Epic 2 proves capability and policy readiness, while Epic 3 proves projects can be discovered and started. Epic 4 depends on Epic 3 for runnable targets and on Epic 2 for browser/API/data capability routing. Epic 5 depends on Epic 4 failure evidence. Epic 6 can start early for release dry-run contracts, but real release readiness depends on Epic 1 evidence/verdict and Epic 2 capability/dependency models.

### Epic 1: 可信完成判定与证据报告

用户可以得到可信的 `complete`、`blocked` 或 `partial` 结论，而不是依赖模型自述“完成了”。本 Epic 建立 no false completion 的事实来源：run record、state ledger、evidence ledger、artifact index、completion verdict、基础报告、dirty worktree safety 和可恢复状态。

**User outcome:** 用户、QA 和技术负责人可以仅凭报告和 evidence digest 判断任务是否真实完成、缺什么证据、下一步谁负责。

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR12, FR13, FR16, FR17, FR18, FR47, FR48, FR49, FR51, FR52, FR60, FR61, FR62, FR63, FR65, FR72, FR73, FR75

**Implementation notes:** 必须优先建立 shipped schemas、TypeScript contracts、runtime guards、contract tests、`.curdx/**` artifact lifecycle fixture 和 report/verdict projection。Hooks 只能读取或轻量 gate，不拥有 completion truth。后续 stories 必须包含 schema/test/fixture/evidence/failure mode/verification commands 映射。

### Epic 2: 能力就绪、依赖降级与模式治理

用户可以知道当前环境哪些能力可用、哪些降级、哪些阻塞，并安全选择 report-only 或 fix mode。系统必须检测 plugin dependencies、external MCP、native `/goal`、browser tools、Playwright、Node/npm 和包管理器能力，并输出可执行 remediation。

**User outcome:** 用户不用猜 `pua`、`claude-mem`、`chrome-devtools-mcp`、`ui-ux-pro-max`、`context7`、`sequential-thinking`、Chrome/Playwright 或 `/goal` 是否真的能用。

**FRs covered:** FR33, FR34, FR35, FR36, FR37, FR38, FR39, FR40, FR41, FR42, FR43, FR44, FR45, FR46, FR50, FR66, FR67, FR68, FR69, FR70

**Implementation notes:** 必须区分 `configured`、`installed`、`callable`、`authorized`、`degraded`、`unavailable`。Mutating public skills 保持 `disable-model-invocation: true`；report-only 不得修改源码；fix mode 必须记录动作和风险。后续 stories 必须包含 schema/test/fixture/evidence/failure mode/verification commands 映射。

### Epic 3: 项目识别、冷启动与运行准备

用户可以让 curdx-flow 识别项目形态、入口、脚本、服务和验证方式，完成冷启动、健康检查、端口/日志/清理状态记录，并发现阻止项目运行的 blocker。

**User outcome:** 用户不需要自己猜项目怎么装、怎么启动、哪个端口可用、服务是否真的健康。

**FRs covered:** FR6, FR7, FR8, FR9, FR10, FR11, FR14, FR64

**Implementation notes:** discovery/services 不得直接做业务完成判定；它们输出 runtime topology、service evidence 和 blockers。多 root/monorepo、端口冲突、依赖失败、前端启动成功但后端失败都必须进入 fixtures 或 failure tests。后续 stories 必须包含 schema/test/fixture/evidence/failure mode/verification commands 映射。

### Epic 4: Browser/API/Data 用户旅程验证

用户可以证明前端或全栈功能真的经过页面操作、API 请求、后端处理、数据保存和 UI 回显，而不是只通过 build、mock 或静态检查。

**User outcome:** 用户可以看到真实业务路径的 browser/API/data evidence，例如页面 URL、操作序列、network/API 响应、后端处理、刷新后数据一致、截图或 trace。

**FRs covered:** FR15, FR19, FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR71

**Implementation notes:** Playwright/project E2E 优先用于可复跑验证；Chrome DevTools MCP 和 Claude Chrome 用于真实浏览器诊断与登录态辅助；mock、fixture、stub、dev-only data 必须标记 degraded，不得支撑真实全栈完成。后续 stories 必须包含 schema/test/fixture/evidence/failure mode/verification commands 映射。

### Epic 5: 失败诊断、修复闭环与同路径重跑

用户可以在验证失败时得到复现路径、失败归因、修复计划、修复尝试、同路径重跑结果和超限后的 root-cause/blocker 报告。

**User outcome:** 失败不再停留在“看起来报错了”，而是变成可追踪、可复跑、可交接的恢复闭环。

**FRs covered:** FR27, FR28, FR29, FR30, FR31, FR32, FR74

**Implementation notes:** 必须记录 before/after evidence、fix attempt lineage、retry caps 和 same-path retry。换路径、跳过失败步骤或改用 mock 必须降级，不能包装成成功。后续 stories 必须包含 schema/test/fixture/evidence/failure mode/verification commands 映射。

### Epic 6: curdx-flow 插件自验证与发布安全

维护者可以验证 curdx-flow 插件自身是否真实可安装、可运行、可发布，并避免 npm release 与 Claude plugin release 漂移。

**User outcome:** 维护者能在 push/tag/npm publish/plugin release 前看到 release-ready 或 not-releasable verdict，以及具体阻塞和修复路径。

**FRs covered:** FR53, FR54, FR55, FR56, FR57, FR58, FR59, FR76, FR77

**Implementation notes:** Release dry-run 是一等能力但不得执行真实发布。真实 push、tag、npm publish、Claude plugin release 必须同时满足 release gate 通过和显式 release-stage 授权。必须覆盖 `vX.Y.Z` 与 `curdx-flow--vX.Y.Z` tag parity、plugin validate、installed smoke、hook freshness、version parity、dependency trust 和 external MCP degradation。后续 stories 必须包含 schema/test/fixture/evidence/failure mode/verification commands 映射。

## Epic 1: 可信完成判定与证据报告

用户可以得到可信的 `complete`、`blocked` 或 `partial` 结论，而不是依赖模型自述“完成了”。本 Epic 建立 no false completion 的事实来源：run record、state ledger、evidence ledger、artifact index、completion verdict、基础报告、dirty worktree safety 和可恢复状态。

**Story Requirement Trace:**

| Story | Primary FRs |
|---|---|
| Story 1.1 | FR12, FR51, FR60 |
| Story 1.2 | FR12, FR13, FR16, FR18 |
| Story 1.3 | FR60, FR61, FR62, FR63, FR65 |
| Story 1.4 | FR1, FR2, FR3, FR4, FR5, FR18, FR72, FR73, FR75 |
| Story 1.5 | FR17, FR47, FR48, FR49, FR51, FR52, FR75 |
| Story 1.6 | FR5, FR17, FR18, FR60, FR61 |

### Story 1.1: 建立证据、状态、裁决与报告的合同基线

作为 curdx-flow 维护者，
我希望先建立 evidence、state、verdict、adapter result、report、hook gate 的 shipped schema、TypeScript 合同、runtime guard 和合同测试，
以便后续所有验证能力都使用同一套可信完成语言，而不是各自发明不兼容的 JSON 或提示词约定。

**Acceptance Criteria:**

**Given** 当前 curdx-flow 仓库和已批准的架构合同
**When** 合同基线被实现
**Then** `plugins/curdx-flow/schemas/` 至少包含 evidence、state ledger/session、adapter result、completion verdict、release verdict、action-risk policy、hook gate output 的 shipped schema
**And** `src/runtime/**` 或 `src/runtime/contracts/**` 中存在匹配的 TypeScript 类型和 runtime guard。

**Given** 有效的 evidence、state、verdict、adapter result、report、hook gate fixture
**When** 运行合同测试
**Then** 每个 fixture 都能通过 shipped schema 和 TypeScript guard 校验
**And** 测试证明未知未来字段在需要兼容的边界上会被保留或容忍。

**Given** 无效 JSON、缺失必填字段、过期 schema version 或非法 verdict 值
**When** runtime guard 校验该 payload
**Then** 校验必须以结构化错误失败
**And** 该失败可以被转换为 blocker 或 degraded result，而不是依赖自然语言解析。

**Given** 后续实现 agent 试图新增跨边界 runtime 数据
**When** 该数据没有 schema、type、guard、fixture 和 contract test
**Then** 对应 story 不得被视为完成
**And** 报告必须把合同缺口标记为阻塞后续实现的问题。

**Given** 合同基线已实现
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck` 和新的合同测试命令
**And** 如果变更影响 plugin-facing schema，story 必须说明是否需要在发布前运行 `claude plugin validate ./plugins/curdx-flow`。

### Story 1.2: 追加式 Evidence Ledger 与 Artifact Index

作为执行 curdx-flow 验证的开发者，
我希望每次命令、检查、截图、trace、API 响应、日志摘要和状态变化都被追加记录为可追踪 evidence，
以便完成结论可以回溯到新鲜、可审查、不会被覆盖的证据链。

**Acceptance Criteria:**

**Given** 一个新的 curdx-flow run 已创建
**When** runtime 写入命令执行、服务检查、浏览器检查、API 检查、数据检查或 blocker 结果
**Then** evidence ledger 必须以 append-only 方式新增 evidence 条目
**And** 不得覆盖已有 evidence；重跑、修复、失败和回滚都必须追加新条目并保留关联关系。

**Given** 一条 evidence 包含截图、trace、日志片段、请求响应摘要或报告文件
**When** artifact index 被更新
**Then** artifact 必须记录 workspace-relative 路径、artifact 类型、关联 runId、goalId、attemptId、evidence id、隐私分类和摘要
**And** 不得把 token、cookie、secret、完整生产数据或巨大日志直接写入报告正文。

**Given** 一条新 evidence 被写入
**When** evidence 缺少 freshness 信息
**Then** 写入必须失败或标记为 degraded
**And** freshness 至少应能表达 `validatedAt`、目标上下文、命令或文件目标摘要，使 verdict 能判断证据是否过期。

**Given** 同一个失败路径被修复后重跑
**When** 新 evidence 写入 ledger
**Then** 新 evidence 必须能通过 `relatedEvidenceIds`、`supersedes` 或等价字段关联失败前 evidence
**And** 报告可以展示 before/after/retry 链路。

**Given** evidence ledger 或 artifact index 文件写入过程中发生异常
**When** 写入失败
**Then** 旧文件不得损坏
**And** runtime 必须返回结构化 blocker 或 degraded result，说明证据无法可靠保存。

**Given** Story 1.2 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、evidence ledger 相关合同/运行时测试
**And** 测试必须覆盖 append-only、未知字段兼容、invalid JSON、atomic write 失败、敏感字段摘要、artifact 路径关联。

### Story 1.3: Run State、恢复上下文与工作区边界

作为使用 curdx-flow 进行长任务验证的用户，
我希望每次验证 run 都有可恢复的状态、明确的工作区边界和用户改动保护，
以便会话中断、上下文压缩或验证失败后，系统能继续说明当前位置，而不会覆盖我的已有改动或混淆生成物。

**Acceptance Criteria:**

**Given** 用户启动一次 curdx-flow 验证
**When** runtime 创建 run state
**Then** state 必须记录 runId、goalId、任务范围、模式、策略、期望用户旅程、当前阶段、verdict 状态、相关 evidence ids、artifact index 路径和下一步动作
**And** state 必须写入 workspace-local `.curdx/**`，不得写入 shipped plugin source。

**Given** 会话中断、上下文压缩或进程重启
**When** 用户查看状态或继续执行
**Then** runtime 必须能从 state ledger 恢复当前 run 的关键上下文
**And** 报告必须回答当前在做什么、已验证什么、缺什么证据、下一步谁负责。

**Given** 工作区在 curdx-flow 运行前已有用户改动
**When** fix mode 或验证文件生成逻辑准备写入文件
**Then** runtime 必须记录 dirty worktree baseline
**And** 不得覆盖、回滚、格式化或混淆与本次 run 无关的用户改动。

**Given** curdx-flow 生成验证文件、临时 artifact、报告或 evidence
**When** 状态和报告展示文件列表
**Then** 每个文件必须被区分为源码改动、生成的验证文件、临时 artifact、报告、用户既有文件或外部工具输出
**And** 用户能看出哪些文件属于本次 run。

**Given** state 文件来自旧版本或包含未知未来字段
**When** runtime 读取 state
**Then** 已知字段必须被安全迁移或兼容读取
**And** 未知字段必须尽量保留，不得静默丢弃用户上下文。

**Given** state 文件 malformed 或部分写入
**When** runtime 读取失败
**Then** 系统必须输出 blocker 或 recovery report
**And** 不得把无法可信恢复的状态伪装成可继续执行或已完成。

**Given** Story 1.3 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、state/session 相关合同/运行时测试
**And** 测试必须覆盖旧状态兼容、未知字段保留、malformed state、dirty worktree baseline、生成物分类和 `.curdx/**` artifact 边界。

### Story 1.4: Completion Verdict Evaluator

作为依赖 curdx-flow 判断任务是否完成的用户，
我希望系统基于 state、policy、fresh evidence 和 missing evidence 计算明确 verdict，
以便任何完成声明都能被证明、降级或阻塞，而不是由 agent 自述决定。

**Acceptance Criteria:**

**Given** run state、任务类型、用户旅程、mode policy 和 evidence ledger
**When** verdict evaluator 被调用
**Then** 它必须输出 `complete`、`blocked`、`partial`、`manual-confirmation-required` 或 `release-ready` 之一
**And** verdict 必须包含 why、evidenceRefs、missingEvidence、nextAction、owner、riskLevel、confidence 和未验证范围。

**Given** 只有模型自述、任务 marker、代码 diff 或静态检查结果
**When** evaluator 判断前端、全栈、数据保存或发布相关任务
**Then** verdict 不得为 `complete` 或 `release-ready`
**And** 必须列出缺失的 browser/API/data/release evidence 或 blocker report。

**Given** evidence 已经过期、target hash 不匹配、命令上下文不一致或缺少 freshness
**When** evaluator 读取该 evidence
**Then** 该 evidence 不得支撑成功 verdict
**And** verdict 必须说明证据过期或目标不匹配。

**Given** 验证过程中存在 blocker report
**When** blocker 阻断核心用户旅程或发布门禁
**Then** verdict 必须为 `blocked`
**And** nextAction 必须包含可执行修复路径、负责人和风险等级。

**Given** 某些验收路径通过，但关键范围未验证
**When** evaluator 生成 verdict
**Then** verdict 必须为 `partial` 或 `manual-confirmation-required`
**And** 不得把未验证范围包装成成功结论。

**Given** 用户或 agent 声称任务完成
**When** missingEvidence 不为空且无人工确认记录
**Then** evaluator 必须阻止 `complete` verdict
**And** 输出缺口列表，供报告和 `/goal` transcript-visible summary 使用。

**Given** Story 1.4 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、completion verdict 合同测试和 runtime evaluator 测试
**And** 测试必须覆盖 false completion、过期 evidence、missing evidence、blocker、partial、manual-confirmation-required、release evidence 不足这些场景。

### Story 1.5: 人类可读与机器可读的证据报告

作为需要验收 AI 编码结果的用户、QA 或技术负责人，
我希望 curdx-flow 输出一份一眼可判断的 Markdown 报告和一份机器可读 JSON 报告，
以便我能知道任务是否完成、真实验证了什么、缺什么证据、哪些能力降级、下一步谁负责。

**Acceptance Criteria:**

**Given** 一个 run 已经产生 state、evidence、artifact index、blockers 和 completion verdict
**When** report generator 渲染报告
**Then** 必须生成 `.curdx/reports/<run-id>.report.md` 和 `.curdx/reports/<run-id>.report.json`
**And** JSON 报告必须能通过 shipped schema 或 TypeScript guard 校验。

**Given** 用户打开 Markdown 报告
**When** 查看报告顶部
**Then** 顶部必须回答：现在完成了吗、真实验证了什么、缺什么证据、哪些能力降级、下一步谁负责、能不能发布
**And** 不得只输出“完成了”或“测试通过”这类不可复查总结。

**Given** 报告引用 evidence 和 artifacts
**When** 报告渲染 evidence 摘要
**Then** 每条 evidence 必须显示简短摘要、状态、trust level、freshness、artifact 引用、未验证范围或降级原因
**And** 对日志、请求响应、截图、trace 等 artifact 只展示安全摘要和路径，不泄露 secret、cookie、token 或完整生产数据。

**Given** verdict 为 `blocked`、`partial` 或 `manual-confirmation-required`
**When** 报告生成
**Then** 报告必须按 blocker、missing evidence、manual confirmation、next action 分组
**And** 每个 next action 必须有 owner、risk level 和可执行说明。

**Given** 报告需要进入 `/goal` 可见上下文
**When** runtime 生成 transcript-visible summary
**Then** summary 必须包含 verifier command、exit code、关键 evidence digest、missingEvidence 和最终 verdict
**And** summary 必须避免长日志和敏感内容。

**Given** report-only 模式
**When** 报告生成
**Then** 报告必须清楚标记没有源码修改
**And** 如果发现问题，只能输出复现路径、严重等级、证据和建议，不得暗示已自动修复。

**Given** Story 1.5 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、report schema/guard 测试和 report renderer 测试
**And** 测试必须覆盖 passed、blocked、partial、manual-confirmation-required、degraded capability、大日志摘要、敏感字段脱敏和 report-only 场景。

### Story 1.6: Hook Gate-Only 完成保护边界测试

作为 curdx-flow 维护者，
我希望 Stop、TaskCompleted、PostToolBatch 等 hooks 只做低延迟门禁、状态保护和缺证据提示，
以便 hooks 不会变成脆弱的 planner、长任务执行器或第二套 `/goal` continuation loop。

**Acceptance Criteria:**

**Given** Claude Code 触发 Stop、TaskCompleted、PostToolBatch、PostCompact 或 StopFailure hook
**When** hook 处理输入 payload
**Then** hook 必须通过薄入口读取必要状态、执行轻量 gate 或上下文注入
**And** 不得启动 dev server、运行 Playwright、调用外部 MCP、执行复杂推理、自动修复源码或执行 release gate。

**Given** hook 需要输出 Claude Code 协议结果
**When** hook 写 stdout
**Then** stdout 必须只包含事件允许的结构化 JSON 或明确允许的上下文输出
**And** diagnostics、debug、warning、异常信息必须写 stderr 或 runtime log，不得污染 stdout。

**Given** hook 遇到 malformed stdin、未知字段、缺失旧字段、invalid state 或 runtime helper 异常
**When** 该事件不是明确 gate 场景
**Then** hook 必须 fail-open 并退出 0
**And** 诊断信息必须可追踪但不能阻塞 Claude Code 正常使用。

**Given** TaskCompleted 或 PostToolBatch 发现任务缺少 fresh evidence、存在 missingEvidence 或违反 no false completion
**When** 该事件支持阻断
**Then** hook 可以输出结构化 gate reason 阻止完成或下一轮 agentic loop
**And** gate reason 必须包含缺失证据、下一步动作和对应 runId/goalId。

**Given** native `/goal` 是当前 execution driver
**When** Stop hook 看到 run 仍在进行
**Then** Stop hook 不得注入 continuation prompt 或形成第二套自治循环
**And** 应把下一轮推进交给 `/goal` 或显式 `/curdx-flow:implement` fallback。

**Given** hook 写入状态或 snapshot
**When** 写入发生
**Then** 写入必须低延迟、原子、可失败恢复
**And** hook 不得直接写 completion verdict 或复杂 evidence ledger 真相。

**Given** Story 1.6 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run build:hooks`、`npm run check:hooks-fresh`、相关 `npm run test:hooks` 或新 hook boundary tests
**And** 测试必须覆盖 stdout/stderr、exit code、fail-open、gate block、malformed stdin、missing old fields、native `/goal` active、generated hook freshness。

## Epic 2: 能力就绪、依赖降级与模式治理

用户可以知道当前环境哪些能力可用、哪些降级、哪些阻塞，并安全选择 report-only 或 fix mode。系统必须检测 plugin dependencies、external MCP、native `/goal`、browser tools、Playwright、Node/npm 和包管理器能力，并输出可执行 remediation。

**Story Requirement Trace:**

| Story | Primary FRs |
|---|---|
| Story 2.1 | FR41, FR42, FR43, FR46 |
| Story 2.2 | FR41, FR43, FR46, FR67, FR69, FR70 |
| Story 2.3 | FR3, FR41, FR42, FR43, FR44 |
| Story 2.4 | FR33, FR34, FR35, FR36, FR37, FR38, FR39, FR40, FR66 |
| Story 2.5 | FR42, FR43, FR44, FR45, FR67, FR68, FR69, FR70 |
| Story 2.6 | FR33, FR47, FR48, FR50, FR51, FR52 |

### Story 2.1: Capability Model and Doctor Matrix

作为 curdx-flow 用户，
我希望 doctor 能清楚展示每项能力是 configured、installed、callable、authorized、degraded 还是 unavailable，
以便我不用猜当前环境能否支持真实验证、自动修复、浏览器诊断或发布门禁。

**Acceptance Criteria:**

**Given** curdx-flow 在用户工作区运行 doctor
**When** capability doctor 检测本地环境
**Then** 输出必须包含 Claude Code、Node/npm、package manager、Playwright/browser tools、plugin dependencies、external MCP、native `/goal`、hook freshness、plugin validation 相关能力的状态
**And** 每项能力必须区分 `configured`、`installed`、`callable`、`authorized`、`degraded`、`unavailable`，不能只显示“存在/不存在”。

**Given** 某个能力安装存在但不可调用
**When** doctor 输出结果
**Then** 状态必须为 degraded 或 unavailable
**And** 必须说明不可调用原因、影响哪些验证证据、是否阻塞完成或发布。

**Given** doctor 在快速模式运行
**When** 某项检查耗时较长或需要外部交互
**Then** doctor 必须标记为 deep check 或 skipped-with-reason
**And** 不得把未执行的深度检查当作通过。

**Given** doctor 输出 human-readable 和 JSON 结果
**When** JSON 结果被测试或其他 runtime 组件读取
**Then** JSON 必须符合 capability/status schema 或 TypeScript guard
**And** human-readable 输出必须能让用户一眼看到 blocker、degraded capability、remediation 和 next action。

**Given** 能力状态被 runtime planner 或 report 读取
**When** 能力处于 degraded 或 unavailable
**Then** planner/report 必须能引用该状态解释降级影响
**And** 不得静默跳过该能力要求。

**Given** Story 2.1 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、capability doctor 单元/运行时测试和相关 runner tests
**And** 测试必须覆盖 installed-but-not-callable、unknown command、timeout/deep-check、JSON 输出 schema、human-readable blocker 摘要。

### Story 2.2: Plugin Dependencies 与 External MCP Readiness

作为 curdx-flow 用户，
我希望系统正确区分 Claude Code plugin dependencies 和外部 MCP，并检测它们是否真的可用，
以便缺少 `pua`、`claude-mem`、`chrome-devtools-mcp`、`ui-ux-pro-max`、`context7` 或 `sequential-thinking` 时，系统能给出明确降级和补救，而不是静默跳过关键能力。

**Acceptance Criteria:**

**Given** curdx-flow 检查 companion capabilities
**When** 读取 registry、plugin manifest 和 marketplace trust
**Then** `pua`、`claude-mem`、`chrome-devtools-mcp`、`ui-ux-pro-max` 必须被识别为 plugin dependencies
**And** `context7`、`sequential-thinking` 必须被识别为 expected external MCP，不得被写入 plugin dependencies。

**Given** plugin dependencies 被声明
**When** 执行依赖一致性检查
**Then** `src/registry/capabilities.ts`、`src/registry/plugins/*`、`plugins/curdx-flow/.claude-plugin/plugin.json`、repo-root `.claude-plugin/marketplace.json` allowlist、runner tests 必须一致
**And** 任一 marketplace id、plugin id 或版本声明漂移都必须生成 blocker。

**Given** 外部 MCP 被期望可用
**When** doctor 或 runtime planner 检查 `context7` 和 `sequential-thinking`
**Then** 系统必须检测 configured/installed/callable 状态
**And** 不得自动把外部 MCP 当成 Claude plugin dependency 安装或发布。

**Given** 某个 plugin dependency 缺失、被禁用或 cross-marketplace trust 不满足
**When** 用户运行验证或安装态 smoke
**Then** 系统必须报告缺失能力、影响范围、remediation、是否阻塞当前任务
**And** 不得把依赖缺失场景标记为完整通过。

**Given** 某个 external MCP 不可用
**When** 任务需要最新文档查询或高风险推理
**Then** 系统必须说明 fallback，例如使用本地缓存、人工确认或 blocked
**And** 涉及最新 Claude Code/plugin/MCP 行为时必须标记不确定或阻塞。

**Given** Story 2.2 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、`npm run test:runner`、capability/dependency tests
**And** 如 plugin manifest 或 marketplace trust 变更，还必须运行 `npm run check-versions` 和 `claude plugin validate ./plugins/curdx-flow`。

### Story 2.3: Native `/goal` 能力检测与 Manual Fallback

作为使用 curdx-flow 执行长任务的用户，
我希望系统能判断当前 Claude Code 环境是否支持 native `/goal`，并在不可用时给出可靠的 manual/resumable fallback，
以便长任务不会依赖错误的无人值守假设，也不会让 Stop hook 形成第二套续跑循环。

**Acceptance Criteria:**

**Given** 用户运行 `curdx-flow doctor --json` 或 goal bridge 相关命令
**When** 系统检测 native `/goal` 能力
**Then** 输出必须包含 supported、requiredVersion、detectedVersion、reason、hooks/settings blockers、fallback action、condition length status
**And** Claude Code 版本低于 `2.1.139` 时必须报告 update-needed，而不是声称 `/goal` 可用。

**Given** 当前环境启用了 `disableAllHooks` 或 managed `allowManagedHooksOnly` 阻断 `/goal`
**When** doctor 或 implement flow 读取环境状态
**Then** native `/goal` 必须标记为 blocked 或 unavailable
**And** 输出必须说明 `/goal` 依赖 hooks 系统，并推荐 manual/resumable fallback。

**Given** 系统生成 `/goal` completion condition
**When** condition 被构造
**Then** condition 必须包含 turn/time bound、transcript-visible evidence 要求、verifier command、exit code、missingEvidence、final verdict 要求
**And** condition 必须遵守 4,000 字符上限，超限时应压缩并报告 warning。

**Given** native `/goal` 可用
**When** `/curdx-flow:implement` 或 runtime route 需要长任务执行驱动
**Then** 默认应推荐 `/goal` 作为 execution driver
**And** Stop hook 只能做 gate/cleanup/evidence check，不得注入 continuation prompt。

**Given** native `/goal` 不可用
**When** 用户仍要执行 curdx-flow 流程
**Then** 系统必须提供 manual/resumable fallback
**And** 不得暗示无人值守继续执行仍然可用。

**Given** `/goal` evaluator 只能看到 transcript
**When** runtime 输出 evidence summary
**Then** summary 必须包含简洁、脱敏、可见的 verifier evidence
**And** 不得要求输出原始日志、secret、MCP 响应或内存 payload 来满足 evaluator。

**Given** Story 2.3 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、goal capability/goal bridge tests、相关 hook tests
**And** 测试必须覆盖 supported version、update-needed、hooks-disabled、condition length、manual fallback、Stop hook 不续跑。

### Story 2.4: Report-Only、Fix Mode 与动作风险策略

作为 QA、开发者或团队负责人，
我希望 curdx-flow 明确区分只报告、不改代码的 report-only 模式，以及允许诊断、修改、重跑的 fix mode，
以便系统在激进自动化的同时不会误改源码、误跑高风险动作或绕过授权。

**Acceptance Criteria:**

**Given** 用户选择 report-only 模式
**When** curdx-flow 执行验证、浏览器检查、API 检查、日志读取或报告生成
**Then** 系统不得修改源码、配置、依赖、数据库 schema、全局 Claude/MCP 配置或 git 状态
**And** 只能写入明确区分的报告和 artifact，例如 `.curdx/reports/**`、`.curdx/evidence/**`。

**Given** report-only 模式发现问题
**When** 报告生成
**Then** 报告必须包含复现步骤、严重等级、证据链接、影响范围和建议
**And** 不得声称问题已修复。

**Given** 用户选择 fix mode
**When** 系统准备修改源码、生成验证文件、安装普通 dev 依赖或重跑验证
**Then** 系统必须记录动作类型、目标文件范围、风险等级、变更意图、执行结果和 evidenceRefs
**And** 修复后必须要求 same-path retry 或明确 blocker。

**Given** 某个动作被 action-risk policy 判定为高风险或 destructive
**When** 该动作涉及删除文件、destructive migration、全局配置变更、push、tag、npm publish、plugin release、访问生产数据或不可逆命令
**Then** 系统必须要求明确授权或 release-stage 上下文
**And** 未授权时必须返回 blocker，不得自动执行。

**Given** no false completion 是不可关闭规则
**When** 用户或配置试图关闭该规则
**Then** policy 必须拒绝
**And** 报告必须说明 no false completion 只能通过 blocker/manual confirmation 表达，不允许静默通过。

**Given** policy 被 runtime planner、adapter 或 report 读取
**When** 模式或风险等级影响执行路径
**Then** planner/report 必须显示该策略如何影响动作选择和 evidence 要求
**And** 不得把被策略跳过的动作当作已验证。

**Given** Story 2.4 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、action-risk policy contract tests、mode policy runtime tests
**And** 测试必须覆盖 report-only 不改源码、fix mode action log、高风险授权缺失、no false completion 不可关闭、策略跳过导致 partial/blocked。

### Story 2.5: Capability Routing 与 Remediation Planner

作为不想手动选择底层工具的用户，
我希望 curdx-flow 根据任务类型、项目形态、风险等级、可用能力和证据需求自动选择验证能力，
以便系统能说明为什么用 Playwright、Chrome DevTools MCP、API checks、ui-ux-pro-max、context7、claude-mem、pua 或 sequential-thinking，并在能力缺失时给出补救路径。

**Acceptance Criteria:**

**Given** runtime planner 收到任务类型、项目 topology、mode policy、capability status 和 evidence requirements
**When** 生成验证计划
**Then** 每项 evidence requirement 必须映射到一个首选 capability、fallback capability 或 blocker
**And** 计划必须记录选择理由、降级影响和是否需要人工确认。

**Given** 前端或全栈任务需要 browser evidence
**When** Playwright、Chrome DevTools MCP、Claude Chrome 或相关能力可用性不同
**Then** routing 必须优先选择可复跑证据路径，并说明真实浏览器诊断与可复跑 E2E 的差异
**And** 缺少关键能力时不得静默通过。

**Given** 任务需要最新官方文档、历史失败检索、复杂并行诊断或高风险架构推理
**When** context7、claude-mem、pua、sequential-thinking 可用性被检测
**Then** routing 必须选择合适能力或生成 degraded/blocker
**And** 不得 vendor 或重实现这些能力。

**Given** 某个缺失能力可以通过安装、启用、更新或配置修复
**When** remediation planner 生成补救方案
**Then** 输出必须包含具体动作、风险等级、是否需要用户授权、预期恢复的 evidence 能力、失败 fallback
**And** 高风险或全局配置动作不得自动执行，除非策略允许并有明确授权。

**Given** remediation 执行后能力仍不可调用
**When** doctor 或 planner 重新检查
**Then** 状态必须保持 degraded/unavailable
**And** 报告必须说明已尝试动作、失败原因和对完成结论的影响。

**Given** routing 选择 fallback capability
**When** 该 fallback 只提供较低信任等级 evidence
**Then** completion verdict 必须保留 degraded 或 manual-confirmation-required 信息
**And** 不得把 fallback 证据包装成完整验证。

**Given** Story 2.5 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、runtime planner routing tests、capability/remediation tests
**And** 测试必须覆盖 browser evidence routing、API routing、external MCP unavailable、plugin dependency unavailable、remediation success/failure、fallback degraded verdict。

### Story 2.6: QA Report-Only Evidence Surface

作为只想验收、不想让 AI 改代码的 QA 或评审者，
我希望 curdx-flow 提供清晰的 report-only 证据输出面，
以便我能看到复现步骤、严重等级、证据链接、影响范围和建议，而不会触发自动修复或源码变更。

**Acceptance Criteria:**

**Given** 用户以 report-only 模式运行 curdx-flow
**When** 系统完成验证计划、能力路由和报告生成
**Then** 输出必须明确标记 `mode: report-only`
**And** 报告必须说明本次运行没有源码修改，只有 report/evidence/artifact 写入。

**Given** report-only 发现浏览器、API、数据、依赖、环境或外部能力问题
**When** 报告生成
**Then** 每个问题必须包含复现步骤、严重等级、影响范围、evidenceRefs、artifact 链接和建议下一步
**And** 不得生成 fix attempt、源码 patch 或自动提交。

**Given** 某个问题需要人工判断
**When** 系统无法自动确认通过或失败
**Then** 报告必须标记 `manual-confirmation-required`
**And** 必须列出人工需要检查的证据和判断标准。

**Given** 某项关键能力不可用导致验证降级
**When** report-only 报告输出
**Then** 报告必须说明缺失能力、原本要验证什么、fallback 做了什么、可信度下降在哪里
**And** 如果关键证据缺失，最终 verdict 必须为 blocked、partial 或 manual-confirmation-required。

**Given** report-only 结果被技术负责人用于合并判断
**When** 查看报告顶部和 JSON 输出
**Then** 报告必须一眼显示是否可交付、哪些问题阻塞、哪些只是警告、下一步负责人
**And** JSON 输出必须能被后续 fix mode 或 ticket/story 生成流程消费。

**Given** Story 2.6 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、report-only mode tests、report renderer tests
**And** 测试必须覆盖 report-only 不改源码、问题严重等级、manual confirmation、能力降级、JSON 可消费输出。

## Epic 3: 项目识别、冷启动与运行准备

用户可以让 curdx-flow 识别项目形态、入口、脚本、服务和验证方式，完成冷启动、健康检查、端口/日志/清理状态记录，并发现阻止项目运行的 blocker。

**Story Requirement Trace:**

| Story | Primary FRs |
|---|---|
| Story 3.1 | FR6, FR7, FR11 |
| Story 3.2 | FR8, FR9, FR10 |
| Story 3.3 | FR8, FR10, FR14 |
| Story 3.4 | FR11, FR64 |
| Story 3.5 | FR10, FR14, FR64 |

### Story 3.1: Project Topology and Runtime Discovery

作为让 curdx-flow 验证一个未知项目的用户，
我希望系统能识别当前项目是前端、后端、全栈、CLI、库、monorepo 还是 Claude Code plugin，
以便后续验证计划基于真实项目结构，而不是假设所有项目都是单一 Node app。

**Acceptance Criteria:**

**Given** 用户在一个项目根目录运行 curdx-flow
**When** runtime discovery 扫描工作区
**Then** 它必须输出 runtime topology，包括项目类型、roots、package manager、主要入口、脚本、测试/验证线索、服务线索、API/data/browser 线索
**And** topology 必须使用结构化 JSON/type，而不是自然语言描述作为唯一结果。

**Given** 项目是前端、后端、全栈、CLI/library、monorepo 或 Claude Code plugin
**When** discovery 运行
**Then** 系统必须能给出合理项目分类和置信度
**And** 未识别项目不得默认为 Node/frontend，必须标记 unknown 或 needs-human-input。

**Given** 项目包含多个 package roots 或 workspace
**When** discovery 输出 topology
**Then** 必须列出每个 root 的路径、类型、package manager、可用脚本和可能服务
**And** 不得只检测第一个 package 后忽略其余 roots。

**Given** discovery 发现 plugin manifest、hooks、skills、agents 或 `plugins/curdx-flow` 类似结构
**When** 项目被分类为 Claude Code plugin
**Then** topology 必须记录 plugin root、manifest path、hook wiring、plugin-local executable 和 validation command 线索。

**Given** discovery 无法可靠判断入口或运行方式
**When** 输出结果
**Then** 必须生成 blocker 或 `needs-human-input`，说明缺少哪些事实
**And** 不得基于猜测生成成功验证计划。

**Given** Story 3.1 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、runtime discovery tests
**And** 测试必须覆盖 frontend、backend、full-stack、CLI/library、monorepo、Claude Code plugin、unknown project 和 malformed package metadata。

### Story 3.2: Verification Command and Script Detection

作为使用 curdx-flow 验证项目的开发者，
我希望系统能识别项目已有的安装、启动、测试、构建、lint、E2E、API、plugin validation 等命令，
以便验证计划优先复用项目已有脚本，而不是发明不可靠的命令。

**Acceptance Criteria:**

**Given** runtime topology 已识别一个或多个 project roots
**When** command discovery 分析 package scripts、lockfile、配置文件和已知框架约定
**Then** 它必须输出 install、dev/start、build、test、lint、typecheck、e2e、API/contract、health、plugin validate 的候选命令
**And** 每个候选命令必须包含 root、executable、argv、confidence、risk level 和 evidence purpose。

**Given** 项目存在 npm、pnpm、yarn、bun、Python、Go、Rust 或其他非 Node 线索
**When** command discovery 运行
**Then** 系统必须根据 lockfile/manifest 选择合适包管理器或命令策略
**And** 不得把所有项目都强行转换成 npm 命令。

**Given** 项目已有明确验证脚本
**When** planner 需要选择验证命令
**Then** 应优先使用项目已有脚本
**And** 只有在脚本缺失时才生成建议或最小替代命令，并将其标记为 inferred 或 degraded。

**Given** 某个命令可能修改源码、安装依赖、启动服务或执行高风险操作
**When** command discovery 输出该命令
**Then** 必须标记风险等级
**And** report-only 模式不得执行会修改源码或配置的命令。

**Given** 命令检测结果包含多个候选
**When** planner 选择命令
**Then** 必须记录选择理由和未选择原因
**And** 未选择的高相关候选应在报告中作为可选验证路径展示。

**Given** Story 3.2 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、command discovery tests
**And** 测试必须覆盖多 package manager、缺脚本、多个候选、plugin validation scripts、inferred command、report-only 风险限制和 argv-array 命令安全。

### Story 3.3: Cold-Start Service Lifecycle and Health Checks

作为需要确认项目真的能跑起来的用户，
我希望 curdx-flow 能从冷启动开始启动必要服务、捕获日志、执行健康检查并记录服务状态，
以便页面/API 验证建立在真实可用的运行环境上，而不是依赖已经打开的旧进程或猜测。

**Acceptance Criteria:**

**Given** runtime planner 已选择一个或多个 dev/start 命令
**When** service lifecycle 启动服务
**Then** 必须记录 command、argv、root、PID 或进程句柄、启动时间、环境摘要、日志 artifact 路径和关联 evidence id
**And** 不得依赖 repo-relative dev-only 路径或 shell 拼接命令。

**Given** 服务启动后需要判断是否可用
**When** health check 执行
**Then** 系统必须检查配置或推断的 URL、端口、health endpoint、CLI exit status 或可访问状态
**And** 成功 evidence 必须包含访问目标、状态、响应摘要或就绪信号。

**Given** 服务启动失败、超时、端口未监听或 health check 失败
**When** runtime 生成结果
**Then** 必须输出 blocker，包含命令、exit code、关键 stdout/stderr 摘要、日志窗口、可能层级和下一步动作
**And** 不得进入后续 browser/API/data 成功验证。

**Given** 前端服务启动成功但后端服务失败
**When** 项目被识别为全栈或需要 API/data evidence
**Then** verdict 不得为 complete
**And** 报告必须明确“页面可访问不等于全栈完成”。

**Given** health check 只能通过 inferred endpoint 完成
**When** endpoint 置信度不足
**Then** evidence 必须标记 degraded 或 needs-human-input
**And** 不得把推断 health 成功当作完整运行证明。

**Given** Story 3.3 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、service lifecycle/health check tests
**And** 测试必须覆盖成功启动、启动失败、health timeout、前端成功后端失败、日志截断、argv-array 执行、degraded inferred endpoint。

### Story 3.4: Multi-Service、端口冲突与清理追踪

作为验证多服务或 monorepo 项目的用户，
我希望 curdx-flow 能管理多个服务、处理端口冲突，并清楚记录哪些进程由 curdx-flow 启动和清理，
以便验证结束后不会留下不可解释的本地进程，也不会误杀用户已有服务。

**Acceptance Criteria:**

**Given** runtime topology 需要启动多个服务
**When** service lifecycle 执行启动计划
**Then** 每个服务必须有独立 service id、root、命令、端口/URL、日志 artifact、health 状态和清理状态
**And** 报告必须展示服务之间的关系，例如 frontend、backend、worker、database emulator 或 plugin smoke target。

**Given** 目标端口已被占用
**When** curdx-flow 检测端口冲突
**Then** 系统必须区分 user-existing process 与 curdx-started process
**And** 不得自动杀掉用户已有进程，除非策略允许且用户明确授权。

**Given** 端口冲突可以通过换端口、复用已有服务或阻塞报告处理
**When** planner 选择处理方式
**Then** 必须记录选择理由、风险等级、影响的 URL/API evidence 和 fallback
**And** 如果复用已有服务，证据必须标记为 warm/reused 而不是 cold-start。

**Given** curdx-flow 启动了一个或多个本地服务
**When** run 完成、失败或被取消
**Then** 系统必须记录清理尝试、结果、剩余进程和用户需要执行的下一步
**And** 清理失败必须进入 blocker 或 warning，不得静默丢失。

**Given** 服务日志非常大
**When** 报告生成
**Then** 报告只包含关键日志窗口和 artifact 路径
**And** 原始日志保留策略必须避免把巨大日志塞入 transcript。

**Given** Story 3.4 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、multi-service/port/cleanup tests
**And** 测试必须覆盖多服务启动、端口占用、复用已有服务、拒绝杀用户进程、curdx-started process cleanup、清理失败和日志截断。

### Story 3.5: Runtime Readiness Fixtures and Blocker Reports

作为 curdx-flow 维护者，
我希望项目识别、命令检测、冷启动、健康检查和服务清理都有可运行 fixtures 和标准 blocker reports，
以便后续 browser/API/data 验证建立在可复现的运行准备能力上。

**Acceptance Criteria:**

**Given** Epic 3 的 runtime readiness 能力被实现
**When** 测试 fixtures 运行
**Then** `tests/fixtures/**` 或等价 fixture 目录必须覆盖至少 frontend-app、api-app、fullstack-app、monorepo、unknown/broken app、Claude Code plugin-like project
**And** 每个 fixture 都必须有 expected topology、expected commands、expected health result 或 expected blocker。

**Given** fixture 代表依赖安装失败、启动失败、health 失败、端口占用、前端成功后端失败或 unknown project
**When** runtime readiness 运行
**Then** 系统必须输出结构化 blocker report
**And** blocker 必须包含 category、message、reproduction、attemptedActions、nextAction、owner、riskLevel、evidenceRefs。

**Given** fixture 代表成功运行准备
**When** runtime readiness 完成
**Then** 必须产生 L2 runtime evidence，包括命令、服务状态、health check 和 artifact index
**And** 该 evidence 可被 Epic 4 browser/API/data verification 复用。

**Given** blocker report 被 human-readable report 渲染
**When** 用户查看报告
**Then** 用户必须能看出卡在哪里、哪个命令失败、关键日志在哪里、下一步做什么
**And** 不得需要用户自己翻大量日志猜原因。

**Given** fixture 运行在 CI 或本地测试中
**When** 依赖外部端口、浏览器或全局工具不可用
**Then** 测试必须使用可控 fake service/fake adapter 或明确 skip-with-reason
**And** 不得依赖用户机器上的偶然运行状态。

**Given** Story 3.5 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、runtime readiness fixture tests
**And** 测试必须覆盖 successful readiness、blocked readiness、unknown project、port conflict、frontend-only success with backend failure、artifact lifecycle。

## Epic 4: Browser/API/Data 用户旅程验证

用户可以证明前端或全栈功能真的经过页面操作、API 请求、后端处理、数据保存和 UI 回显，而不是只通过 build、mock 或静态检查。

**Story Requirement Trace:**

| Story | Primary FRs |
|---|---|
| Story 4.1 | FR15, FR19, FR26 |
| Story 4.2 | FR19, FR20, FR26 |
| Story 4.3 | FR21, FR22, FR23 |
| Story 4.4 | FR24, FR25, FR71 |
| Story 4.5 | FR19, FR20, FR25, FR26 |
| Story 4.6 | FR15, FR19, FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR71 |

### Story 4.1: User Journey Verification Plan

作为希望证明功能真实可用的用户，
我希望 curdx-flow 能把用户请求转换成具体用户旅程验证计划，
以便系统知道要打开哪个页面、执行哪些动作、期待哪些 API/data/UI 结果，而不是只跑通用 build/test。

**Acceptance Criteria:**

**Given** 用户请求验证一个前端或全栈功能
**When** planner 读取用户意图、runtime topology、capability status 和 evidence requirements
**Then** 它必须生成 user journey verification plan
**And** plan 必须包含入口 URL/服务、动作序列、期望 UI 状态、期望 API 请求/响应、期望数据落点、所需 artifacts、缺失能力和剩余风险。

**Given** 用户没有明确提供旅程细节
**When** planner 只能从代码、路由、脚本或变更范围推断
**Then** plan 必须标记 inferred confidence
**And** 若核心路径不明确，verdict 必须为 needs-human-input、partial 或 blocked，不得假装已知。

**Given** 前端或全栈任务缺少 browser/API/data 其中之一的关键验证要求
**When** planner 生成计划
**Then** missingEvidence 必须被列入计划
**And** 后续 verdict 不得在缺口未处理时为 complete。

**Given** report-only 模式
**When** planner 生成用户旅程验证计划
**Then** 计划不得包含源码修改或测试文件生成动作
**And** 只能包含只读观察、运行检查、截图/trace/report artifact 生成。

**Given** fix mode
**When** planner 生成用户旅程验证计划
**Then** 计划可以包含修复前复现、修复动作、same-path retry
**And** 修复动作必须由 Epic 5 recovery flow 接管，不得在 journey plan 中直接执行。

**Given** Story 4.1 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、journey planner tests
**And** 测试必须覆盖明确旅程、推断旅程、缺 browser/API/data evidence、report-only、fix mode handoff 和 unknown route。

### Story 4.2: Browser Adapter and Screenshot/Trace Evidence

作为验证前端或全栈功能的用户，
我希望 curdx-flow 能使用可用的浏览器能力打开真实页面、执行用户动作并保存截图或 trace，
以便报告中有可复查的页面行为证据，而不是只说“页面看起来正常”。

**Acceptance Criteria:**

**Given** user journey plan 包含入口 URL 和用户动作序列
**When** browser adapter 执行验证
**Then** 它必须打开实际页面、执行计划动作、记录访问 URL、动作结果、页面状态和截图/trace artifact
**And** evidence 必须关联 runId、journey id、action id 和 capabilityId。

**Given** Playwright/project E2E 可用
**When** 需要可复跑 browser evidence
**Then** 系统应优先生成或调用可复跑路径
**And** 输出必须包含命令、exit code、trace/screenshot 路径和失败摘要。

**Given** Chrome DevTools MCP 或 Claude Chrome 可用
**When** 需要真实浏览器现场诊断、登录态、console、network、DOM/CSS 或 performance 观察
**Then** browser adapter 可以使用该能力
**And** 报告必须说明其用途和与 Playwright 可复跑证据的差异。

**Given** browser capability 不可用、页面无法打开、选择器失败或操作超时
**When** adapter 返回结果
**Then** 必须生成 blocker 或 degraded evidence
**And** blocker 必须包含 URL、动作、失败原因、可用 fallback 和下一步动作。

**Given** 页面截图为空白、无关首页、终端截图或未覆盖变更区域
**When** report 评估该 artifact
**Then** 该截图不得支撑成功 browser evidence
**And** 必须要求重新截图、trace 或人工确认。

**Given** Story 4.2 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、browser adapter/probe tests
**And** 测试必须覆盖 Playwright 可用、Chrome DevTools MCP unavailable、页面打开失败、操作超时、截图 artifact、trace artifact、空白截图降级。

### Story 4.3: 用户动作绑定的 API 请求与响应证据

作为验证全栈功能的用户，
我希望 curdx-flow 能证明页面上的用户动作触发了预期 API 请求，并记录真实响应结果，
以便报告能说明前端和后端真的联通，而不是孤立 curl 或 mock 响应。

**Acceptance Criteria:**

**Given** user journey plan 中包含需要触发 API 的用户动作
**When** browser/API probe 执行动作
**Then** 系统必须捕获该动作关联的 API 请求、方法、URL、状态码、请求摘要、响应摘要和时间关系
**And** API evidence 必须绑定到具体 action id，不得作为孤立请求冒充用户旅程证据。

**Given** API 响应需要符合任务要求
**When** response 被检查
**Then** 系统必须验证状态码、响应体关键字段、错误码或 schema/contract 结果
**And** 不符合要求时必须生成 blocker 或 failed evidence。

**Given** 前端操作未触发预期 API 请求
**When** network/API 观察结束
**Then** verdict 不得为 complete
**And** 报告必须说明缺失的请求、用户动作和可能层级。

**Given** API 请求成功但响应体与 UI 或数据状态不一致
**When** API evidence 被写入
**Then** evidence 必须标记为 failed 或 inconclusive
**And** 后续必须由 data/UI closure 验证决定最终 verdict。

**Given** 只能通过人工 curl、mock server 或 fixture 响应构造 API 结果
**When** 没有用户动作绑定
**Then** evidence 必须标记 degraded
**And** 不得单独支撑前端/全栈用户旅程完成。

**Given** API response 包含敏感字段、token、cookie 或大量数据
**When** 写入 artifact 和报告
**Then** 系统必须保留安全摘要或 redaction 后内容
**And** 不得默认把完整敏感响应写入 transcript。

**Given** Story 4.3 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、API probe/contract tests
**And** 测试必须覆盖用户动作绑定请求、请求缺失、错误状态码、schema mismatch、mock degraded、敏感响应摘要、UI/API 不一致。

### Story 4.4: 数据持久化与读回验证

作为验证创建、更新、删除、提交或保存类功能的用户，
我希望 curdx-flow 能证明数据或状态真实持久化，并能通过刷新、重新查询或读回路径确认一致性，
以便 UI 成功提示或 API 200 不会被误判为真正完成。

**Acceptance Criteria:**

**Given** user journey 包含创建、更新、删除、提交、保存、同步或设置变更
**When** API/browser action 完成后
**Then** data probe 必须执行至少一种读回验证，例如刷新页面、重新查询 API、读取测试数据库状态、检查文件/队列/状态存储或调用项目已有验证命令
**And** data evidence 必须关联具体 user action 和 API evidence。

**Given** UI 显示成功但数据读回失败
**When** data probe 返回结果
**Then** verdict 不得为 complete
**And** 报告必须说明 UI/API/data closure 未闭合。

**Given** API 返回成功但刷新页面或重新查询后状态不一致
**When** closure check 执行
**Then** evidence 必须标记 failed
**And** nextAction 必须指出需要检查后端处理、缓存、事务、数据库、状态同步或前端回显层。

**Given** 数据验证需要测试数据
**When** 系统创建、识别或使用数据记录
**Then** 必须记录数据标识摘要、创建方式、隐私分类、清理策略和关联 runId
**And** 不得默认导出完整生产数据或数据库 dump。

**Given** 只能使用 mock、fixture、stub 或 dev-only data
**When** data evidence 写入
**Then** evidence 必须标记 degraded
**And** 报告必须说明它不能证明真实持久化。

**Given** 数据读回验证不可执行，例如缺数据库、缺密钥、外部服务不可用
**When** data probe 失败
**Then** 必须生成 blocker 或 manual-confirmation-required
**And** 不得把 browser/API 成功包装成全栈完成。

**Given** Story 4.4 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、data probe tests
**And** 测试必须覆盖保存成功读回、UI 成功数据失败、API 成功读回不一致、mock degraded、缺数据库 blocker、敏感数据摘要。

### Story 4.5: UI 状态、Console/Network 与视觉 Sanity Evidence

作为验证前端体验是否可交付的用户，
我希望 curdx-flow 不只确认页面打开，还检查关键 UI 状态、console 错误、network 问题和明显视觉缺陷，
以便报告能证明用户可用性达到最低标准。

**Acceptance Criteria:**

**Given** user journey 包含 UI 交互或页面状态变化
**When** browser probe 执行完成
**Then** evidence 必须记录关键 UI 状态，例如 loading、success、empty、error、disabled、validation failed、submitting、success-after-submit 中适用的状态
**And** 无法触发的状态必须说明原因和剩余风险。

**Given** 页面运行过程中出现 console error、uncaught exception、failed network request 或相关 warning
**When** probe 收集浏览器诊断
**Then** 报告必须列出问题摘要、关联动作、严重等级和 evidenceRefs
**And** 关键运行时错误不得被忽略为成功。

**Given** 页面截图或 DOM/CSS 诊断可用
**When** 系统执行视觉 sanity check
**Then** 必须检查明显重叠、文字截断、横向溢出、关键按钮/输入不可点击、固定头尾遮挡、移动端主流程不可完成等问题
**And** 发现问题时必须标记 failed、partial 或 manual-confirmation-required。

**Given** ui-ux-pro-max 可用
**When** 任务涉及视觉、响应式、交互或可用性质量
**Then** routing 可以调用该能力产生 UX evidence
**And** 缺失该能力时必须说明降级影响，而不是跳过 UI/UX 检查并成功。

**Given** 页面需要响应式或移动端验证
**When** viewport evidence 被要求
**Then** 系统必须记录检查 viewport、截图或 trace
**And** 未检查的 viewport 必须出现在 missingEvidence 或 remainingRisk 中。

**Given** Story 4.5 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、UI/browser diagnostics tests
**And** 测试必须覆盖 console error、network failure、空白页、视觉重叠、移动端缺证据、ui-ux-pro-max unavailable degraded、状态矩阵摘要。

### Story 4.6: Full-Stack Journey Fixtures and Degraded Mock Handling

作为 curdx-flow 维护者，
我希望 Browser/API/Data 用户旅程验证有可运行的全栈 fixtures，并严格区分真实证据和 mock/degraded evidence，
以便 no false completion 能在真实路径和降级路径中都被测试验证。

**Acceptance Criteria:**

**Given** Epic 4 用户旅程验证能力被实现
**When** fixture tests 运行
**Then** 必须至少覆盖一个全栈保存或 CRUD 旅程，包含页面操作、API 请求、后端处理、数据读回、UI 回显和截图/trace evidence
**And** 成功 fixture 必须产生 L3 user-journey evidence。

**Given** fixture 使用 mock、stub、fixture data 或 dev-only server
**When** evidence 被写入
**Then** evidence 必须标记 degraded
**And** verdict 不得因为 mock 路径通过而声明真实全栈 complete。

**Given** fixture 模拟页面可访问但 API 失败
**When** 用户旅程运行
**Then** 报告必须显示 browser evidence 通过但 API evidence 失败
**And** final verdict 必须为 blocked 或 partial。

**Given** fixture 模拟 API 成功但数据未保存
**When** data read-back 运行
**Then** 报告必须显示 UI/API/data closure 未闭合
**And** final verdict 不得为 complete。

**Given** fixture 模拟 console error、network failure、空白页或视觉遮挡
**When** browser diagnostics 运行
**Then** report 必须列出相关问题和 artifact
**And** final verdict 必须反映 severity 和 missing/failed evidence。

**Given** fixture 不依赖真实外部 MCP 或用户机器状态
**When** CI 或本地测试运行
**Then** 浏览器、API、data、UX adapter 可使用 fake adapter 或受控 app
**And** 若真实浏览器不可用，测试必须提供 skip-with-reason 或替代 fake coverage。

**Given** Story 4.6 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、full-stack journey fixture tests
**And** 测试必须覆盖 happy path、mock degraded、API failure、data failure、console/network failure、screenshot/trace artifact 和 verdict 输出。

## Epic 5: 失败诊断、修复闭环与同路径重跑

用户可以在验证失败时得到复现路径、失败归因、修复计划、修复尝试、同路径重跑结果和超限后的 root-cause/blocker 报告。

**Story Requirement Trace:**

| Story | Primary FRs |
|---|---|
| Story 5.1 | FR27, FR28 |
| Story 5.2 | FR29, FR32, FR74 |
| Story 5.3 | FR29, FR31, FR63 |
| Story 5.4 | FR30, FR31 |
| Story 5.5 | FR32, FR74, FR75 |

### Story 5.1: Failure Evidence Capture and Taxonomy

作为遇到验证失败的用户，
我希望 curdx-flow 能捕获失败症状、复现路径和影响层级，并把失败归类，
以便我知道问题发生在环境、依赖、前端、后端、API、数据、浏览器能力、外部服务还是发布门禁。

**Acceptance Criteria:**

**Given** 任一 command、service、browser、API、data、capability 或 release check 失败
**When** failure capture 运行
**Then** 系统必须记录失败来源、复现步骤、命令/动作、关键 stdout/stderr 或浏览器/API/data 摘要、artifactRefs、时间戳和关联 evidence ids
**And** 不得只输出一段未分类错误文本。

**Given** 失败被捕获
**When** failure taxonomy 归类
**Then** 必须输出 category，例如 environment、dependency、frontend、backend、api、data、browser、externalService、releaseGate、permission、unknown
**And** 分类必须包含 confidence 和选择理由。

**Given** 同一用户旅程中多个层级失败
**When** taxonomy 输出结果
**Then** 系统必须保留所有失败 evidence
**And** 标记 primary suspected layer 与 secondary symptoms，避免只看最后一个错误。

**Given** 失败日志很大或包含敏感内容
**When** failure evidence 写入报告
**Then** 报告必须使用关键窗口、摘要和 artifact 路径
**And** 不得默认泄露 secret、cookie、token、完整生产数据或超大日志。

**Given** taxonomy 无法确定原因
**When** 输出 failure result
**Then** category 可以为 unknown
**And** nextAction 必须要求更多诊断证据，而不是猜测修复。

**Given** Story 5.1 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、failure taxonomy tests
**And** 测试必须覆盖命令失败、浏览器失败、API 失败、数据失败、能力缺失、多个失败层级、敏感日志摘要和 unknown 分类。

### Story 5.2: Root-Cause Oriented Recovery Plan

作为想让系统自动恢复失败的用户，
我希望 curdx-flow 在修复前先生成基于失败证据的恢复计划，
以便系统优先定位根因，而不是盲目反复编辑代码。

**Acceptance Criteria:**

**Given** failure taxonomy 已输出失败分类和 evidenceRefs
**When** recovery planner 生成恢复计划
**Then** 计划必须包含 suspected root cause、需要补充的诊断证据、候选修复动作、风险等级、模式限制、预计重跑路径和停止条件
**And** 不得在没有失败证据的情况下直接生成修复动作。

**Given** 失败属于能力缺失、环境缺口、缺密钥、数据库不可用或外部服务不可用
**When** recovery planner 评估可修复性
**Then** 计划必须说明是 agent 可修复、用户负责、外部系统负责还是 manual-confirmation-required
**And** 不得把不可自动修复的问题包装成代码修复任务。

**Given** 失败曾在 claude-mem 或历史记录中出现过
**When** 历史能力可用
**Then** recovery planner 可以引用历史失败模式和已验证修复路径
**And** 必须说明引用来源摘要和可信度，不得直接照搬敏感内容。

**Given** 失败需要最新官方文档或高风险架构判断
**When** context7 或 sequential-thinking 可用
**Then** recovery planner 可以把它们作为诊断能力
**And** 不可用时必须说明降级影响或要求人工确认。

**Given** 失败需要并行诊断
**When** pua 或等价并行能力可用
**Then** planner 可以生成 bounded parallel diagnosis plan
**And** 必须限制范围，避免多个 worker 修改同一文件或重复修复同一问题。

**Given** Story 5.2 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、recovery planner tests
**And** 测试必须覆盖 evidence-backed plan、缺证据不修复、环境 blocker、外部服务 blocker、history degraded、parallel diagnosis ownership、unknown root cause。

### Story 5.3: Fix Attempt Lineage and Risk-Aware Execution

作为允许 curdx-flow 进入 fix mode 的开发者，
我希望每次修复尝试都能追踪来源、变更范围、风险等级、执行结果和关联失败证据，
以便自动修复过程可审计、可回溯，并且不会越权修改无关文件。

**Acceptance Criteria:**

**Given** recovery planner 生成了候选修复动作
**When** fix mode 执行修复
**Then** 每个 fix attempt 必须记录 attemptId、parentFailureEvidenceIds、目标文件范围、变更意图、风险等级、执行动作、结果、生成 evidence 和下一步重跑路径
**And** 该 attempt 必须追加到 ledger，不得覆盖旧尝试。

**Given** 修复动作会修改源码、配置、依赖或验证文件
**When** 执行前检查 policy
**Then** 系统必须确认当前模式允许该动作
**And** 高风险动作必须要求明确授权，否则输出 blocker。

**Given** 工作区有用户既有改动
**When** fix attempt 准备写文件
**Then** 系统必须对比 dirty baseline
**And** 不得覆盖、回滚或格式化与本次失败无关的用户改动。

**Given** fix attempt 修改了文件
**When** 报告生成
**Then** 报告必须列出修改文件、变更意图、风险等级、验证命令和 evidenceRefs
**And** 不得只说“已修复”。

**Given** fix attempt 失败或只部分执行
**When** runtime 更新状态
**Then** 必须记录失败原因、已执行动作、未执行动作和下一步
**And** 不得进入成功 verdict，除非同路径重跑通过。

**Given** Story 5.3 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、fix attempt lineage tests、mode/risk policy tests
**And** 测试必须覆盖允许修复、未授权高风险动作、dirty worktree 保护、部分修复失败、attempt append-only、报告变更摘要。

### Story 5.4: Same-Path Retry and Before/After Verdict

作为等待失败修复结果的用户，
我希望 curdx-flow 在修复后重跑同一条失败路径，并把修复前、修复后和重跑结果关联起来，
以便成功结论来自真实验证，而不是“代码改了所以应该好了”。

**Acceptance Criteria:**

**Given** fix attempt 已完成
**When** retry planner 准备验证修复结果
**Then** 必须使用原失败路径的同一入口、同一用户动作、同一 API/命令或等价可证明路径
**And** 如果路径被改变，evidence 必须标记 degraded，verdict 不得为 complete。

**Given** 同路径重跑执行
**When** retry 产生新 evidence
**Then** 新 evidence 必须关联 before failure evidence、fix attempt 和 retry attemptId
**And** 报告必须展示 before/after/retry 链路。

**Given** 重跑通过所有原失败断言和必要 evidence requirements
**When** verdict evaluator 重新计算
**Then** verdict 可以从 blocked/failed 变为 complete 或 partial
**And** 必须说明哪些 evidence 支撑该变化。

**Given** 重跑仍然失败
**When** recovery state 更新
**Then** 系统必须记录失败是否同因、变因或新失败
**And** 根据 retry cap 决定继续诊断、生成新修复计划或输出 blocker。

**Given** 修复后只跑了不同命令、不同页面、mock 路径或跳过失败步骤
**When** report 生成
**Then** 报告必须标记为 degraded 或 manual-confirmation-required
**And** 不得把该结果包装成 same-path success。

**Given** Story 5.4 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、same-path retry tests、verdict transition tests
**And** 测试必须覆盖同路径成功、同路径失败、路径改变降级、before/after evidence 链接、新失败分类、verdict 转换。

### Story 5.5: Retry Caps、Blocker Reports 与恢复 Fixtures

作为希望自动恢复但不希望系统无限修复的用户，
我希望 curdx-flow 在超过修复上限或无法安全恢复时停止反复修改，并输出可执行 blocker report，
以便我能清楚知道已尝试什么、为什么停下、下一步谁负责。

**Acceptance Criteria:**

**Given** recovery flow 已达到配置的 fix attempt 或 retry 上限
**When** 失败仍未解决
**Then** 系统必须停止继续自动修改
**And** 输出 blocker report，包含失败原因、复现路径、已尝试动作、before/after evidence、剩余风险、nextAction、owner 和 riskLevel。

**Given** failure category 属于权限、外部服务、缺密钥、生产数据、全局配置或 destructive 操作
**When** recovery flow 判断无法安全自动修复
**Then** 必须直接输出 blocker 或 manual-confirmation-required
**And** 不得通过降低验证标准获得成功 verdict。

**Given** blocker report 被用户或后续 agent 消费
**When** 生成下一步修复计划
**Then** blocker 必须足够具体，可转化为后续 story、ticket 或人工操作
**And** 不得只有“请检查日志”这种不可执行建议。

**Given** recovery fixtures 运行
**When** 测试成功恢复、重复失败、权限阻塞、外部服务阻塞、路径改变降级、修复上限超限
**Then** 每个 fixture 必须产生预期 recovery state、evidence chain 和 final verdict
**And** tests 必须证明 false completion 不会在恢复失败时出现。

**Given** retry cap 或 recovery policy 被配置
**When** runtime planner 读取配置
**Then** 配置必须有合理默认值
**And** 用户不能通过配置关闭 no false completion。

**Given** Story 5.5 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、recovery fixture tests、blocker report tests
**And** 测试必须覆盖 retry cap、manual-confirmation-required、external blocker、permission blocker、blocker-to-next-plan、false completion prevention。

## Epic 6: curdx-flow 插件自验证与发布安全

维护者可以验证 curdx-flow 插件自身是否真实可安装、可运行、可发布，并避免 npm release 与 Claude plugin release 漂移。

**Story Requirement Trace:**

| Story | Primary FRs |
|---|---|
| Story 6.1 | FR53, FR58, FR59, FR76 |
| Story 6.2 | FR54, FR57 |
| Story 6.3 | FR55 |
| Story 6.4 | FR56, FR59 |
| Story 6.5 | FR57, FR58, FR76 |
| Story 6.6 | FR58, FR77 |

### Story 6.1: Release Evidence Model and Dry-Run Verdict

作为 curdx-flow 维护者，
我希望发布前先执行 release dry-run，并输出 release-ready 或 not-releasable verdict，
以便真实 push、tag、npm publish 或 plugin release 前有完整证据，而 dry-run 本身不会产生发布副作用。

**Acceptance Criteria:**

**Given** 维护者运行 release gate dry-run
**When** release checks 执行
**Then** 系统必须输出 release verdict，状态为 `release-ready` 或 `not-releasable`
**And** verdict 必须包含 version、npm tag、Claude plugin tag、check results、missingEvidence、blockers、nextAction 和 riskLevel。

**Given** dry-run 执行
**When** 检查过程需要验证发布前置条件
**Then** 系统可以运行只读或本地验证命令
**And** 不得执行真实 push、tag、npm publish、`claude plugin tag --push` 或 plugin release。

**Given** release evidence 被写入 ledger
**When** report 生成
**Then** release evidence 必须标记 L4 trust level 或 release-specific trust level
**And** freshness 必须包含 commit/tag/version context，防止旧证据支撑新发布。

**Given** 任一 release 前置条件失败
**When** verdict 生成
**Then** 状态必须为 `not-releasable`
**And** blocker 必须说明失败检查、修复路径和是否需要重新运行 dry-run。

**Given** dry-run 结果被用户查看
**When** 报告顶部渲染
**Then** 必须一眼显示“未发布 / 可发布 / 不可发布”
**And** 不得让用户误以为 dry-run 已经发布。

**Given** Story 6.1 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run typecheck`、release verdict/dry-run tests
**And** 测试必须覆盖 ready、not-releasable、no side effects、stale release evidence、missing check blocker 和 report summary。

### Story 6.2: Version、Manifest、Registry 与 Marketplace Parity Checks

作为准备发布 curdx-flow 的维护者，
我希望 release gate 检查 package version、plugin manifest、registry、marketplace trust 和 dependency declarations 是否一致，
以便避免 npm 包、Claude plugin、依赖解析和安装态行为发生漂移。

**Acceptance Criteria:**

**Given** release gate 读取版本和元数据
**When** parity check 执行
**Then** 必须检查 `package.json`、`package-lock.json` root、`package-lock.json packages[""]`、`plugins/curdx-flow/.claude-plugin/plugin.json`、repo-root `.claude-plugin/marketplace.json` 的版本一致性
**And** 任一字段不一致必须生成 `not-releasable` blocker。

**Given** plugin dependencies 被声明
**When** dependency parity check 执行
**Then** 必须检查 plugin manifest dependencies、`src/registry/capabilities.ts`、`src/registry/plugins/*`、marketplace allowlist、runner tests 所需的依赖身份一致
**And** `pua`、`claude-mem`、`chrome-devtools-mcp`、`ui-ux-pro-max` 的 marketplace/plugin id 漂移必须阻塞发布。

**Given** expected external MCP 被配置或检测
**When** release gate 检查 external capability boundary
**Then** `context7` 和 `sequential-thinking` 不得作为 plugin dependencies 发布
**And** release report 必须说明它们属于 expected external MCP readiness，而不是 plugin dependency resolution。

**Given** 版本需要变更
**When** 维护者尝试手动改多个版本文件
**Then** release guidance 必须要求使用 `node scripts/bump-version.mjs <version|patch|minor|major>`
**And** 手动漂移状态必须被 parity check 捕获。

**Given** parity check 通过
**When** report 输出
**Then** release evidence 必须列出所有已验证 version/manifest/registry/marketplace surfaces
**And** 记录对应命令或检查来源。

**Given** Story 6.2 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run check-versions`、`npm run test:runner`、release parity tests
**And** 测试必须覆盖版本不一致、依赖 id 漂移、marketplace allowlist 缺失、external MCP 误建模、版本脚本 guidance。

### Story 6.3: Hook Freshness and Generated Artifact Gate

作为维护 curdx-flow hooks 的开发者，
我希望 release gate 能验证 hook TypeScript source 与 committed generated hook bundles 一致，
以便发布的插件不会运行过期、手改或未构建的 hook 脚本。

**Acceptance Criteria:**

**Given** release gate 检查 hook freshness
**When** `src/hooks/**`、`scripts/build-hooks.mjs` 或 `plugins/curdx-flow/hooks/hooks.json` 发生变化
**Then** 必须要求 `npm run build:hooks` 和 `npm run check:hooks-fresh` 通过
**And** generated bundles 必须与 source 变更对应。

**Given** generated hook bundle 被手动修改但 source 未改
**When** freshness check 执行
**Then** release verdict 必须为 `not-releasable`
**And** blocker 必须说明不得手改 `plugins/curdx-flow/hooks/scripts/**`。

**Given** hook entrypoint 增删或路径变更
**When** release gate 检查 hook surfaces
**Then** 必须验证 `scripts/build-hooks.mjs` entries、`plugins/curdx-flow/hooks/hooks.json`、generated scripts、plugin manifest 或 smoke coverage 是否同步
**And** 任一不一致必须阻塞发布。

**Given** hook stdout/stderr 或 gate 行为发生变化
**When** release gate 汇总验证结果
**Then** 必须要求相关 hook protocol tests 通过
**And** report 必须列出 hook freshness、hook tests 和 generated artifact 状态。

**Given** hook freshness 通过但 plugin validation 未运行
**When** release gate 判断发布 readiness
**Then** release verdict 仍不得为 release-ready
**And** 必须列出缺少 Claude plugin validation 或 installed smoke evidence。

**Given** Story 6.3 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `npm run build:hooks`、`npm run check:hooks-fresh`、相关 `npm run test:hooks`、release hook gate tests
**And** 测试必须覆盖 stale generated bundle、manual bundle edit、missing hook entry、hooks.json mismatch、hook protocol test missing。

### Story 6.4: Claude Plugin Validation and Installed Smoke Evidence

作为准备发布 curdx-flow 插件的维护者，
我希望 release gate 验证源码态 plugin 结构和安装态 smoke，
以便发布信心来自真实 Claude Code 插件加载与运行路径，而不只是 repo 内 TypeScript 测试通过。

**Acceptance Criteria:**

**Given** release gate 执行 plugin validation
**When** 检查 `plugins/curdx-flow`
**Then** 必须运行或要求运行 `claude plugin validate ./plugins/curdx-flow`
**And** validation failure 必须生成 `not-releasable` blocker，包含失败摘要和修复路径。

**Given** plugin manifest、skills、agents、hooks、schemas、templates、references 或 bin surface 发生变化
**When** release readiness 被评估
**Then** 必须要求 Claude plugin validation evidence
**And** 不能只用 `npm run build` 或 `npm run typecheck` 代替。

**Given** installed-plugin smoke 执行
**When** `CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc` 或等价 smoke 运行
**Then** 必须在隔离 temp workspace 中验证 plugin 可安装/加载、主命令 surface 可访问、hook 不阻塞 Claude Code、依赖缺失时输出 actionable guidance
**And** 不得在仓库工作区创建真实用户 specs/state。

**Given** smoke 发现插件依赖、external MCP、hook、slash command 或 bin runtime 问题
**When** release report 生成
**Then** release verdict 必须为 `not-releasable`
**And** blocker 必须说明失败发生在源码态 validation、安装态 smoke、dependency resolution 还是 runtime command。

**Given** 本机 Claude CLI 缺失或版本不支持某项 smoke
**When** release gate 运行
**Then** 必须输出 blocked 或 manual-confirmation-required
**And** 不能把未运行 smoke 当作通过。

**Given** Story 6.4 完成
**When** 执行验证
**Then** 最小验证命令必须包含 `claude plugin validate ./plugins/curdx-flow`、`CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc` 或可测试替身，以及 release smoke tests
**And** 测试必须覆盖 validation pass/fail、installed smoke pass/fail、dependency guidance、hooks non-blocking、isolated temp workspace。

### Story 6.5: Npm Tag and Claude Plugin Tag Parity

作为发布 curdx-flow 的维护者，
我希望 release gate 同时检查 npm release tag 和 Claude plugin release tag，
以便避免只发布了 npm 包或只发布了 plugin tag，导致用户安装、依赖解析或升级路径不完整。

**Acceptance Criteria:**

**Given** 当前版本为 `X.Y.Z`
**When** release gate 计算发布 tag
**Then** npm release tag 必须为 `vX.Y.Z`
**And** Claude plugin tag 必须为 `curdx-flow--vX.Y.Z`，两者不得混用。

**Given** release gate 检查远端 tag 状态
**When** 查询 `origin` 上的 `vX.Y.Z` 和 `curdx-flow--vX.Y.Z`
**Then** 必须报告两者是否存在、是否缺一、是否都不存在、是否都已存在
**And** 只存在一个 tag 时 release verdict 必须为 `not-releasable` 或 `incomplete` blocker。

**Given** version parity 通过但 tag parity 不完整
**When** release report 生成
**Then** 报告必须说明 npm release surface 与 Claude plugin dependency surface 的差异
**And** 给出安全恢复步骤，不得建议继续发布另一个 surface 前忽略现有不完整状态。

**Given** plugin dependencies 使用版本解析
**When** release gate 检查 Claude plugin tag readiness
**Then** 必须说明 plugin dependency resolution 依赖 `{plugin-name}--v{version}` tag
**And** 缺少 plugin tag 必须阻塞 plugin release readiness。

**Given** release dry-run 模式
**When** tag parity check 执行
**Then** 只能读取本地/远端 tag 状态
**And** 不得创建、本地打 tag、推送 tag 或调用 `claude plugin tag --push`。

**Given** Story 6.5 完成
**When** 执行验证
**Then** 最小验证命令必须包含 tag parity tests 和 release dry-run tests
**And** 测试必须覆盖无 tag、只有 npm tag、只有 plugin tag、两 tag 都存在、版本/tag 不匹配、dry-run no side effect。

### Story 6.6: Two-Key Release Authorization and No-Publish Boundary

作为负责 curdx-flow 发布的维护者，
我希望真实 push、tag、npm publish 和 Claude plugin release 必须同时满足 release gate 通过与显式 release-stage 授权，
以便 dry-run 永远不会意外变成真实发布，普通验证流程也不会顺手推送或打 tag。

**Acceptance Criteria:**

**Given** release dry-run 已通过
**When** 用户没有显式 release-stage 授权
**Then** 系统不得执行 push、tag、npm publish、`claude plugin tag --push` 或任何真实发布动作
**And** report 只能输出 ready 状态和下一步命令建议。

**Given** 用户提供 release-stage 授权
**When** release gate 仍存在 blocker、missingEvidence、stale evidence 或 tag parity incomplete
**Then** 系统仍不得发布
**And** 必须说明授权存在但证据门禁未通过。

**Given** release gate 通过且用户显式授权
**When** 系统准备真实发布动作
**Then** 必须记录授权文本或授权来源、命令、风险等级、目标 version、目标 npm tag、目标 plugin tag、预期副作用
**And** 执行结果必须写入 release evidence。

**Given** 普通验证、report-only、fix mode、doctor 或 smoke 流程
**When** 这些流程触发 release checks
**Then** 它们只能执行 dry-run 或 readiness 检查
**And** 不得因为检查通过而自动执行真实发布动作。

**Given** 真实发布动作部分成功，例如 npm tag 已推但 plugin tag 失败
**When** release report 生成
**Then** 状态必须为 incomplete 或 blocked
**And** report 必须给出恢复步骤、远端 tag 状态和禁止继续假装发布完成的说明。

**Given** Story 6.6 完成
**When** 执行验证
**Then** 最小验证命令必须包含 release two-key tests、dry-run no-publish tests、partial release recovery tests
**And** 测试必须覆盖无授权、有授权但 gate fail、gate pass + 授权记录、普通流程 no-publish、partial remote tag failure。
