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
import { getVerificationPhase, verifyPhaseBlockWithEvidence } from "./lib/verify-blocks.js";
import type { BlockDecisionOutput } from "./_shared/types.js";
import type { CurdxState } from "./_shared/types.js";

interface EpicState {
  specs?: Array<{ name: string; status?: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

type BlockDecision = BlockDecisionOutput;

const SETTINGS_REL_PATH = ".claude/curdx-flow.local.md";

const ALL_TASKS_COMPLETE_RE = /(^|\W)ALL_TASKS_COMPLETE(\W|$)/;

function preserveDotPrefix(specPath: string, specsDirs: string[]): string {
  for (const dir of specsDirs) {
    if (!dir.startsWith("./")) continue;
    const body = dir.slice(2);
    if (body && specPath.startsWith(`${body}/`)) return `./${specPath}`;
    if (body && specPath === body) return `./${specPath}`;
  }
  return specPath;
}

function normalizeText(input: string): string {
  if (!input) return "";
  let s = input;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/\r\n?/g, "\n");
}

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
    writeFileAtomic(epicStateFile, JSON.stringify(epic, null, 2) + "\n");
    process.stderr.write(
      `[curdx-flow] Updated epic '${epicName}': spec '${specName}' marked completed\n`,
    );
  } catch {}
}

function fireUpdateSpecIndex(): void {
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
  } catch {}
}

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
      } catch {}
    }
  }
}

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
  if (input?.stop_hook_active === true) {
    return;
  }

  const cwd = input?.cwd;
  if (!cwd) return;

  const settingsPath = join(cwd, SETTINGS_REL_PATH);
  if (existsSync(settingsPath)) {
    const enabled = readEnabledSetting(settingsPath);
    if (enabled === "false") return;
  }

  const rawSpecPath = resolveCurrent({ cwd, sessionId: input.session_id });
  if (!rawSpecPath) return;
  const specPath = preserveDotPrefix(rawSpecPath, getSpecsDirs({ cwd }));
  const specName = basename(specPath);
  const stateFile = join(cwd, specPath, ".curdx-state.json");
  if (!existsSync(stateFile)) return;

  await maybeWaitForRecentStateFile(stateFile);

  try {
    const capState = JSON.parse(readFileSync(stateFile, "utf8")) as CurdxState;
    if (capState.completed !== true) {
      const runawayBlock = buildCostRunawayBlock(capState, specName, stateFile);
      if (runawayBlock) return runawayBlock;
    }
  } catch {}

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

      if (parsedState?.completed === true) {
        return undefined;
      }

      const epicName =
        parsedState && typeof parsedState.epicName === "string" &&
          parsedState.epicName.length > 0
          ? parsedState.epicName
          : undefined;

      if (parsedState) {
        const knownPhase = getVerificationPhase(parsedState);
        if (knownPhase !== null) {
          let result;
          try {
            result = await verifyPhaseBlockWithEvidence(
              parsedState,
              knownPhase,
              join(cwd, specPath),
              cwd,
            );
          } catch {
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

  let state: CurdxState;
  try {
    state = JSON.parse(readFileSync(stateFile, "utf8")) as CurdxState;
  } catch {
    return buildCorruptStateBlock(specPath);
  }

  if (state.completed === true) {
    return;
  }

  const phase = typeof state.phase === "string" ? state.phase : "unknown";
  const taskIndex =
    typeof state.taskIndex === "number" ? state.taskIndex : 0;
  const totalTasks =
    typeof state.totalTasks === "number" ? state.totalTasks : 0;

  if (phase === "execution") {
    process.stderr.write(
      `[curdx-flow] Session stopped during spec: ${specName} | Task: ${taskIndex + 1}/${totalTasks}\n`,
    );
  }

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

  cleanupStaleProgressFiles(join(cwd, specPath));
});
