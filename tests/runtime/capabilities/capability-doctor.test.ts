import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildExternalMcpReadiness,
  buildCapabilityMatrix,
  buildNativeGoalReadiness,
  buildPluginDependencyReadiness,
  GOAL_CONDITION_LIMIT,
  probeCommand,
  renderCapabilityMatrix,
  validateCapabilityMatrix,
  type CapabilityMatrix,
} from '../../../src/runtime/capabilities/index.ts';
import { buildGoalBridge } from '../../../src/hooks/lib/goal-bridge.ts';
import {
  CURDX_EXTERNAL_MCPS,
  CURDX_PLUGIN_DEPENDENCIES,
} from '../../../src/registry/capabilities.ts';

const workspaces: string[] = [];
const runtimeCli = join(process.cwd(), 'plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs');

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), 'curdx-capabilities-'));
  workspaces.push(workspace);
  return workspace;
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })));
});

async function runRuntimeCli(
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  expect(existsSync(runtimeCli), 'runtime-cli.mjs should be built before capability tests run').toBe(true);
  const home = await createWorkspace();
  const child = spawn(process.execPath, [runtimeCli, ...args], {
    cwd: options.cwd ?? process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      ...options.env,
    },
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
  const result = await new Promise<{ exitCode: number | null }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`runtime cli timed out: ${args.join(' ')}`));
    }, 15_000);
    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on('close', (exitCode) => {
      clearTimeout(timeout);
      resolve({ exitCode });
    });
  });
  return {
    stdout: Buffer.concat(stdout).toString('utf8'),
    stderr: Buffer.concat(stderr).toString('utf8'),
    exitCode: result.exitCode,
  };
}

function byId(matrix: CapabilityMatrix): Map<string, CapabilityMatrix['capabilities'][number]> {
  return new Map(matrix.capabilities.map((capability) => [capability.id, capability]));
}

describe('capability doctor matrix', () => {
  it('builds a schema-guarded matrix with capability dimensions and evidence impact', async () => {
    const workspace = await createWorkspace();
    await writeFile(join(workspace, 'package.json'), JSON.stringify({
      scripts: { test: 'vitest', e2e: 'playwright test' },
      devDependencies: { '@playwright/test': '^1.0.0' },
    }), 'utf8');

    const matrix = buildCapabilityMatrix({
      cwd: workspace,
      generatedAt: '2026-05-17T02:10:00.000Z',
      mode: 'fast',
      packageManager: 'npm',
      claudeProbe: {
        id: 'claude',
        command: 'claude --version',
        exitCode: 0,
        stdout: '2.1.150',
        stderr: '',
        durationMs: 12,
        timedOut: false,
        source: 'fixture',
      },
      npmProbe: {
        id: 'npm',
        command: 'npm --version',
        exitCode: 1,
        stdout: '',
        stderr: 'permission denied',
        durationMs: 7,
        timedOut: false,
        source: 'fixture',
      },
      plugin: {
        ready: false,
        dependencies: {
          dependencies: [
            {
              id: 'pua',
              name: 'pua',
              type: 'plugin',
              declared: true,
              marketplaceMatches: true,
              crossMarketplaceAllowlisted: true,
              installed: true,
              enabled: true,
              callable: true,
              authorized: true,
            },
            {
              id: 'claude-mem',
              name: 'claude-mem',
              type: 'plugin',
              declared: false,
              marketplaceMatches: false,
              crossMarketplaceAllowlisted: false,
            },
            {
              id: 'chrome-devtools-mcp',
              name: 'chrome-devtools-mcp',
              type: 'plugin',
              declared: true,
              marketplaceMatches: true,
              crossMarketplaceAllowlisted: true,
              installed: true,
              enabled: false,
              callable: false,
              authorized: true,
            },
          ],
        },
      },
      externalMcp: {
        ready: false,
        servers: [
          { id: 'context7', type: 'mcp', configured: true, status: 'available' },
          { id: 'sequential-thinking', type: 'mcp', configured: false, status: 'missing' },
        ],
      },
      browserVerification: {
        playwright: {
          ready: true,
          dependency: true,
          recommendedCommand: 'npm run e2e',
        },
        chromeDevtoolsMcp: {
          ready: false,
          dependencyDeclared: true,
          chromeInstalled: false,
        },
      },
      hookFreshness: {
        sourceAvailable: true,
        fresh: false,
        checkCommand: 'npm run check:hooks-fresh',
      },
      release: {
        ready: false,
      },
    });

    expect(validateCapabilityMatrix(matrix)).toMatchObject({ ok: true });
    expect(matrix.summary).toMatchObject({
      degraded: expect.any(Number),
      unavailable: expect.any(Number),
      skippedDeepChecks: expect.any(Number),
    });
    expect(matrix.blockers.map((capability) => capability.id)).toContain('npm');

    const capabilities = byId(matrix);
    expect(capabilities.get('claude-code')).toMatchObject({
      state: 'available',
      configured: true,
      installed: true,
      callable: true,
      authorized: 'unknown',
    });
    expect(capabilities.get('npm')).toMatchObject({
      state: 'degraded',
      installed: true,
      callable: false,
      degraded: true,
      unavailable: false,
    });
    expect(capabilities.get('claude-mem')).toMatchObject({
      state: 'unavailable',
      configured: false,
      installed: false,
      callable: 'unknown',
    });
    expect(capabilities.get('chrome-devtools-mcp')).toMatchObject({
      category: 'plugin-dependency',
      state: 'degraded',
      configured: true,
      installed: true,
      callable: false,
      evidenceImpact: expect.arrayContaining(['browser evidence']),
    });
    expect(capabilities.get('sequential-thinking')).toMatchObject({
      state: 'unavailable',
      configured: false,
      provisioning: 'external-mcp',
    });
    expect(capabilities.get('context7')).toMatchObject({
      state: 'unknown',
      configured: true,
      callable: 'unknown',
      reason: 'context7 is configured; deep callability can be verified when the route requires it.',
    });
    expect(capabilities.get('playwright')).toMatchObject({
      state: 'skipped',
      configured: true,
      callable: 'skipped',
      skippedReason: 'Fast doctor does not run Playwright/browser verification.',
    });
    expect(capabilities.get('chrome-runtime')).toMatchObject({
      state: 'degraded',
      configured: true,
      installed: false,
      evidenceImpact: expect.arrayContaining(['browser evidence']),
    });
    expect(capabilities.get('hook-freshness')).toMatchObject({
      state: 'unavailable',
      blocksRelease: true,
      remediation: 'npm run check:hooks-fresh',
    });
  });

  it('renders a human-readable blocker and remediation summary', async () => {
    const workspace = await createWorkspace();
    const matrix = buildCapabilityMatrix({
      cwd: workspace,
      generatedAt: '2026-05-17T02:10:00.000Z',
      mode: 'fast',
      claudeProbe: {
        id: 'claude',
        command: 'claude --version',
        exitCode: null,
        stdout: '',
        stderr: '',
        error: 'spawn claude ENOENT',
        durationMs: 3,
        timedOut: false,
        source: 'fixture',
      },
    });

    const human = renderCapabilityMatrix(matrix);

    expect(human).toContain('# curdx-flow Doctor');
    expect(human).toContain('Blockers:');
    expect(human).toContain('claude-code');
    expect(human).toContain('spawn claude ENOENT');
    expect(human).toContain('Next Actions');
  });

  it('does not call human output ready when deep checks were skipped', async () => {
    const workspace = await createWorkspace();
    const matrix = buildCapabilityMatrix({
      cwd: workspace,
      generatedAt: '2026-05-17T02:10:00.000Z',
      mode: 'fast',
      packageManager: 'npm',
      claudeProbe: {
        id: 'claude',
        command: 'claude --version',
        exitCode: 0,
        stdout: '2.1.150',
        stderr: '',
        durationMs: 12,
        timedOut: false,
        source: 'fixture',
      },
      npmProbe: {
        id: 'npm',
        command: 'npm --version',
        exitCode: 0,
        stdout: '10.0.0',
        stderr: '',
        durationMs: 7,
        timedOut: false,
        source: 'fixture',
      },
      plugin: {
        ready: true,
        dependencies: {
          dependencies: [
            { name: 'pua', type: 'plugin', declared: true, marketplaceMatches: true, crossMarketplaceAllowlisted: true },
            { name: 'claude-mem', type: 'plugin', declared: true, marketplaceMatches: true, crossMarketplaceAllowlisted: true },
            { name: 'chrome-devtools-mcp', type: 'plugin', declared: true, marketplaceMatches: true, crossMarketplaceAllowlisted: true },
            { name: 'ui-ux-pro-max', type: 'plugin', declared: true, marketplaceMatches: true, crossMarketplaceAllowlisted: true },
          ],
        },
      },
      externalMcp: {
        ready: true,
        servers: [
          { id: 'context7', type: 'mcp', configured: true, status: 'available' },
          { id: 'sequential-thinking', type: 'mcp', configured: true, status: 'available' },
        ],
      },
      browserVerification: {
        playwright: { ready: true, dependency: true, recommendedCommand: 'npm run e2e' },
        chromeDevtoolsMcp: { ready: true, dependencyDeclared: true, chromeInstalled: true },
      },
      hookFreshness: { sourceAvailable: true, fresh: true },
      release: { ready: true },
    });

    expect(matrix.summary).toMatchObject({
      degraded: 0,
      unavailable: 0,
      skippedDeepChecks: expect.any(Number),
    });
    expect(matrix.summary.skippedDeepChecks).toBeGreaterThan(0);
    expect(renderCapabilityMatrix(matrix)).toContain('Overall: degraded');
  });

  it('allows future capability fields but rejects invalid contract values', async () => {
    const workspace = await createWorkspace();
    const matrix = buildCapabilityMatrix({
      cwd: workspace,
      generatedAt: '2026-05-17T02:10:00.000Z',
      mode: 'fast',
    });

    const withFutureFields = {
      ...matrix,
      futurePlannerSurface: { accepted: true },
      capabilities: matrix.capabilities.map((capability) => ({
        ...capability,
        futureEvidenceHint: 'safe to ignore',
      })),
    };
    expect(validateCapabilityMatrix(withFutureFields)).toMatchObject({ ok: true });

    const invalidState = JSON.parse(JSON.stringify(matrix)) as CapabilityMatrix;
    invalidState.capabilities[0]!.state = 'ready' as CapabilityMatrix['capabilities'][number]['state'];
    const stateResult = validateCapabilityMatrix(invalidState);
    expect(stateResult).toMatchObject({ ok: false });
    if (!stateResult.ok) {
      expect(stateResult.issues.map((issue) => issue.path)).toContain('$.capabilities[0].state');
    }

    const invalidDimension = JSON.parse(JSON.stringify(matrix)) as CapabilityMatrix;
    invalidDimension.capabilities[0]!.configured = 'yes' as CapabilityMatrix['capabilities'][number]['configured'];
    const dimensionResult = validateCapabilityMatrix(invalidDimension);
    expect(dimensionResult).toMatchObject({ ok: false });
    if (!dimensionResult.ok) {
      expect(dimensionResult.issues.map((issue) => issue.path)).toContain('$.capabilities[0].configured');
    }

    const invalidSummary = JSON.parse(JSON.stringify(matrix)) as CapabilityMatrix;
    invalidSummary.summary.blockers = -1;
    const summaryResult = validateCapabilityMatrix(invalidSummary);
    expect(summaryResult).toMatchObject({ ok: false });
    if (!summaryResult.ok) {
      expect(summaryResult.issues.map((issue) => issue.path)).toContain('$.summary.blockers');
    }

    const invalidNextAction = JSON.parse(JSON.stringify(matrix)) as CapabilityMatrix;
    invalidNextAction.nextActions = [{
      capabilityId: 'claude-code',
      action: 'fix it',
      priority: 'urgent' as CapabilityMatrix['nextActions'][number]['priority'],
    }];
    const actionResult = validateCapabilityMatrix(invalidNextAction);
    expect(actionResult).toMatchObject({ ok: false });
    if (!actionResult.ok) {
      expect(actionResult.issues.map((issue) => issue.path)).toContain('$.nextActions[0].priority');
    }
  });

  it('skips deep checks in fast mode and reports deep validation timeouts explicitly', async () => {
    const workspace = await createWorkspace();
    const fast = buildCapabilityMatrix({
      cwd: workspace,
      generatedAt: '2026-05-17T02:10:00.000Z',
      mode: 'fast',
    });
    expect(byId(fast).get('plugin-validation')).toMatchObject({
      checkMode: 'skipped',
      state: 'skipped',
      callable: 'skipped',
      skippedReason: 'Fast doctor does not run claude plugin validate; this is a deep release check.',
      remediation: 'claude plugin validate ./plugins/curdx-flow',
    });

    const deep = buildCapabilityMatrix({
      cwd: workspace,
      generatedAt: '2026-05-17T02:10:00.000Z',
      mode: 'deep',
      pluginValidationProbe: {
        id: 'plugin-validation',
        command: 'claude plugin validate ./plugins/curdx-flow',
        exitCode: null,
        stdout: '',
        stderr: '',
        error: 'command timed out after 10ms',
        durationMs: 10,
        timedOut: true,
        source: 'fixture',
      },
    });

    expect(byId(deep).get('plugin-validation')).toMatchObject({
      checkMode: 'deep',
      state: 'unavailable',
      callable: false,
      blocksRelease: true,
      reason: 'command timed out after 10ms',
    });
  });

  it('normalizes unknown commands and timeouts as degraded or unavailable probe results', () => {
    const missing = probeCommand({
      id: 'missing-command',
      command: '__curdx_missing_command__',
      args: ['--version'],
      timeoutMs: 50,
      env: { CURDX_FLOW_CAPABILITY_PROBES: undefined },
    });
    expect(missing.exitCode).toBeNull();
    expect(missing.error).toMatch(/ENOENT|not found/i);

    const timedOut = probeCommand({
      id: 'timeout-command',
      command: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 1000)'],
      timeoutMs: 20,
      env: { CURDX_FLOW_CAPABILITY_PROBES: undefined },
    });
    expect(timedOut.timedOut).toBe(true);
    expect(timedOut.error).toMatch(/timed out/i);
  });

  it('keeps generated runtime doctor JSON compatible while adding capabilityMatrix and --human output', async () => {
    const workspace = await createWorkspace();
    await mkdir(join(workspace, 'node_modules'), { recursive: true });
    await writeFile(join(workspace, 'package.json'), JSON.stringify({
      scripts: { test: 'vitest' },
    }), 'utf8');

    const env = {
      CURDX_FLOW_MCP_LIST_OUTPUT: '',
      CURDX_FLOW_PLUGIN_LIST_JSON: JSON.stringify([
        { id: 'pua@pua-skills', version: '1.0.0', scope: 'user', enabled: true },
        { id: 'claude-mem@thedotmack', version: '1.0.0', scope: 'user', enabled: true },
        { id: 'chrome-devtools-mcp@chrome-devtools-plugins', version: '1.0.0', scope: 'user', enabled: true },
        { id: 'ui-ux-pro-max@ui-ux-pro-max-skill', version: '1.0.0', scope: 'user', enabled: true },
      ]),
      CURDX_FLOW_CAPABILITY_PROBES: JSON.stringify({
        'claude-version': { exitCode: 0, stdout: '2.1.150' },
        'npm-version': { exitCode: 0, stdout: '10.0.0' },
      }),
    };
    const json = await runRuntimeCli(['doctor', '--cwd', workspace], { env });

    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe('');
    const parsed = JSON.parse(json.stdout) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      runtime: { ready: expect.any(Boolean) },
      plugin: { ready: expect.any(Boolean) },
      capabilityMatrix: {
        schemaVersion: 1,
        mode: 'fast',
        capabilities: expect.any(Array),
      },
    });
    expect(validateCapabilityMatrix(parsed.capabilityMatrix)).toMatchObject({ ok: true });
    expect(parsed).toMatchObject({
      nativeGoal: {
        requiredVersion: '2.1.139',
        detectedVersion: '2.1.150',
        supported: true,
        recommendedDriver: 'native-goal',
        conditionLength: { status: 'not-generated' },
      },
      diagnostics: {
        nativeGoalReady: true,
        goalExecutionDriver: 'native-goal',
      },
    });
    const matrix = parsed.capabilityMatrix as CapabilityMatrix;
    expect(matrix.capabilities.find((capability) => capability.id === 'native-goal')).toMatchObject({
      state: 'available',
      callable: true,
      supported: true,
      requiredVersion: '2.1.139',
      detectedVersion: '2.1.150',
      recommendedDriver: 'native-goal',
    });

    const human = await runRuntimeCli(['doctor', '--cwd', workspace, '--human'], { env });
    expect(human.exitCode).toBe(0);
    expect(human.stdout).toContain('# curdx-flow Doctor');
    expect(() => JSON.parse(human.stdout)).toThrow();
  }, 15_000);

  it('keeps doctor ok false when a plugin dependency is missing even if external MCPs are connected', async () => {
    const workspace = await createWorkspace();
    await mkdir(join(workspace, 'node_modules'), { recursive: true });
    await writeFile(join(workspace, 'package.json'), JSON.stringify({
      scripts: { test: 'vitest' },
    }), 'utf8');

    const env = {
      CURDX_FLOW_MCP_LIST_OUTPUT: [
        'context7: https://mcp.context7.com/mcp - ✓ Connected',
        'sequential-thinking: npx -y @modelcontextprotocol/server-sequential-thinking - ✓ Connected',
      ].join('\n'),
      CURDX_FLOW_PLUGIN_LIST_JSON: JSON.stringify([
        { id: 'claude-mem@thedotmack', version: '1.0.0', scope: 'user', enabled: true },
        { id: 'chrome-devtools-mcp@chrome-devtools-plugins', version: '1.0.0', scope: 'user', enabled: true },
        { id: 'ui-ux-pro-max@ui-ux-pro-max-skill', version: '1.0.0', scope: 'user', enabled: true },
      ]),
      CURDX_FLOW_CAPABILITY_PROBES: JSON.stringify({
        'claude-version': { exitCode: 0, stdout: '2.1.150' },
        'npm-version': { exitCode: 0, stdout: '10.0.0' },
      }),
    };
    const json = await runRuntimeCli(['doctor', '--cwd', workspace], { env });
    const parsed = JSON.parse(json.stdout) as {
      ok?: boolean;
      diagnostics?: { pluginDependenciesReady?: boolean };
      capabilityMatrix?: CapabilityMatrix;
    };

    expect(parsed.ok).toBe(false);
    expect(parsed.diagnostics?.pluginDependenciesReady).toBe(false);
    expect(validateCapabilityMatrix(parsed.capabilityMatrix)).toMatchObject({ ok: true });
    expect(parsed.capabilityMatrix?.blockers.map((capability) => capability.id)).toContain('pua');
  });

  it('normalizes plugin dependency readiness from claude plugin list JSON fixtures', () => {
    const facts = buildPluginDependencyReadiness({
      expected: CURDX_PLUGIN_DEPENDENCIES,
      manifestDependencies: CURDX_PLUGIN_DEPENDENCIES.map((dependency) => ({
        name: dependency.name,
        marketplace: dependency.marketplace,
      })),
      marketplaceAllowlist: CURDX_PLUGIN_DEPENDENCIES.map((dependency) => dependency.marketplace),
      pluginListJson: JSON.stringify([
        { id: 'pua@pua-skills', version: '1.2.3', scope: 'user', enabled: true, future: 'ignored' },
        { id: 'claude-mem@thedotmack', version: '0.9.0', scope: 'user', enabled: false },
        { id: 'ui-ux-pro-max@ui-ux-pro-max-skill', version: '2.0.0', scope: 'project', enabled: true },
      ]),
      pluginListSource: 'CURDX_FLOW_PLUGIN_LIST_JSON',
      pluginListExitCode: 0,
    });

    const byDependency = new Map(facts.dependencies.map((dependency) => [dependency.id, dependency]));
    expect(byDependency.get('pua')).toMatchObject({
      readiness: 'available',
      installed: true,
      enabled: true,
      installedScope: 'user',
      installedVersion: '1.2.3',
      callable: true,
    });
    expect(byDependency.get('claude-mem')).toMatchObject({
      readiness: 'degraded',
      installed: true,
      enabled: false,
      callable: false,
      drift: expect.arrayContaining(['plugin-disabled']),
    });
    expect(byDependency.get('chrome-devtools-mcp')).toMatchObject({
      readiness: 'unavailable',
      installed: false,
      callable: false,
      drift: expect.arrayContaining(['plugin-missing']),
    });
    expect(byDependency.get('ui-ux-pro-max')).toMatchObject({
      readiness: 'degraded',
      installed: true,
      installedScope: 'project',
      drift: expect.arrayContaining(['plugin-scope-mismatch']),
    });
    expect(facts.ready).toBe(false);
  });

  it('does not count plugin-provided MCP rows as external readiness', () => {
    const facts = buildExternalMcpReadiness({
      expected: CURDX_EXTERNAL_MCPS,
      mcpListOutput: [
        'plugin:context7:context7: https://mcp.context7.com/mcp - ✓ Connected',
        'plugin:sequential-thinking:sequential-thinking: npx sequential-thinking - ✓ Connected',
      ].join('\n'),
      mcpListSource: 'CURDX_FLOW_MCP_LIST_OUTPUT',
      mcpListExitCode: 0,
    });

    expect(facts.ignoredPluginProvidedServers).toHaveLength(2);
    expect(facts.servers.every((server) => server.status === 'missing')).toBe(true);
    expect(facts.ready).toBe(false);
  });

  it('does not treat disconnected MCP status text as connected', () => {
    const facts = buildExternalMcpReadiness({
      expected: CURDX_EXTERNAL_MCPS,
      mcpListOutput: [
        'context7: https://mcp.context7.com/mcp - ✗ Disconnected',
        'sequential-thinking: npx -y @modelcontextprotocol/server-sequential-thinking - Not connected',
      ].join('\n'),
      mcpListSource: 'CURDX_FLOW_MCP_LIST_OUTPUT',
      mcpListExitCode: 0,
    });

    const byMcp = new Map(facts.servers.map((server) => [server.id, server]));
    expect(byMcp.get('context7')).toMatchObject({ status: 'error', callable: false });
    expect(byMcp.get('sequential-thinking')).toMatchObject({ status: 'error', callable: false });
    expect(facts.ready).toBe(false);
  });

  it('keeps malformed plugin list output unknown instead of available', () => {
    const facts = buildPluginDependencyReadiness({
      expected: CURDX_PLUGIN_DEPENDENCIES,
      manifestDependencies: CURDX_PLUGIN_DEPENDENCIES.map((dependency) => ({
        name: dependency.name,
        marketplace: dependency.marketplace,
      })),
      marketplaceAllowlist: CURDX_PLUGIN_DEPENDENCIES.map((dependency) => dependency.marketplace),
      pluginListJson: '{not-json',
      pluginListSource: 'CURDX_FLOW_PLUGIN_LIST_JSON',
      pluginListExitCode: 0,
    });

    expect(facts.ready).toBe(false);
    expect(facts.parseError).toMatch(/invalid plugin list json/i);
    expect(facts.dependencies.every((dependency) => dependency.readiness === 'unknown')).toBe(true);
    expect(facts.dependencies.every((dependency) => dependency.installed === 'unknown')).toBe(true);
  });

  it('keeps plugin list command failures unknown and actionable', () => {
    const facts = buildPluginDependencyReadiness({
      expected: CURDX_PLUGIN_DEPENDENCIES,
      manifestDependencies: CURDX_PLUGIN_DEPENDENCIES.map((dependency) => ({
        name: dependency.name,
        marketplace: dependency.marketplace,
      })),
      marketplaceAllowlist: CURDX_PLUGIN_DEPENDENCIES.map((dependency) => dependency.marketplace),
      pluginListJson: '',
      pluginListSource: 'direct exec',
      pluginListExitCode: null,
      pluginListError: 'command timed out after 3000ms',
    });

    expect(facts.ready).toBe(false);
    expect(facts.commandError).toBe('command timed out after 3000ms');
    expect(facts.dependencies.every((dependency) => dependency.readiness === 'unknown')).toBe(true);
    expect(facts.dependencies.every((dependency) => dependency.remediation.includes('claude plugin list --json'))).toBe(true);
  });

  it('normalizes external MCP readiness and excludes plugin-provided MCP rows', () => {
    const facts = buildExternalMcpReadiness({
      expected: CURDX_EXTERNAL_MCPS,
      mcpListOutput: [
        'Checking MCP server health...',
        'context7: https://mcp.context7.com/mcp - ✓ Connected',
        'plugin:chrome-devtools-mcp:chrome-devtools: npx chrome-devtools-mcp - ✓ Connected',
        'sequential-thinking: npx -y @modelcontextprotocol/server-sequential-thinking - ✗ Failed to connect',
        'malformed line with no server separator',
      ].join('\n'),
      mcpListSource: 'CURDX_FLOW_MCP_LIST_OUTPUT',
      mcpListExitCode: 0,
    });

    const byMcp = new Map(facts.servers.map((server) => [server.id, server]));
    expect(byMcp.get('context7')).toMatchObject({
      configured: true,
      installed: true,
      callable: true,
      status: 'connected',
    });
    expect(byMcp.get('sequential-thinking')).toMatchObject({
      configured: true,
      installed: true,
      callable: false,
      status: 'error',
    });
    expect(facts.ignoredPluginProvidedServers).toHaveLength(1);
    expect(facts.ready).toBe(false);
  });

  it('reports external MCP command errors as unknown with explicit fallback remediation', () => {
    const facts = buildExternalMcpReadiness({
      expected: CURDX_EXTERNAL_MCPS,
      mcpListOutput: '',
      mcpListSource: 'direct exec',
      mcpListExitCode: 1,
      mcpListError: 'claude mcp list failed',
    });

    expect(facts.ready).toBe(false);
    expect(facts.commandError).toBe('claude mcp list failed');
    expect(facts.servers.every((server) => server.configured === 'unknown')).toBe(true);
    expect(facts.servers.every((server) => server.status === 'unknown')).toBe(true);
    expect(facts.servers.find((server) => server.id === 'context7')?.fallback).toMatch(/official docs|manual confirmation/i);
  });

  it('detects native goal support, update-needed versions, and hooks/settings blockers', () => {
    const supported = buildNativeGoalReadiness({
      claudeProbe: {
        id: 'claude-version',
        command: 'claude --version',
        exitCode: 0,
        stdout: '2.1.143 (Claude Code)',
        stderr: '',
        durationMs: 8,
        timedOut: false,
        source: 'fixture',
      },
      settingsSources: [],
    });
    expect(supported).toMatchObject({
      state: 'available',
      supported: true,
      requiredVersion: '2.1.139',
      detectedVersion: '2.1.143',
      recommendedDriver: 'native-goal',
      fallbackAction: null,
      conditionLength: { status: 'not-generated', limit: GOAL_CONDITION_LIMIT },
    });

    const updateNeeded = buildNativeGoalReadiness({
      claudeProbe: {
        id: 'claude-version',
        command: 'claude --version',
        exitCode: 0,
        stdout: '2.1.138 (Claude Code)',
        stderr: '',
        durationMs: 8,
        timedOut: false,
        source: 'fixture',
      },
      settingsSources: [],
    });
    expect(updateNeeded).toMatchObject({
      state: 'update-needed',
      supported: false,
      detectedVersion: '2.1.138',
      recommendedDriver: 'manual-resume',
    });
    expect(updateNeeded.reason).toMatch(/2\.1\.139|update/i);

    const blocked = buildNativeGoalReadiness({
      claudeProbe: {
        id: 'claude-version',
        command: 'claude --version',
        exitCode: 0,
        stdout: '2.1.150',
        stderr: '',
        durationMs: 8,
        timedOut: false,
        source: 'fixture',
      },
      settingsSources: [
        { source: 'project', settings: { disableAllHooks: true } },
        { source: 'managed', managed: true, settings: { allowManagedHooksOnly: true } },
      ],
    });
    expect(blocked).toMatchObject({
      state: 'blocked',
      supported: false,
      recommendedDriver: 'manual-resume',
    });
    expect(blocked.blockers.map((blocker) => blocker.id)).toEqual([
      'disableAllHooks',
      'allowManagedHooksOnly',
    ]);
    expect(blocked.fallbackAction).toMatch(/manual|resume/i);

    const nonManagedAllowManagedHooksOnly = buildNativeGoalReadiness({
      claudeProbe: {
        id: 'claude-version',
        command: 'claude --version',
        exitCode: 0,
        stdout: '2.1.150',
        stderr: '',
        durationMs: 8,
        timedOut: false,
        source: 'fixture',
      },
      settingsSources: [{ source: 'project', settings: { allowManagedHooksOnly: true } }],
    });
    expect(nonManagedAllowManagedHooksOnly).toMatchObject({
      state: 'available',
      supported: true,
      recommendedDriver: 'native-goal',
    });
    expect(nonManagedAllowManagedHooksOnly.blockers).toEqual([]);
  });

  it('adds native goal readiness and condition length status to goal bridge output', async () => {
    const workspace = await createWorkspace();
    const nativeGoal = buildNativeGoalReadiness({
      claudeProbe: {
        id: 'claude-version',
        command: 'claude --version',
        exitCode: 0,
        stdout: '2.1.150',
        stderr: '',
        durationMs: 8,
        timedOut: false,
        source: 'fixture',
      },
      settingsSources: [],
    });

    const bridge = buildGoalBridge({
      cwd: workspace,
      goal: 'ship the implementation '.repeat(500),
      maxTurns: 11,
      nativeGoal,
    });

    expect(bridge.condition.length).toBeLessThanOrEqual(GOAL_CONDITION_LIMIT);
    expect(bridge.conditionLength).toMatchObject({
      limit: GOAL_CONDITION_LIMIT,
      status: 'compressed',
    });
    expect(bridge.readiness.conditionLength).toMatchObject({ status: 'compressed' });
    expect(bridge.recommendedDriver).toBe('native-goal');
    expect(bridge.condition).toMatch(/transcript-visible|conversation visibly shows/i);
    expect(bridge.condition).toMatch(/missingEvidence/i);
    expect(bridge.condition).toMatch(/final verdict|verdict/i);
    expect(bridge.condition).toMatch(/Stop after 11 goal turns/i);
  });

  it('recommends manual resume when native goal is blocked', async () => {
    const workspace = await createWorkspace();
    const blocked = buildNativeGoalReadiness({
      claudeProbe: {
        id: 'claude-version',
        command: 'claude --version',
        exitCode: 0,
        stdout: '2.1.150',
        stderr: '',
        durationMs: 8,
        timedOut: false,
        source: 'fixture',
      },
      settingsSources: [{ source: 'project', settings: { disableAllHooks: true } }],
    });

    const bridge = buildGoalBridge({
      cwd: workspace,
      goal: 'finish this story',
      nativeGoal: blocked,
    });

    expect(bridge.recommendedDriver).toBe('manual-resume');
    expect(bridge.readiness.state).toBe('blocked');
    expect(bridge.startPrompt).toMatch(/manual|resume/i);
    expect(bridge.startPrompt).not.toMatch(/unattended/i);
  });

  it('emits native goal readiness from generated runtime goal command', async () => {
    const workspace = await createWorkspace();
    const env = {
      CURDX_FLOW_CAPABILITY_PROBES: JSON.stringify({
        'claude-version': { exitCode: 0, stdout: '2.1.150' },
      }),
    };

    const result = await runRuntimeCli([
      'goal',
      '--cwd',
      workspace,
      '--goal',
      'verify completion evidence '.repeat(500),
      '--max-turns',
      '9',
    ], { env });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as ReturnType<typeof buildGoalBridge>;
    expect(parsed).toMatchObject({
      recommendedDriver: 'native-goal',
      readiness: {
        requiredVersion: '2.1.139',
        detectedVersion: '2.1.150',
        supported: true,
      },
      conditionLength: {
        status: 'compressed',
        limit: GOAL_CONDITION_LIMIT,
      },
    });
    expect(parsed.condition.length).toBeLessThanOrEqual(GOAL_CONDITION_LIMIT);
  });
});
