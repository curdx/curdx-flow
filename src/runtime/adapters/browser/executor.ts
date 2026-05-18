import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { isWorkspaceRelativePath, resolveWorkspacePath } from '../../evidence/index.ts';
import type { ArtifactIndexInput } from '../../evidence/index.ts';
import type { EvidenceBlock } from '../../contracts/index.ts';
import type {
  BrowserActionOutcome,
  BrowserAdapterResult,
  BrowserArtifactCapture,
  BrowserBlocker,
  BrowserCapabilityKind,
  BrowserDiagnostic,
  BrowserPortExecutionResult,
  ExecuteBrowserJourneyInput,
} from './types.ts';

interface MaterializedArtifacts {
  artifacts: ArtifactIndexInput[];
  blockers: BrowserBlocker[];
}

export async function executeBrowserJourney(input: ExecuteBrowserJourneyInput): Promise<BrowserAdapterResult> {
  const startedAt = toIso(input.generatedAt);
  const fallbackCapabilityIds = fallbackCapabilities(input.port.capabilityKind);
  const reportOnlyBlockers = reportOnlyBlockersFor(input, fallbackCapabilityIds);
  if (reportOnlyBlockers.length > 0) {
    return buildResult({
      input,
      startedAt,
      completedAt: toIso(),
      portResult: {
        status: 'blocked',
        visitedUrl: input.journey.entry.url,
        actions: [],
        artifacts: [],
        diagnostics: reportOnlyBlockers.map((blocker) => ({
          code: blocker.code,
          message: blocker.message,
          actionId: blocker.actionId,
          url: blocker.url,
        })),
        durationMs: 0,
      },
      artifacts: [],
      blockers: reportOnlyBlockers,
      diagnostics: reportOnlyBlockers.map((blocker) => ({
        code: blocker.code,
        message: blocker.message,
        actionId: blocker.actionId,
        url: blocker.url,
      })),
      status: 'blocked',
      fallbackCapabilityIds,
    });
  }
  let portResult: BrowserPortExecutionResult;

  try {
    portResult = await input.port.execute({
      runId: input.runId,
      goalId: input.goalId,
      mode: input.mode,
      journey: input.journey,
      artifactBasePath: `.curdx/artifacts/${safePathSegment(input.runId)}`,
    });
  } catch (err: unknown) {
    const blocker = blockerForExecutionError(input, err, fallbackCapabilityIds);
    return buildResult({
      input,
      startedAt,
      completedAt: toIso(),
      portResult: {
        status: 'blocked',
        visitedUrl: input.journey.entry.url,
        actions: [],
        artifacts: [],
        diagnostics: [{ code: blocker.code, message: blocker.message, url: blocker.url }],
        durationMs: 0,
      },
      artifacts: [],
      blockers: [blocker],
      diagnostics: [{ code: blocker.code, message: blocker.message, url: blocker.url }],
      status: 'blocked',
      fallbackCapabilityIds,
    });
  }

  const completedAt = toIso();
  const actionArtifacts = portResult.actions.flatMap((action) => action.artifacts ?? []);
  const captures = [...(portResult.artifacts ?? []), ...actionArtifacts];
  const materialized = await materializeArtifacts(input, captures, fallbackCapabilityIds);
  const qualityBlockers = artifactQualityBlockers(input, captures, materialized.artifacts, fallbackCapabilityIds);
  const actionBlockers = actionFailureBlockers(input, portResult, fallbackCapabilityIds);
  const missingActionBlockers = missingActionBlockersFor(input, portResult, fallbackCapabilityIds);
  const missingArtifactBlockers = missingArtifactBlockersFor(input, materialized.artifacts, captures, fallbackCapabilityIds);
  const blockers = [
    ...materialized.blockers,
    ...actionBlockers,
    ...missingActionBlockers,
    ...qualityBlockers,
    ...missingArtifactBlockers,
  ];
  const diagnostics = [
    ...(portResult.diagnostics ?? []),
    ...degradedCapabilityDiagnostics(input.port.capabilityKind),
    ...qualityBlockers.map((blocker): BrowserDiagnostic => ({
      code: blocker.code,
      message: blocker.message,
      actionId: blocker.actionId,
      url: blocker.url,
    })),
  ];
  const status = determineStatus(input.port.capabilityKind, portResult, blockers);

  return buildResult({
    input,
    startedAt,
    completedAt,
    portResult,
    artifacts: materialized.artifacts,
    blockers,
    diagnostics,
    status,
    fallbackCapabilityIds,
  });
}

async function materializeArtifacts(
  input: ExecuteBrowserJourneyInput,
  captures: BrowserArtifactCapture[],
  fallbackCapabilityIds: string[],
): Promise<MaterializedArtifacts> {
  const artifacts: ArtifactIndexInput[] = [];
  const blockers: BrowserBlocker[] = [];

  for (const capture of captures) {
    const path = capture.path ?? defaultArtifactPath(input.runId, capture);
    if (!isSafeArtifactPathForRun(path, input.runId)) {
      blockers.push(genericBlocker({
        input,
        code: 'artifact-path-unsafe',
        message: `Browser artifact path must be workspace-relative under .curdx/artifacts/${safePathSegment(input.runId)}: ${path}`,
        actionId: input.journey.id,
        fallbackCapabilityIds,
        nextAction: 'Use a workspace-relative artifact path under .curdx/artifacts and retry browser capture.',
        retryable: true,
      }));
      continue;
    }

    if (capture.content !== undefined) {
      try {
        const absolutePath = resolveWorkspacePath(input.workspaceRoot, path);
        await mkdir(dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, capture.content);
      } catch (err: unknown) {
        blockers.push(genericBlocker({
          input,
          code: 'artifact-write-failed',
          message: `Failed to write browser artifact ${path}: ${errorMessage(err)}`,
          actionId: input.journey.id,
          fallbackCapabilityIds,
          nextAction: 'Check workspace permissions and retry screenshot or trace capture.',
          retryable: true,
        }));
        continue;
      }
    }

    artifacts.push({
      id: capture.id,
      type: capture.type,
      path,
      summary: capture.summary,
      privacy: {
        classification: 'local-only',
        containsSensitiveData: false,
        redacted: false,
        ...capture.privacy,
      },
      quality: capture.quality,
    });
  }

  return { artifacts, blockers };
}

function reportOnlyBlockersFor(input: ExecuteBrowserJourneyInput, fallbackCapabilityIds: string[]): BrowserBlocker[] {
  if (input.mode !== 'report-only') return [];
  return input.journey.actions
    .filter((action) => action.allowedInReportOnly !== true)
    .map((action) => genericBlocker({
      input,
      code: 'report-only-browser-action-disallowed',
      message: `Report-only mode cannot execute browser action ${action.id} (${action.type}).`,
      actionId: action.id,
      fallbackCapabilityIds,
      nextAction: 'Use a report-only sanitized journey plan or switch to verification/fix mode before executing this action.',
      retryable: false,
    }));
}

function actionFailureBlockers(
  input: ExecuteBrowserJourneyInput,
  result: BrowserPortExecutionResult,
  fallbackCapabilityIds: string[],
): BrowserBlocker[] {
  return result.actions
    .filter((action) => action.status === 'blocked' || action.status === 'failed')
    .map((action) => genericBlocker({
      input,
      code: action.failureCode ?? `browser-action-${action.status}`,
      message: action.error ?? `Browser action ${action.actionId} returned ${action.status}.`,
      actionId: action.actionId,
      url: action.url,
      attemptedActions: attemptedActionsThrough(result.actions, action.actionId),
      fallbackCapabilityIds,
      nextAction: nextActionForAction(action),
      retryable: true,
    }));
}

function artifactQualityBlockers(
  input: ExecuteBrowserJourneyInput,
  captures: BrowserArtifactCapture[],
  artifacts: ArtifactIndexInput[],
  fallbackCapabilityIds: string[],
): BrowserBlocker[] {
  const pathByCaptureId = new Map(artifacts.map((artifact) => [artifact.id, artifact.path]));
  return captures
    .filter((capture) => capture.quality?.supportsEvidence === false || (capture.type === 'screenshot' && capture.quality === undefined))
    .map((capture) => genericBlocker({
      input,
      code: `artifact-quality-${capture.quality?.status ?? 'unknown'}`,
      message: capture.quality?.reason ?? `Browser artifact ${capture.id} cannot support successful evidence.`,
      actionId: input.journey.id,
      fallbackCapabilityIds,
      nextAction: `Capture a new screenshot or trace that covers ${input.journey.title}; use manual confirmation only if automation cannot observe it.`,
      retryable: true,
      evidenceRefs: pathByCaptureId.has(capture.id) ? [pathByCaptureId.get(capture.id) as string] : [],
    }));
}

function missingActionBlockersFor(
  input: ExecuteBrowserJourneyInput,
  result: BrowserPortExecutionResult,
  fallbackCapabilityIds: string[],
): BrowserBlocker[] {
  const executedActionIds = new Set(result.actions.map((action) => action.actionId));
  return input.journey.actions
    .filter((action) => !executedActionIds.has(action.id))
    .map((action) => genericBlocker({
      input,
      code: 'browser-action-missing',
      message: `Browser port did not return an execution result for planned action ${action.id}.`,
      actionId: action.id,
      attemptedActions: result.actions.map((executed) => executed.actionId),
      fallbackCapabilityIds,
      nextAction: 'Rerun the same browser journey and require every planned action to return an action result.',
      retryable: true,
    }));
}

function missingArtifactBlockersFor(
  input: ExecuteBrowserJourneyInput,
  artifacts: ArtifactIndexInput[],
  captures: BrowserArtifactCapture[],
  fallbackCapabilityIds: string[],
): BrowserBlocker[] {
  if (artifacts.some((artifact) => artifact.type === 'screenshot' || artifact.type === 'trace')) return [];
  if (captures.length > 0) return [];
  return [genericBlocker({
    input,
    code: 'browser-artifact-missing',
    message: 'Browser execution did not produce a screenshot or trace artifact.',
    actionId: input.journey.id,
    fallbackCapabilityIds,
    nextAction: 'Capture a screenshot or Playwright trace for the planned user journey before using browser evidence.',
    retryable: true,
  })];
}

function determineStatus(
  capabilityKind: BrowserCapabilityKind,
  result: BrowserPortExecutionResult,
  blockers: BrowserBlocker[],
): EvidenceBlock['status'] {
  if (result.status === 'blocked') return 'blocked';
  if (blockers.some((blocker) =>
    blocker.code === 'artifact-path-unsafe' ||
    blocker.code === 'artifact-write-failed' ||
    blocker.code === 'browser-artifact-missing' ||
    blocker.code === 'browser-action-missing' ||
    blocker.code === 'report-only-browser-action-disallowed' ||
    blocker.code === 'page-open-failed' ||
    blocker.code === 'action-timeout'
  )) {
    return 'blocked';
  }
  if (result.status === 'failed' || result.actions.some((action) => action.status === 'failed')) return 'failed';
  if (
    result.status === 'degraded' ||
    trustLevelFor(capabilityKind) === 'degraded' ||
    blockers.length > 0 ||
    result.actions.some((action) => action.status === 'degraded')
  ) {
    return 'degraded';
  }
  if (result.status === 'skipped') return 'skipped';
  return 'passed';
}

function buildResult(input: {
  input: ExecuteBrowserJourneyInput;
  startedAt: string;
  completedAt: string;
  portResult: BrowserPortExecutionResult;
  artifacts: ArtifactIndexInput[];
  blockers: BrowserBlocker[];
  diagnostics: BrowserDiagnostic[];
  status: EvidenceBlock['status'];
  fallbackCapabilityIds: string[];
}): BrowserAdapterResult {
  const evidence = buildEvidence({
    input: input.input,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    status: input.status,
    portResult: input.portResult,
    artifacts: input.artifacts,
    blockers: input.blockers,
  });
  return {
    schemaVersion: 1,
    ok: input.status === 'passed',
    status: input.status,
    capabilityId: input.input.port.capabilityId,
    inputs: {
      runId: input.input.runId,
      goalId: input.input.goalId,
      mode: input.input.mode,
      journeyId: input.input.journey.id,
      entryUrl: input.input.journey.entry.url,
    },
    evidence: [evidence],
    blockers: input.blockers,
    artifacts: input.artifacts,
    diagnostics: input.diagnostics,
    retryable: input.blockers.some((blocker) => blocker.retryable),
    confidence: confidenceFor(input.status, input.input.port.capabilityKind, input.blockers),
    durationMs: input.portResult.durationMs ?? durationMs(input.startedAt, input.completedAt),
    actionResults: input.portResult.actions,
    ...(input.portResult.command === undefined ? {} : { command: input.portResult.command }),
    fallbackCapabilityIds: input.fallbackCapabilityIds,
  };
}

function buildEvidence(input: {
  input: ExecuteBrowserJourneyInput;
  startedAt: string;
  completedAt: string;
  status: EvidenceBlock['status'];
  portResult: BrowserPortExecutionResult;
  artifacts: ArtifactIndexInput[];
  blockers: BrowserBlocker[];
}): EvidenceBlock {
  const actionIds = input.input.journey.actions.map((action) => action.id);
  return {
    schemaVersion: 1,
    id: `browser-${safePathSegment(input.input.runId)}-${safePathSegment(input.input.journey.id)}`,
    runId: input.input.runId,
    goalId: input.input.goalId,
    source: 'browser',
    capabilityId: input.input.port.capabilityId,
    trustLevel: trustLevelFor(input.input.port.capabilityKind),
    status: input.status,
    summary: browserSummary(input.input, input.portResult, input.status),
    artifacts: input.artifacts.map((artifact) => ({
      id: artifact.id,
      type: artifact.type,
      path: artifact.path,
      summary: artifact.summary,
      quality: artifact.quality,
    })),
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    freshness: {
      validatedAt: input.completedAt,
      targetSummary: `${input.input.journey.id} at ${input.input.journey.entry.url}`,
    },
    privacy: {
      classification: 'local-only',
      containsSensitiveData: false,
      redacted: false,
    },
    redactions: [],
    journeyId: input.input.journey.id,
    actionIds,
    visitedUrl: input.portResult.visitedUrl ?? input.input.journey.entry.url,
    pageStates: input.portResult.actions.map((action) => ({
      actionId: action.actionId,
      state: action.pageState ?? action.status,
      url: action.url ?? input.portResult.visitedUrl ?? input.input.journey.entry.url,
    })),
    command: input.portResult.command,
    unverifiedScope: input.status === 'passed' ? [] : input.blockers.map((blocker) => blocker.message),
  };
}

function blockerForExecutionError(
  input: ExecuteBrowserJourneyInput,
  err: unknown,
  fallbackCapabilityIds: string[],
): BrowserBlocker {
  return genericBlocker({
    input,
    code: 'browser-port-execution-failed',
    message: `Browser port failed before returning a result: ${errorMessage(err)}`,
    actionId: input.journey.id,
    fallbackCapabilityIds,
    nextAction: 'Inspect the browser capability configuration and retry with Playwright or Chrome DevTools MCP fallback.',
    retryable: true,
  });
}

function genericBlocker(input: {
  input: ExecuteBrowserJourneyInput;
  code: string;
  message: string;
  actionId: string;
  url?: string;
  attemptedActions?: string[];
  fallbackCapabilityIds: string[];
  nextAction: string;
  retryable: boolean;
  evidenceRefs?: string[];
}): BrowserBlocker {
  return {
    code: input.code,
    category: 'browser',
    message: input.message,
    url: input.url ?? input.input.journey.entry.url,
    journeyId: input.input.journey.id,
    actionId: input.actionId,
    reproduction: `Run browser journey ${input.input.journey.id} at ${input.url ?? input.input.journey.entry.url}.`,
    attemptedActions: input.attemptedActions ?? input.input.journey.actions.map((action) => action.id),
    availableFallbacks: input.fallbackCapabilityIds,
    nextAction: {
      owner: 'agent',
      summary: input.nextAction,
    },
    owner: 'agent',
    riskLevel: 'high',
    evidenceRefs: input.evidenceRefs ?? [],
    retryable: input.retryable,
  };
}

function attemptedActionsThrough(actions: BrowserActionOutcome[], actionId: string): string[] {
  const attempted: string[] = [];
  for (const action of actions) {
    attempted.push(action.actionId);
    if (action.actionId === actionId) break;
  }
  return attempted;
}

function nextActionForAction(action: BrowserActionOutcome): string {
  if (action.failureCode === 'page-open-failed') {
    return 'Start or fix the target service, verify the URL is reachable, then rerun the same browser journey.';
  }
  if (action.failureCode === 'action-timeout') {
    return 'Inspect the selector or page state, confirm the action is still valid, then rerun the same browser journey.';
  }
  return 'Inspect the failed browser action and retry the same journey after the underlying issue is fixed.';
}

function degradedCapabilityDiagnostics(capabilityKind: BrowserCapabilityKind): BrowserDiagnostic[] {
  if (trustLevelFor(capabilityKind) !== 'degraded') return [];
  return [{
    code: 'browser-live-diagnostic-not-rerunnable',
    message: `${capabilityKind} can provide live browser diagnostics but is not rerunnable Playwright evidence.`,
  }];
}

function browserSummary(
  input: ExecuteBrowserJourneyInput,
  result: BrowserPortExecutionResult,
  status: EvidenceBlock['status'],
): string {
  const visitedUrl = result.visitedUrl ?? input.journey.entry.url;
  const actionCount = result.actions.length;
  const artifactCount = (result.artifacts?.length ?? 0) + result.actions.reduce((count, action) => count + (action.artifacts?.length ?? 0), 0);
  const commandSummary = result.command
    ? ` Command: ${result.command.executable} ${result.command.argv.join(' ')} exited ${result.command.exitCode}.`
    : '';
  return `Browser journey ${input.journey.id} ${status} at ${visitedUrl}; actions: ${actionCount}; artifacts: ${artifactCount}.${commandSummary}`;
}

function trustLevelFor(capabilityKind: BrowserCapabilityKind): EvidenceBlock['trustLevel'] {
  if (capabilityKind === 'playwright' || capabilityKind === 'project-e2e') return 'verified';
  if (capabilityKind === 'claude-chrome') return 'manual-confirmed';
  return 'degraded';
}

function confidenceFor(
  status: EvidenceBlock['status'],
  capabilityKind: BrowserCapabilityKind,
  blockers: BrowserBlocker[],
): number {
  if (status === 'passed') return 0.95;
  if (trustLevelFor(capabilityKind) === 'degraded') return 0.55;
  if (blockers.length > 0) return status === 'blocked' ? 0.2 : 0.45;
  return 0.5;
}

function fallbackCapabilities(capabilityKind: BrowserCapabilityKind): string[] {
  if (capabilityKind === 'playwright' || capabilityKind === 'project-e2e') return ['chrome-devtools-mcp', 'chrome-runtime'];
  if (capabilityKind === 'chrome-devtools-mcp' || capabilityKind === 'chrome-runtime' || capabilityKind === 'claude-chrome') return ['playwright'];
  return ['playwright', 'chrome-devtools-mcp', 'chrome-runtime'];
}

function defaultArtifactPath(runId: string, capture: BrowserArtifactCapture): string {
  const run = safePathSegment(runId);
  const id = safePathSegment(capture.id);
  const folder = capture.type === 'screenshot' ? 'screenshots' : 'traces';
  const extension = capture.type === 'screenshot' ? 'png' : 'zip';
  return `.curdx/artifacts/${run}/${folder}/${id}.${extension}`;
}

function isSafeArtifactPathForRun(path: string, runId: string): boolean {
  if (!isWorkspaceRelativePath(path)) return false;
  return path.startsWith(`.curdx/artifacts/${safePathSegment(runId)}/`);
}

function safePathSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]/g, '_');
  return cleaned.length > 0 ? cleaned : 'artifact';
}

function toIso(value?: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function durationMs(startedAt: string, completedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, end - start);
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
