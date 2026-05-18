import type {
  ArtifactIndexEntry,
  ContractIssueCode,
  EvidenceBlock,
} from '../contracts/index.ts';

export type EvidenceRuntimeIssueCode = ContractIssueCode | 'invalid-read' | 'invalid-write';

export interface EvidenceRuntimeIssue {
  schemaId: string;
  path: string;
  code: EvidenceRuntimeIssueCode;
  message: string;
  severity: 'blocked' | 'degraded';
  filePath?: string;
  line?: number;
}

export type ArtifactIndexInput = Partial<ArtifactIndexEntry> & {
  id: string;
  type: ArtifactIndexEntry['type'];
  path: string;
  summary: string;
  privacy?: Partial<ArtifactIndexEntry['privacy']>;
};

export interface EvidenceFileIo {
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
  writeFile(path: string, data: string, encoding: BufferEncoding): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  unlink(path: string): Promise<void>;
}

export interface ResolveEvidencePathsInput {
  workspaceRoot: string;
  runId: string;
  ledgerRelativePath?: string;
  artifactIndexRelativePath?: string;
}

export interface EvidencePaths {
  workspaceRoot: string;
  ledgerRelativePath: string;
  ledgerPath: string;
  artifactIndexRelativePath: string;
  artifactIndexPath: string;
}

export interface EvidenceWriteInput {
  workspaceRoot: string;
  evidence: EvidenceBlock;
  artifacts?: ArtifactIndexInput[];
  now?: Date | string;
  io?: Partial<EvidenceFileIo>;
}

export type EvidenceWriteResult =
  | {
      ok: true;
      status: EvidenceBlock['status'];
      evidenceId: string;
      ledgerPath: string;
      artifactIndexPath: string;
      artifactIds: string[];
      issues: [];
    }
  | {
      ok: false;
      status: 'blocked' | 'degraded';
      ledgerPath?: string;
      artifactIndexPath?: string;
      artifactIds?: string[];
      issues: EvidenceRuntimeIssue[];
    };

export type EvidenceReadResult<T> =
  | {
      ok: true;
      entries: T[];
      path: string;
      issues: [];
    }
  | {
      ok: false;
      status: 'blocked';
      path: string;
      issues: EvidenceRuntimeIssue[];
    };
