import type {
  EvaluatePluginSmokeGateInput,
  ReleaseBlocker,
  ReleaseCheckResult,
  ReleaseCommandEvidence,
  ReleaseMissingEvidence,
  ReleasePluginSmokeResult,
  ReleasePluginSmokeStatus,
  ReleaseSmokeFailureKind,
  ReleaseSmokeSurfaceEvidence,
  ReleaseSmokeSurfaceKind,
  ReleaseVerifiedSurface,
} from './types.ts';

const pluginValidationCommand = 'claude plugin validate ./plugins/curdx-flow';
const installedSmokeCommand = 'CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc';

const requiredSmokeSurfaces: ReleaseSmokeSurfaceKind[] = [
  'plugin-load',
  'slash-command',
  'hook-non-blocking',
  'dependency-guidance',
  'runtime-bin',
  'isolated-workspace',
];

export function evaluatePluginSmokeGate(input: EvaluatePluginSmokeGateInput): ReleasePluginSmokeResult {
  const generatedAt = toIso(input.generatedAt);
  const blockers: ReleaseBlocker[] = [];
  const missingEvidence: ReleaseMissingEvidence[] = [];
  const verifiedSurfaces = buildVerifiedSurfaces(input);
  const checks: ReleaseCheckResult[] = [];

  checks.push(evaluateClaudeCliReadiness(input, blockers, missingEvidence));
  checks.push(commandCheck(
    'plugin-validation-evidence',
    input.commandEvidence.pluginValidation,
    pluginValidationCommand,
    'source-validation',
    blockers,
    missingEvidence,
  ));
  checks.push(commandCheck(
    'installed-smoke-evidence',
    input.commandEvidence.installedSmoke,
    installedSmokeCommand,
    'installed-smoke',
    blockers,
    missingEvidence,
  ));
  checks.push(evaluateSmokeSurfaces(input.smokeSurfaces, blockers, missingEvidence));
  checks.push(evaluateSmokeWorkspace(input, blockers));

  return {
    schemaVersion: 1,
    runId: input.runId,
    goalId: input.goalId,
    generatedAt,
    status: statusFor(input, blockers),
    checks,
    blockers: dedupeBlockers(blockers),
    missingEvidence,
    verifiedSurfaces,
    requiredCommands: [
      pluginValidationCommand,
      installedSmokeCommand,
    ],
  };
}

function evaluateClaudeCliReadiness(
  input: EvaluatePluginSmokeGateInput,
  blockers: ReleaseBlocker[],
  missingEvidence: ReleaseMissingEvidence[],
): ReleaseCheckResult {
  const evidenceRefs = ['ev-claude-cli-readiness'];
  const unsupported = input.claudeCli.status === 'unsupported'
    || input.claudeCli.supportsPluginDir === false
    || input.claudeCli.supportsPluginValidate === false;

  if (input.claudeCli.status === 'missing') {
    missingEvidence.push({
      id: 'claude-cli-missing',
      checkId: 'claude-cli-readiness',
      reason: `Claude CLI '${input.claudeCli.binary}' is required for plugin validation and installed smoke evidence.`,
      required: true,
    });
    blockers.push(blocker({
      checkId: 'claude-cli-readiness',
      reason: input.claudeCli.summary ?? `Claude CLI '${input.claudeCli.binary}' is missing.`,
      remediation: 'Install or configure Claude Code CLI, then rerun plugin validation and installed smoke.',
      riskLevel: 'high',
      evidenceRefs,
      failureKind: 'claude-cli',
    }));
    return {
      id: 'claude-cli-readiness',
      status: 'blocked',
      summary: input.claudeCli.summary ?? 'Claude CLI is missing.',
      required: true,
      evidenceRefs,
      remediation: 'Install or configure Claude Code CLI.',
      riskLevel: 'high',
    };
  }

  if (unsupported) {
    blockers.push(blocker({
      checkId: 'claude-cli-readiness',
      reason: input.claudeCli.summary ?? 'Claude CLI does not support required plugin validation or --plugin-dir smoke capabilities.',
      remediation: 'Update Claude Code CLI or collect explicit manual confirmation evidence before release.',
      riskLevel: 'high',
      evidenceRefs,
      failureKind: 'claude-cli',
    }));
    return {
      id: 'claude-cli-readiness',
      status: 'manual-confirmation-required',
      summary: input.claudeCli.summary ?? 'Claude CLI capability support requires manual confirmation.',
      required: true,
      evidenceRefs,
      remediation: 'Update Claude Code CLI or collect explicit manual confirmation evidence.',
      riskLevel: 'high',
    };
  }

  return {
    id: 'claude-cli-readiness',
    status: 'passed',
    summary: input.claudeCli.summary ?? 'Claude CLI supports plugin validation and installed smoke.',
    required: true,
    evidenceRefs,
    remediation: 'Rerun plugin validation and installed smoke if the Claude CLI version changes.',
    riskLevel: 'medium',
  };
}

function commandCheck(
  id: string,
  evidence: ReleaseCommandEvidence | undefined,
  command: string,
  failureKind: ReleaseSmokeFailureKind,
  blockers: ReleaseBlocker[],
  missingEvidence: ReleaseMissingEvidence[],
): ReleaseCheckResult {
  const evidenceRefs = evidence?.evidenceRefs ?? [];
  const status = evidence?.status ?? 'missing';

  if (status === 'missing') {
    missingEvidence.push({
      id: `${id}-missing`,
      checkId: id,
      reason: `Missing required command evidence for '${command}'.`,
      required: true,
    });
  }

  if (status !== 'passed') {
    blockers.push(blocker({
      checkId: id,
      reason: status === 'missing'
        ? `Required plugin release evidence '${command}' was not provided.`
        : `Required plugin release evidence '${command}' failed: ${evidence?.summary ?? 'no summary'}.`,
      remediation: `Run ${command} and rerun release dry-run.`,
      riskLevel: 'high',
      evidenceRefs,
      failureKind,
    }));
  }

  return {
    id,
    status: status === 'passed' ? 'passed' : status === 'failed' ? 'failed' : 'missing',
    summary: evidence?.summary ?? `Required command evidence for ${command}.`,
    required: true,
    evidenceRefs,
    remediation: `Run ${command}.`,
    riskLevel: status === 'passed' ? 'medium' : 'high',
  };
}

function evaluateSmokeSurfaces(
  surfaces: ReleaseSmokeSurfaceEvidence[],
  blockers: ReleaseBlocker[],
  missingEvidence: ReleaseMissingEvidence[],
): ReleaseCheckResult {
  const byKind = new Map(surfaces.map((surface) => [surface.kind, surface]));
  const evidenceRefs = uniqueRefs(surfaces.flatMap((surface) => surface.evidenceRefs ?? []));
  let failed = false;
  let missing = false;

  for (const kind of requiredSmokeSurfaces) {
    const surface = byKind.get(kind);
    if (surface === undefined) {
      missing = true;
      missingEvidence.push({
        id: `installed-smoke-${kind}-missing`,
        checkId: 'installed-smoke-surfaces',
        reason: `Installed smoke did not provide required '${kind}' surface evidence.`,
        required: true,
      });
      blockers.push(blocker({
        checkId: 'installed-smoke-surfaces',
        reason: `Installed smoke is missing required '${kind}' evidence.`,
        remediation: `Extend ${installedSmokeCommand} evidence to cover '${kind}'.`,
        riskLevel: 'high',
        evidenceRefs,
        failureKind: failureKindForSmokeSurface(kind),
      }));
      continue;
    }

    if (surface.status !== 'passed') {
      failed = true;
      blockers.push(blocker({
        checkId: 'installed-smoke-surfaces',
        reason: `Installed smoke surface '${kind}' failed: ${surface.summary}`,
        remediation: remediationForSmokeSurface(kind),
        riskLevel: 'high',
        evidenceRefs: surface.evidenceRefs ?? [],
        failureKind: failureKindForSmokeSurface(kind),
      }));
    }
  }

  return {
    id: 'installed-smoke-surfaces',
    status: failed ? 'failed' : missing ? 'missing' : 'passed',
    summary: failed || missing
      ? 'Installed plugin smoke did not verify every required runtime surface.'
      : 'Installed plugin smoke verified plugin load, slash command, hooks, dependency guidance, runtime bin, and workspace isolation.',
    required: true,
    evidenceRefs,
    remediation: `Run ${installedSmokeCommand} in an isolated temp workspace and capture all required smoke surfaces.`,
    riskLevel: failed || missing ? 'high' : 'medium',
  };
}

function evaluateSmokeWorkspace(
  input: EvaluatePluginSmokeGateInput,
  blockers: ReleaseBlocker[],
): ReleaseCheckResult {
  const evidenceRefs = ['ev-smoke-workspace-isolation'];
  const failed = input.smokeWorkspace.isolated !== true || input.smokeWorkspace.repoMutationDetected === true;
  if (failed) {
    blockers.push(blocker({
      checkId: 'smoke-workspace-isolation',
      reason: input.smokeWorkspace.summary ?? `Installed smoke workspace '${input.smokeWorkspace.cwd}' is not isolated from the repo.`,
      remediation: 'Run installed smoke from a mkdtemp workspace and verify no repo-root specs/state mutations occur.',
      riskLevel: 'high',
      evidenceRefs,
      failureKind: 'workspace-isolation',
    }));
  }

  return {
    id: 'smoke-workspace-isolation',
    status: failed ? 'failed' : 'passed',
    summary: input.smokeWorkspace.summary ?? 'Installed smoke workspace isolation evidence was provided.',
    required: true,
    evidenceRefs,
    remediation: 'Use an isolated temp workspace for installed smoke.',
    riskLevel: failed ? 'high' : 'medium',
  };
}

function buildVerifiedSurfaces(input: EvaluatePluginSmokeGateInput): ReleaseVerifiedSurface[] {
  return [
    ...input.changedSurfaces.map((surface) => ({
      id: surface.id,
      kind: surface.kind,
      path: surface.path,
      summary: surface.summary,
      evidenceRef: 'ev-plugin-surface-change',
    })),
    ...input.smokeSurfaces.map((surface) => ({
      id: surface.id,
      kind: 'smoke-surface' as const,
      path: 'scripts/claudecc-smoke.mjs',
      summary: surface.summary,
      evidenceRef: surface.evidenceRefs?.[0] ?? 'ev-installed-smoke',
    })),
    {
      id: 'claude-cli',
      kind: 'claude-cli' as const,
      path: input.claudeCli.binary,
      summary: input.claudeCli.summary ?? input.claudeCli.version ?? input.claudeCli.status,
      evidenceRef: 'ev-claude-cli-readiness',
    },
  ];
}

function statusFor(input: EvaluatePluginSmokeGateInput, blockers: ReleaseBlocker[]): ReleasePluginSmokeStatus {
  if (input.claudeCli.status === 'missing') return 'blocked';
  if (
    input.claudeCli.status === 'unsupported'
    || input.claudeCli.supportsPluginDir === false
    || input.claudeCli.supportsPluginValidate === false
  ) {
    return 'manual-confirmation-required';
  }
  return blockers.length === 0 ? 'passed' : 'failed';
}

function failureKindForSmokeSurface(kind: ReleaseSmokeSurfaceKind): ReleaseSmokeFailureKind {
  if (kind === 'dependency-guidance') return 'dependency-resolution';
  if (kind === 'hook-non-blocking') return 'hook';
  if (kind === 'runtime-bin' || kind === 'slash-command') return 'runtime-command';
  if (kind === 'isolated-workspace') return 'workspace-isolation';
  return 'installed-smoke';
}

function remediationForSmokeSurface(kind: ReleaseSmokeSurfaceKind): string {
  if (kind === 'dependency-guidance') {
    return 'Ensure installed smoke asserts actionable plugin dependency and external MCP degradation guidance.';
  }
  if (kind === 'hook-non-blocking') {
    return 'Fix hook behavior so plugin slash-command smoke can run without blocking Claude Code.';
  }
  if (kind === 'runtime-bin' || kind === 'slash-command') {
    return 'Fix plugin command loading or plugin-local runtime bin behavior, then rerun installed smoke.';
  }
  if (kind === 'isolated-workspace') {
    return 'Run installed smoke in a temp workspace and verify no repo-root state/spec writes.';
  }
  return `Fix installed smoke '${kind}' coverage and rerun ${installedSmokeCommand}.`;
}

function blocker(input: {
  checkId: string;
  reason: string;
  remediation: string;
  riskLevel: ReleaseBlocker['riskLevel'];
  evidenceRefs: string[];
  failureKind: ReleaseSmokeFailureKind;
}): ReleaseBlocker {
  return {
    checkId: input.checkId,
    reason: input.reason,
    remediation: input.remediation,
    requiresDryRunRerun: true,
    riskLevel: input.riskLevel,
    evidenceRefs: input.evidenceRefs,
    failureKind: input.failureKind,
  };
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
  return [...new Set(refs.filter((ref) => ref.length > 0))];
}

function toIso(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}
