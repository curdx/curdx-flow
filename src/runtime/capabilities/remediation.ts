import type { ActionPolicyDecision, ActionRiskLevel, RuntimeActionRiskPolicy } from '../policy/types.ts';
import { evaluateActionPolicy } from '../policy/action-risk-policy.ts';
import type { CapabilityStatus } from './types.ts';

export type CapabilityRemediationKind =
  | 'install-plugin-dependency'
  | 'configure-external-mcp'
  | 'install-dev-dependency'
  | 'repair-browser-verifier'
  | 'manual-remediation';

export type CapabilityRemediationStatus = 'planned' | 'blocked' | 'failed';

export interface AttemptedRemediationAction extends Record<string, unknown> {
  id: string;
  capabilityId: string;
  result: 'success' | 'failed' | 'blocked' | 'skipped';
  reason: string;
}

export interface CapabilityRemediationAction extends Record<string, unknown> {
  id: string;
  capabilityId: string;
  kind: CapabilityRemediationKind;
  status: CapabilityRemediationStatus;
  action: string;
  targetFiles: string[];
  riskLevel: ActionRiskLevel;
  requiresAuthorization: boolean;
  expectedRestoredCapabilities: string[];
  verificationCommand: string;
  executesAutomatically: false;
  failureFallback: string;
  policyDecision: ActionPolicyDecision;
  attempted: boolean;
  attemptReason?: string;
  postAttemptCapabilityState?: CapabilityStatus['state'];
  completionImpact: string;
}

export interface CapabilityRemediationPlan extends Record<string, unknown> {
  schemaVersion: 1;
  generatedAt: string;
  status: 'clean' | 'planned' | 'blocked' | 'failed';
  actions: CapabilityRemediationAction[];
  blockers: CapabilityRemediationAction[];
}

export interface PlanCapabilityRemediationInput {
  workspaceRoot: string;
  policy: RuntimeActionRiskPolicy;
  capabilities: CapabilityStatus[];
  attemptedActions?: AttemptedRemediationAction[];
  generatedAt?: Date | string;
}

export function planCapabilityRemediation(input: PlanCapabilityRemediationInput): CapabilityRemediationPlan {
  const attempts = new Map((input.attemptedActions ?? []).map((attempt) => [attempt.id, attempt]));
  const actions = input.capabilities
    .filter(needsRemediation)
    .map((capability): CapabilityRemediationAction => {
      const spec = remediationSpec(capability);
      const attempt = attempts.get(spec.id);
      const policyDecision = evaluateActionPolicy({
        policy: input.policy,
        workspaceRoot: input.workspaceRoot,
        action: {
          id: spec.id,
          actionType: spec.actionType,
          mode: input.policy.mode,
          targetFiles: spec.targetFiles,
          mutatesWorkspace: true,
          intent: spec.action,
          command: spec.command,
          core: capability.blocksCompletion,
        },
      });
      const failedAttempt = attempt?.result === 'failed';

      return {
        id: spec.id,
        capabilityId: capability.id,
        kind: spec.kind,
        status: failedAttempt ? 'failed' : policyDecision.decision === 'blocked' ? 'blocked' : 'planned',
        action: spec.action,
        targetFiles: spec.targetFiles,
        riskLevel: policyDecision.riskLevel,
        requiresAuthorization: policyDecision.blockers.some((blocker) =>
          blocker.code === 'authorization-required' || blocker.code === 'release-stage-required',
        ),
        expectedRestoredCapabilities: capability.evidenceImpact,
        verificationCommand: spec.verificationCommand,
        executesAutomatically: false,
        failureFallback: spec.failureFallback,
        policyDecision,
        attempted: attempt !== undefined,
        ...(attempt === undefined ? {} : { attemptReason: attempt.reason }),
        ...(attempt === undefined ? {} : { postAttemptCapabilityState: capability.state }),
        completionImpact: completionImpact(capability),
      };
    });

  const failed = actions.some((action) => action.status === 'failed');
  const blocked = actions.some((action) => action.status === 'blocked');
  return {
    schemaVersion: 1,
    generatedAt: toIsoDate(input.generatedAt),
    status: failed ? 'failed' : blocked ? 'blocked' : actions.length > 0 ? 'planned' : 'clean',
    actions,
    blockers: actions.filter((action) => action.status === 'blocked' || action.status === 'failed'),
  };
}

function needsRemediation(capability: CapabilityStatus): boolean {
  if (capability.state === 'available') return false;
  return !(capability.id === 'playwright'
    && capability.state === 'skipped'
    && capability.configured === true
    && capability.callable === 'skipped');
}

function remediationSpec(capability: CapabilityStatus): {
  id: string;
  kind: CapabilityRemediationKind;
  actionType: Parameters<typeof evaluateActionPolicy>[0]['action']['actionType'];
  action: string;
  targetFiles: string[];
  command: string;
  verificationCommand: string;
  failureFallback: string;
} {
  const id = `remediate-${capability.id}`;
  if (capability.category === 'plugin-dependency') {
    return {
      id,
      kind: 'install-plugin-dependency',
      actionType: 'global-config-change',
      action: `Install, enable, or update Claude Code plugin dependency ${capability.id}; do not vendor or reimplement it in curdx-flow.`,
      targetFiles: ['~/.claude/plugins'],
      command: `claude plugin list --json # verify ${capability.id} dependency state`,
      verificationCommand: 'claude plugin list --json',
      failureFallback: `Keep ${capability.id} degraded/unavailable and report affected evidence as degraded or blocked.`,
    };
  }

  if (capability.category === 'external-mcp') {
    return {
      id,
      kind: 'configure-external-mcp',
      actionType: 'global-config-change',
      action: `Configure external MCP ${capability.id} in the user's Claude environment; keep it outside curdx-flow manifest dependencies and plugin-local MCP config.`,
      targetFiles: ['~/.claude.json'],
      command: `claude mcp list # verify external MCP ${capability.id}`,
      verificationCommand: 'claude mcp list',
      failureFallback: `Keep ${capability.id} degraded/unavailable and require fallback or manual confirmation.`,
    };
  }

  if (capability.id === 'playwright' || capability.provider === 'playwright') {
    const missing = capability.installed === false || capability.configured === false;
    return {
      id,
      kind: missing ? 'install-dev-dependency' : 'repair-browser-verifier',
      actionType: missing ? 'dependency-install' : 'config-edit',
      action: missing
        ? 'Add or enable a project-local Playwright/browser verifier script.'
        : 'Repair the project-local Playwright/browser verifier so it is callable.',
      targetFiles: ['package.json'],
      command: 'npm run e2e',
      verificationCommand: 'npm run e2e',
      failureFallback: 'Remain degraded and require manual confirmation for browser evidence.',
    };
  }

  return {
    id,
    kind: 'manual-remediation',
    actionType: 'command',
    action: capability.remediation ?? `Manually remediate ${capability.id}.`,
    targetFiles: [],
    command: 'curdx-flow doctor',
    verificationCommand: 'curdx-flow doctor',
    failureFallback: `Keep ${capability.id} degraded/unavailable and record a blocker.`,
  };
}

function completionImpact(capability: CapabilityStatus): string {
  const impact = capability.evidenceImpact.length > 0 ? capability.evidenceImpact.join(', ') : 'capability evidence';
  const severity = capability.blocksCompletion ? 'blocks completion' : 'degrades completion confidence';
  return `${capability.id} ${severity}; affected evidence: ${impact}.`;
}

function toIsoDate(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date().toISOString();
}
