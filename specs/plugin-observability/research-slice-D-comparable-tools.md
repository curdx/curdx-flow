---
spec: plugin-observability
slice: D - 竞品 / 类似工具调研
created: 2026-05-05
---

# Slice D — 竞品 + 最佳实践调研

## Executive Summary
claude-mem 不**事后**解析 jsonl，而是**实时 hook + declarative schema 抽象层**（`transcript-watch.json` 用 path/equals/in/coalesce 配置匹配）；OSS 解析器（ccusage / claude-code-log）几乎都直接 `for line in file: json.parse`，靠 `(uuid, requestId)` 去重，不做 schema 抽象。Anthropic **没承诺** transcript schema 稳定性，本机实测 16 种 `type`，且已知 file-history-snapshot bug（#36583）。方案 3 应吸收 claude-mem 的"declarative schema map"思路 + ccusage 的"双键去重"。

## claude-mem 解析机制

**关键证据**：本机已安装 `12.5.1` (`~/.claude/plugins/cache/thedotmack/claude-mem/12.5.1/`)，data 在 `~/.claude-mem/`。

| 维度 | 实际做法 | 证据 |
|------|---------|------|
| 数据来源 | **首选 hook 实时事件**（PostToolUse / Stop / SessionStart / UserPromptSubmit / PreToolUse Read），**辅以** transcript jsonl tail-watch | `hooks/hooks.json`（6 个 hook 注册）+ `~/.claude-mem/transcript-watch-state.json`（offsets 字典）+ worker bundle 内有 `fs.watch` / `transcriptMirrorBatcher` / `transcriptPath` |
| Schema 抽象 | **Declarative JSON-pattern matching layer**：`transcript-watch.json` 描述每个 schema（codex / claude）下哪些 type → 哪个 action（session_init / tool_use / tool_result / session_end），字段抽取支持 `coalesce`（多路径回退） | `~/.claude-mem/transcript-watch.json` line 4-115（codex schema），实测 v12.5.1 watches 数组里只配置了 codex，但 schemas object 是通用的 |
| 增量解析 | 按 file path 存 byte offset，`startAtEnd:true` 启动时跳过历史 | `transcript-watch-state.json` 第 3 行：`"...rollout-2026-04-26....jsonl": 341905` |
| 去重 | 不公开记录，但持久化层是 SQLite（`claude-mem.db` + WAL）+ ChromaDB 向量 | `~/.claude-mem/claude-mem.db` / `chroma/` 目录 |
| Schema 漂移 | 通过 `transcript-watch.json` 的 `version` + 命名 schemas 解决——**改 JSON 不改代码** | 文件首行 `"version": 1`，schemas 下嵌套版本（codex 0.3） |
| 复用可能 | **不能**——claude-mem 把数据写进自己的 SQLite，对外只暴露 `http://localhost:$PORT/api/context/inject` 和 `/api/search`（per-UID 端口 37700+uid%100），且按 project 维度查；plugin owner 视角的"我的插件被怎么用"它不抽 | `skills/timeline-report/SKILL.md` line 25-50；端口取自 `~/.claude-mem/settings.json` 或 env `CLAUDE_MEM_WORKER_PORT` |

**关键启示**：transcript-watch.json 这种 "config-as-schema-mapper" 模式是 schema-drift 的银弹，方案 3 应直接借鉴。

## 其他 OSS 解析器对比

| 工具 | 语言 | 解析策略 | 输出 | Schema 抽象 | 去重 |
|------|------|---------|------|------------|------|
| [ccusage](https://github.com/ryoppippi/ccusage) | TS/Bun | 一次性读 `~/.claude/projects/**/*.jsonl`，按 `timestamp` / `message.model` / `usage.{input,output,cache_creation,cache_read}_tokens` 抽取 | 终端表格、JSON、MCP server | 无（硬编码字段） | `(messageId, requestId)` —— 由社区 issue 推动加入，避免 resume session 重计 |
| [claude-code-log](https://github.com/daaain/claude-code-log) | Python | 一次性读，按 type=user/assistant/summary/system/tool_use/tool_result/thinking 渲染 HTML | HTML + TUI | 无（按 type 分支硬编码） | cross-session summary matching（按 sessionId） |
| [claude-code-transcripts](https://github.com/simonw/claude-code-transcripts) | Python | 静态导出 | 分页 HTML | 无 | 不需要（一次性） |
| [claude-JSONL-browser](https://github.com/withLinda/claude-JSONL-browser) | TS | 浏览器一次性 | Markdown | 无 | 不需要 |
| [ClaudeCodeJSONLParser](https://github.com/amac0/ClaudeCodeJSONLParser) | HTML+JS | 浏览器一次性 + git 时间线对齐 | HTML | 无 | 无 |

**共性结论**：OSS 圈**没有**人做"plugin 维度切片"——他们都是 user 视角（成本 / 阅读 / 历史）。从 plugin owner 角度切片是空白，方案 3 是差异化点。

## Claude Code 官方 schema 承诺（lack thereof）

WebFetch [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks) 结果：

| 问题 | 官方答复 |
|------|---------|
| transcript jsonl schema 是否稳定？ | **没有任何稳定性声明**。文档只在 hook input 里提 `transcript_path`，但内部格式完全不文档化 |
| hook input schema 是否稳定？ | "Agent hooks are experimental and may change."（仅适用 agent-hook 子集） |
| 有官方 telemetry/observability API？ | **没有**。唯一的"可观测"是 `/hooks` 菜单（只读列出已配置 hook） |
| 已知 schema bug | [#36583](https://github.com/anthropics/claude-code/issues/36583)：resume session 时 `file-history-snapshot.messageId` 与 message `uuid` 冲突，34 collisions / 330 entries → 25% history 丢失，**已 closed 但无 fix 说明** |
| 本机实测 type 种类（`038fcfb8-9c4b-42f8-a6b6-aa712e1bbc72.jsonl`） | 16 种：`assistant / attachment / deferred_tools_delta / direct / file-history-snapshot / hook_success / last-prompt / message / permission-mode / skill_listing / system / text / thinking / tool_result / tool_use / user` —— `deferred_tools_delta` `permission-mode` `skill_listing` `last-prompt` 是 OSS 解析器普遍**未处理**的新增 type，schema 漂移**已经发生** |

**结论**：必须假设 schema 不稳。

## CLI telemetry 最佳实践（外部参照）

| 来源 | 关键观点 | 借鉴 |
|------|---------|------|
| [Better CLI - Collecting Analytics](https://bettercli.org/design/collecting-analytics/) | (1) 只采必需；(2) 服务端 sanitize/filter（让 release 后能补救）；(3) 命令完成"几秒内"上报有 timeout；(4) 用自有域名 facade，不上第三方 | 我们不做云端，规则全部本地化 |
| [Next.js Telemetry](https://nextjs.org/telemetry) | 采：command + version + CPU/OS/CI flag + plugin list + build duration；**不采**：env vars / file paths / file contents / logs / 序列化 error；opt-out via `NEXT_TELEMETRY_DISABLED=1` + `next telemetry disable`；提供 `NEXT_TELEMETRY_DEBUG=1` dump 到 stderr 让用户验证 | 即便本地 only，也要给"看一眼采了啥"的开关 |
| Storybook / Homebrew 模式 | opt-out 是事实标准（opt-in 在 OSS 因为不预设引导步骤而采集率低） | 本地 only 场景 opt-in 可行：报告默认不生成，要 `/curdx-flow:observe` 才跑 |
| 通用 CLI 指标 | command distribution / exit code / duration P50/P95/P99 / error rate / version + OS + CI flag | 方案 3 输出报告应至少有这 5 类 |

## Plugin-observability 避坑清单

1. **JSONL 体积爆炸** — 实测本机 `~/.claude/projects/-Users-wdx-opc-curdx-flow/` 单个 session 几十 MB，`/learn-codebase` 之后单文件可破 100MB。**对策**：增量 offset 解析（抄 claude-mem `transcript-watch-state.json`），不要每次全读；解析后只持久化聚合后的 metric，原文不入库。
2. **Schema 漂移无声失败** — 已知 16 种 type，且 `file-history-snapshot` 引发 25% history 不可达（#36583）。**对策**：用 declarative schema map（抄 claude-mem `transcript-watch.json`），未识别 type 计数报告但**不报错**；report 顶部强制写"unknown_type_count"诊断字段。
3. **Resume session 重复计数** — ccusage 因没去重被社区追加 `(messageId, requestId)` 双键。**对策**：直接用双键，新增 `parentUuid` chain 完整性校验，断链时降级为"按 timestamp 粗略统计"并标注。
4. **Privacy 投诉** — transcript 原文含用户 prompt（敏感）+ 文件路径 + 项目名。即便本地报告，写 markdown 时也可能被分享。**对策**：默认 redact prompt 全文（只留长度 + 命令分布），路径只保留 basename + project hash；用 `--include-prompts` 显式 opt-in；参考 Next.js "no env vars / no file contents / no logs" 规则。
5. **报告无人看 / 解析慢** — claude-mem 把 timeline 做到 ~5min `/learn-codebase` 才有效；OSS 解析器普遍小于 10s 但只输出"漂亮表格"，使用率低。**对策**：(a) p95 解析时间 ≤ 3s（增量 offset + 只读 metadata 字段），否则 plugin owner 不会跑；(b) 输出**带洞察**的 markdown（top-N 失败命令、慢命令分位数、unknown_type 漂移），不是 raw dump；(c) 默认 dry-run 模式打印"会采什么"（抄 `NEXT_TELEMETRY_DEBUG=1`）。

## 对方案 3 的微调建议

1. **核心解析器加 schema map 层** — 仿 claude-mem `transcript-watch.json`，新建 `plugins/curdx-flow/schemas/transcript-events.json`，把 type → action → 字段路径写成 JSON 配置，**改 schema 不改代码**。后续 Claude Code 加 type 只需 PR 这个 JSON。
2. **去重双键 `(uuid, requestId)`** — 不重复造轮子，直接抄 ccusage（issue 推动后的版本）。
3. **增量 offset state 文件** — `~/.curdx-flow/observability-state.json` 存 `{path: byte_offset}`，每次只读 tail。
4. **Privacy 默认严格** — redact prompt / path / project name；`--include-prompts` 才输出原文；模仿 Next.js telemetry 文档级别的"我们不采集 X / Y / Z" 列表写进 README。
5. **opt-in 而非自动** — 用户跑 `/curdx-flow:observe` 才生成报告；不要 hook PostToolUse 后台跑。理由：本地 only + plugin owner 是次要受众 + 解析慢风险（避坑 5）。
6. **不要复用 claude-mem 的 worker** — 端口 per-UID、SQLite schema 私有、视角错配（user 视角不是 plugin owner 视角）。我们的输出是"plugin 健康度报告"，独立路径更清晰。
7. **报告必含字段**（参考 CLI telemetry 共识 + plugin owner 视角）：
   - command/skill/hook 调用分布（top-N + freq）
   - exit code / hook success rate
   - duration P50 / P95 / P99（per command）
   - error 摘要（去重后 top-N stack signature）
   - 版本 + OS + CI flag（抄 Next.js）
   - **unknown_type_count + parentUuid_chain_breaks**（漂移诊断，独家）

## Sources

- [github.com/ryoppippi/ccusage](https://github.com/ryoppippi/ccusage)
- [github.com/daaain/claude-code-log](https://github.com/daaain/claude-code-log)
- [github.com/simonw/claude-code-transcripts](https://github.com/simonw/claude-code-transcripts)
- [github.com/withLinda/claude-JSONL-browser](https://github.com/withLinda/claude-JSONL-browser)
- [github.com/amac0/ClaudeCodeJSONLParser](https://github.com/amac0/ClaudeCodeJSONLParser)
- [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks)
- [github.com/anthropics/claude-code/issues/36583](https://github.com/anthropics/claude-code/issues/36583)
- [bettercli.org/design/collecting-analytics](https://bettercli.org/design/collecting-analytics/)
- [nextjs.org/telemetry](https://nextjs.org/telemetry)
- [storybook.js.org/docs/configure/telemetry](https://storybook.js.org/docs/configure/telemetry)
- 本机文件：
  - `/Users/wdx/.claude/plugins/cache/thedotmack/claude-mem/12.5.1/hooks/hooks.json`
  - `/Users/wdx/.claude/plugins/cache/thedotmack/claude-mem/12.5.1/skills/timeline-report/SKILL.md`
  - `/Users/wdx/.claude/plugins/cache/thedotmack/claude-mem/12.5.1/skills/how-it-works/SKILL.md`
  - `/Users/wdx/.claude-mem/transcript-watch.json`
  - `/Users/wdx/.claude-mem/transcript-watch-state.json`
  - `/Users/wdx/.claude/projects/-Users-wdx-opc-curdx-flow/038fcfb8-9c4b-42f8-a6b6-aa712e1bbc72.jsonl`（type 多样性现场样本）
