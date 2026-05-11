# Source Coverage Audit

The planner and reviewers must prove that generated tasks cover the source
intent. This is a hard quality gate, not a documentation nicety.

## Source Set

Check every available source:

- Goal text from `.progress.md` or state identity.
- `research.md`: constraints, discovered patterns, current docs, risks.
- `requirements.md`: FR, NFR, AC, glossary, out-of-scope.
- `design.md`: decisions, interfaces, data flow, migration/rewrite boundaries.
- `projectTopology` and `recommendedCapabilities` from `curdx-flow snapshot`.
- Explicit user locked decisions in the current prompt or state.

## Audit Format

The task-planner must include this section before the task list:

```markdown
## Source Coverage Audit

| Source | Item | Covered By | Status |
| --- | --- | --- | --- |
| FR-1 | Short item text | 1.1 | COVERED |
| D-2 | Short decision text | 1.2, V1 | COVERED |
```

Allowed statuses:

- `COVERED`: implemented or verified by listed task ids.
- `DEFERRED`: explicitly out of scope in source artifact.
- `BLOCKED`: cannot be planned because a dependency or fact is missing.

`MISSING` is never allowed in a final `tasks.md`. If an item is missing, the
agent must return `TASKS_BLOCKED` or the reviewer must return `REVIEW_FAIL`.

## Scope Reduction Ban

Do not weaken source items. These phrases are hard-fail signals unless they
quote an explicit deferred requirement:

- `v1`, `v2`, `MVP only`
- `placeholder`
- `basic version`
- `static for now`
- `wire later`
- `future enhancement`
- `skip for now`
- `simplified`

When the work is too large, split the spec or return `TASKS_BLOCKED`; never
silently produce a weaker plan.

## Reviewer Enforcement

`spec-reviewer` must fail tasks/design artifacts when:

- A source item is absent from the audit.
- A `COVERED` row points to a nonexistent task id.
- A `DEFERRED` row has no source-backed deferral.
- A task implements behavior contradicted by out-of-scope/deferred source text.
