import { spawnSync } from 'node:child_process';

import type { CommandProbeResult } from './types.ts';

export interface CommandProbeInput {
  id: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  maxBuffer?: number;
}

interface ProbeFixture {
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  error?: string;
  durationMs?: number;
  timedOut?: boolean;
}

function fixtureMap(env: Record<string, string | undefined>): Record<string, ProbeFixture> {
  const raw = env.CURDX_FLOW_CAPABILITY_PROBES;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, ProbeFixture>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function fixtureResult(input: CommandProbeInput, fixture: ProbeFixture): CommandProbeResult {
  return {
    id: input.id,
    command: [input.command, ...(input.args ?? [])].join(' '),
    exitCode: fixture.exitCode ?? 0,
    stdout: fixture.stdout ?? '',
    stderr: fixture.stderr ?? '',
    ...(fixture.error ? { error: fixture.error } : {}),
    durationMs: fixture.durationMs ?? 0,
    timedOut: fixture.timedOut ?? false,
    source: 'fixture',
  };
}

export function probeCommand(input: CommandProbeInput): CommandProbeResult {
  const env = { ...process.env, ...(input.env ?? {}) };
  const fixture = fixtureMap(env)[input.id];
  if (fixture) return fixtureResult(input, fixture);

  const startedAt = Date.now();
  const result = spawnSync(input.command, input.args ?? [], {
    cwd: input.cwd,
    env,
    encoding: 'utf8',
    timeout: input.timeoutMs ?? 1_000,
    maxBuffer: input.maxBuffer ?? 256 * 1024,
  });
  const durationMs = Date.now() - startedAt;
  const error = result.error as NodeJS.ErrnoException | undefined;
  const timedOut = error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM';
  const errorMessage = timedOut
    ? `command timed out after ${input.timeoutMs ?? 1_000}ms`
    : error?.message;

  return {
    id: input.id,
    command: [input.command, ...(input.args ?? [])].join(' '),
    exitCode: result.status ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    ...(errorMessage ? { error: errorMessage } : {}),
    durationMs,
    timedOut,
    source: 'exec',
  };
}
