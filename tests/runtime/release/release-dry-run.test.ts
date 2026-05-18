import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { validateContract } from '../../../src/runtime/contracts/index.ts';
import {
  detectForbiddenReleaseSideEffects,
  evaluateReleaseDryRun,
  renderReleaseDryRunSummary,
  type EvaluateReleaseDryRunInput,
  type ReleaseDryRunVerdict,
} from '../../../src/runtime/release/index.ts';

const now = '2026-05-17T20:30:00.000Z';
const fixturePath = join(process.cwd(), 'tests/fixtures/release-candidate/release-dry-run-fixtures.json');

type FixtureMap = Record<string, EvaluateReleaseDryRunInput & {
  expected: Record<string, unknown>;
}>;

async function loadFixtures(): Promise<FixtureMap> {
  return JSON.parse(await readFile(fixturePath, 'utf8')) as FixtureMap;
}

function fixture(fixtures: FixtureMap, id: string): EvaluateReleaseDryRunInput {
  const entry = fixtures[id];
  if (entry === undefined) throw new Error(`missing release dry-run fixture: ${id}`);
  return entry;
}

function evaluate(input: EvaluateReleaseDryRunInput): ReleaseDryRunVerdict {
  return evaluateReleaseDryRun({
    ...input,
    generatedAt: now,
    now,
  });
}

describe('release dry-run verdict', () => {
  it('returns release-ready with L4 release evidence while staying explicitly unpublished', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(fixture(fixtures, 'ready'));

    expect(result.verdict).toBe('release-ready');
    expect(result.published).toBe(false);
    expect(result.publicationState).toBe('not-published');
    expect(result.summary.headline).toBe('未发布 / 可发布');
    expect(result.version).toBe('7.2.1');
    expect(result.npmTag).toBe('v7.2.1');
    expect(result.claudePluginTag).toBe('curdx-flow--v7.2.1');
    expect(result.trustLevel).toBe('L4');
    expect(result.freshness.ok).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.sideEffects).toEqual([]);
    expect(result.nextAction).toMatchObject({
      owner: 'maintainer',
      requiresReleaseStageAuthorization: true,
    });
    expect(validateContract('releaseVerdict', result)).toMatchObject({ ok: true });
  });

  it('returns not-releasable with actionable blocker when a required check fails', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(fixture(fixtures, 'failedCheck'));

    expect(result.verdict).toBe('not-releasable');
    expect(result.riskLevel).toBe('high');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'plugin-validate',
        remediation: expect.stringContaining('claude plugin validate'),
        requiresDryRunRerun: true,
      }),
    ]));
    expect(result.nextAction.summary).toContain('plugin-validate');
  });

  it('blocks stale release evidence from supporting release-ready', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(fixture(fixtures, 'staleEvidence'));

    expect(result.verdict).toBe('not-releasable');
    expect(result.freshness.ok).toBe(false);
    expect(result.freshness.reasons).toContain('commit context mismatch');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'release-evidence-freshness',
        reason: 'commit context mismatch',
      }),
    ]));
  });

  it('turns missing required checks into missingEvidence and rerun blockers', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(fixture(fixtures, 'missingCheck'));

    expect(result.verdict).toBe('not-releasable');
    expect(result.missingEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'installed-smoke-missing',
        checkId: 'installed-smoke',
      }),
    ]));
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'installed-smoke',
        requiresDryRunRerun: true,
      }),
    ]));
  });

  it('forbids real release side effects but allows documented dry-run commands', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(fixture(fixtures, 'forbiddenSideEffect'));

    expect(detectForbiddenReleaseSideEffects([
      { executable: 'claude', argv: ['plugin', 'tag', '--dry-run'] },
      { executable: 'claude', argv: ['plugin', 'validate', './plugins/curdx-flow'] },
      { executable: 'npm', argv: ['run', 'check-versions'] },
      { executable: 'git', argv: ['tag', '--list', 'curdx-flow--v*'] },
    ])).toEqual([]);

    expect(result.verdict).toBe('not-releasable');
    expect(result.sideEffects.map((entry) => entry.kind)).toEqual([
      'claude-plugin-tag-push',
      'npm-publish',
    ]);
    expect(result.riskLevel).toBe('critical');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'claude-plugin-tag-push',
        remediation: expect.stringContaining('dry-run'),
      }),
    ]));
  });

  it('renders a one-glance report summary that cannot be confused with a completed release', async () => {
    const fixtures = await loadFixtures();
    const readySummary = renderReleaseDryRunSummary(evaluate(fixture(fixtures, 'ready')));
    const blockedSummary = renderReleaseDryRunSummary(evaluate(fixture(fixtures, 'failedCheck')));

    expect(readySummary).toContain('未发布 / 可发布');
    expect(readySummary).toContain('Published: false');
    expect(readySummary).toContain('request explicit release-stage authorization');
    expect(blockedSummary).toContain('未发布 / 不可发布');
    expect(blockedSummary).toContain('Top blockers:');
  });
});
