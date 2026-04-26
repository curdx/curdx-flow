import { runStreaming, ensureOk } from '../../runner/exec.ts';
import { isMarketplaceAdded, isPluginInstalled, clearStateCache } from '../../runner/state.ts';
import type { InstallCtx } from '../types.ts';

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

export async function installPluginById(pluginId: string, ctx: InstallCtx): Promise<void> {
  const r = await runStreaming('claude', ['plugin', 'install', pluginId], ctx.log);
  ensureOk(r, `plugin install ${pluginId}`);
  clearStateCache();
}

export async function uninstallPluginById(pluginId: string, ctx: InstallCtx): Promise<void> {
  if (!(await isPluginInstalled(pluginId))) return;
  const r = await runStreaming('claude', ['plugin', 'uninstall', pluginId], ctx.log);
  ensureOk(r, `plugin uninstall ${pluginId}`);
  clearStateCache();
}

export async function updatePluginById(pluginId: string, ctx: InstallCtx): Promise<void> {
  const r = await runStreaming('claude', ['plugin', 'update', pluginId], ctx.log);
  ensureOk(r, `plugin update ${pluginId}`);
  clearStateCache();
}
