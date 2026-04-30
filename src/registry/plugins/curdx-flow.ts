import type { Pkg, InstallCtx } from '../types.ts';
import { findPlugin, getMarketplacePluginVersion, isPluginInstalled } from '../../runner/state.ts';
import { purgeLegacyPluginArtifacts } from '../../runner/legacy-cleanup.ts';
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

// v3.x slugs of the same plugin under earlier names. We auto-uninstall these on
// install/update of the new slug so users on v3.4 / v3.5 transparently migrate.
const LEGACY_PLUGIN_IDS = ['ralph-specum@curdx-flow', 'ralph-specum@smart-ralph'];

async function uninstallLegacyIfPresent(ctx: InstallCtx): Promise<void> {
  for (const legacyId of LEGACY_PLUGIN_IDS) {
    const installed = await isPluginInstalled(legacyId);
    if (installed) {
      ctx.log.message(`Removing legacy plugin ${legacyId} (renamed to ${PLUGIN_ID})…`);
      await uninstallPluginById(legacyId, ctx);
    }
    // Always run the purge even when isPluginInstalled returned false: `claude
    // plugin uninstall` is unreliable when the marketplace's plugin id has been
    // renamed (it can't resolve the legacy id and bails), leaving cache/settings
    // residue. The purge is idempotent — no-op when nothing's there.
    await purgeLegacyPluginArtifacts(legacyId, ctx);
  }
}

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
    await uninstallLegacyIfPresent(ctx);
    await ensureMarketplace(MARKETPLACE_NAME, MARKETPLACE_SOURCE, ctx);
    await installPluginById(PLUGIN_ID, ctx);
  },
  uninstall: (ctx) => uninstallPluginById(PLUGIN_ID, ctx),
  update: async (ctx) => {
    await uninstallLegacyIfPresent(ctx);
    await updatePluginById(PLUGIN_ID, ctx);
  },
};

export default curdxFlow;
