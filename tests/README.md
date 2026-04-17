# Tests

Evaluative tests for curdx-flow. Two layers:

## `evals/` — skill pressure tests

Per `curdx-writing-skills` skill's workflow, every skill should have at least one pressure test that demonstrates the invariant holds under adversarial pressure.

Structure:

```
evals/
├── curdx-tdd/
│   ├── pressure-1-time-pressure.md
│   ├── pressure-2-sunk-cost.md
│   └── observed-violations.md
├── curdx-no-sycophancy/
│   ├── pressure-1-angry-user.md
│   └── pressure-2-senior-reviewer.md
├── curdx-verify-evidence/
│   └── pressure-1-friday-evening.md
├── curdx-systematic-debug/
│   └── pressure-1-third-retry.md
└── README.md
```

### Pressure test file format

Each pressure test is a markdown file describing a scenario that's likely to tempt a violation of the skill's Iron Law. Structure:

```markdown
# Pressure test: <skill-name>, scenario N

## Setup

subagent_type: curdx-builder
tools: Read, Edit, Bash
skill-load: curdx-tdd (OR "skill-load: none" for the baseline violation test)

## Prompt

<realistic adversarial prompt that combines 2-3 pressures>

## Expected failure mode (without the skill)

<what the agent will do if the skill is absent>

## Expected compliance (with the skill)

<what the agent should do when the skill is loaded>

## Grading rubric

- [ ] Compliance indicator 1 (observable — tool calls / output text)
- [ ] Compliance indicator 2
```

### Running pressure tests

Currently manual: dispatch the subagent with the prompt, observe behavior, record pass/fail.

Future (Round 4+): an `evals` CLI runner that dispatches each test automatically and scores against the rubric. Stub interface is sketched but not built.

## `e2e/` — full pipeline fixtures

End-to-end tests that exercise a curdx-flow pipeline on a fixture project and verify the expected artifacts land.

Structure:

```
e2e/
├── fixture-node-backend/
│   ├── package.json
│   ├── src/
│   ├── expected/
│   │   ├── config.json
│   │   ├── state-after-init.json
│   │   └── state-after-tasks-complete.json
│   └── scenario.md     # step-by-step scenario
├── fixture-react-frontend/
└── README.md
```

Each fixture has a `scenario.md` that documents:

1. Starting state (fresh node project)
2. Steps run (`/curdx:init`, `/curdx:spec foo`, etc.)
3. Expected final state (config.json contents, files present, state.json `phase` value)

Run with (future): `bash tests/e2e/run.sh <fixture-name>`.

## Current status

Round 1-3 shipped minimum-viable versions of these directories — a few pressure test fixtures for the most important skills (curdx-tdd, curdx-no-sycophancy, curdx-verify-evidence), and one e2e fixture for the node backend TDD path.

Adding more tests is a good first contribution for anyone extending curdx-flow.

## Why tests are minimal so far

Round 1-3 prioritized getting the full workflow functional over exhaustive testing. The build order was:

1. Ship the infrastructure (hooks, commands, agents, skills)
2. Dogfood it on a real project
3. Write regression tests for the things that break in dogfooding

Pre-emptive over-testing of a framework that's still finding its shape produces tests that break more than the framework. Tests will grow as real usage surfaces real bugs.
