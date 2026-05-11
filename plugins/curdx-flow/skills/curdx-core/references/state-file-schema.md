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
  "maxGlobalIterations": 30,
  "autoPolicy": {
    "version": 1,
    "mode": "auto",
    "size": "<legacy internal classifier label>",
    "risk": "medium",
    "executionMode": "standard",
    "taskGranularity": "standard",
    "taskTargetRange": { "min": 3, "max": 7 },
    "reviewCadence": "final",
    "verificationLevel": "standard",
    "subagentPolicy": "on-demand",
    "stopHookPolicy": "short-continuation"
  },
  "projectTopology": {
    "devContextFound": true,
    "roots": []
  },
  "recommendedCapabilities": [
    {
      "id": "context7",
      "phase": "before-coding",
      "invocation": "Context7 MCP",
      "reason": "external documentation or current API behavior is likely relevant",
      "instruction": "Use Context7 before editing so version-specific behavior is grounded in current docs."
    }
  ],
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
| `maxGlobalIterations` | number | Max execution loop iterations before blocking |
| `autoPolicy` | object | Deterministic policy controlling sizing, review, verification, subagents, and stop-hook behavior |
| `projectTopology` | object | Compact multi-root project facts returned by `smart-route` |
| `recommendedCapabilities` | array | Tool-use hints returned by `smart-route`; use only when the capability is installed and relevant |
| `awaitingApproval` | boolean | Waiting for user to proceed |
| `completed` | boolean | Spec fully complete (all tasks done, terminal state) |
| `completedAt` | string (date-time) | ISO 8601 UTC timestamp when spec entered completed phase |

### Completion Fields

- `completed: boolean` — terminal flag set when all tasks in tasks.md are checked off; coordinator transitions phase to `completed` and writes this true.
- `completedAt: string (date-time)` — ISO 8601 UTC timestamp captured at the moment `completed` flips to true; unset on refactor.

### AutoPolicy Fields

`autoPolicy` is computed by `hooks/scripts/lib/auto-policy.mjs` when a spec is created. Later phases must obey it instead of re-asking the user to choose fast/deep:

| Field | Values |
|-------|--------|
| `size` | legacy internal classifier label; skills should use `smart-route` behavior names instead |
| `risk` | `low`, `medium`, `high`, `critical` |
| `executionMode` | `direct`, `spec-lite`, `standard`, `deep-spec`, `epic-triage` |
| `taskGranularity` | `none`, `coarse`, `standard`, `fine` |
| `reviewCadence` | `minimal`, `final`, `periodic`, `strict` |
| `verificationLevel` | `targeted`, `standard`, `strict` |
| `subagentPolicy` | `none`, `on-demand`, `per-slice` |
| `stopHookPolicy` | `disabled`, `short-continuation`, `full-loop` |

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
