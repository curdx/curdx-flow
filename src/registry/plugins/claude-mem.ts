import type { Pkg } from '../types.ts';
import { isPluginInstalled } from '../../runner/state.ts';
import {
  ensureMarketplace,
  installPluginById,
  uninstallPluginById,
  updatePluginById,
} from './_helpers.ts';

const PLUGIN_ID = 'claude-mem@thedotmack';
const MARKETPLACE_NAME = 'thedotmack';
const MARKETPLACE_SOURCE = 'thedotmack/claude-mem';

const claudeMem: Pkg = {
  id: 'claude-mem',
  name: 'claude-mem',
  description: 'thedotmack/claude-mem — persistent cross-session memory for Claude Code',
  type: 'plugin',
  isInstalled: () => isPluginInstalled(PLUGIN_ID),
  install: async (ctx) => {
    await ensureMarketplace(MARKETPLACE_NAME, MARKETPLACE_SOURCE, ctx);
    await installPluginById(PLUGIN_ID, ctx);
  },
  uninstall: (ctx) => uninstallPluginById(PLUGIN_ID, ctx),
  update: (ctx) => updatePluginById(PLUGIN_ID, ctx),
};

export default claudeMem;
