import { promises as fs } from "node:fs";
import { basename, join } from "node:path";

import type { CurdxState, VerificationPhase } from "../_shared/types.ts";
import { crossCheckPhase } from "./evidence-bridge.ts";

const WALK_SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  ".curdx",
  ".claude",
]);

const WALK_MAX_DEPTH = 6;

export const VERIFICATION_PHASES: ReadonlyArray<VerificationPhase> = [
  "research",
  "requirements",
  "design",
  "tasks",
  "execution",
];

export function getVerificationPhase(
  state: CurdxState,
): VerificationPhase | null {
  const raw = typeof state.phase === "string" ? state.phase : "";
  if (!(VERIFICATION_PHASES as ReadonlyArray<string>).includes(raw)) {
    return null;
  }
  return raw as VerificationPhase;
}

export interface VerifyPhaseBlockResult {
  ok: boolean;
  reason?: string;
  command?: string;
}

export async function verifyPhaseBlock(
  state: CurdxState,
  phase: VerificationPhase,
  specDir: string,
): Promise<VerifyPhaseBlockResult> {
  const block = state.verificationBlocks?.[phase];
  if (block === undefined) {
    return { ok: false, reason: "missing", command: "" };
  }
  if (block.exitCode !== 0) {
    return {
      ok: false,
      reason: block.failedReason ?? "verification failed",
      command: block.command,
    };
  }
  if (block.srcMtime > Date.parse(block.timestamp)) {
    const srcIso = new Date(block.srcMtime).toISOString();
    const specName = basename(specDir);
    return {
      ok: false,
      reason: `Stale evidence for phase '${phase}': src changed at ${srcIso}, last verified at ${block.timestamp}. Re-run: ${block.command}. Spec: ${specName}.`,
      command: block.command,
    };
  }
  if (
    typeof state.lastSrcEditMs === "number" &&
    state.lastSrcEditMs > Date.parse(block.timestamp)
  ) {
    const editIso = new Date(state.lastSrcEditMs).toISOString();
    const specName = basename(specDir);
    return {
      ok: false,
      reason: `Stale evidence for phase '${phase}': src edited at ${editIso}, last verified at ${block.timestamp}. Re-run: ${block.command}. Spec: ${specName}.`,
      command: block.command,
    };
  }
  if (phase === "execution" && typeof block.taskIndex === "number") {
    const currentTaskIndex = typeof state.taskIndex === "number" ? state.taskIndex : 0;
    if (block.taskIndex !== currentTaskIndex) {
      const specName = basename(specDir);
      return {
        ok: false,
        reason: `Stale evidence for phase 'execution': block recorded against task index ${block.taskIndex}, current task index is ${currentTaskIndex}. Re-run: ${block.command}. Spec: ${specName}.`,
        command: block.command,
      };
    }
  }
  return { ok: true };
}

/**
 * Authoritative per-phase gate (verifyPhaseBlock) plus a same-or-stricter
 * completion cross-check: on a passing phase it appends the phase's real
 * command-execution evidence to the core evidence ledger and runs the core
 * completion verdict, which may only tighten an ok result to blocked, never
 * loosen it. Every added step is best-effort and fails open to the base
 * verifyPhaseBlock decision, so the evidence/verdict moat can never make the
 * gate looser or throw.
 */
export async function verifyPhaseBlockWithEvidence(
  state: CurdxState,
  phase: VerificationPhase,
  specDir: string,
  workspaceRoot?: string,
): Promise<VerifyPhaseBlockResult> {
  const base = await verifyPhaseBlock(state, phase, specDir);
  if (!base.ok) return base;
  const block = state.verificationBlocks?.[phase];
  if (block === undefined) return base;
  try {
    return await crossCheckPhase(base, state, phase, block, workspaceRoot ?? specDir, specDir);
  } catch {
    return base;
  }
}

export async function walkSrcTree(dir: string): Promise<number> {
  let maxMtime = 0;

  async function walk(current: string, depth: number): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = join(current, entry.name);
      if (entry.isDirectory()) {
        if (WALK_SKIP_DIRS.has(entry.name)) continue;
        if (depth >= WALK_MAX_DEPTH) continue;
        await walk(abs, depth + 1);
        continue;
      }
      try {
        const st = await fs.stat(abs);
        if (st.mtimeMs > maxMtime) maxMtime = st.mtimeMs;
      } catch {
        continue;
      }
    }
  }

  await walk(dir, 0);
  return maxMtime;
}
