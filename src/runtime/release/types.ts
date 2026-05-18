import type { ReleaseVerdict } from '../contracts/index.ts';

export type ReleaseVerdictStatus = 'release-ready' | 'not-releasable';

export type ReleaseCheckStatus =
  | 'passed'
  | 'failed'
  | 'missing'
  | 'stale'
  | 'skipped'
  | 'blocked'
  | 'manual-confirmation-required';

export type ReleaseRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type ReleaseTrustLevel = 'L4' | 'release';

export type ReleasePublicationState = 'not-published';

export type ReleaseSideEffectKind =
  | 'git-push'
  | 'git-tag'
  | 'npm-publish'
  | 'claude-plugin-tag-push'
  | 'plugin-release';

export interface ReleaseCommand extends Record<string, unknown> {
  executable: string;
  argv: string[];
  cwd?: string;
}

export interface ReleaseCheckResult extends Record<string, unknown> {
  id: string;
  status: ReleaseCheckStatus;
  summary: string;
  required?: boolean;
  evidenceRefs?: string[];
  command?: ReleaseCommand;
  remediation?: string;
  riskLevel?: ReleaseRiskLevel;
}

export interface ReleaseMissingEvidence extends Record<string, unknown> {
  id: string;
  checkId?: string;
  reason: string;
  required: true;
}

export interface ReleaseBlocker extends Record<string, unknown> {
  checkId: string;
  reason: string;
  remediation: string;
  requiresDryRunRerun: boolean;
  riskLevel: ReleaseRiskLevel;
  evidenceRefs: string[];
}

export interface ReleaseNextAction extends Record<string, unknown> {
  owner: 'agent' | 'maintainer' | 'external-system';
  summary: string;
  commands?: string[];
  requiresReleaseStageAuthorization?: boolean;
}

export interface ReleaseFreshnessContext extends Record<string, unknown> {
  currentCommit: string;
  version: string;
  npmTag: string;
  claudePluginTag: string;
  generatedAt: string;
  evidenceRefs: string[];
  evidenceCommit?: string;
  evidenceVersion?: string;
  evidenceNpmTag?: string;
  evidenceClaudePluginTag?: string;
  expiresAt?: string;
  stale?: boolean;
}

export interface ReleaseFreshnessResult extends Record<string, unknown> {
  ok: boolean;
  reasons: string[];
  context: ReleaseFreshnessContext;
}

export interface ReleaseSideEffectRecord extends Record<string, unknown> {
  kind: ReleaseSideEffectKind;
  command: string;
  blocked: true;
  reason: string;
}

export interface ReleaseDryRunSummary extends Record<string, unknown> {
  headline: string;
  publicationState: ReleasePublicationState;
  statusLabel: '可发布' | '不可发布';
  dryRunOnly: true;
}

export interface ReleaseDryRunVerdict extends ReleaseVerdict {
  verdict: ReleaseVerdictStatus;
  runId: string;
  goalId: string;
  generatedAt: string;
  version: string;
  npmTag: string;
  claudePluginTag: string;
  checks: ReleaseCheckResult[];
  missingEvidence: ReleaseMissingEvidence[];
  blockers: ReleaseBlocker[];
  nextAction: ReleaseNextAction;
  riskLevel: ReleaseRiskLevel;
  trustLevel: ReleaseTrustLevel;
  freshness: ReleaseFreshnessResult;
  sideEffects: ReleaseSideEffectRecord[];
  published: false;
  publicationState: ReleasePublicationState;
  summary: ReleaseDryRunSummary;
}

export interface EvaluateReleaseDryRunInput {
  runId: string;
  goalId: string;
  version: string;
  npmTag?: string;
  claudePluginTag?: string;
  checks: ReleaseCheckResult[];
  requiredCheckIds?: string[];
  freshness: Omit<ReleaseFreshnessContext, 'version' | 'npmTag' | 'claudePluginTag' | 'generatedAt' | 'evidenceRefs'> & Partial<ReleaseFreshnessContext>;
  plannedCommands?: ReleaseCommand[];
  generatedAt?: Date | string;
  now?: Date | string;
  trustLevel?: ReleaseTrustLevel;
}

export interface ReleaseVersionSurfaces extends Record<string, unknown> {
  packageJson: string | null;
  packageLockRoot: string | null;
  packageLockPackageRoot: string | null;
  pluginManifest: string | null;
  marketplaceEntry: string | null;
}

export interface ReleaseDependencyIdentity extends Record<string, unknown> {
  id: string;
  name: string;
  marketplace: string;
  pluginId: string;
}

export interface ReleaseManifestDependency extends Record<string, unknown> {
  name: string;
  marketplace?: string;
}

export interface ReleaseRegistryPluginPackage extends Record<string, unknown> {
  id: string;
  type: 'plugin' | 'mcp' | 'workflow' | string;
  required?: boolean;
  marketplaces?: string[];
}

export interface ReleaseExternalMcpIdentity extends Record<string, unknown> {
  id: string;
  provisioning?: string;
}

export interface ReleaseVerifiedSurface extends Record<string, unknown> {
  id: string;
  kind:
    | 'version'
    | 'plugin-dependency'
    | 'marketplace'
    | 'external-mcp'
    | 'guidance'
    | 'hook-build-entry'
    | 'hook-config-target'
    | 'generated-hook-script'
    | 'plugin-manifest'
    | 'plugin-skill'
    | 'plugin-agent'
    | 'plugin-hook'
    | 'plugin-schema'
    | 'plugin-template'
    | 'plugin-reference'
    | 'plugin-bin'
    | 'smoke-surface'
    | 'claude-cli'
    | 'npm-tag'
    | 'claude-plugin-tag'
    | 'remote-tag';
  path: string;
  summary: string;
  evidenceRef: string;
}

export interface ReleaseParityGuidance extends Record<string, unknown> {
  versionBumpCommand: string;
  summary: string;
}

export interface EvaluateReleaseParityInput {
  runId: string;
  goalId: string;
  versionSurfaces: ReleaseVersionSurfaces;
  expectedPluginDependencies: ReleaseDependencyIdentity[];
  manifestDependencies: ReleaseManifestDependency[];
  marketplaceAllowlist: string[];
  registryPluginPackages: ReleaseRegistryPluginPackage[];
  externalMcps: ReleaseExternalMcpIdentity[];
  marketplacePluginDependencies?: ReleaseManifestDependency[];
  generatedAt?: Date | string;
}

export interface ReleaseParityResult extends Record<string, unknown> {
  schemaVersion: 1;
  runId: string;
  goalId: string;
  generatedAt: string;
  status: 'passed' | 'failed';
  checks: ReleaseCheckResult[];
  blockers: ReleaseBlocker[];
  missingEvidence: ReleaseMissingEvidence[];
  verifiedSurfaces: ReleaseVerifiedSurface[];
  guidance: ReleaseParityGuidance;
}

export type ReleaseCommandEvidenceStatus = 'passed' | 'failed' | 'missing';

export interface ReleaseCommandEvidence extends Record<string, unknown> {
  command: string;
  status: ReleaseCommandEvidenceStatus;
  evidenceRefs?: string[];
  summary?: string;
}

export interface ReleaseHookChangeSet extends Record<string, unknown> {
  hookSourceChanged: boolean;
  buildScriptChanged: boolean;
  hooksJsonChanged: boolean;
  generatedBundlesChanged: boolean;
  hookBehaviorChanged: boolean;
}

export interface EvaluateHookFreshnessGateInput {
  runId: string;
  goalId: string;
  buildEntries: string[];
  hooksJsonTargets: string[];
  generatedScripts: string[];
  changes: ReleaseHookChangeSet;
  generatedFresh: boolean;
  commandEvidence: {
    buildHooks: ReleaseCommandEvidence;
    checkHooksFresh: ReleaseCommandEvidence;
    testHooks: ReleaseCommandEvidence;
    pluginValidation?: ReleaseCommandEvidence;
    installedSmoke?: ReleaseCommandEvidence;
  };
  generatedAt?: Date | string;
}

export interface ReleaseHookFreshnessResult extends Record<string, unknown> {
  schemaVersion: 1;
  runId: string;
  goalId: string;
  generatedAt: string;
  status: 'passed' | 'failed';
  checks: ReleaseCheckResult[];
  blockers: ReleaseBlocker[];
  missingEvidence: ReleaseMissingEvidence[];
  verifiedSurfaces: ReleaseVerifiedSurface[];
  requiredCommands: string[];
}

export type ReleasePluginSmokeStatus = 'passed' | 'failed' | 'blocked' | 'manual-confirmation-required';

export type ReleaseClaudeCliReadinessStatus = 'available' | 'missing' | 'unsupported';

export type ReleasePluginSurfaceKind =
  | 'plugin-manifest'
  | 'plugin-skill'
  | 'plugin-agent'
  | 'plugin-hook'
  | 'plugin-schema'
  | 'plugin-template'
  | 'plugin-reference'
  | 'plugin-bin';

export type ReleaseSmokeSurfaceKind =
  | 'plugin-load'
  | 'slash-command'
  | 'hook-non-blocking'
  | 'dependency-guidance'
  | 'runtime-bin'
  | 'isolated-workspace';

export type ReleaseSmokeFailureKind =
  | 'source-validation'
  | 'installed-smoke'
  | 'dependency-resolution'
  | 'runtime-command'
  | 'hook'
  | 'workspace-isolation'
  | 'claude-cli';

export interface ReleasePluginSurfaceEvidence extends Record<string, unknown> {
  id: string;
  kind: ReleasePluginSurfaceKind;
  path: string;
  summary: string;
}

export interface ReleaseClaudeCliReadiness extends Record<string, unknown> {
  status: ReleaseClaudeCliReadinessStatus;
  binary: string;
  version?: string;
  supportsPluginDir?: boolean;
  supportsPluginValidate?: boolean;
  summary?: string;
  unsupportedReasons?: string[];
}

export interface ReleaseSmokeSurfaceEvidence extends Record<string, unknown> {
  id: string;
  kind: ReleaseSmokeSurfaceKind;
  status: ReleaseCommandEvidenceStatus;
  summary: string;
  evidenceRefs?: string[];
}

export interface ReleaseSmokeWorkspaceEvidence extends Record<string, unknown> {
  cwd: string;
  isolated: boolean;
  repoMutationDetected: boolean;
  summary?: string;
}

export interface EvaluatePluginSmokeGateInput {
  runId: string;
  goalId: string;
  changedSurfaces: ReleasePluginSurfaceEvidence[];
  claudeCli: ReleaseClaudeCliReadiness;
  commandEvidence: {
    pluginValidation?: ReleaseCommandEvidence;
    installedSmoke?: ReleaseCommandEvidence;
    build?: ReleaseCommandEvidence;
    typecheck?: ReleaseCommandEvidence;
  };
  smokeSurfaces: ReleaseSmokeSurfaceEvidence[];
  smokeWorkspace: ReleaseSmokeWorkspaceEvidence;
  generatedAt?: Date | string;
}

export interface ReleasePluginSmokeResult extends Record<string, unknown> {
  schemaVersion: 1;
  runId: string;
  goalId: string;
  generatedAt: string;
  status: ReleasePluginSmokeStatus;
  checks: ReleaseCheckResult[];
  blockers: ReleaseBlocker[];
  missingEvidence: ReleaseMissingEvidence[];
  verifiedSurfaces: ReleaseVerifiedSurface[];
  requiredCommands: string[];
}

export type ReleaseTagParityStatus = 'passed' | 'failed' | 'incomplete';

export type ReleaseTagParityState = 'none' | 'npm-only' | 'plugin-only' | 'both' | 'mismatch';

export interface ReleaseTagIdentity extends Record<string, unknown> {
  version: string;
  pluginName: string;
  npmTag: string;
  claudePluginTag: string;
}

export interface ReleaseRemoteTagEvidence extends Record<string, unknown> {
  tag: string;
  exists: boolean;
  refs: string[];
  evidenceRefs?: string[];
  summary?: string;
}

export interface ReleaseTagParityGuidance extends Record<string, unknown> {
  summary: string;
  safeRecoverySteps: string[];
  dependencyResolutionNote: string;
}

export interface EvaluateReleaseTagParityInput {
  runId: string;
  goalId: string;
  version: string;
  pluginName?: string;
  npmTag?: string;
  claudePluginTag?: string;
  remoteTags: {
    npm: ReleaseRemoteTagEvidence;
    claudePlugin: ReleaseRemoteTagEvidence;
  };
  plannedCommands?: ReleaseCommand[];
  generatedAt?: Date | string;
}

export interface ReleaseTagParityResult extends Record<string, unknown> {
  schemaVersion: 1;
  runId: string;
  goalId: string;
  generatedAt: string;
  status: ReleaseTagParityStatus;
  state: ReleaseTagParityState;
  identity: ReleaseTagIdentity;
  checks: ReleaseCheckResult[];
  blockers: ReleaseBlocker[];
  missingEvidence: ReleaseMissingEvidence[];
  verifiedSurfaces: ReleaseVerifiedSurface[];
  guidance: ReleaseTagParityGuidance;
  readOnlyCommands: string[];
  plannedCommands: ReleaseCommand[];
  sideEffects: ReleaseSideEffectRecord[];
}

export type ReleaseFlowContext = 'release' | 'verification' | 'report-only' | 'fix' | 'doctor' | 'smoke';

export type ReleaseAuthorizationStatus =
  | 'ready-no-auth'
  | 'authorized'
  | 'blocked'
  | 'incomplete'
  | 'dry-run-only';

export interface ReleaseStageAuthorization extends Record<string, unknown> {
  releaseStageAuthorized: boolean;
  authorizedBy?: string;
  authorizedAt?: string;
  source?: string;
  text?: string;
}

export interface ReleaseGateSnapshot extends Record<string, unknown> {
  verdict: ReleaseVerdictStatus;
  blockers: ReleaseBlocker[];
  missingEvidence: ReleaseMissingEvidence[];
  freshnessOk?: boolean;
  tagParityState?: ReleaseTagParityState;
  remoteTagSummary?: string;
  summary?: string;
}

export interface ReleaseActionIntent extends Record<string, unknown> {
  id: string;
  command: ReleaseCommand;
  riskLevel: ReleaseRiskLevel;
  expectedSideEffects: ReleaseSideEffectKind[];
}

export interface ReleaseAuthorizedActionRecord extends Record<string, unknown> {
  id: string;
  authorizationSource: string;
  authorizationText: string;
  authorizedBy?: string;
  authorizedAt?: string;
  command: string;
  riskLevel: ReleaseRiskLevel;
  version: string;
  npmTag: string;
  claudePluginTag: string;
  expectedSideEffects: ReleaseSideEffectKind[];
}

export interface EvaluateReleaseAuthorizationGateInput {
  runId: string;
  goalId: string;
  version: string;
  npmTag: string;
  claudePluginTag: string;
  flowContext: ReleaseFlowContext;
  releaseGate: ReleaseGateSnapshot;
  actionIntents: ReleaseActionIntent[];
  authorization?: ReleaseStageAuthorization;
  generatedAt?: Date | string;
}

export interface ReleaseAuthorizationResult extends Record<string, unknown> {
  schemaVersion: 1;
  runId: string;
  goalId: string;
  generatedAt: string;
  status: ReleaseAuthorizationStatus;
  version: string;
  npmTag: string;
  claudePluginTag: string;
  publicationState: ReleasePublicationState;
  checks: ReleaseCheckResult[];
  blockers: ReleaseBlocker[];
  missingEvidence: ReleaseMissingEvidence[];
  authorization: ReleaseStageAuthorization | null;
  actionRecords: ReleaseAuthorizedActionRecord[];
  sideEffects: ReleaseSideEffectRecord[];
  nextAction: ReleaseNextAction;
  recoverySteps: string[];
}
