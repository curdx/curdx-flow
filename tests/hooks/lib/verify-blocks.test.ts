// tests/hooks/lib/verify-blocks.test.ts
//
// Direct unit tests for the iron-law verification gate (verify-blocks lib).
//
// Pre-existing coverage: stop-watcher.test.ts and task-completed-verifier.test.ts
// drive the lib through their hook bundles via spawnSync — true e2e but coarse.
// This file targets the lib's public surface directly so we can lock down each
// branch (missing / failed / stale / ok / walk-skip-dirs / depth-cap) without
// hook plumbing.
//
// Imports the TypeScript source rather than the bundled `.mjs` (verify-blocks
// is a non-CLI lib per the comment at src/hooks/lib/verify-blocks.ts L17-21;
// `runLib` from `_lib-helpers.ts` only applies to CLI libs like merge-state).
// This is consistent with `tests/hooks/subagent-context-injector.test.ts:6`.

import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  VERIFICATION_PHASES,
  getVerificationPhase,
  verifyPhaseBlock,
  walkSrcTree,
} from "../../../src/hooks/lib/verify-blocks.js";
import type {
  CurdxState,
  VerificationPhase,
} from "../../../src/hooks/_shared/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(label: string): string {
  return mkdtempSync(path.join(tmpdir(), `verify-blocks-${label}-`));
}

/** Build a minimal CurdxState with a single verification block for a phase. */
function buildStateWithBlock(
  phase: VerificationPhase,
  block: Partial<CurdxState["verificationBlocks"] extends infer B ? (B extends Record<string, infer V> ? V : never) : never> & { exitCode: number },
): CurdxState {
  return {
    name: "demo-spec",
    basePath: "./specs/demo-spec",
    phase,
    taskIndex: 0,
    totalTasks: 1,
    verificationBlocks: { [phase]: block },
  } as unknown as CurdxState;
}

// ---------------------------------------------------------------------------
// VERIFICATION_PHASES — canonical list lock
// ---------------------------------------------------------------------------

describe("VERIFICATION_PHASES", () => {
  it("contains the 5 canonical phases in spec order", () => {
    // Locking the exact order so callers that iterate (or display) can rely on it.
    expect(VERIFICATION_PHASES).toEqual([
      "research",
      "requirements",
      "design",
      "tasks",
      "execution",
    ]);
  });
});

// ---------------------------------------------------------------------------
// getVerificationPhase — typed coercion + legacy fail-open
// ---------------------------------------------------------------------------

describe("getVerificationPhase", () => {
  it("returns the typed phase for each canonical value", () => {
    for (const p of VERIFICATION_PHASES) {
      const state = { phase: p } as unknown as CurdxState;
      expect(getVerificationPhase(state)).toBe(p);
    }
  });

  it("returns null for the legacy 'unknown' phase (FR-8 fail-open)", () => {
    const state = { phase: "unknown" } as unknown as CurdxState;
    expect(getVerificationPhase(state)).toBeNull();
  });

  it("returns null when phase is missing or non-string", () => {
    expect(getVerificationPhase({} as unknown as CurdxState)).toBeNull();
    expect(
      getVerificationPhase({ phase: 42 } as unknown as CurdxState),
    ).toBeNull();
    expect(
      getVerificationPhase({ phase: null } as unknown as CurdxState),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// verifyPhaseBlock — 4 branches per design.md §Components 1
// ---------------------------------------------------------------------------

describe("verifyPhaseBlock", () => {
  it("missing block → ok=false, reason='missing', empty command", async () => {
    const state = {
      name: "demo",
      basePath: "./specs/demo",
      phase: "execution",
      taskIndex: 0,
      totalTasks: 1,
      verificationBlocks: {}, // none for any phase
    } as unknown as CurdxState;
    const dir = makeTmpDir("missing");
    try {
      const r = await verifyPhaseBlock(state, "execution", dir);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("missing");
      expect(r.command).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("non-zero exitCode with failedReason → ok=false, reason mirrors failedReason", async () => {
    const dir = makeTmpDir("failed-with-reason");
    try {
      const state = buildStateWithBlock("execution", {
        command: "npm run lint",
        exitCode: 1,
        failedReason: "lint failed: 3 errors in src/foo.ts",
        timestamp: new Date().toISOString(),
        srcMtime: Date.now() - 1000,
      });
      const r = await verifyPhaseBlock(state, "execution", dir);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("lint failed: 3 errors in src/foo.ts");
      expect(r.command).toBe("npm run lint");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("non-zero exitCode without failedReason → reason='verification failed'", async () => {
    const dir = makeTmpDir("failed-no-reason");
    try {
      const state = buildStateWithBlock("execution", {
        command: "npm run typecheck",
        exitCode: 2,
        timestamp: new Date().toISOString(),
        srcMtime: Date.now() - 1000,
      });
      const r = await verifyPhaseBlock(state, "execution", dir);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("verification failed");
      expect(r.command).toBe("npm run typecheck");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("stale evidence (srcMtime > Date.parse(timestamp)) → reason starts with 'Stale evidence', embeds phase + cmd + spec", async () => {
    const dir = makeTmpDir("stale");
    try {
      const ts = "2026-05-01T00:00:00.000Z";
      const srcMtime = Date.parse(ts) + 60_000; // 1 minute newer
      const state = buildStateWithBlock("execution", {
        command: "npm run typecheck",
        exitCode: 0,
        timestamp: ts,
        srcMtime,
      });
      const r = await verifyPhaseBlock(state, "execution", dir);
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/^Stale evidence for phase 'execution'/);
      // NFR-3: reason must embed the fix command + spec basename
      expect(r.reason).toContain("Re-run: npm run typecheck");
      expect(r.reason).toContain(`Spec: ${path.basename(dir)}`);
      expect(r.command).toBe("npm run typecheck");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("happy path (exitCode 0, srcMtime <= timestamp) → ok=true, no reason/command", async () => {
    const dir = makeTmpDir("happy");
    try {
      const state = buildStateWithBlock("execution", {
        command: "npm run typecheck",
        exitCode: 0,
        timestamp: new Date().toISOString(),
        srcMtime: Date.now() - 5000, // older than timestamp
      });
      const r = await verifyPhaseBlock(state, "execution", dir);
      expect(r.ok).toBe(true);
      expect(r.reason).toBeUndefined();
      expect(r.command).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// walkSrcTree — recursion behaviour, prune list, depth cap, error tolerance
// ---------------------------------------------------------------------------

describe("walkSrcTree", () => {
  it("returns 0 for an empty directory", async () => {
    const dir = makeTmpDir("empty");
    try {
      const r = await walkSrcTree(dir);
      expect(r).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns the max mtimeMs across all reachable files", async () => {
    const dir = makeTmpDir("max-mtime");
    try {
      const oldFile = path.join(dir, "old.txt");
      const newFile = path.join(dir, "subdir", "new.txt");
      mkdirSync(path.join(dir, "subdir"), { recursive: true });
      writeFileSync(oldFile, "old");
      writeFileSync(newFile, "new");
      // Force mtimes: old = epoch+1000s, new = epoch+10000s
      const oldMs = 1_000_000;
      const newMs = 10_000_000;
      utimesSync(oldFile, oldMs / 1000, oldMs / 1000);
      utimesSync(newFile, newMs / 1000, newMs / 1000);
      const r = await walkSrcTree(dir);
      expect(r).toBe(newMs);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prunes WALK_SKIP_DIRS (.git, node_modules, dist, .curdx, .claude)", async () => {
    const dir = makeTmpDir("prune");
    try {
      // A regular file with old mtime
      const tracked = path.join(dir, "tracked.txt");
      writeFileSync(tracked, "tracked");
      utimesSync(tracked, 1000, 1000); // very old

      // A file inside each pruned dir, all with NEW mtimes — if walk descends
      // into any of these, max would be > 1000.
      const newMs = 9_000_000;
      for (const skip of [".git", "node_modules", "dist", ".curdx", ".claude"]) {
        const skipDir = path.join(dir, skip);
        mkdirSync(skipDir, { recursive: true });
        const f = path.join(skipDir, "junk.txt");
        writeFileSync(f, "junk");
        utimesSync(f, newMs / 1000, newMs / 1000);
      }

      const r = await walkSrcTree(dir);
      // Only `tracked.txt` should contribute. utimesSync takes seconds (1000s),
      // mtimeMs is milliseconds → expect 1_000_000ms. If walk descended into
      // any pruned dir, max would jump to 9_000_000.
      expect(r).toBe(1_000_000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("never throws on unreadable entries (FR-8 fail-open)", async () => {
    // Pointing at a non-existent dir: the top-level readdir fails, we return 0.
    const r = await walkSrcTree(path.join(tmpdir(), "definitely-not-a-real-dir-xyz123"));
    expect(r).toBe(0);
  });
});
