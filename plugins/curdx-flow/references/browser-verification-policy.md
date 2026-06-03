# Browser Verification Policy

## Purpose

curdx-flow must prove full-stack and frontend work in a real running system before claiming completion. Unit tests, type checks, and build success are necessary but not enough when behavior depends on a browser, frontend/backend integration, routing, auth, API calls, rendering, canvas, maps, or WebGL.

Use two tracks:

1. **Playwright CLI / `@playwright/test` by default** for repeatable end-to-end checks that can be committed and run in CI.
2. **Chrome DevTools MCP for high-fidelity diagnosis** when correctness depends on real Chrome runtime details or Playwright is too coarse/flaky.

Do not route browser verification through `/ultrareview`. Do not make Claude Code's beta Chrome integration the primary path. If official browser tooling becomes strictly better and stable, update this policy first, then update agents.

## Decision Matrix

| Scenario | Default Tool | Why |
| --- | --- | --- |
| Login, form, navigation, CRUD, route guards, API+UI flow | Playwright CLI | Repeatable, scriptable, CI-friendly |
| Responsive smoke, accessibility selectors, basic screenshot evidence | Playwright CLI | Produces stable tests, traces, screenshots |
| Existing project already has `test:e2e`, `e2e`, or Playwright config | Playwright CLI | Use the project's own contract |
| GIS, map tiles, WebGL, canvas-heavy rendering, GPU behavior | Chrome DevTools MCP | Needs real Chrome rendering/runtime inspection |
| Console/network/performance failure, flaky Playwright result, CSS/DOM runtime issue | Chrome DevTools MCP | Direct access to console, network, DOM, screenshots, traces |
| Production/deployment smoke without UI interaction | `curl`, WebFetch, or project smoke command | Browser is unnecessary unless UI behavior matters |

## Task Planning Rules

- Every full-stack or frontend task plan must include a **Browser Verify** decision: `playwright`, `chrome-devtools-mcp`, `none`, or `blocked`.
- `none` is allowed only for backend-only, CLI-only, library-only, or documentation work; include a short reason.
- Prefer existing project commands from `package.json`, CI, or research notes: `npm run test:e2e`, `pnpm test:e2e`, `npx playwright test`, etc.
- If no browser automation exists but UI/full-stack behavior is in scope, add a focused Playwright test before final verification.
- If the project has `package.json` and no E2E script exists, add a repeatable script such as `"test:e2e": "playwright test"` or the repo's naming equivalent. Do not leave the only rerun command as ad hoc `npx playwright test ...` unless the project has no package script surface.
- Escalate to Chrome DevTools MCP for the high-fidelity cases in the matrix.
- Browser proof must include the dev server command, target URL, tool used, checked flow, and evidence artifact or observation.

## Evidence Contract

Acceptable evidence:

- Playwright command exit 0 plus scenario count, trace/report path, screenshot path, or test file path.
- Chrome DevTools MCP observation covering URL, console errors, failed requests, DOM/screenshot/snapshot finding, and performance trace when relevant.
- API/browser integration evidence showing the frontend called the expected backend endpoint and rendered the expected state.

Not acceptable:

- "Looks good" without command output or browser observation.
- Mock-only tests as a substitute for real UI/full-stack behavior.
- Build/typecheck/lint alone for browser-facing changes.
- Screenshots without an assertion or explicit checked behavior.

## Failure Loop

When browser verification fails:

1. Capture the browser symptom: URL, action, visible state, console error, network failure, screenshot/trace if available.
2. Trace to the responsible layer: route, component, state, API client, backend endpoint, persistence, auth, build asset, or deployment config.
3. Fix the narrowest code path.
4. Re-run the same browser verification.
5. Keep cleanup tasks for dev servers and browser processes even when verification fails.

## Browser Skill Pattern

When a project needs a reusable browser scraper/checker rather than a one-off test, follow the useful part of gstack's browser-skill shape:

- Put the durable logic in a small script with typed output.
- Export pure parsing/assertion functions.
- Add fixture-based tests for selectors and parser behavior.
- Keep runtime browser control separate from pure logic so tests do not require a daemon or network.

Do not copy gstack's preamble, telemetry, sidebar/browser app, or routing-injection system into curdx-flow.
