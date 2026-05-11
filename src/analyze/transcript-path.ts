// Transcript path resolver: cwd → encoded project dir → real .jsonl paths.
//
// Design notes (echoes design.md → Component 1, AC1–AC4, D3, D4):
//   • POSIX-only v1 — Windows path separators deferred to a future spec.
//   • Encoding mirrors Claude Code's current project directory convention:
//       /Users/x/foo        →  -Users-x-foo
//       /tmp/a_b/app.test   →  -tmp-a-b-app-test
//     (replace every character outside [A-Za-z0-9] with `-`, leading `-`
//     preserved). We also probe the legacy slash-only encoding as a fallback
//     for transcripts created by older local tooling/tests.
//   • realpath() resolves symlinks once per cwd via a module-level Map cache
//     so repeated calls in the same process don't re-stat (D3).
//   • 1-level glob (`readdirSync withFileTypes`) deliberately skips
//     subdirectories — matches ccusage's pattern and avoids YAGNI blacklist
//     maintenance (D4). `.jsonl.bak` editor swap files are excluded by the
//     strict `.endsWith('.jsonl')` post-filter.
//   • `fixtureOverride` short-circuits the whole resolution so
//     `CURDX_TRANSCRIPT_FIXTURE=…` keeps working for legacy tests (AC4).
//   • Empty dir or missing dir for `kind='real'` → TranscriptNotFoundError
//     with a friendly two-part (path + hint) message; index.ts catches it at
//     the top level for exit-1 + clean stderr (AC3).

import { readdirSync, realpathSync, statSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/**
 * Resolved transcript source. Discriminated by `kind`:
 *   - `'real'`  → globbed from `~/.claude/projects/<encoded>/`
 *   - `'fixture'` → caller-supplied single file (legacy / test path)
 *
 * `realCwd` and `encodedDir` are surfaced on the `'real'` variant so
 * downstream consumers (state-file keying, error display) can show both
 * the user-facing cwd and the physical path without re-doing the syscall.
 */
export type TranscriptSource =
  | { kind: 'real'; paths: string[]; cwd: string; realCwd: string; encodedDir: string }
  | { kind: 'fixture'; paths: string[]; cwd: string };

/**
 * Inputs for `resolveTranscriptSource`. All fields optional so the common
 * call site (`resolveTranscriptSource()`) just uses `process.cwd()`.
 *
 * `homedir` is exposed for tests — production callers should leave it unset
 * and let `os.homedir()` win.
 */
export interface ResolveOpts {
  cwd?: string;
  fixtureOverride?: string;
  sessionFilter?: string;
  homedir?: string;
}

/**
 * Friendly error thrown when the resolver finds no usable transcripts.
 * `path` is the directory we looked in; `hint` is a one-line remediation
 * shown directly to the user (no stack trace) by index.ts top-level catch.
 */
export class TranscriptNotFoundError extends Error {
  public readonly path: string;
  public readonly hint: string;

  constructor(p: string, hint: string) {
    super(`Transcript not found at ${p}\n  hint: ${hint}`);
    this.name = 'TranscriptNotFoundError';
    this.path = p;
    this.hint = hint;
  }
}

// Module-level cache: cwd → realpath. Avoids redundant syscalls when the
// resolver is invoked multiple times in the same process (D3).
const REALPATH_CACHE = new Map<string, string>();

function resolveRealCwd(cwd: string): string {
  const cached = REALPATH_CACHE.get(cwd);
  if (cached !== undefined) return cached;
  let real: string;
  try {
    real = realpathSync(cwd);
  } catch {
    // Broken symlink or non-existent cwd — fall back to the original path
    // (R4 risk: better to attempt the encoded lookup than crash here; the
    // dir-missing branch below will produce a friendlier error if needed).
    real = cwd;
  }
  REALPATH_CACHE.set(cwd, real);
  return real;
}

/**
 * Encode a POSIX cwd into Claude Code's project-dir naming convention.
 * Pure / deterministic; no I/O. Exported only via the resolver.
 */
function encodeCwd(realCwd: string): string {
  return realCwd.replace(/[^A-Za-z0-9]/g, '-');
}

function encodeLegacyCwd(realCwd: string): string {
  return realCwd.replace(/\//g, '-');
}

function candidateProjectDirs(home: string, realCwd: string): string[] {
  const encoded = encodeCwd(realCwd);
  const legacy = encodeLegacyCwd(realCwd);
  const names = encoded === legacy ? [encoded] : [encoded, legacy];
  return names.map((name) => path.join(home, '.claude', 'projects', name));
}

/**
 * Main entry point. See module header for behavior overview.
 *
 * Throws `TranscriptNotFoundError` when:
 *   - `fixtureOverride` is set but the file does not exist, or
 *   - `kind='real'` and the encoded project dir is missing or contains
 *     zero `.jsonl` files (after optional `sessionFilter` narrowing).
 */
export function resolveTranscriptSource(opts: ResolveOpts = {}): TranscriptSource {
  const cwd = opts.cwd ?? process.cwd();

  // Fixture override short-circuit (AC4 — legacy CURDX_TRANSCRIPT_FIXTURE).
  if (opts.fixtureOverride) {
    const fixturePath = opts.fixtureOverride;
    try {
      const st = statSync(fixturePath);
      if (!st.isFile()) {
        throw new TranscriptNotFoundError(
          fixturePath,
          'fixture path is not a regular file',
        );
      }
    } catch (err) {
      if (err instanceof TranscriptNotFoundError) throw err;
      throw new TranscriptNotFoundError(
        fixturePath,
        'fixture not found — check CURDX_TRANSCRIPT_FIXTURE points to an existing .jsonl file',
      );
    }
    return { kind: 'fixture', paths: [fixturePath], cwd };
  }

  const home = opts.homedir ?? homedir();
  const realCwd = resolveRealCwd(cwd);
  const candidates = candidateProjectDirs(home, realCwd);
  let encodedDir = candidates[0]!;

  let entries: Dirent[] = [];
  let foundDir = false;
  for (const candidate of candidates) {
    try {
      entries = readdirSync(candidate, { withFileTypes: true });
      encodedDir = candidate;
      foundDir = true;
      break;
    } catch {
      // Try the next encoding candidate.
    }
  }

  if (!foundDir) {
    throw new TranscriptNotFoundError(
      encodedDir,
      `no Claude Code project dir for cwd ${cwd} — run \`claude\` here at least once, or pass CURDX_TRANSCRIPT_FIXTURE=… for tests`,
    );
  }

  let paths = entries
    .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
    .map((e) => path.join(encodedDir, e.name));

  if (opts.sessionFilter) {
    const wanted = `${opts.sessionFilter}.jsonl`;
    paths = paths.filter((p) => path.basename(p) === wanted);
  }

  if (paths.length === 0) {
    const hint = opts.sessionFilter
      ? `no transcript file ${opts.sessionFilter}.jsonl in ${encodedDir} — drop --session or check the uuid`
      : `no .jsonl transcripts in ${encodedDir} — open Claude Code in this cwd to generate one`;
    throw new TranscriptNotFoundError(encodedDir, hint);
  }

  return { kind: 'real', paths, cwd, realCwd, encodedDir };
}
