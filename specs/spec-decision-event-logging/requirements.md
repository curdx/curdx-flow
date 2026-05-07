---
spec: spec-decision-event-logging
epic: observability-v2
phase: requirements
created: 2026-05-07
---

# Requirements

## Goal

curdx-flow hook 在 4 个关键 hook（stop-watcher / task-completed-verifier / subagent-context-injector / stop-failure-handler）的 33 个 decision point 写结构化 L3 业务事件到 events.jsonl，schema 加 4 字段全 optional，老 errors.jsonl 行 round-trip 兼容；OB-3 报表能按 kind/correlationId 切片。

## Success Criteria

- 4 hook 触发后 events.jsonl 每行含 `correlationId` 三段式 + 强枚举 `event` + `level`
- 老 v7.1.6 errors.jsonl 喂新 parser 0 报错，自动 coerce 到 `{level:'error', event:'unknown'}`
- `tests/hooks/error-logger.test.ts` 4 个现有 case **不修改**继续通过
- Cross-platform CI matrix（POSIX/Windows × Node 20/22）全过 — rotation safeRename 不抛

## Glossary

- **L3 业务事件**：hook decision/metric/observability 三类信号，区别于 L1 raw transcript / L2 hook lifecycle
- **correlationId 三段式**：`<session_id>:<task_idx>:<iter>` — grep 友好的 join key
- **Rotation throttle**：每 N=10 次 logHookEvent 跑一次 statSync，不每次都跑
- **Schema additive compat**：producer 永不删/改字段、consumer parse 边界 `parsed.X ?? default`
- **Cross-platform safeRename**：POSIX renameSync atomic + Windows EBUSY/EPERM retry chain (50/200/500ms) + EXDEV copyFileSync fallback
- **NEVER-throw**：error-logger.ts NFR-9 既有保证，logHookEvent 必须继承

## Personas

### Primary: hook 维护者

写 hook 代码、调 `logHookEvent({...})` 上报决策、不能让 logger 抛错炸 hook。需要：API 简单、kind 强枚举防拼错、correlationId helper 不要 4 hook 各自拼。

### Secondary: OB-3 analyze 消费者

下游 `npm run analyze` 报表，按 `event` kind groupBy、按 `correlationId` join cost/time。需要：events.jsonl schema 稳定可解析、老行也能读、kind 枚举 closed-set。

## User Stories

### US-1: logHookEvent NEVER-throw 继承

**As a** hook 维护者
**I want to** 调 logHookEvent 不需要 try/catch
**So that** logger bug 永不炸 hook 主流程

**Acceptance Criteria:**
- [ ] AC-1.1: 函数签名 `logHookEvent(input: HookEventInput): void`，无 throw 路径
- [ ] AC-1.2: 内部所有 fs / JSON.stringify 操作 try/catch 吞掉
- [ ] AC-1.3: 4KB line cap + truncation cascade 继承 error-logger.ts 既有逻辑

### US-2: Schema 4 字段加项

**As a** schema 设计者
**I want to** 加 level / kind / payload / correlationId 4 个 optional 字段
**So that** 老行（缺字段）和新行（全字段）共存于同一文件

**Acceptance Criteria:**
- [ ] AC-2.1: TS interface `EventLogRow` 4 字段全 optional
- [ ] AC-2.2: producer 写入新行带全字段
- [ ] AC-2.3: 不删除 / 不重命名既有字段 (`ts`, `hook`, `event`, `msg`)

### US-3: 老 errors.jsonl round-trip 兼容

**As a** OB-3 消费者
**I want to** 用新 parser 读老 errors.jsonl 不报错
**So that** 历史数据不丢、迁移不需要 backfill

**Acceptance Criteria:**
- [ ] AC-3.1: 老行（缺 level/kind/payload/correlationId）parse 后 `level === 'error'`、`event === 'unknown'`
- [ ] AC-3.2: parser 边界用 `parsed.level ?? 'error'` + `coerceKind(parsed.event)`
- [ ] AC-3.3: 4 个现有 error-logger.test.ts case 不改即通过

### US-4: 4 hook 接入 33 sites

**As a** hook 维护者
**I want to** 把 33 个 decision point 接入 logHookEvent
**So that** 业务决策可观测

**Acceptance Criteria:**
- [ ] AC-4.1: stop-watcher 14 site 接入（8 silent allow + 5 block + 1 side-effect）
- [ ] AC-4.2: task-completed-verifier 9 site（7 defensive + 1 block + 1 success）
- [ ] AC-4.3: subagent-context-injector 8 site（6 fail-open + 1 success + 1 error）
- [ ] AC-4.4: stop-failure-handler 3 site（matchers 提取后）

### US-5: 10 event kind enum 锁定

**As a** schema 设计者
**I want to** 强枚举 10 final event kind
**So that** 没有 dead member、消费者 closed-set switch

**Acceptance Criteria:**
- [ ] AC-5.1: TS union 包含且仅包含 10 kind + `'unknown'`：stop_block_continuation / stop_block_cost_runaway / stop_block_verification_failed / stop_allow_early_exit / task_verify_pass / task_verify_fail / subagent_context_injected / subagent_injection_failed / stop_failure_rate_limit / stop_failure_other
- [ ] AC-5.2: `coerceKind(unknown_string)` 回落 `'unknown'`
- [ ] AC-5.3: 4 hook 实际触发覆盖全 10 kind（无 dead）

### US-6: correlationId 三段式 helper

**As a** hook 维护者
**I want to** 不重复在 4 hook 拼 correlationId
**So that** 格式一致、改一处生效

**Acceptance Criteria:**
- [ ] AC-6.1: `_shared/correlation.ts` 暴露 `buildCorrelationId(input, state, phase): string`
- [ ] AC-6.2: 输出格式 `<session_id>:<task_idx>:<iter>`
- [ ] AC-6.3: session_id 来自 `path.basename(input.transcript_path).replace(/\.(jsonl|json)$/, '')`，缺失 fallback `'unknown'`
- [ ] AC-6.4: task_idx 来自 `state.taskIndex`，缺失默认 `0`
- [ ] AC-6.5: iter 来自 `phase === 'execution' ? state.taskIteration : state.globalIteration`，缺失默认 `1`

### US-7: Log rotation 双闸触发

**As a** 运维
**I want to** events.jsonl 不无限增长
**So that** 磁盘不爆、grep 不卡

**Acceptance Criteria:**
- [ ] AC-7.1: 单文件 size ≥ 10MB 触发 rotate
- [ ] AC-7.2: mtime ≥ 30 day 触发 rotate
- [ ] AC-7.3: rotated 文件名 `events.<ts>-<pid>.jsonl` 防同秒碰撞
- [ ] AC-7.4: 保留最近 5 个 rotated 文件（按 mtime），oldest drop

### US-8: Cross-platform safeRename

**As a** 运维
**I want to** rotation 在 Windows / EXDEV 不挂
**So that** Windows 用户不丢日志

**Acceptance Criteria:**
- [ ] AC-8.1: POSIX renameSync 直接成功
- [ ] AC-8.2: Windows EBUSY/EPERM 走 retry chain 50/200/500ms
- [ ] AC-8.3: EXDEV / 最终失败走 copyFileSync + unlinkSync fallback
- [ ] AC-8.4: 全失败也 NEVER-throw，吞错继续 append

### US-9: Rotation throttle N=10

**As a** 性能 owner
**I want to** rotation 检查不每次都跑 statSync
**So that** 30 call/spec p99 ≤ 50ms

**Acceptance Criteria:**
- [ ] AC-9.1: 模块级 counter，每 10 次 logHookEvent 跑一次 shouldRotate
- [ ] AC-9.2: counter overflow 回 0
- [ ] AC-9.3: 进程冷启动 first call 也走 check（防上次进程留下大文件）

### US-10: parser.ts 解析 events.jsonl

**As a** OB-3 analyze 消费者
**I want to** parser.ts 平级解析 events.jsonl
**So that** 报表能 join

**Acceptance Criteria:**
- [ ] AC-10.1: `src/analyze/parser.ts` 加 events.jsonl 路径，与 errors.jsonl 平级
- [ ] AC-10.2: 输出 `EventLogRow[]`，老行 default 填充
- [ ] AC-10.3: integration test 用真 100 行 events.jsonl 通过

### US-11: 4 现有单测不修改通过

**As a** 维护者
**I want to** error-logger.test.ts 4 case 0 改动通过
**So that** 重构纯 additive、回归零风险

**Acceptance Criteria:**
- [ ] AC-11.1: `tests/hooks/error-logger.test.ts` git diff 为空
- [ ] AC-11.2: `npm run test:hooks` 全 110 baseline 通过
- [ ] AC-11.3: 加 ≈3-5 个新事件 logger 测试 in `tests/hooks/event-logger.test.ts`

### US-12: CHANGELOG entry 独立

**As a** 用户
**I want to** CHANGELOG 有 OB-2 独立 entry
**So that** 升级时知道 schema 加项

**Acceptance Criteria:**
- [ ] AC-12.1: `CHANGELOG.md` 顶部新版本 section 含 OB-2 标识
- [ ] AC-12.2: 列出 4 加项字段名 + round-trip 兼容承诺
- [ ] AC-12.3: 引用本 spec slug

## Functional Requirements

| ID | Requirement | Priority | Acceptance |
|---|---|---|---|
| FR-Schema-1 | EventLogRow 4 字段 optional：level / kind / payload / correlationId | High | TS strict 编译 |
| FR-Schema-2 | EventLevel union: `'error' \| 'info' \| 'metric' \| 'decision'` | High | Closed-set |
| FR-Schema-3 | EventKind union 10 kind + `'unknown'` | High | AC-5.1 |
| FR-Logger-1 | `logHookEvent(input): void` NEVER-throw | High | AC-1.1/1.2 |
| FR-Logger-2 | 老 `logError` 内部转发 `logHookEvent({level:'error', kind:'unknown'})` | High | round-trip |
| FR-Logger-3 | 4KB line cap + truncation cascade 继承 | High | NFR-9 |
| FR-Rotation-1 | shouldRotate: size ≥ 10MB OR mtime ≥ 30d | High | AC-7.1/7.2 |
| FR-Rotation-2 | safeRename: POSIX direct + Windows retry + EXDEV copy fallback | High | AC-8 |
| FR-Rotation-3 | Retention 5 个 rotated（hardcoded v1） | Medium | AC-7.4 |
| FR-Rotation-4 | Throttle N=10 statSync 调用 | High | AC-9 |
| FR-Hooks-1 | 4 hook × 33 site 全接入 | High | AC-4 |
| FR-Hooks-2 | correlationId 来自 `_shared/correlation.ts`，不 4 处拼 | High | AC-6 |
| FR-Parser-1 | parser.ts 加 events.jsonl 解析路径 | High | AC-10 |
| FR-Parser-2 | parse 边界 `parsed.level ?? 'error'` + `coerceKind` | High | AC-3.2 |
| FR-Compat-1 | 老 errors.jsonl 行 round-trip → `{level:'error', event:'unknown'}` | High | AC-3.1 |
| FR-Compat-2 | 现有 4 测试 0 改动通过 | High | AC-11.1 |
| FR-Test-1 | 新 event-logger.test.ts ≈3-5 case：rotation / correlationId / payload redact / 老行 / NEVER-throw | High | AC-11.3 |
| FR-Test-2 | analyze parser integration test 用真 events.jsonl | Medium | AC-10.3 |
| FR-Doc-1 | CHANGELOG 独立 OB-2 entry | Medium | AC-12 |
| FR-Doc-2 | 引用 research.md sources | Low | inline |

## Non-Functional Requirements

| ID | Requirement | Metric | Target |
|---|---|---|---|
| NFR-1 | NEVER-throw 继承 | logHookEvent 无 throw 路径 | 100% |
| NFR-2 | 4KB line cap 继承 | 单行 size | ≤ 4096 bytes |
| NFR-3 | Cross-platform | CI matrix POSIX/Windows × Node 20/22 | 4-leg 全过 |
| NFR-4 | Performance | 30 call/spec cumulative | p99 ≤ 50ms |
| NFR-5 | Rotation throttle | statSync 频率 | 1/N where N=10 |
| NFR-6 | Schema additive | 老 errors.jsonl round-trip | 0 报错 |

## Out of Scope

- Async logHookEvent —— sync `appendFileSync` 简单且 hook 是 one-shot 进程
- 配置化 retention（5 个 hardcoded）—— v1 不暴露 settings.json，v2 再说
- Cross-machine session merge —— correlationId 不跨机器
- Event sampling —— 全量写入，不抽样
- L1 raw transcript / L2 hook lifecycle —— 本 spec 仅 L3 业务事件

## Dependencies

### Internal

- **OB-1 spec-analyze-real-transcript** (✅) — events.jsonl 路径需要 OB-1 真 transcript 接入测试

### External

- 无 npm 新依赖（rotation 自家 ~30 LOC）

## Open Questions for Design

1. **events.jsonl vs unified errors.jsonl** —— 同一文件 unified（all events including errors）OR 分离（events.jsonl + errors.jsonl）？倾向 unified（简单 + ccusage 模式），但需 design 决议 [BIGGEST]
2. **Retention 配置化时机** —— 5 默认值是否暴露 settings.json？v1 hardcoded、v2 配置
3. **Rotation suffix 命名细节** —— `<ts>-<pid>` ts 用 ISO 还是 epoch ms？pid 几位？
4. **Payload redact white-list** —— payload 任意 JSON 但要过 redact.ts，white-list 列表怎么定？

## Risks

- **R1**：rotation throttle counter 模块级 → multi-process 场景重复 stat（low：hook 是 one-shot，不共进程）
- **R2**：Windows AV 锁文件 50/200/500ms retry 不够 → copyFileSync fallback 兜底（mitigated）
- **R3**：correlationId 缺 transcript_path（CLI 直跑 hook）→ session_id `'unknown'`，仍写入（degraded but works）
- **R4**：4 hook 接入 33 site 漏改 site → grep `logError(` 应 ≤ 既有 baseline；CI 加 site count check
- **R5**：unified vs split 文件决策错 → 影响 OB-3 join，需 design phase 锁死

## Validation Strategy

- 4 个 round-trip 测试（老 errors.jsonl 行 → 新 parser → 默认值正确）
- 100 行写入强制超 10MB → 应 rename `events.<ts>-<pid>.jsonl`
- 4 hook 触发场景手跑 → grep correlationId 三段式格式 `^[^:]+:[0-9]+:[0-9]+$`
- Cross-platform CI matrix 4-leg 全过（POSIX/Windows × Node 20/22）
- `cat ~/.claude/curdx-flow/events.jsonl | head -1 | jq .level` 不报错
- 现有 4 error-logger 单测 git diff 空 + npm run test:hooks 全 110 通过

## Next Steps

1. Design phase 决议 4 个 open question（首先 unified vs split 文件）
2. tasks.md 拆 8-12 任务（schema / logger / rotation / 4 hook / parser / 测试 / CHANGELOG）
3. 实施前确认 33 site 清单 final（research.md E1 已 map）
4. CI 加 cross-platform matrix（如未启用）
