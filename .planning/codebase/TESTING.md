# Testing Patterns

**Analysis Date:** 2026-05-19

## Test Framework

**Runner:**
- Vitest 2.x (`vitest: ^2.1.9` in devDependencies)
- Config: `vitest.config.ts` (repo root)
- Pool: `forks` (each test file runs in a forked process — critical for hooks that spawn child processes)
- Timeout: 5000 ms per test

**Assertion Library:**
- Vitest built-in `expect` (no separate chai/jest-expect library)

**Run Commands:**
```bash
npm run test:hooks          # build:hooks then run tests/hooks
npm run test:contracts      # runtime contract baseline
npm run test:evidence       # evidence ledger tests
npm run test:state          # state store tests
npm run test:verdict        # completion verdict evaluator
npm run test:reports        # report renderer
npm run test:policy         # action risk policy
npm run test:capabilities   # capability doctor + remediation planner
npm run test:planner        # capability routing + user journey plan
npm run test:browser        # browser adapter + UI diagnostics
npm run test:api            # API action evidence
npm run test:data           # data readback
npm run test:fullstack      # save journey probe
npm run test:discovery      # command detection + project topology
npm run test:services       # service lifecycle + multi-service cleanup
npm run test:readiness      # runtime readiness fixtures
npm run test:recovery       # blocker report, failure taxonomy, fix lineage, recovery planner, same-path retry
npm run test:release        # authorization, hook freshness, plugin smoke, dry-run, parity, tag parity
npm run test:analyze        # transcript parser tests
npm run test:runner         # capability registry tests
npm run test:claudecc       # smoke test via live claude CLI (requires claude/claudecc binary)
npm run test:claudecc:e2e   # full end-to-end flow (rarely run locally)
npm run verify              # full local release gate (runs all of the above plus typecheck, build, checks)
```

## Test File Organization

**Location:** Separate `tests/` directory at repo root (not co-located with source).

**Naming:** `<area-name>.test.ts`, matching the source module name:
- `tests/hooks/hook-boundary.test.ts` — hook integration boundary tests
- `tests/hooks/smart-route-runtime.test.ts` — smart route runtime
- `tests/contracts/runtime-contracts.test.ts` — JSON schema + runtime guard alignment
- `tests/analyze/parser.test.ts` — transcript parser
- `tests/runner/capabilities.test.ts` — capability registry consistency

**Structure:**
```
tests/
├── analyze/
│   └── parser.test.ts
├── contracts/
│   └── runtime-contracts.test.ts
├── fixtures/
│   ├── broken-app/
│   ├── contracts/
│   │   ├── valid/          # contracts.json, unknown-fields.json
│   │   └── invalid/        # missing-required.json, bad-enum.json, not-json.json, ...
│   ├── fullstack-app/
│   ├── recovery-scenarios/
│   ├── release-candidate/
│   │   ├── release-dry-run-fixtures.json
│   │   └── release-parity-fixtures.json
│   └── runtime-readiness/
│       ├── api-app/
│       ├── frontend-app/
│       ├── fullstack-app/
│       ├── monorepo/
│       └── unknown-broken-app/
├── hooks/
│   ├── hook-boundary.test.ts
│   └── smart-route-runtime.test.ts
├── runner/
│   └── capabilities.test.ts
└── runtime/
    ├── capabilities/
    ├── discovery/
    ├── evidence/
    ├── planner/
    ├── policy/
    ├── probes/
    │   ├── api/
    │   ├── browser/
    │   ├── data/
    │   └── full-stack/
    ├── readiness/
    ├── recovery/
    ├── release/
    ├── reports/
    ├── services/
    ├── state/
    └── verdict/
```

## Test Structure

**Suite Organization:**
```typescript
import { afterEach, describe, expect, it } from 'vitest';

describe('runtime contract baseline', () => {
  it('keeps every shipped schema aligned with the runtime guard for valid fixtures', () => {
    // ...
  });

  it('rejects missing required fields through shipped schemas and runtime guards', () => {
    // ...
  });
});
```

**Patterns:**
- `describe` block names match the module under test: `'append-only evidence ledger and artifact index'`, `'release dry-run verdict'`, `'Claude Code hook boundary behavior'`
- `it` names are full behavioral sentences: `'blocks Stop only on deterministic completion gates, not continuation prompts'`
- No `beforeEach`/`beforeAll` — workspace setup is per-test via helper functions
- `afterEach` cleans up temp directories from a shared `workspaces: string[]` array

## Mocking

**Framework:** None (no `vi.mock`, no `sinon`). Tests use two strategies:

**1. Dependency injection (runtime tests):**
Functions accept an optional `io` parameter for injectable I/O:
```typescript
const result = await appendEvidence({
  workspaceRoot,
  evidence: evidence({ id: 'ev-new' }),
  io: {
    rename: async () => { throw new Error('rename failed'); },
  },
});
```

**2. Temp filesystem workspaces (hook tests):**
Hook tests create real tmpdir workspaces, write real files, spawn the built `.mjs` bundle, and assert on stdout/stderr/exitCode. No mocking of the hook process itself.

**What to Mock:**
- I/O faults (permission errors, rename failures) via `io` injection in runtime modules
- No file-system globals are mocked

**What NOT to Mock:**
- File I/O in general — tests write real files to `mkdtemp` workspaces
- The hooks themselves — hook boundary tests spawn real compiled bundles via `spawn`

## Fixtures and Factories

**Factory Pattern (used in every runtime test):**
```typescript
function evidence(overrides: Partial<EvidenceBlock> = {}): EvidenceBlock {
  return {
    schemaVersion: 1,
    id: 'ev-command-1',
    runId: 'run-1',
    // ...default valid shape...
    ...overrides,
  };
}
```
Each test file defines its own `evidence()`, `state()`, `artifact()` factory helpers that return a valid baseline object with optional overrides. This pattern is universal across `tests/runtime/**`.

**JSON Fixture Files (release + contracts tests):**
- `tests/fixtures/contracts/valid/contracts.json` — one valid payload per contract name
- `tests/fixtures/contracts/valid/unknown-fields.json` — future-field forward-compat payloads
- `tests/fixtures/contracts/invalid/*.json` — one bad payload per failure class
- `tests/fixtures/release-candidate/release-dry-run-fixtures.json` — keyed fixture map (`ready`, `failedCheck`, `staleEvidence`, etc.)
- `tests/fixtures/release-candidate/release-parity-fixtures.json` — scenario patches applied to a base fixture

**Filesystem Fixture Apps (readiness + discovery tests):**
- `tests/fixtures/runtime-readiness/api-app/` — simulated API project
- `tests/fixtures/runtime-readiness/frontend-app/` — simulated frontend project
- `tests/fixtures/runtime-readiness/monorepo/` — simulated monorepo
- `tests/fixtures/fullstack-app/` — simulated fullstack app with scripts

## Coverage

**Requirements:** No coverage threshold is configured. Coverage is not enforced by CI.

**View Coverage:**
```bash
# Not configured in package.json — run manually if needed:
npx vitest run --coverage
```

## Test Types

**Unit Tests (runtime modules):**
- Scope: pure TypeScript functions from `src/runtime/**` — no process spawning, no network.
- Examples: `tests/runtime/evidence/evidence-ledger.test.ts`, `tests/runtime/verdict/verdict-evaluator.test.ts`
- Pattern: factory functions create inputs; tests call the function and assert on the returned `{ ok, ... }` result shape.

**Integration Tests (hooks):**
- Scope: compiled `.mjs` hook bundles spawned as child processes with a real tmpdir workspace.
- Key file: `tests/hooks/hook-boundary.test.ts`
- Pattern:
  ```typescript
  const result = await runHookScript('stop-watcher.mjs', {
    hook_event_name: 'Stop',
    cwd: workspace,
    session_id: 'session-1',
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBe('');
  ```
- `runHookScript` spawns `process.execPath [scriptPath]` with stdio piped, sends JSON on stdin, collects stdout/stderr, and enforces a 5-second timeout.
- Must run `npm run build:hooks` first (`test:hooks` does this automatically).

**Contract Tests:**
- Scope: JSON schemas under `plugins/curdx-flow/schemas/` verified against `src/runtime/contracts/` runtime guards via AJV2020 + the in-process `validateContract` function.
- Key file: `tests/contracts/runtime-contracts.test.ts`
- Verifies schema/guard alignment: both the AJV schema and the TypeScript guard must agree on valid/invalid payloads.

**Smoke Test (manual / CI-optional):**
- `scripts/claudecc-smoke.mjs` — invokes a real `claude` or `claudecc` binary.
- Exercises: `--version`, `plugin validate`, `/curdx-flow:help`, `/curdx-flow:status`, `runtime doctor`, `runtime snapshot`, `runtime route`.
- Requires Claude Code CLI installed. Not run in the GitHub CI matrix (only run locally or in specialized environments).
- Run via: `npm run test:claudecc`

**E2E Test:**
- `scripts/claudecc-e2e-flow.mjs` — full end-to-end flow. Not in `npm run verify`. Run explicitly.
- Run via: `npm run test:claudecc:e2e`

## Release-Gate Scripts

The `npm run verify` command is the local release-quality gate. It runs in order:

1. `npm run typecheck` — strict TypeScript check
2. `vitest run tests/contracts` through all runtime module suites
3. `npm run check-versions` — assert all four version-bearing files match (`package.json`, `package-lock.json`, `plugins/curdx-flow/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`)
4. `npm run check:hooks-fresh` — assert generated `.mjs` bundles are up-to-date with their `.ts` sources
5. `npm run build` — produce `dist/index.mjs`
6. `npm run check:bundle` — assert bundle size is within limits
7. `npm run test:hooks` (build + run hook boundary tests)
8. `npm run test:analyze`, `npm run test:runner`
9. `node scripts/check-verification-blocks.mjs` — verify active spec's `verificationBlocks` are present, passing, not stale

**Evidence-driven verification (added in v7.3.x):**
- `src/runtime/release/` implements `evaluateReleaseDryRun` and `evaluateReleaseParity`.
- A release dry-run verdict (`release-ready` or `not-releasable`) is computed from evidence blocks, freshness checks, and side-effect detection.
- The verdict is required to be `release-ready` before the release tag is pushed.
- Tested in `tests/runtime/release/*.test.ts`.

## CI Configuration

**File:** `.github/workflows/ci.yml`

**Jobs:**
- `typecheck` — `ubuntu-latest`, Node 22, runs `npm run typecheck`
- `check-fresh` — `ubuntu-latest`, Node 22, runs `npm run check:hooks-fresh`
- `test-matrix` — matrix of 4 environments:
  - `ubuntu-latest` / Node 20
  - `ubuntu-latest` / Node 22
  - `macos-latest` / Node 22
  - `windows-latest` / Node 22
  - Each runs: `npm ci`, `npm run build:hooks`, `npm run test:hooks`, `npm run build`, `npm run check:bundle`
- `all-green` — aggregates results; fails if any leg failed

**Triggers:** push to `main`, push of `v*` tags, pull requests.

**Note:** Only `test:hooks` and `check:bundle` run in CI matrix. The full `npm run verify` suite (runtime unit tests, contracts, discovery, etc.) is expected to be run locally before pushing. No `npm run test:contracts` or `npm run test:evidence` in CI.

**Release Workflow:** `.github/workflows/release.yml`
- Triggered on `v*` tag push.
- Runs: `npm ci`, `npm run check-versions`, `npm run build`, `npm publish --provenance --access public`
- Creates a GitHub release with auto-generated notes via `softprops/action-gh-release`.
- Does NOT run `npm run verify` — assumes verify was run locally before tagging.

## Common Patterns

**Async Testing:**
```typescript
it('appends evidence without overwriting earlier evidence', async () => {
  const workspaceRoot = await createWorkspace();
  await expect(appendEvidence({ workspaceRoot, evidence: first })).resolves.toMatchObject({
    ok: true,
    evidenceId: 'ev-command-1',
  });
});
```

**Error / Structured Failure Testing:**
```typescript
it('returns a blocker when an existing ledger contains invalid JSON', async () => {
  const result = await appendEvidence({ workspaceRoot, evidence: ... });
  expect(result).toMatchObject({
    ok: false,
    status: 'blocked',
    issues: [expect.objectContaining({ code: 'invalid-json', path: '$[1]' })],
  });
  // Verify old bytes untouched:
  expect(readFileSync(paths.ledgerPath, 'utf8')).toBe(before);
});
```

**Hook boundary (exit-code + stdout/stderr):**
```typescript
const result = await runHookScript('stop-watcher.mjs', payload);
expect(result.exitCode).toBe(0);
expect(result.stdout).toBe('');
expect(result.stderr).toContain('[curdx-flow]');
```

**Forward-compat (unknown fields preserved):**
```typescript
const result = validateContract('evidence', fixtures.evidence);
expect(result.ok).toBe(true);
if (result.ok) {
  expect(result.value).toMatchObject({ futureTopLevelField: { kept: true } });
}
```

**Chinese strings in assertions (release verdict):**
```typescript
expect(result.summary.headline).toBe('未发布 / 可发布');
expect(readySummary).toContain('未发布 / 可发布');
expect(blockedSummary).toContain('未发布 / 不可发布');
```
User-facing summary strings in the release verdict module are in Chinese. Tests assert on the exact Chinese string.

---

*Testing analysis: 2026-05-19*
