# Repository Guidelines

## Project Structure & Module Organization

This repository ships `@curdx/flow`, a Node/TypeScript CLI and Claude Code plugin bundle. `src/` contains CLI source: `flows/` handles install, update, status, and analysis; `registry/` defines plugins and MCP servers; `hooks/` contains hook source and shared runtime libraries. The core product lives in `plugins/curdx-flow/`, including `.claude-plugin/plugin.json`, `skills/`, `agents/`, `hooks/`, `schemas/`, `templates`, and `references/`. Generated hook bundles are committed under `plugins/curdx-flow/hooks/scripts/`; update them with `npm run build:hooks`. Automation scripts live in `scripts/`, and tests live under `tests/**/*.test.ts`.

## Build, Test, and Development Commands

- `npm ci`: install dependencies from `package-lock.json`.
- `npm run dev`: run `tsup` in watch mode for CLI development.
- `npm run build`: build the CLI bundle to `dist/index.mjs`.
- `npm run build:hooks`: bundle hook sources into plugin scripts.
- `npm run typecheck`: run strict TypeScript checks.
- `npm run test:hooks`, `npm run test:analyze`, `npm run test:runner`: run targeted Vitest suites.
- `npm run test:claudecc`: run the Claude Code plugin smoke test.
- `npm run verify`: run the full local release-quality gate.

## Coding Style & Naming Conventions

Use TypeScript ESM targeting Node 20+. Match the existing style: two-space indentation, single quotes, semicolons, kebab-case filenames for hooks and scripts, and `.ts` extensions on local imports. Prefer explicit return types for exported helpers and public workflow functions. Keep plugin command names, skill folders, marketplace identifiers, and hook script paths stable unless the manifest, registry, and generated bundles are updated together.

## Testing Guidelines

Vitest is the test runner. Name tests by area, for example `tests/hooks/stop-watcher.test.ts` or `tests/analyze/parser.test.ts`. Changes to `src/hooks/` must run `npm run build:hooks` and `npm run check:hooks-fresh`. Plugin metadata changes should run `npm run check-versions` and `npm run test:claudecc`.

## Commit & Pull Request Guidelines

Prefer Conventional Commit style seen in history, such as `feat(plugin): ...`, `fix(installer): ...`, or `test(hooks): ...`. Pull requests should describe behavior changes, affected plugin or CLI surfaces, linked issues, and exact verification commands run. For releases, synchronize versions, run `npm run verify`, then push the release tags required by the plugin/npm workflow.

## Agent-Specific Notes

Always respond in Simplified Chinese when working in this repository. Treat `plugins/curdx-flow` as the primary product surface. Keep dependency expectations aligned across the plugin manifest and registry, especially `pua`, `claude-mem`, `chrome-devtools-mcp`, `ui-ux-pro-max`, and external MCP capabilities.


<claude-mem-context>
# Memory Context

# [curdx-flow] recent context, 2026-05-17 9:12pm EDT

No previous sessions found.
</claude-mem-context>