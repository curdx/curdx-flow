import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

import type { VerificationPhase } from "../_shared/types.ts";

const VERIFICATION_PHASES: ReadonlyArray<VerificationPhase> = [
  "research",
  "requirements",
  "design",
  "tasks",
  "execution",
];

export interface VerificationCheckResult {
  ok: boolean;
  code: 0 | 2;
  message: string;
  skipped?: boolean;
  specDir?: string;
}

export interface RunVerificationCheckOptions {
  repoRoot?: string;
  env?: NodeJS.ProcessEnv;
}

export async function runVerificationCheck(
  opts: RunVerificationCheckOptions = {},
): Promise<VerificationCheckResult> {
  const repoRoot = opts.repoRoot ?? process.cwd();
  const env = opts.env ?? process.env;
  const specsDir = path.join(repoRoot, "specs");

  const specDir = resolveActiveSpecDir(specsDir);
  if (!specDir) {
    return {
      ok: true,
      code: 0,
      skipped: true,
      message: "check-verification-blocks: no active spec found, skipping.\n",
    };
  }

  if (env.CURDX_VERIFY_SKIP_BLOCKS === "1") {
    return {
      ok: true,
      code: 0,
      skipped: true,
      specDir,
      message:
        "[check-verification-blocks] CURDX_VERIFY_SKIP_BLOCKS=1 — skipping gate.\n",
    };
  }

  const stateFile = path.join(specDir, ".curdx-state.json");
  let state: unknown;
  try {
    state = JSON.parse(readFileSync(stateFile, "utf8"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: 2,
      specDir,
      message: `✗ failed to read ${path.relative(repoRoot, stateFile)}: ${msg}\n`,
    };
  }

  // Initial-state permissive branch: field entirely ABSENT → no-op exit 0.
  // Distinct from "field present but empty {}" which trips the gate.
  if (
    typeof state !== "object" ||
    state === null ||
    !("verificationBlocks" in state)
  ) {
    const rel = path.relative(repoRoot, specDir);
    return {
      ok: true,
      code: 0,
      skipped: true,
      specDir,
      message:
        `[check-verification-blocks] No verificationBlocks defined — skipping (treat as initial state)\n` +
        `  Active spec: ${rel}\n`,
    };
  }

  const blocks = (state as { verificationBlocks?: unknown })
    .verificationBlocks;
  const blocksObj =
    blocks && typeof blocks === "object" && !Array.isArray(blocks)
      ? (blocks as Record<string, unknown>)
      : null;
  const presentPhases = blocksObj
    ? Object.keys(blocksObj).filter(
        (p) => blocksObj[p] !== undefined && blocksObj[p] !== null,
      )
    : [];

  if (!blocksObj || presentPhases.length === 0) {
    const rel = path.relative(repoRoot, specDir);
    return {
      ok: false,
      code: 2,
      specDir,
      message:
        "✗ No verificationBlocks found. Run the appropriate phase verification command.\n" +
        `  Active spec: ${rel}\n` +
        "  Hint: each phase must record an entry in .curdx-state.json::verificationBlocks\n" +
        "        (see plugins/curdx-flow/references/iron-law-verification.md).\n",
    };
  }

  interface Failure {
    phase: string;
    reason: string;
    command: string;
  }
  const failures: Failure[] = [];

  for (const phase of presentPhases) {
    if (!(VERIFICATION_PHASES as ReadonlyArray<string>).includes(phase)) {
      failures.push({
        phase,
        reason: `unknown phase key "${phase}"`,
        command: "(remove from state)",
      });
      continue;
    }
    const raw = blocksObj[phase];
    if (typeof raw !== "object" || raw === null) {
      failures.push({
        phase,
        reason: "block is not an object",
        command: "(rewrite block)",
      });
      continue;
    }
    const block = raw as Record<string, unknown>;
    const command =
      typeof block.command === "string" ? block.command : "(unknown command)";
    const exitCode = block.exitCode;
    const timestamp = block.timestamp;
    const srcMtime = block.srcMtime;
    const failedReason = block.failedReason;

    if (exitCode !== 0) {
      failures.push({
        phase,
        reason:
          typeof failedReason === "string" && failedReason.length > 0
            ? `verification failed: ${failedReason} (exitCode=${String(exitCode)})`
            : `verification failed (exitCode=${String(exitCode)})`,
        command,
      });
      continue;
    }
    const ts = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
    if (Number.isNaN(ts)) {
      failures.push({
        phase,
        reason: `invalid timestamp "${String(timestamp)}"`,
        command,
      });
      continue;
    }
    if (
      typeof srcMtime !== "number" ||
      !Number.isFinite(srcMtime) ||
      srcMtime < 0
    ) {
      failures.push({
        phase,
        reason: `invalid srcMtime ${String(srcMtime)}`,
        command,
      });
      continue;
    }
    if (ts < srcMtime) {
      const srcIso = new Date(srcMtime).toISOString();
      failures.push({
        phase,
        reason: `stale evidence: src changed at ${srcIso}, last verified at ${String(timestamp)}`,
        command,
      });
    }
  }

  if (failures.length > 0) {
    const rel = path.relative(repoRoot, specDir);
    let message = "✗ verificationBlocks gate failed:\n";
    message += `  Active spec: ${rel}\n`;
    for (const f of failures) {
      message += `  - phase "${f.phase}": ${f.reason}\n`;
      message += `      Re-run: ${f.command}\n`;
    }
    message += "\n";
    message +=
      "See plugins/curdx-flow/references/iron-law-verification.md for the full checklist.\n";
    return { ok: false, code: 2, specDir, message };
  }

  const rel = path.relative(repoRoot, specDir);
  return {
    ok: true,
    code: 0,
    specDir,
    message:
      "All verificationBlocks valid.\n" +
      `  Active spec: ${rel}\n` +
      `  Phases verified: ${presentPhases.join(", ")}\n`,
  };
}

function resolveActiveSpecDir(specsDir: string): string | null {
  const pointer = path.join(specsDir, ".current-spec");
  if (existsSync(pointer)) {
    try {
      const name = readFileSync(pointer, "utf8").trim();
      if (name) {
        const dir = path.join(specsDir, name);
        if (existsSync(path.join(dir, ".curdx-state.json"))) return dir;
      }
    } catch {
      // fall through to the latest-mtime scan
    }
  }
  if (!existsSync(specsDir)) return null;
  let entries;
  try {
    entries = readdirSync(specsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  let latest: string | null = null;
  let latestMtime = 0;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".") || e.name.startsWith("_")) continue;
    const stateFile = path.join(specsDir, e.name, ".curdx-state.json");
    if (!existsSync(stateFile)) continue;
    try {
      const st = statSync(stateFile);
      if (st.mtimeMs > latestMtime) {
        latestMtime = st.mtimeMs;
        latest = path.join(specsDir, e.name);
      }
    } catch {
      continue;
    }
  }
  return latest;
}
