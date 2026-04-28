import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { run } from './exec.ts';

export type PluginEntry = {
  id: string;            // "name@marketplace"
  name: string;          // "name"
  marketplace: string;   // "marketplace"
  version?: string;
  scope?: string;
  enabled?: boolean;
};

export type MarketplaceEntry = {
  name: string;
  source?: string; // 'github' | 'directory'
  repo?: string;   // 'owner/repo' for source=github
  path?: string;   // local path for source=directory
};

export type McpEntry = {
  name: string;          // user-defined name (e.g. "context7")
  raw: string;           // full raw line for debugging
};

let pluginCache: PluginEntry[] | null = null;
let marketplaceCache: MarketplaceEntry[] | null = null;
let mcpCache: McpEntry[] | null = null;

export function clearStateCache(): void {
  pluginCache = null;
  marketplaceCache = null;
  mcpCache = null;
}

export async function listPlugins(force = false): Promise<PluginEntry[]> {
  if (!force && pluginCache) return pluginCache;
  const res = await run('claude', ['plugin', 'list', '--json']);
  if (res.exitCode !== 0) {
    pluginCache = [];
    return pluginCache;
  }
  try {
    const arr = JSON.parse(res.stdout) as Array<{
      id: string;
      version?: string;
      scope?: string;
      enabled?: boolean;
    }>;
    pluginCache = arr.map((p) => {
      const [name = p.id, marketplace = ''] = p.id.split('@');
      return {
        id: p.id,
        name,
        marketplace,
        version: p.version,
        scope: p.scope,
        enabled: p.enabled,
      };
    });
  } catch {
    pluginCache = [];
  }
  return pluginCache;
}

export async function listMarketplaces(force = false): Promise<MarketplaceEntry[]> {
  if (!force && marketplaceCache) return marketplaceCache;
  const res = await run('claude', ['plugin', 'marketplace', 'list', '--json']);
  if (res.exitCode !== 0) {
    marketplaceCache = [];
    return marketplaceCache;
  }
  try {
    marketplaceCache = JSON.parse(res.stdout) as MarketplaceEntry[];
  } catch {
    marketplaceCache = [];
  }
  return marketplaceCache;
}

// `claude mcp list` has no --json. Output format:
//   "Checking MCP server health…"
//   ""
//   "<name>: <commandOrUrl> - ✓ Connected"
//   "plugin:<plugin>:<server>: <command> - ✓ Connected"
// We only care about user-added entries (skip plugin: prefix).
export async function listMcp(force = false): Promise<McpEntry[]> {
  if (!force && mcpCache) return mcpCache;
  const res = await run('claude', ['mcp', 'list']);
  if (res.exitCode !== 0) {
    mcpCache = [];
    return mcpCache;
  }
  const entries: McpEntry[] = [];
  for (const rawLine of res.stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('Checking ')) continue;
    if (!line.includes(':')) continue;
    if (line.startsWith('plugin:')) continue;
    const colonIdx = line.indexOf(':');
    const name = line.slice(0, colonIdx).trim();
    if (!name || name.includes(' ')) continue;
    entries.push({ name, raw: line });
  }
  mcpCache = entries;
  return mcpCache;
}

export async function isPluginInstalled(id: string): Promise<boolean> {
  const list = await listPlugins();
  return list.some((p) => p.id === id);
}

export async function isMarketplaceAdded(name: string): Promise<boolean> {
  const list = await listMarketplaces();
  return list.some((m) => m.name === name);
}

export async function isMcpInstalled(name: string): Promise<boolean> {
  const list = await listMcp();
  return list.some((m) => m.name === name);
}

export async function findPlugin(id: string): Promise<PluginEntry | undefined> {
  const list = await listPlugins();
  return list.find((p) => p.id === id);
}

// ---- marketplace.json reading + cache refresh ----

export type MarketplacePluginEntry = {
  name: string;
  version?: string;
  description?: string;
  source?: unknown;
};

export type MarketplaceJson = {
  name?: string;
  plugins?: MarketplacePluginEntry[];
};

const marketplaceJsonCache = new Map<string, MarketplaceJson | null>();

function marketplaceDir(name: string): string {
  return path.join(os.homedir(), '.claude', 'plugins', 'marketplaces', name);
}

export async function readMarketplaceJson(name: string): Promise<MarketplaceJson | null> {
  if (marketplaceJsonCache.has(name)) return marketplaceJsonCache.get(name) ?? null;
  const file = path.join(marketplaceDir(name), '.claude-plugin', 'marketplace.json');
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as MarketplaceJson;
    marketplaceJsonCache.set(name, parsed);
    return parsed;
  } catch {
    marketplaceJsonCache.set(name, null);
    return null;
  }
}

export async function getMarketplacePluginVersion(
  marketplaceName: string,
  pluginName: string,
): Promise<string | null> {
  const m = await readMarketplaceJson(marketplaceName);
  if (!m?.plugins) return null;
  const entry = m.plugins.find((p) => p.name === pluginName);
  return entry?.version ?? null;
}

const REFRESH_TTL_MS = 60 * 60 * 1000; // 1h

async function shouldSkipRefresh(name: string): Promise<boolean> {
  try {
    const stat = await fs.stat(marketplaceDir(name));
    return Date.now() - stat.mtimeMs < REFRESH_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * Fetch the upstream marketplace.json content for a given marketplace entry, if reachable.
 * - source=github → HTTPS GET against raw.githubusercontent.com/{repo}/HEAD/.claude-plugin/marketplace.json
 * - source=directory → read the path directly
 * Returns null on any failure (offline, 404, malformed entry); callers fall back to local cache.
 */
async function fetchUpstreamMarketplaceJson(
  entry: MarketplaceEntry,
): Promise<string | null> {
  if (entry.source === 'github' && entry.repo) {
    const url = `https://raw.githubusercontent.com/${entry.repo}/HEAD/.claude-plugin/marketplace.json`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) return null;
      return await r.text();
    } catch {
      return null;
    }
  }
  if (entry.source === 'directory' && entry.path) {
    try {
      return await fs.readFile(
        path.join(entry.path, '.claude-plugin', 'marketplace.json'),
        'utf8',
      );
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeJsonForCompare(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
}

/**
 * Defend against the failure mode where `claude plugin marketplace update` reports success
 * but doesn't actually rewrite the local cache file (observed empirically — likely a stale
 * local git clone that fails to fetch silently). We fetch the upstream marketplace.json
 * directly and overwrite the local cache when the contents diverge.
 *
 * Returns true if the local cache was rewritten, false otherwise (already in sync, upstream
 * unreachable, or marketplace not registered).
 */
async function reconcileMarketplaceCache(name: string): Promise<boolean> {
  const entries = await listMarketplaces();
  const entry = entries.find((m) => m.name === name);
  if (!entry) return false;
  const upstream = await fetchUpstreamMarketplaceJson(entry);
  if (!upstream) return false;
  const localFile = path.join(marketplaceDir(name), '.claude-plugin', 'marketplace.json');
  let localContent: string | null = null;
  try {
    localContent = await fs.readFile(localFile, 'utf8');
  } catch {
    localContent = null;
  }
  if (
    localContent !== null &&
    normalizeJsonForCompare(localContent) === normalizeJsonForCompare(upstream)
  ) {
    return false;
  }
  try {
    await fs.mkdir(path.dirname(localFile), { recursive: true });
    await fs.writeFile(localFile, upstream, 'utf8');
    marketplaceJsonCache.delete(name);
    return true;
  } catch {
    return false;
  }
}

/**
 * Refresh given marketplaces' caches. Skips any whose mtime is within REFRESH_TTL_MS.
 * Returns the list of marketplace names that were actually refreshed (either by claude CLI
 * update or by direct upstream reconciliation).
 */
export async function refreshMarketplaces(names: string[]): Promise<string[]> {
  const unique = [...new Set(names)];
  const toRefresh: string[] = [];
  for (const name of unique) {
    if (!(await shouldSkipRefresh(name))) toRefresh.push(name);
  }
  if (toRefresh.length === 0) return [];
  await Promise.all(
    toRefresh.map((name) => run('claude', ['plugin', 'marketplace', 'update', name])),
  );
  // Bust the JSON cache for refreshed marketplaces.
  for (const name of toRefresh) marketplaceJsonCache.delete(name);
  // Defensive reconciliation: claude CLI's update command sometimes returns success
  // without actually rewriting the local cache file. Fetch upstream directly and
  // overwrite when contents diverge. Best-effort — failures are non-fatal.
  await Promise.all(toRefresh.map((name) => reconcileMarketplaceCache(name)));
  return toRefresh;
}
