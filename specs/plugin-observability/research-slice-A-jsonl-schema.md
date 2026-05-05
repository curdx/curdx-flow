---
spec: plugin-observability
phase: research
slice: A — Claude Code Session JSONL Schema
created: 2026-05-05
sample_size: 5 spotlit + 61 全量扫描（同一项目 `~/.claude/projects/-Users-wdx-opc-curdx-flow/`）
cc_versions_observed: 2.1.119, 2.1.121, 2.1.122, 2.1.123, 2.1.126
---

# Slice A — Claude Code Session JSONL Schema

## 文件位置 & 跨平台路径

| 平台 | 路径 | 证据 |
|---|---|---|
| macOS | `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl` | 实测，本机 `/Users/wdx/.claude/projects/-Users-wdx-opc-curdx-flow/` 存 61 个 jsonl |
| Linux | 同 macOS | claude-code-log 文档同样路径 |
| Windows | `%USERPROFILE%\.claude\projects\<encoded-cwd>\<sessionId>.jsonl` | code.claude.com/docs/en/claude-directory |

**cwd 编码规则**（实测）：每个 `/` → `-`，前导 `-` 保留。`/Users/wdx/opc/curdx-flow` → `-Users-wdx-opc-curdx-flow`。Windows 的 `C:\foo\bar` 推断为 `C--foo-bar`，但需在 Windows 上实测确认（**ASSUMPTION，未在本机验证**）。

文件名 = sessionId（UUID v4）。无后缀 `.jsonl` 的同名目录 `<sessionId>/` 同时存在，存放 todos 等元数据。

## 事件类型清单

61 文件全量扫描 + 5 文件细查后，发现 **11 种顶层 `type`** + **6 种 `system.subtype`** + **9 种 `attachment.type`**。

| type | subtype/attachment.type | 用途 | 最小样例 |
|---|---|---|---|
| `user` | — | 用户输入 / tool_result（按 `toolUseResult` 字段区分） | `{"type":"user","message":{"role":"user","content":"<command-name>/clear</command-name>..."}}` |
| `assistant` | — | 模型输出（text/thinking/tool_use 三种 content） | `{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash",...}],"usage":{...}}}` |
| `attachment` | `hook_success` | **hook 触发完整记录**（核心！） | 见下节 |
| `attachment` | `hook_system_message` | hook 输出超大时的截断提示 | `{"type":"hook_system_message","content":"<persisted-output>Output too large..."}` |
| `attachment` | `hook_additional_context` | SessionStart hook 注入的上下文 | `{"type":"hook_additional_context","hookName":"SessionStart","content":"..."}` |
| `attachment` | `skill_listing` | 当前可用 skills 列表 | `{"type":"skill_listing","skillCount":73,"isInitial":true}` |
| `attachment` | `deferred_tools_delta` | 延迟加载工具增删 | `{"addedNames":"['AskUserQuestion',...]"}` |
| `attachment` | `mcp_instructions_delta` | MCP server 指令变更 | `{"addedNames":"['context7']"}` |
| `attachment` | `auto_mode` | auto/plan/edit mode 提醒 | `{"reminderType":"full"}` |
| `attachment` | `task_reminder` | TodoWrite 状态提醒 | `{"itemCount":0}` |
| `system` | `stop_hook_summary` | Stop hook 汇总（hookCount, hookInfos[]） | 见下节 |
| `system` | `turn_duration` | turn 耗时 + 消息数 | `{"durationMs":49406,"messageCount":27}` |
| `system` | `away_summary` | 长时间空闲后的总结 | — |
| `system` | `local_command` | `<local-command-stdout>` 块 | `{"content":"<local-command-stdout></local-command-stdout>"}` |
| `system` | `scheduled_task_fire` | 计划任务触发 | — |
| `last-prompt` | — | 当前 leaf prompt 指针 | `{"leafUuid":"...","sessionId":"..."}` |
| `permission-mode` | — | 权限 mode 切换 | `{"permissionMode":"default"}` |
| `file-history-snapshot` | — | 文件快照（`snapshot` 是 path→content map） | `{"messageId":"...","isSnapshotUpdate":false}` |
| `ai-title` | — | AI 生成的 session 标题（v2.1.121+） | `{"aiTitle":"..."}` |
| `agent-name` | — | session agent 名（**v2.1.119 only，已弃用**） | — |
| `custom-title` | — | 用户自定义标题（**v2.1.119 only**） | — |
| `queue-operation` | — | queued prompt 入/出队（v2.1.126+） | `{"operation":"enqueue","content":"..."}` |
| `pr-link` | — | PR 链接（v2.1.126+） | `{"prNumber":...,"prUrl":"..."}` |

## 关键事件字段详解

### 1. Hook 触发 — `attachment.type=hook_success`（最重要）

每个 hook 触发产出一行 `attachment` 记录。**这是 observability 的核心数据源**。

```json
{
  "type": "attachment",
  "attachment": {
    "type": "hook_success",
    "hookName": "SessionStart:clear",
    "toolUseID": "dfdff1bb-f81e-4676-a7a1-c64bd68d8f8f",
    "hookEvent": "SessionStart",
    "stdout": "{\"continue\":true,\"suppressOutput\":true}\n",
    "stderr": "",
    "exitCode": 0,
    "command": "...实际 shell 命令...",
    "durationMs": 97,
    "content": ""
  },
  "uuid": "...", "timestamp": "...", "sessionId": "...", "cwd": "...", "version": "2.1.126"
}
```
（实证：c6d64f5f...jsonl L2，[v2.1.126]）

字段一应俱全：`hookName`（plugin:event:matcher）、`hookEvent`（PreToolUse/PostToolUse/UserPromptSubmit/Stop/SessionStart/...）、`exitCode`、`durationMs`、`stdout`、`stderr`、`command`、`toolUseID`（链回主 transcript 的 tool 调用）。

补充：`system.subtype=stop_hook_summary` 给出 Stop hook 总数 + 每条 command + durationMs，但**没有 stdout/stderr 字段**（hookInfos 仅含 `command`+`durationMs`）。注入到下一轮的 hook 输出会作为字符串塞进 `hookErrors[]`（**误名——既包含错误也包含正常注入文本**，实测见 082f5345...jsonl L41）。

### 2. Tool call — `assistant.message.content[].type=tool_use` + `user.toolUseResult`

- 调用方：`assistant` 事件 → `message.content[]` 数组里 `{type:"tool_use", id, name, input}`，`message.usage` 含完整 token + cache breakdown。
- 返回方：下一条 `user` 事件 → 顶层 `toolUseResult` 字段（结构化 stdout/stderr/interrupted/isImage）+ `message.content[]` 里有 `{type:"tool_result", tool_use_id, content, is_error}`，`sourceToolAssistantUUID` 反指调用方。
- 时延：`assistant.timestamp` 与对应 `user.timestamp` 之差（实测 ~200ms 级）。

### 3. Subagent 调度 — `tool_use.name="Agent"`（**不是 Task**）

```json
{"type":"tool_use","name":"Agent","input":{
  "subagent_type":"Explore",
  "description":"Explore smart-ralph project deeply",
  "prompt":"..."
}}
```
（实证：070dfdeb...jsonl L16，[v2.1.119]）

返回结果在下一条 `user.toolUseResult`，结构同普通 tool。**关键观察**：在我扫描的 61 个文件里 `isSidechain:true` **0 次出现**——subagent 输出全部在主 transcript（同一文件）。Web 文档提及"sidechains 应跳过"基于早期版本，**当前 v2.1.x 不一定生成 sidechain**。这反而对 observability 是利好——单文件即可重构 subagent 调度树。

### 4. 用户 prompt（slash command 关联）

```json
{"type":"user","message":{"role":"user","content":
  "<command-name>/curdx-flow:implement</command-name>\n<command-message>...</command-message>\n<command-args>...</command-args>"
}}
```

slash command 通过 `<command-name>` XML 标签识别。**更精确的归属在 `assistant` 事件上**：v2.1.126+ 直接带 `attributionPlugin` + `attributionSkill` 字段。

实证（082f5345...jsonl）：
```
attributionPlugin: curdx-flow
attributionSkill: curdx-flow:implement
```

## Schema 稳定性评估

- **v2.1.119 → v2.1.126** 在 9 天内迭代过 5 次，且 schema 有可见演化：
  - Removed: `agent-name`, `custom-title` 顶层 type
  - Added: `ai-title`, `pr-link`, `queue-operation`, `attributionPlugin/Skill`, `assistant.error`, `system.retry*`, `last-prompt.leafUuid`, `assistant.message.context_management`
- 核心字段（`type`, `uuid`, `parentUuid`, `timestamp`, `sessionId`, `version`, `message.content[]`, `attachment.type`, `usage`）跨 5 个版本均稳定。
- 边缘字段（attribution、queue-operation、pr-link）只在新版出现。

**防御性处理建议**：
1. 必读字段断言：`type`, `uuid`, `timestamp`，缺则跳过整行（不报错）。
2. attribution 字段当作 optional：缺失时 fall back 到 `<command-name>` XML 解析。
3. 用 `version` 字段分层：< 2.1.121 走旧路径（`agent-name`/`custom-title`），>= 2.1.126 走新路径（`ai-title` + attribution）。
4. `attachment.type` 用白名单 + "未知 type 静默跳过"，给未来扩展留空间。
5. 使用 zod/io-ts 之类带 passthrough 的解析器，遇陌生字段不挂。

## 隐私边界

| 字段 | 含用户数据 | 处理建议 |
|---|---|---|
| `user.message.content` | prompt 全文（含粘贴的代码、密钥） | **必须 redact 选项**；默认仅取首 N 字符 |
| `user.toolUseResult.stdout/stderr` | 命令输出（可能含 token、env） | redact `*_KEY=`/`*_TOKEN=`/Bearer 模式 |
| `assistant.message.content[].text` | 模型回复（敏感复述） | 同 user.content |
| `assistant.message.content[].thinking` | 模型推理（含强 hallucination） | 默认不输出到报告 |
| `assistant.message.content[].input` | tool_use 入参（Bash 命令、文件路径） | 短命令保留全文，长命令截断；标记 cwd |
| `attachment.stdout/stderr` (hook_success) | **hook 输出，可能含 secrets**（如 install token） | redact 同上；默认只显示长度+exitCode |
| `attachment.command` | hook 命令（含 env var 名 + 路径） | 路径在共享报告时建议 home → `~` |
| `file-history-snapshot.snapshot` | **整个文件内容快照**，最敏感 | **默认完全不读取**；功能位置仅作为时间戳锚 |
| `system.hookErrors[]` | 注入到下一轮的 prompt 文本 | 同 user.content |

最小披露策略：MVP 默认只读 `assistant`+`user(toolUseResult)`+`attachment(hook_success)`+`system(stop_hook_summary,turn_duration)`；其他类型按需求逐步开放。

## 现成 OSS 参考

| 项目 | 用法 | 可借鉴点 | 不可借鉴 |
|---|---|---|---|
| `daaain/claude-code-log` (Python, 2k★) | jsonl → HTML | 字段分类（user/assistant/tool_use/thinking/system） + 可折叠详情 + summary 跨 session 关联 + 时间排序 | 只渲染、无 hook 维度聚合；无版本兼容；hook 处理仍在 TODO |
| `ryoppippi/ccusage` (TS) | token/cost 分析 | model 识别、cache_creation/cache_read 分桶、session 维度聚合 | 不读 hook/attachment；跨版本字段差异未文档化 |
| `withLinda/claude-JSONL-browser` | jsonl → markdown + 文件管理 | 多 session 浏览 UI 思路 | 不聚合 hook/plugin |

**共同空白**（plugin-observability 应填）：
- 没有按 `attributionPlugin` 维度聚合（**curdx-flow 独有视角**）
- 没人解析 `hook_success` 攻击面（exitCode 非 0、durationMs 长尾）
- 没人识别 subagent 调度树（Agent tool_use → 嵌套 tool_use）

## 对 plugin-observability 的建议

1. **数据模型**：定义 `Event` discriminated union（11 个 type），用 zod schema + passthrough，`version` 字段分流。
2. **核心维度**（按 plugin 主关心顺序）：
   a. Hook 性能（`attachment.hook_success.durationMs` p50/p95、exitCode 非 0 计数）
   b. Plugin 归属（`attributionPlugin/Skill` 聚合 → 哪个 slash command 触发了哪些 tool）
   c. Tool 用量（按 `name` 分类，token 成本来自 `assistant.usage`）
   d. Subagent 调用（Agent tool_use → 子 prompt 大小、返回耗时）
3. **采样策略**：MVP 一次扫一个 sessionId.jsonl；不做全局 follow（避免文件锁）。
4. **隐私 default**：默认全 redact 用户内容，只输出统计 + 长度；用户显式 `--include-content` 才打开。
5. **schema 防御**：所有读取过 `try/catch` + 行级跳过，未知 type 计入 `unknown_event_count` 而非报错。
6. **不依赖 sidechain**：v2.1.x 不生成 sidechain，按主 transcript + Agent tool_use 配对即可。
7. **跨版本最低基线**：声明支持 v2.1.119+，并在 README 列出每个特性需要的最低版本（attribution 字段需 v2.1.126+）。

## 一句话总结

JSONL schema 在 v2.1.119–2.1.126 之间核心稳定但边缘演化频繁；`attachment.type=hook_success` 提供 hookName/hookEvent/stdout/stderr/exitCode/durationMs/toolUseID 全套字段，配合 v2.1.126+ 的 `attributionPlugin/Skill`，足够实现 plugin 维度的 observability 报告。

## Sources

- [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks) — hook lifecycle events 定义
- [code.claude.com/docs/en/claude-directory](https://code.claude.com/docs/en/claude-directory) — `~/.claude` 跨平台路径
- [github.com/daaain/claude-code-log](https://github.com/daaain/claude-code-log) — JSONL → HTML 渲染
- [github.com/ryoppippi/ccusage](https://github.com/ryoppippi/ccusage) — JSONL → token/cost 分析
- [github.com/withLinda/claude-JSONL-browser](https://github.com/withLinda/claude-JSONL-browser) — JSONL 浏览器
- [gist FrancisBourre/claude-code-hooks-schemas](https://gist.github.com/FrancisBourre/50dca37124ecc43eaf08328cdcccdb34) — 社区 hook schema 整理
- 实证文件路径（本机）：
  - `/Users/wdx/.claude/projects/-Users-wdx-opc-curdx-flow/c6d64f5f-4ac7-45f5-bcf9-802e9b5992e1.jsonl`（v2.1.119, 124 lines）
  - `/Users/wdx/.claude/projects/-Users-wdx-opc-curdx-flow/070dfdeb-4187-40f3-9765-dc5f3ddfe45a.jsonl`（v2.1.119, Agent tool_use L16）
  - `/Users/wdx/.claude/projects/-Users-wdx-opc-curdx-flow/f105313c-b4f5-4a26-960e-da7046969235.jsonl`（v2.1.122, ai-title 出现）
  - `/Users/wdx/.claude/projects/-Users-wdx-opc-curdx-flow/63b1bddf-acec-4e25-832c-fe3634e6ca42.jsonl`（v2.1.126, full hook samples）
  - `/Users/wdx/.claude/projects/-Users-wdx-opc-curdx-flow/082f5345-52e0-447f-9b7a-d41e97e3727d.jsonl`（v2.1.126, attributionPlugin/Skill 实证）
  - `/Users/wdx/.claude/projects/-Users-wdx-opc-curdx-flow/16c8e15a-bd13-4137-bc62-9acbac1e3a5e.jsonl`（v2.1.126, queue-operation）
