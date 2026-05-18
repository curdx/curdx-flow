import { describe, expect, it } from 'vitest';

import {
  detectVerificationCommands,
  type VerificationCommandPlan,
} from '../../../src/runtime/discovery/index.ts';
import type {
  DiscoveryHintKind,
  ProjectRootTopology,
  RuntimePackageManager,
  RuntimeTopology,
} from '../../../src/runtime/discovery/types.ts';

function hint(kind: DiscoveryHintKind, source: string, path?: string) {
  return {
    kind,
    source,
    summary: `${source} exists`,
    confidence: 0.8,
    ...(path ? { path } : {}),
  };
}

function root(input: {
  path: string;
  packageManager?: RuntimePackageManager;
  scripts?: Record<string, string>;
  type?: ProjectRootTopology['type'];
  entrySources?: string[];
}): ProjectRootTopology {
  return {
    path: input.path,
    type: input.type ?? 'backend',
    status: 'ready',
    confidence: 0.84,
    packageManager: input.packageManager ?? 'npm',
    packageJsonPath: input.packageManager === 'unknown' ? null : `${input.path === '.' ? '' : `${input.path}/`}package.json`,
    scripts: input.scripts ?? {},
    entryHints: (input.entrySources ?? []).map((source) => hint('entry', source, source)),
    scriptHints: [],
    serviceHints: [],
    apiHints: [],
    dataHints: [],
    browserHints: [],
    validationHints: [],
    pluginHints: [],
    blockers: [],
    reasons: ['test root'],
  };
}

function topology(roots: ProjectRootTopology[], extra: Partial<RuntimeTopology> = {}): RuntimeTopology {
  return {
    schemaVersion: 1,
    workspaceRoot: '/repo',
    generatedAt: '2026-05-17T10:00:00.000Z',
    overallType: roots.length > 1 ? 'monorepo' : roots[0]?.type ?? 'unknown',
    status: 'ready',
    confidence: 0.8,
    packageManager: roots[0]?.packageManager ?? 'unknown',
    roots,
    pluginRoots: [],
    blockers: [],
    hints: [],
    ...extra,
  };
}

function byPurpose(plan: VerificationCommandPlan, purpose: string) {
  return plan.commands.filter((candidate) => candidate.purpose === purpose);
}

describe('verification command detection', () => {
  it('emits structured argv-array candidates from explicit npm scripts', () => {
    const plan = detectVerificationCommands({
      topology: topology([
        root({
          path: '.',
          packageManager: 'npm',
          scripts: {
            dev: 'vite',
            build: 'vite build',
            test: 'vitest run',
            typecheck: 'tsc --noEmit',
            lint: 'eslint .',
          },
          type: 'frontend',
        }),
      ]),
      generatedAt: '2026-05-17T10:00:00.000Z',
      mode: 'report-only',
    });

    expect(plan.schemaVersion).toBe(1);
    expect(plan.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          root: '.',
          purpose: 'test',
          source: 'script',
          executable: 'npm',
          argv: ['run', 'test'],
          evidencePurpose: 'command:test',
          riskLevel: 'low',
          selected: true,
          allowedInReportOnly: true,
        }),
        expect.objectContaining({
          root: '.',
          purpose: 'typecheck',
          executable: 'npm',
          argv: ['run', 'typecheck'],
          selected: true,
        }),
        expect.objectContaining({
          root: '.',
          purpose: 'dev',
          executable: 'npm',
          argv: ['run', 'dev'],
          startsService: true,
          allowedInReportOnly: false,
        }),
        expect.objectContaining({
          root: '.',
          purpose: 'build',
          mutatesWorkspace: true,
          allowedInReportOnly: false,
        }),
      ]),
    );
    expect(plan.selections.find((selection) => selection.purpose === 'test')).toMatchObject({
      root: '.',
      selectedId: 'root:.:test:test',
      reason: expect.stringContaining('explicit script'),
    });
  });

  it('uses each root package manager instead of forcing npm', () => {
    const plan = detectVerificationCommands({
      topology: topology([
        root({ path: 'apps/pnpm-app', packageManager: 'pnpm', scripts: { test: 'vitest run' } }),
        root({ path: 'apps/yarn-app', packageManager: 'yarn', scripts: { test: 'vitest run' } }),
        root({ path: 'apps/bun-app', packageManager: 'bun', scripts: { test: 'bun test' } }),
      ]),
      generatedAt: '2026-05-17T10:00:00.000Z',
      mode: 'report-only',
    });

    expect(plan.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ root: 'apps/pnpm-app', executable: 'pnpm', argv: ['run', 'test'] }),
        expect.objectContaining({ root: 'apps/yarn-app', executable: 'yarn', argv: ['test'] }),
        expect.objectContaining({ root: 'apps/bun-app', executable: 'bun', argv: ['run', 'test'] }),
      ]),
    );
  });

  it('marks missing project scripts as inferred degraded candidates', () => {
    const plan = detectVerificationCommands({
      topology: topology([
        root({
          path: '.',
          packageManager: 'npm',
          scripts: {},
        }),
      ]),
      generatedAt: '2026-05-17T10:00:00.000Z',
      mode: 'report-only',
    });

    expect(byPurpose(plan, 'test')).toEqual([
      expect.objectContaining({
        source: 'inferred',
        degraded: true,
        confidence: expect.any(Number),
        executable: 'npm',
        argv: ['test'],
        reason: expect.stringContaining('No explicit test script'),
      }),
    ]);
    expect(plan.blockers).toEqual([
      expect.objectContaining({
        root: '.',
        purpose: 'test',
        severity: 'needs-human-input',
      }),
    ]);
  });

  it('selects the best candidate and records why alternatives were not selected', () => {
    const plan = detectVerificationCommands({
      topology: topology([
        root({
          path: '.',
          packageManager: 'npm',
          scripts: {
            test: 'vitest run',
            'test:unit': 'vitest run tests/unit',
            'test:e2e': 'playwright test',
          },
        }),
      ]),
      generatedAt: '2026-05-17T10:00:00.000Z',
      mode: 'report-only',
    });

    const testCandidates = byPurpose(plan, 'test');
    expect(testCandidates.find((candidate) => candidate.id === 'root:.:test:test')).toMatchObject({
      selected: true,
      selectionReason: expect.stringContaining('explicit script'),
    });
    expect(testCandidates.find((candidate) => candidate.id === 'root:.:test:test:unit')).toMatchObject({
      selected: false,
      notSelectedReason: expect.stringContaining('Higher confidence'),
    });
    expect(byPurpose(plan, 'e2e')).toEqual([
      expect.objectContaining({
        id: 'root:.:e2e:test:e2e',
        selected: true,
      }),
    ]);
  });

  it('emits Claude Code plugin validation candidates without running validation', () => {
    const pluginRoot = root({
      path: 'plugins/curdx-flow',
      packageManager: 'npm',
      scripts: {
        test: 'vitest run',
      },
      type: 'claude-code-plugin',
    });
    const plan = detectVerificationCommands({
      topology: topology([pluginRoot], {
        pluginRoots: [
          {
            path: 'plugins/curdx-flow',
            manifestPath: 'plugins/curdx-flow/.claude-plugin/plugin.json',
            hooksPath: 'plugins/curdx-flow/hooks/hooks.json',
            skillsPath: 'plugins/curdx-flow/skills',
            agentsPath: 'plugins/curdx-flow/agents',
            binPaths: ['plugins/curdx-flow/bin/curdx-flow'],
            validationCommand: {
              executable: 'claude',
              argv: ['plugin', 'validate', 'plugins/curdx-flow'],
              cwd: '.',
            },
            wiring: {
              manifest: true,
              hooks: true,
              skills: true,
              agents: true,
              bin: true,
            },
          },
        ],
      }),
      generatedAt: '2026-05-17T10:00:00.000Z',
    });

    expect(byPurpose(plan, 'plugin-validation')).toEqual([
      expect.objectContaining({
        root: 'plugins/curdx-flow',
        source: 'plugin',
        executable: 'claude',
        argv: ['plugin', 'validate', 'plugins/curdx-flow'],
        riskLevel: 'low',
        allowedInReportOnly: true,
        selected: true,
      }),
    ]);
  });

  it('supports Python, Go, and Rust signals without inventing npm commands', () => {
    const plan = detectVerificationCommands({
      topology: topology([
        root({ path: 'py', packageManager: 'unknown', type: 'unknown', entrySources: ['pyproject.toml'] }),
        root({ path: 'go', packageManager: 'unknown', type: 'unknown', entrySources: ['go.mod'] }),
        root({ path: 'rust', packageManager: 'unknown', type: 'unknown', entrySources: ['Cargo.toml'] }),
      ]),
      generatedAt: '2026-05-17T10:00:00.000Z',
    });

    expect(plan.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ root: 'py', purpose: 'test', executable: 'python', argv: ['-m', 'pytest'] }),
        expect.objectContaining({ root: 'go', purpose: 'test', executable: 'go', argv: ['test', './...'] }),
        expect.objectContaining({ root: 'rust', purpose: 'test', executable: 'cargo', argv: ['test'] }),
      ]),
    );
    expect(plan.commands.filter((candidate) => ['py', 'go', 'rust'].includes(candidate.root)).some((candidate) => candidate.executable === 'npm')).toBe(false);
  });

  it('marks high-risk or mutating commands as not allowed in report-only mode', () => {
    const plan = detectVerificationCommands({
      topology: topology([
        root({
          path: '.',
          packageManager: 'npm',
          scripts: {
            install: 'npm install',
            migrate: 'prisma migrate deploy',
            release: 'npm publish && git push --tags',
            build: 'tsup',
          },
        }),
      ]),
      generatedAt: '2026-05-17T10:00:00.000Z',
      mode: 'report-only',
    });

    expect(plan.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ purpose: 'install', riskLevel: 'high', allowedInReportOnly: false }),
        expect.objectContaining({ purpose: 'migration', riskLevel: 'high', allowedInReportOnly: false }),
        expect.objectContaining({ purpose: 'release', riskLevel: 'critical', allowedInReportOnly: false }),
        expect.objectContaining({ purpose: 'build', mutatesWorkspace: true, allowedInReportOnly: false }),
      ]),
    );
  });

  it('keeps package scripts as argv-array invocations instead of shell parsing user scripts', () => {
    const plan = detectVerificationCommands({
      topology: topology([
        root({
          path: '.',
          packageManager: 'npm',
          scripts: {
            test: 'vitest run && rm -rf dist',
          },
        }),
      ]),
      generatedAt: '2026-05-17T10:00:00.000Z',
      mode: 'report-only',
    });

    expect(byPurpose(plan, 'test')).toEqual([
      expect.objectContaining({
        executable: 'npm',
        argv: ['run', 'test'],
        command: 'vitest run && rm -rf dist',
        riskLevel: 'high',
        allowedInReportOnly: false,
      }),
    ]);
    expect(byPurpose(plan, 'test')[0]?.argv).not.toContain('&&');
    expect(byPurpose(plan, 'test')[0]?.argv).not.toContain('rm');
  });
});
