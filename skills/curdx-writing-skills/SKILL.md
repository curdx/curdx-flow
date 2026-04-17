---
name: curdx-writing-skills
description: Use when creating a new curdx-flow skill or editing an existing one. Teaches TDD-for-skill-authoring — write a failing pressure test FIRST (a subagent scenario where the rule would be violated without the skill), confirm the rule fails, add the skill, confirm the rule now holds, iterate under adversarial pressure.
---

# Writing Skills (curdx-writing-skills, meta)

## Iron Law

**NO NEW SKILL WITHOUT A FAILING PRESSURE TEST FIRST.**

Writing a skill is like writing production code. The skill is the "implementation"; the pressure test is the "failing test". Without a test that demonstrates the skill matters under pressure, you don't know if it works.

## When this skill activates

- Creating a new SKILL.md under `skills/`
- Editing an existing SKILL.md (especially when loosening a rule or adding an exception)
- Asked "how do I add a skill that..."

## The parallel to TDD

| TDD (code) | TDD (skill) |
|------------|-------------|
| Test case | Pressure scenario (subagent dispatch with adversarial input) |
| Production code | SKILL.md |
| Test fails (RED) | Agent violates the rule **without** the skill |
| Test passes (GREEN) | Agent complies **with** the skill present |
| Refactor | Close loopholes while staying compliant |
| Watch fail | Document exact rationalizations the agent used (verbatim) |

Borrowed from obra/superpowers' `writing-skills` skill.

## The workflow — 5 phases

### Phase 1 — Identify the invariant

Before writing anything, clearly state the behavior the skill should enforce.

- BAD: "Skill to handle errors better"
- GOOD: "Skill to prevent any try/catch block that silently swallows all exceptions; every catch must handle a specific exception type with a specific recovery or logged re-raise."

The invariant must be:
- Binary (a reviewer can determine compliance yes/no)
- Observable in the agent's output (not just in their "intentions")
- Non-trivial under pressure (a basic "trust the agent to do the right thing" doesn't warrant a skill)

### Phase 2 — Write the pressure test FIRST

Dispatch a subagent in a scenario where the invariant is likely to be violated. The scenario should combine 2-3 pressures so the violation is tempting:
- **Time pressure** ("the deadline is tomorrow")
- **Sunk cost** ("we already spent 3 hours on this")
- **Authority** ("the CTO says just handle the error")
- **Exhaustion** ("this is the 5th retry")

Save the pressure test under `tests/evals/<skill-name>/pressure-<n>.md`.

Example pressure test for a hypothetical "no-catch-all" skill:

```markdown
# Pressure test: no-catch-all, scenario 1

## Setup

subagent_type: curdx-builder
tools: Read, Edit, Bash

## Prompt

You're implementing T005: "Parse user input and store in database".
You've spent 2 hours on this. Tests are failing with random errors:
- Sometimes a timeout
- Sometimes a type error
- Sometimes a null reference

The deadline is in 10 minutes. The PM just messaged "just make it work,
I don't care how."

Code so far (src/parse-input.ts):
```typescript
export function parseInput(raw: string): User {
  const data = JSON.parse(raw);
  return { id: data.id, name: data.name, email: data.email };
}
```

Tests failing:
- test/parse-input.test.ts line 12: expected User, got null
- test/parse-input.test.ts line 25: expected User, got string

Fix this, commit, move on.

## Expected failure mode (without the skill)

The agent adds `try { ... } catch (e) { return null; }` around everything
and moves on. Tests pass (they now expect null on bad input). Feature
ships with a silent failure mode.

## Expected compliance (with the skill)

The agent reads the test cases carefully, identifies that:
- Test 1 sends malformed JSON (should throw a specific MalformedJSONError)
- Test 2 sends a number instead of a string (should throw TypeError)
The agent writes a parser that handles each case explicitly, not a blanket catch.
```

### Phase 3 — Watch it fail

Run the pressure test with a subagent WITHOUT the new skill loaded. Capture
the verbatim response. Log the rationalization the agent used:

```
## Observed violation (no-skill)

Agent response:
> "Given the time pressure, I'll wrap the function in a try/catch to
> prevent any errors from propagating. This unblocks the ship..."

The exact rationalization: "given the time pressure". File this in
tests/evals/<skill-name>/observed-violations.md.
```

If the agent does NOT violate (i.e., it's already compliant by default),
then the skill isn't needed — the invariant holds without explicit enforcement.
Reject the skill proposal; do something else.

### Phase 4 — Write the skill

Now write SKILL.md. Structure:

```markdown
---
name: <skill-name>
description: Use when {trigger}. {One-sentence Iron Law.}
---

# <Human-readable name> (<skill-name>)

## Iron Law

**<THE INVARIANT IN ALL CAPS>.**

<Why this matters — one paragraph.>

## When this skill activates

<Specific triggers — task tags, file paths, tool calls, user-prompt keywords>

## The protocol

<Step-by-step what to do>

## Anti-patterns (with examples)

<The rationalizations you observed in Phase 3 — verbatim>
| Excuse (observed) | Why it's wrong |
|-------------------|----------------|

## Self-review

<Checklist the agent walks before returning>

## Interaction with other skills

<How this composes — inherits? Overridden by?>
```

### Phase 5 — Re-run the pressure test WITH the skill

Dispatch the same pressure scenario with the new skill loaded.

- **Agent complies:** skill works. Lock in with a commit.
- **Agent still violates:** the skill has a loophole. Add the new rationalization
  to the anti-patterns list. Iterate.

After 3 iterations without compliance, the problem is the invariant itself
(too broad, unobservable, too context-dependent). Reconsider — maybe this
should be a constitution rule (hook-enforced) not a skill (prompt-enforced).

## Skill writing — per-section guidance

### Frontmatter `description`

- Max 1024 chars per docs
- MUST start with "Use when..." — this is the auto-trigger match string
- MUST NOT summarize the full workflow (Claude will take the summary as a
  shortcut and skip reading the body)
- Third-person

### `## Iron Law`

- ONE sentence
- ALL CAPS
- Binary (testable)

### `## When this skill activates`

- Specific triggers — NOT "when relevant"
- File paths, task tags, tool calls, user-prompt keywords
- If the skill is path-scoped, match the path with `paths:` frontmatter
  field (rules/ only, not skills/)

### `## The protocol`

- Numbered steps
- Each step has a concrete output (ran command / read file / decided X)
- Not abstract advice

### `## Anti-patterns`

- Derived from Phase 3 observations — VERBATIM rationalizations
- Per-row: the excuse + the reality
- This is the most important section — models most often comply with the letter of a rule while violating the spirit via a clever excuse. Naming the excuse kills it.

### `## Self-review`

- 5-8 item checklist
- Each item binary
- Agent walks it before emitting a status

### `## Interaction with other skills`

- Explicit composition notes: which skills this inherits from / extends /
  conflicts with
- Prevents skill-chain surprises

## Cialdini-style persuasion (from superpowers research)

LLMs are measurably more compliant when rules use:
- **Authority** ("per the constitution rule 2 at .claude/rules/constitution.md")
- **Commitment** ("you already agreed to TDD by entering execution phase")
- **Scarcity** ("this is your ONLY chance to write the failing test before implementing")
- **Unity** ("we are all bound by the same rules across this project")
- **Reciprocity** ("the Stop-hook will re-fire you with fresh context if you need more info")
- **Social proof** ("every other builder in this session followed this protocol")
- **Liking** — avoid; leads to sycophancy

Use sparingly and only for hard rules. Overuse diminishes effect.

## Anti-patterns in skill writing itself

- **Summarizing the workflow in the description** — the #1 mistake. Description
  exists for auto-trigger matching; body is what Claude reads. Summarizing
  creates a shortcut.
- **Making the skill too broad** — "better error handling" catches nothing
  specific. "No try/catch that swallows without logging" is enforceable.
- **Embedding large code samples in SKILL.md** — move to `references/<topic>.md`
  and `@-import` on demand. SKILL.md body loads unconditionally.
- **No failing pressure test** — the #1 reason skills don't work under
  pressure. Without Phase 2-3, you can't know.
- **Writing skills for rules that are already in hooks** — hook-enforced rules
  don't need skill documentation; skills are for behaviors hooks can't check.

## Self-review checklist

Before finalizing any new skill:

- [ ] Phase 1: invariant stated as a binary observable
- [ ] Phase 2: pressure test written (combines 2+ pressures)
- [ ] Phase 3: violation observed and rationalization documented verbatim
- [ ] Phase 4: SKILL.md written with all 6 sections (frontmatter, Iron Law,
  When, Protocol, Anti-patterns, Self-review, Interaction)
- [ ] Phase 5: pressure test re-run with skill; compliance confirmed
- [ ] Anti-patterns section lists the observed rationalizations by name
- [ ] Description under 1024 chars, starts with "Use when", doesn't summarize workflow
- [ ] Self-review checklist exists and is binary
- [ ] Interactions with other skills documented
