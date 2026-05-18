import { describe, expect, it } from 'vitest';

import type { CapabilityMatrix, CapabilityStatus } from '../../../src/runtime/capabilities/index.ts';
import {
  planUserJourneyVerification,
  type UserJourneyHint,
} from '../../../src/runtime/planner/index.ts';
import type { RuntimeTopology } from '../../../src/runtime/discovery/index.ts';

const now = '2026-05-17T13:10:00.000Z';

function capability(overrides: Partial<CapabilityStatus> & Pick<CapabilityStatus, 'id'>): CapabilityStatus {
  const state = overrides.state ?? 'available';
  return {
    schemaVersion: 1,
    id: overrides.id,
    label: overrides.label ?? overrides.id,
    category: overrides.category ?? 'core',
    provider: overrides.provider ?? 'curdx-flow',
    provisioning: overrides.provisioning ?? 'workflow',
    checkMode: overrides.checkMode ?? 'fast',
    state,
    configured: overrides.configured ?? true,
    installed: overrides.installed ?? true,
    callable: overrides.callable ?? true,
    authorized: overrides.authorized ?? true,
    degraded: state === 'degraded',
    unavailable: state === 'unavailable',
    reason: overrides.reason ?? `${overrides.id} ready`,
    skippedReason: overrides.skippedReason,
    evidenceImpact: overrides.evidenceImpact ?? [`${overrides.id} evidence`],
    blocksCompletion: overrides.blocksCompletion ?? false,
    blocksRelease: overrides.blocksRelease ?? false,
    remediation: overrides.remediation ?? null,
    durationMs: overrides.durationMs ?? 0,
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

function topology(overrides: Partial<RuntimeTopology> = {}): RuntimeTopology {
  return {
    schemaVersion: 1,
    workspaceRoot: '/workspace',
    generatedAt: now,
    overallType: 'full-stack',
    status: 'ready',
    confidence: 0.9,
    packageManager: 'npm',
    roots: [
      {
        path: '.',
        type: 'full-stack',
        status: 'ready',
        confidence: 0.9,
        packageManager: 'npm',
        packageJsonPath: 'package.json',
        scripts: { dev: 'next dev' },
        entryHints: [],
        scriptHints: [],
        serviceHints: [{ kind: 'service', source: 'script:dev', summary: 'dev service', confidence: 0.8, scriptName: 'dev', command: 'next dev' }],
        apiHints: [{ kind: 'api', source: 'app/api', summary: 'API routes exist', confidence: 0.82 }],
        dataHints: [{ kind: 'data', source: 'prisma/schema.prisma', summary: 'Prisma schema exists', confidence: 0.82 }],
        browserHints: [{ kind: 'browser', source: 'app/page.tsx', summary: 'App route exists', confidence: 0.8, path: 'app/page.tsx' }],
        validationHints: [],
        pluginHints: [],
        blockers: [],
        reasons: ['fixture topology'],
      },
    ],
    pluginRoots: [],
    blockers: [],
    hints: [],
    ...overrides,
  };
}

const explicitProfileJourney: UserJourneyHint = {
  id: 'profile-save',
  title: 'Profile save flow',
  entry: {
    url: 'http://127.0.0.1:3000/profile',
    serviceId: 'frontend',
  },
  actions: [
    { id: 'open-profile', type: 'navigate', description: 'Open profile page' },
    { id: 'edit-name', type: 'fill', target: 'input[name="name"]', value: 'Ada Lovelace', description: 'Change display name' },
    { id: 'submit-profile', type: 'click', target: 'button[type="submit"]', description: 'Save profile' },
  ],
  expectedUi: [
    { actionId: 'submit-profile', state: 'success', assertion: 'Profile page shows Saved and the new display name' },
  ],
  expectedApi: [
    { actionId: 'submit-profile', method: 'PATCH', urlPattern: '/api/profile', expectedStatus: 200, responseShape: 'updated profile JSON' },
  ],
  expectedData: [
    { actionId: 'submit-profile', target: 'profile.name', expectedState: 'Ada Lovelace persists after readback', readback: 'GET /api/profile returns updated name' },
  ],
};

describe('user journey verification planner', () => {
  it('creates a high-confidence plan from an explicit full-stack journey', () => {
    const plan = planUserJourneyVerification({
      userIntent: 'Verify saving the user profile works end to end.',
      taskType: 'fullstack',
      mode: 'verification',
      topology: topology(),
      capabilityMatrix: matrix([
        capability({ id: 'playwright', category: 'browser', provider: 'playwright', provisioning: 'project-script' }),
        capability({ id: 'api.check' }),
        capability({ id: 'data.probe' }),
      ]),
      journeys: [explicitProfileJourney],
      generatedAt: now,
    });

    expect(plan.status).toBe('ready');
    expect(plan.verdict).toMatchObject({
      status: 'ready',
      complete: false,
      reason: expect.stringContaining('plan is ready'),
    });
    expect(plan.journeys[0]).toMatchObject({
      id: 'profile-save',
      inferred: false,
      confidence: 1,
      entry: {
        url: 'http://127.0.0.1:3000/profile',
        serviceId: 'frontend',
      },
      actions: [
        expect.objectContaining({ id: 'open-profile', type: 'navigate' }),
        expect.objectContaining({ id: 'edit-name', type: 'fill' }),
        expect.objectContaining({ id: 'submit-profile', type: 'click' }),
      ],
      expectedUi: [expect.objectContaining({ actionId: 'submit-profile', state: 'success' })],
      expectedApi: [expect.objectContaining({ actionId: 'submit-profile', method: 'PATCH', expectedStatus: 200 })],
      expectedData: [expect.objectContaining({ actionId: 'submit-profile', target: 'profile.name' })],
    });
    expect(plan.requiredArtifacts.map((artifact) => artifact.type)).toEqual(expect.arrayContaining(['screenshot', 'trace', 'api-response', 'data-readback']));
    expect(plan.missingEvidence).toEqual([]);
    expect(plan.capabilityRoutes?.summary).toMatchObject({ selected: 3, blocked: 0 });
  });

  it('marks inferred journeys as needing human input when action details are missing', () => {
    const plan = planUserJourneyVerification({
      userIntent: 'Check that the dashboard works.',
      taskType: 'frontend',
      mode: 'verification',
      topology: topology({ overallType: 'frontend' }),
      capabilityMatrix: matrix([
        capability({ id: 'playwright', category: 'browser', provider: 'playwright', provisioning: 'project-script' }),
      ]),
      generatedAt: now,
    });

    expect(plan.status).toBe('needs-human-input');
    expect(plan.journeys[0]).toMatchObject({
      inferred: true,
      confidence: expect.any(Number),
    });
    expect(plan.journeys[0]?.confidence).toBeLessThan(0.75);
    expect(plan.missingEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'journey-actions-missing', source: 'browser', core: true }),
    ]));
    expect(plan.verdict.complete).toBe(false);
  });

  it('keeps browser/API/data evidence gaps explicit for full-stack tasks', () => {
    const plan = planUserJourneyVerification({
      userIntent: 'Verify profile save.',
      taskType: 'fullstack',
      mode: 'verification',
      topology: topology(),
      capabilityMatrix: matrix([
        capability({
          id: 'playwright',
          category: 'browser',
          provider: 'playwright',
          provisioning: 'project-script',
          state: 'unavailable',
          callable: false,
          blocksCompletion: true,
          remediation: 'Add Playwright verifier.',
        }),
        capability({ id: 'api.check', state: 'unavailable', callable: false, blocksCompletion: true }),
        capability({ id: 'data.probe', state: 'unavailable', callable: false, blocksCompletion: true }),
      ]),
      journeys: [explicitProfileJourney],
      generatedAt: now,
    });

    expect(plan.status).toBe('blocked');
    expect(plan.missingEvidence.map((gap) => gap.source)).toEqual(expect.arrayContaining(['browser', 'api', 'data']));
    expect(plan.capabilityRoutes?.blockers.map((route) => route.requirementSource)).toEqual(expect.arrayContaining(['browser', 'api', 'data']));
    expect(plan.verdict.complete).toBe(false);
  });

  it('keeps report-only plans free of write, test-generation, migration, and recovery execution actions', () => {
    const plan = planUserJourneyVerification({
      userIntent: 'Create a QA report for the profile save flow.',
      taskType: 'fullstack',
      mode: 'report-only',
      topology: topology(),
      capabilityMatrix: matrix([
        capability({ id: 'playwright', category: 'browser', provider: 'playwright', provisioning: 'project-script' }),
        capability({ id: 'api.check' }),
        capability({ id: 'data.probe' }),
      ]),
      journeys: [explicitProfileJourney],
      generatedAt: now,
    });

    const forbidden = new Set(['edit-source', 'generate-test', 'migration', 'execute-recovery']);
    const readOnly = new Set(['navigate', 'observe', 'run-check', 'capture-screenshot', 'capture-trace']);
    expect(plan.status).toBe('ready');
    expect(plan.journeys.flatMap((journey) => journey.actions).some((action) => forbidden.has(action.type))).toBe(false);
    expect(plan.journeys.flatMap((journey) => journey.actions).every((action) => readOnly.has(action.type))).toBe(true);
    expect(plan.journeys.flatMap((journey) => journey.actions).every((action) => action.allowedInReportOnly)).toBe(true);
  });

  it('redacts explicitly forbidden report-only actions instead of marking them allowed', () => {
    const plan = planUserJourneyVerification({
      userIntent: 'Report on a risky profile workflow without editing files.',
      taskType: 'fullstack',
      mode: 'report-only',
      topology: topology(),
      capabilityMatrix: matrix([
        capability({ id: 'playwright', category: 'browser', provider: 'playwright', provisioning: 'project-script' }),
        capability({ id: 'api.check' }),
        capability({ id: 'data.probe' }),
      ]),
      journeys: [{
        ...explicitProfileJourney,
        actions: [
          ...explicitProfileJourney.actions,
          { id: 'patch-component', type: 'edit-source', description: 'Patch the profile component' },
          { id: 'generate-e2e', type: 'generate-test', description: 'Generate a new E2E test file' },
        ],
      }],
      generatedAt: now,
    });

    expect(plan.status).toBe('partial');
    expect(plan.journeys.flatMap((journey) => journey.actions)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'patch-component', type: 'observe', originalType: 'edit-source', allowedInReportOnly: true }),
      expect.objectContaining({ id: 'generate-e2e', type: 'observe', originalType: 'generate-test', allowedInReportOnly: true }),
    ]));
    expect(plan.journeys.flatMap((journey) => journey.actions).some((action) =>
      ['edit-source', 'generate-test', 'migration', 'execute-recovery'].includes(action.type),
    )).toBe(false);
    expect(plan.missingEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'report-only-forbidden-action-patch-component', source: 'manual', blocksCompletion: true }),
      expect.objectContaining({ id: 'report-only-forbidden-action-generate-e2e', source: 'manual', blocksCompletion: true }),
    ]));
  });

  it('marks API and data expectations missing when they are not bound to journey actions', () => {
    const plan = planUserJourneyVerification({
      userIntent: 'Verify saving the user profile works end to end.',
      taskType: 'fullstack',
      mode: 'verification',
      topology: topology(),
      capabilityMatrix: matrix([
        capability({ id: 'playwright', category: 'browser', provider: 'playwright', provisioning: 'project-script' }),
        capability({ id: 'api.check' }),
        capability({ id: 'data.probe' }),
      ]),
      journeys: [{
        ...explicitProfileJourney,
        expectedApi: [
          { actionId: 'missing-submit-action', method: 'PATCH', urlPattern: '/api/profile', expectedStatus: 200 },
        ],
        expectedData: [
          { actionId: 'missing-submit-action', target: 'profile.name', expectedState: 'updated name persists', readback: 'GET /api/profile returns updated name' },
        ],
      }],
      generatedAt: now,
    });

    expect(plan.status).toBe('partial');
    expect(plan.missingEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'api-action-binding-missing-profile-save-missing-submit-action', source: 'api', blocksCompletion: true }),
      expect.objectContaining({ id: 'data-action-binding-missing-profile-save-missing-submit-action', source: 'data', blocksCompletion: true }),
    ]));
  });

  it('marks data expectations without readback proof as partial', () => {
    const plan = planUserJourneyVerification({
      userIntent: 'Verify saving the user profile persists data.',
      taskType: 'fullstack',
      mode: 'verification',
      topology: topology(),
      capabilityMatrix: matrix([
        capability({ id: 'playwright', category: 'browser', provider: 'playwright', provisioning: 'project-script' }),
        capability({ id: 'api.check' }),
        capability({ id: 'data.probe' }),
      ]),
      journeys: [{
        ...explicitProfileJourney,
        expectedData: [
          { actionId: 'submit-profile', target: 'profile.name', expectedState: 'updated name persists' },
        ],
      }],
      generatedAt: now,
    });

    expect(plan.status).toBe('partial');
    expect(plan.missingEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'data-readback-missing-profile-save-submit-profile', source: 'data', blocksCompletion: true }),
    ]));
  });

  it('does not treat an explicit entry with no action sequence as ready', () => {
    const plan = planUserJourneyVerification({
      userIntent: 'Verify a page but the action path is not known.',
      taskType: 'frontend',
      mode: 'verification',
      topology: topology({ overallType: 'frontend' }),
      capabilityMatrix: matrix([
        capability({ id: 'playwright', category: 'browser', provider: 'playwright', provisioning: 'project-script' }),
      ]),
      journeys: [{
        id: 'empty-path',
        title: 'Empty path',
        entry: { url: 'http://127.0.0.1:3000/settings' },
        actions: [],
        expectedUi: [
          { actionId: 'missing-action', state: 'success', assertion: 'Settings page saves successfully' },
        ],
      }],
      generatedAt: now,
    });

    expect(plan.status).toBe('needs-human-input');
    expect(plan.missingEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'journey-actions-missing', source: 'browser', blocksCompletion: true }),
      expect.objectContaining({ id: 'ui-action-binding-missing-empty-path-missing-action', source: 'browser', blocksCompletion: true }),
    ]));
  });

  it('models fix mode as recovery handoff plus same-path retry without executing fixes', () => {
    const plan = planUserJourneyVerification({
      userIntent: 'Fix profile save if it fails, then rerun the same path.',
      taskType: 'fullstack',
      mode: 'fix',
      topology: topology(),
      capabilityMatrix: matrix([
        capability({ id: 'playwright', category: 'browser', provider: 'playwright', provisioning: 'project-script' }),
        capability({ id: 'api.check' }),
        capability({ id: 'data.probe' }),
      ]),
      journeys: [explicitProfileJourney],
      generatedAt: now,
    });

    expect(plan.recovery).toEqual({
      handoffRequired: true,
      owner: 'recovery',
      reason: expect.stringContaining('Epic 5'),
      samePathRetryRequired: true,
    });
    expect(plan.journeys[0]?.actions.map((action) => action.type)).toEqual(expect.arrayContaining([
      'reproduce-before-fix',
      'handoff-to-recovery',
      'same-path-retry',
    ]));
    expect(plan.journeys[0]?.actions.some((action) => action.type === 'execute-recovery')).toBe(false);
  });

  it('blocks unknown routes instead of inventing entry URL or action sequence', () => {
    const plan = planUserJourneyVerification({
      userIntent: 'Verify the main flow.',
      taskType: 'frontend',
      mode: 'verification',
      topology: topology({
        overallType: 'unknown',
        status: 'needs-human-input',
        confidence: 0,
        roots: [],
        blockers: [{ code: 'no-project-roots', path: '.', severity: 'needs-human-input', summary: 'No project roots found.' }],
      }),
      capabilityMatrix: matrix([]),
      generatedAt: now,
    });

    expect(plan.status).toBe('blocked');
    expect(plan.journeys).toEqual([]);
    expect(plan.missingEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'entry-url-missing', source: 'browser', core: true }),
      expect.objectContaining({ id: 'journey-actions-missing', source: 'browser', core: true }),
    ]));
    expect(plan.verdict.complete).toBe(false);
  });
});
