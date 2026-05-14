/**
 * Stop hook — deterministic completion and safety gate for spec execution.
 *
 * Behaviour started as a v6 `stop-watcher.sh` port. The v8 execution driver is
 * native `/goal`; this hook no longer injects coordinator continuation prompts.
 * It only enforces deterministic gates that must hold at turn boundaries.
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
import { runHook } from "./_shared/run-hook.js";
import { getSpecsDirs, resolveCurrent } from "./_shared/path-resolver.js";
import { writeFileAtomic } from "./_shared/atomic-write.js";
import { getVerificationPhase, verifyPhaseBlock } from "./lib/verify-blocks.js";
import type { BlockDecisionOutput } from "./_shared/types.js";
import type { CurdxState } from "./_shared/types.js";

interface EpicState {
  specs?: Array<{ name: string; status?: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

type BlockDecision = BlockDecisionOutput;

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
 * because it built paths via plain string concat). Re-attach `./` whenever a
 * configured specs-dir starts with `./` and the resolved path matches its body
 * so hard-gate messages keep the same user-facing path shape.
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

/** Strip CRLF/CR → LF and a leading UTF-8 BOM. Mirrors normalize() in markdown-task-parser. */
function normalizeText(input: string): string {
  if (!input) return "";
  let s = input;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/\r\n?/g, "\n");
}

// Note: pre-2.2 there was a local `emitBlock(decision)` helper that wrote
// JSON to stdout. Post-2.2 the runHook wrapper owns serialization — handlers
// just `return decision` and runHook does `process.stdout.write(JSON.stringify(...) + "\n")`.

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
 * Build a Layer-1 iron-law gate block decision from a `verifyPhaseBlock`
 * result. Emitted when a phase is about to exit but the recorded
 * `verificationBlocks[phase]` is missing, failed, or stale.
 *
 * Message formats — canonical per design.md §Error Handling table (L352-356)
 * + NFR-3 actionability (Task 4.2): every fail message embeds **phase id,
 * fix command, and spec context** so the user can act without further
 * lookup.
 *
 *   - "missing": `Phase '<phase>' has no verification block. Run: <cmd>. Spec: <specName>. Then try again.`
 *   - stale (reason from verify-blocks already starts with `Phase '<phase>' stale evidence: ...`)
 *     pass-through verbatim — verify-blocks.ts owns the canonical stale
 *     wording and embeds all 3 NFR-3 fields itself.
 *   - any other reason → failed: `Phase '<phase>' verification failed: <reason>. Fix and re-run: <cmd>. Spec: <specName>.`
 *
 * The `<cmd>` placeholder for the missing case falls back to a phase-aware
 * `/curdx-flow:<phase>` hint when verify-blocks couldn't recover the original
 * command (it returns `command: ""` for the missing branch).
 *
 * `specName` is the human-recognizable identifier for the active spec (the
 * basename of `specDir`). Callers in this file already compute `specName`
 * via `basename(specPath)` so the threading is zero-cost.
 */
function buildVerificationBlockFailDecision(
  phase: string,
  result: { reason?: string; command?: string },
  specName: string,
): BlockDecision {
  const cmd =
    typeof result.command === "string" && result.command.length > 0
      ? result.command
      : `/curdx-flow:${phase} (re-run phase to record verification)`;
  let reason: string;
  let systemMessage: string;
  if (result.reason === "missing") {
    reason = `Phase '${phase}' has no verification block. Run: ${cmd}. Spec: ${specName}. Then try again.`;
    systemMessage = `curdx-flow: phase '${phase}' missing verification block (spec: ${specName})`;
  } else if (
    typeof result.reason === "string" &&
    result.reason.startsWith("Stale evidence")
  ) {
    // verify-blocks.ts already produces the canonical stale message
    // (`Stale evidence for phase '<phase>': src changed at <iso>, last
    // verified at <iso>. Re-run: <cmd>. Spec: <specName>.`) — all 3
    // NFR-3 fields are embedded at the source. Pass through verbatim;
    // re-formatting here would diverge from design L355.
    reason = result.reason;
    systemMessage = `curdx-flow: phase '${phase}' verification stale (spec: ${specName})`;
  } else {
    const detail = result.reason ?? "verification failed";
    reason = `Verification failed for phase '${phase}': ${detail}. Fix and re-run: ${cmd}. Spec: ${specName}.`;
    systemMessage = `curdx-flow: phase '${phase}' verification failed (spec: ${specName})`;
  }
  return {
    decision: "block",
    reason,
    systemMessage,
  };
}

/**
 * Build the malformed-verificationBlocks block decision per design L357.
 *
 * Emitted when reading or parsing `.curdx-state.json` for the iron-law gate
 * fails (JSON.parse error, or any thrown access on a malformed shape).
 * Distinct from `buildCorruptStateBlock` because this path is reached BEFORE
 * the general state validation in the non-completion code path — when an
 * `ALL_TASKS_COMPLETE` marker has been seen and we are about to allow the
 * loop to stop, malformed state must surface a verificationBlocks-specific
 * message that points the user at the iron-law reference doc.
 *
 * NFR-3 (Task 4.2): the malformed branch lacks a meaningful phase id (the
 * state itself is unparseable, so we cannot read `state.phase`), so the
 * `<phase>` slot collapses to a literal `'unknown'` placeholder. Fix
 * command and spec context still appear so the user can locate the file
 * and follow the recovery cookbook.
 */
function buildMalformedVerificationBlock(specName: string): BlockDecision {
  const reason =
    `Phase 'unknown' verificationBlocks malformed in .curdx-state.json. ` +
    `Fix: edit ${specName}/.curdx-state.json (or run /curdx-flow:cancel). ` +
    `Spec: ${specName}. ` +
    `See references/iron-law-verification.md.`;
  return {
    decision: "block",
    reason,
    systemMessage: `curdx-flow: verificationBlocks malformed (spec: ${specName})`,
  };
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

/**
 * Build the cost-runaway hard-block decision (spec-cost-runaway-guards D4).
 *
 * Replaces the v6/v7.1 soft `stderr` warn that allowed the loop to continue
 * burning tokens after caps were hit. Returns `null` when both caps are still
 * under their limit so the caller falls through to the existing gates.
 *
 * Message format mirrors `buildVerificationBlockFailDecision` (NFR-3):
 * phase + cap value + actionable 3-step remediation.
 */
function buildCostRunawayBlock(
  state: CurdxState,
  specName: string,
  stateFilePath: string,
): BlockDecision | null {
  const globalIter =
    typeof state.globalIteration === "number" ? state.globalIteration : 1;
  const maxGlobal =
    typeof state.maxGlobalIterations === "number"
      ? state.maxGlobalIterations
      : 100;
  const taskIter =
    typeof state.taskIteration === "number" ? state.taskIteration : 1;
  const maxTask =
    typeof state.maxTaskIterations === "number"
      ? state.maxTaskIterations
      : 5;

  if (globalIter >= maxGlobal) {
    const reason =
      `Cost runaway guard tripped: globalIteration=${globalIter} >= maxGlobalIterations=${maxGlobal}.\n` +
      `Loop blocked. Either:\n` +
      `- Investigate why your loop ran ${globalIter} iterations (check .progress.md)\n` +
      `- Override with: /curdx-flow:implement --max-global-iterations <higher-cap>\n` +
      `- Reset by editing ${stateFilePath}: set globalIteration to a lower value\n` +
      `\n` +
      `Spec: ${specName}  Phase: implement`;
    return {
      decision: "block",
      reason,
      systemMessage: `curdx-flow: cost runaway — globalIteration cap reached (${specName})`,
    };
  }
  if (taskIter >= maxTask) {
    const reason =
      `Cost runaway guard tripped: taskIteration=${taskIter} >= maxTaskIterations=${maxTask}.\n` +
      `Loop blocked. Either:\n` +
      `- Investigate why your loop ran ${taskIter} iterations (check .progress.md)\n` +
      `- Override with: /curdx-flow:implement --max-task-iterations <higher-cap>\n` +
      `- Reset by editing ${stateFilePath}: set taskIteration to a lower value\n` +
      `\n` +
      `Spec: ${specName}  Phase: implement`;
    return {
      decision: "block",
      reason,
      systemMessage: `curdx-flow: cost runaway — taskIteration cap reached (${specName})`,
    };
  }
  return null;
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

runHook(async (input) => {
  // D5: canonical early-exit guard — owned by spec A
  // (spec-verification-iron-law). Any stop-hook re-invocation must short-circuit
  // here BEFORE any other logic (settings read, state parse, transcript scan,
  // verificationBlocks read by future spec E). Behavior preserved: silent
  // return = allow stop (runHook serializes void as no-decision).
  if (input?.stop_hook_active === true) {
    return;
  }

  const cwd = input?.cwd;
  if (!cwd) return;

  // Honor enabled:false toggle.
  const settingsPath = join(cwd, SETTINGS_REL_PATH);
  if (existsSync(settingsPath)) {
    const enabled = readEnabledSetting(settingsPath);
    if (enabled === "false") return;
  }

  // Resolve current spec. Re-attach `./` prefix that posix.join strips so
  // user-facing gate messages preserve the configured specs-dir shape.
  const rawSpecPath = resolveCurrent({ cwd, sessionId: input.session_id });
  if (!rawSpecPath) return;
  const specPath = preserveDotPrefix(rawSpecPath, getSpecsDirs({ cwd }));
  const specName = basename(specPath);
  const stateFile = join(cwd, specPath, ".curdx-state.json");
  if (!existsSync(stateFile)) return;

  // Race-condition safeguard.
  await maybeWaitForRecentStateFile(stateFile);

  // Cost-runaway hard gate (spec-cost-runaway-guards C2/D4).
  // First hard gate after `stop_hook_active` early-exit: if either iteration
  // cap is hit, block immediately with an actionable D4 message instead of the
  // pre-7.2 soft stderr warn. Parse-failure here is intentionally swallowed —
  // the existing `buildCorruptStateBlock` path below handles malformed state.
  try {
    const capState = JSON.parse(readFileSync(stateFile, "utf8")) as CurdxState;
    if (capState.completed !== true) {
      const runawayBlock = buildCostRunawayBlock(capState, specName, stateFile);
      if (runawayBlock) return runawayBlock;
    }
  } catch {
    // fall through to existing corrupt-state handling
  }

  // ALL_TASKS_COMPLETE detection (primary 500 lines + fallback 20 lines).
  const transcriptPath = input.transcript_path;
  if (transcriptPath && existsSync(transcriptPath)) {
    const handleCompletion = async (
      variant: "primary" | "fallback",
    ): Promise<BlockDecision | undefined> => {
      const label =
        variant === "primary"
          ? "[curdx-flow] ALL_TASKS_COMPLETE detected in transcript"
          : "[curdx-flow] ALL_TASKS_COMPLETE detected in transcript (tail-end)";
      process.stderr.write(label + "\n");
      // Read state for epicName + Layer-1 iron-law gate. JSON.parse failure
      // here is treated as malformed verificationBlocks per design L357 —
      // emit the canonical malformed message rather than silently allowing
      // stop. Note: a separate `buildCorruptStateBlock` path still catches
      // generic state corruption on the non-completion code path below.
      let parsedState: CurdxState | undefined;
      let stateMalformed = false;
      try {
        parsedState = JSON.parse(readFileSync(stateFile, "utf8")) as CurdxState;
      } catch {
        parsedState = undefined;
        stateMalformed = true;
      }
      if (stateMalformed) {
        return buildMalformedVerificationBlock(specName);
      }

      // Spec already finalized (NFR-5a v7.1.0): the loop legitimately ended
      // in a prior turn and the state file is being retained for audit. Skip
      // the iron-law gate to avoid harassing the user about a phase whose
      // work is already done. Mirrors the in-progress-path check at L826
      // below; the two paths cannot share a single check because this
      // handleCompletion branch returns before reaching L826.
      if (parsedState?.completed === true) {
        return undefined;
      }

      const epicName =
        parsedState && typeof parsedState.epicName === "string" &&
          parsedState.epicName.length > 0
          ? parsedState.epicName
          : undefined;

      // Layer-1 iron-law gate (spec-verification-iron-law Tasks 1.6 / 2.2 / 2.3):
      // before allowing the loop to terminate on ALL_TASKS_COMPLETE, require
      // the active phase to have a recorded verification block that is
      // present, exitCode==0, and not stale. The three failure classes
      // (missing / failed / stale) map to canonical messages per design.md
      // §Error Handling (L352-356); a fourth class (malformed JSON) is
      // handled above. Skipped when phase isn't a known VerificationPhase
      // (e.g. legacy states with phase="unknown" — fail-open per FR-8).
      // Shared phase-detection lives in lib/verify-blocks.ts (Task 4.1 DRY).
      if (parsedState) {
        const knownPhase = getVerificationPhase(parsedState);
        if (knownPhase !== null) {
          let result;
          try {
            result = await verifyPhaseBlock(
              parsedState,
              knownPhase,
              join(cwd, specPath),
            );
          } catch {
            // Unexpected throw inside verify-blocks (e.g. malformed shape on
            // verificationBlocks access). Surface the malformed message.
            return buildMalformedVerificationBlock(specName);
          }
          if (!result.ok) {
            return buildVerificationBlockFailDecision(
              knownPhase,
              result,
              specName,
            );
          }
        }
      }

      const currentEpicFile = join(cwd, "specs", ".current-epic");
      if (epicName && existsSync(currentEpicFile)) {
        markSpecCompletedInEpic(cwd, epicName, specName);
      }
      fireUpdateSpecIndex();
      return undefined;
    };

    if (tailContainsCompletionMarker(transcriptPath, 500)) {
      const blocked = await handleCompletion("primary");
      if (blocked) return blocked;
      return;
    }
    if (tailContainsCompletionMarker(transcriptPath, 20)) {
      const blocked = await handleCompletion("fallback");
      if (blocked) return blocked;
      return;
    }
  }

  // Validate state file is parseable JSON.
  let state: CurdxState;
  try {
    state = JSON.parse(readFileSync(stateFile, "utf8")) as CurdxState;
  } catch {
    return buildCorruptStateBlock(specPath);
  }

  // Completion marker (v7.1.0): if the spec has been finalized, exit silently.
  // Strict equality on `completed === true` (NFR-2 backwards-compat: v7.0.x
  // states lack the field; treat undefined as in-progress).
  if (state.completed === true) {
    return;
  }

  // Read state fields with v6 defaults.
  const phase = typeof state.phase === "string" ? state.phase : "unknown";
  const taskIndex =
    typeof state.taskIndex === "number" ? state.taskIndex : 0;
  const totalTasks =
    typeof state.totalTasks === "number" ? state.totalTasks : 0;
  // Global iteration cap is now enforced upstream as a hard block via
  // `buildCostRunawayBlock` (spec-cost-runaway-guards C2). The soft stderr
  // warn that previously lived here was removed in v7.2 — see CHANGELOG.

  // Log current state during execution phase.
  if (phase === "execution") {
    process.stderr.write(
      `[curdx-flow] Session stopped during spec: ${specName} | Task: ${taskIndex + 1}/${totalTasks}\n`,
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
        return buildUncheckedTasksBlock(
          specPath,
          taskIndex,
          totalTasks,
          unchecked,
        );
      }
    }
    process.stderr.write(
      `[curdx-flow] All tasks verified complete for ${specName}\n`,
    );
    return;
  }

  // Native `/goal` is the execution driver. The Stop hook must not inject a
  // continuation prompt here; doing so creates a second autonomous loop that
  // conflicts with the session-scoped goal evaluator. Allow the stop after
  // cleanup unless one of the hard gates above blocked it.
  if (phase === "execution" && taskIndex < totalTasks) {
    if (state.awaitingApproval === true) {
      process.stderr.write(
        `[curdx-flow] awaitingApproval=true, allowing stop for user gate\n`,
      );
      return;
    }

    cleanupStaleProgressFiles(join(cwd, specPath));
    process.stderr.write(
      `[curdx-flow] execution remains in progress; native /goal or a later /curdx-flow:implement invocation should drive the next turn\n`,
    );
    return;
  }

  // Cleanup orphaned temp progress files (>60 min old).
  cleanupStaleProgressFiles(join(cwd, specPath));
});
