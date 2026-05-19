# Extract: superpowers

> 分析日期：2026-05-18
> 消费方：curdx-flow（Claude Code 插件 + npm installer）

---

## 一句话定位

Superpowers 是一套以「skill 为原子单元」的软件开发方法论插件，通过 SessionStart hook 将 bootstrap 注入每次会话，强制代理人在动手前先查询并调用对应 skill，将 TDD、Socratic 需求精炼、subagent 驱动执行等经过实测的工作流内化为不可跳过的行为规范。

---

## 它的独特价值（thesis）

- **行为塑造优先于工具**：skill 的内容（rationalization 表、Red Flags 列表、Iron Law 声明）是经过多轮「失败基线 → skill 修订 → 合规验证」循环迭代测试的，而非凭感觉写就的文档。
- **Socratic 需求精炼 + 硬门禁**：`brainstorming` skill 设置 `<HARD-GATE>`，在用户批准设计之前，代理人不得执行任何实现动作，彻底斩断「跳过设计直接写代码」这一最常见的失败路径。
- **双阶段代码审查**（spec compliance → code quality）：每个 task 由独立子代理实现，实现后先验证是否与 spec 完全匹配（既不多也不少），再进行代码质量审查，两关串联、有问题必须修完才能进入下一 task。
- **Persuasion-Principled Skill Design**：skill 设计本身引用了 Meincke et al. (2025) 的说服力学研究，用 Authority、Commitment、Scarcity 等原则刻意强化合规率，从而让合规率从 33% 跃升至 72%。
- **CSO（Claude Search Optimization）**：`description` 字段只写触发条件、不写流程摘要，避免代理人「读摘要代替读全文」的捷径行为，经测试有效防止了双阶段审查被简化为单阶段。

---

## 必搬（≤ 5 项）

### 1. 双阶段子代理审查模板（spec-reviewer + code-quality-reviewer prompt）

- **它是什么**：`skills/subagent-driven-development/spec-reviewer-prompt.md`（:1-61）& `skills/subagent-driven-development/code-quality-reviewer-prompt.md`（:1-26）。实现后先派 spec-compliance 审查员（独立子代理，不信任实现者报告，逐行比对 spec），通过后再派 code-quality 审查员，两审均通过才标记 task complete。
- **外部 consensus**：「fresh context per reviewer」和「两阶段审查顺序不可逆（先 spec compliance 再 quality）」在 subagent 模式下是防止 over-engineering 和 under-building 的公认最佳实践；Superpowers 基于实测发现了倒序（先 quality）会导致代理放弃 spec 修正的问题，因此在 `subagent-driven-development/SKILL.md:248-249` 明确设为 Red Flag：「Start code quality review before spec compliance is ✅」。
- **curdx-flow 当前缺口**：ARCHITECTURE.md 第 168–170 行列出 `code-quality-reviewer.md` 和 `spec-reviewer.md` 两个 agent，但 `plugins/curdx-flow/skills/implement/SKILL.md` 的执行流（读取至 60 行）只呈现了 coordinator → spec-executor 的单层委托结构，未见双阶段审查 prompt 模板。`spec-executor.md` 的 `<flow>` 章节只有 5 步，缺少「审查员是否独立验证 spec compliant」的步骤。
- **不搬代价**：executor 自我报告 DONE 但实际遗漏 spec 要求，只有最终全量审查时才暴露，修复成本远高于逐 task 拦截。
- **置信度**：High — 本地 agent 文件已存在但使用方式未成形；superpowers 的 prompt 模板完整且语言无关，直接可适配。

---

### 2. CSO 原则：`description` 只写触发条件、不写流程摘要

- **它是什么**：`skills/writing-skills/SKILL.md:148-175`（Claude Search Optimization 章节）。核心发现：若 `description` 包含流程摘要，Claude 会把摘要当内容跳过全文；`description` 只应写「Use when…」触发条件，不写任何步骤说明。实验证据：将 `code review between tasks` 改为纯触发条件后，双阶段审查才被正确执行。
- **外部 consensus**：Anthropic 官方 skill 规范（agentskills.io/specification，在 `skills/writing-skills/SKILL.md:100-104` 中引用）要求 description ≤ 1024 字符；Superpowers 在此基础上增加了实测的「不写流程摘要」约束，经过多轮 eval 确认。
- **curdx-flow 当前缺口**：查看现有 skill 的 `description` 字段，如 `curdx-core/SKILL.md` 为 `Use when handling curdx-flow flags, state files, delegation, execution loops, or skill entrypoint rules.`，符合触发条件写法。但 `verification-before-completion/SKILL.md:4` 的 `description` 为 `Use when checking fixes, phase exits, completion evidence, or mock-heavy tests before claiming success.`，同样合规。差异在于：curdx-flow 没有成文的 skill 写作规范，未来新增/修改 skill 时缺乏 CSO 约束，容易退化。ARCHITECTURE.md 未包含 skill 写作指引。
- **不搬代价**：未来 skill 迭代时会无意识地在 `description` 里塞入流程摘要，导致 skill 被 Claude 只读摘要不读全文，行为约束失效。
- **置信度**：High — 机制已有实验支撑，成本极低（只需在项目内留一份规范文档），与语言/框架无关。

---

### 3. Skill 写作的 TDD 测试循环（RED-GREEN-REFACTOR for skills）

- **它是什么**：`skills/writing-skills/SKILL.md:394-571`（Testing All Skill Types 章节）& `skills/writing-skills/testing-skills-with-subagents.md`。核心观点：skill 是塑造代理行为的代码，必须像代码一样先写失败用例（派子代理在没有 skill 的情况下执行场景，观察自然失败），再写 skill，再验证合规，最后找新的「rationalization 漏洞」关闭。在此基础上建立 rationalization 表和 Red Flags 列表。
- **外部 consensus**：Meincke et al. (2025)（引自 `skills/writing-skills/persuasion-principles.md:4-5`）实测 N=28,000 对话，说服技巧让合规率翻倍（33% → 72%）。「测试文档就像测试代码」是 AI-engineer 社区的新兴共识。
- **curdx-flow 当前缺口**：ARCHITECTURE.md 未提及 skill 验证机制。现有 skill（如 `verification-before-completion`）包含完善的 Iron Law 和 rationalization 表，但其来源是经验积累而非记录在案的 RED-GREEN-REFACTOR 循环。新增 skill 时无法查阅系统性的测试方法论。
- **不搬代价**：新 skill 缺乏压力测试，一旦代理人找到 rationalization 路径便能绕过约束，而问题不会在写 skill 时被发现，只会在用户实际受害时暴露。
- **置信度**：Medium-High — 方法论价值明确，但实施需要为每个新/修 skill 额外跑子代理测试会话，成本较高；可先在 `writing-skills` 参考文档中保存方法论，渐进采用。

---

### 4. Brainstorming HARD-GATE：设计未批准禁止进入实现

- **它是什么**：`skills/brainstorming/SKILL.md:12-14`。`<HARD-GATE>` 块明确禁止在「用户批准设计」前调用任何实现 skill 或写任何代码，无论需求看起来多简单。流程：探索 → 问题精炼（单次一问）→ 提出 2-3 种方案 → 逐段展示设计并获批 → 写设计文档 → 自检 → 用户 review → 转入 writing-plans。
- **外部 consensus**：「Design before code」是 AI agent 领域防止代理人过早实现的经典机制；Socratic 单问设计、写设计文档提交 git 等都是独立有效的工程实践。
- **curdx-flow 当前缺口**：curdx-flow 有 `research`、`requirements`、`design`、`tasks` 四个前置阶段 skill（ARCHITECTURE.md:199），已具备相似结构，但各阶段 skill 是分离的命令而非一个统一入口，用户可跳过任意阶段直接进入 implement。`start/SKILL.md` 和 `spec-workflow/SKILL.md` 也没有等价于 `<HARD-GATE>` 的硬性门禁，依赖用户知道应先走哪个阶段。
- **不搬代价**：用户在 `--quick` 或对话场景下容易跳过设计，代理人也容易在确认设计前开始实现，浪费大量迭代成本。
- **置信度**：Medium — curdx-flow 已有多阶段工作流作为结构保障，HARD-GATE 更多是单入口的强力加固；curdx-flow 的多入口设计可在 `start` skill 层面局部实现同等效果，但需额外实现。

---

### 5. 跨 harness 兼容 SessionStart hook（bash polyglot + platform-detect JSON 输出）

- **它是什么**：`hooks/session-start`（:1-57）& `hooks/run-hook.cmd`（:1-55）。`session-start` 是纯 bash 脚本，读取 `using-superpowers/SKILL.md` 后注入 `<EXTREMELY_IMPORTANT>` 块；`run-hook.cmd` 是 Windows/Unix polyglot 包装器，在 Windows 下自动寻找 Git Bash，在 Unix 直接 exec bash。JSON 输出字段根据环境变量（`CURSOR_PLUGIN_ROOT`、`CLAUDE_PLUGIN_ROOT`、`COPILOT_CLI`）自动选择 `additional_context` / `hookSpecificOutput.additionalContext` / `additionalContext` 三种格式之一，确保 Cursor、Claude Code、Copilot CLI 均可接收。
- **外部 consensus**：Claude Code hooks 规范只定义了 `hookSpecificOutput.additionalContext`；Cursor 等平台要求不同字段名；无跨平台兼容的官方指引。Superpowers 通过实测 4+ harness 总结出此兼容方案。
- **curdx-flow 当前缺口**：ARCHITECTURE.md 第 88-89 行说明 curdx-flow hook 脚本为编译后的 `.mjs`，面向 Claude Code 单一 harness，不支持 Cursor 或 Copilot CLI。`load-spec-context.mjs`（SessionStart）仅针对 Claude Code 输出格式。如未来 curdx-flow 扩展 harness 支持，需从零解决跨平台字段兼容问题。
- **不搬代价**：若未来需支持 Cursor 或其他 harness，须重造此多平台检测逻辑；参考 superpowers 的 bash polyglot 方案可节省一到两周实测时间。
- **置信度**：Low — curdx-flow 当前不支持 Cursor 等 harness，此条只在扩展路线上才有价值；保留为「若-则」备查项。

---

## 借鉴（≤ 5 项）

### A. Rationalization 表 + Red Flags 列表的 skill 写法套路

`skills/test-driven-development/SKILL.md`（:256-288）和 `skills/verification-before-completion/SKILL.md`（:59-90）都包含系统化的「借口 → 现实」对照表和 STOP 自检清单。curdx-flow 的 `verification-before-completion` skill 已有类似结构（:93-128），但其他 skill 尚未普及此模式。可作为 skill 写作标准模板推广。

### B. Implementer 子代理 escalation 协议（DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED）

`skills/subagent-driven-development/implementer-prompt.md`（:104-113）定义了四种状态码，强制 executor 在无法完成时明确上报而非静默产出低质量工作。curdx-flow 的 `spec-executor.md`（:40-59）有类似 `TASK_BLOCKED` / `TASK_COMPLETE` 信号，但缺少 `DONE_WITH_CONCERNS`（已完成但有疑虑）这一中间状态，实践中 executor 常常只输出 DONE 或 BLOCKED，丢失了「模糊完成」信息。

### C. 模型选择策略（按 task 复杂度选最便宜可用模型）

`skills/subagent-driven-development/SKILL.md`（:89-100）明确：机械性实现任务用最便宜模型，集成/判断任务用标准模型，架构/设计审查用最强模型。curdx-flow 的 `spec-executor.md` 固定声明 `model: sonnet`，未做动态分级。成本压缩空间可观。

### D. 设计文档写入 git 的强制步骤

`skills/brainstorming/SKILL.md`（:109-116）要求把通过的 spec 提交到 `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`。curdx-flow 对 spec 有 `specs/<name>/` 目录结构，但设计阶段产物（research.md、requirements.md 等）是否提交 git 取决于 `--commit-spec` flag，并非强制。补一条「设计阶段产物在用户 review 通过后必须提交」可改善可追溯性。

### E. `<SUBAGENT-STOP>` 块避免子代理误读 bootstrap

`skills/using-superpowers/SKILL.md`（:6-8）在顶部加了 `<SUBAGENT-STOP>` 块，告诉被委托执行具体任务的子代理跳过此 skill。curdx-flow 的 `spec-executor.md` 没有此防护，理论上子代理可能在 SessionStart 时重复读取 bootstrap 指令造成干扰。

---

## 剔除（≤ 8 项）

| 项 | 不搬理由 |
|---|---|
| `using-superpowers` bootstrap skill（session 开始检查 skill 的总规则） | curdx-flow 通过 `load-spec-context.mjs` + `SessionStart` hook 在会话开始时注入 spec 上下文，行为塑造路径不同；且「所有 skill 都必须先 invoke」的强约束在 curdx-flow 的 coordinator 架构中由 coordinator prompt 保证，不需单独 bootstrap skill |
| `using-git-worktrees` skill | Claude Code 原生已有 `EnterWorktree` 工具；superpowers 的此 skill 大量内容是处理 Claude Code 缺失 native worktree 支持时的 fallback，curdx-flow 可直接调用 `EnterWorktree`（ARCHITECTURE.md:53 中已声明 cross-plugin dependency `pua`）|
| `finishing-a-development-branch` skill | 分支合并/PR 流程属于 git 操作层，Claude Code 已有 `gh` 集成；此 skill 的主要价值在于帮助不熟悉 git worktree 的用户做清理，与 curdx-flow 的 spec-centric 流程重叠且较浅 |
| `receiving-code-review` skill | 内容简短（告知如何回应 reviewer feedback），属于通用协作礼仪，不带技术实现；curdx-flow 在 architect-reviewer / code-quality-reviewer agent 里已内置反馈消化逻辑 |
| `executing-plans`（批量执行带 checkpoint 的方案） | curdx-flow 的任务执行循环由 `implement` + `spec-executor` + hooks 三层保证，已比 executing-plans 更精细；此 skill 是 subagent-driven-development 的降级替代，不适合作为 curdx-flow 主路径 |
| `dispatching-parallel-agents` skill | curdx-flow 已通过 `parallel` mode 和 `triage` skill 处理并行任务分解；superpowers 的此 skill 仅提供了 Task() 并发调度的基础模式，没有增量价值 |
| `gemini-extension.json` / Gemini 集成配置 | curdx-flow 定位为 Claude Code 插件，不计划支持 Gemini CLI |
| Windows polyglot `run-hook.cmd`（当前） | curdx-flow 的 hook 是编译后的 `.mjs`，Node.js 跨平台；bash polyglot 只对纯 bash hook 有意义；若未来加 Windows 支持，可届时参考 |

---

## 不确定 / 需用户决策

1. **双阶段审查是否要重构 implement skill**：将 spec-reviewer 和 code-quality-reviewer 的调用时机从「最终全量审查」改为「每 task 后必经」，需修改 `implement/SKILL.md` 的 coordinator 逻辑，工作量中等。用户是否把此列为 roadmap 项？

2. **skill 写作 TDD 的落地深度**：全量采用（每个新 skill 必须先跑失败基线）vs 只保存方法论文档、自愿执行？前者可靠性高但增加写 skill 成本，后者保持敏捷但约束力弱。

3. **brainstorming HARD-GATE 的位置**：加在 `start` skill 入口（影响所有新 spec），还是单独新建一个 `brainstorm` skill 供用户选择调用？前者匹配 superpowers 的「强制」哲学但可能干扰 quick mode。

4. **harness 扩展时间表**：只有计划支持 Cursor 或其他 harness 时，跨平台 SessionStart hook 的借鉴才有实际价值（当前置信度 Low）。
