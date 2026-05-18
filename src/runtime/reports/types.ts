import type {
  ArtifactIndexEntry,
  CompletionVerdict,
  ContractIssueCode,
  EvidenceBlock,
  StateLedger,
  VerificationReport,
} from '../contracts/index.ts';

export type ReportStatus = VerificationReport['status'];
export type ReportRuntimeIssueCode = ContractIssueCode | 'invalid-write';

export interface ReportRuntimeIssue {
  schemaId: string;
  path: string;
  code: ReportRuntimeIssueCode;
  message: string;
  severity: 'blocked' | 'degraded';
  filePath?: string;
}

export interface ReportVerifier {
  command?: string;
  exitCode?: number | null;
}

export interface ReportNextAction extends Record<string, unknown> {
  owner: string;
  summary: string;
  riskLevel: CompletionVerdict['riskLevel'];
}

export interface MergeReadinessSummary extends Record<string, unknown> {
  status: ReportStatus;
  verdict: CompletionVerdict['verdict'];
  complete: boolean;
  deliverable: boolean;
  canRelease: boolean;
  reportOnly: boolean;
  noSourceChanges: boolean;
  sourceChangeSummary: string;
  blockingIssueCount: number;
  warningIssueCount: number;
  manualConfirmationCount: number;
  blockerCount: number;
  degradedCapabilityCount: number;
  nextActionOwner: string;
  nextActionSummary: string;
  releaseRecommendation: string;
}

export interface ConsumableNextStep extends Record<string, unknown> {
  owner: string;
  summary: string;
  riskLevel: CompletionVerdict['riskLevel'];
  suggestedMode: string;
  issueId?: string;
  category?: string;
  blocksCompletion?: boolean;
}

export interface EvidenceSummary extends Record<string, unknown> {
  id: string;
  source: EvidenceBlock['source'];
  capabilityId: string;
  status: EvidenceBlock['status'];
  trustLevel: EvidenceBlock['trustLevel'];
  summary: string;
  artifactRefs: string[];
  freshness: string;
  unverifiedScope: string[];
  degradedReason?: string;
}

export interface ArtifactSummary extends Record<string, unknown> {
  id: string;
  evidenceId: string;
  type: ArtifactIndexEntry['type'];
  path: string;
  summary: string;
  privacy: ArtifactIndexEntry['privacy'];
}

export interface DegradedCapability extends Record<string, unknown> {
  capabilityId: string;
  source: EvidenceBlock['source'];
  evidenceId: string;
  reason: string;
}

export interface ReportSections extends Record<string, unknown> {
  blockers: Record<string, unknown>[];
  missingEvidence: unknown[];
  manualConfirmation: ManualConfirmationSummary[];
  nextActions: ReportNextAction[];
  degradedCapabilities: DegradedCapability[];
  unverifiedScope: unknown[];
  qaIssues: ReportOnlyIssue[];
  reportOnlyIssues: ReportOnlyIssue[];
  blockingIssues: ReportOnlyIssue[];
  warnings: ReportOnlyIssue[];
  mergeReadiness: MergeReadinessSummary;
  consumableNextSteps: ConsumableNextStep[];
  policyEffects: PolicyEffectSummary[];
  actionLogs: ActionLogSummary[];
  capabilityRoutes: CapabilityRouteSummary[];
  remediationPlans: RemediationPlanSummary[];
}

export interface SourceChanges extends Record<string, unknown> {
  modifiedSource: boolean;
  summary: string;
  files: string[];
}

export interface ReportPrivacy extends Record<string, unknown> {
  classification: 'public' | 'internal' | 'confidential' | 'secret' | 'local-only';
  containsSensitiveData: boolean;
  redacted: boolean;
  truncated: boolean;
}

export interface VerificationReportJson extends VerificationReport {
  mode: StateLedger['mode'];
  verdict: CompletionVerdict;
  transcriptSummary: string;
  evidenceSummaries: EvidenceSummary[];
  artifactSummaries: ArtifactSummary[];
  sections: ReportSections;
  sourceChanges: SourceChanges;
  reportOnly: boolean;
  verifier: {
    command: string;
    exitCode: number | null;
  };
  privacy: ReportPrivacy;
}

export interface RenderedReport {
  markdown: string;
  json: VerificationReportJson;
  transcriptSummary: string;
}

export interface ReportOnlyIssue extends Record<string, unknown> {
  id: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  reproductionSteps: string[];
  evidenceRefs: string[];
  artifactRefs: string[];
  impact: string;
  recommendation: string;
  owner: string;
  blocksCompletion: boolean;
  suggestedMode?: string;
}

export interface ManualConfirmationSummary extends Record<string, unknown> {
  id: string;
  source: string;
  summary: string;
  reason: string;
  evidenceRefs: string[];
  artifactRefs: string[];
  criteria: string;
  owner: string;
  nextAction: string;
  riskLevel: CompletionVerdict['riskLevel'];
  capabilityRouteRefs: string[];
  remediationRefs: string[];
}

export interface PolicyEffectSummary extends Record<string, unknown> {
  id: string;
  decision: string;
  actionType: string;
  reason: string;
  riskLevel?: CompletionVerdict['riskLevel'];
}

export interface ActionLogSummary extends Record<string, unknown> {
  id: string;
  actionType: string;
  result: string;
  riskLevel?: CompletionVerdict['riskLevel'];
  targetFiles: string[];
  intent: string;
  evidenceRefs: string[];
  requiresSamePathRetry: boolean;
}

export interface CapabilityRouteSummary extends Record<string, unknown> {
  id: string;
  requirementId: string;
  requirementSource: string;
  description: string;
  decision: string;
  primaryCapabilityId: string;
  selectedCapabilityId: string | null;
  fallbackCapabilityIds: string[];
  reason: string;
  trustLevel: string;
  degradedReason?: string;
  manualConfirmationRequired: boolean;
  blocksCompletion: boolean;
  remediationRefs: string[];
  evidenceImpact: string[];
  evidenceRefs: string[];
}

export interface RemediationActionSummary extends Record<string, unknown> {
  id: string;
  capabilityId: string;
  kind: string;
  status: string;
  action: string;
  riskLevel?: CompletionVerdict['riskLevel'];
  requiresAuthorization: boolean;
  executesAutomatically: boolean;
  verificationCommand: string;
  failureFallback: string;
  expectedRestoredCapabilities: string[];
  completionImpact?: string;
  policyDecision?: string;
}

export interface RemediationPlanSummary extends Record<string, unknown> {
  id: string;
  capabilityId: string;
  status: string;
  actions: RemediationActionSummary[];
}

export interface ReportInput {
  state: StateLedger;
  evidence: EvidenceBlock[];
  artifactIndex: ArtifactIndexEntry[];
  verdict: CompletionVerdict;
  blockers?: Record<string, unknown>[];
  verifier?: ReportVerifier;
  generatedAt?: Date | string;
  reportOnly?: boolean;
  issues?: Record<string, unknown>[];
}

export interface TranscriptSummaryInput {
  verifier?: ReportVerifier;
  evidenceSummaries: EvidenceSummary[];
  missingEvidence: unknown[];
  finalVerdict: CompletionVerdict['verdict'] | ReportStatus;
  mode?: StateLedger['mode'];
  reportOnly?: boolean;
  sourceChanges?: SourceChanges;
  manualConfirmationCount?: number;
  blockingIssueCount?: number;
  warningIssueCount?: number;
  nextActionOwner?: string;
  maxLength?: number;
}

export interface ResolveReportPathsInput {
  workspaceRoot: string;
  runId: string;
  reportRelativeDir?: string;
}

export interface ReportPaths {
  workspaceRoot: string;
  markdownRelativePath: string;
  jsonRelativePath: string;
  markdownPath: string;
  jsonPath: string;
}

export interface ReportFileIo {
  writeFile(path: string, data: string, encoding: BufferEncoding): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  unlink(path: string): Promise<void>;
}

export interface ReportWriteInput {
  workspaceRoot: string;
  runId: string;
  report: RenderedReport;
  reportRelativeDir?: string;
  io?: Partial<ReportFileIo>;
}

export type ReportWriteResult =
  | {
      ok: true;
      markdownPath: string;
      jsonPath: string;
      issues: [];
    }
  | {
      ok: false;
      status: 'blocked' | 'degraded';
      markdownPath?: string;
      jsonPath?: string;
      issues: ReportRuntimeIssue[];
    };

export interface RedactionState {
  redacted: boolean;
  truncated: boolean;
}
