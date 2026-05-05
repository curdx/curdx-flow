<div align="center">

[English](./README.md) · **中文**

# `@curdx/flow`

### *给 Claude Code 用的规格驱动开发流，自动化执行任务。*

**说一句你想做什么。从研究、需求、设计、任务到带测试的代码，一个任务一个 fresh context，全自动跑完。**

[![npm version](https://img.shields.io/npm/v/@curdx/flow?color=FF6B35&label=npm)](https://www.npmjs.com/package/@curdx/flow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built for Claude Code](https://img.shields.io/badge/Built%20for-Claude%20Code-5B6CFF)](https://claude.ai/code)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520.12-3C873A)](https://nodejs.org)

[快速开始](#-快速开始) · [工作原理](#-工作原理) · [命令清单](#%EF%B8%8F-命令清单) · [为什么造它](#-为什么造它)

```bash
npx @curdx/flow
```

</div>

---

## 🚀 这是什么？

`@curdx/flow` 是**一个 npm 包，提供两样东西**：

1. **一个 Claude Code 插件** — `/curdx-flow:*` 系列斜杠命令，规格驱动（spec-driven）开发。一句模糊需求进，结构化规格 + 可运行代码出。
2. **一键安装器** — 挑选你真正想用的 Claude Code 插件和 MCP 服务器（claude-mem、pua、chrome-devtools-mcp、context7、sequential-thinking…），更新干净，卸载干净。

```text
你：    /curdx-flow:start "加个带 token 刷新的 OAuth 登录"
flow：  *访谈你 60 秒，问关键问题*
flow：  *并行研究小组开始调研 — 输出 research.md*
你：    *确认通过*  →  /curdx-flow:requirements
flow：  *product-manager 子 agent — 输出 requirements.md*
你：    *确认通过*  →  /curdx-flow:design
flow：  *architect-reviewer — 输出 design.md*
你：    *确认通过*  →  /curdx-flow:tasks
flow：  *task-planner — 4 个阶段、12 个任务*
你：    *确认通过*  →  /curdx-flow:implement
flow：  *任务 1 → 验证 → 提交 → 任务 2 → … 全部跑完*
你：    *回来。看 diff。发版。*
```

---

## 🧭 工作原理

<div align="center">
  <img src="docs/img/workflow.svg" alt="curdx-flow 工作流：research → requirements → design → tasks → implement，最后一阶段带自主循环" width="100%">
</div>

5 个阶段，每个阶段委派给一个专家子 agent，写一份 Markdown 文档，然后**停下等你确认**。最后一阶段（`implement`）跑自主循环——任务 → 验证 → 提交 → 下一个任务，直到 `tasks.md` 里每个 checkbox 都打勾。

<div align="center">
  <img src="docs/img/architecture.svg" alt="curdx-flow 架构：一个 npm 包，两个产物——内置插件和插件/MCP 安装器" width="100%">
</div>

---

## ⚡ 快速开始

### 1. 安装 Claude Code

还没装的话：<https://docs.anthropic.com/en/docs/claude-code>。

### 2. 跑安装器

```bash
npx @curdx/flow
```

第一次运行会让你选语言（中文 / English），然后挑要装哪些工具。内置的 `curdx-flow` 插件总是会装上——这就是规格工作流本身。其他都是可选项。

```bash
npx @curdx/flow              # 交互式菜单
npx @curdx/flow install --all --yes   # 全量安装，无交互
npx @curdx/flow status       # 查看已装/过期项
npx @curdx/flow update       # 全部更新到最新
npx @curdx/flow uninstall    # 干净卸载
```

### 3. 启动一个规格

在项目里，打开 Claude Code：

```text
/curdx-flow:start
> 我想加一个带限流的 /api/upload 接口，要支持 S3 分片上传
```

完事。flow 会跑访谈、分发研究、写 `specs/upload-api/research.md`，然后停下等你确认。

---

## 📦 安装器里有什么

精心挑选过，按需勾选。

| ID | 类型 | 干啥的 |
| --- | --- | --- |
| **`curdx-flow`** | 插件（内置） | 本仓库。规格驱动开发，提供 `/curdx-flow:*` 命令。**总是会装。** |
| `claude-mem` | 插件 | 跨会话记忆——把观察记下来，下次会话自动召回。 |
| `pua` | 插件 | "抗失败"压力模式。连续失败 2+ 次或检测到用户不爽时自动触发。 |
| `chrome-devtools-mcp` | 插件 | 通过 MCP 操控真实的 Chrome——性能、网络、控制台、截图。 |
| `frontend-design` | 插件 | 前端产出有辨识度，避免那种"一看就 AI 生成"的味道。 |
| `sequential-thinking` | mcp | 逐步推理 MCP 服务器（`@modelcontextprotocol/server-sequential-thinking`）。 |
| `context7` | mcp | 实时拉库文档的 MCP，比训练数据里的过时内容靠谱。 |

随时跑 `npx @curdx/flow status` 查当前状态。

---

## 🛠️ 命令清单

内置插件在 Claude Code 里暴露这些斜杠命令：

| 命令 | 干啥 |
| --- | --- |
| `/curdx-flow:start` | 智能入口——开新规格或继续旧的，自动跑访谈。 |
| `/curdx-flow:new` | 强制开新规格（跳过 resume 检测）。 |
| `/curdx-flow:research` | 启动并行研究小组调研目标。 |
| `/curdx-flow:requirements` | 用目标 + 研究生成 `requirements.md`。 |
| `/curdx-flow:design` | 架构师 agent 生成 `design.md`。 |
| `/curdx-flow:tasks` | 把设计拆成带 checkbox 的任务列表。 |
| `/curdx-flow:implement` | **自主执行 loop** — 一个任务接一个，跑完为止。 |
| `/curdx-flow:triage` | 把大特性拆成多个有依赖关系的规格（epic）。 |
| `/curdx-flow:status` | 列出所有规格和进度。 |
| `/curdx-flow:switch` | 切换当前活跃规格。 |
| `/curdx-flow:refactor` | 执行后系统化更新规格文件。 |
| `/curdx-flow:cancel` | 取消正在跑的执行 loop，清理状态。 |
| `/curdx-flow:index` | 把代码库 + 外部资源索引成可搜索的规格。 |
| `/curdx-flow:help` | 查看插件帮助和流程概览。 |
| `/curdx-flow:feedback` | 提交反馈或报告插件问题。 |

所有产物都写到 `specs/<规格名>/` 里——纯 Markdown，纳入版本控制，跨会话存活。

---

## 🤔 为什么造它

Claude Code 写代码很快。但真实项目里它会跳过测试、跨会话丢上下文、产出不稳定——特别是当代码库有真实的约定要遵守、有真实的回归要避免。

我试过同类方案。大部分都在堆复杂度——几十个 agent、几千行指令文件——但产出并没变好。只是烧更多 token、等更久。

`@curdx/flow` 押的是另一个方向：

- **规格就是合约，不是感觉**。代码动手前必须有 `research.md` → `requirements.md` → `design.md` → `tasks.md` 这 4 份文档。它们存在你的仓库里，你能读，reviewer 也能读。
- **子 agent 各司其职，不堆叠**。每个阶段一个专家 agent，独立 context 窗口。没有 50 个 agent 的乱炖编排。
- **Loop 自己跑**。`/curdx-flow:implement` 一直推进——执行任务、验证、提交、下一个，直到每个 checkbox 都翻面。你走开，你回来，你看 diff。
- **安装器 + 插件一体打包**。不用挑 marketplace、不用改配置、不用 scaffold 项目。一条 `npx @curdx/flow` 搞定。

> Claude Code 是引擎。`curdx-flow` 是底盘。

---

## 🗂️ 文件都在哪

装完之后，你机器上长这样：

```
~/.claude/
  plugins/cache/curdx/curdx-flow/<version>/   ← 插件本体
  CLAUDE.md                                   ← 管理过的 `<!-- BEGIN @curdx/flow -->` 块

<你的项目>/
  specs/
    .current-spec
    .current-epic
    <规格名>/
      research.md
      requirements.md
      design.md
      tasks.md
      .curdx-state.json   ← 执行状态，已 gitignore
      .progress.md        ← 阶段笔记，已 gitignore
```

全局 `~/.claude/CLAUDE.md` 里那个 `<!-- BEGIN @curdx/flow v1 -->` 块告诉 Claude 你装了啥。flow 只重写这个块，块外面的东西**原样保留**。如果不想要这个管理块，传 `--no-claude-md`（或设环境变量 `CURDX_FLOW_NO_CLAUDE_MD=1`）。

---

## 🧱 环境要求

- **Node.js** ≥ 20.12
- **Claude Code** CLI 已装并在 `PATH` 上（安装器会调用 `claude plugin` 和 `claude mcp`）
- 可选：**Bun** ≥ 1.0 — 装 `claude-mem` 时会自动检测并询问

---

## 🧪 本地开发

```bash
git clone https://github.com/curdx/curdx-flow.git
cd curdx-flow
npm install
npm run dev          # tsup watch 模式
npm run typecheck
npm run build
node dist/index.mjs  # 烟雾测试
```

内置插件在 `plugins/curdx-flow/`。Hook（TypeScript）通过 `npm run build:hooks` 编出 `.mjs`；CI 用 `check:hooks-fresh` 把关，防止 bundle 跟源码错位。

发版 SOP：看 [`CLAUDE.md`](./CLAUDE.md) — `npm run bump-version <patch|minor|major>` 原子化同步全部 5 个版本号字段，然后 `git tag vX.Y.Z && git push --tags` 触发发布工作流。

---

## 📜 许可证

MIT。Fork 它。Ship 它。让它变成你的。
