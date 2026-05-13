---
name: new
description: Use when creating a new curdx-flow spec from a name and goal.
argument-hint: "<spec-name> [goal description] [--skip-research] [--specs-dir <path>]"
allowed-tools: "Bash Write Agent AskUserQuestion"
disable-model-invocation: true
---


# Create New Spec

You are creating a new specification and starting the research phase.

## Parse Arguments

From `$ARGUMENTS`, extract:
- **name**: The spec name (required, must be kebab-case, first argument)
- **goal**: Everything after the name except flags (optional)
- **--skip-research**: If present, skip research and start with requirements
- **--specs-dir <path>**: Create spec in specified directory (must be in configured specs_dirs array)

Examples:
- `/curdx-flow:new user-auth` -> name="user-auth", goal=none
- `/curdx-flow:new user-auth Add OAuth2 login` -> name="user-auth", goal="Add OAuth2 login"
- `/curdx-flow:new user-auth --skip-research` -> name="user-auth", goal=none, skip research
- `/curdx-flow:new api-auth --specs-dir ./packages/api/specs` -> create in specified dir

## Multi-Directory Resolution

This command uses the plugin runtime for multi-directory support:

```text
curdx-flow specs dirs             # Returns defaultDir and all configured spec directories
curdx-flow specs find <name>      # Find spec by name across configured roots
curdx-flow specs list             # List specs as {name,path} objects
curdx-flow specs resolve [input]  # Resolve current spec, name, or path
```

## --specs-dir Validation

When `--specs-dir` is provided:
1. Run `curdx-flow specs dirs` to get configured directories
2. Check if provided path matches one of the configured directories
3. If NOT in configured list: Error "Invalid --specs-dir: '$path' is not in configured specs_dirs"
4. If valid: Use this path as the spec root instead of default

```text
--specs-dir Validation Logic:

1. Extract --specs-dir value from $ARGUMENTS
2. Get configured dirs: `curdx-flow specs dirs`
3. Normalize paths (remove trailing slashes)
4. Check: specsDir in dirs?
   - YES: Use specsDir for spec creation
   - NO: Error "Invalid --specs-dir: '$specsDir' is not in configured specs_dirs. Configured: $dirs"
```

## Spec Directory Resolution

```text
Spec Directory Logic:

1. Check if --specs-dir in $ARGUMENTS
   - YES: Validate against configured specs_dirs, use if valid
   - NO: Use `defaultDir` from `curdx-flow specs dirs` (defaults to ./specs)

2. Determine spec base path:
   specsDir = validated --specs-dir OR runtime defaultDir
   basePath = "$specsDir/$name"

3. For .current-spec:
   - If specsDir == "./specs" (default): Write bare name
   - If specsDir != "./specs" (non-default): Write full path "$specsDir/$name"
```

## Capture Goal

<mandatory>
The goal MUST be captured before proceeding:

1. If goal text was provided in arguments, use it
2. If NO goal text provided, use AskUserQuestion to ask:
   "What is the goal for this spec? Describe what you want to build or achieve."
3. Store the goal verbatim in .progress.md under "Original Goal"
</mandatory>

## Validation

1. Verify spec name is provided
2. Verify spec name is kebab-case (lowercase, hyphens only)
3. If --specs-dir provided, validate against configured specs_dirs
4. Determine target directory: specsDir = (validated --specs-dir) OR runtime defaultDir
5. Check if `$specsDir/$name/` already exists. If so, ask user if they want to resume or overwrite

## Initialize

1. Determine spec directory and base path:
   ```text
   specsDir = (validated --specs-dir) OR runtime defaultDir
   basePath = "$specsDir/$name"
   defaultDir = runtime defaultDir
   ```

2. Create directory structure:
   ```bash
   mkdir -p "$basePath"
   ```

3. Update active spec tracker based on root directory:
   ```bash
   # Write to .current-spec in default specs dir
   if [ "$specsDir" = "$defaultDir" ]; then
       echo "$name" > "$defaultDir/.current-spec"     # Bare name for default root
   else
       echo "$basePath" > "$defaultDir/.current-spec" # Full path for non-default root
   fi
   ```

   For default-root specs, never write `specs/$name` to `.current-spec`; write the bare name only.

4. Ensure gitignore entries exist for spec state files:
   ```bash
   # Add .current-spec and .progress.md to .gitignore if not already present
   if [ -f .gitignore ]; then
     grep -q "specs/.current-spec" .gitignore || echo "specs/.current-spec" >> .gitignore
     grep -q "\*\*/\.progress\.md" .gitignore || echo "**/.progress.md" >> .gitignore
   else
     echo "specs/.current-spec" > .gitignore
     echo "**/.progress.md" >> .gitignore
   fi
   ```

5. Create `.curdx-state.json` in the spec directory (note: basePath uses resolved path):
   First compute deterministic AutoPolicy:
   ```bash
   ROUTE_JSON=$(curdx-flow route --name "$name" --goal "$goal" --flags "$ARGUMENTS")
   POLICY_JSON=$(printf '%s' "$ROUTE_JSON" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>process.stdout.write(JSON.stringify(JSON.parse(s).policy)))')
   ```
   If `POLICY_JSON.executionMode == "epic-triage"` or `POLICY_JSON.shouldSplitSpec == true`, stop and route to `/curdx-flow:triage` with the same goal.

   ```json
   {
     "version": 2,
     "source": "spec",
     "name": "$name",
     "basePath": "$basePath",
     "identity": { "name": "$name", "basePath": "$basePath", "goal": "$goal" },
     "phase": "research",
     "taskIndex": 0,
     "totalTasks": 0,
     "taskIteration": 1,
     "maxTaskIterations": "<POLICY_JSON.maxTaskIterations>",
     "globalIteration": 1,
     "maxGlobalIterations": "<POLICY_JSON.maxGlobalIterations>",
     "autoPolicy": "<POLICY_JSON object>",
     "route": "<ROUTE_JSON compact object>",
     "granularity": "<POLICY_JSON.taskGranularity>"
   }
   ```

   If `--skip-research`, set `"phase": "requirements"` instead.
   If AutoPolicy cannot be computed, fall back to `"maxGlobalIterations": 30`.

6. Create initial `.progress.md` with the captured goal:
   ```markdown
   ---
   spec: $name
   basePath: $basePath
   phase: research
   task: 0/0
   updated: <current timestamp>
   ---

   # Progress: $name

   ## Original Goal

   $goal

   ## Completed Tasks

   _No tasks completed yet_

   ## Current Task

   Starting research phase

   ## Learnings

   _Discoveries and insights will be captured here_

   ## Blockers

   - None currently

   ## Next

   Complete research, then proceed to requirements
   ```

## Execute Research Phase

If NOT `--skip-research`:

<mandatory>
Use the Agent tool with `agent_type: research-analyst` to run the research phase.
</mandatory>

Invoke research-analyst agent with:
- The user's goal/feature description from the conversation
- The spec name and basePath (resolved from --specs-dir or default)
- Instructions to output `$basePath/research.md`

The agent will:
1. Search web for best practices and prior art
2. Explore codebase for existing patterns
3. Assess feasibility
4. Create research.md with findings and recommendations

After research completes:

<mandatory>
**STOP HERE. DO NOT PROCEED TO REQUIREMENTS.**

(This does not apply in `--quick` mode, which auto-generates all artifacts without stopping.)

After displaying the output, you MUST:
1. End your response immediately
2. Wait for the user to review research.md
3. Only proceed to requirements when user explicitly runs `/curdx-flow:requirements`

DO NOT automatically invoke the product-manager or run the requirements phase.
The user needs time to review research findings before proceeding.
</mandatory>

## Execute Requirements Phase (if --skip-research)

If `--skip-research` was specified:

<mandatory>
Use the Agent tool with `agent_type: product-manager` to run the requirements phase.
</mandatory>

Invoke product-manager agent with:
- The user's goal/feature description
- The spec name and basePath (resolved from --specs-dir or default)
- Instructions to output `$basePath/requirements.md`

## Output

After completion, inform the user:

```
Spec '$name' created at $basePath/

Current phase: research (or requirements if skipped)

Next steps:
- Review the generated research.md (or requirements.md)
- Run /curdx-flow:requirements to proceed (or /curdx-flow:design if skipped research)
```

**With --specs-dir:**
```
Spec '$name' created at $basePath/ (--specs-dir: $specsDir)

Current phase: research (or requirements if skipped)

Next steps:
- Review the generated research.md (or requirements.md)
- Run /curdx-flow:requirements to proceed (or /curdx-flow:design if skipped research)
```

<mandatory>
**STOP AFTER DISPLAYING OUTPUT.**

(This does not apply in `--quick` mode, which auto-generates all artifacts without stopping.)

Do NOT proceed to the next phase automatically.
Wait for explicit user command to continue.
</mandatory>
