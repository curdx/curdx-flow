import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  CONTRACTS,
  validateContract,
  type ContractName,
  type ContractValidationResult,
} from '../contracts/index.ts';
import type { EvidenceFileIo, EvidenceReadResult, EvidenceRuntimeIssue } from './types.ts';

export const defaultEvidenceFileIo: EvidenceFileIo = {
  readFile,
  writeFile,
  rename,
  mkdir,
  unlink,
};

export function mergeFileIo(override?: Partial<EvidenceFileIo>): EvidenceFileIo {
  return {
    ...defaultEvidenceFileIo,
    ...override,
  };
}

export async function readJsonlFile<T extends Record<string, unknown>>(
  filePath: string,
  contractName: ContractName,
  io: EvidenceFileIo,
): Promise<EvidenceReadResult<T>> {
  let raw: string | undefined;
  try {
    raw = await readOptionalUtf8(filePath, io);
  } catch (err: unknown) {
    return {
      ok: false,
      status: 'blocked',
      path: filePath,
      issues: [runtimeIssue(contractName, '$', 'invalid-read', `Failed to read JSONL file: ${errorMessage(err)}`, filePath)],
    };
  }

  if (raw === undefined) {
    return { ok: true, entries: [], path: filePath, issues: [] };
  }

  const issues: EvidenceRuntimeIssue[] = [];
  const entries: T[] = [];
  const lines = raw.split('\n');

  lines.forEach((line, index) => {
    if (line.trim().length === 0) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err: unknown) {
      issues.push(runtimeIssue(contractName, `$[${index}]`, 'invalid-json', errorMessage(err), filePath, index + 1));
      return;
    }

    const result = validateContract(contractName, parsed);
    if (!result.ok) {
      issues.push(...result.issues.map((issue) => ({
        ...issue,
        path: `$[${index}]${issue.path.slice(1)}`,
        filePath,
        line: index + 1,
      })));
      return;
    }

    entries.push(result.value as T);
  });

  if (issues.length > 0) {
    return { ok: false, status: 'blocked', path: filePath, issues };
  }

  return { ok: true, entries, path: filePath, issues: [] };
}

export async function atomicAppendJsonLine(
  filePath: string,
  value: Record<string, unknown>,
  io: EvidenceFileIo,
): Promise<{ ok: true } | { ok: false; issue: EvidenceRuntimeIssue }> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;

  try {
    await io.mkdir(dirname(filePath), { recursive: true });
    const current = await readOptionalUtf8(filePath, io);
    const existing = current ?? '';
    const prefix = existing.length > 0 && !existing.endsWith('\n') ? `${existing}\n` : existing;
    const next = `${prefix}${JSON.stringify(value)}\n`;
    await io.writeFile(tempPath, next, 'utf8');
    await io.rename(tempPath, filePath);
    return { ok: true };
  } catch (err: unknown) {
    await io.unlink(tempPath).catch(() => undefined);
    return {
      ok: false,
      issue: runtimeIssue('evidence', '$', 'invalid-write', `Failed to append JSONL evidence: ${errorMessage(err)}`, filePath),
    };
  }
}

export function runtimeIssue(
  contractName: ContractName,
  path: string,
  code: EvidenceRuntimeIssue['code'],
  message: string,
  filePath?: string,
  line?: number,
): EvidenceRuntimeIssue {
  return {
    schemaId: CONTRACTS[contractName].schemaId,
    path,
    code,
    message,
    severity: 'blocked',
    filePath,
    line,
  };
}

export function fromContractResult(
  contractName: ContractName,
  result: ContractValidationResult,
): EvidenceRuntimeIssue[] {
  if (result.ok) return [];
  return result.issues.map((issue) => ({
    ...issue,
    schemaId: issue.schemaId || CONTRACTS[contractName].schemaId,
  }));
}

async function readOptionalUtf8(filePath: string, io: EvidenceFileIo): Promise<string | undefined> {
  try {
    return await io.readFile(filePath, 'utf8');
  } catch (err: unknown) {
    if (isNodeErrno(err, 'ENOENT')) return undefined;
    throw err;
  }
}

function isNodeErrno(value: unknown, code: string): boolean {
  return typeof value === 'object' && value !== null && 'code' in value && value.code === code;
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
