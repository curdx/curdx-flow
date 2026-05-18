import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildActionLogEntry,
  buildDefaultActionRiskPolicy,
  classifyActionRisk,
  evaluateActionPolicy,
  validateModeWriteBoundary,
} from '../../../src/runtime/policy/index.ts';

const workspaces: string[] = [];

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), 'curdx-policy-'));
  workspaces.push(workspace);
  return workspace;
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })));
});

describe('action risk policy runtime', () => {
  it('builds a no-false-completion default policy with actionable high-risk rules', () => {
    const policy = buildDefaultActionRiskPolicy({ mode: 'fix' });

    expect(policy).toMatchObject({
      schemaVersion: 1,
      mode: 'fix',
      noFalseCompletion: true,
      defaultRiskLevel: 'medium',
    });
    expect(policy.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'release-actions-require-authorization',
          riskLevel: 'critical',
          requiresAuthorization: true,
          requiresReleaseStage: true,
        }),
        expect.objectContaining({
          id: 'report-only-artifact-writes',
          riskLevel: 'low',
          allowedModes: ['report-only', 'fix', 'release'],
        }),
      ]),
    );
  });

  it('allows report-only writes only inside report, evidence, artifact, or state roots', async () => {
    const workspaceRoot = await createWorkspace();

    expect(
      validateModeWriteBoundary({
        mode: 'report-only',
        workspaceRoot,
        writes: [
          { path: '.curdx/reports/run-1.report.md', category: 'report' },
          { path: '.curdx/evidence/run-1.jsonl', category: 'evidence' },
          { path: '.curdx/artifacts/logs/typecheck.log', category: 'temporary-artifact' },
          { path: '.curdx/state/run-1.json', category: 'temporary-artifact' },
        ],
      }),
    ).toMatchObject({ ok: true });

    const blocked = validateModeWriteBoundary({
      mode: 'report-only',
      workspaceRoot,
      writes: [
        { path: 'src/app.ts', category: 'source-change' },
        { path: 'plugins/curdx-flow/.claude-plugin/plugin.json', category: 'source-change' },
        { path: 'package-lock.json', category: 'source-change' },
        { path: '.claude/settings.json', category: 'temporary-artifact' },
        { path: '.mcp.json', category: 'temporary-artifact' },
        { path: '.git/refs/tags/v7.2.1', category: 'temporary-artifact' },
      ],
    });

    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'src/app.ts', reason: expect.stringContaining('report-only') }),
          expect.objectContaining({ path: '.git/refs/tags/v7.2.1' }),
        ]),
      );
    }
  });

  it('blocks report-only source mutation before any action can be treated as executed', async () => {
    const workspaceRoot = await createWorkspace();
    const decision = evaluateActionPolicy({
      policy: buildDefaultActionRiskPolicy({ mode: 'report-only' }),
      workspaceRoot,
      action: {
        id: 'edit-source',
        actionType: 'source-edit',
        mode: 'report-only',
        targetFiles: ['src/runtime/policy/action-risk-policy.ts'],
        mutatesWorkspace: true,
        intent: 'repair a failing verifier',
      },
    });

    expect(decision).toMatchObject({
      decision: 'blocked',
      mode: 'report-only',
      riskLevel: 'medium',
      requiresActionLog: true,
      requiresSamePathRetry: true,
    });
    expect(decision.blockers).toEqual([
      expect.objectContaining({
        code: 'report-only-write-boundary',
        category: 'policy',
      }),
    ]);
    expect(decision.actionLog).toMatchObject({
      actionType: 'source-edit',
      result: 'blocked',
      requiresSamePathRetry: true,
    });
  });

  it('does not let custom report-only write roots expand beyond the .curdx artifact boundary', async () => {
    const workspaceRoot = await createWorkspace();
    const decision = evaluateActionPolicy({
      policy: {
        ...buildDefaultActionRiskPolicy({ mode: 'report-only' }),
        allowedWriteRoots: ['src'] as string[],
      },
      workspaceRoot,
      action: {
        id: 'edit-source',
        actionType: 'source-edit',
        mode: 'report-only',
        targetFiles: ['src/app.ts'],
        mutatesWorkspace: true,
        intent: 'attempt source write through custom roots',
      },
    });

    expect(decision).toMatchObject({
      decision: 'blocked',
      blockers: [expect.objectContaining({ code: 'report-only-write-boundary' })],
    });
  });

  it('classifies irreversible raw commands as critical and authorization-gated', async () => {
    const workspaceRoot = await createWorkspace();
    const decision = evaluateActionPolicy({
      policy: buildDefaultActionRiskPolicy({ mode: 'fix' }),
      workspaceRoot,
      action: {
        id: 'rm-rf',
        actionType: 'command',
        mode: 'fix',
        command: 'rm -rf src',
        targetFiles: ['src'],
        intent: 'delete generated output',
      },
    });

    expect(decision).toMatchObject({
      decision: 'blocked',
      riskLevel: 'critical',
      blockers: [
        expect.objectContaining({
          code: 'authorization-required',
          riskLevel: 'critical',
        }),
      ],
    });
  });

  it('allows low and medium fix-mode mutation only with an action log and same-path retry', async () => {
    const workspaceRoot = await createWorkspace();
    const decision = evaluateActionPolicy({
      policy: buildDefaultActionRiskPolicy({ mode: 'fix' }),
      workspaceRoot,
      action: {
        id: 'edit-policy',
        actionType: 'source-edit',
        mode: 'fix',
        targetFiles: ['src/runtime/policy/action-risk-policy.ts'],
        mutatesWorkspace: true,
        intent: 'add the policy guard',
        evidenceRefs: ['ev-typecheck-1'],
      },
      now: '2026-05-17T03:00:00.000Z',
      runId: 'run-1',
      goalId: 'goal-1',
    });

    expect(decision).toMatchObject({
      decision: 'allowed',
      riskLevel: 'medium',
      requiresActionLog: true,
      requiresSamePathRetry: true,
      actionLog: {
        id: 'edit-policy',
        runId: 'run-1',
        goalId: 'goal-1',
        mode: 'fix',
        actionType: 'source-edit',
        targetFiles: ['src/runtime/policy/action-risk-policy.ts'],
        riskLevel: 'medium',
        intent: 'add the policy guard',
        result: 'success',
        evidenceRefs: ['ev-typecheck-1'],
        requiresSamePathRetry: true,
        createdAt: '2026-05-17T03:00:00.000Z',
      },
    });
  });

  it('blocks destructive, release, global config, and production-data actions without authorization', async () => {
    const workspaceRoot = await createWorkspace();
    const policy = buildDefaultActionRiskPolicy({ mode: 'fix' });
    const actionTypes = [
      'delete-file',
      'destructive-migration',
      'global-config-change',
      'git-push',
      'git-tag',
      'npm-publish',
      'plugin-release',
      'production-data-access',
    ] as const;

    for (const actionType of actionTypes) {
      const decision = evaluateActionPolicy({
        policy,
        workspaceRoot,
        action: {
          id: actionType,
          actionType,
          mode: 'fix',
          targetFiles: actionType === 'global-config-change' ? ['.claude/settings.json'] : [],
          mutatesWorkspace: actionType !== 'production-data-access',
          destructive: actionType === 'delete-file' || actionType === 'destructive-migration',
          intent: `attempt ${actionType}`,
        },
      });

      expect(decision.decision, actionType).toBe('blocked');
      expect(decision.riskLevel, actionType).toMatch(/high|critical/);
      expect(decision.blockers, actionType).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: 'policy',
            riskLevel: decision.riskLevel,
          }),
        ]),
      );
    }
  });

  it('requires release-stage context even when release authorization is present', async () => {
    const workspaceRoot = await createWorkspace();
    const decision = evaluateActionPolicy({
      policy: buildDefaultActionRiskPolicy({ mode: 'release' }),
      workspaceRoot,
      action: {
        id: 'tag-plugin',
        actionType: 'plugin-release',
        mode: 'release',
        intent: 'create Claude plugin release tag',
        mutatesWorkspace: false,
      },
      authorization: {
        authorized: true,
        releaseStageAuthorized: false,
        authorizedBy: 'maintainer',
      },
    });

    expect(decision).toMatchObject({
      decision: 'blocked',
      riskLevel: 'critical',
      blockers: [expect.objectContaining({ code: 'release-stage-required' })],
    });
  });

  it('classifies explicit rules while tolerating unknown future fields', () => {
    const policy = buildDefaultActionRiskPolicy({ mode: 'fix' });
    const classification = classifyActionRisk({
      policy: {
        ...policy,
        futurePolicyField: { kept: true },
        rules: [
          ...policy.rules,
          {
            id: 'custom-api-check',
            actionType: 'api-check',
            riskLevel: 'low',
            mutatesWorkspace: false,
            destructive: false,
            requiresAuthorization: false,
            allowedModes: ['report-only', 'fix'],
            futureRuleField: { kept: true },
          },
        ],
      },
      action: {
        id: 'api',
        actionType: 'api-check',
        mode: 'report-only',
        targetFiles: [],
        intent: 'probe API read-only',
      },
    });

    expect(classification).toMatchObject({
      riskLevel: 'low',
      matchedRuleIds: ['custom-api-check'],
    });
  });

  it('rejects attempts to disable no false completion at runtime', async () => {
    const workspaceRoot = await createWorkspace();
    const decision = evaluateActionPolicy({
      policy: {
        ...buildDefaultActionRiskPolicy({ mode: 'fix' }),
        noFalseCompletion: false as true,
      },
      workspaceRoot,
      action: {
        id: 'verify',
        actionType: 'verification-rerun',
        mode: 'fix',
        targetFiles: [],
        intent: 'verify after fix',
      },
    });

    expect(decision).toMatchObject({
      decision: 'blocked',
      blockers: [
        expect.objectContaining({
          code: 'no-false-completion-disabled',
          message: expect.stringContaining('no false completion'),
        }),
      ],
    });
  });

  it('builds redacted action log entries for blocked and skipped actions', () => {
    const log = buildActionLogEntry({
      id: 'install-dep',
      runId: 'run-1',
      goalId: 'goal-1',
      mode: 'fix',
      actionType: 'dependency-install',
      targetFiles: ['package.json', 'package-lock.json'],
      riskLevel: 'medium',
      intent: 'install a dev dependency',
      result: 'blocked',
      command: 'npm install --save-dev tool --token sk-live-1234567890abcdef',
      diffSummary: 'package metadata would change',
      evidenceRefs: ['ev-policy-1'],
      requiresSamePathRetry: true,
      createdAt: '2026-05-17T03:05:00.000Z',
    });

    expect(log).toMatchObject({
      id: 'install-dep',
      runId: 'run-1',
      goalId: 'goal-1',
      actionType: 'dependency-install',
      targetFiles: ['package.json', 'package-lock.json'],
      result: 'blocked',
      requiresSamePathRetry: true,
    });
    expect(JSON.stringify(log)).not.toContain('sk-live-1234567890abcdef');
    expect(log.commandSummary).toContain('[REDACTED]');
  });
});
