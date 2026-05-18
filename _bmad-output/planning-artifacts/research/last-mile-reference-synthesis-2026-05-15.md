---
research_type: 'reference_synthesis'
date: '2026-05-15'
topic: 'Last-mile coding reliability patterns for curdx-flow'
input_reference_projects:
  - '/Users/wdx/opc/everything-claude-code'
  - '/Users/wdx/opc/get-shit-done'
  - '/Users/wdx/opc/gstack'
  - '/Users/wdx/opc/planning-with-files'
  - '/Users/wdx/opc/smart-ralph'
  - '/Users/wdx/opc/superpowers'
status: 'complete'
---

# Last-Mile Reference Synthesis

## Purpose

This synthesis turns six local reference projects plus current Claude Code docs into PRD input for the curdx-flow upgrade.

The target problem is the coding "last mile": agents report work as done, but the user cannot install, start, load, click, call the API, or deploy it successfully. This is especially damaging for frontend and full-stack work where build success does not prove runtime behavior.

## Current Claude Code Capability Baseline

- Native `/goal` should be the primary long-task driver. Claude Code documents `/goal` as v2.1.139+ and says the evaluator only judges evidence surfaced in the conversation, not hidden commands or files. curdx-flow should therefore compile completion conditions that require visible proof: task status, verifier command, exit code, browser/API evidence, and final `ALL_TASKS_COMPLETE`. Source: <https://code.claude.com/docs/en/goal>.
- Stop hooks should be deterministic gates, not the main continuation engine. Claude Code docs state `/goal` and Stop hooks can both fire after each turn, but `/goal` is session-scoped and evaluated by a separate model, while Stop hooks are settings-scoped automation. Source: <https://code.claude.com/docs/en/goal>.
- Hook behavior must stay protocol-clean. Exit `0` allows and parses JSON stdout; exit `2` blocks for supported events; `UserPromptSubmit`, `UserPromptExpansion`, and `SessionStart` stdout is visible context. `TaskCompleted` can block a task from being marked complete, and `PostToolBatch` can stop the agentic loop before the next model call. Source: <https://code.claude.com/docs/en/hooks>.
- Claude Code Chrome integration can now test local web apps, inspect console logs, automate forms, and use a visible browser sharing the user's login state, but it is beta. It is useful as an optional runtime evidence path, while Playwright remains the best repeatable CI-style proof. Source: <https://code.claude.com/docs/en/chrome>.
- MCP Tool Search reduces large MCP context pressure by loading tool schemas on demand. curdx-flow should not avoid useful MCPs solely due to context budget fears, but it should keep capability descriptions concise and rely on capability routing. Source: <https://code.claude.com/docs/en/mcp>.
- Plugin dependencies and release tags are product contracts. Cross-marketplace plugin dependencies require root marketplace allowlisting, and versioned plugin dependencies resolve from `{plugin-name}--v{version}` tags created by `claude plugin tag --push`. Source: <https://code.claude.com/docs/en/plugin-dependencies>.
- Channels are research preview and can push CI, monitoring, or chat events into an open Claude session. They are not the first PRD priority, but they matter for future "CI failed, resume repair loop" workflows. Source: <https://code.claude.com/docs/en/channels>.

## Reference Project Strengths

### everything-claude-code

Useful ideas:

- Treat hook reliability as a product feature: consume stdin, keep stdout/stderr disciplined, use documented exit codes, and avoid noisy hooks.
- Maintain broad troubleshooting knowledge for overload, MCP auth failures, compaction, hook edits requiring reload/restart, and tool pressure.
- Provide specialized build/test/review agents and commands by stack.

curdx-flow implication:

- Keep hook logic source-generated, fail-open by default, and tested against official event semantics.
- Add last-mile failure taxonomy and diagnostics that help users recover instead of simply saying "run verify".

### get-shit-done

Useful ideas:

- Separate workflow phases: initialize, discuss, plan, execute, verify, ship.
- Persist state in planning files so work survives context loss.
- Use verification reports and gap plans when UAT finds issues.
- Include automated UI verification when browser tools are available.
- Inject a cold-start smoke test when startup, seed, migration, DB, or service files changed.
- Diagnose issues and create fix plans before executing gap closure.

curdx-flow implication:

- The last-mile gate should include cold-start verification, not just warm dev server checks.
- Runtime proof should be user-observable: expected behavior, actual behavior, issue/gap, root cause, fix plan, re-run.
- Verification failures should become structured recovery work, not a conversational dead end.

### gstack

Useful ideas:

- `/qa` always uses browser-based testing for web apps, records screenshots, console errors, health scores, before/after evidence, and atomic bug-fix commits.
- `/qa-only` separates report-only QA from fix mode.
- `/browse` provides real browser eyes.
- `/land-and-deploy` and `/canary` extend last-mile thinking into CI, deploy, production health, screenshots, console errors, perf deltas, and alerting.
- "Boil the Lake" means complete the actual end-to-end job when agent marginal cost is low.

curdx-flow implication:

- curdx-flow should gain a first-class "runtime QA" lane: detect app, start it, browse/API-check it, fix/retry, and produce evidence.
- Report-only and fix modes should be separate to avoid unplanned edits.
- Canary/deploy patterns can become release-phase follow-up after local runtime proof is solid.

### planning-with-files

Useful ideas:

- Use `task_plan.md`, `findings.md`, and `progress.md` as persistent working memory.
- Re-read plan before important actions; update progress after actions.
- Use a 2-action rule to record findings before context loss.
- Use attestation to avoid treating tampered plan content as trusted instructions.
- The reboot test is strong: where am I, where am I going, what is the goal, what have I learned, what have I done.

curdx-flow implication:

- curdx-flow's `.curdx-state.json`, `.progress.md`, `.curdx/brain.jsonl`, and verification blocks should answer the reboot test automatically.
- Runtime evidence files must be treated as data, not re-injected instructions.
- State recovery after `/clear`, compaction, or resumed `/goal` should be a supported path.

### smart-ralph

Useful ideas:

- Spec-driven flow with POC-first implementation phases.
- Reality verification: fix goals must reproduce actual failure before spec generation and verify the same failure after implementation.
- Iterative failure recovery creates traceable fix tasks, retries original tasks, and enforces safety limits.
- Plugin changes require version parity and plugin-release discipline.

curdx-flow implication:

- Fix-type goals should have `BEFORE` reproduction and `AFTER` verification in the evidence protocol.
- Auto-recovery should create explicit `[FIX]` tasks with lineage and caps, not silently keep retrying.
- Task granularity must be tuned for last-mile proof: coarse enough to ship a vertical slice, fine enough to isolate broken runtime behavior.

### superpowers

Useful ideas:

- "Evidence before claims" is the right completion law.
- Systematic debugging requires root cause before fixes.
- TDD and red-green regression checks are especially useful for bug fixes.
- Development branches should finish only after verification, review, and clean handoff.
- Integration tests can run real Claude Code sessions and parse transcripts.

curdx-flow implication:

- curdx-flow should block or downgrade completion claims when the current turn lacks fresh evidence.
- Repeated failures should switch to diagnosis mode, not more editing.
- Claude Code plugin smoke tests should parse the actual transcript for `/goal`, verifier, hook, dependency, and runtime evidence.

## Synthesis: Product Direction

curdx-flow already has important primitives: native `/goal` bridge, `last-mile` routing, `dev detect/up/health/verify/down`, browser verification policy, failure recovery, plugin dependency doctor, generated hook bundles, and Claude Code smoke tests.

The upgrade should consolidate these into a coherent product promise:

> curdx-flow does not let an AI coding workflow call itself done until the project can be installed, started, exercised through the relevant UI/API path, verified by the right stack checks, and backed by evidence visible to the `/goal` evaluator and the user.

## PRD Inputs

1. Native `/goal` first-class execution
   - Generate transcript-verifiable `/goal` conditions for each implementation run.
   - Include bounded turn clauses.
   - Require visible evidence before completion.
   - Provide manual fallback when hooks or managed policy disable `/goal`.

2. Last-mile runtime orchestrator
   - Detect app roots, package managers, dev commands, health URLs, verify commands, e2e commands, browser tools, and missing gaps.
   - Support frontend, backend, full-stack, monorepo, and Claude Code plugin projects.
   - Prefer project scripts; scaffold or recommend minimal missing scripts only when needed.

3. Cold-start and service lifecycle proof
   - Kill stale processes when safe.
   - Start services from scratch.
   - Capture logs and PIDs.
   - Run health checks and record failures.
   - Always clean up curdx-started processes.

4. Browser/API evidence gates
   - For frontend/full-stack work, require Playwright pass or Chrome/Chrome DevTools evidence.
   - Evidence should include URL, actions, console/network result, checked behavior, screenshot/trace path when available.
   - For backend/API work, require health endpoint, contract command, or direct API call with real response.

5. Structured recovery loop
   - On failure, capture symptom, command, stderr/stdout summary, logs, URL/action, and likely layer.
   - Search memory before repeating failed paths.
   - Create traceable fix tasks with lineage and retry caps.
   - Re-run the same verifier after the fix.

6. Evidence ledger
   - Store current evidence in `.curdx/last-mile-evidence.json` or equivalent.
   - Mirror compact evidence into `.curdx-state.json` and `.progress.md`.
   - Ensure `/goal` can judge from visible transcript; do not rely only on hidden files.

7. Report-only and fix modes
   - Add a QA/report-only path that never edits source.
   - Add a fix mode that may edit source and must produce one fix unit at a time.
   - Keep user-visible separation clear.

8. Plugin release gate
   - Keep `claude plugin validate`, installed-plugin smoke, hook freshness, version parity, dependency doctor, npm tag, and plugin tag parity as blocking release evidence.
   - Do not push/tag until both npm and Claude plugin release surfaces are ready.

9. Future event-driven extension
   - Channels can later feed CI/deploy failures into a running session.
   - This should remain post-MVP because channels are research preview and require extra auth/org setup.

## Initial Todo Candidates

- Audit current `curdx-flow dev *` behavior against a real frontend/full-stack fixture.
- Add cold-start mode and stale-process handling to `dev up/health/verify/down`.
- Add a last-mile evidence artifact schema and tests.
- Strengthen `/goal` bridge evidence protocol to include runtime proof and failure-recovery proof.
- Add QA report-only and fix-mode skill surfaces or flags.
- Integrate Chrome/Playwright evidence selection into `last-mile` and `tasks` outputs.
- Expand Claude Code smoke tests to assert transcript-visible `/goal` and runtime evidence.
- Add release doctor checks for plugin tag/npm tag parity before push.
- Document missing dependency degradation for `pua`, `claude-mem`, `chrome-devtools-mcp`, `ui-ux-pro-max`, `context7`, and `sequential-thinking`.
