# Commands vs Skills Policy

curdx-flow is **skills-first, commands-compatible**.

## Decision

Do not delete `commands/` from curdx-flow right now.

Reasons:

- Claude Code still supports `commands/` as flat skill files.
- Existing users invoke stable public entries like `/curdx-flow:start`, `/curdx-flow:tasks`, and `/curdx-flow:implement`.
- A same-name skill takes precedence over a command, so adding `skills/start/SKILL.md` would silently change `/curdx-flow:start` behavior.
- Skills are the better home for reusable logic because they support supporting files, scripts, invocation controls, and richer frontmatter.

## Authoring Rule

Use this split:

| Surface | Purpose |
|---------|---------|
| `skills/` | Canonical workflow knowledge, reusable procedures, references, scripts, automatic invocation hints |
| `commands/` | Stable slash-command compatibility API for explicit `/curdx-flow:*` user entry points |

## Migration Rule

When moving a command to skills:

1. Create or update a skill that owns the reusable workflow logic.
2. Keep the command as a thin compatibility wrapper that points to the skill.
3. Only add a same-name skill when the precedence change is intentional and tested.
4. Run `claude plugin validate ./plugins/curdx-flow` before release.

## New Workflow Rule

For new curdx-flow behavior:

1. Start in `skills/<name>/SKILL.md`.
2. Put long reference material under `skills/<name>/references/`.
3. Put executable helpers under `skills/<name>/scripts/`.
4. Add a command only if users need a stable explicit `/curdx-flow:<name>` entry point.

