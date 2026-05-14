import type { Pkg } from '../types.ts';
import { pluginDependencySpec } from '../capabilities.ts';
import { findPluginAtScope, getMarketplacePluginVersion, isPluginInstalledAtScope } from '../../runner/state.ts';
import { ensureBun } from '../../runner/ensureBun.ts';
import {
  ensureMarketplace,
  installPluginById,
  PLUGIN_SCOPE,
  uninstallPluginById,
  updatePluginById,
} from './_helpers.ts';

const SPEC = pluginDependencySpec('claude-mem');
const PLUGIN_ID = SPEC.pluginId;
const PLUGIN_NAME = SPEC.name;
const MARKETPLACE_NAME = SPEC.marketplace;
const MARKETPLACE_SOURCE = SPEC.marketplaceSource;

const claudeMem: Pkg = {
  id: 'claude-mem',
  name: 'claude-mem',
  description: SPEC.description,
  type: 'plugin',
  required: true,
  slashNamespace: SPEC.slashNamespace,
  whenToUse: SPEC.whenToUse,
  marketplaces: () => [MARKETPLACE_NAME],
  prereqCheck: (t) => ensureBun(t),
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

export default claudeMem;
