import { describe, expect, test } from 'vitest';
import { PKGS } from '../../src/registry/index.ts';

describe('default companion bundle', () => {
  test('installer treats every bundled capability as required', () => {
    const required = PKGS.filter((pkg) => pkg.required).map((pkg) => pkg.id);

    expect(required).toEqual([
      'pua',
      'claude-mem',
      'chrome-devtools-mcp',
      'frontend-design',
      'curdx-flow',
      'sequential-thinking',
      'context7',
    ]);
  });
});
