import type { Pkg } from '../types.ts';
import { isPluginInstalled } from '../../runner/state.ts';
import { installPluginById, uninstallPluginById, updatePluginById } from './_helpers.ts';

// claude-plugins-official is auto-loaded by Claude Code — no marketplace add required.
const PLUGIN_ID = 'frontend-design@claude-plugins-official';

const frontendDesign: Pkg = {
  id: 'frontend-design',
  name: 'frontend-design',
  description: 'Anthropic official — UI/frontend design helpers',
  type: 'plugin',
  isInstalled: () => isPluginInstalled(PLUGIN_ID),
  install: (ctx) => installPluginById(PLUGIN_ID, ctx),
  uninstall: (ctx) => uninstallPluginById(PLUGIN_ID, ctx),
  update: (ctx) => updatePluginById(PLUGIN_ID, ctx),
};

export default frontendDesign;
