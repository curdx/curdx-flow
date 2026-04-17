---
description: TDD discipline for production source edits — auto-loaded only when Claude reads matching files.
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "src/**/*.js"
  - "src/**/*.jsx"
  - "src/**/*.py"
  - "src/**/*.go"
  - "src/**/*.rs"
  - "src/**/*.java"
  - "src/**/*.rb"
  - "app/**/*.ts"
  - "app/**/*.tsx"
  - "app/**/*.py"
  - "lib/**/*.ts"
  - "lib/**/*.py"
  - "pkg/**/*.go"
  - "internal/**/*.go"
---

# TDD Rule (auto-loaded for production source)

When editing this file, the curdx-tdd skill is in effect. Iron Law:

> **NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.**

This rule applies to any code file in `src/`, `app/`, `lib/`, `pkg/`, or `internal/`. It does NOT apply to test files, config, docs, migrations, or generated code.

## Before any Edit / Write to this file

1. Confirm there is a corresponding test file — same name with `.test.*` / `.spec.*` / `_test.*` suffix, OR in a parallel `tests/` / `test/` / `__tests__/` directory.
2. Confirm the test currently **fails** (run the test runner if you haven't this turn).
3. Only then, edit the production file.

Exceptions (no test required):
- You are in the `[RED]` step of a TDD task (writing the test itself — but your edit should be to the test file, not the production one).
- The change is a pure refactor: no behavior change, no public-surface change. Tests stay green throughout.
- The change is to auto-generated code (check for generator comment at top of file).

## RED → Verify-RED → GREEN → Verify-GREEN → REFACTOR

Full cycle in `skills/curdx-tdd/SKILL.md`. Summary:

1. **RED**: write a test for ONE new behavior; run it; confirm it fails for the right reason.
2. **Verify RED**: actually watched the test fail (not MODULE_NOT_FOUND — real assertion failure).
3. **GREEN**: minimal code to pass. No extra params, no options, no future-proofing.
4. **Verify GREEN**: all tests pass; output is pristine (no warnings).
5. **REFACTOR**: improve, rename, extract — tests stay green.

## Forbidden when editing production source

- Writing implementation with no corresponding test
- "I'll add tests later" — you won't, and the test won't have failed for the right reason
- Catching an error with `try/catch` and swallowing it (see systematic-debug)
- Adding `any` / `@ts-ignore` / `# type: ignore` to "make it compile"
- Copying a pattern from training data when a similar pattern exists in this codebase — read the existing pattern first (curdx-read-first)

## Interaction

- `curdx-tdd` skill provides the full protocol and the 11-row rationalization table
- `curdx-read-first` gate ensures you read the existing test and source before editing
- `curdx-verify-evidence` gate ensures your "GREEN" claim is backed by this-turn test output
