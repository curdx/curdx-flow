import { runStreaming, ensureOk } from '../../runner/exec.ts';
import { clearStateCache, findPlugin, isMarketplaceAdded } from '../../runner/state.ts';
import type { InstallCtx } from '../types.ts';

const INSTALL_SCOPE = 'user';
const UPDATE_SCOPES = new Set(['user', 'project', 'local', 'managed']);
const UNINSTALL_SCOPES = new Set(['user', 'project', 'local']);

async function installedScopeArgs(pluginId: string, allowedScopes: Set<string>): Promise<string[]> {
  const plugin = await findPlugin(pluginId);
  const scope = plugin?.scope;
  if (!scope) return [];
  if (!allowedScopes.has(scope)) {
    throw new Error(`Plugin "${pluginId}" is installed at unsupported scope "${scope}" for this operation.`);
  }
  return ['--scope', scope];
}

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
  const r = await runStreaming('claude', ['plugin', 'install', pluginId, '--scope', INSTALL_SCOPE], ctx.log);
  ensureOk(r, `plugin install ${pluginId}`);
  clearStateCache();
}

export async function uninstallPluginById(pluginId: string, ctx: InstallCtx): Promise<void> {
  const scopeArgs = await installedScopeArgs(pluginId, UNINSTALL_SCOPES);
  if (scopeArgs.length === 0) return;
  const r = await runStreaming('claude', ['plugin', 'uninstall', pluginId, ...scopeArgs], ctx.log);
  ensureOk(r, `plugin uninstall ${pluginId}`);
  clearStateCache();
}

export async function updatePluginById(pluginId: string, ctx: InstallCtx): Promise<void> {
  const scopeArgs = await installedScopeArgs(pluginId, UPDATE_SCOPES);
  const r = await runStreaming('claude', ['plugin', 'update', pluginId, ...scopeArgs], ctx.log);
  ensureOk(r, `plugin update ${pluginId}`);
  clearStateCache();
}
