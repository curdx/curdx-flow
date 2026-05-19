# External Integrations

**Analysis Date:** 2026-05-19

## Claude Code Plugin Contract Surface

This repo ships **two distinct artifacts** that interact with Claude Code differently:

### 1. npm CLI (`@curdx/flow`)

Invoked as `npx @curdx/flow` or `node ./dist/index.mjs`. Drives install/update/status/analyze/check flows. All Claude Code interaction goes through the `claude` binary as a child process via `tinyexec` (`src/runner/exec.ts`).

CLI commands dispatched to `claude`:
```
claude plugin list --json
claude plugin marketplace list --json
claude plugin marketplace add <source>
claude plugin marketplace update <name>
claude plugin install <id> --scope user
claude plugin uninstall <id> --scope user
claude plugin update <id> --scope user
claude plugin validate <pluginDir>
claude mcp list
claude mcp add --scope user --transport http <name> <url>
claude mcp add --scope user <name> -- npx -y <package>
claude mcp remove <name>
claude --version
```

State parsed from `claude plugin list --json` is cached in module-level variables with `clearStateCache()` invalidation (`src/runner/state.ts`).

### 2. Claude Code Plugin (`plugins/curdx-flow/`)

Installed via `claude plugin install curdx-flow@curdx --scope user`. Distributed via the `curdx` marketplace which sources from the GitHub repo `curdx/curdx-flow`.

## Plugin Manifest Files

**Marketplace index:**
- `.claude-plugin/marketplace.json` — declares marketplace name `curdx`, owner `curdx`, lists one plugin entry `curdx-flow` at version `7.3.3`; `allowCrossMarketplaceDependenciesOn` lists the four upstream marketplaces

**Plugin manifest:**
- `plugins/curdx-flow/.claude-plugin/plugin.json` — name `curdx-flow`, version `7.3.3`, author `curdx`; declares `skills: ./skills/`, `agents` list (10 agent files); dependency list (see below)

**Version parity gate:** `package.json`, `package-lock.json`, `plugin.json`, and `marketplace.json` must all carry the same version string. Enforced by `scripts/check-versions.mjs`.

## Plugin Hooks

Declared in `plugins/curdx-flow/hooks/hooks.json`. All hooks invoke `node` with a `.mjs` script path resolved via `${CLAUDE_PLUGIN_ROOT}`.

| Hook Event | Script | Matcher | Timeout | Async |
|------------|--------|---------|---------|-------|
| `UserPromptSubmit` | `hooks/scripts/user-prompt-submit-autopilot.mjs` | (all) | 10s | no |
| `UserPromptExpansion` | `hooks/scripts/user-prompt-expansion-guard.mjs` | `curdx-flow:.*` | 10s | no |
| `PreToolUse` | `hooks/scripts/quick-mode-guard.mjs` | `AskUserQuestion` | 10s | no |
| `Stop` | `hooks/scripts/stop-watcher.mjs` | (all) | 30s | no |
| `SessionStart` | `hooks/scripts/load-spec-context.mjs` | `*` | 15s | **yes** |
| `SubagentStart` | `hooks/scripts/subagent-context-injector.mjs` | (all) | 15s | no |
| `TaskCompleted` | `hooks/scripts/task-completed-verifier.mjs` | (all) | 20s | no |
| `PostToolBatch` | `hooks/scripts/post-tool-batch-snapshot.mjs` | (all) | 10s | no |
| `PostCompact` | `hooks/scripts/post-compact-recorder.mjs` | (all) | 10s | no |
| `StopFailure` | `hooks/scripts/stop-failure-handler.mjs` | (all) | 15s | no |

Hook source lives in `src/hooks/*.ts` and `src/hooks/lib/*.ts`. Generated bundles (committed) live in `plugins/curdx-flow/hooks/scripts/`. Regenerate with `npm run build:hooks`; staleness enforced by `scripts/check-hooks-fresh.mjs` (part of `npm run verify`).

**Hook runtime CLI entry:**
`plugins/curdx-flow/bin/curdx-flow` — a thin Node.js shim that resolves and delegates to `hooks/scripts/lib/runtime-cli.mjs`. Invoked directly during smoke tests and by the `doctor`/`snapshot`/`route` commands.

## Plugin Skills

18 skills declared in `plugins/curdx-flow/skills/`, each with a `SKILL.md`:

| Skill | Purpose |
|-------|---------|
| `cancel` | Cancel active spec |
| `communication-style` | Response style guidance |
| `curdx-core` | Core spec-driven workflow engine |
| `design` | Design phase |
| `feedback` | Feedback capture |
| `help` | Help listing |
| `implement` | Implementation phase (slash: `/curdx-flow:implement`) |
| `index` | Spec index listing |
| `interview-framework` | Goal interview algorithm |
| `new` | Start a new spec |
| `prompt-optimize` | Prompt optimization |
| `reality-verification` | Reality-check gate |
| `refactor` | Refactor phase |
| `requirements` | Requirements phase |
| `research` | Research phase |
| `spec-workflow` | Full spec workflow orchestration |
| `start` | Start/resume spec execution |
| `status` | Status reporting |
| `switch` | Switch active spec |
| `tasks` | Task management |
| `triage` | Epic triage |
| `verification-before-completion` | Iron-law completion gate |

Skill slash namespace: `/curdx-flow:*`

## Plugin Agents

10 sub-agent definitions in `plugins/curdx-flow/agents/`:

- `architect-reviewer.md`
- `code-quality-reviewer.md`
- `product-manager.md`
- `qa-engineer.md`
- `refactor-specialist.md`
- `research-analyst.md`
- `spec-executor.md`
- `spec-reviewer.md`
- `task-planner.md`
- `triage-analyst.md`

## Plugin JSON Schemas

Located in `plugins/curdx-flow/schemas/`. Validated with `ajv` 8.20.0 + `ajv-formats` 3.0.1 in `tests/contracts/runtime-contracts.test.ts`.

- `session.schema.json`
- `completion-verdict.schema.json`
- `release-verdict.schema.json`
- `state-ledger.schema.json`
- `action-risk-policy.schema.json`
- `hook-gate.schema.json`
- `verification-report.schema.json`
- `transcript-events.json`
- `adapter-result.schema.json`
- `runtime-topology.schema.json`

## Plugin Templates and References

**Templates:** `plugins/curdx-flow/templates/` — spec lifecycle documents (epic, design, requirements, tasks, research, progress, etc.) and prompt templates.

**References:** `plugins/curdx-flow/references/` — runtime behavior contracts (agent-output-contract, bounded-parallel-dispatch, iron-law-verification, intelligent-routing, etc.).

## Plugin Dependencies (Cross-Marketplace)

Declared in `plugins/curdx-flow/.claude-plugin/plugin.json` `dependencies` array. All installed at `user` scope via `claude plugin install <id> --scope user`.

| Plugin ID | Marketplace | Source Repo | Slash Namespace | Prereq |
|-----------|-------------|-------------|-----------------|--------|
| `pua@pua-skills` | `pua-skills` | `tanweai/pua` | `/pua:*` | none |
| `claude-mem@thedotmack` | `thedotmack` | `thedotmack/claude-mem` | `/claude-mem:*` | Bun runtime (auto-installed) |
| `chrome-devtools-mcp@chrome-devtools-plugins` | `chrome-devtools-plugins` | `ChromeDevTools/chrome-devtools-mcp` | none | Node >= 20.19, Chrome on PATH |
| `ui-ux-pro-max@ui-ux-pro-max-skill` | `ui-ux-pro-max-skill` | `nextlevelbuilder/ui-ux-pro-max-skill` | none | none |

Cross-marketplace dependency resolution is allowed via `.claude-plugin/marketplace.json` `allowCrossMarketplaceDependenciesOn` list.

## External MCP Servers

Installed by the `@curdx/flow` CLI flow into Claude Code user-scope MCP registry. Not plugin dependencies — registered directly via `claude mcp add`.

| MCP Name | Transport | URL / Invocation | Auth |
|----------|-----------|------------------|------|
| `context7` | HTTP | `https://mcp.context7.com/mcp` | Optional `CONTEXT7_API_KEY` header |
| `sequential-thinking` | stdio (npx) | `npx -y @modelcontextprotocol/server-sequential-thinking` | none |

Source definitions: `src/registry/mcps/context7.ts`, `src/registry/mcps/sequential-thinking.ts`.

`sequential-thinking` fetches the latest npm version at every launch — no update path is needed. `context7` uses an HTTP MCP transport; API key is optional and prompted at install time.

## GitHub

**Repository:** `https://github.com/curdx/curdx-flow`

**Marketplace distribution:** The `curdx` marketplace source is `curdx/curdx-flow` (GitHub). The marketplace refresh mechanism (`src/runner/state.ts: refreshMarketplaces`) fetches `https://raw.githubusercontent.com/{repo}/HEAD/.claude-plugin/marketplace.json` directly to defend against silent failures in `claude plugin marketplace update`.

**npm Registry:**
- Package: `@curdx/flow`
- Registry: default npm public registry
- `publishConfig.access: "public"`
- `prepublishOnly` hook: runs `check-versions.mjs`, `typecheck`, `check:hooks-fresh`, then `build`

## File Storage

**Plugin state at runtime:** written to `.curdx/` inside the user's project working directory (gitignored via `.gitignore` entry `.curdx/`). Also uses `specs/` directory for active spec and epic pointers (`.current-spec`, `.current-epic` are gitignored).

**Marketplace cache:** `~/.claude/plugins/marketplaces/<name>/.claude-plugin/marketplace.json` — managed by `claude` CLI and overwritten defensively by the HTTP reconciliation path in `src/runner/state.ts`.

**CLAUDE.md block:** The installer writes an `@curdx/flow` block to `~/.claude/CLAUDE.md` documenting installed tools and their `whenToUse` guidance. Skipped with `--no-claude-md` flag or `CURDX_FLOW_NO_CLAUDE_MD=1`.

## Webhooks & Callbacks

- None. No inbound HTTP endpoints.

## Auth Providers

- None. No auth provider is used by the project itself.
- `CONTEXT7_API_KEY` is optional and user-provided (passed as an HTTP header to `mcp.context7.com`).

## CI/CD & Deployment

- No CI pipeline configuration detected (no `.github/workflows/`, no CI config files).
- Release workflow is local: `npm run verify` (full gate), then tag + `npm publish`.
- Plugin release requires git tags to be pushed (checked by `src/runtime/release/tag-parity.ts`).

## Monitoring & Observability

**Error Tracking:** None (no Sentry, Datadog, etc.).

**Logs:** stderr via `console.error` in scripts; `@clack/prompts` task log (`p.log.*`) in interactive flows; hook errors logged to `.curdx/` state files by `src/hooks/_shared/error-logger.ts`.

---

*Integration audit: 2026-05-19*
