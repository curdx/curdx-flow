---
description: Show all curdx-flow commands grouped as Core (always visible) and Advanced (auto-triggered by the `curdx-using-skills` meta-skill). Phase-aware — highlights the recommended next command based on current state.
argument-hint: [<command-name>] (show details for one command instead of the overview)
allowed-tools: Read
---

You are running `/curdx:help`. Show the command catalog.

**The important thing to tell the user up-front:** curdx-flow 的 22 个命令里只有 10 个你**需要**记住。其他 12 个会在你描述意图时由 `curdx-using-skills` meta-skill 自动触发——`skills/curdx-using-skills/SKILL.md` 里有完整的 intent→action 映射表。**新手提示：忘了下一步该干啥就 `/curdx:next`，记不住命令就 `/curdx:do <自由文本描述>`。**

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

Otherwise, print the full overview (step 3).

### 3. Overview output

```
curdx-flow commands

══ CORE — type these explicitly ══════════════════════════════════

  /curdx:init                   bootstrap .curdx/, detect stack, copy constitution
  /curdx:spec <slug>            start a new feature (spec first, everything else follows)
  /curdx:next                   auto-advance to the logical next command (zero-friction)
  /curdx:do <freeform text>     route NL intent to the right command (dispatcher only)
  /curdx:implement [--safe]     autonomous Stop-hook loop; one commit per atomic task
  /curdx:ship                   commit all feature artifacts + git push
  /curdx:status                 dashboard — phase, progress, active feature, artifacts
  /curdx:doctor                 diagnostic check (tools, install state, hooks, MCPs, update-check)
  /curdx:help [<cmd>]           this help; or detail for a specific command
  /curdx:snapshot               sanitized tarball of state + logs for sharing with maintainer

══ ADVANCED — auto-triggered by curdx-using-skills ══════════════

  These fire automatically when you describe matching intent. You can still
  invoke them manually (e.g. for debugging the flow itself).

  /curdx:clarify                resolve [NEEDS CLARIFICATION] markers in spec
  /curdx:plan                   architecture + Constitution Check (after spec)
  /curdx:tasks                  decompose plan into atomic XML tasks with [P] markers
  /curdx:analyze                cross-artifact audit (spec + plan + tasks vs constitution)
  /curdx:verify                 evidence-based completion check; screenshots, stdout, exit codes
  /curdx:review [--stage 1|2]   two-stage adversarial review (spec-reviewer → quality-reviewer)
  /curdx:debug <slug>           systematic-debug session (survives compaction)
  /curdx:quick <desc>           bypass pipeline for small/trivial work (auto-classified)
  /curdx:refactor --file X      edit spec|plan|tasks|constitution with cascade detection
  /curdx:cancel [feature-id]    abort cleanly (keep / soft-move / delete / revert)
  /curdx:resume                 "where were we" dashboard after session break
  /curdx:triage <epic> <goal>   decompose large feature into multiple specs

═════════════════════════════════════════════════════════════════

Auto-dispatch is opt-outable: `touch ~/.curdx/no-auto-dispatch` — you'll fall
back to typing everything manually. See skills/curdx-using-skills/SKILL.md.

recommended next (based on current phase '$PHASE'):
  {from table below — boxed/highlighted}

tip: every command is documented in .claude/commands/<name>.md (the same file
     that Claude reads). open it to see the full dispatch prompt.

for development-on-curdx-flow: see CLAUDE.md in the plugin root.
for workflow philosophy: see docs/WORKFLOW.md
for auto-dispatch details: see skills/curdx-using-skills/SKILL.md
```

### 4. Phase → next-action table

| phase | suggested next (or auto-triggered) | rationale |
|-------|----------------|-----------|
| (no init) | `/curdx:init` | start here — CORE |
| init / init-complete | describe a feature → auto-dispatches `/curdx:spec` | CORE fallback: `/curdx:spec <slug>` |
| spec | (in progress) | analyst is working; /curdx:status to check |
| spec-complete | auto: `/curdx:clarify` if ambiguity, else `/curdx:plan` | you don't need to type either |
| plan | (in progress) | |
| plan-complete | auto: `/curdx:tasks` | |
| tasks | (in progress) | |
| tasks-complete | auto: `/curdx:analyze`, then "let's build it" → `/curdx:implement` | CORE: `/curdx:implement` |
| analyze | (in progress) | |
| analyze-complete | auto: `/curdx:implement` (if no criticals) | CRITICAL findings block |
| execution | (Stop-hook loop running) | /curdx:status to watch; Ctrl+C + /curdx:cancel to abort |
| verify | (in progress) | |
| verify-complete | "review this" → auto `/curdx:review`; or "ship" → CORE `/curdx:ship` | |
| verify-gaps | "fix the gap" → auto `/curdx:debug` | |
| review | (in progress) | |
| review-complete | "ship it" → CORE `/curdx:ship` | |
| shipped | describe next feature → auto `/curdx:spec` | |
| quick / quick-complete | describe next thing | quick cycle finished |
| debug | continue debug session | see .curdx/debug/<slug>.md |
| debug-complete | "verify" → auto `/curdx:verify` | confirm fix |
| refactor / refactor-complete | re-run downstream auto-dispatches | cascade detection in refactor handles this |
| ship / shipped | done | describe next feature |

### 5. Detail mode (`/curdx:help spec`)

When a command name is supplied:

```
/curdx:spec <slug>

TIER
  CORE (recommended to know) | ADVANCED (auto-triggered)

DESCRIPTION
  Create a new feature spec. Dispatches curdx-analyst to produce a
  spec.md describing what and why (no tech choices).

ARGUMENTS
  <slug>  kebab-case, ≤40 chars (required)

WHEN TO USE
  After /curdx:init, when starting a new feature. Also auto-triggered when
  you describe a new feature without naming a slug — the agent generates
  one from the description.

WORKFLOW
  1. Validates slug format + finds next feature number
  2. Creates .curdx/features/NNN-slug/ directory
  3. Searches claude-mem for prior related decisions
  4. Dispatches curdx-analyst with spec-template.md
  5. Analyst asks 1-5 AskUserQuestion rounds to fill template
  6. Updates state.phase → spec-complete, awaiting_approval → true

RELATED
  Preceded by:  /curdx:init
  Often followed by:  /curdx:clarify (auto if ambiguity), /curdx:plan (auto)
  See also:  /curdx:refactor --file spec (to edit existing spec)
  Meta:  skills/curdx-using-skills/SKILL.md — intent-map routing

FILE
  ${CLAUDE_PLUGIN_ROOT}/commands/spec.md
```

## Notes

- Output is meant to be scannable. Keep lines short, use consistent indentation.
- If running inside an initialized project, the "recommended next" box is personalized. Outside a project, show `/curdx:init` as the suggested start.
- The detail mode reads the command file's frontmatter + body. If arg doesn't match any command, suggest the closest matches.
- The Core/Advanced split is a documentation decision — all 20 commands remain fully functional. Auto-dispatch is a discoverability layer on top, not a replacement.
