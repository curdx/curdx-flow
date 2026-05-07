---
spec: spec-cost-runaway-guards
epic: superpowers-uplift
phase: requirements
created: 2026-05-07
---

# Requirements: spec-cost-runaway-guards

## Goal

为所有 autonomous loop / Stop hook 加成本护栏：StopFailure 区分（observability）、`maxGlobalIterations` / `maxTaskIterations` 真正 enforce（不再 declared-but-not-enforced）、默认 cap 收紧、cache-TTL 文档化。

## Success Criteria

- `maxGlobalIterations` / `maxTaskIterations` 在 hook + coordinator 双侧 BLOCK（不只是 stderr warn）
- 新 spec 默认 `maxGlobalIterations = 30`（旧 100 必须 explicit `--max-global-iterations 100`）
- StopFailure 8 种 matcher 全被独立 handler 捕获并记录（observability-only，不 retry）
- `cache-ttl-and-cost.md` reference 上线，明确 5min 默认 / 5-10× cost multiplier / GH#46829
- CHANGELOG 标注 default 收紧为 user-visible Changed

## Glossary

- **StopFailure** — Claude Code GA hook event；output / exit code 被忽略，仅供 observability。8 种 matcher：rate_limit / authentication_failed / oauth_org_not_allowed / billing_error / invalid_request / server_error / max_output_tokens / unknown
- **maxGlobalIterations** — state schema 字段（当前 default 100），coordinator 跨任务循环上限
- **maxTaskIterations** — state schema 字段（default 5），单任务内 retry 上限
- **Enforcement gap** — schema 声明字段但 hook only warn / coordinator 完全不读 → loop 永远不 block
- **Cache TTL trap** — Anthropic prompt caching 默认 5min；stop loop sleep > 5min = 5-10× cost multiplier（GH#46829，closed-not-planned）
- **stop_hook_active** — Stop hook payload flag；防止 Stop hook 自递归（已 GA documented）
- **Cost runaway** — autonomous loop 缺真上限导致 unattended budget burn（典型 100 iter × 2min × Opus ≈ $13+）

## Personas

### Primary: spec workflow user — protected from runaway costs

跑 `/curdx-flow:implement` 的开发者。期待：默认值就安全（30 iter ≈ 1hr ≈ $4.50 blast radius），不需要读源码也不被惊喜账单扎到。

### Secondary: power user — opt-in higher caps via CLI flag

需要长 unattended run 的高级用户。期待：能通过 `--max-global-iterations 100` 显式拉高、CHANGELOG 写清楚迁移路径、现有 state 文件不被破坏。

## User Stories

### US-1: maxGlobalIterations 在 hook 真 BLOCK

**As a** spec workflow user
**I want to** loop 跑到 globalIteration cap 时 hook 真返回 block decision
**So that** loop 不会因为 stderr warn 被 model 忽略而继续烧钱

**AC:**
- [ ] AC-1.1: `globalIteration >= maxGlobalIterations` 时 stop-watcher 返回 `{decision: "block", ...}`（非仅 stderr warn）
- [ ] AC-1.2: block reason 文本包含当前值与 cap 值
- [ ] AC-1.3: 单元测试覆盖 cap-1 / cap / cap+1 三个临界

### US-2: maxTaskIterations 在 coordinator 真 enforce

**As a** spec workflow user
**I want to** 单任务 retry 次数到 cap 时 coordinator 主动停止该任务
**So that** 一个卡住的任务不会无限 retry

**AC:**
- [ ] AC-2.1: implement.md coordinator 在 retry loop 显式读 `maxTaskIterations`
- [ ] AC-2.2: `taskIteration >= maxTaskIterations` 时 coordinator 标记任务 failed 并退出 retry
- [ ] AC-2.3: stop-watcher 也检 task-level cap，作为最后一道闸（defense in depth）

### US-3: 默认 cap 收紧 100 → 30

**As a** new spec creator
**I want to** 新建 spec 默认 maxGlobalIterations = 30
**So that** 默认 blast radius ≤ ~$4.50（vs 旧默认 ~$13+）

**AC:**
- [ ] AC-3.1: `spec.schema.json` default 改 30
- [ ] AC-3.2: state 初始化（new spec）写入 30
- [ ] AC-3.3: maxTaskIterations 保持 5 不变

### US-4: StopFailure handler 记录全部 8 matcher

**As a** spec workflow user
**I want to** rate_limit / billing_error 等失败被独立 handler 标记，不被混淆为 model "finished"
**So that** post-mortem 能区分"模型说完了"和"API 炸了"

**AC:**
- [ ] AC-4.1: 新 hook script `stop-failure-handler.mjs` 注册到 `hooks.json` 的 `StopFailure` event
- [ ] AC-4.2: 8 个 matcher 全部走独立 stderr 标签（含 `[StopFailure:<matcher>]` 前缀）
- [ ] AC-4.3: handler 实现于独立文件 `src/hooks/stop-failure-handler.ts`，不入 stop-watcher.ts（903 LOC 已超大）
- [ ] AC-4.4: handler observability-only — 不影响 stop / retry decision

### US-5: cache-ttl-and-cost.md reference 上线

**As a** power user planning long-running loops
**I want to** 一个权威 reference 解释 cache TTL 默认 5min 与 cost 关系
**So that** 我能主动 opt-in `ttl: "1h"` 或缩短 sleep 间隔

**AC:**
- [ ] AC-5.1: 新文件 `plugins/curdx-flow/references/cache-ttl-and-cost.md`
- [ ] AC-5.2: 内容包含：5min 默认 / 1h opt-in / cache-read 0.1× / cache-write 1.25×(5m) 或 2×(1h) / 引用 GH#46829 / 引用 17.1% 多付费实测
- [ ] AC-5.3: 明确"stop loop sleep > 5min = 5-10× cost multiplier"

### US-6: CLI flags via implement.md

**As a** power user
**I want to** 通过 `/curdx-flow:implement --max-global-iterations 100 --max-task-iterations 3` 调整 cap
**So that** 不修改 state 文件即可临时提升或降低上限

**AC:**
- [ ] AC-6.1: implement.md 复用现有 flag-parsing 模式（L42-47/L73-78），不新增 top-level `curdx-flow implement` CLI subcommand
- [ ] AC-6.2: flag 值合并入 state（写入 `.curdx-state.json`）
- [ ] AC-6.3: flag 显式高于 / 低于 schema default 时正常生效

### US-7: 现有 state 向后兼容

**As a** existing user with state.maxGlobalIterations = 100
**I want to** 升级到新版本后我的 state 仍按 100 跑
**So that** 升级不破坏正在跑的 spec

**AC:**
- [ ] AC-7.1: state 已存在 `maxGlobalIterations` 字段时直接用该值（不被新 default 30 覆盖）
- [ ] AC-7.2: state 缺字段时填新 default 30
- [ ] AC-7.3: smoke 测试覆盖两种 state 形态

### US-8: stop-failure-handler 单元测试

**As a** maintainer
**I want to** 5 个单元测试覆盖 8 matcher
**So that** matcher 增减或拼写错误能被 CI 抓到

**AC:**
- [ ] AC-8.1: 新文件 `tests/hooks/stop-failure-handler.test.ts`
- [ ] AC-8.2: 5 cases 至少覆盖 rate_limit / billing_error / max_output_tokens / unknown / 缺失 matcher（fall-through）
- [ ] AC-8.3: 验证 stderr 输出包含 matcher 标签 + handler 不影响退出码

### US-9: max-iter enforcement 集成测试

**As a** maintainer
**I want to** 2-3 测试验证 cap 触发时真 block
**So that** 回归 enforcement gap 立即可见

**AC:**
- [ ] AC-9.1: stop-watcher.test.ts 加 globalIteration cap 边界 case
- [ ] AC-9.2: stop-watcher.test.ts 加 taskIteration cap 边界 case
- [ ] AC-9.3: 至少一个 coordinator-side 测试（implement.md flow）证明 retry loop 在 cap 退出

### US-10: CLI flag propagation 测试

**As a** maintainer
**I want to** 测试覆盖 `--max-global-iterations` 写入 state
**So that** flag parsing 回归立即可见

**AC:**
- [ ] AC-10.1: 1-2 case 验证 flag → state.maxGlobalIterations
- [ ] AC-10.2: 验证不传 flag 时 state 沿用 schema default 30

### US-11: cache-ttl 文档 drift 测试

**As a** maintainer
**I want to** drift test 守护 references/cache-ttl-and-cost.md 关键事实
**So that** 文档不被静默改坏

**AC:**
- [ ] AC-11.1: 新 `tests/runner/cache-ttl-doc.test.ts`
- [ ] AC-11.2: 断言文档包含 "5 minute"、"GH#46829"、"5-10×"（或等价）三关键 token

### US-12: CHANGELOG 条目

**As a** user reading release notes
**I want to** 默认 cap 收紧 + StopFailure handler + cache-ttl 文档明确入 CHANGELOG
**So that** 升级前知道有一处 user-visible 行为变化

**AC:**
- [ ] AC-12.1: CHANGELOG.md 新版本节有 Added / Changed / Fixed 三块
- [ ] AC-12.2: Changed 段落明确写 "maxGlobalIterations default 100 → 30"
- [ ] AC-12.3: Added 段落列 StopFailure handler + cache-ttl reference

## Functional Requirements

### FR-Hook (StopFailure handler)

| ID | Requirement | Priority | AC |
|----|-------------|----------|-----|
| FR-H1 | 注册 `StopFailure` event 到 `plugins/curdx-flow/hooks/hooks.json` | High | hooks.json 含 StopFailure entry |
| FR-H2 | 新 source `src/hooks/stop-failure-handler.ts`（独立 file，不入 stop-watcher.ts） | High | 文件存在 + 不超 200 LOC |
| FR-H3 | 8 matcher 全枚举处理（含 `unknown` fallback） | High | 测试覆盖 |
| FR-H4 | esbuild 产出 `plugins/curdx-flow/hooks/scripts/stop-failure-handler.mjs` | High | `npm run check:hooks-fresh` 通过 |
| FR-H5 | observability-only — 不修改 exit code，不 block | High | 单元测试断言 exit 0 |

### FR-Enforce (real coordinator + hook enforcement)

| ID | Requirement | Priority | AC |
|----|-------------|----------|-----|
| FR-E1 | stop-watcher 在 cap 命中时返回 block decision（非仅 stderr） | High | 单测 |
| FR-E2 | implement.md coordinator retry loop 显式读 maxTaskIterations 并主动 break | High | 集成测试 |
| FR-E3 | implement.md coordinator 跨任务循环显式读 maxGlobalIterations 并主动 break | High | 集成测试 |
| FR-E4 | block reason 文本人类可读（含当前值 / cap / 建议 flag） | Medium | 字符串断言 |

### FR-Default (tightening)

| ID | Requirement | Priority | AC |
|----|-------------|----------|-----|
| FR-D1 | `spec.schema.json` maxGlobalIterations default 100 → 30 | High | schema diff |
| FR-D2 | maxTaskIterations default 保持 5 | High | schema diff 无变更 |
| FR-D3 | state 初始化写新 default 30（仅 new state） | High | 测试 |

### FR-Doc (cache-ttl reference)

| ID | Requirement | Priority | AC |
|----|-------------|----------|-----|
| FR-DOC1 | 新文件 `plugins/curdx-flow/references/cache-ttl-and-cost.md` | High | 文件存在 |
| FR-DOC2 | 内容含 GH#46829 / 5-10× multiplier / 17.1% 多付费 / 1h opt-in 示例 | High | drift test |

### FR-CLI (flag exposure)

| ID | Requirement | Priority | AC |
|----|-------------|----------|-----|
| FR-CLI1 | implement.md 文档化 `--max-global-iterations` flag（复用现有 parsing） | High | doc + test |
| FR-CLI2 | implement.md 文档化 `--max-task-iterations` flag | High | doc + test |
| FR-CLI3 | 不新增 top-level `curdx-flow implement` CLI subcommand | High | src/index.ts 无变 |

### FR-Compat (backwards-compat)

| ID | Requirement | Priority | AC |
|----|-------------|----------|-----|
| FR-C1 | 现有 state.maxGlobalIterations 值保留（不被新 default 覆盖） | High | smoke test |
| FR-C2 | 缺字段的旧 state 自动填充新 default 30 | Medium | smoke test |
| FR-C3 | 不引入 `CURDX_MAX_GLOBAL_ITERATIONS_LEGACY` env var（清断 + CHANGELOG note） | Medium | grep 无 env var |

### FR-Test

| ID | Requirement | Priority | AC |
|----|-------------|----------|-----|
| FR-T1 | stop-failure-handler.test.ts ≥ 5 cases | High | test count |
| FR-T2 | stop-watcher.test.ts +2 enforcement cases | High | test count |
| FR-T3 | cache-ttl-doc.test.ts drift 测试 | High | 文件存在 |
| FR-T4 | byte-equal baseline +1 entry（stop-failure-handler.mjs） | High | snapshot |
| FR-T5 | CLI flag propagation test ≥ 1-2 cases | Medium | test count |

## Non-Functional Requirements

| ID | Requirement | Metric | Target |
|----|-------------|--------|--------|
| NFR-1 | Cost reduction（real cap enforcement） | default blast radius | ≤ ~$4.50 (30 iter × 2min × Opus avg) |
| NFR-2 | Hook overhead | stop-failure-handler 执行时间 | < 30ms p95 |
| NFR-3 | Backwards-compat | 现有 state w/ maxGlobalIterations=100 | 行为不变 |
| NFR-4 | Cross-platform | macOS / Linux / Windows path semantics | hook 不引入新 fs 依赖 |
| NFR-5 | Fail-open on hook errors | StopFailure handler 抛错时 | 不阻塞用户、stderr log + exit 0 |

## Out of Scope

- Top-level `curdx-flow implement` CLI subcommand（用现有 implement.md flag pattern）
- StopFailure 自动 retry 行为（observability-only by design）
- Cache-write 1h 自动注入（用户手动 `ttl: "1h"`，文档化即可）
- Cost report 数字（精确成本估算需要 pricing data，本期不做）
- ENV var legacy 兼容 `CURDX_MAX_GLOBAL_ITERATIONS_LEGACY`（CHANGELOG note 替代）
- `.progress.md` audit trail 写入（v1 仅 stderr；progress 是 gitignored）

## Dependencies

### Internal
- **spec-verification-iron-law (✅ shipped)** — 共享 `stop-watcher.mjs` 接触面；A 已落 D5 `stop_hook_active` guard，本 spec 不重做
- **state-completion-marker (在执行)** — schema 必须先稳定，本 spec 仅调默认值不加字段，但仍要等 marker 完成

### External
- **Claude Code StopFailure event (GA)** — research R1 确认；无 feature flag opt-in
- **GH#46829 (cache TTL)** — closed-not-planned；纯文档化引用，不需要修复

## Open Questions for Design

1. **Enforcement 的"主战场"** — coordinator-side（implement.md）/ hook-side（stop-watcher）/ both？research 推荐 both（defense in depth）
2. **block decision 的 UX** — stop-watcher 返回 block 后 model 是不是仍然会 chat-reply 但停 tool？需要在 design 给出确切 hook payload 形状
3. **spec.schema.json default 改动是否触发已有 state migration** — 仅影响 new state 还是 also rewrite old state？倾向"仅 new state"
4. **byte-equal baseline 文件位置** — 复用 spec D 的 baseline directory 还是新开？
5. **stop-failure-handler stderr 格式** — 自由文本 vs JSON line 给后续 ingest？v1 倾向自由文本

## Risks

- **R1 default 收紧 user 影响** — 跑 long-running spec 的用户首次 30 iter 提前停。Mitigation：CHANGELOG 突出 + `--max-global-iterations 100` 明确 opt-in
- **R2 enforcement 过早 block** — 边界 off-by-one 或 task vs global 混淆导致正常工作被打断。Mitigation：cap-1 / cap / cap+1 三临界单测
- **R3 stop-watcher.ts 再次膨胀** — 即便分独立 file，仍有人后续 patch 时图省事塞回 stop-watcher。Mitigation：design 阶段约定 + 文件头注释标注归属
- **R4 StopFailure matcher 列表过期** — Anthropic 后续新增 matcher，`unknown` fallback 兜底但日志里看不出新名字。Mitigation：handler 直接 echo 实际 matcher 字符串，不强枚举
- **R5 cache-ttl 文档 drift** — 关键数字（5-10×、17.1%）跟随上游调整。Mitigation：drift test 守关键 token

## Validation Strategy

- **Unit**: 5 cases stop-failure-handler + 2 cases stop-watcher enforcement + 1-2 cases CLI flag prop
- **Drift**: cache-ttl doc 关键 token + byte-equal baseline +1 (stop-failure-handler.mjs)
- **Smoke**: 老 state w/ maxGlobalIterations=100 升级跑通；新 spec init 取 30
- **Manual**: 触发 fixture rate_limit StopFailure → 确认 stderr 含 `[StopFailure:rate_limit]`
- **Manual**: 跑 fixture spec w/ `--max-global-iterations 3` → 第 4 iter 必须被 block

## Next Steps

1. Coordinator approve requirements
2. 进入 design phase — 解决 "enforcement 主战场" + "block decision payload 形状" 两 open Q
3. design 后 tasks split（M size 12-18 tasks）
4. 落实施前确认 state-completion-marker (✅) 已 ship
