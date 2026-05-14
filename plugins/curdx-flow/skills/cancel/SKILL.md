---
name: cancel
description: Use when stopping an active curdx-flow execution loop or removing spec state.
argument-hint: "[spec-name-or-path]"
allowed-tools: "Read Bash Agent AskUserQuestion"
disable-model-invocation: true
---


# Cancel Execution

You are canceling the active execution loop, cleaning up state files, and removing the spec directory.

**This is a destructive operation. You MUST get explicit user confirmation via `AskUserQuestion` before deleting anything.**

## Multi-Directory Resolution

This command uses the plugin runtime for multi-root spec discovery:

```bash
curdx-flow specs resolve [name-or-path]
curdx-flow specs find <name>
```

## Determine Target Spec

1. If `$ARGUMENTS` contains input:
   - If starts with `./` or `/`: treat as full path, validate it exists
   - Otherwise: treat as spec name, use `curdx-flow specs find "$input"` to search
2. If no argument provided:
   - Use `curdx-flow specs resolve` to get active spec path from `.current-spec`
3. If no active spec and no argument, inform user there's nothing to cancel and STOP. Do not proceed.

### Handle Disambiguation

If spec name exists in multiple roots (exit code 2 from find):

```
Multiple specs named '$name' found:
1. ./specs/$name
2. ./packages/api/specs/$name

Specify: /curdx-flow:cancel ./packages/api/specs/$name
```

Do NOT automatically select one. User must specify the full path.

## Check State

1. Check if `$spec_path/.curdx-state.json` exists (where `$spec_path` is the resolved full path)
2. Read state if present (for the summary shown to the user during confirmation)

## Gather Confirmation Context

Before asking the user to confirm, gather a short summary so the prompt is informative:

```bash
# Count tracked artifacts and any modified files inside the spec dir
find "$spec_path" -maxdepth 2 -type f -name '*.md' | wc -l         # artifact count
find "$spec_path" -type f | wc -l                                   # total file count
```

If `.curdx-state.json` exists, capture:
- `phase`
- `taskIndex / totalTasks`
- `globalIteration`

## MANDATORY: Confirm With User

Use `AskUserQuestion` with a single question containing:

- **question**: `Permanently delete spec '$spec_name' at '$spec_path'? This removes the spec directory and all its files. This cannot be undone.`
- **header**: `Confirm delete`
- **options**:
  1. `Delete` — proceed with full cleanup. Include in the description: `phase=<phase>, progress=<taskIndex>/<totalTasks>, files=<total file count>`.
  2. `Cancel` — abort, change nothing. Description: `Keep the spec directory and state file intact.`

If the user picks `Cancel` (or any "Other" answer that isn't a clear confirmation), output:

```
Cancellation aborted. Nothing was deleted.
Spec preserved at: $spec_path
```

and STOP. Do not run any `rm` command.

Only proceed to the Cleanup section if the user explicitly chose `Delete`.

## Cleanup

After confirmation:

1. Delete state file:
   ```bash
   rm -f "$spec_path/.curdx-state.json"
   ```

2. Remove spec directory:
   ```bash
   rm -rf "$spec_path"
   ```

3. Clear current spec marker:
   ```bash
   rm -f ./specs/.current-spec
   ```

4. Update Spec Index (removes deleted spec from index):
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/update-spec-index.mjs" --quiet
   ```

Quote every `$spec_path` use in the `rm` commands. Never run `rm -rf` against an unquoted variable or a path you have not just confirmed with the user.

## Output

```
Canceled execution for spec: $spec_name

Location: $spec_path
State before cancellation:
- Phase: <phase>
- Progress: <taskIndex>/<totalTasks> tasks
- Iterations: <globalIteration>

Cleanup:
- [x] Removed .curdx-state.json
- [x] Removed spec directory ($spec_path)
- [x] Cleared current spec marker

The spec and all its files have been permanently removed.

To start a new spec:
- Run /curdx-flow:new <name>
- Or /curdx-flow:start <name> <goal>
```

## If No Active Loop

If there's no `.curdx-state.json` but the spec directory exists, still confirm with the user first (same `AskUserQuestion`, mentioning that there's no active state — only the directory). On `Delete`, run the same cleanup and report:

```
No active execution loop found for spec: $spec_name

Location: $spec_path
Cleanup:
- [x] Removed spec directory ($spec_path)
- [x] Cleared current spec marker

The spec has been removed.

To start a new spec:
- Run /curdx-flow:new <name>
- Or /curdx-flow:start <name> <goal>
```
