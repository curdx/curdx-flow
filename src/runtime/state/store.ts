import { validateContract, type RuntimeSession, type StateLedger } from '../contracts/index.ts';
import { atomicWriteJsonFile, mergeStateFileIo, readOptionalJsonFile, stateIssue } from './io.ts';
import { normalizeRunStatePayload, normalizeSessionPayload } from './migration.ts';
import { resolveSessionStatePath, resolveStatePaths } from './paths.ts';
import type {
  ResumeContext,
  RunStateReadResult,
  SessionStateReadResult,
  SessionWriteInput,
  StateFileIo,
  StateRuntimeIssue,
  StateWriteInput,
  StateWriteResult,
} from './types.ts';

export async function createRunState(input: StateWriteInput): Promise<StateWriteResult> {
  return writeRunState(input);
}

export async function updateRunState(input: StateWriteInput): Promise<StateWriteResult> {
  return writeRunState(input);
}

export async function createSessionState(input: SessionWriteInput): Promise<StateWriteResult> {
  const io = mergeStateFileIo(input.io);
  const paths = resolveSessionStatePath({
    workspaceRoot: input.workspaceRoot,
    sessionId: input.session.sessionId,
  });
  const validation = validateContract('session', input.session);
  if (!validation.ok) {
    return { ok: false, status: 'blocked', statePath: paths.sessionStatePath, issues: validation.issues };
  }

  const write = await atomicWriteJsonFile(paths.sessionStatePath, 'session', input.session, io);
  if (!write.ok) {
    return { ok: false, status: 'blocked', statePath: paths.sessionStatePath, issues: [write.issue] };
  }

  return { ok: true, statePath: paths.sessionStatePath, issues: [] };
}

export async function readRunState(input: {
  workspaceRoot: string;
  runId: string;
  io?: Partial<StateFileIo>;
}): Promise<RunStateReadResult> {
  const io = mergeStateFileIo(input.io);
  const paths = resolveStatePaths({ workspaceRoot: input.workspaceRoot, runId: input.runId });
  const raw = await readOptionalJsonFile(paths.runStatePath, 'stateLedger', io);
  if (!raw.ok) {
    return blockedRunRead(paths.runStatePath, 'Run state is malformed or unreadable.', [raw.issue]);
  }
  if (raw.value === undefined) {
    return blockedRunRead(paths.runStatePath, 'Run state is missing; cannot recover current run.', []);
  }

  const normalized = normalizeRunStatePayload(raw.value);
  if (!normalized.ok) {
    return blockedRunRead(paths.runStatePath, 'Run state failed contract validation; recovery is required.', normalized.issues);
  }
  if (normalized.state.runId !== input.runId) {
    return blockedRunRead(paths.runStatePath, 'Run state id does not match the requested run; recovery is required.', [
      stateIssue('stateLedger', '$.runId', 'invalid-pattern', `Expected runId '${input.runId}' but found '${normalized.state.runId}'.`, paths.runStatePath),
    ]);
  }

  return { ok: true, state: normalized.state, statePath: paths.runStatePath, migrated: normalized.migrated, issues: [] };
}

export async function readSessionState(input: {
  workspaceRoot: string;
  sessionId: string;
  io?: Partial<StateFileIo>;
}): Promise<SessionStateReadResult> {
  const io = mergeStateFileIo(input.io);
  const paths = resolveSessionStatePath({
    workspaceRoot: input.workspaceRoot,
    sessionId: input.sessionId,
  });
  const sessionStatePath = paths.sessionStatePath;
  const raw = await readOptionalJsonFile(sessionStatePath, 'session', io);
  if (!raw.ok) {
    return blockedSessionRead(sessionStatePath, 'Session state is malformed or unreadable.', [raw.issue]);
  }
  if (raw.value === undefined) {
    return blockedSessionRead(sessionStatePath, 'Session state is missing; cannot recover session.', []);
  }

  const normalized = normalizeSessionPayload(raw.value);
  if (!normalized.ok) {
    return blockedSessionRead(sessionStatePath, 'Session state failed contract validation; recovery is required.', normalized.issues);
  }
  if (normalized.session.sessionId !== input.sessionId) {
    return blockedSessionRead(sessionStatePath, 'Session state id does not match the requested session; recovery is required.', [
      stateIssue('session', '$.sessionId', 'invalid-pattern', `Expected sessionId '${input.sessionId}' but found '${normalized.session.sessionId}'.`, sessionStatePath),
    ]);
  }

  return { ok: true, session: normalized.session, statePath: sessionStatePath, migrated: normalized.migrated, issues: [] };
}

export function buildResumeContext(state: StateLedger, session?: RuntimeSession): ResumeContext {
  return {
    currentStep: session?.currentStep ?? state.phase,
    verifiedEvidenceIds: state.evidenceIds,
    missingEvidence: session?.missingEvidence ?? state.missingEvidence,
    nextAction: session?.nextAction ?? state.nextAction,
    resumeSummary: session?.resumeSummary ?? `Continue run ${state.runId} at phase ${state.phase}.`,
  };
}

async function writeRunState(input: StateWriteInput): Promise<StateWriteResult> {
  const io = mergeStateFileIo(input.io);
  const paths = resolveStatePaths({ workspaceRoot: input.workspaceRoot, runId: input.state.runId });
  const validation = validateContract('stateLedger', input.state);
  if (!validation.ok) {
    return { ok: false, status: 'blocked', statePath: paths.runStatePath, issues: validation.issues };
  }

  const write = await atomicWriteJsonFile(paths.runStatePath, 'stateLedger', input.state, io);
  if (!write.ok) {
    return { ok: false, status: 'blocked', statePath: paths.runStatePath, issues: [write.issue] };
  }

  return { ok: true, statePath: paths.runStatePath, issues: [] };
}

function blockedRunRead(
  statePath: string,
  summary: string,
  issues: StateRuntimeIssue[],
): RunStateReadResult {
  return {
    ok: false,
    status: 'blocked',
    statePath,
    recoveryReport: {
      summary,
      nextAction: {
        owner: 'user',
        summary: 'Inspect or regenerate run state before continuing.',
      },
    },
    issues,
  };
}

function blockedSessionRead(
  statePath: string,
  summary: string,
  issues: StateRuntimeIssue[],
): SessionStateReadResult {
  return {
    ok: false,
    status: 'blocked',
    statePath,
    recoveryReport: {
      summary,
      nextAction: {
        owner: 'user',
        summary: 'Inspect or regenerate session state before continuing.',
      },
    },
    issues,
  };
}
