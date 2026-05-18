import { describe, expect, it } from 'vitest';

import type { CapabilityMatrix, CapabilityStatus } from '../../../src/runtime/capabilities/index.ts';
import { planCapabilityRoutes } from '../../../src/runtime/planner/index.ts';
import type { EvidenceRequirement } from '../../../src/runtime/verdict/index.ts';

const now = '2026-05-17T09:10:00.000Z';

function capability(overrides: Partial<CapabilityStatus> & Pick<CapabilityStatus, 'id'>): CapabilityStatus {
  const { id, ...rest } = overrides;
  const state = rest.state ?? 'available';
  return {
    schemaVersion: 1,
    id,
    label: rest.label ?? id,
    category: rest.category ?? 'core',
    provider: rest.provider ?? 'curdx-flow',
    provisioning: rest.provisioning ?? 'workflow',
    checkMode: rest.checkMode ?? 'fast',
    state,
    configured: rest.configured ?? true,
    installed: rest.installed ?? true,
    callable: rest.callable ?? true,
    authorized: rest.authorized ?? true,
    reason: rest.reason ?? `${id} ready`,
    evidenceImpact: rest.evidenceImpact ?? ['capability evidence'],
    blocksCompletion: rest.blocksCompletion ?? false,
    blocksRelease: rest.blocksRelease ?? false,
    remediation: rest.remediation ?? null,
    durationMs: rest.durationMs ?? 0,
    ...rest,
    degraded: state === 'degraded',
    unavailable: state === 'unavailable',
  };
}

function matrix(capabilities: CapabilityStatus[]): CapabilityMatrix {
  return {
    schemaVersion: 1,
    generatedAt: now,
    cwd: '/workspace',
    mode: 'fast',
    summary: {
      blockers: capabilities.filter((entry) => entry.blocksCompletion && entry.state !== 'available').length,
      degraded: capabilities.filter((entry) => entry.state === 'degraded').length,
      unavailable: capabilities.filter((entry) => entry.state === 'unavailable').length,
      skippedDeepChecks: capabilities.filter((entry) => entry.state === 'skipped').length,
    },
    capabilities,
    blockers: capabilities.filter((entry) => entry.blocksCompletion && entry.state !== 'available'),
    degraded: capabilities.filter((entry) => entry.state === 'degraded'),
    nextActions: [],
  };
}

function requirement(overrides: Partial<EvidenceRequirement>): EvidenceRequirement {
  return {
    id: 'req-command',
    source: 'command',
    description: 'command evidence',
    core: true,
    ...overrides,
  };
}

describe('capability routing planner', () => {
  it('prefers Playwright for rerunnable browser evidence and records Chrome DevTools MCP as diagnostic fallback', () => {
    const plan = planCapabilityRoutes({
      taskType: 'frontend',
      capabilityMatrix: matrix([
        capability({
          id: 'playwright',
          category: 'browser',
          provider: 'playwright',
          provisioning: 'project-script',
          state: 'skipped',
          configured: true,
          callable: 'skipped',
          reason: 'Playwright verifier candidate found: npm run e2e. Deep run skipped.',
        }),
        capability({
          id: 'chrome-devtools-mcp',
          category: 'plugin-dependency',
          provider: 'plugin',
          provisioning: 'plugin-dependency',
          state: 'available',
          evidenceImpact: ['browser evidence', 'console/network evidence'],
        }),
      ]),
      requirements: [
        requirement({
          id: 'req-browser',
          source: 'browser',
          description: 'browser journey evidence',
        }),
      ],
    });

    expect(plan.summary).toMatchObject({ selected: 1, fallback: 0, blocked: 0 });
    expect(plan.routes[0]).toMatchObject({
      requirementId: 'req-browser',
      decision: 'selected',
      selectedCapabilityId: 'playwright',
      trustLevel: 'verified',
      manualConfirmationRequired: false,
      blocksCompletion: false,
      remediationRefs: [],
    });
    expect(plan.routes[0]?.fallbackCapabilityIds).toContain('chrome-devtools-mcp');
    expect(plan.routes[0]?.reason).toContain('rerunnable');
  });

  it('routes UX evidence to ui-ux-pro-max without treating visual review as generic manual evidence', () => {
    const plan = planCapabilityRoutes({
      taskType: 'frontend',
      capabilityMatrix: matrix([
        capability({
          id: 'ui-ux-pro-max',
          category: 'plugin-dependency',
          provider: 'plugin',
          provisioning: 'plugin-dependency',
          state: 'available',
          evidenceImpact: ['UI/UX review evidence'],
        }),
      ]),
      requirements: [
        requirement({
          id: 'req-ux',
          source: 'manual',
          description: 'UX, visual, responsive and interaction evidence',
        }),
      ],
    });

    expect(plan.routes[0]).toMatchObject({
      requirementId: 'req-ux',
      decision: 'selected',
      primaryCapabilityId: 'ui-ux-pro-max',
      selectedCapabilityId: 'ui-ux-pro-max',
      trustLevel: 'verified',
    });
  });

  it('does not let Chrome DevTools MCP fallback masquerade as full rerunnable browser evidence', () => {
    const plan = planCapabilityRoutes({
      taskType: 'fullstack',
      capabilityMatrix: matrix([
        capability({
          id: 'playwright',
          category: 'browser',
          provider: 'playwright',
          provisioning: 'project-script',
          state: 'unavailable',
          configured: false,
          installed: false,
          callable: false,
          blocksCompletion: true,
          remediation: 'Add a Playwright/browser verification script.',
        }),
        capability({
          id: 'chrome-devtools-mcp',
          category: 'plugin-dependency',
          provider: 'plugin',
          provisioning: 'plugin-dependency',
          state: 'available',
        }),
      ]),
      requirements: [
        requirement({
          id: 'req-browser',
          source: 'browser',
          description: 'browser journey evidence',
        }),
      ],
    });

    expect(plan.routes[0]).toMatchObject({
      decision: 'fallback',
      selectedCapabilityId: 'chrome-devtools-mcp',
      trustLevel: 'degraded',
      manualConfirmationRequired: true,
      blocksCompletion: true,
    });
    expect(plan.routes[0]?.degradedReason).toContain('not rerunnable');
  });

  it('routes intelligence requirements without vendoring external plugins or MCPs', () => {
    const plan = planCapabilityRoutes({
      taskType: 'plugin',
      capabilityMatrix: matrix([
        capability({
          id: 'context7',
          category: 'external-mcp',
          provider: 'mcp',
          provisioning: 'external-mcp',
          state: 'unavailable',
          configured: false,
          installed: false,
          callable: false,
          blocksCompletion: true,
          remediation: 'Configure external context7 MCP.',
        }),
        capability({
          id: 'claude-mem',
          category: 'plugin-dependency',
          provider: 'plugin',
          provisioning: 'plugin-dependency',
          state: 'available',
        }),
        capability({
          id: 'pua',
          category: 'plugin-dependency',
          provider: 'plugin',
          provisioning: 'plugin-dependency',
          state: 'available',
        }),
        capability({
          id: 'sequential-thinking',
          category: 'external-mcp',
          provider: 'mcp',
          provisioning: 'external-mcp',
          state: 'degraded',
          callable: false,
        }),
      ]),
      requirements: [
        requirement({
          id: 'req-latest-docs',
          source: 'manual',
          capabilityId: 'context7',
          description: 'latest official docs lookup',
        }),
        requirement({
          id: 'req-history',
          source: 'log',
          capabilityId: 'claude-mem',
          description: 'historical failure lookup',
          core: false,
        }),
        requirement({
          id: 'req-parallel',
          source: 'manual',
          capabilityId: 'pua',
          description: 'parallel diagnostic decomposition',
          core: false,
        }),
        requirement({
          id: 'req-risk',
          source: 'manual',
          capabilityId: 'sequential-thinking',
          description: 'high-risk architecture reasoning',
          core: false,
        }),
      ],
    });

    expect(plan.routes.map((route) => [route.requirementId, route.decision])).toEqual([
      ['req-latest-docs', 'blocked'],
      ['req-history', 'selected'],
      ['req-parallel', 'selected'],
      ['req-risk', 'degraded'],
    ]);
    expect(plan.routes[0]?.remediationRefs).toEqual(['remediate-context7']);
    expect(plan.routes[0]?.reason).toContain('external MCP');
    expect(plan.routes[3]?.manualConfirmationRequired).toBe(true);
  });
});
