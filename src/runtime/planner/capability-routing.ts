import type { CapabilityStatus } from '../capabilities/types.ts';
import type {
  CapabilityRouteDecision,
  CapabilityRouteDecisionKind,
  CapabilityRouteTrustLevel,
  CapabilityRoutingPlan,
  PlanCapabilityRoutesInput,
} from './types.ts';

interface RouteCandidate {
  id: string;
  role: 'primary' | 'fallback';
}

export function planCapabilityRoutes(input: PlanCapabilityRoutesInput): CapabilityRoutingPlan {
  const capabilityById = new Map(input.capabilityMatrix.capabilities.map((capability) => [capability.id, capability]));
  const routes = input.requirements.map((requirement): CapabilityRouteDecision => {
    const candidates = candidatesForRequirement(requirement, input.taskType);
    const primary = candidates[0]?.id ?? requirement.capabilityId ?? capabilityIdForSource(requirement.source);
    const primaryStatus = capabilityById.get(primary);
    const selectedPrimary = primaryStatus !== undefined && isCapabilitySelectable(primaryStatus);
    if (selectedPrimary) {
      return buildRoute({
        requirement,
        decision: 'selected',
        primaryCapabilityId: primary,
        selectedCapabilityId: primary,
        selectedStatus: primaryStatus,
        fallbackCapabilityIds: fallbackIds(candidates),
        reason: selectedReason(primaryStatus, requirement.source),
        trustLevel: 'verified',
        manualConfirmationRequired: false,
        blocksCompletion: false,
      });
    }

    const fallback = candidates
      .filter((candidate) => candidate.role === 'fallback')
      .map((candidate) => capabilityById.get(candidate.id))
      .find((capability): capability is CapabilityStatus => capability !== undefined && isCapabilitySelectable(capability));

    if (fallback !== undefined) {
      const browserFallback = requirement.source === 'browser';
      const blocksCompletion = browserFallback && requirement.core !== false;
      const degradedReason = browserFallback
        ? `${fallback.id} is useful for live browser diagnostics but is not rerunnable E2E evidence.`
        : `${fallback.id} is a lower-trust fallback for ${requirement.description}.`;
      return buildRoute({
        requirement,
        decision: 'fallback',
        primaryCapabilityId: primary,
        selectedCapabilityId: fallback.id,
        selectedStatus: fallback,
        fallbackCapabilityIds: [fallback.id],
        reason: `Selected fallback capability ${fallback.id}; ${degradedReason}`,
        trustLevel: 'degraded',
        degradedReason,
        manualConfirmationRequired: true,
        blocksCompletion,
      });
    }

    if (primaryStatus !== undefined && isCapabilityDegraded(primaryStatus)) {
      const blocksCompletion = requirement.core !== false && primaryStatus.blocksCompletion === true;
      return buildRoute({
        requirement,
        decision: blocksCompletion ? 'blocked' : 'degraded',
        primaryCapabilityId: primary,
        selectedCapabilityId: primaryStatus.id,
        selectedStatus: primaryStatus,
        fallbackCapabilityIds: fallbackIds(candidates),
        reason: `${primaryStatus.id} is ${primaryStatus.state}; ${capabilityBoundaryReason(primaryStatus)}`,
        trustLevel: blocksCompletion ? 'blocked' : 'degraded',
        degradedReason: primaryStatus.reason,
        manualConfirmationRequired: true,
        blocksCompletion,
      });
    }

    return buildRoute({
      requirement,
      decision: 'blocked',
      primaryCapabilityId: primary,
      selectedCapabilityId: null,
      selectedStatus: primaryStatus,
      fallbackCapabilityIds: fallbackIds(candidates),
      reason: primaryStatus === undefined
        ? `${primary} is not present in capability matrix for ${requirement.description}.`
        : `${primary} is unavailable; ${capabilityBoundaryReason(primaryStatus)}`,
      trustLevel: 'blocked',
      degradedReason: primaryStatus?.reason,
      manualConfirmationRequired: requirement.allowManualConfirmation === true,
      blocksCompletion: requirement.core !== false,
    });
  });

  const summary = {
    selected: routes.filter((route) => route.decision === 'selected').length,
    fallback: routes.filter((route) => route.decision === 'fallback').length,
    blocked: routes.filter((route) => route.decision === 'blocked').length,
    degraded: routes.filter((route) => route.decision === 'degraded').length,
    manualConfirmationRequired: routes.filter((route) => route.manualConfirmationRequired).length,
  };

  return {
    schemaVersion: 1,
    generatedAt: toIsoDate(input.generatedAt),
    taskType: input.taskType,
    routes,
    blockers: routes.filter((route) => route.blocksCompletion || route.decision === 'blocked'),
    degraded: routes.filter((route) =>
      route.decision === 'fallback' || route.decision === 'degraded' || route.trustLevel === 'degraded',
    ),
    summary,
  };
}

function buildRoute(input: {
  requirement: PlanCapabilityRoutesInput['requirements'][number];
  decision: CapabilityRouteDecisionKind;
  primaryCapabilityId: string;
  selectedCapabilityId: string | null;
  selectedStatus?: CapabilityStatus;
  fallbackCapabilityIds: string[];
  reason: string;
  trustLevel: CapabilityRouteTrustLevel;
  degradedReason?: string;
  manualConfirmationRequired: boolean;
  blocksCompletion: boolean;
}): CapabilityRouteDecision {
  const remediationRefs = input.decision !== 'selected' && input.selectedStatus !== undefined && input.selectedStatus.state !== 'available'
    ? [`remediate-${input.selectedStatus.id}`]
    : input.decision === 'blocked'
      ? [`remediate-${input.primaryCapabilityId}`]
      : [];

  return {
    id: `route-${input.requirement.id}`,
    requirementId: input.requirement.id,
    requirementSource: input.requirement.source,
    description: input.requirement.description,
    decision: input.decision,
    primaryCapabilityId: input.primaryCapabilityId,
    selectedCapabilityId: input.selectedCapabilityId,
    fallbackCapabilityIds: input.fallbackCapabilityIds,
    reason: input.reason,
    trustLevel: input.trustLevel,
    ...(input.degradedReason === undefined ? {} : { degradedReason: input.degradedReason }),
    manualConfirmationRequired: input.manualConfirmationRequired,
    blocksCompletion: input.blocksCompletion,
    core: input.requirement.core !== false,
    remediationRefs,
    evidenceImpact: input.selectedStatus?.evidenceImpact ?? [],
    ...(input.selectedStatus === undefined ? {} : { capabilityState: input.selectedStatus.state }),
  };
}

function candidatesForRequirement(
  requirement: PlanCapabilityRoutesInput['requirements'][number],
  taskType: PlanCapabilityRoutesInput['taskType'],
): RouteCandidate[] {
  if (requirement.capabilityId !== undefined) {
    return [
      { id: requirement.capabilityId, role: 'primary' },
      ...explicitFallbacks(requirement.capabilityId).map((id): RouteCandidate => ({ id, role: 'fallback' })),
    ];
  }

  if (requirement.source === 'browser') {
    return [
      { id: 'playwright', role: 'primary' },
      { id: 'chrome-devtools-mcp', role: 'fallback' },
      { id: 'chrome-runtime', role: 'fallback' },
    ];
  }

  if (requirement.source === 'api') {
    return [{ id: 'api.check', role: 'primary' }];
  }

  if (requirement.source === 'data') {
    return [{ id: 'data.probe', role: 'primary' }];
  }

  if (requirement.source === 'command') {
    return [
      { id: 'package-manager', role: 'primary' },
      { id: 'node', role: 'fallback' },
    ];
  }

  const text = `${requirement.id} ${requirement.description} ${taskType}`.toLowerCase();
  if (text.includes('latest') || text.includes('official docs') || text.includes('documentation')) {
    return [{ id: 'context7', role: 'primary' }];
  }
  if (
    text.includes('ux') ||
    text.includes('ui/ux') ||
    text.includes('visual') ||
    text.includes('responsive') ||
    text.includes('interaction') ||
    text.includes('usability')
  ) {
    return [{ id: 'ui-ux-pro-max', role: 'primary' }];
  }
  if (text.includes('history') || text.includes('historical') || text.includes('memory') || text.includes('failure')) {
    return [{ id: 'claude-mem', role: 'primary' }];
  }
  if (text.includes('parallel') || text.includes('decomposition') || text.includes('diagnostic')) {
    return [{ id: 'pua', role: 'primary' }];
  }
  if (text.includes('risk') || text.includes('architecture') || text.includes('reasoning')) {
    return [{ id: 'sequential-thinking', role: 'primary' }];
  }

  return [{ id: capabilityIdForSource(requirement.source), role: 'primary' }];
}

function explicitFallbacks(capabilityId: string): string[] {
  if (capabilityId === 'playwright') return ['chrome-devtools-mcp', 'chrome-runtime'];
  return [];
}

function fallbackIds(candidates: RouteCandidate[]): string[] {
  return candidates.filter((candidate) => candidate.role === 'fallback').map((candidate) => candidate.id);
}

function capabilityIdForSource(source: string): string {
  switch (source) {
    case 'browser':
      return 'playwright';
    case 'api':
      return 'api.check';
    case 'data':
      return 'data.probe';
    case 'command':
      return 'package-manager';
    case 'release':
      return 'release.dry-run';
    default:
      return `${source}.manual`;
  }
}

function isCapabilitySelectable(capability: CapabilityStatus): boolean {
  if (capability.state === 'available') return capability.callable !== false && capability.authorized !== false;
  return capability.id === 'playwright'
    && capability.state === 'skipped'
    && capability.configured === true
    && capability.callable === 'skipped';
}

function isCapabilityDegraded(capability: CapabilityStatus): boolean {
  return capability.state === 'degraded' || capability.state === 'unknown' || capability.state === 'skipped';
}

function selectedReason(capability: CapabilityStatus, source: string): string {
  if (capability.id === 'playwright' && source === 'browser') {
    return 'Selected Playwright as the rerunnable browser evidence path; Chrome DevTools MCP remains diagnostic fallback if available.';
  }
  return `Selected ${capability.id} because it is ${capability.state} and matches the evidence requirement.`;
}

function capabilityBoundaryReason(capability: CapabilityStatus): string {
  if (capability.category === 'external-mcp') {
    return `external MCP ${capability.id} must be configured outside curdx-flow and cannot be vendored.`;
  }
  if (capability.category === 'plugin-dependency') {
    return `plugin dependency ${capability.id} must be installed and callable through Claude Code plugin dependency state.`;
  }
  return capability.reason;
}

function toIsoDate(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date().toISOString();
}
