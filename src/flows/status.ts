import * as p from '@clack/prompts';
import pc from 'picocolors';
import { PKGS } from '../registry/index.ts';
import { t } from '../i18n/index.ts';
import { refreshMarketplaces } from '../runner/state.ts';

export type StatusOptions = {
  json?: boolean;
  noRefresh?: boolean;
};

async function refreshKnownMarketplaces(): Promise<void> {
  const names = new Set<string>();
  for (const pkg of PKGS) {
    if (pkg.marketplaces) for (const name of pkg.marketplaces()) names.add(name);
  }
  if (names.size > 0) await refreshMarketplaces([...names]);
}

export async function statusFlow(opts: StatusOptions = {}): Promise<void> {
  if (!opts.noRefresh) await refreshKnownMarketplaces();

  const states = await Promise.all(
    PKGS.map(async (pkg) => {
      const installed = await pkg.isInstalled();
      const installedVersion = installed && pkg.installedVersion ? await pkg.installedVersion() : null;
      const latestVersion = pkg.latestVersion ? await pkg.latestVersion() : null;
      const updateAvailable = Boolean(
        installed && installedVersion && latestVersion && installedVersion !== latestVersion,
      );
      return {
        id: pkg.id,
        name: pkg.name,
        type: pkg.type,
        installed,
        installedVersion,
        latestVersion,
        updateAvailable,
      };
    }),
  );

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
