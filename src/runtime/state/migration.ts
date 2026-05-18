import { validateContract, type RuntimeSession, type StateLedger } from '../contracts/index.ts';
import { stateIssue } from './io.ts';
import type { StateRuntimeIssue } from './types.ts';

export function normalizeRunStatePayload(
  payload: unknown,
): { ok: true; state: StateLedger; migrated: boolean } | { ok: false; issues: StateRuntimeIssue[] } {
  if (!isRecord(payload)) {
    return { ok: false, issues: [stateIssue('stateLedger', '$', 'not-object', 'Run state must be an object.')] };
  }

  const version = supportedMigrationVersion('stateLedger', payload.schemaVersion);
  if (!version.ok) return { ok: false, issues: [version.issue] };

  const migrated = version.migrated;
  const candidate = migrateRunState(payload);
  const validation = validateContract('stateLedger', candidate);
  if (!validation.ok) {
    return { ok: false, issues: validation.issues };
  }

  return { ok: true, state: validation.value as StateLedger, migrated };
}

export function normalizeSessionPayload(
  payload: unknown,
): { ok: true; session: RuntimeSession; migrated: boolean } | { ok: false; issues: StateRuntimeIssue[] } {
  if (!isRecord(payload)) {
    return { ok: false, issues: [stateIssue('session', '$', 'not-object', 'Session state must be an object.')] };
  }

  const version = supportedMigrationVersion('session', payload.schemaVersion);
  if (!version.ok) return { ok: false, issues: [version.issue] };

  const migrated = version.migrated;
  const candidate = migrateSession(payload);
  const validation = validateContract('session', candidate);
  if (!validation.ok) {
    return { ok: false, issues: validation.issues };
  }

  return { ok: true, session: validation.value as RuntimeSession, migrated };
}

function migrateRunState(payload: Record<string, unknown>): Record<string, unknown> {
  const now = stringField(payload.updatedAt) ?? stringField(payload.startedAt) ?? new Date(0).toISOString();
  const runId = stringField(payload.runId) ?? 'unknown-run';
  return {
    ...payload,
    schemaVersion: 1,
    verdictStatus: stringField(payload.verdictStatus) ?? verdictFromStatus(payload.status),
    missingEvidence: Array.isArray(payload.missingEvidence) ? payload.missingEvidence : [],
    dirtyBaseline: migrateDirtyBaseline(payload.dirtyBaseline, now),
    generatedFiles: migrateGeneratedFiles(payload.generatedFiles, now, runId),
  };
}

function migrateSession(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    ...payload,
    schemaVersion: 1,
    missingEvidence: Array.isArray(payload.missingEvidence) ? payload.missingEvidence : [],
  };
}

function verdictFromStatus(status: unknown): StateLedger['verdictStatus'] {
  if (status === 'complete') return 'complete';
  if (status === 'blocked') return 'blocked';
  if (status === 'partial') return 'partial';
  if (status === 'failed') return 'failed';
  return 'pending';
}

function supportedMigrationVersion(
  contractName: 'stateLedger' | 'session',
  schemaVersion: unknown,
): { ok: true; migrated: boolean } | { ok: false; issue: StateRuntimeIssue } {
  if (schemaVersion === 1) return { ok: true, migrated: false };
  if (schemaVersion === undefined || schemaVersion === 0) return { ok: true, migrated: true };

  return {
    ok: false,
    issue: stateIssue(contractName, '$.schemaVersion', 'unsupported-schema-version', 'Unsupported schemaVersion cannot be safely migrated.'),
  };
}

function migrateDirtyBaseline(value: unknown, capturedAt: string): Record<string, unknown> {
  if (!isRecord(value)) {
    return {
      capturedAt,
      files: [],
    };
  }

  return {
    ...value,
    capturedAt: stringField(value.capturedAt) ?? capturedAt,
    files: Array.isArray(value.files) ? value.files : [],
  };
}

function migrateGeneratedFiles(value: unknown, createdAt: string, runId: string): unknown[] {
  if (!Array.isArray(value)) return [];

  return value.map((entry) => {
    if (!isRecord(entry)) return entry;
    return {
      ...entry,
      createdAt: stringField(entry.createdAt) ?? createdAt,
      relatedRunId: stringField(entry.relatedRunId) ?? runId,
    };
  });
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
