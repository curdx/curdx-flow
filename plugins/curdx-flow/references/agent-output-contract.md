# Agent Output Contract

Agents must finish with one of the exact markers below. Coordinators must parse
the marker, verify the artifact or evidence it claims, then update state.

## Markers

| Agent | Success | Failure / Pause |
| --- | --- | --- |
| `research-analyst` | `RESEARCH_COMPLETE` | `RESEARCH_BLOCKED` |
| `product-manager` | `REQUIREMENTS_COMPLETE` | `REQUIREMENTS_BLOCKED` |
| `architect-reviewer` | `DESIGN_COMPLETE` | `DESIGN_BLOCKED` |
| `task-planner` | `TASKS_READY` | `TASKS_BLOCKED` |
| `spec-executor` | `TASK_COMPLETE` | `TASK_FAILED`, `TASK_MODIFICATION_REQUEST` |
| `qa-engineer` | `VERIFICATION_PASS` | `VERIFICATION_FAIL` |
| `spec-reviewer` | `REVIEW_PASS` | `REVIEW_FAIL` |
| `code-quality-reviewer` | `REVIEW_PASS` | `REVIEW_FAIL` |
| `triage-analyst` | `EPIC_READY` | `EPIC_BLOCKED` |

## Required Evidence

Every success marker includes:

- `artifact`: path written or verified.
- `verify`: command or tool action run.
- `result`: concise evidence, not confidence language.
- `statePatch`: JSON patch the coordinator should merge, or `null`.

`TASK_COMPLETE` additionally includes:

- `taskId`
- `commit`
- `filesChanged`
- `verifyExitCode`

`TASK_MODIFICATION_REQUEST` must include fenced JSON with:

- `type`: `SPLIT_TASK`, `ADD_PREREQUISITE`, or `ADD_FOLLOWUP`
- `originalTaskId`
- `reasoning`
- `proposedTasks`

## Rejection Rules

Coordinators reject agent output when:

- The marker is missing or misspelled.
- The claimed artifact does not exist.
- The Verify command is absent for executable work.
- The output uses `done`, `implemented`, or `should work` without evidence.
- The result narrows scope with `v1`, `placeholder`, `later`, `basic`, or `static for now` unless the requirement explicitly deferred that behavior.
