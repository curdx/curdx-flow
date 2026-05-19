# curdx-flow

## What This Is

curdx-flow 是一个 Claude Code 插件 + npm 安装器。它把 spec workflow（research → requirements → design → tasks → implement → verify）固化成 skill + hook 强制约束，让"AI 写代码"这件事**可控、可验证、可复盘**。当前主要服务于作者本人的日常写代码场景。

## Core Value

**Claude 走流程、不跳步、有证据 —— 这样写出来的代码才漂亮。**

具体含义：
- **走流程**：spec 工作流的每一步不能被 LLM 自己绕过
- **不跳步**：设计未批准不准实现；任务未拆完不准 dispatch；测试未跑通不准说完成
- **有证据**：每一步产出必须可回溯到证据（命令输出 / 外部系统状态 / 文件 diff），不允许凭空"我认为已完成"

如果其他特性都坏了，这件事不能坏。

## Requirements

### Validated

> 已经在 curdx-flow 当前版本（7.3.0）落地、并被作者实际使用的能力。来源：`.planning/codebase/`。

**插件骨架 / 分发**
- ✓ Claude Code plugin 形态（`/curdx-flow:*` skill 命名空间）— `plugins/curdx-flow/`
- ✓ npm 安装器 `npx @curdx/flow`，支持 install/uninstall/update/status/analyze/check — `src/index.ts`
- ✓ marketplace.json git source 分发（hook bundle 必须进 git）— `.claude-plugin/marketplace.json`
- ✓ Cross-plugin 依赖声明（`pua`、`claude-mem`、`chrome-devtools-mcp`、`ui-ux-pro-max`）— `plugins/curdx-flow/.claude-plugin/plugin.json`

**Spec 工作流**
- ✓ 完整阶段 skill：`research` / `requirements` / `design` / `tasks` / `implement`
- ✓ 入口与生命周期管理 skill：`start` / `new` / `status` / `cancel` / `switch` / `refactor` / `triage`
- ✓ Per-spec 执行状态文件 `.curdx-state.json`（schema v2）
- ✓ Session-spec 绑定 `.curdx/sessions/<session-id>.json`

**架构原则（已落地）**
- ✓ **Coordinator-In-One-Turn**：skill 只调度、agent 才干活；coordinator 不直接写代码 / 跑实现
- ✓ **iron-law stop-hook**：单 prompt 内通过 `Stop` hook 拦截"未完成就声明完成"
- ✓ **零运行时 npm 依赖 hook bundle**：esbuild 把 `src/hooks/*.ts` 打成自包含 `.mjs` 落到 `plugins/curdx-flow/hooks/scripts/`
- ✓ Hook exit-0 invariant：任何错误路径都 `process.exit(0)`，hook 永远不会杀死 Claude Code session

**Hook 矩阵（已部署）**
- ✓ `UserPromptSubmit` autopilot、`UserPromptExpansion` guard、`SessionStart` spec 上下文注入、`SubagentStart` 上下文注入、`PreToolUse` quick-mode-guard、`TaskCompleted` verifier、`Stop` watcher（iron-law）、`PostToolBatch` snapshot、`PostCompact` recorder、`StopFailure` handler

**Evidence & Verification（v7.3 主线）**
- ✓ Evidence-driven verification + release gates — `src/runtime/evidence/`、`src/runtime/release/`、commit `a666d53`
- ✓ Static runtime + browser flow 验证（v7.3 系列 hook fix）— commits `907eb87` / `6f24c89` / `a291d6f`

**配套 agents**
- ✓ `spec-executor`、`task-planner`、`research-analyst`、`qa-engineer`、`spec-reviewer`、`code-quality-reviewer`、`refactor-specialist`、`triage-analyst` 等

### Active

> v8 候选方向。来源：`.planning/research/SYNTHESIS.md`（4 仓库 must-port 去重后的 7 个主题簇）。
> **下一步在 `/gsd-new-project` Step 7（Define Requirements）正式筛选并落 REQ-ID。**当前列出候选簇，等用户决策后细化为可勾选 REQ。

**Cluster A — Evidence & Verification Hardening 🔴**（与 Core Value 直接对齐）
- [ ] E2E Validation 义务表（按项目类型必须有真实外部系统验证）
- [ ] 双阶段子代理审查（spec-compliance → code-quality）
- [ ] 验证债务追踪（`status: partial` / `blocked_by`）
- [ ] GateGuard Fact-Forcing（写文件前先列影响范围）
- [ ] Config Protection（阻止改 lint 配置规避错误）

**Cluster B — Workflow Discipline 🟠**
- [ ] Brainstorming HARD-GATE（设计未批准禁止 implement）
- [ ] `<modifications>` 段落补全（spec-executor 主动发出 SPLIT_TASK / ADD_PREREQUISITE / ADD_FOLLOWUP 的协议细节对齐）
- [ ] `human_verify_mode = end-of-phase` 语义

**Cluster C — Skill Authoring Discipline 🟡**
- [ ] CSO 原则纳入 skill 写作规范（description 不写流程摘要）
- [ ] Skill 写作 TDD 循环方法论
- [ ] Skill 健康追踪（`skill-runs.jsonl` + declining 检测）
- [ ] Agent 尺寸 CI lint（硬上限 500 行）

**Cluster D — Cost & Model Strategy 🟡**
- [ ] Per-Phase 模型选择（`models.planning/research/execution/verification`）
- [ ] 动态路由 + 失败层级升级

**Cluster E — Runtime Controls 🟢**
- [ ] Hook Profile 系统（`CURDX_HOOK_PROFILE=minimal|standard|strict` + `CURDX_DISABLED_HOOKS`）
- [ ] Harness Audit 7 维评分
- [ ] context-window 监控（>70% 用量时给 coordinator 注入警告）

**Cluster F — Process Specialization (TDD/POC) 🟢**
- [ ] TDD 管道模式（planner 打 `type:tdd`、executor 强制 RED 先于 GREEN）
- [ ] POC-first vs TDD 各自的任务数下限

**Cluster G — Architecture Docs 🟢**
- [ ] `docs/adr/` 结构化 ADR 体系（落档已有关键决策）

### Out of Scope

> 4 仓库报告的剔除共识 + 项目哲学硬边界。每项带不搬理由。

- **Claude Code 原生已有的功能**（`/goal`、Plan Mode、`EnterWorktree`、read-before-edit guard 等）— 不重复造 Claude Code 已经做的事
- **跨 AI 委托 / Gemini 集成**（get-shit-done `--cross-ai`、superpowers gemini-extension.json）— 哲学冲突：curdx-flow 是 Claude Code-only
- **ECC 的 208 通用开发 skill 合集**（everything-claude-code）— 与 curdx-flow 的 spec-workflow 定位不同，会污染 skill 命名空间
- **Python / Rust 控制平面**（ECC dashboard、ECC2、continuous-learning-v2 完整 Python CLI）— 与 curdx-flow "Node-only + hook bundle 零运行时依赖" 约束冲突
- **多语言文档翻译层** — 当前仓库规模不需要；维护成本 > 收益
- **跟随上游 get-shit-done 做 cherry-pick 同步** — 架构已大幅分叉（commands vs skills、gsd-tools.cjs vs runtime-cli.mjs、.planning/ vs specs/）；按"接管型 fork"原则手工提炼即可
- **Plan Bounce（外部脚本验证计划）** — curdx-flow 无 PLAN.md 概念；引入外部脚本依赖与零运行时依赖约束冲突
- **共享 boilerplate 抽提（`references/mandatory-initial-read.md` 等）** — 当前 agent 数 ~10 个，未到需要共享 boilerplate 的规模
- **全局知识存储（Global Learnings Store）** — claude-mem MCP 已覆盖

## Context

**项目身份**
- **接管型 fork**：从 `get-shit-done` fork 后默认不做上游 sync，按"唯一归宿"原则演化。已完成完整品牌切换（v6.0.0），当前 v7.3.x。
- **作者主要写代码场景**：日常用 curdx-flow 自己写代码，所有需求来自第一手日常使用反馈。

**架构现状**（详见 `.planning/codebase/ARCHITECTURE.md`）
- 混合形态：Claude Code 插件 + npm 安装器
- 插件资产送 `~/.claude`；hook 脚本以 `.mjs` 形态送 + 在 Claude Code 进程里运行
- 整套 spec 工作流以 skill 为入口、agent 干活、hook 做安全网
- 最近主线已是 evidence-driven verification + release gates，下一步往 Cluster A 推天然顺势

**生态参照**（详见 `.planning/research/SYNTHESIS.md`）
- 已对标分析：`everything-claude-code` / `get-shit-done` / `superpowers` / `smart-ralph`
- 7 个主题簇候选，A/B 簇与 Core Value 最直接对齐

**已知技术债 / 风险**（详见 `.planning/codebase/CONCERNS.md`）

## Constraints

- **Tech stack**：Node.js (ESM)、TypeScript（编译为 `.mjs`/`.cjs`）— Why：与 Claude Code 进程兼容、hook bundle 必须自包含
- **Hook bundle 零运行时 npm 依赖**：所有 hook `.mjs` 由 esbuild 内联打包 — Why：marketplace git source 分发不带 `node_modules`
- **Hook exit-0 invariant**：任何 hook 错误都 `process.exit(0)` — Why：非零退出会杀死 Claude Code session（FR-8）
- **Hook bundle 必须进 git**：`plugins/curdx-flow/hooks/scripts/*.mjs` git-tracked — Why：marketplace 走 git source，npm 包不含 plugins/，gitignore 会断 end user
- **Coordinator-In-One-Turn**：skill 不能直接干活，只能调度 — Why：架构纪律；smart-ralph 实测验证的核心模式
- **Claude Code-only**：不支持 Cursor / Copilot CLI / Gemini — Why：哲学聚焦；维护多 harness 成本远超收益
- **首要用户 = 作者本人**：决策标准是"自用顺手"，不为陌生用户做额外迁就 — Why：保持决策速度和方向独立

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 接管型 fork、不做上游 sync | 上游架构分叉过大，cherry-pick 成本 > 手工提炼；"唯一归宿"原则更清爽 | ✓ Good — v6/v7 演化证明独立路径可走 |
| Coordinator-In-One-Turn 架构 | smart-ralph 实测：skill 干活会污染上下文；agent 才该干活 | ✓ Good — 已内化为约束 |
| Hook bundle (.mjs) 必须进 git | 走 marketplace git source 分发，npm 包不含 plugins/，gitignore 会断 end user | ✓ Good — 已落地，merge 噪音是已知代价 |
| Skill namespace 改为 `/curdx-flow:*` | 从 npm installer 升级为完整插件需要稳定命名空间 | — Pending — 升级到 `/curdx:*` 是后续动作 |
| Evidence-driven verification + release gates 作为 v7 主线 | 与 Core Value（"有证据"）直接对齐 | ✓ Good — v7.3 已发布 |
| 版本号默认 PATCH bump | 个人项目，避免 semver 过激 | ✓ Good — 已成习惯 |
| 不跟随 Claude Code 原生已有功能 | 避免重复造轮子（goal / plan mode / worktree 等） | — Pending — 持续在每次评估时检查 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-18 after initialization (greenfield-on-brownfield: existing curdx-flow 7.3.0 codebase + 4-repo extract research)*
