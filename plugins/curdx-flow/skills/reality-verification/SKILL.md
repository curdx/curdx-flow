---
name: reality-verification
description: DEPRECATED ALIAS for verification-before-completion. Kept only for backwards compatibility.
user-invocable: false
disable-model-invocation: true
---

# DEPRECATED ALIAS — `reality-verification` → `verification-before-completion`

This skill was renamed in v7.x. The new canonical location is:

- `plugins/curdx-flow/skills/verification-before-completion/SKILL.md`

The new skill is a superset of `reality-verification` — it covers everything the original did (BEFORE/AFTER reproduction, mock-quality checks, VF tasks for fix-type specs) PLUS:

- Phase-exit verification (every phase boundary, not just task-level)
- Commit / tag / release verification gates
- Universal "any completion claim" iron-law gate
- Evidence staleness detection (srcMtime vs timestamp)

If you reached this file via a stale reference, please update the reference to point to the new path. This alias is retained indefinitely for backwards compatibility.
