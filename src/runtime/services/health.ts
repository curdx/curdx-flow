import { spawn } from 'node:child_process';
import { Socket } from 'node:net';

import type {
  HealthCheckPlan,
  HealthCheckResult,
  HttpHealthCheckPlan,
  PortHealthCheckPlan,
  ProcessExitHealthCheckPlan,
  RunHealthCheckContext,
  ServiceProcessExit,
} from './types.ts';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_INTERVAL_MS = 250;
const DEFAULT_RESPONSE_SUMMARY_BYTES = 512;
const DEGRADED_INFERRED_CONFIDENCE = 0.7;
const CLI_KILL_GRACE_MS = 500;

export async function runHealthCheck(
  plan: HealthCheckPlan,
  context: RunHealthCheckContext = {},
): Promise<HealthCheckResult> {
  if (plan.kind === 'http') return runHttpHealthCheck(plan);
  if (plan.kind === 'port') return runPortHealthCheck(plan);
  return runProcessExitHealthCheck(plan, context);
}

async function runHttpHealthCheck(plan: HttpHealthCheckPlan): Promise<HealthCheckResult> {
  const startedAt = Date.now();
  const timeoutMs = positiveNumber(plan.timeoutMs, DEFAULT_TIMEOUT_MS);
  const intervalMs = positiveNumber(plan.intervalMs, DEFAULT_INTERVAL_MS);
  const target = resolveHttpTarget(plan);
  const deadline = startedAt + timeoutMs;
  let lastError = '';
  let lastStatus: number | undefined;
  let lastSummary = '';

  while (Date.now() <= deadline) {
    const remainingMs = Math.max(1, deadline - Date.now());
    const attemptTimeoutMs = Math.min(Math.max(intervalMs, 100), remainingMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), attemptTimeoutMs);

    try {
      const response = await fetch(target, {
        method: plan.method ?? 'GET',
        signal: controller.signal,
      });
      lastStatus = response.status;
      lastSummary = await readResponseSummary(response, positiveNumber(plan.responseSummaryBytes, DEFAULT_RESPONSE_SUMMARY_BYTES));

      if (matchesExpectedStatus(response.status, plan.expectedStatus)) {
        return passedHealthResult({
          plan,
          target,
          startedAt,
          summary: `HTTP health check passed with status ${response.status}.`,
          responseSummary: lastSummary,
          readySignal: `http:${response.status}`,
          httpStatus: response.status,
        });
      }

      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(timer);
    }

    await delayUntilNextAttempt(intervalMs, deadline);
  }

  const blockerCode = lastStatus === undefined ? 'health-timeout' : 'health-non-2xx';
  return blockedHealthResult({
    plan,
    target,
    startedAt,
    blockerCode,
    summary: lastStatus === undefined
      ? `Health check timed out before ${target} became reachable. Last error: ${lastError || 'none'}.`
      : `Health check reached ${target}, but the last status was ${lastStatus}.`,
    responseSummary: lastSummary || undefined,
    httpStatus: lastStatus,
  });
}

async function runPortHealthCheck(plan: PortHealthCheckPlan): Promise<HealthCheckResult> {
  const startedAt = Date.now();
  const timeoutMs = positiveNumber(plan.timeoutMs, DEFAULT_TIMEOUT_MS);
  const intervalMs = positiveNumber(plan.intervalMs, DEFAULT_INTERVAL_MS);
  const host = plan.host ?? '127.0.0.1';
  const target = plan.target ?? `tcp://${host}:${plan.port}`;
  const deadline = startedAt + timeoutMs;
  let lastError = '';

  while (Date.now() <= deadline) {
    try {
      await connectToPort(host, plan.port, Math.max(1, Math.min(intervalMs, deadline - Date.now())));
      return passedHealthResult({
        plan,
        target,
        startedAt,
        summary: `Port health check passed for ${host}:${plan.port}.`,
        readySignal: `port:${plan.port}`,
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await delayUntilNextAttempt(intervalMs, deadline);
  }

  return blockedHealthResult({
    plan,
    target,
    startedAt,
    blockerCode: 'health-timeout',
    summary: `Port ${host}:${plan.port} did not become reachable before timeout. Last error: ${lastError || 'none'}.`,
  });
}

async function runProcessExitHealthCheck(
  plan: ProcessExitHealthCheckPlan,
  context: RunHealthCheckContext,
): Promise<HealthCheckResult> {
  const startedAt = Date.now();
  const timeoutMs = positiveNumber(plan.timeoutMs, DEFAULT_TIMEOUT_MS);
  const expectedExitCode = plan.expectedExitCode ?? 0;
  const target = `${plan.kind}:${expectedExitCode}`;

  const exit = await waitForProcessExit(plan, context, timeoutMs);
  if (!exit) {
    return blockedHealthResult({
      plan,
      target,
      startedAt,
      blockerCode: 'health-timeout',
      summary: `Process did not exit with code ${expectedExitCode} before timeout.`,
    });
  }

  if (exit.exitCode === expectedExitCode) {
    return passedHealthResult({
      plan,
      target,
      startedAt,
      summary: `Process exited with expected code ${expectedExitCode}.`,
      readySignal: `exit-code:${expectedExitCode}`,
      exitCode: exit.exitCode,
      signal: exit.signal,
    });
  }

  return blockedHealthResult({
    plan,
    target,
    startedAt,
    blockerCode: 'health-exit-code-mismatch',
    summary: `Process exited with code ${exit.exitCode ?? 'null'} instead of expected code ${expectedExitCode}.`,
    exitCode: exit.exitCode,
    signal: exit.signal,
  });
}

async function waitForProcessExit(
  plan: ProcessExitHealthCheckPlan,
  context: RunHealthCheckContext,
  timeoutMs: number,
): Promise<ServiceProcessExit | null> {
  if (context.waitForExit) return withTimeout(context.waitForExit, timeoutMs);
  if (context.process) {
    return withTimeout(new Promise<ServiceProcessExit>((resolve) => {
      context.process?.once('close', (exitCode, signal) => resolve({ exitCode, signal }));
    }), timeoutMs);
  }
  if (plan.command) {
    return runCliExitCommand(plan, timeoutMs);
  }
  return null;
}

async function runCliExitCommand(
  plan: ProcessExitHealthCheckPlan,
  timeoutMs: number,
): Promise<ServiceProcessExit | null> {
  const command = plan.command;
  if (!command) return null;

  const child = spawn(command.executable, command.argv, {
    cwd: plan.cwd,
    shell: false,
    stdio: 'ignore',
  });

  const waitForExit = new Promise<ServiceProcessExit>((resolve) => {
    child.once('close', (exitCode, signal) => resolve({ exitCode, signal }));
    child.once('error', () => resolve({ exitCode: null, signal: null }));
  });
  const exit = await withTimeout(waitForExit, timeoutMs);
  if (!exit && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    await withTimeout(waitForExit, CLI_KILL_GRACE_MS);
  }
  return exit;
}

function passedHealthResult(input: {
  plan: HealthCheckPlan;
  target: string;
  startedAt: number;
  summary: string;
  responseSummary?: string;
  readySignal?: string;
  httpStatus?: number;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
}): HealthCheckResult {
  const confidence = confidenceFor(input.plan);
  const degraded = isLowConfidenceInferred(input.plan);
  return {
    status: degraded ? 'degraded' : 'passed',
    target: input.target,
    trustLevel: degraded ? 'degraded' : 'verified',
    confidence,
    inferred: input.plan.inferred === true,
    needsHumanInput: degraded,
    durationMs: Date.now() - input.startedAt,
    summary: degraded
      ? `${input.summary} Endpoint was inferred with low confidence and needs human confirmation.`
      : input.summary,
    responseSummary: input.responseSummary,
    readySignal: input.readySignal,
    httpStatus: input.httpStatus,
    exitCode: input.exitCode,
    signal: input.signal,
  };
}

function blockedHealthResult(input: {
  plan: HealthCheckPlan;
  target: string;
  startedAt: number;
  blockerCode: string;
  summary: string;
  responseSummary?: string;
  httpStatus?: number;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
}): HealthCheckResult {
  return {
    status: 'blocked',
    target: input.target,
    trustLevel: 'degraded',
    confidence: confidenceFor(input.plan),
    inferred: input.plan.inferred === true,
    needsHumanInput: true,
    durationMs: Date.now() - input.startedAt,
    summary: input.summary,
    responseSummary: input.responseSummary,
    httpStatus: input.httpStatus,
    exitCode: input.exitCode,
    signal: input.signal,
    blockerCode: input.blockerCode,
  };
}

function resolveHttpTarget(plan: HttpHealthCheckPlan): string {
  if (plan.target) return plan.target;
  if (plan.url) return appendEndpoint(plan.url, plan.endpoint);

  const host = plan.host ?? '127.0.0.1';
  const protocol = plan.protocol ?? 'http';
  const endpoint = plan.endpoint ?? '/';
  if (typeof plan.port !== 'number') return appendEndpoint(`${protocol}://${host}`, endpoint);
  return appendEndpoint(`${protocol}://${host}:${plan.port}`, endpoint);
}

function appendEndpoint(base: string, endpoint: string | undefined): string {
  if (!endpoint) return base;
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) return endpoint;
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${normalizedBase}${normalizedEndpoint}`;
}

function matchesExpectedStatus(status: number, expected: number | number[] | undefined): boolean {
  if (Array.isArray(expected)) return expected.includes(status);
  if (typeof expected === 'number') return status === expected;
  return status >= 200 && status < 300;
}

function isLowConfidenceInferred(plan: HealthCheckPlan): boolean {
  return plan.inferred === true && confidenceFor(plan) < DEGRADED_INFERRED_CONFIDENCE;
}

function confidenceFor(plan: HealthCheckPlan): number {
  return typeof plan.confidence === 'number' ? plan.confidence : 1;
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

async function readResponseSummary(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let remaining = maxBytes;
  let truncated = false;

  try {
    while (remaining > 0) {
      const { done, value } = await reader.read();
      if (done) break;

      const buffer = Buffer.from(value);
      if (buffer.length > remaining) {
        chunks.push(buffer.subarray(0, remaining));
        truncated = true;
        break;
      }

      chunks.push(buffer);
      remaining -= buffer.length;
    }

    if (remaining === 0) truncated = true;
  } finally {
    if (truncated) {
      await reader.cancel().catch(() => undefined);
    }
  }

  const summary = Buffer.concat(chunks).toString('utf8');
  return truncated ? `${summary}...[truncated]` : summary;
}

async function delayUntilNextAttempt(intervalMs: number, deadline: number): Promise<void> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return;
  await delay(Math.min(intervalMs, remaining));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function connectToPort(host: string, port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const done = (error?: Error): void => {
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done());
    socket.once('timeout', () => done(new Error('port connect timeout')));
    socket.once('error', (error) => done(error));
    socket.connect(port, host);
  });
}
