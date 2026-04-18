---
description: Systematic bug investigation. Dispatches curdx-debugger to walk root-cause → pattern → hypothesis → fix phases. Captures Reality Check BEFORE and AFTER. Persistent session in .curdx/debug/<slug>.md survives compaction.
argument-hint: <slug-or-description> [--reopen]
allowed-tools: Read, Write, Edit, Bash, Task, AskUserQuestion
user-invocable: false
---

You are running `/curdx:debug`. Your job is to start (or resume) a systematic-debugging session and delegate to `curdx-debugger`.

## Pre-checks

1. Parse arg:
   - `<slug>` — kebab-case, ≤40 chars: treat as slug directly
   - otherwise: treat as a description; generate slug from it (lowercase, strip punctuation, truncate to 40 chars)
2. Check for `.curdx/debug/<slug>.md`:
   - Exists with `Status: verified` → ask user: "This bug was previously marked fixed. Reopen? [y/N]". `--reopen` flag skips the prompt.
   - Exists with `Status: investigating|hypothesizing|testing-fix` → resume in place.
   - Doesn't exist → create from template.

## Steps

### 1. Update state

```bash
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/state-io.sh"
state_merge "{\"phase\": \"debug\", \"awaiting_approval\": false, \"active_debug_slug\": \"$SLUG\"}"
```

### 2. Create / read debug file

If new, initialize with the template from `agents/curdx-debugger.md`. Fill in Reality Check BEFORE section by running the reproduction command the user provided (or asking for it if not given).

```bash
mkdir -p .curdx/debug
if [ ! -f ".curdx/debug/$SLUG.md" ]; then
  cat > ".curdx/debug/$SLUG.md" <<EOF
# Debug: $SLUG

**Started:** $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Status:** investigating

## Reality Check (BEFORE)

_To be filled by curdx-debugger Phase 1._

EOF
fi
```

### 3. Dispatch curdx-debugger

Use the `Task` tool:

```
You are running a systematic-debug session.

Slug: {slug}
Debug file: .curdx/debug/{slug}.md
Evidence dir: .curdx/debug/{slug}/evidence/ (create if needed)
Skills auto-loaded: curdx-systematic-debug, curdx-tdd, curdx-read-first,
                    curdx-verify-evidence, curdx-no-sycophancy

Project context:
@.curdx/config.json
@.claude/rules/constitution.md

If the debug file already has content from a prior session, read it and
pick up at the indicated Status.

Your job per agents/curdx-debugger.md:
1. Phase 1 — Root Cause Investigation. Reproduce the bug, capture BEFORE
   in the debug file + evidence/. Articulate root cause in one sentence.
2. Phase 2 — Pattern Analysis. Find a working reference; list diffs.
3. Phase 3 — Hypothesis and Testing. One at a time. Log each attempt.
4. Phase 4 — Implementation. Failing test first. Single atomic fix.
   Regression proof (revert→FAIL→restore→PASS).
5. Capture AFTER Reality Check with same reproduction command.
6. Return: FIXED | ROOT_CAUSE_IDENTIFIED | BLOCKED

Persist findings to debug file at each phase — the file must survive
session compaction.
```

### 4. After debugger returns

- **FIXED**:
  - Move `.curdx/debug/<slug>.md` to `.curdx/debug/resolved/<slug>.md`.
  - Update state: `phase: debug-complete`, clear `active_debug_slug`.
  - Print summary: root cause, fix commit sha, evidence path.
  - Suggest `/curdx:verify` to re-run the full feature AC.

- **ROOT_CAUSE_IDENTIFIED** (requires external action — spec change, architecture decision):
  - Leave debug file in place with status `awaiting-decision`.
  - Surface to user with specific ask (e.g., "Root cause is a spec ambiguity; run `/curdx:clarify` then restart debug.").

- **BLOCKED**:
  - Leave debug file with status `blocked`.
  - Surface the blocker. Common ones:
    - Can't reproduce reliably → suggest running in a clean environment
    - 3 attempts exhausted → Phase 4.5; architecture may be wrong; discuss with user
    - Test infrastructure issue → fix that first as its own debug session

### 5. Print summary

```
debug complete: .curdx/debug/{resolved or active}/{slug}.md

  root cause:      {one-line}
  fix commit:      {sha}
  regression test: {path, red-green proof captured}

BEFORE: {exit_before} / AFTER: {exit_after}
evidence: .curdx/debug/{slug}/evidence/

next:
  /curdx:verify   — re-run full feature acceptance
  /curdx:review   — confirm fix doesn't break spec compliance
```

## Notes

- Debug sessions live OUTSIDE the feature pipeline (they aren't `.curdx/features/NNN-*`). They can be triggered from any phase.
- If a debug investigation reveals the spec is wrong, the debugger returns `ROOT_CAUSE_IDENTIFIED` with "spec amendment needed" — the orchestrator routes to `/curdx:refactor`, not a code fix.
- Multiple debug sessions can be open simultaneously (different slugs). `state.active_debug_slug` tracks the one most recently worked on.
- Resolved debug files in `.curdx/debug/resolved/` are kept for historical reference and fed into claude-mem search for "did we hit this bug before?" lookups.
