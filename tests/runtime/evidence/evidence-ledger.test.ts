import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  appendEvidence,
  readArtifactIndex,
  readEvidenceLedger,
  resolveEvidencePaths,
  type ArtifactIndexInput,
} from '../../../src/runtime/evidence/index.ts';
import type { EvidenceBlock } from '../../../src/runtime/contracts/index.ts';

const workspaces: string[] = [];

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), 'curdx-evidence-'));
  workspaces.push(workspace);
  return workspace;
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })));
});

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
    artifacts: [],
    startedAt: '2026-05-17T00:00:00.000Z',
    completedAt: '2026-05-17T00:00:03.000Z',
    freshness: {
      validatedAt: '2026-05-17T00:00:03.000Z',
      targetSummary: 'npm run typecheck in workspace root',
      commandHash: 'sha256:command',
      environmentId: 'node-22-local',
    },
    privacy: {
      classification: 'local-only',
      containsSecrets: false,
    },
    redactions: [],
    ...overrides,
  };
}

function artifact(overrides: Partial<ArtifactIndexInput> = {}): ArtifactIndexInput {
  return {
    id: 'artifact-log-1',
    type: 'log',
    path: '.curdx/artifacts/logs/typecheck.log',
    summary: 'typecheck passed',
    privacy: {
      classification: 'local-only',
      containsSensitiveData: false,
      redacted: true,
    },
    ...overrides,
  };
}

describe('append-only evidence ledger and artifact index', () => {
  it('appends evidence and artifact entries without overwriting earlier evidence', async () => {
    const workspaceRoot = await createWorkspace();
    const first = evidence({ id: 'ev-command-1', futureTopLevelField: { kept: true } });
    const second = evidence({
      id: 'ev-command-2',
      status: 'failed',
      relatedEvidenceIds: ['ev-command-1'],
      supersedes: 'ev-command-1',
    });

    await expect(appendEvidence({ workspaceRoot, evidence: first, artifacts: [artifact()] })).resolves.toMatchObject({
      ok: true,
      evidenceId: 'ev-command-1',
      artifactIds: ['artifact-log-1'],
    });
    await expect(
      appendEvidence({
        workspaceRoot,
        evidence: second,
        artifacts: [artifact({ id: 'artifact-log-2', evidenceId: 'ev-command-2' })],
      }),
    ).resolves.toMatchObject({
      ok: true,
      evidenceId: 'ev-command-2',
      artifactIds: ['artifact-log-2'],
    });

    const paths = resolveEvidencePaths({ workspaceRoot, runId: 'run-1' });
    const rawLedger = await readFile(paths.ledgerPath, 'utf8');
    const ledgerLines = rawLedger.trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(ledgerLines).toHaveLength(2);
    expect(ledgerLines[0]).toMatchObject({ id: 'ev-command-1', futureTopLevelField: { kept: true } });
    expect(ledgerLines[1]).toMatchObject({
      id: 'ev-command-2',
      relatedEvidenceIds: ['ev-command-1'],
      supersedes: 'ev-command-1',
    });

    await expect(readEvidenceLedger({ workspaceRoot, runId: 'run-1' })).resolves.toMatchObject({
      ok: true,
      entries: [expect.objectContaining({ id: 'ev-command-1' }), expect.objectContaining({ id: 'ev-command-2' })],
    });
    await expect(readArtifactIndex({ workspaceRoot })).resolves.toMatchObject({
      ok: true,
      entries: [
        expect.objectContaining({ id: 'artifact-log-1', evidenceId: 'ev-command-1' }),
        expect.objectContaining({ id: 'artifact-log-2', evidenceId: 'ev-command-2' }),
      ],
    });
  });

  it('returns a blocker and preserves old bytes when an existing ledger contains invalid JSON', async () => {
    const workspaceRoot = await createWorkspace();
    const paths = resolveEvidencePaths({ workspaceRoot, runId: 'run-1' });
    await mkdir(dirname(paths.ledgerPath), { recursive: true });
    await writeFile(paths.ledgerPath, `${JSON.stringify(evidence({ id: 'ev-existing' }))}\n{not-json\n`, 'utf8');
    const before = readFileSync(paths.ledgerPath, 'utf8');

    const result = await appendEvidence({ workspaceRoot, evidence: evidence({ id: 'ev-command-2' }) });

    expect(result).toMatchObject({
      ok: false,
      status: 'blocked',
      issues: [
        expect.objectContaining({
          code: 'invalid-json',
          path: '$[1]',
        }),
      ],
    });
    expect(readFileSync(paths.ledgerPath, 'utf8')).toBe(before);
  });

  it('rejects unsafe artifact paths before writing evidence', async () => {
    const workspaceRoot = await createWorkspace();
    const result = await appendEvidence({
      workspaceRoot,
      evidence: evidence(),
      artifacts: [artifact({ path: '../secrets.txt' })],
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'blocked',
      issues: [
        expect.objectContaining({
          path: '$.path',
          code: 'invalid-pattern',
        }),
      ],
    });
    expect(existsSync(resolveEvidencePaths({ workspaceRoot, runId: 'run-1' }).ledgerPath)).toBe(false);

    await expect(
      appendEvidence({
        workspaceRoot,
        evidence: evidence(),
        artifacts: [artifact({ path: 'logs/..' })],
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 'blocked',
      issues: [expect.objectContaining({ path: '$.path', code: 'invalid-pattern' })],
    });
  });

  it('redacts sensitive artifact summaries and keeps summaries bounded', async () => {
    const workspaceRoot = await createWorkspace();
    const secretValue = 'sk-live-1234567890abcdef';
    const longLog = `${'x'.repeat(900)} token=${secretValue} Cookie: session=very-secret-cookie`;

    const result = await appendEvidence({
      workspaceRoot,
      evidence: evidence(),
      artifacts: [artifact({ summary: longLog, privacy: { classification: 'confidential', containsSensitiveData: true, redacted: false } })],
    });

    expect(result).toMatchObject({ ok: true });
    const index = await readArtifactIndex({ workspaceRoot });
    expect(index).toMatchObject({ ok: true });
    if (index.ok) {
      expect(index.entries[0]?.summary).not.toContain(secretValue);
      expect(index.entries[0]?.summary).not.toContain('very-secret-cookie');
      expect(index.entries[0]?.summary.length).toBeLessThanOrEqual(500);
      expect(index.entries[0]?.privacy).toMatchObject({ redacted: true });
    }
  });

  it('returns a structured failure and leaves old ledger bytes intact when atomic rename fails', async () => {
    const workspaceRoot = await createWorkspace();
    const paths = resolveEvidencePaths({ workspaceRoot, runId: 'run-1' });
    const existing = `${JSON.stringify(evidence({ id: 'ev-existing' }))}\n`;
    await mkdir(dirname(paths.ledgerPath), { recursive: true });
    await writeFile(paths.ledgerPath, existing, 'utf8');

    const result = await appendEvidence({
      workspaceRoot,
      evidence: evidence({ id: 'ev-new' }),
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
    expect(readFileSync(paths.ledgerPath, 'utf8')).toBe(existing);
  });

  it('turns ledger read failures into structured blockers', async () => {
    const workspaceRoot = await createWorkspace();
    const result = await appendEvidence({
      workspaceRoot,
      evidence: evidence(),
      io: {
        readFile: async () => {
          const err = new Error('permission denied') as NodeJS.ErrnoException;
          err.code = 'EACCES';
          throw err;
        },
      },
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'blocked',
      issues: [expect.objectContaining({ code: 'invalid-read' })],
    });
  });
});
