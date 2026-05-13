import { describe, expect, test } from 'vitest';
import { PKGS } from '../../src/registry/index.ts';

describe('default companion bundle', () => {
  test('installer treats plugin dependencies as required and external MCPs as selectable', () => {
    const required = PKGS.filter((pkg) => pkg.required).map((pkg) => pkg.id);
    const optional = PKGS.filter((pkg) => !pkg.required).map((pkg) => pkg.id);

    expect(required).toEqual([
      'pua',
      'claude-mem',
      'chrome-devtools-mcp',
      'ui-ux-pro-max',
      'curdx-flow',
    ]);
    expect(optional).toEqual(expect.arrayContaining(['sequential-thinking', 'context7']));
  });

  test('ui-ux-pro-max refreshes its marketplace before install', () => {
    const uiUxProMax = PKGS.find((pkg) => pkg.id === 'ui-ux-pro-max');

    expect(uiUxProMax?.marketplaces?.()).toEqual(['ui-ux-pro-max-skill']);
  });
});
