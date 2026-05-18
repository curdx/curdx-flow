import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  evaluateReleaseDryRun,
  evaluateReleaseTagParity,
  type EvaluateReleaseTagParityInput,
  type ReleaseTagParityResult,
} from '../../../src/runtime/release/index.ts';

const now = '2026-05-17T22:30:00.000Z';
const fixturePath = 'tests/fixtures/release-candidate/tag-parity-fixtures.json';

interface TagParityFixtureFile {
  base: EvaluateReleaseTagParityInput;
  [id: string]: unknown;
}

interface TagParityScenario {
  patch?: Partial<EvaluateReleaseTagParityInput>;
}

async function loadFixtures(): Promise<TagParityFixtureFile> {
  return JSON.parse(await readFile(fixturePath, 'utf8')) as TagParityFixtureFile;
}

function scenario(fixtures: TagParityFixtureFile, id: string): EvaluateReleaseTagParityInput {
  const entry = fixtures[id] as TagParityScenario | undefined;
  if (entry === undefined) throw new Error(`missing tag parity fixture: ${id}`);
  return mergeInput(fixtures.base, entry.patch ?? {});
}

function mergeInput(
  base: EvaluateReleaseTagParityInput,
  patch: Partial<EvaluateReleaseTagParityInput>,
): EvaluateReleaseTagParityInput {
  const copy = structuredClone(base);
  return {
    ...copy,
    ...patch,
    remoteTags: {
      ...copy.remoteTags,
      ...(patch.remoteTags ?? {}),
    },
  };
}

function evaluate(input: EvaluateReleaseTagParityInput): ReleaseTagParityResult {
  return evaluateReleaseTagParity({
    ...input,
    generatedAt: now,
  });
}

function dryRunFromTagParity(result: ReleaseTagParityResult) {
  return evaluateReleaseDryRun({
    runId: result.runId,
    goalId: result.goalId,
    version: result.identity.version,
    npmTag: result.identity.npmTag,
    claudePluginTag: result.identity.claudePluginTag,
    checks: result.checks,
    requiredCheckIds: result.checks.filter((check) => check.required !== false).map((check) => check.id),
    plannedCommands: result.plannedCommands,
    freshness: {
      currentCommit: 'abc123',
      evidenceCommit: 'abc123',
      evidenceVersion: result.identity.version,
      evidenceNpmTag: result.identity.npmTag,
      evidenceClaudePluginTag: result.identity.claudePluginTag,
      evidenceRefs: result.checks.flatMap((check) => check.evidenceRefs ?? []),
    },
    generatedAt: now,
    now,
  });
}

describe('release npm and Claude plugin tag parity', () => {
  it('passes and reports read-only commands when neither remote tag exists yet', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(fixtures.base);

    expect(result.status).toBe('passed');
    expect(result.state).toBe('none');
    expect(result.identity).toEqual({
      version: '7.2.1',
      pluginName: 'curdx-flow',
      npmTag: 'v7.2.1',
      claudePluginTag: 'curdx-flow--v7.2.1',
    });
    expect(result.readOnlyCommands).toEqual([
      'git ls-remote --tags origin "v7.2.1"',
      'git ls-remote --tags origin "curdx-flow--v7.2.1"',
    ]);
    expect(result.guidance.dependencyResolutionNote).toContain('{plugin-name}--v{version}');
    expect(result.verifiedSurfaces).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'npm-tag', kind: 'npm-tag' }),
      expect.objectContaining({ id: 'claude-plugin-tag', kind: 'claude-plugin-tag' }),
    ]));
    expect(dryRunFromTagParity(result).verdict).toBe('release-ready');
  });

  it('marks release incomplete when only the npm tag exists remotely', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'npmOnly'));

    expect(result.status).toBe('incomplete');
    expect(result.state).toBe('npm-only');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'remote-tag-parity',
        reason: expect.stringContaining('npm release tag exists but Claude plugin tag is missing'),
      }),
    ]));
    expect(dryRunFromTagParity(result).verdict).toBe('not-releasable');
  });

  it('marks release incomplete when only the Claude plugin tag exists remotely', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'pluginOnly'));

    expect(result.status).toBe('incomplete');
    expect(result.state).toBe('plugin-only');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'remote-tag-parity',
        reason: expect.stringContaining('Claude plugin tag exists but npm release tag is missing'),
      }),
    ]));
  });

  it('passes when both npm and Claude plugin tags exist for the same version', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'bothTags'));

    expect(result.status).toBe('passed');
    expect(result.state).toBe('both');
    expect(result.blockers).toEqual([]);
  });

  it('blocks release when provided tag identities do not match the version', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'tagMismatch'));

    expect(result.status).toBe('failed');
    expect(result.state).toBe('mismatch');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'tag-identity',
        reason: expect.stringContaining('does not match expected npm tag'),
      }),
      expect.objectContaining({
        checkId: 'tag-identity',
        reason: expect.stringContaining('does not match expected Claude plugin tag'),
      }),
    ]));
    expect(dryRunFromTagParity(result).verdict).toBe('not-releasable');
  });

  it('blocks forbidden dry-run side effects such as local tag creation or plugin tag push', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'forbiddenSideEffects'));

    expect(result.status).toBe('failed');
    expect(result.sideEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'git-tag' }),
      expect.objectContaining({ kind: 'claude-plugin-tag-push' }),
    ]));
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkId: 'git-tag' }),
      expect.objectContaining({ checkId: 'claude-plugin-tag-push' }),
    ]));
    expect(dryRunFromTagParity(result).verdict).toBe('not-releasable');
  });
});
