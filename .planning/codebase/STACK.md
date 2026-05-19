# Technology Stack

**Analysis Date:** 2026-05-19

## Languages

**Primary:**
- TypeScript 5.9.3 (resolved) / `^5.6.0` (declared) — all source under `src/`, all tests under `tests/`
- JavaScript ESM (`.mjs`) — generated hook bundles in `plugins/curdx-flow/hooks/scripts/`, automation scripts in `scripts/`

**Secondary:**
- Markdown — plugin skills (`plugins/curdx-flow/skills/*/SKILL.md`), agents (`plugins/curdx-flow/agents/*.md`), references (`plugins/curdx-flow/references/*.md`), templates (`plugins/curdx-flow/templates/*.md`)
- JSON Schema — plugin schemas in `plugins/curdx-flow/schemas/*.schema.json`

## Runtime

**Environment:**
- Node.js `>=20.12.0` (hard constraint in `package.json` `engines` field and `tsconfig.json` target `ES2022`)
- lockfile engine entry: `{ "node": ">=20.12.0" }` (`package-lock.json` root `packages[""]`)

**Package Manager:**
- npm (lockfile present at `package-lock.json`, lockfileVersion 3)
- Lockfile: present and committed — `npm ci` is the canonical install command

## Frameworks

**Core CLI:**
- `citty` 0.1.6 — argument parsing and subcommand dispatch (`src/index.ts`)
- `@clack/prompts` 1.2.0 (`@clack/core` 1.2.0) — interactive TUI prompts, spinners, task logs

**Testing:**
- `vitest` 2.1.9 — test runner with `pool: 'forks'` and 5-second `testTimeout`; config at `vitest.config.ts`; includes all `tests/**/*.test.ts`

**Build/Dev:**
- `tsup` 8.5.1 — CLI bundle build; entry `src/index.ts` → `dist/index.mjs` (ESM, `node20` target, splitting enabled, no minify, no DTS); config at `tsup.config.ts`
- `esbuild` 0.24.2 — hook bundle build only, invoked by `scripts/build-hooks.mjs`; bundles all `src/hooks/*.ts` and `src/hooks/lib/*.ts` → `plugins/curdx-flow/hooks/scripts/` as `.mjs` with linked sourcemaps

## Key Dependencies

**Critical (runtime):**
- `@clack/prompts` 1.2.0 — TUI for install/update/status flows
- `citty` 0.1.6 — CLI subcommand framework (`install`, `uninstall`, `update`, `status`, `analyze`, `check`)
- `picocolors` 1.1.1 — zero-dep terminal color output
- `tinyexec` 1.1.1 — subprocess execution (`src/runner/exec.ts`); used for all `claude` CLI invocations

**Infrastructure (devDependencies):**
- `typescript` 5.9.3 — strict mode, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `noImplicitOverride`
- `tsup` 8.5.1 — CLI bundler
- `esbuild` 0.24.2 — hook bundler (invoked directly as a library, not via CLI)
- `vitest` 2.1.9 — test runner
- `ajv` 8.20.0 + `ajv-formats` 3.0.1 — JSON Schema validation for plugin schemas (used in `tests/contracts/`)

## Configuration

**TypeScript:**
- `tsconfig.json` at repo root
- `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`
- `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`
- `verbatimModuleSyntax: true`, `isolatedModules: true`
- `noEmit: true` — tsc is typecheck-only; actual emit done by tsup/esbuild
- Local imports use `.ts` extensions (required by `verbatimModuleSyntax`)

**Build (CLI):**
- `tsup.config.ts` — entry `{ index: 'src/index.ts' }`, format ESM, `outExtension: .mjs`, shebang banner `#!/usr/bin/env node`, tree-shaking off, splitting on, sourcemap off

**Build (Hooks):**
- `scripts/build-hooks.mjs` — esbuild driver; `platform: node`, `target: node20`, `format: esm`, `packages: bundle`, `sourcemap: linked`, `minify: false`; output dir `plugins/curdx-flow/hooks/scripts`; hook scripts package.json at `plugins/curdx-flow/hooks/scripts/package.json` declares `"type": "module"`

**Test:**
- `vitest.config.ts` — `include: ['tests/**/*.test.ts']`, `pool: 'forks'`, `testTimeout: 5000`

**Environment:**
- No `.env` file; runtime config passed via `process.env` where needed (e.g. `CURDX_FLOW_NO_CLAUDE_MD`, `CURDX_VERIFY_SKIP_BLOCKS`, `CHROME_PATH`, `CONTEXT7_API_KEY`, `CURDX_FLOW_CLAUDE_BIN`, `CURDX_FLOW_MCP_LIST_OUTPUT`)

## Platform Requirements

**Development:**
- Node.js >= 20.12.0
- npm (lockfile v3)
- Optional: `claudecc` or `claude` binary on `$PATH` for integration/smoke tests
- Optional: Bun (required as a prereq for `claude-mem` plugin installation at runtime; installer can auto-install it)

**Production (npm package distribution):**
- Published as `@curdx/flow` to npm registry (public)
- `bin: ./dist/index.mjs` — invoked as `npx @curdx/flow` or via Claude Code
- `files` published: `dist/`, `docs/assets/readme/`, `CHANGELOG.md`

**Production (plugin distribution):**
- Plugin source at `plugins/curdx-flow/` distributed via Claude Code marketplace git source (`curdx/curdx-flow`)
- Hook bundles (`.mjs` + `.map`) are committed artifacts under `plugins/curdx-flow/hooks/scripts/`; regenerated with `npm run build:hooks`
- Bundle size gate: `dist/index.mjs` must remain <= 84 KB (NFR-3, enforced by `scripts/check-bundle-size.mjs`)

## Version Consistency Gate

Four files must agree on version at all times:
1. `package.json` → `version`
2. `package-lock.json` → root `version`
3. `plugins/curdx-flow/.claude-plugin/plugin.json` → `version`
4. `.claude-plugin/marketplace.json` → `plugins[name=curdx-flow].version`

Enforced by `scripts/check-versions.mjs` (runs on `prepublishOnly` and in `npm run verify`).

---

*Stack analysis: 2026-05-19*
