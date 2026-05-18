import { validateContract, type EvidenceBlock } from '../contracts/index.ts';
import { normalizeArtifactIndexEntry, appendArtifactIndexEntries, readArtifactIndex } from './artifacts.ts';
import { atomicAppendJsonLine, fromContractResult, mergeFileIo, readJsonlFile } from './io.ts';
import { resolveEvidencePaths } from './paths.ts';
import type {
  ArtifactIndexInput,
  EvidenceFileIo,
  EvidenceReadResult,
  EvidenceRuntimeIssue,
  EvidenceWriteInput,
  EvidenceWriteResult,
} from './types.ts';

export async function readEvidenceLedger(input: {
  workspaceRoot: string;
  runId: string;
  ledgerPath?: string;
  io?: Partial<EvidenceFileIo>;
}): Promise<EvidenceReadResult<EvidenceBlock>> {
  const io = mergeFileIo(input.io);
  const paths = resolveEvidencePaths({
    workspaceRoot: input.workspaceRoot,
    runId: input.runId,
    ledgerRelativePath: input.ledgerPath,
  });

  return readJsonlFile<EvidenceBlock>(paths.ledgerPath, 'evidence', io);
}

export async function appendEvidence(input: EvidenceWriteInput): Promise<EvidenceWriteResult> {
  const io = mergeFileIo(input.io);
  const paths = resolveEvidencePaths({
    workspaceRoot: input.workspaceRoot,
    runId: input.evidence.runId,
  });
  const artifactIds: string[] = [];
  const validationIssues = validateEvidenceAndArtifacts(input.evidence, input.artifacts ?? [], nowIso(input.now));

  if (validationIssues.length > 0) {
    return {
      ok: false,
      status: 'blocked',
      ledgerPath: paths.ledgerPath,
      artifactIndexPath: paths.artifactIndexPath,
      issues: validationIssues,
    };
  }

  const existingLedger = await readJsonlFile<EvidenceBlock>(paths.ledgerPath, 'evidence', io);
  if (!existingLedger.ok) {
    return {
      ok: false,
      status: 'blocked',
      ledgerPath: paths.ledgerPath,
      artifactIndexPath: paths.artifactIndexPath,
      issues: existingLedger.issues,
    };
  }

  const existingArtifactIndex = await readArtifactIndex({
    workspaceRoot: input.workspaceRoot,
    artifactIndexPath: paths.artifactIndexPath,
    io,
  });
  if (!existingArtifactIndex.ok) {
    return {
      ok: false,
      status: 'blocked',
      ledgerPath: paths.ledgerPath,
      artifactIndexPath: paths.artifactIndexPath,
      issues: existingArtifactIndex.issues,
    };
  }

  const ledgerWrite = await atomicAppendJsonLine(paths.ledgerPath, input.evidence, io);
  if (!ledgerWrite.ok) {
    return {
      ok: false,
      status: 'blocked',
      ledgerPath: paths.ledgerPath,
      artifactIndexPath: paths.artifactIndexPath,
      issues: [ledgerWrite.issue],
    };
  }

  const artifactEntries = (input.artifacts ?? []).map((artifact) => {
    const normalized = normalizeArtifactIndexEntry(artifact, input.evidence, nowIso(input.now));
    if (!normalized.ok) return normalized;
    artifactIds.push(normalized.entry.id);
    return normalized;
  });

  const normalizedIssues = artifactEntries.flatMap((entry) => (entry.ok ? [] : entry.issues));
  if (normalizedIssues.length > 0) {
    return {
      ok: false,
      status: 'degraded',
      ledgerPath: paths.ledgerPath,
      artifactIndexPath: paths.artifactIndexPath,
      artifactIds,
      issues: normalizedIssues,
    };
  }

  const artifactWrite = await appendArtifactIndexEntries({
    artifactIndexPath: paths.artifactIndexPath,
    entries: artifactEntries.flatMap((entry) => (entry.ok ? [entry.entry] : [])),
    io,
  });
  if (!artifactWrite.ok) {
    return {
      ok: false,
      status: 'degraded',
      ledgerPath: paths.ledgerPath,
      artifactIndexPath: paths.artifactIndexPath,
      artifactIds,
      issues: artifactWrite.issues,
    };
  }

  return {
    ok: true,
    status: input.evidence.status,
    evidenceId: input.evidence.id,
    ledgerPath: paths.ledgerPath,
    artifactIndexPath: paths.artifactIndexPath,
    artifactIds,
    issues: [],
  };
}

function validateEvidenceAndArtifacts(
  evidence: EvidenceBlock,
  artifacts: ArtifactIndexInput[],
  createdAt: string,
): EvidenceRuntimeIssue[] {
  const evidenceValidation = validateContract('evidence', evidence);
  const evidenceIssues = fromContractResult('evidence', evidenceValidation);
  const artifactIssues = artifacts.flatMap((artifact) => {
    const normalized = normalizeArtifactIndexEntry(artifact, evidence, createdAt);
    return normalized.ok ? [] : normalized.issues;
  });

  return [...evidenceIssues, ...artifactIssues];
}

function nowIso(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}
