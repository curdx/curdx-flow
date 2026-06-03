import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CURDX_EXTERNAL_MCPS,
  CURDX_PLUGIN_DEPENDENCIES,
  CURDX_TOOL_CAPABILITIES,
  canonicalPkgId,
  companionPlugins,
  externalMcps,
} from '../../src/core/capabilities/catalog.ts';
import { buildPluginDependencyReadiness } from '../../src/core/capabilities/index.ts';
import { renderBlock } from '../../src/runner/claudeMd.ts';

describe('curdx capability registry', () => {
  it('declares no hard plugin dependencies (companions are soft, runtime-detected)', () => {
    const manifest = JSON.parse(
      readFileSync('plugins/curdx-flow/.claude-plugin/plugin.json', 'utf8'),
    ) as { dependencies?: unknown };
    const marketplace = JSON.parse(
      readFileSync('.claude-plugin/marketplace.json', 'utf8'),
    ) as { allowCrossMarketplaceDependenciesOn?: unknown };

    expect(manifest.dependencies ?? []).toEqual([]);
    expect(marketplace.allowCrossMarketplaceDependenciesOn ?? []).toEqual([]);
  });

  it('companion plugins align with the dependency catalog and expose a valid pluginId', () => {
    const dependencyIds = CURDX_PLUGIN_DEPENDENCIES.map((dependency) => dependency.id).sort();
    const companionIds = companionPlugins()
      .filter((c) => c.id !== 'curdx-flow')
      .map((c) => c.id)
      .sort();

    expect(companionIds).toEqual(dependencyIds);

    // curdx-flow self + every companion must be installable: required, valid
    // name@marketplace pluginId (the ensure-enabled sweep relies on it), and a
    // non-empty marketplace source for `claude plugin marketplace add`.
    for (const c of companionPlugins()) {
      expect(c.required, c.id).toBe(true);
      expect(c.pluginId, `${c.id} pluginId`).toMatch(/^[^@/\s]+@[^@/\s]+$/);
      expect(c.marketplaceSource.length, `${c.id} marketplaceSource`).toBeGreaterThan(0);
    }
  });

  it('keeps external MCPs out of plugin dependencies and manifest dependency metadata', () => {
    const manifest = JSON.parse(
      readFileSync('plugins/curdx-flow/.claude-plugin/plugin.json', 'utf8'),
    ) as { dependencies?: Array<{ name?: string; marketplace?: string }> };
    const manifestDependencyNames = new Set((manifest.dependencies ?? []).map((item) => item.name));
    const pluginDependencyIds = new Set<string>(CURDX_PLUGIN_DEPENDENCIES.map((dependency) => dependency.id));

    const externalMcpIds = new Set(externalMcps().map((spec) => spec.id));
    for (const mcp of CURDX_EXTERNAL_MCPS) {
      expect(pluginDependencyIds.has(mcp.id)).toBe(false);
      expect(manifestDependencyNames.has(mcp.id)).toBe(false);
      // detect-only: present in the external-MCP set, never an installable plugin companion.
      expect(externalMcpIds.has(mcp.id)).toBe(true);
      expect(companionPlugins().some((c) => c.id === mcp.id)).toBe(false);
      expect(CURDX_TOOL_CAPABILITIES[mcp.id].provisioning).toBe('external-mcp');
    }
  });

  it('surfaces dependency declaration drift as release blockers', () => {
    const manifestDependencies = CURDX_PLUGIN_DEPENDENCIES.map((dependency) => ({
      name: dependency.name,
      marketplace: dependency.id === 'pua' ? 'wrong-marketplace' : dependency.marketplace,
    }));
    const facts = buildPluginDependencyReadiness({
      expected: CURDX_PLUGIN_DEPENDENCIES,
      manifestDependencies,
      marketplaceAllowlist: CURDX_PLUGIN_DEPENDENCIES
        .filter((dependency) => dependency.id !== 'pua')
        .map((dependency) => dependency.marketplace),
      pluginListJson: JSON.stringify([
        { id: 'pua@wrong-marketplace', version: '1.0.0', scope: 'user', enabled: true },
      ]),
      pluginListSource: 'fixture',
      pluginListExitCode: 0,
    });

    const pua = facts.dependencies.find((dependency) => dependency.id === 'pua');
    expect(pua).toMatchObject({
      readiness: 'unavailable',
      blocksRelease: true,
      marketplaceMatches: false,
      crossMarketplaceAllowlisted: false,
    });
    expect(pua?.drift).toEqual(expect.arrayContaining([
      'manifest-marketplace-mismatch',
      'marketplace-allowlist-missing',
      'plugin-id-mismatch',
    ]));
  });

  it('routes ui-ux-pro-max name variants and no longer aliases legacy frontend-design names', () => {
    expect(canonicalPkgId('uiuxmax')).toBe('ui-ux-pro-max');
    expect(canonicalPkgId('ui-ux-max')).toBe('ui-ux-pro-max');
    expect(canonicalPkgId('ui ux pro max')).toBe('ui-ux-pro-max');
    expect(canonicalPkgId('frontend')).toBe('frontend');
    expect(canonicalPkgId('frontend-design')).toBe('frontend-design');
    expect(canonicalPkgId('frontend design')).toBe('frontend design');
  });

  it('renders CLAUDE.md rules from the shared capability source', () => {
    const block = renderBlock([
      { id: 'curdx-flow', name: 'curdx-flow', type: 'plugin' },
      { id: 'ui-ux-pro-max', name: 'ui-ux-pro-max', type: 'plugin' },
      { id: 'chrome-devtools-mcp', name: 'chrome-devtools-mcp', type: 'plugin' },
    ]);

    expect(block).toContain('ui-ux-pro-max plugin skills');
    expect(block).toContain('Chrome DevTools MCP');
    expect(block).not.toContain(['frontend', 'design'].join('-'));
  });
});
