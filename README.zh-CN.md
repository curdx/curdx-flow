<div align="center">

[English](./README.md) · **中文**

# `@curdx/flow`

### *Claude Code 的需求驱动工作流，任务自己跑完。*

**丢一句需求过去。研究、需求文档、设计、任务拆分、带测试的代码——它一条龙给你出。每个任务独立 context，不串味。**

[![npm version](https://img.shields.io/npm/v/@curdx/flow?color=FF6B35&label=npm)](https://www.npmjs.com/package/@curdx/flow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built for Claude Code](https://img.shields.io/badge/Built%20for-Claude%20Code-5B6CFF)](https://claude.ai/code)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520.12-3C873A)](https://nodejs.org)

[上手](#-上手) · [怎么跑](#-怎么跑) · [命令一览](#%EF%B8%8F-命令一览) · [图什么](#-图什么)

```bash
npx @curdx/flow
```

</div>

---

## 🚀 这玩意是啥

一个 npm 包，给你两样东西：

1. **一个 Claude Code 插件**——`/curdx-flow:*` 系列斜杠命令，按 spec（规格）来开发。从一句"我想搞个 X"，到结构化文档 + 跑得起来的代码，全自动。
2. **一键安装器**——你想用的 Claude Code 插件和 MCP 服务（claude-mem 跨会话记忆、pua 抗失败模式、chrome-devtools-mcp、context7、sequential-thinking 这些），装、更新、卸载，一条命令搞定。

```text
你：    /curdx-flow:start "搞个带 token 刷新的 OAuth 登录"
flow：  *60 秒小访谈，把模糊地方问清楚*
flow：  *并行研究小队上场 → research.md 写完*
你：    *点头通过*  →  /curdx-flow:requirements
flow：  *product-manager agent 出 → requirements.md*
你：    *点头通过*  →  /curdx-flow:design
flow：  *architect-reviewer 出 → design.md*
你：    *点头通过*  →  /curdx-flow:tasks
flow：  *task-planner 出 → 4 个阶段、12 个任务*
你：    *点头通过*  →  /curdx-flow:implement
flow：  *任务 1 → 验证 → 提交 → 任务 2 → … 跑到全部打勾*
你：    *回来翻翻 diff，没毛病就 ship。*
```

---

## 🧭 怎么跑

<div align="center">
  <img src="docs/img/workflow.svg" alt="curdx-flow 工作流：research → requirements → design → tasks → implement，最后一步是自动 loop" width="100%">
</div>

5 个阶段。每个阶段对应一个专门的子 agent，输出一份 Markdown，**写完停下来等你点头**。最后那个 `implement` 阶段最香——任务、验证、提交、下一个，自己一直跑，跑到 `tasks.md` 里每个 checkbox 都翻绿才停。你倒杯咖啡，回来看 diff 就行。

<div align="center">
  <img src="docs/img/architecture.svg" alt="curdx-flow 架构：一个 npm 包两个产物——内置插件 + 插件/MCP 安装器" width="100%">
</div>

---

## ⚡ 上手

### 1. 先装好 Claude Code

还没装？戳这儿：<https://docs.anthropic.com/en/docs/claude-code>。

### 2. 跑安装器

```bash
npx @curdx/flow
```

第一次跑会让你挑语言（中文 / English），然后选要装啥。`curdx-flow` 这个插件本身是必装的——这是工作流的本体。其他的随便勾。

```bash
npx @curdx/flow              # 进交互菜单
npx @curdx/flow install --all --yes   # 全装上，零交互
npx @curdx/flow status       # 看现在装了啥、哪些过时了
npx @curdx/flow update       # 全部升到最新
npx @curdx/flow uninstall    # 卸得干净
```

### 3. 开搞一个 spec

在你项目目录下打开 Claude Code，输入：

```text
/curdx-flow:start
> 我想加个限流的 /api/upload 接口，要支持 S3 分片上传
```

齐活。flow 会带你跑访谈、派研究小队、把 `specs/upload-api/research.md` 写出来，然后停下来等你点头。

---

## 📦 安装器里有啥

精挑过的几样工具，你按需勾选。

| ID | 类型 | 干嘛用的 |
| --- | --- | --- |
| **`curdx-flow`** | 插件（内置） | 就这仓库本身。`/curdx-flow:*` 命令的来源。**永远会装上。** |
| `claude-mem` | 插件 | 跨会话记忆——上次记下的东西，这次自动召回，免得你天天复述背景。 |
| `pua` | 插件 | "抗失败"模式。连错 2 次或者察觉你不爽时自动上压力，逼 agent 换路子。 |
| `chrome-devtools-mcp` | 插件 | 通过 MCP 操真 Chrome——性能、网络、控制台、截图都能干。 |
| `frontend-design` | 插件 | 前端产出有辨识度，避开那种"一眼 AI 生成"的塑料感。 |
| `sequential-thinking` | mcp | 逐步推理 MCP（`@modelcontextprotocol/server-sequential-thinking`）。 |
| `context7` | mcp | 实时拉库文档，比训练数据里的过期答案靠谱。 |

随时 `npx @curdx/flow status` 看下当前状态。

---

## 🛠️ 命令一览

内置插件在 Claude Code 里给你这些斜杠命令：

| 命令 | 干嘛 |
| --- | --- |
| `/curdx-flow:start` | 智能入口——新开 spec 或者接着上次的来，自动跑访谈。 |
| `/curdx-flow:new` | 强制新开一个 spec，跳过 resume 检测。 |
| `/curdx-flow:research` | 派并行研究小队去摸目标。 |
| `/curdx-flow:requirements` | 从需求 + 研究合成 `requirements.md`。 |
| `/curdx-flow:design` | 架构师 agent 出 `design.md`。 |
| `/curdx-flow:tasks` | 把设计拆成带勾选框的任务列表。 |
| `/curdx-flow:implement` | **自动执行 loop**——一个任务接一个，跑完才停。 |
| `/curdx-flow:triage` | 把大需求拆成几个有依赖关系的 spec（epic）。 |
| `/curdx-flow:status` | 看所有 spec 和进度。 |
| `/curdx-flow:switch` | 切到别的 spec。 |
| `/curdx-flow:refactor` | 跑完之后系统化更新 spec 文件。 |
| `/curdx-flow:cancel` | 停掉正在跑的 loop，把状态清干净。 |
| `/curdx-flow:index` | 把代码库 + 外部资源做成可搜的索引。 |
| `/curdx-flow:help` | 看插件帮助和工作流概览。 |
| `/curdx-flow:feedback` | 提反馈或报 bug。 |

所有产物都写在 `specs/<spec 名>/` 里，纯 Markdown，跟你代码一起进 git，跨会话也不会丢。

---

## 🤔 图什么

Claude Code 写代码是真快。但放到真实项目里——它会漏测试、跨会话丢上下文、产出看心情，尤其当代码库本身有很多约定和坑要避。

我也试过别家方案。基本都在加复杂度——几十个 agent 互相调、几千行 prompt 文件——但产出该糙还糙，token 烧得更多、等得更久。

`@curdx/flow` 走另一条路：

- **靠 spec 立 flag，不靠感觉**。动手前必须先有 `research.md` → `requirements.md` → `design.md` → `tasks.md`。这些文件都进你的 git，你能 review，同事能 review。
- **子 agent 各管一段，别堆叠**。一个阶段一个专家，独立 context。不搞 50 个 agent 互相 @ 来 @ 去的大杂烩。
- **Loop 自己闭环**。`/curdx-flow:implement` 一直跑——执行、验证、提交、下一个——直到所有 checkbox 都翻绿。你走开，回来看 diff。
- **安装器和插件一个包**。不挑 marketplace、不动配置、不搭脚手架，`npx @curdx/flow` 一条命令完事。

> Claude Code 是发动机。`curdx-flow` 是整车装配。

---

## 🗂️ 文件都落在哪

装完之后，你机器上长这样：

```
~/.claude/
  plugins/cache/curdx/curdx-flow/<version>/   ← 插件本体
  CLAUDE.md                                   ← 我们管理的那个 <!-- BEGIN @curdx/flow --> 块

<你的项目>/
  specs/
    .current-spec
    .current-epic
    <spec 名>/
      research.md
      requirements.md
      design.md
      tasks.md
      .curdx-state.json   ← 执行状态（已 gitignore）
      .progress.md        ← 阶段笔记（已 gitignore）
```

全局 `~/.claude/CLAUDE.md` 里那个 `<!-- BEGIN @curdx/flow v1 -->` 块告诉 Claude 你装了哪些工具。flow 只重写这个块，**外面的内容原样不动**。不想要这个块？传 `--no-claude-md`，或者设环境变量 `CURDX_FLOW_NO_CLAUDE_MD=1`。

---

## 🧱 环境要求

- **Node.js** ≥ 20.12
- **Claude Code** CLI 装好且在 `PATH` 上（安装器要调 `claude plugin` 和 `claude mcp`）
- 可选：**Bun** ≥ 1.0——装 `claude-mem` 时会自动检测，没装就提醒你装

---

## 📜 许可证

MIT。Fork 走，自己玩。

> 想贡献代码？翻 [`CLAUDE.md`](./CLAUDE.md)，本地开发环境和发版流程都在那儿。
