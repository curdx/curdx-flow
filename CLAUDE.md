# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`@curdx/flow` is a single npm package that ships two coupled deliverables under one version number:

1. **CLI** (`npx @curdx/flow`) — interactive installer for Claude Code plugins and MCP servers. Source in `src/`, built by `tsup` to `dist/index.mjs`.
2. **Bundled Claude plugin** `curdx-flow@curdx` — a spec-driven dev workflow exposed as `/curdx-flow:*` slash commands. Lives in `plugins/curdx-flow/`; advertised by `.claude-plugin/marketplace.json`.

Because both ship together, the version string lives in **five** places that must stay in lockstep (see Release SOP).

## Common commands

### Build / dev
- `npm run dev` — `tsup --watch` for the CLI.
- `npm run build` — bundle CLI to `dist/index.mjs`.
- `npm run build:hooks` — esbuild bundles `src/hooks/**/*.ts` → `plugins/curdx-flow/hooks/scripts/**/*.mjs`. Run after editing any hook source.
- `npm run typecheck` — `tsc --noEmit`.
- `node dist/index.mjs` — smoke-run the built CLI.

### Tests (vitest, `pool: 'forks'`, 5s timeout, includes `tests/**/*.test.ts`)
- `npm run test:hooks` — builds hooks first, then runs `tests/hooks/`.
- `npm run test:analyze` — `tests/analyze/` (cost analyzer).
- `npm run test:runner` — `tests/runner/` (subprocess + state utilities).
- `npm run test:claudecc` — CLI smoke (`scripts/claudecc-smoke.mjs`).
- `npm run test:claudecc:e2e` — full end-to-end (`scripts/claudecc-e2e-flow.mjs`).
- Single test file: `npx vitest run tests/hooks/<name>.test.ts`.
- Single test by name: `npx vitest run -t "<test name>"`.

`tests/cli/` exists but has no dedicated script — run via `npx vitest run tests/cli`.

### Gates (also wired into CI / `prepublishOnly`)
- `npm run check-versions` — the 5-field version-drift gate.
- `npm run check:hooks-fresh` — rebuilds hooks and `git diff --exit-code`s the output to catch stale bundles.
- `npm run check:bundle` — CLI bundle size check.
- `npm run verify` — the "did I break anything" command: `typecheck && check-versions && check:hooks-fresh && build && check:bundle && test:hooks && test:analyze && test:runner && check-verification-blocks`.

### Release helper
- `npm run bump-version <X.Y.Z|patch|minor|major>` — atomically writes all 5 version fields and re-runs `check-versions`. Pass `--dry-run` to preview.

### Linting / formatting
**None.** No ESLint, Prettier, or Biome config exists. The quality gate is TypeScript strict mode (`tsconfig.json`: ES2022, ESNext modules, `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `noImplicitOverride`).

## Architecture

### CLI (`src/`)
Entry point `src/index.ts` uses the **citty** framework to define five top-level subcommands — `install`, `update`, `uninstall`, `status`, `analyze` — with shared args `--lang` and `--no-claude-md`. Version is read from `package.json` at runtime.

| Module | Role |
| --- | --- |
| `src/flows/` | One flow per CLI command. Orchestrates `claude plugin install` / `claude mcp add` subprocesses and syncs a managed block into `~/.claude/CLAUDE.md`. |
| `src/registry/` | Catalog of installable plugins (`plugins/`) and MCP servers (`mcps/`) as descriptor files. |
| `src/runner/` | Subprocess exec, persistent state, build-freshness checks, CLAUDE.md sync, bun detection. |
| `src/ui/` | `@clack/prompts`-based interactive menus, language picker. |
| `src/analyze/` | Transcript cost analysis (parser, pricing, filter, report). |
| `src/i18n/` | `en.ts`, `zh.ts` translations. |
| `src/hooks/` | TypeScript sources for the bundled plugin's runtime hooks. |

### Bundled plugin (`plugins/curdx-flow/`)
Implements a five-phase, spec-driven dev workflow. Each phase is a `/curdx-flow:*` slash command that delegates to a specialist agent and produces a markdown artifact that feeds the next phase:

1. `/curdx-flow:research` → research-analyst → `research.md`
2. `/curdx-flow:requirements` → product-manager → `requirements.md`
3. `/curdx-flow:design` → architect-reviewer → `design.md`
4. `/curdx-flow:tasks` → task-planner → `tasks.md`
5. `/curdx-flow:implement` → spec-executor (autonomous loop) → code, tests, commits

Plugin tree:
- `.claude-plugin/plugin.json` — manifest (version field; one of the 5 synced fields).
- `agents/` — specialist agents (architect-reviewer, product-manager, task-planner, spec-executor, QA, etc.).
- `skills/` — skill bundles backing the slash commands.
- `references/` — design docs (phase rules, verification layers, coordinator pattern, two-stage review, …).
- `schemas/spec.schema.json` — spec validation schema.
- `templates/` — scaffolds (e.g. `tasks.md` template).
- `bin/curdx-flow` — plugin-side launcher.
- `hooks/hooks.json` — registers built hook scripts to Claude Code lifecycle events.
- `hooks/scripts/*.mjs` — **built** ESM bundles. Generated; do not hand-edit.

### Hook build pipeline
`src/hooks/**/*.ts` (~8 hook entries plus `lib/` and `_shared/` utilities) is bundled by esbuild via `scripts/build-hooks.mjs` into single-file ESM output at `plugins/curdx-flow/hooks/scripts/**/*.mjs`. Settings: `bundle: true`, `platform: 'node'`, `target: 'node20'`, `format: 'esm'`, `outbase: 'src/hooks'`, banner injects `require` / `__filename` / `__dirname` for ESM compatibility, `minify: false` for plugin auditability. `hooks.json` invokes each as `node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/<name>.mjs"`.

**Workflow rule:** edit `src/hooks/`, then `npm run build:hooks`. CI gates desync via `check:hooks-fresh`. Full rationale in `specs/cross-platform-support/design.md` → "Build Pipeline → esbuild 配置".

### CI
`.github/workflows/ci.yml` runs typecheck (Ubuntu), `check:hooks-fresh` (Ubuntu), and a test matrix across Ubuntu 20/22, macOS, and Windows. `.github/workflows/release.yml` triggers on tag push (see Release SOP).

## Release SOP

**Always confirm the bump level (PATCH/MINOR/MAJOR) with the user before editing any file.** Default to PATCH.

1. **`npm run bump-version <X.Y.Z|patch|minor|major>`** — atomically writes all 5 fields below and re-runs `check-versions`.

   | File | Field |
   | --- | --- |
   | `package.json` | `version` |
   | `package-lock.json` | `version` (top-level) |
   | `package-lock.json` | `packages[""].version` |
   | `plugins/curdx-flow/.claude-plugin/plugin.json` | `version` |
   | `.claude-plugin/marketplace.json` | `plugins[name="curdx-flow"].version` |

2. Prepend a new section to `CHANGELOG.md`:
   ```
   ## X.Y.Z — YYYY-MM-DD

   ### Added | Changed | Fixed | Breaking
   - ...
   ```
   Match existing tone (concrete; reference commit SHAs / file paths when relevant).

3. Commit, tag, push:
   ```bash
   git add -A
   git commit -m "chore: release vX.Y.Z"
   git tag vX.Y.Z
   git push origin main --tags
   ```

4. Tag push triggers `.github/workflows/release.yml`: `npm ci` → `check-versions` → `build` → `npm publish --provenance --access public` (uses `NPM_TOKEN`) → `softprops/action-gh-release@v2` for auto-generated notes.

5. Verify: GitHub Releases tab shows `vX.Y.Z`; `npm view @curdx/flow version`; `npx @curdx/flow@X.Y.Z --help`.

`prepublishOnly` (`check-versions && typecheck && check:hooks-fresh && build`) is local defense-in-depth; CI does not depend on it.

## Things that have broken before — don't repeat

- **v5.0.0** bumped `plugin.json` but missed `marketplace.json`. The Claude CLI kept advertising the old version and the installer's update path silently no-op'd. Fix: commit `e234fb8`, plus `check-versions.mjs` as a hard build gate. → Always sync **all 5 fields**.
- **v6.0.0** bumped `package.json` but missed `package-lock.json`. CI's `npm ci` failed because lockfile and manifest disagreed. Fix: commit `d90f081`. → Use `bump-version` (or `npm version --no-git-tag-version`); never hand-edit only `package.json`.

## Don'ts

- Don't bump the version without explicit user confirmation of the bump level.
- Don't skip `npm run check-versions` locally — let it catch drift before CI does.
- Don't push tags without first pushing the release commit (the workflow checks out the tag's commit, which must contain the bumped versions).
- Don't run `npm publish` manually unless CI is broken and the user asks.
- Don't amend or force-push a release tag once it's on origin — npm publishes are immutable, so a re-push creates a tag/registry mismatch. Cut a new patch instead.
- Don't edit `plugins/curdx-flow/hooks/scripts/*.mjs` directly — they're generated. Edit `src/hooks/**/*.ts` and run `npm run build:hooks`.
