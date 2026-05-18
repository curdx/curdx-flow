import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { CONTRACTS, type ContractName } from '../contracts/index.ts';
import type { StateFileIo, StateRuntimeIssue } from './types.ts';

export const defaultStateFileIo: StateFileIo = {
  readFile,
  writeFile,
  rename,
  mkdir,
  unlink,
};

export function mergeStateFileIo(override?: Partial<StateFileIo>): StateFileIo {
  return {
    ...defaultStateFileIo,
    ...override,
  };
}

export async function readOptionalJsonFile(
  filePath: string,
  contractName: ContractName,
  io: StateFileIo,
): Promise<{ ok: true; value: unknown | undefined } | { ok: false; issue: StateRuntimeIssue }> {
  let raw: string;
  try {
    raw = await io.readFile(filePath, 'utf8');
  } catch (err: unknown) {
    if (isNodeErrno(err, 'ENOENT')) return { ok: true, value: undefined };
    return {
      ok: false,
      issue: stateIssue(contractName, '$', 'invalid-read', `Failed to read state file: ${errorMessage(err)}`, filePath),
    };
  }

  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (err: unknown) {
    return {
      ok: false,
      issue: stateIssue(contractName, '$', 'invalid-json', `State file is malformed JSON: ${errorMessage(err)}`, filePath),
    };
  }
}

export async function atomicWriteJsonFile(
  filePath: string,
  contractName: ContractName,
  value: Record<string, unknown>,
  io: StateFileIo,
): Promise<{ ok: true } | { ok: false; issue: StateRuntimeIssue }> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await io.mkdir(dirname(filePath), { recursive: true });
    await io.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await io.rename(tempPath, filePath);
    return { ok: true };
  } catch (err: unknown) {
    await io.unlink(tempPath).catch(() => undefined);
    return {
      ok: false,
      issue: stateIssue(contractName, '$', 'invalid-write', `Failed to write state file: ${errorMessage(err)}`, filePath),
    };
  }
}

export function stateIssue(
  contractName: ContractName,
  path: string,
  code: StateRuntimeIssue['code'],
  message: string,
  filePath?: string,
): StateRuntimeIssue {
  return {
    schemaId: CONTRACTS[contractName].schemaId,
    path,
    code,
    message,
    severity: 'blocked',
    filePath,
  };
}

function isNodeErrno(value: unknown, code: string): boolean {
  return typeof value === 'object' && value !== null && 'code' in value && value.code === code;
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
