import { validateContract, type ArtifactIndexEntry, type CompletionVerdict, type EvidenceBlock } from '../contracts/index.ts';
import { redactReportText, sanitizeForReport } from './redaction.ts';
import { buildTranscriptSummary } from './summary.ts';
import type {
  ActionLogSummary,
  ArtifactSummary,
  CapabilityRouteSummary,
  ConsumableNextStep,
  DegradedCapability,
  EvidenceSummary,
  ManualConfirmationSummary,
  MergeReadinessSummary,
  PolicyEffectSummary,
  RenderedReport,
  RemediationActionSummary,
  RemediationPlanSummary,
  ReportInput,
  ReportNextAction,
  ReportOnlyIssue,
  ReportPrivacy,
  ReportSections,
  ReportStatus,
  SourceChanges,
  VerificationReportJson,
} from './types.ts';

export function renderVerificationReport(input: ReportInput): RenderedReport {
  const redaction = { redacted: false, truncated: false };
  const generatedAt = toIsoDate(input.generatedAt);
  const reportOnly = input.reportOnly === true || input.state.mode === 'report-only';
  const mode = reportOnly ? 'report-only' : input.state.mode;
  const artifactSummaries = buildArtifactSummaries(input.artifactIndex, redaction);
  const evidenceSummaries = buildEvidenceSummaries(input.evidence, input.artifactIndex, redaction);
  const missingEvidence = sanitizeForReport(mergeMissingEvidence(input.verdict.missingEvidence, input.state.missingEvidence), redaction);
  const blockers = sanitizeForReport(input.blockers ?? [], redaction);
  const verdict = sanitizeForReport(input.verdict, redaction);
  const sourceChanges = buildSourceChanges(input.state.generatedFiles, reportOnly, redaction);
  const status = mapReportStatus(input.verdict);
  const sections = buildSections({
    blockers,
    missingEvidence,
    verdict,
    evidenceSummaries,
    policy: input.state.policy,
    issues: input.issues ?? [],
    status,
    reportOnly,
    sourceChanges,
    redaction,
  });
  const summary = buildTopSummary(status, evidenceSummaries, missingEvidence, sections.mergeReadiness, redaction);
  const verifier = {
    command: redactReportText(input.verifier?.command ?? 'not recorded', 180, redaction).text,
    exitCode: typeof input.verifier?.exitCode === 'number' ? input.verifier.exitCode : null,
  };
  const transcriptSummary = buildTranscriptSummary({
    verifier,
    evidenceSummaries,
    missingEvidence: Array.isArray(missingEvidence) ? missingEvidence : [],
    finalVerdict: input.verdict.verdict,
    mode,
    reportOnly,
    sourceChanges,
    manualConfirmationCount: sections.manualConfirmation.length,
    blockingIssueCount: sections.blockingIssues.length,
    warningIssueCount: sections.warnings.length,
    nextActionOwner: sections.mergeReadiness.nextActionOwner,
  });
  const privacy = buildPrivacy(redaction, input.artifactIndex);

  const json: VerificationReportJson = {
    schemaVersion: 1,
    runId: input.state.runId,
    goalId: input.state.goalId,
    mode,
    status,
    verdict,
    summary,
    evidenceRefs: input.verdict.evidenceRefs,
    artifactIndex: artifactSummaries,
    blockers,
    missingEvidence,
    generatedAt,
    privacy,
    transcriptSummary,
    evidenceSummaries,
    artifactSummaries,
    sections,
    sourceChanges,
    reportOnly,
    verifier,
  };

  const validation = validateContract('verificationReport', json);
  if (!validation.ok) {
    const details = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
    throw new Error(`Generated verification report failed contract validation: ${details}`);
  }

  const markdown = renderMarkdown(json);
  return {
    markdown,
    json,
    transcriptSummary,
  };
}

function mapReportStatus(verdict: CompletionVerdict): ReportStatus {
  switch (verdict.verdict) {
    case 'complete':
      return 'passed';
    case 'release-ready':
      return 'release-ready';
    case 'blocked':
      return 'blocked';
    case 'partial':
      return 'partial';
    case 'manual-confirmation-required':
      return 'needs-user-input';
  }
}

function buildArtifactSummaries(
  artifactIndex: ArtifactIndexEntry[],
  redaction: { redacted: boolean; truncated: boolean },
): ArtifactSummary[] {
  return artifactIndex.map((entry) => ({
    id: entry.id,
    evidenceId: entry.evidenceId,
    type: entry.type,
    path: entry.path,
    summary: redactReportText(entry.summary, 240, redaction).text,
    privacy: {
      ...entry.privacy,
      redacted: entry.privacy.redacted === true || redaction.redacted,
    },
  }));
}

function buildEvidenceSummaries(
  evidence: EvidenceBlock[],
  artifactIndex: ArtifactIndexEntry[],
  redaction: { redacted: boolean; truncated: boolean },
): EvidenceSummary[] {
  return evidence.map((entry) => {
    const artifactRefs = collectArtifactRefs(entry, artifactIndex);
    return {
      id: entry.id,
      source: entry.source,
      capabilityId: entry.capabilityId,
      status: entry.status,
      trustLevel: entry.trustLevel,
      summary: redactReportText(entry.summary, 240, redaction).text,
      artifactRefs,
      freshness: formatFreshness(entry.freshness, redaction),
      unverifiedScope: formatUnverifiedScope(entry.unverifiedScope, redaction),
      degradedReason: getDegradedReason(entry, redaction),
    };
  });
}

function collectArtifactRefs(entry: EvidenceBlock, artifactIndex: ArtifactIndexEntry[]): string[] {
  const refs = new Set<string>();
  for (const artifact of artifactIndex) {
    if (artifact.evidenceId === entry.id) refs.add(artifact.id);
  }

  for (const artifact of entry.artifacts) {
    if (isRecord(artifact)) {
      if (typeof artifact.id === 'string') refs.add(artifact.id);
      else if (typeof artifact.path === 'string') refs.add(artifact.path);
    }
  }

  return [...refs];
}

function formatFreshness(value: Record<string, unknown>, redaction: { redacted: boolean; truncated: boolean }): string {
  const parts = ['validatedAt', 'targetSummary', 'commandHash', 'targetHash', 'environmentId', 'expiresAt']
    .map((key) => (typeof value[key] === 'string' ? `${key}=${value[key]}` : undefined))
    .filter((item): item is string => item !== undefined);
  return redactReportText(parts.join(', ') || 'not recorded', 240, redaction).text;
}

function formatUnverifiedScope(value: unknown, redaction: { redacted: boolean; truncated: boolean }): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === 'string') return redactReportText(item, 160, redaction).text;
    if (isRecord(item)) {
      const id = typeof item.id === 'string' ? item.id : undefined;
      const reason = typeof item.reason === 'string' ? item.reason : undefined;
      return redactReportText([id, reason].filter(Boolean).join(' - ') || JSON.stringify(item), 160, redaction).text;
    }
    return redactReportText(String(item), 160, redaction).text;
  });
}

function getDegradedReason(entry: EvidenceBlock, redaction: { redacted: boolean; truncated: boolean }): string | undefined {
  if (entry.status !== 'degraded' && entry.trustLevel !== 'degraded') return undefined;
  const reason = typeof entry.reason === 'string'
    ? entry.reason
    : typeof entry.degradedReason === 'string'
      ? entry.degradedReason
      : entry.summary;
  return redactReportText(reason, 180, redaction).text;
}

function buildSourceChanges(
  generatedFiles: unknown[],
  reportOnly: boolean,
  redaction: { redacted: boolean; truncated: boolean },
): SourceChanges {
  if (reportOnly) {
    return {
      modifiedSource: false,
      summary: 'Report-only mode: no source files were modified.',
      files: [],
    };
  }

  const files = generatedFiles
    .filter(isRecord)
    .filter((entry) => entry.category === 'source-change')
    .map((entry) => (typeof entry.path === 'string' ? redactReportText(entry.path, 180, redaction).text : undefined))
    .filter((item): item is string => item !== undefined);

  return {
    modifiedSource: files.length > 0,
    summary: files.length > 0 ? `${files.length} source file change(s) recorded.` : 'No source file changes recorded by runtime state.',
    files,
  };
}

function buildSections(input: {
  blockers: unknown;
  missingEvidence: unknown;
  verdict: CompletionVerdict;
  evidenceSummaries: EvidenceSummary[];
  policy: Record<string, unknown>;
  issues: Record<string, unknown>[];
  status: ReportStatus;
  reportOnly: boolean;
  sourceChanges: SourceChanges;
  redaction: { redacted: boolean; truncated: boolean };
}): ReportSections {
  const missingEvidence = Array.isArray(input.missingEvidence) ? input.missingEvidence : [];
  const blockers = Array.isArray(input.blockers) ? input.blockers.filter(isRecord) : [];
  const capabilityRoutes = buildCapabilityRoutes(input.policy, input.redaction);
  const remediationPlans = buildRemediationPlans(input.policy, input.redaction);
  const manualConfirmation = buildManualConfirmation({
    verdict: input.verdict,
    missingEvidence,
    capabilityRoutes,
    evidenceSummaries: input.evidenceSummaries,
    redaction: input.redaction,
  });
  const degradedCapabilities = buildDegradedCapabilities(input.evidenceSummaries);
  const reportOnlyIssues = buildReportOnlyIssues(input.issues, input.reportOnly, input.redaction);
  const blockingIssues = reportOnlyIssues.filter((issue) => issue.blocksCompletion);
  const warnings = reportOnlyIssues.filter((issue) => !issue.blocksCompletion);
  const nextActions = buildNextActions(input.verdict, blockers, input.redaction);
  const mergeReadiness = buildMergeReadiness({
    status: input.status,
    verdict: input.verdict,
    reportOnly: input.reportOnly,
    sourceChanges: input.sourceChanges,
    blockers,
    blockingIssues,
    warnings,
    manualConfirmation,
    degradedCapabilities,
    nextActions,
  });

  return {
    blockers,
    missingEvidence,
    manualConfirmation,
    nextActions,
    degradedCapabilities,
    unverifiedScope: input.verdict.unverifiedScope,
    qaIssues: reportOnlyIssues,
    reportOnlyIssues,
    blockingIssues,
    warnings,
    mergeReadiness,
    consumableNextSteps: buildConsumableNextSteps(nextActions, reportOnlyIssues, manualConfirmation, input.reportOnly, input.redaction),
    policyEffects: buildPolicyEffects(input.policy, input.redaction),
    actionLogs: buildActionLogs(input.policy, input.redaction),
    capabilityRoutes,
    remediationPlans,
  };
}

function buildReportOnlyIssues(
  issues: Record<string, unknown>[],
  reportOnly: boolean,
  redaction: { redacted: boolean; truncated: boolean },
): ReportOnlyIssue[] {
  return issues.map((entry, index) => {
    const severity = riskField(entry.severity) ?? 'medium';
    const blocksCompletion = typeof entry.blocksCompletion === 'boolean'
      ? entry.blocksCompletion
      : severity === 'high' || severity === 'critical';
    const suggestedMode = stringField(entry.suggestedMode) ?? (blocksCompletion ? 'fix' : 'report-only');
    return {
      id: redactReportText(stringField(entry.id) ?? `issue-${index + 1}`, 120, redaction).text,
      category: redactReportText(stringField(entry.category) ?? 'verification', 120, redaction).text,
      severity,
      summary: redactIssueText(stringField(entry.summary) ?? stringField(entry.message) ?? 'Issue discovered during report-only verification.', 240, reportOnly, redaction),
      reproductionSteps: stringArrayField(entry.reproductionSteps).map((step) => redactIssueText(step, 240, reportOnly, redaction)),
      evidenceRefs: stringArrayField(entry.evidenceRefs).map((ref) => redactReportText(ref, 120, redaction).text),
      artifactRefs: stringArrayField(entry.artifactRefs).map((ref) => redactReportText(ref, 120, redaction).text),
      impact: redactIssueText(stringField(entry.impact) ?? 'Impact not recorded.', 240, reportOnly, redaction),
      recommendation: redactIssueText(stringField(entry.recommendation) ?? 'Review evidence and choose an explicit mode before mutation.', 240, reportOnly, redaction),
      owner: redactReportText(stringField(entry.owner) ?? (blocksCompletion ? 'agent' : 'tech-lead'), 80, redaction).text,
      blocksCompletion,
      suggestedMode: redactReportText(suggestedMode, 80, redaction).text,
    };
  });
}

function buildManualConfirmation(input: {
  verdict: CompletionVerdict;
  missingEvidence: unknown[];
  capabilityRoutes: CapabilityRouteSummary[];
  evidenceSummaries: EvidenceSummary[];
  redaction: { redacted: boolean; truncated: boolean };
}): ManualConfirmationSummary[] {
  const records = input.missingEvidence.filter(isRecord);
  const candidates = input.verdict.verdict === 'manual-confirmation-required'
    ? records
    : records.filter((entry) => entry.source === 'manual' || entry.manualConfirmationRequired === true);
  const output = candidates.map((entry, index) => normalizeManualConfirmation(entry, index, input));
  const seen = new Set(output.map((entry) => entry.id));

  for (const route of input.capabilityRoutes) {
    if (route.manualConfirmationRequired !== true) continue;
    const existing = output.find((entry) => entry.id === route.requirementId);
    if (existing !== undefined) continue;
    const id = `manual-${route.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    output.push({
      id,
      source: route.requirementSource,
      summary: route.description,
      reason: route.degradedReason ?? route.reason,
      evidenceRefs: route.evidenceRefs,
      artifactRefs: artifactRefsForEvidenceIds(route.evidenceRefs, input.evidenceSummaries),
      criteria: `Confirm ${route.description} using the degraded route evidence; do not mark complete unless the acceptance criteria are satisfied.`,
      owner: stringField(route.owner) ?? 'user',
      nextAction: routeNextAction(route) ?? (route.blocksCompletion
        ? 'Provide manual confirmation or restore full-trust capability evidence before completion.'
        : 'Review the degraded capability route before relying on this result.'),
      riskLevel: route.blocksCompletion ? 'high' : 'medium',
      capabilityRouteRefs: [route.id],
      remediationRefs: route.remediationRefs,
    });
  }

  return output;
}

function normalizeManualConfirmation(
  entry: Record<string, unknown>,
  index: number,
  input: {
    verdict: CompletionVerdict;
    capabilityRoutes: CapabilityRouteSummary[];
    evidenceSummaries: EvidenceSummary[];
    redaction: { redacted: boolean; truncated: boolean };
  },
): ManualConfirmationSummary {
  const id = redactReportText(stringField(entry.id) ?? `manual-confirmation-${index + 1}`, 120, input.redaction).text;
  const matchingRoutes = input.capabilityRoutes.filter((route) =>
    route.requirementId === id || route.id === id || stringArrayField(entry.capabilityRouteRefs).includes(route.id),
  );
  const primaryRoute = matchingRoutes[0];
  const summary = stringField(entry.summary) ?? stringField(entry.description) ?? primaryRoute?.description ?? 'manual confirmation required';
  const reason = stringField(entry.reason) ?? primaryRoute?.degradedReason ?? primaryRoute?.reason ?? 'automatic verification could not determine pass/fail';
  const evidenceRefs = uniqueStrings([
    ...stringArrayField(entry.evidenceRefs),
    ...stringArrayField(entry.evidenceIds),
    ...(primaryRoute?.evidenceRefs ?? []),
  ]).map((ref) => redactReportText(ref, 120, input.redaction).text);
  const artifactRefs = uniqueStrings([
    ...stringArrayField(entry.artifactRefs),
    ...artifactRefsForEvidenceIds(evidenceRefs, input.evidenceSummaries),
  ])
    .map((ref) => redactReportText(ref, 120, input.redaction).text);
  const nextActionValue = entry.nextAction;
  const nextAction = isRecord(nextActionValue)
    ? stringField(nextActionValue.summary)
    : stringField(nextActionValue);
  const owner = stringField(entry.owner)
    ?? (isRecord(nextActionValue) ? stringField(nextActionValue.owner) : undefined)
    ?? stringField(primaryRoute?.owner)
    ?? input.verdict.owner
    ?? 'user';
  const riskLevel = riskField(entry.riskLevel)
    ?? riskField(primaryRoute?.riskLevel)
    ?? (primaryRoute?.blocksCompletion === true ? 'high' : input.verdict.riskLevel);
  const routeRefs = uniqueStrings([
    ...stringArrayField(entry.capabilityRouteRefs),
    ...matchingRoutes.map((route) => route.id),
  ]);
  const remediationRefs = uniqueStrings([
    ...stringArrayField(entry.remediationRefs),
    ...matchingRoutes.flatMap((route) => route.remediationRefs),
  ]);

  return {
    id,
    source: redactReportText(stringField(entry.source) ?? primaryRoute?.requirementSource ?? 'manual', 80, input.redaction).text,
    summary: redactReportText(summary, 240, input.redaction).text,
    reason: redactReportText(reason, 240, input.redaction).text,
    evidenceRefs,
    artifactRefs,
    criteria: redactReportText(
      stringField(entry.criteria)
        ?? stringField(entry.judgmentCriteria)
        ?? `Confirm ${summary} against the linked evidence/artifacts and record the decision before completion.`,
      240,
      input.redaction,
    ).text,
    owner: redactReportText(owner, 80, input.redaction).text,
    nextAction: redactReportText(
      nextAction ?? stringField(input.verdict.nextAction.summary) ?? 'Provide manual confirmation before completion.',
      240,
      input.redaction,
    ).text,
    riskLevel,
    capabilityRouteRefs: routeRefs.map((ref) => redactReportText(ref, 120, input.redaction).text),
    remediationRefs: remediationRefs.map((ref) => redactReportText(ref, 120, input.redaction).text),
  };
}

function redactIssueText(
  value: string,
  maxLength: number,
  reportOnly: boolean,
  redaction: { redacted: boolean; truncated: boolean },
): string {
  const redacted = redactReportText(value, maxLength, redaction).text;
  if (!reportOnly) return redacted;
  return redacted
    .replace(/\bauto-fixed\b/gi, 'reported')
    .replace(/\bmodified source\b/gi, 'source changes were not made')
    .replace(/\bpatch generated\b/gi, 'patch was not generated')
    .replace(/\bfixed\b/gi, 'reported');
}

function artifactRefsForEvidenceIds(evidenceIds: string[], evidenceSummaries: EvidenceSummary[]): string[] {
  const refs: string[] = [];
  for (const evidenceId of evidenceIds) {
    const evidence = evidenceSummaries.find((entry) => entry.id === evidenceId);
    if (evidence !== undefined) refs.push(...evidence.artifactRefs);
  }
  return uniqueStrings(refs);
}

function routeNextAction(route: CapabilityRouteSummary): string | undefined {
  const nextAction = route.nextAction;
  if (isRecord(nextAction)) return stringField(nextAction.summary);
  return stringField(nextAction);
}

function buildPolicyEffects(
  policy: Record<string, unknown>,
  redaction: { redacted: boolean; truncated: boolean },
): PolicyEffectSummary[] {
  const entries = arrayField(policy.actionDecisions) ?? arrayField(policy.decisions) ?? arrayField(policy.policyEffects) ?? [];
  return entries.filter(isRecord).map((entry, index) => ({
    id: redactReportText(stringField(entry.id) ?? `policy-effect-${index + 1}`, 120, redaction).text,
    decision: redactReportText(stringField(entry.decision) ?? stringField(entry.status) ?? 'unknown', 80, redaction).text,
    actionType: redactReportText(stringField(entry.actionType) ?? 'unknown', 120, redaction).text,
    reason: redactReportText(stringField(entry.reason) ?? stringField(entry.message) ?? 'policy affected this action', 240, redaction).text,
    ...(riskField(entry.riskLevel) === undefined ? {} : { riskLevel: riskField(entry.riskLevel) }),
  }));
}

function buildActionLogs(
  policy: Record<string, unknown>,
  redaction: { redacted: boolean; truncated: boolean },
): ActionLogSummary[] {
  const entries = arrayField(policy.actionLog) ?? arrayField(policy.actionLogs) ?? [];
  return entries.filter(isRecord).map((entry, index) => ({
    id: redactReportText(stringField(entry.id) ?? `action-log-${index + 1}`, 120, redaction).text,
    actionType: redactReportText(stringField(entry.actionType) ?? 'unknown', 120, redaction).text,
    result: redactReportText(stringField(entry.result) ?? 'unknown', 80, redaction).text,
    ...(riskField(entry.riskLevel) === undefined ? {} : { riskLevel: riskField(entry.riskLevel) }),
    targetFiles: stringArrayField(entry.targetFiles).map((file) => redactReportText(file, 180, redaction).text),
    intent: redactReportText(stringField(entry.intent) ?? 'not recorded', 240, redaction).text,
    evidenceRefs: stringArrayField(entry.evidenceRefs).map((ref) => redactReportText(ref, 120, redaction).text),
    requiresSamePathRetry: entry.requiresSamePathRetry === true,
  }));
}

function buildCapabilityRoutes(
  policy: Record<string, unknown>,
  redaction: { redacted: boolean; truncated: boolean },
): CapabilityRouteSummary[] {
  return collectCapabilityRoutes(policy).map((entry, index) => ({
    id: redactReportText(stringField(entry.id) ?? `capability-route-${index + 1}`, 120, redaction).text,
    requirementId: redactReportText(stringField(entry.requirementId) ?? 'unknown', 120, redaction).text,
    requirementSource: redactReportText(stringField(entry.requirementSource) ?? 'unknown', 80, redaction).text,
    description: redactReportText(stringField(entry.description) ?? 'capability route', 240, redaction).text,
    decision: redactReportText(stringField(entry.decision) ?? 'unknown', 80, redaction).text,
    primaryCapabilityId: redactReportText(stringField(entry.primaryCapabilityId) ?? stringField(entry.selectedCapabilityId) ?? 'unknown', 120, redaction).text,
    selectedCapabilityId: stringField(entry.selectedCapabilityId) === undefined
      ? null
      : redactReportText(stringField(entry.selectedCapabilityId) ?? '', 120, redaction).text,
    fallbackCapabilityIds: stringArrayField(entry.fallbackCapabilityIds).map((id) => redactReportText(id, 120, redaction).text),
    reason: redactReportText(stringField(entry.reason) ?? 'routing reason not recorded', 240, redaction).text,
    trustLevel: redactReportText(stringField(entry.trustLevel) ?? 'unknown', 80, redaction).text,
    ...(stringField(entry.degradedReason) === undefined
      ? {}
      : { degradedReason: redactReportText(stringField(entry.degradedReason) ?? '', 240, redaction).text }),
    manualConfirmationRequired: entry.manualConfirmationRequired === true,
    blocksCompletion: entry.blocksCompletion === true,
    remediationRefs: stringArrayField(entry.remediationRefs).map((id) => redactReportText(id, 120, redaction).text),
    evidenceImpact: stringArrayField(entry.evidenceImpact).map((item) => redactReportText(item, 160, redaction).text),
    evidenceRefs: stringArrayField(entry.evidenceRefs).map((id) => redactReportText(id, 120, redaction).text),
  }));
}

function buildRemediationPlans(
  policy: Record<string, unknown>,
  redaction: { redacted: boolean; truncated: boolean },
): RemediationPlanSummary[] {
  const plans = collectRemediationPlans(policy);
  return plans.map((plan, index) => {
    const actions = arrayField(plan.actions) ?? [];
    return {
      id: redactReportText(stringField(plan.id) ?? `remediation-plan-${index + 1}`, 120, redaction).text,
      capabilityId: redactReportText(stringField(plan.capabilityId) ?? 'unknown', 120, redaction).text,
      status: redactReportText(stringField(plan.status) ?? 'unknown', 80, redaction).text,
      actions: actions.filter(isRecord).map((action, actionIndex) => buildRemediationAction(action, actionIndex, redaction)),
    };
  });
}

function buildRemediationAction(
  action: Record<string, unknown>,
  index: number,
  redaction: { redacted: boolean; truncated: boolean },
): RemediationActionSummary {
  const policyDecision = isRecord(action.policyDecision)
    ? stringField(action.policyDecision.decision) ?? stringField(action.policyDecision.status)
    : undefined;
  return {
    id: redactReportText(stringField(action.id) ?? `remediation-action-${index + 1}`, 120, redaction).text,
    capabilityId: redactReportText(stringField(action.capabilityId) ?? 'unknown', 120, redaction).text,
    kind: redactReportText(stringField(action.kind) ?? 'unknown', 120, redaction).text,
    status: redactReportText(stringField(action.status) ?? 'unknown', 80, redaction).text,
    action: redactReportText(stringField(action.action) ?? 'not recorded', 240, redaction).text,
    ...(riskField(action.riskLevel) === undefined ? {} : { riskLevel: riskField(action.riskLevel) }),
    requiresAuthorization: action.requiresAuthorization === true,
    executesAutomatically: action.executesAutomatically === true,
    verificationCommand: redactReportText(stringField(action.verificationCommand) ?? 'not recorded', 180, redaction).text,
    failureFallback: redactReportText(stringField(action.failureFallback) ?? 'not recorded', 240, redaction).text,
    expectedRestoredCapabilities: stringArrayField(action.expectedRestoredCapabilities).map((item) => redactReportText(item, 160, redaction).text),
    ...(stringField(action.completionImpact) === undefined
      ? {}
      : { completionImpact: redactReportText(stringField(action.completionImpact) ?? '', 240, redaction).text }),
    ...(policyDecision === undefined ? {} : { policyDecision: redactReportText(policyDecision, 80, redaction).text }),
  };
}

function buildNextActions(
  verdict: CompletionVerdict,
  blockers: Record<string, unknown>[],
  redaction: { redacted: boolean; truncated: boolean },
): ReportNextAction[] {
  const actions: ReportNextAction[] = [normalizeNextAction(verdict.nextAction, verdict.owner, verdict.riskLevel, redaction)];
  for (const blocker of blockers) {
    if (isRecord(blocker.nextAction)) {
      actions.push(
        normalizeNextAction(
          blocker.nextAction,
          typeof blocker.owner === 'string' ? blocker.owner : verdict.owner,
          typeof blocker.riskLevel === 'string' && isRiskLevel(blocker.riskLevel) ? blocker.riskLevel : verdict.riskLevel,
          redaction,
        ),
      );
    }
  }

  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.owner}:${action.summary}:${action.riskLevel}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildMergeReadiness(input: {
  status: ReportStatus;
  verdict: CompletionVerdict;
  reportOnly: boolean;
  sourceChanges: SourceChanges;
  blockers: Record<string, unknown>[];
  blockingIssues: ReportOnlyIssue[];
  warnings: ReportOnlyIssue[];
  manualConfirmation: ManualConfirmationSummary[];
  degradedCapabilities: DegradedCapability[];
  nextActions: ReportNextAction[];
}): MergeReadinessSummary {
  const primaryAction = input.nextActions[0];
  const complete = input.status === 'passed' || input.status === 'release-ready';
  const canRelease = input.status === 'release-ready';
  const blockingIssueCount = input.blockingIssues.length;
  const manualConfirmationCount = input.manualConfirmation.length;
  const blockerCount = input.blockers.length;
  const deliverable = complete && blockingIssueCount === 0 && manualConfirmationCount === 0 && blockerCount === 0;
  const nextActionOwner = primaryAction?.owner ?? input.verdict.owner;
  const nextActionSummary = primaryAction?.summary ?? stringField(input.verdict.nextAction.summary) ?? 'No next action recorded.';

  return {
    status: input.status,
    verdict: input.verdict.verdict,
    complete,
    deliverable,
    canRelease,
    reportOnly: input.reportOnly,
    noSourceChanges: input.sourceChanges.modifiedSource === false,
    sourceChangeSummary: input.sourceChanges.summary,
    blockingIssueCount,
    warningIssueCount: input.warnings.length,
    manualConfirmationCount,
    blockerCount,
    degradedCapabilityCount: input.degradedCapabilities.length,
    nextActionOwner,
    nextActionSummary,
    releaseRecommendation: canRelease
      ? 'release-ready'
      : manualConfirmationCount > 0
        ? 'manual-confirmation-required'
        : blockingIssueCount > 0 || blockerCount > 0 || input.status === 'blocked'
          ? 'blocked'
          : complete
            ? 'complete-not-release-ready'
            : 'not-release-ready',
  };
}

function buildConsumableNextSteps(
  nextActions: ReportNextAction[],
  issues: ReportOnlyIssue[],
  manualConfirmation: ManualConfirmationSummary[],
  reportOnly: boolean,
  redaction: { redacted: boolean; truncated: boolean },
): ConsumableNextStep[] {
  const hasBlockingIssue = issues.some((issue) => issue.blocksCompletion);
  const primarySuggestedMode = hasBlockingIssue
    ? 'fix'
    : manualConfirmation.length > 0
      ? 'manual'
      : reportOnly
        ? 'report-only'
        : 'fix';
  const steps: ConsumableNextStep[] = nextActions.map((action) => ({
    owner: action.owner,
    summary: action.summary,
    riskLevel: action.riskLevel,
    suggestedMode: primarySuggestedMode,
  }));

  for (const issue of issues) {
    steps.push({
      issueId: issue.id,
      category: issue.category,
      owner: issue.owner,
      summary: issue.recommendation,
      riskLevel: issue.severity,
      suggestedMode: issue.suggestedMode ?? (issue.blocksCompletion ? 'fix' : 'report-only'),
      blocksCompletion: issue.blocksCompletion,
    });
  }

  for (const confirmation of manualConfirmation) {
    steps.push({
      owner: confirmation.owner,
      summary: confirmation.nextAction,
      riskLevel: confirmation.riskLevel,
      suggestedMode: 'manual',
      issueId: confirmation.id,
      category: 'manual-confirmation',
      blocksCompletion: true,
    });
  }

  return steps.map((step) => ({
    ...step,
    owner: redactReportText(step.owner, 80, redaction).text,
    summary: redactReportText(step.summary, 240, redaction).text,
    suggestedMode: redactReportText(step.suggestedMode, 80, redaction).text,
    ...(step.issueId === undefined ? {} : { issueId: redactReportText(step.issueId, 120, redaction).text }),
    ...(step.category === undefined ? {} : { category: redactReportText(step.category, 120, redaction).text }),
  }));
}

function normalizeNextAction(
  value: Record<string, unknown>,
  fallbackOwner: string,
  riskLevel: CompletionVerdict['riskLevel'],
  redaction: { redacted: boolean; truncated: boolean },
): ReportNextAction {
  const owner = typeof value.owner === 'string' ? value.owner : fallbackOwner;
  const summary = typeof value.summary === 'string' ? value.summary : JSON.stringify(value);
  return {
    ...sanitizeForReport(value, redaction),
    owner: redactReportText(owner, 80, redaction).text,
    summary: redactReportText(summary, 240, redaction).text,
    riskLevel,
  };
}

function buildDegradedCapabilities(evidenceSummaries: EvidenceSummary[]): DegradedCapability[] {
  const seen = new Set<string>();
  const degraded: DegradedCapability[] = [];
  for (const entry of evidenceSummaries) {
    if (entry.status !== 'degraded' && entry.trustLevel !== 'degraded') continue;
    const key = `${entry.capabilityId}:${entry.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    degraded.push({
      capabilityId: entry.capabilityId,
      source: entry.source,
      evidenceId: entry.id,
      reason: entry.degradedReason ?? entry.summary,
    });
  }
  return degraded;
}

function buildTopSummary(
  status: ReportStatus,
  evidenceSummaries: EvidenceSummary[],
  missingEvidence: unknown,
  mergeReadiness: MergeReadinessSummary,
  redaction: { redacted: boolean; truncated: boolean },
): string {
  const verified = evidenceSummaries
    .filter((entry) => entry.status === 'passed')
    .slice(0, 3)
    .map((entry) => entry.summary)
    .join('; ') || 'No passing evidence recorded.';
  const missingCount = Array.isArray(missingEvidence) ? missingEvidence.length : 0;
  return redactReportText(
    `Status ${status}. Mode ${mergeReadiness.reportOnly ? 'report-only' : 'execution'}. Verified: ${verified}. Missing evidence: ${missingCount}. Blocking issues: ${mergeReadiness.blockingIssueCount}. Manual confirmation: ${mergeReadiness.manualConfirmationCount}. Next owner: ${mergeReadiness.nextActionOwner}.`,
    500,
    redaction,
  ).text;
}

function buildPrivacy(
  redaction: { redacted: boolean; truncated: boolean },
  artifactIndex: ArtifactIndexEntry[],
): ReportPrivacy {
  const containsSensitiveData = artifactIndex.some((entry) => entry.privacy.containsSensitiveData === true);
  const classification = artifactIndex.some((entry) => entry.privacy.classification === 'secret')
    ? 'secret'
    : artifactIndex.some((entry) => entry.privacy.classification === 'confidential')
      ? 'confidential'
      : artifactIndex.some((entry) => entry.privacy.classification === 'local-only')
        ? 'local-only'
        : 'internal';

  return {
    classification,
    containsSensitiveData,
    redacted: redaction.redacted || artifactIndex.some((entry) => entry.privacy.redacted === true),
    truncated: redaction.truncated,
  };
}

function renderMarkdown(report: VerificationReportJson): string {
  const releaseReady = report.status === 'release-ready' ? 'yes' : 'no';
  const complete = report.status === 'passed' || report.status === 'release-ready' ? 'yes' : 'no';
  const verified = report.evidenceSummaries
    .filter((entry) => entry.status === 'passed')
    .map((entry) => entry.summary)
    .slice(0, 3)
    .join('; ') || 'none';
  const missing = report.missingEvidence.length === 0 ? 'none' : `${report.missingEvidence.length} item(s)`;
  const degraded = report.sections.degradedCapabilities.length === 0
    ? 'none'
    : report.sections.degradedCapabilities.map((entry) => entry.capabilityId).join(', ');
  const primaryAction = report.sections.nextActions[0];
  const nextAction = primaryAction === undefined ? 'none' : `${primaryAction.owner} - ${primaryAction.summary}`;

  const lines = [
    `# Verification Report: ${report.runId}`,
    '',
    `Status: ${report.status}`,
    `Mode: ${report.mode}`,
    `Complete: ${complete}`,
    `Can release: ${releaseReady}`,
    `Blocking issues: ${report.sections.mergeReadiness.blockingIssueCount}`,
    `Warning issues: ${report.sections.mergeReadiness.warningIssueCount}`,
    `Manual confirmation: ${report.sections.mergeReadiness.manualConfirmationCount}`,
    `Next action owner: ${report.sections.mergeReadiness.nextActionOwner}`,
    `Verified: ${verified}`,
    `Missing evidence: ${missing}`,
    `Degraded capabilities: ${degraded}`,
    `Next action: ${nextAction}`,
    `Report-only: ${report.reportOnly ? 'yes - no source files modified' : 'no'}`,
    `Source changes: ${report.sourceChanges.summary}`,
    '',
    '## Merge Readiness',
    ...renderMergeReadiness(report.sections.mergeReadiness),
    '',
    '## Evidence',
    ...renderEvidenceLines(report),
    '',
    '## Artifacts',
    ...renderArtifactLines(report),
    '',
    '## Blockers',
    ...renderUnknownList(report.sections.blockers),
    '',
    '## Report-Only Issues',
    ...renderReportOnlyIssues(report.sections.reportOnlyIssues),
    '',
    '## Policy Effects',
    ...renderPolicyEffects(report.sections.policyEffects),
    '',
    '## Action Log',
    ...renderActionLogs(report.sections.actionLogs),
    '',
    '## Capability Routes',
    ...renderCapabilityRoutes(report.sections.capabilityRoutes),
    '',
    '## Remediation Plans',
    ...renderRemediationPlans(report.sections.remediationPlans),
    '',
    '## Missing Evidence',
    ...renderUnknownList(report.sections.missingEvidence),
    '',
    '## Manual Confirmation',
    ...renderManualConfirmation(report.sections.manualConfirmation),
    '',
    '## Unverified Scope',
    ...renderUnknownList(report.sections.unverifiedScope),
    '',
    '## Next Actions',
    ...report.sections.nextActions.map((action) => `- Owner: ${action.owner}; Risk: ${action.riskLevel}; Action: ${action.summary}`),
    '',
    '## Transcript Summary',
    report.transcriptSummary,
    '',
  ];

  return `${lines.join('\n')}`;
}

function renderEvidenceLines(report: VerificationReportJson): string[] {
  if (report.evidenceSummaries.length === 0) return ['- none'];
  return report.evidenceSummaries.map((entry) => {
    const artifacts = entry.artifactRefs.length > 0 ? entry.artifactRefs.join(', ') : 'none';
    const unverified = entry.unverifiedScope.length > 0 ? `; unverified: ${entry.unverifiedScope.join(', ')}` : '';
    const degraded = entry.degradedReason !== undefined ? `; degraded: ${entry.degradedReason}` : '';
    return `- ${entry.id}: ${entry.status}/${entry.trustLevel}/${entry.source} - ${entry.summary}; freshness: ${entry.freshness}; artifacts: ${artifacts}${unverified}${degraded}`;
  });
}

function renderArtifactLines(report: VerificationReportJson): string[] {
  if (report.artifactSummaries.length === 0) return ['- none'];
  return report.artifactSummaries.map((entry) => `- ${entry.id}: ${entry.type} ${entry.path} - ${entry.summary}`);
}

function renderMergeReadiness(readiness: MergeReadinessSummary): string[] {
  return [
    `- Complete: ${readiness.complete ? 'yes' : 'no'}`,
    `- Deliverable: ${readiness.deliverable ? 'yes' : 'no'}`,
    `- Can release: ${readiness.canRelease ? 'yes' : 'no'}`,
    `- Report-only: ${readiness.reportOnly ? 'yes' : 'no'}`,
    `- No source changes: ${readiness.noSourceChanges ? 'yes' : 'no'}`,
    `- Blocking issues: ${readiness.blockingIssueCount}`,
    `- Warning issues: ${readiness.warningIssueCount}`,
    `- Manual confirmation: ${readiness.manualConfirmationCount}`,
    `- Blockers: ${readiness.blockerCount}`,
    `- Degraded capabilities: ${readiness.degradedCapabilityCount}`,
    `- Next action owner: ${readiness.nextActionOwner}`,
    `- Next action: ${readiness.nextActionSummary}`,
    `- Release recommendation: ${readiness.releaseRecommendation}`,
  ];
}

function renderReportOnlyIssues(issues: ReportOnlyIssue[]): string[] {
  if (issues.length === 0) return ['- none'];
  return issues.map((issue) => {
    const reproduction = issue.reproductionSteps.length > 0 ? issue.reproductionSteps.join('; ') : 'not recorded';
    const evidence = issue.evidenceRefs.length > 0 ? issue.evidenceRefs.join(', ') : 'none';
    const artifacts = issue.artifactRefs.length > 0 ? issue.artifactRefs.join(', ') : 'none';
    const suggestedMode = issue.suggestedMode ?? 'not recorded';
    return `- ${issue.id}: Category: ${issue.category}; Severity: ${issue.severity}; Summary: ${issue.summary}; Reproduction: ${reproduction}; Evidence: ${evidence}; Artifacts: ${artifacts}; Owner: ${issue.owner}; Blocks completion: ${issue.blocksCompletion ? 'yes' : 'no'}; Suggested mode: ${suggestedMode}; Impact: ${issue.impact}; Recommendation: ${issue.recommendation}`;
  });
}

function renderManualConfirmation(items: ManualConfirmationSummary[]): string[] {
  if (items.length === 0) return ['- none'];
  return items.map((item) => {
    const evidence = item.evidenceRefs.length > 0 ? item.evidenceRefs.join(', ') : 'none';
    const artifacts = item.artifactRefs.length > 0 ? item.artifactRefs.join(', ') : 'none';
    const routes = item.capabilityRouteRefs.length > 0 ? item.capabilityRouteRefs.join(', ') : 'none';
    const remediation = item.remediationRefs.length > 0 ? item.remediationRefs.join(', ') : 'none';
    return `- ${item.id}: Owner: ${item.owner}; Risk: ${item.riskLevel}; Source: ${item.source}; Summary: ${item.summary}; Reason: ${item.reason}; Criteria: ${item.criteria}; Evidence: ${evidence}; Artifacts: ${artifacts}; Capability routes: ${routes}; Remediation refs: ${remediation}; Next action: ${item.nextAction}`;
  });
}

function renderPolicyEffects(effects: PolicyEffectSummary[]): string[] {
  if (effects.length === 0) return ['- none'];
  return effects.map((effect) => {
    const risk = effect.riskLevel === undefined ? 'unknown' : effect.riskLevel;
    return `- ${effect.id}: ${effect.decision} ${effect.actionType}; Risk: ${risk}; Reason: ${effect.reason}`;
  });
}

function renderActionLogs(logs: ActionLogSummary[]): string[] {
  if (logs.length === 0) return ['- none'];
  return logs.map((log) => {
    const targets = log.targetFiles.length > 0 ? log.targetFiles.join(', ') : 'none';
    const evidence = log.evidenceRefs.length > 0 ? log.evidenceRefs.join(', ') : 'none';
    const risk = log.riskLevel === undefined ? 'unknown' : log.riskLevel;
    return `- ${log.id}: ${log.actionType} ${log.result}; Risk: ${risk}; Targets: ${targets}; Intent: ${log.intent}; Evidence: ${evidence}; Same-path retry required: ${log.requiresSamePathRetry ? 'yes' : 'no'}`;
  });
}

function renderCapabilityRoutes(routes: CapabilityRouteSummary[]): string[] {
  if (routes.length === 0) return ['- none'];
  return routes.map((route) => {
    const selected = route.selectedCapabilityId ?? 'none';
    const fallbacks = route.fallbackCapabilityIds.length > 0 ? route.fallbackCapabilityIds.join(', ') : 'none';
    const fallback = route.decision === 'fallback' ? selected : 'none';
    const degradedReason = route.degradedReason ?? route.reason;
    const missingCapability = route.decision === 'selected' ? 'none' : route.primaryCapabilityId;
    const evidenceImpact = route.evidenceImpact.length > 0 ? route.evidenceImpact.join(', ') : 'not recorded';
    const remediation = route.remediationRefs.length > 0 ? route.remediationRefs.join(', ') : 'none';
    return `- ${route.id}: ${route.decision}; Requirement: ${route.requirementId}; Source: ${route.requirementSource}; Description: ${route.description}; Primary: ${route.primaryCapabilityId}; Missing/degraded capability: ${missingCapability}; Selected: ${selected}; Fallback: ${fallback}; Fallbacks: ${fallbacks}; Trust: ${route.trustLevel}; Trust impact: ${route.trustLevel}; Evidence impact: ${evidenceImpact}; Manual confirmation: ${route.manualConfirmationRequired ? 'yes' : 'no'}; Blocks completion: ${route.blocksCompletion ? 'yes' : 'no'}; Remediation refs: ${remediation}; Degraded reason: ${degradedReason}; Reason: ${route.reason}`;
  });
}

function renderRemediationPlans(plans: RemediationPlanSummary[]): string[] {
  if (plans.length === 0) return ['- none'];
  return plans.flatMap((plan) => {
    const header = `- ${plan.id}: ${plan.capabilityId} ${plan.status}`;
    const actions = plan.actions.length === 0
      ? ['  - actions: none']
      : plan.actions.map((action) => {
          const risk = action.riskLevel ?? 'unknown';
          const policy = action.policyDecision === undefined ? 'unknown' : action.policyDecision;
          const restores = action.expectedRestoredCapabilities.length > 0 ? action.expectedRestoredCapabilities.join(', ') : 'not recorded';
          const impact = action.completionImpact ?? 'not recorded';
          return `  - ${action.id}: ${action.kind} ${action.status}; Risk: ${risk}; Authorization: ${action.requiresAuthorization ? 'yes' : 'no'}; Auto execute: ${action.executesAutomatically ? 'yes' : 'no'}; Policy: ${policy}; Verify: ${action.verificationCommand}; Restores: ${restores}; Completion impact: ${impact}; Fallback: ${action.failureFallback}; Action: ${action.action}`;
        });
    return [header, ...actions];
  });
}

function collectCapabilityRoutes(policy: Record<string, unknown>): Record<string, unknown>[] {
  const output: Record<string, unknown>[] = [];
  const direct = arrayField(policy.capabilityRoutes) ?? arrayField(policy.routes) ?? [];
  output.push(...direct.filter(isRecord));
  if (isRecord(policy.routingPlan)) {
    const routes = arrayField(policy.routingPlan.routes) ?? [];
    output.push(...routes.filter(isRecord));
  }
  return output;
}

function collectRemediationPlans(policy: Record<string, unknown>): Record<string, unknown>[] {
  const output: Record<string, unknown>[] = [];
  const direct = arrayField(policy.remediationPlans) ?? arrayField(policy.remediations) ?? [];
  output.push(...direct.filter(isRecord));
  if (isRecord(policy.remediationPlan)) output.push(policy.remediationPlan);
  return output;
}

function renderUnknownList(items: unknown[]): string[] {
  if (items.length === 0) return ['- none'];
  return items.map((item) => {
    if (isRecord(item)) {
      const id = typeof item.id === 'string' ? item.id : typeof item.code === 'string' ? item.code : undefined;
      const message = typeof item.message === 'string'
        ? item.message
        : typeof item.description === 'string'
          ? item.description
          : typeof item.reason === 'string'
            ? item.reason
            : undefined;
      const suffix = message === undefined ? JSON.stringify(item) : message;
      return `- ${id === undefined ? suffix : `${id}: ${suffix}`}`;
    }
    return `- ${String(item)}`;
  });
}

function mergeMissingEvidence(verdictMissing: unknown[], stateMissing: unknown[]): unknown[] {
  const output: unknown[] = [];
  const seen = new Set<string>();
  for (const item of [...verdictMissing, ...stateMissing]) {
    const key = stableKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function stableKey(value: unknown): string {
  if (isRecord(value)) {
    const id = typeof value.id === 'string' ? value.id : undefined;
    const source = typeof value.source === 'string' ? value.source : undefined;
    if (id !== undefined) return `${source ?? 'unknown'}:${id}`;
  }
  return JSON.stringify(value);
}

function toIsoDate(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date().toISOString();
}

function isRiskLevel(value: string): value is CompletionVerdict['riskLevel'] {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical';
}

function riskField(value: unknown): CompletionVerdict['riskLevel'] | undefined {
  return typeof value === 'string' && isRiskLevel(value) ? value : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function stringArrayField(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

function arrayField(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
