import type {
  EvaluateHookFreshnessGateInput,
  ReleaseBlocker,
  ReleaseCheckResult,
  ReleaseCommandEvidence,
  ReleaseHookFreshnessResult,
  ReleaseMissingEvidence,
  ReleaseVerifiedSurface,
} from './types.ts';

const buildHooksCommand = 'npm run build:hooks';
const checkHooksFreshCommand = 'npm run check:hooks-fresh';
const testHooksCommand = 'npm run test:hooks';
const pluginValidateCommand = 'claude plugin validate ./plugins/curdx-flow';
const installedSmokeCommand = 'CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc';

export function evaluateHookFreshnessGate(input: EvaluateHookFreshnessGateInput): ReleaseHookFreshnessResult {
  const generatedAt = toIso(input.generatedAt);
  const blockers: ReleaseBlocker[] = [];
  const missingEvidence: ReleaseMissingEvidence[] = [];
  const verifiedSurfaces = buildVerifiedSurfaces(input);
  const checks: ReleaseCheckResult[] = [];

  checks.push(evaluateGeneratedFreshness(input, blockers));
  checks.push(evaluateEntrypointParity(input, blockers));
  checks.push(commandCheck('hook-build-evidence', input.commandEvidence.buildHooks, blockers, missingEvidence));
  checks.push(commandCheck('hook-freshness-evidence', input.commandEvidence.checkHooksFresh, blockers, missingEvidence));

  if (input.changes.hookBehaviorChanged) {
    checks.push(commandCheck('hook-protocol-tests', input.commandEvidence.testHooks, blockers, missingEvidence));
  } else {
    checks.push(optionalCommandCheck('hook-protocol-tests', input.commandEvidence.testHooks));
  }

  checks.push(commandCheck('plugin-validation-evidence', input.commandEvidence.pluginValidation, blockers, missingEvidence, pluginValidateCommand));
  checks.push(commandCheck('installed-smoke-evidence', input.commandEvidence.installedSmoke, blockers, missingEvidence, installedSmokeCommand));

  return {
    schemaVersion: 1,
    runId: input.runId,
    goalId: input.goalId,
    generatedAt,
    status: blockers.length === 0 ? 'passed' : 'failed',
    checks,
    blockers: dedupeBlockers(blockers),
    missingEvidence,
    verifiedSurfaces,
    requiredCommands: [
      buildHooksCommand,
      checkHooksFreshCommand,
      testHooksCommand,
      pluginValidateCommand,
      installedSmokeCommand,
    ],
  };
}

function evaluateGeneratedFreshness(
  input: EvaluateHookFreshnessGateInput,
  blockers: ReleaseBlocker[],
): ReleaseCheckResult {
  const evidenceRefs = ['ev-release-hook-generated-freshness'];
  const hookRelevantChange = input.changes.hookSourceChanged || input.changes.buildScriptChanged || input.changes.hooksJsonChanged;
  const manualBundleEdit = input.changes.generatedBundlesChanged && !hookRelevantChange;

  if (manualBundleEdit) {
    blockers.push({
      checkId: 'hook-generated-freshness',
      reason: 'Generated hook bundle changed while hook source/build metadata did not change; this looks like a manual edit to plugins/curdx-flow/hooks/scripts/**.',
      remediation: 'Do not hand-edit generated hook bundles. Revert manual bundle edits or change src/hooks/** and rerun npm run build:hooks.',
      requiresDryRunRerun: true,
      riskLevel: 'high',
      evidenceRefs,
    });
  }

  if (hookRelevantChange && !input.generatedFresh) {
    blockers.push({
      checkId: 'hook-generated-freshness',
      reason: 'Hook source, build script, or hooks.json changed but generated hook bundles are not fresh.',
      remediation: 'Run npm run build:hooks and npm run check:hooks-fresh, then rerun release dry-run.',
      requiresDryRunRerun: true,
      riskLevel: 'high',
      evidenceRefs,
    });
  }

  const failed = blockers.some((blocker) => blocker.checkId === 'hook-generated-freshness');
  return {
    id: 'hook-generated-freshness',
    status: failed ? 'failed' : 'passed',
    summary: failed
      ? 'Hook generated artifact freshness failed.'
      : 'Hook generated artifacts are fresh for the reported hook surface state.',
    required: true,
    evidenceRefs,
    remediation: 'Run npm run build:hooks and npm run check:hooks-fresh.',
    riskLevel: failed ? 'high' : 'medium',
  };
}

function evaluateEntrypointParity(
  input: EvaluateHookFreshnessGateInput,
  blockers: ReleaseBlocker[],
): ReleaseCheckResult {
  const evidenceRefs = ['ev-release-hook-entrypoint-parity'];
  const generated = new Set(input.generatedScripts.map(normalizeGeneratedScriptPath));
  const buildOutputs = new Set(input.buildEntries.map(toGeneratedScriptPath));
  const hookTargets = new Set(input.hooksJsonTargets.map(normalizeGeneratedScriptPath));

  for (const output of buildOutputs) {
    if (!generated.has(output)) {
      blockers.push(entryBlocker(`Build entry output '${output}' is missing from generated hook scripts.`, evidenceRefs));
    }
  }

  for (const target of hookTargets) {
    if (!generated.has(target)) {
      blockers.push(entryBlocker(`hooks.json target '${target}' does not exist in generated hook scripts.`, evidenceRefs));
    }
    if (!buildOutputs.has(target)) {
      blockers.push(entryBlocker(`hooks.json target '${target}' is not produced by scripts/build-hooks.mjs hook entries.`, evidenceRefs));
    }
  }

  const failed = blockers.some((blocker) => blocker.checkId === 'hook-entrypoint-parity');
  return {
    id: 'hook-entrypoint-parity',
    status: failed ? 'failed' : 'passed',
    summary: failed
      ? 'Hook build entries, hooks.json targets, and generated scripts are not aligned.'
      : 'Hook build entries, hooks.json targets, and generated scripts are aligned.',
    required: true,
    evidenceRefs,
    remediation: 'Align scripts/build-hooks.mjs, plugins/curdx-flow/hooks/hooks.json, generated scripts, and smoke coverage.',
    riskLevel: failed ? 'high' : 'medium',
  };
}

function commandCheck(
  id: string,
  evidence: ReleaseCommandEvidence | undefined,
  blockers: ReleaseBlocker[],
  missingEvidence: ReleaseMissingEvidence[],
  defaultCommand?: string,
): ReleaseCheckResult {
  const command = evidence?.command ?? defaultCommand ?? commandFor(id);
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
    blockers.push({
      checkId: id,
      reason: status === 'missing'
        ? `Required hook release evidence '${command}' was not provided.`
        : `Required hook release evidence '${command}' failed: ${evidence?.summary ?? 'no summary'}.`,
      remediation: `Run ${command} and rerun release dry-run.`,
      requiresDryRunRerun: true,
      riskLevel: 'high',
      evidenceRefs,
    });
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

function optionalCommandCheck(id: string, evidence: ReleaseCommandEvidence): ReleaseCheckResult {
  return {
    id,
    status: evidence.status === 'passed' ? 'passed' : evidence.status === 'failed' ? 'failed' : 'skipped',
    summary: evidence.summary ?? `Optional command evidence for ${evidence.command}.`,
    required: false,
    evidenceRefs: evidence.evidenceRefs ?? [],
    remediation: `Run ${evidence.command} when hook protocol behavior changes.`,
    riskLevel: evidence.status === 'failed' ? 'high' : 'medium',
  };
}

function buildVerifiedSurfaces(input: EvaluateHookFreshnessGateInput): ReleaseVerifiedSurface[] {
  return [
    ...input.buildEntries.map((entry) => ({
      id: entry,
      kind: 'hook-build-entry' as const,
      path: 'scripts/build-hooks.mjs HOOK_ENTRIES',
      summary: entry,
      evidenceRef: 'ev-release-hook-entrypoint-parity',
    })),
    ...input.hooksJsonTargets.map((target) => ({
      id: target,
      kind: 'hook-config-target' as const,
      path: 'plugins/curdx-flow/hooks/hooks.json',
      summary: target,
      evidenceRef: 'ev-release-hook-entrypoint-parity',
    })),
    ...input.generatedScripts.map((script) => ({
      id: script,
      kind: 'generated-hook-script' as const,
      path: 'plugins/curdx-flow/hooks/scripts',
      summary: script,
      evidenceRef: 'ev-release-hook-entrypoint-parity',
    })),
  ];
}

function entryBlocker(reason: string, evidenceRefs: string[]): ReleaseBlocker {
  return {
    checkId: 'hook-entrypoint-parity',
    reason,
    remediation: 'Regenerate hook bundles and align hooks.json with scripts/build-hooks.mjs entries.',
    requiresDryRunRerun: true,
    riskLevel: 'high',
    evidenceRefs,
  };
}

function commandFor(id: string): string {
  if (id === 'hook-build-evidence') return buildHooksCommand;
  if (id === 'hook-freshness-evidence') return checkHooksFreshCommand;
  if (id === 'hook-protocol-tests') return testHooksCommand;
  if (id === 'plugin-validation-evidence') return pluginValidateCommand;
  if (id === 'installed-smoke-evidence') return installedSmokeCommand;
  return id;
}

function toGeneratedScriptPath(entry: string): string {
  const file = entry.split('/').at(-1) ?? entry;
  return `hooks/scripts/${file.replace(/\.ts$/, '.mjs')}`;
}

function normalizeGeneratedScriptPath(value: string): string {
  const withoutRoot = value.replace(/^\$\{CLAUDE_PLUGIN_ROOT\}\//, '');
  const index = withoutRoot.indexOf('hooks/scripts/');
  return index === -1 ? withoutRoot : withoutRoot.slice(index);
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

function toIso(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}
