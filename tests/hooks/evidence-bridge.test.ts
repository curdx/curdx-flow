import { describe, expect, it } from "vitest";

import {
  buildHookRequirement,
  deriveIds,
  hashCommand,
  toEvidenceBlock,
  toStateLedger,
} from "../../src/hooks/lib/evidence-bridge.ts";
import { validateContract } from "../../src/core/contracts/index.ts";
import { evaluateCompletionVerdict } from "../../src/core/verdict/index.ts";
import type { CurdxState, VerificationBlock } from "../../src/hooks/_shared/types.ts";

const TS = "2026-06-02T12:00:00.000Z";

function passingBlock(): VerificationBlock {
  return { command: "npm test", exitCode: 0, timestamp: TS, srcMtime: 1000, taskIndex: 0 };
}

const IDS = { runId: "curdx-demo", goalId: "goal-demo" };

describe("evidence-bridge mapping", () => {
  it("maps a passing block to a contract-valid EvidenceBlock", () => {
    const evidence = toEvidenceBlock("execution", passingBlock(), IDS);
    expect(validateContract("evidence", evidence).ok).toBe(true);
    expect(evidence.source).toBe("hook");
    expect(evidence.status).toBe("passed");
    expect(evidence.trustLevel).toBe("verified");
    expect(evidence.capabilityId).toBe("execution");
    expect((evidence.freshness as Record<string, unknown>).commandHash).toBe(hashCommand("npm test"));
    expect((evidence.freshness as Record<string, unknown>).expiresAt).toBeUndefined();
  });

  it("down-ranks a failed block to status:failed / trustLevel:degraded (still contract-valid)", () => {
    const evidence = toEvidenceBlock("execution", { ...passingBlock(), exitCode: 1 }, IDS);
    expect(validateContract("evidence", evidence).ok).toBe(true);
    expect(evidence.status).toBe("failed");
    expect(evidence.trustLevel).toBe("degraded");
  });

  it("builds a contract-valid verification StateLedger", () => {
    const ledger = toStateLedger("execution", IDS, "/tmp/ws", ["evidence-1"], TS);
    expect(validateContract("stateLedger", ledger).ok).toBe(true);
    expect(ledger.mode).toBe("verification");
    expect((ledger.policy as Record<string, unknown>).noFalseCompletion).toBe(true);
    expect(ledger.artifactIndexPath).toBe(".curdx/artifacts/index.jsonl");
  });

  it("derives the hook requirement with the SAME command hash as the evidence freshness", () => {
    const block = passingBlock();
    const evidence = toEvidenceBlock("execution", block, IDS);
    const requirement = buildHookRequirement("execution", block.command);
    expect(requirement.source).toBe("hook");
    expect(requirement.capabilityId).toBe("execution");
    expect(requirement.target?.commandHash).toBe(
      (evidence.freshness as Record<string, unknown>).commandHash,
    );
  });

  it("derives deterministic ids: prefers state ids, else slugs the spec dir", () => {
    const withIds = deriveIds({ runId: "R", goalId: "G" } as CurdxState, "/x/My Spec");
    expect(withIds).toEqual({ runId: "R", goalId: "G" });

    const derived = deriveIds({} as CurdxState, "/repo/specs/My Feature");
    expect(derived.runId).toBe("curdx-my-feature");
    expect(derived.goalId).toBe("goal-my-feature");
    expect(deriveIds({} as CurdxState, "/repo/specs/My Feature")).toEqual(derived);
  });

  it("requirement-match positive: bridge outputs yield a 'complete' verdict (guards the inferRequirements source:command trap)", () => {
    const block = passingBlock();
    const ids = deriveIds({} as CurdxState, "/repo/specs/demo");
    const evidence = toEvidenceBlock("execution", block, ids);
    const ledger = toStateLedger("execution", ids, "/repo", [evidence.id], block.timestamp);
    const result = evaluateCompletionVerdict({
      state: ledger,
      evidence: [evidence],
      requirements: [buildHookRequirement("execution", block.command)],
      taskType: "command",
      claimedComplete: true,
      now: block.timestamp,
    });
    expect(result.verdict.verdict).toBe("complete");
  });
});
