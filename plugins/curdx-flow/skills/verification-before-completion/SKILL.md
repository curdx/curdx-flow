---
name: verification-before-completion
description: Use when checking fixes, phase exits, completion evidence, or mock-heavy tests before claiming success.
when_to_use: Use when reproducing failures, verifying BEFORE/AFTER state, handling VF tasks, checking verificationBlocks, validating completion evidence, or auditing mock-only tests.
version: 0.2.0
user-invocable: false
---

# Reality Verification

For fix goals: reproduce the failure BEFORE work, verify resolution AFTER.

## Scope

This skill was expanded in v7.x to cover phase-exit / commit / tag / release boundaries beyond the original task-level VF scope. Triggers retained: verify a fix, reproduce failure, BEFORE/AFTER, VF task, reality check, mock-only tests, phase exit.

## Goal Detection

Classify user goals to determine if diagnosis is needed. See `references/goal-detection-patterns.md` for detailed patterns.

**Quick reference:**
- Fix indicators: fix, repair, resolve, debug, patch, broken, failing, error, bug
- Add indicators: add, create, build, implement, new
- Conflict resolution: If both present, treat as Fix

## Command Mapping

| Goal Keywords | Reproduction Command |
|---------------|---------------------|
| CI, pipeline | `gh run view --log-failed` |
| test, tests | project test command |
| type, typescript | `pnpm check-types` or `tsc --noEmit` |
| lint | `pnpm lint` |
| build | `pnpm build` |
| E2E, UI | project Playwright CLI / `@playwright/test`; Chrome DevTools MCP for high-fidelity runtime issues |
| API, endpoint | WebFetch tool |

For E2E/deployment verification, use the policy in `${CLAUDE_PLUGIN_ROOT}/references/browser-verification-policy.md`: Playwright CLI by default; Chrome DevTools MCP for GIS/WebGL/canvas/map/GPU rendering, console/network/performance diagnosis, or flaky Playwright behavior. Use WebFetch/curl for API-only verification.

## BEFORE/AFTER Documentation

### BEFORE State (Diagnosis)

Document in `.progress.md` under `## Reality Check (BEFORE)`:

```markdown
## Reality Check (BEFORE)

**Goal type**: Fix
**Reproduction command**: `pnpm test`
**Failure observed**: Yes
**Output**:
```
FAIL src/auth.test.ts
  Expected: 200
  Received: 401
```
**Timestamp**: 2026-01-16T10:30:00Z
```

### AFTER State (Verification)

Document in `.progress.md` under `## Reality Check (AFTER)`:

```markdown
## Reality Check (AFTER)

**Command**: `pnpm test`
**Result**: PASS
**Output**:
```
PASS src/auth.test.ts
All tests passed
```
**Comparison**: BEFORE failed with 401, AFTER passes
**Verified**: Issue resolved
```

## VF Task Format

Add as task 4.3 (after PR creation) for fix-type specs:

```markdown
- [ ] 4.3 VF: Verify original issue resolved
  - **Do**:
    1. Read BEFORE state from .progress.md
    2. Re-run reproduction command: `<command>`
    3. Compare output with BEFORE state
    4. Document AFTER state in .progress.md
  - **Verify**: `grep -q "Verified: Issue resolved" ./specs/<name>/.progress.md`
  - **Done when**: AFTER shows issue resolved, documented in .progress.md
  - **Commit**: `chore(<name>): verify fix resolves original issue`
```

## Test Quality Checks

When verifying test-related fixes, check for mock-only test anti-patterns. See `references/mock-quality-checks.md` for detailed patterns.

**Quick reference red flags:**
- Mock declarations > 3x real assertions
- Missing import of actual module under test
- All assertions are mock interaction checks (toHaveBeenCalled)
- No integration tests
- Missing mock cleanup (afterEach)

## Browser Verification

Before claiming frontend, full-stack, browser, or deployment behavior is complete:

1. Read the spec's `## Browser Verify` section or choose a track from `references/browser-verification-policy.md`.
2. Run the selected track fresh in this session:
   - `playwright`: dev server + project E2E command or `npx playwright test`.
   - `chrome-devtools-mcp`: real Chrome observation for console, network, DOM/screenshot/snapshot, performance, or rendering evidence.
3. Record the command/tool, URL, checked flow, result, and artifact/observation.
4. Treat missing browser evidence as not verified.

Never use `/ultrareview` as a substitute for browser verification.

## Why This Matters

| Without | With |
|---------|------|
| "Fix CI" spec completes but CI still red | CI verified green before merge |
| Tests "fixed" but original failure unknown | Before/after comparison proves fix |
| Silent regressions | Explicit failure reproduction |
| Manual verification required | Automated verification in workflow |
| Tests pass but only test mocks | Tests verify real behavior, not mock behavior |
| False sense of security from green tests | Confidence that tests catch real bugs |
