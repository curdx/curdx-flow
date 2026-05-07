---
spec: spec-decision-event-logging
epic: observability-v2
phase: triage
created: 2026-05-07
---

# Plan: spec-decision-event-logging

> Epic: [`specs/_epics/observability-v2/epic.md`](../_epics/observability-v2/epic.md)
> L3 业务事件日志体系 — schema 升级 + 4 hook 接入 + log rotation + B2-B6 五修复一并。

## Goal

curdx-flow hook 做出决策时用 `logHookEvent({level, kind, payload, correlationId})` 写**结构化、可 join、自动轮换**的 events.jsonl，OB-3 报表能按 kind/correlationId 切片。

## Acceptance Criteria

- AC1: error-logger.ts schema 加 4 字段（level/kind/payload/correlationId）；老行（缺字段）能被新 parser 读，level 默认 `'error'`、kind 默认 `'unknown'`
- AC2: B2-B6 五 bug 全修：level 不写死、event 枚举、appendFileSync 加 rotation、correlationId 入每行、payload 任意 JSON-safe object（过 redact white-list）
- AC3: `logHookEvent(input: HookEventInput): void` NEVER-throw（继承 NFR-9）
- AC4: log rotation 自家代码：单文件 ≥ 10MB **或** mtime ≥ 30 天 → rename `events.<ts>.jsonl`；保留 5 轮换文件
- AC5: 4 hook 接入 logHookEvent，约 10 event kinds（stop_block / stop_unblock / task_verify_pass / task_verify_fail / subagent_context_injected / stop_failure_recovered 等）
- AC6: parser.ts 加 events.jsonl 解析路径，integration test 通过
- AC7: correlationId 格式 `<session_id>:<task_idx>:<iter>` — hook 内用 transcript context + state file 拼
- AC8: CHANGELOG 独立 entry
- AC9: 现有 `tests/hooks/error-logger.test.ts` 4 case **不修改**继续通过（纯 additive）

## Size

S-M（8-12 任务，9 目标）

## Dependencies

- **OB-1** spec-analyze-real-transcript（弱依赖：integration test 需要真 transcript path）

## Interface Contract

```typescript
// src/hooks/_shared/error-logger.ts (extend existing file)

export type EventLevel = 'error' | 'info' | 'metric' | 'decision';
export type EventKind =
  | 'stop_block' | 'stop_unblock'
  | 'task_verify_pass' | 'task_verify_fail'
  | 'subagent_context_injected'
  | 'stop_failure_recovered'
  | 'unknown';                         // 老行 + safety fallback

export interface HookEventInput {
  hook: string;                        // hook 文件名
  event: EventKind;                    // 强枚举
  level: EventLevel;
  msg?: string;                        // ≤500 chars
  payload?: Record<string, unknown>;   // 过 redact white-list
  correlationId?: string;              // <sid>:<task_idx>:<iter>
}

// schema-on-disk (events.jsonl line)
export interface EventLogRow {
  ts: string;                          // ISO 8601
  hook: string;
  event: EventKind;
  level: EventLevel;
  msg?: string;
  payload?: Record<string, unknown>;
  correlationId?: string;
}

export function logHookEvent(input: HookEventInput): void;  // NEVER-throw

// 老 logError 保留 — 内部转发到 logHookEvent({level:'error', kind:'unknown'})
```

## Owner Files

- MODIFY `src/hooks/_shared/error-logger.ts`（schema 扩 + rotation + logHookEvent）
- MODIFY `src/hooks/stop-watcher.ts`
- MODIFY `src/hooks/task-completed-verifier.ts`
- MODIFY `src/hooks/subagent-context-injector.ts`
- MODIFY `src/hooks/stop-failure-handler.ts`
- MODIFY `src/analyze/parser.ts`（events.jsonl 解析）
- MODIFY `src/analyze/types.ts`（EventLogRow type）
- NEW `tests/hooks/event-logger.test.ts`（rotation + correlationId + payload redact + 老行兼容）
- MODIFY `CHANGELOG.md`（独立 OB-2 entry）

## Validation Hint

- 写 100 行 events.jsonl 强制超 10MB → 应 rename `events.<ts>.jsonl`
- 用 v7.1.6 老 errors.jsonl 喂新 parser → 0 报错，level 全归 `'error'`
- 4 hook 触发场景手跑 → grep correlationId 每行出现，同 session 三段式相同 prefix
- **Runnable**: `cat ~/.claude/curdx-flow/errors.jsonl | head -1 | jq .level` 不报错

## Notes from Triage

- B2-B6 全归此 spec（同 error-logger.ts 改动）
- correlationId 三段式无外部状态、grep 友好（Q5 决策）
- log rotation 自家 ~30 LOC（Q4 决策，约束禁外部 npm deps）
- 老 errors.jsonl 兼容必须 round-trip 测试通过（Patch 3 from validation）

## Related Research

- `specs/_epics/observability-v2/research.md` §Codebase Analysis (E1) §Validation Findings
