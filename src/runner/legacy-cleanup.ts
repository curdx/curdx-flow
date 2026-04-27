import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { clearStateCache } from './state.ts';
import type { InstallCtx } from '../registry/types.ts';

/**
 * Claude CLI's `plugin uninstall` does not always remove every artifact when the
 * marketplace's plugin id has been renamed (it can't resolve the old id in the new
 * marketplace and bails). This helper manually purges the known residues for a
 * legacy "name@marketplace" plugin slug:
 *
 *  - `~/.claude/settings.json` → `enabledPlugins[legacyId]`
 *  - `~/.claude/plugins/installed_plugins.json` → `plugins[legacyId]`
 *  - `~/.claude/plugins/cache/<marketplace>/<name>/`
 *  - `~/.claude/plugins/data/<name>-<marketplace>/`
 *
 * We deliberately leave alone `known_marketplaces.json` and `extraKnownMarketplaces`
 * — those are user-managed marketplace registrations, not plugin residue.
 *
 * Idempotent: every step swallows ENOENT silently. Other errors are reported via
 * `ctx.log.message` but never throw, so a partial purge cannot fail the install.
 */
export async function purgeLegacyPluginArtifacts(legacyId: string, ctx: InstallCtx): Promise<void> {
  const at = legacyId.indexOf('@');
  if (at <= 0 || at === legacyId.length - 1) return;
  const name = legacyId.slice(0, at);
  const marketplace = legacyId.slice(at + 1);

  const home = os.homedir();
  const settingsPath = path.join(home, '.claude', 'settings.json');
  const installedPath = path.join(home, '.claude', 'plugins', 'installed_plugins.json');
  const cacheDir = path.join(home, '.claude', 'plugins', 'cache', marketplace, name);
  const dataDir = path.join(home, '.claude', 'plugins', 'data', `${name}-${marketplace}`);

  let removedAny = false;
  removedAny = (await deleteJsonKey(settingsPath, ['enabledPlugins', legacyId], ctx)) || removedAny;
  removedAny = (await deleteJsonKey(installedPath, ['plugins', legacyId], ctx)) || removedAny;
  removedAny = (await rmDir(cacheDir, ctx)) || removedAny;
  removedAny = (await rmDir(dataDir, ctx)) || removedAny;

  if (removedAny) {
    ctx.log.message(`Purged legacy artifacts for ${legacyId}.`);
    clearStateCache();
  }
}

async function deleteJsonKey(filePath: string, keyPath: string[], ctx: InstallCtx): Promise<boolean> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    ctx.log.message(`Skip purge of ${filePath}: ${(err as Error).message}`);
    return false;
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    ctx.log.message(`Skip purge of ${filePath}: invalid JSON (${(err as Error).message})`);
    return false;
  }

  let cursor: Record<string, unknown> | undefined = json as Record<string, unknown>;
  for (let i = 0; i < keyPath.length - 1; i++) {
    const next = cursor?.[keyPath[i]!];
    if (!next || typeof next !== 'object') return false;
    cursor = next as Record<string, unknown>;
  }
  const finalKey = keyPath[keyPath.length - 1]!;
  if (!cursor || !(finalKey in cursor)) return false;

  delete cursor[finalKey];

  try {
    await fs.writeFile(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
    return true;
  } catch (err) {
    ctx.log.message(`Failed to rewrite ${filePath}: ${(err as Error).message}`);
    return false;
  }
}

async function rmDir(dirPath: string, ctx: InstallCtx): Promise<boolean> {
  try {
    await fs.access(dirPath);
  } catch {
    return false; // wasn't there, nothing to do
  }
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
    return true;
  } catch (err) {
    ctx.log.message(`Failed to remove ${dirPath}: ${(err as Error).message}`);
    return false;
  }
}
