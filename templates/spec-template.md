# Spec: {{FEATURE_NAME}}

**Feature ID:** {{FEATURE_ID}}
**Status:** draft
**Created:** {{DATE}}

## Goal

{{ONE_PARAGRAPH_GOAL}}

> What problem are we solving for whom? Write in user-language. No technology terms.

## User Stories

- **US-1:** As a {{role}}, I want to {{action}}, so that {{outcome}}.
- **US-2:** ...

## Acceptance Criteria

For each user story, list **falsifiable** criteria. Reviewer must be able to check each one as a yes/no.

- **AC-1.1:** Given {{precondition}}, when {{action}}, then {{observable result}}.
- **AC-1.2:** ...
- **AC-2.1:** ...

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | ... | MUST / SHOULD / MAY |
| FR-2 | ... | ... |

## Non-Functional Requirements

| ID | Requirement | Metric / Target |
|----|-------------|-----------------|
| NFR-1 | Performance: page load | < 2s on 4G |
| NFR-2 | Security: no plaintext secrets | manual + automated scan |

## Out of Scope

Explicit list. For each, state **why** it's excluded (defer / never / different feature).

- ...

## Dependencies

- Other features that must ship first: ...
- External services: ...
- Data we need but don't have yet: ...

## Success Signal

How do we know in production this worked? (Not "tests pass" — that's verify. This is the *real* outcome.)

- ...

## Research Findings

Pre-flight research produced by `curdx-analyst` before spec was finalized. Canonical artifact is `findings.json` (same directory) — this table is the human-readable mirror.

Every `blocker` finding has a `preflight_cmd` that `/curdx:ship` runs before push; a failing blocker aborts the push. `advisory` findings surface as warnings but do not block.

| ID | kind | assertion | severity | source |
|----|------|-----------|----------|--------|
| F1 | version | ... | blocker | https://... |
| F2 | env | ... | blocker | — |
| F3 | api | ... | advisory | https://... |

If the feature has no predictable runtime risks, this table is empty and `findings.json` has `"findings": []`. That is legal; don't invent risks.

## Open Questions

Use `/curdx:clarify` to resolve these. Each Q gets a recorded A.

- [ ] ...
