import * as p from '@clack/prompts';
import pc from 'picocolors';
import { PKGS, findPkg } from '../registry/index.ts';
import type { Pkg } from '../registry/types.ts';
import { t } from '../i18n/index.ts';

export type InstallOptions = {
  ids?: string[];           // explicit ids from flag mode (`install <ids...>`)
  all?: boolean;            // --all
  yes?: boolean;            // --yes (skip reinstall confirm; default reinstall=true for already installed)
};

type Result = { id: string; status: 'ok' | 'fail' | 'skip'; message?: string };

async function selectInteractive(): Promise<Pkg[] | null> {
  const states = await Promise.all(PKGS.map(async (pkg) => ({ pkg, installed: await pkg.isInstalled() })));
  const options = states.map(({ pkg, installed }) => ({
    value: pkg.id,
    label: `${pkg.name} ${pc.dim(`(${pkg.type})`)}  ${
      installed ? pc.green(`✓ ${t('pkg.installed')}`) : pc.yellow(`✗ ${t('pkg.notInstalled')}`)
    }`,
    hint: pkg.description,
  }));
  const initialValues = states.filter((s) => !s.installed).map((s) => s.pkg.id);

  const picked = await p.multiselect<string>({
    message: t('install.selectPrompt'),
    options,
    initialValues,
    required: false,
  });
  if (p.isCancel(picked)) return null;
  return (picked as string[]).map((id) => findPkg(id)).filter((x): x is Pkg => Boolean(x));
}

function selectFromIds(opts: InstallOptions): Pkg[] {
  if (opts.all) return [...PKGS];
  if (!opts.ids || opts.ids.length === 0) return [];
  const found: Pkg[] = [];
  for (const id of opts.ids) {
    const pkg = findPkg(id);
    if (pkg) found.push(pkg);
    else p.log.warn(`Unknown id: ${id}`);
  }
  return found;
}

async function runOne(pkg: Pkg, opts: InstallOptions, alreadyInstalled: boolean): Promise<Result> {
  // Reinstall confirmation for already-installed
  let reinstall = false;
  if (alreadyInstalled) {
    if (opts.yes) {
      reinstall = true;
    } else {
      const ans = await p.confirm({
        message: t('install.confirmReinstall', { name: pkg.name }),
        initialValue: false,
      });
      if (p.isCancel(ans) || ans === false) {
        return { id: pkg.id, status: 'skip', message: t('install.skippedReinstall', { name: pkg.name }) };
      }
      reinstall = true;
    }
  }

  if (pkg.prereqCheck) {
    const r = await pkg.prereqCheck(t);
    if (!r.ok) {
      p.log.warn(t('install.prereqFail', { name: pkg.name, reason: r.reason }));
      return { id: pkg.id, status: 'skip', message: r.reason };
    }
  }

  let config: Record<string, string> = {};
  if (pkg.configPrompts) {
    const cfg = await pkg.configPrompts({ t });
    if (cfg === null) return { id: pkg.id, status: 'skip', message: t('app.cancelled') };
    config = cfg;
  }

  const log = p.taskLog({ title: t('install.starting', { name: pkg.name }) });
  try {
    if (reinstall) {
      log.message(t('reinstall.uninstalling'));
      await pkg.uninstall({ log, config, t });
      log.message(t('reinstall.installing'));
    }
    await pkg.install({ log, config, t });
    log.success(t('install.success', { name: pkg.name }));
    return { id: pkg.id, status: 'ok' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`${t('install.failed', { name: pkg.name })}\n${msg}`);
    return { id: pkg.id, status: 'fail', message: msg };
  }
}

function summarize(results: Result[]): void {
  const ok = results.filter((r) => r.status === 'ok');
  const fail = results.filter((r) => r.status === 'fail');
  const skip = results.filter((r) => r.status === 'skip');
  const lines = [
    pc.green(t('install.summaryOk', { count: ok.length })),
    pc.red(t('install.summaryFail', { count: fail.length })),
    pc.yellow(t('install.summarySkip', { count: skip.length })),
    '',
    ...ok.map((r) => `  ${pc.green('✓')} ${r.id}`),
    ...skip.map((r) => `  ${pc.yellow('-')} ${r.id}${r.message ? pc.dim(` (${r.message})`) : ''}`),
    ...fail.map((r) => `  ${pc.red('✗')} ${r.id}${r.message ? pc.dim(` (${r.message.split('\n')[0]})`) : ''}`),
  ];
  p.note(lines.join('\n'), t('install.summaryTitle'));
}

export async function installFlow(opts: InstallOptions = {}): Promise<void> {
  const explicit = opts.all || (opts.ids && opts.ids.length > 0);
  const targets = explicit ? selectFromIds(opts) : await selectInteractive();
  if (targets === null) {
    p.cancel(t('app.cancelled'));
    return;
  }
  if (targets.length === 0) {
    p.log.info(t('install.nothingSelected'));
    return;
  }

  // Snapshot installed-state once up front so we can decide reinstall vs fresh install per item.
  const installedMap = new Map<string, boolean>();
  await Promise.all(
    targets.map(async (pkg) => {
      installedMap.set(pkg.id, await pkg.isInstalled());
    }),
  );

  const results: Result[] = [];
  for (const pkg of targets) {
    const installed = installedMap.get(pkg.id) ?? false;
    results.push(await runOne(pkg, opts, installed));
  }
  summarize(results);
}
