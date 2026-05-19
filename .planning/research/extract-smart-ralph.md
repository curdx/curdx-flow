# Extract: smart-ralph（Coordinator 以外的部分）

## 一句话定位

smart-ralph 是一套以"prompt 工程文档"为核心资产的 spec 驱动开发插件，其主要差异点集中在：**任务粒度设计哲学**（Fine=40+ 任务 vs coarse=10+）、**BUG_FIX Phase 0 复现优先工作流**、**TASK_MODIFICATION_REQUEST 动态任务变更协议**，以及**独有的 refactor-specialist 后期规格迭代代理**。

---

## 已知已被 curdx-flow 吸收 / 本报告跳过的部分

- **Coordinator-In-One-Turn 模式**（已吸收，详见 ARCHITECTURE.md "Coordinator 调用 Agent tool" 段落）
- **stop-hook 安全网**（已吸收，详见 `plugins/curdx-flow/hooks/scripts/stop-watcher.mjs`）
- 并行研究团队（Team API + Explore + research-analyst 并行）——curdx-flow 已有 `references/parallel-research.md` 和 `references/bounded-parallel-dispatch.md`
- spec-reviewer（多轮 REVIEW_PASS/FAIL 仲裁）——curdx-flow 已有同名代理及 `references/verification-layers.md` Layer 3
- VE 三段式（VE1 startup / VE2 check / VE3 cleanup + 清理保证）——curdx-flow 已有 `references/quality-checkpoints.md` "VE-Cleanup Guarantee"
- intent-classification（TRIVIAL/REFACTOR/GREENFIELD/MID_SIZED/BUG_FIX 五分类）——curdx-flow 已有 `references/intent-classification.md`
- goal-interview 与 bug-interview（BUG_FIX 专项问卷）——curdx-flow 已有 `references/goal-interview.md`
- BUG_FIX Phase 0（0.1 Reproduce + 0.2 Confirm）——curdx-flow 已有 `references/phase-rules.md:218-254`
- Reality Check BEFORE/AFTER——curdx-flow 已有 `skills/reality-verification/SKILL.md`
- VF 最终验证任务（VF [VERIFY] 证明 fix 有效）——curdx-flow 已有
- quick-mode（--quick 标志 + Skill Discovery 两轮匹配）——curdx-flow 已有 `references/quick-mode.md`
- branch management（main 分支 → feat/ 分支 + worktree 选项）——curdx-flow 已有 `references/branch-management.md`
- [P] 并行任务标记 + 并行组检测——curdx-flow 已有
- Mock Quality 检测（qa-engineer 检查 mock ratio）——curdx-flow 已有 `agents/qa-engineer.md:198+`
- failure-recovery（fix task 自动生成 + 嵌套修复链）——curdx-flow 已有 `references/failure-recovery.md`
- TASK_MODIFICATION_REQUEST（SPLIT_TASK / ADD_PREREQUISITE / ADD_FOLLOWUP）——curdx-flow 已有 `references/coordinator-pattern.md:608+`
- PR Lifecycle Loop（Phase 5 CI 监控 + review comment 处理）——curdx-flow 已有
- git push 批量策略（commit per task，每 5 commits 或 phase 边界推送）——curdx-flow 已有
- Native Task Sync（TaskCreate/TaskUpdate 与原生任务同步）——curdx-flow 已有
- refactor-specialist 代理——curdx-flow 已有同名代理 `agents/refactor-specialist.md`
- spec-index 更新（update-spec-index + ./specs/.index/）——curdx-flow 已有

---

## 必搬（≤ 5 项）

### [项 1] task-planner 的 "Fully Autonomous = End-to-End Validation" 强制条款

- **它是什么**：`plugins/ralph-specum/agents/task-planner.md:11-42`。一段 `<mandatory>` 块，明确规定每一项 E2E 特性（API、analytics、browser extension、auth、webhook、payment、email）都必须产生真实外部系统的验证证明，而不仅仅是"代码编译/测试通过"。并列举了可用工具（MCP browser、WebFetch、curl、CLI）。同级的强制块："No Manual Tasks"（`line:45-70`）规定 Verify 字段中禁止出现 `Manual test...`、`Manually verify...`、`Check visually...`，必须改为可以无人值守运行的命令。
- **外部 consensus**：这条规则与 Karpathy "Goal-Driven Execution"（定义可验证的成功标准、循环直到验证通过）以及 HN/开发社区对 AI 代码代理"幻象完成"问题的大量讨论高度一致——代理可以让代码通过单元测试但从未真正调用外部 API。
- **curdx-flow 当前缺口**：curdx-flow 的 `agents/task-planner.md` 对"不允许 manual Verify"有类似要求，但没有明确列出按项目类型的 E2E 验证义务表（API 集成必须打真实 API、analytics 必须在 dashboard 里确认数据到达等），也没有明确说明"如果无法端到端验证则任务列表不完整"。此约束的缺失使得代理在面对"代码通过但外部没收到数据"的情况时不会阻止任务完成。
- **不搬代价**：spec-executor 报告 TASK_COMPLETE，但真实集成从未验证——常见于 webhook、analytics、auth 类工作。此类幻象完成是 spec 驱动开发最常见的质量漏洞之一。
- **置信度**：High。curdx-flow task-planner 文档中没有等效段落，而这条规则是 smart-ralph 区别于其他 spec 工具的核心主张之一。

---

### [项 2] task-planner 的 "POC-First vs TDD 工作流自动选择 + 每工作流独立任务数约束"

- **它是什么**：`plugins/ralph-specum/agents/task-planner.md:169-236`，`references/sizing-rules.md`。smart-ralph 对两套工作流有独立的任务数下限：Fine 模式下 POC-first 要求 40+ 任务，TDD 要求 30+ 任务；Coarse 模式下分别是 10+ 和 8+。同时有自动工作流选择规则：读取 `.progress.md` 里的 Intent Classification，GREENFIELD → POC-first，其余 → TDD。
- **外部 consensus**：业界对"greenfield 功能先 POC 再补测试"与"修复/重构先写 failing test"的区分是成熟实践，也与 TDD 鼻祖 Kent Beck 的理论一致。
- **curdx-flow 当前缺口**：curdx-flow 的 `references/sizing-rules.md` 也有 fine/coarse 两级约束，但 POC-first 和 TDD 的任务数边界是一套，不按工作流区分（Fine 无论哪种工作流都不对 40+/30+ 做显式要求）。此外 curdx-flow 的 task-planner 对"任务列表不足时是否 TASKS_BLOCKED"语义更模糊——smart-ralph 的要求是任务数低于下限就必须继续拆分。
- **不搬代价**：TDD 工作流可能生成过少任务（<30）导致验证密度不足；POC-first 工作流可能因任务数过少跳过关键 POC 检查点。
- **置信度**：Medium。curdx-flow 已有任务数控制机制，但缺少"按工作流类型动态约束最小任务数"这个细化层。是否值得强制分类需要用户决策。

---

### [项 3] spec-executor 的 `TASK_MODIFICATION_REQUEST` + `<modifications>` 协议（已搬，但细节需对齐）

- **它是什么**：`plugins/ralph-specum/agents/spec-executor.md:141-165`。spec-executor 在发现当前任务过复杂、缺前置依赖、或需要追加后续任务时，可以发出 `TASK_MODIFICATION_REQUEST` 信号附带 JSON 载体（type: SPLIT_TASK / ADD_PREREQUISITE / ADD_FOLLOWUP），协调者负责动态插入任务、更新 totalTasks、调整 taskIndex。**规则细节**：每个原始任务最多允许 3 次修改；fix task 的嵌套深度最多 3 层；fix task 完成后绕过验证层直接重试原任务（避免双重 review 浪费）。
- **外部 consensus**：Agent 系统中的"动态任务插入"是 2024 年以来 multi-agent workflow 研究的核心课题。curdx-flow 已有该协议的基本结构（coordinator-pattern.md:608+）。
- **curdx-flow 当前缺口**：对比两份 `coordinator-pattern.md`，curdx-flow 已有 TASK_MODIFICATION_REQUEST 支持。但 smart-ralph 还附有 `<modifications>` 段落直接嵌入 spec-executor 的 prompt，明确告诉 executor 何时发出、格式是什么、三类的 TASK_COMPLETE 语义差异——这段在 curdx-flow 的 spec-executor 中是否存在需要验证。
- **不搬代价**：如果 executor 不知道何时以及如何发出 TASK_MODIFICATION_REQUEST，就只能在任务过大时失败或静默截断——无法进行精确的动态修正。
- **置信度**：Medium。需要实地对比 curdx-flow `agents/spec-executor.md` 的完整内容确认缺口深度。

---

## 借鉴（≤ 5 项）

### [借 1] task-planner 的"Explore subagent 并行探查代码库再写任务"强制模式

- **位于**：`plugins/ralph-specum/agents/task-planner.md:119-145`。task-planner 在写任务之前必须 spawn 2-3 个 Explore 子代理并行探查代码库，用来确定 Files: 字段的真实路径和 Verify: 字段的真实命令。
- **curdx-flow 状态**：curdx-flow task-planner 有 "use subagents for exploration only when file paths or verification commands are unknown"（line:46），但没有如 smart-ralph 般的强制两轮并行，也没有具体 thoroughness 参数和输出格式要求。
- **建议**：可以在 task-planner 的 planning 前置步骤里加入"先 Explore，后规划"的强制段落，减少 Files: 字段写错路径的情况。

### [借 2] 更严格的"Verification Contradiction Detection"

- **位于**：`plugins/ralph-specum/references/verification-layers.md:1-23`。Layer 1 明确列出了 5 个矛盾短语（"requires manual"、"cannot be automated"、"could not complete"、"needs human"、"manual intervention"），只要这些短语与 TASK_COMPLETE 同时出现就触发拒绝。
- **curdx-flow 状态**：curdx-flow 有同样的三层验证，Layer 1 矛盾检测也存在，但矛盾短语词表是否与 smart-ralph 完全一致，需要对比确认。如果缺少某些变体（如 "needs human"），可以直接合并词表。
- **建议**：低代价，直接合并两边的矛盾短语词表。

### [借 3] 审计任务列表的"Quality Checklist"（task-planner 完成后自检）

- **位于**：`plugins/ralph-specum/agents/task-planner.md:866-912`。task-planner 在输出 tasks.md 前必须过一遍自检 checklist，逐项确认：所有任务有 <= 4 步 Do、<= 3 个文件、有 Verify 命令、有 Done when 标准，以及 TDD/POC 专项规则。
- **curdx-flow 状态**：curdx-flow task-planner 有 "Final Checks" 段（line:114-136），但覆盖面不如 smart-ralph 细（缺少逐条任务属性的自检）。
- **建议**：可以把 smart-ralph 的 checklist 条目合并进 curdx-flow 的 Final Checks 段落，增加"每任务 Do/Files/Verify/Done when 完整性"的明确检查点。

### [借 4] coordinator 的"Fix Task Bypass"规则（修复任务完成后跳过三层验证）

- **位于**：`plugins/ralph-specum/references/coordinator-pattern.md:283-288`。当刚完成的任务是 fix task（描述中含 `[FIX`）时，coordinator 直接跳过验证层重试原任务，避免对中间修复任务走全套 artifact review。
- **curdx-flow 状态**：curdx-flow coordinator-pattern.md 中也有这个逻辑。对比可以确认是否措辞一致、执行路径完整。
- **建议**：低代价，对比确认即可。

### [借 5] 双阶段 Skill Discovery（Pass 1 在 goal text 阶段，Pass 2 在 research Executive Summary 阶段）

- **位于**：`plugins/ralph-specum/references/quick-mode.md:122-184`。quick mode 启动时先做 Pass 1（只用 goal text 匹配技能描述），research 完成后做 Pass 2（用 goal + Executive Summary 扩大匹配上下文）。匹配算法：tokenize → 去停用词 → 计词重叠 >= 2 即触发。
- **curdx-flow 状态**：curdx-flow 的 quick-mode.md 有完全相同的两轮 Skill Discovery 逻辑（line:123-184 vs 155-195），包含相同的 tokenize 规则和 overlap >= 2 阈值。两边已同步。
- **建议**：剔除，已重复实现。

---

## 剔除（≤ 8 项）

| 项 | 不搬理由 |
|---|---|
| PR Lifecycle Loop（Phase 5 CI 循环）| curdx-flow 已有完整实现，`references/coordinator-pattern.md` Phase 5 章节内容与 smart-ralph 一致 |
| Native Task Sync（TaskCreate/TaskUpdate 同步）| curdx-flow 已有，两者的 nativeTaskMap + 降级逻辑基本一致 |
| spec-index（./specs/.index/ 更新）| curdx-flow 已有 update-spec-index.mjs + spec-scanner.md 的 indexed spec 扫描逻辑 |
| refactor-specialist 代理 | curdx-flow 已有同名代理，覆盖了 smart-ralph 的 section-by-section 迭代更新模式 |
| Worktree 创建脚本（复制 state files 到 worktree）| curdx-flow 的 `isolation: worktree` 在 spec-executor frontmatter 中已有，并且 curdx-flow 通过 EnterWorktree/ExitWorktree 工具直接处理 worktree 隔离，比 shell 脚本更可靠 |
| smart-ralph 独有的 `.claude-plugin-local` 本地配置格式 | curdx-flow 已有 `.claude/curdx-flow.local.md` 方案，功能对等，不需要引入第二种格式 |
| triage-analyst 代理（Epic 分解）| curdx-flow 已有同名代理及 `skills/triage/SKILL.md`，epic 状态机和 .epic-state.json 也已对齐 |
| shell-based stop-watcher.sh（bash 实现的循环控制）| curdx-flow 已迁移至 TypeScript/mjs 实现，功能更完整；bash 版本携带的 OS 依赖（macOS vs Linux stat）是 curdx-flow 明确修复过的 bug |

---

## 不确定 / 需用户决策

1. **任务数下限是否应该按工作流类型动态约束**（必搬项 2）：curdx-flow 当前上限为 12 个顶层任务（task-planner line:44）；而 smart-ralph fine 模式下限是 40+。两者有结构差异——curdx-flow 采用"值切片"（每个任务是一个完整的行为垂直切片），smart-ralph 采用"细步骤"（每步 ≤ 4 个 Do）。用户需要确认 curdx-flow 是否想要保留"≤ 12 任务"的简洁设计，还是引入 smart-ralph 的高密度任务策略。

2. **"Fully Autonomous E2E Validation 义务表"是否作为硬约束还是建议**（必搬项 1）：作为 `<mandatory>` 块引入意味着 task-planner 生成的任务如果无法端到端验证就必须阻止（等同于 TASKS_BLOCKED）。这会让某些快速原型类工作变得更严格——需要用户确认是否可以接受。

3. **`<modifications>` 段落是否需要显式写入 spec-executor prompt**（必搬项 3）：需要先读完整版 `plugins/curdx-flow/agents/spec-executor.md`（当前只读了前 80 行），确认 curdx-flow 是否已经在 executor 内部说明了 TASK_MODIFICATION_REQUEST 的触发时机和格式，然后再决定是否需要补充。
