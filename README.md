<div align="center">

**English** · [中文](./README.zh-CN.md)

# `@curdx/flow`

### *Spec-driven dev for Claude Code, with autonomous task execution.*

**Describe what you want. Get research, requirements, design, tasks, and tested code — task by task, fresh context per task.**

[![npm version](https://img.shields.io/npm/v/@curdx/flow?color=FF6B35&label=npm)](https://www.npmjs.com/package/@curdx/flow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built for Claude Code](https://img.shields.io/badge/Built%20for-Claude%20Code-5B6CFF)](https://claude.ai/code)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520.12-3C873A)](https://nodejs.org)

[Quick start](#-quick-start) · [How it works](#-how-it-works) · [Commands](#-commands) · [Why it exists](#-why-it-exists)

```bash
npx @curdx/flow
```

</div>

---

## 🚀 What is this?

`@curdx/flow` is **one npm package that delivers two things**:

1. **A Claude Code plugin** — `/curdx-flow:*` slash commands for spec-driven development. Vague idea in, structured spec + working code out.
2. **A one-shot installer** — pick the Claude Code plugins and MCP servers you actually want (claude-mem, pua, chrome-devtools-mcp, context7, sequential-thinking, …), keep them updated, uninstall cleanly.

```text
You:    /curdx-flow:start "Add OAuth login with token refresh"
flow:   *interviews you for 60s, asks clarifying questions*
flow:   *parallel research team investigates — research.md*
You:    *approve*  →  /curdx-flow:requirements
flow:   *product-manager agent — requirements.md*
You:    *approve*  →  /curdx-flow:design
flow:   *architect-reviewer — design.md*
You:    *approve*  →  /curdx-flow:tasks
flow:   *task-planner — 12 tasks across 4 phases*
You:    *approve*  →  /curdx-flow:implement
flow:   *executes task 1 → verify → commit → task 2 → … until done*
You:    *come back. read the diff. ship.*
```

---

## 🧭 How it works

<div align="center">
  <img src="docs/img/workflow.svg" alt="curdx-flow workflow: research → requirements → design → tasks → implement, with autonomous loop on the final phase" width="100%">
</div>

Five phases. Each phase delegates to a specialist subagent, writes one Markdown artifact, and **stops for your approval**. The final phase (`implement`) runs an autonomous loop — task → verify → commit → next task — until every task in `tasks.md` is checked off.

<div align="center">
  <img src="docs/img/architecture.svg" alt="curdx-flow architecture: one npm package, two products — bundled plugin and plugin/MCP marketplace installer" width="100%">
</div>

---

## ⚡ Quick start

### 1. Install Claude Code

If you don't have it yet: <https://docs.anthropic.com/en/docs/claude-code>.

### 2. Run the installer

```bash
npx @curdx/flow
```

On first run you'll pick a language (中文 / English), then choose what to install. The bundled `curdx-flow` plugin is always installed — that's the spec workflow itself. Everything else is optional.

```bash
npx @curdx/flow              # interactive menu
npx @curdx/flow install --all --yes   # install everything, no prompts
npx @curdx/flow status       # what's installed, what's stale
npx @curdx/flow update       # bump everything to latest
npx @curdx/flow uninstall    # clean removal
```

### 3. Start a spec

Inside a project, in Claude Code:

```text
/curdx-flow:start
> I want to add a rate-limited /api/upload endpoint with S3 multipart support.
```

That's it. flow runs the interview, dispatches research, writes `specs/upload-api/research.md`, and pauses for your approval.

---

## 📦 What gets installed

The marketplace ships with carefully picked tools. You opt in per item.

| ID | Type | What it does |
| --- | --- | --- |
| **`curdx-flow`** | plugin (bundled) | This repo. Spec-driven dev with `/curdx-flow:*` commands. **Always installed.** |
| `claude-mem` | plugin | Cross-session memory — claude-mem stores observations and recalls them next session. |
| `pua` | plugin | "Anti-failure" pressure mode. Auto-fires on 2+ failures or user frustration. |
| `chrome-devtools-mcp` | plugin | Drive a real Chrome via MCP — performance, network, console, screenshots. |
| `frontend-design` | plugin | Distinctive frontend output. Avoids generic AI aesthetics. |
| `sequential-thinking` | mcp | Step-by-step reasoning MCP server (`@modelcontextprotocol/server-sequential-thinking`). |
| `context7` | mcp | Live library docs over MCP. Beats stale training-data answers. |

Run `npx @curdx/flow status` any time to see what's on your machine.

---

## 🛠️ Commands

The bundled plugin exposes these slash commands inside Claude Code:

| Command | What it does |
| --- | --- |
| `/curdx-flow:start` | Smart entry point — new spec or resume existing. Runs the interview. |
| `/curdx-flow:new` | Force-create a new spec (skip resume detection). |
| `/curdx-flow:research` | Parallel research team investigates the goal. |
| `/curdx-flow:requirements` | Generate `requirements.md` from goal + research. |
| `/curdx-flow:design` | Architect agent generates `design.md`. |
| `/curdx-flow:tasks` | Break design into a checked task list. |
| `/curdx-flow:implement` | **Autonomous execution loop** — task by task until done. |
| `/curdx-flow:triage` | Decompose a large feature into multiple dependency-aware specs (epic). |
| `/curdx-flow:status` | Show all specs and progress. |
| `/curdx-flow:switch` | Switch active spec. |
| `/curdx-flow:refactor` | Update spec files methodically after execution. |
| `/curdx-flow:cancel` | Cancel active execution loop, cleanup state. |
| `/curdx-flow:index` | Index codebase + external resources into searchable specs. |
| `/curdx-flow:help` | Show plugin help and workflow overview. |
| `/curdx-flow:feedback` | Submit feedback or report a plugin issue. |

Everything writes to `specs/<spec-name>/` — the artifacts are plain Markdown, version-controlled, and survive across sessions.

---

## 🤔 Why it exists

Claude Code is fast. But on real projects it skips tests, loses context between sessions, and produces inconsistent results — especially when the codebase has real conventions and real regressions to catch.

I tried the alternatives. Most add complexity — dozens of agents, thousands of lines of instructions — but the output doesn't actually get better. You burn more tokens and wait longer.

`@curdx/flow` takes a different bet:

- **Specs are the contract**, not vibes. Every change has `research.md` → `requirements.md` → `design.md` → `tasks.md` before any code runs. They live in your repo. You can read them. Reviewers can read them.
- **Subagents are specialized, not stacked**. One agent per phase. Each gets a fresh context window. No 50-agent orchestration salad.
- **The loop runs itself**. `/curdx-flow:implement` keeps going — execute task, verify, commit, next task — until every checkbox flips. You walk away. You come back. You read the diff.
- **Installer + plugin in one package**. You don't pick a marketplace, edit a config, scaffold a project. You run `npx @curdx/flow` once.

> Claude Code is the engine. `curdx-flow` is the chassis.

---

## 🗂️ Where things live

After install, here's what's on your machine:

```
~/.claude/
  plugins/cache/curdx/curdx-flow/<version>/   ← the plugin
  CLAUDE.md                                   ← managed `<!-- BEGIN @curdx/flow -->` block

<your-project>/
  specs/
    .current-spec
    .current-epic
    <spec-name>/
      research.md
      requirements.md
      design.md
      tasks.md
      .curdx-state.json   ← execution state, gitignored
      .progress.md        ← phase notes, gitignored
```

The `<!-- BEGIN @curdx/flow v1 -->` block in your global `~/.claude/CLAUDE.md` tells Claude what's installed. flow only ever rewrites that block — anything outside is preserved verbatim. Pass `--no-claude-md` (or `CURDX_FLOW_NO_CLAUDE_MD=1`) to opt out.

---

## 🧱 Requirements

- **Node.js** ≥ 20.12
- **Claude Code** CLI on `PATH` (the installer shells out to `claude plugin` and `claude mcp`)
- Optional: **Bun** ≥ 1.0 — auto-detected and offered if you install `claude-mem`

---

## 📜 License

MIT. Fork it. Ship it. Make it yours.

> Want to contribute? See [`CLAUDE.md`](./CLAUDE.md) for local dev setup and release SOP.
