---
spec: spec-decision-event-logging
epic: observability-v2
phase: research
created: 2026-05-07
researchers: [E1 hook-decision-points, R1 rotation-and-compat]
---

# Research: spec-decision-event-logging

## Executive Summary

**33 个 decision point** 已映射跨 4 hook（stop-watcher 14 / task-completed-verifier 9 / subagent-context-injector 8 / stop-failure-handler 3）—— stop-watcher 是大头。**10 final event kinds** 全部 needed（零 dead enum），覆盖 decision (block/pass/no-op) + metric (size/duration) + observability (API failure)。**correlationId 三段式 source 定**：session_id from `input.transcript_path` basename（fallback "unknown"）/ task_idx from `state.taskIndex` (default 0) / iter phase-aware（execution → taskIteration / 其他 → globalIteration，default 1）。**Rotation strategy**: pre-write statSync 双闸（size 10MB OR age 30d）→ `safeRename` to `events.<ts>-<pid>.jsonl` → prune oldest 保留 5 个；POSIX renameSync 原子、Windows EBUSY retry chain (50/200/500ms) + copyFileSync fallback for EXDEV。**Schema compat idiom**：producer 永不删字段、consumer parse 边界 `parsed.level ?? 'error'` + `coerceKind(parsed.event)` —— 老 errors.jsonl 行无缝 coerce 到 `{level:'error', event:'unknown'}`。**性能 budget**：sync appendFileSync <1ms 典型 / <50ms Windows AV worst-case，~30 call/spec 总 30-150ms，安全。关键优化：rotation 检查**不能每次都跑**，每 Nth call（建议 N=10）。

## External Research (R1)

### Rotation Strategy（自家代码 ~30 LOC）

**Pre-write check**（每 N 次调用一次，N=10）：
```typescript
function shouldRotate(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const stat = statSync(filePath);
  if (stat.size > 10 * 1024 * 1024) return true;  // 10MB
  if (Date.now() - stat.mtimeMs > 30 * 86400_000) return true;  // 30 days
  return false;
}
```

**Safe rename**（cross-platform）：
```typescript
function safeRename(from: string, to: string): void {
  try {
    renameSync(from, to);  // POSIX atomic same-FS
  } catch (err) {
    // Windows EBUSY/EPERM retry chain
    for (const delay of [50, 200, 500]) {
      sleep(delay);
      try { renameSync(from, to); return; } catch {}
    }
    // EXDEV / final fallback
    copyFileSync(from, to);
    unlinkSync(from);
  }
}
```

**Pruning**: 保留 5 个 rotated files，按 mtime 排序，drop oldest。

### Schema Compat Idiom

**Producer rule**: 永不删/重命名字段，只加 optional。

**Consumer rule**: parse 边界 default：
```typescript
const level = parsed.level ?? 'error';
const event = coerceKind(parsed.event);  // unknown → 'unknown'
```

老 errors.jsonl 行（缺 level/kind/payload/correlationId）→ 自动 coerce 到 `{level:'error', event:'unknown'}` —— 24 sources 一致（Confluent BACKWARD / Creek Service / Speakeasy）。

### Atomic Rename Edge Cases

| Platform | 状态 | Mitigation |
|---|---|---|
| POSIX same-FS | atomic ✅ | renameSync 直接 |
| Windows EBUSY/EPERM | 文件锁 | retry chain 50/200/500ms |
| EXDEV (cross-device) | 跨设备失败 | copyFileSync + unlinkSync |
| MSIX/OneDrive 异常 | claude-code 已报 | defense-in-depth EXDEV catch |

我们写入 `~/.claude/curdx-flow/`，理论永远 same-FS，但 defense-in-depth 必要。

### Performance（关键发现）

- sync `appendFileSync`：<1ms 典型、<5ms with rotation check、<50ms p99 (Windows AV)
- async 不带来好处（hook 是 one-shot 进程，写完就退）
- `~30 logHookEvent calls/spec` = 30-150ms cumulative ≤ 500ms safe budget
- **关键优化**：rotation 检查 throttle —— 每 Nth call 跑一次 statSync，不每次都跑

### correlationId 设计

3-segment string `<sid>:<task_idx>:<iter>`：
- 简单（不用 trace_id 32-hex）
- grep-friendly
- 行业 OpenTelemetry trace_id 是更厚重的方案，我们用不上
- Last9 / Speakeasy 文章背书简单 correlation_id 足够 dev tooling

## Codebase Analysis (E1)

### 33 Decision Points 跨 4 Hook

| Hook | Branches | 含义 |
|---|---|---|
| stop-watcher.ts | **14** | 8 silent allow + 5 block + 1 side-effect |
| task-completed-verifier.ts | **9** | 7 defensive guards + 1 block + 1 success |
| subagent-context-injector.ts | **8** | 6 fail-open + 1 success + 1 error fallback |
| stop-failure-handler.ts | **3** | observability points (matchers) |

### 10 Final Event Kinds（无 dead enum）

| # | Kind | Hook | 触发条件 |
|---|---|---|---|
| 1 | `stop_block_continuation` | stop-watcher | 高频 spec loop 推进 |
| 2 | `stop_block_cost_runaway` | stop-watcher | 硬 cap 命中（spec E）|
| 3 | `stop_block_verification_failed` | stop-watcher | iron-law gate（spec A）|
| 4 | `stop_allow_early_exit` | stop-watcher | 8 silent-allow 合并 |
| 5 | `task_verify_pass` | task-completed-verifier | layer-2 pass |
| 6 | `task_verify_fail` | task-completed-verifier | layer-2 block (exit 2) |
| 7 | `subagent_context_injected` | subagent-context-injector | 注入 success |
| 8 | `subagent_injection_failed` | subagent-context-injector | payload budget / 错误 |
| 9 | `stop_failure_rate_limit` | stop-failure-handler | API 429 |
| 10 | `stop_failure_other` | stop-failure-handler | auth / server / unknown |

### correlationId Field Sources（field-by-field 确认）

| Segment | Source | Field | Default |
|---|---|---|---|
| **session_id** | stdin payload | `path.basename(input.transcript_path).replace(/\.(jsonl\|json)$/, '')` | `'unknown'` |
| **task_idx** | state file | `state.taskIndex` | `0` |
| **iter** | state file (phase-aware) | `phase === 'execution' ? state.taskIteration : state.globalIteration` | `1` |

字段定位：
- `CurdxState.taskIndex` (types.ts L214)
- `CurdxState.globalIteration` (types.ts L218)
- `CurdxState.taskIteration` (types.ts L216)
- `HookStdin.transcript_path` (types.ts L48)

### Hook-Specific Injection Sites

| Hook | 关键 site | 注入 event kind |
|---|---|---|
| stop-watcher | buildCostRunawayBlock / verifyPhaseBlock / buildContinuationBlock / buildUncheckedTasksBlock | stop_block_* / stop_allow_early_exit |
| task-completed-verifier | L121 verify 结果 / 7 defensive guards | task_verify_pass / fail |
| subagent-context-injector | buildContextPayload 结果 (L123) / 异常 handler (L135) | subagent_context_injected / failed |
| stop-failure-handler | matcher 提取后 (L113) | stop_failure_rate_limit / other |

## Quality Commands

| 命令 | 用途 |
|---|---|
| `npm run typecheck` | TS strict |
| `npm run test:hooks` | 110 baseline + ≈3-5 新事件 logger 测试 |
| `npm run test:analyze` | 36 baseline + parser 解析 events.jsonl 验证 |
| `npm run check:hooks-fresh` | bundle 重建 |
| `npm run verify` | 全 chain |

## Related Specs

| Spec | Relevance | Relationship |
|---|---|---|
| OB-1 spec-analyze-real-transcript (✅) | HIGH | events.jsonl 路径 + parser 接入 |
| OB-3 spec-cost-time-token-analytics (pending) | HIGH downstream | 强依赖此 spec 的 correlationId 作 join key |
| spec-verification-iron-law (✅) | HIGH | 4 hook 之一的源代码 |
| spec-cost-runaway-guards (✅) | HIGH | 4 hook 之一 |

## Feasibility Assessment

| 维度 | 评估 | 备注 |
|---|---|---|
| **Schema 升级** | HIGH | 4 字段加项 + parse boundary defaults，~50 LOC |
| **Log rotation** | HIGH | ~30 LOC + retry chain 跨平台 |
| **4 hook 接入** | HIGH | 33 site 已 map，机械替换 |
| **10 event kind enum** | HIGH | 全部 needed, 0 dead |
| **correlationId 三段式** | HIGH | 字段路径已 map |
| **Performance** | LOW risk | rotation throttle (N=10) 安全 |
| **schema 向后兼容** | HIGH | parser `??` defaults 保证 round-trip |

## Recommendations for Requirements Phase

1. **Schema 加 4 字段**全 optional：level / kind / payload / correlationId
2. **logHookEvent 函数**继承 NEVER-throw（4KB cap + truncation cascade）
3. **Rotation throttle N=10**：每 10 次 logHookEvent 跑一次 statSync
4. **Cross-platform safeRename**：retry chain + copyFileSync fallback
5. **10 event kind enum** locked（research 已 finalize）
6. **correlationId 三段式 helper** 在 _shared/correlation.ts（避免 4 hook 各自拼）
7. **parser.ts 加 events.jsonl 路径** 平级 errors.jsonl
8. **现有 4 测试 round-trip 必须通过**（AC9 不破）

## Open Questions for Design Phase

1. **events.jsonl vs errors.jsonl** — 同一文件 unified（all events including errors）OR 分离（events.jsonl + errors.jsonl）？推荐 unified（简单 + ccusage 模式），但需 design 决议
2. **Retention configurable** — 5 默认值是否暴露 settings.json？推荐：v1 hardcoded，v2 配置
3. **rotation suffix collision** — 同秒多次 rotate？推荐用 `<ts>-<pid>` 规避
4. **payload redact white-list** — payload 任意 JSON 但要过 redact.ts，white-list 列表怎么定？

## Sources

### Web (R1, 24 sources)
- Node fs docs: https://nodejs.org/api/fs.html
- learn-nodejs-hard-way ch04.2 (logging)
- nodejs/node#29481 (Windows EPERM)
- Confluent schema evolution
- OpenTelemetry traces
- Last9 correlation_id vs trace_id

### Local
- `/Users/wdx/opc/curdx-flow/src/hooks/_shared/error-logger.ts` (134 LOC, NFR-9 baseline)
- `/Users/wdx/opc/curdx-flow/src/hooks/stop-watcher.ts` (903 LOC, 14 decision points)
- `/Users/wdx/opc/curdx-flow/src/hooks/task-completed-verifier.ts` (243 LOC, 9 points)
- `/Users/wdx/opc/curdx-flow/src/hooks/subagent-context-injector.ts` (143 LOC, 8 points)
- `/Users/wdx/opc/curdx-flow/src/hooks/stop-failure-handler.ts` (124 LOC, 3 points)
- `/Users/wdx/opc/curdx-flow/src/hooks/_shared/types.ts` (CurdxState + HookStdin schemas)

### Partial files (will be deleted post-merge)
- `.research-hook-decision-points.md` (E1, 244 lines)
- `.research-rotation-and-compat.md` (R1, ~250 lines, 24 sources)
