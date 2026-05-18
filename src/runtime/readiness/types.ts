import type { EvidenceBlock } from '../contracts/index.ts';
import type {
  VerificationCommandPlan,
  VerificationCommandPurpose,
  VerificationCommandRiskLevel,
} from '../discovery/command-detection.ts';
import type { RuntimeTopology } from '../discovery/types.ts';
import type { ArtifactIndexInput, EvidenceWriteResult } from '../evidence/types.ts';
import type {
  HealthCheckPlan,
  MultiServiceLifecycleResult,
  ServiceCommand,
  ServiceEnvSummary,
  ServiceLifecycleResult,
  ServicePortClaim,
  ServiceReadinessResult,
  ServiceRelation,
  ServiceRole,
  ServiceStartPlan,
} from '../services/types.ts';

export type RuntimeReadinessStatus = 'ready' | 'degraded' | 'blocked';

export type RuntimeBlockerCategory =
  | 'topology'
  | 'command'
  | 'dependency'
  | 'service'
  | 'health'
  | 'port'
  | 'artifact'
  | 'readiness'
  | 'cleanup';

export type RuntimeBlockerOwner = 'user' | 'curdx-flow' | 'target-project' | 'external-tool';

export interface RuntimeNextAction extends Record<string, unknown> {
  owner: RuntimeBlockerOwner;
  summary: string;
}

export interface RuntimeBlockerReproduction extends Record<string, unknown> {
  command?: string;
  argv?: string[];
  cwd?: string;
  fixture?: string;
  serviceId?: string;
  logArtifactPath?: string;
}

export interface RuntimeBlockerReport extends Record<string, unknown> {
  id: string;
  category: RuntimeBlockerCategory;
  code: string;
  message: string;
  reproduction: RuntimeBlockerReproduction;
  attemptedActions: string[];
  nextAction: RuntimeNextAction;
  owner: RuntimeBlockerOwner;
  riskLevel: VerificationCommandRiskLevel;
  evidenceRefs: string[];
  stdoutWindow?: string;
  stderrWindow?: string;
}

export interface RuntimeReadinessCommandAttempt extends Record<string, unknown> {
  id: string;
  root: string;
  purpose: VerificationCommandPurpose;
  command: ServiceCommand;
  status: 'passed' | 'failed' | 'blocked' | 'skipped';
  exitCode?: number | null;
  summary: string;
  stdoutWindow?: string;
  stderrWindow?: string;
  logArtifactPath?: string;
}

export interface RuntimeReadinessServiceOverride extends Record<string, unknown> {
  id?: string;
  root: string;
  role?: ServiceRole;
  cwd?: string;
  purpose?: VerificationCommandPurpose;
  candidateId?: string;
  command?: ServiceCommand;
  evidenceId?: string;
  logArtifactPath?: string;
  env?: NodeJS.ProcessEnv;
  envSummary?: ServiceEnvSummary;
  maxLogBytes?: number;
  ports?: ServicePortClaim[];
  healthCheck?: HealthCheckPlan;
  riskLevel?: VerificationCommandRiskLevel;
  allowedInReportOnly?: boolean;
  required?: boolean;
  allowReuseExisting?: boolean;
  relations?: ServiceRelation[];
}

export interface RuntimeReadinessSkip extends Record<string, unknown> {
  category: 'external-tool' | 'no-service-plan';
  reason: string;
  command?: string;
  argv?: string[];
  root?: string;
  purpose?: string;
}

export interface RuntimeEvidenceBundle extends Record<string, unknown> {
  evidence: EvidenceBlock[];
  artifacts: ArtifactIndexInput[];
  writeResult?: EvidenceWriteResult;
  reportArtifactPath?: string;
}

export interface RuntimeReadinessInput {
  workspaceRoot: string;
  fixtureName?: string;
  generatedAt?: Date | string;
  mode?: 'report-only' | 'fix' | 'verification' | 'release';
  runId: string;
  goalId: string;
  serviceOverrides?: RuntimeReadinessServiceOverride[];
  relations?: ServiceRelation[];
  allowReuseExisting?: boolean;
  dependencyCheck?: RuntimeReadinessCommandAttempt;
  writeEvidence?: boolean;
  executeExternalTools?: boolean;
}

export interface RuntimeReadinessResult extends Record<string, unknown> {
  status: RuntimeReadinessStatus;
  topology: RuntimeTopology;
  commandPlan: VerificationCommandPlan;
  services?: MultiServiceLifecycleResult;
  serviceReadiness?: ServiceReadinessResult;
  blockers: RuntimeBlockerReport[];
  skips: RuntimeReadinessSkip[];
  evidence: RuntimeEvidenceBundle;
  report: string;
}

export interface RuntimeReadinessFixtureExpectation extends Record<string, unknown> {
  name: string;
  expectedStatus: RuntimeReadinessStatus;
  expectedTopology: {
    overallType: RuntimeTopology['overallType'];
  };
  expectedCommands: VerificationCommandPurpose[];
  expectedHealth?: Record<string, 'passed' | 'degraded' | 'blocked'>;
  expectedBlockerCategories?: RuntimeBlockerCategory[];
  expectedSkipCategories?: RuntimeReadinessSkip['category'][];
}

export interface RuntimeReadinessFactsForEvidence {
  status: RuntimeReadinessStatus;
  input: RuntimeReadinessInput;
  topology: RuntimeTopology;
  commandPlan: VerificationCommandPlan;
  services?: MultiServiceLifecycleResult;
  blockers: RuntimeBlockerReport[];
  report: string;
  generatedAt: string;
}

export type ServiceResultLike = ServiceLifecycleResult;
