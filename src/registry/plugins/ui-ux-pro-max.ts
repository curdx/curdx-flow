import type { Pkg } from '../types.ts';
import { pluginDependencySpec } from '../../core/capabilities/catalog.ts';
import { getMarketplacePluginVersion, isPluginInstalledAtScope } from '../../runner/state.ts';
import {
  ensureMarketplace,
  installPluginById,
  PLUGIN_SCOPE,
  refreshMarketplace,
  uninstallPluginById,
  updatePluginById,
} from './_helpers.ts';

const SPEC = pluginDependencySpec('ui-ux-pro-max');
const PLUGIN_ID = SPEC.pluginId;
const PLUGIN_NAME = SPEC.name;
const MARKETPLACE_NAME = SPEC.marketplace;
const MARKETPLACE_SOURCE = SPEC.marketplaceSource;

const uiUxProMax: Pkg = {
  id: 'ui-ux-pro-max',
  name: 'ui-ux-pro-max',
  description: SPEC.description,
  type: 'plugin',
  required: true,
  whenToUse: SPEC.whenToUse,
  marketplaces: () => [MARKETPLACE_NAME],
  pluginId: PLUGIN_ID,
  isInstalled: () => isPluginInstalledAtScope(PLUGIN_ID, PLUGIN_SCOPE),
  latestVersion: () => getMarketplacePluginVersion(MARKETPLACE_NAME, PLUGIN_NAME),
  install: async (ctx) => {
    await ensureMarketplace(MARKETPLACE_NAME, MARKETPLACE_SOURCE, ctx);
    try {
      await installPluginById(PLUGIN_ID, ctx);
    } catch {
      await refreshMarketplace(MARKETPLACE_NAME, ctx);
      await installPluginById(PLUGIN_ID, ctx);
    }
  },
  uninstall: (ctx) => uninstallPluginById(PLUGIN_ID, ctx),
  update: (ctx) => updatePluginById(PLUGIN_ID, ctx),
};

export default uiUxProMax;
