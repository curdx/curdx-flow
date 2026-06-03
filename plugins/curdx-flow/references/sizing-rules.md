# Sizing Rules

Use behavior routes and value slices. Avoid abstract size labels in prompts or task files.

## Route Targets

| Route | Target top-level tasks | Rule |
|---|---:|---|
| `direct-change` | 0 | No spec and no `tasks.md` unless explicitly requested |
| `lite-spec` | 1-3 | One task per bounded value slice |
| `full-spec` | 3-7 | Default for normal product or code behavior changes |
| high-risk `full-spec` | 5-12 | Publish-critical, security, data, plugin, or cross-module work |
| `epic-split` | 5-10 per child spec | Split before generating implementation tasks |

If a single spec would exceed 12 top-level tasks, do not keep splitting the same spec. Route to epic triage.

## Standard Constraints

| Constraint | Value |
|---|---|
| Max Do steps | 8 |
| Max files per task | 5 |
| Intermediate `[VERIFY]` | Phase boundary or high-risk slice only |
| `[P]` markers | Yes, only with zero file overlap |
| Final verification | Always |
| E2E verification tasks | Only when policy verification is strict or E2E risk is explicit |

## Coarse Constraints

| Constraint | Value |
|---|---|
| Target task count | 1-3 for local work, 3-5 for normal work |
| Max Do steps | 8-10 |
| Max files per task | 5-6 |
| Intermediate `[VERIFY]` | Phase boundary or high-risk slice only |
| Final verification | Always |

## Fine Constraints

Use fine granularity only when explicitly requested.

| Constraint | Value |
|---|---|
| Target task count | Still capped at 12 in one spec |
| Max Do steps | 4 |
| Max files per task | 3 |
| Intermediate `[VERIFY]` | Every 2-3 tasks only when verification is strict |
| Final verification | Always |

## Split Rules

Split a task only when:
- It mixes unrelated user-visible behaviors.
- It crosses an API, data, auth, security, or deployment boundary.
- The files section exceeds the active file limit.
- One verify command cannot prove the slice.

## Combine Rules

Combine tasks when:
- One task writes a test and the next implements the same behavior.
- One task implements and the next only runs verification or commits.
- Multiple tasks touch the same component for the same behavior.
- Setup exists only for the immediately following usage task.

## Shared Rules

- One logical concern per task.
- A task is a vertical slice: test/reproduce + implementation + verification + commit.
- Never split "write test", "write implementation", "run verification", and "commit" into separate top-level tasks.
- `[P]` eligibility requires zero file overlap, no output dependency, no `[VERIFY]` tag, and no shared config writes.
- Verification depth follows `autoPolicy.verificationLevel`.
- Review cadence follows `autoPolicy.reviewCadence`.
- Simplicity: minimum code to achieve the task.
- Surgical scope: touch only files required by the task.
