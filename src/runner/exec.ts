import { x } from 'tinyexec';
import type { taskLog } from '@clack/prompts';

export type CmdResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export async function run(cmd: string, args: string[]): Promise<CmdResult> {
  const proc = x(cmd, args, { throwOnError: false });
  const result = await proc;
  return {
    exitCode: result.exitCode ?? 0,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export async function runStreaming(
  cmd: string,
  args: string[],
  log: ReturnType<typeof taskLog>,
): Promise<CmdResult> {
  log.message(`$ ${cmd} ${args.join(' ')}`);
  const proc = x(cmd, args, { throwOnError: false });
  let stdout = '';
  for await (const line of proc) {
    const trimmed = line.replace(/\r?\n$/, '');
    if (trimmed.length > 0) {
      stdout += trimmed + '\n';
      log.message(trimmed);
    }
  }
  const finished = await proc;
  return {
    exitCode: finished.exitCode ?? 0,
    stdout,
    stderr: finished.stderr,
  };
}

export class CmdError extends Error {
  constructor(
    message: string,
    public readonly result: CmdResult,
  ) {
    super(message);
  }
}

export function ensureOk(result: CmdResult, label: string): void {
  if (result.exitCode !== 0) {
    const detail = (result.stderr || result.stdout || '').trim().slice(0, 500);
    throw new CmdError(`${label} (exit ${result.exitCode})${detail ? `\n${detail}` : ''}`, result);
  }
}
