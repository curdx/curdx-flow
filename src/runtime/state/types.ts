import type {
  ContractIssueCode,
  RuntimeSession,
  StateLedger,
} from '../contracts/index.ts';

export type StateRuntimeIssueCode = ContractIssueCode | 'invalid-read' | 'invalid-write';

export interface StateRuntimeIssue {
  schemaId: string;
  path: string;
  code: StateRuntimeIssueCode;
  message: string;
  severity: 'blocked' | 'degraded';
  filePath?: string;
}

export interface StateFileIo {
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
  writeFile(path: string, data: string, encoding: BufferEncoding): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  unlink(path: string): Promise<void>;
}

export interface ResolveStatePathsInput {
  workspaceRoot: string;
  runId: string;
  sessionId?: string;
  runStateRelativePath?: string;
  sessionStateRelativePath?: string;
}

export interface StatePaths {
  workspaceRoot: string;
  runStateRelativePath: string;
  runStatePath: string;
  sessionStateRelativePath?: string;
  sessionStatePath?: string;
  checkpointsRelativePath: string;
  checkpointsPath: string;
}

export type DirtyFileStatus = 'modified' | 'staged' | 'untracked' | 'deleted' | 'renamed' | 'unknown';

export interface DirtyFileRecord extends Record<string, unknown> {
  path: string;
  status: DirtyFileStatus;
  source: 'user-existing';
}

export interface DirtyWorktreeBaseline extends Record<string, unknown> {
  capturedAt: string;
  files: DirtyFileRecord[];
}

export type GeneratedFileCategory =
  | 'source-change'
  | 'generated-verification-file'
  | 'temporary-artifact'
  | 'report'
  | 'evidence'
  | 'user-existing-file'
  | 'external-tool-output';

export interface GeneratedFileInput {
  path: string;
  category: GeneratedFileCategory;
  owner: string;
  relatedEvidenceIds?: string[];
  userExistingChangeReason?: string;
}

export interface GeneratedFileRecord extends GeneratedFileInput {
  createdAt: string;
  relatedRunId: string;
  originalCategory?: GeneratedFileCategory;
}

export interface StateWriteInput {
  workspaceRoot: string;
  state: StateLedger;
  io?: Partial<StateFileIo>;
}

export interface SessionWriteInput {
  workspaceRoot: string;
  session: RuntimeSession;
  io?: Partial<StateFileIo>;
}

export type StateWriteResult =
  | {
      ok: true;
      statePath: string;
      issues: [];
    }
  | {
      ok: false;
      status: 'blocked' | 'degraded';
      statePath?: string;
      issues: StateRuntimeIssue[];
    };

export interface RecoveryReport {
  summary: string;
  nextAction: Record<string, unknown>;
}

export type RunStateReadResult =
  | {
      ok: true;
      state: StateLedger;
      statePath: string;
      migrated: boolean;
      issues: [];
    }
  | {
      ok: false;
      status: 'blocked';
      statePath: string;
      recoveryReport: RecoveryReport;
      issues: StateRuntimeIssue[];
    };

export type SessionStateReadResult =
  | {
      ok: true;
      session: RuntimeSession;
      statePath: string;
      migrated: boolean;
      issues: [];
    }
  | {
      ok: false;
      status: 'blocked';
      statePath: string;
      recoveryReport: RecoveryReport;
      issues: StateRuntimeIssue[];
    };

export type RunStateInput = StateWriteInput;
export type RunStateSnapshot = StateLedger;
export type RuntimeSessionSnapshot = RuntimeSession;
export type StateReadResult = RunStateReadResult;

export interface ResumeContext {
  currentStep: string;
  verifiedEvidenceIds: string[];
  missingEvidence: unknown[];
  nextAction: Record<string, unknown>;
  resumeSummary: string;
}
