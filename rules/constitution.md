# Project Constitution

This file is the **governance contract** for all work done by Claude Code in this project. It is loaded as a top-level rule by Claude Code at session start (per https://code.claude.com/docs/en/memory) and survives `/compact`.

The five rules below are **hard** — `PreToolUse` hooks block tool calls that violate them. Add `soft` and `advisory` sections below as your project grows.

---

## Hard Rules (enforced by hooks)

### 1. NO CODE WITHOUT SPEC

You may not modify files under `src/`, `app/`, `lib/`, `pkg/`, or any production source directory unless `.curdx/features/<feature-id>/spec.md` exists for the active feature, AND `.curdx/state.json` shows `phase` is one of `tasks` or `execution`.

**Exception:** trivial-tier tasks routed through `/curdx:quick` (which generates a minimal `PLAN.md` in `.curdx/quick/`).

**Why:** prevents "vibe coding" — the #1 cause of unmaintainable AI-generated codebases. A spec doesn't have to be long; it has to exist.

### 2. NO PRODUCTION CODE WITHOUT FAILING TEST

Before any `Edit` or `Write` to a production file (`src/**`, `app/**`, etc.), a corresponding test file in `tests/`, `test/`, `__tests__/`, `*_test.go`, `*.test.ts`, etc. must exist AND must currently fail.

The TDD cycle is RED → Verify-RED → GREEN → Verify-GREEN → REFACTOR. See `skills/curdx-tdd/SKILL.md`.

**Exception:** test files themselves; pure refactors (no behavior change); generated code (migrations, types from a schema).

**Why:** evidence-based development. A test you wrote *after* the code can't have failed for the right reason; you've lost the proof that your fix matters.

### 3. NO FIX WITHOUT ROOT CAUSE

Bug-fix tasks (any task tagged `[FIX]`, `[BUG]`, or running under `/curdx:debug`) must walk the 4-phase systematic-debug methodology:

1. Root Cause Investigation (read errors verbatim, reproduce, check recent changes, trace data flow)
2. Pattern Analysis (find a working example, list every difference)
3. Hypothesis & Testing (one hypothesis, minimal test, verify)
4. Implementation (failing test first, single fix, verify; if it fails 3+ times, question the architecture)

See `skills/curdx-systematic-debug/SKILL.md`.

**Why:** brute-force retries with parameter tweaks ("just add try/catch") accumulate technical debt and never prevent recurrence.

### 4. NO COMPLETION WITHOUT EVIDENCE

You may not claim a task / feature / verification is "complete", "done", "passing", or "fixed" without producing evidence in the **same turn** as the claim. Acceptable evidence:

| Claim | Required evidence |
|-------|-------------------|
| Tests pass | this-turn output of test command, exit code 0, failure count = 0 |
| Linter clean | this-turn output of lint command, 0 errors |
| Build succeeds | this-turn output of build command, exit 0 |
| Bug fixed | this-turn re-run of the original reproduction command |
| Frontend works | this-turn screenshot saved to `evidence/` |
| Feature complete | line-by-line check against acceptance criteria from spec.md |

Phrases like "should pass", "probably works", "looks good" are **prohibited** when claiming completion. See `skills/curdx-verify-evidence/SKILL.md`.

**Why:** unverified completion claims are the worst failure mode — they look like progress but compound into broken states.

### 5. NO SECRETS IN COMMITS

`git commit` is intercepted by a `PreToolUse` hook. Staged files are scanned for credentials before the commit proceeds. Patterns blocked:

- API keys (sk-, ghp_, glpat-, AKIA, AIza, etc.)
- Private keys (`-----BEGIN .* PRIVATE KEY-----`)
- Database URLs with embedded passwords
- `.env` files unless explicitly allowed in `.gitignore` exception

**Why:** secret rotation is expensive and incomplete; prevention is the only winning move.

---

## Soft Rules (warning, not blocking)

Add project-specific norms here. Examples:

- All API endpoints validate input with zod / pydantic / similar
- All public functions have JSDoc / docstrings with `@throws`
- Database queries never use string concatenation (always parameterized)

---

## Advisory Rules (CLAUDE.md tone)

Add style preferences here. These load into context but don't block. Examples:

- Prefer functional over OOP where Python/TypeScript allows
- Prefer composition over inheritance
- Maximum file length: 400 lines (split by feature, not by layer)

---

## Amending the constitution

Run `/curdx:refactor --file constitution` to propose changes. Hard-rule additions / removals require explicit confirmation and trigger a full audit of in-progress features.
