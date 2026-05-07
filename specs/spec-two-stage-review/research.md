---
spec: spec-two-stage-review
epic: superpowers-uplift
phase: research
created: 2026-05-07
researchers: [E1 spec-reviewer-audit, E2 review-touchpoints, R1 external-two-stage]
---

# Research: spec-two-stage-review

## Executive Summary

Existing `agents/spec-reviewer.md` is **246 LOC / 67 rubric items**. Domain audit shows **55% pure compliance / 25% pure quality / 19% straddling boundary** (13 items). The biggest narrowing wins: **delete Design/Principles (7 SOLID/DRY/KISS items — pure quality), split Design/Holistic-Awareness (5 items), split Tasks/Quality-Gates (2 items), move Execution/No-Hallucinations (6 items)**. Output protocol is straightforward: `REVIEW_PASS` / `REVIEW_FAIL` as last line + markdown table feedback. Spec-reviewer is invoked from **5 command files** at **5 phase boundaries** (post-research / post-requirements / post-design / post-tasks / quick-mode start). Currently **single-agent sequential** dispatch; spec C just landed `bounded-parallel-dispatch.md` so the parallel pattern is well-documented and ready to consume. External evidence (18 sources) converges on **per-phase-boundary review wins per-task review** (10× cost factor + LLM overcorrection bias on tiny diffs); **role-drift defense needs 3 layers** (independent judge + isolated context + structural exclusion lists). The verification-token-as-review-gate pattern aligns with **SLSA Verification Summary Attestation** structure — directly compatible with spec A's `verificationBlocks`.

## External Research (R1)

### Q1: Production split — spec-compliance vs code-quality reviewers

**Best example: Cloudflare 7-reviewer architecture** with explicit Codex (compliance) vs Code Quality split + "what NOT to flag" exclusion lists per reviewer prompt — closest 1:1 mapping to our two-stage design.

Other examples: Anthropic Claude Code review (parallel reviewers + verification step), GitHub Copilot review pipeline, Cursor review patterns. Common shape:
- Reviewer A: spec/contract conformance (does it match the plan?)
- Reviewer B: implementation quality (security, smells, readability)
- Each gets isolated context (fresh thread)
- Coordinator dedupes findings before showing user

### Q2: Reviewer prompt-isolation — preventing role drift

**Best pattern: 3-layer defense** —
1. Independent judge — fresh subagent thread per reviewer (no shared history)
2. Isolated context — each reviewer gets only its prompt + artifact, never the other reviewer's output
3. Structural exclusion lists in prompt — "do NOT comment on X domain" + JSON schema validation that discards off-domain findings

Without all 3 layers, role drift bleeds (e.g., code-quality reviewer starts commenting on whether spec is followed → duplicates spec-reviewer's findings).

### Q3: Per-task vs per-phase-boundary review

**Verdict: per-phase-boundary wins.** Convergent indirect evidence:
- 10× cost arithmetic (per-task at 10 tasks/phase = 10× LLM calls vs 1 per-phase)
- LLM overcorrection bias on tiny diffs (arXiv 2508.12358 — single-task diffs trigger nitpick fixation)
- Commit-then-review velocity (small diffs → review noise; phase-level diffs → meaningful boundary)

**Recommendation**: phase-boundary as default; `--strict-review` opt-in for per-task (Phase-2 superpowers behavior available but off by default).

### Q4: Verification token as review-passing 凭证

**Best example: SLSA Verification Summary Attestation** predicate shape — `{verifier, result, findings, specVersion, diffHash}` — combined with GitHub Branch Protection's "check attestation exists, don't re-verify" gating.

Direct alignment: spec A's `verificationBlocks: { [phase]: {command, exitCode, timestamp, srcMtime} }` already has the SLSA-shaped fields. Spec B's reviewers can write a peer entry like `verificationBlocks.<phase>.review = {reviewerType, verdict, findings[]}` — additive, doesn't conflict.

### Q5: QuickMode bypass

**1-2 CI patterns found**: GitHub Actions `if: !inputs.skip-quality` for advisory steps; CircleCI workflow filters that downgrade heavy gates to soft warnings in fast lanes.

Direct application: in quickMode, code-quality-reviewer fires but its output is logged as `advisory` (not `block`); coordinator continues regardless. spec-compliance reviewer remains hard gate even in quickMode.

## Codebase Analysis

### spec-reviewer current state (E1)

| Metric | Value |
|---|---|
| Total LOC | 246 |
| Top-level sections | 8 |
| Total rubric items | 67 |
| [COMPLIANCE] items | 37 (55%) |
| [QUALITY] items | 17 (25%) |
| [BOTH] (straddling) items | 13 (19%) |

### Per-phase rubric inventory (E1)

| Phase | Dimensions | Items | Boundary-straddling |
|---|---|---|---|
| Research | 3 | 6 | 0 |
| Requirements | 4 | 8 | 0 |
| Design | 6 | 23 | **8** |
| Tasks | 6 | 15 | **4** |
| Execution | 4 | 15 | **1** (+6 pure quality items in "No Hallucinations") |

### 13 boundary-straddling items + recommendations (E1)

**Design / Principles (DELETE entire section)** — 7 items on SOLID / DRY / KISS / YAGNI etc. These are pure code-quality concerns mis-classified as compliance. Move all to code-quality-reviewer.

**Design / Holistic Awareness (SPLIT)** — 5 items. Keep "must document cross-cutting impact" (compliance side); move "demonstrates good architectural thinking" (quality side).

**Tasks / Quality Gates (SPLIT)** — 2 items. Keep "[VERIFY] tasks exist where required" (compliance); move "[VERIFY] frequency optimal" (quality).

**Execution / No Hallucinations** — 6 items. All [QUALITY]; move entire section to code-quality-reviewer.

### Output protocol (E1)

- Final line: literal string `REVIEW_PASS` or `REVIEW_FAIL`
- Body: markdown table with columns | Item | Status | Details |
- On FAIL: mandatory `## Feedback` section with actionable bullets
- Coordinator parses last line for gating decision

### Review touchpoints in commands (E2)

**15 commands files; 5 invoke review:**
- `commands/research.md` — review at end of research phase
- `commands/requirements.md` — review at end of requirements
- `commands/design.md` — review at end of design
- `commands/tasks.md` — review at end of tasks
- `commands/start.md` — quick mode chains all of above

**Mode behavior:**
- Quick mode: spec-reviewer auto-invoked per phase (max 3 iterations review loop)
- Normal mode: spec-reviewer only on user "Run review" choice

**Current dispatch:** Single-agent sequential `Task(subagent_type: spec-reviewer, ...)` — needs upgrade to parallel two-stage.

**Phase boundaries for two-stage:**
- post-design (HIGH value — design quality matters)
- post-tasks (MEDIUM-HIGH — task structure matters)
- pre-commit (HIGH — final code review)
- Optional: post-research, post-requirements (LOWER value — content not yet code)

**Insertion difficulty:**
- Design / Tasks phases — **MEDIUM** (parallel dispatch pattern proven in `bounded-parallel-dispatch.md`; need merge logic)
- Execution phase — **HIGH** (requires spec-executor refactor + PR workflow coordination)

## Quality Commands

Same suite as prior specs:

| Command | Use |
|---|---|
| `npm run typecheck` | TS strict (low impact this spec — agent .md + prompt edits) |
| `npm run test:hooks` | 85 hook tests (no regression expected) |
| `npm run verify` | Full chain (must still pass) |

New tests this spec will add:
- `tests/runner/two-stage-review.test.ts` — verify code-quality-reviewer agent file exists, spec-reviewer narrowed prompt confirmed, command files updated to parallel dispatch
- Possibly fixture-based test for the 3-layer drift defense (independent judge + isolated context + exclusion lists)

## Related Specs

| Spec | Relevance | Relationship |
|---|---|---|
| spec-verification-iron-law (✅) | HIGH | Provides `verificationBlocks` token; B's reviewers can write `review` peer field SLSA-style |
| spec-bounded-parallel-dispatch (✅) | HIGH (hard dep) | Provides `bounded-parallel-dispatch.md` — review domain rules + 3 independence criteria |
| spec-subagent-context-reinjection | LOW | D may complement (subagent context for new code-quality-reviewer agent) |
| spec-cost-runaway-guards | LOW | E is hook-side; doesn't affect review |

## Feasibility Assessment

| Aspect | Assessment | Notes |
|---|---|---|
| **Technical fit** | HIGH | All seam points exist (Team API, agents/*.md, commands/*.md review hooks) |
| **Scope realism (size M)** | HIGH | 8-20 tasks: rubric audit + spec-reviewer narrow + code-quality-reviewer create + commands update (5 files) + tests + CHANGELOG |
| **External validation** | HIGH | 18 sources; per-phase-boundary verdict; 3-layer drift defense pattern proven |
| **Backwards compat risk** | MEDIUM | Spec-reviewer narrowing changes existing rubric — must preserve `REVIEW_PASS`/`REVIEW_FAIL` protocol byte-equal |
| **QuickMode performance impact** | LOW | Quick mode bypass: code-quality-reviewer advisory only |
| **Verification token integration** | HIGH | SLSA-shape predicate maps cleanly to `verificationBlocks` |

## Recommendations for Requirements Phase

1. **Acknowledge per-phase-boundary as default** — wire two-stage at post-design / post-tasks; defer per-task to opt-in flag (out of scope for v1)
2. **Narrow spec-reviewer surgically** — use E1's 13-item list as the authoritative cut/split/move map; don't expand or contract
3. **3-layer drift defense MUST be in code-quality-reviewer prompt** — independent context + structural exclusion list + (optional) JSON schema validation; without all 3, role drift will appear
4. **Verification token integration via SLSA shape** — write `verificationBlocks.<phase>.review = {verdict, findings, reviewerId, timestamp}` peer field; don't reuse the existing fields
5. **Insertion focus**: design + tasks phases v1; execution phase HIGH-difficulty deferred to v2 if scope grows
6. **QuickMode bypass for code-quality only** — spec-compliance remains hard gate even in quickMode (ironic-law still applies)

## Open Questions for Design Phase

1. Code-quality-reviewer prompt — write fresh OR adapt from existing spec-reviewer's [QUALITY] items?
2. Drift defense — add JSON schema validation as hard gate, or keep advisory?
3. Review verdict in `verificationBlocks` — peer field as suggested, or separate top-level `reviews` field?
4. Should narrowed spec-reviewer keep all 5 phases, or only design/tasks (where two-stage applies)?
5. Quick-mode bypass mechanism — env var, state field, or coordinator branch?

## Sources

### Web research (R1)
Full inline citations in `.research-external-two-stage.md` (18 sources). Key:
- Cloudflare 7-reviewer architecture
- SLSA Verification Summary Attestation
- arXiv 2508.12358 (LLM overcorrection bias)
- GitHub Branch Protection patterns

### Local repos
- `/Users/wdx/opc/curdx-flow/plugins/curdx-flow/agents/spec-reviewer.md` (246 LOC, 67 rubric items)
- `/Users/wdx/opc/curdx-flow/plugins/curdx-flow/commands/*.md` (15 files; 5 invoke review)

### Partial research files (will be deleted post-merge)
- `.research-spec-reviewer-audit.md` (E1, 361 lines)
- `.research-review-touchpoints.md` (E2, ~290 lines)
- `.research-external-two-stage.md` (R1, 329 lines, 18 sources)
