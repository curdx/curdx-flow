# Intelligent Routing

Use this reference when route output includes `stackProfile`, `qualityGates`,
`suggestedVerifier`, `contextBudget`, or `recommendedCapabilities`.

## Route Facts

- Treat `route` as the workflow decision.
- Treat `intent` as the reason the route was selected.
- Treat `stackProfile` as evidence, not certainty. Low confidence means the
  repository's own scripts and nearby conventions win.
- Treat `qualityGates` as the minimum verification plan for the route.
- Treat `suggestedVerifier` as the preferred final proof before completion.
- Treat `contextBudget` as a cap on reference loading, not a license to skip
  required files.

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
  changelog, and tag behavior.
