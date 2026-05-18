import type { ActionRiskPolicy } from '../contracts/index.ts';

export type ActionPolicyMode = 'report-only' | 'fix' | 'release';
export type ActionRuntimeMode = ActionPolicyMode | 'verification';
export type ActionRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type ActionPolicyDecisionKind = 'allowed' | 'blocked' | 'skipped' | 'manual-confirmation-required';
export type ActionLogResult = 'success' | 'failed' | 'blocked' | 'skipped';

export type ActionType =
  | 'read'
  | 'command'
  | 'verification-rerun'
  | 'browser-check'
  | 'api-check'
  | 'log-read'
  | 'report-write'
  | 'evidence-write'
  | 'artifact-write'
  | 'state-write'
  | 'source-edit'
  | 'generated-verification-file'
  | 'config-edit'
  | 'dependency-install'
  | 'database-migration'
  | 'destructive-migration'
  | 'delete-file'
  | 'global-config-change'
  | 'git-push'
  | 'git-tag'
  | 'npm-publish'
  | 'plugin-release'
  | 'production-data-access'
  | 'release';

export interface ActionRiskRule extends Record<string, unknown> {
  id: string;
  actionType?: ActionType;
  actionPattern?: string;
  riskLevel: ActionRiskLevel;
  mutatesWorkspace: boolean;
  destructive: boolean;
  requiresAuthorization: boolean;
  allowedModes: ActionPolicyMode[];
  requiresReleaseStage?: boolean;
  allowedWriteRoots?: string[];
}

export interface RuntimeActionRiskPolicy extends ActionRiskPolicy {
  mode: ActionPolicyMode;
  defaultRiskLevel: ActionRiskLevel;
  rules: ActionRiskRule[];
  allowedWriteRoots?: string[];
  authorization?: ActionAuthorizationContext;
}

export interface ActionAuthorizationContext extends Record<string, unknown> {
  authorized?: boolean;
  authorizedBy?: string;
  authorizedAt?: string;
  releaseStageAuthorized?: boolean;
  reason?: string;
}

export interface ActionPolicyAction extends Record<string, unknown> {
  id: string;
  actionType: ActionType;
  mode?: ActionRuntimeMode;
  targetFiles?: string[];
  command?: string;
  intent: string;
  mutatesWorkspace?: boolean;
  destructive?: boolean;
  evidenceRefs?: string[];
  core?: boolean;
  diffSummary?: string;
}

export interface PolicyWriteIntent extends Record<string, unknown> {
  path: string;
  category?: string;
}

export interface PolicyWriteBoundaryIssue extends Record<string, unknown> {
  path: string;
  reason: string;
  category?: string;
}

export type PolicyWriteBoundaryResult =
  | { ok: true; issues: [] }
  | { ok: false; issues: PolicyWriteBoundaryIssue[] };

export interface ValidateModeWriteBoundaryInput {
  mode: ActionRuntimeMode;
  workspaceRoot: string;
  writes: PolicyWriteIntent[];
  allowedWriteRoots?: string[];
}

export interface ClassifyActionRiskInput {
  policy: RuntimeActionRiskPolicy | ActionRiskPolicy;
  action: ActionPolicyAction;
}

export interface ActionRiskClassification {
  riskLevel: ActionRiskLevel;
  matchedRuleIds: string[];
  mutatesWorkspace: boolean;
  destructive: boolean;
  requiresAuthorization: boolean;
  requiresReleaseStage: boolean;
  allowedModes: ActionPolicyMode[];
}

export interface EvaluateActionPolicyInput {
  policy: RuntimeActionRiskPolicy | ActionRiskPolicy;
  workspaceRoot: string;
  action: ActionPolicyAction;
  authorization?: ActionAuthorizationContext;
  now?: Date | string;
  runId?: string;
  goalId?: string;
}

export interface PolicyBlocker extends Record<string, unknown> {
  code: string;
  category: 'policy';
  message: string;
  nextAction: Record<string, unknown>;
  owner: 'agent' | 'user' | 'external-system' | string;
  riskLevel: ActionRiskLevel;
  evidenceRefs?: string[];
  core: boolean;
  releaseGate?: boolean;
}

export interface ActionLogEntry extends Record<string, unknown> {
  id: string;
  runId?: string;
  goalId?: string;
  mode: ActionRuntimeMode;
  actionType: ActionType;
  targetFiles: string[];
  riskLevel: ActionRiskLevel;
  intent: string;
  result: ActionLogResult;
  commandSummary?: string;
  diffSummary?: string;
  evidenceRefs: string[];
  requiresSamePathRetry: boolean;
  createdAt: string;
}

export interface BuildActionLogEntryInput {
  id: string;
  runId?: string;
  goalId?: string;
  mode: ActionRuntimeMode;
  actionType: ActionType;
  targetFiles: string[];
  riskLevel: ActionRiskLevel;
  intent: string;
  result: ActionLogResult;
  command?: string;
  diffSummary?: string;
  evidenceRefs?: string[];
  requiresSamePathRetry?: boolean;
  createdAt?: Date | string;
}

export interface ActionPolicyDecision extends Record<string, unknown> {
  id: string;
  actionType: ActionType;
  mode: ActionRuntimeMode;
  decision: ActionPolicyDecisionKind;
  riskLevel: ActionRiskLevel;
  reason: string;
  matchedRuleIds: string[];
  blockers: PolicyBlocker[];
  requiresActionLog: boolean;
  requiresSamePathRetry: boolean;
  actionLog?: ActionLogEntry;
  evidenceRefs: string[];
  core: boolean;
}

export interface BuildDefaultActionRiskPolicyInput {
  mode?: ActionPolicyMode;
  policyId?: string;
  defaultRiskLevel?: ActionRiskLevel;
}
