import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CURDX_PLUGIN_DEPENDENCIES,
  canonicalPkgId,
} from '../../src/registry/capabilities.ts';
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

  it('routes frontend design aliases to ui-ux-pro-max only', () => {
    const removedDesignId = ['frontend', 'design'].join('-');
    expect(canonicalPkgId('frontend design')).toBe('ui-ux-pro-max');
    expect(canonicalPkgId('uiuxmax')).toBe('ui-ux-pro-max');
    expect(canonicalPkgId(removedDesignId)).toBe(removedDesignId);
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
