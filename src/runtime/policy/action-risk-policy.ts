import { isAbsolute, relative, resolve } from 'node:path';

import type {
  ActionAuthorizationContext,
  ActionLogEntry,
  ActionPolicyAction,
  ActionPolicyDecision,
  ActionPolicyMode,
  ActionRiskClassification,
  ActionRiskLevel,
  ActionRiskRule,
  ActionRuntimeMode,
  BuildActionLogEntryInput,
  BuildDefaultActionRiskPolicyInput,
  ClassifyActionRiskInput,
  EvaluateActionPolicyInput,
  PolicyBlocker,
  PolicyWriteBoundaryIssue,
  PolicyWriteBoundaryResult,
  PolicyWriteIntent,
  RuntimeActionRiskPolicy,
  ValidateModeWriteBoundaryInput,
} from './types.ts';

const riskOrder: Record<ActionRiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const policyModes = ['report-only', 'fix', 'release'] as const satisfies ActionPolicyMode[];
const defaultReportOnlyWriteRoots = ['.curdx/reports', '.curdx/evidence', '.curdx/artifacts', '.curdx/state'];
const highRiskActions = new Set([
  'delete-file',
  'destructive-migration',
  'global-config-change',
  'git-push',
  'git-tag',
  'npm-publish',
  'plugin-release',
  'production-data-access',
  'release',
]);
const releaseActions = new Set(['git-push', 'git-tag', 'npm-publish', 'plugin-release', 'release']);
const mutatingActionTypes = new Set([
  'source-edit',
  'generated-verification-file',
  'config-edit',
  'dependency-install',
  'database-migration',
  'destructive-migration',
  'delete-file',
  'global-config-change',
  'report-write',
  'evidence-write',
  'artifact-write',
  'state-write',
]);

export function buildDefaultActionRiskPolicy(input: BuildDefaultActionRiskPolicyInput = {}): RuntimeActionRiskPolicy {
  return {
    schemaVersion: 1,
    policyId: input.policyId ?? `curdx-flow-default-${input.mode ?? 'fix'}`,
    mode: input.mode ?? 'fix',
    defaultRiskLevel: input.defaultRiskLevel ?? 'medium',
    allowedWriteRoots: [...defaultReportOnlyWriteRoots],
    authorization: {
      authorized: false,
      releaseStageAuthorized: false,
    },
    rules: [
      {
        id: 'report-only-artifact-writes',
        actionPattern: '.curdx/',
        riskLevel: 'low',
        mutatesWorkspace: true,
        destructive: false,
        requiresAuthorization: false,
        allowedModes: ['report-only', 'fix', 'release'],
        allowedWriteRoots: [...defaultReportOnlyWriteRoots],
      },
      {
        id: 'fix-mode-source-edits-require-log',
        actionType: 'source-edit',
        riskLevel: 'medium',
        mutatesWorkspace: true,
        destructive: false,
        requiresAuthorization: false,
        allowedModes: ['fix'],
      },
      {
        id: 'fix-mode-dependency-installs-require-log',
        actionType: 'dependency-install',
        riskLevel: 'medium',
        mutatesWorkspace: true,
        destructive: false,
        requiresAuthorization: false,
        allowedModes: ['fix'],
      },
      {
        id: 'destructive-actions-require-authorization',
        actionPattern: 'destructive',
        riskLevel: 'critical',
        mutatesWorkspace: true,
        destructive: true,
        requiresAuthorization: true,
        allowedModes: ['fix', 'release'],
      },
      {
        id: 'global-config-requires-authorization',
        actionType: 'global-config-change',
        riskLevel: 'critical',
        mutatesWorkspace: true,
        destructive: false,
        requiresAuthorization: true,
        allowedModes: ['fix', 'release'],
      },
      {
        id: 'delete-file-requires-authorization',
        actionType: 'delete-file',
        riskLevel: 'critical',
        mutatesWorkspace: true,
        destructive: true,
        requiresAuthorization: true,
        allowedModes: ['fix', 'release'],
      },
      {
        id: 'production-data-requires-authorization',
        actionType: 'production-data-access',
        riskLevel: 'critical',
        mutatesWorkspace: false,
        destructive: false,
        requiresAuthorization: true,
        allowedModes: ['fix', 'release'],
      },
      {
        id: 'git-push-requires-release-stage',
        actionType: 'git-push',
        riskLevel: 'critical',
        mutatesWorkspace: false,
        destructive: false,
        requiresAuthorization: true,
        allowedModes: ['release'],
        requiresReleaseStage: true,
      },
      {
        id: 'git-tag-requires-release-stage',
        actionType: 'git-tag',
        riskLevel: 'critical',
        mutatesWorkspace: false,
        destructive: false,
        requiresAuthorization: true,
        allowedModes: ['release'],
        requiresReleaseStage: true,
      },
      {
        id: 'npm-publish-requires-release-stage',
        actionType: 'npm-publish',
        riskLevel: 'critical',
        mutatesWorkspace: false,
        destructive: false,
        requiresAuthorization: true,
        allowedModes: ['release'],
        requiresReleaseStage: true,
      },
      {
        id: 'release-actions-require-authorization',
        actionPattern: 'release',
        riskLevel: 'critical',
        mutatesWorkspace: false,
        destructive: false,
        requiresAuthorization: true,
        allowedModes: ['release'],
        requiresReleaseStage: true,
      },
    ],
    noFalseCompletion: true,
  };
}

export function classifyActionRisk(input: ClassifyActionRiskInput): ActionRiskClassification {
  const policy = normalizePolicy(input.policy);
  const matches = policy.rules.filter((rule) => matchesRule(rule, input.action));
  const highestRule = matches.reduce<ActionRiskRule | undefined>((selected, rule) => {
    if (selected === undefined) return rule;
    return compareRisk(rule.riskLevel, selected.riskLevel) > 0 ? rule : selected;
  }, undefined);
  const heuristic = heuristicRisk(input.action, policy.defaultRiskLevel);
  const ruleRisk = highestRule?.riskLevel;
  const riskLevel = ruleRisk !== undefined && compareRisk(ruleRisk, heuristic.riskLevel) >= 0 ? ruleRisk : heuristic.riskLevel;

  return {
    riskLevel,
    matchedRuleIds: matches.map((rule) => rule.id),
    mutatesWorkspace: input.action.mutatesWorkspace === true || matches.some((rule) => rule.mutatesWorkspace === true) || heuristic.mutatesWorkspace,
    destructive: input.action.destructive === true || matches.some((rule) => rule.destructive === true) || heuristic.destructive,
    requiresAuthorization: matches.some((rule) => rule.requiresAuthorization === true) || heuristic.requiresAuthorization,
    requiresReleaseStage: matches.some((rule) => rule.requiresReleaseStage === true) || heuristic.requiresReleaseStage,
    allowedModes: highestRule?.allowedModes ?? policyModes.filter((mode) => mode === policy.mode || mode !== 'report-only'),
  };
}

export function validateModeWriteBoundary(input: ValidateModeWriteBoundaryInput): PolicyWriteBoundaryResult {
  const issues: PolicyWriteBoundaryIssue[] = [];
  const roots = input.mode === 'report-only'
    ? reportOnlyWriteRoots(input.allowedWriteRoots)
    : input.allowedWriteRoots ?? defaultReportOnlyWriteRoots;

  for (const write of input.writes) {
    const normalized = normalizeWorkspaceRelativePath(input.workspaceRoot, write.path);
    if (normalized.ok === false) {
      issues.push({
        path: write.path,
        category: write.category,
        reason: normalized.reason,
      });
      continue;
    }

    if (input.mode !== 'report-only') continue;
    const categoryIssue = validateReportOnlyCategory(write, normalized.path, roots);
    if (categoryIssue !== undefined) issues.push(categoryIssue);
  }

  return issues.length === 0 ? { ok: true, issues: [] } : { ok: false, issues };
}

export function evaluateActionPolicy(input: EvaluateActionPolicyInput): ActionPolicyDecision {
  const policy = normalizePolicy(input.policy);
  const mode = normalizeActionMode(input.action.mode ?? policy.mode);
  const evidenceRefs = input.action.evidenceRefs ?? [];
  const classification = classifyActionRisk({ policy, action: input.action });
  const requiresSamePathRetry = needsSamePathRetry(input.action, classification);
  const requiresActionLog = classification.mutatesWorkspace || input.action.mutatesWorkspace === true || requiresSamePathRetry;
  const blockers: PolicyBlocker[] = [];

  if (input.policy.noFalseCompletion !== true) {
    blockers.push(blocker({
      code: 'no-false-completion-disabled',
      message: 'no false completion cannot be disabled; missing evidence must be represented as a blocker or manual confirmation.',
      owner: 'agent',
      riskLevel: 'critical',
      evidenceRefs,
      nextAction: 'Restore noFalseCompletion: true before evaluating completion.',
    }));
  }

  if (mode === 'report-only') {
    const writeBoundary = validateModeWriteBoundary({
      mode,
      workspaceRoot: input.workspaceRoot,
      writes: buildWriteIntents(input.action, classification),
      allowedWriteRoots: policy.allowedWriteRoots,
    });
    if (!writeBoundary.ok) {
      blockers.push(blocker({
        code: 'report-only-write-boundary',
        message: `report-only mode cannot mutate source, config, dependency, git, database, global Claude/MCP, or non-.curdx artifact paths: ${writeBoundary.issues.map((issue) => issue.path).join(', ')}.`,
        owner: 'agent',
        riskLevel: classification.riskLevel,
        evidenceRefs,
        nextAction: 'Switch to fix mode with an action log, or keep report-only and record the issue as evidence.',
      }));
    }
    if (classification.mutatesWorkspace && writeBoundary.ok && !isReportOnlyArtifactAction(input.action)) {
      blockers.push(blocker({
        code: 'report-only-mutation-blocked',
        message: `report-only mode skips ${input.action.actionType} because it would mutate workspace state outside allowed report artifacts.`,
        owner: 'agent',
        riskLevel: classification.riskLevel,
        evidenceRefs,
        nextAction: 'Use fix mode for source/config/dependency changes.',
      }));
    }
  }

  if (
    !classification.allowedModes.includes(mode as ActionPolicyMode)
    && !blockers.some((entry) => entry.code === 'report-only-write-boundary')
  ) {
    blockers.push(blocker({
      code: 'mode-not-allowed',
      message: `${input.action.actionType} is not allowed in ${mode} mode by action-risk policy.`,
      owner: 'agent',
      riskLevel: classification.riskLevel,
      evidenceRefs,
      nextAction: `Choose one of the allowed modes: ${classification.allowedModes.join(', ')}.`,
    }));
  }

  const auth = mergeAuthorization(policy.authorization, input.authorization);
  const needsAuthorization = classification.requiresAuthorization
    || classification.destructive
    || compareRisk(classification.riskLevel, 'high') >= 0
    || highRiskActions.has(input.action.actionType);
  if (needsAuthorization && auth.authorized !== true) {
    blockers.push(blocker({
      code: 'authorization-required',
      message: `${input.action.actionType} is ${classification.riskLevel} risk and requires explicit authorization before execution.`,
      owner: 'user',
      riskLevel: classification.riskLevel,
      evidenceRefs,
      nextAction: 'Provide explicit authorization or choose a lower-risk report-only path.',
      releaseGate: releaseActions.has(input.action.actionType),
    }));
  }
  if ((classification.requiresReleaseStage || releaseActions.has(input.action.actionType)) && auth.releaseStageAuthorized !== true) {
    blockers.push(blocker({
      code: 'release-stage-required',
      message: `${input.action.actionType} requires release-stage context before any push, tag, publish, or Claude plugin release action.`,
      owner: 'user',
      riskLevel: classification.riskLevel,
      evidenceRefs,
      nextAction: 'Enter an authorized release-stage workflow with dry-run evidence before proceeding.',
      releaseGate: true,
    }));
  }

  const decision = blockers.length > 0 ? 'blocked' : 'allowed';
  const actionLog = requiresActionLog
    ? buildActionLogEntry({
      id: input.action.id,
      runId: input.runId,
      goalId: input.goalId,
      mode,
      actionType: input.action.actionType,
      targetFiles: input.action.targetFiles ?? [],
      riskLevel: classification.riskLevel,
      intent: input.action.intent,
      result: decision === 'allowed' ? 'success' : 'blocked',
      command: input.action.command,
      diffSummary: input.action.diffSummary,
      evidenceRefs,
      requiresSamePathRetry,
      createdAt: input.now,
    })
    : undefined;

  return {
    id: input.action.id,
    actionType: input.action.actionType,
    mode,
    decision,
    riskLevel: classification.riskLevel,
    reason: blockers[0]?.message ?? `${input.action.actionType} is allowed by action-risk policy.`,
    matchedRuleIds: classification.matchedRuleIds,
    blockers,
    requiresActionLog,
    requiresSamePathRetry,
    actionLog,
    evidenceRefs,
    core: input.action.core !== false,
  };
}

export function buildActionLogEntry(input: BuildActionLogEntryInput): ActionLogEntry {
  return {
    id: input.id,
    ...(input.runId === undefined ? {} : { runId: input.runId }),
    ...(input.goalId === undefined ? {} : { goalId: input.goalId }),
    mode: input.mode,
    actionType: input.actionType,
    targetFiles: input.targetFiles,
    riskLevel: input.riskLevel,
    intent: redactSummary(input.intent, 240),
    result: input.result,
    ...(input.command === undefined ? {} : { commandSummary: redactSummary(input.command, 240) }),
    ...(input.diffSummary === undefined ? {} : { diffSummary: redactSummary(input.diffSummary, 240) }),
    evidenceRefs: input.evidenceRefs ?? [],
    requiresSamePathRetry: input.requiresSamePathRetry === true,
    createdAt: toIsoDate(input.createdAt),
  };
}

function normalizePolicy(policy: RuntimeActionRiskPolicy | { [key: string]: unknown }): RuntimeActionRiskPolicy {
  return {
    ...policy,
    schemaVersion: 1,
    policyId: typeof policy.policyId === 'string' ? policy.policyId : 'runtime-policy',
    mode: isPolicyMode(policy.mode) ? policy.mode : 'fix',
    defaultRiskLevel: isRiskLevel(policy.defaultRiskLevel) ? policy.defaultRiskLevel : 'medium',
    rules: Array.isArray(policy.rules) ? policy.rules.filter(isActionRiskRuleLike) : [],
    noFalseCompletion: policy.noFalseCompletion as true,
    allowedWriteRoots: Array.isArray(policy.allowedWriteRoots)
      ? policy.allowedWriteRoots.filter((item): item is string => typeof item === 'string')
      : undefined,
    authorization: isRecord(policy.authorization) ? policy.authorization as ActionAuthorizationContext : undefined,
  };
}

function isActionRiskRuleLike(value: unknown): value is ActionRiskRule {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && isRiskLevel(value.riskLevel)
    && typeof value.mutatesWorkspace === 'boolean'
    && typeof value.destructive === 'boolean'
    && typeof value.requiresAuthorization === 'boolean'
    && Array.isArray(value.allowedModes);
}

function matchesRule(rule: ActionRiskRule, action: ActionPolicyAction): boolean {
  if (rule.actionType !== undefined && rule.actionType === action.actionType) return true;
  if (typeof rule.actionPattern !== 'string' || rule.actionPattern.length === 0) return false;
  const haystack = [
    action.actionType,
    action.command,
    action.intent,
    ...(action.targetFiles ?? []),
  ]
    .filter((item): item is string => typeof item === 'string')
    .join('\n')
    .toLowerCase();
  return haystack.includes(rule.actionPattern.toLowerCase());
}

function heuristicRisk(action: ActionPolicyAction, fallback: ActionRiskLevel): Omit<ActionRiskClassification, 'matchedRuleIds' | 'allowedModes'> {
  const commandRisk = classifyCommandRisk(action);
  if (commandRisk !== undefined) return commandRisk;

  if (highRiskActions.has(action.actionType)) {
    return {
      riskLevel: 'critical',
      mutatesWorkspace: action.mutatesWorkspace === true || action.actionType !== 'production-data-access',
      destructive: action.destructive === true || action.actionType === 'delete-file' || action.actionType === 'destructive-migration',
      requiresAuthorization: true,
      requiresReleaseStage: releaseActions.has(action.actionType),
    };
  }

  if (action.actionType === 'database-migration') {
    return {
      riskLevel: 'high',
      mutatesWorkspace: true,
      destructive: action.destructive === true,
      requiresAuthorization: action.destructive === true,
      requiresReleaseStage: false,
    };
  }

  if (action.actionType === 'source-edit' || action.actionType === 'config-edit' || action.actionType === 'dependency-install') {
    return {
      riskLevel: 'medium',
      mutatesWorkspace: true,
      destructive: action.destructive === true,
      requiresAuthorization: false,
      requiresReleaseStage: false,
    };
  }

  if (mutatingActionTypes.has(action.actionType)) {
    return {
      riskLevel: action.actionType === 'generated-verification-file' ? 'medium' : 'low',
      mutatesWorkspace: true,
      destructive: action.destructive === true,
      requiresAuthorization: false,
      requiresReleaseStage: false,
    };
  }

  return {
    riskLevel: action.mutatesWorkspace === true ? fallback : 'low',
    mutatesWorkspace: action.mutatesWorkspace === true,
    destructive: action.destructive === true,
    requiresAuthorization: false,
    requiresReleaseStage: false,
  };
}

function classifyCommandRisk(
  action: ActionPolicyAction,
): Omit<ActionRiskClassification, 'matchedRuleIds' | 'allowedModes'> | undefined {
  if (action.actionType !== 'command' || typeof action.command !== 'string') return undefined;
  const command = action.command.toLowerCase();
  const releasePattern = /\b(git\s+push|git\s+tag|npm\s+publish|claude\s+plugin\s+(tag|release))\b/;
  const destructivePattern = /\b(rm\s+-rf|drop\s+database|truncate\s+table|migrate\s+(reset|down)|db:(reset|drop))\b/;

  if (releasePattern.test(command)) {
    return {
      riskLevel: 'critical',
      mutatesWorkspace: action.mutatesWorkspace === true,
      destructive: action.destructive === true,
      requiresAuthorization: true,
      requiresReleaseStage: true,
    };
  }

  if (destructivePattern.test(command)) {
    return {
      riskLevel: 'critical',
      mutatesWorkspace: action.mutatesWorkspace === true || action.targetFiles?.length !== 0,
      destructive: true,
      requiresAuthorization: true,
      requiresReleaseStage: false,
    };
  }

  return undefined;
}

function buildWriteIntents(action: ActionPolicyAction, classification: ActionRiskClassification): PolicyWriteIntent[] {
  const targetFiles = action.targetFiles ?? [];
  const category = categoryForAction(action.actionType);
  if (targetFiles.length > 0) {
    return targetFiles.map((path) => ({ path, category }));
  }
  if (classification.mutatesWorkspace) {
    return [{ path: syntheticPathForAction(action.actionType), category }];
  }
  return [];
}

function syntheticPathForAction(actionType: string): string {
  switch (actionType) {
    case 'dependency-install':
      return 'package.json';
    case 'global-config-change':
      return '.claude/settings.json';
    case 'git-push':
    case 'git-tag':
      return '.git/refs/runtime-policy';
    case 'database-migration':
    case 'destructive-migration':
      return 'migrations/runtime-policy.sql';
    case 'plugin-release':
    case 'npm-publish':
    case 'release':
      return 'package.json';
    default:
      return 'src/runtime-policy-target';
  }
}

function categoryForAction(actionType: string): string {
  switch (actionType) {
    case 'report-write':
      return 'report';
    case 'evidence-write':
      return 'evidence';
    case 'artifact-write':
    case 'state-write':
      return 'temporary-artifact';
    default:
      return 'source-change';
  }
}

function validateReportOnlyCategory(
  write: PolicyWriteIntent,
  normalizedPath: string,
  roots: string[],
): PolicyWriteBoundaryIssue | undefined {
  if (isGitPath(normalizedPath)) {
    return {
      path: write.path,
      category: write.category,
      reason: 'report-only mode cannot modify git state.',
    };
  }

  const root = roots.find((allowedRoot) => normalizedPath === allowedRoot || normalizedPath.startsWith(`${allowedRoot}/`));
  if (root === undefined) {
    return {
      path: write.path,
      category: write.category,
      reason: 'report-only mode only allows .curdx report, evidence, artifact, and state writes.',
    };
  }

  const category = write.category ?? 'temporary-artifact';
  if (root === '.curdx/reports' && category !== 'report') {
    return { path: write.path, category, reason: 'report-only report writes must be marked as report artifacts.' };
  }
  if (root === '.curdx/evidence' && category !== 'evidence') {
    return { path: write.path, category, reason: 'report-only evidence writes must be marked as evidence artifacts.' };
  }
  if (root === '.curdx/artifacts' && !['temporary-artifact', 'external-tool-output', 'evidence'].includes(category)) {
    return { path: write.path, category, reason: 'report-only artifact writes must be visibly marked as artifacts.' };
  }
  if (root === '.curdx/state' && !['temporary-artifact', 'external-tool-output'].includes(category)) {
    return { path: write.path, category, reason: 'report-only state writes must stay under the runtime state artifact boundary.' };
  }
  return undefined;
}

function reportOnlyWriteRoots(roots: string[] | undefined): string[] {
  if (roots === undefined) return [...defaultReportOnlyWriteRoots];
  return roots.filter((root) => defaultReportOnlyWriteRoots.includes(root));
}

function normalizeWorkspaceRelativePath(
  workspaceRoot: string,
  inputPath: string,
): { ok: true; path: string } | { ok: false; reason: string } {
  if (inputPath.length === 0 || inputPath.includes('\0')) {
    return { ok: false, reason: 'path must be non-empty and must not contain null bytes.' };
  }

  const relativePath = isAbsolute(inputPath)
    ? relative(resolve(workspaceRoot), resolve(inputPath))
    : inputPath;
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return { ok: false, reason: 'path must stay inside the workspace.' };
  }

  const normalized = relativePath.replaceAll('\\', '/').split('/').filter((segment) => segment.length > 0).join('/');
  const segments = normalized.split('/');
  if (normalized.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
    return { ok: false, reason: 'path must be workspace-relative and must not escape the workspace.' };
  }
  return { ok: true, path: normalized };
}

function isReportOnlyArtifactAction(action: ActionPolicyAction): boolean {
  return action.actionType === 'report-write'
    || action.actionType === 'evidence-write'
    || action.actionType === 'artifact-write'
    || action.actionType === 'state-write';
}

function isGitPath(path: string): boolean {
  return path === '.git' || path.startsWith('.git/');
}

function needsSamePathRetry(action: ActionPolicyAction, classification: ActionRiskClassification): boolean {
  return classification.mutatesWorkspace
    && (action.actionType === 'source-edit'
      || action.actionType === 'config-edit'
      || action.actionType === 'dependency-install'
      || action.actionType === 'generated-verification-file'
      || action.actionType === 'delete-file');
}

function mergeAuthorization(
  policyAuthorization: ActionAuthorizationContext | undefined,
  inputAuthorization: ActionAuthorizationContext | undefined,
): ActionAuthorizationContext {
  return {
    ...(policyAuthorization ?? {}),
    ...(inputAuthorization ?? {}),
  };
}

function blocker(input: {
  code: string;
  message: string;
  owner: PolicyBlocker['owner'];
  riskLevel: ActionRiskLevel;
  evidenceRefs: string[];
  nextAction: string;
  releaseGate?: boolean;
}): PolicyBlocker {
  return {
    code: input.code,
    category: 'policy',
    message: input.message,
    owner: input.owner,
    riskLevel: input.riskLevel,
    evidenceRefs: input.evidenceRefs,
    core: true,
    ...(input.releaseGate === true ? { releaseGate: true } : {}),
    nextAction: {
      owner: input.owner,
      summary: input.nextAction,
    },
  };
}

function redactSummary(value: string, maxLength: number): string {
  const redacted = value
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
    .replace(/(token=)[^\s]+/gi, '$1[REDACTED]')
    .replace(/(--token\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/(Authorization:\s*Bearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/(Cookie:\s*)[^\s]+/gi, '$1[REDACTED]');
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength - 3)}...` : redacted;
}

function compareRisk(left: ActionRiskLevel, right: ActionRiskLevel): number {
  return riskOrder[left] - riskOrder[right];
}

function normalizeActionMode(mode: ActionRuntimeMode): ActionPolicyDecision['mode'] {
  return mode;
}

function toIsoDate(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date().toISOString();
}

function isPolicyMode(value: unknown): value is ActionPolicyMode {
  return value === 'report-only' || value === 'fix' || value === 'release';
}

function isRiskLevel(value: unknown): value is ActionRiskLevel {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
