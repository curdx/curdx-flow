---
spec: spec-cost-time-token-analytics
epic: observability-v2 (OB-3, closing spec)
phase: tasks
created: 2026-05-07
granularity: fine
---

# Tasks: spec-cost-time-token-analytics

## Overview

OB-3 闭环 spec — 在 `src/analyze/` 现有 5-piece pipeline 上追加 3 个纯模块（pricing.ts / cost.ts / recommend.ts）+ 改 5 个现有模块，跑通 cost/time/token 三级聚合 + R1-R7 报表 + 8 rule 推荐。POC-first 5-phase 编排：Phase 0 fixture 落地（plan.md AC0 blocker）→ Phase 1 pricing+computeCost+CLI 接线达成 `jq '.totalCost.usd'` smoke 通过（**POC milestone**）→ Phase 2 trailer/aggregateBy/CLI 五 flag 完整接线 → Phase 3 单测 + integration snapshot → Phase 4 recommend 8 rule + R1-R7 渲染 + VE smoke + CI。零 npm runtime deps、NEVER-throw、向后兼容 schema、`--json` 现有 7 flat section 不破。

**POC milestone**: Task 1.7 完成时 `node dist/index.mjs analyze --cost-summary --json | jq '.totalCost.usd'` 输出非 null 数字，证明 transcript → parser → cost → 顶层 mirror 链路活通。

## Task Distribution

| Phase | 目标 | Task 数 |
|---|---|---|
| Phase 0 | sample-with-usage.jsonl fixture（AC0 blocker） | 1 |
| Phase 1 (POC) | pricing.ts + cost computeCost 基础 + CLI smoke 通 | 8 |
| Phase 2 (Refactor + Schema) | trailer / aggregateBy / 5 flag / schema-map / index.ts cost branch | 13 |
| Phase 3 (Test Coverage) | pricing/cost/recommend/integration snapshot + 兼容 | 13 |
| Phase 4 (Recommend + Quality + Final) | recommend 8 rules + report R1-R7 + CHANGELOG/README + VE + CI | 13 |
| **Total** | | **48** |

---

## Phase 0: Pre-Task Fixture (blocker)

- [x] 0.1 Create sample-with-usage.jsonl fixture
  **Do**: Create JSONL fixture with 3 model × ≥1 row 嵌套 usage + 1 sidechain row + 1 row 含 `<usage>` trailer + 1 老 schema 行（缺嵌套 cache_creation 测兼容）。脱敏自 session 5b0d961c（research §Trailer 真样本来源）。

  **Files**:
  - NEW `/Users/wdx/opc/curdx-flow/tests/analyze/fixtures/sample-with-usage.jsonl`

  **Done when**:
  - 3 行 assistant_turn：Opus 4.7 / Sonnet 4.6 / Haiku 4.5（每行带 `message.usage.{input_tokens, output_tokens, cache_read_input_tokens, cache_creation.ephemeral_5m_input_tokens, cache_creation.ephemeral_1h_input_tokens}` 全字段）
  - 1 行 `isSidechain: true` 子任务（subagent）
  - 1 行 tool_result.content[].text 含 1 个 `<usage>total_tokens:N\ntool_uses:N\nduration_ms:N</usage>` trailer block（research §Trailer JSON-escape 实证用 `\n` 转义形式）
  - 1 行老 schema（缺 `cache_creation` 嵌套，仅顶层 `cache_creation_input_tokens`）— 测 FR-PARSER-3 兜底
  - 所有行带 `correlationId: "<sid>:<task>:<iter>"` 三段式（OB-2 格式）
  - 文件可被 `JSON.parse` 逐行解析
  - 引用：design.md §Test Strategy fixture / FR-FIX-1 / AC0

  **Verify**: `node -e "const fs=require('fs');const lines=fs.readFileSync('/Users/wdx/opc/curdx-flow/tests/analyze/fixtures/sample-with-usage.jsonl','utf8').trim().split('\n');console.log('rows='+lines.length);lines.forEach((l,i)=>JSON.parse(l));console.log('all-valid-json')"`

  **Commit**: `test(analyze): add sample-with-usage.jsonl fixture for OB-3 cost pipeline`

---

## Phase 1: Make It Work (POC)

> 目标：跑通 `analyze --cost-summary --json | jq '.totalCost.usd'` 非 null。允许硬编码、跳过 trailer、跳过 aggregateBy 三级聚合，单层 totalCost 即可。

- [x] 1.1 Add UsageRow + AggregateBucket + Severity + Recommendation types
  **Do**: 在 types.ts 加 `UsageRow` / `AggregateBucket` / `Severity` / `Recommendation` interface + `Options.costSummary?` / `Options.bySpec?` / `Options.byPhase?` / `Options.byTask?` / `Options.top?` 扩；`StateFile` 加 `lastCostSummary?: boolean`。

  **Files**:
  - MODIFY `/Users/wdx/opc/curdx-flow/src/analyze/types.ts`

  **Done when**:
  - 4 新 interface 与 design.md §Interface Contract 完全一致
  - `Options` 扩 5 字段全 optional
  - `StateFile.lastCostSummary?: boolean` 加成
  - `tsc --noEmit` 通过
  - 引用：design.md §Components #8 types.ts / FR-CLI-1

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npx tsc --noEmit && grep -E "UsageRow|AggregateBucket|Severity|Recommendation|costSummary|lastCostSummary" src/analyze/types.ts | wc -l | xargs -I{} test {} -ge 8`

  **Commit**: `feat(analyze): add UsageRow + AggregateBucket + Recommendation types`

- [x] 1.2 [P] Create pricing.ts with PRICING + alias + LAST_UPDATED
  **Do**: 创建 pricing.ts 含 `PRICING` 三 model × 5 字段（Opus 4.7 / Sonnet 4.6 / Haiku 4.5），`MODEL_ALIASES` 含 `claude-haiku-4-5 → claude-haiku-4-5-20251001`，`LAST_UPDATED = '2026-05-07'`，`SOURCE_URL`，`resolveModelId(s)` 函数。

  **Files**:
  - NEW `/Users/wdx/opc/curdx-flow/src/analyze/pricing.ts`

  **Done when**:
  - 三 model 价格与 design.md §Components #1 表格逐字段一致（Opus inputPerMTok=5/outputPerMTok=25 / Sonnet 3/15 / Haiku 1/5；三者 cacheReadMul=0.1/cache5mWriteMul=1.25/cache1hWriteMul=2）
  - `resolveModelId('claude-haiku-4-5')` 返回 `'claude-haiku-4-5-20251001'`
  - `resolveModelId('unknown-model')` 返回 `undefined`
  - `LAST_UPDATED` ISO 字符串
  - 零 import 外部 npm dep
  - 引用：FR-PRICING-1 / FR-PRICING-2 / FR-PRICING-3 / FR-PRICING-4 / AC1

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npx tsc --noEmit && node --input-type=module -e "import('./src/analyze/pricing.ts').catch(()=>1); /* tsc 已校验 */"`（实际：`grep -E "claude-opus-4-7|claude-sonnet-4-6|claude-haiku-4-5-20251001|MODEL_ALIASES|LAST_UPDATED|resolveModelId" src/analyze/pricing.ts | wc -l | xargs -I{} test {} -ge 6`）

  **Commit**: `feat(analyze): add pricing.ts with 3 model × 5 field static table`

- [x] 1.3 [P] Create cost.ts skeleton with computeCost basic formula
  **Do**: 创建 cost.ts 含 `computeCost(row: UsageRow): number` 单 row USD 公式 + `extractUsageRowsFromEvents(events, errorEntries)` 主路径（仅 assistant_turn payload，不接 trailer）。零 throw，缺字段走 `?? 0`。返回值 4 位小数 round。

  **Files**:
  - NEW `/Users/wdx/opc/curdx-flow/src/analyze/cost.ts`

  **Done when**:
  - `computeCost` 公式：`(input·base + 5m·1.25·base + 1h·2·base + cacheRead·0.1·base + output·out) / 1_000_000` rounded to 4 decimals
  - `extractUsageRowsFromEvents(events, errorEntries)` 仅扫 `assistant_turn` event，从 `payload.message.usage` 嵌套读，缺字段 ?? 0
  - import pricing.ts 的 `PRICING` + `resolveModelId`
  - unknown model → skip row（不抛）
  - 引用：FR-COST-1 / FR-COST-2 / NFR-1 / NFR-5 / NFR-9 / AC3

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npx tsc --noEmit && grep -E "computeCost|extractUsageRowsFromEvents|cacheReadMul|inputPerMTok" src/analyze/cost.ts | wc -l | xargs -I{} test {} -ge 4`

  **Commit**: `feat(analyze): add cost.ts computeCost + extractUsageRowsFromEvents skeleton`

- [x] 1.4 [VERIFY] Quality checkpoint: typecheck + build
  **Do**: Run typecheck + build 验证 Phase 1 前 3 任务无破坏。

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npm run typecheck && npm run build`

  **Done when**: 两个命令 exit 0，dist/index.mjs 重新生成。

  **Commit**: `chore(analyze): pass quality checkpoint after types+pricing+cost skeleton` (only if fixes needed)

- [x] 1.5 Wire --cost-summary CLI flag in index.ts
  **Do**: 在 index.ts 加 `--cost-summary` flag 解析（citty）+ 默认 `false`（opt-in）。`runAnalyze` 在 `renderReport` 后插入 cost branch：调用 `extractUsageRowsFromEvents(filtered, errorEntries)` → 累加 `computeCost` → 把 `totalCost: { usd: <num> }` 写入 markdown 末尾 `## Cost Summary` 段 + `--json` 顶层 `totalCost.usd` mirror。Phase 1 暂不做 by-spec/phase/task。

  **Files**:
  - MODIFY `/Users/wdx/opc/curdx-flow/src/analyze/index.ts`

  **Done when**:
  - citty 配置含 `costSummary: { type: 'boolean', default: false }`
  - cost branch 仅在 `opts.costSummary === true` 时触发
  - `--json` 模式输出含顶层 `totalCost.usd: number`
  - 现有 7 flat section 一字未改（NFR-6）
  - exit code 不变（NFR-9）
  - 引用：FR-CLI-1 / FR-REPORT-2 / NFR-6 / Decision 2 (--since 默认 all-time 不变)

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npm run build && grep -E "costSummary|totalCost" dist/index.mjs | head -1`

  **Commit**: `feat(analyze): wire --cost-summary CLI flag with totalCost output`

- [x] 1.6 [VERIFY] Quality checkpoint: typecheck + build
  **Do**: Run typecheck + build 验证 CLI 接线无破坏。

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npm run typecheck && npm run build`

  **Done when**: 两个命令 exit 0。

  **Commit**: `chore(analyze): pass quality checkpoint after CLI wiring`

- [x] 1.7 [POC MILESTONE] Manual smoke — totalCost.usd non-null
  **Do**: Run analyze on real local transcript with `--cost-summary --json` 跑通顶层 `totalCost.usd` 非 null。验证 plan.md Validation Hint 命令。

  **Files**: (no edit — read-only smoke)

  **Done when**:
  - 命令 exit 0
  - jq 提取 `totalCost.usd` 字符串非 `"null"`
  - POC milestone 锚点：transcript → parser → cost → 顶层 mirror 链路活通
  - 引用：plan.md Validation Hint / requirements.md US-10 AC

  **Verify**: `cd /Users/wdx/opc/curdx-flow && node dist/index.mjs analyze --cost-summary --json 2>/dev/null | jq -e '.totalCost.usd != null' && echo POC_PASS`

  **Commit**: `chore(analyze): POC milestone — totalCost.usd smoke pass`

- [x] 1.8 [VERIFY] POC milestone gate
  **Do**: 确认 1.1-1.7 全 commit 到位 + POC smoke 跑通；无失败时给 spec-executor 绿灯进入 Phase 2 重构。

  **Verify**: `cd /Users/wdx/opc/curdx-flow && git log --oneline -8 | grep -E "POC|cost-summary|pricing.ts|computeCost" | wc -l | xargs -I{} test {} -ge 4 && echo PHASE1_GATE_PASS`

  **Done when**: Phase 1 8 任务全过；POC 链路证活；进入 Phase 2 重构。

  **Commit**: None

---

## Phase 2: Refactor + Schema Extension

> 目标：把 POC 最小代码扩到 design 完整接口面 — trailer regex / aggregateBy 三级聚合 / 5 CLI flag 全接 / schema-map JSON 加 6 字段 / cache discriminator。

- [x] 2.1 Extend schema-map JSON with assistant.message.usage fields
  **Do**: 改 `transcript-events.json` 给 `assistant.fields` 加 6 项：`message.model` / `message.usage.input_tokens` / `message.usage.output_tokens` / `message.usage.cache_read_input_tokens` / `message.usage.cache_creation_input_tokens` / `message.usage.cache_creation.ephemeral_5m_input_tokens` / `message.usage.cache_creation.ephemeral_1h_input_tokens`（外加现有 `attributionPlugin` / `attributionSkill`）。advisory only，零代码改动。

  **Files**:
  - MODIFY `/Users/wdx/opc/curdx-flow/plugins/curdx-flow/schemas/transcript-events.json`

  **Done when**:
  - `assistant.fields` 数组含上述 7-8 个字段名
  - JSON 仍 valid（`jq` 通过）
  - parser.ts 行为零变（design §Components #4 — payload 已全量保留）
  - 引用：FR-PARSER-1 / FR-PARSER-2 / AC2

  **Verify**: `cd /Users/wdx/opc/curdx-flow && jq -e '.assistant.fields | map(select(. == "message.usage.input_tokens" or . == "message.usage.cache_creation.ephemeral_5m_input_tokens")) | length >= 2' plugins/curdx-flow/schemas/transcript-events.json`

  **Commit**: `feat(schema-map): add assistant.message.usage 6 fields for OB-3`

- [x] 2.2 [P] Add extractTrailerUsage with regex parsing in cost.ts
  **Do**: 在 cost.ts 加 `extractTrailerUsage(text, parent): UsageRow[]` 函数，用 design-locked global 非贪婪 regex 跨行匹配 `<usage>...total_tokens...tool_uses...duration_ms...</usage>`，每命中构造 1 个 `UsageRow{source: 'subagent_trailer', outputTokens: total_tokens, inputTokens: 0, durationMs}`，继承 parent.requestId/correlationId/ts。catch 异常 → 返回 `[]`。

  **Files**:
  - MODIFY `/Users/wdx/opc/curdx-flow/src/analyze/cost.ts`

  **Done when**:
  - regex 字面量：`/<usage>[\s\S]*?total_tokens:\s*(\d+)[\s\S]*?tool_uses:\s*(\d+)[\s\S]*?duration_ms:\s*(\d+)[\s\S]*?<\/usage>/g`
  - 同 text 多 trailer 全捕（global flag）
  - trailer token 全归 outputTokens（Decision 12）
  - try/catch 包整段，异常 → 返回 []（NFR-9）
  - 引用：FR-PARSER-4 / FR-AGG-2 / Decision 1 / Decision 11 / Decision 12

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npx tsc --noEmit && grep -E "extractTrailerUsage|<usage>|total_tokens" src/analyze/cost.ts | wc -l | xargs -I{} test {} -ge 3`

  **Commit**: `feat(cost): add extractTrailerUsage with global non-greedy regex`

- [x] 2.3 [P] Wire trailer extraction into extractUsageRowsFromEvents
  **Do**: 在 cost.ts 的 `extractUsageRowsFromEvents` 加 sidechain 路径：扫 `tool_result` event（或 sidechain assistant_turn 嵌套 content），对每个 `content[].text` 字段触发 `extractTrailerUsage(text, {ts, requestId, correlationId})`，把返回的 `UsageRow[]` 与主路径 row 合并到统一数组。

  **Files**:
  - MODIFY `/Users/wdx/opc/curdx-flow/src/analyze/cost.ts`

  **Done when**:
  - 主路径（assistant_turn）+ trailer 路径（tool_result.content[].text）两路并存
  - trailer row 不重复 dedup（filter.ts 仅去 parent；trailer source 字段区分）
  - 缺 `tool_result` 不抛
  - 引用：FR-AGG-2 / Decision 11 / design §Components #2 §Subagent trailer

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npx tsc --noEmit && grep -E "tool_result|content\[|extractTrailerUsage\(" src/analyze/cost.ts | wc -l | xargs -I{} test {} -ge 2`

  **Commit**: `feat(cost): wire trailer extraction into extractUsageRowsFromEvents`

- [x] 2.4 [VERIFY] Quality checkpoint: typecheck + build + test:analyze
  **Do**: Run typecheck + build + 现有 analyze tests 验证 schema-map 改动 + trailer 路径未破现有行为（US-11 兼容）。

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npm run typecheck && npm run build && npm run test:analyze`

  **Done when**: 全 exit 0；现有 integration.test.ts 0 修改通过（NFR-6）。

  **Commit**: `chore(analyze): pass quality checkpoint after trailer wiring`

- [x] 2.5 Add aggregateBy three-level join in cost.ts
  **Do**: 在 cost.ts 加 `aggregateBy(rows, level, ctx): AggregateBucket[]` — 根据 level 用 correlationId `<sid>:<task>:<iter>` 拆段；task 维度按 correlationId 全段；phase 维度通过 `ctx.specPhaseMap[sid]` 映射；spec 维度取首段 sid。缺 correlationId → fallback `unknown` 桶。每 bucket 累加 totalUSD（renderRound 4 位）/ rowCount / trailerCount / modelMix / durationMs。

  **Files**:
  - MODIFY `/Users/wdx/opc/curdx-flow/src/analyze/cost.ts`

  **Done when**:
  - 三 level 路径 ('spec' | 'phase' | 'task') 分别 implement
  - `parseCorrelationId` 内部 helper 拆三段，缺则全 undefined
  - `modelMix[model] = { tokens, usd }` 累加
  - trailerCount 单独计数（rowCount 含 trailer + parent，trailerCount 仅 source==='subagent_trailer'）
  - 双重计费防：source 字段分桶，requestId 不去重（Decision 11）
  - 引用：FR-AGG-1 / FR-AGG-2 / FR-AGG-3 / AC4 / design §Components #2 三级聚合策略

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npx tsc --noEmit && grep -E "aggregateBy|parseCorrelationId|specPhaseMap|trailerCount" src/analyze/cost.ts | wc -l | xargs -I{} test {} -ge 4`

  **Commit**: `feat(cost): add aggregateBy three-level join with correlationId`

- [x] 2.6 Build specPhaseMap from state files in index.ts
  **Do**: 在 index.ts 用现有 `loadSpecStates()` 输出（L106-131）派生 `specPhaseMap: Record<sid, phase>` — 遍历 `~/.curdx/specs/*/.curdx-state.json` 提 `sessionId/phase` 对，喂给 `aggregateBy`。缺 state-file → 空 map（aggregate 走 unknown 桶 NFR-9）。

  **Files**:
  - MODIFY `/Users/wdx/opc/curdx-flow/src/analyze/index.ts`

  **Done when**:
  - `specPhaseMap` 在 cost branch 内构造
  - state-file 缺失或 JSON.parse 失败 → 空 map（不抛）
  - 引用：design §Components #7 runAnalyze flow / Decision 4 (phase 来源 state-file) / NFR-9

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npx tsc --noEmit && grep -E "specPhaseMap|loadSpecStates" src/analyze/index.ts | wc -l | xargs -I{} test {} -ge 2`

  **Commit**: `feat(analyze): build specPhaseMap from state files for aggregateBy`

- [x] 2.7 Wire --by-spec / --by-phase / --by-task / --top flags in index.ts
  **Do**: citty 加 4 flag (`bySpec` / `byPhase` / `byTask` 全 boolean default false；`top` number default 10)。cost branch 内根据 flag 决定调用 `aggregateBy(rows, 'spec'|'phase'|'task', {specPhaseMap})` 哪些维度；都不开 + `--cost-summary` 时全开 R1+R2+R3 + R7。`--top` 仅影响 R7 截断。

  **Files**:
  - MODIFY `/Users/wdx/opc/curdx-flow/src/analyze/index.ts`

  **Done when**:
  - 4 flag 全在 citty meta 注册
  - `bySpec/byPhase/byTask` 任一 true → 仅触发对应维度；全 false + costSummary=true → 全开
  - `top` 默认 10，应用于 R7 buckets.slice(0, top)
  - 引用：FR-CLI-1 / AC7 / design §Components #7 5 CLI flag 接线

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npm run build && grep -E "bySpec|byPhase|byTask|top" dist/index.mjs | head -1`

  **Commit**: `feat(analyze): wire --by-spec/by-phase/by-task/top CLI flags`

- [x] 2.8 [VERIFY] Quality checkpoint: typecheck + build
  **Do**: Run typecheck + build 验证 5 flag 全接线后无破坏。

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npm run typecheck && npm run build`

  **Done when**: 两个命令 exit 0。

  **Commit**: `chore(analyze): pass quality checkpoint after 5 CLI flag wiring`

- [x] 2.9 Wire cost branch JSON output costBreakdown structure
  **Do**: 在 index.ts cost branch 用 `aggregateBy` 输出构造 `costBreakdown: { R1_perSpec, R2_perPhase, R3_perTask, R7_topN, totalCost: { usd } }` 嵌入 `--json` 输出顶层。**保留** 现有 7 flat section 一字不改（plan/requirements 强约束）。顶层 `totalCost.usd` mirror 不变（Phase 1 已加）。R4/R5/R6 字段先占位空数组（report.ts Phase 4 落实）。

  **Files**:
  - MODIFY `/Users/wdx/opc/curdx-flow/src/analyze/index.ts`

  **Done when**:
  - `--json` 输出含 `costBreakdown.R1_perSpec` / `R2_perPhase` / `R3_perTask` / `R7_topN`（数组）+ `costBreakdown.totalCost.usd` (number)
  - 顶层 `totalCost.usd` 顶层 mirror 仍非 null
  - 现有 7 flat section（counters / topPlugins / topSkills / errorBuckets / unknownTypes / sample / generatedAt）一字未删
  - 引用：FR-REPORT-2 / NFR-6 / US-10 AC / Decision 3

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npm run build && node dist/index.mjs analyze --cost-summary --json 2>/dev/null | jq -e '.costBreakdown.totalCost.usd != null and .totalCost.usd != null'`

  **Commit**: `feat(analyze): emit costBreakdown JSON structure with R1/R2/R3/R7`

- [x] 2.10 Add lastCostSummary cache discriminator in StateFile
  **Do**: 在 index.ts 缓存读写处加 `lastCostSummary` 字段读写：当 `opts.costSummary` 与上次 state 中 `lastCostSummary` 不同时，bust includePrompts 缓存（避免老报表复用）。

  **Files**:
  - MODIFY `/Users/wdx/opc/curdx-flow/src/analyze/index.ts`

  **Done when**:
  - StateFile 写入含 `lastCostSummary: opts.costSummary`
  - 缓存命中条件加上 `state.lastCostSummary === opts.costSummary` 与原有 includePrompts 平级
  - 引用：design §Components #7 幂等缓存兼容

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npx tsc --noEmit && grep -E "lastCostSummary" src/analyze/index.ts | wc -l | xargs -I{} test {} -ge 2`

  **Commit**: `feat(analyze): add lastCostSummary cache discriminator`

- [x] 2.11 [VERIFY] Quality checkpoint: typecheck + build + test:analyze
  **Do**: Run 三件套验证 Phase 2 重构未破现有 integration test。

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npm run typecheck && npm run build && npm run test:analyze`

  **Done when**: 现有 integration.test.ts 0 修改通过（US-11 NFR-6 锁定）。

  **Commit**: `chore(analyze): pass quality checkpoint after Phase 2 refactor`

- [x] 2.12 Smoke verify costBreakdown + 5 flags
  **Do**: Run `analyze` 用 5 个 flag 组合验证 JSON 输出结构齐全 + R3_perTask 数组非空（前提：本地 transcript 含 assistant_turn）。

  **Files**: (no edit — smoke)

  **Done when**:
  - `--cost-summary --by-task --json | jq '.costBreakdown.R3_perTask | length'` ≥ 0
  - `--cost-summary --by-spec --json | jq '.costBreakdown.R1_perSpec | type'` 输出 `"array"`
  - 引用：US-10 / Validation Hint

  **Verify**: `cd /Users/wdx/opc/curdx-flow && node dist/index.mjs analyze --cost-summary --by-spec --by-phase --by-task --json 2>/dev/null | jq -e '.costBreakdown.R1_perSpec | type == "array"' && node dist/index.mjs analyze --cost-summary --top 5 --json 2>/dev/null | jq -e '.costBreakdown.R7_topN | type == "array"'`

  **Commit**: None

- [x] 2.13 [VERIFY] Phase 2 gate
  **Do**: 确认 2.1-2.12 全 commit；trailer regex / aggregateBy / 5 flag / specPhaseMap / costBreakdown JSON 全接好；进入 Phase 3 测试覆盖。

  **Verify**: `cd /Users/wdx/opc/curdx-flow && git log --oneline -13 | grep -cE "trailer|aggregateBy|by-spec|costBreakdown|specPhaseMap|cache discriminator|schema-map" | xargs -I{} test {} -ge 6 && echo PHASE2_GATE_PASS`

  **Done when**: Phase 2 13 任务全过；进入 Phase 3。

  **Commit**: None

---

## Phase 3: Test Coverage

> 目标：单测全覆盖（pricing × cost × recommend skeleton + integration R1-R7 snapshot），保证 ±0.001 USD 精度可证 + 老 schema 向后兼容。

- [x] 3.1 [P] Create pricing.test.ts — 3 model × 5 field + alias
  **Do**: 创建 pricing.test.ts 测：(1) 三 model 各 5 字段正确读 (Opus 4.7 / Sonnet 4.6 / Haiku 4.5)；(2) `resolveModelId('claude-haiku-4-5')` 返回 `'claude-haiku-4-5-20251001'`；(3) `resolveModelId('unknown')` 返回 undefined；(4) `LAST_UPDATED` 是 ISO 日期字符串 (≤ 90 天内)；(5) `SOURCE_URL` 含 `platform.claude.com`。

  **Files**:
  - NEW `/Users/wdx/opc/curdx-flow/tests/analyze/pricing.test.ts`

  **Done when**:
  - 5 个 vitest test case
  - 三 model × 5 字段全断言 (15 个 expect)
  - LAST_UPDATED ISO 正则 + 日期数学 (90 天内)
  - 引用：design §Test Strategy unit / AC1

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npx vitest run tests/analyze/pricing.test.ts`

  **Commit**: `test(analyze): add pricing.test.ts covering 3 model × 5 field + alias`

- [x] 3.2 [P] Create cost.test.ts — computeCost ±0.001 USD precision
  **Do**: 创建 cost.test.ts 测 `computeCost`：(1) Opus 4.7 input=1M output=1M → `$5 + $25 = $30` ±0.001；(2) Sonnet 4.6 同型 → `$3 + $15 = $18`；(3) Haiku 4.5 同型 → `$1 + $5 = $6`；(4) Opus cache_read=1M → `$0.5`（5 × 0.1）；(5) cache_5m_write=1M → `$6.25`（5 × 1.25）；(6) cache_1h_write=1M → `$10`（5 × 2.0）；(7) unknown model → 0 (skip)。

  **Files**:
  - NEW `/Users/wdx/opc/curdx-flow/tests/analyze/cost.test.ts`

  **Done when**:
  - 7 vitest test case
  - 每条用 `expect(usd).toBeCloseTo(expected, 3)` 精度 ±0.001
  - unknown model row → return 0 不抛
  - 引用：FR-COST-1 / FR-COST-2 / NFR-1 / AC3

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npx vitest run tests/analyze/cost.test.ts -t "computeCost"`

  **Commit**: `test(cost): add ±0.001 USD precision for 3 model + cache mults`

- [x] 3.3 [VERIFY] Quality checkpoint: typecheck + test:analyze
  **Do**: Run 验证两 test 文件添加后无 regression。

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npm run typecheck && npm run test:analyze`

  **Done when**: 全 exit 0；新增 pricing/cost 单测全过。

  **Status (2026-05-07, retry)**: VERIFICATION_PASS — typecheck exit 0；test:analyze 54/54 pass。pricing.test.ts 类型收窄 fix 已落 (commit b7560a9，runtime guard 替代 toBeDefined)。FR-2 streaming RSS test 在内存压力下偶发 ≥200MB（连续重跑首次可能 213MB→204MB→141MB→140MB→141MB），单独跑稳定通过；pre-existing budget 紧度问题，与本任务 fix 无关。

  **Commit**: `chore(analyze): pass quality checkpoint after pricing+cost tests`

- [x] 3.4 [P] cost.test.ts — extractTrailerUsage regex test
  **Do**: 在 cost.test.ts 加 `extractTrailerUsage` 测：(1) 1 个 trailer 命中返回 1 个 row；(2) 5 个 trailer (单 text)→ 5 row；(3) 0 trailer 返回 []；(4) 跨行 `\n` 字面 + JSON-escape `\\n` 双形式都匹配；(5) 损坏 trailer (缺 closing tag) → []，不抛。

  **Files**:
  - MODIFY `/Users/wdx/opc/curdx-flow/tests/analyze/cost.test.ts`

  **Done when**:
  - 5 个新 test case
  - Case (2) 验证 global flag（5 命中 5 row）
  - Case (4) 用真实 transcript 字面格式（参考 Task 0.1 fixture 第 N 行）
  - Case (5) 验证 NEVER-throw（NFR-9）
  - 引用：FR-PARSER-4 / FR-AGG-2 / design §Components #2 trailer regex

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npx vitest run tests/analyze/cost.test.ts -t "extractTrailerUsage"`

  **Commit**: `test(cost): add extractTrailerUsage regex 5-case coverage`

- [x] 3.5 [P] cost.test.ts — aggregateBy 3-level snapshot
  **Do**: 在 cost.test.ts 加 `aggregateBy` 测：构造 10 fake UsageRow（3 spec × 2 phase × 含 trailer + 含 unknown correlationId）→ 三 level 输出 bucket count + totalUSD + trailerCount 全断言。验证 source='subagent_trailer' 与 source='assistant' 同 requestId 不去重 (Decision 11)，分桶累加。

  **Files**:
  - MODIFY `/Users/wdx/opc/curdx-flow/tests/analyze/cost.test.ts`

  **Done when**:
  - 3 test case (一 level 一 case)
  - 缺 correlationId row → 走 'unknown' 桶
  - trailerCount 字段独立计数 trailer
  - modelMix 字段累加 token + usd
  - 引用：FR-AGG-1 / FR-AGG-2 / Decision 11 / AC4

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npx vitest run tests/analyze/cost.test.ts -t "aggregateBy"`

  **Commit**: `test(cost): add aggregateBy 3-level snapshot with trailer attribution`

- [x] 3.6 [VERIFY] Quality checkpoint: typecheck + test:analyze
  **Do**: Run 验证 cost.test.ts 8+ 测试全过。

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npm run typecheck && npm run test:analyze`

  **Done when**: 全 exit 0。

  **Commit**: `chore(analyze): pass quality checkpoint after cost.test full coverage`

- [x] 3.7 [P] Create recommend.ts skeleton (8 rules, no impl yet)
  **Do**: 创建 recommend.ts 含 `REC_THRESHOLDS` 常量（design.md §Components #3 表全数值）+ `recommend(buckets, ctx): Recommendation[]` 空骨架（返回 []）+ `findOutliers(values)` / `modifiedZScore(values)` 用 research §MAD 22-LOC 参考代码（含 MIN_N=5 short-circuit）。Phase 4 落 8 rules 实体。

  **Files**:
  - NEW `/Users/wdx/opc/curdx-flow/src/analyze/recommend.ts`

  **Done when**:
  - `REC_THRESHOLDS` 含 11 字段 (cacheHitWarn/cacheHitSev/outputTokWarn/outputTokSev/hitCapWarn/hitCapSev/opusMixWarn/opusMixSev/madZ/wallClockWarn/wallClockSev/cacheChurnWarn/cacheChurnSev/retryWarn/retrySev/madMinN)
  - `findOutliers` 实现 22-LOC MAD（research §MAD 参考），N<5 / MAD=0 / all-equal → []
  - `modifiedZScore` 暴露
  - `recommend` 占位返回 []
  - 引用：design §Components #3 / requirements §FR-RULE-1..8 / Decision 6

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npx tsc --noEmit && grep -E "REC_THRESHOLDS|findOutliers|modifiedZScore|madMinN" src/analyze/recommend.ts | wc -l | xargs -I{} test {} -ge 4`

  **Commit**: `feat(recommend): add recommend.ts skeleton + REC_THRESHOLDS + MAD`

- [x] 3.8 [P] Create recommend.test.ts — MAD 11 edge cases
  **Do**: 创建 recommend.test.ts 测 `findOutliers` / `modifiedZScore` 11 边界（research §MAD case 表）：N=0 / N=1 / N=4 / all-equal / MAD=0+outlier / 单 outlier / 多 outlier / 负 outlier / 输入不被改 (no-mutation) / N<10 / Symbol 排序稳定。

  **Files**:
  - NEW `/Users/wdx/opc/curdx-flow/tests/analyze/recommend.test.ts`

  **Done when**:
  - 11 个 test case 与 research §MAD 11 testcase 一一对应
  - no-mutation 用 `Object.freeze` 或前后 deep-equal 验证
  - 引用：design §Test Strategy / FR-RULE-5 / NFR-10

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npx vitest run tests/analyze/recommend.test.ts -t "MAD"`

  **Commit**: `test(recommend): add findOutliers 11 edge cases for MAD`

- [x] 3.9 [VERIFY] Quality checkpoint: typecheck + test:analyze
  **Do**: Run 验证 recommend skeleton + MAD 测试全过。

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npm run typecheck && npm run test:analyze`

  **Done when**: 全 exit 0。

  **Commit**: `chore(recommend): pass quality checkpoint after MAD skeleton+tests`

- [x] 3.10 Extend integration.test.ts with sample-with-usage.jsonl
  **Do**: 在 integration.test.ts 加测试组 "OB-3 cost pipeline"：用 Task 0.1 fixture 跑 `runAnalyze({costSummary: true, json: true})` → assert 输出含 `costBreakdown.R1_perSpec/R2_perPhase/R3_perTask/R7_topN` (array) + `totalCost.usd` (number > 0) + 7 现有 flat section 仍存在 (NFR-6)。**老 schema 行（缺嵌套）必须不导致 throw**（FR-PARSER-3 / US-11）。

  **Files**:
  - MODIFY `/Users/wdx/opc/curdx-flow/tests/analyze/integration.test.ts`

  **Done when**:
  - 新测试组 ≥ 5 assert
  - 老 schema 行 round-trip：filterEvents → extractUsageRowsFromEvents 不抛
  - 7 flat section（counters/topPlugins/topSkills/errorBuckets/unknownTypes/sample/generatedAt）仍出现
  - `costBreakdown.totalCost.usd` 与 `totalCost.usd` 顶层 mirror 相等
  - 引用：FR-REPORT-2 / NFR-6 / US-10 / US-11 / AC0

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npx vitest run tests/analyze/integration.test.ts -t "OB-3 cost pipeline"`

  **Commit**: `test(integration): add OB-3 cost pipeline group + backward compat`

- [x] 3.11 Add R3 trailer attribution assertion in integration
  **Do**: 在 integration.test.ts 的 OB-3 测试组加 R3 task 维度 assertion：fixture 中 trailer parent 行 + sidechain trailer 行同 correlationId → bucket.totalUSD = parent.usd + trailer.usd（plan.md Validation Hint "R3 = 父 + 子"）；trailerCount=1。

  **Files**:
  - MODIFY `/Users/wdx/opc/curdx-flow/tests/analyze/integration.test.ts`

  **Done when**:
  - 新增 assert："R3 per-task: parent + trailer cost = bucket.totalUSD"
  - trailerCount=1（trailer 命中率指标，FR-AGG-3）
  - 引用：FR-AGG-2 / FR-AGG-3 / Decision 11 / plan.md Validation Hint #3

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npx vitest run tests/analyze/integration.test.ts -t "trailer attribution"`

  **Commit**: `test(integration): assert R3 trailer attribution = parent + child`

- [x] 3.12 Add requestId dedup regression assert in integration
  **Do**: 在 integration.test.ts 加测：fixture 含两行同 requestId 不同 uuid → `filterEvents` dedup 后仅一行参与 cost；trailer 走独立 path 不受影响。验证 AC9。

  **Files**:
  - MODIFY `/Users/wdx/opc/curdx-flow/tests/analyze/integration.test.ts`

  **Done when**:
  - requestId 双行 → dedup 1 行
  - trailer 独立 path 不被 dedup
  - 引用：FR-COST-3 / AC9

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npx vitest run tests/analyze/integration.test.ts -t "requestId dedup"`

  **Commit**: `test(integration): assert requestId dedup preserves trailer path`

- [x] 3.13 [VERIFY] Quality checkpoint: typecheck + test:analyze
  **Do**: Run 验证 Phase 3 13 任务后所有测试齐绿 + 无 regression。

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npm run typecheck && npm run test:analyze`

  **Done when**: 全 exit 0；现有 + 新增测试全过。

  **Commit**: `chore(analyze): pass quality checkpoint after Phase 3 test coverage`

---

## Phase 4: Recommend + Quality + Final

> 目标：recommend 8 rules 实体落定 + report.ts R1-R7 markdown 渲染 + Recommendations 章节 + CHANGELOG/README + VE smoke + CI 全绿。

- [x] 4.1 Implement recommend.ts 8 rules
  **Do**: 在 recommend.ts 实现 8 rules + insufficient_data 第 4 档判定（design §Components #3 表）：rule-1 cache-hit-low / rule-2 output-tok-high / rule-3 hit-cap-rate / rule-4 opus-mix-high (skip critical phase) / rule-5 cost-per-task spike (MAD on bucket cost array) / rule-6 wall-clock-p95 / rule-7 cache-churn / rule-8 retry-loop。每 rule 缺数据 → severity='insufficient_data'。所有 rule try/catch 包，异常 → log via `logHookEvent({kind:'analyze_internal_error'})`。

  **Files**:
  - MODIFY `/Users/wdx/opc/curdx-flow/src/analyze/recommend.ts`

  **Done when**:
  - 8 rule 全 implement，输出 `Recommendation[]`
  - rule-4 在 phase ∈ `['critical','debug-hard','security']` 时 skip
  - rule-5 用 `findOutliers` + n<10 → `insufficient_data`
  - 每条 message 含数字 + action + scope（如 "cache hit 28% < 30% threshold; suggest extracting constants"）
  - evidence 字段含原始数字（cacheRead, write, n, etc.）
  - NEVER-throw（NFR-9）
  - 引用：FR-RULE-1..8 / NFR-5 / NFR-10 / AC6 / Decision 5 / Decision 7

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npx tsc --noEmit && grep -E "cache-hit-low|output-tok-high|hit-cap-rate|opus-mix-high|cost-per-task|wall-clock|cache-churn|retry-loop" src/analyze/recommend.ts | wc -l | xargs -I{} test {} -ge 8`

  **Commit**: `feat(recommend): implement 8 rules + insufficient_data 4th severity`

- [x] 4.2 recommend.test.ts — 8 rules × 4 severity coverage
  **Do**: 在 recommend.test.ts 加 8 rule × 4 severity (info/warn/sev/insufficient_data) ≥ 24 test case + rule-4 critical phase skip + rule-5 n<10 → insufficient_data。

  **Files**:
  - MODIFY `/Users/wdx/opc/curdx-flow/tests/analyze/recommend.test.ts`

  **Done when**:
  - 8 rule × 至少 sev/warn/insufficient_data 三档（info 仅 rule-1/4/7 必测）
  - rule-4 phase='critical' 测 skip 不 emit
  - rule-5 n=8 测 → severity='insufficient_data'（不报 sev）
  - 引用：FR-RULE-1..8 / NFR-10 / AC6

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npx vitest run tests/analyze/recommend.test.ts -t "rule"`

  **Commit**: `test(recommend): add 8 rules × 4 severity coverage`

- [x] 4.3 [VERIFY] Quality checkpoint: typecheck + test:analyze
  **Do**: Run 验证 recommend.ts 8 rule 全实现 + 测试全过。

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npm run typecheck && npm run test:analyze`

  **Done when**: 全 exit 0；recommend 测试 ≥ 30 case 全过。

  **Commit**: `chore(recommend): pass quality checkpoint after 8 rules impl`

- [x] 4.4 report.ts — R1-R7 markdown rendering + Cost Breakdown section
  **Do**: 在 report.ts 加 `renderCostBreakdown(buckets)` 渲染 markdown：插入 `## Cost Breakdown` 章节（在现有 7 flat section 之后），包含 R1-R7 子段表格（design §Components #5 列表）。R6 末尾加 tokenizer 脚注（FR-REPORT-4 / AC8）。R4 hitRate 公式注释。

  **Files**:
  - MODIFY `/Users/wdx/opc/curdx-flow/src/analyze/report.ts`

  **Done when**:
  - 7 子段 R1-R7 全渲染（表格 + 排序 + Top-N）
  - R6 末尾含 "Note: Opus 4.7 tokenizer counts ~35% more tokens..."
  - R4 含 "hitRate = cacheRead / (cacheRead + 5m + 1h)" 注释
  - R3 含 trailerHit 列（FR-AGG-3）
  - 引用：FR-REPORT-1 / FR-REPORT-4 / AC5 / AC8 / US-3..US-8

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npx tsc --noEmit && grep -E "Cost Breakdown|R1|R2|R3|R4|R5|R6|R7|tokenizer" src/analyze/report.ts | wc -l | xargs -I{} test {} -ge 8`

  **Commit**: `feat(report): render R1-R7 + Cost Breakdown section + tokenizer footnote`

- [x] 4.5 report.ts — Recommendations section with severity color coding
  **Do**: 在 report.ts 加 `renderRecommendations(recs)`：插入 `## Recommendations` 章节（紧跟 Cost Breakdown 之后）。每条按 severity 加色编码：sev → `[SEV]` 红 (`\x1b[31m`)；warn → `[WARN]` 黄；info → `[INFO]` 蓝；insufficient_data → `[N/A]` 灰 + "n=X 不足以判断" 提示。禁色环境 (`process.env.NO_COLOR`) 降级纯文本前缀。

  **Files**:
  - MODIFY `/Users/wdx/opc/curdx-flow/src/analyze/report.ts`

  **Done when**:
  - 4 severity 各对应 ANSI color
  - `NO_COLOR` 环境变量识别 → 纯前缀
  - 每条格式: `[<SEV>] <rule> @ <scope> — <message> (<evidence>)`
  - 引用：FR-REPORT-3 / NFR-10 / Decision 4 / Decision 7 / AC6

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npx tsc --noEmit && grep -E "renderRecommendations|\\[SEV\\]|\\[WARN\\]|\\[INFO\\]|\\[N/A\\]|NO_COLOR" src/analyze/report.ts | wc -l | xargs -I{} test {} -ge 5`

  **Commit**: `feat(report): add Recommendations section with severity color coding`

- [x] 4.6 index.ts — wire renderCostBreakdown + renderRecommendations + recommendations JSON
  **Do**: 在 index.ts cost branch 调用 `recommend(buckets, {criticalPhases})` → 把 `recommendations` array 写入 markdown (`renderRecommendations`) + JSON 顶层 (`recommendations: Recommendation[]`，与 costBreakdown 平级)。`criticalPhases = ['critical', 'debug-hard', 'security']` hardcode (Decision 5)。

  **Files**:
  - MODIFY `/Users/wdx/opc/curdx-flow/src/analyze/index.ts`

  **Done when**:
  - `recommend(...)` 调用接到 cost branch 末尾
  - markdown 输出含 `## Recommendations` 段（cost-summary 模式）
  - `--json` 顶层含 `recommendations: []`（与 `costBreakdown` 平级）
  - 7 flat section 仍不破
  - 引用：FR-REPORT-3 / Decision 4 / Decision 5

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npm run build && node dist/index.mjs analyze --cost-summary --json 2>/dev/null | jq -e '.recommendations | type == "array" and .costBreakdown != null'`

  **Commit**: `feat(analyze): wire recommend output into markdown + JSON`

- [ ] 4.7 [VERIFY] Quality checkpoint: typecheck + build + test:analyze
  **Do**: Run 三件套 + integration 测验证 Cost Breakdown + Recommendations 渲染齐备。

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npm run typecheck && npm run build && npm run test:analyze`

  **Done when**: 全 exit 0。

  **Commit**: `chore(analyze): pass quality checkpoint after report rendering`

- [ ] 4.8 integration.test.ts — Cost Breakdown + Recommendations snapshot
  **Do**: 在 integration.test.ts OB-3 组加 markdown snapshot：`## Cost Breakdown` + R1-R7 子标题 + R6 tokenizer footer + `## Recommendations` 段全在；`--json` `.recommendations` 数组含 ≥ 1 推荐对象（fixture cache_read=0 全 cache_write 强造 SEV）。

  **Files**:
  - MODIFY `/Users/wdx/opc/curdx-flow/tests/analyze/integration.test.ts`

  **Done when**:
  - markdown 含 "## Cost Breakdown" + "R1" + "R2" ... "R7"
  - markdown 含 "tokenizer" 脚注 (FR-REPORT-4 / AC8)
  - markdown 含 "## Recommendations"
  - JSON `.recommendations` 数组 length ≥ 1
  - 7 flat section 仍存
  - 引用：FR-REPORT-1 / FR-REPORT-3 / FR-REPORT-4 / NFR-6 / US-10 / AC5 / AC8

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npx vitest run tests/analyze/integration.test.ts -t "Cost Breakdown"`

  **Commit**: `test(integration): assert R1-R7 snapshot + Recommendations + tokenizer footer`

- [ ] 4.9 README — pricing 三步刷新流程章节
  **Do**: 在 README.md 加 `## Pricing Refresh Workflow` 章节列三步：(1) WebFetch `https://platform.claude.com/docs/en/about-claude/pricing`；(2) diff `src/analyze/pricing.ts` 中 `PRICING`；(3) bump `LAST_UPDATED` + 加 CHANGELOG entry。强调 ≤ 90 天季度自检。

  **Files**:
  - MODIFY `/Users/wdx/opc/curdx-flow/README.md`

  **Done when**:
  - 章节标题 `## Pricing Refresh Workflow`（或等价）
  - 三步全列
  - 含 `LAST_UPDATED` + CHANGELOG 提示
  - 引用：FR-PRICING-2 / NFR-8 / US-1 / US-14

  **Verify**: `cd /Users/wdx/opc/curdx-flow && grep -E "Pricing Refresh|LAST_UPDATED" README.md | wc -l | xargs -I{} test {} -ge 2`

  **Commit**: `docs(readme): add pricing 3-step refresh workflow`

- [ ] 4.10 CHANGELOG — single OB-3 entry
  **Do**: 在 CHANGELOG.md 顶部加 `## [Unreleased]` 或 `## X.Y.Z — 2026-05-07` (PATCH bump) 段，含 OB-3 单 entry：Added pricing.ts / cost.ts / recommend.ts / R1-R7 reports / 5 CLI flag / 8 recommend rules。Changed schema-map JSON adds usage fields. Note backward compat preserved.

  **Files**:
  - MODIFY `/Users/wdx/opc/curdx-flow/CHANGELOG.md`

  **Done when**:
  - 顶部新章节含 OB-3 entry
  - "Added" / "Changed" 子标题分类
  - 简短引用 design.md 章节锚点（如 R1-R7 / Decision 1-12 / 8 rules）
  - 引用：FR-FIX-2 / AC10

  **Verify**: `cd /Users/wdx/opc/curdx-flow && head -30 CHANGELOG.md | grep -cE "OB-3|cost-summary|R1-R7|recommend" | xargs -I{} test {} -ge 2`

  **Commit**: `docs(changelog): add OB-3 cost-summary entry`

- [ ] 4.11 [VE2] E2E smoke — totalCost.usd + recommendations non-null
  **Do**: Run 真实本地 transcript 跑 `--cost-summary --by-spec --by-phase --by-task --json` 验证：(1) `.totalCost.usd` 非 null；(2) `.costBreakdown.R3_perTask` 数组；(3) `.recommendations` 数组；(4) markdown 输出含 `## Cost Breakdown` + `## Recommendations`。

  **Files**: (no edit — VE smoke)

  **Done when**:
  - 4 jq 断言全过
  - exit 0
  - 引用：plan.md Validation Hint / US-10 / AC5 / AC6

  **Verify**: `cd /Users/wdx/opc/curdx-flow && node dist/index.mjs analyze --cost-summary --by-spec --by-phase --by-task --json 2>/dev/null > /tmp/ve2-out.json && jq -e '.totalCost.usd != null and (.costBreakdown.R3_perTask | type == "array") and (.recommendations | type == "array")' /tmp/ve2-out.json && node dist/index.mjs analyze --cost-summary 2>/dev/null | grep -E "## Cost Breakdown|## Recommendations" | wc -l | xargs -I{} test {} -ge 2 && echo VE2_PASS`

  **Commit**: None

- [ ] 4.12 [VE3] E2E cleanup — remove temp test artifacts
  **Do**: 删除 VE2 临时输出 + 任何测试残留 state cache。

  **Files**: (no edit — cleanup)

  **Done when**:
  - `/tmp/ve2-out.json` 删除
  - 命令 exit 0
  - 引用：references/quality-checkpoints.md VE3 模板

  **Verify**: `rm -f /tmp/ve2-out.json && test ! -f /tmp/ve2-out.json && echo VE3_PASS`

  **Commit**: None

- [ ] 4.13 [VERIFY-FINAL] Full pipeline + e2e
  **Do**: Run 完整 npm verify 套（npm run verify = typecheck + check-versions + check:hooks-fresh + build + check:bundle + test:hooks + test:analyze + check-verification-blocks）+ POC milestone smoke。

  **Verify**: `cd /Users/wdx/opc/curdx-flow && npm run verify && node dist/index.mjs analyze --cost-summary --json 2>/dev/null | jq -e '.totalCost.usd != null and (.recommendations | type == "array")' && echo VERIFY_FINAL_PASS`

  **Done when**:
  - npm verify 套全过
  - POC smoke 仍非 null
  - 8 rule recommend 输出仍 array
  - AC0-AC10 全闸通过

  **Commit**: `chore(analyze): pass full verify pipeline for OB-3`

---

## Notes

- **Phase 1 POC milestone（Task 1.7）**：transcript → parser → cost → 顶层 mirror 链路证活；允许 trailer 缺、aggregateBy 缺、recommend 缺
- **Phase 2 接齐所有接口面**（trailer / 三级聚合 / 5 flag / costBreakdown JSON / cache discriminator）
- **Phase 3 测试全覆盖**（单测 31+ case + integration ≥ 5 新 assert）
- **Phase 4 收尾**（recommend 8 rule + report 渲染 + README/CHANGELOG + VE + 全 verify）
- 零 npm runtime dep、NEVER-throw、向后兼容 schema、`--json` 7 flat section 不破 — 跨 phase 全程约束（NFR-3..6, NFR-9）
- AC0-AC10 锚点已在每任务 Done when 引用（FR/NFR/US ID + design.md / plan.md 章节锚）

## AC Coverage Map

- AC0: Task 0.1
- AC1: Task 1.2 + 3.1
- AC2: Task 2.1
- AC3: Task 1.3 + 3.2
- AC4: Task 2.2 + 2.3 + 2.5 + 3.4 + 3.5 + 3.11
- AC5: Task 4.4 + 4.8
- AC6: Task 4.1 + 4.2 + 4.5 + 4.6 + 4.8
- AC7: Task 1.5 + 2.7
- AC8: Task 4.4 (R6 tokenizer 脚注) + 4.8
- AC9: Task 3.12 (filter.ts 已就绪 0 改动；test 加 regression assert)
- AC10: Task 4.10
