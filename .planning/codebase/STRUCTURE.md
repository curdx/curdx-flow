<!-- refreshed: 2026-05-19 -->
# Codebase Structure

**Analysis Date:** 2026-05-19

## Directory Layout

```
curdx-flow/                         # Repo root
├── src/                            # TypeScript source (CLI installer + hook sources)
│   ├── index.ts                    # CLI entry point (citty root command)
│   ├── analyze/                    # Transcript analysis subcommand logic
│   ├── cli/                        # Extra CLI subcommands (check)
│   │   └── commands/check.ts
│   ├── flows/                      # Per-subcommand business logic
│   ├── hooks/                      # Hook TypeScript sources (compiled → plugins/*/hooks/scripts/)
│   │   ├── _shared/                # Shared hook utilities (run-hook, path-resolver, stdin, types)
│   │   ├── lib/                    # Hook library modules (compiled → hooks/scripts/lib/)
│   │   └── *.ts                    # Individual hook entry points (one per Claude Code event)
│   ├── i18n/                       # Internationalization (en.ts, zh.ts)
│   ├── registry/                   # Pkg definitions for installables (plugins + MCPs)
│   │   ├── mcps/                   # MCP server descriptors
│   │   └── plugins/                # Plugin descriptors
│   ├── runner/                     # Wrappers around `claude` CLI; state cache; CLAUDE.md sync
│   ├── runtime/                    # Evidence, state, verdict, discovery, readiness, recovery, release
│   │   ├── adapters/               # Browser + API-data evidence adapters
│   │   ├── capabilities/           # Capability doctor, readiness probes
│   │   ├── contracts/              # AJV-based schema contract validation
│   │   ├── discovery/              # Project topology + command detection
│   │   ├── evidence/               # Evidence ledger, artifact index, I/O
│   │   ├── planner/                # Capability routing, user journey planning
│   │   ├── policy/                 # Action-risk policy
│   │   ├── probes/                 # Browser, API, data, full-stack probes
│   │   ├── readiness/              # Runtime readiness evaluation
│   │   ├── recovery/               # Failure taxonomy, recovery planner, retry lineage
│   │   ├── release/                # Release authorization, dry-run, parity checks
│   │   ├── reports/                # Report rendering and storage
│   │   ├── services/               # Service lifecycle, health, ports
│   │   ├── state/                  # State store, I/O, migration, workspace
│   │   └── verdict/                # Completion verdict evaluator
│   └── ui/                         # UI helpers (language.ts, menu.ts)
│
├── plugins/                        # Shipped plugin assets (installed to ~/.claude)
│   └── curdx-flow/                 # Primary plugin directory (the product)
│       ├── .claude-plugin/         # Plugin manifest
│       │   └── plugin.json
│       ├── agents/                 # Subagent markdown prompts (10 agents)
│       ├── bin/                    # Plugin-side binary
│       │   └── curdx-flow          # Runtime CLI proxy (Node ESM script)
│       ├── hooks/                  # Hook registration + compiled scripts
│       │   ├── hooks.json          # Claude Code hook declarations (event → script mapping)
│       │   └── scripts/            # Compiled .mjs bundles + source maps (committed)
│       │       ├── *.mjs           # Hook entry bundles (one per hook event)
│       │       ├── *.mjs.map       # Source maps for debugging
│       │       └── lib/            # Compiled library bundles (runtime-cli, auto-policy, etc.)
│       ├── references/             # Reference docs loaded by skills at need
│       ├── schemas/                # JSON schemas for state files and evidence
│       ├── skills/                 # One subdirectory per /curdx-flow:* slash skill
│       │   └── <name>/             # Skill directory (e.g., start, implement, triage)
│       │       ├── SKILL.md        # Skill definition (YAML frontmatter + markdown body)
│       │       └── references/     # Skill-local reference docs (optional)
│       └── templates/              # Markdown artifact templates
│
├── scripts/                        # Build and release automation (Node ESM, repo-only)
│   ├── build-hooks.mjs             # esbuild driver: src/hooks/*.ts → plugins/*/hooks/scripts/*.mjs
│   ├── bump-version.mjs            # Version bump helper
│   ├── check-bundle-size.mjs       # Bundle size gate
│   ├── check-hooks-fresh.mjs       # Verifies committed bundles match current sources
│   ├── check-verification-blocks.mjs
│   ├── check-versions.mjs          # Cross-checks package.json ↔ plugin.json ↔ marketplace.json versions
│   ├── claudecc-smoke.mjs          # Claude Code plugin smoke test
│   └── claudecc-e2e-flow.mjs       # End-to-end install + invocation test
│
├── tests/                          # Vitest test suites
│   ├── analyze/                    # Transcript parser tests
│   ├── contracts/                  # Runtime contract schema tests
│   ├── fixtures/                   # Test fixture data (broken-app, runtime-readiness, etc.)
│   ├── hooks/                      # Hook behavior tests
│   ├── runner/                     # Runner module tests
│   └── runtime/                    # Runtime module tests (mirrors src/runtime/ structure)
│
├── dist/                           # Built CLI output (generated, committed)
│   ├── index.mjs                   # Main CLI bundle (shebang + citty app)
│   ├── analyze-*.mjs               # Split chunk for analyze subcommand
│   └── check-*.mjs                 # Split chunk for check subcommand
│
├── docs/                           # Documentation assets
│   └── assets/readme/              # README images/assets (included in npm package)
│
├── .claude-plugin/                 # Repo-level marketplace manifest
│   └── marketplace.json            # Declares the "curdx" marketplace with plugins list
│
├── .claude/                        # Repo-level Claude Code config (skills for this repo's dev)
│   └── skills/                     # bmad-* skills for repo development workflows
│
├── .agents/                        # Agent skills (mirrors .claude/skills/)
│   └── skills/                     # bmad-* agent skill directories
│
├── .planning/                      # GSD planning artifacts
│   └── codebase/                   # Codebase analysis documents
│
├── _bmad/                          # BMAD framework config (repo tooling)
├── _bmad-output/                   # BMAD output artifacts
│
├── package.json                    # npm package: @curdx/flow v7.3.3
├── tsconfig.json                   # TypeScript strict config (Node20, ESM)
├── tsup.config.ts                  # CLI bundle config (splitting=true, esm, node20)
├── vitest.config.ts                # Vitest config
├── AGENTS.md                       # Repo guidelines for AI agents
└── CHANGELOG.md                    # Published in npm package
```

## Directory Purposes

**`src/`:**
- Purpose: All TypeScript source code. Two distinct products coexist here: the CLI installer and the hook sources.
- Contains: CLI entry point, flows, registry, runner, runtime, hook sources, i18n, ui
- Key files: `src/index.ts` (CLI root), `src/hooks/_shared/run-hook.ts` (hook wrapper), `src/hooks/_shared/path-resolver.ts` (spec resolution), `src/registry/index.ts` (PKGS list), `src/runner/state.ts` (claude CLI wrappers)

**`plugins/curdx-flow/`:**
- Purpose: The primary product — the Claude Code plugin. Everything under this directory is shipped to `~/.claude/plugins/curdx-flow/` when the plugin is installed.
- Contains: skill definitions, agent prompts, hook declarations + compiled bundles, runtime CLI, schemas, templates, references
- Key files: `.claude-plugin/plugin.json` (manifest), `hooks/hooks.json` (event→script map), `bin/curdx-flow` (runtime CLI entry)

**`plugins/curdx-flow/hooks/scripts/`:**
- Purpose: Compiled, self-contained `.mjs` bundles that Claude Code actually executes as hooks. These are build artifacts that MUST be committed to git because the plugin is distributed via git source (`curdx/curdx-flow`).
- Generated: Yes (by `npm run build:hooks`)
- Committed: Yes (required for marketplace distribution)

**`scripts/`:**
- Purpose: Build and release automation; never shipped to users.
- Contains: esbuild driver (`build-hooks.mjs`), version checks, smoke tests, e2e runner
- Used by: `npm run` scripts only; not loaded by Claude Code or the CLI

**`src/runtime/`:**
- Purpose: Reusable pure-TypeScript library used by both hook sources (`src/hooks/lib/`) and CLI flows. Not a runtime in the "server" sense — a collection of domain modules.
- Submodules mirror test directories under `tests/runtime/`

**`tests/`:**
- Purpose: Vitest test suites. Structure mirrors `src/runtime/` for runtime modules; separate trees for `hooks/`, `analyze/`, `runner/`, `contracts/`
- Key pattern: `tests/<area>/<module>.test.ts`

**`.claude-plugin/` (repo root):**
- Purpose: Marketplace manifest for the `curdx` marketplace. Claude Code reads this when a user adds the marketplace (`claude plugin marketplace add curdx curdx/curdx-flow`).
- Key file: `marketplace.json` (lists `curdx-flow` plugin with source path `./plugins/curdx-flow`)

## Key File Locations

**Entry Points:**
- `src/index.ts`: CLI installer entry (compiled to `dist/index.mjs`)
- `plugins/curdx-flow/bin/curdx-flow`: Plugin runtime CLI (proxy to `runtime-cli.mjs`)
- `plugins/curdx-flow/hooks/scripts/stop-watcher.mjs`: Stop hook (iron-law gate)
- `plugins/curdx-flow/hooks/scripts/load-spec-context.mjs`: SessionStart hook (spec context injection)

**Plugin Manifests:**
- `plugins/curdx-flow/.claude-plugin/plugin.json`: Plugin manifest (name, version, deps, skills path, agents list)
- `.claude-plugin/marketplace.json`: Marketplace manifest (repo-root; declares the "curdx" marketplace)
- `plugins/curdx-flow/hooks/hooks.json`: Hook event-to-script mapping

**Registry:**
- `src/registry/index.ts`: `PKGS` array (all installable plugins + MCPs)
- `src/registry/types.ts`: `Pkg` interface definition
- `src/registry/plugins/*.ts`: Per-plugin install/uninstall/update logic
- `src/registry/mcps/*.ts`: Per-MCP install logic

**State and Resolution:**
- `src/hooks/_shared/path-resolver.ts`: Active spec resolution; session binding; `getSpecsDirs`, `resolveCurrent`, `findSpec`
- `src/runtime/state/`: State store, I/O, migration for `.curdx-state.json`
- `plugins/curdx-flow/schemas/state-ledger.schema.json`: Schema for `.curdx-state.json`

**Skills (plugin surface):**
- `plugins/curdx-flow/skills/start/SKILL.md`: Primary user entry point
- `plugins/curdx-flow/skills/spec-workflow/SKILL.md`: Workflow orchestration guidance
- `plugins/curdx-flow/skills/curdx-core/SKILL.md`: Common args, execution modes, coordinator rules

**Hook Sources:**
- `src/hooks/stop-watcher.ts`: Stop hook source (iron-law, cost-runaway, unchecked-tasks gates)
- `src/hooks/load-spec-context.ts`: SessionStart hook source
- `src/hooks/_shared/run-hook.ts`: Shared hook wrapper
- `src/hooks/lib/*.ts`: Library modules compiled separately to `hooks/scripts/lib/`

**Build/CI:**
- `scripts/build-hooks.mjs`: esbuild driver for hook compilation
- `scripts/check-hooks-fresh.mjs`: CI gate — fails if committed bundles don't match sources
- `scripts/check-versions.mjs`: Version synchronization check

## Naming Conventions

**Files:**
- TypeScript source files: `kebab-case.ts` (e.g., `stop-watcher.ts`, `path-resolver.ts`)
- Compiled hook bundles: `kebab-case.mjs` (same stem as source, different extension)
- Test files: `<module-name>.test.ts` named after the module under test
- Skill directories and SKILL.md files: `kebab-case/SKILL.md`
- Agent files: `kebab-case.md` (e.g., `spec-executor.md`)
- Schema files: `kebab-case.schema.json`
- Script files: `kebab-case.mjs` (repo scripts under `scripts/`)

**Directories:**
- Source modules: `kebab-case/` with an `index.ts` barrel
- Hook shared utilities: `_shared/` (underscore prefix = internal, not a hook entry)
- Plugin skills: `skills/<skill-name>/` matching the `/curdx-flow:<skill-name>` invocation
- Test mirrors: `tests/runtime/<submodule>/` mirrors `src/runtime/<submodule>/`

**Exports:**
- Hook sources export nothing; they call `runHook()` at module level as a side effect
- Runtime modules use named exports via `index.ts` barrel files
- Registry modules export a default `Pkg` object

## Where to Add New Code

**New slash skill (`/curdx-flow:<name>`):**
- Create: `plugins/curdx-flow/skills/<name>/SKILL.md`
- Pattern: YAML frontmatter with `name`, `description`, `when_to_use`, `user-invocable`, `version`; markdown body
- Register: No separate registry needed — Claude Code discovers skills from the `skills/` path in `plugin.json`

**New hook (new Claude Code lifecycle event):**
- Source: `src/hooks/<event-name>.ts` (call `runHook(async (input) => { ... })`)
- Register: Add entry to `plugins/curdx-flow/hooks/hooks.json`
- Build: Add source path to `HOOK_ENTRIES` in `scripts/build-hooks.mjs`; run `npm run build:hooks`
- Committed bundle lands at: `plugins/curdx-flow/hooks/scripts/<event-name>.mjs`

**New hook library module:**
- Source: `src/hooks/lib/<name>.ts`
- Build: `scripts/build-hooks.mjs` auto-collects all `src/hooks/lib/*.ts` via `collectGlob`
- Compiled to: `plugins/curdx-flow/hooks/scripts/lib/<name>.mjs`

**New installable plugin or MCP:**
- Descriptor: `src/registry/plugins/<name>.ts` (or `src/registry/mcps/<name>.ts`)
- Register: Add to `PKGS` array in `src/registry/index.ts`
- Optionally add `whenToUse` and `slashNamespace` fields for CLAUDE.md rendering

**New runtime module:**
- Implementation: `src/runtime/<area>/index.ts` + supporting files
- Tests: `tests/runtime/<area>/<name>.test.ts`
- Add npm script to `package.json` under `test:<area>` and include in `verify`

**New agent:**
- File: `plugins/curdx-flow/agents/<name>.md`
- Register: Add path to `agents` array in `plugins/curdx-flow/.claude-plugin/plugin.json`

**New skill reference doc:**
- Per-skill: `plugins/curdx-flow/skills/<name>/references/<topic>.md`
- Plugin-global: `plugins/curdx-flow/references/<topic>.md`

**New spec template:**
- File: `plugins/curdx-flow/templates/<name>.md`

## Special Directories

**`dist/`:**
- Purpose: CLI bundle output from `tsup`; the npm package `files` field ships this to consumers
- Generated: Yes (by `npm run build`)
- Committed: Yes — the npm package installs `dist/` directly; Conventional practice to commit for npm packages

**`plugins/curdx-flow/hooks/scripts/`:**
- Purpose: esbuild-compiled hook bundles; shipped inside the Claude Code plugin
- Generated: Yes (by `npm run build:hooks`)
- Committed: Yes — mandatory for git-source marketplace distribution; `check-hooks-fresh.mjs` guards staleness

**`.planning/codebase/`:**
- Purpose: GSD codebase analysis documents (this file and siblings)
- Generated: Yes (by GSD map-codebase)
- Committed: Developer discretion

**`_bmad/` and `_bmad-output/`:**
- Purpose: BMAD framework configuration and outputs for repo planning workflows
- Generated: Partially (output is generated)
- Committed: Config committed; output may vary

---

*Structure analysis: 2026-05-19*
