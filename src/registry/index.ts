import type { Pkg } from './types.ts';
import pua from './plugins/pua.ts';
import claudeMem from './plugins/claude-mem.ts';
import chromeDevtoolsMcp from './plugins/chrome-devtools-mcp.ts';
import uiUxProMax from './plugins/ui-ux-pro-max.ts';
import curdxFlow from './plugins/curdx-flow.ts';
import sequentialThinking from './mcps/sequential-thinking.ts';
import context7 from './mcps/context7.ts';

export const PKGS: Pkg[] = [
  pua,
  claudeMem,
  chromeDevtoolsMcp,
  uiUxProMax,
  curdxFlow,
  sequentialThinking,
  context7,
];

const PKG_ALIASES: Record<string, string> = {
  uiuxmax: 'ui-ux-pro-max',
  'ui-ux-max': 'ui-ux-pro-max',
  'ui ux pro max': 'ui-ux-pro-max',
};

function canonicalPkgId(id: string): string {
  const normalized = id.trim().toLowerCase().replace(/_/g, '-');
  return PKG_ALIASES[normalized] ?? normalized;
}

export function findPkg(id: string): Pkg | undefined {
  const canonical = canonicalPkgId(id);
  return PKGS.find((p) => p.id === canonical);
}

export type { Pkg } from './types.ts';
