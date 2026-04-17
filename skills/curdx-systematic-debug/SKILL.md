---
name: curdx-systematic-debug
description: Use when encountering a bug, test failure, or unexpected behavior. 4-phase methodology — Root Cause Investigation → Pattern Analysis → Hypothesis & Testing → Implementation. Forbids fixes before Phase 1 is complete. Iron Law - NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.
---

# Systematic Debugging (curdx-systematic-debug)

## Iron Law

**NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.**

Brute-force retries with parameter tweaks ("just add try/catch", "set a timeout", "retry 3 times") accumulate technical debt and never prevent recurrence. The time spent finding the root cause is less than the time spent re-encountering the bug.

## When this skill activates

- Any task tagged `[FIX]` or `[BUG]`
- Any `/curdx:debug` invocation
- Test failure during `/curdx:implement` (after the test was green and something broke it)
- Unexpected output / behavior mid-session
- User says "it doesn't work", "the bug is back", "something's off"

## The 4 phases (walk in order; phase N cannot start until phase N-1 is complete)

### Phase 1 — Root Cause Investigation

**Goal:** understand WHY, not guess. No fixes in this phase.

- [ ] **Read every error message word by word.** Line numbers. Stack traces. Inner exceptions. Do not skim.
- [ ] **Reproduce consistently.** Exact steps. If not reproducible every time → this is a data point ("race condition", "environment-dependent"); gather more data, don't guess.
- [ ] **Check recent changes:** `git log --since="3 days ago" --stat`, `git diff HEAD~1`. What touched the failing area?
- [ ] **Check dependencies:** `npm outdated` / `pip list --outdated`. Did a transitive update?
- [ ] **Check environment:** env vars, config files, lock files. Did something change outside code?
- [ ] **Trace data flow backward** from the failing assertion / error. See [references/root-cause-tracing.md](references/root-cause-tracing.md).
- [ ] **For multi-component systems:** add diagnostic instrumentation at every boundary (not just near the symptom). Often the bad value originates 3 boundaries upstream of where it's caught.

**Exit criterion:** you can articulate the root cause in one sentence: "The bug happens because X, which is caused by Y."

**DO NOT** advance to Phase 2 until the exit criterion is met. If you're tempted to fix without knowing, that's the skill's most important moment — STOP.

### Phase 2 — Pattern Analysis

**Goal:** compare with a working case to isolate the difference.

- [ ] **Find a working example** in the same codebase — similar function, similar test, similar feature. If none exists, find one in a linked library or a reference implementation.
- [ ] **Read the reference implementation completely.** Not skim. Line-by-line.
- [ ] **List EVERY difference** between working and broken. All of them — even ones you think can't matter. Use `diff` or a mental walk-through.
- [ ] **Check dependencies, settings, env, assumptions** explicitly — not "must be the same".

**Exit criterion:** you have a ranked list of candidate differences that could explain the failure.

### Phase 3 — Hypothesis & Testing

**Goal:** one hypothesis at a time.

- [ ] **Form ONE hypothesis:** "I think X is the root cause because Y."
- [ ] **Write it down** — in the debug log file, in your response, somewhere reviewable.
- [ ] **Test minimally** — smallest possible change, one variable. Do NOT bundle multiple guesses.
- [ ] **Verify before continuing.** Did it work? Did it fix the behavior? If not, form a NEW hypothesis — do NOT pile fixes.
- [ ] If you're stuck: admit "I don't understand X." Then investigate X until you do.

**Exit criterion:** you have either:
- A confirmed hypothesis (proceed to Phase 4), OR
- Learned something new that invalidates Phase 2 and returns to Phase 1

### Phase 4 — Implementation

**Goal:** fix the confirmed root cause; prove the fix works.

- [ ] **Write a failing test case** that exercises the root cause. Follow `curdx-tdd` RED step.
- [ ] **Implement a single fix.** No "while I'm here" cleanups.
- [ ] **Verify** — run the test, confirm it passes. Run the original reproduction — confirm it succeeds. Run the rest of the test suite — confirm no regressions.
- [ ] **Regression proof** (if applicable): revert fix → test MUST FAIL → restore fix → test passes again. See `curdx-verify-evidence`.
- [ ] If the fix doesn't work:
  - **Count attempts.**
  - `< 3 attempts` → return to Phase 1 with new information
  - `≥ 3 attempts` → **STOP. Question the architecture.** This is Phase 4.5 ("architecture-may-be-wrong").

**Exit criterion:** test passes, reproduction passes, no regressions. Evidence captured per `curdx-verify-evidence`.

### Phase 4.5 — Question the Architecture

After 3+ failed fix attempts in Phase 4:

- Consider: is the abstraction wrong? Is the test testing the right thing?
- Consider: is the requirement the problem? Should spec.md be amended?
- Discuss with your human partner before attempting more fixes.
- Do NOT just "try harder" — patterns suggest the problem is not where you're looking.

## Supporting techniques

### Root cause tracing

See [references/root-cause-tracing.md](references/root-cause-tracing.md) — backward-trace methodology with concrete examples.

### Defense in depth

Validate at all 4 layers: entry / business logic / environment guards / debug logging. A bug often slips through only one layer.

### Condition-based waiting (not timeout-based)

```typescript
// BAD
await new Promise(r => setTimeout(r, 2000));
expect(el.textContent).toBe('Ready');

// GOOD
await expect.poll(() => el.textContent, { timeout: 10000 }).toBe('Ready');
```

Timeouts lie: they hide races as flaky tests. Condition polls reveal them.

### Test pollution

If a test fails only when run in a certain order, use [references/find-polluter.sh](references/find-polluter.sh) to binary-search which test pollutes the state.

## Forbidden during debugging

- **Try/catch-then-ignore as a fix.** The error is information; muting it is not debugging.
- **Retry loops "to work around flakiness".** Flakiness is a bug.
- **Version downgrade without root cause.** "It worked in 1.4" — why doesn't it work in 1.5? Find out.
- **`rm -rf node_modules && npm i`** as a debugging step. That's a ritual, not an investigation.
- **Widening a type to `any` to make it compile.** The error was telling you something.

## Common rationalizations (auto-trip)

| Excuse | Reality |
|--------|---------|
| "It's flaky, let's add retries" | Flakiness has a cause; retries hide the cause |
| "It works on main, must be a merge artifact" | Go find the merge artifact |
| "It's the environment" | Prove it by reproducing in a clean environment |
| "The test is wrong" | Maybe — but verify the code is right first |
| "Let's just try this other thing" | Not without a hypothesis |
| "We've spent enough time on this" | The bug doesn't care; it recurs |

## Self-review before claiming "fixed"

- [ ] Phase 1 complete: root cause articulable in one sentence
- [ ] Phase 2 complete: diff with working case listed
- [ ] Phase 3 complete: hypothesis tested and confirmed
- [ ] Phase 4 complete: failing test written, single fix, verified, no regressions
- [ ] Regression proof if applicable: revert → FAIL → restore → PASS
- [ ] Evidence captured per `curdx-verify-evidence` (this-turn command output)
- [ ] If I used try/catch, I'm catching a specific expected condition, not muting errors

## Interaction with other skills

- **curdx-verify-evidence**: Phase 4's verification IS this skill's evidence gate. Screenshots / stdout / exit codes required.
- **curdx-tdd**: Phase 4's "failing test first" IS TDD's RED step.
- **curdx-read-first**: Phase 1's data-flow trace requires reading the files involved; this gate enforces it.
- **curdx-no-sycophancy**: if a reviewer or user says "just fix it this way", evaluate technically — don't comply under pressure without completing Phase 1.
