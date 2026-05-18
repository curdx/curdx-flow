import { spawn } from 'node:child_process';
import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

import { runHealthCheck } from './health.ts';
import { portConflictForClaim, probePort } from './ports.ts';
import type {
  CleanupAttempt,
  HealthCheckResult,
  MultiServiceLifecycleResult,
  MultiServiceStartPlan,
  PortConflict,
  ServiceBlocker,
  ServiceCleanupSummary,
  ServiceEnvSummary,
  ServiceLifecycleResult,
  ServiceLogWindow,
  ServiceOwnership,
  ServiceProcessExit,
  ServiceReadinessInput,
  ServiceReadinessResult,
  ServiceRuntimeRecord,
  ServiceStartPlan,
  ServiceStartPlanFromCandidateInput,
  StartedServiceLifecycleResult,
  StartedServiceRuntimeRecord,
} from './types.ts';

const DEFAULT_MAX_LOG_BYTES = 8_192;
const STOP_GRACE_MS = 750;

export function createServiceStartPlanFromCandidate(input: ServiceStartPlanFromCandidateInput): ServiceStartPlan {
  const candidate = input.candidate;
  return {
    id: input.id ?? candidate.id,
    root: candidate.root,
    role: input.role ?? roleForCandidate(candidate.purpose),
    cwd: input.cwd,
    command: {
      executable: candidate.executable,
      argv: [...candidate.argv],
    },
    evidenceId: input.evidenceId ?? candidate.evidencePurpose,
    logArtifactPath: input.logArtifactPath ?? `.curdx/artifacts/services/${safeId(candidate.id)}.log`,
    healthCheck: input.healthCheck,
    mode: input.mode,
    riskLevel: candidate.riskLevel,
    allowedInReportOnly: candidate.allowedInReportOnly,
    candidateId: candidate.id,
  };
}

export async function startService(input: ServiceStartPlan): Promise<StartedServiceLifecycleResult> {
  const startedAt = normalizeDate(input.startedAt);
  const cwd = input.cwd ?? process.cwd();
  const record: StartedServiceRuntimeRecord = {
    id: input.id,
    root: input.root,
    role: input.role,
    cwd,
    command: input.command.executable,
    argv: [...input.command.argv],
    startedAt,
    envSummary: input.envSummary ?? summarizeEnv(input.env),
    logArtifactPath: input.logArtifactPath,
    evidenceId: input.evidenceId,
    candidateId: input.candidateId,
    riskLevel: input.riskLevel,
    allowedInReportOnly: input.allowedInReportOnly,
    ports: input.ports,
  };
  const logs = new RollingLogWindow(input.maxLogBytes ?? DEFAULT_MAX_LOG_BYTES);

  if (input.mode === 'report-only' && input.allowedInReportOnly === false) {
    const blocker = blockerFromRecord({
      record,
      logs: logs.snapshot(),
      code: 'report-only-execution-disallowed',
      summary: 'Service command is not allowed to execute in report-only mode.',
      nextAction: 'Switch to verification/fix mode or request explicit human approval before starting this service.',
      layer: 'policy',
    });
    return serviceResult({ ok: false, status: 'blocked', record, logs, blockers: [blocker] });
  }

  let logStream: WriteStream | null;
  try {
    logStream = await openLogStream(cwd, input.logArtifactPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logs.append('stderr', message, null);
    const blocker = blockerFromRecord({
      record,
      logs: logs.snapshot(),
      code: 'service-log-artifact-error',
      summary: `Failed to open service log artifact: ${message}`,
      nextAction: 'Inspect the log artifact path and workspace permissions before retrying.',
      layer: 'artifact',
    });
    return serviceResult({ ok: false, status: 'blocked', record, logs, blockers: [blocker] });
  }

  let child;
  try {
    child = spawn(input.command.executable, input.command.argv, {
      cwd,
      env: input.env ? { ...process.env, ...input.env } : process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logs.append('stderr', message, logStream);
    await closeLogStream(logStream);
    const blocker = blockerFromRecord({
      record,
      logs: logs.snapshot(),
      code: 'service-spawn-error',
      summary: `Failed to spawn service command: ${message}`,
      nextAction: 'Inspect the executable path, cwd, and argv array before retrying.',
      layer: 'process',
    });
    return serviceResult({ ok: false, status: 'blocked', record, logs, blockers: [blocker] });
  }

  if (typeof child.pid === 'number') {
    record.pid = child.pid;
    record.processHandle = {
      pid: child.pid,
      spawned: true,
    };
  }

  child.stdout.on('data', (chunk: Buffer) => logs.append('stdout', chunk, logStream));
  child.stderr.on('data', (chunk: Buffer) => logs.append('stderr', chunk, logStream));

  let spawnError: Error | null = null;
  const waitForExit = new Promise<ServiceProcessExit>((resolveExit) => {
    child.once('close', (exitCode, signal) => {
      record.exitCode = exitCode;
      record.signal = signal;
      resolveExit({ exitCode, signal });
    });
  });
  const waitForError = new Promise<Error>((resolveError) => {
    child.once('error', (error) => {
      spawnError = error;
      resolveError(error);
    });
  });

  const stop = async (): Promise<void> => {
    if (!spawnError) await stopChild(child, waitForExit);
    await closeLogStream(logStream);
  };

  if (!input.healthCheck) {
    const health: HealthCheckResult = {
      status: 'degraded',
      target: 'unspecified',
      trustLevel: 'degraded',
      confidence: 0,
      inferred: false,
      needsHumanInput: true,
      durationMs: 0,
      summary: 'Service process started, but no health check was configured.',
    };
    return serviceResult({ ok: true, status: 'degraded', record, health, logs, blockers: [], stop });
  }

  if (input.healthCheck.kind === 'process-exit' || input.healthCheck.kind === 'cli-exit') {
    const processExitOutcome = await Promise.race([
      runHealthCheck(input.healthCheck, { process: child, waitForExit }).then((health) => ({ kind: 'health' as const, health })),
      waitForError.then((error) => ({ kind: 'error' as const, error })),
    ]);
    if (processExitOutcome.kind === 'error') {
      const message = processExitOutcome.error.message;
      logs.append('stderr', message, logStream);
      await closeLogStream(logStream);
      const blocker = blockerFromRecord({
        record,
        logs: logs.snapshot(),
        code: 'service-spawn-error',
        summary: `Service process failed to start: ${message}`,
        nextAction: 'Inspect the executable path, cwd, and argv array before retrying.',
        layer: 'process',
      });
      return serviceResult({ ok: false, status: 'blocked', record, logs, blockers: [blocker], stop });
    }

    const health = spawnError
      ? blockedSpawnHealth(input.healthCheck, spawnError)
      : processExitOutcome.health;
    if (health.status === 'passed' || health.status === 'degraded') {
      await closeLogStream(logStream);
      return serviceResult({
        ok: true,
        status: health.status === 'degraded' ? 'degraded' : 'exited',
        record,
        health,
        logs,
        blockers: [],
        stop,
      });
    }

    await stop();
    const blocker = blockerFromHealth(record, logs.snapshot(), health);
    return serviceResult({ ok: false, status: 'blocked', record, health, logs, blockers: [blocker], stop });
  }

  const winner = await Promise.race([
    runHealthCheck(input.healthCheck, { process: child, waitForExit }).then((health) => ({ kind: 'health' as const, health })),
    waitForExit.then((exit) => ({ kind: 'exit' as const, exit })),
    waitForError.then((error) => ({ kind: 'error' as const, error })),
  ]);

  if (winner.kind === 'error') {
    const message = winner.error.message;
    logs.append('stderr', message, logStream);
    await closeLogStream(logStream);
    const blocker = blockerFromRecord({
      record,
      logs: logs.snapshot(),
      code: 'service-spawn-error',
      summary: `Service process failed to start: ${message}`,
      nextAction: 'Inspect the executable path, cwd, and argv array before retrying.',
      layer: 'process',
    });
    return serviceResult({ ok: false, status: 'blocked', record, logs, blockers: [blocker], stop });
  }

  if (winner.kind === 'exit') {
    await closeLogStream(logStream);
    const blocker = blockerFromRecord({
      record,
      logs: logs.snapshot(),
      code: 'service-exited-before-ready',
      summary: `Service exited before health check passed with code ${winner.exit.exitCode ?? 'null'}.`,
      nextAction: 'Inspect service logs, verify required env/config, then rerun the start command.',
      exitCode: winner.exit.exitCode,
      signal: winner.exit.signal,
      layer: 'process',
    });
    return serviceResult({ ok: false, status: 'blocked', record, logs, blockers: [blocker], stop });
  }

  if (winner.health.status === 'passed' || winner.health.status === 'degraded') {
    return serviceResult({
      ok: true,
      status: winner.health.status === 'degraded' ? 'degraded' : 'running',
      record,
      health: winner.health,
      logs,
      blockers: [],
      stop,
    });
  }

  await stop();
  const blocker = blockerFromHealth(record, logs.snapshot(), winner.health);
  return serviceResult({ ok: false, status: 'blocked', record, health: winner.health, logs, blockers: [blocker], stop });
}

function blockedSpawnHealth(
  plan: NonNullable<ServiceStartPlan['healthCheck']>,
  error: Error,
): HealthCheckResult {
  const expectedExitCode = plan.kind === 'process-exit' || plan.kind === 'cli-exit'
    ? plan.expectedExitCode ?? 0
    : 0;
  return {
    status: 'blocked',
    target: `${plan.kind}:${expectedExitCode}`,
    trustLevel: 'degraded',
    confidence: typeof plan.confidence === 'number' ? plan.confidence : 1,
    inferred: plan.inferred === true,
    needsHumanInput: true,
    durationMs: 0,
    summary: `Service process failed to start: ${error.message}`,
    blockerCode: 'service-spawn-error',
  };
}

export function evaluateServiceReadiness(input: ServiceReadinessInput): ServiceReadinessResult {
  const blockers = input.services.flatMap((service) => service.blockers);
  const degradedServices = input.services
    .filter((service) => service.status === 'degraded' || service.health?.status === 'degraded')
    .map((service) => service.record.id);
  const missingEvidence: string[] = [];
  const needsBackend = input.topologyType === 'full-stack' || input.requiresApiEvidence === true || input.requiresDataEvidence === true;
  const hasFrontendReady = input.services.some((service) => service.record.role === 'frontend' && service.ok);
  const backendServices = input.services.filter((service) => service.record.role === 'backend' || service.record.role === 'api');
  const hasBlockedBackend = backendServices.some((service) => !service.ok || service.status === 'blocked');

  if (needsBackend && hasFrontendReady && hasBlockedBackend) {
    missingEvidence.push('backend/api runtime evidence');
    blockers.push({
      code: 'frontend-success-backend-failed',
      serviceId: 'runtime-readiness',
      root: backendServices[0]?.record.root ?? '.',
      command: backendServices[0]?.record.command ?? '',
      argv: backendServices[0]?.record.argv ?? [],
      summary: '页面可访问不等于全栈完成；后端/API 服务仍然失败或缺少可用证据。',
      stdoutWindow: backendServices[0]?.log.stdout ?? '',
      stderrWindow: backendServices[0]?.log.stderr ?? '',
      logArtifactPath: backendServices[0]?.record.logArtifactPath ?? '',
      nextAction: '先修复后端/API 服务健康检查，再继续 browser/API/data 验证。',
      layer: 'readiness',
    });
  }

  if (needsBackend && backendServices.length === 0) {
    missingEvidence.push('backend/api service');
    blockers.push({
      code: 'backend-service-missing',
      serviceId: 'runtime-readiness',
      root: '.',
      command: '',
      argv: [],
      summary: 'Full-stack readiness requires backend/API service evidence, but no backend/API service result was provided.',
      stdoutWindow: '',
      stderrWindow: '',
      logArtifactPath: '',
      nextAction: 'Add a backend/API service start plan or mark the requirement as not applicable with evidence.',
      layer: 'readiness',
    });
  }

  const status = blockers.length > 0 ? 'blocked' : degradedServices.length > 0 || missingEvidence.length > 0 ? 'partial' : 'ready';
  return {
    status,
    complete: status === 'ready',
    blockers,
    missingEvidence,
    degradedServices,
    summary: status === 'ready'
      ? 'All service readiness checks passed.'
      : `Service readiness is ${status}; ${blockers.length} blocker(s), ${missingEvidence.length} missing evidence item(s).`,
  };
}

export async function startServices(input: MultiServiceStartPlan): Promise<MultiServiceLifecycleResult> {
  const duplicateBlockers = duplicateServiceIdBlockers(input.services);
  if (duplicateBlockers.length > 0) {
    return {
      status: 'blocked',
      complete: false,
      order: input.services.map((service) => service.id),
      relations: input.relations ?? [],
      services: {},
      portConflicts: [],
      blockers: duplicateBlockers,
      warnings: [],
      cleanup: {
        status: 'pending',
        attempts: [],
        blockers: [],
        warnings: [],
      },
    };
  }

  const services: Record<string, ServiceLifecycleResult> = {};
  const order: string[] = [];
  const portConflicts: PortConflict[] = [];
  const blockers: ServiceBlocker[] = [];
  const warnings: ServiceBlocker[] = [];
  const startedPorts = new Map<string, string>();

  for (const servicePlan of input.services) {
    order.push(servicePlan.id);
    const conflict = await detectFirstPortConflict(servicePlan, input.allowReuseExisting === true, startedPorts);
    if (conflict) {
      portConflicts.push(conflict);
      if (conflict.resolution === 'reuse') {
        const reused = await reusedServiceResult(servicePlan, conflict);
        services[servicePlan.id] = reused;
        blockers.push(...reused.blockers);
        continue;
      }

      const blocked = blockedPortConflictResult(servicePlan, conflict);
      services[servicePlan.id] = blocked;
      blockers.push(...blocked.blockers);
      continue;
    }

    const started = await startService(servicePlan);
    started.record.ownership = 'curdx-started';
    started.record.startupMode = started.ok ? 'cold-started' : 'blocked';
    started.record.cleanupStatus = started.ok ? 'pending' : 'not-needed';
    started.record.ports = servicePlan.ports;
    services[servicePlan.id] = started;
    if (started.ok) {
      for (const claim of servicePlan.ports ?? []) {
        startedPorts.set(portKey(claim.host, claim.port), servicePlan.id);
      }
    }
    blockers.push(...started.blockers);
  }

  const degraded = Object.values(services).some((service) => service.status === 'degraded' || service.health?.status === 'degraded');
  const blocked = blockers.length > 0 || Object.values(services).some((service) => service.status === 'blocked');
  return {
    status: blocked ? 'blocked' : degraded ? 'degraded' : 'running',
    complete: false,
    order,
    relations: input.relations ?? [],
    services,
    portConflicts,
    blockers,
    warnings,
    cleanup: {
      status: 'pending',
      attempts: [],
      blockers: [],
      warnings: [],
    },
  };
}

export async function cleanupServices(input: MultiServiceLifecycleResult | ServiceLifecycleResult[]): Promise<ServiceCleanupSummary> {
  const services = Array.isArray(input) ? input : input.order.map((id) => input.services[id]).filter(isServiceResult);
  const attempts: CleanupAttempt[] = [];
  const blockers: ServiceBlocker[] = [];
  const warnings: ServiceBlocker[] = [];

  for (const service of services) {
    const attempt = await cleanupService(service);
    attempts.push(attempt);
    service.record.cleanupStatus = attempt.result === 'success' ? 'success' : attempt.result === 'skipped' ? 'skipped' : 'failed';
    if (attempt.result === 'failed') {
      blockers.push(cleanupBlocker(service, attempt));
    }
  }

  const summary: ServiceCleanupSummary = {
    status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'clean',
    attempts,
    blockers,
    warnings,
  };
  if (!Array.isArray(input)) input.cleanup = summary;
  return summary;
}

async function detectFirstPortConflict(
  servicePlan: ServiceStartPlan,
  allowReuseFromRun: boolean,
  startedPorts: Map<string, string>,
): Promise<PortConflict | null> {
  for (const claim of servicePlan.ports ?? []) {
    const probe = await probePort(claim);
    if (!probe.listening) continue;
    const existingServiceId = startedPorts.get(portKey(claim.host, claim.port));
    return portConflictForClaim({
      serviceId: servicePlan.id,
      claim,
      owner: existingServiceId ? 'curdx-started' : probe.owner,
      existingServiceId,
      allowReuseExisting: servicePlan.allowReuseExisting === true || allowReuseFromRun,
    });
  }
  return null;
}

async function reusedServiceResult(
  servicePlan: ServiceStartPlan,
  conflict: PortConflict,
): Promise<ServiceLifecycleResult> {
  const health = servicePlan.healthCheck
    ? await runHealthCheck(servicePlan.healthCheck)
    : undefined;
  const blocked = health?.status === 'blocked';
  const record: ServiceRuntimeRecord = {
    id: servicePlan.id,
    root: servicePlan.root,
    role: servicePlan.role,
    cwd: servicePlan.cwd ?? process.cwd(),
    command: servicePlan.command.executable,
    argv: [...servicePlan.command.argv],
    startedAt: normalizeDate(servicePlan.startedAt),
    envSummary: servicePlan.envSummary ?? summarizeEnv(servicePlan.env),
    logArtifactPath: servicePlan.logArtifactPath,
    evidenceId: servicePlan.evidenceId,
    candidateId: servicePlan.candidateId,
    riskLevel: servicePlan.riskLevel,
    allowedInReportOnly: servicePlan.allowedInReportOnly,
    ports: servicePlan.ports,
    ownership: conflict.owner,
    startupMode: health?.status === 'degraded' ? 'warm-reused' : 'warm-reused',
    cleanupStatus: 'skipped',
  };
  const blockers = blocked ? [portReuseHealthBlocker(record, health)] : [];
  return {
    ok: !blocked,
    status: blocked ? 'blocked' : health?.status === 'degraded' ? 'degraded' : 'running',
    record,
    health,
    blockers,
    log: { stdout: '', stderr: '', truncated: false },
    stop: async () => {},
  };
}

function blockedPortConflictResult(servicePlan: ServiceStartPlan, conflict: PortConflict): ServiceLifecycleResult {
  const record: ServiceRuntimeRecord = {
    id: servicePlan.id,
    root: servicePlan.root,
    role: servicePlan.role,
    cwd: servicePlan.cwd ?? process.cwd(),
    command: servicePlan.command.executable,
    argv: [...servicePlan.command.argv],
    startedAt: normalizeDate(servicePlan.startedAt),
    envSummary: servicePlan.envSummary ?? summarizeEnv(servicePlan.env),
    logArtifactPath: servicePlan.logArtifactPath,
    evidenceId: servicePlan.evidenceId,
    candidateId: servicePlan.candidateId,
    riskLevel: servicePlan.riskLevel,
    allowedInReportOnly: servicePlan.allowedInReportOnly,
    ports: servicePlan.ports,
    ownership: conflict.owner,
    startupMode: 'blocked',
    cleanupStatus: 'skipped',
  };
  return {
    ok: false,
    status: 'blocked',
    record,
    blockers: [portConflictBlocker(record, conflict)],
    log: { stdout: '', stderr: '', truncated: false },
    stop: async () => {},
  };
}

async function cleanupService(service: ServiceLifecycleResult): Promise<CleanupAttempt> {
  const ownership = service.record.ownership ?? 'unknown-existing';
  const attemptedAt = new Date().toISOString();
  if (ownership !== 'curdx-started') {
    return {
      serviceId: service.record.id,
      ownership,
      attemptedAt,
      action: 'skip',
      result: 'skipped',
      pid: service.record.pid,
      remainingProcess: typeof service.record.pid === 'number' ? isProcessAlive(service.record.pid) : false,
      logArtifactPath: service.record.logArtifactPath,
      summary: 'Cleanup skipped because curdx-flow did not start this service in the current run.',
      nextAction: 'Leave the existing service running; stop it manually only if it belongs to you.',
    };
  }

  try {
    await service.stop?.();
    const remainingProcess = typeof service.record.pid === 'number' ? isProcessAlive(service.record.pid) : false;
    return {
      serviceId: service.record.id,
      ownership,
      attemptedAt,
      action: 'stop',
      result: remainingProcess ? 'failed' : 'success',
      pid: service.record.pid,
      signal: 'SIGTERM',
      exitCode: service.record.exitCode,
      signalCode: service.record.signal,
      remainingProcess,
      logArtifactPath: service.record.logArtifactPath,
      summary: remainingProcess ? 'Cleanup attempted but process still appears to be running.' : 'Service cleanup completed.',
      nextAction: remainingProcess ? 'Manual cleanup required: inspect and stop the remaining curdx-started process.' : 'No further cleanup needed.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      serviceId: service.record.id,
      ownership,
      attemptedAt,
      action: 'stop',
      result: 'failed',
      pid: service.record.pid,
      signal: 'SIGTERM',
      exitCode: service.record.exitCode,
      signalCode: service.record.signal,
      remainingProcess: typeof service.record.pid === 'number' ? isProcessAlive(service.record.pid) : true,
      logArtifactPath: service.record.logArtifactPath,
      summary: `Cleanup failed: ${message}`,
      nextAction: 'Manual cleanup required: inspect the service process and stop it if it is still running.',
    };
  }
}

function isServiceResult(value: ServiceLifecycleResult | undefined): value is ServiceLifecycleResult {
  return typeof value === 'object' && value !== null;
}

function serviceResult(input: {
  ok: boolean;
  status: ServiceLifecycleResult['status'];
  record: StartedServiceRuntimeRecord;
  health?: HealthCheckResult;
  logs: RollingLogWindow;
  blockers: ServiceBlocker[];
  stop?: () => Promise<void>;
}): StartedServiceLifecycleResult {
  return {
    ok: input.ok,
    status: input.status,
    record: input.record,
    health: input.health,
    blockers: input.blockers,
    log: input.logs.snapshot(),
    stop: input.stop ?? (async () => {}),
  };
}

function blockerFromHealth(
  record: ServiceRuntimeRecord,
  log: ServiceLogWindow,
  health: HealthCheckResult,
): ServiceBlocker {
  return blockerFromRecord({
    record,
    logs: log,
    code: health.blockerCode ?? 'health-check-failed',
    summary: health.summary,
    nextAction: 'Inspect service logs, confirm the expected health target, then retry the service start command.',
    exitCode: health.exitCode,
    signal: health.signal,
    layer: 'health',
  });
}

function blockerFromRecord(input: {
  record: ServiceRuntimeRecord;
  logs: ServiceLogWindow;
  code: string;
  summary: string;
  nextAction: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  layer?: string;
}): ServiceBlocker {
  return {
    code: input.code,
    serviceId: input.record.id,
    root: input.record.root,
    command: input.record.command,
    argv: [...input.record.argv],
    summary: input.summary,
    stdoutWindow: input.logs.stdout,
    stderrWindow: input.logs.stderr,
    logArtifactPath: input.record.logArtifactPath ?? '',
    nextAction: input.nextAction,
    exitCode: input.exitCode ?? input.record.exitCode,
    signal: input.signal ?? input.record.signal,
    layer: input.layer,
  };
}

function portConflictBlocker(record: ServiceRuntimeRecord, conflict: PortConflict): ServiceBlocker {
  return blockerFromRecord({
    record,
    logs: { stdout: '', stderr: '', truncated: false },
    code: conflict.owner === 'curdx-started' ? 'port-conflict-curdx-started' : 'port-conflict-user-existing',
    summary: `Port ${conflict.host}:${conflict.port} is already in use by ${conflict.owner}; curdx-flow will not kill it automatically.`,
    nextAction: 'Do not kill the existing process automatically. Stop it manually, choose another port, or allow warm reuse with health evidence.',
    layer: 'port',
  });
}

function duplicateServiceIdBlockers(services: ServiceStartPlan[]): ServiceBlocker[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const service of services) {
    if (seen.has(service.id)) duplicates.add(service.id);
    seen.add(service.id);
  }

  return [...duplicates].map((id) => {
    const service = services.find((candidate) => candidate.id === id);
    return {
      code: 'duplicate-service-id',
      serviceId: id,
      root: service?.root ?? '.',
      command: service?.command.executable ?? '',
      argv: service?.command.argv ?? [],
      summary: `Multi-service plan contains duplicate service id '${id}'.`,
      stdoutWindow: '',
      stderrWindow: '',
      logArtifactPath: service?.logArtifactPath ?? '',
      nextAction: 'Give every service a stable unique id before starting the multi-service plan.',
      layer: 'plan',
    };
  });
}

function portReuseHealthBlocker(record: ServiceRuntimeRecord, health: HealthCheckResult): ServiceBlocker {
  return blockerFromRecord({
    record,
    logs: { stdout: '', stderr: '', truncated: false },
    code: health.blockerCode ?? 'reused-service-health-failed',
    summary: `Existing service could not be reused safely: ${health.summary}`,
    nextAction: 'Do not claim warm reuse. Start a controlled service or fix the existing service health target.',
    layer: 'port',
  });
}

function cleanupBlocker(service: ServiceLifecycleResult, attempt: CleanupAttempt): ServiceBlocker {
  return blockerFromRecord({
    record: service.record,
    logs: service.log,
    code: 'service-cleanup-failed',
    summary: attempt.summary,
    nextAction: attempt.nextAction,
    exitCode: attempt.exitCode,
    signal: attempt.signalCode,
    layer: 'cleanup',
  });
}

async function openLogStream(cwd: string, logArtifactPath: string): Promise<WriteStream | null> {
  const absolutePath = isAbsolute(logArtifactPath) ? logArtifactPath : resolve(cwd, logArtifactPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  return createWriteStream(absolutePath, { flags: 'a' });
}

async function closeLogStream(stream: WriteStream | null): Promise<void> {
  if (!stream || stream.closed || stream.destroyed) return;
  await new Promise<void>((resolveClose) => stream.end(resolveClose));
}

async function stopChild(
  child: ReturnType<typeof spawn>,
  waitForExit: Promise<ServiceProcessExit>,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const exited = await Promise.race([
    waitForExit.then(() => true),
    delay(STOP_GRACE_MS).then(() => false),
  ]);
  if (!exited && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await Promise.race([
      waitForExit.then(() => true),
      delay(STOP_GRACE_MS),
    ]);
  }
}

function summarizeEnv(env: NodeJS.ProcessEnv | undefined): ServiceEnvSummary {
  return {
    providedKeys: Object.keys(env ?? {}).sort(),
    inheritedProcessEnv: true,
  };
}

function normalizeDate(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function roleForCandidate(purpose: string): string {
  if (purpose === 'dev' || purpose === 'start') return 'frontend';
  if (purpose === 'api' || purpose === 'health') return 'api';
  return 'worker';
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'service';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function portKey(host: string, port: number): string {
  return `${host}:${port}`;
}

class RollingLogWindow {
  private stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private stdoutTruncated = false;
  private stderrTruncated = false;

  constructor(private readonly maxBytes: number) {}

  append(kind: 'stdout' | 'stderr', chunk: Buffer | string, stream: WriteStream | null): void {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (stream) stream.write(buffer);
    if (kind === 'stdout') {
      const result = appendBounded(this.stdout, buffer, this.maxBytes);
      this.stdout = result.buffer;
      this.stdoutTruncated ||= result.truncated;
      return;
    }

    const result = appendBounded(this.stderr, buffer, this.maxBytes);
    this.stderr = result.buffer;
    this.stderrTruncated ||= result.truncated;
  }

  snapshot(): ServiceLogWindow {
    return {
      stdout: this.stdout.toString('utf8'),
      stderr: this.stderr.toString('utf8'),
      truncated: this.stdoutTruncated || this.stderrTruncated,
    };
  }
}

function appendBounded(
  current: Buffer<ArrayBufferLike>,
  chunk: Buffer<ArrayBufferLike>,
  maxBytes: number,
): { buffer: Buffer<ArrayBufferLike>; truncated: boolean } {
  const combined = Buffer.concat([current, chunk]);
  if (combined.length <= maxBytes) return { buffer: combined, truncated: false };
  return {
    buffer: combined.subarray(combined.length - maxBytes),
    truncated: true,
  };
}
