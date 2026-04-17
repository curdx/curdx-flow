---
description: Verify the active feature meets every acceptance criterion with fresh evidence. Dispatches curdx-verifier to re-run every AC + verify command; captures screenshots, stdout, exit codes; writes verification.md.
argument-hint: [--feature <id>] (default — active feature from state.json)
allowed-tools: Read, Write, Edit, Bash, Task
---

You are running `/curdx:verify`. Your job is to delegate to `curdx-verifier` and act on the results.

## Pre-checks

1. Read `.curdx/state.json`. Default `<active_feature>` is `state.active_feature`; override with `--feature <id>` arg.
2. Confirm `.curdx/features/<active>/spec.md`, `plan.md`, `tasks.md` all exist.
3. Read `.curdx/config.json` to know browser-test mode.

## Steps

### 1. Update state

```bash
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/state-io.sh"
state_merge '{"phase": "verify", "awaiting_approval": false}'
```

### 2. Dispatch curdx-verifier

Use the `Task` tool. Payload:

```
You are verifying feature {feature_id} against its spec + tasks.

Feature: {feature_id}
Spec: .curdx/features/{feature_id}/spec.md
Plan: .curdx/features/{feature_id}/plan.md
Tasks: .curdx/features/{feature_id}/tasks.md
Output: .curdx/features/{feature_id}/verification.md
Evidence dir: .curdx/features/{feature_id}/evidence/
Template: ${CLAUDE_PLUGIN_ROOT}/templates/verification-template.md

Project context:
@.curdx/config.json
@.claude/rules/constitution.md

Browser testing mode: {config.browser_testing.mode}

Your job per agents/curdx-verifier.md:
1. Create the evidence/ directory.
2. For every AC in spec.md AND every <acceptance_criteria> in tasks.md,
   identify the command, run it this turn, capture stdout+stderr+exit
   to evidence/verify-<id>-<ts>.log.
3. If frontend task: start dev server, run playwright (or call
   chrome-devtools-mcp tools directly), capture screenshots to
   evidence/, kill dev server.
4. Write verification.md: per-criterion block with command, stdout
   excerpt, exit code, pass/fail. Evidence file paths.
5. If this feature was a bug fix: include Reality Check BEFORE/AFTER
   comparison (from .curdx/features/.../debug.md if exists).
6. Return VERIFIED / VERIFICATION_GAPS / BLOCKED.

Never claim "should pass" — every claim is paired with evidence.
Do not edit source or tests. Do not commit.
```

### 3. After verifier returns

- **VERIFIED**: update state to `phase: verify-complete`, `awaiting_approval: true`. Print summary and next step.
- **VERIFICATION_GAPS**: update state to `phase: verify-gaps`. Surface which criteria failed. Suggest `/curdx:debug` or `/curdx:refactor`.
- **BLOCKED**: surface the blocker (e.g., "can't run tests — node_modules missing"). Suggest fix.

### 4. Final output

On VERIFIED:
```
verification complete: .curdx/features/{feature_id}/verification.md

  {N} acceptance criteria checked
  {N} passed
  {K} screenshots captured (if frontend)

evidence: .curdx/features/{feature_id}/evidence/

next:
  /curdx:review    — final spec-compliance + code-quality review
  /curdx:ship      — commit and push (Round 3)
```

On VERIFICATION_GAPS:
```
verification found {K} gaps: .curdx/features/{feature_id}/verification.md

  passed: {pass_count}/{total}
  failed: {fail_list}

next:
  /curdx:debug <failing-criterion>  — systematic investigation
  /curdx:refactor                    — amend spec, plan, or tasks if requirement changed
  fix code directly (walks through the Stop-hook loop if tasks.md updated)
```

## Notes

- The verifier uses `curdx-verify-evidence` skill internally for the evidence table semantics.
- Verification is **read-only** — if something's broken, verifier reports it but doesn't patch.
- For frontend, verifier uses playwright CLI (`npx playwright test`) OR chrome-devtools-mcp tools based on `browser_testing.mode` in config.
- If a regression test is part of the feature, the verifier runs the red-green-cycle proof (revert fix → must fail → restore → must pass) and records all three runs.
