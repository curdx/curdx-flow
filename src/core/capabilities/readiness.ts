import type {
  CurdxExternalMcpSpec,
  CurdxPluginDependencySpec,
} from './catalog.ts';
import type { CapabilityTriState } from './types.ts';

export type PluginDependencyReadiness = 'available' | 'degraded' | 'unavailable' | 'unknown';
export type ExternalMcpReadinessStatus = 'connected' | 'error' | 'missing' | 'unknown';

export interface ManifestDependencyInput {
  name?: string;
  marketplace?: string;
  version?: string;
}

interface ParsedPluginEntry {
  id: string;
  name: string;
  marketplace: string;
  version?: string;
  scope?: string;
  enabled?: boolean;
}

export interface PluginDependencyReadinessFact extends Record<string, unknown> {
  id: string;
  name: string;
  type: 'plugin';
  expectedMarketplace: string;
  expectedPluginId: string;
  declared: boolean;
  marketplace: string | null;
  marketplaceMatches: boolean;
  crossMarketplaceAllowlisted: boolean;
  versionConstraint: string | null;
  installed: CapabilityTriState;
  installedScope: string | null;
  installedVersion: string | null;
  enabled: CapabilityTriState;
  callable: CapabilityTriState;
  authorized: CapabilityTriState;
  trustSatisfied: boolean;
  readiness: PluginDependencyReadiness;
  blocksCompletion: boolean;
  blocksRelease: boolean;
  drift: string[];
  reason: string;
  remediation: string;
  pluginListSource: string;
  pluginListExitCode: number | null;
}

export interface PluginDependencyReadinessResult {
  ready: boolean;
  requiredReady: boolean;
  source: string;
  exitCode: number | null;
  parseError: string | null;
  commandError: string | null;
  dependencies: PluginDependencyReadinessFact[];
}

export interface BuildPluginDependencyReadinessInput {
  expected: readonly CurdxPluginDependencySpec[];
  manifestDependencies?: readonly ManifestDependencyInput[];
  marketplaceAllowlist?: readonly string[];
  pluginListJson?: string;
  pluginListSource?: string;
  pluginListExitCode?: number | null;
  pluginListError?: string | null;
  expectedScope?: string;
}

interface ParsedPluginListResult {
  ok: boolean;
  plugins: ParsedPluginEntry[];
  parseError: string | null;
}

export interface ExternalMcpReadinessFact extends Record<string, unknown> {
  id: string;
  type: 'mcp';
  expectedExternal: true;
  bundledByCurdxFlow: false;
  configured: CapabilityTriState;
  installed: CapabilityTriState;
  callable: CapabilityTriState;
  authorized: CapabilityTriState;
  status: ExternalMcpReadinessStatus;
  rawLine: string | null;
  installHint: string;
  fallback: string;
  source: string;
}

export interface ExternalMcpReadinessResult {
  ready: boolean;
  source: string;
  exitCode: number | null;
  commandError: string | null;
  malformedLines: string[];
  ignoredPluginProvidedServers: string[];
  servers: ExternalMcpReadinessFact[];
}

export interface BuildExternalMcpReadinessInput {
  expected: readonly CurdxExternalMcpSpec[];
  mcpListOutput?: string;
  mcpListSource?: string;
  mcpListExitCode?: number | null;
  mcpListError?: string | null;
}

interface ParsedMcpEntry {
  name: string;
  rawLine: string;
  status: ExternalMcpReadinessStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function booleanTri(value: unknown): CapabilityTriState {
  return typeof value === 'boolean' ? value : 'unknown';
}

function splitPluginId(id: string): { name: string; marketplace: string } {
  const at = id.lastIndexOf('@');
  if (at <= 0) return { name: id, marketplace: '' };
  return {
    name: id.slice(0, at),
    marketplace: id.slice(at + 1),
  };
}

function parsePluginListJson(raw: string | undefined): ParsedPluginListResult {
  if (raw === undefined) {
    return { ok: false, plugins: [], parseError: null };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    const items = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.plugins)
        ? parsed.plugins
        : null;
    if (!items) {
      return { ok: false, plugins: [], parseError: 'invalid plugin list json: expected an array or { plugins: [] }' };
    }
    const plugins: ParsedPluginEntry[] = [];
    for (const item of items) {
      if (!isRecord(item) || typeof item.id !== 'string' || item.id.length === 0) continue;
      const parts = splitPluginId(item.id);
      plugins.push({
        id: item.id,
        name: stringValue(item.name) ?? parts.name,
        marketplace: stringValue(item.marketplace) ?? parts.marketplace,
        ...(stringValue(item.version) ? { version: stringValue(item.version) } : {}),
        ...(stringValue(item.scope) ? { scope: stringValue(item.scope) } : {}),
        ...(typeof item.enabled === 'boolean' ? { enabled: item.enabled } : {}),
      });
    }
    return { ok: true, plugins, parseError: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, plugins: [], parseError: `invalid plugin list json: ${message}` };
  }
}

function pluginBlocksCompletion(id: string): boolean {
  return id === 'chrome-devtools-mcp';
}

function dependencyRemediation(name: string, marketplace: string, issue: PluginDependencyReadiness): string {
  if (issue === 'degraded') {
    return `Enable ${name} from the ${marketplace} marketplace at user scope and rerun curdx-flow doctor.`;
  }
  if (issue === 'unavailable') {
    return `Install/enable ${name}@${marketplace} as a Claude Code plugin dependency; curdx-flow must not vendor or silently skip it.`;
  }
  return `Run claude plugin list --json and confirm ${name}@${marketplace} is installed and enabled.`;
}

export function buildPluginDependencyReadiness(
  input: BuildPluginDependencyReadinessInput,
): PluginDependencyReadinessResult {
  const source = input.pluginListSource ?? 'not-probed';
  const exitCode = input.pluginListExitCode ?? (input.pluginListJson === undefined ? null : 0);
  const commandError = input.pluginListError ?? null;
  const allowlist = new Set(input.marketplaceAllowlist ?? []);
  const parsed = exitCode === 0 && !commandError
    ? parsePluginListJson(input.pluginListJson)
    : { ok: false, plugins: [], parseError: null };
  const expectedScope = input.expectedScope ?? 'user';

  const dependencies = input.expected.map((expected): PluginDependencyReadinessFact => {
    const actual = (input.manifestDependencies ?? []).find((item) => item.name === expected.name);
    const marketplace = actual?.marketplace ?? null;
    const declared = actual !== undefined;
    const marketplaceMatches = marketplace === expected.marketplace;
    const crossMarketplaceAllowlisted = allowlist.has(expected.marketplace);
    const trustSatisfied = declared && marketplaceMatches && crossMarketplaceAllowlisted;
    const soft = !declared;
    const exactInstalled = parsed.plugins.find((plugin) => plugin.id === expected.pluginId);
    const sameNameInstalled = parsed.plugins.find((plugin) =>
      plugin.name === expected.name && plugin.id !== expected.pluginId,
    );
    const scope = exactInstalled?.scope ?? (exactInstalled ? expectedScope : null);
    const enabled = exactInstalled ? booleanTri(exactInstalled.enabled) : parsed.ok ? false : 'unknown';
    const drift: string[] = [];

    if (!declared) drift.push('manifest-missing');
    if (declared && !marketplaceMatches) drift.push('manifest-marketplace-mismatch');
    if (!crossMarketplaceAllowlisted) drift.push('marketplace-allowlist-missing');
    if (parsed.parseError) drift.push('plugin-list-malformed');
    if (commandError || exitCode !== 0) drift.push('plugin-list-unavailable');
    if (parsed.ok && !exactInstalled) {
      drift.push(sameNameInstalled ? 'plugin-id-mismatch' : 'plugin-missing');
    }
    if (exactInstalled && scope !== expectedScope) drift.push('plugin-scope-mismatch');
    if (exactInstalled && exactInstalled.enabled === false) drift.push('plugin-disabled');

    const manifestDrift = drift.some((item) =>
      item === 'manifest-missing' ||
      item === 'manifest-marketplace-mismatch' ||
      item === 'marketplace-allowlist-missing' ||
      item === 'plugin-id-mismatch',
    );
    const installed: CapabilityTriState = exactInstalled ? true : parsed.ok ? false : 'unknown';
    const installedScope = scope;
    const installedVersion = exactInstalled?.version ?? null;
    const authorized: CapabilityTriState = (soft ? installed === true : trustSatisfied) ? true : false;
    let callable: CapabilityTriState = 'unknown';
    let readiness: PluginDependencyReadiness = 'unknown';

    if (!soft && (!trustSatisfied || manifestDrift)) {
      readiness = 'unavailable';
      callable = false;
    } else if (!parsed.ok || commandError || exitCode !== 0) {
      readiness = 'unknown';
      callable = 'unknown';
    } else if (!exactInstalled) {
      readiness = 'unavailable';
      callable = false;
    } else if (scope !== expectedScope || exactInstalled.enabled === false) {
      readiness = 'degraded';
      callable = false;
    } else if (exactInstalled.enabled === true) {
      readiness = 'available';
      callable = true;
    }

    const reason = readiness === 'available'
      ? `${expected.name}@${expected.marketplace} is installed at ${installedScope} scope and enabled.`
      : readiness === 'unknown'
        ? `${expected.name}@${expected.marketplace} readiness is unknown because installed plugin state was not confirmed.`
        : soft
          ? `${expected.name}@${expected.marketplace} is an optional companion; curdx-flow degrades gracefully when it is absent.`
          : drift.length > 0
            ? `${expected.name}@${expected.marketplace} readiness failed: ${drift.join(', ')}.`
            : `${expected.name}@${expected.marketplace} is not ready.`;

    return {
      id: expected.id,
      name: expected.name,
      type: 'plugin',
      expectedMarketplace: expected.marketplace,
      expectedPluginId: expected.pluginId,
      declared,
      marketplace,
      marketplaceMatches,
      crossMarketplaceAllowlisted,
      versionConstraint: actual?.version ?? null,
      installed,
      installedScope,
      installedVersion,
      enabled,
      callable,
      authorized,
      trustSatisfied,
      readiness,
      blocksCompletion: pluginBlocksCompletion(expected.id) && declared && readiness !== 'available',
      blocksRelease: declared && readiness !== 'available',
      drift,
      reason,
      remediation: readiness === 'available'
        ? ''
        : soft
          ? `Optional: add ${expected.marketplace} and install ${expected.name} to enable its companion capability.`
          : dependencyRemediation(expected.name, expected.marketplace, readiness),
      pluginListSource: source,
      pluginListExitCode: exitCode,
    };
  });

  return {
    ready: dependencies.every((dependency) => dependency.readiness === 'available'),
    requiredReady: dependencies.every(
      (dependency) => !dependency.declared || dependency.readiness === 'available',
    ),
    source,
    exitCode,
    parseError: parsed.parseError,
    commandError,
    dependencies,
  };
}

function parseMcpListOutput(raw: string): {
  entries: ParsedMcpEntry[];
  ignoredPluginProvidedServers: string[];
  malformedLines: string[];
} {
  const entries: ParsedMcpEntry[] = [];
  const ignoredPluginProvidedServers: string[] = [];
  const malformedLines: string[] = [];

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^Checking\b/i.test(line)) continue;
    if (line.startsWith('plugin:')) {
      ignoredPluginProvidedServers.push(line);
      continue;
    }
    const colonIdx = line.indexOf(':');
    if (colonIdx <= 0) {
      malformedLines.push(line);
      continue;
    }
    const name = line.slice(0, colonIdx).trim();
    if (!name || /\s/.test(name)) {
      malformedLines.push(line);
      continue;
    }
    const status = /✗|failed|error|not connected|disconnected/i.test(line)
      ? 'error'
      : /✓|\bconnected\b/i.test(line)
        ? 'connected'
        : 'unknown';
    entries.push({ name, rawLine: line, status });
  }

  return { entries, ignoredPluginProvidedServers, malformedLines };
}

function externalMcpFallback(id: string): string {
  if (id === 'context7') {
    return 'Fallback: use official docs/web evidence or manual confirmation; latest Claude Code/plugin/MCP behavior remains uncertain until context7 is connected.';
  }
  if (id === 'sequential-thinking') {
    return 'Fallback: perform explicit local reasoning and manual risk review; high-risk reasoning evidence remains degraded until sequential-thinking is connected.';
  }
  return 'Fallback: document manual confirmation before relying on this external MCP evidence.';
}

export function buildExternalMcpReadiness(input: BuildExternalMcpReadinessInput): ExternalMcpReadinessResult {
  const source = input.mcpListSource ?? 'not-probed';
  const exitCode = input.mcpListExitCode ?? (input.mcpListOutput === undefined ? null : 0);
  const commandError = input.mcpListError ?? null;

  if (exitCode !== 0 || commandError) {
    return {
      ready: false,
      source,
      exitCode,
      commandError: commandError ?? `claude mcp list exited ${exitCode}`,
      malformedLines: [],
      ignoredPluginProvidedServers: [],
      servers: input.expected.map((expected) => ({
        id: expected.id,
        type: 'mcp',
        expectedExternal: true,
        bundledByCurdxFlow: false,
        configured: 'unknown',
        installed: 'unknown',
        callable: 'unknown',
        authorized: 'unknown',
        status: 'unknown',
        rawLine: null,
        installHint: expected.installHint,
        fallback: externalMcpFallback(expected.id),
        source,
      })),
    };
  }

  const parsed = parseMcpListOutput(input.mcpListOutput ?? '');
  const servers = input.expected.map((expected): ExternalMcpReadinessFact => {
    const entry = parsed.entries.find((candidate) =>
      expected.match.test(candidate.name) || expected.match.test(candidate.rawLine),
    );
    if (!entry) {
      return {
        id: expected.id,
        type: 'mcp',
        expectedExternal: true,
        bundledByCurdxFlow: false,
        configured: false,
        installed: false,
        callable: false,
        authorized: 'unknown',
        status: 'missing',
        rawLine: null,
        installHint: expected.installHint,
        fallback: externalMcpFallback(expected.id),
        source,
      };
    }
    return {
      id: expected.id,
      type: 'mcp',
      expectedExternal: true,
      bundledByCurdxFlow: false,
      configured: true,
      installed: true,
      callable: entry.status === 'connected' ? true : entry.status === 'error' ? false : 'unknown',
      authorized: 'unknown',
      status: entry.status,
      rawLine: entry.rawLine,
      installHint: expected.installHint,
      fallback: entry.status === 'connected' ? '' : externalMcpFallback(expected.id),
      source,
    };
  });

  return {
    ready: servers.every((server) => server.status === 'connected'),
    source,
    exitCode,
    commandError: null,
    malformedLines: parsed.malformedLines,
    ignoredPluginProvidedServers: parsed.ignoredPluginProvidedServers,
    servers,
  };
}
