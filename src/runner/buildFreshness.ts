import { readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF_PATH = fileURLToPath(import.meta.url);
const RUNNER_DIR = path.dirname(SELF_PATH);
const PROJECT_ROOT = path.resolve(RUNNER_DIR, '..', '..');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');
const DIST_ENTRY = path.join(PROJECT_ROOT, 'dist', 'index.mjs');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);

function newestTsMtimeMs(dir: string): number {
  let newest = 0;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestTsMtimeMs(full));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    newest = Math.max(newest, statSync(full).mtimeMs);
  }
  return newest;
}

export function assertFreshLocalBuild(): void {
  assertFreshBuild({ projectRoot: PROJECT_ROOT, srcDir: SRC_DIR, distEntry: DIST_ENTRY });
}

export function assertFreshBuild(opts: {
  projectRoot: string;
  srcDir: string;
  distEntry: string;
}): void {
  const { projectRoot, srcDir, distEntry } = opts;
  // Published npm packages only ship `dist/`, so this guard is for source checkouts.
  if (!existsSync(srcDir) || !existsSync(distEntry)) return;

  let distMtimeMs = 0;
  let newestSrcMtimeMs = 0;
  try {
    distMtimeMs = statSync(distEntry).mtimeMs;
    newestSrcMtimeMs = newestTsMtimeMs(srcDir);
  } catch {
    return;
  }

  if (newestSrcMtimeMs <= distMtimeMs) return;

  const relDist = path.relative(projectRoot, distEntry);
  const relSrc = path.relative(projectRoot, srcDir);
  throw new Error(
    [
      'Local build is stale: source files are newer than the bundled CLI entry.',
      `Detected source checkout at ${projectRoot}.`,
      `Run \`npm run build\` to refresh ${relDist}, or execute the published package explicitly with \`npx --package @curdx/flow@$(node -p "require('./package.json').version") @curdx/flow\`.`,
      `This guard only applies when running from a local checkout that still contains ${relSrc}/.`,
    ].join(' '),
  );
}
