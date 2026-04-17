# E2E fixture: node-backend

Simplest possible end-to-end test of the full curdx-flow pipeline on a minimal Node backend project.

## Starting state

A fresh directory with `package.json`:

```json
{
  "name": "hello-api-fixture",
  "version": "0.1.0",
  "dependencies": {},
  "devDependencies": {
    "vitest": "^1.0.0"
  },
  "scripts": {
    "test": "vitest run"
  }
}
```

No source code yet. `src/` does not exist. `tests/` does not exist. No `.curdx/`.

## Scenario — steps

```bash
# 1. Initialize
claude
> /curdx:init
# Expected: .curdx/config.json created with backend=node, testing.runner=vitest
# Expected: .claude/rules/constitution.md copied from plugin
# Expected: .curdx/state.json phase=init-complete

# 2. Create a spec
> /curdx:spec hello-api
# Expected: .curdx/features/001-hello-api/spec.md written
# Expected: state.phase=spec-complete, state.active_feature=001-hello-api

# 3. Plan
> /curdx:plan
# Expected: .curdx/features/001-hello-api/plan.md written with Constitution Check filled
# Expected: state.phase=plan-complete

# 4. Decompose into tasks
> /curdx:tasks
# Expected: .curdx/features/001-hello-api/tasks.md written in XML format
# Expected: At least 3 tasks — T001 setup, T002 [RED] test, T003 [GREEN] impl, T999 polish
# Expected: Final task emits ALL_TASKS_COMPLETE

# 5. Execute
> /curdx:implement
# Expected: Stop-hook loop drives each task through curdx-builder
# Expected: One atomic git commit per task (git log shows them)
# Expected: Last task emits ALL_TASKS_COMPLETE → loop exits cleanly
# Expected: src/index.js (or similar) and tests/index.test.js exist
# Expected: npm test passes

# 6. Status check
> /curdx:status
# Expected: phase=tasks-complete (or similar), all tasks marked done
```

## Expected final filesystem

```
<fixture-dir>/
├── .curdx/
│   ├── config.json           # backend=node, testing=vitest
│   ├── state.json            # phase=tasks-complete (or verify if /curdx:verify ran)
│   └── features/
│       └── 001-hello-api/
│           ├── spec.md       # user stories + AC
│           ├── plan.md       # architecture + Constitution Check
│           └── tasks.md      # XML with all tasks marked status="done"
├── .claude/
│   └── rules/
│       └── constitution.md
├── src/
│   └── <implementation>
├── tests/
│   └── <tests>
├── package.json
└── (git commits — N atomic commits per atomic task)
```

## Success criteria

- [ ] `/curdx:init` completes without error; writes expected files
- [ ] `/curdx:spec hello-api` produces a spec.md with ≥ 1 user story and ≥ 1 falsifiable AC
- [ ] `/curdx:plan` produces a plan.md with Constitution Check table filled truthfully
- [ ] `/curdx:tasks` produces tasks.md with TDD sequencing ([RED] before [GREEN])
- [ ] `/curdx:implement` runs to completion via Stop-hook loop
- [ ] At least one atomic commit per task (git log shows them)
- [ ] `npm test` exits 0 after execution
- [ ] state.json phase = tasks-complete (or later) at end
- [ ] Constitution hooks never blocked a legitimate operation (no false positives)
- [ ] No uncommitted changes in working tree (except documentation)

## Current status

NOT YET RUN. This scenario is meant to be dogfooded by the maintainer on a real
Node backend project. The fixture package.json is here as a reference; copy it
into a scratch dir to run the scenario.

## What this test catches

- Round 1: the full pipeline mechanics (file creation, state transitions, Stop-hook loop termination)
- Round 2: constitution enforcement (should not false-positive on this fixture; hooks fire but allow everything legitimate)
- Round 2: TDD enforcement (should allow [RED] test creation before src/ exists)
- Round 3: /curdx:ship (if run, should refuse to push to main; acceptable for fixture to stop before ship)

## Failure modes to watch for

- Stop-hook loop does not exit (missing ALL_TASKS_COMPLETE) → loop spins at task_iteration cap
- enforce-constitution.sh denies legitimate edits (false positives on src/)
- state.json corruption if multiple commands race
- Task atom not committed atomically (2 tasks in one commit)
- Final npm test fails because Stop hook didn't let the builder verify

If any of these surface, file as bugs with the full doctor + status output.
