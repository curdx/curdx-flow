import * as p from '@clack/prompts';
import pc from 'picocolors';
import { companionPlugins, canonicalPkgId, type PluginCompanion } from '../core/capabilities/catalog.ts';
import { ensureBun } from '../runner/ensureBun.ts';
import { t, type Translate } from '../i18n/index.ts';
import {
  findPluginAtScope,
  getMarketplacePluginVersion,
  isPluginEnabled,
  isPluginInstalledAtScope,
  listPlugins,
  refreshMarketplaces,
} from '../runner/state.ts';
import {
  PLUGIN_SCOPE,
  ensureMarketplace,
  enablePluginById,
  installPluginById,
  uninstallPluginById,
  updatePluginById,
} from '../runner/plugin-cli.ts';
import type { InstallCtx, PrereqResult } from '../runner/types.ts';
import { syncFromState } from '../runner/claudeMd.ts';

// Companion prerequisite guards (native-first keeps this minimal — a side-table keyed by
// companion id, so the catalog stays data-only). claude-mem's worker requires Bun; the
// bootstrap is the convenience path where users expect that hand-holding. Native
// `claude plugin install` has no such guard.
const PREREQS: Record<string, (t: Translate, opts: { assumeYes?: boolean }) => Promise<PrereqResult>> = {
  'claude-mem': ensureBun,
};

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

function ctxFor(log: ReturnType<typeof p.taskLog>): InstallCtx {
  return { log, config: {}, t };
}

function findCompanion(id: string): PluginCompanion | undefined {
  const canonical = canonicalPkgId(id);
  return companionPlugins().find((c) => c.id === canonical);
}

async function deriveState(c: PluginCompanion): Promise<DerivedState> {
  if (!(await isPluginInstalledAtScope(c.pluginId, PLUGIN_SCOPE))) return { kind: 'not_installed' };
  const found = await findPluginAtScope(c.pluginId, PLUGIN_SCOPE);
  const installed = found?.version && found.version !== 'unknown' ? found.version : null;
  const latest = await getMarketplacePluginVersion(c.marketplace, c.name);
  if (installed && latest && installed !== latest) {
    return { kind: 'update_available', current: installed, latest };
  }
  return { kind: 'up_to_date', version: installed };
}

function stateLabel(c: PluginCompanion, s: DerivedState): string {
  const head = `${c.name} ${pc.dim('(plugin)')}`;
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

async function selectInteractive(states: Map<string, DerivedState>): Promise<PluginCompanion[] | null> {
  const all = companionPlugins();
  const requiredPkgs = all.filter((c) => c.required);
  const optionalPkgs = all.filter((c) => !c.required);

  if (requiredPkgs.length > 0) {
    const lines = requiredPkgs.map((c) => `  ${stateLabel(c, states.get(c.id)!)}`);
    p.note(lines.join('\n'), t('install.requiredHeader'));
  }

  let userPicked: PluginCompanion[] = [];
  if (optionalPkgs.length > 0) {
    const options = optionalPkgs.map((c) => {
      const s = states.get(c.id)!;
      return { value: c.id, label: stateLabel(c, s), hint: c.description };
    });
    const initialValues = optionalPkgs
      .filter((c) => {
        const s = states.get(c.id)!;
        return s.kind === 'not_installed' || s.kind === 'update_available';
      })
      .map((c) => c.id);

    const picked = await p.multiselect<string>({
      message: t('install.selectPrompt'),
      options,
      initialValues,
      required: false,
    });
    if (p.isCancel(picked)) return null;
    userPicked = (picked as string[]).map((id) => findCompanion(id)).filter((x): x is PluginCompanion => Boolean(x));
  }

  // Required pkgs that need action (not_installed / update_available) are auto-included.
  // Up-to-date required pkgs are silently skipped — there's nothing to do.
  const requiredAuto = requiredPkgs.filter((c) => states.get(c.id)?.kind !== 'up_to_date');
  return [...requiredAuto, ...userPicked];
}

function selectFromIds(opts: InstallOptions): PluginCompanion[] {
  if (opts.all) return [...companionPlugins()];
  if (!opts.ids || opts.ids.length === 0) return [];
  const found: PluginCompanion[] = [];
  for (const id of opts.ids) {
    const c = findCompanion(id);
    if (c) found.push(c);
    else p.log.warn(`Unknown id: ${id}`);
  }
  return found;
}

async function runOne(c: PluginCompanion, state: DerivedState, opts: InstallOptions): Promise<Result> {
  let mode: 'install' | 'update' | 'reinstall';
  if (state.kind === 'not_installed') {
    mode = 'install';
  } else if (state.kind === 'update_available') {
    mode = 'update';
  } else {
    // up_to_date — selected explicitly. Ask before nuking.
    if (!opts.yes) {
      const ans = await p.confirm({
        message: t('install.confirmReinstall', { name: c.name }),
        initialValue: false,
      });
      if (p.isCancel(ans) || ans === false) {
        return { id: c.id, status: 'skip', message: t('install.skippedReinstall', { name: c.name }) };
      }
    }
    mode = 'reinstall';
  }

  const prereq = PREREQS[c.id];
  if (prereq) {
    const r = await prereq(t, { assumeYes: opts.yes === true });
    if (!r.ok) {
      p.log.warn(t('install.prereqFail', { name: c.name, reason: r.reason }));
      return { id: c.id, status: 'skip', message: r.reason };
    }
  }

  const titleKey = mode === 'update' ? 'install.updating' : 'install.starting';
  const titleVars: Record<string, string> = { name: c.name };
  if (mode === 'update' && state.kind === 'update_available') {
    titleVars['version'] = state.latest;
  }
  const log = p.taskLog({ title: t(titleKey, titleVars) });
  const ctx = ctxFor(log);

  try {
    if (mode === 'reinstall') {
      log.message(t('reinstall.uninstalling'));
      await uninstallPluginById(c.pluginId, ctx);
      log.message(t('reinstall.installing'));
      await ensureMarketplace(c.marketplace, c.marketplaceSource, ctx);
      await installPluginById(c.pluginId, ctx);
    } else if (mode === 'update') {
      await updatePluginById(c.pluginId, ctx);
    } else {
      await ensureMarketplace(c.marketplace, c.marketplaceSource, ctx);
      await installPluginById(c.pluginId, ctx);
    }
    log.success(t('install.success', { name: c.name }));
    return { id: c.id, status: 'ok' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`${t('install.failed', { name: c.name })}\n${msg}`);
    return { id: c.id, status: 'fail', message: msg };
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

// Post-install safety-net: ensure every installed companion plugin is also enabled in
// ~/.claude/settings.json#enabledPlugins. `claude plugin install` writes the install
// record but does not flip enabled, so a disabled-but-installed plugin's skills never
// load. One cheap `isPluginEnabled` probe per companion, `claude plugin enable` only for
// the ones actually disabled. Guarantees the bootstrap enables curdx-flow even when its
// state resolved to up_to_date.
async function ensureInstalledPluginsEnabled(): Promise<void> {
  const toEnable: PluginCompanion[] = [];
  for (const c of companionPlugins()) {
    if (!(await isPluginInstalledAtScope(c.pluginId, PLUGIN_SCOPE))) continue;
    if (await isPluginEnabled(c.pluginId)) continue;
    toEnable.push(c);
  }
  if (toEnable.length === 0) return;

  const log = p.taskLog({
    title: `Enabling ${toEnable.length} installed plugin${toEnable.length === 1 ? '' : 's'} that ${toEnable.length === 1 ? 'was' : 'were'} disabled`,
  });
  const ctx = ctxFor(log);
  let enabled = 0;
  const failures: string[] = [];
  for (const c of toEnable) {
    log.message(`enable ${c.name} (${c.pluginId})`);
    try {
      await enablePluginById(c.pluginId, ctx);
      enabled++;
    } catch (err) {
      failures.push(`${c.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (failures.length === 0) {
    log.success(`Enabled ${enabled} plugin${enabled === 1 ? '' : 's'}. Restart Claude Code to apply.`);
  } else {
    log.error(`Enabled ${enabled}/${toEnable.length}; failed:\n${failures.join('\n')}`);
  }
}

async function maybeRefreshMarketplaces(opts: InstallOptions): Promise<void> {
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

export async function installFlow(opts: InstallOptions = {}): Promise<void> {
  // Default: sync CLAUDE.md at end of flow regardless of whether anything was actually
  // installed — first run after upgrade may have everything installed already and we
  // still want the managed block current. Only explicit cancellation suppresses the sync.
  let userCancelled = false;
  try {
    await maybeRefreshMarketplaces(opts);

    const explicit = opts.all || (opts.ids && opts.ids.length > 0);
    const candidates = explicit ? selectFromIds(opts) : [...companionPlugins()];
    if (candidates.length === 0) {
      p.log.info(t('install.nothingSelected'));
      return;
    }

    // Required pkgs must enter the state map even if --ids omits them, so we can decide
    // whether they need action. --all already covers everything.
    if (opts.ids && opts.ids.length > 0) {
      for (const c of companionPlugins()) {
        if (c.required && !candidates.some((x) => x.id === c.id)) candidates.push(c);
      }
    }

    const stateMap = new Map<string, DerivedState>();
    const sp = p.spinner();
    sp.start(t('state.checking'));
    try {
      await listPlugins();
      await Promise.all(
        candidates.map(async (c) => {
          stateMap.set(c.id, await deriveState(c));
        }),
      );
    } finally {
      sp.stop(t('state.checked', { count: candidates.length }));
    }

    let targets: PluginCompanion[];
    if (explicit) {
      if (opts.ids && opts.ids.length > 0) {
        const userListedIds = new Set(opts.ids.map((id) => canonicalPkgId(id)));
        targets = candidates.filter((c) => {
          if (!c.required) return true;
          if (userListedIds.has(c.id)) return true;
          return stateMap.get(c.id)?.kind !== 'up_to_date';
        });
      } else {
        targets = candidates;
      }
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
    for (const c of targets) {
      const state = stateMap.get(c.id) ?? { kind: 'not_installed' as const };
      results.push(await runOne(c, state, opts));
    }
    summarize(results);
  } finally {
    if (!userCancelled) {
      await ensureInstalledPluginsEnabled();
      await syncFromState({ skip: opts.noClaudeMd });
    }
  }
}
