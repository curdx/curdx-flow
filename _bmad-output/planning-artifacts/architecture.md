---
stepsCompleted:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
  - 7
  - 8
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/project-context.md'
  - '_bmad-output/planning-artifacts/research/technical-claude-code-plugin-latest-architecture-and-release-mechanics-for-curdx-flow-optimization-research-2026-05-15.md'
  - '_bmad-output/planning-artifacts/research/last-mile-reference-synthesis-2026-05-15.md'
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2026-05-16'
project_name: 'curdx-flow'
user_name: '王定旭'
date: '2026-05-15'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## 项目上下文分析

### 需求概览

**功能需求：**
curdx-flow 的功能范围不是单一 CLI 或单一 Claude Code prompt，而是一套 Claude Code-native delivery assurance system。FR1-FR77 要求系统覆盖任务完成定义、项目识别、运行准备、真实业务流验证、browser/API/data evidence、失败恢复、report-only/fix mode、能力路由、证据报告、插件自身 release gate、执行状态恢复、能力 remediation 和 release safety。

架构必须支持以下能力域：

- 任务接入与完成定义：把用户任务转成可验证完成条件。
- 项目与运行时理解：识别项目类型、入口、服务、脚本、验证命令和 blocker。
- 基于证据的验证：生成统一 evidence block，并把关键证据带入对话或报告。
- 浏览器/API/数据流保障：证明页面、接口、后端处理、数据保存和 UI 状态一致。
- 失败恢复：捕获失败、定位层级、修复、同路径重跑、超过上限后输出 blocker。
- 运行模式与治理：支持 Personal、Team、Enterprise 模式及动作风险分级。
- 能力路由与修复：检测、调用、降级或修复 companion plugins、MCP、browser tools、Playwright、Node/package manager。
- 报告与审查：输出人类可读报告和机器可读 artifact index。
- 插件自验证与发布准备：验证 manifest、registry、hooks、version、installed smoke、tag/npm/plugin release readiness。
- 执行状态、安全与恢复：保存运行状态，支持中断恢复，避免覆盖用户改动。
- 发布安全：release dry-run 和显式 release-stage 授权。

**非功能需求：**
NFR1-NFR30 直接决定架构形态。系统必须以 no false completion 为硬门槛；hook 必须低延迟、协议干净、避免复杂推理；证据必须可追溯、可审查、可索引；本地完整 evidence 可以保留，但导出/分享必须支持摘要或脱敏；release 前必须验证 build、typecheck、hook freshness、plugin validate、installed smoke 和 version parity。

**规模与复杂度：**

- 主要技术领域：Claude Code-native developer tool / plugin runtime / delivery reliability layer。
- 复杂度级别：高；即使 MVP 是 local-first，也需要 enterprise-grade 架构纪律。
- 预计主要架构组件：12 个：
  1. Claude Code 插件产品壳
  2. Node/TypeScript CLI 与 plugin-local runtime
  3. Hook runtime 与生命周期门禁
  4. Runtime planner 与项目检测器
  5. Evidence schema 与 artifact ledger
  6. Browser/API/data verification adapters
  7. Failure recovery 与 same-path retry engine
  8. Capability doctor 与 remediation router
  9. Operating mode 与 action-risk policy
  10. Report generator 与 review surface
  11. Plugin self-validation 与 release gate
  12. Regression fixtures 与 smoke validation

### 技术约束与依赖

架构必须遵守当前仓库约束：

- `plugins/curdx-flow` 是主要交付产品面，不是 fixture。
- TypeScript source 是 canonical source；generated hook bundles 必须来自 `npm run build:hooks`。
- Claude Code 官方文档和已安装 `claude` 行为是 plugin、hooks、skills、agents、dependencies、`/goal`、MCP、Chrome 和 release 行为的事实来源。
- native `/goal` 是支持环境中的首选长任务执行驱动；hooks 是确定性门禁和状态保护，不是主续跑循环。
- hook stdout 是协议通道；诊断应写 stderr 或现有 error logging。
- 插件依赖包括 `pua`、`claude-mem`、`chrome-devtools-mcp`、`ui-ux-pro-max`；外部 MCP 包括 `context7` 和 `sequential-thinking`。
- 插件依赖与外部 MCP 必须被检测、路由、验证或明确降级；curdx-flow 不应 vendor 或重实现它们。
- push、tag、npm publish 和 plugin release 是高风险 release-stage 动作，需要明确授权和 release evidence。
- npm `vX.Y.Z` tag 与 Claude plugin `curdx-flow--vX.Y.Z` tag 是不同发布面，不能漂移。

### 跨切面关注点

- No false completion：每个完成声明都需要 evidence block 或 blocker report。
- Transcript-visible evidence：`/goal` 只能判断对话或报告摘要中可见的证据。
- 状态持久化与恢复：长验证必须能穿过上下文压缩、进程重启和部分失败。
- 用户工作区安全：generated artifacts、source edits、temp files 和用户已有改动必须可区分。
- 工具能力路由：Playwright、Chrome DevTools MCP、Claude Chrome、API checks、ui-ux-pro-max、context7、claude-mem、pua 和 sequential-thinking 需要清晰 adapter 边界。
- Hook 安全：hooks 必须快速、fail-open unless explicitly gating，并保持协议干净。
- 发布完整性：plugin manifest、registry、hook bundles、versions、marketplace trust、installed smoke 和 tag parity 必须一起治理。
- 证据隐私：本地 evidence 可以完整，导出/分享摘要不得泄露 secret、cookie、原始日志或生产数据。
- Fixture 驱动验证：MVP 架构需要真实 frontend、backend、full-stack 和 Claude Code plugin smoke fixtures。

### 架构决策边界

架构决策必须保留六条边界：

- **插件产品壳：** 面向 Claude Code 的 manifest、skills、agents、hooks、references、templates 和 plugin-local executable。
- **确定性运行时核心：** Node/TypeScript CLI/runtime 代码，负责项目检测、验证规划、状态写入、命令执行和证据输出。
- **模型驱动编排层：** skills 和 agents 负责协调工作，但不能成为完成判断的事实来源。
- **外部能力适配层：** Playwright、Chrome DevTools MCP、Claude Chrome、API checks、ui-ux-pro-max、context7、claude-mem、pua、sequential-thinking 都是可替换、可路由的能力。
- **证据与状态账本：** run records、evidence blocks、blocker reports、artifact indexes、capability status 和 release readiness 共享同一证据领域模型。
- **发布保障层：** plugin validation、installed smoke、hook freshness、version parity、dependency trust 和 npm/plugin tag parity 都是产品门禁。

### 最高风险失败模式

架构必须显式防止这些失败模式：

- hook stdout 污染或误阻塞导致 Claude Code 不可用。
- Stop hook 与 native `/goal` 形成两套互相竞争的续跑循环。
- `/goal` 无法判断完成，因为证据只存在于隐藏文件中。
- report-only 模式意外修改源码。
- fix mode 覆盖与本次任务无关的用户改动。
- Playwright、MCP 或插件依赖缺失时被静默降级为成功。
- generated hook bundles 与 TypeScript source 漂移。
- npm release 成功但 Claude plugin tag 缺失，或反过来。
- evidence artifacts 泄露 secret、cookie、原始日志或生产数据。
- 长验证在上下文压缩、会话中断或进程重启后丢状态。

### 架构影响

- `runtime planner` 必须是一等架构组件，不是普通 helper。它负责验证路径、能力路由、动作风险策略和证据要求。
- `evidence schema` 必须成为 CLI、hooks、skills、agents、reports、fixtures 和 release gates 之间的共享语言。
- `capability doctor` 必须同时暴露“已配置”和“真实可调用”，因为配置存在不等于工具能用。
- hooks 必须设计成确定性协议适配器和门禁；复杂推理、浏览器验证和修复循环应放在 hooks 之外。
- release gate 必须支持 dry-run，并且在 push、tag、publish 前要求明确 release-stage 授权。

## Starter Template Evaluation

### 主要技术领域

本项目的主要技术领域是 brownfield Claude Code plugin + Node/TypeScript CLI，不是新建 Web app、移动 app 或传统 API backend。

架构基础已经存在：

- npm package: `@curdx/flow`
- CLI source: `src/`
- Claude Code plugin product: `plugins/curdx-flow/`
- Hook source: `src/hooks/`
- Generated hook bundles: `plugins/curdx-flow/hooks/scripts/`
- Plugin manifest: `plugins/curdx-flow/.claude-plugin/plugin.json`
- Runtime executable: `plugins/curdx-flow/bin/curdx-flow`
- Tests: `tests/**/*.test.ts` and `scripts/claudecc-smoke.mjs`

### 评估过的 Starter 选项

#### 选项 1：沿用现有 brownfield foundation（选定）

现有仓库已经包含完整产品骨架：Node/TypeScript CLI、Claude Code plugin manifest、skills、agents、hooks、schemas、templates、references、plugin-local executable、hook build pipeline、version parity checks、Claude Code smoke tests。

该选项保留现有公共协议面和 release 面，适合在现有架构上重构 runtime planner、evidence schema、capability doctor、release gate 和 last-mile verification。

#### 选项 2：Claude Code 官方 plugin quickstart / 手工插件结构

官方 Claude Code plugin 文档提供 plugin 结构和 quickstart，适合从零创建简单插件或 skill。但 curdx-flow 已经远超 quickstart 范围：它需要 CLI/runtime、hook bundles、plugin dependencies、external MCP routing、evidence ledger、release parity 和 installed smoke。

该选项可作为结构校验基准，但不适合作为替换 starter。

#### 选项 3：oclif CLI starter

oclif 当前提供 `oclif generate NAME` 生成 TypeScript CLI 脚手架，适合 greenfield CLI。它会引入 oclif 命令结构、配置和生成约定。

curdx-flow 当前 CLI 已使用 `citty`，并且项目上下文明确指出 `citty` root dispatch、`check` early dispatch 等行为是仓库已知约束。切换 oclif 会带来大量无关迁移风险，不能解决 Claude Code plugin last-mile 核心问题。

#### 选项 4：通用 TypeScript/tsup/Vitest starter

通用 TS starter 可提供构建和测试基础，但 curdx-flow 已经具备这些基础。真正缺口不是 TypeScript 项目骨架，而是 evidence/state/release/plugin-runtime 架构收敛。

### 选定基础：Brownfield Foundation + Targeted Architectural Re-platforming

本项目不采用新的 greenfield starter，也不迁移到 oclif 或通用 TypeScript starter。选定现有 brownfield foundation 作为基础，但这不是“维持现状”。架构实现必须对核心产品能力做定向重平台化。

**选择理由：**

- 项目已经有可发布 npm CLI 和 Claude Code plugin 产品面。
- 新 starter 会破坏现有 command、skill、agent、hook、manifest、registry、release tag 和 smoke test 兼容性。
- PRD 目标是解决 AI 编码最后一公里，不是替换 CLI 框架。
- 架构改造应围绕现有 `plugins/curdx-flow` 产品面展开。
- Claude Code 官方 plugin docs 应作为结构和运行时验证标准，而不是引入另一个 scaffold。

**保留的基础：**

- Node 20+、TypeScript、ESM-only。
- npm + package-lock。
- `citty` CLI 现有命令分发模型。
- `tsup` CLI build。
- `esbuild` hook bundle build。
- Vitest 测试体系。
- Claude Code plugin root: `plugins/curdx-flow`。
- 现有 public skill/agent/hook/manifest/release identity。

**必须重平台化的内部能力：**

- runtime planner：从分散脚本/提示词升级为核心决策组件。
- evidence schema：从局部验证文本升级为统一领域模型。
- capability doctor：从静态检查升级为“配置存在 + 真实可调用 + 降级影响”。
- last-mile verification adapters：Playwright、Chrome DevTools MCP、API、data、UI/UX 检查统一适配。
- failure recovery：从提示词纪律升级为状态化 same-path retry 机制。
- release gate：从发布前命令清单升级为可 dry-run、可证据化、可阻塞的产品门禁。
- smoke/fixtures：从插件烟测扩展为 frontend/backend/full-stack/plugin release fixtures。

**拒绝的选项与原因：**

- Claude Code plugin quickstart：适合从零创建简单插件，不适合已有 CLI + plugin + hooks + release gate 产品。
- oclif starter：会迁移 CLI 框架但不解决 last-mile evidence 问题，且破坏现有 `citty` 约束和测试面。
- 通用 TypeScript starter：只提供基础构建/测试骨架，而这些已经存在。
- 大重写：风险集中在公共命令、插件安装态、hooks、release tag、用户状态迁移和依赖解析，不符合 no false completion 的产品目标。

**初始化命令：**

不使用新建 starter 命令。架构实现应从现有仓库开始：

```bash
npm ci
npm run build
npm run build:hooks
npm run check:hooks-fresh
npm run test:claudecc
claude plugin validate ./plugins/curdx-flow
```

**Starter 已提供的架构决策：**

**语言与运行时：**
Node 20+、TypeScript、ESM-only、npm/package-lock。

**插件产品结构：**
`plugins/curdx-flow` 作为 shipped Claude Code plugin root；`.claude-plugin/plugin.json` 只放 manifest；skills、agents、hooks、bin、schemas、templates、references 位于 plugin root。

**CLI 与运行时：**
现有 `src/` CLI、`plugins/curdx-flow/bin/curdx-flow` plugin-local executable、runtime helper 共同构成 deterministic runtime core。

**构建工具：**
`tsup` 构建 CLI；`esbuild` 通过 `npm run build:hooks` 生成 committed hook bundles。

**测试框架：**
Vitest 覆盖 hooks/analyze/runner；Claude Code plugin smoke 覆盖安装态和运行态插件行为。

**代码组织：**
保留现有 source-first 规则：TypeScript source、manifest、schemas、skills/agents/references 为源；generated hook bundles 由脚本生成，不手改。

**开发体验：**
保留现有 npm scripts、Claude Code plugin validation、installed smoke、version parity、hook freshness 和 release gate。

### 架构后果

- 后续架构决策应围绕内部模块边界和运行时合同展开，而不是围绕项目脚手架展开。
- 技术债处理必须通过可验证的 runtime contracts、schemas、tests、smoke 和 fixtures 完成。
- 依赖升级不是 starter 决策的一部分；`citty`、Vitest、TypeScript、tsup 等升级应作为单独 ADR，配套测试和 release gates。
- 第一批 implementation stories 不应是“初始化项目”，而应是“建立/重构核心架构骨架”：runtime planner、evidence schema、capability doctor、release dry-run、fixtures。

## Core Architectural Decisions

### 决策优先级分析

**已由项目基础决定，不重新决策：**

- 使用 Node 20+、TypeScript、ESM-only。
- 保留 npm + package-lock。
- 保留 `citty` CLI 分发模型。
- 保留 `tsup` CLI build 与 `esbuild` hook bundle build。
- 保留 Vitest 和 Claude Code plugin smoke 测试体系。
- 保留 `plugins/curdx-flow` 作为 shipped Claude Code plugin root。
- 保留现有 public skill、agent、hook、manifest、registry、release identity。

**阻塞实现的关键决策：**

- 决策 1：采用 evidence/state ledger 数据架构，不引入数据库。
- 决策 2：采用 native `/goal` first、hooks gate-only 的执行模型。
- 决策 3：采用 runtime planner 作为核心决策器。
- 决策 4：采用 capability adapter 模型集成 Playwright、Chrome DevTools MCP、Claude Chrome、API checks、ui-ux-pro-max、context7、claude-mem、pua、sequential-thinking。
- 决策 5：采用 release gate as product capability，而不是发布脚本清单。
- 决策 6：采用 action-risk policy 保护用户工作区和高风险动作。
- 决策 7：采用分级证据信任模型，禁止用模型自述作为完成依据。
- 决策 8：采用状态所有权模型，防止 hooks、skills、agents、runtime 争抢事实来源。
- 决策 9：采用统一 adapter contract 接入外部能力。
- 决策 10：采用 release two-key model，真实发布必须同时满足证据门禁和明确授权。
- 决策 11：采用控制面、执行面、展示面分离。
- 决策 12：采用 completion verdict model，所有验证必须输出明确裁决。

**重要但可分阶段完成的决策：**

- 前端/后端/全栈 fixtures 覆盖范围。
- report-only 报告格式和 artifact index 细节。
- 企业导出脱敏策略。
- 未来 CI、deploy、canary、channels integration。

**明确延后决策：**

- 不在本阶段切换 CLI 框架到 oclif。
- 不在本阶段升级 TypeScript 6、Vitest 4、citty 0.2、tsup 8.5。
- 不在 MVP 引入集中式 dashboard 或服务端数据库。
- 不把 `context7`、`sequential-thinking` 建模为 plugin dependencies。

### Data Architecture

**决策：使用文件型 evidence/state ledger，不引入数据库。**

curdx-flow 的数据不是业务表，而是验证状态、证据、能力状态、artifact index、失败恢复、release readiness。MVP 使用 workspace-local 文件和 plugin runtime state，避免引入数据库复杂度。

**核心数据模型：**

- Run record：一次验证运行的范围、模式、策略、目标旅程、状态。
- Evidence block：命令、服务、浏览器、API、数据、日志、截图、trace、结论。
- Blocker report：失败原因、复现路径、影响范围、已尝试动作、下一步。
- Artifact index：截图、trace、日志片段、报告、JSON evidence 的路径和摘要。
- Capability status：插件依赖、MCP、browser tools、Playwright、Node/package manager、native `/goal`。
- Release readiness：version parity、hook freshness、plugin validate、installed smoke、tag parity、dependency trust。
- Action log：自动执行动作、风险等级、结果、授权状态。

**数据持久化策略：**

- 使用 JSON/Markdown/JSONL artifact。
- 关键写入使用 atomic write。
- schema 保存在 `plugins/curdx-flow/schemas/`，TypeScript types 与 runtime guards 同步。
- 本地完整 evidence 默认 local-only。
- 导出/分享报告只输出摘要、脱敏字段和 artifact 引用。
- 状态迁移必须保留未知字段，兼容旧 `.curdx-state.json`。

**不采用：**

- 不引入 SQLite/Postgres/MongoDB 作为 MVP 状态存储。
- 不把完整日志、cookie、token、production data 默认写入 evidence。
- 不把隐藏 artifact 当作完成依据；关键摘要必须进入 transcript 或报告。

### Authentication & Security

**决策：不设计传统用户登录系统，采用本地动作安全和能力信任边界。**

curdx-flow 是本地 Claude Code plugin/CLI 产品，不需要 Web app authentication。安全重点是本地文件、命令执行、MCP 信任、插件依赖、hook 协议、高风险动作和证据隐私。

**安全模型：**

- 动作按低/中/高风险分级。
- report-only 模式禁止源码修改。
- fix mode 可以修改代码，但必须记录动作、风险和证据。
- push、tag、npm publish、plugin release、destructive migration、全局配置变更必须显式授权或 release-stage 上下文。
- 自动安装/启用能力必须记录范围、结果和失败补救。
- 工作区已有改动必须识别，禁止回滚或覆盖无关用户改动。
- evidence 默认不得输出 secret、cookie、token、完整数据库 dump、生产数据。

**能力信任边界：**

- `pua`、`claude-mem`、`chrome-devtools-mcp`、`ui-ux-pro-max` 是 plugin dependencies。
- `context7`、`sequential-thinking` 是 expected external MCP。
- 外部能力必须检测、验证可调用性、记录降级影响。
- 不 vendor、不重实现这些能力。
- 不把外部 MCP 写成 plugin dependencies。
- 不在 plugin-local `.mcp.json` 中静默配置外部 MCP。

### API & Communication Patterns

**决策：采用 CLI/plugin/hook/runtime contract，而不是 HTTP API。**

curdx-flow 的 API surface 是 Claude Code plugin + local CLI + hook protocol + artifact schema 的组合。

**主要通信面：**

- Claude Code skills：用户入口，如 last-mile validation、report-only、fix mode、doctor、release gate。
- Plugin-local executable：`plugins/curdx-flow/bin/curdx-flow` 作为 installed plugin runtime。
- npm CLI：`@curdx/flow` 用于安装、更新、状态、doctor、分析、发布前验证。
- Hooks：Stop、TaskCompleted、PostToolBatch 等作为确定性门禁和上下文注入。
- JSON artifacts：runtime planner、evidence block、blocker report、capability doctor、release readiness。
- Human-readable Markdown reports：供用户、QA、技术负责人审查。

**执行模型：**

- native `/goal` 是支持环境中的长任务驱动。
- Stop hook 不做主续跑循环，只做 gate、cleanup、evidence check。
- TaskCompleted/PostToolBatch 可用于缺证据阻断或状态保护。
- `/goal` 条件必须包含 transcript-visible evidence 要求。
- `/goal` 不可用时进入 manual/resumable fallback。

**错误处理标准：**

- 每个失败都必须归类：环境、依赖、前端、后端、接口、数据、浏览器能力、外部服务、release gate。
- 每个 blocker 都必须包含可执行下一步。
- 能力缺失不得静默降级为成功。
- hook stdout 只输出协议 JSON；诊断走 stderr/log。

### Frontend Architecture

**决策：curdx-flow 自身不建设 Web UI；前端相关能力属于目标项目验证适配器。**

curdx-flow 的 MVP 不做 dashboard、Web app 或视觉产品界面。前端架构重点是验证目标项目的页面、交互、样式、响应式和接口联调。

**浏览器验证架构：**

- Playwright/project E2E：可复跑验收和长期回归。
- Chrome DevTools MCP：真实浏览器现场诊断，覆盖 console、network、DOM/CSS、performance、screenshot。
- Claude Chrome beta：用户真实浏览器和登录态辅助验证；不能作为唯一 release gate。
- ui-ux-pro-max：视觉、交互、响应式和可用性检查。

**前端证据要求：**

- 页面 URL 和访问结果。
- 用户操作路径。
- console/network 摘要。
- API 请求和响应摘要。
- UI 状态截图或 trace。
- 数据保存或状态变化证明。
- 未验证范围和 blocker。

**延后：**

- 不在 MVP 做集中式团队 dashboard。
- 不把 Chrome beta 当作唯一可复跑证据。
- 不为 curdx-flow 自身设计传统响应式 UI。

### Infrastructure & Deployment

**决策：发布保障是产品门禁，release dry-run 是一等能力。**

curdx-flow 的部署面是 npm package + Claude Code plugin marketplace/tag + GitHub release。release 不是单个命令成功，而是一组证据通过。

**发布面：**

- npm package：`@curdx/flow`
- npm tag：`vX.Y.Z`
- Claude plugin tag：`curdx-flow--vX.Y.Z`
- Plugin root：`plugins/curdx-flow`
- Marketplace trust：repo-root `.claude-plugin/marketplace.json`
- Plugin validation：`claude plugin validate ./plugins/curdx-flow`
- Installed smoke：`CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc`
- Local gate：`npm run verify`

**release gate 必须检查：**

- version parity。
- hook source 与 generated bundles freshness。
- plugin manifest 和 registry alignment。
- dependency trust allowlist。
- external MCP degradation behavior。
- installed plugin smoke。
- npm tag 与 plugin tag parity。
- release-stage 授权。
- dry-run 结果。

**CI/CD 决策：**

- MVP 不把 CI 平台作为前提。
- 本地 release-quality gate 必须强于 CI 假设。
- CI、deploy、canary、channels integration 作为 post-MVP 扩展。

### Evidence Trust Model

**决策：完成判断采用分级证据信任模型。**

不是所有证据都等价。架构必须区分证据等级，并把“完成”绑定到足够等级的证据组合。

**证据等级：**

- L0 Self-report：模型或 agent 自述完成。不能作为完成依据。
- L1 Static evidence：代码 diff、文件存在、类型检查、lint、build。只能证明静态可构建。
- L2 Runtime evidence：命令执行、服务启动、health check、API response、exit code。
- L3 User-journey evidence：真实页面/API路径、用户操作、数据保存、UI 回显、same-path retry。
- L4 Release evidence：installed plugin smoke、plugin validate、version/tag parity、dependency trust、release dry-run。

**完成规则：**

- 普通 CLI/library 任务至少需要 L1 + L2。
- 前端/全栈任务必须需要 L2 + L3，除非存在明确 blocker。
- bug fix 必须包含失败前复现和修复后 same-path retry。
- release 任务必须需要 L4。
- L0 永远不能让任务完成。

### State Ownership Model

**决策：状态所有权必须分层，避免 hooks、skills、agents、runtime 争抢事实来源。**

**状态所有权：**

- Runtime core 拥有 run state、evidence ledger、capability status、release readiness。
- Hooks 只能读取状态、写入轻量 gate/snapshot/context，不拥有复杂业务状态。
- Skills 负责协调流程和展示指令，不直接成为事实来源。
- Agents 只能提交 marker、artifact 和 evidence claim；claim 必须被 runtime 或 coordinator 验证。
- Reports 是状态和证据的投影，不是新的事实来源。

**后果：**

- `.curdx-state.json`、evidence artifacts、artifact index、release readiness 必须通过统一 runtime/state helper 写入。
- agent marker 不能直接更新 completion state。
- hook 对状态写入必须保持原子、低延迟、可失败恢复。

### Adapter Contract Model

**决策：所有外部能力通过统一 adapter contract 接入。**

每个 adapter 至少声明：

- capability id
- availability check
- callability check
- required inputs
- evidence output shape
- blocker output shape
- degradation behavior
- privacy/sensitivity notes
- retry safety
- mode compatibility：report-only / fix mode / release mode

**适配器分类：**

- Command adapter：npm scripts、build、test、lint、curl。
- Service adapter：dev server、health check、port/process management。
- Browser adapter：Playwright、Chrome DevTools MCP、Claude Chrome。
- API/data adapter：HTTP/API checks、contract tests、DB/status/data verification。
- Intelligence adapter：context7、claude-mem、pua、sequential-thinking。
- UX adapter：ui-ux-pro-max。
- Release adapter：plugin validate、installed smoke、version parity、tag parity、dependency trust。

### Release Two-Key Model

**决策：release 行为采用 two-key model。**

release dry-run 可以自动执行，但真实 push、tag、npm publish、plugin release 必须同时满足：

- release gate 通过；
- 用户显式 release-stage 授权。

**原因：**
release 是高风险不可逆动作，且 npm `vX.Y.Z` 与 Claude plugin `curdx-flow--vX.Y.Z` 是不同发布面。单个 tag 成功会造成不完整发布。

**后果：**

- 普通验证流程不能顺手 push/tag/publish。
- release gate 输出只能给出 ready/not-ready 和下一步命令。
- 真实 release 执行必须记录授权、命令、结果、远端 tag parity 和 npm/plugin 可用性。

### Control Plane and Execution Plane Model

**决策：控制面、执行面、展示面必须分离。**

- 控制面：runtime planner、capability doctor、mode policy、action-risk policy、release gate，负责决策和门禁。
- 执行面：command、service、browser、API/data、intelligence、UX、release adapters，负责执行动作并返回结构化结果。
- 展示面：skills、agents、reports，负责协调、解释和呈现，不拥有事实来源。

### Completion Verdict Model

**决策：所有验证必须输出明确 verdict。**

允许的最终结论：

- `complete`：证据等级满足任务类型。
- `blocked`：无法继续，包含原因、复现路径和下一步。
- `partial`：部分路径通过，但关键范围未验证。
- `manual-confirmation-required`：自动证据不足，需要人确认。
- `release-ready`：发布门禁全部通过且具备 release-stage 授权。

### Runtime Boundary Hardening

**决策：planner 做薄，schema 做稳，hooks 做窄。**

- `runtime planner` 只读取 goal/state/evidence/policy/capability status，输出下一步计划、所需证据和 verdict 输入；不直接执行工具，不拥有 evidence 真相，不替代 adapter。
- `evidence schema` 只表达事实、来源、信任等级、artifact 引用、时间和关联目标；不表达完整工作流。
- `hooks` 只做生命周期门禁、轻量检查、阻断高风险动作、补充被动 evidence 和提示缺口；不主动规划、不长时间执行验证、不调用外部 MCP。
- `/goal` 是长任务控制面；没有 hooks 时，主流程必须仍能通过 manual/resumable fallback 运行。
- 失败结果也是一等 evidence，不只记录成功证据。
- evidence 必须有 freshness/expiry 策略；过期证据不能支持 release verdict。

### User-Facing Verdict & Evidence Experience Model

**决策：所有 planner、adapter、hook、release gate 的结果必须汇聚成人类可读 verdict。**

Verdict 必须包含：

- `status`: `complete | blocked | partial | needs-human-confirmation | releasable | not-releasable`
- `plainLanguageSummary`: 用户能读懂的一句话结论
- `why`: 判定原因
- `evidence`: 支撑证据列表
- `missingEvidence`: 缺失证据
- `nextAction`: 下一步动作
- `owner`: `agent | user | external-system`
- `riskLevel`: `low | medium | high | destructive`
- `confidence`: `verified | inferred | unverified`

每次 run 应生成：

- `report.md`: 给人看的摘要
- `report.json`: 给 CLI/plugin 读的结构化结果
- `evidence/`: 截图、命令输出、API 响应、测试结果、浏览器验证结果

报告顶部必须回答：

- 现在完成了吗？
- 如果没完成，卡在哪里？
- 哪些东西真实验证过？
- 哪些只是模型判断？
- 能不能发布？
- 下一步谁负责？

### Degraded Mode Experience

**决策：能力降级可以继续工作，但不能伪装成完整验证。**

当 `chrome-devtools-mcp`、Playwright、Claude Chrome、context7、pua、claude-mem、ui-ux-pro-max 或 sequential-thinking 不可用时，系统必须输出：

- 哪个能力不可用
- 原本要验证什么
- 已启用什么 fallback
- fallback 的可信度下降在哪里
- 是否需要人工确认
- 是否禁止完成或发布

### Mode State Contract

**决策：用户必须能看懂当前系统状态来源。**

每次状态展示必须包含：

- 当前模式：`goal-running | verifying | blocked | waiting-human | release-gate | idle`
- 当前权威状态来源：`/goal | curdx-ledger | hook | release-gate`
- 最近一次状态变更时间
- 当前用户可执行动作

### Architecture Contract Matrix

**决策：每个核心架构决策必须映射到 schema、TypeScript 边界和 contract test。**

| Decision | Schema | Type Boundary | Required Test |
|---|---|---|---|
| Evidence Trust Model | `evidence.schema.json` | `src/runtime/evidence/types.ts` | `tests/contracts/evidence-ledger.test.ts` |
| State Ownership Model | `state-ledger.schema.json` | `src/runtime/state/types.ts` | `tests/contracts/state-ownership.test.ts` |
| Adapter Contract Model | `adapter-result.schema.json` | `src/runtime/adapters/types.ts` | `tests/contracts/adapter-contract.test.ts` |
| Completion Verdict Model | `completion-verdict.schema.json` | `src/runtime/verdict/types.ts` | `tests/contracts/completion-verdict.test.ts` |
| Action-Risk Policy | `action-risk-policy.schema.json` | `src/runtime/policy/types.ts` | `tests/contracts/action-risk-policy.test.ts` |
| Release Two-Key Model | `release-verdict.schema.json` | `src/runtime/release/types.ts` | `tests/contracts/release-two-key.test.ts` |
| Hooks Gate-Only | `hook-gate.schema.json` | `src/hooks/*` | `tests/hooks/gate-only.test.ts` |

### Architecture Glossary

| 术语 | 定义 | 不是 |
|---|---|---|
| Evidence | 可复查的运行证据，如命令输出、HTTP 响应、截图、测试结果、日志摘要 | agent 的口头声明 |
| State Ledger | 文件型状态账本，记录当前 goal、阶段、证据索引、verdict、阻塞项 | 随意追加的日志文件 |
| Evidence Ledger | 证据账本，保存证据元数据、来源、信任等级、时间、校验信息 | 大段原始输出堆积 |
| Native `/goal` First | 优先使用 Claude Code 原生 goal 能力承载任务状态 | 自建一套平行任务系统 |
| Hooks Gate-Only | hooks 只做拦截、校验、提示、阻断，不承担主流程编排 | hooks 里写完整 planner |
| Runtime Planner | 运行时决策器，读取 state/evidence/policy 后决定下一步 | 普通 prompt 模板 |
| Adapter | 对外部能力的薄封装，统一输入、输出、错误和证据格式 | 把第三方工具逻辑复制进插件 |
| Completion Verdict | 对“是否真的完成”的结构化裁决 | 简单的“完成了”文本 |
| Release Two-Key | 发布需要实现证据和发布授权两类独立确认 | 两个人手动点确认才算 |
| Control Plane | 目标、策略、状态、裁决所在层 | 具体执行命令的地方 |
| Execution Plane | shell、MCP、浏览器、测试、构建等执行层 | 决策来源 |
| Display Plane | 给用户看的摘要、报告、状态视图 | 可修改真实状态的入口 |

### Architecture Test Contract Matrix

**决策：每个核心架构组件必须有对应测试合同。**

- evidence schema：schema validation、旧状态兼容、未知字段保留、invalid JSON。
- adapters：availability、callability、success evidence、blocker output、degradation behavior。
- hooks：stdout/stderr、exit code、fail-open、gate block。
- runtime planner：任务类型、能力状态、模式策略到验证计划的映射。
- mode policy：report-only 不改源码；fix mode 记录动作和重跑。
- release gate：dry-run 不发布；two-key 缺一不可。
- fixtures：frontend、backend、full-stack、Claude plugin release smoke。

### Requirement-to-Architecture Traceability

**决策：FR/NFR 必须追踪到架构组件。**

- FR1-FR5 -> completion verdict、evidence trust、runtime planner。
- FR6-FR11 -> project detector、runtime planner、service adapters。
- FR12-FR18 -> evidence schema、artifact ledger、report generator。
- FR19-FR26 -> browser/API/data adapters。
- FR27-FR32 -> failure recovery、same-path retry。
- FR33-FR40 -> mode policy、action-risk model。
- FR41-FR46 -> capability doctor、adapter registry。
- FR47-FR52 -> reports、artifact index。
- FR53-FR59、FR76-FR77 -> release gate、two-key model。
- FR60-FR75 -> state ownership、run records、gap handling。
- NFR1-NFR30 -> hook safety、privacy、compatibility、auditability、maintainability gates。

### Agent Consumption Contract

后续 implementation agent 必须把 Step 4 视为可执行架构合同。

每个新增 feature、command、hook、adapter 或 release check 都必须说明：

- 它实现哪个架构决策。
- 读取或写入哪些 state ledger 字段。
- 创建哪些 evidence 条目。
- 适用哪个 risk policy。
- 会影响哪些 completion verdict 字段。
- 哪些测试证明合同仍成立。

Agents 不得引入平行状态系统、未记录的 evidence 格式、hook-driven orchestration，或 display-plane 直接状态写入。

### Decision Impact Analysis

**实施顺序：**

1. 定义 evidence schema / state ledger / artifact index。
2. 建立 runtime planner 组件边界。
3. 建立 capability doctor，覆盖 plugin dependencies、external MCP、browser tools、Playwright、Node/npm、native `/goal`。
4. 建立 verification adapters：command、service、browser、API、data、UI/UX。
5. 建立 failure recovery 和 same-path retry 状态机。
6. 建立 report-only / fix mode 的动作边界。
7. 建立 release dry-run / release gate。
8. 扩展 fixtures 与 installed-plugin smoke。
9. 更新 skills/agents/references，把提示词纪律收敛到 runtime contracts。

**跨组件依赖：**

- runtime planner 依赖 capability doctor 和 evidence schema。
- failure recovery 依赖 evidence block、blocker report 和 run state。
- `/goal` bridge 依赖 transcript-visible evidence summary。
- hooks 依赖 state ledger，但不能承担复杂推理。
- release gate 依赖 plugin metadata、version parity、hook freshness、dependency trust 和 smoke artifacts。
- reports 依赖 artifact index 和 evidence schema。
- fixtures 反向验证 runtime planner、adapters、failure recovery 和 release gate。

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:**

本项目有 48 个以上潜在实现冲突点，分布在 naming、structure、format、communication、process、runtime boundary、frontend/full-stack verification、release safety 八类。Step 5 的目标不是写普通代码风格指南，而是定义后续 AI agents、skills、hooks、runtime、adapters、release gate 必须共同遵守的实现合同。

核心原则：

- runtime 是事实来源，schema 是合同，evidence 是完成依据。
- `/goal` 是长任务控制入口，hooks 是生命周期门禁，不是主流程。
- adapters 执行动作并标准化结果，不做最终完成或发布判定。
- reports 是 evidence/state 的人类可读投影，不是新的事实来源。
- 任何完成声明都必须引用新鲜、可追踪、可见的 evidence。

### Rule ID Pattern

所有一致性规则必须使用稳定 ID，格式为 `IP-AREA-NNN`。

示例：

- `IP-ARCH-001`: 架构边界规则。
- `IP-EVIDENCE-001`: evidence 规则。
- `IP-HOOK-001`: hook 规则。
- `IP-ADAPTER-001`: adapter 规则。
- `IP-UI-001`: 前端/全栈验证规则。
- `IP-REL-001`: release gate 规则。

后续 story、code review、blocker、contract test 和 report 必须引用这些 rule id。没有 rule id 的约束只能算说明性文档，不能作为实现验收合同。

### Naming Patterns

**IP-NAME-001 Product Identity:**

- npm package 固定为 `@curdx/flow`。
- Claude Code plugin name 固定为 `curdx-flow`。
- shipped plugin root 固定为 `plugins/curdx-flow`。
- npm release tag 使用 `vX.Y.Z`。
- Claude plugin release tag 使用 `curdx-flow--vX.Y.Z`。
- 不得把 npm tag 与 Claude plugin tag 当成同一个发布面。

**IP-NAME-002 File and Directory Naming:**

- 新增源文件默认使用 kebab-case，例如 `evidence-ledger.ts`、`release-gate.ts`。
- TypeScript 类型使用 PascalCase，例如 `EvidenceBlock`、`CompletionVerdict`。
- 函数和变量使用 camelCase，例如 `createEvidenceBlock()`、`runId`。
- JSON/schema 字段使用 camelCase。
- schema 文件使用 kebab-case + `.schema.json`，例如 `completion-verdict.schema.json`。
- skill、agent、hook、reference 文件名保持 kebab-case。
- 已存在的非 kebab-case 文件不为命名统一而单独重命名，避免无价值 churn。

**IP-NAME-003 Capability and Evidence IDs:**

- capability id 使用稳定分层命名，例如 `browser.playwright`、`browser.chromeDevtoolsMcp`、`release.pluginValidate`。
- evidence id 使用稳定前缀，例如 `ev-build-*`、`ev-browser-*`、`ev-api-*`。
- artifact 路径默认 workspace-relative；可分享报告不得暴露无必要的绝对路径、secret、cookie、token 或生产数据。

### Structure Patterns

**IP-FILE-001 Boundary Lock:**

- `plugins/curdx-flow/**` 是 Claude Code plugin 产品面。
- `src/**` 是 CLI/runtime/hook TypeScript 源码面。
- `src/registry/**` 是 installer、plugin dependency、MCP 和 capability 声明面。
- `src/hooks/**` 是 hook 源码面。
- `plugins/curdx-flow/hooks/scripts/**` 是 generated hook artifact 面。
- `plugins/curdx-flow/schemas/**` 是跨 runtime、hook、skill、report 的 schema 合同面。
- 跨边界修改必须同步 manifest、registry、schemas、tests、generated artifacts 和 smoke coverage。

**IP-FILE-002 Source-First Generated Artifacts:**

- CLI bundle `dist/index.mjs` 只能由 `npm run build` 生成。
- hook bundles 只能由 `npm run build:hooks` 生成。
- 禁止手改 `plugins/curdx-flow/hooks/scripts/**`。
- 修改 `src/hooks/**` 后必须运行 `npm run build:hooks` 和 `npm run check:hooks-fresh`。

**IP-ARCH-001 Runtime Module Ownership:**

后续实现应按以下 ownership 组织 runtime 代码：

- `src/runtime/planner/`: 读取 goal/state/evidence/policy/capability status，输出计划、证据要求和 verdict 输入；不直接执行工具。
- `src/runtime/evidence/`: evidence ledger、artifact index、trust level、freshness。
- `src/runtime/state/`: run state、mode state、atomic write、migration。
- `src/runtime/adapters/`: command、service、browser、api-data、intelligence、ux、release adapters。
- `src/runtime/capabilities/`: availability、callability、degradation、remediation。
- `src/runtime/policy/`: action-risk、mode policy、release two-key。
- `src/runtime/verdict/`: completion verdict 和 release verdict evaluator。
- `src/runtime/reports/`: `report.md`、`report.json`、artifact summary。

**IP-ARCH-002 State Ownership:**

- Runtime Planner 拥有计划状态。
- Evidence Ledger 拥有证据状态。
- Adapter 只拥有外部能力调用结果。
- Hook 只拥有本次生命周期拦截结论。
- Release Gate 只拥有发布判定。
- Skill/agent 只能协调、展示、提交 claim/marker，不得直接写 completion state。

任何模块不得写入不属于自己的状态。跨边界状态必须通过 schema/type/guard 和统一 state helper 写入。

### Format Patterns

**IP-SCHEMA-001 Schema First:**

Planner 输出、adapter 调用结果、hook 判定、evidence block、state ledger、completion verdict、release verdict 都必须有显式 schema 或等价 TypeScript 边界。跨边界数据不得依赖自然语言段落解析。

**IP-SCHEMA-002 Type and Schema Alignment:**

schema、TypeScript type、runtime guard、test fixture 必须一一映射。修改 schema 时必须同步更新：

- `plugins/curdx-flow/schemas/**`
- `src/runtime/**/types.ts`
- runtime validation helpers
- `tests/contracts/**`
- shipped skill/reference 文档中引用的字段说明

**IP-EVIDENCE-001 Evidence Block Shape:**

每条 evidence 至少包含：

- `schemaVersion`
- `id`
- `runId`
- `goalId`
- `source`
- `capabilityId`
- `trustLevel`: `L1 | L2 | L3 | L4`
- `status`: `passed | failed | blocked | degraded | inconclusive`
- `summary`
- `artifacts`
- `startedAt`
- `completedAt`
- `freshness`
- `privacy`
- `redactions`

时间统一使用 ISO 8601 字符串。没有 artifact、命令输出、截图、trace、日志摘要、schema 校验结果或其他可复查来源的模型总结不得计入 evidence ledger。

**IP-EVIDENCE-002 Append-Only Ledger:**

Evidence Ledger 必须追加式写入。禁止覆盖历史证据；修复、重跑、回滚都必须追加新 evidence，并通过 `supersedes`、`relatedEvidenceIds` 或等价字段关联旧证据。

**IP-EVIDENCE-003 Freshness Contract:**

证据必须记录 freshness 信息，例如：

- `commandHash`
- `targetHash`
- `commitHash`
- `environmentId`
- `expiresAt`
- `validatedAt`

过期证据不得支撑 `complete`、`release-ready` 或 `releasable` verdict。release gate 必须拒绝过期或目标不匹配的 evidence。

**IP-ADAPTER-001 Adapter Result Shape:**

adapter 返回统一结构：

- `ok`
- `status`
- `capabilityId`
- `inputs`
- `evidence`
- `blockers`
- `artifacts`
- `diagnostics`
- `retryable`
- `confidence`
- `durationMs`

外部工具失败不能返回成功空对象，必须转成 blocker 或 degraded evidence。

**IP-BLOCKER-001 Blocker Shape:**

blocker 必须包含：

- `code`
- `category`: `environment | dependency | frontend | backend | api | data | browser | externalService | releaseGate | permission | unknown`
- `message`
- `reproduction`
- `attemptedActions`
- `nextAction`
- `owner`: `agent | user | external-system`
- `riskLevel`
- `evidenceRefs`

没有 next action 的失败报告不合格。

### Communication Patterns

**IP-GOAL-001 Native Goal First:**

支持 native `/goal` 的环境中，用户可见的长任务交付流程必须优先从 `/goal` 进入。skills、agents、hooks、templates 只能作为 `/goal` 调用链中的能力、检查点或 fallback，不得定义并行主流程。

**IP-GOAL-002 Transcript-Visible Evidence:**

`/goal` evaluator 只能判断对话或报告中可见的证据。关键完成证据不能只藏在 hidden artifact 文件中；报告必须包含 evidence digest、缺失证据和 verdict 摘要。

**IP-HOOK-001 Gate Only:**

hooks 只能做生命周期门禁、轻量检查、阻断高风险动作、补充被动 evidence、提示缺口。禁止 hook：

- 启动长任务；
- 运行 Playwright；
- 启动 dev server；
- 调用外部 MCP；
- 执行模型推理；
- 自动修复源码；
- 承担 planner 决策；
- 执行 release gate。

**IP-HOOK-002 Stdout/Stderr Contract:**

hook stdout 只输出 Claude Code 可消费的结构化协议 JSON；diagnostics、debug、warning、异常信息写 stderr 或 runtime log。禁止在 stdout 混入 debug 文本、ANSI 装饰或长篇解释。

**IP-HOOK-003 Runtime Budget:**

每个 hook 必须定义 runtime budget、timeout 行为、失败策略和降级报告。默认 hooks fail-open；只有明确 gate 场景可以 block，并且必须输出结构化原因和下一步。

**IP-COMM-001 Event Naming:**

内部事件使用 lower dot-case，例如：

- `evidence.created`
- `verdict.updated`
- `capability.degraded`
- `release.gateFailed`

事件 payload 使用 camelCase，并包含 `schemaVersion`、`runId`、`timestamp`。

### Process Patterns

**IP-TEST-001 Contract First:**

runtime planner、evidence ledger、adapter、release gate、hook gate 的输入输出必须先落到 schema 或 TypeScript contract，再写 contract tests。没有 schema/test 的行为不能作为完成项。

**IP-TEST-002 Targeted Before Full Gate:**

实现验证必须先跑最小相关命令，再跑更大 gate。示例：

- hook 改动：`npm run build:hooks`、`npm run check:hooks-fresh`、相关 `npm run test:hooks`。
- registry/capability 改动：`npm run test:runner`、`npm run check-versions`。
- analyze 改动：`npm run test:analyze`。
- plugin 行为改动：`npm run test:claudecc`、`claude plugin validate ./plugins/curdx-flow`。
- 发布前：`npm run verify` 外加 plugin validation、installed smoke、tag parity。

失败输出必须绑定到修复项和 same-path retry。

**IP-DIRTY-001 Dirty Worktree Safety:**

修改前必须识别已有变更。不得 revert、覆盖或格式化与当前 goal 无关的用户改动。generated artifact 变更必须说明来源命令。release 前必须确认 dirty worktree 只包含本次预期变更。

**IP-MODE-001 Report-Only and Fix Mode:**

- report-only 模式禁止源码修改。
- fix mode 可以修改源码，但必须记录目标文件范围、变更意图、风险等级、diff 摘要和验证命令。
- release gate 禁止顺手修业务代码；release dry-run 只能报告 readiness。

**IP-RETRY-001 Same-Path Retry:**

bug fix 或失败恢复后，必须沿失败前同一入口、同一用户动作、同一接口或同一命令重跑。换路径、换 mock、跳过失败步骤必须标记为 degraded，不得改写为成功。

**IP-CAPABILITY-001 Callability Matrix:**

每个能力必须拆分并记录：

- `configured`
- `installed`
- `callable`
- `authorized`
- `degraded`
- `unavailable`

只有 `callable` 且满足授权和预算的能力才能支持完整完成裁决。`installed` 或 manifest 中存在不等于可用。

**IP-ADAPTER-002 Adapter Non-Negotiables:**

任何 adapter 不满足以下内容不得合并：

- availability check
- callability check
- typed input
- typed result
- success evidence output
- blocker output
- degradation explanation
- retry safety
- privacy classification
- contract test

**IP-ADAPTER-003 Adapter Has No Business Verdict:**

Adapter 只负责调用外部能力、标准化返回、记录失败原因和输出 evidence/blocker。它不得决定任务是否完成、是否发布、是否降级目标，也不得修改 planner state。

### Frontend and Full-Stack Verification Patterns

**IP-UI-001 Journey Evidence:**

前端/全栈任务必须以用户旅程为验证单位。每个旅程至少声明：

- 入口页面或服务地址；
- 用户动作序列；
- 期望 UI 状态；
- 期望 API 请求和响应；
- 期望数据落点或持久化状态；
- 证据 artifact；
- 剩余风险。

不能只说“测试通过”或“页面能打开”。

**IP-UI-002 Screenshot or Trace Required:**

涉及 UI 的改动，报告必须至少包含核心状态截图；涉及多步操作、表单、导航、异步请求、登录态、保存动作的改动，应优先提供 Playwright trace。截图必须覆盖实际变更区域，不接受空白页、终端截图或无关首页冒充 UI evidence。

**IP-UI-003 Visual State Matrix:**

核心页面或组件应检查关键边界状态：

- loading
- success
- empty
- error
- disabled
- validation failed
- submitting
- success-after-submit

无法触发的状态必须写明原因和剩余风险。

**IP-UI-004 Observable Styling Standard:**

“样式无问题”必须有可观察标准：

- 无明显重叠；
- 无文字截断；
- 无横向溢出；
- 按钮和输入框可点击、可聚焦；
- 移动端主流程可完成；
- 关键内容不被固定头尾遮挡；
- console 无相关运行时错误。

禁止用“看起来正常”替代 evidence。

**IP-UI-005 UI/API/Data Closure:**

任何创建、更新、删除、提交、同步类操作，必须证明：

- UI 显示成功；
- 对应 API 返回成功且响应体符合预期；
- 刷新页面、重新查询或读取数据后仍一致。

只验证前端状态不算全栈完成。

**IP-UI-006 API Evidence Bound to User Action:**

报告里的接口请求必须绑定用户动作，例如“点击 Save 后发起 `PATCH /api/profile`，返回 200，随后 `GET /api/profile` 读回新值”。孤立 curl、mock 请求或人工构造响应不能单独支撑用户旅程完成。

**IP-UI-007 Mock Is Degraded Evidence:**

mock、fixture、stub、dev-only data 必须标记为 degraded evidence。mock 可以证明交互形态，不能证明真实全栈完成。

### Release and Verification Patterns

**IP-REL-001 Release Two-Key Enforcement:**

release dry-run 可以自动执行。真实 push、tag、npm publish、Claude plugin release 必须同时满足：

- release gate 通过；
- 用户显式 release-stage 授权。

普通验证流程不能顺手发布。

**IP-REL-002 Release Evidence:**

打 tag 或发布前报告必须列出：

- version；
- npm tag；
- Claude plugin tag；
- version parity 结果；
- hook freshness 结果；
- plugin validation 结果；
- installed smoke 结果；
- dependency trust 结果；
- tag parity 检查；
- 失败重试记录；
- 最终 git diff 摘要。

没有这组证据不得推送 tag 或 publish。

**IP-REL-003 Release Gate Reads Evidence:**

Release Gate 不重新实现核心验证逻辑。它读取 Evidence Ledger、manifest/version 信息、dependency trust、tag parity、installed smoke 和 release policy，判断证据是否足够、新鲜、一致。

### Report and Verdict Patterns

**IP-REPORT-001 One-Glance Verdict:**

所有报告顶部必须一眼回答：

- 现在完成了吗？
- 真实验证了什么？
- 缺什么证据？
- 哪些能力降级？
- 下一步谁负责？
- 能不能发布？

**IP-REPORT-002 Verdict Values:**

面向用户的 verdict 使用统一状态：

- `passed`
- `failed`
- `blocked`
- `auto-recovered`
- `needs-user-input`
- `partial`
- `release-ready`
- `not-releasable`

内部 completion verdict 仍保留 Step 4 定义的 `complete | blocked | partial | manual-confirmation-required | release-ready`，报告层负责映射为用户可读状态。

**IP-REPORT-003 Reviewer Readability:**

最终报告必须按 journey、acceptance criteria、command、artifact 分组，明确哪些通过、哪些降级、哪些未验证。禁止只输出“全部完成”式总结。

**IP-REPORT-004 No User Guesswork:**

如果需要用户自己找端口、判断页面是否正常、拼接口请求、检查数据是否保存、查日志定位失败，则 workflow 未完成，最多只能给 `partial`、`blocked` 或 `needs-user-input`。

### Enforcement Guidelines

**All AI Agents MUST:**

- 引用适用的 `IP-*` 规则。
- 先读 schema/architecture/context，再新增状态或 evidence 字段。
- 新增跨边界数据必须同步 schema、type、guard、fixture、contract test。
- 新增 adapter 必须实现 availability、callability、typed result、evidence、blocker、degradation、privacy、retry safety。
- 新增 hook 行为必须证明 stdout/stderr、exit code、budget、fail-open/gate 行为。
- 新增 release 行为必须通过 two-key model。
- 不得手改 generated hook bundles。
- 不得把 hidden-only artifact 当完成依据。
- 不得把模型自述当完成 evidence。

**Implementation Agent Pre-Completion Checklist:**

每个 implementation story 完成前必须回答：

- 我实现了哪些 `IP-*` 规则？
- 我新增、读取或写入哪些 schema 字段？
- 我产生了哪些 evidence？
- evidence 是否新鲜，是否可见？
- 哪些能力降级了？
- 是否执行了 same-path retry？
- 当前 verdict 是什么？
- 哪些测试证明它不是自述完成？
- 用户现在能否少做一件原本必须手工做的事？

**Pattern Enforcement:**

- 违反规则应记录为 blocker、architecture debt 或 test failure。
- 修改这些模式必须同时更新 `architecture.md`、相关 schema、tests 和 shipped skill/reference 文档。
- 没有测试的规则只能算文档，不算实现验收。

### Pattern Examples

**Good Examples:**

- `src/runtime/evidence/evidence-ledger.ts` 写入 `EvidenceBlock`，并由 `tests/contracts/evidence-ledger.test.ts` 验证。
- `browser.chromeDevtoolsMcp` 不可用时返回 degraded blocker，说明失去 console/network/DOM 现场诊断。
- full-stack 新增用户流程保存页面截图、POST 响应摘要、后端日志摘要、刷新后数据回显证明。
- release dry-run 输出 `release-ready` 或 `not-releasable`，但不自动 push/tag/publish。
- hook 缺证据时输出结构化 gate reason，同时 diagnostics 写 stderr。

**Anti-Patterns:**

- hook 里长时间运行 Playwright 或调用外部 MCP。
- adapter 返回空成功对象。
- agent 说“完成了”但没有 build、runtime、browser/API/data evidence。
- report-only 模式偷偷改源码。
- Playwright 或 Chrome DevTools MCP 缺失时宣称完整前端验证。
- mock 数据被写成真实持久化成功。
- npm tag 已推但 Claude plugin tag 未推，或版本不一致。
- release dry-run 自动变成真实 push/tag/publish。
- 覆盖历史 evidence，导致失败路径不可追踪。
- 无 schema 的跨模块 JSON 被自然语言解析驱动。

## Project Structure & Boundaries

### Why This Structure Exists

curdx-flow 是 brownfield Claude Code plugin + Node/TypeScript CLI。Step 6 的结构目标不是重建项目，而是在保留现有公共产品面的基础上，新增可测试、可发布、可被 AI agents 一致实现的 runtime contract layer。

总原则：

**runtime core owns decisions, adapters own side effects, plugin owns distribution surface, hooks own gates, reports own presentation, registry owns declarations.**

后续任何目录争议都按这句话裁决：

- runtime core 负责 planner、state、evidence、policy、verdict、release gate 判定。
- adapters 负责外部工具、浏览器、MCP、命令、git、npm、服务和数据探针的副作用。
- plugin 负责 Claude Code 安装后的分发面。
- hooks 负责生命周期门禁和轻量上下文。
- reports 负责展示，不拥有判定。
- registry 负责插件、MCP、依赖、安装关系声明。

### Existing Structure We Keep

```text
curdx-flow/
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── CHANGELOG.md
├── README.md
├── .gitignore
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── .claude-plugin/
│   └── marketplace.json
├── src/
│   ├── index.ts
│   ├── cli/
│   │   └── commands/
│   ├── flows/
│   ├── registry/
│   │   ├── capabilities.ts
│   │   ├── capability-rules.ts
│   │   ├── capability-tokens.ts
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── plugins/
│   │   └── mcps/
│   ├── runner/
│   ├── analyze/
│   ├── hooks/
│   │   ├── _shared/
│   │   ├── lib/
│   │   └── *.ts
│   ├── i18n/
│   └── ui/
├── plugins/
│   └── curdx-flow/
│       ├── .claude-plugin/
│       │   └── plugin.json
│       ├── bin/
│       │   └── curdx-flow
│       ├── agents/
│       ├── skills/
│       ├── hooks/
│       │   ├── hooks.json
│       │   └── scripts/
│       ├── schemas/
│       │   ├── spec.schema.json
│       │   └── transcript-events.json
│       ├── references/
│       └── templates/
├── scripts/
│   ├── build-hooks.mjs
│   ├── check-hooks-fresh.mjs
│   ├── check-versions.mjs
│   ├── claudecc-smoke.mjs
│   └── claudecc-e2e-flow.mjs
└── tests/
    ├── analyze/
    ├── hooks/
    └── runner/
```

现有目录保持公共行为稳定。不得为了新架构迁移而重命名 slash commands、plugin id、agent filenames、hook script paths、registry ids、marketplace ids 或 release tag identity。

### Target Runtime Structure

以下是目标结构，不要求一次性创建空目录。每个目录由后续 implementation story 按 schema/type/test/fixture 顺序创建。

```text
src/
└── runtime/
    ├── entrypoints/
    ├── contracts/
    ├── ports/
    ├── discovery/
    ├── planner/
    ├── services/
    ├── probes/
    │   ├── browser/
    │   ├── api/
    │   └── data/
    ├── evidence/
    ├── state/
    │   └── sessions/
    ├── recovery/
    ├── adapters/
    │   ├── command/
    │   ├── service/
    │   ├── browser/
    │   ├── api-data/
    │   ├── intelligence/
    │   ├── ux/
    │   ├── claude-code/
    │   ├── mcp/
    │   ├── package-manager/
    │   ├── git/
    │   └── release/
    ├── capabilities/
    ├── policy/
    ├── verdict/
    ├── reports/
    ├── surfaces/
    └── release/
        ├── checks/
        ├── package/
        └── publish/
```

目标 schemas：

```text
plugins/curdx-flow/schemas/
├── evidence.schema.json
├── state-ledger.schema.json
├── runtime-topology.schema.json
├── session.schema.json
├── adapter-result.schema.json
├── probe-result.schema.json
├── completion-verdict.schema.json
├── release-verdict.schema.json
├── action-risk-policy.schema.json
└── hook-gate.schema.json
```

目标 tests：

```text
tests/
├── contracts/
├── runtime/
│   ├── discovery/
│   ├── planner/
│   ├── services/
│   ├── probes/
│   ├── evidence/
│   ├── state/
│   ├── recovery/
│   ├── policy/
│   ├── verdict/
│   ├── reports/
│   └── release/
├── adapters/
├── release/
└── fixtures/
    ├── frontend-app/
    ├── api-app/
    ├── fullstack-app/
    ├── data-backed-app/
    ├── broken-app/
    ├── release-candidate/
    └── installable-plugin/
```

### Dependency Direction

允许的依赖方向：

```text
src/flows
  -> src/runtime/entrypoints
  -> planner | verdict | release
  -> ports | contracts | policy | state | evidence
  -> adapters | capabilities | services | probes
  -> external tools
```

补充规则：

- `src/flows/**` 只负责 CLI 编排：解析参数、调用 runtime entrypoint、输出结果。
- `src/registry/**` 只负责声明插件、MCP、依赖、版本和安装关系。
- runtime 可以读取 registry 声明；registry 不得 import runtime。
- planner、verdict、release 只能依赖 ports/interfaces，不得直接 import concrete adapters。
- adapters 实现 ports，不承载业务判定。
- policy 只定义 gate 规则、风险等级、允许/禁止条件，不执行副作用。
- reports 只渲染，不重新计算通过/失败。
- hooks 不得成为 runtime planner 入口。
- plugin files 不得假设 repo checkout 存在。

禁止的依赖方向：

- `src/runtime/**` 读取 skill markdown 作为事实来源。
- `src/hooks/**` 调用 runtime planner 长流程。
- `src/registry/**` 调用 runtime/adapters。
- `reports` 反向更新 verdict。
- `adapters` 修改 planner state。
- `plugins/curdx-flow/**` 直接依赖 repo-only `src/runtime/**` 源码路径。

### Installed Plugin Runtime Boundary

`plugins/curdx-flow/bin/curdx-flow` 是安装后的插件运行入口。它可以调用稳定 CLI/runtime 能力，但不得依赖：

- repo-only TypeScript source；
- dev dependencies；
- 未构建文件；
- checkout 相对路径；
- 本仓库 `_bmad-output/**`、`.agents/**`、`.claude/**`。

已安装插件运行时只能依赖：

- plugin root 内 manifest、skills、agents、hooks、schemas、templates、references；
- committed hook bundles；
- plugin-local executable；
- 用户工作区生成物 `.curdx/**`；
- 明确声明的 companion plugins 和 external MCP availability。

### Workspace Artifact Boundary

目标项目运行时 artifact 默认写到 workspace-local `.curdx/**`，不是 curdx-flow repo source。

```text
.curdx/
├── state/
│   ├── goals/
│   ├── sessions/
│   └── checkpoints/
├── evidence/
├── artifacts/
│   ├── screenshots/
│   ├── traces/
│   ├── logs/
│   └── responses/
├── reports/
└── release/
```

规则：

- `.curdx/**` 不得作为 shipped plugin state 提交。
- tests 中需要样例状态时，放入 `tests/fixtures/**`。
- `.curdx/**` 中每个 artifact 必须能追溯到 session、goal、run、attempt 和 evidence id。
- state 负责持久化格式与迁移；planner 不直接读写 `.curdx/**` 文件。

### Target Directory Contract

| Directory | Responsibility | May Contain | Must Not Contain | Tests |
|---|---|---|---|---|
| `src/runtime/entrypoints` | runtime 对 CLI/plugin 的稳定入口 | command facades、input normalization | 业务判定细节、external tool calls | `tests/runtime/entrypoints` |
| `src/runtime/contracts` | runtime 内部公开合同与 schema/type 映射 | type guards、schema mapping | 具体实现逻辑 | `tests/contracts` |
| `src/runtime/ports` | 外部能力抽象接口 | `BrowserPort`、`McpPort`、`GitPort` | concrete adapter、副作用决策 | `tests/contracts` |
| `src/runtime/discovery` | 项目事实发现 | package manager、scripts、framework、ports、routes、API/data hints | 启动进程、完成判定 | `tests/runtime/discovery` |
| `src/runtime/planner` | goal/story 分解、验证计划、恢复计划 | plan model、task graph | 具体 browser/MCP/API 调用 | `tests/runtime/planner` |
| `src/runtime/services` | dev server 生命周期 | start/stop、health check、port ownership、conflict handling | browser journey 判定 | `tests/runtime/services` |
| `src/runtime/probes` | 页面/API/数据可执行探针 | browser probe、API probe、data probe | evidence ledger 存储、verdict | `tests/runtime/probes` |
| `src/runtime/evidence` | evidence ledger 与 artifact index | ledger writer、freshness、privacy metadata | verdict 判定 | `tests/runtime/evidence`、`tests/contracts` |
| `src/runtime/state` | `.curdx/**` 状态模型、会话、迁移 | session store、checkpoint、atomic writes | plugin manifest、release publish logic | `tests/runtime/state` |
| `src/runtime/recovery` | 失败分类、修复计划、same-path retry 状态 | recovery plan、attempts、blocker normalization | 直接编辑源码、直接发布 | `tests/runtime/recovery` |
| `src/runtime/adapters` | 外部能力适配 | Claude Code、MCP、Playwright、package manager、git、npm adapters | 业务完成判定、planner rules | `tests/adapters` |
| `src/runtime/capabilities` | 能力模型与 callability | availability、callability、degradation | 真实执行结果判定 | `tests/runtime/capabilities` |
| `src/runtime/policy` | 风险策略和 mode gate | action-risk policy、release two-key rules | evidence 文件写入、副作用 | `tests/runtime/policy` |
| `src/runtime/verdict` | evidence + policy 到 completion verdict | verdict evaluator | external tool calls、report rendering | `tests/runtime/verdict` |
| `src/runtime/reports` | 用户与 agent 报告渲染 | markdown/json renderers | 核心通过/失败判定 | `tests/runtime/reports` |
| `src/runtime/surfaces` | 用户可见消息形态 | `/goal` digest、failure copy、release summary | evidence 真相、verdict evaluator | `tests/runtime/surfaces` |
| `src/runtime/release` | release gate 聚合和判定 | release checks/package/publish readiness | 真实 push/tag/npm publish | `tests/runtime/release` |

### Architectural Boundaries

**API Boundaries:**

curdx-flow 不暴露 HTTP API。API surface 是 Claude Code plugin + local CLI + hook protocol + JSON artifacts。对目标项目的 HTTP 调用通过 `src/runtime/probes/api/` 和 `src/runtime/adapters/api-data/` 产生 evidence，不直接写入 verdict。

**Component Boundaries:**

- skills/agents coordinate and display。
- runtime planner decides required evidence。
- services manage process lifecycle。
- probes execute page/API/data checks。
- adapters normalize external capability calls。
- evidence ledger stores append-only facts。
- verdict evaluator reads evidence/state/policy。
- reports and surfaces render user-facing summaries。
- hooks gate unsafe or incomplete lifecycle transitions。

**Service Boundaries:**

`src/runtime/services/` 负责目标项目 dev server 生命周期。Adapters 可以执行命令，但服务归属、端口冲突、health check、cleanup 和恢复策略属于 services，不分散到 individual adapters。

**Data Boundaries:**

数据验证通过 data probes 或 API probes 完成。Evidence ledger 只记录结果和 artifacts，不直接连接目标数据库做业务判定。涉及数据库、文件、队列、外部服务的数据证据必须记录隐私分类和降级说明。

### Requirements to Structure Mapping

**FR1-FR5 Completion Definition**

- Runtime: `src/runtime/verdict/`、`src/runtime/planner/`
- Schema: `completion-verdict.schema.json`
- Tests: `tests/contracts/completion-verdict.test.ts`、`tests/runtime/verdict/`
- Output: `.curdx/reports/<run-id>.verdict.json`

**FR6-FR11 Project Detection and Runtime Plan**

- Runtime: `src/runtime/discovery/`、`src/runtime/planner/`、`src/runtime/services/`
- Schema: `runtime-topology.schema.json`
- Tests: `tests/runtime/discovery/`、`tests/runtime/planner/`
- Fixtures: `tests/fixtures/frontend-app/`、`tests/fixtures/api-app/`、`tests/fixtures/fullstack-app/`

**FR12-FR18 Evidence and Artifact Ledger**

- Runtime: `src/runtime/evidence/`、`src/runtime/reports/`
- Schema: `evidence.schema.json`
- Tests: `tests/contracts/evidence-ledger.test.ts`、`tests/runtime/evidence/`
- Output: `.curdx/evidence/`、`.curdx/artifacts/`

**FR19-FR26 Browser/API/Data Verification**

- Runtime: `src/runtime/probes/browser/`、`src/runtime/probes/api/`、`src/runtime/probes/data/`
- Adapters: `src/runtime/adapters/browser/`、`src/runtime/adapters/api-data/`、`src/runtime/adapters/ux/`
- Schema: `probe-result.schema.json`、`adapter-result.schema.json`
- Tests: `tests/adapters/`、`tests/runtime/probes/`
- Fixtures: `tests/fixtures/fullstack-app/`、`tests/fixtures/data-backed-app/`

**FR27-FR32 Failure Recovery**

- Runtime: `src/runtime/recovery/`、`src/runtime/state/sessions/`、`src/runtime/planner/`
- Schema: `session.schema.json`、`state-ledger.schema.json`
- Tests: `tests/runtime/recovery/`、`tests/runtime/state/`
- Fixtures: `tests/fixtures/broken-app/`

**FR33-FR40 Modes and Risk Policy**

- Runtime: `src/runtime/policy/`
- Schema: `action-risk-policy.schema.json`
- Tests: `tests/contracts/action-risk-policy.test.ts`、`tests/runtime/policy/`

**FR41-FR46 Capability Doctor**

- Runtime: `src/runtime/capabilities/`
- Registry: `src/registry/capabilities.ts`、`src/registry/plugins/`、`src/registry/mcps/`
- Schema: capability fields in `adapter-result.schema.json` or dedicated capability schema
- Tests: `tests/runner/capabilities.test.ts`、`tests/runtime/capabilities/`

**FR47-FR52 Reports**

- Runtime: `src/runtime/reports/`、`src/runtime/surfaces/`
- Plugin: `plugins/curdx-flow/templates/`、`plugins/curdx-flow/references/verification-layers.md`
- Tests: `tests/runtime/reports/`
- Output: `.curdx/reports/<run-id>.report.md`、`.curdx/reports/<run-id>.verdict.json`

**FR53-FR59, FR76-FR77 Release Gate**

- Runtime: `src/runtime/release/`
- Scripts: `scripts/check-versions.mjs`、`scripts/claudecc-smoke.mjs`
- Schema: `release-verdict.schema.json`
- Tests: `tests/contracts/release-two-key.test.ts`、`tests/runtime/release/`、`tests/release/`
- Fixtures: `tests/fixtures/release-candidate/`、`tests/fixtures/installable-plugin/`

**FR60-FR75 State, Recovery, Gap Handling**

- Runtime: `src/runtime/state/`、`src/runtime/recovery/`
- Schema: `state-ledger.schema.json`、`session.schema.json`
- Tests: `tests/contracts/state-ownership.test.ts`、`tests/runtime/state/`

### Story-to-Structure Mapping Contract

每个后续 story 必须填写以下结构映射。无法填写完整映射的 story 还没有达到可实现状态。

| Story Field | Required Content |
|---|---|
| User Pain | 本 story 减少用户哪一种手工猜测或验收负担 |
| Runtime Directory | 修改或新增的 `src/runtime/**` 目录 |
| Plugin Surface | 是否影响 `plugins/curdx-flow/**`，以及影响哪个 skill/agent/hook/schema/reference |
| Schema | 新增/修改的 schema 文件，或明确“不需要 schema”的理由 |
| Contract Test | `tests/contracts/**` 中验证跨模块合同的测试 |
| Runtime Test | `tests/runtime/**` 中验证核心行为的测试 |
| Adapter Test | 涉及外部能力时必须有 `tests/adapters/**` |
| Fixture | `tests/fixtures/**` 中可运行、可复现的输入项目或状态 |
| Evidence Output | 预期 `.curdx/**` evidence/report/state 文件路径 |
| Report Surface | 用户最终看到的 markdown/json/CLI verdict 输出 |
| Failure Mode | 至少一个失败恢复或 blocked verdict 场景 |
| Verification Commands | 本 story 必须运行的最小验证命令 |

Story 映射示例：

```text
Story: Full-stack save verification
-> Runtime: src/runtime/probes/{browser,api,data}
-> Schema: plugins/curdx-flow/schemas/probe-result.schema.json
-> Contract Test: tests/contracts/probe-result.test.ts
-> Runtime Test: tests/runtime/probes/full-stack-save.test.ts
-> Adapter Test: tests/adapters/browser/playwright.test.ts
-> Fixture: tests/fixtures/fullstack-app/
-> Evidence Output: .curdx/evidence/<run-id>.evidence.jsonl
-> Report Surface: .curdx/reports/<run-id>.report.md
-> Failure Mode: API returns 200 but data cannot be read back
```

### Fixture and Evidence Rules

`tests/fixtures/**` 必须按用户旅程组织，而不是按实现细节组织。

最低 fixture set：

- `frontend-app/`: 页面访问、console/network、视觉状态。
- `api-app/`: API response、错误码、contract behavior。
- `fullstack-app/`: 页面动作、API、数据闭环。
- `data-backed-app/`: 数据写入、读取、刷新后保持。
- `broken-app/`: 失败捕获、修复计划、same-path retry。
- `release-candidate/`: version parity、hook freshness、plugin validation。
- `installable-plugin/`: installed plugin smoke 和 dependency degradation。

规则：

- fixture 必须真实可运行，不能只是静态样例文件。
- 触达 adapter 的 story 必须有 fake adapter fixture，不能只测真实外部 MCP。
- 触达 release gate 的 story 必须有失败 fixture 和恢复 fixture。
- evidence output 必须能被 report 和 verdict tests 消费。

### Release Boundary

release 结构分三层：

- `src/runtime/release/checks/`: 本地验证命令、contract checks、evidence freshness。
- `src/runtime/release/package/`: version、manifest、registry、hook bundles、npm/plugin package readiness。
- `src/runtime/release/publish/`: tag/push/npm/plugin release 的准入判定和 two-key enforcement。

边界规则：

- runtime release 只产生 release verdict，不执行真实 push/tag/npm publish。
- npm/tag/plugin marketplace 的具体操作仍由 `src/flows/**`、`scripts/**` 或 GitHub workflow 执行。
- `scripts/**` 可以作为验证命令载体，但不得成为唯一 release gate 真相来源。
- `.github/workflows/**` 是自动化层，不拥有 release 判定合同。
- publish 层不能绕过 checks/package 层。

发布前验证命令至少包括：

```bash
npm run typecheck
npm run test:hooks
npm run test:runner
npm run test:claudecc
npm run check:hooks-fresh
npm run check-versions
npm run verify
claude plugin validate ./plugins/curdx-flow
```

真实 release 还需要 tag parity、dependency trust、installed smoke、release-stage 授权。

### Schema Source-of-Truth Rule

`plugins/curdx-flow/schemas/**` 是 shipped plugin 分发合同。runtime 内如存在 contract builders、types 或 schema helpers，必须通过 tests 或 build-time check 证明与 shipped schema 一致。

禁止：

- runtime schema 与 plugin schema 手动漂移；
- 只更新 TypeScript type 不更新 shipped schema；
- 只更新 schema 不更新 contract tests；
- 使用 skill prose 替代 schema。

### File Organization Patterns

**Configuration Files:**

- root config 留在仓库根目录。
- plugin manifest 留在 `plugins/curdx-flow/.claude-plugin/plugin.json`。
- marketplace trust 留在 `.claude-plugin/marketplace.json`。
- hook wiring 留在 `plugins/curdx-flow/hooks/hooks.json`。

**Source Organization:**

- existing CLI/installer/analyze/runner code 保持现有位置。
- last-mile runtime 产品逻辑进入 `src/runtime/**`。
- complex workflow logic 不写入 `plugins/curdx-flow/skills/**`。
- hook gate 逻辑保持 thin entrypoint + shared helper。

**Test Organization:**

- `tests/contracts/`: schema/type/state/verdict/adapter/release 公开合同。
- `tests/runtime/`: planner、discovery、services、state、evidence、recovery、report、release。
- `tests/adapters/`: external capability adapters。
- `tests/hooks/`: hook protocol、fail-open、gate-only、stdout/stderr。
- `tests/runner/`: installer/capability/registry。
- `tests/fixtures/`: 可运行场景。

**Asset and Artifact Organization:**

- plugin templates: `plugins/curdx-flow/templates/`
- plugin references: `plugins/curdx-flow/references/`
- runtime evidence: workspace `.curdx/**`
- generated hooks: `plugins/curdx-flow/hooks/scripts/**`

### Development Workflow Integration

**Development Server Structure:**

curdx-flow 自身不建设 Web server。目标项目 dev servers 由 `src/runtime/services/` 管理，并通过 service/probe/adapters 产生 evidence。

**Build Process Structure:**

- CLI build: `npm run build`
- hook build: `npm run build:hooks`
- hook freshness: `npm run check:hooks-fresh`
- type checks: `npm run typecheck`
- full local gate: `npm run verify`

**Installed Plugin Validation:**

任何影响 `plugin.json`、registry、hook scripts、schemas、templates、release gate 的 story，必须在 PR/报告中列出对应验证命令。没有验证命令视为未完成。

### Structure Anti-Patterns

禁止：

- 在 `plugins/curdx-flow/skills/**` 写复杂业务流程替代 runtime。
- 在 `src/hooks/**` 放 browser/API/full-stack 验证。
- 在 `src/registry/**` 放 runtime evidence 或 verdict 逻辑。
- 在 `src/flows/**` 直接读写 `.curdx/**`、直接调用 Playwright/MCP、直接实现 release gate 判定。
- 在 `scripts/**` 放产品唯一 release gate 判断。
- 手动编辑 `plugins/curdx-flow/hooks/scripts/**`。
- 新增 schema 但不加 contract test。
- planner 直接 import `chrome-devtools-mcp`、`pua`、`claude-mem`、Playwright 或 git/npm command implementation。
- hooks 写 `.curdx` 复杂状态。
- reports 自己判断 release 是否通过。
- adapter 返回业务完成结论。
- plugin manifest 与 registry 中的依赖版本手动重复且无合同测试。
- `.curdx/**` 状态写进 `plugins/curdx-flow/**`。
- plugin skills 依赖 repo-only `src/runtime/**` 文件路径。
- 新增无法通过 fixture 复现的隐式集成。
- 只写 markdown 说明而没有 schema/test/evidence 合同。

### Structure Acceptance Checklist

后续 implementation agent 在完成任何 story 前必须说明：

- 改了哪个边界？
- 是否跨边界？
- 是否新增或修改 schema？
- 是否新增或修改 TypeScript contract？
- 是否新增 contract test？
- 是否新增 runtime test？
- 是否新增 adapter test？
- 是否新增可运行 fixture？
- 是否影响 installed plugin？
- 是否需要 `npm run build:hooks`？
- 是否影响 release gate？
- 产生哪些 `.curdx/**` evidence/report/state？
- 用户现在是否少做一件原本必须手工做的验收动作？

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**

架构决策彼此兼容。Node 20+、TypeScript ESM、npm/package-lock、`citty`、`tsup`、`esbuild` hook bundles、Vitest、Claude Code plugin root 均与 brownfield foundation 一致。native `/goal` first 与 hooks gate-only 不冲突：`/goal` 承担长任务控制，hooks 只做生命周期门禁。

**Pattern Consistency:**

Step 5 的 `IP-*` 规则支持 Step 4 的核心决策。Evidence Trust Model、State Ownership Model、Adapter Contract Model、Release Two-Key Model、Hook Gate-Only、Report Visibility、Same-Path Retry、Capability Callability、Frontend/Full-Stack Journey Evidence 均有一致的命名、结构、格式、通信和流程规则。

**Structure Alignment:**

Step 6 的结构支持全部关键组件：runtime planner、discovery、services、probes、evidence/state ledger、sessions、recovery、capabilities、policy、verdict、reports、surfaces、release gate。目录边界和依赖方向清晰，避免 runtime、hooks、skills、registry、reports、release scripts 互相争夺事实来源。

### Requirements Coverage Validation ✅

**Epic/Feature Coverage:**

当前尚未生成 epics/stories，因此验证以 PRD 的 FR/NFR 分类为准。架构已经为后续 epics 提供明确落点：每个 story 必须映射到 runtime 目录、schema、contract test、runtime test、fixture、evidence/report 输出和 failure mode。

**Functional Requirements Coverage:**

FR1-FR77 全部有架构支撑：

- FR1-FR5 -> completion verdict、evidence trust、runtime planner。
- FR6-FR11 -> discovery、services、runtime planner。
- FR12-FR18 -> evidence ledger、artifact index、reports。
- FR19-FR26 -> browser/API/data probes 与 adapters。
- FR27-FR32 -> recovery、same-path retry、session state。
- FR33-FR40 -> mode policy、action-risk policy。
- FR41-FR46 -> capability doctor、adapter registry、callability matrix。
- FR47-FR52 -> reports、surfaces、artifact index。
- FR53-FR59、FR76-FR77 -> release gate、two-key model、tag/version parity。
- FR60-FR75 -> state/session ledger、dirty worktree safety、gap handling。

**Non-Functional Requirements Coverage:**

NFR1-NFR30 均被架构覆盖。no false completion、hook low latency、evidence freshness、privacy/redaction、dirty worktree safety、external capability degradation、installed plugin smoke、hook freshness、version parity、release dry-run 和 fixtures 都已有对应决策、规则或结构落点。

### Implementation Readiness Validation ✅

**Decision Completeness:**

关键决策已经覆盖 data architecture、security/action risk、communication model、frontend verification architecture、release gate、evidence trust、state ownership、adapter contract、verdict model、degraded mode 和 control/execution/display plane。

**Structure Completeness:**

项目结构区分了 existing structure 与 target runtime structure。已明确 `src/runtime/**`、`plugins/curdx-flow/**`、`src/hooks/**`、`src/registry/**`、`tests/**`、`.curdx/**`、release 三层边界和 installed plugin runtime boundary。

**Pattern Completeness:**

潜在 AI agent 冲突点已覆盖：命名、目录、schema/type/test、hook stdout/stderr、generated artifact freshness、adapter non-negotiables、frontend/full-stack journey evidence、same-path retry、report visibility、release two-key、story-to-structure mapping。

### Gap Analysis Results

**Critical Gaps:**

无。没有发现阻塞 architecture workflow completion 或 epic/story generation 的架构缺口。

**Implementation Entry Gaps:**

以下不是架构缺口，但会阻塞直接功能编码。它们必须成为首批 P0 validation stories，不得作为可选优化或后补项：

- Epics/stories 尚未生成。
- `src/runtime/**` skeleton 尚未落地。
- schema/type/test baseline 尚未建立。
- runnable fixtures 尚未实现。
- external capability degradation contract 尚未 contract-tested。
- release dry-run 与真实 publish/tag/push 边界尚未实现。
- installed plugin runtime smoke fixture 尚未覆盖。
- target workspace `.curdx/**` artifact lifecycle fixture 尚未覆盖。

**Nice-to-Have Gaps:**

- 未来可加入 CI/canary/channel 集成。
- 未来可加入团队 dashboard，但不属于 MVP。
- 未来可为企业导出增加更细的脱敏策略模板。

### Risk Acceptance

接受上述 Implementation Entry Gaps 的条件：

- 它们不阻塞架构文档完成。
- 它们阻塞直接功能编码。
- 它们必须成为首批 epics/stories。
- 它们不得被后续 agent 当作可选优化。
- 它们完成前，只能进入 entry sprint / contract baseline implementation，不得进入普通功能扩展、release workflow 或用户承诺型能力实现。

架构状态可以关闭；实施状态必须 entry-gated。

### Not Ready If

如果后续 implementation plan 出现任一情况，应立即降级为 `NOT READY`：

- 不先生成 epics/stories。
- 不先建立 schema/type/test baseline。
- 不实现可运行 fixtures。
- 不实现 runtime skeleton。
- 不实现 external capability degradation contract。
- 不实现 release dry-run vs publish/tag/push boundary。
- hooks 承担 planner、verdict、completion state 或长流程。
- skills/agents 直接写 completion state 或绕过 runtime verdict。
- release dry-run 自动 push、tag、npm publish 或 plugin release。
- external MCP、pua、claude-mem、chrome-devtools-mcp、ui-ux-pro-max 缺失时仍输出 `complete`。
- 验收只覆盖 happy path，没有负向 fixtures。
- CI/smoke 不能复现 false completion 防线、降级行为或 release boundary。

### Implementation Entry Criteria

首批 implementation story 必须满足：

- story 已映射到目录、schema、contract test、runtime test、fixture、evidence/report。
- 不允许直接从 hooks、skills 或 concrete adapters 开工。
- 不允许先做 release publish，只能先做 release dry-run gate。
- 不允许把 fixture 推迟到“以后补”。
- 不允许普通功能 story 早于 contract baseline story。
- 每个 story 必须包含文件范围、验收标准、失败模式和验证命令。

### P0 Validation Stories

首批 entry sprint 建议：

1. **Story 0: Contract Baseline**
   建立 runtime 目录、核心 schemas/types、golden fixtures、failure fixtures、测试 harness。没有这个，后续 story 都不可开工。

2. **Story 1: Runtime Skeleton**
   实现 planner、evidence、state/session、adapters ports、verdict、release gate 的最小可运行闭环。允许 no-op，但必须有明确 degraded/blocked verdict。

3. **Story 2: Hook Boundary Tests**
   固化 hooks gate-only 规则，证明 hooks 不做 planner、不写 completion state、不生成最终 verdict。

4. **Story 3: External Capability Degradation**
   为 plugin dependencies、external MCP、browser tools 缺失、超时、异常返回建立统一 adapter contract 和测试。

5. **Story 4: Release Gate Dry-Run Boundary**
   明确 dry-run、version check、tag、publish 的边界，证明 dry-run 无真实发布副作用。

6. **Story 5: Runnable Fixtures and Artifact Lifecycle**
   建立 happy path、证据不足、外部能力缺失、hook 拦截、release dry-run、false completion、`.curdx/**` artifact lifecycle fixtures。

### QA Gates

首批 P0 stories 必须覆盖：

- schema/type/test baseline。
- runnable fixtures。
- false completion gate。
- hook gate-only verification。
- external capability degradation。
- native `/goal` first flow smoke。
- frontend/backend integration evidence gate。
- release dry-run vs publish boundary。
- installed plugin runtime smoke。
- target workspace `.curdx/**` artifact lifecycle。

### Low-Guess Operation Acceptance

首批 stories 必须证明用户少猜：

- **端口少猜：** 状态输出明确显示实际端口、服务可用性、冲突处理结果。
- **API 少猜：** runtime/adapters 暴露稳定 schema、类型、错误边界和 capability 状态。
- **页面少猜：** 涉及浏览器或页面验证时，输出 URL、ready 状态、证据位置或失败原因。
- **数据少猜：** fixtures 能复现输入、状态迁移、evidence 输出和 verdict。
- **发布少猜：** dry-run 与 publish 有硬边界，状态输出明确“未发布 / 可发布 / 已发布”，dry-run 绝不触发真实发布。
- **外部能力少猜：** pua、claude-mem、chrome-devtools-mcp、ui-ux-pro-max、external MCP 缺失时，必须 degraded 或 blocked，不能伪装 complete。

### Validation Issues Addressed

验证过程中已经通过 Step 5/Step 6/Step 7 解决以下潜在问题：

- 区分 current structure 与 target structure，避免一次性空目录铺满。
- 固定依赖方向，防止 hooks、registry、reports、adapters 反向拥有判定。
- 明确 installed plugin runtime 不依赖 repo-only source。
- 明确 `.curdx/**` 是目标工作区生成物，不是 shipped source。
- 明确 schema source-of-truth 与 contract test 要求。
- 明确 release gate 只判定 readiness，不自动 push/tag/publish。
- 将 `READY FOR IMPLEMENTATION` 收紧为 entry-gated readiness，防止团队过早进入普通功能编码。

### Architecture Completeness Checklist

**Requirements Analysis**

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**

- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**

- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**

- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Validation Status:** ARCHITECTURE READY / IMPLEMENTATION ENTRY-GATED

**BMAD Overall Status:** READY WITH MINOR GAPS

**Direct Feature Coding Status:** NOT READY FOR DIRECT FEATURE CODING

**Confidence Level:** high

**Key Strengths:**

- Strong no false completion model。
- `/goal`、hooks、runtime、adapters、reports、release gate 边界清晰。
- Evidence/schema/type/test 被设为实现合同，而不是提示词约定。
- 前端/全栈验证覆盖 UI、API、data、screenshot/trace、same-path retry。
- 发布安全覆盖 npm tag、Claude plugin tag、plugin validate、installed smoke 和 two-key authorization。
- Implementation entry gaps 已被明确标记为 P0 validation stories。

**Areas for Future Enhancement:**

- 企业级导出与脱敏策略模板。
- CI/canary/channel release 集成。
- 团队级 dashboard。
- 更多真实框架 fixtures。

### Implementation Handoff

**AI Agent Guidelines:**

- 严格遵守 `IP-*` 规则。
- 不把模型自述当 evidence。
- 不把 hooks 写成 planner。
- 不把 skills/agents 写成 runtime。
- 不让 adapters 做业务 verdict。
- 不让 reports 重新判定通过/失败。
- 每个 story 必须映射到目录、schema、test、fixture、evidence/report 和 failure mode。
- Entry sprint 完成前，不得启动普通功能扩展。

**First Implementation Priority:**

1. 生成 epics/stories，并强制每个 story 包含目录、schema、test、fixture、evidence/report、failure mode。
2. 定义 shipped schemas：evidence、state-ledger、runtime-topology、session、adapter-result、probe-result、completion-verdict、release-verdict、action-risk-policy、hook-gate。
3. 建立 TypeScript contracts 和 runtime guards。
4. 建立 `tests/contracts/**`。
5. 实现最小 state/session/evidence ledger。
6. 建立 capability callability/degradation contracts。
7. 实现 completion verdict evaluator。
8. 建立 runnable fixtures。
9. 建立 installed plugin runtime smoke fixture。
10. 建立 target workspace `.curdx/**` artifact lifecycle fixture。
11. 实现 discovery/services/probes。
12. 实现 planner/recovery。
13. 实现 reports/surfaces。
14. 集成 hooks gate。
15. 实现 release dry-run gate。

**Required Verification Commands for Entry Stories:**

```bash
npm run typecheck
npm run build:hooks
npm run check:hooks-fresh
npm run test:hooks
npm run test:runner
npm run test:claudecc
npm run check-versions
npm run verify
claude plugin validate ./plugins/curdx-flow
```

新增 runtime 测试后，应补充专门命令：

```bash
npm run test:runtime
```
