# Extract: everything-claude-code

> 分析日期：2026-05-18
> 消费方：curdx-flow（Claude Code 插件 + npm 安装器）
> 源仓库：`/Users/wdx/opc/everything-claude-code`（affaan-m/everything-claude-code，140K+ stars）

---

## 一句话定位

一个以"Agent 性能优化系统"为定位的大型 Claude Code 插件合集，包含 55 个专业 agent、208 个 skill、72 个 legacy command shim、完整的 hook 矩阵和持续学习基础设施，经 10+ 个月生产日用打磨而来，Anthropic Hackathon 获奖项目。

---

## 它的独特价值（你看完后的 thesis）

- **Hook 运行时的防御深度**：不只是简单的 Stop/Start hook，而是一套多层 PreToolUse 拦截体系（config-protection、gateguard-fact-force、doc-file-warning）+ 环境变量级的 `ECC_HOOK_PROFILE=minimal|standard|strict` 开关，让用户可以在不动代码的情况下缩小/扩大 hook 覆盖面（`hooks/hooks.json:75-100`，`scripts/lib/hook-flags.js:1-35`）。
- **Skill 自进化基础设施**：`continuous-learning-v2` 用 PreToolUse/PostToolUse hook 做 100% 可靠观察，将观测凝结为带置信分的原子"instinct"，再经聚类演进为 skill/command/agent，并支持跨项目隔离 + 全局提升（`skills/continuous-learning-v2/SKILL.md:1-90`，`skills/continuous-learning-v2/scripts/instinct-cli.py:1-40`）。
- **可量化的 harness 健康度**：7 维打分的 `harness-audit.js` 脚本（Tool Coverage、Context Efficiency、Quality Gates、Memory Persistence、Eval Coverage、Security Guardrails、Cost Efficiency），满分 70 分可重复计算，不依赖主观判断（`scripts/harness-audit.js:1-80`，`commands/harness-audit.md:1-60`）。
- **Skill 健康追踪**：`skill-runs.jsonl` + `skill-evolution/health.js` 记录每个 skill 的成功率/衰减趋势，能检测 declining skill，而非仅靠主观印象感知技能是否仍有效（`scripts/lib/skill-evolution/health.js:1-60`，`scripts/lib/skill-evolution/tracker.js:1-60`）。
- **安全攻防视角写入 guide**：CVE-2025-59536 / CVE-2026-21852 实例 + 攻击链图 + Simon Willison 的"lethal trifecta"框架，系统地把 hook/MCP/设置文件攻击面的认知写进了可直接传递给用户的 guide 文档（`the-security-guide.md:1-80`）。

---

## 必搬（≤ 5 项）

### 1. Hook Profile 系统（ECC_HOOK_PROFILE + ECC_DISABLED_HOOKS）

- **它是什么**：`scripts/lib/hook-flags.js` 实现了一个纯环境变量驱动的 hook 开关层：`ECC_HOOK_PROFILE=minimal|standard|strict` 控制全局开关，`ECC_DISABLED_HOOKS=id1,id2` 精确禁用单条 hook，无需修改 JSON 文件。每个 hook 脚本通过 `run-with-flags.js` 包装后，自动遵守 profile 声明的激活条件（`scripts/lib/hook-flags.js:1-55`，`scripts/hooks/run-with-flags.js:1-60`，`hooks/hooks.json:40-100`）。
- **外部 consensus**：ECC 仓库 140K+ stars、6K+ forks，`ECC_HOOK_PROFILE` 在 v1.8.0 changelog 中作为核心功能专门发布，并在 `the-longform-guide.md` 的"Token Optimization"章节中被显式推荐为运行时控制方案。
- **curdx-flow 当前缺口**：ARCHITECTURE.md 第"Architectural Constraints"节说明所有 hook 均通过 `runHook()` 封装，错误只能 exit-0，没有运行时开关机制。hook 开关只能通过改 `hooks.json` 或改源码 + rebuild 实现，无环境变量级热切换（ARCHITECTURE.md 第 205-211 行）。
- **不搬代价**：用户无法在不修改文件的情况下临时降低 hook 覆盖面（如在低功耗开发设备或 CI 环境中跳过昂贵的后处理 hook），也无法灰度测试新 hook。
- **置信度**：High — 机制简单（纯环境变量 + 包装脚本），与 curdx-flow 现有 `runHook` 模式完全正交，不需要改架构，只需在 `run-hook.ts` 加一层 profile 检查。

---

### 2. GateGuard Fact-Forcing（PreToolUse 事实索取门）

- **它是什么**：`scripts/hooks/gateguard-fact-force.js` 在首次 Edit/Write/MultiEdit 一个文件前，强制 Claude 先列出该文件的 importers、公开 API、数据 schema，然后才允许写入；对破坏性 Bash（`rm -rf`、`git reset --hard` 等）也要求先列出目标和回滚方案（`scripts/hooks/gateguard-fact-force.js:1-60`）。逻辑：与其问"你确定吗"（LLM 必然回答"是"），不如让 LLM 先做一次实地调查，调查本身制造了 awareness。
- **外部 consensus**：该实现引用了 `pip install gateguard-ai` 包（`github.com/zunoworks/gateguard`），是独立维护的上游项目；ECC 将其作为 pre:edit-write:gateguard-fact-force hook 内置，随 140K+ star 仓库一起分发（`gateguard-fact-force.js:1-5`）。
- **curdx-flow 当前缺口**：ARCHITECTURE.md 第"Hook Scripts Layer"节（第 84-89 行）列出了所有现有 hook，其中没有 PreToolUse 写入拦截 hook；iron-law 验证发生在 Stop 阶段（stop-watcher），而非写入前（ARCHITECTURE.md 第 116-120 行）。
- **不搬代价**：Claude 在 implement 阶段可能在充分了解被修改文件的影响范围之前就直接写入，造成难以回溯的副作用（尤其在有复杂依赖关系的 spec 执行中）。
- **置信度**：High — 与 curdx-flow 现有 PreToolUse hook（quick-mode-guard）机制完全一致，只需新增一个 hook bundle，不影响现有结构。

---

### 3. Config Protection Hook（阻止 LLM 通过弱化 lint 配置来规避错误）

- **它是什么**：`scripts/hooks/config-protection.js` 维护一份保护文件名单（`.eslintrc`、`biome.json`、`.ruff.toml` 等 ~25 种 linter/formatter 配置），当 Claude 试图 Write/Edit 这些文件时，exit code 2 阻断并返回"去修代码，不要修配置"的提示（`scripts/hooks/config-protection.js:1-60`）。
- **外部 consensus**：ECC changelog v1.8.0 将此作为"hook reliability overhaul"的核心项，`the-shortform-guide.md` 中显式提及 hook 对代理行为的矫正作用；在社区内被多个 ECC fork 保留。
- **curdx-flow 当前缺口**：ARCHITECTURE.md 第"Hook Scripts Layer"节（第 84-89 行）没有任何写入拦截 hook；现有 hook 均为读取/验证，没有 PreToolUse Write 拦截（ARCHITECTURE.md 第 183-193 行入口列表）。
- **不搬代价**：在 implement 阶段 Claude 可能通过修改 `.eslintrc` 或 `biome.json` 来让本应 block 的 lint 错误消失，导致代码质量下降但 stop-watcher 的 iron-law 验证无法察觉（验证的是任务完成状态，不是代码质量配置）。
- **置信度**：High — 纯文件名列表匹配，实现极简，与 curdx-flow esbuild 零依赖 bundle 要求完全兼容。

---

### 4. Skill 健康追踪（skill-runs.jsonl + health 衰减检测）

- **它是什么**：`scripts/lib/skill-evolution/tracker.js` 将每次 skill 执行的结果（success/failure/partial + user_feedback）append 写入 `~/.claude/state/skill-runs.jsonl`；`health.js` 基于最近运行数据计算成功率，并标记"declining"的技能（`scripts/lib/skill-evolution/tracker.js:1-60`，`scripts/lib/skill-evolution/health.js:1-60`）。
- **外部 consensus**：ECC v1.9.0 changelog 明确将"Session & state infrastructure — SQLite state store with query CLI, session adapters"列为独立功能项；`skill-stocktake/SKILL.md:1-60` 中将 health report 作为 quick scan 的基准输入，构成闭环。
- **curdx-flow 当前缺口**：ARCHITECTURE.md 第"Data Flow / State Management"节（第 137-143 行）描述了 per-spec 执行状态（`.curdx-state.json`），但仅追踪单次 spec 内任务执行，没有 skill 级别的跨 spec/跨 session 成功率统计。
- **不搬代价**：无法知道哪些 skill 正在退化（因为模型行为变化或 skill 文档过时），只能靠用户主观感知，无法自动触发 skill 更新。
- **置信度**：Medium — tracker 机制简单（append JSONL），但 curdx-flow 的 skill 边界定义与 ECC 不同（ECC skill = 独立目录，curdx-flow skill = SKILL.md 文件），需要适配 skill_id 的取法；health 计算逻辑本身可直接复用。

---

### 5. 多维 Harness 健康评分（harness-audit.js 7 维打分）

- **它是什么**：`scripts/harness-audit.js` 对任意 Claude Code 插件目录进行 7 维可重复评分（Tool Coverage、Context Efficiency、Quality Gates、Memory Persistence、Eval Coverage、Security Guardrails、Cost Efficiency），满分 70 分，输出 `top_actions` 和失败检查项的精确文件路径（`scripts/harness-audit.js:1-80`，`commands/harness-audit.md:1-60`）。支持 `--root` 参数审计任意目录，自动检测审计目标是 ECC 仓库本身还是 consumer project。
- **外部 consensus**：ECC v1.8.0 以"harness-first release"为主题发布，`harness-audit` 作为新增命令之一；在 README 和 the-shortform-guide 中被推荐为 setup 验证工具；v1.9.0 明确提到"harness audit scoring made deterministic"。
- **curdx-flow 当前缺口**：ARCHITECTURE.md `scripts/` 节（第 54 行）描述了 `build/release scripts`（版本检查、bundle 大小、hooks freshness、smoke tests），但没有面向用户的健康评分命令；`curdx-flow doctor` 存在（第 182 行），但仅为诊断工具，不产生可量化的健康分数。
- **不搬代价**：用户和维护者无法获得 curdx-flow 安装质量的可量化基线，无法自动检测配置退化，CI 也无法用 exit code 拒绝质量下滑的发布。
- **置信度**：Medium — 脚本逻辑依赖 ECC 特定的目录结构（agents/、skills/ 等命名），移植时需要适配 curdx-flow 的目录约定（plugins/curdx-flow/skills/、agents/ 等）；核心评分框架可重用，但检查逻辑需要重写约 60%。

---

## 借鉴（思想可用、不直接搬代码）（≤ 5 项）

### 1. Instinct → Skill 演进路径（atomic unit + confidence decay）

- **它是什么**：ECC 的 continuous-learning-v2 把"学到的经验"拆成最小原子单元（instinct），每个 instinct 有 trigger、confidence（0.3-0.9）、domain tag、evidence 列表，多个 instinct 聚类后才演进为完整 skill/command/agent（`skills/continuous-learning-v2/SKILL.md:40-90`）。
- **可借鉴的点**：原子化、置信加权、evidence-backed 三个思想。curdx-flow 的 iron-law 验证块（verification blocks）已经具备 evidence-backed 的雏形；可以把"用户反馈纠正"和"任务失败后的 retry pattern"也纳入置信权重。
- **本地适配建议**：不必实现完整的 instinct CLI，但可以在 `.curdx-state.json` schema 中增加 `correction_log` 字段，记录用户对某个 phase 输出的反馈，为未来的 skill 自动改写埋点。

---

### 2. MCP 替换为 CLI + Skill 的 token 节省策略

- **它是什么**：`the-longform-guide.md:35-55` 明确提出"MCP 是 CLI 的有代价包装"——每个 MCP tool 贡献约 500 tokens context overhead，建议将高频操作改写为 skill + CLI 调用，用 lazy loading 而非常驻 MCP 减少 context 消耗。
- **可借鉴的点**：curdx-flow 的 `src/registry/` 已经在管理 MCP 安装，但没有向用户提供"哪些 MCP 可以用 skill 替代"的建议。这个思路可以写进 `status` 命令或 `analyze` 命令的输出里。
- **本地适配建议**：在 CLI installer 的 `analyze` flow 中增加一项检测：如果用户安装了 github/supabase/vercel MCP，给出"可考虑用 skill 替代"的提示，附上 token 估算。

---

### 3. 选择性安装 Manifest（profile + module + component 三层）

- **它是什么**：ECC 把安装意图分为三层：profile（developer/security/research 等场景预设）→ module（hooks-runtime、framework-language 等功能组）→ component（单个 skill/agent）。`install-profiles.json` + `install-modules.json` + `install-components.json` 三个 manifest 文件驱动 `install-plan.js`（`manifests/install-profiles.json:1-60`，`scripts/install-plan.js:1-60`）。
- **可借鉴的点**：curdx-flow 的 CLI installer 目前按"整包"安装，没有 profile 概念。对于不同技术栈的用户（Python 项目 vs TypeScript 项目），可以提供选择性安装入口减少不相关 skill 的噪音。
- **本地适配建议**：curdx-flow 规模比 ECC 小得多（208 skills vs curdx-flow 当前约 20 个 skill），近期不需要三层 manifest；但可以在 `install` 命令中加入一个 `--minimal` flag，只装核心 hook bundle + start/status skill，跳过 phase skill（research/design/tasks 等），满足"只想用基本工作流"的用户。

---

### 4. doc-file-warning（非标文档文件告警）

- **它是什么**：`scripts/hooks/doc-file-warning.js` 在 Claude 写入 `.md` 文件时给出警告（exit 0，仅提示不阻断），提醒用户"你确定需要这个文档文件吗"（`hooks/hooks.json:25-30`，脚本路径对应 `pre:write:doc-file-warning`）。
- **可借鉴的点**：curdx-flow 的 ARCHITECTURE.md 的"Anti-Patterns"节（第 229 行）已经提到协调器不应直接产出文件；将此约束从 SKILL.md 文本变为 hook 层面的自动提醒，会更有实效。
- **本地适配建议**：可以在现有 `stop-watcher.mjs` 或新增一个 `pre-write-doc-warn.mjs`，当写入路径符合 `**/*.md` 且不在 `specs/` 目录下时，输出 systemMessage 提醒。

---

### 5. Agent 颜色/角色标注（frontmatter color 字段）

- **它是什么**：ECC 的 agent markdown 文件使用 `color: teal|purple|orange` 等 frontmatter 字段（`agents/harness-optimizer.md:5`），用于在 dashboard GUI 和 harness audit 报告中对不同角色的 agent 做视觉区分。
- **可借鉴的点**：curdx-flow 的 `plugins/curdx-flow/agents/*.md` 目前只有 `name`/`description` 等字段（ARCHITECTURE.md 第 168-170 行），没有角色分类标注。增加 `role: coordinator|executor|reviewer|analyst` 字段（不一定用颜色）可以让 harness-audit 类工具做更细粒度的统计，也便于用户理解 agent 职责边界。
- **本地适配建议**：在 agent frontmatter schema 中增加可选的 `role` 字段，并在 `spec-executor.md`、`research-analyst.md`、`task-planner.md` 中补充对应值；不依赖任何 GUI，纯元数据。

---

## 剔除（看似有用但不推荐搬）（≤ 8 项）

| 项 | 不搬理由 |
|---|---|
| `/goal` 相关指令 | Claude Code 原生已有 `--goal` flag 和 plan mode；README 中 ECC 也未将其作为独立 skill 维护 |
| `/plan` 命令（`commands/plan.md`） | Claude Code 原生的 Plan Mode（`shift+tab` 切换）已内置此功能；curdx-flow 已有 `spec-workflow/SKILL.md` 完整覆盖（ARCHITECTURE.md 第 199 行） |
| PM2 多进程管理（`commands/pm2.md`，`multi-plan/execute` 系列） | curdx-flow 的 Coordinator-In-One-Turn 模式通过 Agent tool 在单 session 内并发（ARCHITECTURE.md 第 227-231 行），引入 PM2 外部进程管理与该架构哲学冲突，且 Claude Code 现已原生支持 git worktree 并行 |
| ECC2 Rust 控制平面（`ecc2/`） | Alpha 质量，README 明确"not yet a general release"；curdx-flow 用 Node.js 单栈，引入 Rust 控制平面增加编译依赖且无对等收益 |
| 208 个 skill 合集（所有领域 skill） | ECC skill 是通用代码开发 skill，curdx-flow 的 skill 是 spec 工作流 skill，定位完全不同；搬入会污染 curdx-flow 的 skill 命名空间且与用户期望不符（用户 memory：不拘泥官方分发，本地优先） |
| 中文/多语言翻译层（`README.zh-CN.md`，`docs/` 下各语言） | curdx-flow 当前仅有英文文档，规模小，维护多语言的成本高于收益；翻译与核心功能正交 |
| Dashboard GUI（`ecc_dashboard.py`，Tkinter） | Python GUI 依赖与 curdx-flow 的 Node.js 单技术栈不兼容（ARCHITECTURE.md 第 12 行）；且 Claude Code 自身提供 UI |
| continuous-learning-v2 完整 instinct 体系（Python CLI） | 系统庞大（Python + shell + SQLite + 跨项目状态），与 curdx-flow 的"零运行时 npm 依赖 hook bundle"约束直接冲突（ARCHITECTURE.md 第 205 行）；可借鉴思想，不直接搬实现 |

---

## 不确定 / 需用户决策

- **harness-audit 是否应该作为独立命令还是 CLI install 的子命令？** ECC 把它做成一个 `/harness-audit` slash command，curdx-flow 可以把它做成 `npx @curdx/flow check`（已有 `check` 子命令）或独立 `analyze` flow 的评分维度。两种路径的 scope 不同，需要确认。
- **GateGuard 是否应该像 ECC 一样默认启用，还是 opt-in？** GateGuard 每次 Edit/Write 都会增加一轮 LLM 调用，对 token 成本和响应速度有影响；ECC 默认在 standard/strict profile 中启用，curdx-flow 应该先 opt-in 还是默认启用？
- **skill-runs.jsonl 的 skill_id 如何定义？** curdx-flow 的 skill 边界是 `skills/<name>/SKILL.md`，skill_id 可以用目录名，但 curdx-flow 的某些 phase skill（research/design/tasks）在同一 spec 中可能被多次调用，是否需要 spec_id + skill_id 的组合键？

---

*分析覆盖文件数：约 38 个（README.md、hooks/hooks.json、hooks/memory-persistence/README.md、CLAUDE.md、SOUL.md、REPO-ASSESSMENT.md、the-longform-guide.md、the-shortform-guide.md、the-security-guide.md、skills/continuous-learning/SKILL.md、skills/continuous-learning-v2/SKILL.md、skills/continuous-learning-v2/scripts/instinct-cli.py、skills/verification-loop/SKILL.md、skills/iterative-retrieval/SKILL.md、skills/context-budget/SKILL.md、skills/token-budget-advisor/SKILL.md、skills/agent-harness-construction/SKILL.md、skills/search-first/SKILL.md、skills/skill-stocktake/SKILL.md、skills/eval-harness/SKILL.md、skills/cost-aware-llm-pipeline/SKILL.md、skills/safety-guard/SKILL.md、commands/learn.md、commands/harness-audit.md、commands/model-route.md、commands/instinct-import.md、agents/harness-optimizer.md、hooks/memory-persistence/README.md、scripts/hooks/gateguard-fact-force.js、scripts/hooks/config-protection.js、scripts/hooks/run-with-flags.js、scripts/hooks/observe-runner.js、scripts/hooks/pre-bash-dispatcher.js、scripts/hooks/check-hook-enabled.js、scripts/lib/hook-flags.js、scripts/lib/skill-evolution/tracker.js、scripts/lib/skill-evolution/health.js、scripts/harness-audit.js、manifests/install-profiles.json、ecc2/README.md）*
