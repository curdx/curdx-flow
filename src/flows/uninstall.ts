import * as p from '@clack/prompts';
import pc from 'picocolors';
import { PKGS, findPkg } from '../registry/index.ts';
import type { Pkg } from '../registry/types.ts';
import { t } from '../i18n/index.ts';
import { listMcp, listPlugins } from '../runner/state.ts';
import { syncFromState } from '../runner/claudeMd.ts';

export type UninstallOptions = {
  ids?: string[];
  yes?: boolean;
  noClaudeMd?: boolean;
};

type Result = { id: string; status: 'ok' | 'fail'; message?: string };

async function getInstalled(): Promise<Pkg[]> {
  const states = await Promise.all(PKGS.map(async (pkg) => ({ pkg, installed: await pkg.isInstalled() })));
  return states.filter((s) => s.installed).map((s) => s.pkg);
}

async function probeInstalled(): Promise<Pkg[]> {
  const sp = p.spinner();
  sp.start(t('state.checking'));
  try {
    await Promise.all([listPlugins(), listMcp()]);
    const installed = await getInstalled();
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

    let targets: Pkg[];
    if (opts.ids && opts.ids.length > 0) {
      targets = [];
      for (const id of opts.ids) {
        const pkg = findPkg(id);
        if (!pkg) {
          p.log.warn(`Unknown id: ${id}`);
          continue;
        }
        if (!installed.some((x) => x.id === pkg.id)) {
          p.log.warn(`${pkg.name}: ${t('pkg.notInstalled')}`);
          continue;
        }
        targets.push(pkg);
      }
    } else {
      if (installed.length === 0) {
        p.log.info(t('uninstall.noneInstalled'));
        return;
      }
      const picked = await p.multiselect<string>({
        message: t('uninstall.selectPrompt'),
        options: installed.map((pkg) => ({
          value: pkg.id,
          label: `${pkg.name} ${pc.dim(`(${pkg.type})`)}`,
          hint: pkg.description,
        })),
        required: false,
      });
      if (p.isCancel(picked)) {
        userCancelled = true;
        p.cancel(t('app.cancelled'));
        return;
      }
      targets = (picked as string[]).map((id) => findPkg(id)).filter((x): x is Pkg => Boolean(x));
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
    for (const pkg of targets) {
      const log = p.taskLog({ title: t('uninstall.starting', { name: pkg.name }) });
      try {
        await pkg.uninstall({ log, config: {}, t });
        log.success(t('uninstall.success', { name: pkg.name }));
        results.push({ id: pkg.id, status: 'ok' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`${t('uninstall.failed', { name: pkg.name })}\n${msg}`);
        results.push({ id: pkg.id, status: 'fail', message: msg });
      }
    }

    const ok = results.filter((r) => r.status === 'ok').length;
    const fail = results.filter((r) => r.status === 'fail').length;
    p.note(
      [
        pc.green(t('install.summaryOk', { count: ok })),
        pc.red(t('install.summaryFail', { count: fail })),
      ].join('\n'),
      t('install.summaryTitle'),
    );
  } finally {
    if (!userCancelled) {
      await syncFromState({ skip: opts.noClaudeMd });
    }
  }
}
