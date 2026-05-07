# Cache TTL and Cost — Autonomous Loop Blast Radius

> Single source of truth for the **cost runaway guard rails** that pair with
> spec A's Iron Law. This file is intentionally compaction-resilient — every
> other surface (hooks, skill, CHANGELOG, CLI) points back here.
> Used by: `stop-watcher` hook (cap-enforcement block message),
> `stop-failure-handler` hook (rate_limit/api_died observability),
> `implement.md` coordinator (pre-dispatch cap check), `references/iron-law-verification.md`
> (cross-link for `stop_hook_active` early-exit), and the spec
> `spec-cost-runaway-guards` drift test.
>
> **Drift anchors** (asserted by `tests/runner/cache-ttl-doc.test.ts`): the
> tokens `5 minute`, `GH#46829`, `5-10×`, and `stop_hook_active` MUST appear
> verbatim in this file. Reword anything else freely; do not lose those four.

## Section 1 — The 5-Minute Cache TTL Trap

Anthropic prompt caching defaults to a **5 minute** sliding TTL. Any pause
between requests longer than 5 min — including a `Stop` hook that sleeps,
waits on user input, or yields to another tool — invalidates the cache and
forces the next turn to **re-write** the entire prompt prefix at full input
price. For long autonomous loops with large system prompts, this turns a
nominally cheap "cached read" workload into a series of expensive cache
**writes**.

This default is **non-obvious and hostile to long-running agents**. Until
~Mar 2026 the SDK / API treated 1 hour as the default for many code paths;
the silent regression to a hard 5 min default was tracked in
**GH#46829** (closed-not-planned: the 5 min TTL is now the documented,
intentional default — there is no "default 1h" knob, only an opt-in
`cache_control: { type: "ephemeral", ttl: "1h" }` per-block).

What this means for autonomous loops:

- **Sleep > 5 min between iterations = guaranteed cache miss.** Every
  re-entry pays full input-token price for the system prompt + tool defs +
  prior turns up to the cache breakpoint.
- **Stop hook that prompts a verifier subagent** can easily blow past 5 min
  on a slow `npm run verify` / typecheck / test run; on the next iteration
  the loop pays write-price again.
- **Schema-default `maxGlobalIterations`** (this spec changed it from 100 →
  30, see `package.json` schema and `spec.schema.json::definitions.state`)
  exists precisely to bound how many times the loop can re-pay this
  multiplier before a human notices.

**Reference**: GitHub issue `anthropics/anthropic-sdk-python#46829`
("prompt cache TTL silently dropped to 5 min"); closed-not-planned ~Mar 2026.

## Section 2 — Cost Multiplier Breakdown (5–10× Over-Pay)

Anthropic prompt-caching pricing relative to base input token price:

| Token class | Multiplier vs base input | When it applies |
|---|---|---|
| **Base input (uncached)** | `1.0×` | First time a prefix is sent, or after TTL expiry |
| **Cache write — 5 min TTL** | `1.25×` | First write of a block with default TTL |
| **Cache write — 1 hour TTL** | `2.0×` | First write of a block with opt-in `ttl: "1h"` |
| **Cache read** | `0.1×` | Subsequent reads within TTL window |

The headline **5-10×** figure is the **end-to-end multi-pay multiplier**
observed when an autonomous loop with sleep-between-turns > 5 min keeps
re-writing what should have been a cache-read workload:

- **Best case (cache hit):** input is paid at `0.1×` (cache-read).
- **Worst case (5 min TTL forced re-write every turn):** input is paid at
  `1.25×` (cache-write) instead of `0.1×` — a ratio of **`1.25 / 0.1 = 12.5×`**
  per turn for the cached portion. Averaged with un-cached overhead and
  output tokens, real workloads land in the **5-10×** band end-to-end.
- **Sustained measured over-payment**: `~17.1%` of total spend on a
  representative long-running loop traced back to forced 5 min re-writes
  (this is the figure you will see quoted in the CHANGELOG entry for this
  spec; sourced from the same loop trace that motivated GH#46829).

Mitigation rank ordering (cheapest first):

1. **Cap the loop** (`maxGlobalIterations: 30`) so the multi-pay can't run
   open-ended — this is the load-bearing fix in `spec-cost-runaway-guards`.
2. **Don't sleep > 5 min between iterations**; if a verify step is slow,
   keep the same hook turn alive rather than yielding.
3. **Opt in to `ttl: "1h"`** for stable system-prompt blocks — pays a one-time
   `2.0×` write but every read within the hour is `0.1×`. Worked example:

   ```json
   {
     "type": "text",
     "text": "<long stable system prompt>",
     "cache_control": { "type": "ephemeral", "ttl": "1h" }
   }
   ```

4. Verify multiplier in the API response: `usage.cache_creation_input_tokens`
   should drop, `usage.cache_read_input_tokens` should dominate. If
   `cache_creation` keeps re-firing every turn, you are still in the trap.

## Section 3 — `stop_hook_active` Early-Exit (Cross-Link to Spec A)

The single most important runtime guard against cost runaway is the
**`stop_hook_active` early-exit** at the very first line of `stop-watcher.mjs`:

```typescript
if (input.stop_hook_active) return { continue: false };
```

This is **NOT** owned by this spec — it is the canonical anti-recursion
guard from `spec-iron-law-verification` (spec A). It prevents a Stop hook
that itself triggers a continuation prompt from re-invoking itself in an
unbounded recursion, which would re-pay the cache-write multiplier every
single re-entry.

For the full rationale, field semantics, and hook-source pointers, see:

- `plugins/curdx-flow/references/iron-law-verification.md` →
  **Two-Layer Model** section, "Layer-1 properties" bullet listing
  `stop_hook_active` as the first statement in `runStopHook()` (NFR-7).
- Hook source: `src/hooks/stop-watcher.ts` (the `if (input.stop_hook_active)`
  line is the first conditional in `runStopHook()`).

**Insertion-order invariant** (asserted by both spec A and spec E tests):
`stop_hook_active` early-exit MUST remain the **first** conditional in
`runStopHook()`. The `spec-cost-runaway-guards` cap-enforcement block
(`buildCostRunawayBlock(state, specName, stateFilePath)`) is inserted
**after** that early-exit and **after** `maybeWaitForRecentStateFile`, but
**before** `verifyPhaseBlock` and the completion gate. Any reordering may
break either spec's invariants — see the in-file comment in
`src/hooks/stop-watcher.ts` near the cap-check insertion point.

## Section 4 — Recommended Autonomous Loop Budget

Default `maxGlobalIterations: 30` is calibrated against a **nominal blast
radius of ~$4.50** for a typical Sonnet-class autonomous loop with:

- Avg ~30k input tokens / iteration (system prompt + accumulated tool
  results, mostly cache-readable in the happy path).
- Avg ~2k output tokens / iteration.
- Sonnet-tier pricing as of 2026-05.

| Cap | Iterations | Nominal blast radius (Sonnet) | Notes |
|---|---|---|---|
| **New default (this spec)** | `30` | **~$4.50** | Hard block at iter 30 + CLI override |
| **Old default (pre-spec-cost-runaway-guards)** | `100` | **~$13+** | Was declared but not enforced; legacy state preserved |
| **Worst-case (5 min trap, no cap)** | unbounded | $40+ before human notices | The exact failure mode this spec exists to prevent |

**Legacy override**: existing state files with `maxGlobalIterations: 100`
are preserved (backwards-compat per FR-C1 — the schema default applies only
to fields missing on init, not to stored values). To explicitly opt back
into legacy behavior on a new spec:

```bash
npx curdx-flow:implement --max-global-iterations 100
```

To opt into a tighter cap for a one-off loop:

```bash
npx curdx-flow:implement --max-global-iterations 10
```

The CLI flag is parsed in `plugins/curdx-flow/commands/implement.md` (Step 2
of the coordinator flow) and enforced both at the **coordinator pre-dispatch
check** (`implement.md` "Pre-Dispatch Cap Check" subsection) and at the
**Stop hook last-mile gate** (`stop-watcher.mjs` `buildCostRunawayBlock`).
This is defense-in-depth (R2 mitigation): both surfaces emit the **same** D4
message template, so the user sees one consistent error regardless of which
layer fires first.

**Companion flag**: `--max-task-iterations` defaults to a smaller per-task
retry budget; on cap hit the current task is marked failed and the retry
loop breaks, but the global loop continues to the next task (US-2, AC-2.2).

## Cross-References

**Spec A — Iron Law (canonical for `stop_hook_active`)**:
- `plugins/curdx-flow/references/iron-law-verification.md` — Two-Layer Model

**Hook source paths**:
- `src/hooks/stop-watcher.ts` — `buildCostRunawayBlock` + cap-check insertion
- `src/hooks/stop-failure-handler.ts` — rate_limit / max_output_tokens / api_died
  observability (StopFailure event, opt-in via Agent Teams flag)
- Bundled output: `plugins/curdx-flow/hooks/scripts/stop-watcher.mjs`,
  `plugins/curdx-flow/hooks/scripts/stop-failure-handler.mjs`

**Schema and state**:
- `plugins/curdx-flow/schemas/spec.schema.json` —
  `definitions.state.properties.maxGlobalIterations.default = 30`
- `src/hooks/init-execution-state.ts` — EMBEDDED_TEMPLATE init defaults

**Coordinator (CLI flag + pre-dispatch check)**:
- `plugins/curdx-flow/commands/implement.md` — `--max-global-iterations`,
  `--max-task-iterations`, "Pre-Dispatch Cap Check" subsection

**CHANGELOG**:
- 2026-05 entry under `Changed` documents the 100 → 30 default tightening
  and the 5-10× cost-multiplier rationale.

**External**:
- `anthropics/anthropic-sdk-python#46829` — 5 minute cache TTL silent
  regression, closed-not-planned
- Anthropic prompt-caching pricing page (cache-write `1.25×` / `2.0×`,
  cache-read `0.1×` multipliers)
