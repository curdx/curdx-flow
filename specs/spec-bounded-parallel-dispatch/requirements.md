---
spec: spec-bounded-parallel-dispatch
epic: superpowers-uplift
phase: requirements
created: 2026-05-06
---

# Requirements: spec-bounded-parallel-dispatch

## Goal

Generalize "fan-out by independent domain + coordinator-as-single-truth-source" from research-only to research/review/debug, formalize 10 anti-patterns + 3 independence criteria, avoid Anthropic's "predilection for subagents" warning — all doc-only, no skill bloat.

## Success Criteria

- New `references/bounded-parallel-dispatch.md` ships with research + review + debug domain rules; old `references/parallel-research.md` resolves via 1-line stub redirect (zero broken links).
- 3 independence criteria (input / output / context) appear as explicit pre-flight checklist that any future parallel-dispatch command can copy-paste.
- ≥10 anti-patterns documented (3 existing research + 5 review + 5 debug); each cited or paraphrased from R1's 25 sources.
- 6 inbound `commands/*.md` consumers (research, start, requirements, design, tasks, triage) keep working — verified by drift test.

## Glossary

- **Bounded parallel dispatch** — N agents fan out only when 3 independence criteria all hold; coordinator owns synthesis.
- **3 independence criteria** — independent input (no agent waits on peer's output) / independent output (no write conflicts) / independent context (no agent reads peer's mid-flight state).
- **Review domain** — phase-boundary parallel review against frozen artifact (e.g., diff, design.md). Safe because input is immutable snapshot.
- **Debug domain** — investigating a live failure. Materially riskier; requires sequential triage → narrow ≤3 leads → parallel deep-dive → explicit verifier.
- **Coordinator-as-single-truth-source** — only the coordinator writes the final synthesis; agents never peer-to-peer.
- **Stub redirect** — old path file containing 1-line pointer to new path, kept indefinitely for backwards compat.

## Personas

### Primary: spec workflow consumer (Claude in coordinator role)

Reads this doc when a `commands/*.md` instructs to dispatch a parallel team. Needs unambiguous rules per-domain.

### Secondary: spec author (writing future commands that dispatch in parallel)

Reads this doc to design new dispatch patterns (e.g., spec B's parallel reviewer). Needs the 3-criteria checklist as gate.

## User Stories

### US-1: New canonical doc at `bounded-parallel-dispatch.md`

**As** a coordinator-role agent
**I want** the parallel dispatch reference at `bounded-parallel-dispatch.md` with research / review / debug coverage
**So that** I can apply the same rules across all 3 domains without consulting different docs.

**Acceptance:**
- [ ] AC-1.1: File `plugins/curdx-flow/references/bounded-parallel-dispatch.md` exists.
- [ ] AC-1.2: Sections include: Coordinator Role, Domain Coverage (Research/Review/Debug), 3 Independence Criteria, Per-Domain Anti-patterns, Subagent-vs-Grep Guidance, 5-step Dispatch Pattern, Merging Results.
- [ ] AC-1.3: Research-domain content (3 existing anti-patterns + 5-step pattern) preserved verbatim from old doc — no regression.

### US-2: Old path stub redirect

**As** any consumer linking to the old `parallel-research.md` path
**I want** that path to resolve to a 1-line stub pointing to the new doc
**So that** no inbound link breaks (3 hard refs in commands + 9 soft prose mentions).

**Acceptance:**
- [ ] AC-2.1: `plugins/curdx-flow/references/parallel-research.md` exists post-merge.
- [ ] AC-2.2: File contains exactly 1 redirect line pointing to `bounded-parallel-dispatch.md`.
- [ ] AC-2.3: Stub kept indefinitely (no deletion timeline in this spec).

### US-3: 3 independence criteria as pre-flight checklist

**As** a coordinator about to dispatch a parallel team
**I want** an explicit checklist (independent input / output / context)
**So that** I can refuse to fan out when any criterion fails — preventing the "subagent overuse" anti-pattern.

**Acceptance:**
- [ ] AC-3.1: New doc has a §3 Independence Criteria section with all 3 items.
- [ ] AC-3.2: Each criterion lists: definition + failure mode if ignored.
- [ ] AC-3.3: Section framed as "checklist" — must pass ALL 3 before dispatch.

### US-4: 5 review-domain anti-patterns

**As** spec B (which depends on this doc for parallel reviewer dispatch)
**I want** review-specific anti-patterns documented
**So that** reviewer roles don't drift, dedupe, or stomp on stale state.

**Acceptance:**
- [ ] AC-4.1: New doc has §Review Anti-patterns subsection.
- [ ] AC-4.2: All 5 from R1 listed: fixation-on-obvious / duplicate-without-dedup-owner / contradictions-without-synthesis / stale-state-reviewer / role-prompt-specialization-drift.
- [ ] AC-4.3: Each anti-pattern has 1-sentence description + 1-sentence "what coordinator should do instead".

### US-5: 5 debug-domain anti-patterns

**As** any future debug-fan-out caller
**I want** debug-specific anti-patterns + the "never fan-out-first" rule
**So that** I avoid token-burn on dead leads and combine-half-truths into wrong root cause.

**Acceptance:**
- [ ] AC-5.1: New doc has §Debug Anti-patterns subsection.
- [ ] AC-5.2: All 5 from R1 listed: hypothesis-overwrite / prover-without-verifier / partial-findings-Frankenstein / dead-end-budget-burn / missing-attribution.
- [ ] AC-5.3: Subsection states explicitly: "sequential triage → narrow to ≤3 leads → parallel deep-dive → explicit verifier — never fan-out-first."

### US-6: 6 inbound commands updated to new path

**As** a maintainer running `grep parallel-research` post-merge
**I want** all 6 `commands/*.md` consumers (research, start, requirements, design, tasks, triage) to link to the new path
**So that** consumers reach the new content directly without going through the redirect.

**Acceptance:**
- [ ] AC-6.1: All 6 command files updated — link to `bounded-parallel-dispatch.md`.
- [ ] AC-6.2: 9 soft prose mentions in `specs/` left unchanged (path-rename is mechanical only — old refs resolve via stub).
- [ ] AC-6.3: No new commands consume this doc (scope discipline).

### US-7: Drift-detection test

**As** a CI maintainer
**I want** a test that fails if doc content drifts or path links go stale
**So that** future edits can't silently break the contract.

**Acceptance:**
- [ ] AC-7.1: New test file under `tests/runner/` (mirrors spec A's `iron-law-doc.test.ts` pattern).
- [ ] AC-7.2: Asserts: (a) ≥10 anti-patterns documented; (b) all 3 independence criteria present; (c) all 6 commands link to new path; (d) old stub exists.
- [ ] AC-7.3: Test runs as part of `npm run verify` chain.

### US-8: CHANGELOG entry

**As** a release reader
**I want** the rename + new content called out under Added/Changed
**So that** downstream consumers (esp. spec B) know when this doc became canonical.

**Acceptance:**
- [ ] AC-8.1: `CHANGELOG.md` has new entry under unreleased section.
- [ ] AC-8.2: Categorized: Added (review/debug rules, 3-criteria checklist), Changed (rename), Fixed (none expected).
- [ ] AC-8.3: References this spec ID.

## Functional Requirements

### FR-Doc (content)

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| FR-Doc-1 | New doc covers 3 domains: research, review, debug | High | Section grep |
| FR-Doc-2 | 3 independence criteria as pre-flight checklist | High | Section grep |
| FR-Doc-3 | ≥10 anti-patterns total (3 research + 5 review + 5 debug) | High | Drift test count |
| FR-Doc-4 | Subagent-vs-grep guidance present (Anthropic warning cited) | High | Section grep |
| FR-Doc-5 | 5-step dispatch pattern preserved verbatim | High | Diff vs old doc |
| FR-Doc-6 | Each anti-pattern has "do this instead" remediation | Medium | Manual review |

### FR-Path (rename + stub)

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| FR-Path-1 | New file at `references/bounded-parallel-dispatch.md` | High | File exists |
| FR-Path-2 | Old `references/parallel-research.md` becomes 1-line stub | High | File line-count + content |
| FR-Path-3 | Stub kept indefinitely | High | No deletion in tasks |

### FR-Refs (inbound updates)

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| FR-Refs-1 | 3 hard-path refs in `commands/{research,start,triage}.md` updated | High | Grep |
| FR-Refs-2 | Other 3 commands (`requirements,design,tasks`) updated if they link | High | Grep |
| FR-Refs-3 | 9 soft prose mentions in `specs/` left as-is | Low | No-touch |

### FR-Test (drift)

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| FR-Test-1 | New test in `tests/runner/` asserts content + path consistency | High | Test runs |
| FR-Test-2 | Test fails if anti-pattern count drops below 10 | High | Self-test |
| FR-Test-3 | Test fails if any of 6 commands lose the link | High | Self-test |
| FR-Test-4 | Test fails if old stub deleted | Medium | Self-test |

## Non-Functional Requirements

| ID | Requirement | Metric | Target |
|---|---|---|---|
| NFR-1 | Backwards compat | Old path resolves | 100% (stub present) |
| NFR-2 | Doc quality | Anti-pattern count, all sourced | ≥10, all from R1's 25 sources |
| NFR-3 | Test coverage | Drift test catches content + path drift | Both axes covered |
| NFR-4 | Scope discipline | New skills added | 0 (skill-bloat cap) |
| NFR-5 | Code-side blast radius | Hooks/agents/state/schema changes | 0 (doc-only) |

## Out of Scope

- New skill creation (epic-level skill-bloat cap; doc is consumed via `commands/*.md` direct read).
- Code-side dispatch orchestration changes (doc-only spec).
- Spec B's parallel reviewer implementation (B's responsibility — this spec only provides the contract).
- Deletion of old stub redirect (kept indefinitely).
- Updating 9 soft prose mentions in `specs/` (resolves via stub; not worth churn).

## Dependencies

### Internal

None — this spec is independently startable.

### Required-by

- **spec-two-stage-review (B)** — hard dependency. B reads §Review section + 3 independence criteria for parallel reviewer dispatch contract. Must merge before B enters implementation.

## Open Questions for Design

1. **Single-PR vs phased rollout?** Single PR (rename + content + 6 ref updates + test + CHANGELOG) vs split into (a) add new doc + stub, (b) update inbound refs, (c) ship test — defer to design.
2. **Drift test assertion shape?** Assert exact count `≥10` vs structural `≥3 per domain` — defer to design.
3. **Cross-link to `coordinator-pattern.md`?** Old doc didn't, but tightly related — defer to design.

## Risks

- **R1 (low):** Inbound soft-prose mentions in `specs/` not updated → users could land on stub and re-click. Mitigation: stub redirect text is unambiguous; soft mentions can be lazy-updated later.
- **R2 (low):** Anti-pattern wording drift between this doc and spec B's review command → keep as drift-test invariant.

## Validation Strategy

- New `tests/runner/bounded-parallel-dispatch-doc.test.ts` (mirrors spec A's `iron-law-doc.test.ts` pattern).
- Inbound `commands/*.md` grep verifies new path on all 6 consumers.
- Backwards-compat check: old path resolves and contains exactly 1 redirect line.
- `npm run verify` passes (typecheck + check:hooks-fresh + test:hooks + new drift test).

## Next Steps

1. Run `/curdx-flow:design` — produce architecture (file layout, drift-test shape, phasing decision).
2. Resolve 3 open design questions above.
3. Generate task list (≤8 tasks per Size S).
