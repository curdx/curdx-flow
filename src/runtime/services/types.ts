import type { ChildProcess } from 'node:child_process';

import type {
  VerificationCommandCandidate,
  VerificationCommandMode,
  VerificationCommandRiskLevel,
} from '../discovery/command-detection.ts';

export type ServiceRole = 'frontend' | 'backend' | 'api' | 'database' | 'worker' | 'unknown' | string;
export type ServiceLifecycleStatus = 'running' | 'exited' | 'degraded' | 'blocked';
export type HealthCheckStatus = 'passed' | 'degraded' | 'blocked';
export type HealthCheckKind = 'http' | 'port' | 'process-exit' | 'cli-exit';
export type HealthTrustLevel = 'verified' | 'degraded';
export type ServiceStartupMode = 'cold-started' | 'warm-reused' | 'blocked' | 'skipped';
export type ServiceOwnership = 'curdx-started' | 'user-existing' | 'unknown-existing';
export type ServiceCleanupStatus = 'pending' | 'success' | 'failed' | 'skipped' | 'not-needed';

export interface ServiceCommand extends Record<string, unknown> {
  executable: string;
  argv: string[];
}

export interface ServiceEnvSummary extends Record<string, unknown> {
  providedKeys: string[];
  inheritedProcessEnv: boolean;
}

export interface BaseHealthCheckPlan extends Record<string, unknown> {
  kind: HealthCheckKind;
  confidence?: number;
  inferred?: boolean;
  timeoutMs?: number;
  intervalMs?: number;
}

export interface HttpHealthCheckPlan extends BaseHealthCheckPlan {
  kind: 'http';
  target?: string;
  url?: string;
  endpoint?: string;
  host?: string;
  port?: number;
  protocol?: 'http' | 'https';
  method?: string;
  expectedStatus?: number | number[];
  responseSummaryBytes?: number;
}

export interface PortHealthCheckPlan extends BaseHealthCheckPlan {
  kind: 'port';
  target?: string;
  host?: string;
  port: number;
}

export interface ProcessExitHealthCheckPlan extends BaseHealthCheckPlan {
  kind: 'process-exit' | 'cli-exit';
  expectedExitCode?: number;
  command?: ServiceCommand;
  cwd?: string;
}

export type HealthCheckPlan = HttpHealthCheckPlan | PortHealthCheckPlan | ProcessExitHealthCheckPlan;

export interface HealthCheckResult extends Record<string, unknown> {
  status: HealthCheckStatus;
  target: string;
  trustLevel: HealthTrustLevel;
  confidence: number;
  inferred: boolean;
  needsHumanInput: boolean;
  durationMs: number;
  summary: string;
  responseSummary?: string;
  readySignal?: string;
  httpStatus?: number;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  blockerCode?: string;
}

export interface ServiceStartPlan extends Record<string, unknown> {
  id: string;
  root: string;
  role?: ServiceRole;
  cwd?: string;
  command: ServiceCommand;
  evidenceId?: string;
  logArtifactPath: string;
  startedAt?: Date | string;
  env?: NodeJS.ProcessEnv;
  envSummary?: ServiceEnvSummary;
  maxLogBytes?: number;
  healthCheck?: HealthCheckPlan;
  mode?: VerificationCommandMode;
  riskLevel?: VerificationCommandRiskLevel;
  allowedInReportOnly?: boolean;
  candidateId?: string;
  ports?: ServicePortClaim[];
  required?: boolean;
  allowReuseExisting?: boolean;
  relations?: ServiceRelation[];
}

export interface ServiceRuntimeRecord extends Record<string, unknown> {
  id: string;
  root: string;
  role?: ServiceRole;
  cwd?: string;
  command: string;
  argv: string[];
  pid?: number;
  processHandle?: {
    pid: number;
    spawned: true;
  };
  startedAt?: string;
  envSummary?: ServiceEnvSummary;
  logArtifactPath?: string;
  evidenceId?: string;
  candidateId?: string;
  riskLevel?: VerificationCommandRiskLevel;
  allowedInReportOnly?: boolean;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  ports?: ServicePortClaim[];
  ownership?: ServiceOwnership;
  startupMode?: ServiceStartupMode;
  cleanupStatus?: ServiceCleanupStatus;
}

export interface StartedServiceRuntimeRecord extends ServiceRuntimeRecord {
  cwd: string;
  startedAt: string;
  envSummary: ServiceEnvSummary;
  logArtifactPath: string;
}

export interface ServiceLogWindow extends Record<string, unknown> {
  stdout: string;
  stderr: string;
  truncated: boolean;
}

export interface ServiceBlocker extends Record<string, unknown> {
  code: string;
  serviceId: string;
  root: string;
  command: string;
  argv: string[];
  summary: string;
  stdoutWindow: string;
  stderrWindow: string;
  logArtifactPath: string;
  nextAction: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  layer?: string;
}

export interface ServiceLifecycleResult extends Record<string, unknown> {
  ok: boolean;
  status: ServiceLifecycleStatus;
  record: ServiceRuntimeRecord;
  health?: HealthCheckResult;
  blockers: ServiceBlocker[];
  log: ServiceLogWindow;
  stop?: () => Promise<void>;
}

export interface StartedServiceLifecycleResult extends ServiceLifecycleResult {
  record: StartedServiceRuntimeRecord;
  stop(): Promise<void>;
}

export interface ServiceProcessExit {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

export interface RunHealthCheckContext {
  process?: ChildProcess;
  waitForExit?: Promise<ServiceProcessExit>;
}

export interface ServiceReadinessInput {
  topologyType?: string;
  services: ServiceLifecycleResult[];
  requiresApiEvidence?: boolean;
  requiresDataEvidence?: boolean;
}

export interface ServiceReadinessResult extends Record<string, unknown> {
  status: 'ready' | 'partial' | 'blocked';
  complete: boolean;
  blockers: ServiceBlocker[];
  missingEvidence: string[];
  degradedServices: string[];
  summary: string;
}

export interface ServicePortClaim extends Record<string, unknown> {
  host: string;
  port: number;
  protocol?: 'http' | 'https' | 'tcp';
  target?: string;
  required?: boolean;
  confidence?: number;
}

export interface PortProbeResult extends Record<string, unknown> {
  host: string;
  port: number;
  listening: boolean;
  owner: ServiceOwnership;
  checkedAt: string;
  summary: string;
}

export interface PortConflict extends Record<string, unknown> {
  serviceId: string;
  host: string;
  port: number;
  target?: string;
  owner: ServiceOwnership;
  existingServiceId?: string;
  resolution: 'blocked' | 'reuse' | 'change-port' | 'needs-human-input';
  reason: string;
  riskLevel: VerificationCommandRiskLevel;
  affectsEvidence: string[];
  fallback: string;
}

export interface ServiceRelation extends Record<string, unknown> {
  from: string;
  to: string;
  kind: string;
}

export interface CleanupAttempt extends Record<string, unknown> {
  serviceId: string;
  ownership: ServiceOwnership;
  attemptedAt: string;
  action: 'stop' | 'skip';
  result: 'success' | 'failed' | 'skipped';
  pid?: number;
  signal?: NodeJS.Signals;
  exitCode?: number | null;
  signalCode?: NodeJS.Signals | null;
  remainingProcess: boolean;
  logArtifactPath?: string;
  summary: string;
  nextAction: string;
}

export interface ServiceCleanupSummary extends Record<string, unknown> {
  status: 'pending' | 'clean' | 'blocked' | 'warning';
  attempts: CleanupAttempt[];
  blockers: ServiceBlocker[];
  warnings: ServiceBlocker[];
}

export interface MultiServiceStartPlan extends Record<string, unknown> {
  services: ServiceStartPlan[];
  relations?: ServiceRelation[];
  allowReuseExisting?: boolean;
  generatedAt?: Date | string;
}

export interface MultiServiceLifecycleResult extends Record<string, unknown> {
  status: 'running' | 'partial' | 'degraded' | 'blocked';
  complete: false;
  order: string[];
  relations: ServiceRelation[];
  services: Record<string, ServiceLifecycleResult>;
  portConflicts: PortConflict[];
  blockers: ServiceBlocker[];
  warnings: ServiceBlocker[];
  cleanup: ServiceCleanupSummary;
}

export interface ServiceStartPlanFromCandidateInput {
  candidate: VerificationCommandCandidate;
  cwd?: string;
  id?: string;
  role?: ServiceRole;
  evidenceId?: string;
  logArtifactPath?: string;
  healthCheck?: HealthCheckPlan;
  mode?: VerificationCommandMode;
}
