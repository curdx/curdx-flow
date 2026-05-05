---
spec: plugin-observability
phase: requirements
created: 2026-05-05
---

# Requirements — plugin-observability

## Overview

为 curdx-flow 插件构建本地优先的自我观测能力。读取 Claude Code 已有的 transcript jsonl + 在 4 个 hook 错误路径写 errors.jsonl，输出 `npx @curdx/flow analyze` markdown 报告，让 plugin owner 反向优化 hook/command/subagent 设计。零上报、零云端、零新增 npm 依赖。

## Primary User

- **plugin owner**（curdx-flow 维护者）：消费 markdown 报告做产品决策。
- end user（plugin 使用者）：被动产生数据；不预设其消费流程。

## User Stories

| ID | 身份 | 动作 | 价值 |
|---|---|---|---|
| US-1 | plugin owner | 跑 `analyze` 看 hook 失败 Top-N | 找最痛的 hook 优先修 |
| US-2 | plugin owner | 看 slash command 频次 | 哪个 command 用得多/少 → 决定砍/推 |
| US-3 | plugin owner | 看 subagent 调度热度 | research/design/implement 占比是否健康 |
| US-4 | plugin owner | 看 spec 完成漏斗 | spec 卡在哪 phase → 流程改进点 |
| US-5 | plugin owner | 看 hook duration P50/P95/P99 | 性能长尾定位 |
| US-6 | plugin owner | 看 schema 漂移诊断 | unknown_type_count + parentUuid 断链率 → 兼容性预警 |
| US-7 | plugin owner | hook 出错时查 errors.jsonl | 不再静默吞错 |
| US-8 | plugin owner | 默认运行不暴露 prompt 原文 | 报告可分享 |
| US-9 | plugin owner | settings 关 errors.jsonl 写入 | 极端环境（只读 fs / 隐私）opt-out |

### Acceptance Criteria

| ID | Story | 准入 |
|---|---|---|
| AC-1.1 | US-1 | 报告含 hook 名 + 失败次数 + 最近一次 stderr 摘要 |
| AC-1.2 | US-1 | 同时合并 jsonl `hook_success.exitCode≠0` 与 errors.jsonl 数据源 |
| AC-2.1 | US-2 | 用 v2.1.126+ `attributionSkill` 切片；缺失 fallback `<command-name>` XML |
| AC-3.1 | US-3 | 按 `subagent_type`（research/design/implement/...）聚合次数 + 占比 |
| AC-4.1 | US-4 | 扫 `specs/*/.curdx-state.json.phase`，输出每 phase 卡住数 |
| AC-5.1 | US-5 | 输出 P50/P95/P99 三档；样本数 < 5 时标注"样本不足" |
| AC-6.1 | US-6 | 顶部诊断段含 `unknown_type_count` 与 `parentUuid_broken_ratio` |
| AC-7.1 | US-7 | 4 hook 任一抛错时 `errors.jsonl` 新增 1 行，含 ts/level/hook/event/msg |
| AC-8.1 | US-8 | 默认输出不含 prompt 全文、不含文件全路径、不含 file-history-snapshot 内容 |
| AC-8.2 | US-8 | `--include-prompts` 开关后 prompt 内容才出现 |
| AC-9.1 | US-9 | `settings.json.errorLogEnabled=false` 时 hook 出错不写 errors.jsonl |

## Functional Requirements

| ID | 描述 | 满足 US | 验收 |
|---|---|---|---|
| FR-1 | `analyze` CLI 子命令注册到 `src/index.ts` citty 路由 | US-1..6 | `npx @curdx/flow analyze --help` 列出 |
| FR-2 | 流式解析 `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`（`node:readline`） | US-1..6 | 100MB 文件不 OOM |
| FR-3 | 增量 offset 状态文件 `~/.claude/curdx-flow/observability-state.json`，记 `{path: byteOffset}` | US-1..6 | 第二次跑只读 tail |
| FR-4 | `(uuid, requestId)` 双键去重处理 resume session | US-6 | 同 uuid 不重复计数 |
| FR-5 | declarative schema map（JSON 配置 type→action） | US-6 | 加 type 不改代码；位置 design 决 |
| FR-6 | 未识别 type 静默跳过 + 计入 `unknown_type_count` | US-6 | 不抛错 |
| FR-7 | 7 类报告全量 MVP：hook失败 / command频次 / subagent热度 / spec漏斗 / duration分位 / unknown_type / parentUuid断链 | US-1..6 | markdown 含全部 7 段 |
| FR-8 | errors.jsonl 5 必填字段 schema：`ts/level/hook/event/msg`，可选 `session_id/cwd/spec/path/stack` | US-7 | jq 校验通过 |
| FR-9 | `errorLogEnabled` settings 开关，默认 `true` | US-9 | false 时跳过写入 |
| FR-10 | hook 错误埋点接入 `src/hooks/_shared/run-hook.ts` 中央 catch | US-7 | 4 hook 任一异常都写 |
| FR-11 | 同步 `appendFileSync` 写 errors.jsonl，单行 < 4KB | US-7 | 多 hook 并发不串行损坏 |
| FR-12 | errors.jsonl 写失败必须静默捕获 | US-7 | 二次崩溃不冒泡到 hook |
| FR-13 | redact-by-default：prompt 全文不输出、路径仅 basename + project hash、file-history-snapshot 完全不读 | US-8 | 默认报告 grep 不到原文 |
| FR-14 | `--include-prompts` opt-in flag 解锁 prompt 内容 | US-8 | flag 启用后才出现 |
| FR-15 | `--out <file>` 写文件；缺省 stdout | US-1..6 | pipe 友好 |
| FR-16 | `--since <7d\|30d\|YYYY-MM-DD>`，默认 30d | US-1..6 | 时间窗过滤生效 |
| FR-17 | `--limit N`，默认 10 | US-1..3 | Top-N 截断 |
| FR-18 | `--project <name>` 过滤项目 | US-1..6 | 默认行为 design 决（cwd 或必传） |
| FR-19 | `--json` 跳过 markdown 直输 JSON | US-1..6 | 可被脚本消费 |
| FR-20 | corrupt jsonl 行单行跳过、计 `parse_error_count`，整体不挂 | US-6 | 半行残文件可解析 |

## Non-Functional Requirements

| ID | 维度 | 指标 | 目标 |
|---|---|---|---|
| NFR-1 | 解析性能 | p95 端到端耗时 | ≤ 3s（增量；首次全量可放宽至 30s） |
| NFR-2 | hook 写日志延迟 | `appendFileSync` 单次 | < 5ms（quick-mode-guard 10s timeout 下不阻塞） |
| NFR-3 | bundle 体积 | dist 增量 | < 20KB（当前 64KB → ≤ 84KB） |
| NFR-4 | 依赖洁度 | 新增 npm dep | 0 |
| NFR-5 | 跨平台兼容 | 实证范围 | macOS/Linux 必跑；Windows 仅声明、README 标注未实证 |
| NFR-6 | Claude Code 版本 | 兼容基线 | v2.1.119+；`attributionPlugin/Skill` 缺失时 fallback `<command-name>` XML（v2.1.126 前） |
| NFR-7 | schema 漂移容错 | 未识别 type | 不抛错，计入 `unknown_type_count` 并写入报告 |
| NFR-8 | errors.jsonl 单行原子性 | 单行字节数 | < 4KB（POSIX `PIPE_BUF` 保证多 hook 并发 append 原子） |
| NFR-9 | errors.jsonl 写失败容错 | 错误传播 | 静默 swallow，不冒泡到 hook 主流程 |
| NFR-10 | 测试覆盖 | parser/filter/report 三层纯函数 + fixture jsonl + snapshot | 单测覆盖率 ≥ 80% |
| NFR-11 | 隐私 | 默认输出 | grep 不到 prompt 原文、文件全路径、文件全文 |

## Glossary

- **transcript**：`~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl` 一行一事件的 Claude Code 会话记录。
- **hook_success**：transcript 内 `attachment.type=hook_success` 事件，含 `hookName/hookEvent/stdout/stderr/exitCode/durationMs/toolUseID`。
- **attribution**：v2.1.126+ assistant 事件的 `attributionPlugin` / `attributionSkill` 字段，按 plugin / skill 切片。
- **增量 offset**：按 file path 存 byte offset，二次解析跳过已读字节。
- **declarative schema map**：JSON 配置 type→action，改 JSON 不改代码（仿 claude-mem `transcript-watch.json`）。
- **redact-by-default**：默认不输出 prompt 全文 / 文件全路径 / file-history-snapshot 内容。
- **errors.jsonl**：`~/.claude/curdx-flow/errors.jsonl`，curdx-flow 自身 hook 错误埋点。
- **observability-state.json**：`~/.claude/curdx-flow/observability-state.json`，存 jsonl 文件 byte offset。

## Out of Scope

- Web dashboard / 实时流处理。
- Token 成本 / 账单分析（让给 [ccusage](https://github.com/ryoppippi/ccusage)，避免重复造轮子）。
- 上报通道 / 跨用户对比 / 云端聚合。
- Windows 平台**实测**（声明支持但用户自验，README 标注未实证）。
- file-history-snapshot 的文件内容（隐私）。
- 修改 / 扩展 Claude Code 自身 hook spec。
- 其他 plugin 的 observability（仅限 curdx-flow）。
- errors.jsonl 自动轮转（KISS：日均 << 100 行 / 年 < 10MB；用户手动 rm）。

## Dependencies

- Claude Code v2.1.119+（事件类型稳定基线；attribution 字段需 v2.1.126+）。
- Node 20+（`fs.readdir({recursive:true})`；`package.json:11` 已要求）。
- 现有 `src/index.ts` citty 路由（4 处微改：1 import + 1 `defineCommand` + 1 `subCommands` + 1 `SUBCOMMANDS.add()`）。
- 现有 `src/hooks/_shared/run-hook.ts` 中央 catch（FR-10 接入点）。
- 4 个 hook 入口：`src/hooks/load-spec-context.ts` / `quick-mode-guard.ts` / `stop-watcher.ts` / `update-spec-index.ts`。

## Risks & Open Questions

留待 design 阶段处理（不 block requirements 验收）：

| # | 议题 |
|---|---|
| OQ-1 | schema map JSON 位置：`plugins/curdx-flow/schemas/transcript-events.json` vs `src/analyze/schemas/`。 |
| OQ-2 | `--project` 默认行为：cwd 推断 vs 必传。 |
| OQ-3 | errors.jsonl 写入并发原子性在 Windows NTFS 的降级策略（NFR-5 仅声明）。 |
| OQ-4 | bundle 增量是否触发 lazy-load 改造（先实测 dist 增量，超 20KB 再判）。 |

## Acceptance Tests Outline

| ID | 场景 | 期望 |
|---|---|---|
| AT-1 | fixture jsonl 含 `hook_success.exitCode=1` | Top-N 报告出现该 hook |
| AT-2 | 同 jsonl 跑 2 次 | 第 2 次解析时间 ≤ 第 1 次的 1/5（增量 offset 生效） |
| AT-3 | fixture 注入未知 type | 不抛错；报告 `unknown_type_count ≥ 1` |
| AT-4 | 默认运行 | grep 不到原 prompt 字符串；prompt 长度字段存在 |
| AT-5 | `--include-prompts` 运行 | grep 能命中 prompt 字符串 |
| AT-6a | hook 故意抛错 | errors.jsonl 新增 1 行含 5 必填字段 |
| AT-6b | `errorLogEnabled=false` + hook 抛错 | errors.jsonl 不增行 |
| AT-7 | fixture jsonl 含半行截断 | 跳过该行；`parse_error_count ≥ 1`；其他行正常解析 |
| AT-8 | resume session（同 uuid 出现 2 次） | 报告内该事件计数仅 1 |
| AT-9 | bundle 体积 | `npm run build` 后 dist 增量 < 20KB |
| AT-10 | macOS + Linux CI | 全部 AT 通过；Windows 跳过实测仅冒烟 |

## Next Steps

1. user review requirements.md → 通过则跑 `/curdx-flow:design`。
2. design.md 收敛 OQ-1..4：schema map 路径 / `--project` 默认 / 模块拆分（parser / filter / report / error-logger）/ 数据流图。
3. tasks.md POC 优先：先跑通"读 1 个 jsonl → 输出 1 段 markdown"，再叠 7 报告 / 增量 offset / errors.jsonl / redact / flags。
4. `/curdx-flow:implement` 启动闭环。
