# Coding Conventions

**Analysis Date:** 2026-05-19

## Naming Patterns

**Files:**
- TypeScript source: `kebab-case.ts` across all directories (e.g., `stop-watcher.ts`, `action-risk-policy.ts`, `build-hooks.mjs`)
- Hook bundles (generated): `kebab-case.mjs` in `plugins/curdx-flow/hooks/scripts/` (e.g., `stop-watcher.mjs`)
- Lib helpers: `kebab-case.ts` under `src/hooks/lib/` and `src/hooks/_shared/`
- Script utilities: `kebab-case.mjs` under `scripts/` (e.g., `build-hooks.mjs`, `check-versions.mjs`)
- Test files: `kebab-case.test.ts` under `tests/<area>/` (e.g., `hook-boundary.test.ts`, `evidence-ledger.test.ts`)
- Skill files: `SKILL.md` (SCREAMING_SNAKE uppercase) in each skill directory

**Functions and Variables:**
- Functions: `camelCase` (e.g., `runHook`, `buildVerificationBlockFailDecision`, `tailContainsCompletionMarker`)
- Variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE` for module-level constants (e.g., `ALL_TASKS_COMPLETE_RE`, `HOOK_ENTRIES`, `SETTINGS_REL_PATH`, `SUBCOMMANDS`)
- Type-level registry constants: `SCREAMING_SNAKE_CASE` (e.g., `CURDX_PLUGIN_DEPENDENCIES`, `CURDX_EXTERNAL_MCPS`, `PKGS`)

**Types and Interfaces:**
- Interfaces: `PascalCase` (e.g., `HookRunResult`, `EpicState`, `BlockDecision`)
- Type aliases: `PascalCase` (e.g., `HookHandler`, `Lang`, `MessageKey`, `ContractName`)
- Exported types use `export type { ... }` (verbatimModuleSyntax enforced)

**Directories:**
- `kebab-case` throughout (e.g., `api-data/`, `full-stack/`, `ui-diagnostics/`)

## Language and Module Format

**TypeScript ESM — the only format in `src/`.**
- All source files: `.ts` extension, `import ... from './path.ts'` (explicit `.ts` on local imports, required by `verbatimModuleSyntax` + `allowImportingTsExtensions`)
- Node built-ins prefixed: `import ... from 'node:fs'`, `import ... from 'node:path'`, etc.
- Scripts under `scripts/`: `.mjs` (plain ESM Node.js, no TypeScript)
- Generated hook bundles: `.mjs` (produced by esbuild from `.ts` sources)
- No `.cjs` files anywhere; no CommonJS `require()` in source (only injected via esbuild banner for generated bundles)

**TypeScript Configuration (`tsconfig.json`):**
- `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`
- `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`
- `verbatimModuleSyntax: true` — enforces `import type` for type-only imports
- `noEmit: true` — tsc is typecheck-only; esbuild and tsup own compilation

## Code Style

**Formatting:**
- No Prettier or ESLint config files found — formatting is enforced by convention and TypeScript strictness, not a linter
- Two-space indentation (per AGENTS.md and consistent in all source files)
- Single quotes for string literals
- Semicolons at end of statements
- Trailing comma in multi-line object/array literals

**Linting:**
- No `.eslintrc` / `biome.json` present — type safety enforced via `npm run typecheck` (`tsc --noEmit`)

## Import Organization

**Order (consistent across source files):**
1. Node built-in imports (`node:fs`, `node:path`, `node:child_process`, etc.)
2. Third-party imports (rare in this codebase; only `@clack/prompts`, `citty`, `vitest` in tests)
3. Internal imports (`'./relative.ts'` or `'../area/module.ts'`)

**Path Aliases:**
- None. All internal imports use relative paths with explicit `.ts` extensions.
- Example from `src/hooks/stop-watcher.ts`:
  ```typescript
  import { runHook } from "./_shared/run-hook.js";
  import { getSpecsDirs, resolveCurrent } from "./_shared/path-resolver.js";
  ```
  Note: `.js` is used in hook source files (they import compiled neighbor modules); the main `src/` tree uses `.ts`.

## Error Handling

**Hook Error Policy (FR-8):**
- All hooks must NEVER block the Claude Code session. Any error exits with `process.exit(0)`.
- The `runHook` wrapper in `src/hooks/_shared/run-hook.ts` catches all unhandled throws, logs to stderr, and exits 0.
- Per-handler error: catch blocks use empty `catch { }` (swallow-and-continue) for non-critical paths, or explicit `catch (err)` with `const msg = err instanceof Error ? err.message : String(err)` when logging.
- Thrown errors surface to `logHookError` in `src/hooks/_shared/error-logger.ts`, never to stdout.

**Runtime Library Error Pattern:**
- Functions return structured result objects: `{ ok: true, value }` or `{ ok: false, issues: [...] }`.
- `issues` arrays use typed error codes (`'invalid-json'`, `'missing-required'`, `'invalid-pattern'`, `'invalid-enum'`, `'invalid-write'`, etc.).
- No `throw` across module boundaries for expected failure modes; callers check `result.ok`.

**CLI/Script Error Policy:**
- Scripts call `process.exit(2)` on hard failures (e.g., `check-versions.mjs`, `check-verification-blocks.mjs`).
- User-facing errors go to `console.error(...)`.

## Logging

**Framework:** `process.stderr.write(...)` directly in hooks; `console.log` / `console.error` in scripts.

**Patterns:**
- Hook progress lines use a bracket prefix: `[curdx-flow] <message>\n` (e.g., `[curdx-flow] ALL_TASKS_COMPLETE detected in transcript`).
- Error lines in scripts use: `✗ <message>` for failure, `✓ <message>` for success.
- No logging framework; no structured JSON logging in runtime paths.
- Hooks NEVER write diagnostic/debug content to stdout — stdout is reserved for hook decision JSON.

## Comments

**When to Comment:**
- All exported functions get JSDoc (`/** ... */`) that describes behavior, side-effects, and design rationale.
- Inline comments explain non-obvious decisions, cross-references to spec tasks (e.g., `// Task 2.23`), and shell-translation tables (v6→TS ports).
- Comments are in English throughout the codebase. Chinese appears only in user-facing output strings (`src/i18n/zh.ts`, report summaries like `'未发布 / 可发布'`) and in AGENTS.md's "respond in Simplified Chinese" instruction.

**JSDoc Style:**
- Multi-line `/** ... */` for functions with notable behavior or contracts.
- Single `/** short description */` for simple exported helpers.
- No `@param` / `@returns` tags — TypeScript types are the contract.

**Inline Comments:**
- `// v6 shell | TS replacement` translation tables in hook files.
- `// FR-8: <reason>` for failure-mode decisions.
- `// NFR-<N>: <description>` for non-functional requirement references.
- `// Task <N>.<M>: <rationale>` for spec-task cross-references.

## Commit Message Style

Conventional Commit format, always with a scope in parentheses:

```
<type>(<scope>): <description>
```

Types observed in `git log --oneline -30`:
- `feat` — new feature
- `fix` — bug fix
- `chore` — release bumps, housekeeping
- `test` — test additions or changes

Scopes observed:
- `(hooks)` — hook source or bundle changes
- `(plugin)` — plugin manifest, skills, agents, or capabilities
- `(installer)` — CLI install/update flow
- `(runtime)` — runtime library modules (`src/runtime/`)
- `(release)` — release gate scripts or workflows
- `(policy)` — action risk policy

Examples from history:
```
fix(hooks): stop static runtime process trees
feat(runtime): add evidence-driven verification and release gates
chore(release): bump version to 7.3.0
test(hooks): normalize brain paths on windows
fix(installer): manage plugins at user scope
```

Bodies are omitted in the majority of commits; no multi-paragraph convention.

## How Hooks Are Authored

1. **Source** written in TypeScript under `src/hooks/<name>.ts`.
2. Hook wraps its logic in `runHook(async (input) => { ... })` from `src/hooks/_shared/run-hook.ts`.
3. Return a `BlockDecisionOutput` object to block; return `undefined`/`void` to allow.
4. Run `npm run build:hooks` — esbuild bundles the source into `plugins/curdx-flow/hooks/scripts/<name>.mjs`.
5. Committed bundles live under `plugins/curdx-flow/hooks/scripts/` (must be committed — see AGENTS.md; git source distribution, not npm).
6. Hook freshness verified via `npm run check:hooks-fresh` (CI job: `check-fresh`).

## How Skills Are Authored

- Skills live under `plugins/curdx-flow/skills/<name>/SKILL.md`.
- Frontmatter fields: `name`, `description`, `argument-hint`, `allowed-tools`, `disable-model-invocation`, `when_to_use`, `version`, `user-invocable`.
- Body is plain Markdown with headers, code blocks, and tables.
- Communication style governed by `skills/communication-style/SKILL.md`: extreme concision, fragments over sentences, tables over prose, action steps always last.
- Skill names map to slash commands: `/curdx-flow:<skill-name>`.

## How Commands Are Authored

- CLI commands defined via `citty.defineCommand` in `src/index.ts`.
- Each command is a named function exporting a `defineCommand` result.
- Shared args extracted into `sharedArgs` constant.
- Flows live in `src/flows/<name>.ts`, delegated to from the command's `run()`.

---

*Convention analysis: 2026-05-19*
