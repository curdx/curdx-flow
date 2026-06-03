import { runStreaming, ensureOk, type CmdResult } from './exec.ts';
import { clearStateCache, isMarketplaceAdded, isPluginInstalledAtScope } from './state.ts';
import type { InstallCtx } from '../registry/types.ts';

export const PLUGIN_SCOPE = 'user';

export async function ensureMarketplace(
  marketplaceName: string,
  marketplaceSource: string,
  ctx: InstallCtx,
): Promise<void> {
  if (await isMarketplaceAdded(marketplaceName)) return;
  const r = await runStreaming('claude', ['plugin', 'marketplace', 'add', marketplaceSource], ctx.log);
  ensureOk(r, `marketplace add ${marketplaceSource}`);
  clearStateCache();
}

export async function refreshMarketplace(marketplaceName: string, ctx: InstallCtx): Promise<void> {
  const r = await runStreaming('claude', ['plugin', 'marketplace', 'update', marketplaceName], ctx.log);
  ensureOk(r, `marketplace update ${marketplaceName}`);
  clearStateCache();
}

// `claude plugin install` only writes the install record; it does NOT flip
// settings.json#enabledPlugins[id] to true, so the plugin's skills never load
// in Claude Code until enabled. Always pair install (and update, which
// preserves but never enables) with an explicit enable that tolerates the
// already-enabled non-zero exit.
export async function enablePluginById(pluginId: string, ctx: InstallCtx): Promise<void> {
  const r = await runStreaming('claude', ['plugin', 'enable', pluginId, '--scope', PLUGIN_SCOPE], ctx.log);
  if (r.exitCode === 0 || isAlreadyEnabled(r)) {
    clearStateCache();
    return;
  }
  ensureOk(r, `plugin enable ${pluginId}`);
}

function isAlreadyEnabled(r: CmdResult): boolean {
  return `${r.stdout}\n${r.stderr}`.toLowerCase().includes('already enabled');
}

export async function installPluginById(pluginId: string, ctx: InstallCtx): Promise<void> {
  const r = await runStreaming('claude', ['plugin', 'install', pluginId, '--scope', PLUGIN_SCOPE], ctx.log);
  ensureOk(r, `plugin install ${pluginId}`);
  clearStateCache();
  await enablePluginById(pluginId, ctx);
}

export async function uninstallPluginById(pluginId: string, ctx: InstallCtx): Promise<void> {
  if (!(await isPluginInstalledAtScope(pluginId, PLUGIN_SCOPE))) return;
  const r = await runStreaming('claude', ['plugin', 'uninstall', pluginId, '--scope', PLUGIN_SCOPE], ctx.log);
  ensureOk(r, `plugin uninstall ${pluginId}`);
  clearStateCache();
}

export async function updatePluginById(pluginId: string, ctx: InstallCtx): Promise<void> {
  const r = await runStreaming('claude', ['plugin', 'update', pluginId, '--scope', PLUGIN_SCOPE], ctx.log);
  ensureOk(r, `plugin update ${pluginId}`);
  clearStateCache();
  await enablePluginById(pluginId, ctx);
}
