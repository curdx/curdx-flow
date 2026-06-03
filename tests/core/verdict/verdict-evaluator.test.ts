import { describe, expect, it } from 'vitest';

import type { EvidenceBlock, StateLedger } from '../../../src/core/contracts/index.ts';
import { evaluateCompletionVerdict, type EvidenceRequirement } from '../../../src/core/verdict/index.ts';

const now = '2026-05-17T01:00:00.000Z';

function state(overrides: Partial<StateLedger> = {}): StateLedger {
  return {
    schemaVersion: 1,
    runId: 'run-1',
    goalId: 'goal-1',
    workspaceRoot: '/workspace',
    mode: 'verification',
    policy: {
      noFalseCompletion: true,
    },
    scope: {
      summary: 'verify a user task',
    },
    expectedJourney: {
      summary: 'primary journey succeeds',
    },
    status: 'running',
    verdictStatus: 'pending',
    phase: 'verdict',
    startedAt: '2026-05-17T00:50:00.000Z',
    updatedAt: '2026-05-17T00:59:00.000Z',
    evidenceIds: [],
    missingEvidence: [],
    artifactIndexPath: '.curdx/artifacts/index.jsonl',
    dirtyBaseline: {
      capturedAt: '2026-05-17T00:50:00.000Z',
      files: [],
    },
    generatedFiles: [],
    nextAction: {
      owner: 'agent',
      summary: 'continue verification',
    },
    ...overrides,
  };
}

function evidence(overrides: Partial<EvidenceBlock> = {}): EvidenceBlock {
  return {
    schemaVersion: 1,
    id: 'ev-command-1',
    runId: 'run-1',
    goalId: 'goal-1',
    source: 'command',
    capabilityId: 'npm-test',
    trustLevel: 'verified',
    status: 'passed',
    summary: 'npm test passed',
    artifacts: [],
    startedAt: '2026-05-17T00:55:00.000Z',
    completedAt: '2026-05-17T00:56:00.000Z',
    freshness: {
      validatedAt: '2026-05-17T00:56:00.000Z',
      commandHash: 'sha256:command',
      targetHash: 'sha256:target',
      environmentId: 'node-22',
    },
    privacy: {
      classification: 'local-only',
      containsSecrets: false,
    },
    redactions: [],
    ...overrides,
  };
}

function requirement(overrides: Partial<EvidenceRequirement> = {}): EvidenceRequirement {
  return {
    id: 'req-command',
    source: 'command',
    description: 'command evidence',
    core: true,
    ...overrides,
  };
}

describe('completion verdict evaluator', () => {
  it('returns complete when all core requirements have fresh verified evidence', () => {
    const result = evaluateCompletionVerdict({
      state: state(),
      evidence: [evidence()],
      requirements: [requirement()],
      now,
      claimedComplete: true,
    });

    expect(result).toMatchObject({
      ok: true,
      verdict: {
        verdict: 'complete',
        evidenceRefs: ['ev-command-1'],
        missingEvidence: [],
        unverifiedScope: [],
      },
    });
  });

  it('does not treat an explicit empty requirements list as permission to complete without evidence', () => {
    const result = evaluateCompletionVerdict({
      state: state(),
      evidence: [],
      requirements: [],
      now,
      claimedComplete: true,
    });

    expect(result.verdict).toMatchObject({
      verdict: 'blocked',
      missingEvidence: [expect.objectContaining({ source: 'command' })],
    });
  });

  it('blocks frontend false completion when only command or self-reported evidence exists', () => {
    const result = evaluateCompletionVerdict({
      state: state(),
      taskType: 'frontend',
      evidence: [
        evidence({
          id: 'ev-static-1',
          source: 'log',
          capabilityId: 'agent-summary',
          trustLevel: 'self-reported',
          summary: 'agent says UI is done',
        }),
      ],
      now,
      claimedComplete: true,
    });

    expect(result).toMatchObject({
      ok: true,
      verdict: {
        verdict: 'blocked',
        missingEvidence: [
          expect.objectContaining({ source: 'browser' }),
          expect.objectContaining({ source: 'api' }),
        ],
      },
    });
    expect(result.verdict.evidenceRefs).not.toContain('ev-static-1');
  });

  it('does not let stale evidence support a successful verdict', () => {
    const result = evaluateCompletionVerdict({
      state: state(),
      evidence: [
        evidence({
          freshness: {
            validatedAt: '2026-05-16T00:56:00.000Z',
            commandHash: 'sha256:command',
            expiresAt: '2026-05-16T01:00:00.000Z',
          },
        }),
      ],
      requirements: [requirement()],
      now,
    });

    expect(result.verdict).toMatchObject({
      verdict: 'blocked',
      missingEvidence: [expect.objectContaining({ reason: expect.stringContaining('expired') })],
    });
  });

  it('uses a fresh rerun when older append-only evidence is stale', () => {
    const result = evaluateCompletionVerdict({
      state: state(),
      evidence: [
        evidence({
          id: 'ev-old',
          freshness: {
            validatedAt: '2026-05-16T00:56:00.000Z',
            commandHash: 'sha256:command',
            expiresAt: '2026-05-16T01:00:00.000Z',
          },
        }),
        evidence({ id: 'ev-fresh' }),
      ],
      requirements: [requirement()],
      now,
    });

    expect(result.verdict).toMatchObject({
      verdict: 'complete',
      evidenceRefs: ['ev-fresh'],
      missingEvidence: [],
    });
  });

  it('does not let target-mismatched evidence support a successful verdict', () => {
    const result = evaluateCompletionVerdict({
      state: state(),
      evidence: [evidence()],
      requirements: [
        requirement({
          target: {
            targetHash: 'sha256:expected-target',
          },
        }),
      ],
      now,
    });

    expect(result.verdict).toMatchObject({
      verdict: 'blocked',
      missingEvidence: [expect.objectContaining({ reason: expect.stringContaining('targetHash mismatch') })],
    });
  });

  it('gives core blockers precedence and preserves executable next action', () => {
    const result = evaluateCompletionVerdict({
      state: state(),
      evidence: [evidence()],
      requirements: [requirement()],
      blockers: [
        {
          code: 'browser-unavailable',
          category: 'browser',
          message: 'Chrome DevTools MCP unavailable',
          nextAction: {
            owner: 'user',
            summary: 'Install chrome-devtools-mcp',
          },
          owner: 'user',
          riskLevel: 'high',
          evidenceRefs: ['ev-command-1'],
          core: true,
        },
      ],
      now,
    });

    expect(result.verdict).toMatchObject({
      verdict: 'blocked',
      owner: 'user',
      riskLevel: 'high',
      evidenceRefs: ['ev-command-1'],
      nextAction: {
        owner: 'user',
        summary: 'Install chrome-devtools-mcp',
      },
    });
  });

  it('returns partial when optional scope is unverified but core evidence passed', () => {
    const result = evaluateCompletionVerdict({
      state: state(),
      evidence: [evidence()],
      requirements: [
        requirement(),
        requirement({
          id: 'req-api-optional',
          source: 'api',
          description: 'optional API smoke',
          core: false,
        }),
      ],
      now,
    });

    expect(result.verdict).toMatchObject({
      verdict: 'partial',
      unverifiedScope: [expect.objectContaining({ id: 'req-api-optional' })],
    });
  });

  it('returns manual-confirmation-required when manual confirmation is allowed but evidence is missing', () => {
    const result = evaluateCompletionVerdict({
      state: state(),
      evidence: [],
      requirements: [
        requirement({
          allowManualConfirmation: true,
        }),
      ],
      now,
    });

    expect(result.verdict).toMatchObject({
      verdict: 'manual-confirmation-required',
      missingEvidence: [expect.objectContaining({ id: 'req-command' })],
    });
  });

  it('blocks complete when state has missingEvidence and no manual confirmation', () => {
    const result = evaluateCompletionVerdict({
      state: state({ missingEvidence: [{ id: 'browser-run', source: 'browser' }] }),
      evidence: [evidence()],
      requirements: [requirement()],
      now,
      claimedComplete: true,
    });

    expect(result.verdict).toMatchObject({
      verdict: 'blocked',
      missingEvidence: [expect.objectContaining({ id: 'browser-run' })],
    });
  });

  it('blocks when policy tries to disable no false completion', () => {
    const result = evaluateCompletionVerdict({
      state: state({
        policy: {
          noFalseCompletion: false,
        },
      }),
      evidence: [evidence()],
      requirements: [requirement()],
      now,
      claimedComplete: true,
    });

    expect(result.verdict).toMatchObject({
      verdict: 'blocked',
      why: expect.stringContaining('no false completion'),
      missingEvidence: [
        expect.objectContaining({
          id: 'no-false-completion',
          source: 'state',
          core: true,
        }),
      ],
    });
  });

  it('treats policy-blocked core actions as blockers instead of verified completion', () => {
    const result = evaluateCompletionVerdict({
      state: state({
        policy: {
          noFalseCompletion: true,
          actionDecisions: [
            {
              id: 'delete-output',
              decision: 'blocked',
              actionType: 'delete-file',
              reason: 'delete-file requires explicit authorization',
              core: true,
              riskLevel: 'critical',
              evidenceRefs: ['ev-policy-1'],
            },
          ],
        },
      }),
      evidence: [evidence()],
      requirements: [requirement()],
      now,
      claimedComplete: true,
    });

    expect(result.verdict).toMatchObject({
      verdict: 'blocked',
      why: expect.stringContaining('Policy blocked delete-file'),
      riskLevel: 'critical',
      evidenceRefs: ['ev-policy-1'],
      missingEvidence: [
        expect.objectContaining({
          id: 'policy-delete-output',
          source: 'state',
          reason: 'delete-file requires explicit authorization',
        }),
      ],
    });
  });

  it('blocks report-only verdicts when generated files show source mutation', () => {
    const result = evaluateCompletionVerdict({
      state: state({
        mode: 'report-only',
        generatedFiles: [
          {
            path: 'src/core/verdict/evaluator.ts',
            category: 'source-change',
            owner: 'curdx-flow',
            createdAt: '2026-05-17T00:58:00.000Z',
            relatedRunId: 'run-1',
          },
        ],
      }),
      evidence: [evidence()],
      requirements: [requirement()],
      now,
      claimedComplete: true,
    });

    expect(result.verdict).toMatchObject({
      verdict: 'blocked',
      why: expect.stringContaining('report-only generated file boundary'),
      missingEvidence: [
        expect.objectContaining({
          id: 'report-only-write-boundary',
          source: 'state',
          reason: expect.stringContaining('src/core/verdict/evaluator.ts'),
        }),
      ],
    });
  });

  it('returns partial when policy skips optional actions while core evidence passed', () => {
    const result = evaluateCompletionVerdict({
      state: state({
        policy: {
          noFalseCompletion: true,
          actionDecisions: [
            {
              id: 'optional-api-probe',
              decision: 'skipped',
              actionType: 'api-check',
              reason: 'context7 unavailable in report-only mode',
              core: false,
              riskLevel: 'low',
            },
          ],
        },
      }),
      evidence: [evidence()],
      requirements: [requirement()],
      now,
    });

    expect(result.verdict).toMatchObject({
      verdict: 'partial',
      unverifiedScope: [
        expect.objectContaining({
          id: 'policy-optional-api-probe',
          reason: 'context7 unavailable in report-only mode',
        }),
      ],
    });
  });

  it('keeps degraded fallback routing out of complete verdicts even when command evidence passed', () => {
    const result = evaluateCompletionVerdict({
      state: state({
        policy: {
          noFalseCompletion: true,
          capabilityRoutes: [
            {
              id: 'route-browser',
              requirementId: 'req-browser',
              decision: 'fallback',
              selectedCapabilityId: 'chrome-devtools-mcp',
              reason: 'Chrome DevTools MCP is diagnostic fallback, not rerunnable E2E evidence.',
              trustLevel: 'degraded',
              core: true,
              blocksCompletion: false,
            },
          ],
        },
      }),
      evidence: [evidence()],
      requirements: [requirement()],
      now,
      claimedComplete: true,
    });

    expect(result.verdict).toMatchObject({
      verdict: 'partial',
      unverifiedScope: [
        expect.objectContaining({
          id: 'capability-route-browser',
          source: 'state',
          reason: expect.stringContaining('diagnostic fallback'),
        }),
      ],
    });
  });

  it('keeps degraded API and external MCP routes out of complete verdicts in report-only mode', () => {
    const result = evaluateCompletionVerdict({
      state: state({
        mode: 'report-only',
        policy: {
          noFalseCompletion: true,
          capabilityRoutes: [
            {
              id: 'route-api',
              requirementId: 'req-api',
              requirementSource: 'api',
              description: 'API request/response evidence',
              decision: 'degraded',
              selectedCapabilityId: 'api.check',
              reason: 'API verifier command is unavailable in this workspace.',
              trustLevel: 'degraded',
              core: true,
              blocksCompletion: false,
            },
            {
              id: 'route-docs',
              requirementId: 'req-latest-docs',
              requirementSource: 'manual',
              description: 'latest official docs lookup',
              decision: 'degraded',
              selectedCapabilityId: 'context7',
              reason: 'context7 external MCP is unavailable.',
              trustLevel: 'degraded',
              core: false,
              blocksCompletion: false,
            },
          ],
        },
      }),
      evidence: [evidence()],
      requirements: [requirement()],
      now,
      claimedComplete: true,
    });

    expect(result.verdict.verdict).not.toBe('complete');
    expect(result.verdict).toMatchObject({
      verdict: 'partial',
      unverifiedScope: [
        expect.objectContaining({
          id: 'capability-route-api',
          reason: expect.stringContaining('API verifier'),
        }),
        expect.objectContaining({
          id: 'capability-route-docs',
          reason: expect.stringContaining('context7 external MCP'),
        }),
      ],
    });
  });

  it('returns manual-confirmation-required when a report-only routing fallback leaves only allowed manual gaps', () => {
    const result = evaluateCompletionVerdict({
      state: state({
        mode: 'report-only',
        policy: {
          noFalseCompletion: true,
          capabilityRoutes: [
            {
              id: 'route-browser',
              requirementId: 'req-browser',
              decision: 'fallback',
              selectedCapabilityId: 'chrome-devtools-mcp',
              reason: 'Only diagnostic browser fallback is available.',
              trustLevel: 'degraded',
              manualConfirmationRequired: true,
              core: false,
              blocksCompletion: false,
            },
          ],
        },
      }),
      evidence: [],
      requirements: [
        requirement({
          id: 'req-browser',
          source: 'browser',
          description: 'browser journey evidence',
          allowManualConfirmation: true,
        }),
      ],
      now,
      claimedComplete: true,
    });

    expect(result.verdict).toMatchObject({
      verdict: 'manual-confirmation-required',
      missingEvidence: [
        expect.objectContaining({
          id: 'req-browser',
          source: 'browser',
        }),
      ],
    });
  });

  it('blocks completion when capability routing records a core blocker', () => {
    const result = evaluateCompletionVerdict({
      state: state({
        policy: {
          noFalseCompletion: true,
          capabilityRoutes: [
            {
              id: 'route-context7',
              requirementId: 'req-docs',
              decision: 'blocked',
              selectedCapabilityId: null,
              reason: 'context7 external MCP is unavailable for latest official docs.',
              trustLevel: 'blocked',
              core: true,
              blocksCompletion: true,
              remediationRefs: ['remediate-context7'],
            },
          ],
        },
      }),
      evidence: [evidence()],
      requirements: [requirement()],
      now,
    });

    expect(result.verdict).toMatchObject({
      verdict: 'blocked',
      why: expect.stringContaining('Capability route blocked'),
      missingEvidence: [
        expect.objectContaining({
          id: 'capability-route-context7',
          reason: expect.stringContaining('context7 external MCP'),
        }),
      ],
    });
  });

  it('does not let unrelated manual confirmation hide state missing evidence', () => {
    const result = evaluateCompletionVerdict({
      state: state({ missingEvidence: [{ id: 'browser-run', source: 'browser' }] }),
      evidence: [evidence()],
      requirements: [requirement()],
      manualConfirmations: [
        {
          id: 'manual-other',
          summary: 'Confirmed another item.',
          confirmedAt: now,
          requirementIds: ['other-requirement'],
        },
      ],
      now,
      claimedComplete: true,
    });

    expect(result.verdict).toMatchObject({
      verdict: 'blocked',
      missingEvidence: [expect.objectContaining({ id: 'browser-run' })],
    });
  });

  it('does not return release-ready without release evidence and release-stage authorization', () => {
    const result = evaluateCompletionVerdict({
      state: state(),
      taskType: 'release',
      evidence: [evidence()],
      now,
    });

    expect(result.verdict.verdict).not.toBe('release-ready');
    expect(result.verdict).toMatchObject({
      verdict: 'blocked',
      missingEvidence: expect.arrayContaining([expect.objectContaining({ source: 'release' })]),
    });
  });

  it('returns release-ready only with fresh release evidence and authorization', () => {
    const result = evaluateCompletionVerdict({
      state: state({ mode: 'release' }),
      taskType: 'release',
      evidence: [
        evidence({
          id: 'ev-release-1',
          source: 'release',
          capabilityId: 'release-dry-run',
          summary: 'release dry-run passed',
        }),
      ],
      releaseStageAuthorized: true,
      now,
    });

    expect(result.verdict).toMatchObject({
      verdict: 'release-ready',
      evidenceRefs: ['ev-release-1'],
      missingEvidence: [],
    });
  });
});
