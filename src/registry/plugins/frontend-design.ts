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

const PLUGIN_ID = 'frontend-design@claude-plugins-official';
const PLUGIN_NAME = 'frontend-design';
const MARKETPLACE_NAME = 'claude-plugins-official';
const MARKETPLACE_SOURCE = 'anthropics/claude-plugins-official';

const frontendDesign: Pkg = {
  id: 'frontend-design',
  name: 'frontend-design',
  description: 'Anthropic official — UI/frontend design helpers',
  type: 'plugin',
  required: true,
  whenToUse:
    'auto-fires when building UI / web components / pages. Best where visual personality matters (landing, marketing, portfolio).',
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

export default frontendDesign;
