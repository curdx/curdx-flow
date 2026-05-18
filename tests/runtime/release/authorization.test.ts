import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  evaluateReleaseAuthorizationGate,
  type EvaluateReleaseAuthorizationGateInput,
  type ReleaseAuthorizationResult,
} from '../../../src/runtime/release/index.ts';

const now = '2026-05-17T23:00:00.000Z';
const fixturePath = 'tests/fixtures/release-candidate/release-authorization-fixtures.json';

interface AuthorizationFixtureFile {
  base: EvaluateReleaseAuthorizationGateInput;
  [id: string]: unknown;
}

interface AuthorizationScenario {
  patch?: Partial<EvaluateReleaseAuthorizationGateInput>;
}

async function loadFixtures(): Promise<AuthorizationFixtureFile> {
  return JSON.parse(await readFile(fixturePath, 'utf8')) as AuthorizationFixtureFile;
}

function scenario(fixtures: AuthorizationFixtureFile, id: string): EvaluateReleaseAuthorizationGateInput {
  const entry = fixtures[id] as AuthorizationScenario | undefined;
  if (entry === undefined) throw new Error(`missing release authorization fixture: ${id}`);
  return mergeInput(fixtures.base, entry.patch ?? {});
}

function mergeInput(
  base: EvaluateReleaseAuthorizationGateInput,
  patch: Partial<EvaluateReleaseAuthorizationGateInput>,
): EvaluateReleaseAuthorizationGateInput {
  const copy = structuredClone(base);
  return {
    ...copy,
    ...patch,
    authorization: patch.authorization === undefined ? copy.authorization : patch.authorization,
    releaseGate: {
      ...copy.releaseGate,
      ...(patch.releaseGate ?? {}),
    },
  };
}

function evaluate(input: EvaluateReleaseAuthorizationGateInput): ReleaseAuthorizationResult {
  return evaluateReleaseAuthorizationGate({
    ...input,
    generatedAt: now,
  });
}

describe('release two-key authorization boundary', () => {
  it('keeps release ready but no-publish when release-stage authorization is missing', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(fixtures.base);

    expect(result.status).toBe('ready-no-auth');
    expect(result.publicationState).toBe('not-published');
    expect(result.actionRecords).toEqual([]);
    expect(result.sideEffects).toEqual([]);
    expect(result.checks.find((check) => check.id === 'release-stage-authorization')?.status).toBe('missing');
    expect(result.nextAction.requiresReleaseStageAuthorization).toBe(true);
    expect(result.nextAction.summary).toContain('request explicit release-stage authorization');
  });

  it('blocks even with authorization when release evidence gate has blockers', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'authorizedGateFailed'));

    expect(result.status).toBe('blocked');
    expect(result.actionRecords).toEqual([]);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'release-gate-readiness',
        reason: expect.stringContaining('authorization exists but release evidence gate is not ready'),
      }),
    ]));
  });

  it('records authorized release actions when both gate and release-stage authorization are present', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'authorizedGatePassed'));

    expect(result.status).toBe('authorized');
    expect(result.actionRecords).toHaveLength(4);
    expect(result.sideEffects).toEqual([]);
    expect(result.actionRecords).toEqual(expect.arrayContaining([
      expect.objectContaining({
        authorizationSource: 'user-explicit-release-stage',
        authorizationText: 'I authorize release-stage publish for 7.2.1',
        version: '7.2.1',
        npmTag: 'v7.2.1',
        claudePluginTag: 'curdx-flow--v7.2.1',
        command: 'claude plugin tag --push',
        expectedSideEffects: ['claude-plugin-tag-push'],
      }),
    ]));
    expect(result.publicationState).toBe('not-published');
  });

  it('blocks release side effects from ordinary doctor or smoke flows', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'ordinaryFlowAttemptedPublish'));

    expect(result.status).toBe('blocked');
    expect(result.actionRecords).toEqual([]);
    expect(result.sideEffects.map((entry) => entry.kind)).toEqual([
      'git-tag',
      'git-push',
      'npm-publish',
      'claude-plugin-tag-push',
    ]);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'ordinary-flow-no-publish',
        reason: expect.stringContaining('doctor'),
      }),
    ]));
  });

  it('keeps ordinary readiness flows dry-run only when no release action is requested', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate({
      ...scenario(fixtures, 'authorizedGatePassed'),
      flowContext: 'smoke',
      actionIntents: [],
    });

    expect(result.status).toBe('dry-run-only');
    expect(result.actionRecords).toEqual([]);
    expect(result.sideEffects).toEqual([]);
    expect(result.nextAction.summary).toContain('dry-run/readiness-only');
  });

  it('reports partial remote tag failure as incomplete with recovery guidance', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'partialRemoteTagFailure'));

    expect(result.status).toBe('incomplete');
    expect(result.actionRecords).toEqual([]);
    expect(result.recoverySteps.join(' ')).toContain('curdx-flow--v7.2.1');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'partial-release-recovery',
        reason: expect.stringContaining('partial release state'),
      }),
    ]));
  });
});
