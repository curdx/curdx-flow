import type { EvidenceBlock } from '../contracts/index.ts';
import type { FreshnessTarget } from './types.ts';

const targetFields = ['commandHash', 'targetHash', 'environmentId', 'targetSummary'] as const;

export function evaluateEvidenceFreshness(input: {
  evidence: EvidenceBlock;
  target?: FreshnessTarget;
  now?: Date | string;
}): { ok: true } | { ok: false; reason: string } {
  const freshness = input.evidence.freshness;
  if (!isRecord(freshness)) {
    return { ok: false, reason: 'missing freshness object' };
  }

  const validatedAt = freshness.validatedAt;
  if (typeof validatedAt !== 'string' || Number.isNaN(Date.parse(validatedAt))) {
    return { ok: false, reason: 'missing valid freshness.validatedAt' };
  }

  if (!hasTargetContext(freshness)) {
    return { ok: false, reason: 'missing freshness target context' };
  }

  const expiresAt = freshness.expiresAt;
  if (typeof expiresAt === 'string') {
    const expiry = Date.parse(expiresAt);
    if (Number.isNaN(expiry)) {
      return { ok: false, reason: 'invalid freshness.expiresAt' };
    }
    if (expiry < nowMs(input.now)) {
      return { ok: false, reason: 'evidence expired' };
    }
  }

  for (const field of targetFields) {
    const expected = input.target?.[field];
    if (typeof expected !== 'string') continue;
    const actual = freshness[field];
    if (actual !== expected) {
      return { ok: false, reason: `${field} mismatch` };
    }
  }

  return { ok: true };
}

function hasTargetContext(freshness: Record<string, unknown>): boolean {
  const hasScalarTarget = targetFields.some((field) => typeof freshness[field] === 'string' && freshness[field].length > 0);
  if (hasScalarTarget) return true;

  const fileTargets = freshness.fileTargets;
  return Array.isArray(fileTargets) && fileTargets.length > 0 && fileTargets.every((item) => typeof item === 'string' && item.length > 0);
}

function nowMs(value: Date | string | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
