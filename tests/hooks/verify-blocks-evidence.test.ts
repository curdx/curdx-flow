import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  verifyPhaseBlock,
  verifyPhaseBlockWithEvidence,
} from "../../src/hooks/lib/verify-blocks.ts";
import type { CurdxState, VerificationBlock } from "../../src/hooks/_shared/types.ts";

const TS = "2026-06-02T12:00:00.000Z";

function stateWith(block: VerificationBlock | undefined, extra: Partial<CurdxState> = {}): CurdxState {
  return {
    phase: "execution",
    taskIndex: 0,
    runId: "curdx-test",
    goalId: "goal-test",
    ...(block ? { verificationBlocks: { execution: block } } : {}),
    ...extra,
  } as CurdxState;
}

const workspaces: string[] = [];
function makeWorkspace(): string {
  const ws = mkdtempSync(join(tmpdir(), "curdx-evidence-bridge-"));
  workspaces.push(ws);
  return ws;
}

afterEach(() => {
  while (workspaces.length > 0) {
    const ws = workspaces.pop();
    if (ws) rmSync(ws, { recursive: true, force: true });
  }
});

describe("verifyPhaseBlockWithEvidence regression guard (never looser than verifyPhaseBlock, no ledger write on not-ok)", () => {
  const notOkCases: Array<{ name: string; state: CurdxState }> = [
    { name: "missing block", state: stateWith(undefined) },
    {
      name: "non-zero exit",
      state: stateWith({ command: "npm test", exitCode: 1, timestamp: TS, srcMtime: 1, taskIndex: 0 }),
    },
    {
      name: "stale srcMtime",
      state: stateWith({ command: "npm test", exitCode: 0, timestamp: TS, srcMtime: Date.parse(TS) + 5000, taskIndex: 0 }),
    },
    {
      name: "stale lastSrcEditMs",
      state: stateWith(
        { command: "npm test", exitCode: 0, timestamp: TS, srcMtime: 1, taskIndex: 0 },
        { lastSrcEditMs: Date.parse(TS) + 5000 },
      ),
    },
    {
      name: "execution taskIndex mismatch",
      state: stateWith(
        { command: "npm test", exitCode: 0, timestamp: TS, srcMtime: 1, taskIndex: 0 },
        { taskIndex: 3 },
      ),
    },
  ];

  for (const { name, state } of notOkCases) {
    it(`returns the identical verifyPhaseBlock result and writes no ledger: ${name}`, async () => {
      const ws = makeWorkspace();
      const base = await verifyPhaseBlock(state, "execution", ws);
      const wrapped = await verifyPhaseBlockWithEvidence(state, "execution", ws, ws);
      expect(base.ok).toBe(false);
      expect(wrapped).toEqual(base);
      expect(existsSync(join(ws, ".curdx", "evidence"))).toBe(false);
    });
  }
});

describe("verifyPhaseBlockWithEvidence happy path + fail-open", () => {
  it("passes a clean phase, appends one valid evidence line, stays ok:true", async () => {
    const ws = makeWorkspace();
    const state = stateWith({ command: "npm test", exitCode: 0, timestamp: TS, srcMtime: 1, taskIndex: 0 });
    const result = await verifyPhaseBlockWithEvidence(state, "execution", ws, ws);
    expect(result.ok).toBe(true);

    const ledger = join(ws, ".curdx", "evidence", "curdx-test.jsonl");
    expect(existsSync(ledger)).toBe(true);
    const lines = readFileSync(ledger, "utf8").trim().split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(entry.source).toBe("hook");
    expect(entry.status).toBe("passed");
    expect(entry.runId).toBe("curdx-test");
  });

  it("fails open to ok:true when the synthesized evidence is contract-invalid (no spurious block, no throw)", async () => {
    const ws = makeWorkspace();
    // exitCode 0 + a non-date timestamp: verifyPhaseBlock still passes (NaN comparisons are false),
    // but toEvidenceBlock produces an invalid date-time -> validateContract fails -> crossCheck returns base.
    const state = stateWith({ command: "npm test", exitCode: 0, timestamp: "not-a-date", srcMtime: 1, taskIndex: 0 });
    const result = await verifyPhaseBlockWithEvidence(state, "execution", ws, ws);
    expect(result.ok).toBe(true);
    expect(existsSync(join(ws, ".curdx", "evidence"))).toBe(false);
  });
});
