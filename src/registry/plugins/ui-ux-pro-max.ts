import type { Pkg } from '../types.ts';
import { getMarketplacePluginVersion, isPluginInstalledAtScope } from '../../runner/state.ts';
import {
  ensureMarketplace,
  installPluginById,
  PLUGIN_SCOPE,
  refreshMarketplace,
  uninstallPluginById,
  updatePluginById,
} from './_helpers.ts';

const PLUGIN_ID = 'ui-ux-pro-max@ui-ux-pro-max-skill';
const PLUGIN_NAME = 'ui-ux-pro-max';
const MARKETPLACE_NAME = 'ui-ux-pro-max-skill';
const MARKETPLACE_SOURCE = 'nextlevelbuilder/ui-ux-pro-max-skill';

const uiUxProMax: Pkg = {
  id: 'ui-ux-pro-max',
  name: 'ui-ux-pro-max',
  description: 'nextlevelbuilder/ui-ux-pro-max-skill - UI/UX design intelligence',
  type: 'plugin',
  required: true,
  whenToUse:
    'auto-fires when building UI / UX / web components / pages. Best where visual quality, accessibility, responsive behavior, or design systems matter.',
  marketplaces: () => [MARKETPLACE_NAME],
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
