---
name: curdx-verify-evidence
description: Use when about to claim any work is complete, fixed, passing, or shipped. HARD GATE — every completion claim requires fresh this-turn command output as evidence. Phrases like "should pass", "probably works", "looks good" are forbidden without running verification in the current message.
---

# Verify Before Completion (curdx-verify-evidence)

## Iron Law

**NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.**

If you haven't run the verification command in this message, you cannot claim it passes. Evidence from "earlier in the session", "last turn", or "usually works" does not count.

## When this skill activates

- Any response that contains "done", "complete", "passing", "fixed", "shipped", "ready"
- Any call to `/curdx:verify`
- Any return from a builder subagent with status `DONE` or `DONE_WITH_CONCERNS`
- Before any atomic commit

## Evidence table — what proves what

For each class of completion claim, the required evidence is listed. Nothing less.

| Claim | Required evidence (this turn) | NOT sufficient |
|-------|-------------------------------|-----------------|
| Tests pass | Exit code 0 from the test command + visible failure count of 0 in stdout | "should pass", extrapolated from partial output, previous turn |
| Linter clean | Exit code 0 from the linter + 0 errors in stdout | Partial file checked, only some rules run |
| Build succeeds | Exit code 0 from the build command + visible artifact path | Type check passed ≠ build passed |
| Bug fixed | Re-run of the original reproduction command THIS turn, showing success where it used to fail | "Code changed, should be fixed" without re-running |
| Regression test works | Red-green cycle verified: write test → run pass → revert fix → run MUST FAIL → restore fix → run pass | Test passes once after the fix |
| Agent task completed | `git diff HEAD~1 --stat` shows the claimed changes AND agent's acceptance criteria re-verified | Agent returned "DONE" |
| Feature requirements met | Line-by-line check against acceptance criteria from spec.md, each re-verified | Tests passing (tests are a proxy, not the spec) |
| Frontend feature works | Playwright test exit 0 OR screenshot saved to evidence/ showing the expected UI state AND zero console errors captured | "It renders", "it loads" |
| Endpoint works | curl with real payload + response inspection (status + shape) + corresponding log line | "The route is defined" |
| Dependency updated | `npm ls <pkg>` / `pip show <pkg>` / equivalent showing the new version active | Lockfile updated (might not have run install) |

## Gate protocol (5 steps)

Before any completion statement, walk these 5 steps:

1. **IDENTIFY** the proving command. What exact command, with what args, would produce evidence?
2. **RUN** the full fresh command. Not partial output. Not cached.
3. **READ** the output: exit code, failure count, key lines. Don't skip.
4. **VERIFY** the output actually confirms the claim. Don't cherry-pick.
5. **ONLY THEN** make the claim, **with the evidence attached or cited**.

If you cannot complete step 2 (e.g., no CI access, can't run tests locally for some reason), say so explicitly: "I can't produce evidence because X; the claim is unverified."

## Forbidden phrases (auto-trip indicators)

When writing a response that contains any of these, STOP and check: did you just run the verification command in this turn?

- "should pass", "probably works", "seems to work"
- "looks good", "looks correct", "this should do it"
- "Great!", "Perfect!", "Done!" (before any verification)
- "I've fixed the issue" (without re-running the reproduction)
- "Tests are passing" (without showing test command output)
- "Build is clean" (without showing build output)
- "Ready to merge" (without verify + review + passing CI)

These are not banned forever — they are banned *without accompanying evidence in the same turn*.

## When agent-return-says-DONE meets this gate

If you are orchestrating a subagent and it returns `DONE`, you still verify:

1. `git diff HEAD~1 --stat` — did its claimed file changes actually happen?
2. Re-run the task's `<verify>` command if present
3. Re-check its `<acceptance_criteria>` one by one

"The agent said DONE" is not evidence. The git tree and the test runner are evidence.

## Regression tests — special protocol

Writing a regression test for a bug fix is a common case where "the test passes" looks like evidence but isn't. To prove a regression test actually guards against the bug:

1. Write the test — run it with the fix in place → must PASS
2. Revert the fix (keep the test) → run it → must FAIL
3. Re-apply the fix → run it → must PASS again
4. Commit both the test and the fix

If step 2 doesn't fail, your test isn't actually testing the bug. Fix the test.

## Interaction with other skills

- **curdx-tdd**: TDD's Verify-RED and Verify-GREEN steps are concrete instances of this gate. Output of `npm test` (or equivalent) IS your evidence for those steps.
- **curdx-read-first**: before verifying, you may need to read the test files or fixtures to understand what the output means.
- **curdx-systematic-debug**: Phase 4 of systematic debugging ends with evidence — this skill defines what counts.
- **curdx-browser-test**: for frontend features, the evidence is a screenshot file path + zero console errors recorded.

## Self-review checklist

Before any response containing "done" / "complete" / "passing" / "fixed":

- [ ] Did I run the verification command in THIS turn (not an earlier one)?
- [ ] Is the exit code in the output I read?
- [ ] Does the output text actually confirm what I'm claiming?
- [ ] For bug fixes: did I re-run the original reproduction command?
- [ ] For regression tests: did I do the revert-then-restore cycle?
- [ ] For frontend: did I capture a screenshot to evidence/ AND confirm no console errors?

If any no, gather the evidence first, then claim.

## When verification reveals an earlier claim was wrong

Sometimes running the gate reveals that a prior "DONE" was premature. Handle this honestly:

- Do NOT rationalize ("it was working before, must be a flake")
- Do NOT mark as done with a disclaimer ("DONE with known issue")
- Revert to the appropriate earlier phase: if the code is broken, go back to systematic-debug Phase 1
- Treat false-positive DONE as a bug to fix, not a setback to explain away
