# Intelligent Routing

Use this reference when route output includes `stackProfile`, `qualityGates`,
`suggestedVerifier`, `contextBudget`, `recommendedCapabilities`, or `lastMile`.

## Route Facts

- Treat `route` as the workflow decision.
- Treat `intent` as the reason the route was selected.
- Treat `stackProfile` as evidence, not certainty. Low confidence means the
  repository's own scripts and nearby conventions win.
- Treat `qualityGates` as the minimum verification plan for the route.
- Treat `suggestedVerifier` as the preferred final proof before completion.
- Treat `contextBudget` as a cap on reference loading, not a license to skip
  required files.
- Treat `recommendedCapabilities` as phase-specific hints. Check
  `availabilityState` before relying on an external plugin or MCP.
  `availability` names the provisioning class: `plugin-dependency` for Claude
  Code plugin dependencies, `external-expected` for MCPs installed outside this
  plugin, and `known-available` for capabilities already visible in the current
  tool surface.

## Stack Profile

`stackProfile.primary` may be:

- `typescript`
- `react`
- `vue`
- `next`
- `node`
- `spring-boot`
- `spring-cloud`
- `python`
- `go`
- `rust`
- `claude-code-plugin`
- `unknown`

When multiple stacks are detected, verify each affected runtime root. Do not use
one stack's test command as proof for a different root.

## Quality Gates

- `*-docs`: query current official docs before changing behavior that depends on
  a framework, SDK, Claude Code plugin surface, hook event, agent field, plugin
  dependency, marketplace, tag, or release behavior.
- `*-tdd`: create or update a focused regression test before implementation when
  behavior changes and risk is not low.
- `*-baseline`: run the detected stack's normal unit/type/build verifier.
- `*-browser`: use Playwright for repeatable browser proof; use Chrome DevTools
  MCP for console, network, DOM, performance, canvas, WebGL, map, GPU, or flaky
  Playwright cases.
- `*-security-review`: run a read-only pass for auth, permission, secrets,
  injection, dependency, and release risk.
- `*-release`: run the stricter release gate before push/tag/publish work.

## Capability Availability

- `availabilityState: available`: the capability is visible in the current
  tool/plugin/MCP surface.
- `availabilityState: expected`: curdx-flow expects the environment to provide
  it through plugin dependencies or external MCP setup scripts, but the route
  did not prove it.
- `availabilityState: missing`: do not rely on the wheel until setup is fixed.
- `availabilityState: workflow`: no external install is needed.

If `doNotReimplement: true`, curdx-flow must not build a duplicate. Use the
named wheel when available, skip it when optional, or surface setup remediation
when it is required for the task.

`context7` and `sequential-thinking` are external MCP wheels in this setup.
Do not add plugin-local `.mcp.json` files or `mcpServers` manifest entries for
  them; `doctor` should diagnose whether Claude Code can see them.

## Last-Mile Autopilot

`lastMile` is the automatic orchestration layer above route facts. It decides
the current phase, the risky problem type, capability plan, evidence gates, and
coordinator instruction. Do not ask the user which skill to run when
`lastMile.capabilityPlan` already identifies the relevant wheel.

Use dependency wheels as capabilities, not as copied assets:

- `claude-mem` for history, previous decisions, and repeated failures.
- `pua` for repeated-failure recovery or genuinely independent decomposition.
- `frontend-design` for official UI design guidance and `ui-ux-pro-max` for deeper UI/visual/interaction critique.
- `chrome-devtools-mcp` for browser console/network/DOM/performance/evidence.

If a required capability is missing, follow its `fallbackWhenMissing` and run
`curdx-flow doctor`; never implement a duplicate wheel inside curdx-flow.

## Context Budget

- `tiny`: read only the directly touched files and one convention file.
- `focused`: read target files, nearest tests, and one relevant reference.
- `standard`: bounded discovery across source, tests, docs, and official docs.
- `expanded`: split discovery by subsystem and summarize before implementation.

Never exceed the budget by loading long manuals into the main context when a
short reference or deterministic route output answers the question.

## Claude Code Plugin Work

For `claude-code-plugin` stack work:

- Start from `https://code.claude.com/docs/llms.txt`.
- Verify plugin, skill, agent, hook, dependency, marketplace, and tag behavior
  against current official docs.
- Prefer `claude plugin validate ./plugins/curdx-flow`, `npm run
  check:hooks-fresh`, `npm run typecheck`, focused hook/runner tests, and
  `CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc`.
- Before release, align package, lockfile, plugin manifest, marketplace entry,
  changelog, and tag behavior. Run `curdx-flow doctor --cwd <repo>` and treat
  `release.tagParity.state = "incomplete"` as blocking until npm and plugin
  tags are restored to parity.
- For plugin dependency version resolution, Claude Code uses
  `{plugin-name}--v{version}` tags. The repository's existing `vX.Y.Z` tag is
  the npm publish trigger, not a substitute for the plugin dependency tag.
