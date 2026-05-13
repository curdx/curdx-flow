import type { Pkg } from '../types.ts';
import { findPluginAtScope, getMarketplacePluginVersion, isPluginInstalledAtScope } from '../../runner/state.ts';
import { ensureBun } from '../../runner/ensureBun.ts';
import {
  ensureMarketplace,
  installPluginById,
  PLUGIN_SCOPE,
  uninstallPluginById,
  updatePluginById,
} from './_helpers.ts';

const PLUGIN_ID = 'claude-mem@thedotmack';
const PLUGIN_NAME = 'claude-mem';
const MARKETPLACE_NAME = 'thedotmack';
const MARKETPLACE_SOURCE = 'thedotmack/claude-mem';

const claudeMem: Pkg = {
  id: 'claude-mem',
  name: 'claude-mem',
  description: 'thedotmack/claude-mem — persistent cross-session memory for Claude Code',
  type: 'plugin',
  required: true,
  slashNamespace: '/claude-mem:*',
  whenToUse:
    'for cross-session memory search ("did we solve this before?"), phased planning (`make-plan`), or phased execution (`do`).',
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
