---
spec: spec-subagent-context-reinjection
epic: superpowers-uplift
phase: research
created: 2026-05-07
researchers: [R1 subagent-start-ga, E1 context-builder, E2 hook-tests]
---

# Research: spec-subagent-context-reinjection

## Executive Summary

**关键发现：`SubagentStart` 事件是 GA，没有 experimental flag。** 这与 spec A 的 `TaskCompleted`（Agent Teams opt-in）情况不同 — Pre-check Task 0 简化为信息性版本警告。事件可在所有 Claude Code 用户上 fire（不需要 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`）。**superpowers issue #237 已于 2026-03-10 由 maintainer CLOSED as wontfix**（"platform limitation, by design"）— 我们的 spec 填补真实空白，不是重复劳动。`SubagentStart` 输入仅有 5 字段（4 通用 + `agent_type`），不能 block，只能通过 `hookSpecificOutput.additionalContext` 注入上下文（system-reminder 通道）。`load-spec-context.ts`（226 LOC）有清晰的 3 函数结构 + canonical iron-law 1-liner ("No completion claim without fresh verification.")，提取共享 `build-context-payload.ts` 风险 LOW-MEDIUM。预估 subagent payload 100-150 字节，远低于 2KB 预算。已有完整的 `createFixtureSpec()` + `runHook()` 测试基础设施，新 hook 7 测试用例可即写即跑。

## External Research (R1)

### `SubagentStart` GA verdict — DEFINITIVE

> **GA — no env flag, no opt-in, no version gate beyond shipping in current Claude Code.**

`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` flag is for Agent Teams' `TaskCreated` / `TaskCompleted` / `TeammateIdle` events — NOT for `SubagentStart`. The agent_type field "fires for any subagent dispatch" without flag. `[1]`

### Input schema (5 fields)

| Field | Source | Notes |
|---|---|---|
| `session_id` | universal | Current session UUID |
| `transcript_path` | universal | Path to conversation JSONL |
| `cwd` | universal | Working directory |
| `hook_event_name` | universal | Always `"SubagentStart"` |
| `agent_type` | event-specific | The subagent's type (e.g., `general-purpose`, `Explore`, custom subagent type) |

(Richer fields like `agent_id`, `prompt` were proposed in FR #14859 but never shipped.)

### Output capabilities

- **Cannot block.** Observability/injection-only event. Exit 2 prints stderr but does NOT abort the subagent.
- **Can inject context via `hookSpecificOutput.additionalContext`** — the subagent receives this as a `<system-reminder>` (NOT system-prompt; that's issue #23885 closed wontfix).
- The subagent's main thread will see the system-reminder block at the start of its conversation.

### Comparison with SessionStart

| Aspect | SessionStart | SubagentStart |
|---|---|---|
| GA | yes | yes |
| Can block? | no | no |
| `additionalContext` injection | yes (parent session) | yes (subagent) |
| Payload size budget | larger (~400-550B typical) | tighter (≤2KB hard cap; 100-150B target) |
| When fires | startup / clear / compact | every Task() spawn |

### superpowers issue #237 — current state

> **CLOSED 2026-03-10 as wontfix** by maintainer ("platform limitation, by design").

Community fork (Benny-Lewis) was unmerged. Our spec is **NOT duplicating effort** — we're filling a gap superpowers won't fill. `[5][6]`

### Cost & latency

- Hook fires per subagent dispatch (~1-100x per session depending on Team API usage)
- File I/O: 1 `readFileSync(.curdx-state.json)` + 1 `readFileSync(.progress.md)` (~5-50 KB total reads)
- Acceptable budget: <30ms per fire (file system roundtrip dominant cost)
- For high-volume sessions (50+ subagent spawns): cumulative hook overhead ~1.5s — acceptable

### Recommendations for spec design

1. **PROCEED — no deferral**, no flag-gate
2. **Task 0 simplifies** to: `claude --version` + write a runtime version-check (warn if version too old to support SubagentStart, but don't fail)
3. **Hook script structure**: read stdin → load state → build minimal payload → emit `hookSpecificOutput.additionalContext` (≤2KB) → exit 0
4. **Fail-open policy**: any error (state missing, JSON parse fail, payload over budget) → emit `{continue: true}` no-op, never crash subagent

## Codebase Analysis

### Current SessionStart hook (E1)

**`src/hooks/load-spec-context.ts`** (226 LOC, 3 functions):
- `readEnabledSetting()` — reads opt-out from settings.json
- `readGoalFromProgress()` — extracts goal from .progress.md
- `loadSpecContextHandler()` — main async entry: validates stdin, resolves spec, loads state/progress, emits stderr banner + JSON payload

**Typical SessionStart payload**: 400–550 bytes (specName, phase, taskIndex, totalTasks, goal, awaitingApproval).

**Bundled output**: `plugins/curdx-flow/hooks/scripts/load-spec-context.mjs` (esbuild output, no source deviation).

### Iron-law canonical 1-liner

**Source: `plugins/curdx-flow/references/iron-law-verification.md`** (lines 8–18):
> **No completion claim without fresh verification.**

This is the canonical string. **Already centralized — ready for reuse in SubagentStart.** Long-form expansion lives in the same reference doc. Spec A's `references/iron-law-verification.md` is single-source-of-truth.

### Recommended subagent payload shape

```typescript
// SubagentStart additionalContext (~100-150 bytes)
{
  phase: "execution",
  specPath: "./specs/spec-name",
  ironLawSummary: "No completion claim without fresh verification."
}
```

Fields **excluded** from subagent payload (vs SessionStart):
- Full goal text (long, not needed for subagent's narrow task)
- .progress.md log (large, irrelevant)
- discoveredSkills (parent session only)
- Total task index / iteration counters (parent state, not subagent state)

### Extraction plan — shared lib

Create `src/hooks/lib/build-context-payload.ts`:

```typescript
export function buildContextPayload(
  state: CurdxState,
  specDir: string,
  opts: { forSubagent?: boolean; maxBytes?: number; ironLawSummary?: string } = {}
): string;
```

- SessionStart branch: full payload (current behavior preserved)
- SubagentStart branch: compressed payload (phase + specPath + ironLawSummary)
- Both call same lib → DRY enforced
- `load-spec-context.ts` refactored to import from new lib (light edit, no behavior change)

### Hook test infrastructure (E2)

**Closest analog**: `tests/hooks/load-spec-context.test.ts` (92 LOC) — same shape needed for SubagentStart hook tests.

**Test fixtures helper**: `createFixtureSpec({specName, state, ...}): {cwd, specName, cleanup}` — provides temp dir + state + .progress.md, manual cleanup in afterEach.

**stdin simulation pattern**:
```typescript
const r = runHook("subagent-context-injector", fixturePath, { cwd: demoSpec.cwd });
expect(r.exitCode).toBe(0);
expect((r.json as any).additionalContext).toMatchObject({
  phase: "execution",
  specPath: "./specs/demo-spec",
  ironLawSummary: expect.stringContaining("No completion claim without"),
});
expect(JSON.stringify(r.json).length).toBeLessThanOrEqual(2048);
```

### Recommended test cases (7)

| # | Case | Fixture | Expected |
|---|---|---|---|
| (a) | Happy path: valid state | `createFixtureSpec()` default | additionalContext with phase + specPath + ironLawSummary |
| (b) | State absent | `noStateFile: true` | `{continue: true}` no-op (fail-open) |
| (c) | State malformed JSON | invalid JSON in `.curdx-state.json` | exit 0 + stderr error, no crash |
| (d) | Payload size ≤ 2KB | any | `JSON.stringify(r.json).length ≤ 2048` |
| (e) | Iron-law verbatim | (a) | `ironLawSummary === "No completion claim without fresh verification."` |
| (f) | Completed spec | `state: { completed: true }` | `{active: false}` (no injection — spec is done) |
| (g) | Quick-mode spec | `state: { quickMode: true }` | additionalContext present (discipline applies in quick mode too) |

### Byte-equal regression test

`tests/hooks/byte-equal.test.ts` (502 LOC) provisions /tmp fixtures + diffs against frozen v6.0.6 baselines. Plan to add SubagentStart hook to baseline coverage when shipped.

## Quality Commands

Standard set — no new tooling:

| Command | Use |
|---|---|
| `npm run typecheck` | TS strict (impact: light, lib + hook source) |
| `npm run build:hooks` | esbuild bundle (must register subagent-context-injector entry) |
| `npm run check:hooks-fresh` | Bundle freshness gate |
| `npm run test:hooks` | All hook unit tests (must include new SubagentStart tests) |
| `npm run verify` | Full chain |

## Related Specs

| Spec | Relevance | Relationship |
|---|---|---|
| spec-verification-iron-law (✅) | HIGH | Iron-law summary string lives in spec A's reference doc; spec D imports it |
| spec-bounded-parallel-dispatch (✅) | LOW | No parallel dispatch in this spec |
| spec-two-stage-review (✅) | LOW | Independent surface |
| spec-cost-runaway-guards | LOW | Independent — no shared hook surface |

## Feasibility Assessment

| Aspect | Assessment | Notes |
|---|---|---|
| **Technical fit** | HIGH | All seam points exist (hooks.json, src/hooks/, build-hooks.mjs, test fixtures) |
| **GA verification** | HIGH | SubagentStart confirmed GA — proceed straight up |
| **Scope realism (S-M)** | HIGH | 8-15 tasks: 1 GA pre-check + 1 shared lib + 1 new hook + 1 SessionStart refactor + 1 hooks.json registration + 1 build registration + 7 tests + 1 CHANGELOG |
| **Backwards compat** | HIGH | New hook is purely additive; SessionStart refactor preserves external behavior |
| **superpowers #237 displacement** | HIGH | Issue closed wontfix — our spec fills the gap |
| **Cross-platform risk** | LOW | No new fs patterns; existing test fixture infra cross-platform-clean |

## Recommendations for Requirements Phase

1. **Pre-check Task 0 simplifies** — runtime version warning, NOT spec-defer-blocker (since GA confirmed)
2. **Iron-law summary** sourced from canonical 1-liner in `references/iron-law-verification.md` (already canonicalized)
3. **Shared lib `build-context-payload.ts`** — TS, two branches (SessionStart full / SubagentStart compressed); both `load-spec-context.ts` and new `subagent-context-injector.ts` import
4. **Payload budget** — 2KB hard cap; target 100-150B; assertion in test (d)
5. **Fail-open everywhere** — never break a subagent dispatch (FR-8 carryover)
6. **7 test cases** + byte-equal regression baseline for the new hook
7. **CHANGELOG** appended to v7.1.7 (same release line as A/B/C)

## Open Questions for Design Phase

1. Iron-law summary string — read from reference doc at runtime, OR hardcoded constant? (runtime = drift-resilient; hardcode = startup-fast). Recommendation: hardcoded constant in `lib/build-context-payload.ts` + drift test asserting it matches reference doc.
2. SubagentStart triggers on EVERY Task() — should we filter by `agent_type` (e.g., skip injection for spec-executor or qa-engineer subagents that already have spec context)? Recommendation: NO filter in v1 (universal injection); revisit if perf data shows issue.
3. Payload format — JSON object vs prose string? Recommendation: JSON object inside `additionalContext.text` is system-reminder-friendly; subagent sees it as `<system-reminder>...</system-reminder>` block.
4. Refactor scope of `load-spec-context.ts` — surgical (extract 1 function) or larger (move handler logic into lib)? Recommendation: SURGICAL (extract `buildContextPayload`, leave handler shape unchanged).

## Sources

### Web research (R1, 9 sources)
- Anthropic Hooks reference: https://code.claude.com/docs/en/hooks
- Anthropic Subagents docs: https://code.claude.com/docs/en/sub-agents
- Anthropic Agent Teams docs: https://code.claude.com/docs/en/agent-teams
- claude-code GH FR #14859 (proposed richer SubagentStart fields)
- claude-code GH issue #23885 (additionalContext as system-reminder, closed wontfix)
- superpowers issue #237 (CLOSED wontfix 2026-03-10): https://github.com/obra/superpowers/issues/237
- Benny-Lewis fork (community attempt, unmerged)
- 2 community blog posts on SubagentStart usage patterns

### Local repos
- `/Users/wdx/opc/curdx-flow/src/hooks/load-spec-context.ts` (226 LOC)
- `/Users/wdx/opc/curdx-flow/plugins/curdx-flow/references/iron-law-verification.md` (canonical iron-law)
- `/Users/wdx/opc/curdx-flow/tests/hooks/load-spec-context.test.ts` (92 LOC, fixture template)

### Partial research files (will be deleted post-merge)
- `.research-subagent-start-ga.md` (R1)
- `.research-context-builder.md` (E1)
- `.research-hook-tests.md` (E2)
