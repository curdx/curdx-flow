import { validateContract, type CompletionVerdict, type EvidenceBlock } from '../contracts/index.ts';
import { evaluateEvidenceFreshness } from './freshness.ts';
import type {
  BlockerInput,
  CompletionVerdictInput,
  EvidenceGap,
  EvidenceRequirement,
  EvidenceSource,
  TaskType,
  VerdictDiagnostic,
  VerdictEvaluationResult,
} from './types.ts';

export function evaluateCompletionVerdict(input: CompletionVerdictInput): VerdictEvaluationResult {
  const requirements = input.requirements !== undefined && input.requirements.length > 0
    ? input.requirements
    : inferRequirements(input.taskType);
  const diagnostics: VerdictDiagnostic[] = [];
  const usableEvidence = new Map<string, EvidenceBlock>();
  const gaps: EvidenceGap[] = [];
  const unverifiedScope: EvidenceGap[] = [];
  const policyStatus = evaluatePolicyStatus(input);
  if (policyStatus.kind === 'blocked') {
    return verdictResult(
      buildBlockedVerdict(input, {
        why: policyStatus.why,
        evidenceRefs: policyStatus.evidenceRefs,
        missingEvidence: policyStatus.gaps,
        nextAction: policyStatus.nextAction,
        owner: policyStatus.owner,
        riskLevel: policyStatus.riskLevel,
        unverifiedScope: policyStatus.gaps,
      }),
      diagnostics,
    );
  }

  const blockingBlocker = (input.blockers ?? []).find((blocker) => blocker.core !== false || blocker.releaseGate === true);
  if (blockingBlocker !== undefined) {
    return verdictResult(
      buildBlockedVerdict(input, {
        why: `Blocked by ${blockingBlocker.code}: ${blockingBlocker.message}`,
        evidenceRefs: blockingBlocker.evidenceRefs ?? [],
        missingEvidence: [blockerGap(blockingBlocker)],
        nextAction: blockingBlocker.nextAction,
        owner: blockingBlocker.owner,
        riskLevel: blockingBlocker.riskLevel,
        unverifiedScope: [blockerGap(blockingBlocker)],
      }),
      diagnostics,
    );
  }

  for (const requirement of requirements) {
    const match = findUsableEvidence(input, requirement);
    if (match.ok) {
      usableEvidence.set(match.evidence.id, match.evidence);
      continue;
    }

    const gap: EvidenceGap = {
      id: requirement.id,
      source: requirement.source,
      description: requirement.description,
      reason: match.reason,
      core: requirement.core !== false,
      evidenceIds: match.evidenceIds,
    };

    if (requirement.core === false) {
      unverifiedScope.push(gap);
    } else {
      gaps.push(gap);
    }
  }

  const stateMissingEvidence = normalizeStateMissingEvidence(input.state.missingEvidence);
  for (const gap of stateMissingEvidence) {
    if (!hasManualConfirmationForGap(input, gap)) {
      gaps.push(gap);
    }
  }

  if (input.taskType === 'release' && input.releaseStageAuthorized !== true) {
    gaps.push({
      id: 'release-stage-authorization',
      source: 'release-authorization',
      description: 'release-stage authorization',
      reason: 'release-stage authorization is missing',
      core: true,
    });
  }

  const evidenceRefs = [...usableEvidence.keys()];
  unverifiedScope.push(...policyStatus.unverifiedScope);
  const hasManualAllowedGap = gaps.some((gap) => requirementById(requirements, gap.id)?.allowManualConfirmation === true);
  const onlyManualAllowedGaps = gaps.length > 0 && gaps.every((gap) => requirementById(requirements, gap.id)?.allowManualConfirmation === true);

  if (gaps.length > 0 && onlyManualAllowedGaps) {
    return verdictResult(
      buildVerdict(input, {
        verdict: 'manual-confirmation-required',
        why: `Manual confirmation required for missing evidence: ${gaps.map((gap) => gap.description).join(', ')}.`,
        evidenceRefs,
        missingEvidence: gaps,
        unverifiedScope: gaps,
        riskLevel: 'medium',
        confidence: 0.4,
      }),
      diagnostics,
    );
  }

  if (gaps.length > 0) {
    return verdictResult(
      buildBlockedVerdict(input, {
        why: `Missing or unusable core evidence: ${gaps.map((gap) => `${gap.description} (${gap.reason})`).join('; ')}.`,
        evidenceRefs,
        missingEvidence: gaps,
        unverifiedScope: [...gaps, ...unverifiedScope],
        riskLevel: hasManualAllowedGap ? 'medium' : 'high',
      }),
      diagnostics,
    );
  }

  if (unverifiedScope.length > 0) {
    return verdictResult(
      buildVerdict(input, {
        verdict: 'partial',
        why: `Core evidence passed, but some scope is unverified: ${unverifiedScope.map((gap) => gap.description).join(', ')}.`,
        evidenceRefs,
        missingEvidence: [],
        unverifiedScope,
        riskLevel: 'medium',
        confidence: 0.55,
      }),
      diagnostics,
    );
  }

  if (input.taskType === 'release') {
    return verdictResult(
      buildVerdict(input, {
        verdict: 'release-ready',
        why: 'Release evidence is fresh and release-stage authorization is present.',
        evidenceRefs,
        missingEvidence: [],
        unverifiedScope: [],
        riskLevel: 'medium',
        confidence: 0.92,
      }),
      diagnostics,
    );
  }

  return verdictResult(
    buildVerdict(input, {
      verdict: 'complete',
      why: 'All required evidence is fresh, verified, and covers the requested completion scope.',
      evidenceRefs,
      missingEvidence: [],
      unverifiedScope: [],
      riskLevel: 'low',
      confidence: 0.95,
    }),
    diagnostics,
  );
}

function evaluatePolicyStatus(input: CompletionVerdictInput):
  | {
    kind: 'ok';
    unverifiedScope: EvidenceGap[];
  }
  | {
    kind: 'blocked';
    why: string;
    evidenceRefs: string[];
    gaps: EvidenceGap[];
    nextAction: Record<string, unknown>;
    owner: string;
    riskLevel: CompletionVerdict['riskLevel'];
  } {
  const policy = isRecord(input.policy) ? input.policy : input.state.policy;
  if (!isRecord(policy) || policy.noFalseCompletion !== true) {
    const gap: EvidenceGap = {
      id: 'no-false-completion',
      source: 'state',
      description: 'no false completion policy invariant',
      reason: 'no false completion cannot be disabled or omitted',
      core: true,
    };
    return {
      kind: 'blocked',
      why: 'Blocked by policy: no false completion cannot be disabled; missing evidence must be expressed as a blocker or manual confirmation.',
      evidenceRefs: [],
      gaps: [gap],
      nextAction: {
        owner: 'agent',
        summary: 'Restore state.policy.noFalseCompletion to true and rerun verdict evaluation.',
      },
      owner: 'agent',
      riskLevel: 'critical',
    };
  }

  const reportOnlyGeneratedFileGap = findReportOnlyGeneratedFileGap(input.state);
  if (reportOnlyGeneratedFileGap !== undefined) {
    return {
      kind: 'blocked',
      why: `Blocked by report-only generated file boundary: ${reportOnlyGeneratedFileGap.reason}`,
      evidenceRefs: [],
      gaps: [reportOnlyGeneratedFileGap],
      nextAction: {
        owner: 'agent',
        summary: 'Record report-only findings under .curdx reports/evidence/artifacts/state, or switch to fix mode before mutating source.',
      },
      owner: 'agent',
      riskLevel: 'high',
    };
  }

  const policyDecisions = collectPolicyDecisions(policy);
  const unverifiedScope: EvidenceGap[] = [];
  for (const decision of policyDecisions) {
    const status = stringField(decision.decision) ?? stringField(decision.status);
    if (status !== 'blocked' && status !== 'block' && status !== 'skipped' && status !== 'manual-confirmation-required') {
      continue;
    }

    const gap = policyGap(decision);
    if (decision.core === false) {
      unverifiedScope.push(gap);
      continue;
    }

    const actionType = stringField(decision.actionType) ?? 'action';
    const riskLevel = riskLevelField(decision.riskLevel) ?? (status === 'blocked' || status === 'block' ? 'high' : 'medium');
    const evidenceRefs = stringArrayField(decision.evidenceRefs);
    return {
      kind: 'blocked',
      why: status === 'manual-confirmation-required'
        ? `Policy requires manual confirmation for ${actionType}: ${gap.reason}`
        : `Policy ${status === 'skipped' ? 'skipped' : 'blocked'} ${actionType}: ${gap.reason}`,
      evidenceRefs,
      gaps: [gap],
      nextAction: isRecord(decision.nextAction)
        ? decision.nextAction
        : {
          owner: 'user',
          summary: status === 'manual-confirmation-required'
            ? 'Provide manual confirmation or policy authorization before completion.'
            : 'Resolve the policy blocker before claiming completion.',
        },
      owner: stringField(decision.owner) ?? (status === 'manual-confirmation-required' ? 'user' : 'agent'),
      riskLevel,
    };
  }

  for (const route of collectCapabilityRoutes(policy)) {
    const status = stringField(route.decision) ?? 'unknown';
    const blocksCompletion = route.blocksCompletion === true || status === 'blocked';
    const gap = capabilityRouteGap(route);
    if (blocksCompletion) {
      const evidenceRefs = stringArrayField(route.evidenceRefs);
      return {
        kind: 'blocked',
        why: `Capability route blocked ${stringField(route.selectedCapabilityId) ?? stringField(route.primaryCapabilityId) ?? stringField(route.requirementId) ?? 'capability'}: ${gap.reason}`,
        evidenceRefs,
        gaps: [gap],
        nextAction: isRecord(route.nextAction)
          ? route.nextAction
          : {
            owner: route.manualConfirmationRequired === true ? 'user' : 'agent',
            summary: 'Resolve the capability route blocker or choose an explicit degraded/manual fallback before completion.',
          },
        owner: stringField(route.owner) ?? (route.manualConfirmationRequired === true ? 'user' : 'agent'),
        riskLevel: riskLevelField(route.riskLevel) ?? 'high',
      };
    }

    const trustLevel = stringField(route.trustLevel);
    if (
      status === 'fallback' ||
      status === 'degraded' ||
      status === 'manual-confirmation-required' ||
      trustLevel === 'degraded' ||
      route.manualConfirmationRequired === true
    ) {
      unverifiedScope.push(gap);
    }
  }

  return { kind: 'ok', unverifiedScope };
}

function findReportOnlyGeneratedFileGap(state: CompletionVerdictInput['state']): EvidenceGap | undefined {
  if (state.mode !== 'report-only') return undefined;
  for (const entry of state.generatedFiles) {
    if (!isRecord(entry)) continue;
    const path = stringField(entry.path);
    const category = stringField(entry.category);
    if (path === undefined) continue;
    if (isAllowedReportOnlyGeneratedFile(path, category)) continue;
    return {
      id: 'report-only-write-boundary',
      source: 'state',
      description: 'report-only generated file boundary',
      reason: `report-only mode cannot record generated file '${path}' as '${category ?? 'unknown'}'.`,
      core: true,
    };
  }
  return undefined;
}

function isAllowedReportOnlyGeneratedFile(path: string, category: string | undefined): boolean {
  if (path === '.git' || path.startsWith('.git/')) return false;
  if (path.startsWith('.curdx/reports/')) return category === 'report';
  if (path.startsWith('.curdx/evidence/')) return category === 'evidence';
  if (path.startsWith('.curdx/artifacts/')) return category === 'temporary-artifact'
    || category === 'external-tool-output'
    || category === 'evidence';
  if (path.startsWith('.curdx/state/')) return category === 'temporary-artifact'
    || category === 'external-tool-output';
  return false;
}

function collectPolicyDecisions(policy: Record<string, unknown>): Record<string, unknown>[] {
  const sources = [policy.actionDecisions, policy.decisions, policy.policyEffects];
  const output: Record<string, unknown>[] = [];
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    output.push(...source.filter(isRecord));
  }
  return output;
}

function collectCapabilityRoutes(policy: Record<string, unknown>): Record<string, unknown>[] {
  const output: Record<string, unknown>[] = [];
  const sources = [policy.capabilityRoutes, policy.routes];
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    output.push(...source.filter(isRecord));
  }
  if (isRecord(policy.routingPlan) && Array.isArray(policy.routingPlan.routes)) {
    output.push(...policy.routingPlan.routes.filter(isRecord));
  }
  return output;
}

function policyGap(decision: Record<string, unknown>): EvidenceGap {
  const id = stringField(decision.id) ?? stringField(decision.actionType) ?? 'policy-action';
  return {
    id: `policy-${id}`,
    source: 'state',
    description: stringField(decision.description) ?? `policy decision for ${stringField(decision.actionType) ?? id}`,
    reason: stringField(decision.reason) ?? stringField(decision.message) ?? 'policy decision prevented verified execution',
    core: decision.core !== false,
    evidenceIds: stringArrayField(decision.evidenceRefs),
  };
}

function capabilityRouteGap(route: Record<string, unknown>): EvidenceGap {
  const id = stringField(route.id) ?? stringField(route.requirementId) ?? stringField(route.selectedCapabilityId) ?? 'capability-route';
  return {
    id: `capability-${id}`,
    source: 'state',
    description: stringField(route.description) ?? `capability route for ${stringField(route.requirementId) ?? id}`,
    reason: stringField(route.reason) ?? stringField(route.degradedReason) ?? 'capability routing could not provide full-trust evidence',
    core: route.core !== false,
    evidenceIds: stringArrayField(route.evidenceRefs),
  };
}

function findUsableEvidence(
  input: CompletionVerdictInput,
  requirement: EvidenceRequirement,
): { ok: true; evidence: EvidenceBlock } | { ok: false; reason: string; evidenceIds?: string[] } {
  const candidates = input.evidence.filter((entry) => matchesRequirement(entry, requirement));
  if (candidates.length === 0) {
    return { ok: false, reason: `missing ${requirement.source} evidence` };
  }

  const evidenceIds: string[] = [];
  let lastUnusableReason = `no verified passing ${requirement.source} evidence`;
  for (const entry of candidates) {
    evidenceIds.push(entry.id);

    const validation = validateContract('evidence', entry);
    if (!validation.ok) {
      lastUnusableReason = 'evidence contract validation failed';
      continue;
    }
    if (entry.runId !== input.state.runId || entry.goalId !== input.state.goalId) {
      lastUnusableReason = 'evidence run or goal does not match state';
      continue;
    }
    if (entry.status !== 'passed') {
      lastUnusableReason = `evidence status is ${entry.status}`;
      continue;
    }
    if (entry.trustLevel === 'self-reported' || entry.trustLevel === 'degraded') {
      lastUnusableReason = `evidence trust level is ${entry.trustLevel}`;
      continue;
    }

    const freshness = evaluateEvidenceFreshness({ evidence: entry, target: requirement.target, now: input.now });
    if (!freshness.ok) {
      lastUnusableReason = freshness.reason;
      continue;
    }

    return { ok: true, evidence: entry };
  }

  return { ok: false, reason: lastUnusableReason, evidenceIds };
}

function matchesRequirement(entry: EvidenceBlock, requirement: EvidenceRequirement): boolean {
  if (entry.source !== requirement.source) return false;
  if (requirement.capabilityId !== undefined && entry.capabilityId !== requirement.capabilityId) return false;
  return true;
}

function inferRequirements(taskType: TaskType | undefined): EvidenceRequirement[] {
  switch (taskType) {
    case 'frontend':
      return [
        inferredRequirement('browser', 'browser journey evidence'),
        inferredRequirement('api', 'API request/response evidence'),
      ];
    case 'fullstack':
      return [
        inferredRequirement('browser', 'browser journey evidence'),
        inferredRequirement('api', 'API request/response evidence'),
        inferredRequirement('data', 'data persistence evidence'),
      ];
    case 'data':
      return [inferredRequirement('data', 'data readback evidence')];
    case 'backend':
      return [inferredRequirement('api', 'API evidence')];
    case 'release':
      return [inferredRequirement('release', 'release evidence')];
    case 'manual':
      return [inferredRequirement('manual', 'manual confirmation evidence')];
    default:
      return [inferredRequirement('command', 'command evidence')];
  }
}

function inferredRequirement(source: EvidenceSource, description: string): EvidenceRequirement {
  return {
    id: `required-${source}`,
    source,
    description,
    core: true,
    allowManualConfirmation: source === 'manual',
  };
}

function normalizeStateMissingEvidence(value: unknown[]): EvidenceGap[] {
  return value.map((entry, index): EvidenceGap => {
    if (isRecord(entry)) {
      return {
        id: typeof entry.id === 'string' ? entry.id : `state-missing-${index + 1}`,
        source: typeof entry.source === 'string' ? entry.source as EvidenceGap['source'] : 'state',
        description: typeof entry.description === 'string' ? entry.description : typeof entry.summary === 'string' ? entry.summary : 'state missing evidence',
        reason: typeof entry.reason === 'string' ? entry.reason : 'state lists missing evidence',
        core: typeof entry.core === 'boolean' ? entry.core : true,
      };
    }

    return {
      id: `state-missing-${index + 1}`,
      source: 'state',
      description: String(entry),
      reason: 'state lists missing evidence',
      core: true,
    };
  });
}

function buildBlockedVerdict(
  input: CompletionVerdictInput,
  overrides: Partial<CompletionVerdict> & Pick<CompletionVerdict, 'why' | 'evidenceRefs' | 'missingEvidence' | 'unverifiedScope'>,
): CompletionVerdict {
  return buildVerdict(input, {
    verdict: 'blocked',
    nextAction: input.state.nextAction,
    owner: 'agent',
    riskLevel: 'high',
    confidence: 0.2,
    ...overrides,
  });
}

function buildVerdict(
  input: CompletionVerdictInput,
  overrides: Partial<CompletionVerdict> & Pick<CompletionVerdict, 'verdict' | 'why' | 'evidenceRefs' | 'missingEvidence' | 'unverifiedScope'>,
): CompletionVerdict {
  return {
    schemaVersion: 1,
    nextAction: input.state.nextAction,
    owner: 'agent',
    riskLevel: 'medium',
    confidence: 0.5,
    ...overrides,
  };
}

function verdictResult(verdict: CompletionVerdict, diagnostics: VerdictDiagnostic[]): VerdictEvaluationResult {
  const validation = validateContract('completionVerdict', verdict);
  if (!validation.ok) {
    return {
      ok: true,
      verdict: {
        schemaVersion: 1,
        verdict: 'blocked',
        why: `Internal verdict contract validation failed: ${validation.issues.map((issue) => issue.message).join('; ')}`,
        evidenceRefs: [],
        missingEvidence: validation.issues,
        nextAction: {
          owner: 'agent',
          summary: 'Fix completion verdict evaluator output contract.',
        },
        owner: 'agent',
        riskLevel: 'high',
        confidence: 0,
        unverifiedScope: validation.issues,
      },
      diagnostics: [
        ...diagnostics,
        {
          code: 'invalid-verdict-output',
          message: 'Evaluator generated invalid completion verdict output.',
        },
      ],
    };
  }

  return { ok: true, verdict: validation.value as CompletionVerdict, diagnostics };
}

function blockerGap(blocker: BlockerInput): EvidenceGap {
  return {
    id: blocker.code,
    source: blocker.releaseGate === true ? 'release' : 'state',
    description: blocker.message,
    reason: blocker.message,
    core: blocker.core !== false,
    evidenceIds: blocker.evidenceRefs,
  };
}

function requirementById(requirements: EvidenceRequirement[], id: string): EvidenceRequirement | undefined {
  return requirements.find((requirement) => requirement.id === id);
}

function hasManualConfirmationForGap(input: CompletionVerdictInput, gap: EvidenceGap): boolean {
  return (input.manualConfirmations ?? []).some((confirmation) => {
    if (confirmation.requirementIds?.includes(gap.id) === true) return true;
    if (gap.evidenceIds !== undefined && confirmation.evidenceRefs?.some((ref) => gap.evidenceIds?.includes(ref)) === true) return true;
    return false;
  });
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function stringArrayField(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

function riskLevelField(value: unknown): CompletionVerdict['riskLevel'] | undefined {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') return value;
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
