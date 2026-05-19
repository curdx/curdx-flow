# Extract: get-shit-done（上游差异视角）

> 分析日期：2026-05-18
> 分析者视角：curdx-flow 是 get-shit-done 的 fork。默认立场是「接管型 fork」，不做上游 sync，只评估上游有没有 curdx-flow 尚缺的优点值得手工借鉴。

---

## 上游近况

**最近 30 commit 概要（2026-05 为主）：**

- `fix: honor workstream in verify-work init (#3386)` — workstream 路由修复
- `feat: generate release notes from changeset slugs (#3383)` — 变更日志自动生成
- `feat(3309): workflow.human_verify_mode = end-of-phase` — 将人工验证检查点从 mid-flight 改为 end-of-phase 默认值，减少中途阻塞
- `fix: block verifier pass on unresolved debt markers (#3343)` — 拦截未解决 debt 标记的误通过
- `fix: add executor stall recovery contract (#3329)` — executor 卡死时的恢复合约
- `fix(verifier): require direct probe execution` — 强制 probe 直接执行
- `feat(sdk): add NON_FAMILY_COMMAND_ALIASES` — manifest 中补全 14 个缺失命令别名
- `feat(3255): add --json-errors structured error mode to gsd-tools` — CLI 结构化错误输出
- `docs(adr): add docs/adr/README.md index + structural ADR test` — ADR 索引和结构检验
- `Refactor SDK-first architecture seams (#3316)` — SDK 分层模块重构

**与 curdx-flow 的关系：**
- curdx-flow 初始 fork 时间推断为 2025 年初（最早 commit 2025-12-14，但 curdx-flow 于 2026-04-28 完成品牌独立，不含 gsd 命令架构）
- curdx-flow 已在 v5.0.0 将所有 commands 迁移为 skills，v6.0.0 完成完整品牌切换，两者架构已大幅分叉
- get-shit-done 仍保留 `commands/gsd/*.md` + `get-shit-done/workflows/*.md` + `gsd-tools.cjs` 三层架构；curdx-flow 仅保留 `skills/<name>/SKILL.md` + agents + hooks 三层

**最后一次同步点（估算）：**
- 依据 curdx-flow `384d07b`（"revert to commands-based architecture from upstream v5.0.2"，2026-04-28）推断，最后实质性同步点约为 get-shit-done v1.35–v1.36 区间（2025 年末至 2026 年初）。之后 curdx-flow 已独立演化，当前版本号 7.3.0 vs 上游约 1.42.x。

---

## 上游有 / curdx-flow 没有 的特性清单

| 特性 | 路径 | 简述 | 评估 |
|---|---|---|---|
| context-window 监控 hook | `hooks/gsd-context-monitor.js` | PostToolUse hook，≤35% 剩余时注入 WARNING，≤25% 注入 CRITICAL；通过 /tmp 桥接 statusline | 借鉴 |
| prompt-guard hook | `hooks/gsd-prompt-guard.js` | PreToolUse，扫描写入 `.planning/` 的内容是否含注入模式，advisory-only | 借鉴 |
| read-guard hook | `hooks/gsd-read-guard.js` | PreToolUse，对非 Claude Code 运行时提醒 Read-before-edit，防无限循环 | 剔除 |
| workflow-guard hook | `hooks/gsd-workflow-guard.js` | PreToolUse，在无 GSD workflow 上下文时提醒使用 quick/fast，soft guard | 剔除 |
| `human_verify_mode = end-of-phase` 默认值 | `docs/CONFIGURATION.md:L≈115` | 将人工验证检查点从 mid-flight 移到 phase 结束，减少中途阻塞 | 借鉴 |
| 结构化 ADR 文档体系 | `docs/adr/0001…0007` | 8 条已接受 ADR，覆盖 dispatch/model-catalog/worktree-workstream/SDK seam map 等 | 借鉴 |
| 每 phase 类型模型选择 | `docs/FEATURES.md:#126` + `docs/CONFIGURATION.md` | `models.planning/research/execution/verification` 配置键，可精细控制 agent 用哪个模型 tier | 必搬 |
| 动态路由 + 失败层级升级 | `docs/FEATURES.md:#127` | soft failure 时自动升级到更强模型，`max_escalations` 防止失控成本 | 必搬 |
| TDD 管道模式 | `docs/FEATURES.md:#116` + `commands/gsd/execute-phase.md` | `workflow.tdd_mode` 开关；planner 识别 TDD 任务，executor 强制 RED/GREEN/REFACTOR 门控 | 必搬 |
| 上下文窗口利用率卫士 | `docs/FEATURES.md:#124` | `gsd-health --context`：60%=warn，70%=critical；同时暴露为 SDK query verb | 借鉴 |
| Plan Bounce（外部脚本验证计划） | `docs/FEATURES.md:#108` | `--bounce` 把 PLAN.md 送给外部脚本再跑一次 plan-checker，YAML 损坏时自动回滚 | 剔除 |
| Agent 尺寸预算执行 | `docs/FEATURES.md:#119` + `tests/agent-size-budget.test.cjs` | CI 强制检查 agent 文件行数，三档（XL/Large/Default）；frontmatter `size:` 标注 | 借鉴 |
| 共享 boilerplate 抽提 | `docs/FEATURES.md:#120` | `references/mandatory-initial-read.md` + `references/project-skills-discovery.md`，agent 按需 `@` 加载 | 剔除 |
| 跨 AI 执行委托 | `docs/FEATURES.md:#110` | `--cross-ai` 把 plan 送给外部 AI CLI 执行，需 `workflow.cross_ai_command` | 剔除 |
| 验证债务追踪 | `docs/FEATURES.md:#40` | `status: partial`（UAT 区分会话结束与全解决）、`result: blocked with blocked_by` | 必搬 |
| 执行器停滞恢复合约 | `agents/gsd-planner.md + FEATURES.md` | executor stall 时的恢复步骤合约（`fix: add executor stall recovery contract #3329`） | 借鉴 |
| 全局知识存储 + planner 注入 | `docs/FEATURES.md:#89` | `features.global_learnings` opt-in；phase 完成后自动推送到全局学习库，下次 planner spawn 时注入 | 剔除 |

---

## 必搬（≤ 5 项）

### 1. 每 phase 类型模型选择（Per-Phase-Type Model Selection）

**外部 consensus：**
GSD 在 v1.41（2026 年初）正式落地 `models.planning/research/execution/verification` 配置键（`docs/FEATURES.md:#126`，`docs/CONFIGURATION.md` 有详细 schema）。设计来源于社区反馈：全局 `model_profile` 太粗，`model_overrides` 太细，phase-type 槽位是中间层。

**curdx-flow 缺口：**
curdx-flow 目前无任何 per-phase 或 per-agent 模型控制机制（`src/runtime/` 下无 model-catalog、`plugins/curdx-flow/skills/` 中无 model 相关配置键）。用户无法在 research 阶段用大模型、execution 阶段用小模型，成本控制完全依赖 Claude Code 全局设置。

**不搬代价：**
用户做复杂 spec workflow 时，所有 subagent 都使用同一模型，贵且慢；或用户手动修改 Claude Code 模型设置，但这会影响所有会话而不是单次 spec。

**置信度：High** — 上游实测已运行多个 RC 版本，feature spec 清晰，config key 语义简单可独立移植。

---

### 2. 动态路由 + 失败层级升级（Dynamic Routing with Failure-Tier Escalation）

**外部 consensus：**
GSD `#3031`（docs/FEATURES.md:#127），`dynamic_routing.enabled` 控制开关，`tier_models[default_tier]` 首次 spawn 用便宜模型，orchestrator 检测到 soft failure（verification inconclusive / plan-check FLAG）时自动升一级，`max_escalations` 封顶。

**curdx-flow 缺口：**
curdx-flow 中 coordinator 发现 subagent 失败后只会重新 spawn，没有模型层级升级机制，会无限用同一模型重试，既贵又效果相同。

**不搬代价：**
soft failure（验证不确定而非明确失败）会被当作硬失败处理或无限重试，用户需手动介入切换模型。

**置信度：Medium-High** — 上游 feature 成熟，但 curdx-flow 的 coordinator 逻辑与 gsd-executor 架构不同，需要在 skill 层而非 gsd-tools 层实现，要做适配而非直接拷贝。

---

### 3. TDD 管道模式（TDD Pipeline Mode）

**外部 consensus：**
GSD v1.36（`docs/FEATURES.md:#116`），`workflow.tdd_mode` 开关；planner 对符合条件的任务打 `type: tdd`；executor 强制 RED commit（`test(...)`）先于 GREEN commit（`feat(...)`）；end-of-phase 汇总 TDD Gate Compliance。

**curdx-flow 缺口：**
curdx-flow 目前无 TDD 模式。`tasks/SKILL.md` 中任务类型无 `tdd` 区分，`spec-executor.md` 无 RED/GREEN 门控。对于测试驱动的团队，只能靠提示词约束，无法强制执行。

**不搬代价：**
用户描述 TDD 需求时，agent 没有执行层面的保证机制，RED 阶段测试已通过（逻辑预存在）的问题无法被检测，形成静默错误。

**置信度：Medium** — 概念清晰，但实现需同时修改 task-planner agent 和 spec-executor agent，以及 stop-watcher 的 verification 检查，改动面较广。

---

### 4. 验证债务追踪（Verification Debt Tracking）

**外部 consensus：**
GSD `docs/FEATURES.md:#40`；引入 `status: partial`（区分"会话结束"与"测试全通过"）和 `result: blocked with blocked_by` tag；`/gsd-progress` 每次调用扫描所有 phase 的 pending/skipped/blocked items，非阻塞警告。

**curdx-flow 缺口：**
curdx-flow 的 `stop-watcher.mjs` 和 `task-completed-verifier.mjs` 只检查当前 spec 的验证块是否存在，不追踪 debt 状态（blocked_by、partial、跨 phase 积累）。verification block 要么通过要么 block，没有中间态。

**不搬代价：**
用户绕过验证（标记 blocked 但没有 blocked_by）时，进入下一 spec 后 debt 无从追踪，积累到后期才爆发。

**置信度：High** — 概念简单，只需在 verification block schema 和 stop-watcher 检查逻辑中加入新状态，无需大重构。

---

## 借鉴（≤ 5 项）

### 1. context-window 监控 hook（gsd-context-monitor.js）

上游在 `PostToolUse` 读取 statusline 写入 `/tmp/claude-ctx-{session}.json` 的指标，在 ≤35% 剩余时给 agent 注入 WARNING 上下文，≤25% 时注入 CRITICAL。设计思路：user-facing statusline + agent-facing warning 桥接。

**curdx-flow 缺口：** curdx-flow 无任何 context window 用量感知。agent 在高用量情况下继续执行，质量下降无感知。

**借鉴方向：** 不照搬 /tmp 桥接方案（curdx-flow 无 statusline 组件），但可在 `PostToolBatch` 或 `PostToolUse` hook 中利用 Claude Code 注入的 `context_window` 字段实现轻量版：用量 > 70% 时给 coordinator 注入一条 `additionalContext` 警告。

**置信度：Medium** — Claude Code hook 是否在所有 event 上暴露 `context_window` 字段需验证。

---

### 2. prompt-guard hook（gsd-prompt-guard.js）

PreToolUse hook，扫描写入 `.planning/` / `specs/` 的 Write/Edit 内容是否含 prompt injection 模式（`ignore all previous instructions`、`act as...`、Unicode 零宽字符等），advisory-only，不阻断。

**curdx-flow 缺口：** curdx-flow 无此防护。specs 文件内容可能来自外部用户输入（如 triage 分解后的第三方 issue 描述），存在注入风险。

**借鉴方向：** 在 `stop-watcher.mjs` 或新增 `pre-tool-injection-guard.mjs` hook 中加入轻量扫描，仅覆盖 `specs/` 目录写入，保持 advisory-only。

---

### 3. `human_verify_mode = end-of-phase` 语义

`docs/CONFIGURATION.md` 中 `workflow.human_verify_mode` 配置键（GSD #3309）：默认 `end-of-phase` 把人工验证检查点集中到 phase 结束，`mid-flight` 保留旧行为。这改善了 autonomous 模式下频繁 checkpoint 阻塞的体验。

**curdx-flow 缺口：** curdx-flow 的 `stop-watcher.mjs` 当前只有 iron-law gate，没有人工检查点和"end-of-phase 批量"的概念区分。随着 spec workflow 变复杂，mid-flight 阻塞会成为摩擦点。

**借鉴方向：** 在 `curdx-state.json` schema 和 `stop-watcher` 中引入 `human_verify_mode` 语义，允许用户配置。

---

### 4. Agent 尺寸预算执行（CI lint）

GSD CI 中 `tests/agent-size-budget.test.cjs` 强制检查 agent 文件行数（XL ≤1600/Large ≤1000/Default ≤500），frontmatter `size:` 标注触发分档。

**curdx-flow 缺口：** curdx-flow 当前 `qa-engineer.md`（447 行）、`research-analyst.md`（436 行）等 agent 已接近上游 Default 上限，未来可能超出。无 CI 防守。

**借鉴方向：** 在 `scripts/` 加一个轻量 lint 脚本，加入 `npm test` 或 CI workflow。不需要 `size:` frontmatter，直接硬上限 500 行即可（curdx-flow agent 数少）。

---

### 5. 结构化 ADR 体系（docs/adr/）

GSD 有 7 条已接受 ADR，覆盖 dispatch/model-catalog/worktree-workstream/SDK seam map 等核心架构决策，且有 CI 结构检验（`docs/adr/README.md`）。

**curdx-flow 缺口：** curdx-flow 目前架构决策散落在 commit message 中，无正式 ADR 文档。随着 runtime/hooks/registry 复杂度提升，此缺口会加大。

**借鉴方向：** 在 `.planning/adr/` 或 `docs/adr/` 下建 ADR 骨架，记录已有的关键决策（如「exit-0 invariant」「hook bundle 必须进 git」「Coordinator-In-One-Turn」），无需 CI 检验。

---

## 剔除（≤ 8 项）

| 项 | 不搬理由 |
|---|---|
| `gsd-read-guard.js`（Read-Before-Edit Hook） | Claude Code 原生已强制 read-before-edit（hook 代码内部已检测 `session_id` 并 exit 0）；curdx-flow 只目标 Claude Code，无此需求 |
| `gsd-workflow-guard.js`（工作流外编辑警告） | curdx-flow 哲学是 spec workflow，不追求"引导用户改用 /quick"；soft guard 实际效果低，噪音高 |
| Plan Bounce（外部脚本验证计划） | curdx-flow 无 PLAN.md 文件概念（tasks.md 替代），且引入外部脚本依赖与「零运行时 npm 依赖」约束冲突 |
| 跨 AI 执行委托（--cross-ai） | 哲学冲突：curdx-flow 是 Anthropic-first，Claude Code-only；跨 AI 委托增加未测试的复杂度和 API 绑定 |
| 共享 boilerplate 抽提（references/mandatory-initial-read.md） | curdx-flow agent 数只有 10 个，未到需要共享 boilerplate 的规模；过早优化 |
| 全局知识存储（Global Learnings Store） | claude-mem MCP 已覆盖此功能，且比 `.planning/learnings/` 方案跨会话能力更强；重复实现 |
| 更新横幅 opt-in（gsd-update-banner hook） | curdx-flow 通过 marketplace git source 分发，Claude Code 原生有插件更新提示，不需要额外 banner hook |
| GSD SDK / gsd-tools.cjs CLI 层 | 上游用 gsd-tools.cjs 做 SDK 桥接是因历史包袱（CJS/ESM 混合、多 runtime 支持）；curdx-flow 已用纯 ESM hook bundle + runtime-cli.mjs，架构更干净，不应引入 CJS 层 |

---

## 不确定 / 需用户决策

**Q1：是否要主动跟一次上游 patch（cherry-pick）？**

结论：**不建议**。上游 commit 已超过 3386 条，架构（commands vs skills、gsd-tools.cjs vs runtime-cli.mjs、.planning/ vs specs/）大幅分叉，cherry-pick 会引发大量冲突。「接管型 fork」原则下，值得搬的内容应手工提炼后以 curdx-flow 原生方式实现。

**Q2：Per-Phase 模型选择的 config 存在哪里？**

上游存在 `.planning/config.json` 下的 `models` 键。curdx-flow 当前无 per-project config 文件。需要决策：
- 选项 A：引入 `.curdx/config.json`（类 `.planning/config.json`）
- 选项 B：放入 `.curdx-state.json` 的 per-spec 配置节
- 选项 C：作为 `curdx-flow:start` skill 参数

**Q3：TDD 模式是否优先？**

TDD 管道涉及修改 `task-planner.md`、`spec-executor.md`、stop-watcher verification 逻辑，工作量约 M 级。如当前用户主要是个人项目，可延后到 v8.0。

---

*分析基于：`git log --oneline -50`（上游）、`docs/FEATURES.md`（128 条 feature + 3 条 canary）、`docs/CONFIGURATION.md`、`hooks/*.js`（6 个 hook 文件）、curdx-flow `ARCHITECTURE.md` + `plugins/curdx-flow/` 实际结构。未全读上游 1507 文件。*
