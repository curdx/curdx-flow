import type { Pkg } from '../types.ts';
import { findPlugin, getMarketplacePluginVersion, isPluginInstalled } from '../../runner/state.ts';
import {
  ensureMarketplace,
  installPluginById,
  uninstallPluginById,
  updatePluginById,
} from './_helpers.ts';

const PLUGIN_ID = 'pua@pua-skills';
const PLUGIN_NAME = 'pua';
const MARKETPLACE_NAME = 'pua-skills';
const MARKETPLACE_SOURCE = 'tanweai/pua';

const pua: Pkg = {
  id: 'pua',
  name: 'pua',
  description: 'tanweai/pua — Chinese Claude Code skills bundle',
  type: 'plugin',
  slashNamespace: '/pua:*',
  whenToUse:
    'auto-fires on 2+ failures or user frustration; sub-modes p7 / p9 / pro / loop. Skip on first-attempt failures or when a known fix is executing.',
  marketplaces: () => [MARKETPLACE_NAME],
  isInstalled: () => isPluginInstalled(PLUGIN_ID),
  installedVersion: async () => {
    const p = await findPlugin(PLUGIN_ID);
    const v = p?.version;
    return v && v !== 'unknown' ? v : null;
  },
  latestVersion: () => getMarketplacePluginVersion(MARKETPLACE_NAME, PLUGIN_NAME),
  install: async (ctx) => {
    await ensureMarketplace(MARKETPLACE_NAME, MARKETPLACE_SOURCE, ctx);
    await installPluginById(PLUGIN_ID, ctx);
  },
  uninstall: (ctx) => uninstallPluginById(PLUGIN_ID, ctx),
  update: (ctx) => updatePluginById(PLUGIN_ID, ctx),
};

export default pua;
