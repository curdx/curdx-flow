# Two-Stage Review: Domain Boundary + Anti-Rationalization + SLSA Verdict Shape

> Single source of truth for the curdx-flow two-stage review protocol. This file is intentionally
> compaction-resilient — every other surface (agent prompts, entrypoint skills, drift test) points back here.

## Contents

- [Why two reviewers](#why-two-reviewers)
- [Section 1: Domain Boundary Table](#section-1-domain-boundary-table)
- [Section 2: Anti-Rationalization Rule](#section-2-anti-rationalization-rule)
- [Section 3: SLSA-Shape Verdict Field Glossary](#section-3-slsa-shape-verdict-field-glossary)
- [Section 4: 3-Layer Drift Defense Implementation Details](#section-4-3-layer-drift-defense-implementation-details)
- [Section 5: Exclusion List Minimum Keyword Set](#section-5-exclusion-list-minimum-keyword-set)
- [Cross-References](#cross-references)

## Why two reviewers

A single reviewer agent that owns both **spec-compliance** (does this artifact match its requirements / phase contract?)
and **code-quality** (is the resulting code well-shaped?) inevitably drifts: training-data familiarity with code
smells overpowers the narrower spec-trace concern, leading to off-domain noise in spec-compliance reviews
and blind spots in quality coverage. Splitting into two independent reviewers — dispatched in parallel from
the design / tasks phase boundary — gives each a single concern axis (see
[`bounded-parallel-dispatch.md`](./bounded-parallel-dispatch.md) → "Review domain anti-pattern #4 Fixation on obvious")
and a structural exclusion list that prevents either reviewer from re-importing the other's domain.

## Section 1: Domain Boundary Table

This is the authoritative split. Each reviewer **must stay strictly inside its column**; the
[exclusion list](#section-5-exclusion-list-minimum-keyword-set) and the
[3-layer drift defense](#section-4-3-layer-drift-defense-implementation-details) are the structural
mechanisms that make this stick.

| Concern | `specCompliance` (spec-reviewer) | `codeQuality` (code-quality-reviewer) |
|---|---|---|
| **Checks** | Traceability to requirements; phase artifact structure (front-matter, sections); requirement coverage; cross-cutting impact on other specs; design decisions traceable to requirements; tasks-exist gate | Code smell; security; implementation quality; readability; test quality; no-hallucination (imports / API calls / file paths / CLI flags / config keys / line refs) |
| **Examples (PASS)** | "Every FR has at least one task; phase frontmatter present; design.md cites a research source per decision" | "No god-objects; SQL parameterized; magic numbers named; tests assert behavior not implementation; no fabricated import paths" |
| **Examples (FAIL)** | "FR-3 has no design coverage"; "tasks.md missing `phase: tasks` frontmatter"; "decision lacks a research citation" | "500-line function does I/O + parsing + rendering"; "user input concatenated into shell"; "test only checks the mock was called" |
| **Exclusion zone** (this reviewer **must NOT** comment on) | Any code-shape / readability / security / smell / test-implementation issue — those belong to `codeQuality` | Any traceability / phase artifact structure / requirement coverage / artifact format concern — those belong to `specCompliance` |
| **Phase coverage (D4)** | All 5 phases (research / requirements / design / tasks / execution) | design + tasks only (v1); execution deferred to v2 |
| **Verdict store** | `verificationBlocks.<phase>.reviews.specCompliance` | `verificationBlocks.<phase>.reviews.codeQuality` |
| **Output protocol** | Markdown table + final line `REVIEW_PASS` or `REVIEW_FAIL` (byte-equal across both agents — FR-X3) | Same — markdown table + final line `REVIEW_PASS` or `REVIEW_FAIL` (byte-equal with spec-reviewer) |

**Behavior matrix** (D4) — when each reviewer is dispatched:

| Phase | `specCompliance` | `codeQuality` | Dispatch shape |
|---|---|---|---|
| research | yes | no | single reviewer |
| requirements | yes | no | single reviewer |
| **design** | **yes** | **yes** | **parallel two-stage** |
| **tasks** | **yes** | **yes** | **parallel two-stage** |
| execution | yes | no (deferred v2) | single reviewer |

## Section 2: Anti-Rationalization Rule

**Verdicts are immutable once emitted.** A reviewer cannot soften, retract, or talk-down a finding
post-hoc; nor can a coordinator argue findings down on the reviewer's behalf. This rule exists because
the cheapest way for a two-stage review to collapse back into a single-stage review is for one
reviewer to "be reasonable" and explain away the other's finding inside the synthesis step.

**Concretely**:

1. **Reviewer agents do not see each other's output.** The coordinator MUST NOT pass spec-reviewer's
   findings (or any summary of them) into the code-quality-reviewer prompt, and vice versa.
   This is enforced by Layer 2 of the [3-layer drift defense](#section-4-3-layer-drift-defense-implementation-details).
2. **A `FAIL` verdict cannot be downgraded** by the same reviewer in a subsequent run on the same
   artifact unless the artifact itself changed (commit SHA differs). Re-running on an unchanged
   artifact and emitting a different verdict is a drift signal — the test
   `tests/runner/two-stage-review.test.ts` checks the protocol byte-equality but the reviewer prompts
   themselves carry the rule textually for compaction resilience.
3. **The coordinator does not arbitrate findings between reviewers.** If `specCompliance.findings`
   says "missing FR-3 trace" and `codeQuality.findings` says "the FR-3 implementation is fine," the
   coordinator does NOT cancel one against the other. Both verdicts are stored verbatim under
   `verificationBlocks.<phase>.reviews`. The QuickMode branch (D5) decides which one blocks; it
   never edits findings.
4. **No "advisory downgrade" outside QuickMode.** In normal mode, either `FAIL` blocks. The
   `advisory: true` flag exists only to mark a code-quality `FAIL` that QuickMode has chosen to
   surface-but-not-block — it is set by the coordinator branch, never by the reviewer, and never on
   `specCompliance`.

> Cross-reference: [`bounded-parallel-dispatch.md`](./bounded-parallel-dispatch.md) → "Review domain
> anti-pattern #6 Contradictions without synthesis" describes the related but distinct case where
> N reviewers contradict each other on the same axis. Two-stage review is partition-by-axis, so
> contradictions in this protocol are by definition cross-domain — and cross-domain contradictions
> are not arbitrated, both verdicts stand.

## Section 3: SLSA-Shape Verdict Field Glossary

Verdicts are stored under the existing `verificationBlocks` map (peer to spec-A's Iron Law shape) so
that the [Iron Law](./iron-law-verification.md) and the two-stage review share one verification
manifest per phase. **Storage shape**:

```ts
verificationBlocks.<phase>.reviews = {
  specCompliance?: ReviewVerdict;
  codeQuality?: ReviewVerdict;
}

interface ReviewVerdict {
  verdict: "PASS" | "FAIL" | "advisory";
  findings: string[];
  reviewerId: "spec-compliance" | "code-quality";
  timestamp: string;     // ISO 8601 UTC, when the reviewer emitted its final line
  advisory?: boolean;    // true when QuickMode bypass downgraded a code-quality FAIL
}
```

**Field reference**:

| Field | Required | Example | Notes |
|---|---|---|---|
| `verdict` | yes | `"PASS"` \| `"FAIL"` \| `"advisory"` | Mirrors the agent's final-line protocol (`REVIEW_PASS` / `REVIEW_FAIL`). `advisory` is coordinator-set only, never reviewer-set. |
| `findings` | yes | `["FR-3 has no design coverage"]` | Verbatim list of finding strings; empty array allowed when `verdict === "PASS"`. |
| `reviewerId` | yes | `"spec-compliance"` \| `"code-quality"` | Stable string ID matching the keyed slot. The pair `(reviewerId, key)` MUST match: `specCompliance` slot ⇒ `reviewerId === "spec-compliance"`. |
| `timestamp` | yes | `"2026-05-06T18:13:42.001Z"` | ISO 8601 UTC. Used for staleness checks alongside the parent `VerificationBlock.timestamp`. |
| `advisory` | no | `true` | Set by the QuickMode coordinator branch when downgrading a code-quality `FAIL`. Never set on `specCompliance`. |

**Why keyed object, not array** (D3): `{ specCompliance, codeQuality }` gives O(1) lookup, mirrors
spec-A's keyed-by-phase `verificationBlocks` shape (substructure isomorphism), and preserves
semantic keys. An array of `{ reviewerId, ... }` would lose the slot semantics and force linear scans.
The fixed reviewer set is intentional — adding a third reviewer in v2 means adding a new key, not a
new shape.

**Backwards compatibility**: `reviews` is optional on `VerificationBlock`; a phase that runs only
spec-reviewer (research / requirements / execution per D4) writes only the `specCompliance` slot
and leaves `codeQuality` undefined. Schema validation in `plugins/curdx-flow/schemas/spec.schema.json`
treats both sub-keys as optional with `additionalProperties: false` to prevent silent drift.

**Write path** (FR-T3): Verdict objects are merged into state via `curdx-flow state merge` — never
hand-written into `.curdx-state.json`. The coordinator command file (`skills/design/SKILL.md`,
`skills/tasks/SKILL.md`) constructs the `reviews` patch and pipes it through merge-state for atomicity.

## Section 4: 3-Layer Drift Defense Implementation Details

A single layer of defense is not enough — prose-only role boundaries get compacted away over long
sessions, and prompt-only exclusions get rationalized through. The protocol therefore stacks three
independent layers; **each one has to fail for drift to occur**.

### Layer 1 — Independent judge (separate Agent subagent thread)

The coordinator dispatches `code-quality-reviewer` via `Agent(agent_type: code-quality-reviewer, ...)`,
which spawns a **fresh thread**. The reviewer does NOT run inline in the coordinator's context.
This means:

- The code-quality reviewer cannot inherit any spec-reviewer reasoning that the coordinator
  internally accumulated.
- The reviewer's own context window is bounded; it cannot grow into territory adjacent to
  `specCompliance` simply by sitting in a long-running coordinator turn.
- Implementation: see `skills/design/SKILL.md` Step 4 and `skills/tasks/SKILL.md` Step 4 — both follow the
  ONE-message dual-Agent dispatch pattern from [`bounded-parallel-dispatch.md`](./bounded-parallel-dispatch.md).

### Layer 2 — Isolated context (no cross-pollination)

The coordinator MUST NOT include the spec-reviewer's output (or any summary, abstract, or quote of
it) in the code-quality-reviewer prompt — and the inverse MUST also hold. Both reviewers see only:

- The artifact path being reviewed (e.g. `./specs/<spec>/design.md`).
- The artifact contents (read-only, frozen at coordinator dispatch time — see
  [`bounded-parallel-dispatch.md`](./bounded-parallel-dispatch.md) Review anti-pattern #7
  "Stale-state reviewer").
- This reference doc (linked from each reviewer's role boundary section).

This layer is the structural mechanism behind the [anti-rationalization rule](#section-2-anti-rationalization-rule):
without each other's output, neither reviewer **can** argue the other's finding down.

### Layer 3 — Structural exclusion list

Each reviewer prompt carries an **explicit `do NOT comment on` section** listing the keywords from
the other reviewer's domain. The drift test
(`tests/runner/two-stage-review.test.ts`) asserts:

- `spec-reviewer.md` has zero hits for the code-quality keyword set
  (`code quality`, `smell`, `security`, `readability`).
- `code-quality-reviewer.md` exists and contains **at least 4** entries from the
  [exclusion list minimum keyword set](#section-5-exclusion-list-minimum-keyword-set).

CI runs the drift test on every PR (FR-N5 reverse-grep gate). If a future edit to either reviewer
prompt re-imports off-domain keywords, the test fails before merge. **All three layers must hold**;
the test enforces only Layer 3 directly, but Layer 3 failing is a strong signal that Layer 1 or
Layer 2 has also been weakened (e.g. someone copy-pasted spec-reviewer output into the code-quality
prompt and dragged the spec-compliance vocabulary along).

For the concrete rubric items each reviewer enforces, see:

- [`agents/spec-reviewer.md`](../agents/spec-reviewer.md) — narrowed Pass-1..Pass-4 per E1 audit
  13-item map.
- [`agents/code-quality-reviewer.md`](../agents/code-quality-reviewer.md) — 30+ adapted rubric items
  across 6 categories (code smell / security / implementation quality / readability / test quality /
  no-hallucinations).

## Section 5: Exclusion List Minimum Keyword Set

The Layer 3 structural exclusion list in `code-quality-reviewer.md` MUST contain at minimum the
following four phrases verbatim. They are the byte-level test fixtures of the drift suite — changing
them silently means changing the protocol contract.

| Phrase | What it forbids the code-quality reviewer from doing | Owned by |
|---|---|---|
| `traceability to requirements` | Commenting on whether each FR has a corresponding implementation / task | `specCompliance` |
| `phase artifact structure` | Commenting on phase frontmatter, section headers, or required sections | `specCompliance` |
| `requirement coverage` | Commenting on whether requirements are fully addressed by design / tasks | `specCompliance` |
| `artifact format / front-matter` | Commenting on YAML frontmatter fields, formatting, or artifact-level metadata | `specCompliance` |

**Why exactly these four**: they cover the four authoritative axes of the spec-compliance domain
(traceability, structure, coverage, format) without overlapping with each other. A code-quality
finding that touches any of these axes is by definition out-of-scope and should be re-routed through
spec-reviewer instead.

**Drift test assertion** (`tests/runner/two-stage-review.test.ts`):

```ts
const requiredExclusions = [
  "traceability to requirements",
  "phase artifact structure",
  "requirement coverage",
  "artifact format / front-matter",
];
const cqr = readFileSync("plugins/curdx-flow/agents/code-quality-reviewer.md", "utf8");
const hits = requiredExclusions.filter(p => cqr.includes(p)).length;
expect(hits).toBeGreaterThanOrEqual(4);
```

If a future PR edits `code-quality-reviewer.md` and removes any of the four phrases, this assertion
fails and the PR cannot merge. The phrases are intentionally pinned at the byte level, not at the
semantic level — semantic equivalents ("requirement traceability" vs "traceability to requirements")
do NOT satisfy the gate. This rigidity is the price of compaction resilience.

## Cross-References

**Agent prompts**:
- `plugins/curdx-flow/agents/spec-reviewer.md` — narrowed reviewer covering `specCompliance`
- `plugins/curdx-flow/agents/code-quality-reviewer.md` — independent reviewer covering `codeQuality`

**Coordinator entrypoint skills** (where parallel dispatch lives):
- `plugins/curdx-flow/skills/design/SKILL.md` — Step 4 Artifact Review, dual-Agent dispatch
- `plugins/curdx-flow/skills/tasks/SKILL.md` — Step 4 Artifact Review, dual-Agent dispatch

**Schema and types**:
- `src/hooks/_shared/types.ts` — `VerificationBlock.reviews` field + `ReviewVerdict` interface
- `plugins/curdx-flow/schemas/spec.schema.json` — `reviews` sub-schema (optional, additive)

**Drift detection**:
- `tests/runner/two-stage-review.test.ts` — asserts Layer 3 exclusion list, byte-equal final-line
  protocol, and reverse-grep on spec-reviewer narrowing

**Related references**:
- [`bounded-parallel-dispatch.md`](./bounded-parallel-dispatch.md) — independence criteria, ONE
  message dispatch rule, Review-domain anti-patterns (especially #4, #6, #7, #8)
- [`iron-law-verification.md`](./iron-law-verification.md) — parent `verificationBlocks` shape that
  `reviews` lives inside; staleness / freshness rules apply transitively
- [`coordinator-pattern.md`](./coordinator-pattern.md) — single-coordinator-as-truth-source rationale
  for why reviewer reconciliation lives in the command file, not in either agent

**State-write path**:
- `src/hooks/lib/merge-state.ts` — atomic merge for `verificationBlocks.<phase>.reviews` writes
  (FR-T3, never hand-edited)
