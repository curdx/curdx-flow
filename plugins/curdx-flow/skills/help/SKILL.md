---
name: help
description: Use when showing curdx-flow slash skills, options, workflow, or troubleshooting.
disable-model-invocation: true
---

# curdx-flow Help

## Recommended Next Action

If the user has not named a specific command, recommend `/curdx-flow:start`. It routes automatically:

- Existing unfinished spec -> resume the next incomplete phase
- Tiny low-risk change -> handle directly without spec overhead
- Bounded local feature -> create a lightweight spec with 1-3 value-slice tasks
- Cross-module or risky work -> run the full spec workflow
- Oversized multi-system work -> run `/curdx-flow:triage`

## Common Commands

| Command | Use |
|---|---|
| `/curdx-flow:start [name] [goal]` | Smart route, create, or resume |
| `/curdx-flow:status` | Show specs and the recommended next action |
| `/curdx-flow:triage [epic-name] [goal]` | Split oversized work into dependency-aware specs |
| `/curdx-flow:tasks` | Generate value-slice implementation tasks after design |
| `/curdx-flow:implement [--max-task-iterations 5] [--max-global-iterations 30]` | Execute approved tasks |

All public entrypoints remain available:

`/curdx-flow:cancel`, `/curdx-flow:design`, `/curdx-flow:feedback`, `/curdx-flow:help`, `/curdx-flow:implement`, `/curdx-flow:index`, `/curdx-flow:new`, `/curdx-flow:refactor`, `/curdx-flow:requirements`, `/curdx-flow:research`, `/curdx-flow:start`, `/curdx-flow:status`, `/curdx-flow:switch`, `/curdx-flow:tasks`, `/curdx-flow:triage`.

## Smart Start Options

```text
/curdx-flow:start [name] [goal] [--fresh] [--quick] [--mode auto|fast|deep] [--tasks-size auto|coarse|standard|fine] [--review minimal|standard|strict] [--commit-spec] [--no-commit-spec] [--specs-dir <path>]
```

- `--fresh`: create a new spec instead of resuming a matching unfinished one.
- `--quick`: skip human approval checkpoints when the route still needs a spec.
- `--mode`: choose automatic, faster, or deeper policy.
- `--tasks-size`: override value-slice task granularity.
- `--review`: override review cadence.
- `--commit-spec` / `--no-commit-spec`: control spec artifact commits.

The compatibility `autoPolicy` is stored in `.curdx-state.json`; behavior routing is driven by `smart-route`.

## Recovery

- Spec not found: run `/curdx-flow:status`, then `/curdx-flow:switch <name>` or `/curdx-flow:start <name> <goal>`.
- Wrong active spec: run `/curdx-flow:switch <name>`.
- Loop stopped by caps: re-run `/curdx-flow:implement --max-task-iterations <n>` or `/curdx-flow:implement --max-global-iterations <n>` after checking `.progress.md`.
- Need to change approved docs: run `/curdx-flow:refactor [spec-name]`.
