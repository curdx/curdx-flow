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
      'frontend-design',
      'curdx-flow',
    ]);
    expect(optional).toEqual(expect.arrayContaining(['sequential-thinking', 'context7']));
  });

  test('frontend-design refreshes the official marketplace before install', () => {
    const frontendDesign = PKGS.find((pkg) => pkg.id === 'frontend-design');

    expect(frontendDesign?.marketplaces?.()).toEqual(['claude-plugins-official']);
  });
});
