---
spec: spec-cost-runaway-guards
epic: superpowers-uplift
phase: research
created: 2026-05-07
researchers: [R1 stopfailure-ga, E1 loop-infra, E2 test-patterns]
---

# Research: spec-cost-runaway-guards

## Executive Summary

**关键发现 1：`StopFailure` 是 GA**（observability-only — output 和 exit code 都被忽略；不能 block，只能记录）。**8 个 matcher**：`rate_limit`, `authentication_failed`, `oauth_org_not_allowed`, `billing_error`, `invalid_request`, `server_error`, `max_output_tokens`, `unknown`。

**关键发现 2：现有 `maxGlobalIterations` / `maxTaskIterations` 是 declared but NOT enforced** — schema 有字段（默认 100/5），state 在跑，stop-watcher 读了但只 stderr warn 不 block，coordinator 完全没强制。这是真实的成本风险窗口。

**关键发现 3：cache TTL 默认从 1h 静默回退到 5min（GH#46829，closed-not-planned）**。Cache hit 是 cache-write 的 0.1×（10× 便宜），cache-write 5m=1.25× / 1h=2× 基础成本。**实测 17.1% 持续多付费**。stop loop sleep > 5min = 5-10× cost multiplier 真实。

**关键发现 4：`stop_hook_active` 已被官方文档化** — 在 hooks-guide#stop-hook-runs-forever 段，spec A 早期"undocumented"的说法已过时。spec A Task 1.5 落的 D5 guard 在 stop-watcher.ts L626-628 已是第一条件，正确无误。

**关键发现 5：30 iterations 作默认 cap 站得住脚** — ~1hr 无人值守上限、~$4.50 成本爆炸面；与 Hermes 20 / Steve Kinney 15-25 行业共识对齐。100 应保留为 `--max-iterations 100` opt-in。

stop-watcher.ts 已 903 LOC（spec A 加完后膨胀），新 StopFailure 走**独立 file** `stop-failure-handler.ts` 而非塞进同一文件，避免再膨胀。

## External Research (R1)

### `StopFailure` GA verdict — DEFINITIVE

> **GA. Observability-only.** 文档明确：output 和 exit code 都被忽略 — 这个 hook 是日志/通知用，不能 block 或重定向。`[1]`

8 matchers:
| Matcher | Trigger |
|---|---|
| `rate_limit` | Anthropic API 429 |
| `authentication_failed` | API 401 |
| `oauth_org_not_allowed` | Org-level OAuth deny |
| `billing_error` | Account billing fault |
| `invalid_request` | Malformed request from Claude |
| `server_error` | Anthropic 5xx |
| `max_output_tokens` | Hit response token limit |
| `unknown` | Catch-all |

无 `agent_type` 字段（不像 SubagentStart）。

### Cache TTL 数据

- 默认 5min；1hr 必须 explicit `ttl: "1h"` `[2][3]`
- Cache TTL 静默回退（GH#46829，closed-not-planned）— 用户必须主动 opt-in 1h `[4]`
- Cache-read = 0.1× 基础 input（10× 便宜）
- Cache-write = 1.25× (5m) / 2× (1h) 基础 input
- 实测：5min 强制下持续 17.1% 多付费 `[5]`
- **Stop loop sleep > 5min = 5-10× cost multiplier**（spec A epic research P6 已记录）

### `stop_hook_active` 文档状态更新

> **完全文档化** at `code.claude.com/docs/en/hooks-guide#stop-hook-runs-forever`，含完整 bash 早 exit 示例 `[6]`。

spec A early research 标的 "undocumented but real" 是旧资料。spec A 落 D5 guard 已正确（first conditional in handler）。

### 30 iterations 默认值依据

- Hermes 默认 20 `[7]`
- Steve Kinney 推荐 15-25 `[8]`
- 30 ~= 1hr 无人值守上限（avg 2min/任务）
- 100 ~= 3+hrs unattended，$13+ 爆炸面 — 应 opt-in
- **30 站得住脚** — ~$4.50 nominal blast radius

### CLI flag 约定

citty `args` declaration `[9]`:
```typescript
{ "max-global-iterations": { type: "number", default: 30, description: "..." } }
```
yargs 类似：`yargs.option("max-global-iterations", { type: "number", default: 30 })`.

## Codebase Analysis

### stop-watcher.ts current state (E1) — 903 LOC

| Concern | Location | Status |
|---|---|---|
| `stop_hook_active` early-exit | L626-628 | ✅ FIRST conditional (D5 from spec A correct) |
| verifyPhaseBlock gate | L444-479 (`buildVerificationBlockFailDecision`) | ✅ shipped via spec A |
| `maxGlobalIterations` check | L779-787 | ⚠️ **soft warn only** — logs stderr, does NOT block |
| `maxTaskIterations` check | (declared but unused at hook level) | ❌ **NOT enforced** by coordinator |
| StopFailure handling | (none) | NEW for this spec |

### `maxGlobalIterations` / `maxTaskIterations` enforcement gap

- **Schema `spec.schema.json`**: maxTaskIterations (default 5, L141-146); maxGlobalIterations (default 100, L153-158)
- **TS `CurdxState`**: both fields present
- **State write**: implement.md `--max-*` flags parse + merge into state at L42-47/L73-78
- **State read**: stop-watcher reads both (L773-776, L841-843); coordinator pattern doc references
- **Enforcement**: stop-watcher's check at L779-787 is `console.error("globalIteration > maxGlobalIterations")` then ALLOW STOP — does NOT block
- **Coordinator-side**: zero check; loop continues regardless of taskIteration count

**This is the real risk window**: schema declares limits, hook warns but doesn't block, coordinator doesn't even read them. Loop runs forever as long as user doesn't ctrl-C.

### CLI source `src/index.ts`

- citty framework
- Existing commands: install / uninstall / update / check
- **No `implement` command exposed at CLI top-level** — implement is a Skill/command file (`commands/implement.md`)
- Adding `--max-global-iterations` / `--max-task-iterations` flags requires:
  - Either: extend `commands/implement.md` checklist parsing (existing pattern at L42-47)
  - Or: add a thin `curdx-flow implement` CLI subcommand that injects flags into state before the Skill runs

### Test infrastructure (E2)

| Concern | Existing | New for this spec |
|---|---|---|
| stop-watcher tests | 11 cases (post-A) | +2 (max-iter enforcement scenarios) |
| stop-failure-handler tests | (none) | NEW file, 5 cases |
| max-iterations-guard | (none) | NEW file or extend existing, 2-3 cases |
| CLI flag test | tests/cli/check.test.ts | extend with 1-2 cases for new flags |
| Cache-TTL doc drift | (none) | NEW: tests/runner/cache-ttl-doc.test.ts |
| byte-equal baseline | 16+1 (after spec D) | +1 for stop-failure-handler |

Closest analog for stop-failure-handler.test.ts: `task-completed-verifier.test.ts` (243 LOC, 5 cases — secondary gate hook pattern).

## Quality Commands

Standard set + new check-verification-blocks chain (from spec A) preserved:

| Command | Use |
|---|---|
| `npm run typecheck` | TS strict |
| `npm run build:hooks` | esbuild bundle (must register stop-failure-handler entry) |
| `npm run check:hooks-fresh` | Bundle freshness gate |
| `npm run test:hooks` | All hook tests |
| `npm run verify` | Full chain |

## Related Specs

| Spec | Relevance | Relationship |
|---|---|---|
| spec-verification-iron-law (✅) | HIGH | Shares stop-watcher.mjs surface; D5 guard already correct |
| spec-bounded-parallel-dispatch (✅) | LOW | Independent |
| spec-two-stage-review (✅) | LOW | Independent |
| spec-subagent-context-reinjection (✅) | LOW | Independent |

## Feasibility Assessment

| Aspect | Assessment | Notes |
|---|---|---|
| **Technical fit** | HIGH | All seam points exist; new hook is purely additive |
| **GA verification** | HIGH | StopFailure GA confirmed; no flag opt-in needed |
| **Scope realism (M)** | HIGH | 12-18 tasks: pre-check + handler + reg + 5 tests + doc + CLI flags + max-iter enforcement + drift test + CHANGELOG |
| **Backwards compat** | HIGH | New StopFailure handler is additive; default tightening (100→30) IS a user-visible change but legitimate (current default never enforced anyway) |
| **Real cost reduction** | HIGH | Closing the actual enforcement gap (declared-but-not-enforced) is the load-bearing fix; doc + CLI flags secondary |
| **Cross-platform risk** | LOW | Pure hook code + state read; no new fs patterns |

## Recommendations for Requirements Phase

1. **Pre-check Task 0 simplifies** — runtime version warning, not spec-defer (StopFailure GA confirmed)
2. **Default tightening is non-trivial** — `maxGlobalIterations: 100 → 30` is the headline change; document migration in CHANGELOG (existing users with state.maxGlobalIterations: 100 keep their value; new specs default to 30)
3. **`maxTaskIterations` default 5 → 5** keep unchanged (5 is already a tight cap)
4. **Real enforcement** — coordinator (in commands/implement.md) AND stop-watcher must BOTH actively block when limit hit (not just warn). This is the spec's load-bearing fix.
5. **StopFailure handler in separate file** — `src/hooks/stop-failure-handler.ts` (903 LOC stop-watcher already too big to extend)
6. **Cache-TTL reference doc** — single section explaining the trap; cite GH#46829 for credibility
7. **CLI flags via existing implement.md parsing** (don't add new top-level subcommand; mirror existing `--max-task-iterations` flag pattern from L42-47)

## Open Questions for Design Phase

1. **Real enforcement surface** — coordinator-side via commands/implement.md OR stop-watcher hook-side OR both? Recommendation: BOTH (defense in depth — hook is last-mile gate, coordinator is loop-level)
2. **Default tightening backwards-compat** — ENV var override `CURDX_MAX_GLOBAL_ITERATIONS_LEGACY=1` to keep 100 default? Or pure CHANGELOG note? Recommendation: pure CHANGELOG note (no env var clutter; --max-global-iterations 100 is the explicit opt-in)
3. **StopFailure visibility** — emit stderr warning only, OR also write to `.progress.md` audit trail? Recommendation: stderr only v1; .progress.md is gitignored
4. **Cost report on excess** — should hook log estimated cost when limit hit (e.g., "burned ~$4.50 in 30 iterations")? Recommendation: NO v1 — too speculative without precise pricing data; CHANGELOG documents typical bounds

## Sources

### Web (R1, 16 sources)
- Anthropic Hooks reference, Hooks Guide, Prompt Caching blog, Agent SDK
- GH issues: #46829 (cache TTL regression), #34629, yargs#1011, citty
- Hermes / Steve Kinney / community blog posts on autonomous loop best practices

### Local repos
- `/Users/wdx/opc/curdx-flow/src/hooks/stop-watcher.ts` (903 LOC, post-A)
- `/Users/wdx/opc/curdx-flow/plugins/curdx-flow/schemas/spec.schema.json` (maxGlobalIterations L153-158, maxTaskIterations L141-146)
- `/Users/wdx/opc/curdx-flow/plugins/curdx-flow/commands/implement.md` (existing flag parsing L42-47)

### Partial research files (will be deleted post-merge)
- `.research-stopfailure-ga.md` (R1, 16 sources)
- `.research-loop-infra.md` (E1, 298 lines)
- `.research-test-patterns.md` (E2, 240 lines)
