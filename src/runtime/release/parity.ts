import type {
  EvaluateReleaseParityInput,
  ReleaseBlocker,
  ReleaseCheckResult,
  ReleaseDependencyIdentity,
  ReleaseManifestDependency,
  ReleaseMissingEvidence,
  ReleaseParityGuidance,
  ReleaseParityResult,
  ReleaseRegistryPluginPackage,
  ReleaseVerifiedSurface,
  ReleaseVersionSurfaces,
} from './types.ts';

const VERSION_BUMP_COMMAND = 'node scripts/bump-version.mjs <version|patch|minor|major>';
const externalMcpEvidenceRef = 'ev-release-external-mcp-boundary';

export function evaluateReleaseParity(input: EvaluateReleaseParityInput): ReleaseParityResult {
  const generatedAt = toIso(input.generatedAt);
  const guidance = buildGuidance();
  const verifiedSurfaces: ReleaseVerifiedSurface[] = [];
  const blockers: ReleaseBlocker[] = [];
  const missingEvidence: ReleaseMissingEvidence[] = [];

  const versionCheck = evaluateVersionParity(input.versionSurfaces, blockers, missingEvidence, verifiedSurfaces);
  const dependencyCheck = evaluateDependencyParity(input, blockers, verifiedSurfaces);
  const externalMcpCheck = evaluateExternalMcpBoundary(input, blockers, verifiedSurfaces);
  const guidanceCheck = buildGuidanceCheck(guidance, verifiedSurfaces);
  const checks = [versionCheck, dependencyCheck, externalMcpCheck, guidanceCheck];

  return {
    schemaVersion: 1,
    runId: input.runId,
    goalId: input.goalId,
    generatedAt,
    status: blockers.length === 0 ? 'passed' : 'failed',
    checks,
    blockers: dedupeBlockers(blockers),
    missingEvidence,
    verifiedSurfaces,
    guidance,
  };
}

function evaluateVersionParity(
  surfaces: ReleaseVersionSurfaces,
  blockers: ReleaseBlocker[],
  missingEvidence: ReleaseMissingEvidence[],
  verifiedSurfaces: ReleaseVerifiedSurface[],
): ReleaseCheckResult {
  const entries = [
    { id: 'package-json', path: 'package.json', version: surfaces.packageJson },
    { id: 'package-lock-root', path: 'package-lock.json', version: surfaces.packageLockRoot },
    { id: 'package-lock-package-root', path: 'package-lock.json packages[""]', version: surfaces.packageLockPackageRoot },
    { id: 'plugin-manifest', path: 'plugins/curdx-flow/.claude-plugin/plugin.json', version: surfaces.pluginManifest },
    { id: 'marketplace-entry', path: '.claude-plugin/marketplace.json plugins[curdx-flow]', version: surfaces.marketplaceEntry },
  ];
  const evidenceRef = 'ev-release-version-surfaces';
  for (const entry of entries) {
    verifiedSurfaces.push({
      id: entry.id,
      kind: 'version',
      path: entry.path,
      summary: `${entry.path}: ${entry.version ?? '(missing)'}`,
      evidenceRef,
    });
  }

  const expected = entries.find((entry) => isNonEmptyString(entry.version))?.version;
  const missing = entries.filter((entry) => !isNonEmptyString(entry.version));
  const mismatched = expected === undefined ? [] : entries.filter((entry) => entry.version !== null && entry.version !== expected);

  for (const entry of missing) {
    missingEvidence.push({
      id: `${entry.id}-version-missing`,
      checkId: 'version-parity',
      reason: `${entry.path} is missing a release version field.`,
      required: true,
    });
    blockers.push(versionBlocker(
      `${entry.path} is missing a version field.`,
      `${entry.path}: (missing), expected ${expected ?? 'a shared release version'}.`,
      [evidenceRef],
    ));
  }

  for (const entry of mismatched) {
    blockers.push(versionBlocker(
      `${entry.path} version '${entry.version}' does not match '${expected}'.`,
      `${entry.path}: ${entry.version}, expected ${expected}.`,
      [evidenceRef],
    ));
  }

  const ok = missing.length === 0 && mismatched.length === 0 && expected !== undefined;
  return {
    id: 'version-parity',
    status: ok ? 'passed' : 'failed',
    summary: ok
      ? `All release version surfaces are aligned at ${expected}.`
      : `Release version surfaces are not aligned. Use ${VERSION_BUMP_COMMAND}.`,
    required: true,
    evidenceRefs: [evidenceRef],
    remediation: `Use ${VERSION_BUMP_COMMAND}, then rerun npm run check-versions and release parity tests.`,
    riskLevel: ok ? 'medium' : 'high',
  };
}

function evaluateDependencyParity(
  input: EvaluateReleaseParityInput,
  blockers: ReleaseBlocker[],
  verifiedSurfaces: ReleaseVerifiedSurface[],
): ReleaseCheckResult {
  const evidenceRef = 'ev-release-plugin-dependency-parity';
  const manifestByName = new Map(input.manifestDependencies.map((dependency) => [dependency.name, dependency]));
  const registryById = new Map(input.registryPluginPackages.map((pkg) => [pkg.id, pkg]));
  const expectedNames = new Set(input.expectedPluginDependencies.map((dependency) => dependency.name));
  const expectedMarketplaces = new Set(input.expectedPluginDependencies.map((dependency) => dependency.marketplace));

  for (const expected of input.expectedPluginDependencies) {
    verifiedSurfaces.push({
      id: expected.id,
      kind: 'plugin-dependency',
      path: `plugins/curdx-flow/.claude-plugin/plugin.json dependencies[${expected.name}]`,
      summary: `${expected.pluginId}`,
      evidenceRef,
    });

    const manifest = manifestByName.get(expected.name);
    if (manifest === undefined) {
      blockers.push(dependencyBlocker(expected, `Plugin manifest is missing dependency '${expected.name}'.`, [evidenceRef]));
      continue;
    }
    if (manifest.marketplace !== expected.marketplace) {
      blockers.push(dependencyBlocker(
        expected,
        `Plugin manifest dependency '${expected.name}' marketplace '${manifest.marketplace ?? '(missing)'}' does not match '${expected.marketplace}'.`,
        [evidenceRef],
      ));
    }

    if (!input.marketplaceAllowlist.includes(expected.marketplace)) {
      blockers.push(dependencyBlocker(
        expected,
        `Marketplace allowlist is missing '${expected.marketplace}' for dependency '${expected.name}'.`,
        [evidenceRef],
      ));
    }

    const registry = registryById.get(expected.id);
    if (registry === undefined) {
      blockers.push(dependencyBlocker(expected, `Registry package '${expected.id}' is missing.`, [evidenceRef]));
      continue;
    }
    if (registry.type !== 'plugin') {
      blockers.push(dependencyBlocker(expected, `Registry package '${expected.id}' is type '${registry.type}', expected 'plugin'.`, [evidenceRef]));
    }
    if (registry.required !== true) {
      blockers.push(dependencyBlocker(expected, `Registry package '${expected.id}' is not marked required.`, [evidenceRef]));
    }
    if (!registry.marketplaces?.includes(expected.marketplace)) {
      blockers.push(dependencyBlocker(
        expected,
        `Registry package '${expected.id}' does not include marketplace '${expected.marketplace}'.`,
        [evidenceRef],
      ));
    }
  }

  for (const manifestDependency of input.manifestDependencies) {
    if (!expectedNames.has(manifestDependency.name)) {
      blockers.push({
        checkId: 'plugin-dependency-parity',
        reason: `Unexpected plugin manifest dependency '${manifestDependency.name}' is not in the canonical curdx dependency set.`,
        remediation: 'Remove the dependency or add it to CURDX_PLUGIN_DEPENDENCIES, registry packages, runner tests, and marketplace allowlist together.',
        requiresDryRunRerun: true,
        riskLevel: 'high',
        evidenceRefs: [evidenceRef],
      });
    }
  }

  for (const allowlistedMarketplace of input.marketplaceAllowlist) {
    if (!expectedMarketplaces.has(allowlistedMarketplace)) {
      blockers.push({
        checkId: 'plugin-dependency-parity',
        reason: `Marketplace allowlist contains unexpected marketplace '${allowlistedMarketplace}'.`,
        remediation: 'Remove unneeded cross-marketplace trust or add the dependency to the canonical spec, registry packages, and runner tests together.',
        requiresDryRunRerun: true,
        riskLevel: 'high',
        evidenceRefs: [evidenceRef],
      });
    }
  }

  const failed = blockers.some((blocker) => blocker.checkId === 'plugin-dependency-parity');
  return {
    id: 'plugin-dependency-parity',
    status: failed ? 'failed' : 'passed',
    summary: failed
      ? 'Plugin dependency manifest, registry, or marketplace allowlist drift detected.'
      : 'Plugin dependencies match manifest, registry packages, and marketplace allowlist.',
    required: true,
    evidenceRefs: [evidenceRef],
    remediation: 'Align plugin manifest dependencies, CURDX_PLUGIN_DEPENDENCIES, registry plugin packages, runner tests, and marketplace allowlist.',
    riskLevel: failed ? 'high' : 'medium',
  };
}

function evaluateExternalMcpBoundary(
  input: EvaluateReleaseParityInput,
  blockers: ReleaseBlocker[],
  verifiedSurfaces: ReleaseVerifiedSurface[],
): ReleaseCheckResult {
  const dependencyNames = new Set([
    ...input.manifestDependencies.map((dependency) => dependency.name),
    ...(input.marketplacePluginDependencies ?? []).map((dependency) => dependency.name),
  ]);

  for (const mcp of input.externalMcps) {
    verifiedSurfaces.push({
      id: mcp.id,
      kind: 'external-mcp',
      path: 'src/registry/capabilities.ts CURDX_EXTERNAL_MCPS',
      summary: `${mcp.id} is expected external MCP readiness, not plugin dependency resolution.`,
      evidenceRef: externalMcpEvidenceRef,
    });

    if (dependencyNames.has(mcp.id)) {
      blockers.push({
        checkId: 'external-mcp-boundary',
        reason: `External MCP '${mcp.id}' is incorrectly modeled as a plugin dependency.`,
        remediation: `Remove '${mcp.id}' from plugin dependency metadata and keep it in external MCP readiness checks.`,
        requiresDryRunRerun: true,
        riskLevel: 'high',
        evidenceRefs: [externalMcpEvidenceRef],
      });
    }
    if (mcp.provisioning !== undefined && mcp.provisioning !== 'external-mcp') {
      blockers.push({
        checkId: 'external-mcp-boundary',
        reason: `External MCP '${mcp.id}' provisioning is '${mcp.provisioning}', expected 'external-mcp'.`,
        remediation: 'Keep external MCPs out of plugin dependency auto-resolution.',
        requiresDryRunRerun: true,
        riskLevel: 'high',
        evidenceRefs: [externalMcpEvidenceRef],
      });
    }
  }

  const failed = blockers.some((blocker) => blocker.checkId === 'external-mcp-boundary');
  return {
    id: 'external-mcp-boundary',
    status: failed ? 'failed' : 'passed',
    summary: failed
      ? 'External MCP boundary drift detected.'
      : 'context7 and sequential-thinking remain external MCP readiness capabilities, not plugin dependencies.',
    required: true,
    evidenceRefs: [externalMcpEvidenceRef],
    remediation: 'Keep context7 and sequential-thinking in external MCP readiness, not plugin dependency metadata.',
    riskLevel: failed ? 'high' : 'medium',
  };
}

function buildGuidanceCheck(
  guidance: ReleaseParityGuidance,
  verifiedSurfaces: ReleaseVerifiedSurface[],
): ReleaseCheckResult {
  const evidenceRef = 'ev-release-version-guidance';
  verifiedSurfaces.push({
    id: 'version-bump-guidance',
    kind: 'guidance',
    path: 'scripts/bump-version.mjs',
    summary: guidance.summary,
    evidenceRef,
  });
  return {
    id: 'version-bump-guidance',
    status: 'passed',
    summary: guidance.summary,
    required: true,
    evidenceRefs: [evidenceRef],
    remediation: guidance.versionBumpCommand,
    riskLevel: 'medium',
  };
}

function buildGuidance(): ReleaseParityGuidance {
  return {
    versionBumpCommand: VERSION_BUMP_COMMAND,
    summary: `Use ${VERSION_BUMP_COMMAND}; do not manually edit release version surfaces.`,
  };
}

function versionBlocker(reason: string, detail: string, evidenceRefs: string[]): ReleaseBlocker {
  return {
    checkId: 'version-parity',
    reason: `${reason} ${detail}`,
    remediation: `Use ${VERSION_BUMP_COMMAND}, then rerun npm run check-versions and release parity tests.`,
    requiresDryRunRerun: true,
    riskLevel: 'high',
    evidenceRefs,
  };
}

function dependencyBlocker(
  expected: ReleaseDependencyIdentity,
  reason: string,
  evidenceRefs: string[],
): ReleaseBlocker {
  return {
    checkId: 'plugin-dependency-parity',
    reason,
    remediation: `Restore dependency identity to ${expected.pluginId} and rerun npm run test:runner plus release parity tests.`,
    requiresDryRunRerun: true,
    riskLevel: 'high',
    evidenceRefs,
  };
}

function dedupeBlockers(blockers: ReleaseBlocker[]): ReleaseBlocker[] {
  const seen = new Set<string>();
  return blockers.filter((blocker) => {
    const key = `${blocker.checkId}:${blocker.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toIso(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
