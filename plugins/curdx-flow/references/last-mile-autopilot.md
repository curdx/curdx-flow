# Last-Mile Autopilot

Use this reference whenever hook context, execution brief, or runtime output
contains `lastMile`.

## Contract

`curdx-flow last-mile --json` is an internal routing surface. It answers:

- what phase the work is in
- what is being built or fixed
- what problem is currently risky
- which dependency wheel should be used
- what evidence is required before completion

It does not replace dependency plugins and does not install MCP servers. It
only turns deterministic project facts into instructions the coordinator can
follow.

## Dependency Wheels

- `claude-mem`: use for historical context, previous decisions, similar work,
  regressions, or repeated failures.
- `pua`: use after repeated failures or when independent slices can be safely
  decomposed for parallel diagnosis/execution.
- `frontend-design`: use before implementing visible frontend experiences,
  components, pages, interaction design, responsive layout, or visual polish.
- `ui-ux-pro-max`: use for visible UI, interaction, responsive behavior,
  layout, visual polish, deeper UX critique, and design consistency.
- `chrome-devtools-mcp`: use for real browser evidence: console, network, DOM,
  screenshots, performance, canvas/WebGL/map/GPU, or flaky Playwright cases.

If `availabilityState` is `missing`, do not pretend the capability exists and
do not rebuild it inside curdx-flow. Follow `fallbackWhenMissing` and surface
doctor/setup remediation when the evidence gate is required.

## Phase Rules

- `discovering`: gather missing facts or access before planning.
- `planning`: create or refine the smallest spec/tasks needed.
- `implementing`: execute the current slice, respecting file ownership.
- `debugging`: stop broad editing; isolate the failing condition first.
- `verifying`: satisfy required verifier/evidence gates.
- `recovering`: search memory, inspect brain events, then decompose or retry.
- `releasing`: run official docs, doctor, plugin validation, hook freshness,
  version alignment, and npm/plugin tag parity before push/tag/publish.

## Coordinator Use

At the start of each execution loop and after any failed verifier:

1. Read `lastMile.phase`, `problemTypes`, and `coordinatorInstruction`.
2. If `dependency-missing` appears, run `curdx-flow doctor` before relying on
   that wheel.
3. If `repeated-failure` appears, search `claude-mem` first; use `pua` only
   after confirming the work can be decomposed or the same path already failed.
4. If `ui-quality-risk` appears, apply `frontend-design` or `ui-ux-pro-max` before changing UI.
5. If `browser-evidence-needed` appears, plan Playwright or Chrome DevTools MCP
   proof before claiming completion.
6. If `verification-gap` appears, run and record the verifier before advancing.

Completion is not valid until `evidenceRequired` is satisfied or explicitly
downgraded by the coordinator with a reason recorded in `.curdx/brain.jsonl`.
