/**
 * Stop hook — loop controller for spec task execution continuation.
 *
 * Behaviour mirrors v6 `stop-watcher.sh` (362 LOC). This is the largest hook
 * port (Risk R8 in design.md). Every shell command in the source has a 1:1
 * TypeScript counterpart documented inline below.
 *
 * Shell-op translation table (see .progress.md for the full audit):
 *
 *   v6 shell                                                | TS replacement
 *   --------------------------------------------------------|----------------------------------------
 *   cat (stdin)                                             | readStdinJson()
 *   JSON-extract '.cwd // empty' (and similar)              | direct field access on parsed JSON
 *   awk on YAML frontmatter (enabled:)                      | regex extraction (mirrors load-spec-context)
 *   curdx_resolve_current                                   | resolveCurrent({ cwd })
 *   basename                                                | path.basename
 *   stat -f %m / stat -c %Y                                 | fs.statSync(p).mtimeMs / 1000
 *   date +%s                                                | Math.floor(Date.now() / 1000)
 *   sleep 1                                                 | await new Promise(r => setTimeout(r, 1000))
 *   tail -N | grep -qE '(^|\W)ALL_TASKS_COMPLETE(\W|$)'     | split-by-line, slice last N, regex test
 *   JSON validation pass                                    | JSON.parse in try/catch
 *   shell JSON-mutate '.specs |= map(if ...)'               | parse → mutate → writeFileAtomic
 *   mktemp ... + mv                                         | _shared/atomic-write.writeFileAtomic
 *   update-spec-index.sh --quiet                            | spawn bundled update-spec-index.mjs
 *   awk single-task block (L258-267)                        | extractTaskBlock from _shared/markdown-task-parser
 *   awk parallel-group block (L278-289)                     | hand-written scanner mirroring awk arms
 *   grep -c '^\\s*- \\[ \\]'                                | string.match regex count
 *   find -mmin +60 -delete                                  | readdirSync + statSync.mtimeMs age + unlinkSync
 *   shell JSON-emit '{decision:"block", reason:$r, systemMessage:$m}' | direct JSON.stringify of object literal
 *
 * Stat-mtime unit conversion (Risk R8, audit point):
 *   `stat -f %m` (BSD/macOS) and `stat -c %Y` (GNU/Linux) both return SECONDS.
 *   `fs.statSync(p).mtimeMs` returns MILLISECONDS.
 *   Every comparison divides by 1000 (or compares against ms thresholds) — see
 *   call sites L<isRecentStateFile> and L<cleanupStaleProgressFiles>.
 *
 * ALL_TASKS_COMPLETE detection: `(^|\W)ALL_TASKS_COMPLETE(\W|$)` — same regex
 * as v6 grep -E, applied per line over the last N lines (N=500 primary,
 * N=20 fallback). Word-boundary-by-non-word-char to avoid false positives in
 * code/comments containing the phrase.
 *
 * Output contract:
 *   - Allow stop (exit 0 silently): no JSON written; matches v6 silent exit.
 *     The hook still prints a single-line newline-terminated stdout payload
 *     ONLY when emitting a block decision. (v6 shell JSON-emit always
 *     trailing-newlines its output; we mirror that.)
 *   - Block: `{decision:"block", reason, systemMessage}` (newline-terminated).
 *
 * Error policy (FR-8): any thrown error → stderr log + process.exit(0).
 * Never block the Claude Code session.
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { readStdinJson } from "./_shared/stdin.js";
import { getSpecsDirs, resolveCurrent } from "./_shared/path-resolver.js";
import { writeFileAtomic } from "./_shared/atomic-write.js";
import { extractTaskBlock } from "./_shared/markdown-task-parser.js";

interface HookInput {
  cwd?: string;
  transcript_path?: string;
  stop_hook_active?: boolean;
}

interface CurdxState {
  phase?: string;
  taskIndex?: number;
  totalTasks?: number;
  taskIteration?: number;
  quickMode?: boolean;
  nativeSyncEnabled?: boolean;
  globalIteration?: number;
  maxGlobalIterations?: number;
  awaitingApproval?: boolean;
  recoveryMode?: boolean;
  maxTaskIterations?: number;
  epicName?: string;
}

interface EpicState {
  specs?: Array<{ name: string; status?: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

interface BlockDecision {
  decision: "block";
  reason: string;
  systemMessage: string;
}

const SETTINGS_REL_PATH = ".claude/curdx-flow.local.md";

// Line-bounded ALL_TASKS_COMPLETE detection. Matches v6 `grep -E`:
//   '(^|\W)ALL_TASKS_COMPLETE(\W|$)'
// `\W` is JS [^A-Za-z0-9_] which equals POSIX `[^[:alnum:]_]` for ASCII —
// same effective semantics on transcript text (which is ASCII-dominant).
const ALL_TASKS_COMPLETE_RE = /(^|\W)ALL_TASKS_COMPLETE(\W|$)/;

/**
 * Re-attach a `./` prefix that `posix.join` strips from serialized spec paths.
 *
 * `path-resolver.resolveCurrent()` returns `posix.join("./specs", "name")`
 * which yields `"specs/name"` (the v6 shell pipeline kept `"./specs/name"`
 * because it built paths via plain string concat). v6 embeds `$SPEC_PATH`
 * directly into the continuation prompt, so to preserve byte-equal-ish parity
 * with the v6 baseline we re-attach the `./` whenever a configured specs-dir
 * starts with `./` and the resolved path matches its body.
 *
 * Same helper pattern as `preserveDotPrefix` in update-spec-index.ts (1.14).
 * Kept local rather than DRY-extracted because the shared module would have
 * to grow a single-use export — the shell-replacement audit is per-hook.
 */
function preserveDotPrefix(specPath: string, specsDirs: string[]): string {
  for (const dir of specsDirs) {
    if (!dir.startsWith("./")) continue;
    const body = dir.slice(2);
    if (body && specPath.startsWith(`${body}/`)) return `./${specPath}`;
    if (body && specPath === body) return `./${specPath}`;
  }
  return specPath;
}

/**
 * Mirror of the v6 shell `// true` default-coalesce on a boolean field.
 *
 * The v6 default-coalesce operator treats BOTH `null` and `false` as
 * default-triggers, so `.x // true` on a value of `false` evaluates to `true`.
 * v6 stop-watcher uses this on `nativeSyncEnabled` for the continuation
 * prompt; preserve the byte-equal output here by returning `true` unless the
 * input is some non-boolean, non-null value JSON would render distinctly. In
 * practice the state schema constrains this field to bool/missing, so this
 * always returns `true`. We keep the helper small and explicit for
 * documentation.
 */
function defaultTrueIfFalsyOrNull(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (value === false) return true;
  if (value === true) return true;
  // Non-boolean, non-null/undefined value: the v6 shell would print it
  // verbatim. The continuation prompt then renders it as-is. We return true
  // for the boolean-typed slot in the prompt (the rendered output is governed
  // by the source-of-truth boolean here, not this helper).
  return true;
}

/** Strip CRLF/CR → LF and a leading UTF-8 BOM. Mirrors normalize() in markdown-task-parser. */
function normalizeText(input: string): string {
  if (!input) return "";
  let s = input;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/\r\n?/g, "\n");
}

/** Block-decision JSON emitter. v6 shell JSON-emit produces trailing-newline output. */
function emitBlock(decision: BlockDecision): void {
  process.stdout.write(JSON.stringify(decision) + "\n");
}

/**
 * YAML-frontmatter `enabled:` extractor — same algorithm as load-spec-context.ts
 * (kept inline rather than DRY-extracted to avoid inflating the shared module
 * surface for one line of awk replacement).
 */
function readEnabledSetting(settingsPath: string): string | null {
  let raw: string;
  try {
    raw = readFileSync(settingsPath, "utf8");
  } catch {
    return null;
  }
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*$/m);
  const block = fmMatch?.[1];
  if (!block) return null;
  const line = block.split(/\r?\n/).find((l) => /^enabled\s*:/.test(l));
  if (!line) return null;
  const value = line.replace(/^enabled\s*:\s*/, "");
  const cleaned = value.replace(/[\s"']/g, "").toLowerCase();
  return cleaned || null;
}

/**
 * Race-condition safeguard from v6 (L48-63): if the state file was modified
 * in the last 2 seconds, sleep 1s to let the coordinator finish writing.
 *
 * Stat-mtime unit conversion: fs.statSync().mtimeMs is ms; v6 used seconds.
 * We compare ms-vs-ms here (2000 ms threshold == v6's 2 s), so the conversion
 * is implicit but byte-equivalent.
 */
async function maybeWaitForRecentStateFile(stateFile: string): Promise<void> {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(stateFile).mtimeMs;
  } catch {
    return;
  }
  const ageMs = Date.now() - mtimeMs;
  if (ageMs < 2_000) {
    await new Promise((r) => setTimeout(r, 1_000));
  }
}

/**
 * Tail-by-line check for ALL_TASKS_COMPLETE marker.
 * Mirrors `tail -N "$TRANSCRIPT_PATH" | grep -qE '(^|\W)ALL_TASKS_COMPLETE(\W|$)'`.
 *
 * Strategy: read full file (transcripts are bounded — Claude Code rotates
 * them; checking the size before slurp would be a micro-opt), normalize line
 * endings, take the last N lines, regex-test each.
 */
function tailContainsCompletionMarker(
  transcriptPath: string,
  lineCount: number,
): boolean {
  let raw: string;
  try {
    raw = readFileSync(transcriptPath, "utf8");
  } catch {
    return false;
  }
  const lines = normalizeText(raw).split("\n");
  const slice = lines.slice(Math.max(0, lines.length - lineCount));
  for (const line of slice) {
    if (ALL_TASKS_COMPLETE_RE.test(line)) return true;
  }
  return false;
}

/**
 * Mark a spec as completed in its parent epic's state file.
 * Mirrors the v6 shell JSON mutation `.specs |= map(if .name == $spec then
 * .status = "completed" else . end)`.
 *
 * Atomic write via `_shared/atomic-write` (replaces v6 mktemp + mv).
 */
function markSpecCompletedInEpic(
  cwd: string,
  epicName: string,
  specName: string,
): void {
  const epicStateFile = join(
    cwd,
    "specs",
    "_epics",
    epicName,
    ".epic-state.json",
  );
  if (!existsSync(epicStateFile)) return;
  let epic: EpicState;
  try {
    epic = JSON.parse(readFileSync(epicStateFile, "utf8")) as EpicState;
  } catch {
    return;
  }
  if (!Array.isArray(epic.specs)) return;
  let mutated = false;
  for (const entry of epic.specs) {
    if (entry && entry.name === specName) {
      entry.status = "completed";
      mutated = true;
    }
  }
  if (!mutated) return;
  try {
    // v6 used 2-space pretty JSON via the shell tool's default (compact
    // false). That tool's default-ish output for piped objects is 2-space
    // indent; we keep that for byte-equivalent epic state diffs.
    writeFileAtomic(epicStateFile, JSON.stringify(epic, null, 2) + "\n");
    process.stderr.write(
      `[curdx-flow] Updated epic '${epicName}': spec '${specName}' marked completed\n`,
    );
  } catch {
    /* swallow — never block the session */
  }
}

/**
 * Spawn the bundled update-spec-index hook with --quiet, fire-and-forget.
 * Replaces v6 `"$SCRIPT_DIR/update-spec-index.sh" --quiet 2>/dev/null || true`.
 * The bundled `.mjs` lives next to this hook in the plugin scripts dir.
 */
function fireUpdateSpecIndex(): void {
  // Resolve our own bundled location at runtime. esbuild's banner injects
  // __filename for us; in dev (running .ts via tsx etc.) fall back to import.meta.url.
  let here: string;
  try {
    here = typeof __filename === "string" && __filename.length > 0
      ? __filename
      : fileURLToPath(import.meta.url);
  } catch {
    here = fileURLToPath(import.meta.url);
  }
  const scriptDir = dirname(here);
  const target = join(scriptDir, "update-spec-index.mjs");
  if (!existsSync(target)) return;
  try {
    const child = spawn(process.execPath, [target, "--quiet"], {
      stdio: ["ignore", "ignore", "ignore"],
      detached: true,
    });
    child.unref();
  } catch {
    /* swallow — best-effort */
  }
}

/**
 * Cleanup orphaned `.progress-task-*.md` files older than 60 minutes.
 * Mirrors v6 `find "$CWD/$SPEC_PATH" -name ".progress-task-*.md" -mmin +60 -delete`.
 *
 * Stat-mtime unit conversion: fs.statSync().mtimeMs is ms. v6's `find -mmin +60`
 * matches files where (now - mtime) > 60 min. We compute the same in ms.
 */
function cleanupStaleProgressFiles(specDirFs: string): void {
  let entries: string[];
  try {
    entries = readdirSync(specDirFs);
  } catch {
    return;
  }
  const now = Date.now();
  const sixtyMinMs = 60 * 60 * 1_000;
  for (const name of entries) {
    if (!name.startsWith(".progress-task-") || !name.endsWith(".md")) continue;
    const fp = join(specDirFs, name);
    let mtimeMs: number;
    try {
      mtimeMs = statSync(fp).mtimeMs;
    } catch {
      continue;
    }
    if (now - mtimeMs > sixtyMinMs) {
      try {
        unlinkSync(fp);
      } catch {
        /* swallow */
      }
    }
  }
}

/**
 * Count `^\s*- [ ]` lines in tasks.md.
 * Mirrors v6 `grep -c '^\s*- \[ \]' "$TASKS_FILE"`.
 */
function countUncheckedTasks(tasksFile: string): number {
  let raw: string;
  try {
    raw = readFileSync(tasksFile, "utf8");
  } catch {
    return 0;
  }
  const lines = normalizeText(raw).split("\n");
  let n = 0;
  for (const line of lines) {
    if (/^\s*- \[ \]/.test(line)) n++;
  }
  return n;
}

/**
 * Parallel-group task scanner — mirrors v6 awk at L278-289 line-for-line.
 *
 * Awk recipe:
 *   /^- \[[ x]\]/ {
 *     if (count >= idx) {
 *       if (/\[P\]/ && pcount < max_group) { found=1; pcount++; block=block $0 "\n"; next }
 *       else if (found) { exit }
 *     }
 *     count++
 *   }
 *   found && /^  / { block=block $0 "\n"; next }
 *   found && /^$/ { block=block $0 "\n"; next }
 *   found && !/^  / && !/^$/ { exit }
 *   END { printf "%s", block }
 *
 * NOTE the count semantics differ from extractTaskBlock's frozen-counter:
 * here `count++` runs on every task line UNCONDITIONALLY (it's outside the
 * inner if-else), so count advances normally. Each task line at or past idx
 * is checked for `[P]`; the first non-[P] task after a [P] hit closes the
 * block.
 *
 * Returns the accumulated block (possibly multi-task). Trailing newline is
 * NOT stripped here because the awk uses `printf "%s", block` and each
 * appended line carries its own `\n`; the final block ends with `\n` which
 * v6 then assigns to TASK_BLOCK without further trimming.
 */
function extractParallelGroupBlock(
  markdown: string,
  taskIndex: number,
  maxGroup = 5,
): string {
  if (!markdown) return "";
  if (!Number.isFinite(taskIndex) || taskIndex < 0) return "";
  const lines = normalizeText(markdown).split("\n");
  let count = 0;
  let pcount = 0;
  let found = false;
  let block = "";
  for (const line of lines) {
    if (/^- \[[ x]\]/.test(line)) {
      if (count >= taskIndex) {
        if (/\[P\]/.test(line) && pcount < maxGroup) {
          found = true;
          pcount++;
          block += line + "\n";
          count++;
          continue;
        } else if (found) {
          break;
        }
      }
      count++;
      continue;
    }
    if (!found) continue;
    if (/^  /.test(line)) {
      block += line + "\n";
      continue;
    }
    if (/^\s*$/.test(line)) {
      block += line + "\n";
      continue;
    }
    // non-indented, non-blank, non-task → exit
    break;
  }
  // Bash command-substitution strips trailing newlines from `$(...)`. v6 uses
  // `PARALLEL_TASKS=$(awk ...)` so the value loses its trailing `\n`. Mirror
  // that here for byte-equal continuation prompts.
  return block.replace(/\n+$/, "");
}

/** Build the corrupt-state recovery block decision (L121-138). */
function buildCorruptStateBlock(specPath: string): BlockDecision {
  const reason =
    `ERROR: Corrupt state file at ${specPath}/.curdx-state.json\n\n` +
    `Recovery options:\n` +
    `1. Reset state: /curdx-flow:implement (reinitializes from tasks.md)\n` +
    `2. Cancel spec: /curdx-flow:cancel`;
  return {
    decision: "block",
    reason,
    systemMessage: "curdx-flow: corrupt state file",
  };
}

/** Build the quick-mode "do not stop" block decision (L167-183). */
function buildQuickModeBlock(phase: string, specName: string): BlockDecision {
  const reason =
    `Quick mode active — do NOT stop. Continue spec phase: ${phase} for ${specName}.\n\n` +
    `You are running in quick mode. Do NOT stop, do NOT ask the user questions.\n` +
    `Continue generating artifacts for the current phase (${phase}) and proceed to the next phase.\n` +
    `Make strong, opinionated decisions autonomously.`;
  return {
    decision: "block",
    reason,
    systemMessage: `curdx-flow quick mode: continue ${phase} phase`,
  };
}

/** Build the unchecked-tasks block decision (L198-216). */
function buildUncheckedTasksBlock(
  specPath: string,
  taskIndex: number,
  totalTasks: number,
  unchecked: number,
): BlockDecision {
  const reason =
    `Tasks incomplete: state index (${taskIndex}) reached total (${totalTasks}), ` +
    `but tasks.md has ${unchecked} unchecked items.\n\n` +
    `## Action Required\n` +
    `1. Read ${specPath}/tasks.md and find unchecked tasks (- [ ])\n` +
    `2. Execute remaining unchecked tasks via spec-executor\n` +
    `3. Update .curdx-state.json totalTasks to match actual count\n` +
    `4. Only output ALL_TASKS_COMPLETE when every task in tasks.md is checked off\n` +
    `5. Do NOT add new tasks — complete existing ones only`;
  return {
    decision: "block",
    reason,
    systemMessage: `curdx-flow: ${unchecked} unchecked tasks remain in tasks.md`,
  };
}

/** Build the continuation block decision (L314-352). */
function buildContinuationBlock(args: {
  specName: string;
  specPath: string;
  taskIndex: number;
  totalTasks: number;
  taskIteration: number;
  maxTaskIter: number;
  globalIteration: number;
  recoveryMode: boolean;
  nativeSync: boolean;
  taskBlock: string;
  isParallel: boolean;
}): BlockDecision {
  const taskHeader = args.isParallel
    ? "## Current Task Group (PARALLEL)"
    : "## Current Task";
  // v6 PARALLEL_INSTRUCTIONS literal (L307-308): starts with `\n` so that when
  // it's substituted into the heredoc (L322 `$PARALLEL_INSTRUCTIONS`), a blank
  // line precedes the `PARALLEL: ...` text. For non-parallel mode the variable
  // is empty, leaving the heredoc's two adjacent newlines visible (one from
  // the empty-var line, one from the explicit blank above `## Resume`).
  const parallelInstructions = args.isParallel
    ? `\nPARALLEL: These are [P] tasks -- dispatch ALL in ONE message via Task tool. Each gets progressFile: .progress-task-$INDEX.md. After all complete: merge progress, advance taskIndex past group.`
    : "";

  // The heredoc layout (v6 L314-337) interpolates variables literally on their
  // own lines. Reproduce by joining each substituted segment with `\n`.
  const reason =
    `Continue spec: ${args.specName} (Task ${args.taskIndex + 1}/${args.totalTasks}, Iter ${args.globalIteration})\n` +
    `\n` +
    `## State\n` +
    `Path: ${args.specPath} | Index: ${args.taskIndex} | Iteration: ${args.taskIteration}/${args.maxTaskIter} | Recovery: ${args.recoveryMode} | NativeSync: ${args.nativeSync}\n` +
    `\n` +
    `${taskHeader}\n` +
    `${args.taskBlock}\n` +
    `${parallelInstructions}\n` +
    `\n` +
    `## Resume\n` +
    `1. Read ${args.specPath}/.curdx-state.json for current state\n` +
    `2. Native sync (if NativeSync != false): (a) if nativeTaskMap is empty, rebuild from tasks.md (TaskCreate all, store IDs in state), (b) TaskUpdate current task to in_progress with activeForm\n` +
    `3. Delegate the task above to spec-executor (or qa-engineer for [VERIFY])\n` +
    `4. On TASK_COMPLETE: verify, update state, advance. Then TaskUpdate task to completed (if NativeSync != false)\n` +
    `5. If taskIndex >= totalTasks: finalize all native tasks to completed (if NativeSync != false), read ${args.specPath}/tasks.md to verify all [x], delete state file, output ALL_TASKS_COMPLETE\n\n` +
    `## Critical\n` +
    `- Delegate via Task tool - do NOT implement yourself\n` +
    `- Verify all 3 layers before advancing (see verification-layers.md)\n` +
    `- Do NOT push after every commit - batch pushes per phase or every 5 commits (see coordinator-pattern.md § 'Git Push Strategy')\n` +
    `- On failure: increment taskIteration, retry or generate fix task if recoveryMode\n` +
    `- On TASK_MODIFICATION_REQUEST: validate, insert tasks, update state (see coordinator-pattern.md § 'Modification Request Handler')`;

  let systemMessage =
    `curdx-flow iteration ${args.globalIteration} | Task ${args.taskIndex + 1}/${args.totalTasks}`;
  if (args.isParallel) systemMessage += " (PARALLEL GROUP)";

  return { decision: "block", reason, systemMessage };
}

async function main(): Promise<void> {
  const input = await readStdinJson<HookInput>();
  const cwd = input?.cwd;
  if (!cwd) {
    process.exit(0);
  }

  // Honor enabled:false toggle.
  const settingsPath = join(cwd, SETTINGS_REL_PATH);
  if (existsSync(settingsPath)) {
    const enabled = readEnabledSetting(settingsPath);
    if (enabled === "false") {
      process.exit(0);
    }
  }

  // Resolve current spec. Re-attach `./` prefix that posix.join strips, so
  // the continuation prompt embeds a path byte-equal to the v6 bash baseline.
  const rawSpecPath = resolveCurrent({ cwd });
  if (!rawSpecPath) {
    process.exit(0);
  }
  const specPath = preserveDotPrefix(rawSpecPath, getSpecsDirs({ cwd }));
  const specName = basename(specPath);
  const stateFile = join(cwd, specPath, ".curdx-state.json");
  if (!existsSync(stateFile)) {
    process.exit(0);
  }

  // Race-condition safeguard.
  await maybeWaitForRecentStateFile(stateFile);

  // ALL_TASKS_COMPLETE detection (primary 500 lines + fallback 20 lines).
  const transcriptPath = input.transcript_path;
  if (transcriptPath && existsSync(transcriptPath)) {
    const handleCompletion = (variant: "primary" | "fallback") => {
      const label =
        variant === "primary"
          ? "[curdx-flow] ALL_TASKS_COMPLETE detected in transcript"
          : "[curdx-flow] ALL_TASKS_COMPLETE detected in transcript (tail-end)";
      process.stderr.write(label + "\n");
      // Read state for epicName (best-effort; if state is corrupt we still exit).
      let epicName: string | undefined;
      try {
        const st = JSON.parse(readFileSync(stateFile, "utf8")) as CurdxState;
        epicName = typeof st.epicName === "string" && st.epicName.length > 0
          ? st.epicName
          : undefined;
      } catch {
        epicName = undefined;
      }
      const currentEpicFile = join(cwd, "specs", ".current-epic");
      if (epicName && existsSync(currentEpicFile)) {
        markSpecCompletedInEpic(cwd, epicName, specName);
      }
      fireUpdateSpecIndex();
    };

    if (tailContainsCompletionMarker(transcriptPath, 500)) {
      handleCompletion("primary");
      process.exit(0);
    }
    if (tailContainsCompletionMarker(transcriptPath, 20)) {
      handleCompletion("fallback");
      process.exit(0);
    }
  }

  // Validate state file is parseable JSON.
  let state: CurdxState;
  try {
    state = JSON.parse(readFileSync(stateFile, "utf8")) as CurdxState;
  } catch {
    emitBlock(buildCorruptStateBlock(specPath));
    process.exit(0);
  }

  // Read state fields with v6 defaults.
  const phase = typeof state.phase === "string" ? state.phase : "unknown";
  const taskIndex =
    typeof state.taskIndex === "number" ? state.taskIndex : 0;
  const totalTasks =
    typeof state.totalTasks === "number" ? state.totalTasks : 0;
  const taskIteration =
    typeof state.taskIteration === "number" ? state.taskIteration : 1;
  const quickMode = state.quickMode === true;
  // nativeSyncEnabled: v6 used a shell coalesce `// true` on this field
  // which — because that operator treats both `null` AND `false` as
  // default-triggers — returns the string "true" whenever the field is
  // null/missing OR explicitly `false`. The only way to get "false" out of
  // that pipeline would be a non-boolean truthy-ish value in the field,
  // which the state schema disallows. Preserve byte-equal continuation
  // prompts by returning the v6 stringified result faithfully.
  const nativeSync = defaultTrueIfFalsyOrNull(state.nativeSyncEnabled);
  const globalIteration =
    typeof state.globalIteration === "number" ? state.globalIteration : 1;
  const maxGlobal =
    typeof state.maxGlobalIterations === "number"
      ? state.maxGlobalIterations
      : 100;

  // Global iteration limit.
  if (globalIteration >= maxGlobal) {
    process.stderr.write(
      `[curdx-flow] ERROR: Maximum global iterations (${maxGlobal}) reached. Review .progress.md for failure patterns.\n`,
    );
    process.stderr.write(
      `[curdx-flow] Recovery: fix issues manually, then run /curdx-flow:implement or /curdx-flow:cancel\n`,
    );
    process.exit(0);
  }

  // Quick-mode guard: block stop during ANY phase except execution.
  if (quickMode && phase !== "execution") {
    if (input.stop_hook_active === true) {
      process.stderr.write(
        `[curdx-flow] stop_hook_active=true in quick mode, allowing stop to prevent loop\n`,
      );
      process.exit(0);
    }
    emitBlock(buildQuickModeBlock(phase, specName));
    process.exit(0);
  }

  // Log current state during execution phase.
  if (phase === "execution") {
    process.stderr.write(
      `[curdx-flow] Session stopped during spec: ${specName} | Task: ${taskIndex + 1}/${totalTasks} | Attempt: ${taskIteration}\n`,
    );
  }

  // Execution completion verification.
  if (
    phase === "execution" &&
    taskIndex >= totalTasks &&
    totalTasks > 0
  ) {
    const tasksFile = join(cwd, specPath, "tasks.md");
    if (existsSync(tasksFile)) {
      const unchecked = countUncheckedTasks(tasksFile);
      if (unchecked > 0) {
        process.stderr.write(
          `[curdx-flow] State says complete but tasks.md has ${unchecked} unchecked items\n`,
        );
        emitBlock(
          buildUncheckedTasksBlock(specPath, taskIndex, totalTasks, unchecked),
        );
        process.exit(0);
      }
    }
    process.stderr.write(
      `[curdx-flow] All tasks verified complete for ${specName}\n`,
    );
    process.exit(0);
  }

  // Loop control: continuation prompt when more tasks remain.
  if (phase === "execution" && taskIndex < totalTasks) {
    if (state.awaitingApproval === true) {
      process.stderr.write(
        `[curdx-flow] awaitingApproval=true, allowing stop for user gate\n`,
      );
      process.exit(0);
    }

    const recoveryMode = state.recoveryMode === true;
    const maxTaskIter =
      typeof state.maxTaskIterations === "number"
        ? state.maxTaskIterations
        : 5;

    // Re-invocation safety guard.
    if (input.stop_hook_active === true) {
      process.stderr.write(
        `[curdx-flow] stop_hook_active=true, skipping continuation to prevent re-invocation loop\n`,
      );
      process.exit(0);
    }

    // Extract current task block via shared parser (replaces v6 awk + sed).
    const tasksFile = join(cwd, specPath, "tasks.md");
    let taskBlock = "";
    if (existsSync(tasksFile)) {
      let tasksMd = "";
      try {
        tasksMd = readFileSync(tasksFile, "utf8");
      } catch {
        tasksMd = "";
      }
      taskBlock = extractTaskBlock(tasksMd, taskIndex);
    }

    // Parallel-group detection: scan first line of taskBlock for `[P]` marker.
    const firstLine = taskBlock.split("\n", 1)[0] ?? "";
    let isParallel = /\[P\]/.test(firstLine);

    if (isParallel && existsSync(tasksFile)) {
      let tasksMd = "";
      try {
        tasksMd = readFileSync(tasksFile, "utf8");
      } catch {
        tasksMd = "";
      }
      const parallelTasks = extractParallelGroupBlock(tasksMd, taskIndex);
      if (parallelTasks.length > 0) {
        taskBlock = parallelTasks;
      } else {
        // No [P] tasks accumulated — fall back to single-task path.
        isParallel = false;
      }
    }

    emitBlock(
      buildContinuationBlock({
        specName,
        specPath,
        taskIndex,
        totalTasks,
        taskIteration,
        maxTaskIter,
        globalIteration,
        recoveryMode,
        nativeSync,
        taskBlock,
        isParallel,
      }),
    );
  }

  // Cleanup orphaned temp progress files (>60 min old).
  cleanupStaleProgressFiles(join(cwd, specPath));

  process.exit(0);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[stop-watcher] error: ${msg}\n`);
  // Never block the session — exit 0 even on unexpected errors.
  process.exit(0);
});
