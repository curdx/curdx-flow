# Playwright integration for curdx-browser-test

## When to use this path

`.curdx/config.json` `browser_testing.mode` is `playwright` or `both` (for the standard-UI parts).

## Install

If not already installed, `/curdx:init` will suggest:

```bash
npm i -D @playwright/test
npx playwright install chromium
# for CI / Linux: npx playwright install --with-deps chromium
```

## Generated spec file

For each feature that needs browser testing, the skill generates `.curdx/features/<id>/verify.spec.ts`. Skeleton:

```typescript
import { test, expect } from '@playwright/test';

test.describe('feature <id> — <feature name>', () => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    // capture screenshot unconditionally for evidence
    await page.screenshot({
      path: `.curdx/features/<id>/evidence/${testInfo.title.replace(/\s+/g, '-')}.png`,
      fullPage: true,
    });
    // log errors for the afterEach report — they will NOT fail the test here;
    // assertions in the test body do that explicitly
  });

  test('AC-1.1: <criterion text>', async ({ page }) => {
    await page.goto('/'); // baseURL comes from playwright.config
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();

    // ... per-AC assertions ...

    // enforce zero pageerrors for this test
    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
    // console errors: allow project-specific allowlist, reject otherwise
    const unexpectedConsole = consoleErrors.filter(e => !/<known-third-party-pattern>/.test(e));
    expect(unexpectedConsole, unexpectedConsole.join('\n')).toEqual([]);
  });

  // ... one test per AC ...
});
```

## Run command (VE2)

```bash
npx playwright test .curdx/features/<id>/verify.spec.ts \
  --reporter=line,html \
  --output=.curdx/features/<id>/evidence/playwright-$(date -u +%Y%m%dT%H%M%SZ) \
  --trace=retain-on-failure \
  --screenshot=only-on-failure \
  --config=$(test -f playwright.config.ts && echo playwright.config.ts || echo -)
```

- `--reporter=line,html`: line for stdout (captured in evidence), html for the browsable report
- `--output=...`: timestamped dir for artifacts (traces, videos, screenshots-on-failure)
- `--trace=retain-on-failure`: full trace captured only if test fails (zip)
- `--screenshot=only-on-failure`: per-playwright; our afterEach also captures unconditionally

## Selectors — prefer these in this order

Per Playwright best practices:

1. `page.getByRole(...)` — accessibility-first, most resilient
2. `page.getByLabel(...)` — for form fields
3. `page.getByText(...)` — visible text
4. `page.getByPlaceholder(...)` — form fallback
5. `page.getByTestId(...)` — for components where the above don't apply; requires `data-testid` in source
6. Avoid: `page.locator('.css-xxx')` or `page.locator('#id123')` — fragile to style changes

## Base URL and config inheritance

If the project already has `playwright.config.ts`, **read it first** (curdx-read-first) and DO NOT override its `baseURL`, `viewport`, or `retries` unless the spec requires a different value. Write generated specs to be config-agnostic.

If no config exists, emit a minimal one at `.curdx/features/<id>/playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  fullyParallel: false, // sequential is safer for our one-feature-at-a-time model
  retries: 0,           // no retries — flake is a bug to report, not to mask
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
```

## Anti-patterns

- `page.waitForTimeout(5000)` — forbidden. Use `waitFor(...)` with a condition, or `expect(...).toBeVisible()` which auto-waits.
- `if (await page.isVisible(...)) { ... }` — fragile; treats a race as a feature. Prefer `await expect(...).toBeVisible()`.
- Testing against mock HTTP servers — OK for unit tests, but /curdx:verify runs against the REAL dev server from VE1.
- Skipping `pageerror` checks — a silently-thrown exception that doesn't fail a visible assertion is the most dangerous bug class.
