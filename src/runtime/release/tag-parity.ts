import { detectForbiddenReleaseSideEffects } from './dry-run.ts';
import type {
  EvaluateReleaseTagParityInput,
  ReleaseBlocker,
  ReleaseCheckResult,
  ReleaseMissingEvidence,
  ReleaseSideEffectRecord,
  ReleaseTagIdentity,
  ReleaseTagParityGuidance,
  ReleaseTagParityResult,
  ReleaseTagParityState,
  ReleaseTagParityStatus,
  ReleaseVerifiedSurface,
} from './types.ts';

const defaultPluginName = 'curdx-flow';
const identityEvidenceRef = 'ev-release-tag-identity';
const remoteEvidenceRef = 'ev-release-remote-tag-parity';
const sideEffectEvidenceRef = 'ev-release-tag-dry-run-side-effects';

export function evaluateReleaseTagParity(input: EvaluateReleaseTagParityInput): ReleaseTagParityResult {
  const generatedAt = toIso(input.generatedAt);
  const identity = buildIdentity(input);
  const readOnlyCommands = buildReadOnlyCommands(identity);
  const sideEffects = detectForbiddenReleaseSideEffects(input.plannedCommands ?? []);
  const blockers: ReleaseBlocker[] = [];
  const missingEvidence: ReleaseMissingEvidence[] = [];

  const identityCheck = evaluateTagIdentity(input, identity, blockers);
  const state = identityCheck.status === 'failed' ? 'mismatch' : tagState(input);
  const remoteCheck = evaluateRemoteTagParity(state, identity, input, blockers);
  const sideEffectCheck = evaluateNoSideEffects(sideEffects, blockers);
  const checks = [identityCheck, remoteCheck, sideEffectCheck];

  return {
    schemaVersion: 1,
    runId: input.runId,
    goalId: input.goalId,
    generatedAt,
    status: statusFor(state, blockers, sideEffects),
    state,
    identity,
    checks,
    blockers: dedupeBlockers(blockers),
    missingEvidence,
    verifiedSurfaces: buildVerifiedSurfaces(identity, input),
    guidance: buildGuidance(state, identity),
    readOnlyCommands,
    plannedCommands: input.plannedCommands ?? [],
    sideEffects,
  };
}

function buildIdentity(input: EvaluateReleaseTagParityInput): ReleaseTagIdentity {
  const pluginName = input.pluginName ?? defaultPluginName;
  return {
    version: input.version,
    pluginName,
    npmTag: input.npmTag ?? `v${input.version}`,
    claudePluginTag: input.claudePluginTag ?? `${pluginName}--v${input.version}`,
  };
}

function evaluateTagIdentity(
  input: EvaluateReleaseTagParityInput,
  identity: ReleaseTagIdentity,
  blockers: ReleaseBlocker[],
): ReleaseCheckResult {
  const expectedNpmTag = `v${input.version}`;
  const expectedPluginTag = `${identity.pluginName}--v${input.version}`;

  if (identity.npmTag !== expectedNpmTag) {
    blockers.push(blocker({
      checkId: 'tag-identity',
      reason: `Provided npm tag '${identity.npmTag}' does not match expected npm tag '${expectedNpmTag}' for version '${input.version}'.`,
      remediation: 'Use npm release tag format vX.Y.Z and rerun tag parity dry-run.',
      evidenceRefs: [identityEvidenceRef],
    }));
  }

  if (identity.claudePluginTag !== expectedPluginTag) {
    blockers.push(blocker({
      checkId: 'tag-identity',
      reason: `Provided Claude plugin tag '${identity.claudePluginTag}' does not match expected Claude plugin tag '${expectedPluginTag}'.`,
      remediation: 'Use Claude plugin dependency tag format {plugin-name}--v{version}; do not reuse the npm tag.',
      evidenceRefs: [identityEvidenceRef],
    }));
  }

  const failed = blockers.some((item) => item.checkId === 'tag-identity');
  return {
    id: 'tag-identity',
    status: failed ? 'failed' : 'passed',
    summary: failed
      ? 'Release tag identities are not aligned with the current version.'
      : `Release tag identities are npm=${identity.npmTag}, Claude plugin=${identity.claudePluginTag}.`,
    required: true,
    evidenceRefs: [identityEvidenceRef],
    remediation: 'Use vX.Y.Z for npm and {plugin-name}--v{version} for Claude plugin releases.',
    riskLevel: failed ? 'high' : 'medium',
  };
}

function evaluateRemoteTagParity(
  state: ReleaseTagParityState,
  identity: ReleaseTagIdentity,
  input: EvaluateReleaseTagParityInput,
  blockers: ReleaseBlocker[],
): ReleaseCheckResult {
  const evidenceRefs = uniqueRefs([
    remoteEvidenceRef,
    ...(input.remoteTags.npm.evidenceRefs ?? []),
    ...(input.remoteTags.claudePlugin.evidenceRefs ?? []),
  ]);

  if (state === 'npm-only') {
    blockers.push(blocker({
      checkId: 'remote-tag-parity',
      reason: `Remote npm release tag exists but Claude plugin tag is missing: ${identity.npmTag} exists, ${identity.claudePluginTag} is missing.`,
      remediation: 'Stop release recovery and reconcile the partial npm surface before any plugin release action.',
      evidenceRefs,
    }));
  }

  if (state === 'plugin-only') {
    blockers.push(blocker({
      checkId: 'remote-tag-parity',
      reason: `Remote Claude plugin tag exists but npm release tag is missing: ${identity.claudePluginTag} exists, ${identity.npmTag} is missing.`,
      remediation: 'Stop release recovery and reconcile the partial Claude plugin surface before any npm release action.',
      evidenceRefs,
    }));
  }

  const failed = state === 'npm-only' || state === 'plugin-only' || state === 'mismatch';
  return {
    id: 'remote-tag-parity',
    status: failed ? 'failed' : 'passed',
    summary: summaryForState(state, identity),
    required: true,
    evidenceRefs,
    remediation: 'Keep npm and Claude plugin release tags paired; do not ignore partial tag state.',
    riskLevel: failed ? 'high' : 'medium',
  };
}

function evaluateNoSideEffects(
  sideEffects: ReleaseSideEffectRecord[],
  blockers: ReleaseBlocker[],
): ReleaseCheckResult {
  for (const sideEffect of sideEffects) {
    blockers.push({
      checkId: sideEffect.kind,
      reason: `Tag parity dry-run planned forbidden release side effect: ${sideEffect.command}`,
      remediation: 'Replace release side-effect commands with read-only tag status queries.',
      requiresDryRunRerun: true,
      riskLevel: 'critical',
      evidenceRefs: [sideEffectEvidenceRef],
    });
  }

  return {
    id: 'dry-run-no-release-side-effects',
    status: sideEffects.length === 0 ? 'passed' : 'failed',
    summary: sideEffects.length === 0
      ? 'Tag parity dry-run only used read-only evidence commands.'
      : 'Tag parity dry-run included forbidden release side effects.',
    required: true,
    evidenceRefs: [sideEffectEvidenceRef],
    remediation: 'Use only read-only git ls-remote tag queries during tag parity dry-run.',
    riskLevel: sideEffects.length === 0 ? 'medium' : 'critical',
  };
}

function tagState(input: EvaluateReleaseTagParityInput): ReleaseTagParityState {
  const npmExists = input.remoteTags.npm.exists === true;
  const pluginExists = input.remoteTags.claudePlugin.exists === true;
  if (npmExists && pluginExists) return 'both';
  if (npmExists) return 'npm-only';
  if (pluginExists) return 'plugin-only';
  return 'none';
}

function statusFor(
  state: ReleaseTagParityState,
  blockers: ReleaseBlocker[],
  sideEffects: ReleaseSideEffectRecord[],
): ReleaseTagParityStatus {
  if (state === 'mismatch' || sideEffects.length > 0) return 'failed';
  if (state === 'npm-only' || state === 'plugin-only') return 'incomplete';
  return blockers.length === 0 ? 'passed' : 'failed';
}

function buildVerifiedSurfaces(
  identity: ReleaseTagIdentity,
  input: EvaluateReleaseTagParityInput,
): ReleaseVerifiedSurface[] {
  return [
    {
      id: 'npm-tag',
      kind: 'npm-tag',
      path: 'origin refs/tags',
      summary: `${identity.npmTag}: ${input.remoteTags.npm.exists ? 'present' : 'missing'}`,
      evidenceRef: input.remoteTags.npm.evidenceRefs?.[0] ?? remoteEvidenceRef,
    },
    {
      id: 'claude-plugin-tag',
      kind: 'claude-plugin-tag',
      path: 'origin refs/tags',
      summary: `${identity.claudePluginTag}: ${input.remoteTags.claudePlugin.exists ? 'present' : 'missing'}`,
      evidenceRef: input.remoteTags.claudePlugin.evidenceRefs?.[0] ?? remoteEvidenceRef,
    },
    {
      id: input.remoteTags.npm.tag,
      kind: 'remote-tag',
      path: 'git ls-remote --tags origin',
      summary: input.remoteTags.npm.summary ?? input.remoteTags.npm.tag,
      evidenceRef: input.remoteTags.npm.evidenceRefs?.[0] ?? remoteEvidenceRef,
    },
    {
      id: input.remoteTags.claudePlugin.tag,
      kind: 'remote-tag',
      path: 'git ls-remote --tags origin',
      summary: input.remoteTags.claudePlugin.summary ?? input.remoteTags.claudePlugin.tag,
      evidenceRef: input.remoteTags.claudePlugin.evidenceRefs?.[0] ?? remoteEvidenceRef,
    },
  ];
}

function buildGuidance(state: ReleaseTagParityState, identity: ReleaseTagIdentity): ReleaseTagParityGuidance {
  return {
    summary: summaryForState(state, identity),
    safeRecoverySteps: recoveryStepsForState(state, identity),
    dependencyResolutionNote: `Claude plugin dependencies resolve versions from {plugin-name}--v{version} tags; for ${identity.pluginName}, current readiness tag is ${identity.claudePluginTag}. The npm tag ${identity.npmTag} does not satisfy Claude plugin dependency resolution.`,
  };
}

function buildReadOnlyCommands(identity: ReleaseTagIdentity): string[] {
  return [
    `git ls-remote --tags origin "${identity.npmTag}"`,
    `git ls-remote --tags origin "${identity.claudePluginTag}"`,
  ];
}

function summaryForState(state: ReleaseTagParityState, identity: ReleaseTagIdentity): string {
  if (state === 'none') {
    return `Neither release tag exists yet for ${identity.version}; both npm and Claude plugin surfaces are unclaimed.`;
  }
  if (state === 'both') {
    return `Both release tags exist for ${identity.version}: ${identity.npmTag} and ${identity.claudePluginTag}.`;
  }
  if (state === 'npm-only') {
    return `Incomplete release: npm tag ${identity.npmTag} exists but Claude plugin tag ${identity.claudePluginTag} is missing.`;
  }
  if (state === 'plugin-only') {
    return `Incomplete release: Claude plugin tag ${identity.claudePluginTag} exists but npm tag ${identity.npmTag} is missing.`;
  }
  return `Release tag identity mismatch for ${identity.version}.`;
}

function recoveryStepsForState(state: ReleaseTagParityState, identity: ReleaseTagIdentity): string[] {
  if (state === 'none') {
    return [
      'Do not create either tag until release gate passes and release-stage authorization is present.',
      `When authorized, publish paired surfaces for ${identity.npmTag} and ${identity.claudePluginTag} as one release operation.`,
    ];
  }
  if (state === 'both') {
    return [
      'Treat the version as already paired on remote tags before attempting another release.',
      'Verify package/plugin availability from a clean environment instead of creating duplicate tags.',
    ];
  }
  if (state === 'npm-only') {
    return [
      'Stop and inspect npm/GitHub release state before any plugin tag action.',
      `Do not ignore the missing ${identity.claudePluginTag}; prepare an explicit partial-release recovery plan.`,
    ];
  }
  if (state === 'plugin-only') {
    return [
      'Stop and inspect Claude plugin marketplace/dependency state before any npm release action.',
      `Do not ignore the missing ${identity.npmTag}; prepare an explicit partial-release recovery plan.`,
    ];
  }
  return [
    'Regenerate release evidence from the current version and expected tag names.',
    'Do not proceed until npm and Claude plugin tag identities match the same version.',
  ];
}

function blocker(input: {
  checkId: string;
  reason: string;
  remediation: string;
  evidenceRefs: string[];
}): ReleaseBlocker {
  return {
    checkId: input.checkId,
    reason: input.reason,
    remediation: input.remediation,
    requiresDryRunRerun: true,
    riskLevel: 'high',
    evidenceRefs: input.evidenceRefs,
  };
}

function dedupeBlockers(blockers: ReleaseBlocker[]): ReleaseBlocker[] {
  const seen = new Set<string>();
  return blockers.filter((item) => {
    const key = `${item.checkId}:${item.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueRefs(refs: string[]): string[] {
  return [...new Set(refs.filter((ref) => ref.length > 0))];
}

function toIso(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}
