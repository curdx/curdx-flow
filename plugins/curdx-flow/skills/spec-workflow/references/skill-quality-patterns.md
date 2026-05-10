# Skill Quality Patterns

Use this reference when maintaining `plugins/curdx-flow/skills/**`.

## Sources

- Official Claude Code skills docs: `skills/<name>/SKILL.md`, short descriptions, supporting files, invocation control.
- `gstack`: explicit entrypoint posture, runtime risk checks, hard stop conditions.
- `superpowers`: trigger-only descriptions, progressive disclosure, verification before completion.

## Rules

1. **Descriptions are triggers, not summaries.**
   - Public entrypoint descriptions start with `Use when`.
   - Describe the user situation, not the workflow steps.
   - Keep process details in the skill body or references.

2. **Entrypoints are deliberate actions.**
   - Public `/curdx-flow:*` workflow skills keep `disable-model-invocation: true`.
   - Phase-changing examples must use the full `/curdx-flow:<name>` namespace.
   - Support skills carry reusable guidance and may be model-invoked.

3. **Keep SKILL.md as the router.**
   - Put long contracts under `skills/<name>/references/` or plugin-global `${CLAUDE_PLUGIN_ROOT}/references/`.
   - Prefer one-level reference links from SKILL.md; avoid reference chains.
   - Keep new skill bodies under 500 lines unless the extra content is essential at invocation time.

4. **Coordinator posture is explicit.**
   - Phase skills coordinate, validate, and delegate.
   - Subagents perform research, product, design, task planning, refactor, and execution work.
   - A coordinator may synthesize or route, but must not silently replace a specialist agent's role.

5. **Verification is part of the skill contract.**
   - Add runner tests for every public surface rule.
   - Run `claude plugin validate ./plugins/curdx-flow` after manifest or frontmatter changes.
   - Use `claudecc --plugin-dir ./plugins/curdx-flow` smoke tests for slash-skill behavior when login state is available.
