# Tasks: {{FEATURE_NAME}}

**Feature ID:** {{FEATURE_ID}}
**Plan:** [plan.md](./plan.md)
**Total tasks:** {{N}}
**Generated:** {{DATE}}

## How to read this file

Each task is an XML block. The Stop hook (`hooks/implement-loop.sh`) walks them in order, dispatching each to a fresh `curdx-builder` subagent. Tasks marked `[P]` in the title are eligible for parallel dispatch (same wave, no file overlap).

**Task-granularity contract (enforced by `curdx-planner`):**

- Each `<task>` finishes in **≤ 5 minutes** for a builder subagent in fresh context.
- `<action>` is a **numbered list of 2-5 minute steps** — NOT a prose blob. Every step is one concrete action the builder can check off.
- A typical TDD pair looks like this (6 steps, 2-5 min each):
  1. Write the failing test in `tests/foo.test.ts`
  2. Run `npm test tests/foo.test.ts` — confirm it fails with the expected error (not an import error)
  3. Write the minimal implementation in `src/foo.ts`
  4. Run `npm test tests/foo.test.ts` — confirm it passes
  5. Run `npm test` (full suite) — confirm 0 regressions
  6. Commit with the exact message from `<commit>`

Pattern lifted from obra's `superpowers:writing-plans` (`/tmp/superpowers/skills/writing-plans/SKILL.md:36-44` — "Each step is one action, 2-5 minutes"). The discipline fights two failure modes at once:

- Over-sized tasks → builder runs out of fresh-context budget before finishing → `NEEDS_CONTEXT` loop
- Under-specified tasks → builder invents scope ("while I'm here, I'll also…") → scope drift

The builder must return one of:
- `DONE` — task complete; orchestrator proceeds to next
- `DONE_WITH_CONCERNS` — proceed but record concerns
- `NEEDS_CONTEXT` — orchestrator provides missing info, re-dispatches
- `BLOCKED` — orchestrator escalates

The last task must emit literal `ALL_TASKS_COMPLETE` for clean Stop-hook exit.

## Task list

### Phase 1: Setup

<task id="T001" type="auto" wave="1" parallel="false">
  <name>Initialize {{thing}}</name>
  <read_first>
    - .curdx/features/{{FEATURE_ID}}/plan.md
    - package.json
  </read_first>
  <files>package.json</files>
  <action>
    1. Run `npm install --save-dev {{deps}}` and verify package.json has the new entries under devDependencies.
    2. Run `npm ls {{dep}}` and confirm it resolves (no "UNMET DEPENDENCY").
    3. Commit with the exact message in `<commit>` below.
  </action>
  <acceptance_criteria>
    - package.json contains "{{dep}}" in devDependencies
    - node_modules/{{dep}}/package.json exists
    - npm ls {{dep}} exit code is 0
  </acceptance_criteria>
  <verify>npm ls {{dep}} 2>&amp;1 | grep -q "{{dep}}@"</verify>
  <commit>chore({{slug}}): add {{deps}} dev dependencies</commit>
  <requirements_refs>FR-1</requirements_refs>
</task>

### Phase 2: Foundation

<task id="T002" type="auto" wave="2" parallel="false">
  <name>Create {{module}} skeleton</name>
  <read_first>
    - .curdx/features/{{FEATURE_ID}}/plan.md
    - src/index.ts
  </read_first>
  <files>src/{{module}}/index.ts</files>
  <action>
    1. Create `src/{{module}}/index.ts` with an export of `{{fn}}: {{signature}}` whose body throws `new Error("not implemented")`.
    2. Run `npx tsc --noEmit` (or the project's typecheck command from .curdx/config.json) and confirm no type errors.
    3. Commit with the exact message in `<commit>` below.
  </action>
  <acceptance_criteria>
    - File src/{{module}}/index.ts exists
    - File exports {{fn}}
    - typecheck exits 0
  </acceptance_criteria>
  <verify>node -e "require('./src/{{module}}').{{fn}}" 2>&amp;1 | grep -v "MODULE_NOT_FOUND"</verify>
  <commit>feat({{slug}}): scaffold {{module}}</commit>
  <requirements_refs>FR-1</requirements_refs>
</task>

### Phase 3: User Story 1 — {{US1}}

<task id="T003" type="auto" wave="3" parallel="false">
  <name>[RED] Write failing test for {{behavior}}</name>
  <read_first>
    - src/{{module}}/index.ts
    - tests/setup.ts (if exists)
  </read_first>
  <files>tests/{{module}}.test.ts</files>
  <action>
    1. Create `tests/{{module}}.test.ts` with ONE test asserting {{behavior}}. Use real code, no mocks (per curdx-tdd skill).
    2. Run `npm test tests/{{module}}.test.ts` — confirm it fails with a message referencing {{behavior}} (NOT "Cannot find module" — that's an import error, doesn't count).
    3. If it failed for the wrong reason (import, syntax), fix the test and re-run step 2.
    4. Commit with the exact message in `<commit>` below.
  </action>
  <acceptance_criteria>
    - tests/{{module}}.test.ts exists
    - npm test exits with non-zero code
    - Failure message references {{behavior}}, not "MODULE_NOT_FOUND" or "SyntaxError"
  </acceptance_criteria>
  <verify>npm test tests/{{module}}.test.ts 2>&amp;1 | tee /tmp/t003 ; ! grep -q "PASS" /tmp/t003 &amp;&amp; grep -q "{{behavior_keyword}}" /tmp/t003</verify>
  <commit>test({{slug}}): add failing test for {{behavior}}</commit>
  <requirements_refs>FR-2, AC-1.1</requirements_refs>
</task>

<task id="T004" type="auto" wave="4" parallel="false">
  <name>[GREEN] Implement {{behavior}} minimally</name>
  <read_first>
    - tests/{{module}}.test.ts
    - src/{{module}}/index.ts
  </read_first>
  <files>src/{{module}}/index.ts</files>
  <action>
    1. Implement `{{fn}}` in src/{{module}}/index.ts with the simplest code that passes the test from T003. Per curdx-tdd: no extra params, no options, no future-proofing.
    2. Run `npm test tests/{{module}}.test.ts` — confirm it passes.
    3. Run `npm test` (full suite) — confirm no regressions (all prior tests still pass).
    4. Commit with the exact message in `<commit>` below.
  </action>
  <acceptance_criteria>
    - npm test exits 0
    - All tests pass (no skipped)
    - No new warnings introduced (output pristine)
  </acceptance_criteria>
  <verify>npm test 2>&amp;1 | grep -E "(PASS|0 failing|[1-9][0-9]* passed)"</verify>
  <commit>feat({{slug}}): implement {{behavior}}</commit>
  <requirements_refs>FR-2, AC-1.1</requirements_refs>
</task>

### Phase 4: Polish

<task id="T999" type="auto" wave="5" parallel="false">
  <name>Final verification and emit ALL_TASKS_COMPLETE</name>
  <read_first>
    - .curdx/features/{{FEATURE_ID}}/plan.md
  </read_first>
  <files></files>
  <action>
    1. Run the full test suite (`npm test` or the command from .curdx/config.json `testing.runner`). Confirm exit 0 with zero failures.
    2. Run the typechecker (`npx tsc --noEmit` or equivalent). Confirm exit 0.
    3. Run the linter if configured (`npm run lint`). Confirm exit 0.
    4. Run `git log --oneline main..HEAD` and confirm one commit per non-Polish task, messages matching each `<commit>` field.
    5. Emit the literal string `ALL_TASKS_COMPLETE` on its own final line so the Stop hook exits cleanly.
  </action>
  <acceptance_criteria>
    - Full test suite exits 0
    - Typecheck exits 0
    - Lint exits 0 (if configured)
    - git log shows {{N-1}} commits with feature scope
    - Output ends with line: ALL_TASKS_COMPLETE
  </acceptance_criteria>
  <verify>npm test &amp;&amp; echo "ALL_TASKS_COMPLETE"</verify>
  <commit></commit>
  <requirements_refs>all</requirements_refs>
</task>

## Notes for the planner agent (delete before final write)

- Sequence: Setup → Foundation → per-US (always Test → Impl pair) → Polish
- **Step granularity is a HARD contract**: each step 2-5 min, numbered, one action each. No prose blobs in `<action>`.
- Typical TDD pair = 6 steps (write test / verify RED / impl / verify GREEN / full suite / commit). Non-TDD tasks (setup, polish) can be 3-5 steps.
- `[P]` only when files don't overlap and no output dependency
- Always include `<read_first>` — gate enforced by curdx-read-first skill
- Use `<acceptance_criteria>` that are grep-verifiable, not subjective
- Last task emits `ALL_TASKS_COMPLETE` to terminate Stop-hook loop
