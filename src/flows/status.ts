import * as p from '@clack/prompts';
import pc from 'picocolors';
import { companionPlugins, externalMcps } from '../core/capabilities/catalog.ts';
import { PLUGIN_SCOPE } from '../runner/plugin-cli.ts';
import { t } from '../i18n/index.ts';
import {
  findPluginAtScope,
  getMarketplacePluginVersion,
  isPluginInstalledAtScope,
  listMcp,
  listPlugins,
  refreshMarketplaces,
} from '../runner/state.ts';

export type StatusOptions = {
  json?: boolean;
  noRefresh?: boolean;
};

type StatusRow = {
  id: string;
  name: string;
  type: 'plugin' | 'mcp';
  installed: boolean;
  installedVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
};

async function refreshKnownMarketplaces(): Promise<void> {
  const names = new Set(companionPlugins().map((c) => c.marketplace));
  if (names.size > 0) await refreshMarketplaces([...names]);
}

export async function statusFlow(opts: StatusOptions = {}): Promise<void> {
  if (!opts.noRefresh) await refreshKnownMarketplaces();

  const [, mcps] = await Promise.all([listPlugins(true), listMcp()]);

  const pluginRows: StatusRow[] = await Promise.all(
    companionPlugins().map(async (c) => {
      const installed = await isPluginInstalledAtScope(c.pluginId, PLUGIN_SCOPE);
      const found = installed ? await findPluginAtScope(c.pluginId, PLUGIN_SCOPE) : undefined;
      const installedVersion = found?.version && found.version !== 'unknown' ? found.version : null;
      const latestVersion = await getMarketplacePluginVersion(c.marketplace, c.name);
      const updateAvailable = Boolean(
        installed && installedVersion && latestVersion && installedVersion !== latestVersion,
      );
      return {
        id: c.id,
        name: c.name,
        type: 'plugin' as const,
        installed,
        installedVersion,
        latestVersion,
        updateAvailable,
      };
    }),
  );

  // External MCPs are detect-only: presence is read from `claude mcp list`, never installed by us.
  const mcpRows: StatusRow[] = externalMcps().map((spec) => ({
    id: spec.id,
    name: spec.id,
    type: 'mcp' as const,
    installed: mcps.some((m) => spec.match.test(m.name) || spec.match.test(m.raw)),
    installedVersion: null,
    latestVersion: null,
    updateAvailable: false,
  }));

  const states: StatusRow[] = [...pluginRows, ...mcpRows];

  if (opts.json) {
    process.stdout.write(JSON.stringify(states, null, 2) + '\n');
    return;
  }

  const nameW = Math.max(t('status.headerName').length, ...states.map((s) => s.name.length));
  const typeW = Math.max(t('status.headerType').length, ...states.map((s) => s.type.length));
  const header =
    `${t('status.headerName').padEnd(nameW)}  ${t('status.headerType').padEnd(typeW)}  ${t('status.headerState')}`;
  const sep = `${'-'.repeat(nameW)}  ${'-'.repeat(typeW)}  ${'-'.repeat(15)}`;
  const rows = states.map(
    (s) =>
      `${s.name.padEnd(nameW)}  ${s.type.padEnd(typeW)}  ${
        s.installed ? pc.green(`✓ ${t('pkg.installed')}`) : pc.yellow(`✗ ${t('pkg.notInstalled')}`)
      }`,
  );
  p.note([header, sep, ...rows].join('\n'), t('status.title'));
}
