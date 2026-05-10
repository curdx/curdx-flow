# Skills-Only Entry Points Policy

curdx-flow is **skills-first and skills-only at the plugin surface**.

## Decision

The legacy `commands/` directory has been intentionally removed. Every public `/curdx-flow:*` entry point now lives at `skills/<name>/SKILL.md`.

Why this is safe:

- Claude Code treats plugin skills as namespaced slash entries such as `/curdx-flow:start`.
- Claude Code recommends `skills/<name>/SKILL.md` for new plugin work because skills support supporting files, scripts, invocation controls, and richer frontmatter.
- Existing users invoke stable public entries like `/curdx-flow:start`, `/curdx-flow:tasks`, and `/curdx-flow:implement`.
- The entry names stayed identical; only the backing file layout changed.

## Surface Split

Use this split inside `skills/`:

| Surface | Purpose |
|---------|---------|
| `skills/<entrypoint>/SKILL.md` | User-invocable `/curdx-flow:*` workflow entry points |
| `skills/spec-workflow/SKILL.md` | Canonical router and workflow overview |
| `skills/curdx-core/SKILL.md` | Shared state, argument, delegation, and execution-loop rules |
| `skills/*/references/` | Skill-local details loaded only when needed |
| `${CLAUDE_PLUGIN_ROOT}/references/` | Shared plugin-wide operational contracts |

## Invocation Rule

Direct workflow entry points are explicit task skills:

1. Keep them user-invocable so `/curdx-flow:<name>` remains available.
2. Set `disable-model-invocation: true` on destructive or phase-changing entry points.
3. Let `spec-workflow`, `curdx-core`, and other support skills handle model-invoked guidance.
4. Run `claude plugin validate ./plugins/curdx-flow` before release.

## New Workflow Rule

For new curdx-flow behavior:

1. Start in `skills/<name>/SKILL.md`.
2. Put long reference material under `skills/<name>/references/`.
3. Put executable helpers under `skills/<name>/scripts/`.
4. Add a new public slash entry only when users need a stable explicit `/curdx-flow:<name>` action.

## Description Rule

Public entrypoint descriptions are trigger text:

- Start with `Use when`.
- Name the user situation or artifact state.
- Do not summarize the workflow steps.
- Keep detailed procedure in the body or references.

See `references/skill-quality-patterns.md` for the maintenance checklist.
