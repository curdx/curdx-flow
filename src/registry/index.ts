import type { Pkg } from './types.ts';
import { makeCatalogPluginPkgs } from './plugins/from-catalog.ts';
import sequentialThinking from './mcps/sequential-thinking.ts';
import context7 from './mcps/context7.ts';
import { canonicalPkgId } from '../core/capabilities/catalog.ts';

// Plugin pkgs are generated from the shared capability catalog (curdx-flow + the
// four companions); the two external MCPs keep their bespoke `claude mcp add`
// install logic, which the catalog does not model.
export const PKGS: Pkg[] = [...makeCatalogPluginPkgs(), sequentialThinking, context7];

export function findPkg(id: string): Pkg | undefined {
  const canonical = canonicalPkgId(id);
  return PKGS.find((p) => p.id === canonical);
}

export type { Pkg } from './types.ts';
