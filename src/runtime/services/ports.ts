import { Socket } from 'node:net';

import type {
  PortConflict,
  PortProbeResult,
  ServiceOwnership,
  ServicePortClaim,
} from './types.ts';

const DEFAULT_PORT_PROBE_TIMEOUT_MS = 120;

export async function probePort(
  claim: ServicePortClaim,
  input: { owner?: ServiceOwnership; now?: Date | string; timeoutMs?: number } = {},
): Promise<PortProbeResult> {
  const listening = await canConnect(claim.host, claim.port, input.timeoutMs ?? DEFAULT_PORT_PROBE_TIMEOUT_MS);
  const owner = listening ? input.owner ?? 'user-existing' : 'unknown-existing';
  return {
    host: claim.host,
    port: claim.port,
    listening,
    owner,
    checkedAt: normalizeDate(input.now),
    summary: listening
      ? `Port ${claim.host}:${claim.port} is already listening.`
      : `Port ${claim.host}:${claim.port} is available.`,
  };
}

export function portConflictForClaim(input: {
  serviceId: string;
  claim: ServicePortClaim;
  owner?: ServiceOwnership;
  existingServiceId?: string;
  allowReuseExisting?: boolean;
  affectsEvidence?: string[];
}): PortConflict {
  const owner = input.owner ?? 'user-existing';
  const resolution = input.allowReuseExisting === true && owner !== 'curdx-started' ? 'reuse' : 'blocked';
  return {
    serviceId: input.serviceId,
    host: input.claim.host,
    port: input.claim.port,
    target: input.claim.target,
    owner,
    existingServiceId: input.existingServiceId,
    resolution,
    reason: resolution === 'reuse'
      ? 'Port is already listening and policy allows warm reuse after health check.'
      : owner === 'curdx-started'
        ? `Port is already owned by curdx-started service ${input.existingServiceId ?? 'unknown'}.`
        : 'Port is already listening and belongs to a process curdx-flow did not start in this run.',
    riskLevel: resolution === 'reuse' || owner === 'curdx-started' ? 'medium' : 'high',
    affectsEvidence: input.affectsEvidence ?? ['runtime-service', 'api-or-browser-target'],
    fallback: resolution === 'reuse'
      ? 'Run health check against the existing service and mark evidence as warm/reused.'
      : owner === 'curdx-started'
        ? 'Do not start a second service on the same port; adjust the plan or share the existing service explicitly.'
      : 'Do not kill the existing process; choose another port, stop it manually, or rerun with explicit reuse policy.',
  };
}

async function canConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    let settled = false;
    const done = (listening: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(listening);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

function normalizeDate(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}
