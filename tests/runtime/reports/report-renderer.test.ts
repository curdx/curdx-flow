import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { ArtifactIndexEntry, CompletionVerdict, EvidenceBlock, StateLedger } from '../../../src/runtime/contracts/index.ts';
import { validateContract } from '../../../src/runtime/contracts/index.ts';
import {
  buildTranscriptSummary,
  renderVerificationReport,
  resolveReportPaths,
  writeVerificationReport,
} from '../../../src/runtime/reports/index.ts';

const generatedAt = '2026-05-17T02:00:00.000Z';
const workspaces: string[] = [];

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), 'curdx-reports-'));
  workspaces.push(workspace);
  return workspace;
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })));
});

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
      summary: 'implement report renderer',
    },
    expectedJourney: {
      summary: 'runtime reports are generated',
    },
    status: 'running',
    verdictStatus: 'pending',
    phase: 'reports',
    startedAt: '2026-05-17T01:50:00.000Z',
    updatedAt: '2026-05-17T01:59:00.000Z',
    evidenceIds: ['ev-command-1'],
    missingEvidence: [],
    artifactIndexPath: '.curdx/artifacts/index.jsonl',
    dirtyBaseline: {
      capturedAt: '2026-05-17T01:50:00.000Z',
      files: [],
    },
    generatedFiles: [],
    nextAction: {
      owner: 'reviewer',
      summary: 'review report',
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
    capabilityId: 'npm-typecheck',
    trustLevel: 'verified',
    status: 'passed',
    summary: 'npm run typecheck exited 0',
    artifacts: [
      {
        id: 'artifact-log-1',
        type: 'log',
        path: '.curdx/artifacts/logs/typecheck.log',
        summary: 'typecheck output',
      },
    ],
    startedAt: '2026-05-17T01:55:00.000Z',
    completedAt: '2026-05-17T01:55:05.000Z',
    freshness: {
      validatedAt: '2026-05-17T01:55:05.000Z',
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

function artifact(overrides: Partial<ArtifactIndexEntry> = {}): ArtifactIndexEntry {
  return {
    schemaVersion: 1,
    id: 'artifact-log-1',
    runId: 'run-1',
    goalId: 'goal-1',
    evidenceId: 'ev-command-1',
    type: 'log',
    path: '.curdx/artifacts/logs/typecheck.log',
    summary: 'typecheck output',
    privacy: {
      classification: 'local-only',
      containsSensitiveData: false,
      redacted: true,
    },
    createdAt: '2026-05-17T01:55:05.000Z',
    ...overrides,
  };
}

function verdict(overrides: Partial<CompletionVerdict> = {}): CompletionVerdict {
  return {
    schemaVersion: 1,
    verdict: 'complete',
    why: 'All required evidence is fresh and passing.',
    evidenceRefs: ['ev-command-1'],
    missingEvidence: [],
    nextAction: {
      owner: 'reviewer',
      summary: 'review implementation',
    },
    owner: 'curdx-flow',
    riskLevel: 'low',
    confidence: 0.94,
    unverifiedScope: [],
    ...overrides,
  };
}

function render(overrides: {
  state?: Partial<StateLedger>;
  evidence?: EvidenceBlock[];
  artifactIndex?: ArtifactIndexEntry[];
  verdict?: Partial<CompletionVerdict>;
  blockers?: Record<string, unknown>[];
  issues?: Record<string, unknown>[];
} = {}) {
  return renderVerificationReport({
    state: state(overrides.state),
    evidence: overrides.evidence ?? [evidence()],
    artifactIndex: overrides.artifactIndex ?? [artifact()],
    verdict: verdict(overrides.verdict),
    blockers: overrides.blockers,
    verifier: {
      command: 'npm run typecheck',
      exitCode: 0,
    },
    generatedAt,
    issues: overrides.issues,
  });
}

describe('verification report renderer', () => {
  it('renders passed reports as schema-valid Markdown and machine JSON', () => {
    const report = render();

    expect(validateContract('verificationReport', report.json)).toMatchObject({ ok: true });
    expect(report.json).toMatchObject({
      runId: 'run-1',
      goalId: 'goal-1',
      status: 'passed',
      reportOnly: false,
      evidenceRefs: ['ev-command-1'],
      sourceChanges: {
        modifiedSource: false,
      },
      transcriptSummary: expect.stringContaining('npm run typecheck'),
    });
    expect(report.markdown).toContain('Status: passed');
    expect(report.markdown).toContain('Can release: no');
    expect(report.markdown).toContain('Verified: npm run typecheck exited 0');
    expect(report.markdown).toContain('Missing evidence: none');
    expect(report.markdown).toContain('Next action: reviewer - review implementation');
  });

  it('groups blocked reports by blockers, missing evidence, and next actions', () => {
    const report = render({
      verdict: {
        verdict: 'blocked',
        why: 'Chrome DevTools MCP unavailable.',
        missingEvidence: [
          {
            id: 'browser-run',
            source: 'browser',
            description: 'browser journey evidence',
            reason: 'chrome-devtools-mcp unavailable',
            core: true,
          },
        ],
        nextAction: {
          owner: 'user',
          summary: 'Install chrome-devtools-mcp and rerun browser verification',
        },
        owner: 'user',
        riskLevel: 'high',
        confidence: 0.41,
      },
      blockers: [
        {
          code: 'browser-unavailable',
          category: 'browser',
          message: 'Chrome DevTools MCP unavailable',
          owner: 'user',
          riskLevel: 'high',
          nextAction: {
            owner: 'user',
            summary: 'Install chrome-devtools-mcp',
          },
        },
      ],
    });

    expect(report.json.status).toBe('blocked');
    expect(report.markdown).toContain('## Blockers');
    expect(report.markdown).toContain('browser-unavailable');
    expect(report.markdown).toContain('## Missing Evidence');
    expect(report.markdown).toContain('browser-run');
    expect(report.markdown).toContain('## Next Actions');
    expect(report.markdown).toContain('Owner: user');
    expect(report.markdown).toContain('Risk: high');
  });

  it('renders partial reports with unverified scope and degraded capabilities', () => {
    const report = render({
      evidence: [
        evidence(),
        evidence({
          id: 'ev-api-1',
          source: 'api',
          capabilityId: 'context7',
          trustLevel: 'degraded',
          status: 'degraded',
          summary: 'API probe skipped because external MCP was unavailable',
        }),
      ],
      artifactIndex: [artifact()],
      verdict: {
        verdict: 'partial',
        why: 'Core command evidence passed; optional API evidence is unavailable.',
        evidenceRefs: ['ev-command-1'],
        riskLevel: 'medium',
        confidence: 0.72,
        unverifiedScope: [
          {
            id: 'req-api-optional',
            source: 'api',
            reason: 'context7 unavailable',
          },
        ],
      },
    });

    expect(report.json.status).toBe('partial');
    expect(report.json.sections.degradedCapabilities).toEqual([
      expect.objectContaining({ capabilityId: 'context7' }),
    ]);
    expect(report.markdown).toContain('Degraded capabilities: context7');
    expect(report.markdown).toContain('req-api-optional');
  });

  it('renders manual-confirmation-required reports as user-owned confirmation work', () => {
    const report = render({
      verdict: {
        verdict: 'manual-confirmation-required',
        why: 'Manual product-owner confirmation is required for acceptance.',
        missingEvidence: [
          {
            id: 'manual-po',
            source: 'manual',
            description: 'PO confirms acceptance in staging',
            reason: 'manual confirmation allowed but not recorded',
            core: true,
          },
        ],
        nextAction: {
          owner: 'user',
          summary: 'Confirm staging behavior and attach manual confirmation',
        },
        owner: 'user',
        riskLevel: 'medium',
        confidence: 0.52,
      },
    });

    expect(report.json.status).toBe('needs-user-input');
    expect(report.markdown).toContain('## Manual Confirmation');
    expect(report.markdown).toContain('manual-po');
    expect(report.markdown).toContain('user - Confirm staging behavior');
  });

  it('keeps large logs short and redacts sensitive values in Markdown, JSON, and transcript summary', () => {
    const secret = 'sk-live-1234567890abcdef';
    const longLog = `${'line '.repeat(400)} Authorization: Bearer ${secret} Cookie: session=super-secret token=${secret}`;
    const report = render({
      evidence: [
        evidence({
          summary: longLog,
          artifacts: [
            {
              id: 'artifact-log-1',
              type: 'log',
              path: '.curdx/artifacts/logs/typecheck.log',
              summary: longLog,
            },
          ],
        }),
      ],
      artifactIndex: [
        artifact({
          summary: longLog,
          privacy: {
            classification: 'secret',
            containsSensitiveData: true,
            redacted: false,
          },
        }),
      ],
      verdict: {
        why: `Command passed with token=${secret}`,
      },
    });
    const serialized = JSON.stringify(report.json);

    expect(report.markdown).not.toContain(secret);
    expect(serialized).not.toContain(secret);
    expect(report.transcriptSummary).not.toContain(secret);
    expect(report.markdown.length).toBeLessThan(8000);
    expect(report.json.evidenceSummaries[0]?.summary.length).toBeLessThanOrEqual(240);
    expect(report.json.artifactSummaries[0]?.summary.length).toBeLessThanOrEqual(240);
    expect(report.json.privacy).toMatchObject({
      redacted: true,
      truncated: true,
    });
  });

  it('marks report-only mode without implying source fixes', () => {
    const report = render({
      state: {
        mode: 'report-only',
      },
      verdict: {
        verdict: 'blocked',
        why: 'Typecheck failed in report-only mode.',
        nextAction: {
          owner: 'agent',
          summary: 'Propose a fix for the type error',
        },
        riskLevel: 'high',
        confidence: 0.45,
      },
    });

    expect(report.json).toMatchObject({
      reportOnly: true,
      sourceChanges: {
        modifiedSource: false,
        summary: 'Report-only mode: no source files were modified.',
      },
    });
    expect(report.markdown).toContain('Report-only: yes - no source files modified');
    expect(report.markdown).not.toContain('fixed');
    expect(report.markdown).not.toContain('auto-fixed');
    expect(report.markdown).not.toContain('modified source');
  });

  it('renders report-only issue details and policy effects without claiming a source repair', () => {
    const report = render({
      state: {
        mode: 'report-only',
        policy: {
          noFalseCompletion: true,
          actionDecisions: [
            {
              id: 'skip-source-edit',
              decision: 'skipped',
              actionType: 'source-edit',
              reason: 'report-only mode cannot edit source files',
              core: true,
              riskLevel: 'medium',
            },
          ],
        },
      },
      verdict: {
        verdict: 'blocked',
        why: 'Typecheck failed and report-only policy skipped source mutation.',
        missingEvidence: [
          {
            id: 'same-path-retry',
            source: 'command',
            description: 'same-path retry evidence',
            reason: 'fix mode was not authorized',
            core: true,
          },
        ],
        nextAction: {
          owner: 'user',
          summary: 'Choose fix mode or inspect the report-only issue details',
        },
        riskLevel: 'high',
        confidence: 0.35,
      },
      issues: [
        {
          id: 'typecheck-error',
          category: 'dependency',
          severity: 'high',
          summary: 'TypeScript check failed',
          reproductionSteps: ['Run npm run typecheck', 'Inspect the policy evidence artifact'],
          evidenceRefs: ['ev-command-1'],
          artifactRefs: ['artifact-log-1'],
          impact: 'Completion cannot be verified.',
          recommendation: 'Authorize fix mode, apply a targeted source edit, then rerun the same verifier.',
          owner: 'agent',
          blocksCompletion: true,
          suggestedMode: 'fix',
        },
        {
          id: 'lint-warning',
          category: 'environment',
          severity: 'low',
          summary: 'Lint verifier was not configured for this project.',
          reproductionSteps: ['Run npm run lint'],
          evidenceRefs: [],
          artifactRefs: [],
          impact: 'Release confidence is lower, but completion is not blocked.',
          recommendation: 'Add a lint script when the project adopts linting.',
          owner: 'tech-lead',
          blocksCompletion: false,
          suggestedMode: 'report-only',
        },
      ],
    });

    expect(report.json).toMatchObject({
      mode: 'report-only',
      reportOnly: true,
      sections: {
        qaIssues: [
          expect.objectContaining({
            id: 'typecheck-error',
            category: 'dependency',
            severity: 'high',
            artifactRefs: ['artifact-log-1'],
            owner: 'agent',
            blocksCompletion: true,
            suggestedMode: 'fix',
          }),
          expect.objectContaining({
            id: 'lint-warning',
            category: 'environment',
            severity: 'low',
            owner: 'tech-lead',
            blocksCompletion: false,
            suggestedMode: 'report-only',
          }),
        ],
        blockingIssues: [
          expect.objectContaining({ id: 'typecheck-error' }),
        ],
        warnings: [
          expect.objectContaining({ id: 'lint-warning' }),
        ],
        mergeReadiness: expect.objectContaining({
          reportOnly: true,
          noSourceChanges: true,
          complete: false,
          canRelease: false,
          blockingIssueCount: 1,
          warningIssueCount: 1,
          manualConfirmationCount: 0,
          nextActionOwner: 'user',
        }),
        consumableNextSteps: expect.arrayContaining([
          expect.objectContaining({
            owner: 'user',
            suggestedMode: 'fix',
          }),
          expect.objectContaining({
            owner: 'agent',
            issueId: 'typecheck-error',
            suggestedMode: 'fix',
          }),
        ]),
        reportOnlyIssues: expect.arrayContaining([
          expect.objectContaining({
            category: 'dependency',
            severity: 'high',
            reproductionSteps: ['Run npm run typecheck', 'Inspect the policy evidence artifact'],
            evidenceRefs: ['ev-command-1'],
            artifactRefs: ['artifact-log-1'],
            owner: 'agent',
            blocksCompletion: true,
            impact: 'Completion cannot be verified.',
            recommendation: expect.stringContaining('Authorize fix mode'),
          }),
        ]),
        policyEffects: [
          expect.objectContaining({
            id: 'skip-source-edit',
            decision: 'skipped',
            actionType: 'source-edit',
          }),
        ],
      },
      sourceChanges: {
        modifiedSource: false,
      },
    });
    expect(report.markdown).toContain('Mode: report-only');
    expect(report.markdown).toContain('Blocking issues: 1');
    expect(report.markdown).toContain('Warning issues: 1');
    expect(report.markdown).toContain('Manual confirmation: 0');
    expect(report.markdown).toContain('Next action owner: user');
    expect(report.markdown).toContain('## Report-Only Issues');
    expect(report.markdown).toContain('Category: dependency');
    expect(report.markdown).toContain('Severity: high');
    expect(report.markdown).toContain('Reproduction: Run npm run typecheck; Inspect the policy evidence artifact');
    expect(report.markdown).toContain('Evidence: ev-command-1');
    expect(report.markdown).toContain('Artifacts: artifact-log-1');
    expect(report.markdown).toContain('Owner: agent');
    expect(report.markdown).toContain('Blocks completion: yes');
    expect(report.markdown).toContain('Suggested mode: fix');
    expect(report.markdown).toContain('Impact: Completion cannot be verified.');
    expect(report.markdown).toContain('Recommendation: Authorize fix mode');
    expect(report.markdown).toContain('## Merge Readiness');
    expect(report.markdown).toContain('Report-only: yes');
    expect(report.markdown).toContain('No source changes: yes');
    expect(report.markdown).toContain('## Policy Effects');
    expect(report.markdown).toContain('skip-source-edit');
    expect(report.markdown).not.toContain('fixed');
    expect(report.markdown).not.toContain('auto-fixed');
    expect(report.markdown).not.toContain('modified source');
  });

  it('renders manual confirmation as structured owner-owned review work in JSON, Markdown, and transcript summary', () => {
    const report = render({
      state: {
        mode: 'report-only',
        policy: {
          noFalseCompletion: true,
          capabilityRoutes: [
            {
              id: 'route-browser',
              requirementId: 'req-browser',
              requirementSource: 'browser',
              description: 'browser journey evidence',
              decision: 'fallback',
              primaryCapabilityId: 'playwright',
              selectedCapabilityId: 'chrome-devtools-mcp',
              fallbackCapabilityIds: ['chrome-devtools-mcp'],
              reason: 'Chrome DevTools MCP provides diagnostic evidence only.',
              degradedReason: 'Fallback is not rerunnable E2E evidence.',
              trustLevel: 'degraded',
              manualConfirmationRequired: true,
              blocksCompletion: true,
              remediationRefs: ['remediate-playwright'],
              evidenceImpact: ['browser evidence'],
              owner: 'qa',
              nextAction: {
                owner: 'qa',
                summary: 'Review trace and decide whether browser behavior is acceptable.',
              },
            },
          ],
        },
      },
      verdict: {
        verdict: 'manual-confirmation-required',
        why: 'Manual browser confirmation is required.',
        missingEvidence: [
          {
            id: 'req-browser',
            source: 'browser',
            description: 'browser journey evidence',
            reason: 'rerunnable browser evidence unavailable',
            core: true,
            evidenceIds: ['ev-browser-fallback'],
            criteria: 'The reviewer must confirm checkout succeeds in the linked trace.',
            owner: 'qa',
            nextAction: {
              owner: 'qa',
              summary: 'Review trace and decide whether browser behavior is acceptable.',
            },
            riskLevel: 'high',
          },
        ],
        nextAction: {
          owner: 'qa',
          summary: 'Review trace and decide whether browser behavior is acceptable.',
        },
        owner: 'qa',
        riskLevel: 'high',
        confidence: 0.32,
      },
      evidence: [
        evidence({
          id: 'ev-browser-fallback',
          source: 'browser',
          capabilityId: 'chrome-devtools-mcp',
          status: 'degraded',
          trustLevel: 'degraded',
          summary: 'Fallback trace captured but no rerunnable Playwright path exists.',
          artifacts: [],
        }),
      ],
      artifactIndex: [
        artifact({
          id: 'artifact-trace-1',
          evidenceId: 'ev-browser-fallback',
          type: 'trace',
          path: '.curdx/artifacts/traces/browser.zip',
          summary: 'browser fallback trace',
        }),
      ],
    });

    expect(report.json.status).toBe('needs-user-input');
    expect(report.json.sections.manualConfirmation).toEqual([
      expect.objectContaining({
        id: 'req-browser',
        owner: 'qa',
        riskLevel: 'high',
        evidenceRefs: ['ev-browser-fallback'],
        artifactRefs: ['artifact-trace-1'],
        criteria: 'The reviewer must confirm checkout succeeds in the linked trace.',
        nextAction: 'Review trace and decide whether browser behavior is acceptable.',
        capabilityRouteRefs: ['route-browser'],
        remediationRefs: ['remediate-playwright'],
      }),
    ]);
    expect(report.json.sections.mergeReadiness).toMatchObject({
      status: 'needs-user-input',
      manualConfirmationCount: 1,
      nextActionOwner: 'qa',
    });
    expect(report.markdown).toContain('Status: needs-user-input');
    expect(report.markdown).toContain('Manual confirmation: 1');
    expect(report.markdown).toContain('## Manual Confirmation');
    expect(report.markdown).toContain('Owner: qa');
    expect(report.markdown).toContain('Criteria: The reviewer must confirm checkout succeeds in the linked trace.');
    expect(report.markdown).toContain('Evidence: ev-browser-fallback');
    expect(report.markdown).toContain('Artifacts: artifact-trace-1');
    expect(report.markdown).toContain('Capability routes: route-browser');
    expect(report.markdown).toContain('Remediation refs: remediate-playwright');
    expect(report.transcriptSummary).toContain('Mode: report-only');
    expect(report.transcriptSummary).toContain('Manual confirmation required: 1');
    expect(report.transcriptSummary).toContain('Next action owner: qa');
  });

  it('neutralizes prohibited repair wording from report-only issue text', () => {
    const report = render({
      state: {
        mode: 'report-only',
      },
      verdict: {
        verdict: 'blocked',
        why: 'Report-only found a failing verifier.',
        riskLevel: 'high',
        confidence: 0.42,
      },
      issues: [
        {
          id: 'unsafe-wording',
          category: 'browser',
          severity: 'critical',
          summary: 'The browser issue was auto-fixed.',
          reproductionSteps: ['Inspect the patch generated by the verifier'],
          evidenceRefs: ['ev-command-1'],
          artifactRefs: ['artifact-log-1'],
          impact: 'The modified source still needs review.',
          recommendation: 'The issue is fixed; merge the patch generated by automation.',
          owner: 'agent',
          blocksCompletion: true,
        },
      ],
    });
    const serialized = JSON.stringify(report.json).toLowerCase();
    const markdown = report.markdown.toLowerCase();

    expect(serialized).not.toContain('auto-fixed');
    expect(serialized).not.toContain('modified source');
    expect(serialized).not.toContain('patch generated');
    expect(serialized).not.toContain('fixed');
    expect(markdown).not.toContain('auto-fixed');
    expect(markdown).not.toContain('modified source');
    expect(markdown).not.toContain('patch generated');
    expect(markdown).not.toContain('fixed');
    expect(report.json.sections.reportOnlyIssues[0]).toMatchObject({
      summary: 'The browser issue was reported.',
      recommendation: 'The issue is reported; merge the patch was not generated by automation.',
    });
  });

  it('renders fix-mode action logs as retry requirements, not proof of success', () => {
    const report = render({
      state: {
        mode: 'fix',
        policy: {
          noFalseCompletion: true,
          actionLog: [
            {
              id: 'edit-policy',
              runId: 'run-1',
              goalId: 'goal-1',
              mode: 'fix',
              actionType: 'source-edit',
              targetFiles: ['src/runtime/policy/action-risk-policy.ts'],
              riskLevel: 'medium',
              intent: 'add policy helper',
              result: 'success',
              diffSummary: 'Added policy helper and tests',
              evidenceRefs: ['ev-command-1'],
              requiresSamePathRetry: true,
              createdAt: '2026-05-17T02:10:00.000Z',
            },
          ],
        },
      },
      verdict: {
        verdict: 'partial',
        why: 'Fix was applied but same-path retry is still required.',
        riskLevel: 'medium',
        confidence: 0.6,
        unverifiedScope: [
          {
            id: 'same-path-retry',
            source: 'command',
            reason: 'retry not yet recorded',
          },
        ],
      },
    });

    expect(report.json.sections.actionLogs).toEqual([
      expect.objectContaining({
        id: 'edit-policy',
        actionType: 'source-edit',
        result: 'success',
        requiresSamePathRetry: true,
      }),
    ]);
    expect(report.markdown).toContain('## Action Log');
    expect(report.markdown).toContain('Same-path retry required: yes');
    expect(report.markdown).toContain('edit-policy');
  });

  it('redacts structured verdict fields without changing their contract shape', () => {
    const report = render({
      verdict: {
        verdict: 'partial',
        why: 'Optional checks are not complete.',
        riskLevel: 'medium',
        unverifiedScope: Array.from({ length: 25 }, (_, index) => ({
          id: `optional-${index}`,
          reason: `not executed token=secret-${index}`,
        })),
      },
    });

    expect(validateContract('verificationReport', report.json)).toMatchObject({ ok: true });
    expect(report.json.verdict.unverifiedScope).toHaveLength(25);
    expect(report.json.verdict.unverifiedScope[0]).toEqual({
      id: 'optional-0',
      reason: 'not executed token=[REDACTED]',
    });
  });

  it('renders capability routing and remediation plans without implying report-only fixes ran', () => {
    const report = render({
      state: {
        mode: 'report-only',
        policy: {
          noFalseCompletion: true,
          capabilityRoutes: [
            {
              id: 'route-browser',
              requirementId: 'req-browser',
              requirementSource: 'browser',
              description: 'browser journey evidence',
              decision: 'fallback',
              primaryCapabilityId: 'playwright',
              selectedCapabilityId: 'chrome-devtools-mcp',
              fallbackCapabilityIds: ['chrome-devtools-mcp'],
              reason: 'Chrome DevTools MCP is diagnostic fallback, not rerunnable E2E evidence.',
              degradedReason: 'Playwright rerunnable browser evidence is unavailable.',
              trustLevel: 'degraded',
              manualConfirmationRequired: true,
              blocksCompletion: true,
              remediationRefs: ['remediate-playwright'],
              evidenceImpact: ['browser evidence', 'console/network evidence'],
            },
          ],
          remediationPlans: [
            {
              id: 'remediation-plan-1',
              capabilityId: 'playwright',
              status: 'planned',
              actions: [
                {
                  id: 'remediate-playwright',
                  capabilityId: 'playwright',
                  kind: 'install-dev-dependency',
                  action: 'Add or repair a Playwright verifier script.',
                  riskLevel: 'medium',
                  requiresAuthorization: false,
                  executesAutomatically: false,
                  policyDecision: {
                    decision: 'blocked',
                    reason: 'report-only mode cannot install dependencies',
                  },
                  verificationCommand: 'npm run e2e',
                  expectedRestoredCapabilities: ['browser evidence'],
                  failureFallback: 'Remain degraded and require manual confirmation.',
                  completionImpact: 'playwright blocks completion; affected evidence: browser evidence.',
                },
              ],
            },
          ],
        },
      },
      verdict: {
        verdict: 'blocked',
        why: 'Browser evidence is degraded.',
        riskLevel: 'high',
        confidence: 0.4,
        missingEvidence: [
          {
            id: 'req-browser',
            source: 'browser',
            reason: 'rerunnable browser evidence unavailable',
          },
        ],
      },
    });

    expect(report.json.reportOnly).toBe(true);
    expect(report.json.sourceChanges).toMatchObject({ modifiedSource: false });
    expect(report.json.sections.capabilityRoutes).toEqual([
      expect.objectContaining({
        id: 'route-browser',
        decision: 'fallback',
        primaryCapabilityId: 'playwright',
        selectedCapabilityId: 'chrome-devtools-mcp',
        trustLevel: 'degraded',
        degradedReason: 'Playwright rerunnable browser evidence is unavailable.',
        remediationRefs: ['remediate-playwright'],
        evidenceImpact: ['browser evidence', 'console/network evidence'],
      }),
    ]);
    expect(report.json.sections.remediationPlans[0]).toMatchObject({
      id: 'remediation-plan-1',
      capabilityId: 'playwright',
      status: 'planned',
    });
    expect(report.markdown).toContain('## Capability Routes');
    expect(report.markdown).toContain('route-browser');
    expect(report.markdown).toContain('Primary: playwright');
    expect(report.markdown).toContain('Missing/degraded capability: playwright');
    expect(report.markdown).toContain('Fallback: chrome-devtools-mcp');
    expect(report.markdown).toContain('Trust impact: degraded');
    expect(report.markdown).toContain('Evidence impact: browser evidence, console/network evidence');
    expect(report.markdown).toContain('Remediation refs: remediate-playwright');
    expect(report.markdown).toContain('## Remediation Plans');
    expect(report.markdown).toContain('remediate-playwright');
    expect(report.markdown).toContain('Completion impact: playwright blocks completion');
    expect(report.markdown).toContain('Report-only: yes - no source files modified');
    expect(report.markdown).not.toContain('auto-fixed');
  });

  it('builds a transcript-visible summary with command, exit code, digest, missing evidence, and final verdict', () => {
    const summary = buildTranscriptSummary({
      verifier: {
        command: 'npm run test:reports',
        exitCode: 1,
      },
      evidenceSummaries: [
        {
          id: 'ev-command-1',
          source: 'command',
          capabilityId: 'npm-test',
          status: 'failed',
          trustLevel: 'verified',
          summary: 'npm test failed',
          artifactRefs: ['artifact-log-1'],
          freshness: 'validatedAt=2026-05-17T01:55:05.000Z',
          unverifiedScope: [],
        },
      ],
      missingEvidence: [{ id: 'browser-run', reason: 'not executed' }],
      finalVerdict: 'blocked',
      maxLength: 600,
    });

    expect(summary).toContain('Verifier: npm run test:reports');
    expect(summary).toContain('Exit code: 1');
    expect(summary).toContain('Evidence: ev-command-1 failed');
    expect(summary).toContain('Missing evidence: browser-run');
    expect(summary).toContain('Final verdict: blocked');
    expect(summary.length).toBeLessThanOrEqual(600);
  });

  it('writes Markdown and JSON reports atomically under the workspace .curdx directory', async () => {
    const workspaceRoot = await createWorkspace();
    const rendered = render();
    const result = await writeVerificationReport({
      workspaceRoot,
      runId: 'run-1',
      report: rendered,
    });

    expect(result).toMatchObject({
      ok: true,
      markdownPath: expect.stringContaining('/.curdx/reports/run-1.report.md'),
      jsonPath: expect.stringContaining('/.curdx/reports/run-1.report.json'),
    });
    const paths = resolveReportPaths({ workspaceRoot, runId: 'run-1' });
    expect(readFileSync(paths.markdownPath, 'utf8')).toBe(rendered.markdown);
    expect(JSON.parse(readFileSync(paths.jsonPath, 'utf8'))).toMatchObject({ runId: 'run-1' });
  });

  it('returns a structured blocker and preserves old report bytes when atomic rename fails', async () => {
    const workspaceRoot = await createWorkspace();
    const rendered = render();
    const paths = resolveReportPaths({ workspaceRoot, runId: 'run-1' });
    await mkdir(dirname(paths.markdownPath), { recursive: true });
    await writeFile(paths.markdownPath, 'old markdown\n', 'utf8');

    const result = await writeVerificationReport({
      workspaceRoot,
      runId: 'run-1',
      report: rendered,
      io: {
        rename: async () => {
          throw new Error('rename failed');
        },
      },
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'blocked',
      issues: [expect.objectContaining({ code: 'invalid-write' })],
    });
    expect(readFileSync(paths.markdownPath, 'utf8')).toBe('old markdown\n');
    expect(existsSync(paths.jsonPath)).toBe(false);
  });
});
