import * as p from '@clack/prompts';
import pc from 'picocolors';
import { companionPlugins, canonicalPkgId, type PluginCompanion } from '../core/capabilities/catalog.ts';
import { t } from '../i18n/index.ts';
import { isPluginInstalledAtScope, listPlugins, refreshMarketplaces } from '../runner/state.ts';
import { PLUGIN_SCOPE, updatePluginById } from '../runner/plugin-cli.ts';
import { syncFromState } from '../runner/claudeMd.ts';

export type UpdateOptions = {
  ids?: string[];
  all?: boolean;
  noRefresh?: boolean;
  noClaudeMd?: boolean;
};

type Result = { id: string; status: 'ok' | 'fail'; message?: string };

async function probeInstalled(): Promise<PluginCompanion[]> {
  const sp = p.spinner();
  sp.start(t('state.checking'));
  try {
    await listPlugins();
    const states = await Promise.all(
      companionPlugins().map(async (c) => ({ c, installed: await isPluginInstalledAtScope(c.pluginId, PLUGIN_SCOPE) })),
    );
    const installed = states.filter((s) => s.installed).map((s) => s.c);
    sp.stop(t('state.checked', { count: installed.length }));
    return installed;
  } catch (err) {
    sp.stop(t('state.checked', { count: 0 }));
    throw err;
  }
}

async function maybeRefreshMarketplaces(opts: UpdateOptions): Promise<void> {
  if (opts.noRefresh) return;
  const names = new Set(companionPlugins().map((c) => c.marketplace));
  if (names.size === 0) return;
  const sp = p.spinner();
  sp.start(t('marketplace.refreshing'));
  const refreshed = await refreshMarketplaces([...names]);
  sp.stop(
    refreshed.length > 0
      ? t('marketplace.refreshed', { count: refreshed.length })
      : t('marketplace.refreshSkipped'),
  );
}

export async function updateFlow(opts: UpdateOptions = {}): Promise<void> {
  let userCancelled = false;
  try {
    await maybeRefreshMarketplaces(opts);

    const installed = await probeInstalled();
    if (installed.length === 0) {
      p.log.info(t('update.noneInstalled'));
      return;
    }

    let targets: PluginCompanion[];
    if (opts.all) {
      targets = installed;
    } else if (opts.ids && opts.ids.length > 0) {
      targets = [];
      for (const id of opts.ids) {
        const canonical = canonicalPkgId(id);
        const c = companionPlugins().find((x) => x.id === canonical);
        if (!c) { p.log.warn(`Unknown id: ${id}`); continue; }
        if (!installed.some((x) => x.id === c.id)) { p.log.warn(`${c.name}: ${t('pkg.notInstalled')}`); continue; }
        targets.push(c);
      }
    } else {
      const picked = await p.multiselect<string>({
        message: t('update.selectPrompt'),
        options: installed.map((c) => ({
          value: c.id,
          label: `${c.name} ${pc.dim('(plugin)')}`,
          hint: c.description,
        })),
        required: false,
      });
      if (p.isCancel(picked)) { userCancelled = true; p.cancel(t('app.cancelled')); return; }
      targets = (picked as string[]).map((id) => installed.find((c) => c.id === id)).filter((x): x is PluginCompanion => Boolean(x));
    }

    if (targets.length === 0) {
      p.log.info(t('install.nothingSelected'));
      return;
    }

    const results: Result[] = [];
    for (const c of targets) {
      const log = p.taskLog({ title: t('update.starting', { name: c.name }) });
      try {
        await updatePluginById(c.pluginId, { log, config: {}, t });
        log.success(t('update.success', { name: c.name }));
        results.push({ id: c.id, status: 'ok' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`${t('update.failed', { name: c.name })}\n${msg}`);
        results.push({ id: c.id, status: 'fail', message: msg });
      }
    }

    const ok = results.filter((r) => r.status === 'ok').length;
    const fail = results.filter((r) => r.status === 'fail').length;
    p.note(
      [pc.green(t('install.summaryOk', { count: ok })), pc.red(t('install.summaryFail', { count: fail }))].join('\n'),
      t('install.summaryTitle'),
    );
  } finally {
    if (!userCancelled) {
      await syncFromState({ skip: opts.noClaudeMd });
    }
  }
}
