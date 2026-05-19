import type { Pkg } from '../types.ts';
import { pluginDependencySpec } from '../capabilities.ts';
import { findPluginAtScope, getMarketplacePluginVersion, isPluginInstalledAtScope } from '../../runner/state.ts';
import {
  ensureMarketplace,
  installPluginById,
  PLUGIN_SCOPE,
  uninstallPluginById,
  updatePluginById,
} from './_helpers.ts';

const SPEC = pluginDependencySpec('pua');
const PLUGIN_ID = SPEC.pluginId;
const PLUGIN_NAME = SPEC.name;
const MARKETPLACE_NAME = SPEC.marketplace;
const MARKETPLACE_SOURCE = SPEC.marketplaceSource;

const pua: Pkg = {
  id: 'pua',
  name: 'pua',
  description: SPEC.description,
  type: 'plugin',
  required: true,
  slashNamespace: SPEC.slashNamespace,
  whenToUse: SPEC.whenToUse,
  marketplaces: () => [MARKETPLACE_NAME],
  pluginId: PLUGIN_ID,
  isInstalled: () => isPluginInstalledAtScope(PLUGIN_ID, PLUGIN_SCOPE),
  installedVersion: async () => {
    const p = await findPluginAtScope(PLUGIN_ID, PLUGIN_SCOPE);
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
