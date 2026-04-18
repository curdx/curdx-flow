# Installing curdx-flow

## Quick install (recommended)

```bash
npx curdx-flow@latest install
```

This is the **complete** path. It will:

1. Install [`claude-mem`](https://github.com/thedotmack/claude-mem) (cross-session memory layer with SQLite + Chroma)
2. Install [`pua`](https://github.com/tanweai/pua) plugin into Claude Code (failure-detection + behavioral protocol)
3. Install `curdx-flow` plugin into Claude Code
4. Register MCP servers: `sequential-thinking`, `context7`
5. Write `~/.curdx/install-state.json` for idempotent re-runs

The installer is **idempotent** — re-running it later is safe. Already-installed components are detected and skipped. Pass `--force` to re-install everything anyway.

### Flags

```
--dry-run       print the install plan, don't mutate
--force         re-install even if state shows already done
--repair        re-add hooks the user disabled (otherwise respected)
--no-deps       skip claude-mem and pua, install curdx-flow only
--skip-claude   skip 'claude plugin' commands (CI / sandboxed env)
--verbose, -v   extra logging
--help, -h      show help
```

### Where state lives

- `~/.curdx/install-state.json` — installation manifest (versions of each dep, install timestamps, hooks/MCPs registered, user overrides)
- `~/.curdx/.install.lock` — PID lock during install (prevents concurrent runs; auto-cleared on stale)

User-modified files are detected by SHA-256 hash and preserved on upgrade.

## Lightweight install (advanced — if you already have claude-mem and pua)

```bash
claude plugin marketplace add curdx/curdx-flow
claude plugin install curdx@curdx-flow
```

Claude Code's plugin system will:
- Recursively install declared dependencies (claude-mem, pua) — but **not** their full setup (e.g., claude-mem's localhost worker on :37777 still needs `npx claude-mem install --ide claude-code` to be running)
- Register MCP servers from `plugin.json`
- Merge hooks from `hooks/hooks.json` into the active hook registry

Use the npx path the first time; the lightweight path is fine for re-installs after the worker is established.

## Verify install

Inside any project, after running `claude`:

```
> /curdx:init
```

If `/curdx:init` is not recognized as a slash command, run:

```bash
claude plugin list
```

Look for `curdx@curdx-flow` in the enabled list. If not, run `npx curdx-flow install --force --verbose`.

## Per-project setup

After global install, each new project needs `/curdx:init` once:

```bash
cd your-project
claude
> /curdx:init
```

This:
- Detects your tech stack (backend / frontend / test runner / browser-test mode)
- Writes `.curdx/config.json` with the detected values (overridable)
- Copies `rules/constitution.md` to `.claude/rules/constitution.md` (loaded natively by Claude Code at session start)
- Initializes `.curdx/state.json`
- Optionally adds an `@.curdx/state.json` import to your project's `CLAUDE.md`

## Global protocols (auto-injected into every session)

Once curdx-flow is installed and enabled in Claude Code, the SessionStart hook (`hooks/load-context.sh`) injects a "Global Protocols" block as `additionalContext` for **every** Claude session — regardless of whether your cwd is a curdx-initialized project. The shipped default lives at `<plugin-dir>/protocols/global-protocols.md` and codifies the curdx-flow way of working:

- 中文 user output, English tool/model interactions
- Minimal, no-redundancy code style; comments only when non-obvious
- Decisions backed by code reading or web search — no guesswork
- Force `ultrathink` in English on hard problems

This is intentional and part of the product opinion. Three ways to control it:

| What you want | How |
|---|---|
| Use the default | Do nothing — it ships ready |
| Customize the rules for yourself | `cp $CLAUDE_PLUGIN_ROOT/protocols/global-protocols.md ~/.curdx/user-protocols.md` then edit. Your override wins; future plugin upgrades won't touch your file. |
| Disable entirely | `touch ~/.curdx/no-global-protocols`. Hook silently skips the injection. |
| Re-enable after disabling | `rm ~/.curdx/no-global-protocols` |

`/curdx:doctor` step **10a** reports which mode is active.

The injection lives 100% inside the SessionStart hook — **curdx-flow never writes to `~/.claude/CLAUDE.md`, `~/.claude/rules/`, or `~/.claude/settings.json`**. Uninstalling the plugin (or disabling it) removes the rules from future sessions automatically.

## Uninstall

```bash
claude plugin uninstall curdx@curdx-flow
```

Per-project state at `.curdx/` is preserved. Delete it manually if you want a clean slate.

User-level state at `~/.curdx/` can be removed with:

```bash
rm -rf ~/.curdx/
```

(claude-mem and pua are independent plugins and uninstall separately.)

## Troubleshooting

### "claude: command not found"

Install the Claude Code CLI first: see https://code.claude.com/docs.

### "jq: command not found"

curdx-flow's hooks and detection scripts require `jq`. Install:
- macOS: `brew install jq`
- Ubuntu/Debian: `apt install jq`
- Other: https://jqlang.github.io/jq/download/

### Plugin install fails: "marketplace not added"

The npx installer tries `claude plugin marketplace add` first. If it fails, manually:

```bash
claude plugin marketplace add curdx/curdx-flow
claude plugin install curdx@curdx-flow
```

### Hooks not firing

Check `~/.claude/settings.json` includes the curdx plugin's hooks. If a hook is missing and you previously deleted it, the installer respects that decision. Run with `--repair` to re-add:

```bash
npx curdx-flow install --repair
```

### Stop-hook loop won't terminate

If `/curdx:implement` keeps looping past `total_tasks`, check `.curdx/features/<active>/tasks.md` — at least one task must emit `ALL_TASKS_COMPLETE` for the loop to exit cleanly. The `task_iteration` and `global_iteration` safety caps (defaults 5 and 100) eventually force termination, but you should fix the missing terminator.

### "claude-mem worker not running"

If memory features stop working:

```bash
npx claude-mem start
# or
npx claude-mem status
```

The worker runs on `localhost:37777`.

## Development install (working on curdx-flow itself)

Clone, then point Claude Code at the local directory:

```bash
git clone https://github.com/curdx/curdx-flow.git ~/code/curdx-flow
cd ~/code/curdx-flow
claude plugin marketplace add ./
claude plugin install curdx@curdx-flow
```

Re-installs after edits don't require any commands — Claude Code picks up changes automatically when the plugin is sourced from a local path.
