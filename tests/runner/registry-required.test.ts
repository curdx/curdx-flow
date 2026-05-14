import { describe, expect, test } from 'vitest';
import { findPkg, PKGS } from '../../src/registry/index.ts';

describe('default companion bundle', () => {
  test('installer treats plugin dependencies as required and external MCPs as selectable', () => {
    const required = PKGS.filter((pkg) => pkg.required).map((pkg) => pkg.id);
    const optional = PKGS.filter((pkg) => !pkg.required).map((pkg) => pkg.id);

    expect(required).toEqual([
      'pua',
      'claude-mem',
      'chrome-devtools-mcp',
      'frontend-design',
      'ui-ux-pro-max',
      'curdx-flow',
    ]);
    expect(optional).toEqual(expect.arrayContaining(['sequential-thinking', 'context7']));
  });

  test('ui-ux-pro-max refreshes its marketplace before install', () => {
    const uiUxProMax = PKGS.find((pkg) => pkg.id === 'ui-ux-pro-max');

    expect(uiUxProMax?.marketplaces?.()).toEqual(['ui-ux-pro-max-skill']);
  });

  test('uiuxmax aliases resolve to the ui-ux-pro-max plugin package', () => {
    expect(findPkg('uiuxmax')?.id).toBe('ui-ux-pro-max');
    expect(findPkg('UIUXMAX')?.id).toBe('ui-ux-pro-max');
    expect(findPkg('ui-ux-max')?.id).toBe('ui-ux-pro-max');
  });

  test('frontend-design is installed from the official marketplace', () => {
    const frontendDesign = PKGS.find((pkg) => pkg.id === 'frontend-design');

    expect(frontendDesign?.marketplaces?.()).toEqual(['claude-plugins-official']);
    expect(findPkg('frontend')?.id).toBe('frontend-design');
    expect(findPkg('front-end-design')?.id).toBe('frontend-design');
  });
});
