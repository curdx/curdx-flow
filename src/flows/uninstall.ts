import * as p from '@clack/prompts';
import pc from 'picocolors';
import { companionPlugins, canonicalPkgId, type PluginCompanion } from '../core/capabilities/catalog.ts';
import { t } from '../i18n/index.ts';
import { isPluginInstalledAtScope, listPlugins } from '../runner/state.ts';
import { PLUGIN_SCOPE, uninstallPluginById } from '../runner/plugin-cli.ts';
import { syncFromState } from '../runner/claudeMd.ts';

export type UninstallOptions = {
  ids?: string[];
  yes?: boolean;
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

export async function uninstallFlow(opts: UninstallOptions = {}): Promise<void> {
  let userCancelled = false;
  try {
    const installed = await probeInstalled();

    let targets: PluginCompanion[];
    if (opts.ids && opts.ids.length > 0) {
      targets = [];
      for (const id of opts.ids) {
        const canonical = canonicalPkgId(id);
        const c = companionPlugins().find((x) => x.id === canonical);
        if (!c) { p.log.warn(`Unknown id: ${id}`); continue; }
        if (!installed.some((x) => x.id === c.id)) { p.log.warn(`${c.name}: ${t('pkg.notInstalled')}`); continue; }
        targets.push(c);
      }
    } else {
      if (installed.length === 0) {
        p.log.info(t('uninstall.noneInstalled'));
        return;
      }
      const picked = await p.multiselect<string>({
        message: t('uninstall.selectPrompt'),
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

    if (!opts.yes) {
      const ok = await p.confirm({
        message: t('uninstall.confirm', { count: targets.length }),
        initialValue: false,
      });
      if (p.isCancel(ok) || ok === false) {
        userCancelled = true;
        p.cancel(t('app.cancelled'));
        return;
      }
    }

    const results: Result[] = [];
    for (const c of targets) {
      const log = p.taskLog({ title: t('uninstall.starting', { name: c.name }) });
      try {
        await uninstallPluginById(c.pluginId, { log, t });
        log.success(t('uninstall.success', { name: c.name }));
        results.push({ id: c.id, status: 'ok' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`${t('uninstall.failed', { name: c.name })}\n${msg}`);
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
