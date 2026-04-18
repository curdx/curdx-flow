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

### 2a. Missing test runner — surface, don't auto-install

If `detect-stack.sh` returns `"testing": { "runner": "unknown" }`, Constitution Rule 2 (NO PRODUCTION CODE WITHOUT FAILING TEST) will block `/curdx:implement` the moment a `[GREEN]` task tries to edit production source. Surface this up front so the user can install a runner themselves before that wall.

Print a block like this (substitute the lines for the detected `backend.language`):

```
⚠  No test runner detected. Constitution Rule 2 requires one.

   Pick ONE and run it yourself, then re-run `/curdx:init`:

     node:    npm i -D vitest && npm pkg set scripts.test="vitest run"
     python:  pip install pytest && mkdir -p tests
     go:      (built-in — no install needed)
     rust:    (built-in — no install needed)
     ruby:    bundle add rspec --group=test && bundle exec rspec --init
     java:    (pom.xml / build.gradle — add JUnit per your build tool)
     php:     composer require --dev phpunit/phpunit

   Why we don't auto-install: runner choice (vitest vs jest, pytest vs
   unittest, etc.) is a project decision we won't make for you.
```

Do **not** run the install command. Do **not** use AskUserQuestion to pick one — this is the user's call and they may already have a preference or team convention. Continue with step 3 regardless; the config will carry `testing.runner = "unknown"` and the hint will repeat in any Rule 2 block message (`hooks/enforce-constitution.sh`).

Skip step 2a silently if `testing.runner` is anything other than `"unknown"`.

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

### 6. Create `.curdx/features/` and `.curdx/logs/` directories + add to gitignore

```bash
mkdir -p .curdx/features .curdx/logs
```

`.curdx/logs/` is where hooks append structured events (`events.jsonl`). `/curdx:snapshot` bundles these for sharing. See `docs/DIAGNOSTICS.md`.

Append to `.gitignore` if missing (use `grep -q` to check):
```
# curdx-flow runtime state
.curdx/state.json
.curdx/.continue-here.md
.curdx/quick/
.curdx/debug/
.curdx/features/*/evidence/
.curdx/logs/
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

### 8a. Project baseline health check

Run the Delivery-Guarantee Harness (`scripts/verify-runnable.sh`) against the project with NO active feature. Gate D (preflight) auto-skips because there's no `findings.json`; gates A/B/C probe install/build/smoke state of the codebase as-is.

This is a baseline snapshot — it does not block init. Its job is to let the user *see* what curdx-flow will enforce later, so they can fix latent issues on their own time.

```bash
BASELINE_JSON=$(bash "${CLAUDE_PLUGIN_ROOT}/scripts/verify-runnable.sh" --quiet 2>/dev/null) || true
```

Print the result as a baseline table (substitute real values from `$BASELINE_JSON`):

```
  project baseline health check
  -----------------------------
  A. install:  {{pass|fail|skip}}  — {{detail}}
  B. build:    {{pass|fail|skip}}  — {{detail}}
  C. smoke:    {{pass|fail|skip}}  — {{detail}}
  D. preflight: skip (no active feature yet)
```

If any gate is `fail`, append a short "what this means":
```
  one or more gates failed on your current tree. curdx-flow did NOT
  change anything — this is just telling you what `/curdx:ship` will
  refuse to push today. fix at your leisure; the harness reruns on
  every /curdx:verify and /curdx:ship.
```

If all gates are pass/skip, just say: `  baseline looks clean — no pre-existing issues detected.`

### 8b. Statusline opt-in (recommended, not auto)

curdx-flow ships `hooks/statusline.sh` — when registered as Claude Code's `statusLine`, it (a) shows a context-usage progress bar to the user and (b) writes a bridge file that lets `hooks/context-monitor.sh` warn the agent when context is running low. Without it, `context-monitor.sh` exits silently (no harm, but you lose the warning).

We do NOT auto-write `~/.claude/settings.json` (per CLAUDE.md project rule). Instead, suggest the one-liner the user can run themselves. Print exactly:

```
optional: enable statusline + context-pressure warnings

  Add this to ~/.claude/settings.json (or .claude/settings.json in this project):

    "statusLine": {
      "type": "command",
      "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/statusline.sh"
    }

  Without it: the PostToolUse context-monitor hook degrades silently (no warnings injected).
  With it: agent gets WARNING at 35% remaining, CRITICAL at 25% — wraps up before compaction.
```

Skip this print if `~/.claude/settings.json` already contains `statusline.sh` (the user already enabled it — common in re-init).

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
      (or `/curdx:next` to auto-route, `/curdx:do <text>` for NL routing.)
```

## Failure handling

Any step failure: print the error, leave the partially-written state intact (so re-running can continue), and ask the user whether to abort or retry. Never silently swallow errors.
