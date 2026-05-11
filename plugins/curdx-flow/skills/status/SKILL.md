---
name: status
description: Use when inspecting curdx-flow specs, active state, progress, or index status.
argument-hint: "[--update-index]"
allowed-tools: "Read Bash Glob Task"
disable-model-invocation: true
---

# Spec Status

Show current curdx-flow state and recommend one next action.

## Steps

1. If `$ARGUMENTS` contains `--update-index`, run:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/update-spec-index.mjs" --quiet
   ```
2. Run the workflow snapshot:
   ```bash
   curdx-flow snapshot
   ```
3. Use `snapshot.nextAction` as the recommended next action.
4. If `snapshot.active` is false, recommend `/curdx-flow:start <name> <goal>`.
5. If deeper index details are needed, read `specs/.index/index-state.json` after the optional update step.

## Output Format

```text
# curdx-flow Status

Active spec: <name or none>

Recommended next action: <snapshot.nextAction>

## Specs

### <spec-name> [ACTIVE]
Phase: <phase or completed timestamp>
Progress: <completed>/<total> tasks
Files: [x] research [x] requirements [ ] design [ ] tasks

---

Commands:
- /curdx-flow:start [name] [goal]
- /curdx-flow:switch <name>
- /curdx-flow:status --update-index
```

## Phase to Action Mapping

- `research` -> `/curdx-flow:requirements`
- `requirements` -> `/curdx-flow:design`
- `design` -> `/curdx-flow:tasks`
- `tasks` or `execution` -> `/curdx-flow:implement`
- `completed` -> `/curdx-flow:refactor` for changes, or `/curdx-flow:start` for new work
