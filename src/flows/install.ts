import * as p from '@clack/prompts';
import pc from 'picocolors';
import { PKGS, findPkg } from '../registry/index.ts';
import type { Pkg } from '../registry/types.ts';
import { t } from '../i18n/index.ts';
import { listMcp, listPlugins, refreshMarketplaces } from '../runner/state.ts';
import { syncFromState } from '../runner/claudeMd.ts';

export type InstallOptions = {
  ids?: string[];
  all?: boolean;
  yes?: boolean;
  noRefresh?: boolean;
  noClaudeMd?: boolean;
};

type DerivedState =
  | { kind: 'not_installed' }
  | { kind: 'up_to_date'; version: string | null }
  | { kind: 'update_available'; current: string; latest: string };

type Result = { id: string; status: 'ok' | 'fail' | 'skip'; message?: string };

async function deriveState(pkg: Pkg): Promise<DerivedState> {
  if (!(await pkg.isInstalled())) return { kind: 'not_installed' };
  const [installed, latest] = await Promise.all([
    pkg.installedVersion?.() ?? Promise.resolve(null),
    pkg.latestVersion?.() ?? Promise.resolve(null),
  ]);
  if (installed && latest && installed !== latest) {
    return { kind: 'update_available', current: installed, latest };
  }
  return { kind: 'up_to_date', version: installed };
}

function stateLabel(pkg: Pkg, s: DerivedState): string {
  const head = `${pkg.name} ${pc.dim(`(${pkg.type})`)}`;
  switch (s.kind) {
    case 'not_installed':
      return `${head}  ${pc.yellow(`✗ ${t('pkg.notInstalled')}`)}`;
    case 'up_to_date':
      return `${head}  ${pc.green(
        s.version ? `✓ ${t('pkg.upToDateWithVersion', { version: s.version })}` : `✓ ${t('pkg.installed')}`,
      )}`;
    case 'update_available':
      return `${head}  ${pc.cyan(
        `↑ ${t('pkg.updateAvailable', { current: s.current, latest: s.latest })}`,
      )}`;
  }
}

async function selectInteractive(
  states: Map<string, DerivedState>,
): Promise<Pkg[] | null> {
  const options = PKGS.map((pkg) => {
    const s = states.get(pkg.id)!;
    return { value: pkg.id, label: stateLabel(pkg, s), hint: pkg.description };
  });
  const initialValues = PKGS
    .filter((pkg) => {
      const s = states.get(pkg.id)!;
      return s.kind === 'not_installed' || s.kind === 'update_available';
    })
    .map((pkg) => pkg.id);

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

async function runOne(pkg: Pkg, state: DerivedState, opts: InstallOptions): Promise<Result> {
  // Reinstall confirmation only applies to up_to_date items the user selected anyway.
  let mode: 'install' | 'update' | 'reinstall';
  if (state.kind === 'not_installed') {
    mode = 'install';
  } else if (state.kind === 'update_available') {
    mode = 'update';
  } else {
    // up_to_date — selected explicitly. Ask before nuking.
    if (!opts.yes) {
      const ans = await p.confirm({
        message: t('install.confirmReinstall', { name: pkg.name }),
        initialValue: false,
      });
      if (p.isCancel(ans) || ans === false) {
        return { id: pkg.id, status: 'skip', message: t('install.skippedReinstall', { name: pkg.name }) };
      }
    }
    mode = 'reinstall';
  }

  if (pkg.prereqCheck) {
    const r = await pkg.prereqCheck(t);
    if (!r.ok) {
      p.log.warn(t('install.prereqFail', { name: pkg.name, reason: r.reason }));
      return { id: pkg.id, status: 'skip', message: r.reason };
    }
  }

  let config: Record<string, string> = {};
  if (pkg.configPrompts && mode !== 'update') {
    // Don't re-prompt config on update — keep existing settings.
    const cfg = await pkg.configPrompts({ t });
    if (cfg === null) return { id: pkg.id, status: 'skip', message: t('app.cancelled') };
    config = cfg;
  }

  const titleKey = mode === 'update' ? 'install.updating' : 'install.starting';
  const titleVars: Record<string, string> = { name: pkg.name };
  if (mode === 'update' && state.kind === 'update_available') {
    titleVars['version'] = state.latest;
  }
  const log = p.taskLog({ title: t(titleKey, titleVars) });

  try {
    if (mode === 'reinstall') {
      log.message(t('reinstall.uninstalling'));
      await pkg.uninstall({ log, config, t });
      log.message(t('reinstall.installing'));
      await pkg.install({ log, config, t });
    } else if (mode === 'update') {
      if (pkg.update) {
        await pkg.update({ log, config, t });
      } else {
        log.message(t('reinstall.uninstalling'));
        await pkg.uninstall({ log, config, t });
        log.message(t('reinstall.installing'));
        await pkg.install({ log, config, t });
      }
    } else {
      await pkg.install({ log, config, t });
    }
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

async function maybeRefreshMarketplaces(opts: InstallOptions): Promise<void> {
  if (opts.noRefresh) return;
  const names = new Set<string>();
  for (const pkg of PKGS) {
    if (pkg.marketplaces) for (const n of pkg.marketplaces()) names.add(n);
  }
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

export async function installFlow(opts: InstallOptions = {}): Promise<void> {
  // Default: sync CLAUDE.md at end of flow regardless of whether anything was
  // actually installed — the user may be running this for the first time after
  // upgrading flow with everything already installed, and we still want the
  // managed block to reflect current state. Only an explicit user cancellation
  // (Ctrl+C / multiselect cancel) suppresses the sync.
  let userCancelled = false;
  try {
    await maybeRefreshMarketplaces(opts);

    const explicit = opts.all || (opts.ids && opts.ids.length > 0);
    const candidates = explicit ? selectFromIds(opts) : [...PKGS];
    if (candidates.length === 0) {
      p.log.info(t('install.nothingSelected'));
      return;
    }

    // Derive state for everything (used both for label rendering and for dispatch).
    // Wrap in spinner: this triggers `claude plugin list --json` + `claude mcp list`
    // (the latter does an MCP server health check, can take 5-15s).
    const stateMap = new Map<string, DerivedState>();
    const sp = p.spinner();
    sp.start(t('state.checking'));
    try {
      // Warm both list caches in parallel; subsequent per-pkg checks are in-memory.
      await Promise.all([listPlugins(), listMcp()]);
      await Promise.all(
        candidates.map(async (pkg) => {
          stateMap.set(pkg.id, await deriveState(pkg));
        }),
      );
    } finally {
      sp.stop(t('state.checked', { count: candidates.length }));
    }

    let targets: Pkg[];
    if (explicit) {
      targets = candidates;
    } else {
      const picked = await selectInteractive(stateMap);
      if (picked === null) {
        userCancelled = true;
        p.cancel(t('app.cancelled'));
        return;
      }
      targets = picked;
    }

    if (targets.length === 0) {
      p.log.info(t('install.nothingSelected'));
      return;
    }

    const results: Result[] = [];
    for (const pkg of targets) {
      const state = stateMap.get(pkg.id) ?? { kind: 'not_installed' as const };
      results.push(await runOne(pkg, state, opts));
    }
    summarize(results);
  } finally {
    if (!userCancelled) {
      await syncFromState({ skip: opts.noClaudeMd });
    }
  }
}
