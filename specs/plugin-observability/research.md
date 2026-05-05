---
spec: plugin-observability
phase: research
created: 2026-05-05
sources:
  - research-slice-A-jsonl-schema.md
  - research-slice-B-hook-error-capture.md
  - research-slice-C-cli-integration.md
  - research-slice-D-comparable-tools.md
---

# Research — plugin-observability

## Executive Summary

为 curdx-flow 增加"自我观测"能力可行，工程量可控，且**有空白市场**——OSS 圈所有 jsonl 解析器都是用户视角（成本/历史阅读），plugin owner 视角无人做。

| 维度 | 结论 |
|---|---|
| 可行性 | **高**。Claude Code 已经把 hook lifecycle 全量记录到 `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl` 的 `attachment.type=hook_success` 事件，含 `hookName/hookEvent/stdout/stderr/exitCode/durationMs/toolUseID` 全套字段；v2.1.126+ 还直接给 `attributionPlugin/Skill` 用于 plugin 维度切片。 |
| 风险 | **中**。schema 漂移确凿——v2.1.119→2.1.126 九天内增删过 6 个顶层 type；本机实测 16 种 type 含已知 bug（[#36583](https://github.com/anthropics/claude-code/issues/36583)）。Anthropic 无任何 schema 稳定性承诺。 |
| 工作量 | **S–M**。零新增 dependency；CLI 子命令仅改 4 处；hook 错误埋点仅扩 1 个 type + 加 1 个 lib utility；首批报告 5 类核心 + 2 类漂移诊断。 |
| 差异化 | claude-mem 是 user 视角（实时 hook 入 SQLite + ChromaDB），ccusage 算 token 账单——**plugin owner 视角"我的插件被怎么用 / 哪个 hook 慢 / 哪个 command 失败"是空白**。 |

## Key Findings

### F1. 数据源已现成，无需埋点

`attachment.type=hook_success` 一行包含完整 hook 触发轨迹（含 stdout/stderr/exitCode/durationMs）。v2.1.126+ 的 assistant 事件还带 `attributionPlugin/Skill`，可直接按"哪个 slash command 触发了哪些 tool"切片。subagent 调用走主 transcript（`tool_use.name="Agent"`，本机扫描 61 文件 sidechain 0 次），单文件即可重构调用树。

### F2. Schema 漂移已经发生，必须用 declarative map 防御

**证据**：
- v2.1.119 删 `agent-name`/`custom-title`，2.1.121 加 `ai-title`，2.1.126 加 `pr-link`/`queue-operation`/`attributionPlugin/Skill`。
- 本机实测 16 种 type，OSS 解析器普遍只覆盖 5–7 种。
- [#36583](https://github.com/anthropics/claude-code/issues/36583): resume session 时 `messageId/uuid` 冲突导致 25% history 不可达。

**对策**：抄 claude-mem `~/.claude-mem/transcript-watch.json` 的 declarative schema map 模式——改 JSON 不改代码，未识别 type 计数到 `unknown_type_count` 但不报错，写进报告顶部作漂移诊断。

### F3. curdx-flow 现有 4 hook 全部静默吞错

- 中央兜底 `src/hooks/_shared/run-hook.ts:60-80` catch all → 写 stderr + exit 0（用户看不到）。
- 12+ 处分散 `try { ... } catch { /* swallow */ }`（stop-watcher.ts 占 6 处）。
- **没有任何持久化错误轨迹**——出问题完全不可观测，故"errors.jsonl 埋点"是 net new 价值，不是重复造轮子。

### F4. CLI 集成几乎零成本

- `src/index.ts` 现用 [`citty`](https://github.com/unjs/citty)，4 个现成子命令模板（install/uninstall/update/status）。
- `analyze` 仅需 4 处微改：1 import + 1 `defineCommand` + 1 `subCommands` + 1 `SUBCOMMANDS.add()`。
- 流式读 jsonl 用 `node:readline`（标准库），markdown 输出手写 string template，**零新增 dependency**。
- bundle 增量 8–15 KB（dist 当前 64KB），可接受。

### F5. 增量 offset 解析必须从 day 1 引入

- 实测本机 `~/.claude/projects/-Users-wdx-opc-curdx-flow/` 单 session 文件可破 100MB（含 `/learn-codebase` 后）。
- ccusage 因没去重被社区追加 `(messageId, requestId)` 双键修补。
- 抄 claude-mem `transcript-watch-state.json` 的 `{path: byte_offset}` 模式 → 增量读 tail。**同时**用 `(uuid, requestId)` 双键去重处理 resume session。

### F6. Privacy default 必须严格

transcript 含用户 prompt / 文件路径 / shell 输出 / token / `file-history-snapshot` 文件全文。即便本地 only，markdown 报告可能被分享。

**默认策略（参考 Next.js telemetry）**：
- 默认 redact prompt 全文，只输出长度 + 命令分布。
- 路径只保留 basename + project hash。
- `file-history-snapshot.snapshot` **完全不读**。
- `--include-prompts` flag 显式 opt-in。
- README 写"我们不采集 X / Y / Z"清单。

### F7. errors.jsonl Schema 共识

5 字段必填（grep + jq 友好），可选字段按需：

```jsonc
{ "ts":"<ISO8601>", "level":"error|warn|info", "hook":"<name>", "event":"<slug>", "msg":"<≤500B>" }
// 可选: session_id, cwd, spec, path, stack(≤2KB)
```

存放路径 `~/.claude/curdx-flow/errors.jsonl`。同步 `appendFileSync`（< 5ms），quick-mode-guard 10s timeout 内不阻塞。**不轮转**（日均错误 << 100，年增长 < 10MB），用户手动 rm。

### F8. 起步报告清单（5 核心 + 2 漂移）

| # | 报告 | 数据源 | 价值 |
|---|---|---|---|
| 1 | Hook 失败 Top-N | jsonl `hook_success.exitCode≠0` + errors.jsonl | 找最痛的 hook |
| 2 | Slash command 使用频次 | `attributionSkill` (v2.1.126+) + `<command-name>` XML fallback | 哪个 command 用得多/少 |
| 3 | Subagent 调度热度 | `tool_use.name=Agent` + `subagent_type` | research/design/implement 各 phase 占比 |
| 4 | Spec 完成漏斗 | `specs/*/.curdx-state.json.phase` | spec 卡在哪 |
| 5 | duration 分位数 | `hook_success.durationMs` p50/p95/p99 | 性能长尾 |
| 6 | unknown_type_count | jsonl 解析器漂移计数 | schema drift 诊断 |
| 7 | parentUuid 断链率 | jsonl 链完整性校验 | resume session 断链监控 |

## Constraints / Assumptions

| 约束 | 来源 | 备注 |
|---|---|---|
| 仅本地，不上报 | 用户对齐 (turn 5/5) | 无云端通道；无 opt-out 流程；无 GA-style 上报 |
| `node:readline` 流式解析 | Slice C | 文件 100MB+ 不能 readFileSync |
| Node 20+ | `package.json:11` | `fs.readdir({recursive:true})` 可用 |
| 同步 `appendFileSync` | Slice B | quick-mode-guard 10s timeout，async 写会丢 |
| 单行 < 4KB | POSIX `PIPE_BUF` | 多 hook 并发 append 原子性 |
| schema 不稳 | Slice A + D | declarative map + 未识别 type 静默 + 漂移报告 |
| 隐私 redact-by-default | Slice D（Next.js 模式） | `--include-prompts` opt-in |

**ASSUMPTION（待确认）**：Windows 下 `~` 解析依赖 `os.homedir()`，跨平台路径 `%USERPROFILE%\.claude\projects\C--foo-bar\...` 推断而非实测。**design 阶段需在 Windows VM 验证**。

## Decision Points (for Design Phase)

| # | 选项 | 推荐 | 理由 |
|---|---|---|---|
| D1 | Schema layer：declarative JSON map vs hardcoded TS types | **declarative**（仿 claude-mem `transcript-watch.json`） | schema 漂移确凿；改 JSON 不改代码；未来加 type 不挂 |
| D2 | 增量 offset：day 1 引入 vs v2 再加 | **day 1** | 单文件 100MB+ 已实测；不增量则 plugin owner 跑一次 > 30s |
| D3 | 报告输出：stdout vs `--out <file>` 默认 | **stdout 默认** + `--out` 可选 | pipe 友好，配合 `> report.md` |
| D4 | 解析器目录结构：`src/analyze/{parser,filter,report}.ts` 三件套 vs 单文件 | **三件套** | 便于 vitest 单测纯函数 |
| D5 | errors.jsonl 轮转：硬上限 truncate vs 不轮转 | **不轮转**（KISS） | 日均 << 100 行，年增长 < 10MB |
| D6 | Privacy 默认：redact-all vs include-prompts | **redact-by-default** + opt-in flag | 即便本地，markdown 可能被分享 |
| D7 | Hook 错误埋点新增的 `lib/error-logger.mjs` 是否再 wrap `_shared/run-hook.ts` 的中央 catch | **是** | 一次接入，4 hook + 12 处 swallow catch 都受益 |

## Open Questions

1. errors.jsonl 是否需要 settings 开关（如 `errorLogEnabled: true` 默认开）？还是默认无开关？
2. `analyze` 是否要加 `--project <name>` flag 还是默认 cwd 项目？
3. Schema map JSON 文件放在 `plugins/curdx-flow/schemas/transcript-events.json`（与 spec.schema.json 同目录）还是 `src/analyze/schemas/`？
4. 报告里 token 成本（来自 `assistant.usage`）要不要算？还是把"是否盈利"留给 ccusage？
5. Windows 下的实证测试是否 in scope？还是声明"Windows 支持但需用户报 issue"？

## Recommendations

1. 进入 **design 阶段** —— 7 个决策点 (D1–D7) 大部分已有强证据推荐，design.md 主要敲定数据流图 + 模块边界。
2. **不要做** dashboard / 实时流 / 上报通道（用户已对齐 + 避坑 5 印证）。
3. **必须做** declarative schema map（F2 + F4）+ 增量 offset（F5）+ redact-by-default（F6）—— 这三个是质量底线，少一个就有现成踩坑。
4. errors.jsonl 与 analyze CLI **解耦**—— 一个 hook 写、一个 CLI 读，schema 兼容即可，不强依赖。

## Action Steps (Next)

1. User review research.md。
2. 通过后跑 `/curdx-flow:requirements` 生成验收标准（重点：D1–D7 决策固化、Open Questions 收敛）。
3. 之后 `/curdx-flow:design` 出数据流图 + 模块拆分（parser / filter / report / error-logger）。
4. `/curdx-flow:tasks` 拆 fine-grained tasks（POC：先跑通"读 1 个 jsonl → 输出 markdown 表格"再加增量、schema map、错误埋点）。
5. `/curdx-flow:implement` 启动闭环。

## Sources

详见 4 个 slice 报告（同目录 `research-slice-{A,B,C,D}-*.md`），关键外部链接：

- [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks)
- [code.claude.com/docs/en/claude-directory](https://code.claude.com/docs/en/claude-directory)
- [github.com/anthropics/claude-code/issues/36583](https://github.com/anthropics/claude-code/issues/36583) (schema bug)
- [github.com/ryoppippi/ccusage](https://github.com/ryoppippi/ccusage)
- [github.com/daaain/claude-code-log](https://github.com/daaain/claude-code-log)
- [bettercli.org/design/collecting-analytics](https://bettercli.org/design/collecting-analytics/)
- [nextjs.org/telemetry](https://nextjs.org/telemetry)
