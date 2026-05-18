import type {
  DirtyFileRecord,
  DirtyFileStatus,
  DirtyWorktreeBaseline,
  GeneratedFileInput,
  GeneratedFileRecord,
} from './types.ts';

export function captureDirtyBaseline(input: {
  capturedAt: string;
  files: Array<{ path: string; status?: DirtyFileStatus }>;
}): DirtyWorktreeBaseline {
  return {
    capturedAt: input.capturedAt,
    files: input.files.map((file): DirtyFileRecord => ({
      path: file.path,
      status: file.status ?? 'unknown',
      source: 'user-existing',
    })),
  };
}

export function classifyGeneratedFiles(input: {
  dirtyBaseline: DirtyWorktreeBaseline;
  files: GeneratedFileInput[];
  createdAt: string;
  runId: string;
}): GeneratedFileRecord[] {
  const userExisting = new Set(input.dirtyBaseline.files.map((file) => file.path));

  return input.files.map((file): GeneratedFileRecord => {
    if (userExisting.has(file.path) && !hasExplicitExistingFileReason(file)) {
      return {
        ...file,
        category: 'user-existing-file',
        originalCategory: file.category,
        createdAt: input.createdAt,
        relatedRunId: input.runId,
      };
    }

    return {
      ...file,
      createdAt: input.createdAt,
      relatedRunId: input.runId,
    };
  });
}

function hasExplicitExistingFileReason(file: GeneratedFileInput): boolean {
  return typeof file.userExistingChangeReason === 'string' && file.userExistingChangeReason.trim().length > 0;
}
