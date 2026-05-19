# curdx-flow v8 Research Summary

**Project:** curdx-flow
**Domain:** Claude Code 插件 + spec workflow 强约束执行框架
**Researched:** 2026-05-18（批 1：4 仓库提炼；批 2：gap-fill）
**Confidence:** MEDIUM-HIGH

---

## Executive Summary

curdx-flow 是一个把 spec workflow 固化成 Claude Code 插件的"强约束执行框架"，Core Value 是"走流程、不跳步、有证据"。v7.3.0 已落地完整骨架（hook 矩阵、Coordinator-In-One-Turn、evidence-driven verification），v8 的核心任务是把这三条从"设计承诺"变成"技术强约束"。

两批研究合并看，方向清晰：**首要任务是加固 verification 的技术强度**（幻象完成是 2026 行业公认头号 AI coding agent 失败模式，不是作者偏好）；其次是补 Claude Code 2026 新增的 lifecycle event 支持（平台层空白）；再次是架构层面把规则从散落 TS 文本升级为可静态分析、可审计的基础设施。stack 层没有立刻爆炸的安全 advisory，但有 3 个需计划处理的 schema drift / EOL 风险。

最关键的外部结论：`<HARD-GATE>` 不能只靠 SKILL.md 文本——Plan Mode 已被官方 issue（#13638）公开证实可被 LLM 绕过，hook 层强制是唯一可靠手段。安全方面新增了一个 7 个 Cluster 都没覆盖的主题：prompt injection / skill 投毒 / npm supply chain，建议在 Cluster A 下挂"Security Hygiene"子簇。

---

## Key Findings

### Stack 状态（来自 STACK.md）

**紧急处理（HIGH）：**
- `SessionStart matcher: "*"` — 官方只支持 4 个枚举值，当前可能从未真正触发（需立即修）
- Claude Code lifecycle events 从 14 涨到 29，curdx-flow 只用 10 个；`SessionEnd` / `PreCompact` / `PostToolUseFailure` / `ConfigChange` / `TaskCreated` 直接服务 Core Value
- vitest 落后 2 个 major（v2.1.9 → v4.1.6），安全 patch 不回流

**计划处理（MEDIUM）：**
- Node engines `>=20.12.0` — Node 20 已 EOL（2026-04），需抬到 `>=22.11.0`
- TypeScript 5.9 → 6.0 已发布，现在可先在 tsconfig 显式加 `esModuleInterop: true` 对齐
- esbuild 0.24.2 → 0.28.0，无 API break，直接 bump 可接受

**已对齐（不动）：** ajv、picocolors、tsup（已是最新）、hook bundle 零运行时依赖、exit-0 invariant、marketplace 路径变量

### 可加的能力（来自 SYNTHESIS A-G + FEATURES A1-A10，按优先级）

**P0 — 直接对齐 Core Value，不做则承诺变空话：**
- 见 SYNTHESIS.md Cluster A（E2E Validation、双阶段子代理审查、验证债务追踪、GateGuard、Config Protection）
- FEATURES A1（新 hook 事件：`PostToolUseFailure` / `ConfigChange` / `SessionEnd` / `PreCompact`）
- FEATURES A4（Sandboxing 作为 implement 阶段 OS 层安全闸，opt-in）

**P1 — 流程纪律，防 LLM 绕过：**
- 见 SYNTHESIS.md Cluster B（HARD-GATE、`<modifications>` 补全）
- PITFALLS P7（HARD-GATE 必须 hook 层，不能只靠 SKILL.md 文本）

**P2 — 平台层新能力集成：**
- FEATURES A2（Agent View 集成，store session_id + `claude attach` 引导，不自己造 dashboard）
- FEATURES A5（MCP Elicitation 替换 design → implement 转换的自由文本审批）
- FEATURES A3（Agent Teams 替代双阶段顺序 subagent，实验性）

**P3 — 质量/可观测性/自动化：**
- 见 SYNTHESIS.md Cluster C（CSO 原则、Skill TDD、skill-runs.jsonl、agent 尺寸 CI lint）
- 见 SYNTHESIS.md Cluster D（Per-Phase 模型选择、动态路由）
- 见 SYNTHESIS.md Cluster E（Hook Profile 系统、Harness Audit 7 维评分）
- FEATURES A6（Routines 健康巡检）、A8（OpenTelemetry opt-in）、A9（Checkpoint 引导）

**P4 — 低优先级 / 便宜就做：**
- 见 SYNTHESIS.md Cluster F（TDD 管道、POC 任务密度约束）
- 见 SYNTHESIS.md Cluster G（ADR 体系，极低成本）
- FEATURES A7（AGENTS.md 摘要）、A10（MCP Apps UI，独立包）

### 架构演化方向（来自 ARCHITECTURE.md R1-R7，全部与现有 7 簇互补无重叠）

| 推荐 | 性质 | 优先级 |
|------|------|--------|
| R4 Adversarial Verifier（对抗式 verifier agent） | 纯 prompt 工程，成本最低 | Wave 1 |
| R7 ADR（不做 speculative execution） | 几行文档 | Wave 1 |
| R1 Workflow as Graph（schemas/workflow.json 单一事实源） | 基础设施 | Wave 2 |
| R5 LLM-Protocol Schema（`<verification>` 等协议形式化） | 基础设施 | Wave 2 |
| R2 Event Log（.curdx-events.jsonl 双写过渡） | 架构演化 | Wave 3 |
| R3 Policy Layer（规则 JSON DSL + rules-engine.mjs） | 架构演化 | Wave 3 |
| R6 Harness Pulse（周期采样 + 趋势检测） | 监控 | Wave 4 |

### 必须警惕的 5 条最关键 Pitfall

1. **P6 幻象完成**（Critical）— text-match 不算证据；executor 自报完成无效。防：E2E validation 义务表 + 双阶段子代理审查。这是 Cluster A 优先级的**外部正当性来源**。
2. **P1 Stop hook 8-block 无限循环**（Critical）— iron-law + Coordinator-In-One-Turn 交叉点，社区已有实证（50 分钟 session 耗尽）。防：`stop_hook_active=true` 时放行；补 8-block mock test。
3. **P7 HARD-GATE 被 LLM 绕过**（High）— 官方 issue #13638 公开确认。防：HARD-GATE 必须落 `PreToolUse` hook，物理拦截 Edit/Write。
4. **P2+P3 CLAUDE.md 投毒 / Skill 隐藏指令**（Critical）— Snyk ToxicSkills：13.4% ClawHub skill 含 critical injection。防：SessionStart hook 扫描 + `check --scan-skills` + CI lint。
5. **P8 npm postinstall supply chain**（High）— 2026 三起真实攻击。防：curdx-flow npm 包绝不写 postinstall；`npm provenance` + 2FA。

**新增主题：** P2/P3/P4/P12 指向同一能力，建议在 Cluster A 下挂"Security Hygiene"子簇。

### 决策待办（≤10 条）

| # | 问题 | 来源 | 建议默认 |
|---|------|------|---------|
| D1 | Per-Phase 模型配置存哪里？ | SYNTHESIS | `.curdx/config.json` 新建 |
| D2 | E2E Validation 义务表是硬约束还是建议？ | SYNTHESIS | 硬约束；快速原型 spec 单独 opt-out |
| D3 | GateGuard 默认启用还是 opt-in？ | SYNTHESIS | 默认 on；可用 Hook Profile env 关掉 |
| D4 | TDD 管道优先级？ | SYNTHESIS | 延后（Cluster A/B 更紧迫） |
| D5 | Agent View 集成：background session 默认还是 opt-in？ | FEATURES A2 | opt-in |
| D6 | Agent Teams：哪些 reviewer pair 先用？ | FEATURES A3 | 纳入 experimental flag，spec 阶段定 |
| D7 | Sandbox 强制还是建议？ | FEATURES A4 / PITFALLS C3 | 建议（doctor 通过时提示），绝不强制 |
| D8 | Elicitation 需要独立 MCP server 吗？ | FEATURES A5 | spec 阶段实地验证，优先不架新 server |
| D9 | `mcpServers` inline 取代 `claude mcp add`？ | STACK.md § plugin.json | 需先决定 MCP 注册真相源 |
| D10 | R3 Policy DSL 表达力：复合条件用 JSON 还是回 TS？ | ARCHITECTURE R3 | PoC 1 条最简单规则后再决定 |

---

## Recommended Roadmap Themes

### Theme 1 — Evidence & Verification Hardening
**来源：** SYNTHESIS Cluster A + PITFALLS P1/P2/P3/P4/P6/P11/P12 + FEATURES A1/A4 + ARCHITECTURE R4
**内容：** Stop hook 8-block 修复、幻象完成防御、E2E validation 义务表、adversarial verifier、HARD-GATE 研究前置（其落地在 Theme 3）、新 hook 事件（PostToolUseFailure / ConfigChange / SessionEnd / PreCompact）、Security Hygiene 子簇（CLAUDE.md 扫描、skill 投毒检测、安全 backport 监控）、Sandboxing opt-in
**为什么最先：** Core Value 直接对齐；外部行业证据最强；其他 theme 的"正确性"都依赖这层
**估计 phase 数：** 2-3

### Theme 2 — Stack & Platform Alignment
**来源：** STACK.md S1/S2/S3/S4
**内容：** 修 SessionStart matcher、抬 Node engines >=22.11.0、esbuild/tsup 同步 node22 target、vitest v4 升级（独立 PR）、plugin.json 加 `displayName` / `$schema`
**为什么较早：** SessionStart schema drift 是 Theme 1 hook 的基础设施，必须先修
**估计 phase 数：** 1（轻量 housekeeping）

### Theme 3 — Workflow Discipline
**来源：** SYNTHESIS Cluster B + PITFALLS P7 + FEATURES A5 + ARCHITECTURE R1/R5
**内容：** HARD-GATE PreToolUse hook 层强制（不是 SKILL.md 文本）、`<modifications>` 协议细节、workflow.json 单一事实源、LLM-protocol schema 形式化、MCP Elicitation design 审批
**为什么在 Theme 1 之后：** 依赖 Theme 1 的 hook 基础；HARD-GATE 实现需先确认 phase-gate hook 设计
**估计 phase 数：** 1-2

### Theme 4 — Skill Authoring Discipline + Cost Strategy
**来源：** SYNTHESIS Cluster C/D + PITFALLS P14/P15/P16 + ARCHITECTURE R6
**内容：** CSO 原则 lint、Skill TDD、skill-runs.jsonl、agent 尺寸 CI lint、Per-Phase 模型选择、动态路由、Harness Pulse 周期采样
**估计 phase 数：** 1-2

### Theme 5 — Runtime Controls & Observability
**来源：** SYNTHESIS Cluster E + PITFALLS P5/P17 + FEATURES A2/A6/A8 + ARCHITECTURE R2/R3
**内容：** Hook Profile 系统、plugin cache 刷新修复、CC 上游变更监控、Harness Audit 7 维评分、OTel opt-in、Routines 健康巡检、event log 双写过渡、policy layer PoC、Agent View 集成
**估计 phase 数：** 2

### Theme 6 — Process Specialization & Architecture Docs
**来源：** SYNTHESIS Cluster F/G + ARCHITECTURE R7 + FEATURES A7/A9/A10
**内容：** TDD 管道、ADR 体系（首条：不做 speculative execution）、AGENTS.md 摘要、Checkpoint 引导、POC 任务密度约束、MCP Apps UI（可选）
**估计 phase 数：** 1

---

## Cross-Reference Index

| 来源 | ID | 一句话 | 归属 Theme |
|------|----|--------|------------|
| SYNTHESIS Cluster A | A-E2E | E2E Validation 义务表 | Theme 1 |
| SYNTHESIS Cluster A | A-Dual | 双阶段子代理审查 | Theme 1 |
| SYNTHESIS Cluster A | A-Debt | 验证债务 status:partial | Theme 1 |
| SYNTHESIS Cluster A | A-Gate | GateGuard Fact-Forcing | Theme 1 |
| SYNTHESIS Cluster A | A-Cfg | Config Protection | Theme 1 |
| SYNTHESIS Cluster B | B-HG | HARD-GATE（hook 层） | Theme 3 |
| SYNTHESIS Cluster B | B-Mod | `<modifications>` 协议 | Theme 3 |
| SYNTHESIS Cluster B | B-HV | human_verify_mode | Theme 3 |
| SYNTHESIS Cluster C | C-CSO | CSO 原则 | Theme 4 |
| SYNTHESIS Cluster C | C-Health | skill-runs.jsonl | Theme 4 |
| SYNTHESIS Cluster C | C-Lint | Agent 尺寸 CI lint | Theme 4 |
| SYNTHESIS Cluster D | D-Model | Per-Phase 模型选择 | Theme 4 |
| SYNTHESIS Cluster D | D-Route | 动态路由 + 失败升级 | Theme 4 |
| SYNTHESIS Cluster E | E-Prof | Hook Profile 系统 | Theme 5 |
| SYNTHESIS Cluster E | E-Audit | Harness Audit 7 维评分 | Theme 5 |
| SYNTHESIS Cluster F | F-TDD | TDD 管道 | Theme 6 |
| SYNTHESIS Cluster G | G-ADR | ADR 体系 | Theme 6 |
| FEATURES | A1 | 新 hook 事件（4 个） | Theme 1+2 |
| FEATURES | A2 | Agent View 集成 | Theme 5 |
| FEATURES | A3 | Agent Teams | Theme 3 |
| FEATURES | A4 | Sandboxing opt-in | Theme 1 |
| FEATURES | A5 | MCP Elicitation | Theme 3 |
| FEATURES | A6 | Routines 健康巡检 | Theme 5 |
| FEATURES | A7 | AGENTS.md 摘要 | Theme 6 |
| FEATURES | A8 | OpenTelemetry opt-in | Theme 5 |
| FEATURES | A9 | Checkpoint 引导 | Theme 6 |
| FEATURES | A10 | MCP Apps UI | Theme 6 |
| ARCHITECTURE | R1 | Workflow as Graph | Theme 3 |
| ARCHITECTURE | R2 | Event Log 双写 | Theme 5 |
| ARCHITECTURE | R3 | Policy Layer | Theme 5 |
| ARCHITECTURE | R4 | Adversarial Verifier | Theme 1 |
| ARCHITECTURE | R5 | LLM-Protocol Schema | Theme 3 |
| ARCHITECTURE | R6 | Harness Pulse | Theme 4 |
| ARCHITECTURE | R7 | 不做 Speculative Execution（ADR） | Theme 6 |
| PITFALLS | P1 | Stop hook 8-block 循环 | Theme 1 |
| PITFALLS | P2 | CLAUDE.md 投毒 | Theme 1 |
| PITFALLS | P3 | Skill 隐藏指令 | Theme 1 |
| PITFALLS | P4 | CVE-2026-24887 参数注入 | Theme 1 |
| PITFALLS | P5 | plugin cache 不刷新 | Theme 5 |
| PITFALLS | P6 | 幻象完成 | Theme 1 |
| PITFALLS | P7 | HARD-GATE 被绕过 | Theme 3 |
| PITFALLS | P8 | npm postinstall supply chain | 发布工程 |
| PITFALLS | P9 | typosquatting | 发布工程 |
| PITFALLS | P10 | shrinkwrap 平台锁定 | 发布工程 |
| PITFALLS | P11 | esbuild __require 残留 | Theme 1 |
| PITFALLS | P12 | fork 安全补丁监控缺失 | Theme 1 |
| PITFALLS | P13 | license attribution 断裂 | 一次性补 |
| PITFALLS | P14 | CSO 违反 | Theme 4 |
| PITFALLS | P15 | Attractive Metadata Attack | Theme 4 |
| PITFALLS | P16 | Opus 过度 delegate | Theme 4 |
| PITFALLS | P17 | CC 上游非破坏性变更 | Theme 5 |
| STACK | S1 | SessionStart matcher schema drift | Theme 2 |
| STACK | S2 | vitest v2 落后 2 major | Theme 2 |
| STACK | S3 | Node 20 EOL | Theme 2 |
| STACK | S4 | 29 lifecycle events 只用 10 | Theme 1+2 |

---

## Open Questions

见决策待办 D1-D10，另补两条技术开放问题：
- **R3 event log 体积**：long-running spec 的 events.jsonl 需基准测试后再决定是否 lazy load
- **R4 adversarial verifier token 预算**：与 D1 Per-Phase 模型联动设计（verifier 用 Sonnet/Haiku）

---

## Confidence Assessment

| 区域 | Confidence | 说明 |
|------|------------|------|
| Stack gap 识别 | HIGH | npm registry 实测 + 官方 docs 两处印证 |
| 新 lifecycle events | HIGH | code.claude.com 官方 hooks reference 直接读取 |
| SessionStart schema drift | HIGH | 官方 docs 明确列出 4 枚举值，无 `"*"` |
| 幻象完成 / Cluster A 必要性 | HIGH | 多份独立产线分析 + 学术共识 |
| HARD-GATE 被绕过 | HIGH | 官方 repo 公开 issue #13638 |
| Prompt injection pitfalls | HIGH | CVE + 多家安全厂商 + arxiv 论文 |
| Architecture R1/R3/R5 | MEDIUM | 外部参照强，本地 PoC 待验证 |
| R2 Event Log | HIGH | Temporal + ESAA 强证据；stdlib 实现无依赖风险 |
| Agent Teams / Elicitation | MEDIUM-HIGH | GA 但 experimental；细节 spec 阶段实地验证 |
| Routines / OTel | MEDIUM | Research preview；最小间隔等需二次验证 |

**Overall:** MEDIUM-HIGH — Theme 1/2/3 证据充分可直接规划；Theme 4-6 方向正确但部分细节需 spec 阶段实地验证。

**Gaps（需在 planning/spec 阶段解决）：**
- D5-D10 技术实现路径
- R3 Policy DSL：PoC 后再决定是否扩展
- R4 adversarial verifier token 预算，与 D1 联动
- esbuild bundle `__require` 审计，跑一次实际 audit

---

*Research completed: 2026-05-18*
*Input: SYNTHESIS.md（批 1）+ STACK.md / FEATURES.md / ARCHITECTURE.md / PITFALLS.md（批 2）*
*Ready for roadmap: yes*
