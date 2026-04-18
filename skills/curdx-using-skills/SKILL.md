---
name: curdx-using-skills
description: Use at the START of every conversation in a curdx-initialized project. Teaches intent → action auto-dispatch so the user never has to remember slash commands. When user describes a task, this skill maps it to the correct curdx pipeline entry point (spec / implement / debug / ship / quick / etc.) and dispatches it automatically.
---

<EXTREMELY-IMPORTANT>
In a curdx-initialized project (cwd contains `.curdx/`), if you think there is even a **1% chance** a curdx command or subagent applies to what the user just asked for, you MUST invoke the corresponding dispatch. **You do not have a choice.** This is not negotiable. You cannot rationalize your way out.

If no curdx pattern applies (e.g. the user asked a pure question with no action implied), answer normally. But check the intent map FIRST.
</EXTREMELY-IMPORTANT>

# Why this skill exists

The user has 22 slash commands available but, starting Round 5, only 10 CORE commands (`/curdx:init`, `/curdx:spec`, `/curdx:implement`, `/curdx:ship`, `/curdx:status`, `/curdx:doctor`, `/curdx:help`, `/curdx:snapshot`, `/curdx:next`, `/curdx:do`) are visible in the `/` menu. The remaining 12 ADVANCED commands carry `user-invocable: false` in their frontmatter and are only reachable via this skill's auto-dispatch — the user **cannot be expected to remember any of them**. This skill is the bridge: user describes intent in natural language, you detect the intent, you run the right command's dispatch logic directly — the user never needs to know the command exists.

Pattern lifted from obra's `superpowers:using-superpowers` (`/tmp/superpowers/skills/using-superpowers/SKILL.md:10-16`). The hard measure is: **if after this skill a user can describe "I want to add a password reset feature" and end up with spec → plan → tasks → implementation → verification → review → ship artifacts without ever typing a slash command, we succeeded**.

The 20 slash commands still work — they're the **manual override** for power users, debuggers, and Claude (you) when the intent is ambiguous. This skill is the **primary path** for the "普通用户" persona.

# Instruction priority (critical)

1. **User's explicit instructions** (CLAUDE.md / direct messages / current turn) — ALWAYS wins.
2. **Constitution hard rules** (`rules/constitution.md`) — hooks enforce these physically; you cannot bypass them regardless of what this skill says.
3. **This skill's auto-dispatch rules** — applies when 1 and 2 leave room.
4. **Default Claude behavior** — lowest priority.

If the user explicitly says "don't run /curdx:spec, I just want to edit this file directly" — respect it. The hooks will still block src/ edits without a spec (Rule 1), but that's the constitution's job, not yours. You don't fight the user; the constitution does.

# The intent → action map

Check this map BEFORE any reply, BEFORE any clarifying question, BEFORE any file read.

| User intent signal | curdx action | Reason |
|---|---|---|
| "I want to build X" / "new feature" / "let's add X" / describes a feature | Invoke `/curdx:spec <slug>` logic (dispatch `curdx-analyst`) | Rule 1 — no code without spec |
| "here's a spec doc" / user pastes requirements | Invoke `/curdx:spec` then suggest `/curdx:clarify` if ambiguity | Same |
| "design the API" / "what endpoints do we need?" / "define the contract" / describes request-response shapes for a full-stack feature | Dispatch `curdx-contractor` to generate `contracts/<feature-id>/openapi.yaml` (or tRPC/GraphQL) BEFORE `/curdx:plan` | Single source of truth — backend and frontend both consume the contract; see `skills/curdx-contract-first/SKILL.md` |
| "can we plan this?" / "what's the architecture?" after spec exists | Invoke `/curdx:plan` logic (dispatch `curdx-architect`) | Normal flow |
| "break it into tasks" / "let's decompose" after plan exists | Invoke `/curdx:tasks` logic (dispatch `curdx-planner`) | Normal flow |
| "let's build it" / "implement" / "start coding" after tasks exist | Invoke `/curdx:implement` logic (kick off Stop-hook loop) | Normal flow |
| "small change" / "typo fix" / "just update this config" | Invoke `/curdx:quick <description>` logic (auto-classify) | Escape hatch for trivial work |
| "fix this bug" / "X is broken" / "not working" / user pastes error | Invoke `/curdx:debug <slug>` logic (dispatch `curdx-debugger`) | Rule 3 — no fix without root cause |
| "is this done?" / "verify" / "check if it works" | Invoke `/curdx:verify` logic (dispatch `curdx-verifier`) | Rule 4 — no completion without evidence |
| "review this" / "code review" / "anything wrong?" | Invoke `/curdx:review` logic (dispatch spec + quality reviewers) | Quality gate |
| "ship it" / "push" / "commit everything" / "create PR" | Invoke `/curdx:ship` logic | Final step |
| "where are we?" / "status?" / "what's next?" | Invoke `/curdx:status` logic | Read-only dashboard |
| "something's broken about curdx itself" / hooks misbehaving | Invoke `/curdx:doctor` logic | Diagnostic |
| "resume" / "pick up where we left off" (new session) | Invoke `/curdx:resume` logic | Session continuity |
| "this spec is wrong" / "change the plan" / amend artifact | Invoke `/curdx:refactor --file {spec|plan|tasks}` logic | Cascading edit |
| "abort" / "cancel this feature" | Invoke `/curdx:cancel` logic | Clean exit |
| Huge epic that's clearly multi-feature | Invoke `/curdx:triage <epic-name>` logic | Decomposition |

# Announcement protocol

When you auto-dispatch, tell the user what you're doing — one short sentence — so they can redirect if your intent-detection was wrong:

> "Looks like you want a new feature — kicking off the spec phase (running `/curdx:spec` for you). Say 'no, just edit directly' if you'd rather skip."

For read-only commands (status, doctor, help, resume), no announcement is needed — just do it.

# When NOT to auto-dispatch

| Situation | What to do instead |
|---|---|
| User asked a pure question with no action ("how does X work?") | Answer the question directly |
| User is chatting / exploring ideas without implementation intent | Engage in conversation; don't force /curdx:spec on brainstorming |
| `.curdx/` does not exist in cwd (project not initialized) | Suggest `/curdx:init` once; do not force it if user declines |
| User says "just do it directly" / "skip the pipeline" | Respect it; warn if the constitution will block, but don't dispatch |
| User is mid-dispatch (inside an `/curdx:implement` loop) | Do NOT auto-dispatch another command — let the loop finish |
| You're running AS a subagent (`subagent_type` set) | **Do not run this skill at all** — subagents are narrow-scope workers, not orchestrators |

# Red flags — STOP and reconsider

These thoughts mean you're about to bypass the skill when you shouldn't. If you catch yourself thinking any of them, check the intent map again.

| Thought | Reality |
|---|---|
| "This is just a simple edit — skip the spec" | The constitution will block you at the hook level. Skip the spec = crash into Rule 1. Dispatch /curdx:spec or /curdx:quick. |
| "The user didn't explicitly say to run /curdx:spec" | They described a feature. That IS the request. Intent map applies. |
| "I'll just write the code first and spec it after" | That's the anti-pattern the constitution exists to prevent. |
| "Let me explore the codebase first to understand" | The `curdx-analyst` subagent does that AS PART OF spec writing. Dispatch it. |
| "The user is an expert, they know what they want" | The slash commands are the expert override. They didn't use one → they want the auto-path. |
| "I already know this pattern, I don't need the skill" | The skill routes to the right agent. Doing it yourself skips the fresh-context isolation. |
| "This doesn't match any row in the intent map" | Re-read the map. If it truly doesn't match, answer normally. If it matches 1% — dispatch. |

# The 1% rule

From `superpowers:using-superpowers`: *"If you think there is even a 1% chance a skill might apply to what you are doing, you ABSOLUTELY MUST invoke the skill."*

Adapted for curdx: **if a user message has even a 1% chance of matching an intent-map row, auto-dispatch.** Over-dispatching is recoverable (user says "no, don't do that" and you back off). Under-dispatching is silent — the user types in frustration for 10 minutes because nothing happened.

# Integration with other skills

- `curdx-read-first` — auto-loads when builder subagent is about to Edit/Write; HARD gate
- `curdx-tdd` — auto-loads during `[RED]` / `[GREEN]` / `[REFACTOR]` tasks
- `curdx-verify-evidence` — auto-loads when builder / verifier is about to claim completion
- `curdx-systematic-debug` — auto-loads inside `/curdx:debug` dispatches
- `curdx-no-sycophancy` — unscoped; always on

This skill dispatches ABOVE those — it decides which pipeline entry point to use. Those skills kick in DURING the dispatched work.

# Self-check before every user reply

- [ ] Did I read the user's message for intent keywords?
- [ ] Did I check the intent map?
- [ ] If intent matched, did I dispatch (or announce+dispatch)?
- [ ] If intent did NOT match, am I sure? Re-read one more time?
- [ ] Am I about to reply with code/edit without having dispatched? If so — did the constitution hooks give me a pass? If not, I'm about to crash.

If any check fails, fix it before replying.
