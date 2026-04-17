---
description: Initialize curdx-flow in this project — detect stack, write config, copy constitution rules, scaffold .curdx/ directory.
argument-hint: (no arguments)
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion
---

You are running `/curdx:init`. Your job is to bootstrap curdx-flow in the current project. This is **idempotent** — re-running is safe; existing files are preserved unless explicitly overwritten with user consent.

## Steps

### 1. Detect existing init

Check if `.curdx/config.json` already exists.

- **Exists:** read it, summarize current state (project name, stack, browser-test mode), ask user: "curdx-flow is already initialized. Re-detect stack and update config? [y/N]". If no, exit gracefully.
- **Missing:** proceed.

### 2. Detect tech stack

Run the detection scripts. The plugin root is `${CLAUDE_PLUGIN_ROOT}` (set by Claude Code).

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/detect-stack.sh" .
bash "${CLAUDE_PLUGIN_ROOT}/scripts/detect-browser-test.sh" .
```

Combine the two JSON outputs. If `detect-browser-test.sh` returns `mode: "prompt"`, ask the user with `AskUserQuestion`:
- Question: "We detected a frontend but no test scaffolding. Which browser-test integration do you want?"
- Options: `playwright` (forms/CRUD), `chrome-devtools` (WebGL/maps/3D), `both`, `none` (no browser tests).

### 3. Write `.curdx/config.json`

Use the template at `${CLAUDE_PLUGIN_ROOT}/templates/config-template.json`. Fill in the placeholders from detection results. Write atomically (write to `.curdx/config.json.tmp` then `mv`).

### 4. Copy constitution rule to `.claude/rules/`

```bash
mkdir -p .claude/rules
cp "${CLAUDE_PLUGIN_ROOT}/rules/constitution.md" .claude/rules/constitution.md
```

If `.claude/rules/constitution.md` already exists, do **not** overwrite. Inform the user: "Existing constitution preserved. To replace, delete and re-run `/curdx:init`."

### 5. Initialize `.curdx/state.json`

Use `${CLAUDE_PLUGIN_ROOT}/scripts/lib/state-io.sh`:

```bash
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/state-io.sh"
state_init_if_missing
state_set '.phase' '"init-complete"'
state_set '.started_at' "\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""
```

### 6. Create `.curdx/features/` directory + add to gitignore

```bash
mkdir -p .curdx/features
```

Append to `.gitignore` if missing (use `grep -q` to check):
```
# curdx-flow runtime state
.curdx/state.json
.curdx/.continue-here.md
.curdx/quick/
.curdx/debug/
.curdx/features/*/evidence/
```

### 7. Add CLAUDE.md @-import for active feature context (optional but recommended)

If a `./CLAUDE.md` exists, check if it already has a `@.curdx/state.json` reference. If not, ask user: "Add an @-import in CLAUDE.md so Claude Code automatically loads current curdx-flow state every session? [Y/n]". On yes, append to CLAUDE.md:

```markdown
<!-- curdx-flow context (auto-injected) -->
@.curdx/state.json
```

If no `./CLAUDE.md` exists, offer to create a minimal one. Don't force it.

### 8. Run any browser-test install commands

If `detect-browser-test.sh` returned non-empty `install_commands` array, present them to the user with `AskUserQuestion`: "Run these install commands now? [Y/n]" — show the commands. On yes, run each.

### 9. Print success summary

Print exactly this format (substitute real values):

```
curdx-flow initialized.

  project name:    {{name}}
  backend:         {{backend.language}}
  frontend:        {{frontend.framework}}
  test runner:     {{testing.runner}}
  browser test:    {{browser_testing.mode}}
  constitution:    .claude/rules/constitution.md ({{n}} hard rules loaded)

next: `/curdx:spec <feature-slug>` to start your first feature.
```

## Failure handling

Any step failure: print the error, leave the partially-written state intact (so re-running can continue), and ask the user whether to abort or retry. Never silently swallow errors.
