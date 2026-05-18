import { detectForbiddenReleaseSideEffects } from './dry-run.ts';
import type {
  EvaluateReleaseAuthorizationGateInput,
  ReleaseActionIntent,
  ReleaseAuthorizationResult,
  ReleaseBlocker,
  ReleaseCheckResult,
  ReleaseCommand,
  ReleaseMissingEvidence,
  ReleaseNextAction,
  ReleaseSideEffectRecord,
  ReleaseStageAuthorization,
  ReleaseTagParityState,
} from './types.ts';

export function evaluateReleaseAuthorizationGate(
  input: EvaluateReleaseAuthorizationGateInput,
): ReleaseAuthorizationResult {
  const generatedAt = toIso(input.generatedAt);
  const authorization = input.authorization ?? null;
  const authorized = authorization?.releaseStageAuthorized === true;
  const releaseSideEffects = detectForbiddenReleaseSideEffects(input.actionIntents.map((intent) => intent.command));
  const partialReleaseState = isPartialReleaseState(input.releaseGate.tagParityState);
  const releaseGateReady = isReleaseGateReady(input);

  const blockers = buildBaseBlockers(input, {
    authorized,
    partialReleaseState,
    releaseGateReady,
    releaseSideEffects,
  });
  const missingEvidence = [...input.releaseGate.missingEvidence];
  const status = statusFor(input, {
    authorized,
    partialReleaseState,
    releaseGateReady,
    blockers,
  });
  const actionRecords = status === 'authorized'
    ? buildActionRecords(input.actionIntents, authorization, input)
    : [];
  const checks = buildChecks(input, {
    authorized,
    partialReleaseState,
    releaseGateReady,
    releaseSideEffects,
    actionRecordsCount: actionRecords.length,
  });

  return {
    schemaVersion: 1,
    runId: input.runId,
    goalId: input.goalId,
    generatedAt,
    status,
    version: input.version,
    npmTag: input.npmTag,
    claudePluginTag: input.claudePluginTag,
    publicationState: 'not-published',
    checks,
    blockers: dedupeBlockers(blockers),
    missingEvidence,
    authorization,
    actionRecords,
    sideEffects: input.flowContext === 'release' ? [] : releaseSideEffects,
    nextAction: nextActionFor(status, input, blockers),
    recoverySteps: recoveryStepsFor(input),
  };
}

function buildBaseBlockers(
  input: EvaluateReleaseAuthorizationGateInput,
  context: {
    authorized: boolean;
    partialReleaseState: boolean;
    releaseGateReady: boolean;
    releaseSideEffects: ReleaseSideEffectRecord[];
  },
): ReleaseBlocker[] {
  const blockers: ReleaseBlocker[] = [];

  if (input.flowContext !== 'release' && context.releaseSideEffects.length > 0) {
    blockers.push({
      checkId: 'ordinary-flow-no-publish',
      reason: `Ordinary '${input.flowContext}' flow attempted release side effects; doctor, smoke, fix, report-only, and verification contexts remain no-publish.`,
      remediation: 'Move publish/tag/push/plugin release work into the explicit release flow after release gate readiness and release-stage authorization are recorded.',
      requiresDryRunRerun: true,
      riskLevel: 'critical',
      evidenceRefs: [],
    });
    return blockers;
  }

  if (context.partialReleaseState) {
    blockers.push({
      checkId: 'partial-release-recovery',
      reason: `Detected partial release state '${input.releaseGate.tagParityState}'. ${input.releaseGate.remoteTagSummary ?? 'Remote release tags are not paired.'}`,
      remediation: `Stop release execution, reconcile remote tags for ${input.npmTag} and ${input.claudePluginTag}, then rerun release dry-run and tag parity checks.`,
      requiresDryRunRerun: true,
      riskLevel: 'critical',
      evidenceRefs: [],
    });
    return blockers;
  }

  if (!context.releaseGateReady) {
    blockers.push(...input.releaseGate.blockers);
    blockers.push(...input.releaseGate.missingEvidence.map((item) => missingEvidenceBlocker(item)));
    blockers.push({
      checkId: 'release-gate-readiness',
      reason: context.authorized
        ? 'release-stage authorization exists but release evidence gate is not ready; authorization exists but release evidence gate is not ready for publish/tag/push/plugin release.'
        : 'Release evidence gate is not ready for publish/tag/push/plugin release.',
      remediation: 'Resolve release blockers, missing evidence, stale evidence, and tag parity state before requesting release execution.',
      requiresDryRunRerun: true,
      riskLevel: 'high',
      evidenceRefs: input.releaseGate.blockers.flatMap((blocker) => blocker.evidenceRefs),
    });
  }

  return blockers;
}

function buildChecks(
  input: EvaluateReleaseAuthorizationGateInput,
  context: {
    authorized: boolean;
    partialReleaseState: boolean;
    releaseGateReady: boolean;
    releaseSideEffects: ReleaseSideEffectRecord[];
    actionRecordsCount: number;
  },
): ReleaseCheckResult[] {
  return [
    {
      id: 'release-flow-context',
      status: input.flowContext === 'release' ? 'passed' : 'blocked',
      summary: input.flowContext === 'release'
        ? 'Release authorization gate is running inside release context.'
        : `Release authorization gate was invoked from '${input.flowContext}', which is no-publish context.`,
      required: true,
      evidenceRefs: [],
      remediation: 'Use the explicit release flow for real publish/tag/push/plugin release actions.',
      riskLevel: input.flowContext === 'release' ? 'medium' : 'critical',
    },
    {
      id: 'release-gate-readiness',
      status: context.releaseGateReady ? 'passed' : 'failed',
      summary: releaseGateSummary(input, context.partialReleaseState),
      required: true,
      evidenceRefs: input.releaseGate.blockers.flatMap((blocker) => blocker.evidenceRefs),
      remediation: 'Rerun release dry-run after resolving blockers, missing evidence, freshness, and tag parity.',
      riskLevel: context.releaseGateReady ? 'medium' : 'high',
    },
    {
      id: 'release-stage-authorization',
      status: context.authorized ? 'passed' : 'missing',
      summary: context.authorized
        ? 'Explicit release-stage authorization is present.'
        : 'Explicit release-stage authorization is missing; no publish/tag/push/plugin release action may execute.',
      required: true,
      evidenceRefs: [],
      remediation: 'Request explicit release-stage authorization text for this version and tag pair.',
      riskLevel: context.authorized ? 'medium' : 'high',
    },
    {
      id: 'ordinary-flow-no-publish-boundary',
      status: input.flowContext === 'release' || context.releaseSideEffects.length === 0 ? 'passed' : 'blocked',
      summary: input.flowContext === 'release'
        ? 'Release action intents are confined to release context.'
        : 'Ordinary flow cannot carry release side-effect commands.',
      required: true,
      evidenceRefs: [],
      remediation: 'Keep ordinary verification, doctor, smoke, report-only, and fix flows dry-run/readiness-only.',
      riskLevel: input.flowContext === 'release' || context.releaseSideEffects.length === 0 ? 'medium' : 'critical',
    },
    {
      id: 'authorized-action-records',
      status: context.actionRecordsCount > 0 ? 'passed' : 'skipped',
      summary: context.actionRecordsCount > 0
        ? `Prepared ${context.actionRecordsCount} release action record(s); no command was executed.`
        : 'No authorized release action records were prepared.',
      required: false,
      evidenceRefs: [],
      remediation: 'Action records are only created when release gate readiness and release-stage authorization are both present.',
      riskLevel: context.actionRecordsCount > 0 ? 'critical' : 'medium',
    },
  ];
}

function statusFor(
  input: EvaluateReleaseAuthorizationGateInput,
  context: {
    authorized: boolean;
    partialReleaseState: boolean;
    releaseGateReady: boolean;
    blockers: ReleaseBlocker[];
  },
): ReleaseAuthorizationResult['status'] {
  if (input.flowContext !== 'release' && context.blockers.some((blocker) => blocker.checkId === 'ordinary-flow-no-publish')) {
    return 'blocked';
  }
  if (context.partialReleaseState) return 'incomplete';
  if (input.flowContext !== 'release') return context.blockers.length > 0 ? 'blocked' : 'dry-run-only';
  if (!context.releaseGateReady) return 'blocked';
  if (!context.authorized) return 'ready-no-auth';
  return 'authorized';
}

function buildActionRecords(
  actionIntents: ReleaseActionIntent[],
  authorization: ReleaseStageAuthorization | null,
  input: EvaluateReleaseAuthorizationGateInput,
): ReleaseAuthorizationResult['actionRecords'] {
  return actionIntents.map((intent) => ({
    id: intent.id,
    authorizationSource: authorization?.source ?? 'release-stage-authorization',
    authorizationText: authorization?.text ?? 'explicit release-stage authorization recorded',
    authorizedBy: authorization?.authorizedBy,
    authorizedAt: authorization?.authorizedAt,
    command: formatCommand(intent.command),
    riskLevel: intent.riskLevel,
    version: input.version,
    npmTag: input.npmTag,
    claudePluginTag: input.claudePluginTag,
    expectedSideEffects: [...intent.expectedSideEffects],
  }));
}

function nextActionFor(
  status: ReleaseAuthorizationResult['status'],
  input: EvaluateReleaseAuthorizationGateInput,
  blockers: ReleaseBlocker[],
): ReleaseNextAction {
  if (status === 'authorized') {
    return {
      owner: 'maintainer',
      summary: 'Release gate passed and release-stage authorization was recorded; use the action records as evidence for intentional release execution.',
      commands: ['review authorized action records'],
      requiresReleaseStageAuthorization: false,
    };
  }

  if (status === 'ready-no-auth') {
    return {
      owner: 'maintainer',
      summary: `Release gate is ready for ${input.version}; request explicit release-stage authorization before any publish/tag/push/plugin release action.`,
      commands: ['request release-stage authorization'],
      requiresReleaseStageAuthorization: true,
    };
  }

  if (status === 'incomplete') {
    return {
      owner: 'maintainer',
      summary: `Recover partial release state before continuing: ${input.releaseGate.remoteTagSummary ?? `${input.npmTag} / ${input.claudePluginTag}`}.`,
      commands: [
        `git ls-remote --tags origin "${input.npmTag}"`,
        `git ls-remote --tags origin "${input.claudePluginTag}"`,
      ],
      requiresReleaseStageAuthorization: false,
    };
  }

  if (status === 'dry-run-only') {
    return {
      owner: 'agent',
      summary: `Flow '${input.flowContext}' remains dry-run/readiness-only; no publish/tag/push/plugin release action is authorized from this context.`,
      commands: ['run release readiness checks only'],
      requiresReleaseStageAuthorization: false,
    };
  }

  const topBlocker = blockers[0];
  return {
    owner: 'agent',
    summary: topBlocker === undefined
      ? 'Release authorization is blocked; rerun release evidence gates before any publish action.'
      : `Release authorization is blocked by '${topBlocker.checkId}'; rerun release evidence gates before any publish action.`,
    commands: ['npm run test:release', 'npm run verify'],
    requiresReleaseStageAuthorization: false,
  };
}

function recoveryStepsFor(input: EvaluateReleaseAuthorizationGateInput): string[] {
  if (!isPartialReleaseState(input.releaseGate.tagParityState)) return [];
  return [
    'Stop and do not mark the release complete while only one release surface exists remotely.',
    `Verify npm tag state with: git ls-remote --tags origin "${input.npmTag}".`,
    `Verify Claude plugin tag state with: git ls-remote --tags origin "${input.claudePluginTag}".`,
    `Prepare an explicit recovery plan for ${input.npmTag} and ${input.claudePluginTag}, then rerun release dry-run and tag parity checks.`,
  ];
}

function releaseGateSummary(
  input: EvaluateReleaseAuthorizationGateInput,
  partialReleaseState: boolean,
): string {
  if (partialReleaseState) {
    return `Release gate is not ready because remote tag parity is partial: ${input.releaseGate.remoteTagSummary ?? input.releaseGate.tagParityState}.`;
  }
  if (isReleaseGateReady(input)) {
    return input.releaseGate.summary ?? 'Release evidence gate is ready.';
  }
  return input.releaseGate.summary ?? 'Release evidence gate has blockers, missing evidence, stale evidence, or tag parity issues.';
}

function isReleaseGateReady(input: EvaluateReleaseAuthorizationGateInput): boolean {
  if (input.releaseGate.verdict !== 'release-ready') return false;
  if (input.releaseGate.blockers.length > 0) return false;
  if (input.releaseGate.missingEvidence.length > 0) return false;
  if (input.releaseGate.freshnessOk === false) return false;
  if (input.releaseGate.tagParityState === 'mismatch') return false;
  if (isPartialReleaseState(input.releaseGate.tagParityState)) return false;
  return true;
}

function isPartialReleaseState(state: ReleaseTagParityState | undefined): boolean {
  return state === 'npm-only' || state === 'plugin-only';
}

function missingEvidenceBlocker(item: ReleaseMissingEvidence): ReleaseBlocker {
  return {
    checkId: item.checkId ?? item.id,
    reason: item.reason,
    remediation: 'Collect missing release evidence and rerun release dry-run before any publish action.',
    requiresDryRunRerun: true,
    riskLevel: 'high',
    evidenceRefs: [],
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

function formatCommand(command: ReleaseCommand): string {
  return [command.executable, ...command.argv].join(' ');
}

function toIso(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}
