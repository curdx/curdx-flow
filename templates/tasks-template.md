# Tasks: {{FEATURE_NAME}}

**Feature ID:** {{FEATURE_ID}}
**Plan:** [plan.md](./plan.md)
**Total tasks:** {{N}}
**Generated:** {{DATE}}

## How to read this file

Each task is an XML block. The Stop hook (`hooks/implement-loop.sh`) walks them in order, dispatching each to a fresh `curdx-builder` subagent. Tasks marked `[P]` in the title are eligible for parallel dispatch (same wave, no file overlap).

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
    Add dev dependencies: {{deps}}.
    Run `npm install`.
  </action>
  <acceptance_criteria>
    - package.json contains "{{dep}}" in devDependencies
    - node_modules/{{dep}} directory exists
  </acceptance_criteria>
  <verify>npm ls {{dep}} | grep -q "{{dep}}"</verify>
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
    Create {{module}} with exported function {{fn}}: {{signature}}.
    Implementation is empty (throws "not implemented").
  </action>
  <acceptance_criteria>
    - File src/{{module}}/index.ts exists
    - Exports {{fn}}
  </acceptance_criteria>
  <verify>node -e "require('./src/{{module}}')" 2>&amp;1 | grep -v "MODULE_NOT_FOUND"</verify>
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
    Write one test asserting {{behavior}}. Per curdx-tdd skill: must FAIL when run.
    Run the test, confirm it fails for the expected reason (not a syntax/import error).
  </action>
  <acceptance_criteria>
    - tests/{{module}}.test.ts exists
    - npm test exits with non-zero code
    - Failure message references {{behavior}}, not "MODULE_NOT_FOUND"
  </acceptance_criteria>
  <verify>npm test 2>&amp;1 | tee /tmp/test-output && ! grep -q "PASS" /tmp/test-output</verify>
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
    Implement {{fn}} with the simplest code that passes the test from T003.
    Per curdx-tdd: no extra params, no future-proofing, no abstraction.
  </action>
  <acceptance_criteria>
    - npm test exits 0
    - All tests pass (no skipped)
    - No new warnings introduced
  </acceptance_criteria>
  <verify>npm test 2>&amp;1 | grep -E "(PASS|0 failing|tests passed)"</verify>
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
    Run full test suite. Run any project lint/typecheck. Confirm all tasks above committed.
    If everything green, emit literal `ALL_TASKS_COMPLETE` so the Stop hook exits.
  </action>
  <acceptance_criteria>
    - npm test exits 0
    - git log --oneline -{{N}} shows {{N}} commits with feature scope
    - Output ends with line: ALL_TASKS_COMPLETE
  </acceptance_criteria>
  <verify>npm test &amp;&amp; echo "ALL_TASKS_COMPLETE"</verify>
  <commit></commit>
  <requirements_refs>all</requirements_refs>
</task>

## Notes for the planner agent (delete before final write)

- Sequence: Setup → Foundation → per-US (always Test → Impl pair) → Polish
- Each task ≤ 5 minutes for a builder subagent in fresh context
- `[P]` only when files don't overlap and no output dependency
- Always include `<read_first>` — gate enforced by curdx-read-first skill
- Use `<acceptance_criteria>` that are grep-verifiable, not subjective
- Last task emits `ALL_TASKS_COMPLETE` to terminate Stop-hook loop
