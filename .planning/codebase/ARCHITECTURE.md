<!-- refreshed: 2026-05-19 -->
# Architecture

**Analysis Date:** 2026-05-19

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                  User Surface (Claude Code session)                      │
│  /curdx-flow:* skill invocations  ·  curdx-flow runtime CLI             │
├──────────────────┬──────────────────┬───────────────────────────────────┤
│  Plugin Assets   │  Hook Scripts    │    CLI Installer                  │
│  (shipped to     │  (shipped to     │    (npm: @curdx/flow)             │
│  ~/.claude)      │  ~/.claude)      │    `dist/index.mjs`               │
│                  │                  │                                   │
│  skills/         │  hooks/scripts/  │    src/flows/                     │
│  agents/         │  *.mjs           │    src/registry/                  │
│  templates/      │                  │    src/runner/                    │
│  references/     │                  │    src/runtime/                   │
│  schemas/        │                  │    src/analyze/                   │
└──────────────────┴──────────────────┴───────────────────────────────────┘
         │                  │                       │
         ▼                  ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Plugin Manifest (plugin.json)  ·  hooks.json  ·  marketplace.json      │
│  `plugins/curdx-flow/.claude-plugin/plugin.json`                        │
│  `plugins/curdx-flow/hooks/hooks.json`                                  │
│  `.claude-plugin/marketplace.json`                                      │
└─────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Local project state (per-project, NOT shipped)                         │
│  ./specs/<name>/.curdx-state.json  ·  .curdx-state.json                │
│  ./specs/<name>/tasks.md           ·  .claude/curdx-flow.local.md       │
│  .curdx/sessions/<session-id>.json (session-spec binding)               │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | Location |
|-----------|----------------|----------|
| CLI Installer | `npx @curdx/flow` entry; install/uninstall/update/status/analyze/check flows | `src/index.ts` |
| Flows | Per-subcommand business logic: install, uninstall, update, status, analyze | `src/flows/` |
| Registry | Pkg definitions for every installable (plugins + MCPs); knows how to install each | `src/registry/` |
| Runner | Thin wrappers around `claude` CLI: state listing, marketplace refresh, CLAUDE.md sync, exec | `src/runner/` |
| Runtime | Evidence, state, verdict, discovery, readiness, recovery, release, services, planner | `src/runtime/` |
| Hook sources | TypeScript sources compiled to plugin-shipped `.mjs` bundles | `src/hooks/` |
| Plugin assets | Skills, agents, templates, references, schemas — shipped to `~/.claude` | `plugins/curdx-flow/` |
| Hook bundles | Committed `.mjs` built by `npm run build:hooks`; run inside Claude Code via hooks.json | `plugins/curdx-flow/hooks/scripts/` |
| Plugin runtime CLI | `curdx-flow` binary inside the plugin; entry for skills to call lib utilities | `plugins/curdx-flow/bin/curdx-flow` |
| Build/release scripts | Version checks, bundle size, hooks freshness, smoke tests, e2e flows | `scripts/` |

## Pattern Overview

**Overall:** Hybrid — Claude Code plugin (skills-first) + npm CLI installer

**Key Characteristics:**
- The primary product surface is the installed Claude Code plugin (`plugins/curdx-flow/`). Skills are the only public entry points; there are no separate "commands" directory inside the plugin.
- The npm package `@curdx/flow` is an installer tool only. Its built artifact (`dist/index.mjs`) is never loaded by Claude Code; it is used by humans running `npx @curdx/flow`.
- Hook TypeScript sources in `src/hooks/` are NOT used at runtime directly. They are compiled by `npm run build:hooks` (esbuild) into self-contained `.mjs` bundles committed at `plugins/curdx-flow/hooks/scripts/`. Claude Code runs the `.mjs` bundles.
- The plugin ships a `bin/curdx-flow` executable that skill instructions can call as a shell command; it is a thin proxy to `hooks/scripts/lib/runtime-cli.mjs`.
- Cross-plugin dependencies (`pua`, `claude-mem`, `chrome-devtools-mcp`, `ui-ux-pro-max`) are declared in `plugins/curdx-flow/.claude-plugin/plugin.json`, not bundled.

## Layers

**CLI Installer Layer:**
- Purpose: `npx @curdx/flow` TUI that installs/manages Claude Code plugins and MCP servers
- Location: `src/index.ts`, `src/flows/`, `src/registry/`, `src/runner/`, `src/ui/`, `src/i18n/`
- Contains: citty command tree, interactive flows, registry of `Pkg` descriptors
- Depends on: `@clack/prompts`, `citty`, `picocolors`, `tinyexec`; invokes `claude` CLI subprocesses
- Used by: End users running `npx @curdx/flow`; NOT loaded by Claude Code

**Plugin Assets Layer:**
- Purpose: Skill definitions, agent prompts, templates, schemas, and references shipped into `~/.claude/plugins/curdx-flow/`
- Location: `plugins/curdx-flow/skills/`, `plugins/curdx-flow/agents/`, `plugins/curdx-flow/templates/`, `plugins/curdx-flow/references/`, `plugins/curdx-flow/schemas/`
- Contains: SKILL.md files, agent markdown prompts, JSON schemas for state files, reference docs
- Depends on: nothing at runtime (static markdown/JSON)
- Used by: Claude Code reads them when a `/curdx-flow:*` skill is invoked or on SessionStart

**Hook Scripts Layer (shipped bundles):**
- Purpose: Deterministic event handlers that fire on Claude Code lifecycle events
- Location: `plugins/curdx-flow/hooks/scripts/*.mjs` (built artifacts, committed to git)
- Source: `src/hooks/*.ts` and `src/hooks/lib/*.ts` (compiled by `npm run build:hooks`)
- Contains: stop-watcher, load-spec-context, task-completed-verifier, quick-mode-guard, etc.
- Depends on: Node.js stdlib only (zero runtime npm deps — esbuild bundles everything)
- Used by: Claude Code invokes them per `hooks/hooks.json` on each hook event

**Runtime Library Layer:**
- Purpose: Reusable TypeScript modules for evidence collection, state management, readiness probing, recovery, release validation
- Location: `src/runtime/` (submodules: adapters, capabilities, discovery, evidence, planner, policy, probes, readiness, recovery, release, reports, services, state, verdict)
- Contains: Pure functions and typed interfaces; imported by both hook sources and CLI flows
- Used by: `src/hooks/lib/*.ts` imports these; `src/flows/` and `src/cli/` also import some

**Plugin Runtime CLI Layer:**
- Purpose: Shell-callable binary that skills invoke (`curdx-flow route ...`, `curdx-flow snapshot ...`, `curdx-flow dev ...`)
- Entry: `plugins/curdx-flow/bin/curdx-flow` (Node script)
- Dispatches to: `plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs`
- Used by: Skill instructions as a Bash tool call; replaces repetitive inline shell snippets

## Data Flow

### Slash Command Path (`/curdx-flow:start "my-feature" "goal"`)

1. User types `/curdx-flow:start` in Claude Code — Claude Code matches the skill namespace to `plugins/curdx-flow/skills/start/SKILL.md`
2. Claude Code reads `SKILL.md` and injects it as system instructions
3. Main Claude agent (coordinator) reads `curdx-core/SKILL.md` + `spec-workflow/SKILL.md` for context
4. Coordinator calls `curdx-flow snapshot` via Bash tool (`plugins/curdx-flow/bin/curdx-flow → runtime-cli.mjs`)
5. Coordinator delegates work via Agent tool to a named subagent (e.g., `research-analyst` from `agents/research-analyst.md`)
6. Subagent runs, produces artifact (e.g., `specs/<name>/research.md`)
7. `SubagentStart` hook fires → `subagent-context-injector.mjs` injects spec context for the subagent
8. `TaskCompleted` hook fires → `task-completed-verifier.mjs` checks evidence
9. When all tasks complete, agent outputs `ALL_TASKS_COMPLETE`
10. `Stop` hook fires → `stop-watcher.mjs` reads transcript, validates iron-law verification blocks, allows or blocks stop

### Hook Execution Path

1. Claude Code lifecycle event fires (e.g., `UserPromptSubmit`, `SessionStart`, `Stop`)
2. Claude Code reads `plugins/curdx-flow/hooks/hooks.json` — maps event to script + args
3. Claude Code spawns: `node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/<name>.mjs`
4. Script reads JSON from stdin (`readStdinJson()` in `_shared/stdin.ts`)
5. `runHook()` wrapper in `_shared/run-hook.ts` calls the handler with parsed stdin
6. Handler executes logic (reads `.curdx-state.json`, resolves active spec via `path-resolver`, etc.)
7. Handler returns a `HookOutput` object OR `void`
8. `runHook` serializes non-void output to stdout as newline-terminated JSON; exits 0 unconditionally (FR-8: never block the session)

### CLI Install Path (`npx @curdx/flow install curdx-flow`)

1. `dist/index.mjs` parses argv via citty, dispatches to `installCmd`
2. `installFlow()` in `src/flows/install.ts` calls `refreshMarketplaces()` (runs `claude plugin marketplace update`)
3. `listPlugins()` and `listMcp()` in `src/runner/state.ts` call `claude plugin list --json` / `claude mcp list`
4. `Pkg.install()` in `src/registry/plugins/curdx-flow.ts` calls `ensureMarketplace()` then `installPluginById()` which runs `claude plugin install`
5. After install, `syncFromState()` in `src/runner/claudeMd.ts` updates managed block in `~/.claude/CLAUDE.md`

**State Management:**
- Per-spec execution state: `./specs/<name>/.curdx-state.json` (JSON, version 2 schema in `schemas/state-ledger.schema.json`)
- Active spec pointer: `./specs/.current-spec` (plain text, spec path) or `<session-id>.json` under `.curdx/sessions/`
- Local settings: `.claude/curdx-flow.local.md` (YAML frontmatter with `enabled:`, `specs_dirs:`)
- Epic state: `./specs/_epics/<epic-name>/.epic-state.json`

## Key Abstractions

**`Pkg` (registry type):**
- Purpose: Unified interface for both plugins and MCP servers that the CLI installer manages
- Defined: `src/registry/types.ts`
- Examples: `src/registry/plugins/curdx-flow.ts`, `src/registry/plugins/pua.ts`, `src/registry/mcps/context7.ts`
- Pattern: Duck-typed object with `isInstalled`, `install`, `uninstall`, optional `update`, `configPrompts`, `installedVersion`, `latestVersion`

**`runHook` (hook wrapper):**
- Purpose: Uniform stdin-parse → handler → stdout-serialize → exit-0 envelope for all hooks
- Defined: `src/hooks/_shared/run-hook.ts`
- Pattern: `runHook(async (input) => { ... return decision | void })`

**`CurdxState` (state file shape):**
- Purpose: Per-spec execution state: phase, taskIndex, totalTasks, iteration counters, verification blocks
- Defined (implied type): `src/hooks/_shared/types.ts`
- Schema: `plugins/curdx-flow/schemas/state-ledger.schema.json`

**Skills (plugin surface):**
- Purpose: Each `/curdx-flow:*` command is a `SKILL.md` file; Claude Code auto-activates them on name match
- Location: `plugins/curdx-flow/skills/<name>/SKILL.md`
- Pattern: YAML frontmatter (`name`, `description`, `when_to_use`, `user-invocable`) + markdown body

**Agents (subagent prompts):**
- Purpose: Specialist agent prompts delegated to by the coordinator via Agent tool
- Location: `plugins/curdx-flow/agents/<name>.md`
- Examples: `spec-executor.md`, `research-analyst.md`, `task-planner.md`

## Entry Points

**npm CLI binary:**
- Location: `dist/index.mjs` (compiled from `src/index.ts`)
- Package.json `bin`: `./dist/index.mjs`
- Triggers: `npx @curdx/flow [install|uninstall|update|status|analyze|check]` or interactive menu if no subcommand
- Responsibilities: Plugin/MCP lifecycle management from the terminal; writes to `~/.claude`

**Plugin runtime CLI (`curdx-flow` bin):**
- Location: `plugins/curdx-flow/bin/curdx-flow`
- Triggers: Skill instructions run `curdx-flow <subcommand>` via Bash tool
- Responsibilities: Thin proxy → `plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs`; provides `route`, `snapshot`, `state merge`, `tasks count`, `dev *`, `verify run`, `doctor`

**Hook entry points (Claude Code lifecycle):**
- `hooks/scripts/user-prompt-submit-autopilot.mjs` → `UserPromptSubmit` (every prompt)
- `hooks/scripts/user-prompt-expansion-guard.mjs` → `UserPromptExpansion` (matcher: `curdx-flow:.*`)
- `hooks/scripts/quick-mode-guard.mjs` → `PreToolUse` (matcher: `AskUserQuestion`)
- `hooks/scripts/stop-watcher.mjs` → `Stop` (every stop; iron-law gate + completion detection)
- `hooks/scripts/load-spec-context.mjs` → `SessionStart` (async; injects spec context)
- `hooks/scripts/subagent-context-injector.mjs` → `SubagentStart`
- `hooks/scripts/task-completed-verifier.mjs` → `TaskCompleted`
- `hooks/scripts/post-tool-batch-snapshot.mjs` → `PostToolBatch`
- `hooks/scripts/post-compact-recorder.mjs` → `PostCompact`
- `hooks/scripts/stop-failure-handler.mjs` → `StopFailure`

**Skill entry points (user-invocable `/curdx-flow:*`):**
- `plugins/curdx-flow/skills/start/SKILL.md` — primary entry, new or resume spec
- `plugins/curdx-flow/skills/new/SKILL.md` — force-new spec
- `plugins/curdx-flow/skills/research/SKILL.md`, `requirements/`, `design/`, `tasks/`, `implement/` — phase skills
- `plugins/curdx-flow/skills/triage/SKILL.md` — epic decomposition
- `plugins/curdx-flow/skills/status/SKILL.md`, `cancel/`, `switch/`, `refactor/` — management skills

## Architectural Constraints

- **Zero runtime npm deps in hooks:** Hook bundles are self-contained ESM with no `node_modules`; esbuild inlines everything at build time. The `plugins/curdx-flow/hooks/scripts/package.json` sets `"type": "module"` but carries no dependencies.
- **Hook bundles are committed:** `plugins/curdx-flow/hooks/scripts/*.mjs` and `*.mjs.map` are git-tracked. The marketplace installs via git source (`curdx/curdx-flow`), so the built artifacts must be committed.
- **Exit-0 invariant (FR-8):** Every hook must `process.exit(0)` on any error path. `runHook` enforces this. A non-zero exit from a hook would kill the Claude Code session.
- **Threading:** Single-threaded Node.js event loop inside each hook process. Hooks are invoked as isolated child processes; no shared memory between hook invocations.
- **Global state in runner:** `src/runner/state.ts` holds module-level caches (`pluginCache`, `mcpCache`, `marketplaceCache`) for the duration of a single CLI invocation. `clearStateCache()` resets them.
- **Circular imports:** None detected. `src/hooks` only imports from `src/hooks/_shared/` and `src/hooks/lib/`; `src/hooks/lib/` imports from `src/runtime/` but not from `src/flows/` or `src/registry/`.
- **Hook source ≠ runtime path:** `src/hooks/*.ts` are TypeScript sources. The files actually executed by Claude Code are `plugins/curdx-flow/hooks/scripts/*.mjs`. Running hooks directly from `src/` is not supported.

## Anti-Patterns

### Calling `claude` CLI subprocesses from hooks

**What happens:** Hook scripts (`*.mjs`) calling `run('claude', [...])` from `src/runner/exec.ts`
**Why it's wrong:** Hooks run inside the Claude Code process tree; spawning `claude` subprocesses can cause re-entrant sessions or hang
**Do this instead:** Hooks only perform filesystem reads/writes and Node stdlib operations; reserve `claude` CLI calls for the installer flows in `src/flows/`

### Editing hook bundles directly

**What happens:** Manually editing `plugins/curdx-flow/hooks/scripts/*.mjs`
**Why it's wrong:** The `.mjs` files are generated by `npm run build:hooks` from `src/hooks/*.ts`; manual edits will be overwritten
**Do this instead:** Edit the `.ts` source in `src/hooks/`, then run `npm run build:hooks` to regenerate

### Adding skills that do work themselves (coordinator antipattern)

**What happens:** A skill SKILL.md directly executes tasks instead of delegating to a subagent via Agent tool
**Why it's wrong:** Violates the Coordinator-In-One-Turn pattern; coordinator must not write code, create files, or run implementation commands directly
**Do this instead:** Coordinator parses intent, reads state, then delegates all substantive work to an appropriate agent from `plugins/curdx-flow/agents/`

## Error Handling

**Strategy:** Fail-open (never block the Claude Code session)

**Patterns:**
- All hooks wrap their logic in `runHook()` which catches all throws and exits 0
- Block decisions (e.g., incomplete tasks, failed verification) are returned as JSON `{decision:"block", reason, systemMessage}` — Claude Code surfaces these to the user non-fatally
- CLI installer flows surface errors as `p.log.error()` messages (clack UI); non-zero exit only on unrecoverable init failures
- `src/runtime/*` modules return typed result objects (not throws) for expected failure cases

## Cross-Cutting Concerns

**Logging:** Hooks write diagnostics to `stderr` with `[curdx-flow]` prefix (e.g., `[curdx-flow] Active spec detected: my-feature`). Error logger writes structured JSON to a log file via `src/hooks/_shared/error-logger.ts`. CLI installer uses `@clack/prompts` for UI.
**Validation:** JSON schemas in `plugins/curdx-flow/schemas/` define contracts for state files, evidence, and release gates. Validated via AJV in `src/runtime/contracts/`.
**Authentication:** None — the product installs local Claude Code plugin assets; no external auth.

---

*Architecture analysis: 2026-05-19*
