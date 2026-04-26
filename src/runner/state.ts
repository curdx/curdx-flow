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
  source?: string;
  repo?: string;
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
