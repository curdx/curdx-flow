---
project_name: 'curdx-flow'
user_name: '王定旭'
date: '2026-05-15'
sections_completed: ['discovery', 'technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'code_quality_rules', 'development_workflow_rules', 'critical_dont_miss_rules']
existing_patterns_found: 28
status: 'complete'
rule_count: 140
section_count: 7
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- `@curdx/flow` v7.2.1 is an ESM-only Node/TypeScript CLI plus a Claude Code plugin bundle. Node runtime is `>=20.12.0`; CI covers Node 20/22; release uses Node 22.
- Use `npm` and the committed `package-lock.json` as the dependency source of truth. Do not introduce pnpm/yarn/bun lockfiles or opportunistically upgrade tsup/esbuild/vitest/TypeScript without full parity and smoke gates.
- TypeScript is strict and bundler-oriented: `.ts` local imports are intentional; `moduleResolution: "Bundler"`, `verbatimModuleSyntax`, `isolatedModules`, `noUncheckedIndexedAccess`, and `noImplicitOverride` are active.
- Tests use Vitest (`tests/**/*.test.ts`, fork pool, 5s timeout). Claude plugin behavior is also covered by `scripts/claudecc-smoke.mjs`.

### Product Surface

- Treat `plugins/curdx-flow/` as the product, not just an example fixture. It contains the shipped Claude Code plugin: manifest, skills, agents, hooks, schemas, templates, references, and `bin/curdx-flow`.
- Treat official Claude Code docs (`https://code.claude.com/docs/llms.txt`), the installed `claude` CLI, and `claude plugin validate ./plugins/curdx-flow` as the source of truth for plugin behavior. Local docs are secondary and may be stale.
- Required plugin dependencies are `pua@pua-skills`, `claude-mem@thedotmack`, `chrome-devtools-mcp@chrome-devtools-plugins`, and `ui-ux-pro-max@ui-ux-pro-max-skill`.
- Expected external MCPs are `context7` and `sequential-thinking`.
- curdx-flow orchestrates and verifies external capabilities; it must not vendor, duplicate, or reimplement required plugins or external MCPs. Keep capability logic limited to detection, routing, gating, and recommendations.

### Canonical Sources

- CLI: `src/index.ts` -> `dist/index.mjs` via `npm run build`; never hand-edit `dist/`.
- Hooks: `src/hooks/**/*.ts` -> `plugins/curdx-flow/hooks/scripts/*.mjs` via `npm run build:hooks`; never hand-edit generated hook bundles except for inspection.
- Plugin metadata: `plugins/curdx-flow/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `plugins/curdx-flow/hooks/hooks.json` must stay aligned with registry and tests.

### Architecture Decisions

- TypeScript source is canonical; built `.mjs` hook scripts are committed shipping artifacts. Any `src/hooks/` or `scripts/build-hooks.mjs` change requires `npm run build:hooks`, `npm run check:hooks-fresh`, and relevant `npm run test:hooks`; generated `.mjs` diffs must correspond to source changes.
- Adding/removing a hook entrypoint requires keeping `scripts/build-hooks.mjs` `HOOK_ENTRIES`, `plugins/curdx-flow/hooks/hooks.json`, generated bundles, and smoke coverage aligned.
- Version identity must stay synchronized across five validated fields: `package.json`, `package-lock.json` root, `package-lock.json packages[""]`, `plugins/curdx-flow/.claude-plugin/plugin.json`, and `.claude-plugin/marketplace.json`.
- Use `node scripts/bump-version.mjs <version|patch|minor|major>` for release version changes; it updates all validated version fields and reruns the parity gate.
- Plugin dependency definitions must stay aligned across `src/registry/capabilities.ts`, `src/registry/plugins/*`, plugin manifest `dependencies`, marketplace `allowCrossMarketplaceDependenciesOn`, and `tests/runner/capabilities.test.ts`.
- Changing plugin manifest, marketplace, registry, or hooks metadata requires at least `npm run check-versions`, `npm run test:runner`, `npm run test:claudecc`, and preferably `claude plugin validate ./plugins/curdx-flow`.
- Do not assume npm release tags and Claude plugin release tags are equivalent. npm release uses GitHub tag `v*`; Claude plugin marketplaces expect plugin tags like `curdx-flow--v<version>`.
- Release readiness requires more than `npm run build`: run version parity, hook freshness, Claude plugin validation, smoke tests, `npm run verify`, and the release/tag checks expected by Claude Code.
- If dependency install behavior changes, inspect Claude Code plugin dependency docs and `claude plugin list --json` / `/doctor` behavior before patching around installer symptoms.

## Critical Implementation Rules

### Language-Specific Rules

#### ESM & Imports

- Import extensions are intentional: CLI/registry/analyze code uses local `.ts` imports; `src/hooks/` uses local `.js` imports for bundled ESM output. Do not normalize them.
- Keep Node code ESM-only. Do not add `require`, `module.exports`, `__dirname`, or `__filename`; use `import.meta.url` and `fileURLToPath` when path resolution is needed.
- Use `import type` / `export type` for type-only contracts. Hook bundles should not gain runtime imports from types.
- Prefer `node:` built-in imports (`node:fs`, `node:path`, `node:process`) in new Node code.

#### Hook Runtime Contracts

- Do not edit `plugins/curdx-flow/hooks/scripts/*` directly. Change `src/hooks/*`, run `npm run build:hooks`, and keep generated bundles fresh.
- Hook stdin and Claude CLI output are evolving external contracts. Parse JSON through guarded helpers or try/catch, tolerate unknown fields, and narrow load-bearing fields with explicit runtime checks.
- Do not treat `JSON.parse(...) as Type` as validation. Casts are acceptable at boundaries only when downstream code still checks required fields before making decisions.
- Hook failure policy: hooks fail open unless intentionally returning a Claude Code block/deny decision. Standard hooks should use `runHook`; uncaught hook errors must log and exit `0`.
- Hook IO contract: JSON decisions go to stdout; diagnostics go to stderr; empty stdout means allow/pass-through. Do not print debug text to stdout from hooks.
- Shared hook modules should avoid top-level side effects, `process.exit`, and unconditional filesystem writes. Side effects belong inside hook entrypoints wrapped by `runHook`.
- Treat caught values as `unknown`; convert with `err instanceof Error ? err.message : String(err)` before logging or returning diagnostics.

#### State & Process Safety

- State and generated JSON writes must be atomic when they can affect runtime behavior. Use `writeFileAtomic` or the runtime CLI state helpers instead of ad hoc direct writes.
- `.curdx-state.json` shape lives in shared types and plugin schema. Do not duplicate local state interfaces in every hook; update `src/hooks/_shared/types.ts` and `plugins/curdx-flow/schemas/spec.schema.json` when the persistent contract changes.
- Use explicit boolean checks for state flags, especially `state.completed === true`; old state files may omit fields.
- Command execution should go through `run`, `runStreaming`, and `ensureOk` patterns so exit codes, stdout/stderr, and installer errors stay consistent.
- Pass commands as executable plus argv arrays. Do not build shell-concatenated command strings for plugin, MCP, git, npm, or filesystem operations.

#### Regression Coverage

- Contract changes to hook stdin, Claude CLI parsing, `.curdx-state.json`, shared types, or plugin schemas require regression tests for missing old fields, unknown new fields, invalid JSON, and empty-stdout allow/pass-through paths.

### Framework-Specific Rules

#### Claude Code Plugin

- Plugin root structure matters. Keep `.claude-plugin/plugin.json` inside `.claude-plugin/`; keep `skills/`, `agents/`, `hooks/`, `bin/`, `schemas/`, `templates/`, and `references/` at plugin root.
- Plugin skills are namespaced by manifest `name`; public slash commands must remain stable as `/curdx-flow:<skill>`.
- Skills that install, update, uninstall, edit `CLAUDE.md`, mutate plugin state, or run external side effects must set `disable-model-invocation: true`. Only read-only/reference skills should opt into model invocation.
- Shipped skills should not use `allowed-tools: "*"`. Keep `allowed-tools` to the smallest practical set and verify frontmatter with `claude plugin validate ./plugins/curdx-flow`.
- Keep skill/agent frontmatter short. Long operating contracts belong in skill-local `references/` or plugin-global `${CLAUDE_PLUGIN_ROOT}/references/`.
- `.claude-plugin/plugin.json` is the Claude Code install/discovery/validation entrypoint. Any added, removed, or renamed plugin surface, including hooks, bin runtime, skills, agents, or dependencies, must check whether the manifest needs synchronization.
- Treat manifests and registry definitions as source-of-truth boundaries: `plugin.json` describes shipped plugin capability, `hooks.json` wires lifecycle behavior, and `src/registry/` describes installer/package state. Do not duplicate these contracts in prose-only instructions.
- Skill folder names, agent filenames, hook script paths, marketplace names, plugin ids, dependency ids, and version fields are public compatibility surfaces. Change plugin identity, dependencies, commands, or package version only when every consumer-facing registry/manifest surface is updated together.
- Plugin agents use Markdown frontmatter contracts. Do not add unsupported plugin-agent fields such as `hooks`, `mcpServers`, or `permissionMode`; verify current support in official Claude Code docs before adding new fields.
- `plugins/curdx-flow/bin/curdx-flow` is the plugin-local runtime surface used by skills. Prefer runtime CLI commands over duplicating shell snippets in skill instructions.

#### Claude Hooks

- `plugins/curdx-flow/hooks/hooks.json` is the lifecycle wiring. Every command hook should use `${CLAUDE_PLUGIN_ROOT}` paths so installed plugin locations work.
- Hook event names, matcher support, matcher target fields, and output schemas are Claude Code framework contracts. Verify new events or matcher behavior against official docs before using them.
- Only rely on `matcher` for hook events where official docs explicitly support it. For other events, filter inside the `src/hooks/*` handler and keep handler-side fallback filtering aligned with `hooks.json`.
- `UserPromptSubmit`, `UserPromptExpansion`, `PostToolBatch`, `TaskCompleted`, `PostCompact`, `SubagentStart`, `Stop`, and `StopFailure` hooks are runtime-control surfaces. Treat payload shape, side effects, and latency budget as compatibility contracts.
- Hook source lives in `src/hooks/**`; committed plugin hook scripts under `plugins/curdx-flow/hooks/scripts/` are generated runtime artifacts. Do not manually patch generated scripts unless the source change is made in the same change set.
- Hook handlers should be cheap and deterministic. Expensive reasoning belongs in the model/agent flow; hooks should gather facts, gate dangerous states, or inject compact context.
- Hook stdout is a protocol channel. Generated hook scripts should write only Claude Hook protocol JSON to stdout; diagnostics, debug logs, and errors belong on stderr or the existing error logger.
- Hook outputs are protocol payloads. Before changing `hookSpecificOutput`, `decision`, `permissionDecision`, or `additionalContext`, verify the event-specific output schema.

#### CLI & Installer Framework

- `citty` subcommand behavior has a known shape in this repo: root `run()` is intentionally absent, and `check` uses early dispatch. Do not "simplify" this without testing root help, subcommand help, and `check` exit behavior.
- `@clack/prompts` cancellations must return cleanly without partial installs or CLAUDE.md drift. Treat `p.isCancel(...)` paths as first-class control flow.
- Registry packages implement the `Pkg` contract. Required plugins are auto-included in install flows but still uninstallable; do not make `required` mean impossible to remove.
- Marketplace/plugin state is cached in-process. After install/update/uninstall/marketplace changes, call `clearStateCache()` or use existing helpers that already do it.
- `~/.claude/CLAUDE.md` managed block is generated from installed registry state and capability rules. Changes to `PKGS`, `whenToUse`, aliases, or capability rules must preserve managed-block rendering.
- External MCPs and plugin dependencies have different provisioning models. Do not install external MCPs through plugin dependency metadata, and do not model plugin dependencies as user-added MCP entries.

### Testing Rules

- Run the narrowest relevant test first, then the broader gate for shared/plugin surfaces. Do not skip targeted tests just because `npm run verify` passes.
- `src/hooks/**` or `scripts/build-hooks.mjs` changes require: `npm run build:hooks`, `npm run check:hooks-fresh`, and relevant `npm run test:hooks`.
- `npm run test:hooks` currently rebuilds hooks and uses `--passWithNoTests`; it is not by itself proof of hook protocol coverage. Add focused tests when changing hook IO, gating, state, or failure-open behavior.
- Plugin manifest, marketplace, registry, dependency, capability alias, or CLAUDE.md managed-block changes require: `npm run check-versions`, `npm run test:runner`, `npm run test:claudecc`, and preferably `claude plugin validate ./plugins/curdx-flow`.
- `npm run verify` is the local release-quality gate for typecheck, version parity, hook freshness, build, bundle size, hook/analyze/runner tests, and verification-block checks. It does not currently run `npm run test:claudecc`; run plugin smoke separately for Claude Code plugin behavior.
- CI does not cover every local gate. GitHub CI runs typecheck, hook freshness, hook tests, build, and bundle size across Node/OS matrix; local release validation must add version, runner/analyze, Claude plugin smoke, and plugin validation when relevant.
- `prepublishOnly` is narrower than the full release gate. Before publish/tag/push, run `npm run verify`, `npm run test:claudecc`, `claude plugin validate ./plugins/curdx-flow`, and the plugin/npm tag parity checks.
- CLI entrypoint, installer/update/uninstall/status flow, or `citty` dispatch changes require testing root help/version, subcommand help, and the affected flow; `check` requires direct early-dispatch verification.
- Analyze/parser/report changes require `npm run test:analyze` and should include fixture coverage for unknown transcript rows, corrupt JSON, schema drift, and redaction-sensitive fields.
- Persistent state or verification-block contract changes require tests for old missing fields, unknown future fields, invalid JSON, stale evidence, failed verification, and passing evidence.
- Hook tests should assert protocol behavior: stdout JSON shape, empty stdout pass-through, stderr diagnostics, exit-code behavior, and fail-open paths.
- Do not rely on mock-only tests for completion gates. If a change affects browser/runtime/plugin loading behavior, add smoke or real CLI/plugin validation evidence.
- `scripts/claudecc-smoke.mjs` runs in isolated temp directories; preserve that pattern so smoke tests do not create specs or state files in this repo.

### Code Quality & Style Rules

- Keep edits scoped to the product surface being changed. Do not refactor registry, hooks, skills, agents, templates, and tests together unless the behavior contract requires it.
- Match existing formatting: two-space indentation, semicolons, single quotes in CLI/registry code, and existing quote style inside `src/hooks` when touching hook files.
- Add shared helpers only when they prevent real drift or satisfy the repo's lib bar: at least two distinct callers or at least 30 lines of non-trivial implementation. Do not create helper modules for one-off tidiness.
- Prefer pure helpers in `src/hooks/lib/` or `src/hooks/_shared/` over duplicating parsing/state logic in multiple hook entrypoints.
- Keep hook entrypoints thin. Heavy policy belongs in reusable lib modules; entrypoints should parse input, call helpers, emit protocol output, and fail open.
- Preserve generated artifacts' auditability. Hook bundles are intentionally readable and not minified; do not enable minification or sourcemap policy changes without bundle-size and release validation.
- Keep public skill text concise and operational. Descriptions are triggers, not workflow summaries; long algorithms, rubrics, and examples belong in skill-local `references/` or plugin-global `${CLAUDE_PLUGIN_ROOT}/references/`.
- Avoid prose-only source of truth. If a rule controls runtime behavior, encode it in TypeScript, schema, tests, or plugin metadata where possible.
- Coordinator skills coordinate, validate, and delegate. Do not silently replace specialist agents during `/curdx-flow:implement`; parse exact agent markers and verify claimed artifacts/evidence before state changes.
- Preserve exact marker strings and output contracts: `TASK_COMPLETE`, `TASK_FAILED`, `TASK_MODIFICATION_REQUEST`, `REVIEW_PASS`, `REVIEW_FAIL`, `VERIFICATION_PASS`, `VERIFICATION_FAIL`, and phase completion markers are protocol, not prose.
- Comments should explain contracts, failure modes, or non-obvious compatibility decisions. Avoid comments that merely narrate obvious code.
- Treat `.DS_Store`, IDE files, local `.claude/`, `_bmad/`, `_bmad-output/`, `.curdx/`, and generated local context as unrelated unless the task explicitly targets them.
- Do not rewrite skill/agent prompts wholesale when a targeted contract fix is enough; preserve frontmatter, references, markers, and coordinator/delegation boundaries.

### Development Workflow Rules

- Start implementation work with `git status --short` and preserve unrelated user/local changes. Do not stage, reformat, delete, or normalize unrelated files just to make the diff cleaner.
- For Claude Code plugin-facing changes, check current official docs from `https://code.claude.com/docs/llms.txt` when touching plugin manifests, hooks, skills, agents, dependencies, marketplace metadata, tags, or release behavior.
- Match validation depth to change risk. Content-only changes need focused checks; hook/runtime, manifest, dependency, installer, and release changes require Claude Code validation and smoke coverage.
- Keep the implementation path source-first: edit TypeScript, manifest, skill, agent, schema, or template sources first; regenerate committed artifacts only through repo scripts.
- For hook changes, validate in order: edit `src/hooks/**`, run `npm run build:hooks`, run `npm run check:hooks-fresh`, then run relevant `npm run test:hooks` coverage.
- Hook changes must preserve Claude Code hook IO contracts: read stdin once, emit valid JSON only when required, keep stdout/stderr semantics intentional, avoid interactive prompts, and fail open unless explicitly enforcing a curdx-flow gate.
- For new, removed, or renamed plugin surfaces, update every connected surface in the same change set: manifest, hooks config, registry/capabilities, generated bundles, tests, smoke coverage, and docs references used by shipped skills.
- Test plugin changes locally with Claude Code itself, not only Vitest. Use the current official CLI syntax for local plugin-dir testing, record the actual command, and prefer `claude plugin validate ./plugins/curdx-flow`, `/reload-plugins`, and `CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc` for plugin behavior.
- When changing plugin dependencies, validate both dependency declaration and marketplace trust: `plugins/curdx-flow/.claude-plugin/plugin.json` dependencies, repo-root `.claude-plugin/marketplace.json` `allowCrossMarketplaceDependenciesOn`, registry definitions, and `claude plugin list --json` / `/doctor` error surfaces.
- Plugin workflows that depend on `pua`, `claude-mem`, `chrome-devtools-mcp`, `ui-ux-pro-max`, `context7`, or `sequential-thinking` must degrade explicitly when unavailable: detect capability, report actionable remediation, and do not silently skip critical context.
- For installer or marketplace changes, validate both source-dir plugin behavior and installed user-scope behavior; dependency resolution, marketplace trust, and generated paths can differ after install.
- For plugin metadata, dependency, or version changes, run `npm run check-versions` before Claude Code smoke tests. Version bumps must use `node scripts/bump-version.mjs <version|patch|minor|major>`.
- For CLI, registry, analyze, or runner changes, choose narrow local tests first: `npm run test:runner`, `npm run test:analyze`, `npm run build`, then escalate to `npm run verify`.
- Use Conventional Commit style already present in history, especially `feat(plugin): ...`, `fix(installer): ...`, `fix(plugin): ...`, `test(hooks): ...`, and `chore: release ...`.
- One implementation task should produce one coherent diff. Commit only when the user, story workflow, or release workflow requires it; avoid coupling release metadata, registry dependency changes, and feature implementation unless the task explicitly requires it.
- Treat a release as user-success evidence, not command completion. Before publishing, verify install, load, primary curdx-flow command path, dependency availability, hook non-blocking behavior, and actionable failure output.
- Before release or publish work, run `npm run verify`, `CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc`, `claude plugin validate ./plugins/curdx-flow`, and `curdx-flow doctor --cwd <repo>` when available.
- Treat npm tags and Claude Code plugin tags as separate release surfaces. `vX.Y.Z` triggers npm release; `curdx-flow--vX.Y.Z` is required for Claude Code plugin dependency resolution.
- Before release tagging, verify remote parity with `git ls-remote --tags origin "vX.Y.Z"` and `git ls-remote --tags origin "curdx-flow--vX.Y.Z"`. If only one tag exists remotely, treat `release.tagParity.state = "incomplete"` as blocking.
- Use `claude plugin tag --push` for plugin release tags when possible; it validates plugin contents, version parity, clean plugin working tree, and duplicate tag state before pushing.
- Test upgrade and partial-failure paths for release-impacting changes: existing installs, missing dependencies, cross-marketplace trust denial, one-tag-only remote state, and recovery steps after interrupted publish.
- After pushing release tags, verify remote tag presence, npm package availability, and Claude plugin dependency resolution from a clean environment before considering the release complete.
- CI coverage is defined by `.github/workflows/*`, not assumptions. Local release validation must add plugin validation, plugin smoke, version parity, runner/analyze tests, and tag parity checks when those are not covered by CI.

### Critical Don't-Miss Rules

- Do not treat `plugins/curdx-flow/` as a fixture. It is the shipped Claude Code plugin and the primary product surface.
- Do not rely on stale local docs or copied patterns from other plugins. For manifests, hooks, skills, agents, dependencies, marketplace, or release tags, verify current behavior from `https://code.claude.com/docs/llms.txt` and the installed `claude` CLI.
- Do not change `.claude-plugin/plugin.json` structure, command names, skill IDs, agent IDs, hook entry paths, or marketplace identifiers without updating the CLI registry, tests, generated bundles, and installed-plugin smoke coverage together.
- Do not hand-edit generated artifacts: `dist/index.mjs` and `plugins/curdx-flow/hooks/scripts/**` must come from `npm run build` or `npm run build:hooks`.
- Do not make shipped hooks depend on TypeScript source, repo-relative dev paths, dev dependencies, or build-time-only files at runtime. Installed plugins must execute from committed bundled scripts.
- Do not add unsupported plugin-agent frontmatter such as `hooks`, `mcpServers`, or `permissionMode`.
- Do not use `allowed-tools: "*"` in shipped skills. Mutating public workflow skills must keep `disable-model-invocation: true`.
- Do not widen permissions, tool access, shell execution, or file mutation scope in skills, agents, hooks, or templates without explicit product reason and regression coverage.
- Do not reimplement or vendor required companion capabilities. `pua`, `claude-mem`, `chrome-devtools-mcp`, `ui-ux-pro-max`, `context7`, and `sequential-thinking` are external capabilities to detect, route to, validate, or degrade around.
- Do not model external MCPs as Claude Code plugin dependencies, and do not add plugin-local `.mcp.json` / `mcpServers` config for expected external MCPs.
- Do not introduce network-required behavior into core plugin commands, hooks, or install/update paths unless there is offline degradation and a clear user-facing recovery message.
- Do not let hooks make Claude Code unusable. Hooks must fail open unless deliberately enforcing a curdx-flow gate, keep diagnostics off stdout, avoid prompts, and preserve event-specific JSON output contracts.
- Do not change hook stdout protocol, `.curdx-state.json`, verification blocks, or plugin schemas without regression tests for old missing fields, unknown future fields, invalid JSON, and fail-open behavior.
- Do not let compatibility migrations silently discard user state. State, spec, verification, or workflow migrations must preserve unknown fields where practical and recover from malformed state.
- Do not accept an agent completion marker as truth. Parse exact markers, verify the claimed artifact/evidence, then update state.
- Do not rename or soften protocol markers such as `TASK_COMPLETE`, `TASK_FAILED`, `TASK_MODIFICATION_REQUEST`, `REVIEW_PASS`, `REVIEW_FAIL`, `VERIFICATION_PASS`, `VERIFICATION_FAIL`, `RESEARCH_COMPLETE`, `REQUIREMENTS_COMPLETE`, `DESIGN_COMPLETE`, `TASKS_READY`, and `EPIC_READY`.
- Do not claim completion with placeholder language such as `v1`, `basic`, `static for now`, `wire later`, `skip for now`, or `future enhancement` unless the source requirement explicitly deferred that behavior.
- Do not hardcode `./specs/` or project-root `.current-spec` paths in plugin workflows. Use `basePath`, runtime path helpers, and generated state locations.
- Do not replace existing files wholesale when a targeted edit is possible. Preserve unrelated user changes and stable prompt/marker/frontmatter contracts.
- Do not run destructive filesystem actions without explicit user confirmation and a freshly verified, quoted target path.
- Do not call a change successful until a fresh user can install the plugin, run the primary slash-command workflow, trigger hooks without blocking Claude Code, and see actionable dependency guidance when companion capabilities are missing.
- Do not ship changes that break upgrade from the previous released version. Install, update, status, dependency detection, existing `.curdx-state.json`, managed CLAUDE.md blocks, and user-modified project files must be tested or migrated explicitly.
- Do not introduce a workflow, hook, or state transition without a recovery path. Users must be able to diagnose, disable, reinstall, rebuild generated state, or continue manually when curdx-flow, dependencies, or external MCPs fail.
- Do not change package version, plugin manifest version, marketplace version, dependency declarations, or release tags manually. Use the version script and verify all release surfaces together.
- Do not publish or tag when only one release surface is ready. npm `vX.Y.Z` and Claude plugin `curdx-flow--vX.Y.Z` tags must remain intentionally paired.
- Do not accept release confidence from intent, screenshots, or passing unit tests alone. Record concrete evidence for fresh install, update from last release, plugin smoke, hook freshness, generated artifact freshness, dependency degradation, and tag/version parity.
- Do not rely on CI alone for release confidence. Claude plugin validation, plugin smoke tests, installed-plugin behavior, dependency resolution, and tag parity need explicit local or release evidence.
- Do not log prompts, memory payloads, MCP responses, environment variables, or file contents by default. Debug traces must be opt-in and redacted.
- Do not let architecture cleanup outrank user-visible continuity. Aggressive refactors are acceptable only when slash commands, plugin install/update, hooks, dependencies, state recovery, and release paths remain verifiably usable.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing code in this repository.
- Follow all rules exactly as documented; when in doubt, prefer the more restrictive option.
- Update this file when new non-obvious implementation patterns or constraints emerge.

**For Humans:**

- Keep this file lean and focused on agent needs.
- Update it when the technology stack, Claude Code plugin contracts, release workflow, or core product boundaries change.
- Review periodically for outdated rules and remove anything that becomes obvious or redundant.

Last Updated: 2026-05-15
