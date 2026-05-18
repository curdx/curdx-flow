---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
inputDocuments:
  - '_bmad-output/project-context.md'
  - '_bmad-output/planning-artifacts/research/technical-claude-code-plugin-latest-architecture-and-release-mechanics-for-curdx-flow-optimization-research-2026-05-15.md'
  - '_bmad-output/planning-artifacts/research/last-mile-reference-synthesis-2026-05-15.md'
workflowType: 'prd'
releaseMode: 'phased'
workflowStatus: 'complete'
documentCounts:
  productBriefs: 0
  research: 2
  brainstorming: 0
  projectDocs: 1
classification:
  projectType: 'Claude Code-native delivery reliability plugin / execution assurance layer'
  secondaryTypes:
    - 'runtime verifier'
    - 'AI coding workflow orchestrator'
    - 'QA automation assistant'
    - 'developer CLI'
  domain: 'AI-assisted software delivery reliability / developer productivity'
  complexity: 'high, brownfield, multi-runtime, evidence-driven workflow system'
  projectContext: 'brownfield existing Node/TypeScript CLI plus Claude Code plugin bundle; core product surface is plugins/curdx-flow'
---

# Product Requirements Document - curdx-flow

**Author:** 王定旭
**Date:** 2026-05-15

## Executive Summary

curdx-flow 是一个 Claude Code-native delivery reliability plugin / execution assurance layer，目标是解决 AI 编码的最后一公里：代码生成完成以后，项目仍然可能无法安装、无法启动、前后端未联调、页面存在样式或运行时错误、接口响应不符合要求、数据没有真实保存，或者失败后没有自动诊断和修复闭环。curdx-flow 要把“AI 说完成”升级为“项目已经通过证据链证明可用”。

产品面向高频使用 Claude Code 和 AI 编码工具的开发者、技术负责人和 AI-native 工程团队。用户已经不缺代码生成速度，真正痛点是 AI 完成后的验收成本、返工成本和不可信完成声明。curdx-flow 的交付目标是让用户少操心工具选择和验证步骤：它负责识别项目形态，启动必要服务，执行真实页面/API路径，检查日志、网络、接口响应、数据保存和 UI 状态，并在失败时进入诊断、修复、重跑验证的闭环。

核心产品承诺是：用了 curdx-flow，AI 写出来的项目应该能直接用；如果不能直接用，curdx-flow 必须给出明确失败证据、定位路径、修复动作和下一步阻塞点，而不是把未验证的风险留给用户。

### What Makes This Special

curdx-flow 的差异点不是单纯编排更多 agent 或生成更多任务，而是建立一条可执行、可观察、可复跑的完成证据链。它将 native `/goal` 用作长任务驱动，将 Stop hook 和 TaskCompleted hook 保持为确定性门禁，将 dev runtime、browser/API verification、external MCP、companion plugins 和 release gates 组织成一个以证据为中心的交付验收层。

curdx-flow 不要求用户理解应该选 Playwright、Chrome DevTools MCP、Claude Chrome、curl、contract tests、ui-ux-pro-max、context7、claude-mem、pua 还是 sequential-thinking。它应根据任务类型自动选择证据路径：Playwright 或项目已有 E2E 用于可复跑用户流和 CI 证据；Chrome DevTools MCP 用于真实浏览器现场、console、network、DOM/CSS、性能和样式诊断；Claude Chrome beta 用于用户真实浏览器和登录态辅助；API/contract checks 用于前后端契约；ui-ux-pro-max 用于视觉和交互质量；context7 用于最新官方文档；claude-mem、pua 和 sequential-thinking 用于历史失败、复杂恢复和高风险架构推理。

核心洞察是：“完成”不是模型自述，而是证据链。对全栈功能，例如新增用户，完成证据必须覆盖冷启动、页面访问、真实页面操作、接口请求与响应、后端处理、数据保存、UI 状态、日志或 trace、可复跑验证命令，以及失败后的同路径重跑。没有这些证据，curdx-flow 不能让工作流声称完成。

### Document Reading Guide

本文档按下游交付链组织：先定义愿景和成功标准，再用用户旅程说明真实使用场景，随后明确领域约束、创新边界、项目类型要求和交付范围，最后用 FR/NFR 固化能力合同和质量门槛。后续架构、Epic、Story 和开发实现必须能追溯到这些章节。

## Project Classification

**Primary Project Type:** Claude Code-native delivery reliability plugin / execution assurance layer
**Secondary Types:** runtime verifier, AI coding workflow orchestrator, QA automation assistant, developer CLI
**Domain:** AI-assisted software delivery reliability / developer productivity
**Complexity:** high, brownfield, multi-runtime, evidence-driven workflow system
**Project Context:** existing Node/TypeScript CLI plus Claude Code plugin bundle. The primary product surface is `plugins/curdx-flow`, including plugin manifest, skills, agents, hooks, schemas, templates, references, and plugin-local runtime commands.

## Success Criteria

### User Success

用户使用 curdx-flow 后，AI 编码交付从“代码看起来写完了”变成“功能真实可用”。对任何项目类型，curdx-flow 都必须尽力识别项目结构、启动运行环境、执行真实功能路径，并用证据证明结果。

核心用户成功标准：

- 用户请求实现的功能必须通过真实路径验证，而不是只通过代码 diff、类型检查或模型自述。
- 对前后端/全栈功能，必须证明页面能访问、用户能操作、接口被调用、响应符合预期、后端处理成功、数据真实保存、UI 状态可接受。
- 用户不需要自己判断该用 Playwright、Chrome DevTools MCP、curl、contract test、ui-ux-pro-max、context7、pua、claude-mem 还是 sequential-thinking；curdx-flow 自动选择合适工具。
- 用户每天使用后形成依赖感：不再愿意回到“AI 写完后自己手动验收、排错、补证据”的工作方式。
- 如果功能无法自动完成，用户看到的是可执行阻塞报告，而不是模糊失败或虚假完成。

### Business Success

业务成功以“高级 AI 编码用户离不开”为第一指标，而不是先追求 CI 平台化或泛化团队流程。

MVP 成功信号：

- 核心用户在日常开发中持续使用 curdx-flow 作为 Claude Code 默认交付验收层。
- 用户明确反馈 curdx-flow 减少了 AI 编码后的人工验收、启动排错、前后端联调和返工时间。
- 用户开始把“没有 curdx-flow 证据链就不能算完成”作为个人或团队交付习惯。
- 插件安装后能稳定复用，不需要用户频繁手动修配置、理解工具细节或绕开失败流程。

Growth / 企业级成功信号：

- 团队把 curdx-flow 的证据链作为 AI 代码交付标准。
- 多人协作时，curdx-flow 输出的证据报告能被用作 review、验收和交接依据。
- 企业用户能配置自己的完成标准，例如必须包含浏览器截图、接口响应、日志、数据保存证明、release gate。

### Technical Success

技术成功的核心是 **100% no false completion**：curdx-flow 不允许在缺少真实运行证据时声称功能完成。

技术成功标准：

- 通用项目检测：curdx-flow 不绑定单一框架，必须支持通用项目识别，包括前端、后端、全栈、CLI、库、Claude Code plugin，以及常见多 root/monorepo 项目。
- 真实功能验证：每个被声明完成的功能必须有真实执行证据，不能只依赖 mock、静态检查、截图或代码存在性。
- 证据链完整：完成证据应覆盖冷启动、服务健康、页面/API路径、请求/响应、日志或 trace、数据保存、UI 状态、可复跑命令。
- 自动工具路由：curdx-flow 必须根据任务自动选择 Playwright、Chrome DevTools MCP、API checks、contract checks、ui-ux-pro-max、context7、claude-mem、pua、sequential-thinking 等能力。
- 失败闭环：失败时必须记录症状、命令、日志、截图/trace、网络或接口响应、可能层级、修复尝试和重跑结果。
- 可降级：当缺少密钥、数据库、外部服务、浏览器能力或 MCP 时，curdx-flow 必须明确报告阻塞，不得沉默跳过关键验证。
- Release 可靠：插件自身发布必须通过 Claude Code plugin validation、installed-plugin smoke、hook freshness、version parity、dependency doctor 和 tag/npm/plugin release gate。

### Measurable Outcomes

- **False completion rate:** 0。没有证据链时不得输出完成。
- **Claimed completion verification:** 100% 已声明完成的功能都有可见证据或明确人工确认记录。
- **Unsupported/blocker clarity:** 100% 无法自动跑通的场景输出明确阻塞报告。
- **Tool routing correctness:** 前端/全栈任务必须自动触发浏览器/API/UI 相关证据路径，除非有明确跳过理由。
- **Real-flow coverage:** 对用户指定的核心功能路径，至少验证一个真实业务流，例如新增用户、登录、CRUD、保存设置、提交表单。
- **Plugin release readiness:** 每次 release 前必须完成本仓库定义的 plugin/npm/tag/version/hook/smoke 验证链。

## Product Scope

本节是产品范围摘要，用于快速理解 MVP、Growth 和 Vision 的边界。后文 `Project Scoping & Phased Development` 是交付分阶段决策，二者从不同角度描述同一产品范围。

### MVP - Minimum Viable Product

MVP 聚焦本地最后一公里交付验证，不先做 CI 平台。

MVP 必须包含：

- 通用项目检测和运行计划生成。
- 本地依赖、启动、健康检查、验证命令识别。
- 针对用户请求功能生成最小真实验证路径。
- 前端/全栈项目的浏览器证据路由。
- API 请求/响应和后端处理证据。
- 数据保存或状态变化证明。
- 失败诊断、修复尝试、同路径重跑。
- native `/goal` completion condition 中包含可见证据要求。
- 缺少外部能力时明确降级和阻塞报告。

### Growth Features (Post-MVP)

Growth 聚焦更强的团队级交付体验：

- QA report-only 和 fix mode 分离。
- 自动生成/补强 Playwright 或项目 E2E 脚本。
- 更丰富的 Chrome DevTools MCP 诊断，包括 console、network、DOM/CSS、performance。
- 团队可配置完成标准。
- 企业级证据报告模板。
- 多项目、多框架样本库和回归验证集。
- 更强的 pua 并行诊断和 claude-mem 历史失败复用。

### Vision (Future)

Vision 是企业级 AI 软件交付验收标准层：

- 团队把 curdx-flow 作为 Claude Code 交付默认门禁。
- 任意 AI 生成代码都必须通过 curdx-flow 证据链后才能被认为完成。
- 可接入 CI、部署、canary、生产健康检查，但 CI 不是 MVP 前提。
- 支持组织级策略：不同项目类型、风险等级、业务流、release 阶段使用不同证据要求。
- curdx-flow 成为用户离不开的 AI 编码交付闭环系统。

## User Journeys

### Journey 1: 高级 AI 编码开发者 - 功能真实跑通

林川是一个每天用 Claude Code 写全栈功能的独立开发者。他让 Claude 实现“新增用户”功能：前端表单、后端接口、数据库保存、列表回显。以前 Claude 常说完成，但他还要自己装依赖、启动服务、点页面、看接口、查日志。

他启动 curdx-flow 后，系统先识别项目结构和运行方式，生成本地验证计划。curdx-flow 启动前后端服务，打开页面，执行真实新增用户流程，检查 network 请求、响应 body、后端日志、数据保存结果和页面回显，并保存截图/trace/API 证据。

关键价值时刻是：林川看到 curdx-flow 给出的证据链，而不是一句“完成了”。如果功能真实通过，他可以直接继续开发；如果失败，curdx-flow 会指出失败层级和重跑结果。

该旅程揭示的能力：通用项目检测、冷启动、真实业务流执行、浏览器/API 证据、数据保存验证、`/goal` 可见完成证据。

### Journey 2: 高级 AI 编码开发者 - 失败自动恢复

林川让 Claude 修复一个页面保存失败的问题。代码改完后，页面能打开，但点击保存返回 500，console 有错误，数据库没有新记录。传统流程里，他要自己来回查前端、接口、日志、数据层。

curdx-flow 不允许直接完成。它记录失败证据：页面操作、请求 payload、响应状态码、console error、后端日志摘要、数据未保存证明。然后它进入诊断模式，调用合适能力：Chrome DevTools MCP 看真实浏览器现场，context7 查框架最新用法，claude-mem 查历史失败，必要时用 pua 拆分并行诊断。

修复后，curdx-flow 必须重跑同一条失败路径。只有同一路径通过，才允许输出完成；如果外部服务、密钥或数据库缺失，它必须输出阻塞报告。

该旅程揭示的能力：失败证据捕获、根因定位、工具自动路由、修复任务生成、同路径重跑、明确阻塞报告、no false completion。

### Journey 3: QA/验收者 - 只要报告，不要改代码

周蔚是团队里的 QA/验收者。她不想让 AI 直接改代码，只想知道一个分支是否真的能用。她运行 curdx-flow 的 report-only 验证模式。

curdx-flow 识别改动影响的页面和接口，像真实用户一样访问核心路径，检查 console、network、表单、导航、响应式布局和主要状态。每个问题都必须有复现步骤、截图或 trace、严重等级、影响范围和是否阻塞交付。它不能顺手修代码，也不能把“需要人工判断”的项目伪装成自动通过。

关键价值时刻是：周蔚拿到一份可审阅的证据报告，可以交给开发者或进入修复模式，而不是听模型解释“看起来没问题”。

该旅程揭示的能力：report-only 模式、健康评分、问题复现、截图证据、人工验收标记、fix mode 分离。

### Journey 4: 技术负责人 / 架构师 - 团队交付标准

沈昊是技术负责人。他不可能亲自点每个 AI 生成的功能，但他需要团队有统一的“AI 代码完成定义”。他关心的不是单次命令是否成功，而是证据是否足够支撑 review 和交接。

他要求团队使用 curdx-flow 作为 Claude Code 默认交付验收层。每个功能必须输出可追溯证据：运行命令、关键路径、截图、接口响应、日志、数据状态、失败修复记录、最终验证结果。对于高风险功能，必须加强 browser/API/contract evidence；对于插件自身变更，必须包含 plugin validate、hook freshness、installed smoke、version/tag parity。

关键价值时刻是：沈昊可以看报告判断是否能合并，而不需要重跑所有上下文或相信模型自述。

该旅程揭示的能力：团队证据标准、风险分级、review-ready 报告、release gate、可配置完成标准。

### Journey 5: 企业/团队管理员 - 配置治理和能力边界

许岚负责企业团队的 AI 工具治理。她不写每个功能，但要定义哪些项目必须经过哪些验收。比如管理后台必须有浏览器截图和接口响应，支付/用户数据必须证明真实持久化，插件发布必须验证依赖和 tag。

她配置 curdx-flow 的完成标准：不同项目类型、风险等级、功能类型对应不同证据要求。系统检测到缺少 Chrome DevTools MCP、context7、pua、claude-mem 或 ui-ux-pro-max 时，必须说明缺口和降级行为，不能静默跳过关键验证。

关键价值时刻是：团队可以扩大 AI 编码使用，但完成标准仍然一致、可审计、可解释。

该旅程揭示的能力：策略配置、依赖检测、能力降级、组织级完成标准、审计友好输出。

### Journey 6: curdx-flow 维护者/发布者 - 插件自身可靠发布

王定旭维护 `plugins/curdx-flow`。他修改 skill、agent、hook、manifest、registry 或 release 流程后，不能只跑 TypeScript build 就发布。Claude Code 插件项目的失败常发生在安装态、hooks、plugin dependencies、外部 MCP、版本字段、npm tag 和 plugin tag 不一致。

发布前，curdx-flow 必须验证自身：官方 Claude Code 行为、plugin manifest、hook bundles freshness、`claude plugin validate`、installed-plugin smoke、dependency doctor、version parity、npm tag 与 `curdx-flow--vX.Y.Z` plugin tag。失败时给出具体修复路径。

关键价值时刻是：维护者能放心发布，因为验证覆盖的是用户真实安装和使用路径，而不是 repo 内部的乐观状态。

该旅程揭示的能力：插件自验证、release gate、installed smoke、依赖/marketplace 检查、tag parity、官方文档校准。

### Journey Requirements Summary

这些旅程共同要求 curdx-flow 具备以下能力：

- 按用户旅程验证，不按前端/后端技术层拆散交付。
- 支持 success path、failure recovery、report-only、team standard、admin policy、plugin release 六类核心场景。
- 将“完成”绑定到证据链：冷启动、服务健康、页面操作、接口响应、日志、数据保存、UI 状态、可复跑命令。
- 自动选择工具：Playwright/E2E 用于可复跑验收，Chrome DevTools MCP 用于真实浏览器诊断，API/contract checks 用于接口契约，ui-ux-pro-max 用于视觉和交互，context7 用于最新文档，claude-mem/pua/sequential-thinking 用于复杂恢复。
- 区分 report-only 和 fix mode，避免验收者只想看报告时被系统改代码。
- 失败必须形成 gaps、root cause、fix plan、重跑结果，而不是停在失败日志。
- 团队和企业场景需要可配置完成标准、风险等级和审计友好报告。
- curdx-flow 自身发布必须走同样的证据逻辑，验证真实 Claude Code 插件安装和运行路径。

## Domain-Specific Requirements

curdx-flow 所属领域不是传统监管行业，而是 Claude Code-native AI software delivery reliability。核心领域约束来自 Claude Code plugin 生态、AI 编码交付证据、企业开发流程、本地执行安全和 no false completion。

### Compliance & Regulatory

- 必须以当前 Claude Code 官方文档和已安装 `claude` CLI 行为为准，尤其是 plugin manifest、skills、agents、hooks、plugin dependencies、marketplace、native `/goal`、Chrome integration、MCP 和 release tag 机制。
- 必须保持 plugin dependency 与 marketplace trust 一致。`pua`、`claude-mem`、`chrome-devtools-mcp`、`ui-ux-pro-max` 属于插件依赖/安装流程范围；`context7`、`sequential-thinking` 等外部 MCP 需要通过安装流程、doctor 或用户环境确认。
- 必须支持企业级完成标准：团队可以规定不同项目、风险等级、功能类型和 release 阶段需要哪些证据。
- 必须坚持 no false completion：没有真实证据链，不得声明完成。该规则在 Personal、Team、Enterprise 模式下都不可关闭。
- 本地证据默认完整保留以便用户审查；未来导出/分享场景应支持可选脱敏策略，但 MVP 不以脱敏为主流程阻塞。

### Technical Constraints

- 默认激进自动化，但按动作风险分级。激进自动化服务于真实交付，不服务于跳过判断。
- 低风险动作应自动执行：读取项目结构、查官方文档、读取日志、运行只读检测、打开浏览器观察、截图、console/network 检查、生成报告。
- 中风险动作应自动执行并记录：安装普通 dev 依赖、启动本地服务、生成测试文件、写 evidence artifacts、调用 Playwright、Chrome DevTools MCP 或 Claude Chrome。
- 高风险动作必须受策略允许或明确上下文约束：删除文件或重写大量文件、修改数据库 schema/migration/seed、运行 destructive migration、改全局 Claude/MCP 配置、安装或升级全局工具、推送代码、打 tag、发布 npm/plugin、访问或导出生产数据、执行不可逆系统命令。
- `/goal` 是长任务完成判断和继续执行的主驱动。Stop hook、TaskCompleted hook、PostToolBatch hook 负责确定性门禁、证据检查和状态保护。
- Hook 不能成为脆弱主循环。Hooks 必须协议干净、低延迟、fail-open 或明确 gate；复杂推理、浏览器验证和自动修复属于 skill/runtime/agent 流程。
- `/goal` 只能根据对话中可见证据判断完成，因此关键运行结果、命令、路径、失败原因和下一步必须进入 transcript 或明确报告。
- 本地 evidence artifact 应保留诊断所需证据：截图、trace、URL、动作、命令、exit code、关键 stdout/stderr、请求/响应摘要、日志片段、数据保存证明、服务状态、修复记录和重跑结果。
- 不默认无限保存超大日志、完整数据库 dump、完整 cookie/token 或整表用户数据。若用户显式要求保留完整原始 artifact，必须标记为 local-only。
- 缺能力不能静默跳过。缺少 Chrome DevTools MCP、Playwright、context7、pua、claude-mem、ui-ux-pro-max 或 sequential-thinking 时，必须明确说明影响，自动尝试安装/启用或给出 remediation，并判断是否阻塞完成。
- 失败时应自动诊断、修复、重跑同一路径。修复超过次数或同路径重复失败时，必须停止反复编辑并进入 root-cause 或人工阻塞报告。

### Integration Requirements

curdx-flow 必须把外部能力当作能力轮子使用，而不是重造它们。

- **Claude Code native `/goal`:** 用于长期执行和完成条件判断。completion condition 必须包含任务完成、真实运行证据、失败闭环和 no false completion。
- **Chrome DevTools MCP:** 用于真实浏览器现场诊断，包括 console、network、DOM/CSS、性能、截图、真实渲染和接口响应观察。
- **Playwright / project E2E:** 用于可复跑验收、CI 兼容证据、用户流自动化和长期回归。
- **Claude Chrome beta:** 用于真实用户浏览器、登录态和本地页面辅助验证；不能作为唯一 release gate。
- **API / contract checks:** 用于接口响应、schema、状态码、前后端契约、数据保存结果。
- **ui-ux-pro-max:** 用于 UI/UX、样式、响应式、视觉一致性和可用性检查。
- **context7:** 用于框架、SDK、Claude Code、MCP、plugin 机制的最新官方文档查询；不可用时可用本地官方 docs/cache，但涉及最新行为时必须标记不确定。
- **claude-mem:** 用于历史决策、重复失败、项目经验和类似问题检索。
- **pua:** 用于复杂任务拆分、并行诊断、失败恢复和多路径执行。
- **sequential-thinking:** 用于高风险架构、hook 行为、release 策略、状态机和工具路由决策。

### Operating Modes

| 模式 | 自动化策略 | 证据策略 | 高风险动作 | 适用场景 |
|---|---|---|---|---|
| Personal | 默认激进，能自动就自动 | 本地完整 evidence | 除 destructive/release 外尽量自动，但保留证据记录 | 王定旭日常使用 |
| Team | 自动验证，修复和配置变更更克制 | 标准 evidence report，可共享 | schema、依赖、全局配置需策略允许 | 小团队协作 |
| Enterprise | 策略驱动，默认审计友好 | 可脱敏、可审计、可归档 | 发布、tag、全局配置、数据操作需显式策略 | 企业治理 |

### Chaos & Failure Scenarios

领域要求必须把以下失败场景作为一等验收输入：

- 端口被占用：应检测占用进程、换端口或给出可执行处理方案。
- 依赖安装失败：应捕获包管理器、lockfile、运行时版本、网络或权限原因。
- 前端启动成功但后端失败：不得只因页面打开就完成。
- 后端 health 成功但页面 JS 崩：不得只因 API 正常就完成。
- DB/migration/seed 失败：必须阻塞数据保存相关功能完成。
- Chrome DevTools MCP 不可用：必须改用 Playwright/Claude Chrome/curl 或明确阻塞浏览器证据。
- Playwright 不存在：可生成最小测试或使用 Chrome DevTools MCP 观察，但不能声称有可复跑 E2E。
- context7 不可用：可用本地官方 docs/cache，但涉及最新 Claude Code/plugin/MCP 行为时必须标记不确定。
- 日志太大：截取关键窗口、保存原始 artifact 路径，不把巨大日志塞进 transcript。
- 外部服务缺密钥：必须明确 blocker，不把 mock success 算完成。
- 修复超过次数：停止同一路径反复编辑，进入 root-cause 或人工阻塞报告。

### Domain Risk Mitigations

- **风险：项目声称完成但没跑通。**
  缓解：`/goal` 完成条件必须要求真实运行证据；hook 层发现缺证据时应自动推动继续验证或阻断完成声明。

- **风险：自动化太保守，用户还得自己操心。**
  缓解：Personal/default 模式采用激进自动调用策略；工具可用就用，失败就修，缺能力就自动 remediation。

- **风险：工具缺失导致假通过。**
  缓解：doctor 和 runtime planner 必须报告能力状态；关键能力缺失时不得沉默降级。

- **风险：报告太简略，无法复查。**
  缓解：保存完整本地 evidence artifact，包括截图、trace、请求/响应、日志片段、命令输出、修复记录和重跑结果。

- **风险：过度依赖单一工具。**
  缓解：按证据类型路由工具。Playwright 负责可复跑验收，Chrome DevTools MCP 负责真实浏览器诊断，API/contract checks 负责接口契约，ui-ux-pro-max 负责体验质量。

- **风险：插件自身发布不可靠。**
  缓解：curdx-flow 自身必须走 plugin validation、installed smoke、hook freshness、version parity、dependency doctor、npm tag 和 plugin tag parity。

- **风险：未来企业分享报告暴露敏感信息。**
  缓解：MVP 支持完整本地证据；后续支持导出模式脱敏，但不牺牲本地诊断完整性。

- **风险：模型把计划完成误判成产品完成。**
  缓解：完成定义必须从 user journey 出发，而不是从 task checklist 出发。任何没有走完用户旅程的实现都不能被包装成完成。

## Innovation & Novel Patterns

### Detected Innovation Areas

curdx-flow 的核心创新不在单个工具，而在完成判定权的迁移。传统 AI coding workflow 往往以任务勾选、代码 diff、build pass、测试通过或模型自述作为完成信号。curdx-flow 要把 AI coding 的完成判定权从模型自述迁移到证据链：只有当用户旅程通过真实运行、页面/API路径、日志、数据保存、UI 状态和可复跑验证证明后，才允许工作流声明完成。

第二个创新是 Claude Code-native execution assurance loop。curdx-flow 不把实现、启动、浏览器验证、API 验证、失败诊断、修复、重跑当作分散动作，而是把它们组织成一个围绕 native `/goal`、hooks、runtime、browser/API evidence 和 failure recovery 的交付闭环。失败不是终点，而是进入诊断、工具路由、修复任务、同路径重跑和证据更新。

第三个创新是自动工具路由。curdx-flow 不要求用户知道该用 Playwright、Chrome DevTools MCP、Claude Chrome、curl、contract checks、ui-ux-pro-max、context7、claude-mem、pua 还是 sequential-thinking。它根据任务类型、项目形态、风险等级、缺失能力和证据需求自动选择工具，并在降级时明确说明影响。

第四个创新是 Claude Code-native 架构。curdx-flow 深度利用 native `/goal` 作为长任务闭环驱动，将 hooks 保持为确定性门禁和状态保护，将 plugin dependencies、external MCP、skills、agents、runtime CLI 和 release gates 组合为插件生态内的交付验收层。

第五个创新是未来企业标准化能力。curdx-flow 的证据链可以从个人生产力工具扩展为团队/企业 AI 代码交付标准：不同项目类型、风险等级、业务流和 release 阶段可配置不同完成标准，报告可审计、可复查、可交接。

### Market Context & Competitive Landscape

curdx-flow 位于多个工具类别之间，但不等同于任何单一类别：

- **gstack:** 强在浏览器 QA、报告、修复循环和 canary/deploy 思路；curdx-flow 要更深地绑定 Claude Code plugin、native `/goal`、hooks、plugin dependencies、external MCP、runtime evidence 和 release gate。
- **Superpowers:** 强在工作纪律、TDD、subagent-driven development 和 evidence before claims；curdx-flow 要把这类纪律产品化成运行时证据链、自动工具路由和 no false completion gate。
- **BMAD / planning workflows:** 强在需求、规划、故事、分解和执行前上下文；curdx-flow 要补的是实现之后“真跑通”的 execution assurance。
- **Playwright / Cypress:** 是测试执行工具，不是交付判断系统。它们可以产生可复跑证据，但不会自动决定 Claude Code 工作流何时可以声称完成。
- **Chrome DevTools MCP / Claude Chrome:** 是真实浏览器观察和诊断能力，不是完整交付闭环。
- **Claude Code 原生能力:** 提供 `/goal`、hooks、plugins、MCP、Chrome integration 等平台能力，但不会自动为某个项目定义完整证据链、团队完成标准和失败恢复策略。

如果有人质疑“这不就是 QA + Playwright + prompt 吗”，产品回答应是：Playwright 只能执行测试，QA workflow 只能发现问题，prompt 只能指导模型。curdx-flow 要改变的是 Claude Code 工作流里“谁有资格宣布完成”。它把完成判定从模型自述迁移到证据链，并让 `/goal`、hooks、runtime、browser/API evidence 和 failure recovery 共同执行这个判定。

市场机会来自 AI 编码工具已经显著提升代码生成速度，但“生成后能否真的跑起来”仍然依赖人工验收。curdx-flow 的创新点是将这段人工收尾流程产品化、自动化、证据化。

### Validation Approach

创新必须通过真实项目验证，而不是 prompt 评审验证。

验证方法：

- 用多个真实项目样本验证通用性：前端、后端、全栈、CLI/library、monorepo、Claude Code plugin。
- 对每个样本定义真实用户旅程，例如新增用户、登录、CRUD、保存设置、提交表单、插件安装和执行。
- 每个旅程必须产生证据链：冷启动、页面/API路径、请求/响应、日志或 trace、数据保存、UI 状态、可复跑命令。
- 设置故障注入样本：端口占用、依赖失败、后端失败、前端 JS 崩溃、DB/migration 失败、MCP 缺失、Playwright 缺失、context7 缺失、外部密钥缺失。
- 验证 no false completion：缺证据、mock-only、降级跳过、能力缺失时不得输出完成。
- 验证 `/goal` transcript：关键证据必须出现在对话或报告中，让 native `/goal` 能判断完成条件。
- 验证 curdx-flow 自身发布路径：plugin validation、installed smoke、hook freshness、version parity、dependency doctor、npm tag 和 plugin tag parity。

no false completion 必须转成机制：

- 每个任务必须有 expected user journey 或 verifier。
- 每个完成声明必须有 evidence block。
- 每个 browser-facing/full-stack 任务必须有 browser/API evidence 或明确 blocker。
- 每个失败必须保存 before/after 状态和 same-path retry。
- `/goal` condition 必须要求 transcript-visible evidence。
- TaskCompleted/Stop/PostToolBatch hook 必须检查证据缺口。
- Release 任务必须有 plugin/npm/tag/dependency evidence。

### Innovation Risk Mitigation

本节只处理产品创新带来的风险，例如复杂度、误判、市场理解和验证有效性。领域运行风险和交付范围风险分别在前后文处理。

- **风险：创新变成复杂编排平台。**
  缓解：以完成证据链为中心，不以 agent 数量、状态机复杂度或工具数量为目标。

- **风险：工具路由看似智能但实际误判。**
  缓解：每次工具选择都要记录原因、证据需求和降级影响；关键能力缺失不得静默通过。

- **风险：用户误以为 100% 自动跑通等于魔法解决所有环境问题。**
  缓解：产品承诺定义为 100% no false completion。能跑通就给证据，跑不通就给阻塞和修复路径。

- **风险：`/goal` 看不到隐藏 evidence artifact。**
  缓解：关键证据摘要必须进入 transcript 或报告，并在 `/goal` condition 中明确要求可见证据。

- **风险：企业用户担心自动化不可控。**
  缓解：保留 Personal / Team / Enterprise 模式矩阵，高风险动作受策略约束，但 no false completion 不可关闭。

- **风险：仅在 demo 项目有效。**
  缓解：验证样本必须覆盖真实项目和 chaos 场景，而不是只覆盖 happy path demo。

- **风险：用户最后仍然觉得“我还得自己验收”。**
  缓解：从 user journey 生成验证计划；不能只跑 build/test，必须打开页面/API；不能只截图，必须验证接口和数据；不能只看 Chrome，必须留下可复跑证据；不能写浅断言；不能静默降级；失败必须同路径重跑；关键证据必须让 `/goal` 可见。

## Claude Code-Native Developer Tool Specific Requirements

### Project-Type Overview

curdx-flow 是一个 Claude Code-native developer tool，同时具备 CLI、Claude Code plugin、hook runtime、skill/agent bundle、MCP/browser verification orchestrator 和 release assurance layer 的特征。它不是普通 npm CLI，也不是单一 QA 工具；它的项目类型本质是面向 Claude Code 的交付可靠性工具链。

本 PRD 使用项目类型配置中的 `developer_tool` 作为主分类，参考 `cli_tool` 作为辅助约束。主分类要求 curdx-flow 明确语言/运行时支持、安装方式、插件/API surface、示例体系和迁移路径；辅助分类要求 curdx-flow 的命令、输出、配置和脚本化行为稳定可复用。

本项目应跳过传统产品视觉设计、移动商店合规等不相关章节。但这不代表忽略 UI 质量：UI/UX 检查属于被验证项目的 evidence requirement，而不是 curdx-flow 自身的视觉产品设计重点。

### Technical Architecture Considerations

curdx-flow 的架构必须以 Claude Code 最新能力为一等公民，而不是把 Claude Code 当作普通 shell 环境。

核心架构要求：

- native `/goal` 是长任务执行和完成判断的主闭环。curdx-flow 应生成明确的 goal completion condition，要求 transcript-visible evidence，而不是依赖 Stop hook 反复续跑。
- hooks 是确定性门禁和状态保护层。Stop、TaskCompleted、PostToolBatch 等 hook 只能做低延迟、协议干净、可解释的证据检查、阻塞或提示，不能承担复杂推理主循环。
- plugin dependencies 是安装态能力边界。`pua`、`claude-mem`、`chrome-devtools-mcp`、`ui-ux-pro-max` 必须在 manifest、registry、doctor、安装验证和 release gate 中保持一致。
- 外部 MCP 能力必须被显式检测和路由。`context7`、`sequential-thinking`、Chrome DevTools MCP、浏览器能力不可用时，系统必须说明降级影响，不能静默跳过关键证据。
- Playwright 和 Chrome DevTools MCP 不互相替代。Playwright 偏可复跑用户流和长期回归；Chrome DevTools MCP 偏真实浏览器现场、console、network、DOM/CSS、性能和截图诊断。
- Auto Mode、MCP tool search、plugin-local executable、commands、routines/channels 等 Claude Code 新能力应作为激进自动化和低摩擦使用体验的候选能力，但 no false completion 仍然高于自动化便利性。
- curdx-flow 自身必须把 release 也当作最后一公里验证对象：plugin validate、installed-plugin smoke、hook freshness、dependency doctor、version parity、npm tag 和 plugin tag parity 都属于发布完成证据。

### Language Matrix

curdx-flow 自身的实现语言和运行时要求：

| Surface | Requirement |
|---|---|
| CLI source | Node 20+、TypeScript ESM、现有 `src/` 架构 |
| Hook source | TypeScript source + committed generated script bundles |
| Plugin bundle | `plugins/curdx-flow` 下的 manifest、skills、agents、hooks、schemas、templates、references |
| Config/data | JSON/YAML/Markdown schemas，必须可被 Claude Code 和本地 CLI 共同消费 |
| Evidence artifacts | JSON/Markdown + screenshots/traces/log excerpts/request-response summaries |
| Test/runtime adapters | 优先复用项目已有 npm scripts、Vitest、Playwright、curl/API checks、browser/MCP tools |
| Target projects | 通用支持前端、后端、全栈、CLI/library、monorepo、Claude Code plugin，不绑定单一框架 |

被验证项目的语言和框架应通过 runtime planner 自动识别。curdx-flow 不应假设所有项目都是 Node 项目；但自身插件和 CLI 发布链必须以 Node/npm/Claude Code plugin 机制为主。

### Installation Methods

curdx-flow 必须支持真实用户安装态，而不是只支持仓库源码态。

安装和升级要求：

- npm 包 `@curdx/flow` 必须能安装并提供 CLI 能力。
- Claude Code plugin `curdx-flow` 必须通过 `.claude-plugin/plugin.json` 正确声明名称、版本、依赖、commands、hooks 和 plugin-local executable。
- 插件依赖必须与 marketplace 标识保持一致：`pua`、`claude-mem`、`chrome-devtools-mcp`、`ui-ux-pro-max`。
- 安装流程必须包含 dependency doctor：检测 Claude Code 版本、插件依赖、外部 MCP、Chrome/DevTools、Playwright 可用性、Node/npm、hook bundles freshness。
- 升级流程必须处理版本一致性：`package.json`、plugin manifest、registry、npm package version、plugin release tag `curdx-flow--vX.Y.Z` 不得互相漂移。
- 发布前必须验证安装态 smoke，而不是只验证 repo 内源码态。

### API Surface

curdx-flow 的 API surface 不是传统 HTTP API，而是 Claude Code plugin/CLI/runtime contract 的组合。所有 surface 必须稳定、可测试、可审计。

核心 surface：

- **Plugin commands:** 用户触发 last-mile validation、report-only、fix mode、release gate、doctor、status、evidence review 的 Claude Code 入口。
- **CLI commands:** `curdx-flow` 应提供脚本化入口，用于项目检测、运行计划、验证执行、证据汇总、doctor、release gate。
- **Hooks:** Stop、TaskCompleted、PostToolBatch 等 hook 负责发现缺失证据、阻止虚假完成、写入状态或提示继续验证。
- **Runtime planner:** 输入项目结构、用户意图、变更范围和可用能力，输出验证计划和工具路由。
- **Evidence schema:** 统一描述 command、service、browser、API、data、log、screenshot、trace、failure、fix attempt、retry result。
- **Verification adapters:** Playwright/project E2E、Chrome DevTools MCP、Claude Chrome、curl/API、contract checks、ui-ux-pro-max、context7、claude-mem、pua、sequential-thinking。
- **Completion gate:** 判断一个任务是否允许声明完成；没有 evidence block 或 blocker report 时不得通过。
- **Release gate:** 判断 curdx-flow 自身是否可以 push/tag/publish；push、tag、npm/plugin release 属于高风险动作，必须有明确 release-stage 授权和证据链。

### Command Structure And Output Formats

curdx-flow 的命令体系应同时支持交互式 Claude Code 使用和脚本化验证。

命令结构要求：

- 默认入口应面向“完成这个任务并证明它可用”，而不是要求用户选择大量底层工具。
- report-only 和 fix mode 必须明确分离。report-only 不得修改代码；fix mode 可以诊断、修改、重跑。
- doctor 必须输出能力矩阵，包括 Claude Code 版本、plugin dependencies、外部 MCP、browser tools、Playwright、Node/package manager、hook bundles。
- release gate 必须输出发布证据，包括 version parity、plugin validate、installed smoke、hook freshness、test/verify 命令、tag/npm/plugin release readiness。
- 输出格式至少包括 human-readable Markdown 和 machine-readable JSON。
- 关键证据摘要必须进入对话或报告，以便 native `/goal` 能判断完成条件。

### Config Schema

curdx-flow 需要策略配置，但默认必须好用，不能让用户先写大量配置才可运行。

配置要求：

- 支持 Personal / Team / Enterprise 模式。
- 支持 action risk grading：低风险自动、中风险自动并记录、高风险需要策略允许或明确上下文。
- 支持按项目类型配置 evidence requirements，例如前端必须 browser evidence，全栈必须 browser + API + data evidence，插件发布必须 plugin/npm/tag evidence。
- 支持工具偏好和降级策略，但关键证据缺失时不得配置为静默通过。
- 支持 fix loop 上限、日志截断策略、artifact 保留路径、敏感字段处理策略。
- 支持项目级覆盖，但 no false completion 不可关闭。

### Code Examples And Fixtures

curdx-flow 必须提供能证明产品价值的示例，而不是只提供命令说明。

示例体系要求：

- 前端项目 fixture：页面可访问、console/network 检查、样式/响应式检查、截图证据。
- 后端项目 fixture：health、API response、schema/contract、日志、错误码。
- 全栈项目 fixture：新增用户或等价 CRUD，覆盖页面操作、接口调用、后端处理、数据保存、列表回显。
- Claude Code plugin fixture：manifest、dependencies、hooks、installed smoke、release tag parity。
- Chaos fixtures：端口占用、依赖失败、后端失败、前端 JS 崩、DB/migration/seed 失败、MCP 缺失、Playwright 缺失、外部 secret 缺失。
- 每个 fixture 必须有 expected evidence block 和 expected blocker behavior，用于验证 no false completion。

### Migration Guide

curdx-flow 的迁移目标是从“AI 工作流完成感”迁移到“交付证据链”。

迁移路径要求：

- 从旧的 hook-driven continuation 迁移到 native `/goal` driven execution assurance。
- 从 checklist/task done 迁移到 user journey verified。
- 从 build/test only 迁移到 cold start + browser/API/data/log evidence。
- 从“遇到失败就解释”迁移到 failure evidence + fix attempt + same-path retry。
- 从只验证源码态迁移到真实安装态和 release gate。
- 从单人 prompt 习惯迁移到可配置团队完成标准。
- 迁移文档必须包含 breaking changes、保留兼容层、推荐命令、证据示例和失败处理示例。

### Implementation Considerations

实现上应优先重塑 `plugins/curdx-flow` 的核心产品面，而不是只补几段提示词。

实施要求：

- 将 `plugins/curdx-flow/references/last-mile-autopilot.md`、`browser-verification-policy.md`、`verification-layers.md`、`failure-recovery.md`、`iron-law-verification.md` 等现有优点整合成统一的 delivery assurance contract。
- 增加或重构 evidence schema，让所有 skills、agents、hooks、CLI 输出使用同一证据语言。
- 让 plugin commands 和 CLI 都能调用同一 runtime planner，避免 Claude Code 内外行为不一致。
- 把 Chrome DevTools MCP、Playwright、API checks、context7、pua、claude-mem、ui-ux-pro-max 设计成能力 adapter，而不是散落在提示词里的建议。
- hook bundle 改动必须同时更新 source、generated scripts、plugin manifest、tests 和 freshness checks。
- 所有高风险发布动作，包括 push、tag、npm publish、plugin tag，都必须由 release gate 明确触发，不能被普通验证流程顺手执行。
- 交付实现前必须建立最小回归样本：至少覆盖一个前端、一个后端、一个全栈、一个 Claude Code plugin release smoke。

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Problem-solving MVP. curdx-flow 的第一阶段目标不是做完整 CI 平台，也不是先做企业后台，而是解决用户每天最痛的最后一公里：AI 写完代码以后，项目必须真实安装、启动、运行、验证；不能跑通就输出阻塞证据，不能虚假完成。

**Resource Requirements:** MVP 至少需要具备 Claude Code plugin 架构、Node/TypeScript CLI、hooks、浏览器/API 验证、测试自动化和发布流程经验的实现能力。单人可以启动，但必须按架构师级别建立 evidence schema、runtime planner、plugin dependency doctor 和回归 fixtures，避免只堆提示词。

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**

- 高级 AI 编码开发者：功能真实跑通。
- 高级 AI 编码开发者：失败自动恢复。
- QA/验收者：report-only 报告模式的基础版本。
- 技术负责人/架构师：基础团队完成标准和 evidence report。
- curdx-flow 维护者：插件自身发布前验证链。

**Must-Have Capabilities:**

- 通用项目检测和运行计划生成，覆盖前端、后端、全栈、CLI/library、monorepo、Claude Code plugin。
- native `/goal` completion condition 生成，要求 transcript-visible evidence。
- evidence schema：统一描述命令、服务、页面、API、数据、日志、截图、trace、失败、修复、重跑结果。
- runtime planner：根据用户意图、项目类型、变更范围和可用工具生成验证路径。
- 浏览器证据路由：Playwright/project E2E 用于可复跑验证，Chrome DevTools MCP 用于真实浏览器诊断。
- API/contract evidence：状态码、请求/响应、schema、错误码、前后端契约。
- 数据保存或状态变化证明，特别是新增用户、CRUD、保存设置、提交表单等真实业务流。
- 失败闭环：捕获失败证据、定位层级、尝试修复、同路径重跑、超过次数后输出 blocker。
- report-only 和 fix mode 基础分离：report-only 不改代码，fix mode 可诊断修改并重跑。
- dependency doctor：检测 Claude Code 版本、plugin dependencies、外部 MCP、Playwright、Chrome/DevTools、Node/npm、hook bundle freshness。
- no false completion gate：缺少 evidence block 或 blocker report 时不得声明完成。
- curdx-flow 自身 release gate：plugin validate、installed smoke、hook freshness、version parity、dependency doctor、npm tag/plugin tag readiness。
- 最小真实 fixtures：至少覆盖一个前端、一个后端、一个全栈、一个 Claude Code plugin release smoke。
- chaos scenarios 基础覆盖：端口占用、依赖失败、前端成功后端失败、后端成功页面 JS 崩、DB/seed 失败、MCP/Playwright 缺失、外部 secret 缺失。

### Post-MVP Features

**Phase 2 (Post-MVP):**

- 更强的 report-only QA 模式，包括健康评分、严重等级、复现步骤、截图/trace 汇总。
- 自动生成或补强 Playwright/project E2E 脚本。
- 更丰富的 Chrome DevTools MCP 诊断，包括 console、network、DOM/CSS、performance 和响应式布局。
- 团队级 completion standard 配置，支持不同项目类型、风险等级、功能类型的证据要求。
- 更完整的 fixtures 和 regression suite，覆盖更多框架和 monorepo 形态。
- claude-mem 历史失败复用和 pua 并行诊断增强。
- evidence artifact 管理优化，包括日志截断、artifact 索引、报告摘要。

**Phase 3 (Expansion):**

- 企业级治理：组织策略、审计报告、可选脱敏导出、保留策略。
- CI、部署、canary、生产健康检查集成。
- 多项目、多团队 completion policy marketplace。
- 更完整的外部 MCP adapter 体系。
- 团队 dashboard 或集中化 evidence review。
- 插件生态级 release assurance 标准化。

### Risk Mitigation Strategy

**Technical Risks:** 最大技术风险是把 curdx-flow 做成提示词集合，而不是可执行的证据链系统。缓解方式是优先实现 evidence schema、runtime planner、tool adapters、doctor、completion gate 和真实 fixtures；hooks 保持低延迟、协议干净，复杂执行交给 `/goal` 和 runtime。

**Market Risks:** 最大市场风险是用户觉得“还是要我自己验收”。MVP 必须用真实全栈场景证明价值，例如新增用户：页面操作、接口响应、后端日志、数据保存、列表回显和同路径重跑都要有证据。

**Resource Risks:** 如果资源不足，不能削掉 no false completion 和真实运行证据。可以缩小支持框架数量、fixtures 数量和企业治理深度，但必须保留一个可用的 Claude Code-native last-mile validation loop。最小团队需要产品/架构、TypeScript/CLI、Claude Code plugin/hooks、浏览器/API 验证四类能力；单人实现时也要按这些职责拆分工作。

## Functional Requirements

FR1-FR77 是后续架构、Epic、Story 和开发实现的能力合同。任何未来要实现的能力都必须能追溯到这些 FR，未列出的能力不得被默认假设存在。

### Work Intake & Completion Definition

- FR1: 用户可以请求 curdx-flow 验证一个 AI 编码任务是否真实完成。
- FR2: 用户可以为一次任务声明期望的用户旅程或核心业务路径。
- FR3: 系统可以根据用户请求识别该任务需要证明的完成条件。
- FR4: 系统可以区分代码完成、运行完成、业务流完成和发布完成。
- FR5: 系统可以在缺少完成证据时阻止任务被声明为完成。

### Project Understanding & Runtime Readiness

- FR6: 系统可以识别当前项目的类型、入口、运行方式和验证方式。
- FR7: 系统可以识别前端、后端、全栈、CLI、库、monorepo 和 Claude Code plugin 项目。
- FR8: 系统可以生成并执行本地运行准备计划，包括依赖、服务、健康检查和验证入口。
- FR9: 系统可以检测项目已有的测试、脚本、开发服务和验证命令。
- FR10: 系统可以发现阻止项目运行的环境缺口，并把缺口标记为 blocker。
- FR11: 系统可以处理多个服务或多个项目根目录的运行上下文。

### Evidence-Based Verification

- FR12: 系统可以为每次完成声明生成符合统一 schema 的 evidence block。
- FR13: 系统可以记录命令执行结果、退出码、关键输出和失败摘要。
- FR14: 系统可以验证本地服务是否启动并可访问。
- FR15: 系统可以验证用户指定的核心业务流是否真实执行。
- FR16: 系统可以保存截图、trace、日志片段、请求响应摘要和状态变化证明。
- FR17: 系统可以把关键证据摘要呈现在对话或报告中，供完成判断使用。
- FR18: 系统可以在验证无法完成时生成 blocker report，而不是生成成功声明。

### Browser, API & Data Flow Assurance

- FR19: 系统可以验证浏览器页面是否真实打开并完成用户操作。
- FR20: 系统可以检查页面运行时错误、console 问题、network 请求和响应状态。
- FR21: 系统可以验证前端操作是否触发预期 API 请求。
- FR22: 系统可以验证 API 响应是否符合任务要求。
- FR23: 系统可以验证后端处理结果是否与前端状态一致。
- FR24: 系统可以验证数据是否真实保存或状态是否真实改变。
- FR25: 系统可以验证 UI 状态是否反映后端或数据层结果。
- FR26: 系统可以对前端或全栈任务要求 browser evidence 和 API evidence，除非存在明确 blocker。

### Failure Recovery & Same-Path Retry

- FR27: 系统可以在验证失败时记录失败症状、复现路径和影响层级。
- FR28: 系统可以把失败归类为环境、依赖、前端、后端、接口、数据、浏览器能力或外部服务问题。
- FR29: 系统可以生成修复计划并在允许模式下尝试修复。
- FR30: 系统可以在修复后重跑同一条失败路径。
- FR31: 系统可以记录修复前、修复后和重跑结果。
- FR32: 系统可以在超过修复上限时停止反复修改，并输出 root-cause 或人工阻塞报告。

### Operating Modes & Governance

- FR33: 用户可以选择 report-only 模式，只生成验证报告而不修改代码。
- FR34: 用户可以选择 fix mode，允许系统诊断、修改并重跑验证。
- FR35: 系统可以区分低风险、中风险和高风险动作。
- FR36: 系统可以自动执行低风险和策略允许的中风险动作。
- FR37: 系统可以在高风险动作前要求明确授权或 release-stage 上下文。
- FR38: 团队用户可以配置不同项目类型、风险等级和功能类型的完成标准。
- FR39: 企业用户可以配置证据保留、共享、审计和脱敏策略。
- FR40: 系统可以保证 no false completion 规则不能被关闭。

### Capability Routing & Dependency Readiness

- FR41: 系统可以检测 Claude Code 版本、插件依赖、外部 MCP、浏览器能力、Playwright、Node 和包管理器状态。
- FR42: 系统可以为每项验证需求选择并调用合适的可用能力，并记录选择理由。
- FR43: 系统可以在关键能力不可用时说明降级影响。
- FR44: 系统可以在能力缺失但可修复时生成 remediation。
- FR45: 系统可以使用历史失败、官方文档和并行诊断能力辅助复杂问题处理。
- FR46: 系统可以维护插件依赖和外部能力的一致性状态。

### Reporting & Review

- FR47: 用户可以查看一次任务的完整验证报告。
- FR48: 用户可以查看通过项、失败项、阻塞项、修复尝试和最终结论。
- FR49: 技术负责人可以根据报告判断一个任务是否可合并或可交付。
- FR50: QA 用户可以获得包含复现步骤、严重等级和证据链接的 report-only 报告。
- FR51: 系统可以输出 human-readable 和 machine-readable 两类报告，并维护 artifact 索引。
- FR52: 系统可以为日志过大、敏感信息或外部服务缺失场景提供可审查摘要。

### Plugin Self-Validation & Release Readiness

- FR53: 维护者可以验证 curdx-flow 插件自身是否处于可发布状态。
- FR54: 系统可以检查 plugin manifest、registry、依赖声明和版本一致性。
- FR55: 系统可以验证 hook source 与 generated hook bundles 是否一致。
- FR56: 系统可以验证插件安装态 smoke，而不仅是仓库源码态。
- FR57: 系统可以检查 npm package version 与 Claude Code plugin release tag 是否一致。
- FR58: 系统可以在 push、tag、npm publish 或 plugin release 前要求 release evidence。
- FR59: 系统可以在 release gate 未通过时输出阻塞原因和修复路径。

### Execution State, Safety & Recovery

- FR60: 系统可以为每次验证创建运行记录，包含任务范围、模式、策略、期望旅程和验证状态。
- FR61: 系统可以在会话中断、上下文压缩或进程重启后恢复未完成验证。
- FR62: 系统可以识别工作区已有改动，并避免覆盖或回滚与本次任务无关的用户改动。
- FR63: 系统可以记录验证和修复过程中执行过的动作、风险等级、结果和证据位置。
- FR64: 系统可以管理由验证启动的本地服务，并在完成或失败时记录清理状态。
- FR65: 系统可以区分源码改动、生成的验证文件、临时 artifact 和用户已有文件。
- FR66: 系统可以对高风险动作请求并记录明确授权。

### Tool Installation & Capability Remediation

- FR67: 系统可以检测缺失的 companion plugins、MCP servers、skills 和浏览器验证能力。
- FR68: 系统可以在策略允许时自动安装、启用或更新缺失能力。
- FR69: 系统可以验证已安装能力是否真实可调用，而不是只检查配置存在。
- FR70: 系统可以在能力无法启用时输出 remediation plan 和完成阻塞影响。

### Verification Data & Gap Handling

- FR71: 系统可以创建、识别或检查验证所需的数据记录，以证明状态真实持久化。
- FR72: 系统可以区分自动验证通过、人工确认通过、部分通过和未验证。
- FR73: 系统可以把用户原始需求逐项映射到已有证据，并列出未覆盖 gap。
- FR74: 系统可以从 blocker report 生成下一步可执行修复计划。
- FR75: 系统可以明确列出未验证范围，并禁止把未验证范围包装成成功结论。

### Release Safety

- FR76: 系统可以执行 release dry-run，验证 push、tag、npm publish 和 plugin release 前置条件，而不实际发布。
- FR77: 系统可以要求显式 release-stage 授权后才允许 push、tag、npm publish 或 plugin release。

## Non-Functional Requirements

NFR1-NFR30 是 no false completion、证据可信度、运行安全和发布可靠性的质量门槛。它们定义系统做得多可靠、多可审查、多不容易误伤用户工作区。

### Completion Integrity & Reliability

- NFR1: 已声明完成的任务必须具备 evidence block 或 blocker report；false completion 目标为 0。
- NFR2: 前端或全栈任务缺少 browser/API/data evidence 时，系统必须标记为 blocker 或未验证，不得标记为完成。
- NFR3: 任何修复后的成功结论必须来自同一失败路径的重跑结果。
- NFR4: 系统必须在长任务、会话中断、上下文压缩或进程重启后保留足够状态，以恢复验证上下文。
- NFR5: report-only 模式不得修改源码；生成的报告或 artifact 必须与源码改动可区分。

### Performance & Runtime Behavior

- NFR6: hook 检查必须保持低延迟，不得在 hook 内执行长时间浏览器验证、复杂推理或修复循环。
- NFR7: doctor/status 类检查应优先快速给出能力矩阵；耗时检查必须标记为 deep check 或异步验证项。
- NFR8: 长时间验证必须持续输出可见进度、当前阶段和下一步，避免用户误以为流程卡死。
- NFR9: 大日志不得完整塞入对话；系统必须截取关键窗口并保留 artifact 路径。
- NFR10: 多服务启动和清理必须记录服务状态，避免遗留不可解释的本地进程。

### Security, Privacy & Local Safety

- NFR11: 系统不得默认导出完整 token、cookie、secret、生产数据或数据库 dump。
- NFR12: 本地完整证据可以保留，但 share/export 场景必须支持摘要、脱敏或明确 local-only 标记。
- NFR13: 高风险动作，包括 destructive migration、全局配置变更、push、tag、npm publish 和 plugin release，必须有显式授权或 release-stage 上下文。
- NFR14: 系统必须识别工作区已有改动，并避免覆盖、回滚或混淆用户原有改动。
- NFR15: 自动安装、启用或升级能力时，必须记录动作、范围、结果和失败补救建议。

### Integration & Compatibility

- NFR16: curdx-flow 必须兼容当前支持的 Claude Code plugin、hooks、`/goal`、MCP 和 plugin dependency 机制。
- NFR17: 涉及最新 Claude Code 行为的实现和文档必须以官方文档或本机 `claude` 行为为准。
- NFR18: 插件依赖、registry、manifest、CLI 和 release gate 中的版本与 marketplace 标识必须保持一致。
- NFR19: 外部 MCP、companion plugins、Playwright、Chrome/DevTools、Node/npm 能力不可用时，系统必须明确降级影响。
- NFR20: 验证能力必须支持降级，但关键证据缺失不得被降级为成功。

### Evidence Quality & Auditability

- NFR21: evidence block 必须包含任务范围、验证路径、执行结果、关键证据、未验证范围和最终结论。
- NFR22: blocker report 必须包含失败原因、复现路径、影响范围、已尝试动作和下一步修复建议。
- NFR23: 报告必须同时支持人类可读摘要和机器可读 artifact 索引。
- NFR24: 技术负责人或 QA 应能仅凭报告判断任务是否可交付、需修复或需人工确认。
- NFR25: 所有完成结论必须可追溯到命令、浏览器/API/data/log evidence 或明确人工确认。

### Maintainability & Release Readiness

- NFR26: hook source、generated hook bundles、plugin manifest、registry 和 tests 必须保持同步。
- NFR27: curdx-flow 自身 release 前必须通过 build、typecheck、hook freshness、plugin validate、installed smoke 和 version parity。
- NFR28: release dry-run 必须能在不 push、不 tag、不 publish 的情况下验证发布前置条件。
- NFR29: 插件核心行为必须有回归 fixtures 覆盖前端、后端、全栈和 Claude Code plugin release smoke。
- NFR30: 新增能力必须接入统一 evidence schema 和 runtime planner，避免散落成不可验证提示词。
