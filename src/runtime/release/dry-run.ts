import type {
  EvaluateReleaseDryRunInput,
  ReleaseBlocker,
  ReleaseCheckResult,
  ReleaseCommand,
  ReleaseDryRunSummary,
  ReleaseDryRunVerdict,
  ReleaseFreshnessContext,
  ReleaseFreshnessResult,
  ReleaseMissingEvidence,
  ReleaseNextAction,
  ReleaseRiskLevel,
  ReleaseSideEffectKind,
  ReleaseSideEffectRecord,
} from './types.ts';

export function evaluateReleaseDryRun(input: EvaluateReleaseDryRunInput): ReleaseDryRunVerdict {
  const generatedAt = toIso(input.generatedAt);
  const npmTag = input.npmTag ?? `v${input.version}`;
  const claudePluginTag = input.claudePluginTag ?? `curdx-flow--v${input.version}`;
  const freshnessContext = normalizeFreshness(input, generatedAt, npmTag, claudePluginTag);
  const freshness = evaluateReleaseFreshness(freshnessContext, input.now);
  const requiredChecks = normalizeRequiredChecks(input.checks, input.requiredCheckIds);
  const missingEvidence = buildMissingEvidence(requiredChecks, freshness);
  const sideEffects = detectForbiddenReleaseSideEffects(input.plannedCommands ?? []);
  const blockers = buildReleaseBlockers(requiredChecks, missingEvidence, freshness, sideEffects);
  const verdict = blockers.length === 0 ? 'release-ready' : 'not-releasable';
  const riskLevel = riskFor(verdict, blockers);
  const summary = buildDryRunSummary(verdict);

  return {
    schemaVersion: 1,
    runId: input.runId,
    goalId: input.goalId,
    generatedAt,
    verdict,
    version: input.version,
    npmTag,
    claudePluginTag,
    checks: requiredChecks,
    missingEvidence,
    blockers,
    nextAction: nextActionFor(verdict, blockers),
    riskLevel,
    trustLevel: input.trustLevel ?? 'L4',
    freshness,
    sideEffects,
    published: false,
    publicationState: 'not-published',
    summary,
  };
}

export function detectForbiddenReleaseSideEffects(commands: ReleaseCommand[]): ReleaseSideEffectRecord[] {
  const records: ReleaseSideEffectRecord[] = [];
  for (const command of commands) {
    const kind = classifyForbiddenReleaseCommand(command);
    if (kind === undefined) continue;
    records.push({
      kind,
      command: formatCommand(command),
      blocked: true,
      reason: 'release dry-run forbids real push, tag, publish, and plugin release side effects.',
    });
  }
  return records;
}

function normalizeFreshness(
  input: EvaluateReleaseDryRunInput,
  generatedAt: string,
  npmTag: string,
  claudePluginTag: string,
): ReleaseFreshnessContext {
  const evidenceRefs = input.freshness.evidenceRefs ?? uniqueRefs(input.checks.flatMap((check) => check.evidenceRefs ?? []));
  return {
    currentCommit: input.freshness.currentCommit ?? '',
    version: input.version,
    npmTag,
    claudePluginTag,
    generatedAt,
    evidenceRefs,
    evidenceCommit: input.freshness.evidenceCommit,
    evidenceVersion: input.freshness.evidenceVersion,
    evidenceNpmTag: input.freshness.evidenceNpmTag,
    evidenceClaudePluginTag: input.freshness.evidenceClaudePluginTag,
    expiresAt: input.freshness.expiresAt,
    stale: input.freshness.stale,
  };
}

function normalizeRequiredChecks(
  checks: ReleaseCheckResult[],
  requiredCheckIds: string[] | undefined,
): ReleaseCheckResult[] {
  if (requiredCheckIds === undefined) {
    return checks.map((check) => ({ ...check, required: check.required !== false }));
  }

  const byId = new Map(checks.map((check) => [check.id, check]));
  const required = requiredCheckIds.map((id): ReleaseCheckResult => {
    const existing = byId.get(id);
    if (existing !== undefined) return { ...existing, required: true };
    return {
      id,
      status: 'missing',
      summary: `Required release check '${id}' was not provided.`,
      required: true,
      evidenceRefs: [],
      remediation: `Run or provide release evidence for '${id}', then rerun release dry-run.`,
      riskLevel: 'high',
    };
  });
  const optional = checks
    .filter((check) => !requiredCheckIds.includes(check.id))
    .map((check) => ({ ...check, required: check.required === true }));
  return [...required, ...optional];
}

function evaluateReleaseFreshness(
  context: ReleaseFreshnessContext,
  now?: Date | string,
): ReleaseFreshnessResult {
  const reasons: string[] = [];

  if (!isNonEmptyString(context.currentCommit)) {
    reasons.push('missing current commit context');
  }
  if (!isNonEmptyString(context.generatedAt) || Number.isNaN(Date.parse(context.generatedAt))) {
    reasons.push('missing valid generatedAt context');
  }
  if (context.evidenceRefs.length === 0) {
    reasons.push('missing release evidence references');
  }
  if (context.stale === true) {
    reasons.push('release evidence marked stale');
  }
  if (isNonEmptyString(context.evidenceCommit) && context.evidenceCommit !== context.currentCommit) {
    reasons.push('commit context mismatch');
  }
  if (isNonEmptyString(context.evidenceVersion) && context.evidenceVersion !== context.version) {
    reasons.push('version context mismatch');
  }
  if (isNonEmptyString(context.evidenceNpmTag) && context.evidenceNpmTag !== context.npmTag) {
    reasons.push('npm tag context mismatch');
  }
  if (isNonEmptyString(context.evidenceClaudePluginTag) && context.evidenceClaudePluginTag !== context.claudePluginTag) {
    reasons.push('Claude plugin tag context mismatch');
  }
  if (isNonEmptyString(context.expiresAt)) {
    const expiry = Date.parse(context.expiresAt);
    if (Number.isNaN(expiry)) {
      reasons.push('invalid release evidence expiry');
    } else if (expiry < nowMs(now)) {
      reasons.push('release evidence expired');
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    context,
  };
}

function buildMissingEvidence(
  checks: ReleaseCheckResult[],
  freshness: ReleaseFreshnessResult,
): ReleaseMissingEvidence[] {
  const missing: ReleaseMissingEvidence[] = [];

  for (const check of checks) {
    if (check.required !== true) continue;
    if (check.status === 'missing' || check.status === 'skipped') {
      missing.push({
        id: `${check.id}-missing`,
        checkId: check.id,
        reason: `Required release check '${check.id}' has no passing evidence.`,
        required: true,
      });
      continue;
    }
    if ((check.evidenceRefs ?? []).length === 0) {
      missing.push({
        id: `${check.id}-evidence-missing`,
        checkId: check.id,
        reason: `Required release check '${check.id}' did not provide evidence refs.`,
        required: true,
      });
    }
  }

  if (freshness.context.evidenceRefs.length === 0) {
    missing.push({
      id: 'release-freshness-evidence-missing',
      reason: 'Release freshness context did not include any evidence refs.',
      required: true,
    });
  }

  return missing;
}

function buildReleaseBlockers(
  checks: ReleaseCheckResult[],
  missingEvidence: ReleaseMissingEvidence[],
  freshness: ReleaseFreshnessResult,
  sideEffects: ReleaseSideEffectRecord[],
): ReleaseBlocker[] {
  const blockers: ReleaseBlocker[] = [];

  for (const check of checks) {
    if (check.required !== true || check.status === 'passed') continue;
    blockers.push({
      checkId: check.id,
      reason: `Required release check '${check.id}' is ${check.status}: ${check.summary}`,
      remediation: check.remediation ?? `Fix '${check.id}' and rerun release dry-run.`,
      requiresDryRunRerun: true,
      riskLevel: check.riskLevel ?? riskForCheckStatus(check.status),
      evidenceRefs: check.evidenceRefs ?? [],
    });
  }

  for (const item of missingEvidence) {
    blockers.push({
      checkId: item.checkId ?? item.id,
      reason: item.reason,
      remediation: 'Collect the missing release evidence and rerun release dry-run.',
      requiresDryRunRerun: true,
      riskLevel: 'high',
      evidenceRefs: [],
    });
  }

  for (const reason of freshness.reasons) {
    blockers.push({
      checkId: 'release-evidence-freshness',
      reason,
      remediation: 'Regenerate release evidence for the current commit, version, npm tag, and Claude plugin tag.',
      requiresDryRunRerun: true,
      riskLevel: 'high',
      evidenceRefs: freshness.context.evidenceRefs,
    });
  }

  for (const sideEffect of sideEffects) {
    blockers.push({
      checkId: sideEffect.kind,
      reason: `Dry-run planned forbidden release side effect: ${sideEffect.command}`,
      remediation: 'Replace the command with a dry-run or read-only check before release dry-run can pass.',
      requiresDryRunRerun: true,
      riskLevel: 'critical',
      evidenceRefs: [],
    });
  }

  return dedupeBlockers(blockers);
}

function nextActionFor(verdict: ReleaseDryRunVerdict['verdict'], blockers: ReleaseBlocker[]): ReleaseNextAction {
  if (verdict === 'release-ready') {
    return {
      owner: 'maintainer',
      summary: 'Dry-run passed and did not publish; request explicit release-stage authorization before push, tag, npm publish, or Claude plugin release.',
      commands: ['request release-stage authorization'],
      requiresReleaseStageAuthorization: true,
    };
  }

  const topBlocker = blockers[0];
  return {
    owner: 'agent',
    summary: topBlocker === undefined
      ? 'Fix release blockers and rerun release dry-run before any publish action.'
      : `Fix '${topBlocker.checkId}' and rerun release dry-run before any publish action.`,
    commands: ['npm run check-versions', 'npm run check:hooks-fresh', 'claude plugin validate ./plugins/curdx-flow'],
    requiresReleaseStageAuthorization: false,
  };
}

function buildDryRunSummary(verdict: ReleaseDryRunVerdict['verdict']): ReleaseDryRunSummary {
  if (verdict === 'release-ready') {
    return {
      headline: '未发布 / 可发布',
      publicationState: 'not-published',
      statusLabel: '可发布',
      dryRunOnly: true,
    };
  }
  return {
    headline: '未发布 / 不可发布',
    publicationState: 'not-published',
    statusLabel: '不可发布',
    dryRunOnly: true,
  };
}

function riskFor(verdict: ReleaseDryRunVerdict['verdict'], blockers: ReleaseBlocker[]): ReleaseRiskLevel {
  if (verdict === 'release-ready') return 'medium';
  if (blockers.some((blocker) => blocker.riskLevel === 'critical')) return 'critical';
  if (blockers.some((blocker) => blocker.riskLevel === 'high')) return 'high';
  return 'medium';
}

function riskForCheckStatus(status: ReleaseCheckResult['status']): ReleaseRiskLevel {
  if (status === 'failed' || status === 'stale') return 'high';
  if (status === 'missing') return 'high';
  return 'medium';
}

function classifyForbiddenReleaseCommand(command: ReleaseCommand): ReleaseSideEffectKind | undefined {
  const executable = command.executable.toLowerCase();
  const argv = command.argv.map((part) => part.toLowerCase());

  if (executable === 'git' && argv[0] === 'push') return 'git-push';
  if (executable === 'git' && argv[0] === 'tag' && !isReadOnlyGitTagCommand(argv)) return 'git-tag';
  if (executable === 'npm' && argv[0] === 'publish') return 'npm-publish';
  if (executable === 'claude' && argv[0] === 'plugin' && argv[1] === 'tag' && argv.includes('--push')) {
    return 'claude-plugin-tag-push';
  }
  if (executable === 'claude' && argv[0] === 'plugin' && argv.includes('release')) {
    return 'plugin-release';
  }
  return undefined;
}

function isReadOnlyGitTagCommand(argv: string[]): boolean {
  if (argv.length === 1) return true;
  return argv.some((part) => part === '-l'
    || part === '--list'
    || part === '--points-at'
    || part === '--contains'
    || part === '--merged'
    || part === '--no-merged');
}

function dedupeBlockers(blockers: ReleaseBlocker[]): ReleaseBlocker[] {
  const seen = new Set<string>();
  return blockers.filter((blocker) => {
    const key = `${blocker.checkId}:${blocker.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueRefs(refs: string[]): string[] {
  return [...new Set(refs.filter(isNonEmptyString))];
}

function formatCommand(command: ReleaseCommand): string {
  return [command.executable, ...command.argv].join(' ');
}

function toIso(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function nowMs(value: Date | string | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
