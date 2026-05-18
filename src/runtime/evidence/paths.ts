import { resolve, sep } from 'node:path';

import type { EvidencePaths, ResolveEvidencePathsInput } from './types.ts';

export function resolveEvidencePaths(input: ResolveEvidencePathsInput): EvidencePaths {
  const workspaceRoot = resolve(input.workspaceRoot);
  const safeRunId = safePathSegment(input.runId);
  const ledgerRelativePath = input.ledgerRelativePath ?? `.curdx/evidence/${safeRunId}.jsonl`;
  const artifactIndexRelativePath = input.artifactIndexRelativePath ?? '.curdx/artifacts/index.jsonl';

  return {
    workspaceRoot,
    ledgerRelativePath,
    ledgerPath: resolveWorkspacePath(workspaceRoot, ledgerRelativePath),
    artifactIndexRelativePath,
    artifactIndexPath: resolveWorkspacePath(workspaceRoot, artifactIndexRelativePath),
  };
}

export function resolveWorkspacePath(workspaceRoot: string, relativePath: string): string {
  if (!isWorkspaceRelativePath(relativePath)) {
    throw new Error(`Unsafe workspace-relative path: ${relativePath}`);
  }

  const root = resolve(workspaceRoot);
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(`Unsafe workspace-relative path: ${relativePath}`);
  }

  return target;
}

export function isWorkspaceRelativePath(value: string): boolean {
  if (value.length === 0) return false;
  if (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) return false;
  if (value.includes('\0')) return false;

  const segments = value.replaceAll('\\', '/').split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function safePathSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]/g, '_');
  return cleaned.length > 0 ? cleaned : 'run';
}
