export type ContractName =
  | 'evidence'
  | 'stateLedger'
  | 'session'
  | 'adapterResult'
  | 'completionVerdict'
  | 'releaseVerdict'
  | 'actionRiskPolicy'
  | 'hookGate'
  | 'artifactIndex'
  | 'verificationReport'
  | 'runtimeTopology';

export type ContractIssueCode =
  | 'invalid-json'
  | 'not-object'
  | 'missing-required'
  | 'invalid-type'
  | 'invalid-enum'
  | 'invalid-range'
  | 'invalid-pattern'
  | 'invalid-format'
  | 'unsupported-schema-version';

export interface ContractIssue {
  schemaId: string;
  path: string;
  code: ContractIssueCode;
  message: string;
  severity: 'blocked' | 'degraded';
}

export type ContractValidationResult<T extends Record<string, unknown> = Record<string, unknown>> =
  | { ok: true; value: T }
  | { ok: false; issues: ContractIssue[] };

export interface ContractDescriptor {
  schemaId: string;
}

export interface EvidenceBlock extends Record<string, unknown> {
  schemaVersion: 1;
  id: string;
  runId: string;
  goalId: string;
  source: 'command' | 'service' | 'browser' | 'api' | 'data' | 'log' | 'manual' | 'release' | 'hook';
  capabilityId: string;
  trustLevel: 'verified' | 'self-reported' | 'degraded' | 'manual-confirmed';
  status: 'passed' | 'failed' | 'blocked' | 'degraded' | 'skipped';
  summary: string;
  artifacts: unknown[];
  startedAt: string;
  completedAt: string;
  freshness: Record<string, unknown>;
  privacy: Record<string, unknown>;
  redactions: unknown[];
}

export interface StateLedger extends Record<string, unknown> {
  schemaVersion: 1;
  runId: string;
  goalId: string;
  workspaceRoot: string;
  mode: 'report-only' | 'fix' | 'release' | 'verification';
  policy: Record<string, unknown>;
  scope: Record<string, unknown>;
  expectedJourney: Record<string, unknown>;
  status: 'created' | 'running' | 'blocked' | 'partial' | 'complete' | 'review' | 'failed';
  verdictStatus:
    | 'pending'
    | 'complete'
    | 'blocked'
    | 'partial'
    | 'manual-confirmation-required'
    | 'release-ready'
    | 'not-releasable'
    | 'failed';
  phase: string;
  startedAt: string;
  updatedAt: string;
  evidenceIds: string[];
  missingEvidence: unknown[];
  artifactIndexPath: string;
  generatedFiles: unknown[];
  nextAction: Record<string, unknown>;
}

export interface RuntimeSession extends Record<string, unknown> {
  schemaVersion: 1;
  sessionId: string;
  runId: string;
  goalId: string;
  status: 'active' | 'paused' | 'blocked' | 'completed' | 'abandoned';
  currentStep: string;
  resumeSummary: string;
  checkpoints: unknown[];
  missingEvidence: unknown[];
  startedAt: string;
  updatedAt: string;
  nextAction: Record<string, unknown>;
}

export interface AdapterResult extends Record<string, unknown> {
  schemaVersion: 1;
  ok: boolean;
  status: 'passed' | 'failed' | 'blocked' | 'degraded' | 'skipped';
  capabilityId: string;
  inputs: Record<string, unknown>;
  evidence: unknown[];
  blockers: unknown[];
  artifacts: unknown[];
  diagnostics: unknown[];
  retryable: boolean;
  confidence: number;
  durationMs: number;
}

export interface CompletionVerdict extends Record<string, unknown> {
  schemaVersion: 1;
  verdict: 'complete' | 'blocked' | 'partial' | 'manual-confirmation-required' | 'release-ready';
  why: string;
  evidenceRefs: string[];
  missingEvidence: unknown[];
  nextAction: Record<string, unknown>;
  owner: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  unverifiedScope: unknown[];
}

export interface ReleaseVerdict extends Record<string, unknown> {
  schemaVersion: 1;
  runId: string;
  goalId: string;
  generatedAt: string;
  verdict: 'release-ready' | 'not-releasable';
  version: string;
  npmTag: string;
  claudePluginTag: string;
  checks: unknown[];
  missingEvidence: unknown[];
  blockers: unknown[];
  nextAction: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  trustLevel: 'L4' | 'release';
  freshness: Record<string, unknown>;
  sideEffects: unknown[];
  published: false;
  publicationState: 'not-published';
  summary: Record<string, unknown>;
}

export interface ActionRiskPolicy extends Record<string, unknown> {
  schemaVersion: 1;
  policyId: string;
  mode: 'report-only' | 'fix' | 'release';
  defaultRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  allowedWriteRoots?: string[];
  authorization?: Record<string, unknown>;
  rules: ActionRiskPolicyRule[];
  noFalseCompletion: true;
}

export interface ActionRiskPolicyRule extends Record<string, unknown> {
  id: string;
  actionType?: string;
  actionPattern?: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  mutatesWorkspace: boolean;
  destructive: boolean;
  requiresAuthorization: boolean;
  allowedModes: Array<'report-only' | 'fix' | 'release'>;
  requiresReleaseStage?: boolean;
  allowedWriteRoots?: string[];
}

export interface HookGateOutput extends Record<string, unknown> {
  schemaVersion: 1;
  eventName:
    | 'UserPromptSubmit'
    | 'UserPromptExpansion'
    | 'PreToolUse'
    | 'PostToolBatch'
    | 'SessionStart'
    | 'SubagentStart'
    | 'SubagentStop'
    | 'TaskCompleted'
    | 'PostCompact'
    | 'Stop'
    | 'StopFailure';
  runId: string;
  goalId: string;
  decision: 'allow' | 'block' | 'context' | 'fail-open';
  reason: string;
  missingEvidence: unknown[];
  nextAction: Record<string, unknown>;
  failOpen: boolean;
  diagnostics: unknown[];
}

export interface VerificationReport extends Record<string, unknown> {
  schemaVersion: 1;
  runId: string;
  goalId: string;
  status:
    | 'passed'
    | 'failed'
    | 'blocked'
    | 'auto-recovered'
    | 'needs-user-input'
    | 'partial'
    | 'release-ready'
    | 'not-releasable';
  verdict: Record<string, unknown>;
  summary: string;
  evidenceRefs: string[];
  artifactIndex: unknown[];
  blockers: unknown[];
  missingEvidence: unknown[];
  generatedAt: string;
  privacy: Record<string, unknown>;
  transcriptSummary: string;
  evidenceSummaries: unknown[];
  artifactSummaries: unknown[];
  sections: Record<string, unknown>;
  sourceChanges: Record<string, unknown>;
  reportOnly: boolean;
  verifier: Record<string, unknown>;
}

export interface ArtifactIndexEntry extends Record<string, unknown> {
  schemaVersion: 1;
  id: string;
  runId: string;
  goalId: string;
  evidenceId: string;
  type: 'screenshot' | 'trace' | 'log' | 'request' | 'response' | 'report' | 'state' | 'other';
  path: string;
  summary: string;
  privacy: {
    classification: 'public' | 'internal' | 'confidential' | 'secret' | 'local-only';
    containsSensitiveData: boolean;
    redacted: boolean;
  } & Record<string, unknown>;
  createdAt: string;
}

export interface RuntimeTopology extends Record<string, unknown> {
  schemaVersion: 1;
  workspaceRoot: string;
  generatedAt: string;
  overallType: 'frontend' | 'backend' | 'full-stack' | 'cli' | 'library' | 'monorepo' | 'claude-code-plugin' | 'unknown';
  status: 'ready' | 'needs-human-input' | 'blocked';
  confidence: number;
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | 'unknown';
  roots: unknown[];
  pluginRoots: unknown[];
  blockers: unknown[];
  hints: unknown[];
}

export type ContractValue =
  | EvidenceBlock
  | StateLedger
  | RuntimeSession
  | AdapterResult
  | CompletionVerdict
  | ReleaseVerdict
  | ActionRiskPolicy
  | HookGateOutput
  | ArtifactIndexEntry
  | VerificationReport
  | RuntimeTopology;

export const CONTRACTS = {
  evidence: {
    schemaId: 'curdx-flow/evidence',
  },
  stateLedger: {
    schemaId: 'curdx-flow/state-ledger',
  },
  session: {
    schemaId: 'curdx-flow/session',
  },
  adapterResult: {
    schemaId: 'curdx-flow/adapter-result',
  },
  completionVerdict: {
    schemaId: 'curdx-flow/completion-verdict',
  },
  releaseVerdict: {
    schemaId: 'curdx-flow/release-verdict',
  },
  actionRiskPolicy: {
    schemaId: 'curdx-flow/action-risk-policy',
  },
  hookGate: {
    schemaId: 'curdx-flow/hook-gate',
  },
  artifactIndex: {
    schemaId: 'curdx-flow/artifact-index',
  },
  verificationReport: {
    schemaId: 'curdx-flow/verification-report',
  },
  runtimeTopology: {
    schemaId: 'curdx-flow/runtime-topology',
  },
} as const satisfies Record<ContractName, ContractDescriptor>;

type FieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';

interface FieldRule {
  type: FieldType;
  enum?: readonly string[];
  constValue?: unknown;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  format?: 'date-time';
  itemType?: FieldType;
}

type ContractRules = Record<string, FieldRule>;

const riskLevels = ['low', 'medium', 'high', 'critical'] as const;
const actionPolicyModes = ['report-only', 'fix', 'release'] as const;
const reportOnlyWriteRoots = ['.curdx/reports', '.curdx/evidence', '.curdx/artifacts', '.curdx/state'] as const;
const actionTypes = [
  'read',
  'command',
  'verification-rerun',
  'browser-check',
  'api-check',
  'log-read',
  'report-write',
  'evidence-write',
  'artifact-write',
  'state-write',
  'source-edit',
  'generated-verification-file',
  'config-edit',
  'dependency-install',
  'database-migration',
  'destructive-migration',
  'delete-file',
  'global-config-change',
  'git-push',
  'git-tag',
  'npm-publish',
  'plugin-release',
  'production-data-access',
  'release',
] as const;
const resultStatuses = ['passed', 'failed', 'blocked', 'degraded', 'skipped'] as const;
const artifactTypes = ['screenshot', 'trace', 'log', 'request', 'response', 'report', 'state', 'other'] as const;
const privacyClassifications = ['public', 'internal', 'confidential', 'secret', 'local-only'] as const;
const freshnessTargetFields = ['commandHash', 'targetHash', 'fileTargets', 'environmentId', 'targetSummary'] as const;
const generatedFileCategories = [
  'source-change',
  'generated-verification-file',
  'temporary-artifact',
  'report',
  'evidence',
  'user-existing-file',
  'external-tool-output',
] as const;
const verdictStatuses = [
  'pending',
  'complete',
  'blocked',
  'partial',
  'manual-confirmation-required',
  'release-ready',
  'not-releasable',
  'failed',
] as const;
const runtimeProjectTypes = ['frontend', 'backend', 'full-stack', 'cli', 'library', 'monorepo', 'claude-code-plugin', 'unknown'] as const;
const runtimeTopologyStatuses = ['ready', 'needs-human-input', 'blocked'] as const;
const runtimePackageManagers = ['npm', 'pnpm', 'yarn', 'bun', 'unknown'] as const;
const discoveryHintKinds = ['entry', 'script', 'service', 'api', 'data', 'browser', 'test', 'validation', 'plugin'] as const;
const discoveryBlockerSeverities = ['blocked', 'needs-human-input'] as const;

const CONTRACT_RULES: Record<ContractName, ContractRules> = {
  evidence: {
    schemaVersion: { type: 'number', constValue: 1 },
    id: { type: 'string', minLength: 1 },
    runId: { type: 'string', minLength: 1 },
    goalId: { type: 'string', minLength: 1 },
    source: { type: 'string', enum: ['command', 'service', 'browser', 'api', 'data', 'log', 'manual', 'release', 'hook'] },
    capabilityId: { type: 'string', minLength: 1 },
    trustLevel: { type: 'string', enum: ['verified', 'self-reported', 'degraded', 'manual-confirmed'] },
    status: { type: 'string', enum: resultStatuses },
    summary: { type: 'string', minLength: 1 },
    artifacts: { type: 'array', itemType: 'object' },
    startedAt: { type: 'string', format: 'date-time' },
    completedAt: { type: 'string', format: 'date-time' },
    freshness: { type: 'object' },
    privacy: { type: 'object' },
    redactions: { type: 'array', itemType: 'object' },
  },
  stateLedger: {
    schemaVersion: { type: 'number', constValue: 1 },
    runId: { type: 'string' },
    goalId: { type: 'string' },
    workspaceRoot: { type: 'string', minLength: 1 },
    mode: { type: 'string', enum: ['report-only', 'fix', 'release', 'verification'] },
    policy: { type: 'object' },
    scope: { type: 'object' },
    expectedJourney: { type: 'object' },
    status: { type: 'string', enum: ['created', 'running', 'blocked', 'partial', 'complete', 'review', 'failed'] },
    verdictStatus: { type: 'string', enum: verdictStatuses },
    phase: { type: 'string', minLength: 1 },
    startedAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    evidenceIds: { type: 'array', itemType: 'string' },
    missingEvidence: { type: 'array' },
    artifactIndexPath: { type: 'string', minLength: 1 },
    generatedFiles: { type: 'array', itemType: 'object' },
    nextAction: { type: 'object' },
  },
  session: {
    schemaVersion: { type: 'number', constValue: 1 },
    sessionId: { type: 'string' },
    runId: { type: 'string' },
    goalId: { type: 'string' },
    status: { type: 'string', enum: ['active', 'paused', 'blocked', 'completed', 'abandoned'] },
    currentStep: { type: 'string', minLength: 1 },
    resumeSummary: { type: 'string', minLength: 1 },
    checkpoints: { type: 'array', itemType: 'object' },
    missingEvidence: { type: 'array' },
    startedAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    nextAction: { type: 'object' },
  },
  adapterResult: {
    schemaVersion: { type: 'number', constValue: 1 },
    ok: { type: 'boolean' },
    status: { type: 'string', enum: resultStatuses },
    capabilityId: { type: 'string' },
    inputs: { type: 'object' },
    evidence: { type: 'array' },
    blockers: { type: 'array' },
    artifacts: { type: 'array' },
    diagnostics: { type: 'array' },
    retryable: { type: 'boolean' },
    confidence: { type: 'number', min: 0, max: 1 },
    durationMs: { type: 'number', min: 0 },
  },
  completionVerdict: {
    schemaVersion: { type: 'number', constValue: 1 },
    verdict: { type: 'string', enum: ['complete', 'blocked', 'partial', 'manual-confirmation-required', 'release-ready'] },
    why: { type: 'string', minLength: 1 },
    evidenceRefs: { type: 'array', itemType: 'string' },
    missingEvidence: { type: 'array' },
    nextAction: { type: 'object' },
    owner: { type: 'string', minLength: 1 },
    riskLevel: { type: 'string', enum: riskLevels },
    confidence: { type: 'number', min: 0, max: 1 },
    unverifiedScope: { type: 'array', itemType: 'object' },
  },
  releaseVerdict: {
    schemaVersion: { type: 'number', constValue: 1 },
    runId: { type: 'string', minLength: 1 },
    goalId: { type: 'string', minLength: 1 },
    generatedAt: { type: 'string', format: 'date-time' },
    verdict: { type: 'string', enum: ['release-ready', 'not-releasable'] },
    version: { type: 'string', minLength: 1 },
    npmTag: { type: 'string', pattern: /^v\d+\.\d+\.\d+/ },
    claudePluginTag: { type: 'string', pattern: /^curdx-flow--v\d+\.\d+\.\d+/ },
    checks: { type: 'array', itemType: 'object' },
    missingEvidence: { type: 'array' },
    blockers: { type: 'array' },
    nextAction: { type: 'object' },
    riskLevel: { type: 'string', enum: riskLevels },
    trustLevel: { type: 'string', enum: ['L4', 'release'] },
    freshness: { type: 'object' },
    sideEffects: { type: 'array', itemType: 'object' },
    published: { type: 'boolean', constValue: false },
    publicationState: { type: 'string', enum: ['not-published'] },
    summary: { type: 'object' },
  },
  actionRiskPolicy: {
    schemaVersion: { type: 'number', constValue: 1 },
    policyId: { type: 'string', minLength: 1 },
    mode: { type: 'string', enum: ['report-only', 'fix', 'release'] },
    defaultRiskLevel: { type: 'string', enum: riskLevels },
    rules: { type: 'array', itemType: 'object' },
    noFalseCompletion: { type: 'boolean', constValue: true },
  },
  hookGate: {
    schemaVersion: { type: 'number', constValue: 1 },
    eventName: {
      type: 'string',
      enum: [
        'UserPromptSubmit',
        'UserPromptExpansion',
        'PreToolUse',
        'PostToolBatch',
        'SessionStart',
        'SubagentStart',
        'SubagentStop',
        'TaskCompleted',
        'PostCompact',
        'Stop',
        'StopFailure',
      ],
    },
    runId: { type: 'string' },
    goalId: { type: 'string' },
    decision: { type: 'string', enum: ['allow', 'block', 'context', 'fail-open'] },
    reason: { type: 'string' },
    missingEvidence: { type: 'array' },
    nextAction: { type: 'object' },
    failOpen: { type: 'boolean' },
    diagnostics: { type: 'array' },
  },
  artifactIndex: {
    schemaVersion: { type: 'number', constValue: 1 },
    id: { type: 'string', minLength: 1 },
    runId: { type: 'string', minLength: 1 },
    goalId: { type: 'string', minLength: 1 },
    evidenceId: { type: 'string', minLength: 1 },
    type: { type: 'string', enum: artifactTypes },
    path: { type: 'string', minLength: 1 },
    summary: { type: 'string', minLength: 1, maxLength: 500 },
    privacy: { type: 'object' },
    createdAt: { type: 'string', format: 'date-time' },
  },
  verificationReport: {
    schemaVersion: { type: 'number', constValue: 1 },
    runId: { type: 'string', minLength: 1 },
    goalId: { type: 'string', minLength: 1 },
    status: {
      type: 'string',
      enum: ['passed', 'failed', 'blocked', 'auto-recovered', 'needs-user-input', 'partial', 'release-ready', 'not-releasable'],
    },
    verdict: { type: 'object' },
    summary: { type: 'string', minLength: 1 },
    evidenceRefs: { type: 'array', itemType: 'string' },
    artifactIndex: { type: 'array', itemType: 'object' },
    blockers: { type: 'array' },
    missingEvidence: { type: 'array' },
    generatedAt: { type: 'string', format: 'date-time' },
    privacy: { type: 'object' },
    transcriptSummary: { type: 'string', minLength: 1, maxLength: 1200 },
    evidenceSummaries: { type: 'array', itemType: 'object' },
    artifactSummaries: { type: 'array', itemType: 'object' },
    sections: { type: 'object' },
    sourceChanges: { type: 'object' },
    reportOnly: { type: 'boolean' },
    verifier: { type: 'object' },
  },
  runtimeTopology: {
    schemaVersion: { type: 'number', constValue: 1 },
    workspaceRoot: { type: 'string', minLength: 1 },
    generatedAt: { type: 'string', format: 'date-time' },
    overallType: { type: 'string', enum: runtimeProjectTypes },
    status: { type: 'string', enum: runtimeTopologyStatuses },
    confidence: { type: 'number', min: 0, max: 1 },
    packageManager: { type: 'string', enum: runtimePackageManagers },
    roots: { type: 'array', itemType: 'object' },
    pluginRoots: { type: 'array', itemType: 'object' },
    blockers: { type: 'array', itemType: 'object' },
    hints: { type: 'array', itemType: 'object' },
  },
};

export function validateContract(
  contractName: ContractName,
  payload: unknown,
): ContractValidationResult {
  const descriptor = CONTRACTS[contractName];
  const issues: ContractIssue[] = [];

  if (!isRecord(payload)) {
    return {
      ok: false,
      issues: [
        {
          schemaId: descriptor.schemaId,
          path: '$',
          code: 'not-object',
          message: 'Contract payload must be an object.',
          severity: 'blocked',
        },
      ],
    };
  }

  const rules = CONTRACT_RULES[contractName];
  for (const [field, rule] of Object.entries(rules)) {
    validateField(descriptor.schemaId, payload, field, rule, issues);
  }
  validateContractSpecificRules(contractName, descriptor.schemaId, payload, issues);

  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: payload };
}

export function parseContractJson(
  contractName: ContractName,
  raw: string,
): ContractValidationResult {
  const descriptor = CONTRACTS[contractName];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      issues: [
        {
          schemaId: descriptor.schemaId,
          path: '$',
          code: 'invalid-json',
          message,
          severity: 'blocked',
        },
      ],
    };
  }

  return validateContract(contractName, parsed);
}

function validateField(
  schemaId: string,
  payload: Record<string, unknown>,
  field: string,
  rule: FieldRule,
  issues: ContractIssue[],
): void {
  if (!(field in payload)) {
    issues.push(issue(schemaId, `$.${field}`, 'missing-required', `Missing required field '${field}'.`));
    return;
  }

  const value = payload[field];
  if (!matchesType(value, rule.type)) {
    issues.push(issue(schemaId, `$.${field}`, 'invalid-type', `Expected '${field}' to be ${rule.type}.`));
    return;
  }

  if (field === 'schemaVersion' && value !== 1) {
    issues.push(issue(schemaId, '$.schemaVersion', 'unsupported-schema-version', 'Only schemaVersion 1 is supported.'));
    return;
  }

  if (rule.constValue !== undefined && value !== rule.constValue) {
    issues.push(issue(schemaId, `$.${field}`, 'invalid-enum', `Expected '${field}' to equal ${String(rule.constValue)}.`));
    return;
  }

  if (typeof value === 'string' && rule.enum !== undefined && !rule.enum.includes(value)) {
    issues.push(issue(schemaId, `$.${field}`, 'invalid-enum', `Invalid enum value '${value}' for '${field}'.`));
    return;
  }

  if (typeof value === 'string') {
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      issues.push(issue(schemaId, `$.${field}`, 'invalid-range', `'${field}' must not be empty.`));
      return;
    }
    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      issues.push(issue(schemaId, `$.${field}`, 'invalid-range', `'${field}' must be <= ${rule.maxLength} characters.`));
      return;
    }
    if (rule.pattern !== undefined && !rule.pattern.test(value)) {
      issues.push(issue(schemaId, `$.${field}`, 'invalid-pattern', `'${field}' does not match the required pattern.`));
      return;
    }
    if (rule.format === 'date-time' && Number.isNaN(Date.parse(value))) {
      issues.push(issue(schemaId, `$.${field}`, 'invalid-format', `'${field}' must be an ISO date-time string.`));
      return;
    }
  }

  if (Array.isArray(value) && rule.itemType !== undefined) {
    const badIndex = value.findIndex((item) => !matchesType(item, rule.itemType as FieldType));
    if (badIndex !== -1) {
      issues.push(issue(schemaId, `$.${field}[${badIndex}]`, 'invalid-type', `Expected '${field}' items to be ${rule.itemType}.`));
      return;
    }
  }

  if (typeof value === 'number') {
    if (rule.min !== undefined && value < rule.min) {
      issues.push(issue(schemaId, `$.${field}`, 'invalid-range', `'${field}' must be >= ${rule.min}.`));
      return;
    }
    if (rule.max !== undefined && value > rule.max) {
      issues.push(issue(schemaId, `$.${field}`, 'invalid-range', `'${field}' must be <= ${rule.max}.`));
    }
  }
}

function validateContractSpecificRules(
  contractName: ContractName,
  schemaId: string,
  payload: Record<string, unknown>,
  issues: ContractIssue[],
): void {
  if (contractName === 'evidence') {
    validateEvidenceFreshness(schemaId, payload.freshness, issues);
  }

  if (contractName === 'stateLedger') {
    validateStateLedgerDetails(schemaId, payload, issues);
  }

  if (contractName === 'artifactIndex') {
    validateArtifactPath(schemaId, payload.path, issues);
    validateArtifactPrivacy(schemaId, payload.privacy, issues);
  }

  if (contractName === 'verificationReport') {
    validateVerificationReportDetails(schemaId, payload, issues);
  }

  if (contractName === 'actionRiskPolicy') {
    validateActionRiskPolicyDetails(schemaId, payload, issues);
  }

  if (contractName === 'releaseVerdict') {
    validateReleaseVerdictDetails(schemaId, payload, issues);
  }

  if (contractName === 'runtimeTopology') {
    validateRuntimeTopologyDetails(schemaId, payload, issues);
  }
}

function validateReleaseVerdictDetails(
  schemaId: string,
  payload: Record<string, unknown>,
  issues: ContractIssue[],
): void {
  const freshness = payload.freshness;
  if (!isRecord(freshness)) return;

  validateBooleanField(schemaId, '$.freshness.ok', freshness.ok, issues);
  if (!Array.isArray(freshness.reasons) || freshness.reasons.some((item) => typeof item !== 'string')) {
    issues.push(issue(schemaId, '$.freshness.reasons', 'invalid-type', "'freshness.reasons' must be an array of strings."));
  }

  const context = freshness.context;
  if (!isRecord(context)) {
    issues.push(issue(schemaId, '$.freshness.context', 'invalid-type', "'freshness.context' must be an object."));
    return;
  }

  validateNonEmptyStringField(schemaId, '$.freshness.context.currentCommit', context.currentCommit, issues);
  validateNonEmptyStringField(schemaId, '$.freshness.context.version', context.version, issues);
  validatePatternField(schemaId, '$.freshness.context.npmTag', context.npmTag, /^v\d+\.\d+\.\d+/, issues);
  validatePatternField(schemaId, '$.freshness.context.claudePluginTag', context.claudePluginTag, /^curdx-flow--v\d+\.\d+\.\d+/, issues);
  validateDateTimeField(schemaId, '$.freshness.context.generatedAt', context.generatedAt, issues);
  if (!Array.isArray(context.evidenceRefs) || context.evidenceRefs.some((item) => typeof item !== 'string')) {
    issues.push(issue(schemaId, '$.freshness.context.evidenceRefs', 'invalid-type', "'freshness.context.evidenceRefs' must be an array of strings."));
  }

  const summary = payload.summary;
  if (!isRecord(summary)) return;
  validateNonEmptyStringField(schemaId, '$.summary.headline', summary.headline, issues);
  validateEnumField(schemaId, '$.summary.publicationState', summary.publicationState, ['not-published'], issues);
  validateEnumField(schemaId, '$.summary.statusLabel', summary.statusLabel, ['可发布', '不可发布'], issues);
  validateBooleanField(schemaId, '$.summary.dryRunOnly', summary.dryRunOnly, issues);
  if (summary.dryRunOnly !== true) {
    issues.push(issue(schemaId, '$.summary.dryRunOnly', 'invalid-enum', "'summary.dryRunOnly' must be true."));
  }
}

function validateRuntimeTopologyDetails(
  schemaId: string,
  payload: Record<string, unknown>,
  issues: ContractIssue[],
): void {
  validateRuntimeRoots(schemaId, payload.roots, issues);
  validateRuntimePluginRoots(schemaId, payload.pluginRoots, issues);
  validateDiscoveryBlockers(schemaId, '$.blockers', payload.blockers, issues);
  validateDiscoveryHints(schemaId, '$.hints', payload.hints, issues);
}

function validateRuntimeRoots(
  schemaId: string,
  value: unknown,
  issues: ContractIssue[],
): void {
  if (!Array.isArray(value)) return;

  value.forEach((entry, index) => {
    const pathPrefix = `$.roots[${index}]`;
    if (!isRecord(entry)) return;

    validateTopologyRelativeField(schemaId, `${pathPrefix}.path`, entry.path, issues);
    validateEnumField(schemaId, `${pathPrefix}.type`, entry.type, runtimeProjectTypes, issues);
    validateEnumField(schemaId, `${pathPrefix}.status`, entry.status, runtimeTopologyStatuses, issues);
    validateNumberRangeField(schemaId, `${pathPrefix}.confidence`, entry.confidence, 0, 1, issues);
    validateEnumField(schemaId, `${pathPrefix}.packageManager`, entry.packageManager, runtimePackageManagers, issues);
    if (entry.packageJsonPath !== null) {
      validateTopologyRelativeField(schemaId, `${pathPrefix}.packageJsonPath`, entry.packageJsonPath, issues);
    }
    if (!isRecord(entry.scripts)) {
      issues.push(issue(schemaId, `${pathPrefix}.scripts`, 'invalid-type', "'scripts' must be an object."));
    } else {
      for (const [scriptName, command] of Object.entries(entry.scripts)) {
        if (scriptName.length === 0) {
          issues.push(issue(schemaId, `${pathPrefix}.scripts`, 'invalid-range', 'Script names must not be empty.'));
        }
        if (typeof command !== 'string') {
          issues.push(issue(schemaId, `${pathPrefix}.scripts.${scriptName}`, 'invalid-type', 'Script command must be a string.'));
        }
      }
    }

    for (const field of ['entryHints', 'scriptHints', 'serviceHints', 'apiHints', 'dataHints', 'browserHints', 'validationHints', 'pluginHints']) {
      validateDiscoveryHints(schemaId, `${pathPrefix}.${field}`, entry[field], issues);
    }
    validateDiscoveryBlockers(schemaId, `${pathPrefix}.blockers`, entry.blockers, issues);
    if (!Array.isArray(entry.reasons)) {
      issues.push(issue(schemaId, `${pathPrefix}.reasons`, 'invalid-type', "'reasons' must be an array."));
    } else {
      entry.reasons.forEach((reason, reasonIndex) => validateRequiredStringField(schemaId, `${pathPrefix}.reasons[${reasonIndex}]`, reason, issues));
    }
  });
}

function validateRuntimePluginRoots(
  schemaId: string,
  value: unknown,
  issues: ContractIssue[],
): void {
  if (!Array.isArray(value)) return;

  value.forEach((entry, index) => {
    const pathPrefix = `$.pluginRoots[${index}]`;
    if (!isRecord(entry)) return;

    validateTopologyRelativeField(schemaId, `${pathPrefix}.path`, entry.path, issues);
    validateTopologyRelativeField(schemaId, `${pathPrefix}.manifestPath`, entry.manifestPath, issues);
    if (entry.hooksPath !== null) validateTopologyRelativeField(schemaId, `${pathPrefix}.hooksPath`, entry.hooksPath, issues);
    if (entry.skillsPath !== null) validateTopologyRelativeField(schemaId, `${pathPrefix}.skillsPath`, entry.skillsPath, issues);
    if (entry.agentsPath !== null) validateTopologyRelativeField(schemaId, `${pathPrefix}.agentsPath`, entry.agentsPath, issues);

    if (!Array.isArray(entry.binPaths)) {
      issues.push(issue(schemaId, `${pathPrefix}.binPaths`, 'invalid-type', "'binPaths' must be an array."));
    } else {
      entry.binPaths.forEach((binPath, binIndex) => validateTopologyRelativeField(schemaId, `${pathPrefix}.binPaths[${binIndex}]`, binPath, issues));
    }

    const validationCommand = entry.validationCommand;
    if (!isRecord(validationCommand)) {
      issues.push(issue(schemaId, `${pathPrefix}.validationCommand`, 'invalid-type', "'validationCommand' must be an object."));
    } else {
      if (validationCommand.executable !== 'claude') {
        issues.push(issue(schemaId, `${pathPrefix}.validationCommand.executable`, 'invalid-enum', "Plugin validation executable must be 'claude'."));
      }
      if (!Array.isArray(validationCommand.argv)) {
        issues.push(issue(schemaId, `${pathPrefix}.validationCommand.argv`, 'invalid-type', "'argv' must be an array."));
      } else if (
        validationCommand.argv.length !== 3
        || validationCommand.argv[0] !== 'plugin'
        || validationCommand.argv[1] !== 'validate'
        || typeof validationCommand.argv[2] !== 'string'
      ) {
        issues.push(issue(schemaId, `${pathPrefix}.validationCommand.argv`, 'invalid-enum', "Plugin validation argv must be ['plugin', 'validate', '<plugin-root>']."));
      } else {
        validateTopologyRelativeField(schemaId, `${pathPrefix}.validationCommand.argv[2]`, validationCommand.argv[2], issues);
      }
      if (validationCommand.cwd !== '.') {
        issues.push(issue(schemaId, `${pathPrefix}.validationCommand.cwd`, 'invalid-enum', "Plugin validation cwd must be '.'."));
      }
    }

    const wiring = entry.wiring;
    if (!isRecord(wiring)) {
      issues.push(issue(schemaId, `${pathPrefix}.wiring`, 'invalid-type', "'wiring' must be an object."));
    } else {
      if (wiring.manifest !== true) {
        issues.push(issue(schemaId, `${pathPrefix}.wiring.manifest`, 'invalid-enum', "'wiring.manifest' must be true."));
      }
      for (const field of ['hooks', 'skills', 'agents', 'bin']) {
        validateBooleanField(schemaId, `${pathPrefix}.wiring.${field}`, wiring[field], issues);
      }
    }
  });
}

function validateDiscoveryHints(
  schemaId: string,
  pathPrefix: string,
  value: unknown,
  issues: ContractIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push(issue(schemaId, pathPrefix, 'invalid-type', `'${pathPrefix}' must be an array.`));
    return;
  }

  value.forEach((entry, index) => {
    const entryPath = `${pathPrefix}[${index}]`;
    if (!isRecord(entry)) return;
    validateEnumField(schemaId, `${entryPath}.kind`, entry.kind, discoveryHintKinds, issues);
    validateRequiredStringField(schemaId, `${entryPath}.source`, entry.source, issues);
    validateRequiredStringField(schemaId, `${entryPath}.summary`, entry.summary, issues);
    validateNumberRangeField(schemaId, `${entryPath}.confidence`, entry.confidence, 0, 1, issues);
    if ('path' in entry) validateTopologyRelativeField(schemaId, `${entryPath}.path`, entry.path, issues);
    if ('scriptName' in entry) validateRequiredStringField(schemaId, `${entryPath}.scriptName`, entry.scriptName, issues);
    if ('command' in entry) validateRequiredStringField(schemaId, `${entryPath}.command`, entry.command, issues);
  });
}

function validateDiscoveryBlockers(
  schemaId: string,
  pathPrefix: string,
  value: unknown,
  issues: ContractIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push(issue(schemaId, pathPrefix, 'invalid-type', `'${pathPrefix}' must be an array.`));
    return;
  }

  value.forEach((entry, index) => {
    const entryPath = `${pathPrefix}[${index}]`;
    if (!isRecord(entry)) return;
    validateRequiredStringField(schemaId, `${entryPath}.code`, entry.code, issues);
    validateTopologyRelativeField(schemaId, `${entryPath}.path`, entry.path, issues);
    validateEnumField(schemaId, `${entryPath}.severity`, entry.severity, discoveryBlockerSeverities, issues);
    validateRequiredStringField(schemaId, `${entryPath}.summary`, entry.summary, issues);
  });
}

function validateActionRiskPolicyDetails(
  schemaId: string,
  payload: Record<string, unknown>,
  issues: ContractIssue[],
): void {
  if (payload.noFalseCompletion !== true) {
    issues.push(issue(schemaId, '$.noFalseCompletion', 'invalid-enum', 'noFalseCompletion must remain true.'));
  }

  validateOptionalWorkspaceRoots(schemaId, '$.allowedWriteRoots', payload.allowedWriteRoots, issues);

  const authorization = payload.authorization;
  if (isRecord(authorization)) {
    if ('authorized' in authorization && typeof authorization.authorized !== 'boolean') {
      issues.push(issue(schemaId, '$.authorization.authorized', 'invalid-type', "'$.authorization.authorized' must be boolean."));
    }
    if ('releaseStageAuthorized' in authorization && typeof authorization.releaseStageAuthorized !== 'boolean') {
      issues.push(issue(schemaId, '$.authorization.releaseStageAuthorized', 'invalid-type', "'$.authorization.releaseStageAuthorized' must be boolean."));
    }
    if ('authorizedAt' in authorization) {
      validateDateTimeField(schemaId, '$.authorization.authorizedAt', authorization.authorizedAt, issues);
    }
    if ('authorizedBy' in authorization) {
      validateRequiredStringField(schemaId, '$.authorization.authorizedBy', authorization.authorizedBy, issues);
    }
    if ('reason' in authorization) {
      validateRequiredStringField(schemaId, '$.authorization.reason', authorization.reason, issues);
    }
  }

  if (!Array.isArray(payload.rules)) return;
  payload.rules.forEach((entry, index) => validateActionRiskRule(schemaId, entry, index, issues));
}

function validateActionRiskRule(
  schemaId: string,
  value: unknown,
  index: number,
  issues: ContractIssue[],
): void {
  const pathPrefix = `$.rules[${index}]`;
  if (!isRecord(value)) return;

  validateRequiredStringField(schemaId, `${pathPrefix}.id`, value.id, issues);

  if (!('actionType' in value) && !('actionPattern' in value)) {
    issues.push(issue(schemaId, pathPrefix, 'missing-required', "Action risk rule must include 'actionType' or 'actionPattern'."));
  }
  if ('actionType' in value) {
    validateEnumField(schemaId, `${pathPrefix}.actionType`, value.actionType, actionTypes, issues);
  }
  if ('actionPattern' in value) {
    validateRequiredStringField(schemaId, `${pathPrefix}.actionPattern`, value.actionPattern, issues);
  }

  validateEnumField(schemaId, `${pathPrefix}.riskLevel`, value.riskLevel, riskLevels, issues);
  validateBooleanField(schemaId, `${pathPrefix}.mutatesWorkspace`, value.mutatesWorkspace, issues);
  validateBooleanField(schemaId, `${pathPrefix}.destructive`, value.destructive, issues);
  validateBooleanField(schemaId, `${pathPrefix}.requiresAuthorization`, value.requiresAuthorization, issues);

  if (!Array.isArray(value.allowedModes)) {
    issues.push(issue(schemaId, `${pathPrefix}.allowedModes`, 'invalid-type', "'allowedModes' must be an array."));
  } else if (value.allowedModes.length === 0) {
    issues.push(issue(schemaId, `${pathPrefix}.allowedModes`, 'invalid-range', "'allowedModes' must not be empty."));
  } else {
    value.allowedModes.forEach((mode, modeIndex) => {
      validateEnumField(schemaId, `${pathPrefix}.allowedModes[${modeIndex}]`, mode, actionPolicyModes, issues);
    });
  }

  if ('requiresReleaseStage' in value) {
    validateBooleanField(schemaId, `${pathPrefix}.requiresReleaseStage`, value.requiresReleaseStage, issues);
  }
  validateOptionalWorkspaceRoots(schemaId, `${pathPrefix}.allowedWriteRoots`, value.allowedWriteRoots, issues);
}

function validateVerificationReportDetails(
  schemaId: string,
  payload: Record<string, unknown>,
  issues: ContractIssue[],
): void {
  const verdict = payload.verdict;
  if (isRecord(verdict)) {
    const verdictResult = validateContract('completionVerdict', verdict);
    if (!verdictResult.ok) {
      issues.push(
        ...verdictResult.issues.map((nestedIssue) => ({
          ...nestedIssue,
          schemaId,
          path: `$.verdict${nestedIssue.path.slice(1)}`,
        })),
      );
    }
  }

  validateReportPrivacy(schemaId, payload.privacy, issues);
  validateReportEvidenceSummaries(schemaId, payload.evidenceSummaries, issues);
  validateReportArtifactSummaries(schemaId, payload.artifactSummaries, issues);
  validateReportSections(schemaId, payload.sections, issues);
  validateReportSourceChanges(schemaId, payload.sourceChanges, issues);
  validateReportVerifier(schemaId, payload.verifier, issues);
}

function validateReportPrivacy(
  schemaId: string,
  value: unknown,
  issues: ContractIssue[],
): void {
  if (!isRecord(value)) return;

  validateEnumField(schemaId, '$.privacy.classification', value.classification, privacyClassifications, issues);
  if (typeof value.containsSensitiveData !== 'boolean') {
    issues.push(issue(schemaId, '$.privacy.containsSensitiveData', 'invalid-type', "Expected 'privacy.containsSensitiveData' to be boolean."));
  }
  if (typeof value.redacted !== 'boolean') {
    issues.push(issue(schemaId, '$.privacy.redacted', 'invalid-type', "Expected 'privacy.redacted' to be boolean."));
  }
  if (typeof value.truncated !== 'boolean') {
    issues.push(issue(schemaId, '$.privacy.truncated', 'invalid-type', "Expected 'privacy.truncated' to be boolean."));
  }
}

function validateReportEvidenceSummaries(
  schemaId: string,
  value: unknown,
  issues: ContractIssue[],
): void {
  if (!Array.isArray(value)) return;

  value.forEach((entry, index) => {
    const pathPrefix = `$.evidenceSummaries[${index}]`;
    if (!isRecord(entry)) return;

    validateRequiredStringField(schemaId, `${pathPrefix}.id`, entry.id, issues);
    validateEnumField(schemaId, `${pathPrefix}.source`, entry.source, ['command', 'service', 'browser', 'api', 'data', 'log', 'manual', 'release', 'hook'], issues);
    validateRequiredStringField(schemaId, `${pathPrefix}.capabilityId`, entry.capabilityId, issues);
    validateEnumField(schemaId, `${pathPrefix}.status`, entry.status, resultStatuses, issues);
    validateEnumField(schemaId, `${pathPrefix}.trustLevel`, entry.trustLevel, ['verified', 'self-reported', 'degraded', 'manual-confirmed'], issues);
    validateRequiredStringField(schemaId, `${pathPrefix}.summary`, entry.summary, issues);
    validateRequiredStringField(schemaId, `${pathPrefix}.freshness`, entry.freshness, issues);

    if (!Array.isArray(entry.artifactRefs)) {
      issues.push(issue(schemaId, `${pathPrefix}.artifactRefs`, 'invalid-type', "Expected 'artifactRefs' to be array."));
    } else {
      const badIndex = entry.artifactRefs.findIndex((item) => typeof item !== 'string');
      if (badIndex !== -1) {
        issues.push(issue(schemaId, `${pathPrefix}.artifactRefs[${badIndex}]`, 'invalid-type', "Expected 'artifactRefs' items to be string."));
      }
    }

    if (!Array.isArray(entry.unverifiedScope)) {
      issues.push(issue(schemaId, `${pathPrefix}.unverifiedScope`, 'invalid-type', "Expected 'unverifiedScope' to be array."));
    } else {
      const badIndex = entry.unverifiedScope.findIndex((item) => typeof item !== 'string');
      if (badIndex !== -1) {
        issues.push(issue(schemaId, `${pathPrefix}.unverifiedScope[${badIndex}]`, 'invalid-type', "Expected 'unverifiedScope' items to be string."));
      }
    }
  });
}

function validateReportArtifactSummaries(
  schemaId: string,
  value: unknown,
  issues: ContractIssue[],
): void {
  if (!Array.isArray(value)) return;

  value.forEach((entry, index) => {
    const pathPrefix = `$.artifactSummaries[${index}]`;
    if (!isRecord(entry)) return;

    validateRequiredStringField(schemaId, `${pathPrefix}.id`, entry.id, issues);
    validateRequiredStringField(schemaId, `${pathPrefix}.evidenceId`, entry.evidenceId, issues);
    validateEnumField(schemaId, `${pathPrefix}.type`, entry.type, artifactTypes, issues);
    validateWorkspaceRelativeField(schemaId, `${pathPrefix}.path`, entry.path, issues);
    validateRequiredStringField(schemaId, `${pathPrefix}.summary`, entry.summary, issues);
    validateArtifactPrivacy(schemaId, entry.privacy, issues, `${pathPrefix}.privacy`);
  });
}

function validateReportSections(
  schemaId: string,
  value: unknown,
  issues: ContractIssue[],
): void {
  if (!isRecord(value)) return;

  for (const field of ['blockers', 'missingEvidence', 'manualConfirmation', 'nextActions', 'degradedCapabilities', 'unverifiedScope']) {
    if (!Array.isArray(value[field])) {
      issues.push(issue(schemaId, `$.sections.${field}`, 'invalid-type', `Expected 'sections.${field}' to be array.`));
    }
  }
}

function validateReportSourceChanges(
  schemaId: string,
  value: unknown,
  issues: ContractIssue[],
): void {
  if (!isRecord(value)) return;

  if (typeof value.modifiedSource !== 'boolean') {
    issues.push(issue(schemaId, '$.sourceChanges.modifiedSource', 'invalid-type', "Expected 'sourceChanges.modifiedSource' to be boolean."));
  }
  validateRequiredStringField(schemaId, '$.sourceChanges.summary', value.summary, issues);
  if (!Array.isArray(value.files)) {
    issues.push(issue(schemaId, '$.sourceChanges.files', 'invalid-type', "Expected 'sourceChanges.files' to be array."));
  } else {
    value.files.forEach((file, index) => validateWorkspaceRelativeField(schemaId, `$.sourceChanges.files[${index}]`, file, issues));
  }
}

function validateReportVerifier(
  schemaId: string,
  value: unknown,
  issues: ContractIssue[],
): void {
  if (!isRecord(value)) return;

  validateRequiredStringField(schemaId, '$.verifier.command', value.command, issues);
  if (value.exitCode !== null && typeof value.exitCode !== 'number') {
    issues.push(issue(schemaId, '$.verifier.exitCode', 'invalid-type', "Expected 'verifier.exitCode' to be number or null."));
  }
}

function validateStateLedgerDetails(
  schemaId: string,
  payload: Record<string, unknown>,
  issues: ContractIssue[],
): void {
  validateWorkspaceRelativeField(schemaId, '$.artifactIndexPath', payload.artifactIndexPath, issues);
  validateGeneratedFiles(schemaId, payload.generatedFiles, issues);
}

function validateGeneratedFiles(
  schemaId: string,
  value: unknown,
  issues: ContractIssue[],
): void {
  if (!Array.isArray(value)) return;

  value.forEach((entry, index) => {
    const pathPrefix = `$.generatedFiles[${index}]`;
    if (!isRecord(entry)) return;

    validateWorkspaceRelativeField(schemaId, `${pathPrefix}.path`, entry.path, issues);
    validateEnumField(schemaId, `${pathPrefix}.category`, entry.category, generatedFileCategories, issues);
    validateRequiredStringField(schemaId, `${pathPrefix}.owner`, entry.owner, issues);
    validateDateTimeField(schemaId, `${pathPrefix}.createdAt`, entry.createdAt, issues);
    validateRequiredStringField(schemaId, `${pathPrefix}.relatedRunId`, entry.relatedRunId, issues);

    if ('originalCategory' in entry) {
      validateEnumField(schemaId, `${pathPrefix}.originalCategory`, entry.originalCategory, generatedFileCategories, issues);
    }

    if ('relatedEvidenceIds' in entry) {
      const relatedEvidenceIds = entry.relatedEvidenceIds;
      if (!Array.isArray(relatedEvidenceIds)) {
        issues.push(issue(schemaId, `${pathPrefix}.relatedEvidenceIds`, 'invalid-type', "Expected 'relatedEvidenceIds' to be array."));
      } else {
        const badIndex = relatedEvidenceIds.findIndex((item) => typeof item !== 'string');
        if (badIndex !== -1) {
          issues.push(
            issue(
              schemaId,
              `${pathPrefix}.relatedEvidenceIds[${badIndex}]`,
              'invalid-type',
              "Expected 'relatedEvidenceIds' items to be string.",
            ),
          );
        }
      }
    }

    if ('userExistingChangeReason' in entry) {
      validateRequiredStringField(schemaId, `${pathPrefix}.userExistingChangeReason`, entry.userExistingChangeReason, issues);
    }
  });
}

function validateEvidenceFreshness(
  schemaId: string,
  freshness: unknown,
  issues: ContractIssue[],
): void {
  if (!isRecord(freshness)) return;

  const validatedAt = freshness.validatedAt;
  if (typeof validatedAt !== 'string') {
    issues.push(issue(schemaId, '$.freshness.validatedAt', 'missing-required', "Missing required field 'freshness.validatedAt'."));
    return;
  }

  if (Number.isNaN(Date.parse(validatedAt))) {
    issues.push(issue(schemaId, '$.freshness.validatedAt', 'invalid-format', "'freshness.validatedAt' must be an ISO date-time string."));
    return;
  }

  const hasTargetContext = freshnessTargetFields.some((field) => {
    const value = freshness[field];
    if (Array.isArray(value)) return value.length > 0 && value.every((item) => typeof item === 'string' && item.length > 0);
    return typeof value === 'string' && value.length > 0;
  });

  if (!hasTargetContext) {
    issues.push(
      issue(
        schemaId,
        '$.freshness',
        'invalid-range',
        "Freshness must include at least one target field: commandHash, targetHash, fileTargets, environmentId, or targetSummary.",
      ),
    );
  }
}

function validateArtifactPath(
  schemaId: string,
  value: unknown,
  issues: ContractIssue[],
): void {
  validateWorkspaceRelativeField(schemaId, '$.path', value, issues);
}

function validateWorkspaceRelativeField(
  schemaId: string,
  path: string,
  value: unknown,
  issues: ContractIssue[],
): void {
  if (typeof value !== 'string') return;
  if (!isWorkspaceRelativePath(value)) {
    issues.push(issue(schemaId, path, 'invalid-pattern', `'${path}' must be workspace-relative and must not escape the workspace.`));
  }
}

function validateRequiredStringField(
  schemaId: string,
  path: string,
  value: unknown,
  issues: ContractIssue[],
): void {
  if (typeof value !== 'string') {
    issues.push(issue(schemaId, path, 'invalid-type', `'${path}' must be a string.`));
    return;
  }

  if (value.length === 0) {
    issues.push(issue(schemaId, path, 'invalid-range', `'${path}' must not be empty.`));
  }
}

function validateNumberRangeField(
  schemaId: string,
  path: string,
  value: unknown,
  min: number,
  max: number,
  issues: ContractIssue[],
): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(issue(schemaId, path, 'invalid-type', `'${path}' must be a number.`));
    return;
  }

  if (value < min || value > max) {
    issues.push(issue(schemaId, path, 'invalid-range', `'${path}' must be between ${min} and ${max}.`));
  }
}

function validateTopologyRelativeField(
  schemaId: string,
  path: string,
  value: unknown,
  issues: ContractIssue[],
): void {
  if (typeof value !== 'string') {
    issues.push(issue(schemaId, path, 'invalid-type', `'${path}' must be a string.`));
    return;
  }

  if (!isTopologyRelativePath(value)) {
    issues.push(issue(schemaId, path, 'invalid-pattern', `'${path}' must be workspace-relative and must not escape the workspace.`));
  }
}

function validateDateTimeField(
  schemaId: string,
  path: string,
  value: unknown,
  issues: ContractIssue[],
): void {
  if (typeof value !== 'string') {
    issues.push(issue(schemaId, path, 'invalid-type', `'${path}' must be an ISO date-time string.`));
    return;
  }

  if (Number.isNaN(Date.parse(value))) {
    issues.push(issue(schemaId, path, 'invalid-format', `'${path}' must be an ISO date-time string.`));
  }
}

function validateNonEmptyStringField(
  schemaId: string,
  path: string,
  value: unknown,
  issues: ContractIssue[],
): void {
  if (typeof value !== 'string') {
    issues.push(issue(schemaId, path, 'invalid-type', `'${path}' must be a string.`));
    return;
  }

  if (value.length === 0) {
    issues.push(issue(schemaId, path, 'invalid-range', `'${path}' must not be empty.`));
  }
}

function validatePatternField(
  schemaId: string,
  path: string,
  value: unknown,
  pattern: RegExp,
  issues: ContractIssue[],
): void {
  if (typeof value !== 'string') {
    issues.push(issue(schemaId, path, 'invalid-type', `'${path}' must be a string.`));
    return;
  }

  if (!pattern.test(value)) {
    issues.push(issue(schemaId, path, 'invalid-pattern', `'${path}' does not match the required pattern.`));
  }
}

function validateBooleanField(
  schemaId: string,
  path: string,
  value: unknown,
  issues: ContractIssue[],
): void {
  if (typeof value !== 'boolean') {
    issues.push(issue(schemaId, path, 'invalid-type', `'${path}' must be a boolean.`));
  }
}

function validateEnumField<T extends string>(
  schemaId: string,
  path: string,
  value: unknown,
  allowed: readonly T[],
  issues: ContractIssue[],
): void {
  if (typeof value !== 'string') {
    issues.push(issue(schemaId, path, 'invalid-type', `'${path}' must be a string.`));
    return;
  }

  if (!allowed.includes(value as T)) {
    issues.push(issue(schemaId, path, 'invalid-enum', `Invalid enum value '${value}' for '${path}'.`));
  }
}

function validateOptionalWorkspaceRoots(
  schemaId: string,
  path: string,
  value: unknown,
  issues: ContractIssue[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issues.push(issue(schemaId, path, 'invalid-type', `'${path}' must be an array.`));
    return;
  }
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    validateWorkspaceRelativeField(schemaId, entryPath, entry, issues);
    if (typeof entry === 'string' && !reportOnlyWriteRoots.includes(entry as (typeof reportOnlyWriteRoots)[number])) {
      issues.push(
        issue(
          schemaId,
          entryPath,
          'invalid-pattern',
          `'${entryPath}' must be one of the report-only artifact roots: ${reportOnlyWriteRoots.join(', ')}.`,
        ),
      );
    }
  });
}

function validateArtifactPrivacy(
  schemaId: string,
  value: unknown,
  issues: ContractIssue[],
  pathPrefix = '$.privacy',
): void {
  if (!isRecord(value)) return;

  const classification = value.classification;
  if (typeof classification !== 'string') {
    issues.push(issue(schemaId, `${pathPrefix}.classification`, 'missing-required', "Missing required field 'privacy.classification'."));
  } else if (!privacyClassifications.includes(classification as (typeof privacyClassifications)[number])) {
    issues.push(issue(schemaId, `${pathPrefix}.classification`, 'invalid-enum', `Invalid privacy classification '${classification}'.`));
  }

  if (typeof value.containsSensitiveData !== 'boolean') {
    issues.push(issue(schemaId, `${pathPrefix}.containsSensitiveData`, 'invalid-type', "Expected 'privacy.containsSensitiveData' to be boolean."));
  }

  if (typeof value.redacted !== 'boolean') {
    issues.push(issue(schemaId, `${pathPrefix}.redacted`, 'invalid-type', "Expected 'privacy.redacted' to be boolean."));
  }
}

function isWorkspaceRelativePath(value: string): boolean {
  if (value.length === 0) return false;
  if (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) return false;
  if (value.includes('\0')) return false;
  const segments = value.replaceAll('\\', '/').split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function isTopologyRelativePath(value: string): boolean {
  if (value === '.') return true;
  return isWorkspaceRelativePath(value);
}

function matchesType(value: unknown, expected: FieldType): boolean {
  switch (expected) {
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isRecord(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    default:
      return typeof value === expected;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issue(
  schemaId: string,
  path: string,
  code: ContractIssueCode,
  message: string,
): ContractIssue {
  return {
    schemaId,
    path,
    code,
    message,
    severity: 'blocked',
  };
}
