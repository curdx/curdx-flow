---
name: curdx-browser-test
description: Use when verifying a frontend feature works end-to-end. Picks between Playwright (forms / CRUD / standard UI) and chrome-devtools-mcp (WebGL / canvas / 3D / maps / performance) based on .curdx/config.json. Produces screenshot + console-error evidence stored under .curdx/features/NNN/evidence/.
---

# Browser Test (curdx-browser-test)

## When this skill activates

- A task requires end-to-end frontend verification (e.g., `[VERIFY-E2E]` task, any `<verify>` command mentioning a URL)
- `/curdx:verify` for a feature where `.curdx/config.json` `browser_testing.mode != "none"`
- A bug-fix feature where the original reproduction involves a browser interaction

## Mode selection

Read `.curdx/config.json`:

```json
"browser_testing": {
  "mode": "playwright" | "chrome-devtools" | "both" | "none" | "prompt",
  ...
}
```

- `playwright` → generate `.curdx/features/<active>/verify.spec.ts`, run `npx playwright test`
- `chrome-devtools` → invoke chrome-devtools-mcp tools directly (no test file generated)
- `both` → run playwright for standard UI assertions; invoke chrome-devtools-mcp for WebGL/canvas-specific verification
- `none` → skip browser testing entirely; return "browser test disabled"
- `prompt` → ask the user once; update config

See:
- [references/playwright.md](references/playwright.md) for Playwright spec generation patterns
- [references/chrome-devtools.md](references/chrome-devtools.md) for chrome-devtools-mcp tool invocation patterns
- [references/ve-pattern.md](references/ve-pattern.md) for the VE1/VE2/VE3 dev-server lifecycle

## The VE three-step protocol

Any browser test sequence consists of three mandatory steps:

**VE1 — Start dev server**
```bash
# use the dev_command from .curdx/config.json, or fall back to `npm run dev`
DEV_CMD=$(jq -r '.dev_command // "npm run dev"' .curdx/config.json)
eval "$DEV_CMD" > .curdx/features/<active>/evidence/dev.log 2>&1 &
echo $! > .curdx/features/<active>/evidence/dev.pid
# wait for server to respond
PORT=${PORT:-3000}
until curl -sf "http://localhost:$PORT" >/dev/null 2>&1; do
  sleep 0.5
  [ $(cat .curdx/features/<active>/evidence/dev.pid | xargs ps -p 2>/dev/null | wc -l) -lt 2 ] && {
    echo "dev server died during startup; see dev.log"; exit 1;
  }
done
```

**VE2 — Run assertions and capture evidence**

Either playwright or chrome-devtools path — see references.

**VE3 — Cleanup (mandatory, use `trap` so it runs on failure)**
```bash
PID=$(cat .curdx/features/<active>/evidence/dev.pid 2>/dev/null)
[ -n "$PID" ] && kill "$PID" 2>/dev/null
# also kill anything still holding the port
lsof -ti ":$PORT" 2>/dev/null | xargs -r kill 2>/dev/null
rm -f .curdx/features/<active>/evidence/dev.pid
```

**Critical:** VE3 runs EVEN IF VE2 fails. Use `trap 've3_cleanup' EXIT` or equivalent. Leaked dev servers across test runs are the #1 cause of "it worked locally" flakiness.

## Evidence requirements

The evidence directory `.curdx/features/<active>/evidence/` MUST contain after this skill runs:

| Artifact | Mandatory? | Path |
|----------|-----------|------|
| Dev server log | yes | `dev.log` |
| Screenshots | yes if VE2 ran | `screenshot-<name>.png` (playwright auto-names; chrome-devtools accepts explicit filePath) |
| Test output | yes if playwright | `playwright-<ts>/` (HTML report + trace) |
| Console errors | yes | part of test output OR `evaluate_script` result for chrome-devtools |
| Network errors | optional | same |

If the feature is a bug fix, ALSO capture:

| Artifact | Path |
|----------|------|
| BEFORE reproduction output | `before-<ts>.log` |
| AFTER reproduction output | `after-<ts>.log` |

## What "passing" looks like

For a browser test to count as passing verification:

- Playwright path: `npx playwright test` exits 0 AND screenshots exist AND no `pageerror`s captured in the spec
- chrome-devtools path: `evaluate_script` returns expected values AND `list_console_messages` shows zero errors AND screenshot file exists on disk

**Console errors from third-party scripts** (e.g., injected analytics) are out of scope — filter them out of the assertion if they're not caused by your code. Document the filter in the spec.

## Self-review

Before returning to the orchestrator:

- [ ] Dev server actually started (verified via curl, not just `sleep 5`)
- [ ] Dev server was killed (VE3 ran even on failure)
- [ ] Port is released (lsof shows nothing)
- [ ] Screenshots exist at the expected paths
- [ ] Console-error check actually ran (not assumed zero)
- [ ] For bug fixes: BEFORE and AFTER logs both captured

## Interaction with other skills

- **curdx-verify-evidence**: this skill's outputs ARE the evidence. `take_screenshot` file paths + console-error-list go into `verification.md`.
- **curdx-tdd**: for frontend features, the `[RED]` task writes the Playwright test; `[GREEN]` makes it pass. This skill runs the test.
- **curdx-read-first**: read the existing `playwright.config.*` (if present) before generating a new spec, so you inherit project conventions (baseURL, viewport, retries).
