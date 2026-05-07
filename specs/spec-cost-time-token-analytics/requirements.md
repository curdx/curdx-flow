---
spec: spec-cost-time-token-analytics
epic: observability-v2 (OB-3)
phase: requirements
created: 2026-05-07
---

# Requirements: spec-cost-time-token-analytics

## Goal

curdx-flow 自身产出 cost/time/token 三级聚合 + R1-R7 报表 + 推荐文字，让用户运行 `npx curdx-flow analyze --cost-summary --by-spec --since 7d` 后能直接读到形如「spec X 的 design phase cache hit 28% 低于 30% SEV，建议提取常量到 system prompt」的可执行洞察。本 spec 是 epic `observability-v2` 的闭环 spec —— 把 OB-1 真 transcript + OB-2 三段式 correlationId 接成自优化闭环底盘。

## User Stories (US-*)

### US-1: Pricing 表可读 + 可维护
- As a curdx-flow 维护者, I want 一份硬编码 pricing 表 + README 三步刷新流程, so that 价格随 Anthropic 更新时变更可追溯且零 runtime 网络
- AC:
  - PRICING 含 Opus 4.7 / Sonnet 4.6 / Haiku 4.5 三 model × 5 字段（→ plan.md AC1）
  - pricing.ts 暴露 `LAST_UPDATED` + `SOURCE_URL` 常量（→ research §Pricing 实施要点）
  - README 三步流程：WebFetch 官方页 → diff PRICING → bump LAST_UPDATED + CHANGELOG
  - `claude-haiku-4-5` alias 解析为 `claude-haiku-4-5-20251001`

### US-2: 一行命令出 7 张报表
- As a curdx-flow 用户, I want `npx curdx-flow analyze --cost-summary` 一行命令, so that 不学新 CLI 即可看到 cost 分布
- AC:
  - 5 新 flag 全部生效：`--cost-summary` / `--by-spec` / `--by-phase` / `--by-task` / `--since`（→ plan.md AC7）
  - `--cost-summary` 默认 opt-in，不破现有默认报表行为
  - `--since 7d` 复用 filter.ts 现有时间过滤

### US-3: Spec 维度成本下钻
- As a 用户, I want R1 per-spec cost, so that 立刻知道哪个 spec 烧钱最多
- AC:
  - R1 按 spec 列 totalUSD / inputTok / outputTok / cacheHit% / runDuration（→ plan.md AC4 + AC5）
  - 用 OB-2 `<sid>:<task_idx>:<iter>` 三段式 correlationId 作 join key

### US-4: Phase 维度时长 + cost 对比
- As a 用户, I want R2 per-phase 视角, so that 识别 design phase 是否过重 / implement 是否拖
- AC:
  - R2 按 phase 列 wall-clock + cost + token（→ plan.md AC5）
  - 同一 spec 多 phase 时按 phase 顺序输出

### US-5: Task 级 hot-spot 排行
- As a 用户, I want R3 per-task + R7 top-N hot tasks, so that 锁定改 prompt 的最高 ROI 入口
- AC:
  - R3 单 task 行包含 cost / token / duration / 子 trailer 分摊（→ plan.md AC4 + AC5）
  - R7 top-N 默认 N=10，`--top` flag 调
  - subagent `<usage>` trailer 解析后挂回父 task（27.7% sidechain，研究§Trailer 已实证）

### US-6: Cache hit 可观测
- As a 用户, I want R4 cache hit rate 报表, so that 看到 prompt-caching 是否生效
- AC:
  - R4 按 scope（spec/phase/task）列 cacheRead / cacheCreate5m / cacheCreate1h / hitRate%（→ plan.md AC5）
  - hitRate 公式注释清楚：`cacheRead / (cacheRead + cacheCreate5m + cacheCreate1h)`
  - 报表脚注标注「业界基准 ≥ 60%，非 Anthropic 官方背书」（→ research §Threshold 警示 1）

### US-7: Wall-clock 分布
- As a 用户, I want R5 wall-clock 报表, so that 知道哪些 task 慢且要不要 split
- AC:
  - R5 列 p50/p95/max 按 task kind 分桶（→ plan.md AC5）
  - 引用 `attachment.hook_success.durationMs` + `turn_duration.durationMs`（→ plan.md AC2）

### US-8: Model mix 可视化
- As a 用户, I want R6 model split 报表, so that 知道 Opus 占比是否过高
- AC:
  - R6 按 model id 列 token / cost / 占比（→ plan.md AC5）
  - 含 Opus 4.7 vs 4.6 tokenizer 脚注（→ plan.md AC8 / 不强制实现归一化）

### US-9: 推荐文字可读 + 可执行
- As a 用户, I want recommend.ts 输出 8 条规则文字推荐, so that 读完知道下一步动作
- AC:
  - 8 rules 全量出（FR-RULE-1..FR-RULE-8）（→ plan.md AC6 + .progress.md Decision 3）
  - 每条 Recommendation 含 rule / severity / scope / message / evidence
  - severity 含第 4 档 `insufficient_data`（→ research §Threshold 警示 6 + 7）

### US-10: --json 结构稳定
- As a 下游脚本作者, I want `--json` 输出 R1-R7 嵌套在 `costBreakdown` key, so that 现有 7 flat section 消费者不破
- AC:
  - JSON schema 加 `costBreakdown` 一级 key 包 R1-R7（→ research §Codebase）
  - 现有 `--json` 字段保持向后兼容
  - `npx curdx-flow analyze --cost-summary --json | jq '.totalCost.usd'` 非 null（→ plan.md Validation Hint）

### US-11: Schema 向后兼容
- As a 老用户, I want 老 errors.jsonl + 老 transcript 行被新 parser 读, so that 升级不丢历史
- AC:
  - 老 errors.jsonl 行（无 level/kind/payload/correlationId）按 OB-2 默认值兜底（→ epic.md constraint #2）
  - 缺嵌套 cache_creation 字段时走默认 0（→ research §Schema map）
  - 现有 `tests/analyze/integration.test.ts` 0 修改通过

### US-12: Subagent cost 归并
- As a 用户, I want subagent 子任务 cost 归并到父 task, so that R3 数字真实
- AC:
  - `<usage>total_tokens:N\ntool_uses:N\nduration_ms:N</usage>` regex 用 `[\s\S]` 或 `\\n` 匹配（→ research §Trailer 实证）
  - sidechain row 27.7% 占比独立累加，不重复计费
  - R3 验证：父 task 数字 = 父 + 子之和（→ plan.md Validation Hint）

### US-13: MAD outlier 标记
- As a 用户, I want cost-per-task spike 用 MAD robust z-score 检出, so that 异常 task 被标红
- AC:
  - `|modified_z| > 3.5` 标 outlier（→ research §MAD）
  - n < 5 / MAD = 0 / all-equal 全部返回 `[]` 不误报（→ research §MAD edge cases）
  - n < 10 时 severity 退化为 `insufficient_data`

### US-14: README pricing 维护流程
- As a 维护者, I want 可重复的 pricing 刷新流程, so that 季度 / Anthropic 价改后零困惑更新
- AC:
  - README 列三步：WebFetch / diff / bump
  - LAST_UPDATED ≤ 90 天 by 默认每季度自检
  - CHANGELOG 同步独立 entry（→ plan.md AC10）

---

## Functional Requirements (FR-*)

### Pricing (FR-PRICING-*)

| ID | Title | Description | Source AC |
|---|---|---|---|
| FR-PRICING-1 | Static price table | `PRICING: Record<string, ModelPrice>` 含 3 model × 5 字段，倍率 0.1× / 1.25× / 2× | plan.md AC1 / research §Pricing |
| FR-PRICING-2 | Provenance constants | 暴露 `LAST_UPDATED` ISO 日期 + `SOURCE_URL` Anthropic 官方页 | research §Pricing 实施要点 |
| FR-PRICING-3 | Model alias map | `claude-haiku-4-5 → claude-haiku-4-5-20251001` 防 transcript variant | research §Pricing |
| FR-PRICING-4 | Zero runtime fetch | pricing 不发任何 HTTP；公式精度依赖确定表 | research §Pricing |

### Parser (FR-PARSER-*)

| ID | Title | Description | Source AC |
|---|---|---|---|
| FR-PARSER-1 | Usage schema map | schema-map JSON 加 `assistant.message.usage.{input/output/cache_read}_tokens` + 嵌套 `cache_creation.ephemeral_{5m,1h}_input_tokens` | plan.md AC2 / research §Schema |
| FR-PARSER-2 | Duration fields | 加 `attachment.hook_success.durationMs` + `turn_duration.durationMs` | plan.md AC2 |
| FR-PARSER-3 | Backward compat | 缺字段走默认 0；老 errors.jsonl 行不报错 | epic.md constraint #2 |
| FR-PARSER-4 | Trailer regex | `/<usage>total_tokens:(\d+)[\s\S]*?tool_uses:(\d+)[\s\S]*?duration_ms:(\d+)<\/usage>/` 命中 R3 trailer | plan.md AC4 / research §Trailer |

### Cost (FR-COST-*)

| ID | Title | Description | Source AC |
|---|---|---|---|
| FR-COST-1 | Compute formula | `(input·base + 5m·1.25·base + 1h·2·base + read·0.1·base + output·out)/1e6` USD | plan.md AC3 |
| FR-COST-2 | Precision | 单 row 计算与手算 ±0.001 USD | plan.md Validation Hint |
| FR-COST-3 | RequestId dedup | filter.ts dedup 接 requestId 去重 key | plan.md AC9 |

### Aggregation (FR-AGG-*)

| ID | Title | Description | Source AC |
|---|---|---|---|
| FR-AGG-1 | Three-level join | `aggregateBy(rows, 'spec'\|'phase'\|'task')` 用 correlationId 拆三段式 | plan.md AC4 |
| FR-AGG-2 | Subagent attribution | sidechain 行 + `<usage>` trailer 累加到父 task bucket | plan.md AC4 / research §Trailer |
| FR-AGG-3 | Trailer hit metric | R3 报表加 trailer 命中率字段（健康度可观测） | research §Trailer §反转结论 |

### Recommend Rules (FR-RULE-1..FR-RULE-8)

> 8 条全量；warn / sev 数值范围采 plan.md 草案 + research benchmarks，design 阶段最终拍板（research §Threshold 表）。第 4 severity `insufficient_data` 在 n<10 / 缺数据时触发。

| ID | Rule | warn 阈值 | sev 阈值 | Source |
|---|---|---|---|---|
| FR-RULE-1 | cache hit rate too low | < 60% | < 30% | research §Threshold #1（必须脚注非 Anthropic blessed） |
| FR-RULE-2 | output tokens/turn → split task | > 8 K | > 16 K | research §Threshold #2（Anthropic `MAX_THINKING_TOKENS=8000`） |
| FR-RULE-3 | hit-cap rate (rate-limit waste) | > 10% | > 20% | research §Threshold #3 |
| FR-RULE-4 | Opus 占比 (非 critical phase) | > 30% | > 50% | research §Threshold #4（必须 phase 分桶） |
| FR-RULE-5 | cost-per-task spike (MAD) | `\|z\| > 3.5` | — | research §Threshold #5 / §MAD |
| FR-RULE-6 | wall-clock p95 vs rolling baseline | > 1.5× | > 2× | research §Threshold #6（kind 分桶） |
| FR-RULE-7 | cache_creation/read 比 | > 1.0 | > 3.0 | research §Threshold #7 |
| FR-RULE-8 | retry/loop 同 prompt | ≥ 3 | ≥ 5 | research §Threshold #8 |

### Report (FR-REPORT-*)

| ID | Title | Description | Source AC |
|---|---|---|---|
| FR-REPORT-1 | R1-R7 七张报表 | per-spec / per-phase / per-task / cache hit / wall-clock / model split / top-N | plan.md AC5 |
| FR-REPORT-2 | costBreakdown JSON key | R1-R7 嵌套在 `costBreakdown`，不破现有 7 flat section | research §Codebase |
| FR-REPORT-3 | Recommend 文字段 | recommend 输出附在 R7 末尾或独立 section（design 决） | plan.md AC6 |
| FR-REPORT-4 | Tokenizer 脚注 | R6 末尾脚注 Opus 4.7 +35% tokens 跨模型对比慎用 | plan.md AC8 |

### CLI (FR-CLI-*)

| ID | Title | Description | Source AC |
|---|---|---|---|
| FR-CLI-1 | 5 new flags | `--cost-summary` / `--by-spec` / `--by-phase` / `--by-task` / `--since` | plan.md AC7 |
| FR-CLI-2 | --json compatibility | 现有 `--json` flag 扩字段不破老消费者 | research §Codebase |
| FR-CLI-3 | Exit code preserved | OB-1 已 ship 的 exit≠0-on-missing-transcript 行为不退化 | epic.md OB-1 AC3 |

### Fixtures (FR-FIX-*)

| ID | Title | Description | Source AC |
|---|---|---|---|
| FR-FIX-1 | sample-with-usage.jsonl | 3 model × ≥1 行嵌套 usage + sidechain + trailer | plan.md AC0 |
| FR-FIX-2 | CHANGELOG entry | 独立 OB-3 段落 | plan.md AC10 |

---

## Non-Functional Requirements (NFR-*)

| ID | Title | Description | Source |
|---|---|---|---|
| NFR-1 | Cost precision | 单 row 计算与手算误差 ≤ ±0.001 USD | plan.md Validation Hint |
| NFR-2 | Aggregation perf | n ≤ 1000 buckets 下 MAD O(n log n) 毫秒级；100MB transcript stream-friendly | research §Feasibility |
| NFR-3 | Local-first | 零 phone-home，pricing 不 runtime fetch | epic.md constraint #3 |
| NFR-4 | Zero npm runtime deps | pricing / cost / recommend / MAD 全自家 | epic.md constraint #4 |
| NFR-5 | NEVER-throw | recommend / cost 异常吞掉走默认值，继承 OB-2 契约 | epic.md OB-2 NFR-9 |
| NFR-6 | Schema backward compat | 老 errors.jsonl 缺 4 字段行能被新 parser 读 | epic.md constraint #2 |
| NFR-7 | Redaction | payload 走 redact D-9 white-list；cost 数值字段无 PII | research §Codebase |
| NFR-8 | README freshness | LAST_UPDATED ≤ 90 天 by 季度自检 + 每次价格刷新 | research §Pricing 实施要点 |
| NFR-9 | Exit codes preserved | OB-1 missing-transcript 仍 exit 1 | epic.md OB-1 AC3 |
| NFR-10 | Severity 4 档 | info / warn / sev / insufficient_data 四档不混淆 | research §Threshold 警示 7 |

---

## Glossary

- **correlationId 三段式**: `<session_id>:<task_idx>:<iter>`，OB-2 `buildCorrelationId()` 产出，作 task-level join key
- **MAD modified z-score**: `0.6745 × (x - median) / median(|x - median|)`，`|z| > 3.5` 标 outlier；50% breakdown vs IQR 25%
- **cache_creation 5m / 1h**: Anthropic prompt-caching 两档 TTL；写入计费 1.25× / 2× base，读 0.1× base
- **sidechain**: Claude Code subagent 跑在独立链路的 transcript 行；本机 27.7% 占比（research §Trailer 实证）
- **schema-map advisory fields**: `transcript-events.json` 的 `fields` 数组当前 advisory only，加项 zero-risk
- **R1-R7**: per-spec cost / per-phase / per-task / cache hit / wall-clock / model split / top-N hot tasks 七张报表
- **costBreakdown**: `--json` 输出新一级 key，嵌套 R1-R7，与现有 7 flat section 平级
- **insufficient_data**: 第 4 severity；MAD n<10 / 缺数据时使用，区分「看起来 OK」和「算不出」

---

## Out of Scope (with rationale)

- ❌ 云端上报 / phone-home — epic.md constraint #3「永远本地优先」
- ❌ Grafana / Prometheus 接入 — analyze CLI 即终端
- ❌ Real-time streaming — analyze 是 cold-read CLI
- ❌ Cross-tokenizer 历史归一化强制实施 — 仅 R6 脚注（plan.md AC8）
- ❌ Opus 4.7 vs 4.6 +35% tokens 自动归一化 — 跨 model 对比明确 disclaim 不可比
- ❌ LLM-based 推荐文字生成 — 8 threshold rule 文字模板足够 MVP
- ❌ Web UI / `analyze --html` — 不在 epic 范围内
- ❌ Multi-user / team rollup — 单 user 单 cwd

---

## Dependencies

- **OB-1 spec-analyze-real-transcript** ✅ — `transcript-path.ts` 提供绝对路径解析，cost.ts 复用
- **OB-2 spec-decision-event-logging** ✅ — `<sid>:<task_idx>:<iter>` 三段式 correlationId + 4-field events.jsonl，AC4 join key
- **plugin-observability** — 共享 redact / state file 路径 `~/.claude/curdx-flow/observability-state.json`

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Anthropic transcript schema 变更 | LOW | HIGH | schema-map advisory + 缺字段默认 0 + schema-version 探测 warn |
| Pricing 价格漂移 | MED | MED | LAST_UPDATED 常量 + README 三步流程 + 季度自检 |
| Trailer regex 误匹配跨行 | LOW | MED | 用 `[\s\S]*?` 非贪婪 + `\\n` escape；测试用 681 真样本采样 |
| Recommend rule 误报扰民 | MED | MED | severity 4 档 + warn 以下不打扰 + env var 关闭单 rule |
| MAD n<10 数值不稳 | MED | LOW | severity 退化 `insufficient_data`，不出 sev/warn |
| isSidechain 重复计费 | LOW | MED | sidechain 独立累加 + 父 task trailer 校验测 R3 = 父+子 |
| Opus 4.7 tokenizer 跨期对比 | MED | LOW | R6 脚注；不强制归一化（out-of-scope） |
| `--json` 字段命名碰撞 | LOW | MED | `costBreakdown` 一级 key 隔离；现有 7 flat section 不动 |

---

## Validation Hints

> 直接来自 plan.md Validation Hint：

- 喂 fixture 3 model 行 → cost.ts 输出与手算 ±0.001 USD
- 强造 cache_read=0 / cache_write=80 / read=20 → R4 cache hit 触发 recommend SEV
- subagent `<usage>` trailer 加父 task → R3 per-task 数字 = 父 + 子之和
- **Runnable**: `npx curdx-flow analyze --cost-summary --json | jq '.totalCost.usd' | xargs -I{} test "{}" != "null"` pass

## Unresolved Questions

> 全留 design 阶段定，requirements 不锁：

- R 报表 markdown 锚点命名（`## Cost Breakdown` vs `## Cost & Token Analytics`）
- recommend 文字位置（R7 末尾 / R8 独立 / 内联 scope）
- `--since` 默认值（all-time vs 7d）
- recommend 8 rule 是否合并 / 替换草案 6（research 建议补足为 8，design 拍板编排）
- R6 model 占比基准是 token 还是 cost

## Next Steps

1. 进入 `/curdx-flow:design` 阶段，把 8 rule warn/sev 数字最终落定 + R 报表锚点 + recommend 位置
2. design 阶段定 `REC_THRESHOLDS` 集中常量便于未来调
3. design 完成后 `/curdx-flow:tasks` 生成 12-18 任务，Task 0 = sample-with-usage.jsonl 前置
