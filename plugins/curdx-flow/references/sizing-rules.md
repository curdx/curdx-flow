# Sizing Rules

> Used by: task-planner agent

Determine the active granularity from `.curdx-state.json::autoPolicy.taskGranularity`.
If no `autoPolicy` exists, fall back to `granularity`, then `standard`.

## AutoPolicy Size Targets

| Size | Execution mode | Target top-level tasks | Rule |
|------|----------------|------------------------|------|
| XS | direct | 0-1 | No tasks.md unless user explicitly asks |
| S | spec-lite | 1-3 | One task per bounded vertical slice |
| M | standard | 3-7 | Default for normal feature work |
| L | deep-spec | 5-12 | High-risk or publish-critical work |
| XL | epic-triage | 5-10 per spec | Split into multiple specs first |

If a single spec would exceed 12 top-level tasks, do not keep splitting the same
spec. Route to epic triage or split into multiple specs.

## Standard (default)

| Constraint | Value |
|-----------|-------|
| Target task count | AutoPolicy range, usually 3-7 or 5-12 |
| Max Do steps | 8 |
| Max files per task | 5 |
| Intermediate [VERIFY] | Phase boundary or high-risk slice only |
| [P] markers | Yes, only with zero file overlap |
| Final verification | Always |
| VE tasks | Only when policy verificationLevel is strict or E2E risk is explicit |

### Standard Split/Combine Rules

**Split if:**
- Task mixes unrelated logical concerns
- Task crosses an API/data/security boundary
- Files section exceeds 5 files
- Verify command cannot prove the whole slice

**Combine if:**
- "write test", "implement", "run test", and "commit" are separate tasks
- Multiple tasks touch the same component for the same behavior
- A task is only setup for the immediately following usage task

## Fine (explicit only)

| Constraint | Value |
|-----------|-------|
| Target task count | AutoPolicy range; never exceed 12 within one spec |
| Max Do steps | 4 |
| Max files per task | 3 |
| Intermediate [VERIFY] | Every 2-3 tasks only when verificationLevel is strict |
| [P] markers | Yes |
| Final V4-V6 | Always |
| VE tasks | Per project type |

### Fine Split/Combine Rules

**Split if:**
- Do section > 4 steps
- Files section > 3 files
- Task mixes creation + testing
- Task mixes > 1 logical concern
- Verification requires > 1 unrelated command

**Combine if:**
- Task 1 creates a file, Task 2 adds a single import to that file
- Both tasks touch the same file with trivially related changes
- Neither task is meaningful alone

## Coarse

| Constraint | Value |
|-----------|-------|
| Target task count | 1-3 for S, 3-5 for M |
| Max Do steps | 8-10 |
| Max files per task | 5-6 |
| Intermediate [VERIFY] | Phase boundary or high-risk slice only |
| [P] markers | Yes |
| Final V4-V6 | Always |
| VE tasks | Only when policy verificationLevel is strict or E2E risk is explicit |

### Coarse Split/Combine Rules

**Split if:**
- Do section > 10 steps
- Files section > 6 files
- Task mixes unrelated logical concerns
- Task crosses phase boundaries

**Combine if:**
- Multiple fine tasks touch the same component for the same concern
- Error handling + happy path are in the same component
- Setup + first usage are tightly coupled

### Coarse Guidance

- Each task remains a single logical concern (no bundling unrelated changes)
- Each task should be completable in a single focused session
- Combine what fine mode splits when they share a component and concern

## Shared Rules (all levels)

- 1 logical concern per task (always)
- A task is a vertical slice: test/reproduce + implementation + verification + commit
- Never split "write test", "write implementation", "run verification", and "commit" into separate top-level tasks
- Phase distribution ratios preserved proportionally
- [P] eligibility: zero file overlap, no output deps, not [VERIFY], no shared config
- Final verification sequence (V4-V6) always generated
- VE tasks follow `autoPolicy.verificationLevel`, not project type alone
- POC-first or TDD workflow selection unchanged by granularity
- Clarity test: each task executable without clarifying questions
- Simplicity principle: minimum code to achieve goal
- Surgical principle: touch only what the task requires
