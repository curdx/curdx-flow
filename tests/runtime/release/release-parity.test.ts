import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  CURDX_EXTERNAL_MCPS,
  CURDX_PLUGIN_DEPENDENCIES,
  CURDX_TOOL_CAPABILITIES,
} from '../../../src/registry/capabilities.ts';
import { PKGS } from '../../../src/registry/index.ts';
import {
  evaluateReleaseDryRun,
  evaluateReleaseParity,
  type EvaluateReleaseParityInput,
  type ReleaseParityResult,
} from '../../../src/runtime/release/index.ts';

const now = '2026-05-17T21:00:00.000Z';
const fixturePath = 'tests/fixtures/release-candidate/release-parity-fixtures.json';

interface ParityFixtureFile {
  base: EvaluateReleaseParityInput;
  [id: string]: unknown;
}

interface ScenarioPatch {
  patch?: Partial<EvaluateReleaseParityInput>;
  expected?: {
    checkId?: string;
    reasonIncludes?: string;
  };
}

async function loadFixtures(): Promise<ParityFixtureFile> {
  return JSON.parse(await readFile(fixturePath, 'utf8')) as ParityFixtureFile;
}

function scenario(fixtures: ParityFixtureFile, id: string): EvaluateReleaseParityInput {
  const entry = fixtures[id] as ScenarioPatch | undefined;
  if (entry === undefined) throw new Error(`missing release parity fixture: ${id}`);
  return mergeInput(fixtures.base, entry.patch ?? {});
}

function mergeInput(
  base: EvaluateReleaseParityInput,
  patch: Partial<EvaluateReleaseParityInput>,
): EvaluateReleaseParityInput {
  const copy = structuredClone(base);
  return {
    ...copy,
    ...patch,
    versionSurfaces: {
      ...copy.versionSurfaces,
      ...(patch.versionSurfaces ?? {}),
    },
  };
}

function evaluate(input: EvaluateReleaseParityInput): ReleaseParityResult {
  return evaluateReleaseParity({
    ...input,
    generatedAt: now,
  });
}

function dryRunFromParity(result: ReleaseParityResult, version = '7.2.1') {
  return evaluateReleaseDryRun({
    runId: result.runId,
    goalId: result.goalId,
    version,
    checks: result.checks,
    requiredCheckIds: result.checks.map((check) => check.id),
    freshness: {
      currentCommit: 'abc123',
      evidenceCommit: 'abc123',
      evidenceVersion: version,
      evidenceNpmTag: `v${version}`,
      evidenceClaudePluginTag: `curdx-flow--v${version}`,
      evidenceRefs: result.checks.flatMap((check) => check.evidenceRefs ?? []),
    },
    generatedAt: now,
    now,
  });
}

describe('release parity checks', () => {
  it('passes with aligned version, plugin dependencies, marketplace allowlist, and external MCP boundary', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(fixtures.base);

    expect(result.status).toBe('passed');
    expect(result.checks.map((check) => [check.id, check.status])).toEqual([
      ['version-parity', 'passed'],
      ['plugin-dependency-parity', 'passed'],
      ['external-mcp-boundary', 'passed'],
      ['version-bump-guidance', 'passed'],
    ]);
    expect(result.verifiedSurfaces).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'package-json', kind: 'version' }),
      expect.objectContaining({ id: 'pua', kind: 'plugin-dependency' }),
      expect.objectContaining({ id: 'context7', kind: 'external-mcp' }),
    ]));
    expect(result.guidance.versionBumpCommand).toBe('node scripts/bump-version.mjs <version|patch|minor|major>');
    expect(dryRunFromParity(result).verdict).toBe('release-ready');
  });

  it('blocks release when version surfaces drift and points to the version bump script', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'versionMismatch'));

    expect(result.status).toBe('failed');
    expect(result.checks.find((check) => check.id === 'version-parity')?.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'version-parity',
        reason: expect.stringContaining('plugins/curdx-flow/.claude-plugin/plugin.json'),
        remediation: expect.stringContaining('node scripts/bump-version.mjs'),
      }),
    ]));
    expect(dryRunFromParity(result).verdict).toBe('not-releasable');
  });

  it('blocks release when manifest dependency marketplace identity drifts', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'dependencyDrift'));

    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'plugin-dependency-parity',
        reason: expect.stringContaining('wrong-marketplace'),
      }),
    ]));
  });

  it('blocks release when marketplace allowlist omits a dependency marketplace', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'allowlistMissing'));

    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'plugin-dependency-parity',
        reason: expect.stringContaining("Marketplace allowlist is missing 'pua-skills'"),
      }),
    ]));
  });

  it('blocks release when marketplace allowlist grants unexpected cross-marketplace trust', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'allowlistExtra'));

    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'plugin-dependency-parity',
        reason: expect.stringContaining("unexpected marketplace 'unknown-marketplace'"),
      }),
    ]));
  });

  it('blocks release when an external MCP is modeled as a plugin dependency', async () => {
    const fixtures = await loadFixtures();
    const result = evaluate(scenario(fixtures, 'externalMcpModeledAsPluginDependency'));

    expect(result.status).toBe('failed');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checkId: 'external-mcp-boundary',
        reason: expect.stringContaining('context7'),
      }),
    ]));
    expect(result.checks.find((check) => check.id === 'external-mcp-boundary')?.summary).toContain('External MCP boundary drift');
  });

  it('passes against the actual repository dependency registry inputs used by runner tests', async () => {
    const [packageJson, packageLock, pluginManifest, marketplace] = await Promise.all([
      readJsonFile<{ version?: string }>('package.json'),
      readJsonFile<{ version?: string; packages?: Record<string, { version?: string } | undefined> }>('package-lock.json'),
      readJsonFile<{ version?: string; dependencies?: Array<{ name: string; marketplace?: string }> }>('plugins/curdx-flow/.claude-plugin/plugin.json'),
      readJsonFile<{ plugins?: Array<{ name?: string; version?: string }>; allowCrossMarketplaceDependenciesOn?: string[] }>('.claude-plugin/marketplace.json'),
    ]);
    const marketplaceEntry = marketplace.plugins?.find((entry) => entry.name === 'curdx-flow');
    const result = evaluateReleaseParity({
      runId: 'run-actual-repo-parity',
      goalId: 'goal-release',
      versionSurfaces: {
        packageJson: packageJson.version ?? null,
        packageLockRoot: packageLock.version ?? null,
        packageLockPackageRoot: packageLock.packages?.['']?.version ?? null,
        pluginManifest: pluginManifest.version ?? null,
        marketplaceEntry: marketplaceEntry?.version ?? null,
      },
      expectedPluginDependencies: CURDX_PLUGIN_DEPENDENCIES.map((dependency) => ({
        id: dependency.id,
        name: dependency.name,
        marketplace: dependency.marketplace,
        pluginId: dependency.pluginId,
      })),
      manifestDependencies: pluginManifest.dependencies ?? [],
      marketplaceAllowlist: marketplace.allowCrossMarketplaceDependenciesOn ?? [],
      registryPluginPackages: PKGS
        .filter((pkg) => pkg.type === 'plugin' && pkg.id !== 'curdx-flow')
        .map((pkg) => ({
          id: pkg.id,
          type: pkg.type,
          required: pkg.required,
          marketplaces: pkg.marketplaces?.() ?? [],
        })),
      externalMcps: CURDX_EXTERNAL_MCPS.map((mcp) => ({
        id: mcp.id,
        provisioning: CURDX_TOOL_CAPABILITIES[mcp.id].provisioning,
      })),
      generatedAt: now,
    });

    expect(result.status).toBe('passed');
  });
});

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}
