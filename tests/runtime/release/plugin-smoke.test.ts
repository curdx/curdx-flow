import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  evaluatePluginSmokeGate,
  evaluateReleaseDryRun,
  type EvaluatePluginSmokeGateInput,
  type ReleasePluginSmokeResult,
} from '../../../src/runtime/release/index.ts';

const now = '2026-05-17T22:00:00.000Z';
const fixturePath = 'tests/fixtures/release-candidate/plugin-smoke-fixtures.json';

interface PluginSmokeFixtureFile {
  base: EvaluatePluginSmokeGateInput;
  [id: string]: unknown;
}

interface PluginSmokeScenario {
  patch?: Partial<EvaluatePluginSmokeGateInput>;
}

async function loadFixtures(): Promise<PluginSmokeFixtureFile> {
  return JSON.parse(await readFile(fixturePath, 'utf8')) as PluginSmokeFixtureFile;
}

function scenario(fixtures: PluginSmokeFixtureFile, id: string): EvaluatePluginSmokeGateInput {
  const entry = fixtures[id] as PluginSmokeScenario | undefined;
  if (entry === undefined) throw new Error(`missing plugin smoke fixture: ${id}`);
  return mergeInput(fixtures.base, entry.patch ?? {});
}

function mergeInput(
  base: EvaluatePluginSmokeGateInput,
  patch: Partial<EvaluatePluginSmokeGateInput>,
): EvaluatePluginSmokeGateInput {
  const copy = structuredClone(base);
  return {
    ...copy,
    ...patch,
    claudeCli: {
      ...copy.claudeCli,
      ...(patch.claudeCli ?? {}),
    },
    commandEvidence: {
      ...copy.commandEvidence,
      ...(patch.commandEvidence ?? {}),
    },
    smokeWorkspace: {
      ...copy.smokeWorkspace,
      ...(patch.smokeWorkspace ?? {}),
    },
  };
}

function evaluate(input: EvaluatePluginSmokeGateInput): ReleasePluginSmokeResult {
  return evaluatePluginSmokeGate({
    ...input,
    generatedAt: now,
  });
}

function dryRunFromPluginSmoke(result: ReleasePluginSmokeResult) {
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

describe('release plugin validation and installed smoke gate', () => {
  it('passes when Claude CLI, plugin validation, installed smoke, and smoke surfaces align', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(fixtures.base);

    expect(result.status).toBe('passed');
    expect(result.checks.map((check) => [check.id, check.status])).toEqual([
      ['claude-cli-readiness', 'passed'],
      ['plugin-validation-evidence', 'passed'],
      ['installed-smoke-evidence', 'passed'],
      ['installed-smoke-surfaces', 'passed'],
      ['smoke-workspace-isolation', 'passed'],
    ]);
    expect(result.requiredCommands).toEqual(expect.arrayContaining([
      'claude plugin validate ./plugins/curdx-flow',
      'CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc',
    ]));
    expect(result.verifiedSurfaces).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'plugin-manifest', kind: 'plugin-manifest' }),
      expect.objectContaining({ id: 'help-skill', kind: 'plugin-skill' }),
      expect.objectContaining({ id: 'hooks-non-blocking', kind: 'smoke-surface' }),
      expect.objectContaining({ id: 'claude-cli', kind: 'claude-cli' }),
    ]));
    expect(dryRunFromPluginSmoke(result).verdict).toBe('release-ready');
  });

  it('blocks release when Claude plugin validation fails with source-validation classification', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'validationFailed'));

    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'plugin-validation-evidence',
        failureKind: 'source-validation',
        reason: expect.stringContaining('invalid hooks/hooks.json'),
      }),
    ]));
    expect(dryRunFromPluginSmoke(result).verdict).toBe('not-releasable');
  });

  it('blocks release when installed smoke command fails', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'installedSmokeFailed'));

    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'installed-smoke-evidence',
        failureKind: 'installed-smoke',
        reason: expect.stringContaining('/curdx-flow:help did not load'),
      }),
    ]));
  });

  it('classifies dependency guidance smoke failures as dependency-resolution blockers', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'dependencyGuidanceFailed'));

    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'installed-smoke-surfaces',
        failureKind: 'dependency-resolution',
        reason: expect.stringContaining('dependency guidance'),
      }),
    ]));
  });

  it('classifies hook blocking smoke failures as hook blockers', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'hookNonBlockingFailed'));

    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'installed-smoke-surfaces',
        failureKind: 'hook',
        reason: expect.stringContaining('hook non-blocking'),
      }),
    ]));
  });

  it('blocks release when smoke does not run in an isolated temp workspace', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'workspaceNotIsolated'));

    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'smoke-workspace-isolation',
        failureKind: 'workspace-isolation',
      }),
    ]));
  });

  it('blocks instead of passing when Claude CLI is missing', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'claudeCliMissing'));

    expect(result.status).toBe('blocked');
    expect(result.checks.find((check) => check.id === 'claude-cli-readiness')?.status).toBe('blocked');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'claude-cli-readiness',
        failureKind: 'claude-cli',
      }),
    ]));
    expect(dryRunFromPluginSmoke(result).verdict).toBe('not-releasable');
  });

  it('requires manual confirmation when Claude CLI lacks required smoke capabilities', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'claudeCliUnsupported'));

    expect(result.status).toBe('manual-confirmation-required');
    expect(result.checks.find((check) => check.id === 'claude-cli-readiness')?.status).toBe('manual-confirmation-required');
    expect(dryRunFromPluginSmoke(result).verdict).toBe('not-releasable');
  });

  it('does not accept build and typecheck evidence as substitutes for plugin validation', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'validationMissingButBuildPassed'));

    expect(result.status).toBe('failed');
    expect(result.missingEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkId: 'plugin-validation-evidence' }),
    ]));
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'plugin-validation-evidence',
        reason: expect.stringContaining('was not provided'),
      }),
    ]));
  });
});
