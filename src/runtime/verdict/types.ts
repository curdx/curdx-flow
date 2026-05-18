import type { CompletionVerdict, EvidenceBlock, StateLedger } from '../contracts/index.ts';

export type TaskType = 'code' | 'command' | 'frontend' | 'backend' | 'fullstack' | 'data' | 'release' | 'plugin' | 'library' | 'manual';

export type EvidenceSource = EvidenceBlock['source'];

export interface FreshnessTarget extends Record<string, unknown> {
  commandHash?: string;
  targetHash?: string;
  environmentId?: string;
  targetSummary?: string;
}

export interface EvidenceRequirement extends Record<string, unknown> {
  id: string;
  source: EvidenceSource;
  description: string;
  capabilityId?: string;
  core?: boolean;
  target?: FreshnessTarget;
  allowManualConfirmation?: boolean;
}

export interface EvidenceGap extends Record<string, unknown> {
  id: string;
  source: EvidenceSource | 'release-authorization' | 'state';
  description: string;
  reason: string;
  core: boolean;
  evidenceIds?: string[];
}

export interface BlockerInput extends Record<string, unknown> {
  code: string;
  category: string;
  message: string;
  nextAction: Record<string, unknown>;
  owner: 'agent' | 'user' | 'external-system' | string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  evidenceRefs?: string[];
  core?: boolean;
  releaseGate?: boolean;
}

export interface ManualConfirmationInput extends Record<string, unknown> {
  id: string;
  summary: string;
  confirmedAt: string;
  owner?: string;
  requirementIds?: string[];
  evidenceRefs?: string[];
}

export interface CompletionVerdictInput {
  state: StateLedger;
  evidence: EvidenceBlock[];
  requirements?: EvidenceRequirement[];
  blockers?: BlockerInput[];
  manualConfirmations?: ManualConfirmationInput[];
  policy?: Record<string, unknown>;
  taskType?: TaskType;
  now?: Date | string;
  claimedComplete?: boolean;
  releaseStageAuthorized?: boolean;
}

export interface VerdictDiagnostic extends Record<string, unknown> {
  code: string;
  message: string;
}

export interface VerdictEvaluationResult {
  ok: true;
  verdict: CompletionVerdict;
  diagnostics: VerdictDiagnostic[];
}
