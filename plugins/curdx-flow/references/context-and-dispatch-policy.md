# Context And Dispatch Policy

curdx-flow spends context when it buys correctness. The rule is not "use fewer
tokens"; the rule is "keep the main coordinator reliable and put heavy work in
the right context."

## Main Coordinator

The main conversation may:

- Run `curdx-flow snapshot`, `route`, and state helpers.
- Read compact artifacts needed for routing or gate decisions.
- Dispatch phase agents and reconcile markers.
- Ask the user only when product intent or destructive action is ambiguous.

The main conversation must not:

- Implement source-code tasks during `/curdx-flow:implement`.
- Inline large research/design/task artifacts into multiple prompts.
- Summarize away locked decisions before planning.
- Accept an agent's completion marker without checking evidence.

## Subagents

Use subagents for:

- Codebase exploration that would produce many grep/read results.
- Research requiring current docs or comparison.
- Producing phase artifacts.
- Implementing task slices.
- Independent review axes.

For independent read-only work, dispatch in parallel when the runtime supports it.
For write-heavy implementation, prefer `spec-executor` isolation when available.

## Claude Code Plugin Boundaries

- Plugin agents may declare `skills`, `background`, and `isolation: worktree`.
- Plugin agents must not rely on `permissionMode`, `hooks`, or `mcpServers`
  frontmatter; Claude Code ignores those fields for plugin-shipped agents.
- Plugin `bin/` executables are available in Bash while the plugin is enabled.
- Hook scripts must fail open unless they are explicitly enforcing a curdx-flow
  gate that would otherwise allow false completion.
