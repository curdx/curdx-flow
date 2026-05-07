---
spec: spec-bounded-parallel-dispatch
epic: superpowers-uplift
phase: design
created: 2026-05-06
---

# Design: spec-bounded-parallel-dispatch

## Overview

Doc-only spec. Rename `references/parallel-research.md` → `references/bounded-parallel-dispatch.md`, preserve all current research-domain content verbatim, and append three load-bearing additions: (1) Domain Coverage section spanning Research/Review/Debug, (2) 3 Independence Criteria as an explicit pre-flight checklist, (3) per-domain anti-pattern catalog (3 research + 5 review + 5 debug = 13). Old path becomes a 1-line stub redirect; 3 hard-path consumers get updated; a new drift test gates count + path consistency.

## Decisions

### D1: Single-PR rollout

**Choice:** Ship rename + content additions + ref updates + drift test + CHANGELOG in **one PR**.

| Option | Pros | Cons |
|---|---|---|
| Single PR (CHOSEN) | One review pass; no intermediate "broken" state; spec B unblocked at one merge boundary | Larger diff (~250 LOC new + 6 ref edits + 1 test file) |
| Phased (a/b/c) | Smaller chunks per PR | 3× review overhead for zero behavioral risk; intermediate states leave docs half-renamed |

**Rationale:** Doc-only spec, no behavioral surface, low rollback risk. Phasing buys nothing, costs review cycles, and risks half-merged states between (a) and (b). Spec B is a hard downstream — single merge boundary minimizes its waiting time.

### D2: Drift-test assertion shape — per-domain structural + total count

**Choice:** Assert **both** (a) total count `≥10` AND (b) per-domain count `≥3` for each of {research, review, debug}.

| Option | Catches | Misses |
|---|---|---|
| Total only (`≥10`) | Whole-list neutering | Silent deletion from one bucket (e.g., debug drops to 0, research has 10) |
| Per-domain only (`≥3` each) | Bucket starvation | Adversarial 3+3+3=9 case |
| **Both (CHOSEN)** | Both axes | — |

**Rationale:** Per-domain catches silent bucket starvation (the failure mode that matters most for spec B's review-domain dependency). Total catches whole-list neutering. Combined cost is one extra assertion line; combined coverage is strictly larger.

### D3: Cross-link to `references/coordinator-pattern.md` — YES

**Choice:** Single-line cross-link in §1 Coordinator Role.

**Rationale:** Tightly related (`coordinator-pattern.md` defines *why* coordinator owns synthesis; this doc defines *how* under independence constraints). Readers who land on "coordinator never writes peer-to-peer" benefit from one-click access to the underlying pattern. Old doc didn't link — adding it costs one line, prevents readers from having to grep.

## New Doc Structure (`references/bounded-parallel-dispatch.md`)

| § | Section | Source | LOC est |
|---|---|---|---|
| 1 | Coordinator Role | PRESERVED + 1-line cross-link to `coordinator-pattern.md` (D3) | 15 |
| 2 | Domain Coverage (Research / Review / Debug) | NEW | 30 |
| 3 | 3 Independence Criteria (pre-flight checklist) | NEW | 25 |
| 4 | Per-Domain Anti-patterns (3 + 5 + 5 = 13) | research existing 3; review/debug NEW from R1 | 60 |
| 5 | Subagent-vs-Grep Guidance (Anthropic warning cited) | NEW | 15 |
| 6 | Topic Identification | PRESERVED | 30 |
| 7 | Dispatch Pattern (5-step Team-Based) | PRESERVED VERBATIM (FR-Doc-5) | 35 |
| 8 | Merging Results | PRESERVED | 20 |
| 9 | Scaling by Complexity | PRESERVED | 15 |

**Total estimate:** ~245 LOC (current is 160; net +85 from §2/§3/§4 additions and §5).

### §2 Domain Coverage shape

```markdown
## Domain Coverage

| Domain | When to fan out | Independence holds because... | Risk level |
|---|---|---|---|
| Research | Multiple unrelated topics, each with own scope | Each topic is its own search space | LOW |
| Review | Phase-boundary review against frozen artifact | Diff is immutable snapshot | LOW |
| Debug | Investigating live failure, AFTER triage narrowed to ≤3 leads | Each lead is independent hypothesis | HIGH — never fan-out-first |
```

### §3 3 Independence Criteria shape (D2-tested)

```markdown
## 3 Independence Criteria — Pre-Flight Checklist

Before dispatching N agents in parallel, ALL THREE must hold:

1. **Independent input** — no agent waits on another's output to begin.
   *Failure mode:* sequential masquerading as parallel; coordination overhead dominates.
2. **Independent output** — no write conflicts unless serialized through coordinator.
   *Failure mode:* lost writes; data races; one agent's output silently wins.
3. **Independent context** — no agent reads peer's mid-flight state.
   *Failure mode:* stale reads; reasoning on partial data; cascading wrong conclusions.

If any criterion fails → DO NOT fan out. Run sequentially or refactor inputs.
```

### §4 Anti-patterns shape (D2-tested: ≥3 per domain, ≥10 total)

```markdown
## Per-Domain Anti-patterns

### Research (3) — preserved
1. One agent per topic — never combine multiple external topics into one agent
2. Multi-topic Explore — break into multiple research-analyst teammates
3. Sequential Task spawn — ALL Task calls in ONE message

### Review (5) — NEW from R1
1. Fixation on obvious — surface defects swarm; subtle ones missed. → Coordinator: assign 1 reviewer per concern axis.
2. Duplicate findings without dedup owner — N reviewers report same lint error. → Coordinator: dedupe before synthesis.
3. Contradictions without synthesis — Reviewer A says X, B says ¬X. → Coordinator: arbitrate, don't pass through.
4. Stale-state reviewer — slow reviewer reads code amended mid-review. → Coordinator: freeze artifact (commit SHA / file snapshot) before dispatch.
5. Role-prompt specialization drift — "spec-compliance reviewer" inherits code-quality concerns. → Coordinator: pin reviewer scope in prompt; reject out-of-scope findings.

### Debug (5) — NEW from R1
1. Hypothesis overwrite via shared scratchpad — investigators stomp on notes. → Coordinator: per-agent isolated context.
2. Prover-without-verifier — agent claims root cause, no second pass. → Coordinator: dispatch verifier as separate role.
3. Partial-findings-Frankenstein — coordinator combines half-truths into wrong RC. → Coordinator: require each agent's evidence chain explicit.
4. Dead-end-budget-burn — fan out before triage burns tokens on dead leads. → Coordinator: sequential triage → narrow to ≤3 leads → THEN parallel.
5. Missing attribution — coordinator can't tell which agent owned which finding. → Coordinator: tag findings with agent ID at synthesis.

> **Debug-specific rule:** sequential triage → narrow to ≤3 leads → parallel deep-dive → explicit verifier. **Never fan-out-first.**
```

### §5 Subagent-vs-Grep shape

```markdown
## Subagent-vs-Grep Guidance

> *"Claude Opus 4.6 has a strong predilection for subagents and may spawn them in situations where a simpler, direct approach would suffice — for example, the model may spawn subagents for code exploration when a direct grep call is faster and sufficient."* — Anthropic Claude Code Advanced Patterns

Field heuristic: 30-60s subagent overhead vs <1s grep when need is exact-string match.

**Use grep when:** exact string, single concern, single file or known glob.
**Use subagent when:** semantic exploration, multi-file synthesis, or any of the 3 domains above with all 3 criteria holding.
```

## Old Path Stub Content

`plugins/curdx-flow/references/parallel-research.md` becomes exactly:

```markdown
> Moved to [bounded-parallel-dispatch.md](./bounded-parallel-dispatch.md). Documentation expanded to cover review and debug domains, not only research.
```

One line. Kept indefinitely (FR-Path-3, NFR-1).

## File Structure

| Path | Action | Reason |
|---|---|---|
| `plugins/curdx-flow/references/bounded-parallel-dispatch.md` | NEW | Renamed target + content additions (US-1, FR-Path-1) |
| `plugins/curdx-flow/references/parallel-research.md` | EDIT | Replace content with 1-line stub redirect (US-2, FR-Path-2) |
| `plugins/curdx-flow/commands/research.md` | EDIT | Update path ref (FR-Refs-1) |
| `plugins/curdx-flow/commands/start.md` | EDIT | Update path ref (FR-Refs-1) |
| `plugins/curdx-flow/commands/triage.md` | EDIT | Update path ref via `references/triage-flow.md` |
| `plugins/curdx-flow/references/triage-flow.md` | EDIT | Update path ref (E1 identifies this as third hard ref) |
| `plugins/curdx-flow/commands/requirements.md` | CHECK + EDIT if linked | FR-Refs-2 (E1 lists as soft consumer; verify) |
| `plugins/curdx-flow/commands/design.md` | CHECK + EDIT if linked | FR-Refs-2 |
| `plugins/curdx-flow/commands/tasks.md` | CHECK + EDIT if linked | FR-Refs-2 |
| `tests/runner/bounded-parallel-dispatch-doc.test.ts` | NEW | Drift detection (US-7, FR-Test-*) |
| `CHANGELOG.md` | EDIT | Append entry under unreleased / next patch (US-8) |

> **Note on the "6 inbound consumers"** from requirements: E1 research identified **3 HARD path refs** (`commands/research.md`, `commands/start.md`, `references/triage-flow.md`) and **9 soft prose mentions** in `specs/`. The other 3 commands (`requirements`, `design`, `tasks`) are listed as "use parallel dispatch" but may not contain explicit path refs to `parallel-research.md` — tasks phase verifies via grep and edits only those that actually link.

## Test Strategy

Single new test file: `tests/runner/bounded-parallel-dispatch-doc.test.ts`. Mirrors spec A's `iron-law-doc.test.ts` pattern.

| Test | Asserts | Maps to |
|---|---|---|
| `new-doc-exists` | File exists at `plugins/curdx-flow/references/bounded-parallel-dispatch.md` | AC-1.1, FR-Path-1 |
| `old-stub-redirect` | Old path file exists, contains exactly 1 line, line matches `/Moved to.*bounded-parallel-dispatch\.md/` | AC-2.1/2/3, FR-Path-2, FR-Test-4 |
| `anti-pattern-count-total` | New doc has ≥10 anti-patterns (count by structural marker, e.g., numbered list under §4) | FR-Doc-3, FR-Test-2, **D2** |
| `anti-pattern-count-per-domain` | Research subsection ≥3, Review subsection ≥3, Debug subsection ≥3 | FR-Test-2, **D2** |
| `independence-criteria-present` | All 3 strings appear: "Independent input", "Independent output", "Independent context" | AC-3.1/2/3, FR-Doc-2 |
| `path-consistency-commands` | All 6 `commands/*.md` files: zero matches for old path; matches for new path where they reference the doc | AC-6.1, FR-Refs-1/2, FR-Test-3 |
| `subagent-vs-grep-section-present` | New doc contains string "predilection for subagents" or equivalent Anthropic citation | FR-Doc-4 |
| `5-step-pattern-preserved` | New doc contains the 5-step dispatch heading and all 5 step markers (verbatim from old) | AC-1.3, FR-Doc-5 |

Test runs as part of `npm run verify` chain (FR-Test-1).

## Performance Budget

N/A — doc-only. Drift test runtime trivial (file reads + regex).

## Cross-Platform Considerations

N/A — pure markdown + node test. Test uses `fs.readFileSync` + `path.join` (already cross-platform-safe per repo's existing test patterns).

## Out-of-Scope

(Carried from requirements §Out of Scope)

- New skill creation (skill-bloat cap — doc consumed via `commands/*.md` direct read).
- Code-side dispatch orchestration changes.
- Spec B's parallel reviewer implementation (B's responsibility; this spec only provides the contract).
- Deletion of old stub redirect.
- Updating 9 soft prose mentions in `specs/` (resolves via stub).

## Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | Drift between this doc and spec B's reviewer dispatch contract | Medium | High (B is hard downstream) | Drift test asserts ≥3 review anti-patterns + 3-criteria checklist presence (D2) |
| 2 | Soft refs in `specs/` getting accidentally updated → noise PRs | Low | Low | Stub redirect absorbs them; explicit out-of-scope in tasks |
| 3 | 5-step pattern accidentally re-worded during rename | Low | High (regression vs FR-Doc-5) | Drift test asserts pattern preserved verbatim (test 8 above) |
| 4 | Anti-pattern wording inconsistency between research/review/debug subsections | Medium | Medium | Each anti-pattern gets uniform shape: "1-sentence description + Coordinator: do this instead" |

## Existing Patterns to Follow

- Doc-drift test pattern: spec-verification-iron-law's `tests/runner/iron-law-doc.test.ts` (per `references` table in research §Quality Commands).
- Stub redirect pattern: same backwards-compat principle as spec A's skill alias.
- CHANGELOG format: Keep-a-Changelog (per `CLAUDE.md` Release SOP §3); categorize as Added (review/debug rules, 3-criteria checklist) + Changed (rename + cross-link).
- Section heading conventions: match existing `references/*.md` (H2 for major sections, H3 for subsections, tables for matrices).

## Open Questions for Tasks Phase

1. Are `commands/{requirements,design,tasks}.md` actual hard-path consumers or only conceptual? Tasks phase: grep-verify; only edit files that contain literal `parallel-research.md` string.

## Implementation Steps

1. Create `plugins/curdx-flow/references/bounded-parallel-dispatch.md` — copy old doc verbatim, then append §2 Domain Coverage, §3 Independence Criteria, §4 expanded anti-patterns (review + debug), §5 Subagent-vs-Grep, and add §1 cross-link to `coordinator-pattern.md`.
2. Replace `plugins/curdx-flow/references/parallel-research.md` content with the 1-line stub redirect.
3. Update path refs in `commands/research.md`, `commands/start.md`, `references/triage-flow.md` (3 confirmed hard refs).
4. Grep-verify `commands/{requirements,design,tasks}.md` — edit only those with literal old-path string.
5. Create `tests/runner/bounded-parallel-dispatch-doc.test.ts` with 8 assertions mapped above.
6. Append `CHANGELOG.md` entry under unreleased: Added (review/debug rules, 3-criteria checklist), Changed (rename `parallel-research.md` → `bounded-parallel-dispatch.md`, cross-link to coordinator-pattern.md).
7. Run `npm run verify` end-to-end; confirm new test passes and existing tests stay green.
