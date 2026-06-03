import { CURDX_EXTERNAL_MCPS, CURDX_PLUGIN_DEPENDENCIES } from './catalog.ts';
import type {
  CapabilityCategory,
  CapabilityCheckMode,
  CapabilityMatrix,
  CapabilityNextAction,
  CapabilityProvider,
  CapabilityProvisioning,
  CapabilityState,
  CapabilityStatus,
  CapabilityTriState,
  CapabilityValidationResult,
  CommandProbeResult,
} from './types.ts';
import type {
  ExternalMcpReadinessFact,
  PluginDependencyReadinessFact,
} from './readiness.ts';
import type { NativeGoalReadiness } from './goal-readiness.ts';
import { buildNativeGoalReadiness } from './goal-readiness.ts';

interface PluginDependencyFact extends Partial<PluginDependencyReadinessFact> {
  name?: string;
  type?: 'plugin';
  declared?: boolean;
  marketplaceMatches?: boolean;
  crossMarketplaceAllowlisted?: boolean;
}

type ExternalMcpFact = Omit<Partial<ExternalMcpReadinessFact>, 'configured'> & {
  id?: string;
  type?: 'mcp';
  configured?: boolean | 'unknown' | 'skipped' | null;
  installed?: boolean | 'unknown' | 'skipped';
  callable?: boolean | 'unknown' | 'skipped';
  authorized?: boolean | 'unknown' | 'skipped';
  status?: string;
  fallback?: string;
  installHint?: string;
};

interface BrowserVerificationFact {
  playwright?: {
    ready?: boolean;
    dependency?: boolean;
    recommendedCommand?: string | null;
  };
  chromeDevtoolsMcp?: {
    ready?: boolean;
    dependencyDeclared?: boolean;
    chromeInstalled?: boolean;
  };
}

type CapabilityStatusInput = {
  id: string;
  label: string;
  category: CapabilityCategory;
  provider: CapabilityProvider;
  provisioning: CapabilityProvisioning;
  checkMode: CapabilityCheckMode;
  state: CapabilityState;
  configured: CapabilityTriState;
  installed: CapabilityTriState;
  callable: CapabilityTriState;
  authorized: CapabilityTriState;
  reason: string;
  skippedReason?: string;
  evidenceImpact: string[];
  blocksCompletion: boolean;
  blocksRelease: boolean;
  remediation: string | null;
  durationMs: number;
};

export interface BuildCapabilityMatrixInput {
  cwd: string;
  generatedAt?: string;
  mode?: 'fast' | 'deep';
  packageManager?: string | null;
  claudeProbe?: CommandProbeResult;
  npmProbe?: CommandProbeResult;
  pluginValidationProbe?: CommandProbeResult;
  plugin?: {
    ready?: boolean;
    dependencies?: {
      dependencies?: PluginDependencyFact[];
    };
  };
  externalMcp?: {
    ready?: boolean;
    servers?: ExternalMcpFact[];
  };
  nativeGoal?: NativeGoalReadiness;
  browserVerification?: BrowserVerificationFact;
  hookFreshness?: {
    sourceAvailable?: boolean;
    fresh?: boolean;
    checkCommand?: string;
  };
  release?: {
    ready?: boolean | null;
  };
}

const categories: ReadonlySet<CapabilityCategory> = new Set([
  'core',
  'package-manager',
  'browser',
  'plugin-dependency',
  'external-mcp',
  'hook',
  'plugin-validation',
  'release',
]);
const providers: ReadonlySet<CapabilityProvider> = new Set([
  'curdx-flow',
  'claude-code',
  'node',
  'npm',
  'playwright',
  'chrome',
  'mcp',
  'plugin',
]);
const provisioningValues: ReadonlySet<CapabilityProvisioning> = new Set([
  'core',
  'local-command',
  'plugin-dependency',
  'external-mcp',
  'project-script',
  'workflow',
]);
const modes: ReadonlySet<CapabilityCheckMode> = new Set(['fast', 'deep', 'skipped']);
const states: ReadonlySet<CapabilityState> = new Set(['available', 'degraded', 'unavailable', 'skipped', 'unknown']);
const priorities: ReadonlySet<CapabilityNextAction['priority']> = new Set(['high', 'medium', 'low']);

function tri(value: unknown): CapabilityTriState {
  if (typeof value === 'boolean') return value;
  if (value === 'skipped') return 'skipped';
  return 'unknown';
}

function status(input: CapabilityStatusInput): CapabilityStatus {
  return {
    schemaVersion: 1,
    ...input,
    degraded: input.state === 'degraded',
    unavailable: input.state === 'unavailable',
  };
}

function probeStatus(input: {
  id: string;
  label: string;
  provider: CapabilityProvider;
  category: CapabilityCategory;
  provisioning: CapabilityProvisioning;
  probe?: CommandProbeResult;
  command: string;
  checkMode?: CapabilityCheckMode;
  evidenceImpact: string[];
  blocksCompletion?: boolean;
  blocksRelease?: boolean;
  remediation: string;
}): CapabilityStatus {
  const probe = input.probe;
  const checkMode = input.checkMode ?? 'fast';
  if (!probe) {
    return status({
      id: input.id,
      label: input.label,
      category: input.category,
      provider: input.provider,
      provisioning: input.provisioning,
      checkMode: 'skipped',
      state: 'skipped',
      configured: 'unknown',
      installed: 'unknown',
      callable: 'skipped',
      authorized: 'unknown',
      reason: `${input.command} was not probed in this doctor run.`,
      skippedReason: `${input.command} was not probed in this doctor run.`,
      evidenceImpact: input.evidenceImpact,
      blocksCompletion: input.blocksCompletion ?? false,
      blocksRelease: input.blocksRelease ?? false,
      remediation: input.remediation,
      durationMs: 0,
    });
  }

  if (probe.exitCode === 0 && !probe.error && !probe.timedOut) {
    return status({
      id: input.id,
      label: input.label,
      category: input.category,
      provider: input.provider,
      provisioning: input.provisioning,
      checkMode,
      state: 'available',
      configured: true,
      installed: true,
      callable: true,
      authorized: 'unknown',
      reason: `${input.command} is callable.`,
      evidenceImpact: input.evidenceImpact,
      blocksCompletion: false,
      blocksRelease: false,
      remediation: null,
      durationMs: probe.durationMs,
    });
  }

  const unavailable = probe.exitCode === null || Boolean(probe.error);
  return status({
    id: input.id,
    label: input.label,
    category: input.category,
    provider: input.provider,
    provisioning: input.provisioning,
    checkMode,
    state: unavailable ? 'unavailable' : 'degraded',
    configured: 'unknown',
    installed: unavailable ? false : true,
    callable: false,
    authorized: 'unknown',
    reason: probe.error || probe.stderr.trim() || `${input.command} exited ${probe.exitCode}`,
    evidenceImpact: input.evidenceImpact,
    blocksCompletion: input.blocksCompletion ?? unavailable,
    blocksRelease: input.blocksRelease ?? true,
    remediation: input.remediation,
    durationMs: probe.durationMs,
  });
}

function pluginValidationStatus(input: BuildCapabilityMatrixInput): CapabilityStatus {
  if (input.mode === 'deep') {
    return probeStatus({
      id: 'plugin-validation',
      label: 'Claude plugin validation',
      category: 'plugin-validation',
      provider: 'claude-code',
      provisioning: 'workflow',
      probe: input.pluginValidationProbe,
      command: 'claude plugin validate',
      checkMode: 'deep',
      evidenceImpact: ['plugin release evidence'],
      blocksCompletion: false,
      blocksRelease: true,
      remediation: 'claude plugin validate ./plugins/curdx-flow',
    });
  }

  return status({
    id: 'plugin-validation',
    label: 'Claude plugin validation',
    category: 'plugin-validation',
    provider: 'claude-code',
    provisioning: 'workflow',
    checkMode: 'skipped',
    state: 'skipped',
    configured: true,
    installed: 'unknown',
    callable: 'skipped',
    authorized: 'unknown',
    reason: 'Fast doctor does not run claude plugin validate; this is a deep release check.',
    skippedReason: 'Fast doctor does not run claude plugin validate; this is a deep release check.',
    evidenceImpact: ['plugin release evidence'],
    blocksCompletion: false,
    blocksRelease: true,
    remediation: 'claude plugin validate ./plugins/curdx-flow',
    durationMs: 0,
  });
}

function pluginDependencyStatus(
  id: string,
  label: string,
  fact: PluginDependencyFact | undefined,
): CapabilityStatus {
  const configured = fact?.declared === true && fact.marketplaceMatches !== false && fact.crossMarketplaceAllowlisted !== false;
  const readiness = fact?.readiness;
  const installed = tri(fact?.installed);
  const callable = tri(fact?.callable);
  const authorized = tri(fact?.authorized ?? (configured ? true : false));
  const blocksCompletion = typeof fact?.blocksCompletion === 'boolean'
    ? fact.blocksCompletion
    : id === 'chrome-devtools-mcp';
  const blocksRelease = typeof fact?.blocksRelease === 'boolean' ? fact.blocksRelease : true;
  if (!configured) {
    const notConfiguredInstalled = fact?.installed === undefined ? false : installed;
    return status({
      id,
      label,
      category: 'plugin-dependency',
      provider: 'plugin',
      provisioning: 'plugin-dependency',
      checkMode: 'fast',
      state: 'unavailable',
      configured: false,
      installed: notConfiguredInstalled,
      callable: fact?.callable === undefined ? 'unknown' : callable,
      authorized,
      reason: fact?.reason ?? `${label} is not declared or trusted as a curdx-flow plugin dependency.`,
      evidenceImpact: capabilityImpact(id),
      blocksCompletion,
      blocksRelease,
      remediation: fact?.remediation ?? `Install/enable ${label} from its configured Claude Code marketplace dependency.`,
      durationMs: 0,
    });
  }

  const state: CapabilityState = readiness === 'available'
    ? 'available'
    : readiness === 'degraded'
      ? 'degraded'
      : readiness === 'unavailable'
        ? 'unavailable'
        : callable === false
          ? 'degraded'
          : installed === false
            ? 'unavailable'
            : 'unknown';
  return status({
    id,
    label,
    category: 'plugin-dependency',
    provider: 'plugin',
    provisioning: 'plugin-dependency',
    checkMode: 'fast',
    state,
    configured: true,
    installed,
    callable,
    authorized,
    reason: fact?.reason ?? (
      callable === false
        ? `${label} is configured but not callable.`
        : `${label} is configured; installed/callable status needs dependency readiness check.`
    ),
    evidenceImpact: capabilityImpact(id),
    blocksCompletion,
    blocksRelease,
    remediation: state === 'available'
      ? null
      : fact?.remediation || (
          callable === false
            ? `Run Claude Code plugin diagnostics for ${label} and fix the callability error.`
            : `Run dependency readiness doctor for ${label}.`
        ),
    durationMs: 0,
  });
}

function externalMcpStatus(id: string, fact: ExternalMcpFact | undefined): CapabilityStatus {
  const configured = tri(fact?.configured === null ? undefined : fact?.configured);
  const installed = tri(fact?.installed);
  const callable = tri(fact?.callable);
  const statusValue = fact?.status;
  if (configured !== true) {
    const unknown = configured === 'unknown';
    return status({
      id,
      label: id,
      category: 'external-mcp',
      provider: 'mcp',
      provisioning: 'external-mcp',
      checkMode: 'fast',
      state: unknown ? 'unknown' : 'unavailable',
      configured,
      installed: unknown ? 'unknown' : false,
      callable: unknown ? 'unknown' : false,
      authorized: 'unknown',
      reason: unknown
        ? `${id} readiness is unknown because claude mcp list could not be confirmed.`
        : `${id} is not configured in Claude MCP list output.`,
      evidenceImpact: capabilityImpact(id),
      blocksCompletion: id === 'context7',
      blocksRelease: false,
      remediation: fact?.fallback || fact?.installHint || `Configure the external ${id} MCP server; curdx-flow must not bundle it as a plugin dependency.`,
      durationMs: 0,
    });
  }
  const state: CapabilityState = callable === true || statusValue === 'connected'
    ? 'available'
    : callable === false || statusValue === 'error'
      ? 'degraded'
      : 'unknown';
  return status({
    id,
    label: id,
    category: 'external-mcp',
    provider: 'mcp',
    provisioning: 'external-mcp',
    checkMode: 'fast',
    state,
    configured: true,
    installed,
    callable,
    authorized: tri(fact?.authorized),
    reason: state === 'available'
      ? `${id} is configured and connected as an external MCP.`
      : state === 'degraded'
        ? `${id} is configured but not callable from claude mcp list output.`
        : `${id} is configured; deep callability can be verified when the route requires it.`,
    evidenceImpact: capabilityImpact(id),
    blocksCompletion: id === 'context7' && state !== 'available',
    blocksRelease: false,
    remediation: state === 'available' ? null : fact?.fallback || fact?.installHint || `Verify the external ${id} MCP server.`,
    durationMs: 0,
  });
}

function capabilityImpact(id: string): string[] {
  switch (id) {
    case 'context7':
      return ['current documentation evidence'];
    case 'sequential-thinking':
      return ['high-risk reasoning evidence'];
    case 'chrome-devtools-mcp':
      return ['browser evidence', 'console/network evidence'];
    case 'ui-ux-pro-max':
      return ['UI/UX review evidence'];
    case 'claude-mem':
      return ['cross-session memory evidence'];
    case 'pua':
      return ['repeated-failure recovery evidence'];
    default:
      return ['capability evidence'];
  }
}

function browserStatuses(input: BrowserVerificationFact | undefined): CapabilityStatus[] {
  const playwright = input?.playwright;
  const chrome = input?.chromeDevtoolsMcp;
  const out: CapabilityStatus[] = [];
  out.push(status({
    id: 'playwright',
    label: 'Playwright',
    category: 'browser',
    provider: 'playwright',
    provisioning: 'project-script',
    checkMode: playwright?.ready === true ? 'skipped' : 'fast',
    state: playwright?.ready === true ? 'skipped' : 'unavailable',
    configured: playwright?.ready === true,
    installed: playwright?.dependency === true ? true : 'unknown',
    callable: 'skipped',
    authorized: 'unknown',
    reason: playwright?.ready === true
      ? `Playwright verifier candidate found${playwright.recommendedCommand ? `: ${playwright.recommendedCommand}` : ''}. Deep run skipped.`
      : 'No Playwright/browser verifier candidate found.',
    ...(playwright?.ready === true
      ? { skippedReason: 'Fast doctor does not run Playwright/browser verification.' }
      : {}),
    evidenceImpact: ['browser evidence', 'UI journey evidence'],
    blocksCompletion: playwright?.ready !== true,
    blocksRelease: false,
    remediation: playwright?.ready === true ? null : 'Add a Playwright/browser verification script or document a blocker.',
    durationMs: 0,
  }));

  if (chrome) {
    const ready = chrome.ready === true;
    const dependencyDeclared = chrome.dependencyDeclared === true;
    const chromeInstalled = chrome.chromeInstalled === true;
    out.push(status({
      id: 'chrome-runtime',
      label: 'Chrome runtime for Chrome DevTools MCP',
      category: 'browser',
      provider: 'chrome',
      provisioning: 'local-command',
      checkMode: 'fast',
      state: ready ? 'available' : dependencyDeclared && !chromeInstalled ? 'degraded' : 'unavailable',
      configured: dependencyDeclared,
      installed: chromeInstalled,
      callable: ready ? 'unknown' : false,
      authorized: 'unknown',
      reason: ready
        ? 'Chrome DevTools MCP dependency is declared and Chrome is installed.'
        : dependencyDeclared
          ? 'Chrome DevTools MCP is declared but Chrome is not installed or not discoverable.'
          : 'Chrome DevTools MCP is not declared.',
      evidenceImpact: capabilityImpact('chrome-devtools-mcp'),
      blocksCompletion: false,
      blocksRelease: false,
      remediation: ready ? null : 'Install Chrome and enable chrome-devtools-mcp before relying on browser runtime evidence.',
      durationMs: 0,
    }));
  }
  return out;
}

function hookFreshnessStatus(input: BuildCapabilityMatrixInput['hookFreshness']): CapabilityStatus {
  if (input?.sourceAvailable !== true) {
    return status({
      id: 'hook-freshness',
      label: 'Hook bundle freshness',
      category: 'hook',
      provider: 'curdx-flow',
      provisioning: 'workflow',
      checkMode: 'skipped',
      state: 'skipped',
      configured: 'skipped',
      installed: 'skipped',
      callable: 'skipped',
      authorized: 'skipped',
      reason: 'Hook source is not available in this installed runtime; freshness is a source checkout check.',
      evidenceImpact: ['plugin release evidence'],
      blocksCompletion: false,
      blocksRelease: false,
      remediation: null,
      durationMs: 0,
    });
  }
  const fresh = input.fresh === true;
  return status({
    id: 'hook-freshness',
    label: 'Hook bundle freshness',
    category: 'hook',
    provider: 'curdx-flow',
    provisioning: 'workflow',
    checkMode: 'fast',
    state: fresh ? 'available' : 'unavailable',
    configured: true,
    installed: true,
    callable: fresh,
    authorized: 'skipped',
    reason: fresh ? 'Generated hook bundles are fresh.' : 'Generated hook bundles are stale.',
    evidenceImpact: ['plugin release evidence', 'hook protocol evidence'],
    blocksCompletion: false,
    blocksRelease: !fresh,
    remediation: fresh ? null : input.checkCommand ?? 'npm run check:hooks-fresh',
    durationMs: 0,
  });
}

function nativeGoalStatus(input: NativeGoalReadiness | undefined): CapabilityStatus {
  const readiness = input ?? buildNativeGoalReadiness();
  const state: CapabilityState = readiness.state === 'available'
    ? 'available'
    : readiness.state === 'unknown'
      ? 'unknown'
      : 'unavailable';
  const detected = readiness.detectedVersion !== null;
  return {
    ...status({
      id: 'native-goal',
      label: 'Native /goal',
      category: 'core',
      provider: 'claude-code',
      provisioning: 'workflow',
      checkMode: 'fast',
      state,
      configured: readiness.blockers.length > 0 ? false : detected ? true : 'unknown',
      installed: detected ? true : readiness.state === 'unavailable' ? false : 'unknown',
      callable: readiness.state === 'available'
        ? true
        : readiness.state === 'unknown'
          ? 'unknown'
          : false,
      authorized: readiness.state === 'available'
        ? true
        : readiness.blockers.length > 0
          ? false
          : 'unknown',
      reason: readiness.reason,
      evidenceImpact: ['long-task execution evidence', 'transcript-visible completion evidence'],
      blocksCompletion: readiness.state !== 'available',
      blocksRelease: false,
      remediation: readiness.fallbackAction,
      durationMs: 0,
    }),
    supported: readiness.supported,
    requiredVersion: readiness.requiredVersion,
    detectedVersion: readiness.detectedVersion,
    goalState: readiness.state,
    blockers: readiness.blockers,
    fallbackAction: readiness.fallbackAction,
    recommendedDriver: readiness.recommendedDriver,
    conditionLength: readiness.conditionLength,
    warnings: readiness.warnings,
  };
}

function staticStatuses(input: BuildCapabilityMatrixInput): CapabilityStatus[] {
  const packageManager = input.packageManager;
  return [
    status({
      id: 'node',
      label: 'Node.js',
      category: 'core',
      provider: 'node',
      provisioning: 'local-command',
      checkMode: 'fast',
      state: 'available',
      configured: true,
      installed: true,
      callable: true,
      authorized: 'skipped',
      reason: `Current runtime is ${process.version}.`,
      evidenceImpact: ['command evidence', 'plugin runtime evidence'],
      blocksCompletion: false,
      blocksRelease: false,
      remediation: null,
      durationMs: 0,
    }),
    status({
      id: 'package-manager',
      label: 'Package manager',
      category: 'package-manager',
      provider: 'npm',
      provisioning: 'local-command',
      checkMode: 'fast',
      state: packageManager ? 'available' : 'unavailable',
      configured: packageManager ? true : false,
      installed: packageManager ? 'unknown' : false,
      callable: 'unknown',
      authorized: 'skipped',
      reason: packageManager ? `Detected package manager: ${packageManager}.` : 'No package manager marker found.',
      evidenceImpact: ['command evidence', 'verification command evidence'],
      blocksCompletion: packageManager === null,
      blocksRelease: false,
      remediation: packageManager ? null : 'Add package.json/lockfile or document the project verifier command.',
      durationMs: 0,
    }),
    nativeGoalStatus(input.nativeGoal),
    pluginValidationStatus(input),
    status({
      id: 'release-readiness',
      label: 'Release readiness',
      category: 'release',
      provider: 'curdx-flow',
      provisioning: 'workflow',
      checkMode: 'fast',
      state: input.release?.ready === false ? 'degraded' : input.release?.ready === true ? 'available' : 'unknown',
      configured: true,
      installed: 'skipped',
      callable: input.release?.ready === false ? false : 'unknown',
      authorized: 'unknown',
      reason: input.release?.ready === false
        ? 'Release readiness has one or more unresolved checks.'
        : 'Release readiness did not report a blocking failure.',
      evidenceImpact: ['release evidence'],
      blocksCompletion: false,
      blocksRelease: input.release?.ready === false,
      remediation: input.release?.ready === false ? 'Run release readiness checks before tag/publish.' : null,
      durationMs: 0,
    }),
  ];
}

function sortCapabilities(capabilities: CapabilityStatus[]): CapabilityStatus[] {
  return [...capabilities].sort((a, b) => a.id.localeCompare(b.id));
}

export function buildCapabilityMatrix(input: BuildCapabilityMatrixInput): CapabilityMatrix {
  const pluginDeps = input.plugin?.dependencies?.dependencies ?? [];
  const externalServers = input.externalMcp?.servers ?? [];
  const capabilities = [
    ...staticStatuses(input),
    probeStatus({
      id: 'claude-code',
      label: 'Claude Code CLI',
      provider: 'claude-code',
      category: 'core',
      provisioning: 'local-command',
      probe: input.claudeProbe,
      command: 'claude --version',
      evidenceImpact: ['plugin validation evidence', 'MCP/plugin command evidence', 'native /goal evidence'],
      blocksCompletion: true,
      blocksRelease: true,
      remediation: 'Install or update Claude Code and ensure the claude command is callable.',
    }),
    probeStatus({
      id: 'npm',
      label: 'npm',
      provider: 'npm',
      category: 'package-manager',
      provisioning: 'local-command',
      probe: input.npmProbe,
      command: 'npm --version',
      evidenceImpact: ['package verification evidence', 'release evidence'],
      blocksCompletion: false,
      blocksRelease: true,
      remediation: 'Install npm or configure the project package manager verifier.',
    }),
    ...CURDX_PLUGIN_DEPENDENCIES
      .map((dependency) =>
        pluginDependencyStatus(
          dependency.id,
          dependency.name,
          pluginDeps.find((fact) => fact.name === dependency.name),
        ),
      ),
    ...CURDX_EXTERNAL_MCPS.map((mcp) =>
      externalMcpStatus(
        mcp.id,
        externalServers.find((server) => server.id === mcp.id),
      ),
    ),
    ...browserStatuses(input.browserVerification),
    hookFreshnessStatus(input.hookFreshness),
  ];

  const deduped = new Map<string, CapabilityStatus>();
  for (const capability of capabilities) deduped.set(capability.id, capability);
  const sorted = sortCapabilities([...deduped.values()]);
  const blockers = sorted.filter((capability) =>
    (capability.state === 'unavailable' || capability.state === 'degraded') &&
      (capability.blocksCompletion || capability.blocksRelease),
  );
  const degraded = sorted.filter((capability) => capability.state === 'degraded');
  const nextActions: CapabilityNextAction[] = sorted
    .filter((capability) => capability.remediation && capability.state !== 'available')
    .map((capability) => ({
      capabilityId: capability.id,
      action: capability.remediation as string,
      priority: capability.blocksRelease || capability.blocksCompletion ? 'high' : capability.state === 'degraded' ? 'medium' : 'low',
    }));

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    cwd: input.cwd,
    mode: input.mode ?? 'fast',
    summary: {
      blockers: blockers.length,
      degraded: degraded.length,
      unavailable: sorted.filter((capability) => capability.state === 'unavailable').length,
      skippedDeepChecks: sorted.filter((capability) => capability.checkMode === 'skipped').length,
    },
    capabilities: sorted,
    blockers,
    degraded,
    nextActions,
  };
}

function isTriState(value: unknown): boolean {
  return typeof value === 'boolean' || value === 'unknown' || value === 'skipped';
}

function requireString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function validateCapabilityMatrix(value: unknown): CapabilityValidationResult {
  const issues: Array<{ path: string; message: string }> = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, issues: [{ path: '$', message: 'matrix must be an object' }] };
  }
  const matrix = value as Partial<CapabilityMatrix>;
  if (matrix.schemaVersion !== 1) issues.push({ path: '$.schemaVersion', message: 'schemaVersion must be 1' });
  if (!requireString(matrix.generatedAt)) issues.push({ path: '$.generatedAt', message: 'generatedAt is required' });
  if (!requireString(matrix.cwd)) issues.push({ path: '$.cwd', message: 'cwd is required' });
  if (matrix.mode !== 'fast' && matrix.mode !== 'deep') issues.push({ path: '$.mode', message: 'mode must be fast or deep' });
  if (!isRecord(matrix.summary)) {
    issues.push({ path: '$.summary', message: 'summary must be an object' });
  } else {
    for (const key of ['blockers', 'degraded', 'unavailable', 'skippedDeepChecks'] as const) {
      if (!isNonNegativeNumber(matrix.summary[key])) {
        issues.push({ path: `$.summary.${key}`, message: 'summary value must be a non-negative number' });
      }
    }
  }
  if (!Array.isArray(matrix.capabilities)) issues.push({ path: '$.capabilities', message: 'capabilities must be an array' });
  if (!Array.isArray(matrix.blockers)) issues.push({ path: '$.blockers', message: 'blockers must be an array' });
  if (!Array.isArray(matrix.degraded)) issues.push({ path: '$.degraded', message: 'degraded must be an array' });
  if (!Array.isArray(matrix.nextActions)) issues.push({ path: '$.nextActions', message: 'nextActions must be an array' });
  for (const [idx, capability] of (matrix.capabilities ?? []).entries()) {
    const path = `$.capabilities[${idx}]`;
    if (capability.schemaVersion !== 1) issues.push({ path: `${path}.schemaVersion`, message: 'schemaVersion must be 1' });
    if (!requireString(capability.id)) issues.push({ path: `${path}.id`, message: 'id is required' });
    if (!requireString(capability.label)) issues.push({ path: `${path}.label`, message: 'label is required' });
    if (!categories.has(capability.category)) issues.push({ path: `${path}.category`, message: 'invalid category' });
    if (!providers.has(capability.provider)) issues.push({ path: `${path}.provider`, message: 'invalid provider' });
    if (!provisioningValues.has(capability.provisioning)) issues.push({ path: `${path}.provisioning`, message: 'invalid provisioning' });
    if (!modes.has(capability.checkMode)) issues.push({ path: `${path}.checkMode`, message: 'invalid checkMode' });
    if (!states.has(capability.state)) issues.push({ path: `${path}.state`, message: 'invalid state' });
    for (const key of ['configured', 'installed', 'callable', 'authorized'] as const) {
      if (!isTriState(capability[key])) issues.push({ path: `${path}.${key}`, message: 'invalid tri-state' });
    }
    if (typeof capability.degraded !== 'boolean') issues.push({ path: `${path}.degraded`, message: 'degraded must be boolean' });
    if (typeof capability.unavailable !== 'boolean') issues.push({ path: `${path}.unavailable`, message: 'unavailable must be boolean' });
    if (!requireString(capability.reason)) issues.push({ path: `${path}.reason`, message: 'reason is required' });
    if (!Array.isArray(capability.evidenceImpact)) issues.push({ path: `${path}.evidenceImpact`, message: 'evidenceImpact must be an array' });
    if (typeof capability.blocksCompletion !== 'boolean') issues.push({ path: `${path}.blocksCompletion`, message: 'blocksCompletion must be boolean' });
    if (typeof capability.blocksRelease !== 'boolean') issues.push({ path: `${path}.blocksRelease`, message: 'blocksRelease must be boolean' });
    if (capability.remediation !== null && typeof capability.remediation !== 'string') issues.push({ path: `${path}.remediation`, message: 'remediation must be string or null' });
    if (typeof capability.durationMs !== 'number' || capability.durationMs < 0) issues.push({ path: `${path}.durationMs`, message: 'durationMs must be non-negative number' });
  }
  for (const [idx, action] of (matrix.nextActions ?? []).entries()) {
    const path = `$.nextActions[${idx}]`;
    if (!requireString(action.capabilityId)) issues.push({ path: `${path}.capabilityId`, message: 'capabilityId is required' });
    if (!requireString(action.action)) issues.push({ path: `${path}.action`, message: 'action is required' });
    if (!priorities.has(action.priority)) issues.push({ path: `${path}.priority`, message: 'invalid priority' });
  }
  return issues.length === 0 ? { ok: true, value: matrix as CapabilityMatrix } : { ok: false, issues };
}
