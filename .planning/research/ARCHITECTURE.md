# Architecture Research (Gap-Fill)

**研究日期：** 2026-05-18
**研究模式：** Project Research — Architecture dimension（gap-fill）
**视角：** 跳出 Claude Code 生态，看更宽视角的 "AI workflow orchestration with verification gates" 架构思路
**与 SYNTHESIS.md 关系：** 已覆盖簇 A–G **不重复**；本文只补 SYNTHESIS 没收的架构维度

---

## Executive Summary

SYNTHESIS.md 的 7 簇全部聚焦在"流程纪律 + 证据约束"这一**应用层**面（skill 写法、hook profile、模型路由、验证义务表等），落点都在"让 LLM 更守规矩"。

跳出 Claude Code 生态，2026 年的"AI workflow orchestration"主流文献和开源项目却在**系统结构层**做着另一类工作：

1. **State 与 Execution 分离** — LangGraph、Temporal 把"工作流定义"和"执行引擎"明确分层，curdx-flow 当前是耦合在一起的
2. **Determinism through Replay** — Temporal / Event Sourcing 用"事件追加 + 重放"实现崩溃恢复，curdx-flow 的 `.curdx-state.json` 是"覆盖式快照"
3. **Policy as Code 与 LLM 解耦** — OPA / Rego 把"规则"放到独立 deterministic 引擎，curdx-flow 把规则散落在 hook TypeScript 里
4. **Verifier 与 Generator 分离训练** — SWE-Gym 等论文证明独立训练的 verifier 显著拉高 agent 上限，curdx-flow 当前 verifier 与 executor 共享同一个 base prompt 视角
5. **Typed Contract 在 LLM 边界** — BAML / Pydantic AI 把"LLM 返回什么"用 schema 强约束，curdx-flow 当前依赖文本解析 + Stop hook 兜底
6. **Speculative Branch Execution** — Sherlock / ConTree 通过"先猜后验"加速；curdx-flow 是严格串行
7. **Skill / Agent 的可观测性指标体系** — Harness Engineering 文献证明 wrapper 改一改、性能差 6-10x；curdx-flow 没有"harness 评分"维度

下文每条建议都：
- 引一个外部 reference（论文 / 开源项目 / 官方文档）
- 显式确认与 curdx-flow Constraints（Claude Code-only、Node-only、hook 零运行时依赖）兼容
- 标 confidence + 建造顺序建议

---

## Recommendation R1 — 把 "Workflow Definition" 从 Skill 文本里抽出来变成可静态分析的图

**Confidence：** MEDIUM（高杠杆，但实现成本不小）

**外部参照：**
- LangGraph 把"工作流"建模成 typed `StateGraph`：节点、边、conditional edges 都是程序结构，`compile()` 时做 type checking 和 edge connectivity validation。([LangGraph State Management](https://eastondev.com/blog/en/posts/ai/20260424-langgraph-agent-architecture/))
- Petri net workflow 理论早就证明：把流程显式建模可以**静态验证** soundness / deadlock-freeness。([Petri Nets in Workflow](https://www.worldscientific.com/doi/abs/10.1142/S0218126698000043))

**curdx-flow 现状：**
- "工作流"现在散落在多个 SKILL.md 文本里：`start` → `research` → `requirements` → `design` → `tasks` → `implement`
- 哪些 phase 必须先于哪些 phase，靠 `stop-watcher.mjs` + `quick-mode-guard.mjs` + 各 SKILL.md 文字描述**共同维护**
- 一致性靠 reviewer 人工维持；没有"我把 design phase 重命名为 spec phase，所有引用是否同步"的静态检查
- 新加 phase 要改：`skills/*` 多处文本、`state-ledger.schema.json` 的 phase 枚举、若干 hook 里的 phase 比较

**建议：**

引入 `plugins/curdx-flow/schemas/workflow.json`（或 `.mjs`）作为**单一事实源**，描述：

```json
{
  "phases": [
    { "id": "research", "next": ["requirements"], "skip_allowed_from": ["start"] },
    { "id": "requirements", "next": ["design"], "requires_artifact": "research.md" },
    { "id": "design", "next": ["tasks"], "requires_artifact": "requirements.md", "hard_gate": "user_approval" },
    { "id": "tasks", "next": ["implement"], "requires_artifact": "design.md" },
    { "id": "implement", "next": [], "requires_artifact": "tasks.md" }
  ]
}
```

然后让：
- skill SKILL.md 在 frontmatter 里声明 `phase: implement`
- `stop-watcher.mjs` / `quick-mode-guard.mjs` / `task-completed-verifier.mjs` 全部读这个文件
- `npm run lint:workflow` 在 CI 里跑一致性检查（每个 phase 都有对应 skill、artifact 引用闭环、没有死锁）

**与 Constraints 兼容性：** ✅ 纯 JSON + 编译时检查，零运行时依赖；hook 读 JSON 即可。

**建造顺序建议：**
1. 先实现"reader"层：写工具读 JSON 并暴露 `getPhaseGraph()` API
2. 再让 hook 改用它（行为不变，只换数据源）
3. 最后加 CI lint

**与 SYNTHESIS 区分：** Cluster B "Workflow Discipline" 是"加更多规则"；R1 是"把已有规则从散落文本变成可机读结构"，是规则的**基础设施**而不是规则本身。

---

## Recommendation R2 — `.curdx-state.json` 升级为 Append-Only Event Log（双写过渡）

**Confidence：** HIGH（外部业界共识强，curdx-flow gap 明显）

**外部参照：**
- Temporal 的核心：每个 workflow 步骤自动 checkpoint，崩溃时另一个 worker 从 Event History **replay** 恢复到精确同一点。([Durable Execution meets AI](https://temporal.io/blog/durable-execution-meets-ai-why-temporal-is-the-perfect-foundation-for-ai))
- ESAA 论文（Event Sourcing for Autonomous Agents）：每个 agent 行为作为不可变事件追加；replay 给出**完整可审计的历史**。([ESAA arxiv](https://arxiv.org/pdf/2602.23193))
- 业界 best practice：log 必须由**独立 gate** 在 action 执行**之前**写入，agent 不能影响日志。([AI Agent Audit Log Best Practices](https://agenticrail.nz/blog/ai-agent-audit-log-best-practices/))

**curdx-flow 现状：**
- `.curdx-state.json` 是**覆盖式快照**：每次 hook 更新都 read-modify-write 整个 JSON
- 历史信息只能从 git log / transcript 反推
- 如果某 hook 写坏了，前一状态丢失（除非 git 兜底）
- session-spec 绑定也是单文件覆盖
- 已经有 `post-tool-batch-snapshot.mjs` 和 `post-compact-recorder.mjs`，说明已经在朝事件方向走，但不是 first-class

**建议：**

引入 `specs/<name>/.curdx-events.jsonl`（newline-delimited JSON，append-only）：

```jsonl
{"ts":"2026-05-18T10:00:00Z","event":"phase_transition","from":"design","to":"tasks","actor":"user"}
{"ts":"2026-05-18T10:05:00Z","event":"task_completed","index":3,"verification":{"command":"npm test","exit_code":0}}
{"ts":"2026-05-18T10:06:00Z","event":"stop_blocked","reason":"iron_law_violation","detail":"..."}
```

`.curdx-state.json` **保留**作为"当前态投影"（projection），但它是 derived state：可以从 events.jsonl 完整 rebuild。

价值：
- **崩溃 / 误删恢复**：`curdx-flow state rebuild` 从 events 重建
- **审计**：用户可以问"我什么时候批准的 design？hook 什么时候 block 我？"
- **debug**：reviewer 跑回归时可以 replay 一段 events，看 hook 链行为有没有变
- 与 SYNTHESIS Cluster A（Evidence & Verification）天然耦合：每条 evidence 就是一个 event

**与 Constraints 兼容性：** ✅ 纯文件 IO；Node stdlib 够用；append-only 文件天然崩溃安全（fsync 后无破坏写）。

**建造顺序建议（双写过渡）：**
1. **Phase 1**：每次写 `.curdx-state.json` 时**同时** append 一条 event；现有代码无变更
2. **Phase 2**：写一个独立 `curdx-flow state rebuild` 命令，确认"投影 == 快照"在所有现有 spec 上恒等
3. **Phase 3**：把 `state.json` 从 source-of-truth 改为 derived cache；event log 成为唯一真相
4. **Phase 4**：删除直接写 state.json 的代码路径（只剩 projection rebuild）

**与 SYNTHESIS 区分：** SYNTHESIS 没有任何一簇讨论"状态文件如何崩溃恢复 / 审计 / replay"。Cluster G 的 ADR 是文档化"已做决策"，R2 是"运行时事件链"，正交。

---

## Recommendation R3 — 引入独立的"Policy Layer"，把 Hook 里的规则从代码里抽出来

**Confidence：** MEDIUM（外部成熟但要权衡复杂度）

**外部参照：**
- Open Policy Agent + Rego：把策略决策与策略执行**解耦**，policy 是声明式规则，引擎是 deterministic 的；强调"AI 模型可能幻觉，但 policy engine 是绝对逻辑兜底"。([Runtime Governance for AI Agents](https://gokhan-gokalp.com/runtime-governance-for-ai-agents-policy-as-code-with-opa/))
- Microsoft 的 agent-governance-toolkit 把 policy enforcement 列为 OWASP Agentic Top 10 必须项。([agent-governance-toolkit](https://github.com/microsoft/agent-governance-toolkit))

**curdx-flow 现状：**
- 规则散落在多个 hook TypeScript 文件里：
  - `stop-watcher.ts` — iron-law / cost-runaway / unchecked-tasks
  - `quick-mode-guard.ts` — pre-tool 拦截
  - `task-completed-verifier.ts` — evidence 校验
  - `user-prompt-expansion-guard.ts` — autopilot 边界
- 想加一条新规则得 **改 TS + 重新 build hook bundle + commit + 发版**
- 用户无法 opt-out 单条规则（只能改 ECC profile 这种粗粒度开关）
- 规则之间的优先级、互斥关系没显式描述

**建议：**

引入 `plugins/curdx-flow/policies/` 目录，放声明式规则（不必上 Rego，初版可以用简化的 JSON 规则 DSL）：

```json
// plugins/curdx-flow/policies/iron-law.policy.json
{
  "id": "iron-law-completion",
  "trigger": "Stop",
  "severity": "block",
  "when": [
    { "field": "transcript_tail.contains", "value": "ALL_TASKS_COMPLETE" }
  ],
  "require": [
    { "field": "state.verifications.last.exit_code", "equals": 0 },
    { "field": "state.unchecked_tasks", "equals": 0 }
  ],
  "message": "Iron law: cannot stop with unchecked tasks or failed verification"
}
```

Hook 代码变成**规则求值器**（rules-engine.mjs），单一职责：读 policy → 对当前上下文求值 → 返回 block / allow。

价值：
- 新规则不用改 TypeScript，写 JSON 就行（user 可以本地覆盖）
- 规则可 unit-test（pure function：input + policy → decision）
- 与 SYNTHESIS Cluster E（Hook Profile）天然耦合：profile 就是"启用哪些 policy id"
- 规则版本可追踪（policy 文件 hash 进 event log）

**与 Constraints 兼容性：** ✅ 纯 JSON + 小型求值器，可全部 bundle 进 hook .mjs；不引入运行时依赖。

**风险：** 初期 policy DSL 表达力会受限；复杂规则（涉及 transcript 解析）还得回到 TS。建议先把 5 条最简单的 hardcoded 规则迁出来验证 DSL 设计。

**建造顺序建议：**
1. 选 1 条最简单的规则（如 cost-runaway 阈值）做 PoC
2. 跑通后再迁 iron-law 这类核心规则
3. 最后开放 user 写自己的 `.claude/curdx-policies/*.json`

**与 SYNTHESIS 区分：** Cluster B 的 HARD-GATE / `<modifications>` 是"加规则"；Cluster E 的 Hook Profile 是"开关规则"；R3 是"规则的存储和求值架构"，三者在不同层。

---

## Recommendation R4 — Verifier 与 Executor 分离，使用不同的"角色 system prompt"

**Confidence：** HIGH（学术文献明确证据）

**外部参照：**
- SWE-Gym (ICML 2025) 的核心结论：在同一环境里**独立训练** verifier 和 agent，verifier 显著拉高最终通过率。([SWE-Gym](https://github.com/SWE-Gym/SWE-Gym))
- Anthropic Building Effective Agents 的 Evaluator-Optimizer pattern：generator 和 evaluator **必须是不同 prompt**，否则 generator 倾向于自我合理化。([Anthropic Building Effective Agents](https://www.anthropic.com/research/building-effective-agents))
- Aider 用"weak model 写 commit message + strong model 写代码"的角色分工已经在生产中验证。([Separating code reasoning and editing](https://aider.chat/2024/09/26/architect.html))

**curdx-flow 现状：**
- `task-completed-verifier.mjs` 是 **hook**（deterministic 代码，不是 LLM），只校验"有没有 evidence block"，不校验"代码语义对不对"
- 真正的"语义级 verification"靠 `spec-executor` 自己说"我跑通了"+ Stop hook 拦截
- `spec-reviewer` agent 存在，但调用时机不明确（SYNTHESIS Cluster A 提到"双阶段子代理审查"是要补的）
- 没有一个"verifier system prompt 必须比 executor 更怀疑"的角色对比

**建议：**

引入两个层次的 verifier，与 executor 在 prompt 层显式对立：

1. **Executor system prompt 加一句**："你的输出会被一个**独立的、敌对视角的** verifier agent 审查。它假设你撒谎，你必须给可机读证据。"
2. **新建 `agents/adversarial-verifier.md`**：角色不是"友善 reviewer"，而是"敌对 auditor"：
   - 默认假设 executor claim 是错的
   - 必须 grep 文件 / 跑命令复核每条 claim
   - 输出格式是"approved / disputed"列表，不是 narrative
3. **与 Stop hook 配合**：iron-law 触发后，自动 spawn adversarial-verifier，不通过则强制开新一轮 implement

价值：
- 把"verification"从"hook 静态字符串匹配"升级为"独立 LLM 视角对抗"
- 直接对齐 SWE-Gym 学术证据
- 与 SYNTHESIS Cluster A "双阶段子代理审查"是同方向，但**显式定义了角色对抗性**（SYNTHESIS 只说"spec-compliance → code-quality"，没说要敌对）

**与 Constraints 兼容性：** ✅ 全部在 Claude Code agent 体系内，不引入外部依赖。

**建造顺序建议：**
1. 先写 `adversarial-verifier.md` agent prompt 草稿
2. 让 `spec-executor` system prompt 加对抗性提示
3. 改 Stop hook：iron-law 触发时自动注入"请 spawn adversarial-verifier"指令
4. 收集 5-10 个真实案例的对抗效果

**与 SYNTHESIS 区分：** Cluster A 的"双阶段子代理审查"是**顺序流程**（先 compliance 再 quality）；R4 是**对抗 prompt 设计**和角色 system message 层。两者可以叠加：双阶段流程里每个阶段的 agent 都用对抗 prompt。

---

## Recommendation R5 — 在 LLM-Hook 边界引入 Typed Contract（schema-first）

**Confidence：** MEDIUM（已在 schema 上做了部分工作，再推一步）

**外部参照：**
- BAML：把 LLM 输出当成**强类型函数返回**，schema 和 prompt **co-located + co-versioned**。([BAML vs Pydantic vs Instructor](https://medium.com/@rajkundalia/how-baml-brings-engineering-discipline-to-llm-powered-systems-983c06d31bf8))
- Pydantic AI：validation 失败自动 feed back 给 model 自我修正（reflection mechanism）。([Pydantic AI](https://pydantic.dev/docs/ai/overview/))

**curdx-flow 现状：**
- `schemas/state-ledger.schema.json` 是为 state 文件设计的 ✅
- 但 LLM 与 hook 的**对话边界**没有 schema：
  - `ALL_TASKS_COMPLETE` 是字符串约定
  - `<verification>` 块是 markdown 约定
  - `TASK_MODIFICATION_REQUEST` 是 markdown 约定
- Hook 解析靠正则 / 字符串包含，脆弱
- 没有"schema 改了，所有 prompt 和 hook 同步"的机制

**建议：**

定义一个 `plugins/curdx-flow/schemas/llm-protocol.schema.json`，覆盖所有"LLM 必须按格式吐出的结构化消息"：

```json
{
  "completion_signal": {
    "type": "object",
    "required": ["signal", "verification"],
    "properties": {
      "signal": { "const": "ALL_TASKS_COMPLETE" },
      "verification": {
        "type": "array",
        "items": { "$ref": "#/definitions/verification_block" }
      }
    }
  },
  "task_modification_request": { /* ... */ },
  "evidence_block": { /* ... */ }
}
```

然后：
- skill SKILL.md 从这个 schema **生成**"how to output"段落（co-versioning）
- Hook 解析用 AJV 校验，不通过的发回 LLM"你的输出不符合 contract: <error>"
- CI 加 lint：所有 skill 文档里的输出示例必须通过 schema

价值：
- 当前"`<verification>` 块" / "`ALL_TASKS_COMPLETE`" / "`TASK_MODIFICATION_REQUEST`"这些核心协议从"约定"升级为"contract"
- LLM 输出错了能自动 reflection，不必直接 fail
- 改协议时不会出现"skill 改了但 hook 还在解析老格式"的漂移

**与 Constraints 兼容性：** ✅ AJV 已经在用（`src/runtime/contracts/`），扩展即可。

**建造顺序建议：**
1. 选 `<verification>` 块 schemafy（最高频）
2. `TASK_MODIFICATION_REQUEST` 紧接（最易漂移）
3. `ALL_TASKS_COMPLETE` 最后（最简单，留作压力测试）

**与 SYNTHESIS 区分：** Cluster B 的"`<modifications>` 段落补全"是**协议内容**；R5 是**协议形式化**。两者必须配合，但是两件事。

---

## Recommendation R6 — Skill / Agent / Hook 的 Health Telemetry 升级为"Harness Score"维度

**Confidence：** MEDIUM（学术文献证据较新但有方向感）

**外部参照：**
- Harness Engineering 文献：**只改 wrapper、不改模型**，性能差 6-10x；大多数 agent failure 是 harness 配置问题，不是模型能力。([Harness Engineering](https://www.louisbouchard.ai/harness-engineering/))
- AutoHarness 论文：用 LLM 作为 mutation operator，自动合成更好的 harness。([AutoHarness](https://arxiv.org/pdf/2603.03329))

**curdx-flow 现状：**
- SYNTHESIS Cluster E 已规划"Harness Audit 7 维评分"
- SYNTHESIS Cluster C 已规划"Skill 健康追踪（`skill-runs.jsonl`）"
- 但两者是孤立的：审计是一次性快照，skill 追踪是 success/failure 计数
- 缺一个"持续 harness 评分"的中间层：把 7 维评分**周期性自动跑**，对比历史

**建议（扩展 Cluster C+E，不重复）：**

不重复"加 7 维评分"和"加 skill-runs.jsonl"——SYNTHESIS 已经说了。R6 补的是**结构**：

引入 `plugins/curdx-flow/telemetry/harness-pulse.json`，每周由 CI（或本地 cron）自动跑一次：

```json
{
  "ts": "2026-05-18T00:00:00Z",
  "metrics": {
    "skill_pass_rate": { "start": 0.95, "implement": 0.78, "tasks": 0.92 },
    "hook_block_rate": { "stop-watcher": 0.08, "quick-mode-guard": 0.01 },
    "context_window_p95": 0.62,
    "verification_evidence_rate": 0.89,
    "delta_from_last_pulse": { "implement_pass_rate": -0.04 }
  },
  "regression_flags": ["implement skill pass rate dropped >3% in 1 week"]
}
```

价值：
- "skill 健康"不是绝对值而是**趋势**——R6 强调 delta 检测
- 与 SYNTHESIS Cluster C 的 declining skill 自动检测对接：detection 算法的输入就是这个 pulse
- 与 Cluster E 的 Harness Audit 7 维评分对接：每周跑一次而不是手动触发

**与 Constraints 兼容性：** ✅ 纯文件 + CI 脚本；无运行时依赖。

**建造顺序建议（与 Cluster C/E 同步）：**
1. 先按 Cluster C 落 `skill-runs.jsonl` 数据源
2. 再按 Cluster E 实现 7 维评分函数
3. R6 在这两者之上加 pulse 聚合器和 regression detector

**与 SYNTHESIS 区分：** Cluster C/E 提供原料（事件 + 维度）；R6 提供**周期采样 + 趋势检测**结构。这是 SYNTHESIS 没明说的"频率"维度。

---

## Recommendation R7 — Speculative / Branch Execution（**暂不推荐落地**，但应进 ADR 记录"为什么不做"）

**Confidence：** HIGH（明确建议**不做**，但要 ADR 化）

**外部参照：**
- Sherlock（2025）：selective speculative execution + rollback，overlapping verification with downstream computation。([Sherlock arxiv](https://arxiv.org/pdf/2511.00330))
- ConTree：sandboxed code execution with git-like branching for AI agents。([ConTree](https://contree.dev/))
- Atomix 论文明确警告："speculative branches where parallel plans execute real tool calls, with losing branches leaving residual side effects"。([Atomix](https://arxiv.org/pdf/2602.14849))

**curdx-flow 现状：**
- 严格串行
- 没有"先猜后验"机制
- spec-executor 一次只跑一个 task

**判断：不要做。** 理由：

1. curdx-flow Core Value 是"走流程不跳步"，speculative execution 本质上**鼓励跳步**（先做再撤）
2. Atomix 警告的"losing branch 留 side effect"在文件系统 / git 仓库场景特别危险
3. ConTree 需要 VM 隔离，与 Node-only / hook 零依赖约束冲突
4. 个人使用场景，agent 延迟敏感性 < 正确性敏感性

**建议：**

在 `docs/adr/` 落一条 ADR：`adr-XXX-no-speculative-execution.md`，记录：
- 选项：speculative tool execution / branch + rollback
- 决策：不采纳
- 理由（上面 4 条）
- 触发重新评估的条件：如果 Claude Code 引入 first-class branch primitive，或单 task 平均时长 > 5min 成为常态

**与 Constraints 兼容性：** N/A（不采纳）

**与 SYNTHESIS 区分：** SYNTHESIS Cluster G 提议建 ADR 体系；R7 是"第一条该写的 ADR 内容"——把"我们为什么不做 X"显式记录。

---

## 组件边界建议（基于上述 R1-R6）

**当前 ARCHITECTURE.md 已述层次：**

```
CLI Installer | Plugin Assets | Hook Scripts | Runtime Library | Plugin Runtime CLI
```

**建议引入两个新逻辑层（不需要新目录，但需要概念边界）：**

| 新层 | 职责 | 关键模块 | 与 R# 对应 |
|------|------|----------|------------|
| **Workflow Definition Layer** | 唯一描述 phase 图、转移、artifact 依赖 | `schemas/workflow.json` + 读取器 | R1 |
| **Policy Layer** | 声明式规则，hook 与其求值器解耦 | `policies/*.json` + `lib/rules-engine.mjs` | R3 |

**Event Log 不是新层，是 State 层的演化：**

R2 把 `src/runtime/state/` 改造成 dual-write（state.json + events.jsonl），再迁移到 event-sourced（state.json 变 projection）。这是同一层的内部架构变化，不是新层。

**Verifier 不是新层，是 Agent 层的拆分：**

R4 在现有 agents/ 目录加 `adversarial-verifier.md`，并修改现有 agent 的 system prompt。

**总结当前耦合过紧之处：**

| 耦合 | 当前症状 | R# |
|------|----------|-----|
| Workflow 描述与 Skill 文本耦合 | 加 phase 要改多处 | R1 |
| State 与 History 耦合（覆盖式） | 无 audit / replay | R2 |
| Hook 业务逻辑与规则耦合 | 改规则要重 build hook | R3 |
| LLM 输出与 Hook 解析耦合（约定式） | 改格式静默漂移 | R5 |
| Verifier 与 Executor 共用视角 | 自我合理化风险 | R4 |

---

## 数据流改进路径

**当前 state ledger 数据流：**

```
SKILL 调用
  → coordinator 读 state.json
  → 写 artifact
  → hook 改 state.json (read-modify-write)
  → coordinator 继续
```

**R2 后的数据流（event-sourced）：**

```
SKILL 调用
  → coordinator 读 state.json (projection)
  → 写 artifact
  → hook append event 到 events.jsonl  ← 唯一写路径
  → hook 同步重新 project state.json   ← derived
  → coordinator 继续
```

**Session-spec 绑定的 scaling 路径：**

当前 `.curdx/sessions/<session-id>.json` 是单文件覆盖。Scaling 考虑：
- 多 session 并发对同一 spec？现在没有协议
- Session 过期清理？现在没有 TTL
- 建议：把 session binding 也走 R2 的 event log，加 TTL 字段

---

## 总建造顺序建议

考虑各项 confidence、与 Core Value 的距离、实现成本：

**Wave 1（高 ROI，与 Cluster A 同步推进）：**
1. **R4 adversarial verifier** — 直接配合 SYNTHESIS Cluster A 的"双阶段子代理审查"，纯 prompt 工程，成本最低
2. **R7 ADR** — 写两行字的事，立即记录决策

**Wave 2（基础设施类，为未来铺路）：**
3. **R1 workflow 图 JSON** — 先做 reader 层，hook 不改行为，只换数据源
4. **R5 LLM-protocol schema** — 从 `<verification>` 块开始，最高频边界

**Wave 3（架构演化类，需较大投入）：**
5. **R2 event log（双写过渡）** — Phase 1 双写最先做，验证 1-2 周后再继续
6. **R3 policy layer** — 选 1 条简单规则 PoC，验证 DSL 表达力再扩

**Wave 4（监控类，依赖 SYNTHESIS Cluster C/E 先到位）：**
7. **R6 harness pulse** — 等 `skill-runs.jsonl` 和 7 维评分函数都有了再做聚合层

---

## Confidence 汇总

| Rec | Confidence | 外部证据强度 | 与 Constraints 冲突 |
|-----|-----------|-------------|---------------------|
| R1 Workflow as Graph | MEDIUM | 强（LangGraph + Petri Net 文献） | 无 |
| R2 Event Log | HIGH | 强（Temporal + ESAA） | 无 |
| R3 Policy Layer | MEDIUM | 中（OPA 主要面向多租户场景） | 无（不上 Rego） |
| R4 Adversarial Verifier | HIGH | 强（SWE-Gym + Anthropic） | 无 |
| R5 LLM-Protocol Schema | MEDIUM | 中（BAML 是新范式） | 无（AJV 已有） |
| R6 Harness Pulse | MEDIUM | 中（Harness Engineering 文献较新） | 无 |
| R7 No Speculative | HIGH | 反向证据强（Atomix 警告） | N/A（拒绝采纳） |

**Overall confidence：** MEDIUM-HIGH。R2 / R4 / R7 三条信号最强；R1 / R3 / R5 / R6 是合理但需要本地 PoC 验证表达力的方向。

---

## 与 SYNTHESIS.md 7 簇的对照表（确认无重叠）

| SYNTHESIS Cluster | 关注层 | R# 关注层 | 是否重叠 |
|-------------------|--------|----------|----------|
| A Evidence & Verification Hardening | 加更多验证规则 | R4 改变 verifier 视角 / R5 形式化协议 | **互补** |
| B Workflow Discipline | 加 HARD-GATE / 协议补全 | R1 workflow 图基础设施 / R5 协议 schema | **互补** |
| C Skill Authoring Discipline | skill 写作规范 | R6 pulse 聚合 | **互补** |
| D Cost & Model Strategy | per-phase 模型 | — | **无关** |
| E Runtime Controls | Hook Profile / 7 维评分 | R3 policy layer / R6 pulse | **互补** |
| F Process Specialization | TDD/POC 模式 | — | **无关** |
| G Architecture Docs | ADR 体系 | R7 第一条 ADR 内容 | **互补** |

7 簇 + 7 个 R = 互补、不重叠。

---

## 开放问题

1. **R3 policy DSL 表达力上限** — JSON 规则能不能表达"transcript 里出现 X 但同时 Y 没出现"这种复合条件？需要 PoC
2. **R2 event log 体积** — long-running spec 的 events.jsonl 会不会膨胀到影响 hook 启动时间？需要测
3. **R4 adversarial verifier 的 token 成本** — 每次 stop 都 spawn 一个 verifier agent，与 SYNTHESIS Cluster D 的 per-phase 模型策略要联动设计

---

## Sources

- [LangGraph State Management in Practice (BetterLink, 2026)](https://eastondev.com/blog/en/posts/ai/20260424-langgraph-agent-architecture/)
- [LangGraph in 2026: Multi-Agent AI Systems (DEV)](https://dev.to/ottoaria/langgraph-in-2026-build-multi-agent-ai-systems-that-actually-work-3h5)
- [Anthropic — Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [Anthropic Resources — Building Effective AI Agents](https://resources.anthropic.com/building-effective-ai-agents)
- [Temporal — Durable Execution meets AI](https://temporal.io/blog/durable-execution-meets-ai-why-temporal-is-the-perfect-foundation-for-ai)
- [Temporal — Of course you can build dynamic AI agents](https://temporal.io/blog/of-course-you-can-build-dynamic-ai-agents)
- [ESAA — Event Sourcing for Autonomous Agents (arxiv 2602.23193)](https://arxiv.org/pdf/2602.23193)
- [Trustworthy AI Agents: Deterministic Replay (Sakurasky)](https://www.sakurasky.com/blog/missing-primitives-for-trustworthy-ai-part-8/)
- [AI Agent Audit Log Best Practices (agenticrail)](https://agenticrail.nz/blog/ai-agent-audit-log-best-practices/)
- [SWE-Gym (ICML 2025)](https://github.com/SWE-Gym/SWE-Gym)
- [SWE-Bench Pro (arxiv 2509.16941)](https://arxiv.org/pdf/2509.16941)
- [Aider — Separating code reasoning and editing](https://aider.chat/2024/09/26/architect.html)
- [Aider Architecture Analysis (emsenn.net)](https://emsenn.net/library/domains/engineering/domains/tech/domains/computing/texts/aider-architecture-analysis/)
- [BAML vs Pydantic vs Instructor (Medium 2026)](https://medium.com/@rajkundalia/how-baml-brings-engineering-discipline-to-llm-powered-systems-983c06d31bf8)
- [Pydantic AI Docs](https://pydantic.dev/docs/ai/overview/)
- [Runtime Governance for AI Agents — Policy-as-Code with OPA](https://gokhan-gokalp.com/runtime-governance-for-ai-agents-policy-as-code-with-opa/)
- [Why Open Policy Agent is the Missing Guardrail (Codilime)](https://codilime.com/blog/why-use-open-policy-agent-for-your-ai-agents/)
- [Microsoft agent-governance-toolkit](https://github.com/microsoft/agent-governance-toolkit)
- [Harness Engineering: The Missing Layer (Louis Bouchard)](https://www.louisbouchard.ai/harness-engineering/)
- [AutoHarness (arxiv 2603.03329)](https://arxiv.org/pdf/2603.03329)
- [Sherlock — Reliable and Efficient Agentic Workflow Execution (arxiv 2511.00330)](https://arxiv.org/pdf/2511.00330)
- [Atomix — Timely, Transactional Tool Use (arxiv 2602.14849)](https://arxiv.org/pdf/2602.14849)
- [ConTree — Sandboxed Code Execution with Git-Like Branching](https://contree.dev/)
- [Petri Nets in Workflow Management (World Scientific)](https://www.worldscientific.com/doi/abs/10.1142/S0218126698000043)
- [LLM Agents for Interactive Workflow Provenance (arxiv 2509.13978)](https://arxiv.org/abs/2509.13978)
- [Karpathy CLAUDE.md Skills Guide (Augment Code)](https://www.augmentcode.com/blog/karpathy-skills-on-openclaw-agents-don-t-write-better-code-but-they-do-it-more-efficiently)

---

*Research completed 2026-05-18 — Project Research / Architecture (gap-fill mode), no overlap with SYNTHESIS.md 7 clusters.*
