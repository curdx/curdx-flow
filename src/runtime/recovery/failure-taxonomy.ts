import { summarizeArtifactText } from '../evidence/index.ts';
import type {
  CapturedFailureRecord,
  CaptureFailureEvidenceInput,
  FailureCategory,
  FailureCommandSummary,
  FailureEvidenceCaptureResult,
  FailureNextAction,
  FailureObservation,
  FailurePrivacySummary,
  FailureTaxonomySummary,
} from './types.ts';

interface Classification {
  category: FailureCategory;
  confidence: number;
  reason: string;
  signals: string[];
}

interface RedactedFailureSummary {
  summary: string;
  privacy: FailurePrivacySummary;
}

interface SafeText {
  text: string;
  redacted: boolean;
  truncated: boolean;
}

const categoryPriority: Record<FailureCategory, number> = {
  environment: 100,
  dependency: 90,
  permission: 85,
  externalService: 80,
  releaseGate: 75,
  backend: 70,
  api: 60,
  data: 50,
  browser: 40,
  frontend: 30,
  unknown: 0,
};

export function captureFailureEvidence(input: CaptureFailureEvidenceInput): FailureEvidenceCaptureResult {
  const generatedAt = toIso(input.generatedAt);
  const failures = input.observations.map((observation, index) =>
    captureFailure(input, observation, index, generatedAt)
  );
  const primary = selectPrimaryFailure(failures);
  const secondarySymptoms = failures.filter((failure) => failure.id !== primary.id);
  const taxonomy = buildTaxonomy(failures, primary, secondarySymptoms);

  return {
    schemaVersion: 1,
    ok: true,
    runId: input.runId,
    goalId: input.goalId,
    generatedAt,
    failures,
    taxonomy,
    primary,
    secondarySymptoms,
    diagnostics: failures.length === 0
      ? [{ code: 'failure-observation-missing', message: 'No failure observations were provided.' }]
      : [],
    nextAction: nextActionFor(primary),
  };
}

function captureFailure(
  input: CaptureFailureEvidenceInput,
  observation: FailureObservation,
  index: number,
  generatedAt: string,
): CapturedFailureRecord {
  const classification = classifyFailure(observation);
  const redacted = summarizeFailure(observation);
  const reproductionSteps = observation.reproductionSteps.map((step) => safeText(step, 220));
  const safeCommandSummary = observation.command === undefined ? undefined : safeCommand(observation.command);
  const safeUrl = observation.url === undefined ? undefined : safeText(observation.url, 320);
  const safeTarget = observation.target === undefined ? undefined : safeText(observation.target, 180);
  const privacy = mergePrivacy(
    redacted.privacy,
    ...reproductionSteps,
    ...(safeCommandSummary === undefined ? [] : safeCommandSummary.privacySignals),
    ...(safeUrl === undefined ? [] : [safeUrl]),
    ...(safeTarget === undefined ? [] : [safeTarget]),
  );
  return {
    id: observation.id ?? `${observation.source}-failure-${index + 1}`,
    source: observation.source,
    category: classification.category,
    confidence: classification.confidence,
    reason: classification.reason,
    signals: classification.signals,
    summary: redacted.summary,
    reproductionSteps: reproductionSteps.map((step) => step.text),
    evidenceRefs: observation.evidenceRefs,
    artifactRefs: observation.artifactRefs,
    observedAt: observation.observedAt ?? observation.completedAt ?? observation.startedAt ?? generatedAt,
    privacy,
    ...(safeCommandSummary === undefined ? {} : { command: safeCommandSummary.command }),
    ...(observation.actionId === undefined ? {} : { actionId: observation.actionId }),
    ...(observation.method === undefined ? {} : { method: observation.method }),
    ...(safeUrl === undefined ? {} : { url: safeUrl.text }),
    ...(observation.status === undefined ? {} : { status: observation.status }),
    ...(safeTarget === undefined ? {} : { target: safeTarget.text }),
    ...(observation.capabilityId === undefined ? {} : { capabilityId: observation.capabilityId }),
    ...(observation.capabilityState === undefined ? {} : { capabilityState: observation.capabilityState }),
    runId: input.runId,
    goalId: input.goalId,
  };
}

function classifyFailure(observation: FailureObservation): Classification {
  const signals = collectSignals(observation);
  const text = signals.join(' ').toLowerCase();

  if (observation.category !== undefined) {
    return {
      category: observation.category,
      confidence: 0.95,
      reason: `Explicit category ${observation.category} was provided.`,
      signals: [`category:${observation.category}`],
    };
  }

  const permission = match(text, ['eacces', 'permission', 'not authorized', 'unauthorized', 'forbidden', 'denied']);
  if (permission) return classified('permission', 0.9, permission, observation);

  const release = observation.source === 'release' || match(text, ['release gate', 'version parity', 'tag parity', 'plugin validate']);
  if (release) return classified('releaseGate', 0.9, 'release signal', observation);

  const external = match(text, ['external-service', 'third-party', 'rate limit', 'upstream unavailable', 'service unavailable']);
  if (external) return classified('externalService', 0.82, external, observation);

  if (observation.source === 'browser') return classified('browser', 0.85, 'browser source', observation);
  if (observation.source === 'api') return classified('api', 0.85, 'api source', observation);
  if (observation.source === 'data') return classified('data', 0.85, 'data source', observation);

  const environment = match(text, [
    'database-unavailable',
    'database_url',
    'missing-secret',
    'missing secret',
    'env',
    'econnrefused',
    'port in use',
    'not configured',
  ]);
  if (environment) return classified('environment', 0.9, environment, observation);

  const dependency = match(text, [
    'command-not-found',
    'command not found',
    'module not found',
    'not installed',
    'dependency',
    'capability-unavailable',
    'unavailable',
  ]);
  if (dependency || observation.source === 'capability') {
    return classified('dependency', observation.source === 'capability' ? 0.86 : 0.88, dependency ?? 'capability source', observation);
  }

  const frontend = match(text, ['frontend', 'ui-', 'visual', 'render', 'react', 'dom', 'hydration']);
  if (frontend) return classified('frontend', 0.72, frontend, observation);

  const backend = observation.source === 'service' || match(text, ['backend', 'server', 'handler', 'transaction']);
  if (backend) return classified('backend', 0.7, 'service/backend signal', observation);

  return {
    category: 'unknown',
    confidence: 0.25,
    reason: 'No reliable taxonomy signal matched this failure.',
    signals: safeSignals(signals).slice(0, 6),
  };
}

function classified(
  category: FailureCategory,
  confidence: number,
  matchedSignal: string,
  observation: FailureObservation,
): Classification {
  return {
    category,
    confidence,
    reason: `Classified as ${category} from ${observation.source} failure signal: ${matchedSignal}.`,
    signals: safeSignals(collectSignals(observation)).slice(0, 8),
  };
}

function collectSignals(observation: FailureObservation): string[] {
  return [
    `source:${observation.source}`,
    observation.failureCode === undefined ? undefined : `failureCode:${observation.failureCode}`,
    observation.possibleLayer === undefined ? undefined : `possibleLayer:${observation.possibleLayer}`,
    observation.capabilityState === undefined ? undefined : `capabilityState:${observation.capabilityState}`,
    observation.capabilityId === undefined ? undefined : `capabilityId:${observation.capabilityId}`,
    observation.status === undefined ? undefined : `status:${observation.status}`,
    observation.summary,
    observation.stderr,
    observation.stdout,
    observation.responseSummary,
    observation.dataSummary,
  ].filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function summarizeFailure(observation: FailureObservation): RedactedFailureSummary {
  const raw = [
    observation.summary,
    observation.responseSummary ? `response: ${observation.responseSummary}` : undefined,
    observation.dataSummary ? `data: ${observation.dataSummary}` : undefined,
    observation.stdout ? `stdout: ${observation.stdout}` : undefined,
    observation.stderr ? `stderr: ${observation.stderr}` : undefined,
  ].filter((entry): entry is string => entry !== undefined && entry.length > 0).join('\n');
  const summary = summarizeArtifactText(raw, 650);
  const rawWasLarge = raw.replace(/\s+/g, ' ').trim().length > 650;
  return {
    summary: summary.summary,
    privacy: {
      classification: summary.redacted ? 'confidential' : 'local-only',
      containsSensitiveData: summary.redacted,
      redacted: summary.redacted,
      summaryTruncated: summary.truncated || rawWasLarge,
    },
  };
}

function safeCommand(command: FailureCommandSummary): { command: FailureCommandSummary; privacySignals: SafeText[] } {
  const argv = command.argv.map((arg) => safeText(arg, 180));
  const cwd = command.cwd === undefined ? undefined : safeText(command.cwd, 240);
  return {
    command: {
      executable: safeText(command.executable, 120).text,
      argv: argv.map((arg) => arg.text),
      exitCode: command.exitCode,
      ...(cwd === undefined ? {} : { cwd: cwd.text }),
    },
    privacySignals: [...argv, ...(cwd === undefined ? [] : [cwd])],
  };
}

function safeText(value: string, maxLength: number): SafeText {
  const result = summarizeArtifactText(value, maxLength);
  return {
    text: result.summary,
    redacted: result.redacted,
    truncated: result.truncated,
  };
}

function mergePrivacy(base: FailurePrivacySummary, ...signals: SafeText[]): FailurePrivacySummary {
  const redacted = base.redacted || signals.some((signal) => signal.redacted);
  return {
    classification: redacted ? 'confidential' : base.classification,
    containsSensitiveData: base.containsSensitiveData || signals.some((signal) => signal.redacted),
    redacted,
    summaryTruncated: base.summaryTruncated || signals.some((signal) => signal.truncated),
  };
}

function selectPrimaryFailure(failures: CapturedFailureRecord[]): CapturedFailureRecord {
  if (failures.length === 0) {
    return {
      id: 'failure-observation-missing',
      source: 'command',
      category: 'unknown',
      confidence: 0,
      reason: 'No failure observations were provided.',
      signals: [],
      summary: 'No failure observations were provided.',
      reproductionSteps: [],
      evidenceRefs: [],
      artifactRefs: [],
      observedAt: new Date(0).toISOString(),
      privacy: {
        classification: 'local-only',
        containsSensitiveData: false,
        redacted: false,
        summaryTruncated: false,
      },
    };
  }

  return [...failures].sort((a, b) => {
    const priorityDelta = categoryPriority[b.category] - categoryPriority[a.category];
    if (priorityDelta !== 0) return priorityDelta;
    return b.confidence - a.confidence;
  })[0] as CapturedFailureRecord;
}

function buildTaxonomy(
  failures: CapturedFailureRecord[],
  primary: CapturedFailureRecord,
  secondarySymptoms: CapturedFailureRecord[],
): FailureTaxonomySummary {
  const categories = unique(failures.map((failure) => failure.category));
  return {
    categories,
    primaryCategory: primary.category,
    primaryFailureId: primary.id,
    secondarySymptomIds: secondarySymptoms.map((failure) => failure.id),
    confidence: primary.confidence,
    reason: primary.reason,
  };
}

function nextActionFor(primary: CapturedFailureRecord): FailureNextAction {
  switch (primary.category) {
    case 'environment':
      return { owner: 'user', summary: 'Restore environment configuration, service availability, port ownership, or required secrets, then rerun the same failure path.' };
    case 'dependency':
      return { owner: 'user', summary: 'Restore dependency or capability availability, then rerun the same failure path.' };
    case 'permission':
      return { owner: 'user', summary: 'Grant or confirm the required permission, then rerun the same failure path.' };
    case 'externalService':
      return { owner: 'external-system', summary: 'Wait for or restore the external service, then rerun the same failure path.' };
    case 'api':
      return { owner: 'agent', summary: 'Inspect the API request, response contract, handler, and logs before planning a fix.' };
    case 'data':
      return { owner: 'agent', summary: 'Inspect data readback, persistence, transaction, cache, and state synchronization evidence before planning a fix.' };
    case 'browser':
    case 'frontend':
      return { owner: 'agent', summary: 'Inspect browser actions, console, network, DOM, and screenshot or trace evidence before planning a fix.' };
    case 'backend':
      return { owner: 'agent', summary: 'Inspect backend service logs, handlers, and runtime state before planning a fix.' };
    case 'releaseGate':
      return { owner: 'agent', summary: 'Inspect release gate evidence, version parity, plugin validation, and tag state before planning release recovery.' };
    case 'unknown':
      return { owner: 'agent', summary: 'Collect more diagnostic evidence before proposing a fix; do not guess a repair from this failure alone.' };
  }
}

function match(value: string, needles: string[]): string | null {
  return needles.find((needle) => value.includes(needle)) ?? null;
}

function safeSignals(signals: string[]): string[] {
  return signals.map((signal) => summarizeArtifactText(signal, 160).summary);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function toIso(value?: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}
