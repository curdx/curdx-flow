import { describe, expect, it } from 'vitest';

import {
  type CapabilityStatus,
  planCapabilityRemediation,
} from '../../../src/runtime/capabilities/index.ts';
import { buildDefaultActionRiskPolicy } from '../../../src/runtime/policy/index.ts';

function capability(overrides: Partial<CapabilityStatus> & Pick<CapabilityStatus, 'id'>): CapabilityStatus {
  const { id, ...rest } = overrides;
  const state = rest.state ?? 'unavailable';
  return {
    schemaVersion: 1,
    id,
    label: rest.label ?? id,
    category: rest.category ?? 'plugin-dependency',
    provider: rest.provider ?? 'plugin',
    provisioning: rest.provisioning ?? 'plugin-dependency',
    checkMode: rest.checkMode ?? 'fast',
    state,
    configured: rest.configured ?? false,
    installed: rest.installed ?? false,
    callable: rest.callable ?? false,
    authorized: rest.authorized ?? false,
    reason: rest.reason ?? `${id} missing`,
    evidenceImpact: rest.evidenceImpact ?? ['capability evidence'],
    blocksCompletion: rest.blocksCompletion ?? true,
    blocksRelease: rest.blocksRelease ?? false,
    remediation: rest.remediation ?? `Fix ${id}`,
    durationMs: rest.durationMs ?? 0,
    ...rest,
    degraded: state === 'degraded',
    unavailable: state === 'unavailable',
  };
}

describe('capability remediation planner', () => {
  it('does not create remediation for a configured Playwright verifier that was only skipped by fast doctor', () => {
    const plan = planCapabilityRemediation({
      workspaceRoot: '/workspace',
      policy: buildDefaultActionRiskPolicy({ mode: 'fix' }),
      capabilities: [
        capability({
          id: 'playwright',
          label: 'Playwright',
          category: 'browser',
          provider: 'playwright',
          provisioning: 'project-script',
          state: 'skipped',
          configured: true,
          installed: true,
          callable: 'skipped',
          blocksCompletion: false,
          reason: 'Fast doctor does not run Playwright/browser verification.',
        }),
      ],
    });

    expect(plan).toMatchObject({
      status: 'clean',
      actions: [],
      blockers: [],
    });
  });

  it('plans policy-gated plugin dependency remediation without executing global plugin changes', () => {
    const plan = planCapabilityRemediation({
      workspaceRoot: '/workspace',
      policy: buildDefaultActionRiskPolicy({ mode: 'fix' }),
      capabilities: [
        capability({
          id: 'chrome-devtools-mcp',
          label: 'chrome-devtools-mcp',
          category: 'plugin-dependency',
          provisioning: 'plugin-dependency',
          evidenceImpact: ['browser evidence'],
          reason: 'plugin dependency missing',
        }),
      ],
    });

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toMatchObject({
      id: 'remediate-chrome-devtools-mcp',
      capabilityId: 'chrome-devtools-mcp',
      kind: 'install-plugin-dependency',
      riskLevel: 'critical',
      requiresAuthorization: true,
      expectedRestoredCapabilities: ['browser evidence'],
      verificationCommand: 'claude plugin list --json',
      executesAutomatically: false,
      failureFallback: expect.stringContaining('degraded'),
    });
    expect(plan.actions[0]?.policyDecision).toMatchObject({
      decision: 'blocked',
      actionType: 'global-config-change',
      riskLevel: 'critical',
    });
  });

  it('keeps external MCP remediation out of plugin dependencies and plugin-local MCP config', () => {
    const plan = planCapabilityRemediation({
      workspaceRoot: '/workspace',
      policy: buildDefaultActionRiskPolicy({ mode: 'fix' }),
      capabilities: [
        capability({
          id: 'context7',
          label: 'context7',
          category: 'external-mcp',
          provider: 'mcp',
          provisioning: 'external-mcp',
          evidenceImpact: ['current documentation evidence'],
          reason: 'external MCP missing',
        }),
      ],
    });

    expect(plan.actions[0]).toMatchObject({
      id: 'remediate-context7',
      kind: 'configure-external-mcp',
      verificationCommand: 'claude mcp list',
      executesAutomatically: false,
    });
    expect(plan.actions[0]?.action).toContain('external MCP');
    expect(plan.actions[0]?.action).not.toContain('plugin dependency');
    expect(plan.actions[0]?.targetFiles).not.toContain('plugins/curdx-flow/.mcp.json');
  });

  it('preserves degraded state and completion impact after attempted remediation still fails callability', () => {
    const plan = planCapabilityRemediation({
      workspaceRoot: '/workspace',
      policy: buildDefaultActionRiskPolicy({ mode: 'fix' }),
      capabilities: [
        capability({
          id: 'playwright',
          label: 'Playwright',
          category: 'browser',
          provider: 'playwright',
          provisioning: 'project-script',
          state: 'degraded',
          configured: true,
          installed: true,
          callable: false,
          evidenceImpact: ['browser evidence', 'UI journey evidence'],
          reason: 'Playwright command exits 1',
          remediation: 'Fix Playwright verifier script.',
        }),
      ],
      attemptedActions: [
        {
          id: 'remediate-playwright',
          capabilityId: 'playwright',
          result: 'failed',
          reason: 'npm run e2e still exits 1',
        },
      ],
    });

    expect(plan.actions[0]).toMatchObject({
      id: 'remediate-playwright',
      status: 'failed',
      attempted: true,
      attemptReason: 'npm run e2e still exits 1',
      postAttemptCapabilityState: 'degraded',
      completionImpact: expect.stringContaining('browser evidence'),
    });
  });
});
