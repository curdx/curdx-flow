---
description: Show help for curdx-flow plugin commands and workflow.
---

# curdx-flow Help

## Overview

curdx-flow is a spec-driven development plugin that guides you through research, requirements, design, and task generation phases, then executes tasks autonomously with fresh context per task.

## Commands

| Command | Description |
|---------|-------------|
| `/curdx-flow:start [name] [goal]` | Smart entry point: resume or create new |
| `/curdx-flow:new <name> [goal]` | Create new spec and start research |
| `/curdx-flow:research` | Run/re-run research phase |
| `/curdx-flow:requirements` | Generate requirements (approves research) |
| `/curdx-flow:design` | Generate design (approves requirements) |
| `/curdx-flow:tasks` | Generate tasks (approves design) |
| `/curdx-flow:implement` | Start execution loop (approves tasks) |
| `/curdx-flow:status` | Show all specs and progress |
| `/curdx-flow:switch <name>` | Change active spec |
| `/curdx-flow:cancel` | Cancel active loop, cleanup state |
| `/curdx-flow:feedback [message]` | Submit feedback or report an issue |
| `/curdx-flow:help` | Show this help |

## Workflow

```
/curdx-flow:new "my-feature"
    |
    v
[Research Phase] - Automatic on new
    |
    v (review research.md)
/curdx-flow:requirements
    |
    v (review requirements.md)
/curdx-flow:design
    |
    v (review design.md)
/curdx-flow:tasks
    |
    v (review tasks.md)
/curdx-flow:implement
    |
    v
[Task-by-task execution with fresh context]
    |
    v
Done!
```

## Quick Start

```bash
# Easiest: use start (auto-detects resume or new)
/curdx-flow:start user-auth Add JWT authentication

# Or resume an existing spec
/curdx-flow:start

# Manual workflow with individual commands:
/curdx-flow:new user-auth Add JWT authentication
/curdx-flow:requirements
/curdx-flow:design
/curdx-flow:tasks
/curdx-flow:implement
```

## Options

### start command
```
/curdx-flow:start [name] [goal] [--fresh] [--quick] [--commit-spec] [--no-commit-spec]
```
- `--fresh`: Force new spec, overwrite if exists (skips "resume or fresh?" prompt)
- `--quick`: Skip interactive phases, auto-generate all specs, start execution immediately
- `--commit-spec`: Commit and push spec files after each phase (default: true in normal mode, false in quick mode)
- `--no-commit-spec`: Explicitly disable committing spec files

The `--commit-spec` setting is stored in `.ralph-state.json` and applies to all subsequent phases (research, requirements, design, tasks).

### new command
```
/curdx-flow:new <name> [goal] [--skip-research]
```
- `--skip-research`: Skip research phase, start with requirements

### phase commands (research, requirements, design, tasks)
```
/curdx-flow:<phase> [spec-name]
```
Phase commands use the `commitSpec` setting from `.ralph-state.json` (set during `/curdx-flow:start`).

### implement command
```
/curdx-flow:implement [--max-task-iterations 5]
```
- `--max-task-iterations`: Max retries per task before failure (default: 5)

## Directory Structure

Specs are stored in `./specs/` by default:
```
./specs/
├── .current-spec           # Active spec name (or full path for multi-dir)
├── my-feature/
│   ├── .ralph-state.json   # Loop state (deleted on completion)
│   ├── .progress.md        # Progress tracking (persists)
│   ├── research.md         # Research findings
│   ├── requirements.md     # Requirements
│   ├── design.md           # Technical design
│   └── tasks.md            # Implementation tasks
```

## Multi-Directory Support

You can organize specs across multiple directories using the `specs_dirs` configuration.

### Configuration

Add `specs_dirs` to your settings file at `.claude/curdx-flow.local.md`:

```yaml
---
specs_dirs:
  - ./specs
  - ./packages/api/specs
  - ./packages/web/specs
---
```

If not configured, defaults to `["./specs"]` for backward compatibility.

### Using --specs-dir Flag

The `start` and `new` commands accept `--specs-dir` to specify where to create a spec:

```bash
# Create spec in default directory (./specs/)
/curdx-flow:start my-feature Some goal

# Create spec in a specific directory
/curdx-flow:start my-feature Some goal --specs-dir ./packages/api/specs
/curdx-flow:new api-auth --specs-dir ./packages/api/specs
```

The specified directory must be listed in `specs_dirs` configuration.

### Monorepo Example

For a monorepo with multiple packages:

```
my-monorepo/
├── .claude/
│   └── curdx-flow.local.md    # specs_dirs config
├── packages/
│   ├── api/
│   │   └── specs/               # API-related specs
│   │       └── auth-feature/
│   └── web/
│       └── specs/               # Web-related specs
│           └── dashboard-feature/
└── specs/                       # Shared/root specs
    └── infrastructure-feature/
```

Settings file:
```yaml
---
specs_dirs:
  - ./specs
  - ./packages/api/specs
  - ./packages/web/specs
---
```

### Disambiguation

When the same spec name exists in multiple directories, commands will prompt for disambiguation:

```
Multiple specs named "auth-feature" found:
  1. ./specs/auth-feature
  2. ./packages/api/specs/auth-feature

Specify the full path to switch:
  /curdx-flow:switch ./packages/api/specs/auth-feature
```

Use the full path to target a specific spec when names are ambiguous.

## Execution Loop

The implement command runs tasks one at a time:
1. Execute task from tasks.md
2. Verify completion
3. Commit changes
4. Update progress
5. Stop and restart with fresh context
6. Continue until all tasks done

This ensures each task has full context without accumulating irrelevant history.

## Sub-Agents

Each phase uses a specialized agent:
- **research-analyst**: Research and feasibility analysis
- **product-manager**: Requirements and user stories
- **architect-reviewer**: Technical design and architecture
- **task-planner**: POC-first task breakdown
- **spec-executor**: Autonomous task execution

## POC-First Workflow

Tasks follow a 4-phase structure:
1. **Phase 1: Make It Work** - POC validation, skip tests
2. **Phase 2: Refactoring** - Clean up code
3. **Phase 3: Testing** - Unit, integration, e2e tests
4. **Phase 4: Quality Gates** - Lint, types, CI

## Troubleshooting

**Spec not found?**
- Run `/curdx-flow:status` to see available specs
- Run `/curdx-flow:switch <name>` to change active spec

**Task failing repeatedly?**
- After 5 attempts, hook blocks with error message
- Fix manually, then run `/curdx-flow:implement` to resume

**Want to restart?**
- Run `/curdx-flow:cancel` to cleanup state
- Progress file is preserved with completed tasks
