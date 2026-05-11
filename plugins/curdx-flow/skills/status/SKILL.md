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
2. Resolve specs across configured dirs with the path resolver behavior:
   - current spec from `.current-spec`
   - all spec directories under configured `specs_dirs`
3. For each spec, read `.curdx-state.json` when present and count checked/unchecked task boxes in `tasks.md`.
4. Run the smart router without a new goal:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/lib/smart-route.mjs"
   ```
5. Use the router's `nextAction` as the recommended next action. If the router returns `blocked-ask-user`, recommend `/curdx-flow:start <name> <goal>`.

## Output Format

```text
# curdx-flow Status

Active spec: <name or none>

Recommended next action: <router nextAction>

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
