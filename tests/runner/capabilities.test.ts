import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CURDX_EXTERNAL_MCPS,
  CURDX_PLUGIN_DEPENDENCIES,
  CURDX_TOOL_CAPABILITIES,
  canonicalPkgId,
} from '../../src/registry/capabilities.ts';
import { PKGS } from '../../src/registry/index.ts';
import { buildPluginDependencyReadiness } from '../../src/core/capabilities/index.ts';
import { renderBlock } from '../../src/runner/claudeMd.ts';

describe('curdx capability registry', () => {
  it('keeps plugin manifest dependencies aligned to the source registry', () => {
    const manifest = JSON.parse(
      readFileSync('plugins/curdx-flow/.claude-plugin/plugin.json', 'utf8'),
    ) as { dependencies?: Array<{ name?: string; marketplace?: string }> };
    const marketplace = JSON.parse(
      readFileSync('.claude-plugin/marketplace.json', 'utf8'),
    ) as { allowCrossMarketplaceDependenciesOn?: string[] };

    const expected = CURDX_PLUGIN_DEPENDENCIES.map(({ name, marketplace }) => ({ name, marketplace }));

    expect(manifest.dependencies).toEqual(expected);
    expect(marketplace.allowCrossMarketplaceDependenciesOn).toEqual(
      expected.map((dependency) => dependency.marketplace),
    );
  });

  it('keeps plugin registry modules aligned with dependency specs', () => {
    const dependencyIds = CURDX_PLUGIN_DEPENDENCIES.map((dependency) => dependency.id).sort();
    const pluginPackages = PKGS
      .filter((pkg) => pkg.type === 'plugin' && pkg.id !== 'curdx-flow')
      .map((pkg) => pkg.id)
      .sort();

    expect(pluginPackages).toEqual(dependencyIds);

    for (const dependency of CURDX_PLUGIN_DEPENDENCIES) {
      const pkg = PKGS.find((item) => item.id === dependency.id);
      expect(pkg, dependency.id).toBeDefined();
      expect(pkg?.type).toBe('plugin');
      expect(pkg?.required).toBe(true);
      expect(pkg?.marketplaces?.()).toContain(dependency.marketplace);
    }
  });

  it('keeps external MCPs out of plugin dependencies and manifest dependency metadata', () => {
    const manifest = JSON.parse(
      readFileSync('plugins/curdx-flow/.claude-plugin/plugin.json', 'utf8'),
    ) as { dependencies?: Array<{ name?: string; marketplace?: string }> };
    const manifestDependencyNames = new Set((manifest.dependencies ?? []).map((item) => item.name));
    const pluginDependencyIds = new Set<string>(CURDX_PLUGIN_DEPENDENCIES.map((dependency) => dependency.id));

    for (const mcp of CURDX_EXTERNAL_MCPS) {
      expect(pluginDependencyIds.has(mcp.id)).toBe(false);
      expect(manifestDependencyNames.has(mcp.id)).toBe(false);
      expect(PKGS.find((pkg) => pkg.id === mcp.id)?.type).toBe('mcp');
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
