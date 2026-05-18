import { resolve, sep } from 'node:path';

import type { ResolveStatePathsInput, StatePaths } from './types.ts';

export interface ResolveSessionStatePathInput {
  workspaceRoot: string;
  sessionId: string;
  sessionStateRelativePath?: string;
}

export function resolveStatePaths(input: ResolveStatePathsInput): StatePaths {
  const workspaceRoot = resolve(input.workspaceRoot);
  const runId = safePathSegment(input.runId);
  const runStateRelativePath = input.runStateRelativePath ?? `.curdx/state/runs/${runId}.json`;
  const sessionStateRelativePath = input.sessionId
    ? input.sessionStateRelativePath ?? `.curdx/state/sessions/${safePathSegment(input.sessionId)}.json`
    : input.sessionStateRelativePath;
  const checkpointsRelativePath = `.curdx/state/checkpoints/${runId}`;

  return {
    workspaceRoot,
    runStateRelativePath,
    runStatePath: resolveWorkspacePath(workspaceRoot, runStateRelativePath),
    sessionStateRelativePath,
    sessionStatePath: sessionStateRelativePath ? resolveWorkspacePath(workspaceRoot, sessionStateRelativePath) : undefined,
    checkpointsRelativePath,
    checkpointsPath: resolveWorkspacePath(workspaceRoot, checkpointsRelativePath),
  };
}

export function resolveSessionStatePath(input: ResolveSessionStatePathInput): {
  workspaceRoot: string;
  sessionStateRelativePath: string;
  sessionStatePath: string;
} {
  const workspaceRoot = resolve(input.workspaceRoot);
  const sessionStateRelativePath = input.sessionStateRelativePath ?? `.curdx/state/sessions/${safePathSegment(input.sessionId)}.json`;
  return {
    workspaceRoot,
    sessionStateRelativePath,
    sessionStatePath: resolveWorkspacePath(workspaceRoot, sessionStateRelativePath),
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
