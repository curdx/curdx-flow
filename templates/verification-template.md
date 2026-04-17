# Verification: {{FEATURE_NAME}}

**Feature ID:** {{FEATURE_ID}}
**Verified by:** curdx-verifier
**Timestamp:** {{ISO_TIMESTAMP}}
**Result:** {{VERIFIED | VERIFICATION_GAPS | BLOCKED}}

## Summary

- **Acceptance criteria:** {{N_TOTAL}} total / {{N_PASSED}} passed / {{N_FAILED}} failed / {{N_SKIPPED}} skipped
- **Task `<verify>` commands:** {{M_TOTAL}} run / {{M_PASSED}} exited 0 / {{M_FAILED}} exited non-zero
- **Evidence directory:** `.curdx/features/{{FEATURE_ID}}/evidence/`
- **Frontend screenshots:** {{K}} captured (if applicable)
- **Regression proof** (if bug fix): {{red_green_cycle | n/a}}

## Per-criterion results

### AC-1.1 — {{criterion text from spec.md}}

- **Requirement:** {{exact text}}
- **Command run:** `{{bash command}}`
- **Exit code:** {{0 | non-zero}}
- **Output excerpt:**
  ```
  {{first 10 + last 20 lines, middle truncated}}
  ```
- **Result:** PASS | FAIL | SKIP ({{reason}})
- **Evidence file:** `evidence/verify-ac-1-1-{{ts}}.log`

{{... repeat for each AC ...}}

## Per-task verification commands

### T003 — {{task name}}

- **Verify command:** `{{from tasks.md <verify>}}`
- **Exit code:** {{0}}
- **Output:**
  ```
  {{truncated}}
  ```
- **Result:** PASS
- **Evidence:** `evidence/verify-T003-{{ts}}.log`

{{...}}

## Frontend verification (if applicable)

### Browser test mode: {{playwright | chrome-devtools | both | none}}

- **Dev server:** `{{command}}` (PID captured → `evidence/dev.pid`; killed after tests)
- **Test suite:** `.curdx/features/{{FEATURE_ID}}/verify.spec.ts`
- **Exit code:** {{0}}
- **Tests run:** {{N}}
- **Screenshots:**
  - `evidence/screenshot-{{name-1}}.png` — {{what it shows}}
  - `evidence/screenshot-{{name-2}}.png` — {{what it shows}}
- **Console errors captured:** {{0 | list}}
- **Network errors captured:** {{0 | list}}
- **Trace (on failure):** `evidence/playwright-{{ts}}/trace.zip`
- **HTML report:** `evidence/playwright-{{ts}}/index.html`

## Regression proof (if bug fix)

### Reality Check

- **BEFORE fix** — reproduction command: `{{cmd}}`
  - Exit code: {{non-zero}}
  - Output: `evidence/before-{{ts}}.log`
- **AFTER fix** — same command:
  - Exit code: {{0}}
  - Output: `evidence/after-{{ts}}.log`
- **Red-green proof of regression test:**
  1. Test with fix applied → PASS (evidence: `evidence/rg-fix-applied-{{ts}}.log`)
  2. Fix reverted → test FAILS (evidence: `evidence/rg-fix-reverted-{{ts}}.log`)
  3. Fix restored → test PASSES again (evidence: `evidence/rg-fix-restored-{{ts}}.log`)

## Gaps (if VERIFICATION_GAPS)

| ID | Criterion | Command | Exit | What failed | Suggested next step |
|----|-----------|---------|------|-------------|---------------------|
| AC-1.2 | {{text}} | `{{cmd}}` | 1 | {{error summary}} | `/curdx:debug AC-1.2` |

## Notes for reviewer

- Anything surprising or worth flagging that isn't captured above.
- Anything the spec might need to be amended on — surface for `/curdx:refactor`.
- Performance or readability concerns that are out-of-scope but worth tracking.
