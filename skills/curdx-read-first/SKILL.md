---
name: curdx-read-first
description: Use when about to Edit or Write any file referenced in a task's read_first list. HARD GATE — refuses edits when required source-of-truth files have not been read in this turn.
---

# Read-First Gate (curdx-read-first)

## Iron Law

**No file edit may proceed before every file in the task's `<read_first>` list has been read in this turn.**

If you are tempted to skip a read because you "already know what's in it" or "it hasn't changed since last time", you are wrong twice:

1. Your prompt is fresh — you don't have the previous turn's context.
2. Files change. Even files you wrote 5 minutes ago in this same task may have been modified by hooks (lint auto-fix, formatter) or by parallel builders.

## When this skill activates

- Auto-loads when any task XML contains a `<read_first>` block (i.e., always for builder subagents executing curdx-flow tasks)
- Triggered before any `Edit` or `Write` tool call

## The protocol

Before any Edit or Write:

1. **Parse `<read_first>` from the task XML you were dispatched with.**
2. **For each file path, call `Read`.** Even if you think you know its contents. Even if it's small.
3. **After reading all of them, you may Edit.**

If a `<read_first>` file does not exist:
- If the file is supposed to exist (referenced by `<files>` as input, not output) → `BLOCKED: read_first file <path> does not exist; either it should be created by a prior task or the task XML is wrong`
- If the file is optional (e.g., `tests/setup.ts (if exists)`) → it's marked optional in the task; skip is OK

## Why this exists

The #1 cause of broken AI-generated code in long agent loops is **stale context**: the agent assumes file contents based on training data or earlier session memory, makes an edit that conflicts with the actual current state, and creates a syntax error or duplicates an import. The `<read_first>` gate prevents this by requiring proof that you saw the actual current contents.

This is a discipline borrowed from gsd-build/get-shit-done's READ-FIRST GATE: "Do not skip files because you 'already know' what's in them."

## Anti-patterns

- "I'll skim it" — Read fully. Don't skim.
- "I already read it earlier in this conversation" — In a fresh subagent context, "earlier" doesn't exist. Read again.
- "It's auto-generated, I know its shape" — auto-generated files have version-specific quirks. Read again.
- "It's the test file I just created" — even then. Hooks may have reformatted it.

## Self-review

Before any Edit or Write, mentally check:

- [ ] Did I call Read on every entry in `<read_first>` in this turn?
- [ ] Did I see the actual current contents (not stale from training)?

If either is no, do the Read first.

## Interaction with curdx-tdd

When TDD-cycle tasks have `<read_first>` containing the test file you're about to edit:

- For `[RED]` tasks: read_first usually contains the production source (so you know what API to test). Read it, then write the failing test.
- For `[GREEN]` tasks: read_first contains the test file you wrote in [RED] AND the production source you're about to modify. Read both.
- For `[REFACTOR]` tasks: read_first contains both. Read both.

The combination of TDD discipline + read-first gate is what makes long autonomous loops not drift.
