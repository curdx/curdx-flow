---
spec: spec-bounded-parallel-dispatch
epic: superpowers-uplift
phase: research
created: 2026-05-06
researchers: [E1 current-state, R1 external-anti-patterns]
---

# Research: spec-bounded-parallel-dispatch

## Executive Summary

Current `references/parallel-research.md` (160 LOC, 3 anti-patterns) is **research-phase only**. Has 12 inbound references across 8 files (3 hard paths + 9 soft mentions). Renaming to `bounded-parallel-dispatch.md` is mechanically simple — just need stub redirect at old path. The substantive work is **adding 5 review-domain + 5 debug-domain anti-patterns** synthesized from external sources (25 cited), and codifying **3 independence criteria** (independent input / independent output / independent context) as a pre-flight checklist. Key insight from R1: **debug parallelization is materially riskier than review parallelization** — debug needs sequential triage → narrow to ≤3 leads → parallel deep-dive → explicit verifier; never fan-out first. Review is safer because the diff is a frozen snapshot. The new doc must enforce these domain-specific rules without breaking existing 6 `commands/*.md` consumers.

## External Research (R1)

### Review-domain anti-patterns (5)

1. **Fixation on obvious** — multiple reviewers all gravitate to surface defects, miss subtle ones
2. **Duplicate findings without dedup owner** — N reviewers each report the same lint error; coordinator must dedupe
3. **Contradictions without synthesis** — Reviewer A says "use pattern X", Reviewer B says "avoid X"; no arbiter
4. **Stale-state reviewer** — slow reviewer reads code that's been amended mid-review
5. **Role-prompt specialization drift** — "spec-compliance reviewer" inadvertently inherits code-quality concerns from training data

### Debug-domain anti-patterns (5)

1. **Hypothesis overwrite via shared scratchpad** — investigators stomp on each other's working notes
2. **Prover-without-verifier** — agent claims root cause found, no second pass to validate
3. **Partial-findings-Frankenstein** — coordinator combines half-true partial reports into wrong conclusion
4. **Dead-end branches consuming budget** — fanning out before triage burns tokens on dead leads
5. **Missing distributed tracing for attribution** — when agents fan out, coordinator can't tell which agent owned which finding

### 3 Independence Criteria (settled — pre-flight checklist for parallel dispatch)

| # | Criterion | What it means | Failure mode if ignored |
|---|---|---|---|
| 1 | **Independent input** | No agent waits on another's output to begin | Sequential masquerading as parallel; coordination overhead dominates |
| 2 | **Independent output** | No write-conflicts unless serialized through coordinator | Lost writes; data races; one agent's output silently wins |
| 3 | **Independent context** | No agent reads from peer's mid-flight state | Stale reads; reasoning on partial data; cascading wrong conclusions |

### Subagent-vs-grep — Anthropic's own warning

> *"Claude Opus 4.6 has a strong predilection for subagents and may spawn them in situations where a simpler, direct approach would suffice — for example, the model may spawn subagents for code exploration when a direct grep call is faster and sufficient."* `[R1-27]`

Field reports confirm: 30-60s subagent overhead vs <1s grep call when the only need is a string match.

### Industry patterns NOT to be confused with bounded parallel dispatch

| Pattern | What it is | Why it differs |
|---|---|---|
| **Agent swarm / Multi-Agent Debate** | Multiple peer agents argue to consensus | We use a single coordinator; no peer-to-peer |
| **AutoGen Group Chat** | LLMs converse in shared room | We isolate contexts; agents don't see each other |
| **Supervisor-Worker (LangGraph)** | Hierarchical handoffs with retry | Closer match, but our coordinator owns final synthesis |
| **MapReduce-style fan-out/in** | Map = parallel work; Reduce = aggregator | Closest match — bounded parallel dispatch IS map/reduce when independence holds |

### Biggest insight from R1

Debug parallelization is materially riskier than review parallelization. Sources converge on:

> Sequential triage → narrow to ≤3 leads → parallel deep-dive → coordinator with explicit verifier step. **Never fan-out-first.**

Review is safer because the diff is a frozen snapshot — independence holds naturally.

## Codebase Analysis (E1)

### Current `references/parallel-research.md` structure

160 LOC. Sections (`##`/`###` headings):

| Section | Purpose |
|---|---|
| Coordinator Role | Defines: coordinator never researches |
| Topic Identification | Mapping of categories to agent type |
| Topic Deduplication | 1 anti-pattern: don't combine multiple topics into one agent |
| Dispatch Pattern (Team-Based) | 5-step protocol |
| Spawn Teammates (ALL in ONE Message) | 1 anti-pattern: sequential spawn = sequential execution |
| Merging Results | Coordinator synthesizes |
| Scaling by Complexity | Agent count by scenario |

### Existing anti-patterns (3 total — verbatim)

1. *"Each research-analyst handles ONE external topic; each Explore handles ONE codebase concern"*
2. *"Break external research into MULTIPLE research-analyst teammates — do NOT combine multiple external topics into one agent"*
3. *"ALL Task calls MUST be in ONE message to ensure true parallel execution. Spawning one at a time across separate messages runs them sequentially."*

### Inbound references (12 matches across 8 files)

**Hard path refs (3)** — must update if path changes:
1. `commands/research.md` — references the 5-step dispatch pattern
2. `commands/start.md` — references parallel-research.md for team dispatch in research phase
3. `references/triage-flow.md` — points to parallel-research.md for explore step

**Soft prose mentions (9)** in: spec planning docs, design docs, learning notes — all under `specs/`. These don't need path updates if we keep the rename mechanical.

### Commands using parallel dispatch (6 files)

All use the same team lifecycle: `TeamDelete → TeamCreate → TaskCreate → Spawn → Wait → Shutdown`:

| Command | Subagent type | Phase |
|---|---|---|
| research.md | research-analyst, Explore | research |
| start.md | research-analyst, Explore | research |
| requirements.md | product-manager | requirements |
| design.md | architect-reviewer | design |
| tasks.md | task-planner | tasks |
| triage.md | research-analyst, Explore | epic triage |

### Gap analysis (what the new doc must add)

Current doc covers ONLY research phase. Missing:
- Review-phase rules (spec B will need these for parallel reviewer dispatch)
- Debug-phase rules (systematic-debugging fan-out)
- 3 independence criteria as explicit pre-flight checklist
- Anti-patterns specific to non-research domains (10 from R1)
- "When to choose grep over subagent" guidance

## Quality Commands

Same as spec A — this spec doesn't add new tooling, just doc:

| Command | Use |
|---|---|
| `npm run typecheck` | TS strict (no impact this spec — doc only) |
| `npm run check:hooks-fresh` | Bundle freshness (no impact) |
| `npm run test:hooks` | Hook tests (no impact) |
| `npm run verify` | Full chain (must still pass) |

Doc-only spec. Quality bar: doc-drift test similar to spec A's `iron-law-doc.test.ts` to keep references in sync.

## Related Specs

| Spec | Relevance | Relationship |
|---|---|---|
| spec-verification-iron-law (✅ complete) | Indirect | Established `iron-law-verification.md` doc pattern that this spec mirrors |
| spec-two-stage-review | **HIGH — depends on this spec** | B needs C's review-domain rules + 3 independence criteria for parallel reviewer dispatch |
| spec-subagent-context-reinjection | LOW | D doesn't dispatch parallel; doesn't consume this doc |
| spec-cost-runaway-guards | LOW | E is hook-side; doesn't consume this doc |

## Feasibility Assessment

| Aspect | Assessment | Notes |
|---|---|---|
| **Technical fit** | HIGH | Doc-only; no code change; rename + content addition |
| **Scope realism (size S)** | HIGH | Estimated 5-7 tasks: rename + stub + add review section + add debug section + add 3-criteria checklist + drift test + CHANGELOG |
| **Backwards compat risk** | LOW | Old path keeps stub redirect; 3 hard refs in commands/*.md need single-line update |
| **External validation** | HIGH | 25 sources; 10 anti-patterns synthesized; 3 criteria settled |

## Recommendations for Requirements Phase

1. **Rename strategy**: keep `references/parallel-research.md` as a 1-line stub redirecting to `bounded-parallel-dispatch.md` (don't delete — same backwards-compat principle as spec A's skill alias).
2. **Section structure for new doc**: Coordinator Role → Domain Coverage (Research / Review / Debug) → 3 Independence Criteria → Per-Domain Anti-patterns → Subagent-vs-Grep Guidance → 5-step Dispatch Pattern (preserved verbatim) → Merging Results.
3. **Drift test**: tests/runner/bounded-parallel-dispatch-doc.test.ts that asserts: (a) all 6 commands/*.md still link to the new path; (b) old stub exists; (c) ≥10 anti-patterns documented.
4. **B→C contract**: spec B will read this doc to dispatch parallel reviewers. Make explicit in §Review section that "phase-boundary parallel review with independent context" is the expected B integration pattern.
5. **No skill added** — explicit per epic constraint (skill bloat prevention). The doc is "live" via commands/*.md reading it.

## Open Questions for Design Phase

1. Should the rename be a single PR, or split into (a) add new doc + redirect; (b) update inbound refs; (c) remove old stub eventually?
2. Drift test: assert specific anti-pattern count (≥10) vs structural (each domain has ≥3 anti-patterns)?
3. Should `references/coordinator-pattern.md` be cross-linked? Currently parallel-research.md doesn't, but it's tightly related.

## Sources

### Web research (R1)
Full inline citations in `.research-external-anti-patterns.md` (25 sources). Key:
- Anthropic Claude Code Advanced Patterns PDF (subagent overuse warning)
- LangChain forum on multi-agent verification
- AutoGen group chat patterns
- arXiv 2503.13657 (parallel agent systems — extraction-limited)

### Local repos
- `/Users/wdx/opc/curdx-flow/plugins/curdx-flow/references/parallel-research.md` (current 160 LOC)
- `/Users/wdx/opc/curdx-flow/plugins/curdx-flow/commands/*.md` (6 consumers)
- 12 inbound refs grep-able

### Partial research files (will be deleted post-merge)
- `.research-current-state.md` (E1)
- `.research-external-anti-patterns.md` (R1, 25 sources)
