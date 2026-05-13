import { runStreaming, ensureOk } from '../../runner/exec.ts';
import { clearStateCache, isMarketplaceAdded, isPluginInstalledAtScope } from '../../runner/state.ts';
import type { InstallCtx } from '../types.ts';

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

export async function installPluginById(pluginId: string, ctx: InstallCtx): Promise<void> {
  const r = await runStreaming('claude', ['plugin', 'install', pluginId, '--scope', PLUGIN_SCOPE], ctx.log);
  ensureOk(r, `plugin install ${pluginId}`);
  clearStateCache();
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
}
