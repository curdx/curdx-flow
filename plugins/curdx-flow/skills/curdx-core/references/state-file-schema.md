# State File Schema

curdx-flow uses `.curdx-state.json` to track execution state.

## Location

```
./specs/<spec-name>/.curdx-state.json
```

## Schema

```json
{
  "phase": "research|requirements|design|tasks|execution|completed",
  "taskIndex": 0,
  "totalTasks": 0,
  "taskIteration": 1,
  "maxTaskIterations": 5,
  "awaitingApproval": false,
  "completed": false,
  "completedAt": "2026-05-04T12:00:00.000Z"
}
```

## Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `phase` | string | Current workflow phase |
| `taskIndex` | number | 0-based index of current task |
| `totalTasks` | number | Total tasks in tasks.md |
| `taskIteration` | number | Current retry attempt (1-based) |
| `maxTaskIterations` | number | Max retries before blocking |
| `awaitingApproval` | boolean | Waiting for user to proceed |
| `completed` | boolean | Spec fully complete (all tasks done, terminal state) |
| `completedAt` | string (date-time) | ISO 8601 UTC timestamp when spec entered completed phase |

### Completion Fields

- `completed: boolean` — terminal flag set when all tasks in tasks.md are checked off; coordinator transitions phase to `completed` and writes this true.
- `completedAt: string (date-time)` — ISO 8601 UTC timestamp captured at the moment `completed` flips to true; unset on refactor.

## Phase Values

| Phase | Description |
|-------|-------------|
| `research` | Research phase active |
| `requirements` | Requirements gathering |
| `design` | Technical design |
| `tasks` | Task planning |
| `execution` | Task execution loop |
| `completed` | Spec fully complete (terminal state, all tasks done) |

## State Transitions

```
research -> requirements -> design -> tasks -> execution
execution → completed (completed: true)
completed → execution (refactor: completed: false, $unset completedAt)
```

Each phase sets `awaitingApproval: true` after completion (except quick mode).

## Corruption Handling

If state file missing or invalid JSON:
1. Output error with state file path
2. Suggest re-running the implement command
3. Do NOT continue execution

## Validation

Coordinator validates state against tasks.md checkmarks. If `taskIndex` doesn't match checked task count, state is reset.
