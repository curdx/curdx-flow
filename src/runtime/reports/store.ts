import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import { CONTRACTS, validateContract } from '../contracts/index.ts';
import type {
  ReportFileIo,
  ReportPaths,
  ReportRuntimeIssue,
  ReportWriteInput,
  ReportWriteResult,
  ResolveReportPathsInput,
} from './types.ts';

export const defaultReportFileIo: ReportFileIo = {
  writeFile,
  rename,
  mkdir,
  unlink,
};

export function mergeReportFileIo(override?: Partial<ReportFileIo>): ReportFileIo {
  return {
    ...defaultReportFileIo,
    ...override,
  };
}

export function resolveReportPaths(input: ResolveReportPathsInput): ReportPaths {
  const workspaceRoot = resolve(input.workspaceRoot);
  const safeRunId = safePathSegment(input.runId);
  const reportDir = input.reportRelativeDir ?? '.curdx/reports';
  const markdownRelativePath = `${reportDir}/${safeRunId}.report.md`;
  const jsonRelativePath = `${reportDir}/${safeRunId}.report.json`;

  return {
    workspaceRoot,
    markdownRelativePath,
    jsonRelativePath,
    markdownPath: resolveWorkspacePath(workspaceRoot, markdownRelativePath),
    jsonPath: resolveWorkspacePath(workspaceRoot, jsonRelativePath),
  };
}

export async function writeVerificationReport(input: ReportWriteInput): Promise<ReportWriteResult> {
  const paths = resolveReportPaths({
    workspaceRoot: input.workspaceRoot,
    runId: input.runId,
    reportRelativeDir: input.reportRelativeDir,
  });
  const validation = validateContract('verificationReport', input.report.json);
  if (!validation.ok) {
    return {
      ok: false,
      status: 'blocked',
      markdownPath: paths.markdownPath,
      jsonPath: paths.jsonPath,
      issues: validation.issues.map((issue) => ({
        ...issue,
        filePath: paths.jsonPath,
      })),
    };
  }

  const io = mergeReportFileIo(input.io);
  const markdownWrite = await atomicWriteText(paths.markdownPath, input.report.markdown, io);
  if (!markdownWrite.ok) {
    return {
      ok: false,
      status: 'blocked',
      markdownPath: paths.markdownPath,
      jsonPath: paths.jsonPath,
      issues: [markdownWrite.issue],
    };
  }

  const jsonWrite = await atomicWriteText(paths.jsonPath, `${JSON.stringify(input.report.json, null, 2)}\n`, io);
  if (!jsonWrite.ok) {
    return {
      ok: false,
      status: 'blocked',
      markdownPath: paths.markdownPath,
      jsonPath: paths.jsonPath,
      issues: [jsonWrite.issue],
    };
  }

  return {
    ok: true,
    markdownPath: paths.markdownPath,
    jsonPath: paths.jsonPath,
    issues: [],
  };
}

async function atomicWriteText(
  filePath: string,
  data: string,
  io: ReportFileIo,
): Promise<{ ok: true } | { ok: false; issue: ReportRuntimeIssue }> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await io.mkdir(dirname(filePath), { recursive: true });
    await io.writeFile(tempPath, data, 'utf8');
    await io.rename(tempPath, filePath);
    return { ok: true };
  } catch (err: unknown) {
    await io.unlink(tempPath).catch(() => undefined);
    return {
      ok: false,
      issue: reportIssue('$', 'invalid-write', `Failed to write verification report: ${errorMessage(err)}`, filePath),
    };
  }
}

function reportIssue(
  path: string,
  code: ReportRuntimeIssue['code'],
  message: string,
  filePath?: string,
): ReportRuntimeIssue {
  return {
    schemaId: CONTRACTS.verificationReport.schemaId,
    path,
    code,
    message,
    severity: 'blocked',
    filePath,
  };
}

function resolveWorkspacePath(workspaceRoot: string, relativePath: string): string {
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

function isWorkspaceRelativePath(value: string): boolean {
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

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
