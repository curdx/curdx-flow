# CLAUDE.md — Developing curdx-flow itself

This file is for Claude Code when **working on the curdx-flow plugin source**, not for end-users of the plugin.

## What this repo is

`curdx-flow` is a Claude Code plugin that gives solo full-stack developers a disciplined end-to-end workflow: spec → plan → tasks → TDD implementation → verification → commit, with fresh-context subagent execution and a Stop-hook driven loop.

## Architecture (one-liner per directory)

- `.claude-plugin/` — plugin + marketplace manifests; declares MCP servers (sequential-thinking, context7). Runtime companions (claude-mem, pua) are installed by `scripts/install.js` via `npx` / `claude plugin marketplace add`, NOT via Claude Code's `plugin.json.dependencies` field. If/when that field is wired up, update this line and drop the matching code paths in `install.js`.
- `commands/` — slash commands users type. Each `.md` is a Claude prompt with frontmatter.
- `agents/` — specialized subagents with isolated contexts (analyst, architect, builder, reviewer, verifier, debugger, refactor, planner).
- `skills/` — reusable behavioral disciplines (TDD, read-first, systematic-debug, verify-evidence, browser-test, parallel-dispatch, writing-skills, no-sycophancy).
- `hooks/` — POSIX shell scripts wired to Claude Code lifecycle events. The Stop hook is the loop driver for `/curdx:implement`.
- `rules/` — templates copied to user project `.claude/rules/` on `/curdx:init`. Constitution + path-scoped TDD/no-sycophancy rules.
- `templates/` — spec/plan/tasks/config skeletons used to scaffold per-feature artifacts.
- `scripts/` — `install.js` (npx entrypoint), detection helpers (stack, browser-test, complexity), state I/O.
- `migrations/` — versioned upgrade scripts (gstack pattern). One file per breaking schema change.
- `docs/` — user-facing documentation.

## Hard conventions

1. **Atomic JSON writes only.** Always write to `<file>.tmp` then `mv`. Never plain `>`. See `scripts/lib/state-io.sh` for helpers.
2. **POSIX bash for hooks.** Hooks must run on macOS (BSD utils) and Linux (GNU utils). Use `command -v jq >/dev/null || exit 0` defensively. No bashisms beyond `[[ ]]`.
3. **`jq` is the only assumed dependency** beyond bash, git, and node. If a hook needs more, gracefully degrade.
4. **Never write to user `.claude/settings.json`** — let Claude Code's plugin system manage hook registration. Our installer only writes to `~/.curdx/install-state.json`.
5. **Hooks read JSON from stdin, exit codes are the contract.** Exit 2 = blocking. Exit 0 with JSON stdout = control flow. See https://code.claude.com/docs/en/hooks.
6. **Slash command names** use the plugin namespace prefix. With plugin name `curdx`, file `commands/init.md` is invoked as `/curdx:init`. Frontmatter `name:` can override.
7. **Subagent payload contracts.** Builder subagent must return one of: `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, `BLOCKED`. Last task in batch must emit literal `ALL_TASKS_COMPLETE` for the Stop hook to exit cleanly.
8. **No backwards-compat shims yet.** v0.x is breaking-changes-allowed. Migrations land in `migrations/` once we hit v1.

## What NOT to do

- Don't reinvent cross-session memory — Claude Code's auto memory (`~/.claude/projects/<project>/memory/MEMORY.md`) and claude-mem's SQLite+Chroma layer cover it.
- Don't write platform-specific CI adapters in v0.x. `/curdx:ship` only does commit + push.
- Don't add per-task GUI / dashboards / status pages. Output is plain markdown + JSON; rendering is the user's terminal.
- Don't add LLM calls outside subagent dispatches. The detect-complexity script is the only place we shell out `claude -p`, and only for the small/medium tie-break.
- Don't use emoji in code, comments, or tool output unless asked.

## When extending

- New slash command → add `commands/<name>.md` + (optional) frontmatter `name: curdx.<name>`. Document in `docs/COMMANDS.md`.
- New skill → see `skills/curdx-writing-skills/SKILL.md` (in Round 3) — it teaches TDD-for-skills.
- New hook → register in `hooks/hooks.json`, ship the script in `hooks/`. Test by re-running `/curdx:doctor`.

## Testing

`tests/evals/` runs skill pressure tests (subagent in adversarial scenario, check it still complies). `tests/e2e/` runs full pipeline on a fixture project. CI not wired yet (intentional — see WORKFLOW.md).

For iterative development: `node scripts/install.js --dry-run` validates the install plan without mutating anything.
