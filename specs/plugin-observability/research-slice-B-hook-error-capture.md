# Slice B — Hook Error Capture 现状 + 埋点设计

## 现有错误处理盘点（4 hook 逐个）

中央兜底位于 `src/hooks/_shared/run-hook.ts:60-80`：所有 handler throw 都被 catch，写 `[hook] ${msg}\n` 到 stderr，**永远 exit 0**（FR-8）。stdin 解析失败兜底位于 `src/hooks/_shared/stdin.ts:23-27`：写 `[hook] invalid stdin JSON: ${msg}\n` 到 stderr 后 exit 0。

| Hook | 错误路径行为（吞 / log / exit 码） | 关键 file:line |
|------|--------------------------------|----------------|
| load-spec-context | settings/state/progress 读失败全部静默 catch 返回 null（`load-spec-context.ts:43-44, 67-68, 136-138`）；spec 目录不存在 catch 返回 INACTIVE（`:115-117`）；未捕获 throw 经 runHook → stderr + exit 0 | 23 (runHook), 43, 67, 110-117, 136 |
| quick-mode-guard | 无 cwd / 无 spec / 无 state file / state 解析失败一律静默 return（隐式 allow）；JSON.parse catch 不写日志（`quick-mode-guard.ts:52-56`）；超 10s timeout → Claude Code SIGKILL，**hook 进程内无法记录** | 21 (runHook), 36-56 |
| stop-watcher | 12 处 `try { ... } catch { /* swallow */ }`：epic 状态写入 `:257-259`、update-spec-index spawn `:287-289`、stale 文件 `unlink` `:319-321`、各处 readFileSync 静默退化空字符串；corrupt state 不吞，emit `BlockDecision`（`:419-431, :592`）作恢复提示 | 64 (runHook), 178-180, 235-238, 257-259, 286-288, 311-322 |
| update-spec-index | 所有 fs 读静默 catch 返回 0/空（`update-spec-index.ts:84-86, 95-97, 142-145, 219-222`）；--dry-run 走独立分支；未捕获 throw 经 runHook → stderr + exit 0 | 38 (runHook), 81-87, 92-103, 138-147 |

共同短板：**没有任何 hook 写持久化错误日志**；stderr 在 Claude Code 子进程中通常不回流到用户视野，错误对外不可见。

## 可埋点位置（按 hook 列出 file:line）

下表为最小集（仅"会丢信息"或"会留下用户疑惑"的点），不是全量 catch。

| Hook | file:line | 触发场景 | 字段建议 |
|------|-----------|---------|---------|
| `_shared/run-hook.ts:74-78` | uncaught throw（4 个 hook 共享） | 全部 hook | `level=error`, `hook=<name>` |
| `_shared/stdin.ts:23-26` | stdin JSON 损坏 | 4 个 hook 共享 | `level=error`, `phase=stdin-parse` |
| `load-spec-context.ts:136-138` | state 文件 JSON 损坏 | SessionStart | `level=warn`, `path=<stateFile>` |
| `quick-mode-guard.ts:52-56` | state 文件 JSON 损坏（吞掉 → 用户以为 quick mode 关了） | PreToolUse | `level=warn`, `path=<stateFile>` |
| `stop-watcher.ts:235-238` | epic state 损坏 | Stop | `level=warn` |
| `stop-watcher.ts:257-259` | atomic write epic state 失败 | Stop | `level=error` |
| `stop-watcher.ts:286-288` | update-spec-index spawn 失败 | Stop | `level=warn` |
| `stop-watcher.ts:589-592` | corrupt state 触发 BlockDecision（用户已收到提示，但值得记录频率） | Stop | `level=info`, `event=corrupt-state-block` |
| `update-spec-index.ts:142-145` | spec state 文件损坏 | 所有触发点 | `level=warn` |
| `update-spec-index.ts:469-471` | atomic write index 失败（runHook 兜底） | slash command | `level=error` |

## Hook envelope 元数据可用项

来自 `src/hooks/_shared/types.ts:46-50`，envelope 当前**只声明 3 字段**：`cwd?`, `transcript_path?`, `stop_hook_active?`。Anthropic 实际还会传 `session_id`、`hook_event_name`、`tool_name`、`tool_use_id`（per Claude Code hook spec），但 curdx-flow 当前没解析它们——意味着要记到 errors.jsonl，需先扩 `HookStdin`。

| 字段 | 来源 | 是否值得记 | 备注 |
|------|------|-----------|------|
| `hook_event_name` | envelope（未声明） | **必填** | 区分 SessionStart/PreToolUse/Stop |
| `session_id` | envelope（未声明） | **必填** | 串联同一会话内多次错误 |
| `cwd` | `HookStdin.cwd` `types.ts:47` | 必填 | 定位 repo |
| `transcript_path` | `HookStdin.transcript_path` `:48` | Stop 才有，可选 | 调试用 |
| `tool_name` / `tool_use_id` | envelope（未声明） | PreToolUse 可选 | quick-mode-guard 调试 |
| 派生：`specName`, `phase`, `taskIndex` | 从 state 文件读 | 可选 | 仅当 state 已读出时 |

**建议**：扩 `HookStdin` 增加 `session_id?`, `hook_event_name?`, `tool_name?`, `tool_use_id?`；errors.jsonl 至少记前两项 + `cwd`。

## 约束（timeout / async / cold start）

- **quick-mode-guard 10s timeout** (`hooks.json:13`)：错误埋点必须**同步 `appendFileSync` < 5ms**，禁止 spawn 子进程或异步 fsync。Node 的 `fs.appendFileSync` 单行写默认带 flush，足够。
- **load-spec-context async:true** (`hooks.json:38`)：Claude Code 不等其完成，进程被 SIGKILL 时 in-flight 写丢失。对策：错误一发生即 `appendFileSync`（同步落盘），不要等到 handler 末尾批量 flush。
- **Cold start, 进程独立**：每次 hook 都是新 Node 进程，无法共享 logger 实例 / buffer / sequence number。每次写都要：(1) `mkdirSync(dir, {recursive:true})` (2) `appendFileSync(path, line+"\n")`。Node ESM 启动 ~30-60ms，appendFileSync 本身 sub-ms。
- **并发**：Stop hook 与 update-spec-index 可能同 cwd 同时写；`appendFileSync` 在 POSIX 下 O_APPEND 原子（< PIPE_BUF=4096B 单 write 不交错）。**约束 errors.jsonl 单行 < 4KB**。Windows NTFS 的 append 原子性较弱，但 curdx-flow 主流用户 macOS/Linux，可接受降级。

## errors.jsonl schema 建议

存放路径：`~/.claude/curdx-flow/errors.jsonl`（与用户记忆"npm 包直拷文件到 ~/.claude 是合法分发"对齐）。

**必填字段**（5 个，颗粒度足够 grep + jq）：
```jsonc
{
  "ts": "2026-05-05T16:20:00.000Z",   // ISO8601, new Date().toISOString()
  "level": "error",                    // error | warn | info
  "hook": "stop-watcher",              // 来自代码常量, 不依赖 envelope
  "event": "epic-state-write-failed",  // 短 slug, 见下方约定
  "msg": "ENOSPC: no space left"       // err.message, 截断到 500 char
}
```

**可选字段**（按需添加，不全填）：
```jsonc
{
  "session_id": "abc123",     // 来自扩展后的 envelope
  "cwd": "/Users/wdx/...",    // 仅 error 级别填，warn 可省
  "spec": "plugin-observability", // 已解析出 spec 时
  "path": "/path/to/file",    // 涉及 fs 的错误
  "stack": "Error: ...\n  at" // 仅 level=error 且非预期 throw 时
}
```

**event slug 约定**（避免自由文本）：`stdin-parse-failed`, `state-parse-failed`, `epic-state-write-failed`, `index-write-failed`, `spawn-failed`, `corrupt-state-block`, `uncaught`。

**不要记**的字段：transcript_path（隐私，且很长）；envelope 全文（重复 + 体积）；时间戳的纳秒精度（无意义）。

## 轮转策略

建议 **按行数硬上限 + 启动时单次截断**，最简单：

- 每次 append 之前 `statSync` 看 size，超过 **2 MB**（≈ 5000 行 400B）就 `truncate to 0`（保留文件 inode，避免 stale handle）后再 append。
- 不按天切：grep/jq 跨天更省事；用户也几乎不会回看 30 天前的 hook 错误。
- 不做压缩 / 归档：cold-start 进程没那个预算，ENOSPC 用户自己 rm 即可。
- 替代方案：**完全不轮转**，让 grep 处理。考虑到 4 个 hook 在正常 session 中触发频率低（quick-mode-guard 仅 PreToolUse:AskUserQuestion 触发，Stop 每次轮次 1 次），日均错误行 << 100，文件年增长 < 10 MB——**轮转可以延后到 v2，先不做**。

推荐选 **不轮转 + 文档明示用户可手动 rm**，KISS。

## Risks

1. **扩 HookStdin 是 breaking-ish**：types.ts 当前只声明 3 字段，加了 `session_id` 等就要审 4 个 hook 全部消费点，确认无 `Object.keys` 遍历依赖（实测无）。低风险但要验证。
2. **errors.jsonl 路径硬编码 `~/.claude/`**：Windows 用户的 `~` 解析依赖 `os.homedir()`，跨平台 OK，但 sandboxed/CI 环境（无 home）会写失败——必须把"写日志失败"本身**静默**，不能再 throw 进 runHook 死循环。
3. **PIPE_BUF 4KB 限制**：stack trace 容易超。建议 `stack` 字段截断到 2KB；msg 截到 500B。
4. **隐私**：cwd 含用户名路径。可加 settings 开关 `errorLogIncludeCwd: false` 默认 true（与现有 `enabled:` frontmatter 同位）。
5. **磁盘满**：append 失败必须 try/catch 静默——否则 hook 自己崩了反而触发 `runHook` 兜底再尝试写日志，二次崩溃。
6. **测试覆盖**：现有 hook 测试是否 mock 了 fs append？需新增 lib utility（如 `lib/error-logger.mjs`）以便单测注入 fake fs。
