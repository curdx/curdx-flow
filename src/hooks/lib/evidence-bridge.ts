import { createHash } from "node:crypto";
import { basename } from "node:path";

import { appendEvidence } from "../../core/evidence/index.ts";
import { evaluateCompletionVerdict, type EvidenceRequirement } from "../../core/verdict/index.ts";
import { validateContract, type EvidenceBlock, type StateLedger } from "../../core/contracts/index.ts";
import type { CurdxState, VerificationBlock, VerificationPhase } from "../_shared/types.ts";
import type { VerifyPhaseBlockResult } from "./verify-blocks.ts";

export interface RunGoalIds {
  runId: string;
  goalId: string;
}

function slug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "run";
}

export function deriveIds(state: CurdxState, specDir: string): RunGoalIds {
  const base = slug(basename(specDir) || (typeof state.name === "string" ? state.name : "") || "run");
  const runId =
    typeof state.runId === "string" && state.runId.length > 0 ? state.runId : `curdx-${base}`;
  const goalId =
    typeof state.goalId === "string" && state.goalId.length > 0 ? state.goalId : `goal-${base}`;
  return { runId, goalId };
}

export function hashCommand(command: string): string {
  return createHash("sha256").update(command).digest("hex").slice(0, 16);
}

function timestampMs(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function toEvidenceBlock(
  phase: VerificationPhase,
  block: VerificationBlock,
  ids: RunGoalIds,
): EvidenceBlock {
  const passed = block.exitCode === 0;
  const command = typeof block.command === "string" ? block.command : "";
  return {
    schemaVersion: 1,
    id: `evidence-${ids.runId}-${phase}-${block.taskIndex ?? 0}-${timestampMs(block.timestamp)}`,
    runId: ids.runId,
    goalId: ids.goalId,
    source: "hook",
    capabilityId: phase,
    trustLevel: passed ? "verified" : "degraded",
    status: passed ? "passed" : "failed",
    summary: command.length > 0 ? command : `verify ${phase}`,
    artifacts: [],
    startedAt: block.timestamp,
    completedAt: block.timestamp,
    freshness: { validatedAt: block.timestamp, commandHash: hashCommand(command) },
    privacy: { classification: "local-only", containsSensitiveData: false, redacted: false },
    redactions: [],
  };
}

export function toStateLedger(
  phase: VerificationPhase,
  ids: RunGoalIds,
  workspaceRoot: string,
  evidenceIds: string[],
  at: string,
): StateLedger {
  return {
    schemaVersion: 1,
    runId: ids.runId,
    goalId: ids.goalId,
    workspaceRoot,
    mode: "verification",
    policy: { noFalseCompletion: true },
    scope: {},
    expectedJourney: {},
    status: "running",
    verdictStatus: "pending",
    phase,
    startedAt: at,
    updatedAt: at,
    evidenceIds,
    missingEvidence: [],
    artifactIndexPath: ".curdx/artifacts/index.jsonl",
    dirtyBaseline: { capturedAt: at, files: [] },
    generatedFiles: [],
    nextAction: {
      owner: "agent",
      summary: "Complete remaining verification before claiming completion.",
    },
  };
}

export function buildHookRequirement(
  phase: VerificationPhase,
  command: string,
): EvidenceRequirement {
  return {
    id: `required-hook-${phase}`,
    source: "hook",
    capabilityId: phase,
    description: `verified hook evidence for phase '${phase}'`,
    core: true,
    target: { commandHash: hashCommand(command) },
  };
}

export async function appendPhaseEvidenceBestEffort(
  evidence: EvidenceBlock,
  workspaceRoot: string,
): Promise<void> {
  try {
    await appendEvidence({ workspaceRoot, evidence });
  } catch {
    // Best-effort: a ledger-write failure must never affect the gate decision.
  }
}

export async function crossCheckPhase(
  base: VerifyPhaseBlockResult,
  state: CurdxState,
  phase: VerificationPhase,
  block: VerificationBlock,
  workspaceRoot: string,
  specDir: string,
): Promise<VerifyPhaseBlockResult> {
  try {
    const ids = deriveIds(state, specDir);
    const command = typeof block.command === "string" ? block.command : "";
    const evidence = toEvidenceBlock(phase, block, ids);
    const ledger = toStateLedger(phase, ids, workspaceRoot, [evidence.id], block.timestamp);
    if (!validateContract("evidence", evidence).ok) return base;
    if (!validateContract("stateLedger", ledger).ok) return base;

    await appendPhaseEvidenceBestEffort(evidence, workspaceRoot);

    const result = evaluateCompletionVerdict({
      state: ledger,
      evidence: [evidence],
      requirements: [buildHookRequirement(phase, command)],
      taskType: "command",
      claimedComplete: true,
      now: block.timestamp,
    });
    const verdict = result.verdict.verdict;
    if (verdict !== "complete" && verdict !== "release-ready") {
      return {
        ok: false,
        reason: `Completion cross-check ${verdict}: ${result.verdict.why}`,
        command: base.command ?? command,
      };
    }
    return base;
  } catch {
    return base;
  }
}
