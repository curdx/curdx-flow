import {
  validateContract,
  type ArtifactIndexEntry,
  type EvidenceBlock,
} from '../contracts/index.ts';
import { isWorkspaceRelativePath, resolveEvidencePaths } from './paths.ts';
import { summarizeArtifactText } from './privacy.ts';
import {
  atomicAppendJsonLine,
  fromContractResult,
  mergeFileIo,
  readJsonlFile,
  runtimeIssue,
} from './io.ts';
import type {
  ArtifactIndexInput,
  EvidenceFileIo,
  EvidenceReadResult,
  EvidenceRuntimeIssue,
} from './types.ts';

export function normalizeArtifactIndexEntry(
  input: ArtifactIndexInput,
  evidence: EvidenceBlock,
  createdAt: string,
): { ok: true; entry: ArtifactIndexEntry } | { ok: false; issues: EvidenceRuntimeIssue[] } {
  if (!isWorkspaceRelativePath(input.path)) {
    return {
      ok: false,
      issues: [runtimeIssue('artifactIndex', '$.path', 'invalid-pattern', "'path' must be workspace-relative and must not escape the workspace.")],
    };
  }

  const summary = summarizeArtifactText(input.summary);
  const privacy = {
    classification: input.privacy?.classification ?? 'internal',
    containsSensitiveData: input.privacy?.containsSensitiveData ?? summary.redacted,
    ...input.privacy,
    redacted: input.privacy?.redacted === true || summary.redacted || summary.truncated,
  };

  const entry: ArtifactIndexEntry = {
    ...input,
    schemaVersion: 1,
    runId: evidence.runId,
    goalId: evidence.goalId,
    evidenceId: evidence.id,
    attemptId: typeof evidence.attemptId === 'string' ? evidence.attemptId : input.attemptId,
    summary: summary.summary,
    privacy,
    createdAt,
  };

  const validation = validateContract('artifactIndex', entry);
  if (!validation.ok) {
    return { ok: false, issues: fromContractResult('artifactIndex', validation) };
  }

  return { ok: true, entry };
}

export async function readArtifactIndex(input: {
  workspaceRoot: string;
  artifactIndexPath?: string;
  io?: Partial<EvidenceFileIo>;
}): Promise<EvidenceReadResult<ArtifactIndexEntry>> {
  const io = mergeFileIo(input.io);
  const artifactIndexPath = input.artifactIndexPath ?? resolveEvidencePaths({ workspaceRoot: input.workspaceRoot, runId: 'artifact-index' }).artifactIndexPath;
  return readJsonlFile<ArtifactIndexEntry>(artifactIndexPath, 'artifactIndex', io);
}

export async function appendArtifactIndexEntries(input: {
  artifactIndexPath: string;
  entries: ArtifactIndexEntry[];
  io: EvidenceFileIo;
}): Promise<{ ok: true } | { ok: false; issues: EvidenceRuntimeIssue[] }> {
  for (const entry of input.entries) {
    const result = await atomicAppendJsonLine(input.artifactIndexPath, entry, input.io);
    if (!result.ok) {
      return { ok: false, issues: [{ ...result.issue, schemaId: 'curdx-flow/artifact-index', filePath: input.artifactIndexPath }] };
    }
  }

  return { ok: true };
}
