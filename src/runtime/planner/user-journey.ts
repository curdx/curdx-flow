import { planCapabilityRoutes } from './capability-routing.ts';
import type {
  CapabilityRoutingPlan,
  JourneyArtifactRequirement,
  JourneyActionHint,
  JourneyMissingEvidence,
  JourneyPlanMode,
  JourneyPlanningStatus,
  JourneyRemainingRisk,
  JourneyStep,
  PlanUserJourneyVerificationInput,
  UserJourney,
  UserJourneyHint,
  UserJourneyVerificationPlan,
} from './types.ts';
import type { EvidenceRequirement, TaskType } from '../verdict/types.ts';

export function planUserJourneyVerification(input: PlanUserJourneyVerificationInput): UserJourneyVerificationPlan {
  const generatedAt = normalizeDate(input.generatedAt);
  const evidenceRequirements = input.evidenceRequirements ?? defaultEvidenceRequirements(input.taskType);
  const capabilityRoutes = input.capabilityRoutes ?? (input.capabilityMatrix
    ? planCapabilityRoutes({
      taskType: input.taskType,
      capabilityMatrix: input.capabilityMatrix,
      requirements: evidenceRequirements,
      generatedAt,
    })
    : undefined);
  const missingEvidence: JourneyMissingEvidence[] = [];
  const journeys = buildJourneys(input, missingEvidence);
  missingEvidence.push(...missingFromCapabilityRoutes(capabilityRoutes));
  missingEvidence.push(...missingFromExpectations(input.taskType, journeys));
  const dedupedMissing = dedupeMissing(missingEvidence);
  const requiredArtifacts = artifactRequirements(evidenceRequirements);
  const remainingRisks = remainingRisksFor(input, capabilityRoutes, dedupedMissing, journeys);
  const status = determineStatus(input, journeys, dedupedMissing, capabilityRoutes);

  return {
    schemaVersion: 1,
    generatedAt,
    userIntent: input.userIntent,
    taskType: input.taskType,
    mode: input.mode,
    status,
    verdict: {
      status,
      complete: false,
      reason: verdictReason(status),
      blocksCompletion: status !== 'ready',
    },
    topologySummary: {
      overallType: input.topology.overallType,
      status: input.topology.status,
      confidence: input.topology.confidence,
    },
    journeys,
    evidenceRequirements,
    capabilityRoutes,
    requiredArtifacts,
    missingEvidence: dedupedMissing,
    remainingRisks,
    recovery: recoveryPlan(input.mode),
    readiness: input.runtimeReadiness ? { status: input.runtimeReadiness.status } : undefined,
  };
}

function buildJourneys(
  input: PlanUserJourneyVerificationInput,
  missingEvidence: JourneyMissingEvidence[],
): UserJourney[] {
  if (input.journeys && input.journeys.length > 0) {
    const journeys = input.journeys.map((journey) => fromExplicitJourney(journey, input.mode, input.taskType));
    missingEvidence.push(...journeys.flatMap((journey) => journey.missingEvidence));
    return journeys;
  }

  const inferredEntry = inferEntryUrl(input);
  if (!inferredEntry) {
    missingEvidence.push({
      id: 'entry-url-missing',
      source: 'browser',
      description: 'No entry URL or route could be inferred for the user journey.',
      reason: 'Runtime topology did not expose browser route hints or service URL hints.',
      core: true,
      blocksCompletion: true,
    });
    missingEvidence.push(missingActions());
    return [];
  }

  missingEvidence.push(missingActions());
  return [
    {
      id: 'inferred-journey',
      title: `Inferred journey for ${input.userIntent}`,
      entry: {
        url: inferredEntry.url,
        serviceId: inferredEntry.serviceId,
        root: inferredEntry.root,
        inferred: true,
        confidence: inferredEntry.confidence,
      },
      actions: [
        step({
          id: 'open-inferred-entry',
          type: 'navigate',
          description: `Open inferred entry ${inferredEntry.url}.`,
          allowedInReportOnly: true,
        }),
      ],
      expectedUi: [],
      expectedApi: [],
      expectedData: [],
      inferred: true,
      confidence: Math.min(inferredEntry.confidence, 0.68),
      missingEvidence: [missingActions()],
      remainingRisks: [{
        id: 'inferred-action-risk',
        riskLevel: 'medium',
        summary: 'User action sequence is inferred or missing.',
        mitigation: 'Ask the user for the critical path before executing browser/API/data probes.',
      }],
    },
  ];
}

function fromExplicitJourney(journey: UserJourneyHint, mode: JourneyPlanMode, taskType: TaskType): UserJourney {
  const missingEvidence: JourneyMissingEvidence[] = [];
  const remainingRisks: JourneyRemainingRisk[] = [];
  if (journey.actions.length === 0) {
    missingEvidence.push(missingActions());
  }
  const actionIds = new Set(journey.actions.map((action) => action.id));
  const actions = journey.actions.map((action) => planActionForMode(action, mode, missingEvidence, remainingRisks));
  const expectedUi = journey.expectedUi ?? [];
  const expectedApi = journey.expectedApi ?? [];
  const expectedData = journey.expectedData ?? [];
  missingEvidence.push(...missingFromExpectationBindings(journey.id, actionIds, expectedUi, expectedApi, expectedData));
  if (taskType === 'fullstack' || taskType === 'data') {
    missingEvidence.push(...missingFromDataReadback(journey.id, expectedData));
  }

  if (mode === 'fix') {
    actions.push(
      step({
        id: `${journey.id}-reproduce-before-fix`,
        type: 'reproduce-before-fix',
        description: 'Reproduce the failing journey before handing off to recovery.',
        allowedInReportOnly: false,
      }),
      step({
        id: `${journey.id}-handoff-to-recovery`,
        type: 'handoff-to-recovery',
        description: 'Hand off fix actions to Epic 5 recovery flow without executing them in the journey planner.',
        allowedInReportOnly: false,
      }),
      step({
        id: `${journey.id}-same-path-retry`,
        type: 'same-path-retry',
        description: 'Rerun the same user path after recovery provides a fix attempt.',
        allowedInReportOnly: false,
      }),
    );
  }

  return {
    id: journey.id,
    title: journey.title,
    entry: {
      ...journey.entry,
      inferred: false,
      confidence: 1,
    },
    actions,
    expectedUi,
    expectedApi,
    expectedData,
    inferred: false,
    confidence: 1,
    missingEvidence: dedupeMissing(missingEvidence),
    remainingRisks: dedupeRisks(remainingRisks),
  };
}

function planActionForMode(
  action: JourneyActionHint,
  mode: JourneyPlanMode,
  missingEvidence: JourneyMissingEvidence[],
  remainingRisks: JourneyRemainingRisk[],
): JourneyStep {
  if (mode !== 'report-only') {
    return step({
      id: action.id,
      type: action.type,
      description: action.description,
      target: action.target,
      value: action.value,
      allowedInReportOnly: isReportOnlyObservationStep(action.type),
    });
  }

  if (isReportOnlyObservationStep(action.type)) {
    return step({
      id: action.id,
      type: action.type,
      description: action.description,
      target: action.target,
      value: action.value,
      allowedInReportOnly: true,
    });
  }

  if (isForbiddenReportOnlyAction(action.type)) {
    missingEvidence.push({
      id: `report-only-forbidden-action-${action.id}`,
      source: 'manual',
      description: `Report-only mode cannot include ${action.type} action ${action.id}.`,
      reason: 'Report-only journey plans may only contain read-only observation, checks, screenshot/trace capture, and report artifacts.',
      core: true,
      blocksCompletion: true,
    });
  } else {
    remainingRisks.push({
      id: `report-only-observation-only-${action.id}`,
      riskLevel: 'medium',
      summary: `Report-only mode records requested ${action.type} action ${action.id} as observation only.`,
      mitigation: 'Use verification or fix mode to execute the user interaction and collect fresh journey evidence.',
    });
  }

  return step({
    id: action.id,
    type: 'observe',
    originalType: action.type,
    description: `Report-only observation for requested ${action.type} action: ${action.description}`,
    target: action.target,
    allowedInReportOnly: true,
  });
}

function defaultEvidenceRequirements(taskType: TaskType): EvidenceRequirement[] {
  if (taskType === 'fullstack') {
    return [
      requirement('journey-browser', 'browser', 'Browser journey evidence with screenshot or trace.'),
      requirement('journey-api', 'api', 'API request/response evidence bound to user action.'),
      requirement('journey-data', 'data', 'Data persistence or readback evidence.'),
    ];
  }

  if (taskType === 'frontend') {
    return [
      requirement('journey-browser', 'browser', 'Browser journey evidence with screenshot or trace.'),
    ];
  }

  if (taskType === 'backend') {
    return [
      requirement('journey-api', 'api', 'API request/response evidence.'),
    ];
  }

  if (taskType === 'data') {
    return [
      requirement('journey-data', 'data', 'Data persistence or readback evidence.'),
    ];
  }

  return [
    requirement('journey-command', 'command', 'Command evidence for the requested task.'),
  ];
}

function requirement(id: string, source: EvidenceRequirement['source'], description: string): EvidenceRequirement {
  return {
    id,
    source,
    description,
    core: true,
  };
}

function missingFromCapabilityRoutes(routes: CapabilityRoutingPlan | undefined): JourneyMissingEvidence[] {
  if (!routes) return [];
  return routes.blockers.map((route) => ({
    id: `capability-${route.requirementId}-missing`,
    source: route.requirementSource,
    description: route.description,
    reason: route.reason,
    core: route.core,
    blocksCompletion: route.blocksCompletion,
    capabilityRouteId: route.id,
  }));
}

function missingFromExpectations(taskType: TaskType, journeys: UserJourney[]): JourneyMissingEvidence[] {
  if (journeys.length === 0) return [];
  const missing: JourneyMissingEvidence[] = [];
  if ((taskType === 'frontend' || taskType === 'fullstack') && journeys.every((journey) => journey.expectedUi.length === 0)) {
    missing.push({
      id: 'ui-expectation-missing',
      source: 'browser',
      description: 'Journey does not define expected UI state.',
      reason: 'A browser-facing task needs an observable UI assertion.',
      core: true,
      blocksCompletion: true,
    });
  }
  if (taskType === 'fullstack' && journeys.every((journey) => journey.expectedApi.length === 0)) {
    missing.push({
      id: 'api-expectation-missing',
      source: 'api',
      description: 'Journey does not define API request/response expectations.',
      reason: 'Full-stack verification needs API evidence bound to a user action.',
      core: true,
      blocksCompletion: true,
    });
  }
  if (taskType === 'fullstack' && journeys.every((journey) => journey.expectedData.length === 0)) {
    missing.push({
      id: 'data-expectation-missing',
      source: 'data',
      description: 'Journey does not define data persistence/readback expectations.',
      reason: 'Full-stack verification needs data state evidence.',
      core: true,
      blocksCompletion: true,
    });
  }
  return missing;
}

function missingFromExpectationBindings(
  journeyId: string,
  actionIds: Set<string>,
  expectedUi: UserJourney['expectedUi'],
  expectedApi: UserJourney['expectedApi'],
  expectedData: UserJourney['expectedData'],
): JourneyMissingEvidence[] {
  const missing: JourneyMissingEvidence[] = [];
  for (const expectation of expectedUi) {
    if (!actionIds.has(expectation.actionId)) {
      missing.push({
        id: `ui-action-binding-missing-${journeyId}-${expectation.actionId}`,
        source: 'browser',
        description: `UI expectation references unknown action id ${expectation.actionId}.`,
        reason: 'Expected UI state must bind to a concrete user journey action.',
        core: true,
        blocksCompletion: true,
      });
    }
  }
  for (const expectation of expectedApi) {
    if (!actionIds.has(expectation.actionId)) {
      missing.push({
        id: `api-action-binding-missing-${journeyId}-${expectation.actionId}`,
        source: 'api',
        description: `API expectation references unknown action id ${expectation.actionId}.`,
        reason: 'Expected API request/response evidence must bind to a concrete user journey action.',
        core: true,
        blocksCompletion: true,
      });
    }
  }
  for (const expectation of expectedData) {
    if (!actionIds.has(expectation.actionId)) {
      missing.push({
        id: `data-action-binding-missing-${journeyId}-${expectation.actionId}`,
        source: 'data',
        description: `Data expectation references unknown action id ${expectation.actionId}.`,
        reason: 'Expected data outcome must bind to a concrete user journey action.',
        core: true,
        blocksCompletion: true,
      });
    }
  }
  return missing;
}

function missingFromDataReadback(journeyId: string, expectedData: UserJourney['expectedData']): JourneyMissingEvidence[] {
  return expectedData
    .filter((expectation) => expectation.readback === undefined || expectation.readback.trim().length === 0)
    .map((expectation) => ({
      id: `data-readback-missing-${journeyId}-${expectation.actionId}`,
      source: 'data' as const,
      description: `Data expectation for action ${expectation.actionId} does not define readback proof.`,
      reason: 'Data evidence must include an expected persistence target and readback description before probes can verify it.',
      core: true,
      blocksCompletion: true,
    }));
}

function artifactRequirements(requirements: EvidenceRequirement[]): JourneyArtifactRequirement[] {
  const artifacts: JourneyArtifactRequirement[] = [];
  for (const requirement of requirements) {
    if (requirement.source === 'browser') {
      artifacts.push({
        id: `${requirement.id}-screenshot`,
        type: 'screenshot',
        requirementId: requirement.id,
        summary: 'Screenshot of the journey state that covers the changed UI.',
        required: true,
      });
      artifacts.push({
        id: `${requirement.id}-trace`,
        type: 'trace',
        requirementId: requirement.id,
        summary: 'Rerunnable browser trace for the planned user journey.',
        required: true,
      });
    }
    if (requirement.source === 'api') {
      artifacts.push({
        id: `${requirement.id}-api-response`,
        type: 'api-response',
        requirementId: requirement.id,
        summary: 'Request/response summary bound to a journey action id.',
        required: true,
      });
    }
    if (requirement.source === 'data') {
      artifacts.push({
        id: `${requirement.id}-data-readback`,
        type: 'data-readback',
        requirementId: requirement.id,
        summary: 'Readback or persistence proof for the expected data target.',
        required: true,
      });
    }
  }
  artifacts.push({
    id: 'journey-report',
    type: 'report',
    requirementId: 'journey-plan',
    summary: 'Human-readable user journey verification plan.',
    required: true,
  });
  return artifacts;
}

function remainingRisksFor(
  input: PlanUserJourneyVerificationInput,
  routes: CapabilityRoutingPlan | undefined,
  missingEvidence: JourneyMissingEvidence[],
  journeys: UserJourney[],
): JourneyRemainingRisk[] {
  const risks: JourneyRemainingRisk[] = [];
  for (const route of routes?.degraded ?? []) {
    risks.push({
      id: `degraded-${route.requirementId}`,
      riskLevel: route.blocksCompletion ? 'high' : 'medium',
      summary: route.degradedReason ?? route.reason,
      mitigation: 'Use a higher-trust capability or record manual confirmation before completion.',
    });
  }
  for (const missing of missingEvidence) {
    risks.push({
      id: `missing-${missing.id}`,
      riskLevel: missing.blocksCompletion ? 'high' : 'medium',
      summary: missing.reason,
      mitigation: 'Fill the missing journey detail or evidence requirement before executing probes.',
    });
  }
  if (input.runtimeReadiness?.status === 'degraded') {
    risks.push({
      id: 'runtime-readiness-degraded',
      riskLevel: 'medium',
      summary: 'Runtime readiness is degraded, so journey evidence may have lower trust.',
      mitigation: 'Prefer cold-started services and verified health before final journey execution.',
    });
  }
  return dedupeRisks([...risks, ...journeys.flatMap((journey) => journey.remainingRisks)]);
}

function determineStatus(
  input: PlanUserJourneyVerificationInput,
  journeys: UserJourney[],
  missingEvidence: JourneyMissingEvidence[],
  routes: CapabilityRoutingPlan | undefined,
): JourneyPlanningStatus {
  if (input.topology.overallType === 'unknown' || input.topology.status === 'blocked') return 'blocked';
  if (routes?.blockers.some((route) => route.decision === 'blocked' && route.blocksCompletion) === true) return 'blocked';
  if (journeys.length === 0) return 'blocked';
  if (missingEvidence.some((missing) => missing.id === 'journey-actions-missing' || missing.id === 'entry-url-missing')) return 'needs-human-input';
  if (missingEvidence.some((missing) => missing.blocksCompletion)) return 'partial';
  return 'ready';
}

function inferEntryUrl(input: PlanUserJourneyVerificationInput): { url: string; serviceId?: string; root?: string; confidence: number } | null {
  if (input.topology.overallType === 'unknown' || input.topology.roots.length === 0) return null;
  const browserRoot = input.topology.roots.find((root) => root.browserHints.length > 0) ?? input.topology.roots[0];
  if (!browserRoot) return null;
  if (browserRoot.browserHints.length === 0 && input.topology.overallType !== 'frontend' && input.topology.overallType !== 'full-stack') return null;
  return {
    url: 'http://127.0.0.1:3000/',
    serviceId: browserRoot.path === '.' ? 'frontend' : browserRoot.path,
    root: browserRoot.path,
    confidence: browserRoot.browserHints[0]?.confidence ?? 0.55,
  };
}

function recoveryPlan(mode: JourneyPlanMode) {
  if (mode !== 'fix') {
    return {
      handoffRequired: false,
      owner: 'none' as const,
      reason: 'Recovery is not part of this planner mode.',
      samePathRetryRequired: false,
    };
  }
  return {
    handoffRequired: true,
    owner: 'recovery' as const,
    reason: 'Fix actions must be handled by the Epic 5 recovery flow; the journey planner only records the handoff.',
    samePathRetryRequired: true,
  };
}

function step(input: {
  id: string;
  type: JourneyStep['type'];
  description: string;
  target?: string;
  value?: string;
  originalType?: JourneyStep['type'];
  allowedInReportOnly: boolean;
}): JourneyStep {
  return {
    id: input.id,
    type: input.type,
    description: input.description,
    target: input.target,
    value: input.value,
    originalType: input.originalType,
    allowedInReportOnly: input.allowedInReportOnly,
    executes: false,
  };
}

function missingActions(): JourneyMissingEvidence {
  return {
    id: 'journey-actions-missing',
    source: 'browser',
    description: 'No concrete user action sequence was provided.',
    reason: 'The planner can infer an entry point, but not the critical user path.',
    core: true,
    blocksCompletion: true,
  };
}

function isReportOnlyObservationStep(type: JourneyStep['type']): boolean {
  return ['navigate', 'observe', 'run-check', 'capture-screenshot', 'capture-trace'].includes(type);
}

function isForbiddenReportOnlyAction(type: JourneyStep['type']): boolean {
  return ['edit-source', 'generate-test', 'migration', 'execute-recovery'].includes(type);
}

function dedupeMissing(items: JourneyMissingEvidence[]): JourneyMissingEvidence[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function dedupeRisks(items: JourneyRemainingRisk[]): JourneyRemainingRisk[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function verdictReason(status: JourneyPlanningStatus): string {
  if (status === 'ready') return 'User journey verification plan is ready for probe execution; this is not a completion verdict.';
  if (status === 'needs-human-input') return 'User journey planning needs human input before probes can run.';
  if (status === 'partial') return 'User journey plan is partial because required evidence is missing or degraded.';
  return 'User journey plan is blocked by missing route, topology, or capability evidence.';
}

function normalizeDate(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}
