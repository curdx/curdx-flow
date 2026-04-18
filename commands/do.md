---
description: Route freeform natural-language text to the right curdx command. Pure dispatcher — never does the work itself, just matches intent and hands off via SlashCommand.
argument-hint: "<description of what you want to do>"
allowed-tools: Read, Bash, AskUserQuestion, SlashCommand
---

You are running `/curdx:do <text>`. Match the user's freeform intent to one curdx command, confirm the routing, hand off via `SlashCommand`. Pattern source: GSD `/gsd-do` (`/tmp/gsd/commands/gsd/do.md`).

**Strict rule:** This command is a dispatcher. It never does the work itself. Match → confirm → hand off → stop.

## Steps

### 1. Validate input

If `$ARGUMENTS` is empty, ask:

```
What would you like to do? Describe the task, bug, or idea and I'll route
it to the right curdx-flow command.
```

Wait via `AskUserQuestion` before continuing.

### 2. Check init

```bash
HAS_INIT=0
[ -f .curdx/state.json ] && HAS_INIT=1
```

Some routes (`/curdx:init`, `/curdx:doctor`, `/curdx:help`) work without init. Others require it; if init is missing and the matched route requires it, suggest `/curdx:init` first instead of routing.

### 3. Match intent (apply first matching rule)

Match `$ARGUMENTS` against this table case-insensitively. **First match wins**; do not try to combine.

| Intent pattern (regex-ish, case-insensitive) | Route | Notes |
|----------------------------------------------|-------|-------|
| `^(init\|setup\|bootstrap\|install\|set up)` | `/curdx:init` | one-time scaffold |
| `(map\|index\|analyze).*codebase` OR `(brownfield\|existing project)` | print "codebase indexing not yet shipped — see roadmap; meanwhile use /curdx:doctor" | **honest**: feature not built |
| `(bug\|broken\|fail\|crash\|error\|doesn't work\|not working)` | `/curdx:debug $ARGUMENTS` | systematic 4-phase |
| `(verify\|check\|prove\|evidence)` | `/curdx:verify` | re-run AC + harness preview |
| `(review\|audit\|critique)` | `/curdx:review` | two-stage adversarial |
| `(ship\|push\|release\|deploy)` | `/curdx:ship` | runs Delivery-Guarantee Harness |
| `(status\|where am i\|progress\|dashboard\|state)` | `/curdx:status` | read-only dashboard |
| `(resume\|continue\|where were we\|pick up)` | `/curdx:resume` | session restoration |
| `(epic\|large feature\|big feature\|system\|multi-feature)` | `/curdx:triage $ARGUMENTS` | decompose to multiple specs |
| `(typo\|format\|lint\|comment\|small\|trivial\|tweak\|patch\|tiny)` | `/curdx:quick $ARGUMENTS` | bypass full pipeline |
| `(refactor\|amend spec\|change plan)` | `/curdx:refactor` | cascade-aware edit |
| `(clarify\|disambiguate\|what does .* mean)` | `/curdx:clarify` | resolve [NEEDS CLARIFICATION] |
| `(cancel\|abort\|stop\|kill)` | `/curdx:cancel` | clean abort |
| `(snapshot\|bundle\|share logs\|diagnostic)` | `/curdx:snapshot` | sanitized share bundle |
| `(help\|what can i\|commands\|what does)` | `/curdx:help` | command catalog |
| `(diagnos\|health\|broken install\|hooks not)` | `/curdx:doctor` | 12-section diagnostic |
| `(next\|what now\|continue pipeline)` | `/curdx:next` | auto-advance |
| _no rule matched_ | treat as feature description → `/curdx:spec` | fallback: most user intents are "build this" |

### 4. Ambiguity handling

If two or more rules match (e.g. "review the bug fix" matches both review AND bug), use `AskUserQuestion` with the top 2-3 options:

```
"$ARGUMENTS" could mean:
  1. /curdx:review — adversarial review of recent work
  2. /curdx:debug — systematic-debug session for the bug
  3. /curdx:verify — re-check acceptance criteria

Which fits better?
```

Wait for the choice; proceed with the user's selection.

### 5. Display routing

Print exactly:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 curdx:do — routing
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

input:    {first 80 chars of $ARGUMENTS}
route:    /curdx:<command> [args]
reason:   {one-line why this command fits}
```

### 6. Dispatch

Invoke the matched command via the `SlashCommand` tool, passing through `$ARGUMENTS` as the command's argument when the target command takes one (debug/quick/triage/spec). For commands that take no args (status/verify/etc.), invoke without args.

After invoking, **stop**. The dispatched command handles everything from here.

## Why this design

- **Dispatcher only**: a router that does work itself becomes unpredictable. /curdx:do never edits files, never commits — it just picks a command.
- **First-match wins**: avoids "AI thinks too hard" — matching is keyword-based, not semantic.
- **Honest about gaps**: when intent maps to a feature curdx doesn't have (e.g. codebase indexing), say so instead of routing to a stand-in.
- **Spec is the fallback**: 80% of unclear intents are "I want to build something" → /curdx:spec. Cheaper to start a spec the user discards than to argue about routing.
