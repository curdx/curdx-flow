import { CURDX_PLUGIN_DEPENDENCIES } from '../../core/capabilities/catalog.ts';
import { findPluginAtScope, getMarketplacePluginVersion, isPluginInstalledAtScope } from '../../runner/state.ts';
import {
  PLUGIN_SCOPE,
  ensureMarketplace,
  installPluginById,
  uninstallPluginById,
  updatePluginById,
} from '../../runner/plugin-cli.ts';
import type { Pkg } from '../types.ts';

interface PluginSpec {
  id: string;
  name: string;
  marketplace: string;
  marketplaceSource: string;
  pluginId: string;
  description: string;
  whenToUse?: string;
  slashNamespace?: string;
  required?: boolean;
}

// curdx-flow installs itself from its own marketplace; the four companions come
// from the shared capability catalog. All are thin spec-driven wrappers over the
// native plugin-CLI primitives — there is nothing per-plugin to hand-write.
const CURDX_FLOW_SELF: PluginSpec = {
  id: 'curdx-flow',
  name: 'curdx-flow',
  marketplace: 'curdx',
  marketplaceSource: 'curdx/curdx-flow',
  pluginId: 'curdx-flow@curdx',
  description: 'curdx-flow — spec-driven dev with autonomous task execution',
  whenToUse:
    'for spec-driven multi-task work — research → requirements → design → tasks → autonomous execution per task. Use when starting a feature that benefits from upfront spec; skip for one-shot fixes or simple edits.',
  slashNamespace: '/curdx-flow:*',
  required: true,
};

function makePluginPkg(spec: PluginSpec): Pkg {
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    type: 'plugin',
    required: spec.required ?? true,
    slashNamespace: spec.slashNamespace,
    whenToUse: spec.whenToUse,
    marketplaces: () => [spec.marketplace],
    pluginId: spec.pluginId,
    isInstalled: () => isPluginInstalledAtScope(spec.pluginId, PLUGIN_SCOPE),
    installedVersion: async () => {
      const found = await findPluginAtScope(spec.pluginId, PLUGIN_SCOPE);
      const v = found?.version;
      return v && v !== 'unknown' ? v : null;
    },
    latestVersion: () => getMarketplacePluginVersion(spec.marketplace, spec.name),
    install: async (ctx) => {
      await ensureMarketplace(spec.marketplace, spec.marketplaceSource, ctx);
      await installPluginById(spec.pluginId, ctx);
    },
    uninstall: (ctx) => uninstallPluginById(spec.pluginId, ctx),
    update: (ctx) => updatePluginById(spec.pluginId, ctx),
  };
}

export function makeCatalogPluginPkgs(): Pkg[] {
  return [CURDX_FLOW_SELF, ...CURDX_PLUGIN_DEPENDENCIES].map(makePluginPkg);
}
