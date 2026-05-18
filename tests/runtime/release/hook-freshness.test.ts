import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  evaluateHookFreshnessGate,
  evaluateReleaseDryRun,
  type EvaluateHookFreshnessGateInput,
  type ReleaseHookFreshnessResult,
} from '../../../src/runtime/release/index.ts';

const now = '2026-05-17T21:30:00.000Z';
const fixturePath = 'tests/fixtures/release-candidate/hook-freshness-fixtures.json';

interface HookFixtureFile {
  base: EvaluateHookFreshnessGateInput;
  [id: string]: unknown;
}

interface HookScenario {
  patch?: Partial<EvaluateHookFreshnessGateInput>;
}

async function loadFixtures(): Promise<HookFixtureFile> {
  return JSON.parse(await readFile(fixturePath, 'utf8')) as HookFixtureFile;
}

function scenario(fixtures: HookFixtureFile, id: string): EvaluateHookFreshnessGateInput {
  const entry = fixtures[id] as HookScenario | undefined;
  if (entry === undefined) throw new Error(`missing hook freshness fixture: ${id}`);
  return mergeInput(fixtures.base, entry.patch ?? {});
}

function mergeInput(
  base: EvaluateHookFreshnessGateInput,
  patch: Partial<EvaluateHookFreshnessGateInput>,
): EvaluateHookFreshnessGateInput {
  const copy = structuredClone(base);
  return {
    ...copy,
    ...patch,
    changes: {
      ...copy.changes,
      ...(patch.changes ?? {}),
    },
    commandEvidence: {
      ...copy.commandEvidence,
      ...(patch.commandEvidence ?? {}),
    },
  };
}

function evaluate(input: EvaluateHookFreshnessGateInput): ReleaseHookFreshnessResult {
  return evaluateHookFreshnessGate({
    ...input,
    generatedAt: now,
  });
}

function dryRunFromHookGate(result: ReleaseHookFreshnessResult) {
  return evaluateReleaseDryRun({
    runId: result.runId,
    goalId: result.goalId,
    version: '7.2.1',
    checks: result.checks,
    requiredCheckIds: result.checks.filter((check) => check.required !== false).map((check) => check.id),
    freshness: {
      currentCommit: 'abc123',
      evidenceCommit: 'abc123',
      evidenceVersion: '7.2.1',
      evidenceNpmTag: 'v7.2.1',
      evidenceClaudePluginTag: 'curdx-flow--v7.2.1',
      evidenceRefs: result.checks.flatMap((check) => check.evidenceRefs ?? []),
    },
    generatedAt: now,
    now,
  });
}

describe('release hook freshness gate', () => {
  it('passes when generated hooks, hooks.json targets, hook tests, validation, and smoke evidence align', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(fixtures.base);

    expect(result.status).toBe('passed');
    expect(result.checks.map((check) => [check.id, check.status])).toEqual([
      ['hook-generated-freshness', 'passed'],
      ['hook-entrypoint-parity', 'passed'],
      ['hook-build-evidence', 'passed'],
      ['hook-freshness-evidence', 'passed'],
      ['hook-protocol-tests', 'passed'],
      ['plugin-validation-evidence', 'passed'],
      ['installed-smoke-evidence', 'passed'],
    ]);
    expect(result.requiredCommands).toEqual(expect.arrayContaining([
      'npm run build:hooks',
      'npm run check:hooks-fresh',
      'npm run test:hooks',
    ]));
    expect(result.verifiedSurfaces).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'src/hooks/load-spec-context.ts', kind: 'hook-build-entry' }),
      expect.objectContaining({
        id: '${CLAUDE_PLUGIN_ROOT}/hooks/scripts/user-prompt-submit-autopilot.mjs',
        kind: 'hook-config-target',
      }),
      expect.objectContaining({ id: 'hooks/scripts/load-spec-context.mjs', kind: 'generated-hook-script' }),
    ]));
    expect(dryRunFromHookGate(result).verdict).toBe('release-ready');
  });

  it('blocks stale generated bundles after hook source or hooks metadata changed', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'staleGeneratedBundle'));

    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'hook-generated-freshness',
        reason: expect.stringContaining('generated hook bundles are not fresh'),
      }),
    ]));
  });

  it('blocks manual edits to committed generated hook bundles', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'manualBundleEdit'));

    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'hook-generated-freshness',
        reason: expect.stringContaining('manual edit'),
        remediation: expect.stringContaining('Do not hand-edit'),
      }),
    ]));
  });

  it('blocks missing generated scripts for build entries and hooks.json targets', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'missingHookEntry'));

    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'hook-entrypoint-parity',
        reason: expect.stringContaining('user-prompt-submit-autopilot.mjs'),
      }),
    ]));
  });

  it('blocks hooks.json targets that are not produced by the build entries', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'hooksJsonMismatch'));

    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'hook-entrypoint-parity',
        reason: expect.stringContaining('not-built-hook.mjs'),
      }),
    ]));
  });

  it('requires hook protocol test evidence when hook behavior changed', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'hookProtocolMissing'));

    expect(result.status).toBe('failed');
    expect(result.missingEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'hook-protocol-tests',
      }),
    ]));
  });

  it('does not allow hook freshness alone to stand in for plugin validation or installed smoke evidence', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'pluginValidationMissing'));

    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'plugin-validation-evidence',
        reason: expect.stringContaining('was not provided'),
      }),
    ]));
    expect(dryRunFromHookGate(result).verdict).toBe('not-releasable');
  });
});
