import { access, readdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, sep } from 'node:path';

import type {
  ClaudePluginTopology,
  DiscoverRuntimeTopologyInput,
  DiscoveryBlocker,
  DiscoveryHint,
  ProjectRootTopology,
  RuntimePackageManager,
  RuntimeProjectType,
  RuntimeTopology,
  RuntimeTopologyStatus,
} from './types.ts';

type JsonObject = Record<string, unknown>;

interface PackageReadResult {
  ok: boolean;
  path: string;
  packageJsonPath: string;
  packageJson: JsonObject | null;
  error?: string;
}

interface RootCandidate {
  path: string;
  absolutePath: string;
}

const ignoredDirs = new Set([
  '.git',
  '.curdx',
  '.claude',
  'node_modules',
  'dist',
  'build',
  'coverage',
]);

const frontendDependencies = new Set([
  '@angular/core',
  '@vitejs/plugin-react',
  'astro',
  'next',
  'nuxt',
  'react',
  'svelte',
  'vite',
  'vue',
]);

const backendDependencies = new Set([
  '@nestjs/core',
  'apollo-server',
  'express',
  'fastify',
  'graphql-yoga',
  'hono',
  'koa',
  'nestjs',
]);

const dataDependencies = new Set([
  '@prisma/client',
  'drizzle-orm',
  'knex',
  'mongoose',
  'prisma',
  'sequelize',
  'typeorm',
]);

export async function discoverRuntimeTopology(input: DiscoverRuntimeTopologyInput): Promise<RuntimeTopology> {
  const workspaceRoot = input.workspaceRoot;
  const generatedAt = normalizeDate(input.generatedAt);
  const rootRead = await readPackage(workspaceRoot, '.');
  const packageManagers = await detectPackageManagers(workspaceRoot);
  const pluginRoots = await discoverClaudePluginRoots(workspaceRoot, input.maxDepth ?? 4);
  const candidates = new Map<string, RootCandidate>();

  if (rootRead.ok || rootRead.error) {
    candidates.set('.', { path: '.', absolutePath: workspaceRoot });
  }

  if (rootRead.packageJson) {
    const workspaceCandidates = await discoverWorkspacePackageRoots(workspaceRoot, rootRead.packageJson);
    for (const candidate of workspaceCandidates) {
      candidates.set(candidate.path, candidate);
    }
  }

  const packageCandidates = await discoverPackageRoots(workspaceRoot, input.maxDepth ?? 4);
  for (const candidate of packageCandidates) {
    candidates.set(candidate.path, candidate);
  }

  for (const plugin of pluginRoots) {
    const absolutePath = join(workspaceRoot, plugin.path === '.' ? '' : plugin.path);
    candidates.set(plugin.path, {
      path: plugin.path,
      absolutePath,
    });
  }

  const roots: ProjectRootTopology[] = [];
  for (const candidate of [...candidates.values()].sort(compareCandidates)) {
    roots.push(await buildRootTopology(workspaceRoot, candidate, packageManagers, pluginRoots));
  }

  if (roots.length === 0) {
    roots.push(createUnknownRoot('No package.json or Claude Code plugin manifest was found.'));
  }

  const blockers = collectTopologyBlockers(roots);
  if (roots.length === 1 && roots[0]?.type === 'unknown' && roots[0].blockers.length === 0) {
    blockers.push({
      code: 'no-project-roots',
      path: '.',
      severity: 'needs-human-input',
      summary: 'No package.json, workspace package, or Claude Code plugin manifest was found.',
    });
    roots[0].blockers.push(blockers[0]!);
    roots[0].status = 'needs-human-input';
  }

  const hasWorkspace = Boolean(rootRead.packageJson && extractWorkspacePatterns(rootRead.packageJson).length > 0);
  const overallType = determineOverallType(roots, hasWorkspace);
  const status = determineStatus(roots, blockers);
  const packageManager = packageManagers.get('.') ?? firstKnownPackageManager(roots);
  const hints = roots.flatMap((root) => [
    ...root.entryHints,
    ...root.scriptHints,
    ...root.serviceHints,
    ...root.apiHints,
    ...root.dataHints,
    ...root.browserHints,
    ...root.validationHints,
    ...root.pluginHints,
  ]);

  return {
    schemaVersion: 1,
    workspaceRoot,
    generatedAt,
    overallType,
    status,
    confidence: averageConfidence(roots, overallType),
    packageManager,
    roots,
    pluginRoots,
    blockers,
    hints,
  };
}

async function buildRootTopology(
  workspaceRoot: string,
  candidate: RootCandidate,
  packageManagers: Map<string, RuntimePackageManager>,
  pluginRoots: ClaudePluginTopology[],
): Promise<ProjectRootTopology> {
  const packageRead = await readPackage(candidate.absolutePath, candidate.path);
  const plugin = pluginRoots.find((entry) => entry.path === candidate.path);
  const packageJson = packageRead.packageJson;
  const scripts = collectScripts(packageJson);
  const blockers: DiscoveryBlocker[] = [];
  const reasons: string[] = [];

  if (!packageRead.ok && packageRead.error) {
    blockers.push({
      code: 'malformed-package-json',
      path: joinRelative(candidate.path, 'package.json'),
      severity: 'blocked',
      summary: `package.json could not be parsed: ${packageRead.error}`,
    });
  }

  const fileFacts = await collectFileFacts(candidate.absolutePath);
  const deps = collectDependencies(packageJson);
  const packageManager = packageManagers.get(candidate.path) ?? packageManagers.get('.') ?? detectPackageManagerFromField(packageJson);

  const entryHints = buildEntryHints(candidate.path, packageJson, fileFacts);
  const scriptHints = buildScriptHints(scripts);
  const serviceHints = buildServiceHints(scripts);
  const apiHints = buildApiHints(deps, fileFacts);
  const dataHints = buildDataHints(deps, fileFacts);
  const browserHints = buildBrowserHints(deps, scripts, fileFacts);
  const validationHints = buildValidationHints(scripts, plugin, candidate.path);
  const pluginHints = buildPluginHints(plugin);

  const classification = classifyRoot({
    packageJson,
    hasWorkspaces: packageJson ? extractWorkspacePatterns(packageJson).length > 0 : false,
    deps,
    scripts,
    fileFacts,
    plugin,
    entryHints,
    serviceHints,
    apiHints,
    browserHints,
    dataHints,
    blockers,
  });

  reasons.push(...classification.reasons);

  if (classification.type === 'unknown' && blockers.length === 0) {
    blockers.push({
      code: 'insufficient-runtime-facts',
      path: candidate.path,
      severity: 'needs-human-input',
      summary: 'Discovery could not identify entry points, runtime scripts, plugin manifest, or framework signals.',
    });
  }

  return {
    path: candidate.path,
    type: classification.type,
    status: blockers.some((blocker) => blocker.severity === 'blocked')
      ? 'blocked'
      : classification.type === 'unknown'
        ? 'needs-human-input'
        : 'ready',
    confidence: classification.confidence,
    packageManager,
    packageJsonPath: packageRead.ok ? joinRelative(candidate.path, 'package.json') : null,
    ...(typeof packageJson?.name === 'string' && packageJson.name.length > 0 ? { name: packageJson.name } : {}),
    scripts,
    entryHints,
    scriptHints,
    serviceHints,
    apiHints,
    dataHints,
    browserHints,
    validationHints,
    pluginHints,
    blockers,
    reasons,
  };
}

function classifyRoot(input: {
  packageJson: JsonObject | null;
  hasWorkspaces: boolean;
  deps: Set<string>;
  scripts: Record<string, string>;
  fileFacts: Set<string>;
  plugin?: ClaudePluginTopology;
  entryHints: DiscoveryHint[];
  serviceHints: DiscoveryHint[];
  apiHints: DiscoveryHint[];
  browserHints: DiscoveryHint[];
  dataHints: DiscoveryHint[];
  blockers: DiscoveryBlocker[];
}): { type: RuntimeProjectType; confidence: number; reasons: string[] } {
  if (input.blockers.some((blocker) => blocker.severity === 'blocked')) {
    return { type: 'unknown', confidence: 0, reasons: ['package metadata is malformed'] };
  }

  if (input.plugin) {
    return { type: 'claude-code-plugin', confidence: 0.98, reasons: ['Claude Code plugin manifest found'] };
  }

  if (input.hasWorkspaces) {
    return { type: 'monorepo', confidence: 0.86, reasons: ['package.json workspaces field found'] };
  }

  const hasFrontend = input.browserHints.length > 0 || hasAny(input.deps, frontendDependencies);
  const hasBackend = input.apiHints.length > 0 || hasAny(input.deps, backendDependencies);
  const hasData = input.dataHints.length > 0 || hasAny(input.deps, dataDependencies);
  const hasBin = isRecord(input.packageJson?.bin) || typeof input.packageJson?.bin === 'string';
  const hasLibraryEntry = ['main', 'module', 'types', 'exports'].some((field) => field in (input.packageJson ?? {}));
  const hasService = input.serviceHints.length > 0;

  if (hasFrontend && (hasBackend || hasData)) {
    return { type: 'full-stack', confidence: 0.9, reasons: ['frontend and backend/data signals found'] };
  }
  if (hasBackend || (hasService && hasBackendScript(input.scripts))) {
    return { type: 'backend', confidence: 0.84, reasons: ['backend API or service signals found'] };
  }
  if (hasFrontend) {
    return { type: 'frontend', confidence: 0.84, reasons: ['frontend framework or browser entry signals found'] };
  }
  if (hasBin) {
    return { type: 'cli', confidence: 0.88, reasons: ['package.json bin field found'] };
  }
  if (hasLibraryEntry) {
    return { type: 'library', confidence: 0.8, reasons: ['library entry fields found'] };
  }

  return { type: 'unknown', confidence: 0.18, reasons: ['not enough facts to classify runtime'] };
}

async function readPackage(root: string, relativePath: string): Promise<PackageReadResult> {
  const packageJsonPath = join(root, 'package.json');
  try {
    const raw = await readFile(packageJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return {
        ok: false,
        path: relativePath,
        packageJsonPath,
        packageJson: null,
        error: 'package.json is not an object',
      };
    }
    return { ok: true, path: relativePath, packageJsonPath, packageJson: parsed };
  } catch (err: unknown) {
    if (isNotFound(err)) {
      return { ok: false, path: relativePath, packageJsonPath, packageJson: null };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, path: relativePath, packageJsonPath, packageJson: null, error: message };
  }
}

async function discoverPackageRoots(workspaceRoot: string, maxDepth: number): Promise<RootCandidate[]> {
  const roots: RootCandidate[] = [];
  await walk(workspaceRoot, '.', 0, maxDepth, async (absolutePath, relativePath, entryName) => {
    if (entryName === 'package.json') {
      const rootPath = relativePath === 'package.json' ? '.' : relativePath.replace(/\/package\.json$/, '');
      roots.push({ path: rootPath, absolutePath: join(workspaceRoot, rootPath === '.' ? '' : rootPath) });
    }
  });
  return dedupeCandidates(roots);
}

async function discoverClaudePluginRoots(workspaceRoot: string, maxDepth: number): Promise<ClaudePluginTopology[]> {
  const roots: ClaudePluginTopology[] = [];
  await walk(workspaceRoot, '.', 0, maxDepth, async (absolutePath, relativePath, entryName) => {
    if (entryName !== 'plugin.json' || !relativePath.endsWith('.claude-plugin/plugin.json')) return;
    const pluginRoot = relativePath.replace(/\/?\.claude-plugin\/plugin\.json$/, '') || '.';
    roots.push(await buildPluginTopology(workspaceRoot, pluginRoot));
  });
  return roots.sort((a, b) => a.path.localeCompare(b.path));
}

async function buildPluginTopology(workspaceRoot: string, pluginRoot: string): Promise<ClaudePluginTopology> {
  const pluginRootAbs = join(workspaceRoot, pluginRoot === '.' ? '' : pluginRoot);
  const hooksPath = joinRelative(pluginRoot, 'hooks/hooks.json');
  const skillsPath = joinRelative(pluginRoot, 'skills');
  const agentsPath = joinRelative(pluginRoot, 'agents');
  const binAbs = join(pluginRootAbs, 'bin');
  const binPaths = await listFiles(binAbs, joinRelative(pluginRoot, 'bin'));

  return {
    path: pluginRoot,
    manifestPath: joinRelative(pluginRoot, '.claude-plugin/plugin.json'),
    hooksPath: await exists(join(workspaceRoot, hooksPath)) ? hooksPath : null,
    skillsPath: await exists(join(workspaceRoot, skillsPath)) ? skillsPath : null,
    agentsPath: await exists(join(workspaceRoot, agentsPath)) ? agentsPath : null,
    binPaths,
    validationCommand: {
      executable: 'claude',
      argv: ['plugin', 'validate', pluginRoot],
      cwd: '.',
    },
    wiring: {
      manifest: true,
      hooks: await exists(join(workspaceRoot, hooksPath)),
      skills: await exists(join(workspaceRoot, skillsPath)),
      agents: await exists(join(workspaceRoot, agentsPath)),
      bin: binPaths.length > 0,
    },
  };
}

async function discoverWorkspacePackageRoots(workspaceRoot: string, packageJson: JsonObject): Promise<RootCandidate[]> {
  const roots: RootCandidate[] = [];
  for (const pattern of extractWorkspacePatterns(packageJson)) {
    roots.push(...await expandWorkspacePattern(workspaceRoot, pattern));
  }
  return dedupeCandidates(roots);
}

function extractWorkspacePatterns(packageJson: JsonObject): string[] {
  const workspaces = packageJson.workspaces;
  if (Array.isArray(workspaces)) {
    return workspaces.filter((entry): entry is string => typeof entry === 'string');
  }
  if (isRecord(workspaces) && Array.isArray(workspaces.packages)) {
    return workspaces.packages.filter((entry): entry is string => typeof entry === 'string');
  }
  return [];
}

async function expandWorkspacePattern(workspaceRoot: string, pattern: string): Promise<RootCandidate[]> {
  const normalized = normalizePath(pattern).replace(/\/+$/, '');
  if (!isSafeWorkspacePattern(normalized)) return [];
  if (!normalized.includes('*')) {
    return await exists(join(workspaceRoot, normalized, 'package.json'))
      ? [{ path: normalized, absolutePath: join(workspaceRoot, normalized) }]
      : [];
  }

  const prefix = normalized.slice(0, normalized.indexOf('*')).replace(/\/+$/, '');
  const baseAbs = join(workspaceRoot, prefix);
  const roots: RootCandidate[] = [];
  try {
    const entries = await readdir(baseAbs, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || ignoredDirs.has(entry.name)) continue;
      const candidatePath = prefix.length > 0 ? `${prefix}/${entry.name}` : entry.name;
      if (await exists(join(workspaceRoot, candidatePath, 'package.json'))) {
        roots.push({ path: candidatePath, absolutePath: join(workspaceRoot, candidatePath) });
      }
    }
  } catch {
    return [];
  }
  return roots;
}

async function walk(
  absoluteRoot: string,
  relativeRoot: string,
  depth: number,
  maxDepth: number,
  visit: (absolutePath: string, relativePath: string, entryName: string) => Promise<void>,
): Promise<void> {
  if (depth > maxDepth) return;
  try {
    const entries = await readdir(absoluteRoot, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = relativeRoot === '.' ? entry.name : `${relativeRoot}/${entry.name}`;
      const absolutePath = join(absoluteRoot, entry.name);
      await visit(absolutePath, relativePath, entry.name);
      if (entry.isDirectory() && !ignoredDirs.has(entry.name)) {
        await walk(absolutePath, relativePath, depth + 1, maxDepth, visit);
      }
    }
  } catch {
    return;
  }
}

async function detectPackageManagers(workspaceRoot: string): Promise<Map<string, RuntimePackageManager>> {
  const managers = new Map<string, RuntimePackageManager>();
  await walk(workspaceRoot, '.', 0, 4, async (absolutePath, relativePath, entryName) => {
    const manager = lockfileToManager(entryName);
    if (!manager) return;
    const rootPath = relativePath.includes('/') ? relativePath.replace(/\/[^/]+$/, '') : '.';
    managers.set(rootPath, manager);
  });
  return managers;
}

async function collectFileFacts(root: string): Promise<Set<string>> {
  const facts = new Set<string>();
  for (const path of [
    'index.html',
    'src/App.tsx',
    'src/App.jsx',
    'src/server.ts',
    'src/server.js',
    'src/index.ts',
    'src/index.js',
    'app/api',
    'pages/api',
    'prisma/schema.prisma',
  ]) {
    if (await exists(join(root, path))) facts.add(path);
  }
  return facts;
}

function buildEntryHints(rootPath: string, packageJson: JsonObject | null, fileFacts: Set<string>): DiscoveryHint[] {
  const hints: DiscoveryHint[] = [];
  for (const field of ['main', 'module', 'types', 'exports']) {
    const value = packageJson?.[field];
    if (typeof value === 'string') {
      const safePath = safePackagePath(rootPath, value);
      hints.push(hint('entry', `package.json:${field}`, `${field} points to ${value}`, 0.8, safePath ? { path: safePath } : {}));
    } else if (isRecord(value)) {
      hints.push(hint('entry', `package.json:${field}`, `${field} object is present`, 0.7));
    }
  }
  for (const path of ['index.html', 'src/App.tsx', 'src/App.jsx', 'src/server.ts', 'src/server.js', 'src/index.ts', 'src/index.js']) {
    if (fileFacts.has(path)) {
      hints.push(hint('entry', path, `${path} exists`, 0.7, { path: joinRelative(rootPath, path) }));
    }
  }
  return hints;
}

function buildScriptHints(scripts: Record<string, string>): DiscoveryHint[] {
  return Object.entries(scripts).map(([scriptName, command]) => {
    const kind: DiscoveryHint['kind'] = isValidationScript(scriptName) ? 'validation' : 'script';
    return hint(kind, `script:${scriptName}`, `package script '${scriptName}' is available`, 0.72, { scriptName, command });
  });
}

function buildServiceHints(scripts: Record<string, string>): DiscoveryHint[] {
  return Object.entries(scripts)
    .filter(([scriptName, command]) => isServiceScript(scriptName, command))
    .map(([scriptName, command]) => hint('service', `script:${scriptName}`, `script '${scriptName}' may start a local service`, 0.74, { scriptName, command }));
}

function buildValidationHints(scripts: Record<string, string>, plugin: ClaudePluginTopology | undefined, rootPath: string): DiscoveryHint[] {
  const hints = Object.entries(scripts)
    .filter(([scriptName]) => isValidationScript(scriptName))
    .map(([scriptName, command]) => hint('validation', `script:${scriptName}`, `script '${scriptName}' may validate the project`, 0.76, { scriptName, command }));
  if (plugin) {
    hints.push(hint('validation', 'claude-plugin-validate', `Claude Code plugin validation is available for ${rootPath}`, 0.94, {
      command: `claude plugin validate ${rootPath}`,
    }));
  }
  return hints;
}

function buildApiHints(deps: Set<string>, fileFacts: Set<string>): DiscoveryHint[] {
  const hints: DiscoveryHint[] = [];
  for (const dep of backendDependencies) {
    if (deps.has(dep)) hints.push(hint('api', `dependency:${dep}`, `${dep} backend dependency found`, 0.76));
  }
  if (fileFacts.has('app/api')) hints.push(hint('api', 'app/api', 'Next.js app API route directory exists', 0.82));
  if (fileFacts.has('pages/api')) hints.push(hint('api', 'pages/api', 'Next.js pages API route directory exists', 0.82));
  return hints;
}

function buildDataHints(deps: Set<string>, fileFacts: Set<string>): DiscoveryHint[] {
  const hints: DiscoveryHint[] = [];
  for (const dep of dataDependencies) {
    if (deps.has(dep)) hints.push(hint('data', `dependency:${dep}`, `${dep} data dependency found`, 0.7));
  }
  if (fileFacts.has('prisma/schema.prisma')) hints.push(hint('data', 'prisma/schema.prisma', 'Prisma schema exists', 0.82));
  return hints;
}

function buildBrowserHints(deps: Set<string>, scripts: Record<string, string>, fileFacts: Set<string>): DiscoveryHint[] {
  const hints: DiscoveryHint[] = [];
  for (const dep of frontendDependencies) {
    if (deps.has(dep)) hints.push(hint('browser', `dependency:${dep}`, `${dep} frontend dependency found`, 0.74));
  }
  for (const [scriptName, command] of Object.entries(scripts)) {
    if (/(^|\s)(vite|next|nuxt|astro|webpack|parcel|svelte-kit)(\s|$)/i.test(command)) {
      hints.push(hint('browser', `script:${scriptName}`, `script '${scriptName}' references a browser app tool`, 0.72, { scriptName, command }));
    }
  }
  if (fileFacts.has('index.html')) hints.push(hint('browser', 'index.html', 'browser HTML entry exists', 0.82));
  return hints;
}

function buildPluginHints(plugin: ClaudePluginTopology | undefined): DiscoveryHint[] {
  if (!plugin) return [];
  return [
    hint('plugin', plugin.manifestPath, 'Claude Code plugin manifest found', 0.98, { path: plugin.manifestPath }),
    ...(plugin.hooksPath ? [hint('plugin', plugin.hooksPath, 'Claude Code plugin hook wiring found', 0.9, { path: plugin.hooksPath })] : []),
    ...plugin.binPaths.map((path) => hint('plugin', path, 'Plugin-local executable found', 0.86, { path })),
  ];
}

function collectScripts(packageJson: JsonObject | null): Record<string, string> {
  const scripts = packageJson?.scripts;
  if (!isRecord(scripts)) return {};
  return Object.fromEntries(
    Object.entries(scripts).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function collectDependencies(packageJson: JsonObject | null): Set<string> {
  const deps = new Set<string>();
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const section = packageJson?.[field];
    if (isRecord(section)) {
      for (const name of Object.keys(section)) deps.add(name);
    }
  }
  return deps;
}

function collectTopologyBlockers(roots: ProjectRootTopology[]): DiscoveryBlocker[] {
  return roots.flatMap((root) => root.blockers);
}

function determineOverallType(roots: ProjectRootTopology[], hasWorkspace: boolean): RuntimeProjectType {
  if (roots.length > 1 || hasWorkspace || roots.some((root) => root.type === 'monorepo')) return 'monorepo';
  return roots[0]?.type ?? 'unknown';
}

function determineStatus(roots: ProjectRootTopology[], blockers: DiscoveryBlocker[]): RuntimeTopologyStatus {
  if (blockers.some((blocker) => blocker.severity === 'blocked') || roots.some((root) => root.status === 'blocked')) return 'blocked';
  if (blockers.length > 0 || roots.some((root) => root.status === 'needs-human-input')) return 'needs-human-input';
  return 'ready';
}

function averageConfidence(roots: ProjectRootTopology[], overallType: RuntimeProjectType): number {
  if (roots.length === 0) return 0;
  if (overallType === 'monorepo') {
    return Number(Math.min(0.95, roots.reduce((sum, root) => sum + root.confidence, 0) / roots.length + 0.05).toFixed(2));
  }
  return Number((roots.reduce((sum, root) => sum + root.confidence, 0) / roots.length).toFixed(2));
}

function firstKnownPackageManager(roots: ProjectRootTopology[]): RuntimePackageManager {
  return roots.find((root) => root.packageManager !== 'unknown')?.packageManager ?? 'unknown';
}

function detectPackageManagerFromField(packageJson: JsonObject | null): RuntimePackageManager {
  const packageManager = packageJson?.packageManager;
  if (typeof packageManager !== 'string') return 'unknown';
  if (packageManager.startsWith('npm@')) return 'npm';
  if (packageManager.startsWith('pnpm@')) return 'pnpm';
  if (packageManager.startsWith('yarn@')) return 'yarn';
  if (packageManager.startsWith('bun@')) return 'bun';
  return 'unknown';
}

function lockfileToManager(filename: string): RuntimePackageManager | null {
  if (filename === 'package-lock.json' || filename === 'npm-shrinkwrap.json') return 'npm';
  if (filename === 'pnpm-lock.yaml') return 'pnpm';
  if (filename === 'yarn.lock') return 'yarn';
  if (filename === 'bun.lock' || filename === 'bun.lockb') return 'bun';
  return null;
}

function hasAny(values: Set<string>, candidates: Set<string>): boolean {
  for (const value of values) {
    if (candidates.has(value)) return true;
  }
  return false;
}

function hasBackendScript(scripts: Record<string, string>): boolean {
  return Object.entries(scripts).some(([scriptName, command]) => isServiceScript(scriptName, command) && /\b(node|tsx|ts-node|nodemon|nest|fastify)\b/i.test(command));
}

function isServiceScript(scriptName: string, command: string): boolean {
  return /^(dev|start|serve)$/i.test(scriptName) || /\b(vite|next|nuxt|astro|node|tsx|ts-node|nodemon|nest|fastify)\b/i.test(command);
}

function isValidationScript(scriptName: string): boolean {
  return /^(test|test:.+|typecheck|lint|e2e|build|check|verify|validate|validate:.+)$/i.test(scriptName);
}

async function listFiles(absoluteDir: string, relativeDir: string): Promise<string[]> {
  try {
    const entries = await readdir(absoluteDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => `${relativeDir}/${entry.name}`)
      .sort();
  } catch {
    return [];
  }
}

async function exists(pathname: string): Promise<boolean> {
  try {
    await access(pathname, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function createUnknownRoot(summary: string): ProjectRootTopology {
  const blocker: DiscoveryBlocker = {
    code: 'no-project-roots',
    path: '.',
    severity: 'needs-human-input',
    summary,
  };
  return {
    path: '.',
    type: 'unknown',
    status: 'needs-human-input',
    confidence: 0,
    packageManager: 'unknown',
    packageJsonPath: null,
    scripts: {},
    entryHints: [],
    scriptHints: [],
    serviceHints: [],
    apiHints: [],
    dataHints: [],
    browserHints: [],
    validationHints: [],
    pluginHints: [],
    blockers: [blocker],
    reasons: ['no static project roots found'],
  };
}

function dedupeCandidates(candidates: RootCandidate[]): RootCandidate[] {
  return [...new Map(candidates.map((candidate) => [candidate.path, candidate])).values()].sort(compareCandidates);
}

function compareCandidates(a: RootCandidate, b: RootCandidate): number {
  if (a.path === '.') return -1;
  if (b.path === '.') return 1;
  return a.path.localeCompare(b.path);
}

function hint(kind: DiscoveryHint['kind'], source: string, summary: string, confidence: number, extra: Partial<DiscoveryHint> = {}): DiscoveryHint {
  return {
    kind,
    source,
    summary,
    confidence,
    ...extra,
  };
}

function joinRelative(rootPath: string, childPath: string): string {
  const normalizedChild = normalizePath(childPath).replace(/^\.\/+/, '');
  return rootPath === '.' ? normalizedChild : `${rootPath}/${normalizedChild}`;
}

function normalizePath(pathname: string): string {
  return pathname.split(sep).join('/');
}

function safePackagePath(rootPath: string, childPath: string): string | undefined {
  const normalizedChild = normalizePath(childPath).replace(/^\.\/+/, '');
  if (!isSafeRelativePath(normalizedChild)) return undefined;
  return joinRelative(rootPath, normalizedChild);
}

function isSafeWorkspacePattern(pattern: string): boolean {
  if (pattern.length === 0 || pattern.startsWith('/') || /^[A-Za-z]:[\\/]/.test(pattern) || pattern.includes('\0')) return false;
  const segments = pattern.replaceAll('\\', '/').split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function isSafeRelativePath(pathname: string): boolean {
  if (pathname.length === 0 || pathname.startsWith('/') || /^[A-Za-z]:[\\/]/.test(pathname) || pathname.includes('\0')) return false;
  const segments = pathname.replaceAll('\\', '/').split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function normalizeDate(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function isNotFound(err: unknown): boolean {
  return isRecord(err) && err.code === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type {
  RuntimeTopology,
  ProjectRootTopology,
  DiscoveryBlocker,
  DiscoveryHint,
  RuntimeProjectType,
  RuntimePackageManager,
};
