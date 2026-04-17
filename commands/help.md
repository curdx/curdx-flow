---
description: Show all curdx-flow commands grouped by phase, with one-line descriptions. Phase-aware — highlights the recommended next command based on current state.
argument-hint: [<command-name>] (show details for one command instead of the overview)
allowed-tools: Read
---

You are running `/curdx:help`. Show the full command catalog, grouped by phase, with the current suggested-next command highlighted.

## Steps

### 1. Read current phase (if in an initialized project)

```bash
PHASE="unknown"
if [ -f .curdx/state.json ]; then
  PHASE=$(jq -r '.phase // "unknown"' .curdx/state.json)
fi
```

### 2. If arg supplied, show detail for that command

If `$1` is a command name (with or without `/curdx:` prefix), read the command file and print:
- Name
- Description
- Arguments
- When to use (derived from frontmatter + first paragraph of body)
- Related commands

Otherwise, print the full overview.

### 3. Overview output

```
curdx-flow commands

[setup] — run once per project
  /curdx:init                   initialize .curdx/, detect stack, copy constitution
  /curdx:doctor                 diagnostic check (core tools, install state, hooks, MCPs)

[specify what] — user-language spec of the feature
  /curdx:spec <slug>            dispatch analyst for spec.md (user stories, AC, out of scope)
  /curdx:clarify                resolve ambiguity via 5-question Q&A; patches spec.md

[plan how] — architecture and task decomposition
  /curdx:plan                   dispatch architect for plan.md (stack + Constitution Check)
  /curdx:tasks                  decompose plan into atomic XML tasks with [P] markers
  /curdx:analyze                cross-artifact audit (spec + plan + tasks + constitution)

[implement] — autonomous execution
  /curdx:implement [--safe]     Stop-hook driven loop; one commit per atomic task
  /curdx:quick <desc>           bypass pipeline for small/trivial work (auto-classified)
  /curdx:debug <slug>           persistent systematic-debug session (survives compaction)

[verify and review]
  /curdx:verify                 evidence-based completion check; screenshots, stdout, exit codes
  /curdx:review [--stage 1|2]   two-stage adversarial review (spec compliance → code quality)

[ship]
  /curdx:ship                   commit + push to current branch (no PR creation)

[amend in progress]
  /curdx:refactor --file X      edit spec|plan|tasks|constitution with cascade detection
  /curdx:cancel [feature-id]    abort cleanly (keep / soft-move / delete / revert)

[introspection]
  /curdx:status                 current phase, progress bar, active feature, artifacts
  /curdx:resume                 "where were we" dashboard after session break
  /curdx:help [<cmd>]           this help; or detail for a specific command

[diagnostics]
  /curdx:snapshot [flags]       sanitized tarball of logs + state for sharing with maintainer
                                 flags: --strict --include-transcript --no-preview --here
                                 see docs/DIAGNOSTICS.md

[advanced]
  /curdx:triage <epic> <goal>   decompose large feature into multiple specs

---
recommended next (based on current phase '$PHASE'):
  {from table below — boxed/highlighted}
---

tip: every command is documented in .claude/commands/<name>.md (the same file
     that Claude reads). open it to see the full dispatch prompt.

for development-on-curdx-flow: see CLAUDE.md in the plugin root.
for workflow philosophy: see docs/WORKFLOW.md
for install troubleshooting: see docs/INSTALL.md
```

### 4. Phase → next-action table

| phase | suggested next | rationale |
|-------|----------------|-----------|
| (no init) | `/curdx:init` | start here |
| init / init-complete | `/curdx:spec <slug>` | capture what/why first |
| spec | (in progress) | analyst is working; /curdx:status to check |
| spec-complete | `/curdx:clarify` then `/curdx:plan` | resolve ambiguity before architecture |
| plan | (in progress) | |
| plan-complete | `/curdx:tasks` | decompose before coding |
| tasks | (in progress) | |
| tasks-complete | `/curdx:analyze` then `/curdx:implement` | audit before execution |
| analyze | (in progress) | |
| analyze-complete | `/curdx:implement` (if no criticals) | CRITICAL findings block |
| execution | (Stop-hook loop should be running) | /curdx:status to watch |
| verify | (in progress) | |
| verify-complete | `/curdx:review` or `/curdx:ship` | review optional if evidence is clean |
| verify-gaps | `/curdx:debug <gap>` or `/curdx:refactor` | fix what failed |
| review | (in progress) | |
| review-complete | `/curdx:verify` (if not done) or `/curdx:ship` | |
| shipped | create new feature with `/curdx:spec <slug>` | feature done; onto the next |
| quick / quick-complete | /curdx:spec <slug> for the next thing | quick cycle finished |
| debug | continue debug session | see .curdx/debug/<slug>.md |
| debug-complete | `/curdx:verify` | confirm fix |
| refactor / refactor-complete | re-run downstream commands | cascade may need /curdx:plan or /curdx:tasks |
| ship / shipped | done | create new feature |

### 5. Detail mode (`/curdx:help spec`)

When a command name is supplied:

```
/curdx:spec <slug>

DESCRIPTION
  Create a new feature spec. Dispatches curdx-analyst to produce a
  spec.md describing what and why (no tech choices).

ARGUMENTS
  <slug>  kebab-case, ≤40 chars (required)

WHEN TO USE
  After /curdx:init, when starting a new feature. Never write code
  before running this (Constitution Rule 1 blocks it).

WORKFLOW
  1. Validates slug format + finds next feature number
  2. Creates .curdx/features/NNN-slug/ directory
  3. Searches claude-mem for prior related decisions
  4. Dispatches curdx-analyst with spec-template.md
  5. Analyst asks 1-5 AskUserQuestion rounds to fill template
  6. Updates state.phase → spec-complete, awaiting_approval → true

RELATED
  Preceded by:  /curdx:init
  Often followed by:  /curdx:clarify (optional), /curdx:plan (required)
  See also:  /curdx:refactor --file spec (to edit existing spec)

FILE
  ${CLAUDE_PLUGIN_ROOT}/commands/spec.md
```

## Notes

- Output is meant to be scannable. Keep lines short, use consistent indentation.
- If running inside an initialized project, the "recommended next" box is personalized. Outside a project, show `/curdx:init` as the suggested start.
- The detail mode reads the command file's frontmatter + body. If arg doesn't match any command, suggest the closest matches.
