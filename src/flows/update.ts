import * as p from '@clack/prompts';
import pc from 'picocolors';
import { PKGS, findPkg } from '../registry/index.ts';
import type { Pkg } from '../registry/types.ts';
import { t } from '../i18n/index.ts';
import { syncFromState } from '../runner/claudeMd.ts';

export type UpdateOptions = {
  ids?: string[];
  all?: boolean;
  noClaudeMd?: boolean;
};

type Result = { id: string; status: 'ok' | 'fail' | 'noop'; message?: string };

async function getInstalled(): Promise<Pkg[]> {
  const states = await Promise.all(PKGS.map(async (pkg) => ({ pkg, installed: await pkg.isInstalled() })));
  return states.filter((s) => s.installed).map((s) => s.pkg);
}

export async function updateFlow(opts: UpdateOptions = {}): Promise<void> {
  const installed = await getInstalled();
  if (installed.length === 0) {
    p.log.info(t('update.noneInstalled'));
    return;
  }

  let targets: Pkg[];
  if (opts.all) {
    targets = installed;
  } else if (opts.ids && opts.ids.length > 0) {
    targets = [];
    for (const id of opts.ids) {
      const pkg = findPkg(id);
      if (!pkg) { p.log.warn(`Unknown id: ${id}`); continue; }
      if (!installed.some((x) => x.id === pkg.id)) { p.log.warn(`${pkg.name}: ${t('pkg.notInstalled')}`); continue; }
      targets.push(pkg);
    }
  } else {
    const picked = await p.multiselect<string>({
      message: t('update.selectPrompt'),
      options: installed.map((pkg) => ({
        value: pkg.id,
        label: `${pkg.name} ${pc.dim(`(${pkg.type})`)}`,
        hint: pkg.description,
      })),
      required: false,
    });
    if (p.isCancel(picked)) { p.cancel(t('app.cancelled')); return; }
    targets = (picked as string[]).map((id) => findPkg(id)).filter((x): x is Pkg => Boolean(x));
  }

  if (targets.length === 0) {
    p.log.info(t('install.nothingSelected'));
    return;
  }

  const results: Result[] = [];
  for (const pkg of targets) {
    if (pkg.id === 'sequential-thinking') {
      p.log.info(t('update.mcpAutoNote', { name: pkg.name }));
      results.push({ id: pkg.id, status: 'noop' });
      continue;
    }
    if (pkg.id === 'context7') {
      p.log.info(t('update.context7Note'));
      results.push({ id: pkg.id, status: 'noop' });
      continue;
    }

    const log = p.taskLog({ title: t('update.starting', { name: pkg.name }) });
    try {
      if (pkg.update) {
        await pkg.update({ log, config: {}, t });
      } else {
        await pkg.uninstall({ log, config: {}, t });
        await pkg.install({ log, config: {}, t });
      }
      log.success(t('update.success', { name: pkg.name }));
      results.push({ id: pkg.id, status: 'ok' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`${t('update.failed', { name: pkg.name })}\n${msg}`);
      results.push({ id: pkg.id, status: 'fail', message: msg });
    }
  }

  const ok = results.filter((r) => r.status === 'ok').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const noop = results.filter((r) => r.status === 'noop').length;
  p.note(
    [
      pc.green(t('install.summaryOk', { count: ok })),
      pc.red(t('install.summaryFail', { count: fail })),
      pc.dim(`noop: ${noop}`),
    ].join('\n'),
    t('install.summaryTitle'),
  );
  await syncFromState({ skip: opts.noClaudeMd });
}
