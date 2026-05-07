---
spec: spec-cost-time-token-analytics
epic: observability-v2
phase: triage
created: 2026-05-07
---

# Plan: spec-cost-time-token-analytics

> Epic: [`specs/_epics/observability-v2/epic.md`](../_epics/observability-v2/epic.md)
> 闭环 spec — cost/time/token 三级聚合 + R1-R7 报表 + 推荐引擎 = curdx-flow 自优化底盘。

## Goal

`npx curdx-flow analyze --cost-summary --by-spec --since 7d` 后看到 R1-R7 七张报表 + 推荐文字（如"spec X design phase cache hit 28% 低于 30% SEV，建议提取常量到 system prompt"）。

## Pre-Task (Task 0)

创建 `tests/analyze/fixtures/sample-with-usage.jsonl` —— Opus 4.7 + Sonnet 4.6 + Haiku 4.5 各 ≥ 1 行带完整嵌套 usage（input / output / cache_read / `cache_creation.ephemeral_5m_input_tokens` / `cache_creation.ephemeral_1h_input_tokens`）。

> ⚠️ 现有 sample.jsonl **0 个 usage block** —— cost.ts 单测无法复用它。前置任务必须先交付。

## Acceptance Criteria

- AC0: 新 fixture 存在 + 3 model 各 ≥1 行带完整嵌套 usage
- AC1: pricing.ts 含 3 model × 5 字段 + README 修订流程
- AC2: parser.ts schema-map 扩 `assistant.message.usage` 全 6 字段（含嵌套）+ `attachment.hook_success.durationMs` + `turn_duration.durationMs`
- AC3: cost 公式 `(input·base + 5m·1.25·base + 1h·2·base + read·0.1·base + output·out)/1e6`，单测覆盖 3 model
- AC4: 三级聚合 task / phase / spec — 用 OB-2 correlationId 作 join key；subagent `<usage>` trailer R1 regex 解析分摊
- AC5: R1-R7 报表（R1 per-spec cost / R2 per-phase / R3 per-task / R4 cache hit / R5 wall-clock / R6 model split / R7 top-N hot tasks）
- AC6: recommend.ts 含 6-8 threshold rules + robust z-score MAD outlier；输出文字推荐
- AC7: CLI 5 新 flag：`--cost-summary` / `--by-spec` / `--by-phase` / `--by-task` / `--since`
- AC8: Opus 4.7 vs 4.6 tokenizer 归一化报表脚注（脚注提醒，不强制实现）
- AC9: requestId 去重接入 filter.ts dedup
- AC10: CHANGELOG 独立 entry

## Size

M（12-18 任务，14 目标）

## Dependencies

- **OB-2** spec-decision-event-logging（强依赖：cost.ts 三级聚合用 correlationId 作 join key；缺则 AC4 降级 ts-proximity heuristic）

## Out of Scope

- Opus 4.7 vs 4.6 tokenizer 归一化（+35% tokens 差异）—— 报表脚注提醒，跨模型对比明确 disclaim 不可比

## Interface Contract

```typescript
// src/analyze/pricing.ts (NEW)
export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadMul: number;
  cache5mWriteMul: number;
  cache1hWriteMul: number;
}
export const PRICING: Record<string, ModelPrice>;

// src/analyze/cost.ts (NEW)
export interface UsageRow {
  ts: string; requestId: string; model: string;
  inputTokens: number; outputTokens: number;
  cacheReadTokens: number;
  cacheCreate5mTokens: number; cacheCreate1hTokens: number;
  correlationId?: string;     // <sid>:<task>:<iter> from OB-2
}
export function computeCost(row: UsageRow): number;
export function aggregateBy(
  rows: UsageRow[],
  level: 'spec' | 'phase' | 'task'
): AggregateBucket[];

// src/analyze/recommend.ts (NEW)
export interface Recommendation {
  rule: string;
  severity: 'info' | 'warn' | 'sev';
  scope: { spec?: string; phase?: string; task?: string };
  message: string;
  evidence: Record<string, unknown>;
}
export function recommend(buckets: AggregateBucket[]): Recommendation[];
```

## Owner Files

- NEW `src/analyze/pricing.ts`
- NEW `src/analyze/cost.ts`
- NEW `src/analyze/recommend.ts`
- MODIFY `src/analyze/parser.ts` (usage schema map)
- MODIFY `src/analyze/report.ts` (R1-R7)
- MODIFY `src/analyze/filter.ts` (requestId dedup)
- MODIFY `src/analyze/index.ts` (5 CLI flags)
- MODIFY `src/analyze/types.ts`
- NEW `tests/analyze/pricing.test.ts`
- NEW `tests/analyze/cost.test.ts`
- NEW `tests/analyze/recommend.test.ts`
- MODIFY `tests/analyze/integration.test.ts` (R1-R7 snapshot)
- NEW `tests/analyze/fixtures/sample-with-usage.jsonl` (Task 0 交付物)
- MODIFY `CHANGELOG.md`

## Validation Hint

- 喂 fixture 3 model 行 → cost.ts 输出与手算 ±0.001 USD
- 强造 cache_read=0 / cache_write=80 / read=20 → R4 cache hit 触发 recommend SEV
- subagent `<usage>` trailer 加父 task → R3 per-task 数字 = 父 + 子之和
- **Runnable**: `npx curdx-flow analyze --cost-summary --json | jq '.totalCost.usd' | xargs -I{} test "{}" != "null"` pass

## Notes from Triage

- **biggest validation risk**: cost 公式 ±0.001 USD 精度依赖 fixture 3-model 全覆盖（Patch 1 from validation hoisted to Task 0）
- 推荐引擎 6-8 rules 阈值具体数字 design 阶段定（research 给方向，design 给数）
- isSidechain 30 样本 0 出现 — 实施时强制复核挂验收

## Related Research

- `specs/_epics/observability-v2/research.md` §Transcript schema (R1) §Best Production Analog (R2) §Validation Findings
