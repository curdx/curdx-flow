import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  discoverRuntimeTopology,
  type RuntimeTopology,
} from '../../../src/runtime/discovery/index.ts';
import { validateContract } from '../../../src/runtime/contracts/index.ts';

const workspaces: string[] = [];

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), 'curdx-discovery-'));
  workspaces.push(workspace);
  return workspace;
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })));
});

async function writeJson(pathname: string, value: unknown): Promise<void> {
  await writeFile(pathname, JSON.stringify(value, null, 2), 'utf8');
}

async function writePackage(root: string, packageJson: Record<string, unknown>): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeJson(join(root, 'package.json'), packageJson);
}

function expectValidTopology(topology: RuntimeTopology): void {
  expect(validateContract('runtimeTopology', topology)).toMatchObject({ ok: true });
}

function rootByPath(topology: RuntimeTopology, path: string) {
  const root = topology.roots.find((entry) => entry.path === path);
  expect(root, `root ${path} should exist`).toBeDefined();
  return root!;
}

describe('runtime project topology discovery', () => {
  it('discovers a frontend project without executing scripts', async () => {
    const workspace = await createWorkspace();
    await writePackage(workspace, {
      name: 'frontend-app',
      scripts: {
        dev: 'vite --host 0.0.0.0',
        build: 'vite build',
        test: 'vitest run',
        typecheck: 'tsc --noEmit',
      },
      dependencies: {
        '@vitejs/plugin-react': '^5.0.0',
        react: '^19.0.0',
        vite: '^7.0.0',
      },
    });
    await writeFile(join(workspace, 'index.html'), '<div id="root"></div>', 'utf8');
    await writeFile(join(workspace, 'package-lock.json'), '{}', 'utf8');

    const topology = await discoverRuntimeTopology({
      workspaceRoot: workspace,
      generatedAt: '2026-05-17T10:00:00.000Z',
    });

    expectValidTopology(topology);
    expect(topology).toMatchObject({
      schemaVersion: 1,
      overallType: 'frontend',
      status: 'ready',
      packageManager: 'npm',
      blockers: [],
    });
    const root = rootByPath(topology, '.');
    expect(root).toMatchObject({
      type: 'frontend',
      packageManager: 'npm',
      scripts: expect.objectContaining({ dev: 'vite --host 0.0.0.0' }),
    });
    expect(root.browserHints.map((hint) => hint.source)).toContain('index.html');
    expect(root.serviceHints.map((hint) => hint.scriptName)).toContain('dev');
    expect(root.validationHints.map((hint) => hint.scriptName)).toEqual(expect.arrayContaining(['test', 'typecheck']));
  });

  it('discovers backend API and data hints', async () => {
    const workspace = await createWorkspace();
    await writePackage(workspace, {
      name: 'api-app',
      scripts: {
        dev: 'tsx src/server.ts',
        start: 'node dist/server.js',
        test: 'vitest run',
      },
      dependencies: {
        express: '^5.0.0',
        prisma: '^6.0.0',
      },
    });
    await mkdir(join(workspace, 'src'), { recursive: true });
    await writeFile(join(workspace, 'src/server.ts'), 'export const app = express();', 'utf8');
    await mkdir(join(workspace, 'prisma'), { recursive: true });
    await writeFile(join(workspace, 'prisma/schema.prisma'), 'datasource db { provider = "sqlite" }', 'utf8');

    const topology = await discoverRuntimeTopology({
      workspaceRoot: workspace,
      generatedAt: '2026-05-17T10:00:00.000Z',
    });

    expectValidTopology(topology);
    expect(topology.overallType).toBe('backend');
    const root = rootByPath(topology, '.');
    expect(root.type).toBe('backend');
    expect(root.apiHints.map((hint) => hint.source)).toContain('dependency:express');
    expect(root.dataHints.map((hint) => hint.source)).toContain('prisma/schema.prisma');
    expect(root.serviceHints.map((hint) => hint.scriptName)).toEqual(expect.arrayContaining(['dev', 'start']));
  });

  it('classifies full-stack projects when frontend and backend signals coexist', async () => {
    const workspace = await createWorkspace();
    await writePackage(workspace, {
      name: 'fullstack-app',
      scripts: {
        dev: 'next dev',
        build: 'next build',
        test: 'vitest run',
      },
      dependencies: {
        next: '^16.0.0',
        react: '^19.0.0',
        '@prisma/client': '^6.0.0',
      },
    });
    await mkdir(join(workspace, 'app/api/users'), { recursive: true });
    await writeFile(join(workspace, 'app/api/users/route.ts'), 'export function GET() {}', 'utf8');

    const topology = await discoverRuntimeTopology({
      workspaceRoot: workspace,
      generatedAt: '2026-05-17T10:00:00.000Z',
    });

    expectValidTopology(topology);
    expect(topology.overallType).toBe('full-stack');
    const root = rootByPath(topology, '.');
    expect(root.type).toBe('full-stack');
    expect(root.browserHints.map((hint) => hint.source)).toContain('dependency:next');
    expect(root.apiHints.map((hint) => hint.source)).toContain('app/api');
  });

  it('distinguishes CLI and library projects from service projects', async () => {
    const workspace = await createWorkspace();
    await writePackage(join(workspace, 'cli'), {
      name: 'tool-cli',
      bin: './dist/index.mjs',
      scripts: {
        build: 'tsup',
        test: 'vitest run',
      },
      devDependencies: {
        tsup: '^8.0.0',
      },
    });
    await writePackage(join(workspace, 'lib'), {
      name: 'utility-lib',
      main: './dist/index.js',
      types: './dist/index.d.ts',
      exports: './dist/index.js',
      scripts: {
        build: 'tsc -p tsconfig.json',
        test: 'vitest run',
      },
    });

    const topology = await discoverRuntimeTopology({
      workspaceRoot: workspace,
      generatedAt: '2026-05-17T10:00:00.000Z',
    });

    expectValidTopology(topology);
    expect(topology.overallType).toBe('monorepo');
    expect(rootByPath(topology, 'cli').type).toBe('cli');
    expect(rootByPath(topology, 'lib').type).toBe('library');
  });

  it('discovers workspace package roots without dropping child packages', async () => {
    const workspace = await createWorkspace();
    await writePackage(workspace, {
      name: 'workspace-root',
      packageManager: 'npm@10.0.0',
      workspaces: ['apps/*', 'packages/*'],
      scripts: {
        test: 'vitest run',
      },
    });
    await writePackage(join(workspace, 'apps/web'), {
      name: 'web',
      scripts: { dev: 'vite' },
      dependencies: { vite: '^7.0.0', react: '^19.0.0' },
    });
    await writePackage(join(workspace, 'apps/api'), {
      name: 'api',
      scripts: { dev: 'tsx src/server.ts' },
      dependencies: { fastify: '^5.0.0' },
    });
    await writePackage(join(workspace, 'packages/shared'), {
      name: 'shared',
      main: './dist/index.js',
      types: './dist/index.d.ts',
    });
    await writeFile(join(workspace, 'package-lock.json'), '{}', 'utf8');

    const topology = await discoverRuntimeTopology({
      workspaceRoot: workspace,
      generatedAt: '2026-05-17T10:00:00.000Z',
    });

    expectValidTopology(topology);
    expect(topology.overallType).toBe('monorepo');
    expect(topology.status).toBe('ready');
    expect(topology.roots.map((root) => root.path)).toEqual(['.', 'apps/api', 'apps/web', 'packages/shared']);
    expect(rootByPath(topology, '.')).toMatchObject({
      type: 'monorepo',
      status: 'ready',
    });
    expect(rootByPath(topology, 'apps/api').type).toBe('backend');
    expect(rootByPath(topology, 'apps/web').type).toBe('frontend');
    expect(rootByPath(topology, 'packages/shared').type).toBe('library');
  });

  it('records Claude Code plugin root, manifest, hook wiring, executable, and validation hint', async () => {
    const workspace = await createWorkspace();
    const pluginRoot = join(workspace, 'plugins/curdx-flow');
    await writePackage(workspace, {
      name: 'plugin-workspace',
      workspaces: ['plugins/*'],
      packageManager: 'npm@10.0.0',
    });
    await mkdir(join(pluginRoot, '.claude-plugin'), { recursive: true });
    await writeJson(join(pluginRoot, '.claude-plugin/plugin.json'), {
      name: 'curdx-flow',
      version: '7.2.1',
      description: 'fixture plugin',
    });
    await mkdir(join(pluginRoot, 'hooks'), { recursive: true });
    await writeJson(join(pluginRoot, 'hooks/hooks.json'), { hooks: [] });
    await mkdir(join(pluginRoot, 'skills/help'), { recursive: true });
    await mkdir(join(pluginRoot, 'agents'), { recursive: true });
    await mkdir(join(pluginRoot, 'bin'), { recursive: true });
    await writeFile(join(pluginRoot, 'bin/curdx-flow'), '#!/usr/bin/env node\n', 'utf8');

    const topology = await discoverRuntimeTopology({
      workspaceRoot: workspace,
      generatedAt: '2026-05-17T10:00:00.000Z',
    });

    expectValidTopology(topology);
    expect(topology.overallType).toBe('monorepo');
    expect(rootByPath(topology, 'plugins/curdx-flow').type).toBe('claude-code-plugin');
    expect(topology.pluginRoots).toEqual([
      expect.objectContaining({
        path: 'plugins/curdx-flow',
        manifestPath: 'plugins/curdx-flow/.claude-plugin/plugin.json',
        hooksPath: 'plugins/curdx-flow/hooks/hooks.json',
        binPaths: ['plugins/curdx-flow/bin/curdx-flow'],
        validationCommand: {
          executable: 'claude',
          argv: ['plugin', 'validate', 'plugins/curdx-flow'],
          cwd: '.',
        },
      }),
    ]);
  });

  it('marks unknown projects as needs-human-input instead of assuming Node or frontend', async () => {
    const workspace = await createWorkspace();
    await writeFile(join(workspace, 'README.md'), '# unknown\n', 'utf8');

    const topology = await discoverRuntimeTopology({
      workspaceRoot: workspace,
      generatedAt: '2026-05-17T10:00:00.000Z',
    });

    expectValidTopology(topology);
    expect(topology).toMatchObject({
      overallType: 'unknown',
      status: 'needs-human-input',
      packageManager: 'unknown',
    });
    expect(topology.roots).toHaveLength(1);
    expect(topology.roots[0]).toMatchObject({
      path: '.',
      type: 'unknown',
      status: 'needs-human-input',
    });
    expect(topology.blockers).toEqual([
      expect.objectContaining({
        code: 'no-project-roots',
        severity: 'needs-human-input',
      }),
    ]);
  });

  it('does not emit contract-invalid escaped paths from package metadata', async () => {
    const workspace = await createWorkspace();
    await writePackage(workspace, {
      name: 'suspicious-lib',
      main: '../outside.js',
      workspaces: ['../outside/*', 'packages/*'],
    });
    await writePackage(join(workspace, 'packages/safe'), {
      name: 'safe-lib',
      main: './dist/index.js',
    });

    const topology = await discoverRuntimeTopology({
      workspaceRoot: workspace,
      generatedAt: '2026-05-17T10:00:00.000Z',
    });

    expectValidTopology(topology);
    expect(topology.roots.map((root) => root.path)).toEqual(['.', 'packages/safe']);
    expect(rootByPath(topology, '.').entryHints).toEqual([
      expect.not.objectContaining({ path: expect.stringContaining('..') }),
    ]);
    expect(rootByPath(topology, 'packages/safe').entryHints).toEqual([
      expect.objectContaining({ path: 'packages/safe/dist/index.js' }),
    ]);
  });

  it('turns malformed package metadata into a blocker without dropping the root', async () => {
    const workspace = await createWorkspace();
    await writeFile(join(workspace, 'package.json'), '{ broken json', 'utf8');

    const topology = await discoverRuntimeTopology({
      workspaceRoot: workspace,
      generatedAt: '2026-05-17T10:00:00.000Z',
    });

    expectValidTopology(topology);
    expect(topology.overallType).toBe('unknown');
    expect(topology.status).toBe('blocked');
    expect(topology.roots[0]).toMatchObject({
      path: '.',
      type: 'unknown',
      status: 'blocked',
    });
    expect(topology.blockers).toEqual([
      expect.objectContaining({
        code: 'malformed-package-json',
        path: 'package.json',
        severity: 'blocked',
      }),
    ]);
  });
});
