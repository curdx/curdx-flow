# Research Synthesis: 4 仓库提炼汇总

> 日期：2026-05-18
> 输入：`extract-everything-claude-code.md`、`extract-get-shit-done.md`、`extract-superpowers.md`、`extract-smart-ralph.md`
> 视角：curdx-flow 的 Active 需求候选

---

## 跨仓"必搬"去重后的 7 个主题簇

排序按"对 Core Value（Claude 走流程、不跳步、有证据）的杠杆"从高到低。

### Cluster A — Evidence & Verification Hardening 🔴 最高杠杆
**核心：保证 AI 不只是"代码编译过"，而是真的把事做对了。**

| 来源 | 内容 |
|---|---|
| smart-ralph 必搬#1 | task-planner **E2E Validation 义务表**：按项目类型（API / analytics / browser / auth / webhook / payment / email）必须给真实外部系统验证证明；禁止 `Manual test ...` |
| superpowers 必搬#1 | 双阶段子代理审查：**spec-compliance → code-quality** 顺序不可逆 |
| get-shit-done 必搬#4 | 验证债务追踪：引入 `status: partial` 与 `result: blocked with blocked_by`，跨 spec 累积可见 |
| ECC 必搬#2 | **GateGuard Fact-Forcing**：写文件前 LLM 必须先列出 importers / 公开 API / 数据 schema |
| ECC 必搬#3 | **Config Protection**：阻止 LLM 通过弱化 lint 配置规避错误（保护 `.eslintrc` / `biome.json` / `.ruff.toml` 等 25 种文件）|

**为什么是最高优先级**：直接对应你 memory 里的"极致反向审查 + 百分百置信度策略"和 Core Value。不做这一簇，"漂亮代码"就只是文字承诺。

---

### Cluster B — Workflow Discipline 🟠 高
**核心：流程不能被 LLM 自己绕过。**

| 来源 | 内容 |
|---|---|
| superpowers 必搬#4 | brainstorming `<HARD-GATE>`：用户批准设计前禁止调用任何 implement skill |
| smart-ralph 必搬#3 | `<modifications>` 段落：spec-executor 主动发出 SPLIT_TASK / ADD_PREREQUISITE / ADD_FOLLOWUP 的协议（需先核对 curdx-flow executor 是否已完整）|
| get-shit-done 借鉴#3 | `human_verify_mode = end-of-phase`：人工 checkpoint 集中到 phase 末，减少中途阻塞 |

---

### Cluster C — Skill Authoring Discipline 🟡 中
**核心：长期不腐烂；保持 skill 行为可预测。**

| 来源 | 内容 |
|---|---|
| superpowers 必搬#2 | **CSO 原则**：`description` 只写触发条件，不写流程摘要（防 LLM 读摘要代替读全文）|
| superpowers 必搬#3 | Skill 写作 TDD：RED-GREEN-REFACTOR for skills + rationalization 表 |
| ECC 必搬#4 | Skill 健康追踪：`skill-runs.jsonl` 跨 session 记录 success/failure，自动标记 declining skill |
| get-shit-done 借鉴#4 | Agent 尺寸 CI lint：硬上限 500 行，防 agent 膨胀 |

---

### Cluster D — Cost & Model Strategy 🟡 中
**核心：分级用模型，省 token + 加速。**

| 来源 | 内容 |
|---|---|
| get-shit-done 必搬#1 | **Per-Phase 模型选择**：`models.planning/research/execution/verification` 配置键 |
| get-shit-done 必搬#2 | 动态路由 + 失败层级升级：soft failure 时自动升级到更强模型，`max_escalations` 封顶 |
| superpowers 借鉴 C | 按 task 复杂度选最便宜可用模型 |

---

### Cluster E — Runtime Controls 🟢 中低
**核心：可观察、可调试、可灰度。**

| 来源 | 内容 |
|---|---|
| ECC 必搬#1 | **Hook Profile 系统**：`ECC_HOOK_PROFILE=minimal\|standard\|strict` + `ECC_DISABLED_HOOKS=id1,id2` 环境变量级 hook 开关，无需改 JSON |
| ECC 必搬#5 | Harness Audit 7 维评分：Tool Coverage / Context Efficiency / Quality Gates / Memory / Eval / Security / Cost，可重复打分 |
| get-shit-done 借鉴#1 | context-window 监控：用量 > 70% 时给 coordinator 注入 `additionalContext` 警告 |

---

### Cluster F — Process Specialization (TDD/POC) 🟢 低-中
**核心：TDD 模式硬执行；POC 工作流任务密度约束。**

| 来源 | 内容 |
|---|---|
| get-shit-done 必搬#3 | TDD 管道：`workflow.tdd_mode`、planner 打 `type:tdd`、executor 强制 RED commit 先于 GREEN |
| smart-ralph 必搬#2 | POC-first vs TDD 各自的任务数下限（Fine: POC 40+，TDD 30+）|

---

### Cluster G — Architecture Docs 🟢 最低（但便宜）
**核心：把架构决策从 commit 信息里捞出来落到 ADR。**

| 来源 | 内容 |
|---|---|
| get-shit-done 借鉴#5 | `docs/adr/` 结构化 ADR 体系，记录已有的关键决策（exit-0 invariant / hook bundle 必须进 git / Coordinator-In-One-Turn 等）|

---

## 跨仓"剔除"共识（不动）

以下事项 4 份报告都明确不推荐搬，无需再讨论：

- Claude Code 原生已有的功能（goal / plan mode / git worktree / read-before-edit 等）
- curdx-flow 已实现的功能（Coordinator-In-One-Turn / stop-hook / failure-recovery / TASK_MODIFICATION_REQUEST 基本结构 / Mock Quality 检测等）
- 跨 AI 委托 / Gemini 集成（哲学冲突）
- ECC 的 208 skill 合集（与 curdx-flow spec-workflow 定位不同）
- Python/Rust 控制平面（与 curdx-flow Node-only 约束冲突）
- 上游 get-shit-done 的 cherry-pick 同步（架构已大幅分叉，按"接管型 fork"原则手工提炼即可）

---

## 待用户决策的关键问题

1. **Per-Phase 模型配置存哪里？** — 候选：`.curdx/config.json` 新建 / `.curdx-state.json` per-spec 节 / `curdx-flow:start` skill 参数
2. **E2E Validation 义务表是硬约束还是建议？** — 硬约束会让"快速原型"类工作变严格
3. **TDD 管道优先级？** — 工作量 M（同时改 task-planner / spec-executor / stop-watcher）；个人项目可延后
4. **GateGuard 默认启用还是 opt-in？** — 每次 Edit/Write 多一轮 LLM 调用，影响成本和速度
