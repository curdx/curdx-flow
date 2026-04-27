import type { Pkg } from './types.ts';
import pua from './plugins/pua.ts';
import claudeMem from './plugins/claude-mem.ts';
import chromeDevtoolsMcp from './plugins/chrome-devtools-mcp.ts';
import frontendDesign from './plugins/frontend-design.ts';
import curdxFlow from './plugins/curdx-flow.ts';
import sequentialThinking from './mcps/sequential-thinking.ts';
import context7 from './mcps/context7.ts';

export const PKGS: Pkg[] = [
  pua,
  claudeMem,
  chromeDevtoolsMcp,
  frontendDesign,
  curdxFlow,
  sequentialThinking,
  context7,
];

export function findPkg(id: string): Pkg | undefined {
  return PKGS.find((p) => p.id === id);
}

export type { Pkg } from './types.ts';
