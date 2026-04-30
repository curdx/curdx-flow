import type { Pkg } from '../types.ts';
import { findPlugin, getMarketplacePluginVersion, isPluginInstalled } from '../../runner/state.ts';
import {
  ensureMarketplace,
  installPluginById,
  uninstallPluginById,
  updatePluginById,
} from './_helpers.ts';

const PLUGIN_ID = 'curdx-flow@curdx';
const PLUGIN_NAME = 'curdx-flow';
const MARKETPLACE_NAME = 'curdx';
const MARKETPLACE_SOURCE = 'curdx/curdx-flow';

const curdxFlow: Pkg = {
  id: 'curdx-flow',
  name: 'curdx-flow',
  description: 'curdx-flow — spec-driven dev with autonomous task execution',
  type: 'plugin',
  required: true,
  slashNamespace: '/curdx-flow:*',
  whenToUse:
    'for spec-driven multi-task work — research → requirements → design → tasks → autonomous execution per task. Use when starting a feature that benefits from upfront spec; skip for one-shot fixes or simple edits.',
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

export default curdxFlow;
