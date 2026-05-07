---
spec: spec-cost-time-token-analytics
epic: observability-v2 (OB-3)
phase: research
created: 2026-05-07
researchers: pricing, thresholds, mad, codebase, trailer-field-check
---

# Research: spec-cost-time-token-analytics

## Executive Summary

OB-3 实施路径 **clear-go**：Anthropic 2026 三模型 5 字段定价已三方交叉验证零矛盾（`(input·base + 5m·1.25·base + 1h·2·base + read·0.1·base + output·out)/1e6` 公式精确成立）；推荐引擎 8 条规则的业界基准范围全部就位（plan.md 草案数字落在合理区间内）；MAD robust z-score 22 LOC pure-JS 参考实现 + 11 测试用例已就绪。**关键反转**：subagent `<usage>...</usage>` trailer 在本机 702 transcripts 中**真实出现 681 次**（curdx-flow 单 session 峰值 181 次），plan.md "30 样本 0 出现"是采样偏差——AC4 应**硬实现 trailer 解析，无 feature flag**。codebase 侧 src/analyze/* 是纯 pipeline 模块，schema map 声明式 JSON 安全扩、`--json` flag 已就绪、OB-1/OB-2 接口 locked in。

**Feasibility**: High | **Risk**: Low（plan.md 已锁 AC0-AC10 + interface contract，research 仅核实数据） | **Effort**: M（plan.md 14 任务目标）

---

## External Research

### Best Practices

#### Pricing — Anthropic 2026 三模型 5 字段（USD/1M tokens）

| Model | API ID（lookup key） | Input | Output | Cache Read | Cache 5m Write | Cache 1h Write |
|---|---|---|---|---|---|---|
| Opus 4.7 | `claude-opus-4-7` | $5.00 | $25.00 | $0.50 | $6.25 | $10.00 |
| Sonnet 4.6 | `claude-sonnet-4-6` | $3.00 | $15.00 | $0.30 | $3.75 | $6.00 |
| Haiku 4.5 | `claude-haiku-4-5-20251001` | $1.00 | $5.00 | $0.10 | $1.25 | $2.00 |

**倍率三方验证**（Anthropic 官方 / LiteLLM JSON / finout.io）：`cache_read = 0.1·base` / `cache_5m_write = 1.25·base` / `cache_1h_write = 2·base` 全部精确匹配，零矛盾。

**实施要点**：
- Haiku 4.5 加 alias `claude-haiku-4-5 → claude-haiku-4-5-20251001` 防御未来 transcript variant
- `claude-opus-4-7` / `claude-sonnet-4-6` 已是 snapshot ID（4.6+ 代际改成 dateless 也是 pinned），无需 alias
- pricing.ts 加常量 `LAST_UPDATED = '2026-05-07'` + `SOURCE_URL = 'https://platform.claude.com/docs/en/about-claude/pricing'`
- README 三步刷新流程：(a) WebFetch 官方页 / (b) diff PRICING / (c) bump LAST_UPDATED + CHANGELOG entry
- **不要 runtime fetch**：cost ±0.001 USD AC 依赖确定表，零网络
- Opus 4.7 新 tokenizer 同文本 +35% tokens（价格不变但 $/request 涨）— README 提示
- 长上下文 (>200K) 在 4.5+ 代际**已无溢价**，5 字段足够（不需 9 字段切档）
- 数据残留 1.1× / Fast mode 6× 暂不支持，README 明确

#### Recommendation Threshold Benchmarks（业界范围 → design 落数）

| # | Rule | warn | sev | 数据强度 |
|---|---|---|---|---|
| 1 | cache hit rate | < 60% | < 30% | 强（社区实测，**Anthropic 不公开数字目标**——必须标注非官方） |
| 2 | output tokens/turn → split | > 8 K | > 16 K | 强（Anthropic 官方 `MAX_THINKING_TOKENS=8000`） |
| 3 | hit-cap rate (rate-limit waste) | > 10% | > 20% | 中（Helicone 50/80/95 + SRE 5× baseline） |
| 4 | Opus 占比（非 critical phase） | > 30% | > 50% | 强（70/20/10 split 共识，Anthropic 模型选型指引） |
| 5 | cost-per-task spike | modified-z (MAD) > 3.5 | — | 强（Iglewicz & Hoaglin 1993） |
| 6 | wall-clock p95（kind-bucketed） | > 1.5× rolling baseline | > 2× rolling baseline | 中（多源 1.2-2× 区间） |
| 7 | cache_creation/read 比 | > 1.0 | > 3.0 | 强（Anthropic prompt-caching 失败模式 #1） |
| 8 | retry/loop 同 prompt | ≥ 3 | ≥ 5 | 强（reivo-guard / AgentSonar 默认） |

**关键警示**：
- Rule 1 cache 数字**不是 Anthropic 官方背书**，是社区实测——research.md 必须显式标注，design 阶段不能误导成 blessed 数字
- Rule 4 必须按 phase 分桶（critical phase 用 Opus 合法），否则误伤
- Rule 5 (MAD) 在 n < 10 时不稳定，recommend.ts 必须有"insufficient data"分支（4th severity 而不只是 info/warn/sev 三级）
- Rules 7-8 信号强度高于现有部分草案，建议替换或补足到 8 条配额

#### MAD Robust Z-Score — 22 LOC 参考实现（零 npm deps）

公式：`modified_z = 0.6745 × (x - median(X)) / MAD(X)` ，`MAD = median(|x_i - median|)`，`|z| > 3.5 → outlier`。

**Edge cases 全部 return `[]`**（不 fallback 到 MeanAD 以避免 std-dev 敏感性回潮）：
- `MAD = 0`（≥50% 相同）→ `[]`
- `N < 5` → `[]`（NIST 建议小样本不可靠）
- `N = 0,1` → `[]`

```ts
const MIN_N = 5; const Z_THRESHOLD = 3.5; const SCALE = 0.6745;

function median(sorted: number[]): number {
  const n = sorted.length, m = n >> 1;
  return n % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

export function modifiedZScore(values: number[]): number[] {
  if (values.length < MIN_N) return values.map(() => 0);
  const sorted = [...values].sort((a, b) => a - b);
  const med = median(sorted);
  const devs = values.map(v => Math.abs(v - med));
  const mad = median([...devs].sort((a, b) => a - b));
  if (mad === 0) return values.map(() => 0);
  return values.map(v => (SCALE * (v - med)) / mad);
}

export function findOutliers(values: number[]): number[] {
  const z = modifiedZScore(values);
  const out: number[] = [];
  for (let i = 0; i < z.length; i++) if (Math.abs(z[i]) > Z_THRESHOLD) out.push(i);
  return out;
}
```

11 个测试用例已设计（N=0/1/4 短路、all-equal、MAD=0+ outlier、单/多 outlier、负 outlier、no-mutation 断言）。

**为何 MAD over alternatives**：50% breakdown point（vs IQR 25%）；std-dev z 被 outlier 自身污染（masking）；Isolation Forest 违反 ≤30 LOC 预算。

### Prior Art

- **ccusage** (npm `ryoppippi/ccusage`)：sources pricing from LiteLLM `model_prices_and_context_window.json`；snapshot 模式（无历史价格，issue #764 acknowledged gap）；statusline 50%/80% 颜色阈值
- **Helicone**：50%/80%/95% graduated alerts；公开 cost calculator 静态页
- **Langfuse**：tag-driven attribution（OB-2 已对齐）
- **AgentGuard / AgentSonar**：runaway / cyclic-delegation thresholds（Rule 8 来源）
- **TensorMesh**："aggregate misleads" → per-stream + robust z-score（OB-3 哲学锚点）

### Pitfalls to Avoid

1. **硬编码绝对成本阈值**（"warn if task > $0.50"）— cost 任务类型差异 $0.02–$20+，必须 relative-to-baseline / per-kind-bucket
2. **standard z-score** — 重尾 + outlier 污染 std → masking；MAD 是 canonical 替代
3. **single global wall-clock 阈值** — 必须按 task kind 分桶或用 rolling baseline 比
4. **声称 Anthropic-blessed cache hit %** — 不存在；引用社区实测，不写"Anthropic 推荐 60%"
5. **Opus mix > 50% 一刀切 sev** — 必须 phase-aware（critical phase 合法）
6. **MAD with n < 10** — 数值不稳；skip with "insufficient data"
7. **三级严重度无第四档**（"unknown" / "n/a"）— 系统必须区分"看起来 OK"和"算不出来"
8. **runtime fetch 价格** — 反 cost ±0.001 USD AC 的确定性 + 反 local-first

---

## Subagent Trailer Reality Check（决策反转）

> 本节是 Decision 1 实地核验产出，**直接修订 plan.md "Notes from Triage" 关于 isSidechain 的假设**。

### Empirical Findings

| 指标 | 数值 | 来源 |
|---|---|---|
| `<usage>` 字符串总数 (~/.claude/projects/) | **681 次** | 实地 grep |
| 全 regex 匹配（含 `total_tokens:`, `tool_uses:`, `duration_ms:`） | 0（**字面换行**）/ 681（**JSON `\n` escape**） | 格式确认 |
| isSidechain=true rows | 30,454 | 实地 jq |
| isSidechain=false rows | 79,472 | 实地 jq |
| isSidechain=true 占比 | **27.7%** | 实地 |
| curdx-flow 项目 transcript 数 | 124 sessions | 实地 |
| curdx-flow 单 session 最高 trailer 出现数 | **181 次** | session 5b0d961c |
| `tests/analyze/fixtures/sample.jsonl` usage block 数 | 0（确认） | 实地 grep |

### 真实 trailer 格式（JSON-escaped 换行）

```
agentId: a3d6ee10bf811c336 (use SendMessage with to: 'a3d6ee10bf811c336' to continue this agent)
<usage>total_tokens: 85089
tool_uses: 33
duration_ms: 453327</usage>
```

存储在 `tool_result.content[].text` 字段里，换行是 `\n` 转义，regex 必须用 `[\\s\\S]` 或单行 `\\n` 匹配，不能依赖字面换行。

### 真实 `assistant.message.usage` 嵌套结构（修订 schema 假设）

```json
{
  "input_tokens": 6,
  "cache_creation_input_tokens": 25499,
  "cache_read_input_tokens": 16432,
  "output_tokens": 3288,
  "server_tool_use": { "web_search_requests": 0, "web_fetch_requests": 0 },
  "service_tier": "standard",
  "cache_creation": {
    "ephemeral_1h_input_tokens": 25499,
    "ephemeral_5m_input_tokens": 0
  },
  "inference_geo": "",
  "iterations": [ { ... } ],
  "speed": "standard"
}
```

**与 epic.md 假设的差异**：
- 嵌套 `cache_creation.ephemeral_5m/1h_input_tokens` ✓（与 epic AC2 一致）
- 顶层 `cache_creation_input_tokens` / `cache_read_input_tokens` 也存在（双层冗余）
- 新增字段：`server_tool_use` / `service_tier` / `iterations` / `speed`（OB-3 解析需 ignore，不强制 schema-map）

### 反转结论 — Decision 1 修订

| 项 | 原假设（plan.md） | 实地 | 决策 |
|---|---|---|---|
| trailer 出现 | 30 样本 0 次 | 702 文件 681 次 | **硬实现，无 feature flag** |
| isSidechain | 30 样本 0 true | 27.7% true | AC4 必须双链路（sidechain + primary）独立计费 |
| usage 嵌套 | 仅 epic 列的 5 字段 | + server_tool_use/service_tier/iterations | 解析仅取 5 必要字段，其余忽略 |

**Decision 1 (Interview) 修订**：原"feature flag default off, evidence 出现再开启"路径作废。新策略：**硬实现 trailer 解析作为 AC4 主路径**，子任务里加"trailer 命中率 metric"在 R3 报表（健康度可观测，但不影响实施）。

---

## Codebase Analysis

### Existing Patterns

`src/analyze/` 是**纯 pipeline 模块**：
- **parser.ts**（271 LOC）：JSONL 流式解析 + 增量 byte-offset bookkeeping + AsyncGenerator
- **schema map**：声明式 JSON `plugins/curdx-flow/schemas/transcript-events.json` —— **OB-3 加 usage 字段无需改 parser.ts 代码**，仅扩 JSON
- **filter.ts**：dedupe 已支持双 key (uuid|requestId)；`--since` 已就绪 —— AC9 仅需 cost.ts 复用
- **report.ts**：7 个 section（plain markdown + JSON 两种渲染） —— R1-R7 建议嵌套在 `costBreakdown` key 下保持向后兼容
- **redact.ts**：D-9 white-list passthrough（OB-2 已用，OB-3 cost 数据走数值字段无 PII 风险）
- **transcript-path.ts**（OB-1 NEW）：production-grade，返回绝对路径，index.ts 已调用
- **`--json` flag**：index.ts:307-311 **已实现**，OB-3 不发明，扩展即可

### Schema Map 加 usage 字段（AC2 落点）

`plugins/curdx-flow/schemas/transcript-events.json` 在 `assistant` 类型加 fields 数组：

```json
"assistant": {
  "action": "assistant_turn",
  "fields": [
    "attributionPlugin", "attributionSkill",
    "message.usage.input_tokens",
    "message.usage.output_tokens",
    "message.usage.cache_read_input_tokens",
    "message.usage.cache_creation.ephemeral_5m_input_tokens",
    "message.usage.cache_creation.ephemeral_1h_input_tokens"
  ]
}
```

`fields` 数组当前是 **advisory only**（parser 不强制 schema），所以是 zero-risk 加法；payload 在 parseTranscript() L221-232 已经 `payload: raw as Record<string, unknown>` 全量保留——cost.ts 直接从 payload 读嵌套字段即可。

### Dependencies

- **OB-1 transcript-path.ts** ✓ production-grade
- **OB-2 error-logger.ts** ✓ 4-field schema (level/kind/payload/correlationId) 已 live；`<sid>:<task_idx>:<iter>` 三段式 correlationId 由 `buildCorrelationId()` NEVER-throw 保证
- **filter.ts dedupe** ✓ 双 key uuid|requestId 已就绪
- **state file**：`~/.claude/curdx-flow/observability-state.json` byteOffset + caching transparent，cost 添加不影响幂等性
- **零 npm runtime deps**（hard constraint #4）：pricing 静态表 / cost 公式 / MAD 22 LOC / R1-R7 渲染全部纯 stdlib

### Constraints

- **零 npm deps** — 所有新代码自家
- **Schema-on-disk 向后兼容** — 老 errors.jsonl 行（无 level/kind/payload/correlationId）必须能被新 parser 读
- **`--json` 接口稳定** — R1-R7 嵌套在 `costBreakdown` 下，不破现有 7 个 flat section 消费者
- **Local-first** — 零 phone-home，pricing 不 runtime fetch
- **NEVER-throw** — 继承 OB-2 error-logger 契约（NFR-9）

### 不存在的 prior art（确认）

`grep -r 'computeCost\|aggregateBy\|usagePerMTok' src/` → **0 hits**。OB-3 是从零搭建。

---

## Related Specs

| Spec | Relevance | Relationship | May Need Update |
|---|---|---|---|
| spec-analyze-real-transcript (OB-1) | 高 | provides transcript path resolver — AC4 cost.ts 用 | 否（接口稳定） |
| spec-decision-event-logging (OB-2) | 高 | provides correlationId 三段式 + 4-field events.jsonl — AC4 join key | 否（接口 locked） |
| plugin-observability | 中 | 共享 redact / state file 路径 | 否 |
| spec-cost-runaway-guards | 低 | runaway loop kill 是 prevention，OB-3 是 observation；rule 8 (retry/loop) 与之概念呼应不冲突 | 否 |
| epic.md observability-v2 | 自家 | OB-3 是 epic 闭环 spec | 完成时更新 .epic-state.json status=completed（已被外部预标） |

---

## Quality Commands

| Type | Command | Source |
|---|---|---|
| typecheck | `npm run typecheck` | package.json |
| build | `npm run build` (tsup → dist/) | package.json |
| build hooks | `npm run build:hooks` (esbuild → plugins/curdx-flow/hooks/scripts/) | package.json |
| test | `npm run test` (vitest) | package.json |
| version drift gate | `npm run check-versions` (5-field gate) | scripts/check-versions.mjs |
| hooks freshness | `npm run check:hooks-fresh` | CLAUDE.md |
| dev watch | `npm run dev` (tsup watch) | package.json |
| analyze smoke | `node dist/index.mjs analyze --cost-summary --json \| jq '.totalCost.usd'` | OB-3 validation hint |

---

## Feasibility Assessment

| Aspect | Assessment | Notes |
|---|---|---|
| 技术可行性 | High | plan.md 全部接口契约 + Owner files 已锁；codebase 零 prior art 冲突 |
| 数据可获得性 | High | pricing 三方零矛盾；threshold 业界范围齐；trailer 真实存在 |
| 代码风险 | Low | 复用现有 schema-map / filter / report 架构；新增 3 文件 + 改 5 文件，影响半径有限 |
| 测试可行性 | High | Task 0 sample-with-usage.jsonl 是非可选 blocker；MAD 11 用例已设计；cost ±0.001 USD 可手算验证 |
| 性能 | Low risk | MAD O(n log n) 在 n ≤ 1000 buckets 下毫秒级；parser AsyncGenerator 流式 100MB 内 |
| 时间预算 | M（14 任务） | 与 plan.md size cap 一致 |

---

## Recommendations for Requirements

1. **保留 plan.md AC0-AC10**：业界 + codebase 全部支持，无需修订
2. **Decision 1 反转**：AC4 trailer 解析改为**硬实现**，移除 feature flag 选项；trailer 命中率纳入 R3 健康指标
3. **AC2 schema 字段**：加 `cache_creation_input_tokens` / `cache_read_input_tokens` 顶层（实地有），保留嵌套 5m/1h（实地有）；`server_tool_use` / `service_tier` / `iterations` 纳入 ignore 列表
4. **AC6 增第 4 severity**："unknown / insufficient_data"，覆盖 MAD n<10 + 缺数据场景
5. **AC6 阈值数字 design 阶段定**：保留 plan.md 草案（60%/30%/20%/8K/50%）作 baseline，design 用 research 范围微调；规则 7-8（cache_creation/read 比、retry/loop 率）补足 8 条
6. **AC1 pricing.ts 加 LAST_UPDATED + SOURCE_URL 常量**：与 README 三步流程对齐
7. **AC1 加 alias 映射**：`claude-haiku-4-5 → claude-haiku-4-5-20251001`
8. **Task 0 fixture**：sample-with-usage.jsonl 必须含 3 model × 1 主链路 + 1 sidechain 行 + 1 trailer 行（用真实 681 / 27.7% / 181 数据采样）

---

## Open Questions

全部已收敛——以下是 design 阶段唯一未决：

1. **R1-R7 报表 markdown 锚点命名**（design 决）—— `## Cost Breakdown` 还是 `## Cost & Token Analytics`？
2. **`--cost-summary` 与现有默认报表的关系**（design 决）—— 默认开启还是 opt-in flag？plan.md 例子是 opt-in (`npx ... --cost-summary`)，倾向保持 opt-in
3. **recommend.ts 输出在 R 报表的位置**（design 决）—— R7 末尾、独立 R8、还是按 spec/phase/task 内联？
4. **`--since` 默认值**（design 决）—— 不传时是 all-time 还是 7d？plan.md 例子用了 `7d` 但没说 default
5. **rule 7-8 是否替换草案 rule** 还是**补足到 8**（design 决）

---

## Sources

### Pricing
- https://platform.claude.com/docs/en/about-claude/pricing
- https://platform.claude.com/docs/en/about-claude/models/overview
- https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json
- https://www.helicone.ai/llm-cost/provider/anthropic/model/claude-haiku-4-5-20251001
- https://www.finout.io/blog/anthropic-api-pricing
- https://www.anthropic.com/news/claude-opus-4-7
- https://github.com/ryoppippi/ccusage (issue #764)

### Threshold Benchmarks
- https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching
- https://www.anthropic.com/news/prompt-caching
- https://platform.claude.com/docs/en/api/rate-limits
- https://code.claude.com/docs/en/costs
- https://code.claude.com/docs/en/model-config
- https://github.com/anthropics/claude-code/issues/24159
- https://startdebugging.net/2026/04/how-to-add-prompt-caching-to-an-anthropic-sdk-app-and-measure-the-hit-rate/
- https://www.claudecodecamp.com/p/how-prompt-caching-actually-works-in-claude-code
- https://projectdiscovery.io/blog/how-we-cut-llm-cost-with-prompt-caching
- https://ccusage.com/guide/statusline / cost-modes
- https://docs.helicone.ai/guides/cookbooks/cost-tracking
- https://langfuse.com/docs/observability/features/token-and-cost-tracking
- https://blog.sentry.io/core-kpis-llm-performance-how-to-track-metrics/
- https://dev.to/mostafa_ibrahim_774fe947b/what-is-agent-observability-...
- https://optyxstack.com/latency-serving
- https://openobserve.ai/blog/ai-anomaly-detection-guide/
- https://oneuptime.com/blog/post/2026-01-30-cost-anomaly-detection/
- https://github.com/dipampaul17/AgentGuard
- https://www.agent-sonar.com/
- https://www.sitepoint.com/claude-model-selection-framework/
- https://www.mindstudio.ai/blog/anthropic-advisor-strategy-opus-sonnet-haiku
- https://claudefa.st/blog/models/model-selection
- https://claw.ist/claude-model-selection-guide

### MAD / Robust Z-Score
- https://www.itl.nist.gov/div898/handbook/eda/section3/eda35h.htm (NIST/SEMATECH §1.3.5.17)
- https://en.wikipedia.org/wiki/Median_absolute_deviation
- https://www.statology.org/modified-z-score/
- https://aakinshin.net/posts/mad-caveats/
- https://file.scirp.org/Html/5-1240316_49309.htm
- https://en.wikipedia.org/wiki/Robust_measures_of_scale
- Iglewicz, B. & Hoaglin, D. (1993). *How to Detect and Handle Outliers*. ASQC Quality Press.

### Codebase Internal
- `/Users/wdx/opc/curdx-flow/src/analyze/index.ts` (360 LOC)
- `/Users/wdx/opc/curdx-flow/src/analyze/parser.ts` (271 LOC)
- `/Users/wdx/opc/curdx-flow/src/analyze/report.ts`
- `/Users/wdx/opc/curdx-flow/src/analyze/filter.ts`
- `/Users/wdx/opc/curdx-flow/src/analyze/types.ts`
- `/Users/wdx/opc/curdx-flow/src/analyze/transcript-path.ts` (OB-1 NEW)
- `/Users/wdx/opc/curdx-flow/src/hooks/_shared/error-logger.ts` (OB-2)
- `/Users/wdx/opc/curdx-flow/plugins/curdx-flow/schemas/transcript-events.json`
- `/Users/wdx/opc/curdx-flow/tests/analyze/fixtures/sample.jsonl` (0 usage blocks confirmed)

### Trailer Field Check (Empirical)
- 702 JSONL files scanned in `~/.claude/projects/`
- Sessions with notable trailer density: 5b0d961c (181), b694b3b4 (46), ef818602 (8), c111909e (8)
- isSidechain rows analyzed: 110K+ (30,454 true / 79,472 false)
