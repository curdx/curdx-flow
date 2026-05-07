---
epic: observability-v2
phase: research
created: 2026-05-07
researchers: [E1 current-state, R1 transcript-schema, R2 cost-analysis]
---

# Research: observability-v2

## Executive Summary

plugin-observability **基础设施扎实**（13 文件 / 2415 LOC / 7 报表段 + parser→filter→redact→report 完整管线 + NEVER-throw error-logger），但**6 个真 bug 确认**：B1（critical: `analyze` 读测试 fixture 不读真 transcript）+ B2-B6（`level: 'error'` 写死、`event` 无枚举、无 log rotation、无 correlationId、无 structured payload）。**Claude Code transcript 是金矿** — 路径 `~/.claude/projects/<path-encoded-cwd>/<session-uuid>.jsonl`，每个 assistant turn 自带 `usage: {input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens.ephemeral_{5m,1h}_input_tokens}`，hook 事件本身也在 transcript 里 `attachment.hook_success.durationMs` —— **不需要外部计时**。Anthropic 2026 价格表：Opus 4.7 $5/$25 in/out（**修正：之前我估的 $15/$75 是 4.6 价格，4.7 调整了**），Sonnet 4.6 $3/$15，Haiku 4.5 $1/$5；cache_read 0.1×，cache_write 5m 1.25× / 1h 2×。**ccusage + Langfuse 是 best production analog**；cache hit 目标 70%（<60% warn / <30% SEV）；**aggregate rates 误导 — 必须 per-spec × per-phase + robust z-score (MAD)**。3 个 spec 拆分（OB-1/2/3）线性依赖架构成立。

## External Research (R1 + R2)

### Transcript schema — 金矿（R1）

**路径**：`~/.claude/projects/<slug>/<session-uuid>.jsonl`
- `<slug>` = abs cwd 把 `/` 换成 `-`（path-encoded，**非 hash**）
- 每次 `claude` invocation 一文件，compaction 不轮换

**`usage` schema**（每个 `type=assistant` 行的 `message.usage`）：
```json
{
  "input_tokens": 1234,
  "output_tokens": 678,
  "cache_read_input_tokens": 9876,
  "cache_creation_input_tokens": 100,
  "cache_creation": {
    "ephemeral_5m_input_tokens": 80,
    "ephemeral_1h_input_tokens": 20
  },
  "server_tool_use": {"web_search_requests": 0},
  "service_tier": "standard",
  "inference_geo": "us-east-1"
}
```

**关键**：嵌套的 `ephemeral_5m_input_tokens` vs `ephemeral_1h_input_tokens` **可区分 5m / 1h cache write** —— 之前担心要靠 heuristic 推断的问题不存在。

### 重要彩蛋（R1）

1. **Hook 事件本身就在 transcript 里**：`attachment.hook_success.durationMs` 字段 —— **不需要在 hook 里 process.hrtime() 自己计时**。
2. **`turn_duration` 系统事件**带 `durationMs` + `messageCount`，per-turn 墙钟白嫖。
3. **`requestId` (`req_011...`) 唯一**每 API 调用 —— 用作去重 key。
4. **Subagent `<usage>` trailer 可解**：`/<usage>total_tokens:N\ntool_uses:N\nduration_ms:N<\/usage>/` 稳定 regex。
5. **Opus 4.7 用新 tokenizer**，同文本可能消耗 +35% tokens vs 4.6 —— 跨模型历史对比需归一化。
6. **`isSidechain=true` 在 30 个样本 transcript 里 0 出现** —— 现在 subagent 在自己的 session 文件里跑，不是 sidechain。OB-3 实施时复核。

### Anthropic Pricing 2026（R1，**修正版**）

| Model | Input $/MTok | Output $/MTok | Cache Read | Cache Write 5m | Cache Write 1h |
|---|---|---|---|---|---|
| **Opus 4.7** | $5 | $25 | $0.50 | $6.25 | $10 |
| **Sonnet 4.6** | $3 | $15 | $0.30 | $3.75 | $6 |
| **Haiku 4.5** | $1 | $5 | $0.10 | $1.25 | $2 |

Multipliers: read 0.1× / 5m write 1.25× / 1h write 2× of input rate.

**Cost formula**:
```
cost = (input·base + 5m_write·1.25·base + 1h_write·2·base + cache_read·0.1·base + output·out_price) / 1e6
```

### Best Production Analog（R2）

| 工具 | 学什么 |
|---|---|
| **ccusage** | "读 JSONL → cost-by-X" 核心 + LiteLLM 价格表模式 |
| **Langfuse** | tag-driven attribution（per-task / per-spec 标签） |
| Cursor | 使用 metric 分流 |
| Microsoft Foundry | enterprise rollup |
| Plausible/Umami/GoatCounter | 本地优先 / 无 phone-home |

**Cache hit thresholds**（Anthropic 自家共识）：
- Target ≥ 70%
- Warn < 60%
- **SEV < 30%**（自家 Eng 团队会发 SEV ticket）

**❗ 最大陷阱**（TensorMesh）：
> *"Aggregate rates will mislead you. Always per-stream (per-spec × per-phase), never aggregate."*

**Recommendation engine 模式**（37 sources）：
- Threshold rules（hit-cap rate > 20% → bump cap）
- Robust z-score on MAD（不是 mean+σ — coding-spec 成本是 heavy-tail，经典统计破）
- 同 size 同 phase cohort 对比，不是全局对比

### 隐私必须有（R2）

- 文件级存储 `~/.claude/curdx-flow/observability/`
- 零 phone-home
- 写入文档 "we don't collect X / Y / Z"
- `--debug` dry-run 看会输出啥
- `--include-prompts` 默认 OFF（已存在）

## Codebase Analysis (E1)

### 13 文件 / 2415 LOC 现状

| Module | LOC | Status |
|---|---|---|
| `src/hooks/_shared/error-logger.ts` | 134 | NFR-9 NEVER-throw + 4KB cap 已 ship |
| `src/analyze/index.ts` | 211 | 7-section orchestrator 已 ship |
| `src/analyze/parser.ts` | 270 | 流式 jsonl + schema-map + 轮换检测 |
| `src/analyze/filter.ts` | 80 | dedup + --since + Top-N |
| `src/analyze/redact.ts` | 163 | D-9 white-list + path hash + prompt scrub |
| `src/analyze/report.ts` | 585 | markdown + JSON 7 sections |
| `src/analyze/types.ts` | 105 | Counters / Event / Options / StateFile |
| `tests/hooks/error-logger.test.ts` | 121 | 4 cases (enabled/disabled/corrupt/throw) |
| `tests/analyze/*.test.ts` | 700+ | parser/filter/redact/report/integration |
| `tests/analyze/fixtures/sample.jsonl` | 10 events | 用作单测 fixture |

### 6 Bugs 行号确认（E1）

| Bug | File | Line | 内容 |
|---|---|---|---|
| **B1 🔴 critical** | `index.ts` | 23, 112 | `POC_FIXTURE_REL = 'tests/analyze/fixtures/sample.jsonl'` —— `analyze` 读测试 fixture 不读真 transcript |
| B2 | `error-logger.ts` | 91 | `level: 'error'` 写死 |
| B3 | `error-logger.ts` | 70 | `event: string` 无枚举无校验 |
| B4 | `error-logger.ts` | 124 | `appendFileSync` 永远追加，无 rotation |
| B5 | `error-logger.ts` | 68-77 | 无 correlationId / sessionId / requestId |
| B6 | `error-logger.ts` | 68-77, 89-105 | 无 structured `payload` 字段（只 500-char `msg`）|

### CLI surface — 现状 vs 需求

```
现有: npx curdx-flow analyze [--out] [--json] [--limit] [--include-prompts]
缺失: --since (代码已有逻辑)、--grep (代码已有逻辑)、--project (CLI 没接)、
      --by-spec / --by-phase / --by-task (聚合维度切换)、
      --cost-summary (cost 报表开关)
```

### Foundation 已就绪 vs 需新建

✅ **已就绪**：error-logger NEVER-throw 契约、analyze 流式管线、redact、CLI 框架、settings.json 集成、fixture-based 测试模式

❌ **需新建**（OB-1/2/3 添补）：
- 真 transcript 路径解析（OB-1）
- L3 schema 升级 + correlationId + log rotation（OB-2）
- pricing.ts + transcript usage 解析 + R1-R7 报表 + recommendation engine（OB-3）

## Quality Commands

继承现有：

| 命令 | 用途 |
|---|---|
| `npm run typecheck` | 全套已配置 |
| `npm run test:hooks` | hook unit |
| `npm run test:analyze` | analyze unit + integration |
| `npm run verify` | 全 chain |

## Related Specs

| Spec | Relevance | Relationship |
|---|---|---|
| plugin-observability (✅) | **HIGH foundation** | 我们在它上面盖 |
| spec-verification-iron-law (✅) | LOW | 共享 hooks 但不共享 logger 路径 |
| spec-cost-runaway-guards (✅) | MEDIUM | 它的 cap 强制配合 OB-3 cost report |
| 4 epic specs (✅) | LOW | 不冲突 |

## Feasibility Assessment

| 维度 | 评估 | 备注 |
|---|---|---|
| **B1 修复** | HIGH | 已知行号；replace 1 const + 1 path resolver |
| **L3 schema 升级** | HIGH | error-logger 已 NEVER-throw + 4KB cap，扩 payload/correlationId 是加项 |
| **transcript 解析** | HIGH | parser.ts 已流式，扩 schema map 加 `assistant.usage` 即可 |
| **价格表计算** | HIGH | 公开数据；hardcoded pricing.ts，价格变动走 PR |
| **R1-R7 报表** | MEDIUM | 已有 7-section report.ts，扩展为新报表需 +500-800 LOC |
| **推荐引擎** | MEDIUM | 6-8 threshold rules + robust z-score；MVP 范围内 |
| **跨平台** | LOW risk | 已有 4-leg CI matrix |
| **Schema 向后兼容** | HIGH | 字段加项 + level/kind 枚举默认值兜底 |

## Recommendations for Decomposition (3 specs — pre-cut by user)

### OB-1: spec-analyze-real-transcript (S size, ≤8 tasks)
**Goal**: 修 B1 critical bug —— `analyze` 命令读真 `~/.claude/projects/*/*.jsonl` 不再读测试 fixture。

**关键改动**：
- `index.ts:23` 替换 `POC_FIXTURE_REL` 常量
- 新增 `findTranscriptPath()`：`<path-encoded-cwd>/<session-uuid>.jsonl` 解析
- 保留 fixture 作单测 only（test-only env var 切换）
- 新加 5 测试：path resolver / encoding / multi-session / missing project / fallback

### OB-2: spec-decision-event-logging (S-M size, 8-12 tasks)
**Goal**: L3 业务事件日志体系 —— schema 升级 + correlationId + log rotation + 4 hook 接入 + ≈10 event 名枚举。

**关键改动**：
- error-logger.ts 扩 `level/kind/payload/correlationId` 字段（兼容旧 schema）
- 新增 `logHookEvent()` 函数（结构化事件）
- 加 log rotation（≤10MB 单文件，≤30 天保留）
- 4 个 hook（stop-watcher / task-completed-verifier / subagent-context-injector / stop-failure-handler）接 logHookEvent 调用 —— 共 ≈10 event 类型
- analyze parser 加 events.jsonl 解析

### OB-3: spec-cost-time-token-analytics (M size, 12-18 tasks)
**Goal**: cost/time/token 分析 + R1-R7 报表 + 推荐引擎 = curdx-flow 自优化闭环底盘。

**关键改动**：
- `src/analyze/pricing.ts` —— 价格表（Opus/Sonnet/Haiku 5 字段 each）
- transcript schema map 扩展（解析 `assistant.usage` + `attachment.hook_success.durationMs`）
- `src/analyze/cost.ts` —— 成本计算 + 三级聚合（task/phase/spec）
- `src/analyze/recommend.ts` —— 推荐引擎（6-8 threshold rules + robust z-score MAD）
- `report.ts` 扩展为 R1-R7 七张报表
- CLI 新 flag：`--cost-summary` / `--by-spec` / `--by-phase` / `--by-task` / `--since`
- 模型归一化：Opus 4.7 vs 4.6 tokenizer 调整

## Open Questions for triage-analyst

1. OB-2 是否拆 `logHookEvent` lib + 4 hook 各自接入（拆细 → 8 任务）vs 一次性合并（5-6 任务）？
2. OB-3 推荐引擎是否单独成一个 spec？（M → L 风险），或纳入 OB-3（M 上限）。
3. B2-B6 五个修复在 OB-2 里一并做？还是单独拆？（建议: 一并 OB-2）
4. log rotation 实现：自家代码 vs `pino-roll` 等外部 lib？（约束：不引入 npm runtime deps）
5. correlationId 用 session_id:task_idx:iter 三段式 vs UUID + correlationMap？
6. CHANGELOG 路径：3 spec 各自独立 vs epic 完成统一？

## Sources

### Web (R1 + R2, 38 sources)
Key:
- Anthropic Pricing https://platform.claude.com/docs/en/about-claude/pricing
- Anthropic Eng "Cache rules everything around me" blog
- ccusage https://github.com/cccost/ccusage
- Langfuse https://langfuse.com/
- TensorMesh + Microsoft Foundry + Plausible/Umami

### Local repos
- `/Users/wdx/opc/curdx-flow/src/hooks/_shared/error-logger.ts` (134 LOC)
- `/Users/wdx/opc/curdx-flow/src/analyze/*.ts` (1414 LOC, 6 modules)
- `/Users/wdx/opc/curdx-flow/tests/analyze/*.test.ts` (700+ LOC)
- `/Users/wdx/opc/curdx-flow/tests/analyze/fixtures/sample.jsonl`

### Partial research files (will be deleted post-merge)
- `.research-current-state.md` (E1, 372 lines)
- `.research-transcript-schema.md` (R1, 488 lines)
- `.research-cost-analysis.md` (R2, ~340 lines)

## Validation Findings

### Methodology
Read 5 source files (error-logger.ts, analyze/index.ts, analyze/parser.ts, error-logger.test.ts, sample.jsonl) + listed `~/.claude/projects/` to verify R1 claims. No web research redo. All findings cite line numbers.

### Per-Spec Findings

#### OB-1 (spec-analyze-real-transcript)
- **Independence**: PASS — no deps declared, none needed.
- **Interface contract realism**: PASS with one detail — verified `~/.claude/projects/<slug>/` actually contains:
  - **Multiple `<uuid>.jsonl` files at top level** (e.g., `5cc737e7-…jsonl` + `76b2864e-…jsonl` siblings, NOT one-per-subdir)
  - Plus an inner subdir named after one uuid (sidechain dir, contains its own jsonl). OB-1 epic L58-62 only describes top-level `<uuid>.jsonl` files — **AC2 needs to clarify subdir handling** (skip the uuid-named subdir, or recurse?). R1 30-sample claim "isSidechain=true 0 occurrences" plausible but the directory-level subdir IS a real artifact.
  - Path encoding `-Users-wdx-opc-curdx-flow` confirmed (slash → dash, no hash).
- **Scope realism**: PASS — 5-7 tasks fits ≤8 cap; only 3 owner files.
- **Hidden shared modules**: NONE found — `transcript-path.ts` is genuinely new.
- **Issue**: index.ts L23 hardcodes `POC_FIXTURE_REL` AND L116/150/203 all use `fixturePath` directly. Owner files list (L88) only mentions L23/L112 — actually need to update L116 (`statSync`), L150 (`parseTranscript`), L203 (`state.files[fixturePath]` key). **All 4 references must be replaced**, not just 2.

#### OB-2 (spec-decision-event-logging)
- **Independence**: WEAK — declared `OB-1` dep is integration-test only. error-logger.ts schema work is fully independent of OB-1. Could parallelize if needed.
- **Interface contract realism**: PASS — `EventLogRow` cleanly extends `LogHookErrorContext` (error-logger.ts L68-77). Old fields all preserved (`hook`/`event`/`msg`/`cwd`/`transcript_path`/`spec`/`path`/`stack`); new fields (`level`/`payload`/`correlationId`) layer on top. Existing `level: 'error'` write at L91 is hardcoded but not exposed externally — refactor straightforward.
- **Scope realism**: PASS — 9 tasks for schema + 4-hook touches + rotation + parser fits S-M.
- **Hidden shared modules**: **MISSED** — `src/analyze/index.ts:83-109` (`loadErrorEntries`) hand-parses errors.jsonl with field-by-field type checks. OB-2 epic L156 says "MODIFY parser.ts" but the actual events.jsonl reader lives in **index.ts**, not parser.ts. Owner files list needs index.ts added OR loadErrorEntries moved into parser.ts as an explicit OB-2 sub-task.
- **Test compat issue**: error-logger.test.ts L87 asserts `parsed.level === 'error'` LITERAL. After OB-2 schema change, `level` will still default to `'error'` for `logHookError()` callers (per epic AC1) → **PASS, no test break**. But L84 comment "5 required fields" stays accurate only if we don't add MORE required fields. AC1 keeps new fields optional → test stays green.

#### OB-3 (spec-cost-time-token-analytics)
- **Independence**: PASS — strong dep on OB-2 correlationId is real (cost.ts AC4 join).
- **Interface contract realism**: PASS for pricing.ts/cost.ts shapes. **Schema-map mismatch**: parser.ts L42-62 `BUILTIN_SCHEMA_MAP` and L83-94 plugin schema JSON loader currently extract by `fields: string[]` (dotted-path strings). epic AC2 says "扩展 `assistant.message.usage` 全 6 字段" but schema map's flat string-array can't express nested `cache_creation.ephemeral_5m_input_tokens` cleanly. Either schema needs `fields: { path: string, alias?: string }` upgrade, or usage parsing bypasses schema-map entirely. **OB-3 design phase must resolve.**
- **Scope realism**: PASS — 14 tasks for 12 owner files reasonable; pricing static, cost formula one-pass, recommend ≈6 rules.
- **Hidden shared modules**: parser.ts L223 ALREADY reads `requestId` from raw lines. AC9 ("requestId 去重 key 接入 filter.ts dedup") implies filter.ts NOT yet doing it — verified parser already extracts but filter.ts presumably doesn't dedup on it. Minor task.
- **Recommendation rules**: declared 6-8; epic L178 lists 4 examples; OK.

### Cross-Cutting Findings

- **Missing specs**: NONE. 3-spec cut covers all 6 known bugs + R1-R7 + recommend.
- **Unnecessary specs**: NONE.
- **Dependency graph corrections**:
  - OB-1 → OB-2 marked strong, but actually **weak** (integration-test only). Mermaid graph stays accurate as authored, but Sequencing Recommendation L260 understates: OB-2 could start on schema/rotation work in parallel with OB-1. Linear sequencing still preferred for review simplicity.
  - OB-2 → OB-3 strong dep is correctly characterized.
- **Specific risk verifications**:
  - **Multi-session resolution**: `~/.claude/projects/-private-tmp-cmp-A-curdx/` actual ls = 2 top-level `.jsonl` (5cc737e7 + 76b2864e) + 1 same-name subdir. R1 claim "one file per `claude` invocation" stands. AC2 "mtime 倒序选最新 OR 全部聚合" both viable; **flag uuid-named subdir handling explicitly in OB-1 requirements**.
  - **error-logger test compat**: PASS — case 1 asserts `level === 'error'` literal, which OB-2 AC1 preserves as default. No test rewrite needed.
  - **sample.jsonl fixture coverage**: **NO `assistant.message.usage` blocks present**. 11 lines = attachment/assistant (text only)/user/summary/unknown_event. **OB-3 MUST author new fixture** (e.g. `sample-with-usage.jsonl`) covering Opus 4.7 + Sonnet 4.6 + Haiku 4.5 with full nested `cache_creation.ephemeral_{5m,1h}_input_tokens`. .progress.md L62 already flags this — confirmed.
  - **Validation hint adequacy**: OB-1 hint runnable as written (env var swap). OB-2 hint partially runnable (rotation trigger needs helper to write 100 lines, write a test rather than manual). OB-3 hint requires the new fixture — chicken-and-egg, fixture creation must be first task.

### Adjustment Recommendations

1. **OB-1 owner files**: extend MODIFY list for `src/analyze/index.ts` to call out **all 4 references** to `fixturePath` (L23 const + L116/150/203 usages), not just L23/L112.
2. **OB-1 AC2**: clarify behavior for the uuid-named subdir found inside `~/.claude/projects/<slug>/` — recommended: ignore (top-level only). Add as explicit AC.
3. **OB-2 owner files**: add `src/analyze/index.ts` to MODIFY list — `loadErrorEntries()` (L83-109) needs to learn the new schema fields (level/kind/payload/correlationId) OR be moved into parser.ts as part of this spec.
4. **OB-3 design**: explicit task to decide whether schema-map gains nested-field support or `assistant.usage` parsing bypasses it (e.g., dedicated `extractUsage()` in parser.ts).
5. **OB-3 fixture-creation**: hoist to first task (currently implied by AC2 only); explicitly own a new file `tests/analyze/fixtures/sample-with-usage.jsonl` with 3-model coverage.
6. **OB-2 sequencing relaxation**: note in epic that OB-2 schema/rotation work can run in parallel with OB-1 if needed (linear is recommended, not required).

### Validation Verdict: **Pass-with-adjustments**

3 specs are well-scoped, contracts hold, sizes match. 6 mechanical adjustments above (mostly owner-file precision + 1 fixture call-out + 1 design-phase question for OB-3). No structural rework needed.
