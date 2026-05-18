import { summarizeArtifactText } from '../evidence/index.ts';
import type {
  CapturedFailureRecord,
  FailureCategory,
  FailureCommandSummary,
  FailureNextAction,
  PlanRecoveryInput,
  ParallelDiagnosisLane,
  ParallelDiagnosisPlan,
  RecoveryCandidateAction,
  RecoveryCapabilityStatus,
  RecoveryDiagnostic,
  RecoveryHistoryMatch,
  RecoveryHistoryReference,
  RecoveryModeRestrictions,
  RecoveryOwnership,
  RecoveryPlan,
  RecoveryPlanMode,
  RecoveryPlanStatus,
  RecoveryRetryPath,
  RecoveryRiskLevel,
  SuspectedRootCause,
} from './types.ts';

const categoryPriority: Record<FailureCategory, number> = {
  environment: 100,
  dependency: 90,
  permission: 85,
  externalService: 80,
  releaseGate: 75,
  backend: 70,
  api: 60,
  data: 50,
  browser: 40,
  frontend: 30,
  unknown: 0,
};

const riskWeight: Record<RecoveryRiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function planRecovery(input: PlanRecoveryInput): RecoveryPlan {
  const generatedAt = toIso(input.generatedAt);
  const failures = collectFailures(input);
  const primary = selectPrimaryFailure(input, failures, generatedAt);
  const hasEvidence = hasFailureEvidence(primary);
  const suspectedRootCause = buildSuspectedRootCause(input, primary, failures);
  const degradedCapabilities = buildDegradedCapabilities(input, failures, primary, hasEvidence);
  const historyReferences = sanitizeHistoryMatches(input.historyMatches ?? []);
  const modeRestrictions = buildModeRestrictions(input.mode);
  const retryPath = buildRetryPath(primary);
  const parallelDiagnosisPlan = buildParallelDiagnosisPlan(input, failures);

  if (!hasEvidence) {
    const requiredDiagnostics = [
      diagnostic({
        id: 'collect-failure-evidence',
        kind: 'collect-failure-evidence',
        summary: 'Capture structured failure observations, evidence refs, artifacts, and same-path reproduction steps before planning a fix.',
        owner: 'agent',
        evidenceRefs: [],
      }),
    ];

    return buildPlan({
      input,
      generatedAt,
      status: 'blocked',
      suspectedRootCause,
      requiredDiagnostics,
      candidateActions: [],
      riskLevel: 'medium',
      modeRestrictions,
      retryPath,
      stopConditions: stopConditionsFor('unknown', input.mode, false),
      ownership: {
        owner: 'agent',
        reason: 'Recovery planning is blocked until failure evidence is captured.',
        blocker: 'missing-failure-evidence',
      },
      degradedCapabilities,
      historyReferences,
      parallelDiagnosisPlan,
      nextAction: {
        owner: 'agent',
        summary: 'Capture failure evidence before planning any fix action.',
      },
    });
  }

  const ownership = ownershipFor(primary);
  const requiredDiagnostics = diagnosticsFor(primary, input, degradedCapabilities);
  const candidateActions = actionsFor(primary, input.mode, ownership);
  const status = statusFor(primary.category, input.mode, ownership, candidateActions);
  const riskLevel = highestRisk(candidateActions);

  return buildPlan({
    input,
    generatedAt,
    status,
    suspectedRootCause,
    requiredDiagnostics,
    candidateActions,
    riskLevel,
    modeRestrictions,
    retryPath,
    stopConditions: stopConditionsFor(primary.category, input.mode, true),
    ownership,
    degradedCapabilities,
    historyReferences,
    parallelDiagnosisPlan,
    nextAction: nextActionFor(status, primary.category, ownership),
  });
}

interface BuildPlanInput {
  input: PlanRecoveryInput;
  generatedAt: string;
  status: RecoveryPlanStatus;
  suspectedRootCause: SuspectedRootCause;
  requiredDiagnostics: RecoveryDiagnostic[];
  candidateActions: RecoveryCandidateAction[];
  riskLevel: RecoveryRiskLevel;
  modeRestrictions: RecoveryModeRestrictions;
  retryPath: RecoveryRetryPath;
  stopConditions: string[];
  ownership: RecoveryOwnership;
  degradedCapabilities: RecoveryCapabilityStatus[];
  historyReferences: RecoveryHistoryReference[];
  parallelDiagnosisPlan: ParallelDiagnosisPlan;
  nextAction: FailureNextAction;
}

function buildPlan(input: BuildPlanInput): RecoveryPlan {
  return {
    schemaVersion: 1,
    status: input.status,
    runId: input.input.runId,
    goalId: input.input.goalId,
    mode: input.input.mode,
    generatedAt: input.generatedAt,
    suspectedRootCause: input.suspectedRootCause,
    requiredDiagnostics: input.requiredDiagnostics,
    candidateActions: input.candidateActions,
    riskLevel: input.riskLevel,
    modeRestrictions: input.modeRestrictions,
    retryPath: input.retryPath,
    stopConditions: input.stopConditions,
    ownership: input.ownership,
    degradedCapabilities: input.degradedCapabilities,
    historyReferences: input.historyReferences,
    parallelDiagnosisPlan: input.parallelDiagnosisPlan,
    nextAction: input.nextAction,
  };
}

function collectFailures(input: PlanRecoveryInput): CapturedFailureRecord[] {
  if (input.failureResult !== undefined && input.failureResult.failures.length > 0) {
    return input.failureResult.failures;
  }
  return input.failures ?? [];
}

function selectPrimaryFailure(
  input: PlanRecoveryInput,
  failures: CapturedFailureRecord[],
  generatedAt: string,
): CapturedFailureRecord {
  if (input.failureResult !== undefined) {
    return input.failureResult.primary;
  }

  const primary = [...failures].sort((a, b) => {
    const priorityDelta = categoryPriority[b.category] - categoryPriority[a.category];
    if (priorityDelta !== 0) return priorityDelta;
    return b.confidence - a.confidence;
  })[0];

  if (primary !== undefined) return primary;

  return {
    id: 'failure-observation-missing',
    source: 'command',
    category: 'unknown',
    confidence: 0,
    reason: 'No failure observations were provided.',
    signals: [],
    summary: 'No failure observations were provided.',
    reproductionSteps: [],
    evidenceRefs: [],
    artifactRefs: [],
    observedAt: generatedAt,
    privacy: {
      classification: 'local-only',
      containsSensitiveData: false,
      redacted: false,
      summaryTruncated: false,
    },
  };
}

function hasFailureEvidence(primary: CapturedFailureRecord): boolean {
  return primary.id !== 'failure-observation-missing' && primary.evidenceRefs.length > 0;
}

function buildSuspectedRootCause(
  input: PlanRecoveryInput,
  primary: CapturedFailureRecord,
  failures: CapturedFailureRecord[],
): SuspectedRootCause {
  const secondarySymptomIds = input.failureResult?.taxonomy.secondarySymptomIds
    ?? failures.filter((failure) => failure.id !== primary.id).map((failure) => failure.id);

  return {
    failureId: primary.id,
    category: primary.category,
    summary: primary.summary,
    reason: primary.reason,
    confidence: primary.confidence,
    evidenceRefs: primary.evidenceRefs,
    artifactRefs: primary.artifactRefs,
    secondarySymptomIds,
  };
}

function buildRetryPath(primary: CapturedFailureRecord): RecoveryRetryPath {
  return {
    samePathRequired: true,
    reproductionSteps: primary.reproductionSteps,
    evidenceRefs: primary.evidenceRefs,
    artifactRefs: primary.artifactRefs,
    ...(primary.command === undefined ? {} : { command: cloneCommand(primary.command) }),
    ...(primary.actionId === undefined ? {} : { actionId: primary.actionId }),
    ...(primary.method === undefined ? {} : { method: primary.method }),
    ...(primary.url === undefined ? {} : { url: primary.url }),
    ...(primary.status === undefined ? {} : { status: primary.status }),
    ...(primary.target === undefined ? {} : { target: primary.target }),
  };
}

function cloneCommand(command: FailureCommandSummary): FailureCommandSummary {
  return {
    executable: command.executable,
    argv: [...command.argv],
    exitCode: command.exitCode,
    ...(command.cwd === undefined ? {} : { cwd: command.cwd }),
  };
}

function ownershipFor(primary: CapturedFailureRecord): RecoveryOwnership {
  switch (primary.category) {
    case 'environment':
      return {
        owner: 'user',
        reason: 'Environment, secret, port, or database availability must be restored outside agent code edits.',
        blocker: 'environment-blocker',
      };
    case 'dependency':
      return {
        owner: 'user',
        reason: 'Missing dependencies or unavailable companion capabilities require user-controlled provisioning.',
        blocker: 'dependency-blocker',
      };
    case 'permission':
      return {
        owner: 'user',
        reason: 'The agent cannot grant permissions or assume authorization.',
        blocker: 'permission-blocker',
      };
    case 'externalService':
      return {
        owner: 'external-system',
        reason: 'The failing path depends on an upstream service outside this workspace.',
        blocker: 'external-service-blocker',
      };
    case 'unknown':
      return {
        owner: 'agent',
        reason: 'The root cause is not reliable enough for a fix; diagnostics must come first.',
        blocker: 'unknown-root-cause',
      };
    case 'api':
    case 'backend':
    case 'browser':
    case 'data':
    case 'frontend':
    case 'releaseGate':
      return {
        owner: 'agent',
        reason: 'Evidence points to a workspace-investigable failure layer.',
      };
  }
}

function diagnosticsFor(
  primary: CapturedFailureRecord,
  input: PlanRecoveryInput,
  degradedCapabilities: RecoveryCapabilityStatus[],
): RecoveryDiagnostic[] {
  const evidenceRefs = primary.evidenceRefs;
  const diagnostics: RecoveryDiagnostic[] = [];

  switch (primary.category) {
    case 'api':
      diagnostics.push(
        diagnostic({
          id: 'inspect-api-contract',
          kind: 'inspect-api-contract',
          summary: 'Inspect request method, route handler, response contract, and server logs for the failing API path.',
          owner: 'agent',
          evidenceRefs,
        }),
      );
      break;
    case 'backend':
      diagnostics.push(
        diagnostic({
          id: 'inspect-backend-runtime',
          kind: 'inspect-backend-runtime',
          summary: 'Inspect backend logs, service lifecycle, and handler state before proposing a code change.',
          owner: 'agent',
          evidenceRefs,
        }),
      );
      break;
    case 'browser':
    case 'frontend':
      diagnostics.push(
        diagnostic({
          id: 'inspect-browser-trace',
          kind: 'inspect-browser-trace',
          summary: 'Inspect browser actions, console output, network failures, DOM state, and screenshots or traces.',
          owner: 'agent',
          evidenceRefs,
        }),
      );
      break;
    case 'data':
      diagnostics.push(
        diagnostic({
          id: 'inspect-data-readback',
          kind: 'inspect-data-readback',
          summary: 'Inspect persistence, transaction boundaries, cache invalidation, and state synchronization evidence.',
          owner: 'agent',
          evidenceRefs,
        }),
      );
      break;
    case 'environment':
      diagnostics.push(
        diagnostic({
          id: 'confirm-environment-restored',
          kind: 'confirm-environment-restored',
          summary: 'Confirm required environment variables, local services, ports, secrets, and database connectivity are restored.',
          owner: 'user',
          evidenceRefs,
        }),
      );
      break;
    case 'dependency':
      diagnostics.push(
        diagnostic({
          id: 'confirm-dependency-available',
          kind: 'confirm-dependency-available',
          summary: 'Confirm required package, executable, plugin, MCP server, or runtime capability is installed and reachable.',
          owner: 'user',
          evidenceRefs,
        }),
      );
      break;
    case 'externalService':
      diagnostics.push(
        diagnostic({
          id: 'confirm-external-service-health',
          kind: 'confirm-external-service-health',
          summary: 'Confirm upstream service health, rate limits, credentials, and provider-side incidents before retrying.',
          owner: 'external-system',
          evidenceRefs,
        }),
      );
      break;
    case 'permission':
      diagnostics.push(
        diagnostic({
          id: 'confirm-permission',
          kind: 'confirm-permission',
          summary: 'Confirm the user has authorized the required permission or credential scope.',
          owner: 'user',
          evidenceRefs,
        }),
      );
      break;
    case 'releaseGate':
      diagnostics.push(
        diagnostic({
          id: 'inspect-release-gate',
          kind: 'inspect-release-gate',
          summary: 'Inspect release gate evidence, version parity, plugin validation, tag state, and publish readiness.',
          owner: 'agent',
          evidenceRefs,
        }),
      );
      break;
    case 'unknown':
      diagnostics.push(
        diagnostic({
          id: 'collect-additional-diagnostics',
          kind: 'collect-additional-diagnostics',
          summary: 'Collect additional command, browser, API, data, and service evidence before proposing any fix.',
          owner: 'agent',
          evidenceRefs,
        }),
      );
      break;
  }

  const context7 = input.capabilities?.context7;
  if (context7?.state === 'available') {
    diagnostics.push(
      diagnostic({
        id: 'check-official-docs',
        kind: 'check-official-docs',
        summary: 'Use context7 for current official documentation before making version-sensitive recovery decisions.',
        owner: 'agent',
        evidenceRefs,
        capabilityId: context7.capabilityId,
      }),
    );
  }

  const sequentialThinking = input.capabilities?.sequentialThinking;
  if (sequentialThinking?.state === 'available') {
    diagnostics.push(
      diagnostic({
        id: 'structured-root-cause-reasoning',
        kind: 'structured-root-cause-reasoning',
        summary: 'Use sequential-thinking for high-risk root-cause reasoning before selecting a recovery path.',
        owner: 'agent',
        evidenceRefs,
        capabilityId: sequentialThinking.capabilityId,
      }),
    );
  }

  for (const capability of degradedCapabilities) {
    if (capability.capabilityId !== 'context7' && capability.capabilityId !== 'sequential-thinking') continue;
    diagnostics.push(
      diagnostic({
        id: `degraded-${capability.capabilityId}`,
        kind: 'diagnostic-capability-degraded',
        summary: capability.impact ?? `${capability.capabilityId} is unavailable or degraded; recovery confidence is reduced.`,
        owner: 'agent',
        evidenceRefs: capability.evidenceRefs ?? evidenceRefs,
        capabilityId: capability.capabilityId,
        degraded: true,
      }),
    );
  }

  return diagnostics;
}

interface DiagnosticInput {
  id: string;
  kind: string;
  summary: string;
  owner: 'agent' | 'user' | 'external-system';
  evidenceRefs: string[];
  capabilityId?: string;
  degraded?: boolean;
}

function diagnostic(input: DiagnosticInput): RecoveryDiagnostic {
  return {
    id: input.id,
    kind: input.kind,
    summary: input.summary,
    owner: input.owner,
    evidenceRefs: [...input.evidenceRefs],
    ...(input.capabilityId === undefined ? {} : { capabilityId: input.capabilityId }),
    ...(input.degraded === undefined ? {} : { degraded: input.degraded }),
  };
}

function actionsFor(
  primary: CapturedFailureRecord,
  mode: RecoveryPlanMode,
  ownership: RecoveryOwnership,
): RecoveryCandidateAction[] {
  const evidenceRefs = primary.evidenceRefs;

  if (primary.category === 'unknown') {
    return [
      action({
        id: 'collect-diagnostics-first',
        kind: 'collect-diagnostics',
        summary: 'Collect additional diagnostics before attempting a fix; current evidence does not identify a reliable root cause.',
        owner: 'agent',
        riskLevel: 'low',
        mutatesWorkspace: false,
        allowedModes: ['report-only', 'fix', 'release'],
        evidenceRefs,
      }),
    ];
  }

  if (mode === 'report-only') {
    return [
      action({
        id: 'report-diagnostic-plan',
        kind: 'collect-diagnostics',
        summary: 'Produce a non-mutating diagnostic report only; report-only mode forbids source, config, dependency, git, database, or release mutations.',
        owner: ownership.owner,
        riskLevel: 'low',
        mutatesWorkspace: false,
        allowedModes: ['report-only', 'fix', 'release'],
        evidenceRefs,
      }),
    ];
  }

  switch (primary.category) {
    case 'environment':
      return [
        action({
          id: 'restore-environment',
          kind: 'restore-environment',
          summary: 'Ask the user to restore the missing environment, secret, database, port, or local service, then rerun the same path.',
          owner: 'user',
          riskLevel: 'medium',
          mutatesWorkspace: false,
          allowedModes: ['report-only', 'fix', 'release'],
          evidenceRefs,
        }),
      ];
    case 'dependency':
      return [
        action({
          id: 'restore-dependency',
          kind: 'restore-dependency',
          summary: 'Ask the user to restore the missing dependency, executable, plugin, MCP server, or runtime capability.',
          owner: 'user',
          riskLevel: 'medium',
          mutatesWorkspace: false,
          allowedModes: ['report-only', 'fix', 'release'],
          evidenceRefs,
        }),
      ];
    case 'permission':
      return [
        action({
          id: 'request-permission',
          kind: 'request-permission',
          summary: 'Ask the user to grant or confirm the required permission before retrying.',
          owner: 'user',
          riskLevel: 'medium',
          mutatesWorkspace: false,
          allowedModes: ['report-only', 'fix', 'release'],
          evidenceRefs,
        }),
      ];
    case 'externalService':
      return [
        action({
          id: 'wait-for-external-service',
          kind: 'wait-for-external-service',
          summary: 'Wait for the upstream service or provider-side dependency to recover before retrying the same path.',
          owner: 'external-system',
          riskLevel: 'low',
          mutatesWorkspace: false,
          allowedModes: ['report-only', 'fix', 'release'],
          evidenceRefs,
        }),
      ];
    case 'releaseGate':
      return [
        action({
          id: 'inspect-release-gate-before-fix',
          kind: 'inspect-release-gate',
          summary: 'Inspect version parity, plugin validation, tag state, and publish readiness before any release recovery action.',
          owner: 'agent',
          riskLevel: 'high',
          mutatesWorkspace: false,
          allowedModes: ['fix', 'release'],
          evidenceRefs,
        }),
      ];
    case 'api':
    case 'backend':
    case 'browser':
    case 'data':
    case 'frontend':
      return [
        action({
          id: `fix-${primary.category}-root-cause`,
          kind: 'code-fix',
          summary: `Prepare a bounded workspace fix for the ${primary.category} root cause after required diagnostics confirm the failing layer.`,
          owner: 'agent',
          riskLevel: 'medium',
          mutatesWorkspace: true,
          allowedModes: ['fix'],
          evidenceRefs,
        }),
      ];
  }
}

interface ActionInput {
  id: string;
  kind: RecoveryCandidateAction['kind'];
  summary: string;
  owner: 'agent' | 'user' | 'external-system';
  riskLevel: RecoveryRiskLevel;
  mutatesWorkspace: boolean;
  allowedModes: RecoveryPlanMode[];
  evidenceRefs: string[];
}

function action(input: ActionInput): RecoveryCandidateAction {
  return {
    id: input.id,
    kind: input.kind,
    summary: input.summary,
    owner: input.owner,
    riskLevel: input.riskLevel,
    mutatesWorkspace: input.mutatesWorkspace,
    requiresAuthorization: riskWeight[input.riskLevel] >= riskWeight.high,
    allowedModes: input.allowedModes,
    evidenceRefs: [...input.evidenceRefs],
  };
}

function statusFor(
  category: FailureCategory,
  mode: RecoveryPlanMode,
  ownership: RecoveryOwnership,
  candidateActions: RecoveryCandidateAction[],
): RecoveryPlanStatus {
  if (category === 'unknown') return 'blocked';
  if (ownership.owner === 'external-system') return 'blocked';
  if (ownership.owner === 'user') return 'manual-confirmation-required';
  if (candidateActions.some((candidate) => candidate.allowedModes.includes(mode))) {
    return 'planned';
  }
  return 'blocked';
}

function highestRisk(actions: RecoveryCandidateAction[]): RecoveryRiskLevel {
  return actions.reduce<RecoveryRiskLevel>((highest, candidate) => {
    return riskWeight[candidate.riskLevel] > riskWeight[highest] ? candidate.riskLevel : highest;
  }, 'low');
}

function buildModeRestrictions(mode: RecoveryPlanMode): RecoveryModeRestrictions {
  if (mode === 'report-only') {
    return {
      mode,
      mutatingActionsAllowed: false,
      notes: [
        'report-only mode cannot generate mutating source, config, dependency, database, git, release, or global Claude/MCP actions.',
      ],
    };
  }

  if (mode === 'release') {
    return {
      mode,
      mutatingActionsAllowed: true,
      notes: [
        'release mode still requires action risk policy checks, explicit authorization for high or critical risk actions, and same-path verification.',
      ],
    };
  }

  return {
    mode,
    mutatingActionsAllowed: true,
    notes: [
      'fix mode may plan bounded workspace mutations only after evidence-backed diagnostics confirm the root cause.',
    ],
  };
}

function buildDegradedCapabilities(
  input: PlanRecoveryInput,
  failures: CapturedFailureRecord[],
  primary: CapturedFailureRecord,
  hasEvidence: boolean,
): RecoveryCapabilityStatus[] {
  const degraded: RecoveryCapabilityStatus[] = [];

  for (const capability of Object.values(input.capabilities ?? {})) {
    if (capability === undefined || capability.state === 'available') continue;
    degraded.push({
      ...capability,
      impact: capability.impact ?? `${capability.capabilityId} is ${capability.state}; recovery plan confidence may be lower.`,
    });
  }

  if (hasEvidence) {
    addMissingDiagnosticCapability(degraded, input.capabilities?.context7, {
      capabilityId: 'context7',
      impact: 'Latest official documentation cannot be checked automatically; keep fixes conservative or require manual confirmation for version-sensitive behavior.',
      evidenceRefs: primary.evidenceRefs,
    });
    addMissingDiagnosticCapability(degraded, input.capabilities?.sequentialThinking, {
      capabilityId: 'sequential-thinking',
      impact: 'Structured root-cause reasoning is unavailable; high-risk recovery choices need manual confirmation or narrower diagnostics.',
      evidenceRefs: primary.evidenceRefs,
    });
  }

  if ((input.historyMatches?.length ?? 0) > 0) {
    addMissingDiagnosticCapability(degraded, input.capabilities?.history, {
      capabilityId: 'claude-mem',
      impact: 'Historical failure reuse may be incomplete because memory capability status is unavailable.',
      evidenceRefs: primary.evidenceRefs,
    });
  }

  if (failures.length > 1) {
    addMissingDiagnosticCapability(degraded, input.capabilities?.pua, {
      capabilityId: 'pua',
      impact: 'Parallel diagnosis is unavailable; inspect layers sequentially and keep ownership scopes explicit.',
      evidenceRefs: failures.flatMap((failure) => failure.evidenceRefs),
    });
  }

  return uniqueCapabilities(degraded);
}

interface MissingCapabilityInput {
  capabilityId: string;
  impact: string;
  evidenceRefs: string[];
}

function addMissingDiagnosticCapability(
  degraded: RecoveryCapabilityStatus[],
  capability: RecoveryCapabilityStatus | undefined,
  fallback: MissingCapabilityInput,
): void {
  if (capability?.state === 'available') return;
  if (capability !== undefined) return;
  degraded.push({
    capabilityId: fallback.capabilityId,
    state: 'unavailable',
    reason: `${fallback.capabilityId} status was not provided.`,
    impact: fallback.impact,
    evidenceRefs: [...new Set(fallback.evidenceRefs)],
  });
}

function uniqueCapabilities(capabilities: RecoveryCapabilityStatus[]): RecoveryCapabilityStatus[] {
  const byId = new Map<string, RecoveryCapabilityStatus>();
  for (const capability of capabilities) {
    byId.set(capability.capabilityId, capability);
  }
  return [...byId.values()];
}

function sanitizeHistoryMatches(matches: RecoveryHistoryMatch[]): RecoveryHistoryReference[] {
  return matches.map((match) => {
    const sourceSummary = summarizeArtifactText(match.summary, 280).summary;
    const suggestedFixPattern = match.suggestedFixPattern === undefined
      ? undefined
      : summarizeArtifactText(match.suggestedFixPattern, 220).summary;
    return {
      id: match.id,
      source: match.source,
      sourceSummary,
      confidence: match.confidence,
      ...(suggestedFixPattern === undefined ? {} : { suggestedFixPattern }),
      evidenceRefs: match.evidenceRefs ?? [],
    };
  });
}

function buildParallelDiagnosisPlan(
  input: PlanRecoveryInput,
  failures: CapturedFailureRecord[],
): ParallelDiagnosisPlan {
  const pua = input.capabilities?.pua;
  if (pua?.state !== 'available' || failures.length < 2) {
    return {
      enabled: false,
      reason: failures.length < 2
        ? 'Parallel diagnosis is unnecessary for a single captured failure layer.'
        : 'pua is unavailable or degraded, so diagnosis must proceed sequentially.',
      lanes: [],
    };
  }

  const lanes = failures.slice(0, 4).map((failure, index) => laneFor(failure, index));
  return {
    enabled: true,
    reason: 'pua is available; use bounded read-only diagnosis lanes with disjoint ownership before any fix attempt.',
    lanes,
  };
}

function laneFor(failure: CapturedFailureRecord, index: number): ParallelDiagnosisLane {
  return {
    id: `lane-${index + 1}-${failure.id}`,
    owner: `diagnosis-${index + 1}-${failure.category}`,
    scope: failure.category,
    summary: `Inspect ${failure.category} evidence for ${failure.id}; do not edit files or duplicate another lane's scope.`,
    evidenceRefs: [...failure.evidenceRefs],
    writeScope: [],
  };
}

function stopConditionsFor(
  category: FailureCategory,
  mode: RecoveryPlanMode,
  hasEvidence: boolean,
): string[] {
  const conditions = [
    'Stop if same path retry cannot reproduce the captured failure evidence.',
    'Stop if required diagnostics contradict the suspected root cause.',
    'Stop if a candidate action needs a broader write scope than the plan allows.',
  ];

  if (!hasEvidence) {
    conditions.push('Stop before generating any fix action until failure evidence refs exist.');
  }

  if (mode === 'report-only') {
    conditions.push('Stop before any workspace mutation because report-only mode is active.');
  }

  if (category === 'environment' || category === 'dependency' || category === 'permission') {
    conditions.push('Stop until the user confirms the blocker is restored.');
  }

  if (category === 'externalService') {
    conditions.push('Stop until the external system is healthy or the user confirms a provider-side recovery path.');
  }

  if (category === 'unknown') {
    conditions.push('Stop before code edits because the root cause is still unknown.');
  }

  return conditions;
}

function nextActionFor(
  status: RecoveryPlanStatus,
  category: FailureCategory,
  ownership: RecoveryOwnership,
): FailureNextAction {
  if (status === 'manual-confirmation-required') {
    return {
      owner: ownership.owner,
      summary: 'Resolve or confirm the user-owned blocker, then rerun the same failure path before any code fix.',
    };
  }

  if (status === 'blocked' && ownership.owner === 'external-system') {
    return {
      owner: 'external-system',
      summary: 'Wait for the external system to recover, then rerun the same failure path.',
    };
  }

  if (category === 'unknown') {
    return {
      owner: 'agent',
      summary: 'Collect additional diagnostics before proposing a fix; do not guess from unknown root cause evidence.',
    };
  }

  return {
    owner: ownership.owner,
    summary: 'Complete required diagnostics, apply only the bounded candidate action, and verify with the same failure path.',
  };
}

function toIso(value?: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}
