# lib/ — cross-platform Node CLI utilities

This directory holds single-purpose Node CLIs that replace the v6
`bash + jq + grep + find + lsof` toolchain so the curdx-flow plugin runs
on Windows, Linux, and macOS without a POSIX shell. Sources are TypeScript
in `src/hooks/lib/*.ts`; esbuild bundles them to
`plugins/curdx-flow/hooks/scripts/lib/*.mjs` (single-file ESM, see
`scripts/build-hooks.mjs`). Skill prompts and command markdown invoke
them as `node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/lib/<name>.mjs" <args>`.

## Convergence rationale

The core catalog converged from an initial 11 to **10** during Phase 2.5
(`specs/cross-platform-support/tasks.md` task 2.5). Convergence bar:
**a lib stays only if it has ≥2 distinct callers OR ≥30 lines of
non-trivial impl** (the disjunction means a "future-use" lib with
substantive code stays even before adoption). The later `project-topology`
lib follows the same bar: it is non-trivial, CLI-callable, and used by
routing/indexing surfaces. All surviving libs pass
the LOC half of the bar (≥31 code lines each).

`update-fix-task-map.ts` was **dropped** because (a) it had zero callers
and (b) its internal schema `{count, depth, fixes:[{id,reason}]}`
diverged from the canonical `spec.schema.json::fixTaskMap` shape
`{attempts, fixTaskIds, lastError}` documented in `references/failure-recovery.md`,
`references/coordinator-pattern.md`, and `skills/implement/SKILL.md`. Keeping
the lib risked a future caller picking up the wrong shape and writing
state that violates the schema. Later additions such as `project-topology` and
`dev-runtime`, `stack-capabilities`, `execution-brief`, and `project-brain`
follow the same "non-trivial or multi-caller" bar. The inline `node -e` pattern shown in
`references/failure-recovery.md:250-260` already mutates `fixTaskMap`
correctly with the canonical shape — no replacement lib is needed.

The surviving libs are deliberately **infrastructure ahead of
adoption**: most have zero markdown callers today because Phase 1's
markdown sweep (tasks 1.34-1.36) chose inline `node -e` for many
single-shot replacements. The libs are the right home for any future
multi-call-site or non-trivial logic, and they're cheaper to keep than
to recreate later.

## Catalog

| Lib | LOC | Callers | Purpose |
| --- | --- | --- | --- |
| `auto-policy` | 360 | 0 (designed for `skills/start`, `skills/new`, `skills/tasks`) | deterministic execution policy classifier for behavior routing, task granularity, review cadence, verification level, subagent use, and goal/manual execution driver |
| `cleanup-files` | 185 | 0 (designed for `skills/implement/SKILL.md` cleanup phase) | glob + delete with safety guards (refuses to delete outside repo, refuses dotfiles unless explicit) |
| `count-mocks` | 107 | 0 (designed for `templates/tasks.md` verification-before-completion VE2) | walks tests/, counts `vi.mock` / `jest.mock` / `mock.fn` occurrences, prints mock-vs-real ratio JSON |
| `count-tasks` | 54 | 0 (designed for `templates/tasks.md`, `skills/status/SKILL.md`) | parse `tasks.md` → `{total, completed, pending}` JSON via `_shared/markdown-task-parser` |
| `dev-runtime` | 500+ | 1 (`runtime-cli`) | last-mile local evidence runtime: detect project commands, start services, check health, run verification, and stop curdx-flow-started services |
| `ensure-gitignore` | 64 | 0 (designed for `skills/implement/SKILL.md`, `templates/tasks.md`) | idempotent: append `<entry>` to `.gitignore` only if missing |
| `execution-brief` | 200+ | 3 (`runtime-cli`, `user-prompt-expansion-guard`, `post-tool-batch-snapshot`) | compiles smart-route facts into a bounded execution contract: context budget, primary skill, agent plan, quality gates, completion evidence, and escalation rules |
| `get-default-branch` | 105 | 0 (designed for native sync + `skills/start/SKILL.md`) | cross-platform git default branch detection (origin/HEAD → main → master fallback chain) |
| `init-execution-state` | 88 | 0 (designed for `skills/start/SKILL.md`) | copy `.curdx-state.json` template into spec dir with atomic write |
| `kill-port` | 129 | 0 (designed for `templates/tasks.md` cleanup + dev-server reset) | cross-platform port killer (replaces `lsof -ti:PORT \| xargs kill`); uses `netstat`/`ss`/`lsof` per OS |
| `merge-state` | 106 | **9** (`skills/{requirements,design,research,implement}/SKILL.md`, `agents/{product-manager,research-analyst,task-planner,architect-reviewer}.md`, `references/coordinator-pattern.md`) | JSON deep-merge + atomic write — the **load-bearing** lib that replaces every `jq '.field=val' s.json > tmp && mv` in the markdown sweep |
| `project-topology` | 600+ | 2 (`skills/start/SKILL.md`, `skills/index/SKILL.md`) | cheap CLAUDE.md/settings/manifest scanner that identifies workspace state, code roots, common frontend/backend/plugin stack hints, and missing cross-root access |
| `project-brain` | 130+ | 4 (`runtime-cli`, `execution-brief`, `post-tool-batch-snapshot`, `task-completed-verifier`) | project-local `.curdx/brain.jsonl` event store for verifier success/failure, compiled routes, and compact stack/verifier hints |
| `search-files` | 154 | 0 (designed for complex grep cases in skill prompts) | cross-platform recursive content search (replaces `grep -rn` for non-trivial patterns); supports include/exclude globs |
| `stack-capabilities` | 600+ | 3 (`smart-route`, `dev-runtime`, `runtime-cli doctor`) | typed stack capability map adapted from ECC: stack profile, quality gates, suggested verifier, and context budget for TypeScript/React/Vue/Next/Node/Spring/Python/Go/Rust/Claude Code plugin work |
| `update-modification-map` | 61 | 0 (designed for `agents/task-planner.md` modification tracking) | maintain `<spec-dir>/.file-modifications.json` (taskId → unique file list); separate sidecar from `.curdx-state.json::modificationMap` |

**Caller counts** are from a `grep -rln 'lib/<name>\.mjs'` sweep over
`plugins/curdx-flow/`, `src/hooks/`, and `scripts/` (excluding the bundle
files themselves). Values are correct as of task 2.5 commit; they will
grow as Phase 3+ skills adopt the libs in place of remaining inline
`node -e` calls.

## Invariants

- **CLI surface only**: each lib is invoked as a child `node` process. No
  TypeScript imports across libs (each is a leaf bundle). Cross-cutting
  helpers live in `src/hooks/_shared/` (`atomic-write`, `path-resolver`,
  `markdown-task-parser`, `run-hook`, `types`) and are esbuild-inlined.
- **POSIX-form output**: any path printed to stdout uses `/` separators
  per `_shared/path-resolver.ts` policy header (serialization, not
  fs-IO). See task 2.4 audit summary in `.progress.md` for details.
- **Atomic writes**: every lib that mutates a JSON file uses
  `_shared/atomic-write::writeFileAtomic` (sibling temp + rename). No
  partial-write windows.
- **Default-true on parse**: empty/missing JSON files default to `{}`,
  not error-exit. Matches v6 shell behavior of `cat foo.json 2>/dev/null
  || echo '{}'`.

## Cross-references

- Design rationale: `specs/cross-platform-support/design.md` § "Lib catalog"
  (line 85+) lists the originally proposed 11 libs and which ones earned
  their keep.
- Schema-mismatch decision: `specs/cross-platform-support/.progress.md`
  task 1.35 learnings + this README's "Convergence rationale" section
  document why `update-fix-task-map` was dropped instead of fixed.
- Build pipeline: `scripts/build-hooks.mjs` auto-collects every `*.ts`
  in this directory; adding a new lib needs only the source file plus a
  `npm run build:hooks`.
