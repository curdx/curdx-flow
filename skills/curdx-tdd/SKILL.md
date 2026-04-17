---
name: curdx-tdd
description: Use when implementing any feature or bugfix in production code (src/**, app/**, lib/**, pkg/**) — enforces strict RED → Verify-RED → GREEN → Verify-GREEN → REFACTOR with anti-pattern detection. Iron Law - NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.
---

# Test-Driven Development (curdx-tdd)

## Iron Law

**NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.**

Code written before its test must be **deleted** — not adapted, not "kept as reference", not "saved for later". Delete means delete.

## When this skill activates

- Any task with `[RED]`, `[GREEN]`, or `[REFACTOR]` in its name
- Any Edit/Write to a file under `src/`, `app/`, `lib/`, `pkg/`, or other production source directory (per `.curdx/config.json`)
- Any task implementing a behavior described in spec.md FRs

## The cycle

### 1. RED — Write a failing test

- One behavior, one test
- Clear, specific name describing the behavior
- Real code (mocks only when unavoidable; see anti-patterns below)
- Use the test runner declared in `.curdx/config.json` `testing.runner`

### 2. Verify RED — Watch it fail (MANDATORY, never skip)

Run the test. Confirm:

- **It fails** (not errors with import / syntax / module-not-found)
- **The failure message references the missing behavior**, not infrastructure
- **It fails because the feature is missing**, not because the test is broken

If the test passes immediately, you're testing existing behavior — fix the test (probably an assertion against current state instead of new behavior).

If the test errors with `Cannot find module` or `SyntaxError`, fix and re-run. Errors don't count as RED.

### 3. GREEN — Minimal code

The simplest code that passes the test. No options, no extra parameters, no flexibility, no future-proofing.

YAGNI examples:
- Test asks for `fn(x)` returning `x + 1` → write `function fn(x) { return x + 1; }`. Don't add a `fn(x, options)` signature.
- Test asks for one endpoint → don't scaffold a router with five other empty endpoints.

### 4. Verify GREEN — Watch it pass (MANDATORY)

Run the test. Confirm:

- **It passes**
- **All other tests still pass** (no regressions)
- **Output is pristine** — no warnings, no skipped tests, no console.error spam

If output isn't pristine, the test is incomplete (didn't catch the warning) or the implementation has a side effect — fix.

### 5. REFACTOR — Improve, tests stay green

Only after green:
- Extract duplication
- Improve names
- Move things to better locations
- Tests must stay green throughout
- No new behavior

### 6. Repeat

Each cycle = one new test, one new behavior, three commits if the planner sequenced you `[RED]` → `[GREEN]` → `[REFACTOR]`.

## Red Flags — STOP and start over

If you find yourself doing any of these, you're not doing TDD — start over from RED:

- **"Just this once"** — every "just this once" becomes the new normal
- **"I already manually tested it"** — manual tests vanish; automated tests stay
- **"Tests after will achieve the same purpose"** — they won't; you've lost the proof of failure
- **"It's about spirit, not ritual"** — the ritual IS the discipline
- **"Keep as reference"** / **"Adapt existing code"** — delete it, write the test, then re-implement minimally
- **"Already spent X hours, deleting is wasteful"** — sunk cost. Delete.
- **"TDD is dogmatic, I'm being pragmatic"** — pragmatic = following the discipline you committed to
- **"This is different because…"** — it's not different. Same rules.

## Common rationalizations and their counter-strikes

| Excuse | Reality |
|--------|---------|
| "The implementation is too trivial to test" | Trivial code with no test grows untested complexity over time |
| "It's just a config / wiring change" | Config bugs are the most expensive class of bugs to debug in production |
| "There's no good way to test this" | If you can't test it, you can't verify it works; refactor for testability |
| "I'll add tests at the end" | You won't, and even if you do, they won't have failed for the right reason |
| "This is exploratory, I'll TDD when it's stable" | Exploration is fine; commit nothing from exploration without TDD |
| "The test would be the same as the implementation" | Then your test is asserting the wrong thing; assert behavior, not structure |

## Testing anti-patterns (auto-fail conditions)

These three patterns make tests worse than no tests; never produce them:

1. **NEVER test mock behavior.** A test that verifies your mock returned the value you set is testing the mock library, not your code.
2. **NEVER add test-only methods to production classes.** If your test needs a `getInternalState()` or `resetForTesting()` method on the production class, your design is wrong; refactor for testability.
3. **NEVER mock without understanding dependencies.** If you don't know why module X behaves a certain way, mocking it makes your test lie. Read X first.

## Self-review checklist

Before returning DONE on a TDD-tagged task:

- [ ] Every new function has at least one test
- [ ] You watched each test fail (not just "should fail")
- [ ] Each test failed for the **expected** reason (referenced the missing behavior)
- [ ] You wrote the **minimal** code to pass — no extra params, options, or branches
- [ ] All tests in the suite pass after your change
- [ ] Output is pristine: no warnings, no skipped tests, no console.error
- [ ] Tests use real code (no over-mocking)
- [ ] Edge cases covered for each FR/AC referenced

If you can't check all 8, you skipped TDD. Start over.

## Interaction with other skills

- **curdx-read-first**: TDD reads test files first; this satisfies read-first for the test file but you still need to read the production source you're about to modify.
- **curdx-verify-evidence** (Round 2): TDD's "Verify RED" and "Verify GREEN" are concrete instances of the verification gate. The output of the test command IS your evidence.
- **curdx-systematic-debug** (Round 2): if a test fails unexpectedly during GREEN, switch to systematic-debug Phase 1 (root cause), don't guess.
