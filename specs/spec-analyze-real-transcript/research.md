---
spec: spec-analyze-real-transcript
epic: observability-v2
phase: research
created: 2026-05-07
researchers: [E1 fixture-sites, R1 multi-session]
---

# Research: spec-analyze-real-transcript

## Executive Summary

4 个 `fixturePath` 引用 site 全部行号确认（L23 const / L112 resolve / L116 stat+state / L150 parseTranscript / L203 state persist）—— 是 5 处实际改动而非 4 处，**E1 audit 修正一处**。Real filesystem 验证：本机 `~/.claude/projects/` 有 **15 个 project dir**，**当前 project 66 个 .jsonl**（全 UUID v4，最大 2.5MB）—— 多 session 是常态不是边角。Path 编码 = `/` → `-` 带 leading `-`（无 hash、点不转义、原有 hyphen 不再转义）。**ccusage 是黄金参考实现**：glob `**/*.jsonl` + 复合 dedup `${messageId}:${requestId}` + 后置 `filterByDateRange`。我们采用 **Option A**：单层 `<encoded-cwd>/*.jsonl`（**不递归**避免 UUID artifact 子目录污染）+ 复用 filter.ts 已有 `uuid|requestId` 复合 dedup（比 ccusage 严格）。**最大实施风险**：state file (`~/.claude/curdx-flow/observability-state.json`) 现按 path key，多 session 必然累积 orphan entries —— 需加 cleanup（按 mtime 30 天 GC 或仅保留当前 project key）。**9 个 edge case** 已标识；**`--since` 必须 row-level filter on `ev.ts`**（不是 file mtime —— dormant session 可有 in-window 事件）。Friendly error: 2-line 警告 + exit **0**（empty report 是合法输出，不是 failure，参考 ccusage UX）。

## External Research (R1)

### ccusage（黄金参考）

> https://github.com/ryoppippi/ccusage （**注意：epic research 写错为 cccost，实际是 ryoppippi/ccusage**）

核心模式：
- **2-path glob**：`~/.config/claude/projects/` + `~/.claude/projects/` 并行扫
- 流式 per-line parse
- **Dedup key**：`${messageId}:${requestId}`（缺一不丢条）
- 聚合 → `filterByDateRange` 后置过滤

### 9 Edge Cases 标识

| # | Case | 处理 |
|---|---|---|
| E1 | 多 session 同 dir | 默认聚合（66 文件实测） |
| E2 | mid-session `cd` | JSONL 每事件带 `cwd` 字段 — 不影响 |
| E3 | 跨机器 | `~/.claude/projects/` 是 per-machine namespace — 自动隔离 |
| E4 | symlink 路径 | 用 `realpath` 解析 |
| E5 | compaction 拆 session 文件 | 多个 .jsonl 自然处理 |
| E6 | 空 .jsonl | 跳过 |
| E7 | corrupt line | per-line 跳过 (parser.ts 已支持) |
| E8 | 未知 rotation 后缀（如 `.jsonl.1`） | glob `*.jsonl` 不匹配 — 安全 |
| E9 | UUID artifact 子目录（subagents 子目录） | **glob 1-level 不 `**`** — 跳过 |

### `--since` filter 决策

**row-level on `ev.ts`**（filter.ts:48-51 已是这逻辑）。**绝不**预过滤 file mtime — dormant session 可能有 in-window 事件。

### Friendly error 模板

```
warning: no transcripts found at /Users/x/.claude/projects/-Users-x-foo-bar/
hint: did you run `claude` here? (or pass --project)
```

**exit code 0**（empty report 是合法输出，不是 failure 状态）—— 与 epic AC3 "exit ≠ 0" **冲突**，需 design 阶段定夺。R1 推荐 ccusage UX（exit 0 + warning），epic AC3 推 ≠ 0。**保留为 design 阶段开放问题。**

### Aggregation 策略

**Option A（推荐）**：单层 `<encoded-cwd>/*.jsonl`，glob 不递归。
- ✅ 跳过 UUID artifact subdirs
- ✅ 简单、可预测
- ✅ ccusage 实测有效

复用 filter.ts 已有 `uuid|requestId` 复合 dedup（比 ccusage `messageId:requestId` 严格）—— 重复事件天然合并。

## Codebase Analysis (E1)

### 5 fixturePath 引用 site（修正 epic 写的 4 个）

| Line | 上下文 | 改动方式 |
|---|---|---|
| **L23** | `POC_FIXTURE_REL` const 声明 | 删除 const |
| **L112** | `path.resolve(process.cwd(), POC_FIXTURE_REL)` | 替换为 `resolveTranscriptSource()` |
| **L116** | `statSync(fixturePath)` 旋转检测 | 改用解析后路径数组（多文件分别 stat） |
| **L150** | `parseTranscript(fixturePath, …)` | 多文件循环 parse |
| **L203** | `state.files[fixturePath]` state-file key | **现按 path key — 多 session 累积 orphan，需 GC** |

> ⚠️ Epic 写 4 处，**实际 5 处**（L112 是单独的 resolve 调用）。OB-1 plan.md 需更正。

### 真 filesystem 验证

```
$ ls ~/.claude/projects/ | wc -l
15

$ ls ~/.claude/projects/ | head
-Users-wdx-opc-curdx-flow/
-Users-wdx-opc-foo/
-Users-wdx-Documents-bar/
... (15 总)

$ ls ~/.claude/projects/-Users-wdx-opc-curdx-flow/*.jsonl | wc -l
66

$ ls -lh ~/.claude/projects/-Users-wdx-opc-curdx-flow/*.jsonl | sort -k5 -h | tail -3
-rw-r--r-- 1 wdx staff 2.5M 2026-05-07 abc123-...jsonl
```

**实测确认**：path 编码 = abs path 把 `/` 换 `-`；UUID v4 文件名；多 session 是常态（66 个）。

### Integration test coupling — TIGHT

`tests/analyze/integration.test.ts`：
- homedir mocking 在 — state 是隔离的 ✅
- **Fixture path const 硬编码** — 改 default 时必须传 fixture override env var
- Snapshot 绑事件计数 — 改 fixture 内容需更新 snapshot

**应对**：OB-1 实施时保留 `CURDX_TRANSCRIPT_FIXTURE` env var 路径，integration test 用此 env var 跑 fixture，单元测试覆盖 real-path resolver。

### 最大实施风险：state file orphan

`~/.claude/curdx-flow/observability-state.json` 当前 schema：
```json
{
  "version": 1,
  "files": {
    "/abs/path/to/transcript.jsonl": { "byteOffset", "lastModifiedMs", "sizeBytes" }
  }
}
```

多 session 后这 `files` map 会累积**所有曾经读过的 .jsonl 路径**，即便文件已删。**OB-1 必须加 cleanup**：按 mtime > 30 天 GC，或只保留当前 project 的 keys。

## Quality Commands

继承现有：

| 命令 | 用途 |
|---|---|
| `npm run typecheck` | TS strict |
| `npm run test:hooks` | 不影响（hook 不动） |
| `npm run test:analyze` | 直接受影响 — integration + unit 必须 pass |
| `npm run verify` | 全 chain |

## Related Specs

| Spec | Relevance | Relationship |
|---|---|---|
| plugin-observability (✅) | **HIGH foundation** | 在它上面盖 |
| spec-decision-event-logging (OB-2) | HIGH downstream | OB-1 解锁 OB-2 integration test |
| spec-cost-time-token-analytics (OB-3) | MEDIUM downstream | 强依赖 OB-1 + OB-2 |

## Feasibility Assessment

| 维度 | 评估 | 备注 |
|---|---|---|
| **5 site 替换** | HIGH | 行号已知，机械替换 |
| **path-encoded resolver** | HIGH | 简单字符串替换 + realpath；无外部依赖 |
| **Multi-session glob** | HIGH | 1-level glob `*.jsonl`；ccusage 验证 |
| **State file GC** | MEDIUM | 加 cleanup 是新逻辑；30 天 mtime 阈值需测 |
| **Integration test 兼容** | MEDIUM | env var 路径走通即可，但 snapshot 可能需小幅调整 |
| **跨平台** | LOW risk | 4-leg CI matrix 已就绪；R1 文档了 Windows path encoding |

## Recommendations for Requirements Phase

1. **5 site 替换全列**（不是 epic 写的 4 site）
2. **State file orphan cleanup** 必须包含（mtime > 30 天 GC）
3. **`--session <uuid>` flag** epic AC2 已定，requirements 列具体行为
4. **Multi-session 默认聚合 vs latest**：epic 已定 ALL（AC2），requirements 不重决
5. **Friendly error UX** — exit 0 vs exit ≠ 0：**design 阶段开放问题**（epic AC3 vs ccusage UX 冲突）
6. **CURDX_TRANSCRIPT_FIXTURE env var** 测试边界：什么时候必须用？覆盖现有 integration test

## Open Questions for Design Phase

1. **Exit code on no-transcript-dir**：epic AC3 ≠ 0 vs ccusage 0 — 哪个对？
   - 推荐：保留 ≠ 0（CI green 状态需要明确"有数据"vs"无数据"，ccusage 是 user CLI，curdx-flow analyze 是 dev tool 用于决策）
2. **State file cleanup 阈值**：30 天 mtime vs N 个 session 上限 — 哪个？
3. **`realpath` 解析时机**：cwd 时还是 path resolve 时？
4. **UUID artifact 子目录处理**：1-level glob 跳过 vs 显式 blacklist？

## Sources

### Web (R1)
- ccusage https://github.com/ryoppippi/ccusage
- Anthropic .claude dir docs https://code.claude.com/docs/en/claude-directory
- claude-code-log (daaain), simonw/claude-code-transcripts

### Local
- `/Users/wdx/opc/curdx-flow/src/analyze/index.ts` (212 LOC, 5 fixturePath sites)
- `/Users/wdx/opc/curdx-flow/tests/analyze/integration.test.ts` (TIGHT coupling)
- 实地验证 `~/.claude/projects/` (15 dirs, 66 .jsonl in current project)

### Partial files (will be deleted post-merge)
- `.research-fixture-sites.md` (E1)
- `.research-multi-session.md` (R1)
