import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runHook } from "./_helpers.js";
import { createFixtureSpec, type FixtureSpec } from "./_fixture-setup.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

describe("quick-mode-guard (PreToolUse hook for AskUserQuestion)", () => {
  let quickActive: FixtureSpec;
  let quickInactive: FixtureSpec;

  beforeEach(() => {
    // quick-active fixture targets a spec with quickMode=true
    quickActive = createFixtureSpec({
      specName: "quick-spec",
      state: { phase: "design", quickMode: true, taskIndex: 0, totalTasks: 0 },
    });
    // quick-inactive fixture targets a spec with quickMode=false (default)
    quickInactive = createFixtureSpec();
  });

  afterEach(() => {
    quickActive.cleanup();
    quickInactive.cleanup();
  });

  it("happy: quick mode active → exit 0, deny payload (hookSpecificOutput + systemMessage, byte-equal to v6)", () => {
    const r = runHook(
      "quick-mode-guard",
      "tests/hooks/fixtures/quick-mode-guard/quick-active.json",
      { cwd: quickActive.cwd },
    );
    expect(r.exitCode).toBe(0);
    expect(r.json).toBeDefined();
    // No top-level `decision` field — Claude Code's PreToolUse schema
    // rejects `decision:"deny"` (only `"approve"|"block"` are valid).
    expect((r.json as any).decision).toBeUndefined();
    expect((r.json as any).hookSpecificOutput).toMatchObject({
      permissionDecision: "deny",
    });
    expect((r.json as any).systemMessage).toMatch(/quick mode/i);
  });

  it("edge: spec exists but quick mode is OFF → exit 0, empty stdout (allow = no output)", () => {
    const r = runHook(
      "quick-mode-guard",
      "tests/hooks/fixtures/quick-mode-guard/quick-inactive.json",
      { cwd: quickInactive.cwd },
    );
    expect(r.exitCode).toBe(0);
    // Allow path emits NOTHING (matches v6 bash `exit 0` with no stdout).
    expect(r.stdout).toBe("");
    expect(r.json).toBeUndefined();
  });

  it("error: malformed stdin JSON → exit 0 (FR-8 never block) + stderr error message", () => {
    const r = runHook(
      "quick-mode-guard",
      "tests/hooks/fixtures/quick-mode-guard/error-malformed.json",
    );
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain("invalid stdin JSON");
  });
});

// QuickMode bypass contract for two-stage review (spec-two-stage-review D5,
// FR-M1 + FR-M2). The coordinator branch lives in commands/{design,tasks}.md
// (not in hook code) — these tests are fixture-shaped: they read the command
// markdown and assert both phases encode the asymmetric gate:
//   (a) state.quickMode === true + codeQuality.verdict FAIL  → advisory:true,
//       coordinator continues (downgrade, do NOT block).
//   (b) state.quickMode === true + specCompliance.verdict FAIL → coordinator
//       BLOCKS (specCompliance is hard-gate even in QuickMode).
// Drift in either branch silently breaks the contract — markdown linting
// alone won't catch a wrong-axis downgrade.
describe("QuickMode bypass contract — two-stage review D5 (FR-M1, FR-M2)", () => {
  const designMd = readFileSync(
    path.join(
      REPO_ROOT,
      "plugins",
      "curdx-flow",
      "commands",
      "design.md",
    ),
    "utf8",
  );
  const tasksMd = readFileSync(
    path.join(
      REPO_ROOT,
      "plugins",
      "curdx-flow",
      "commands",
      "tasks.md",
    ),
    "utf8",
  );
  const phaseFiles: Array<[string, string]> = [
    ["design.md", designMd],
    ["tasks.md", tasksMd],
  ];

  it.each(phaseFiles)(
    "%s: QuickMode + codeQuality FAIL → advisory:true downgrade, coordinator continues (FR-M1)",
    (_name, body) => {
      // Branch reads state.quickMode
      expect(body).toMatch(/state\.quickMode/);
      // codeQuality FAIL path sets advisory:true via merge-state under
      // verificationBlocks.<phase>.reviews.codeQuality
      expect(body).toMatch(
        /codeQuality(?:\.verdict)?[\s\S]{0,200}advisory\s*[:=]\s*true/i,
      );
      // Coordinator continues (proceed / continue / advance keyword nearby)
      expect(body).toMatch(
        /codeQuality[\s\S]{0,400}(?:proceed|continue|advance)/i,
      );
    },
  );

  it.each(phaseFiles)(
    "%s: QuickMode + specCompliance FAIL → BLOCK (hard gate, FR-M2 reverse contract)",
    (_name, body) => {
      // specCompliance FAIL path explicitly blocks even in QuickMode.
      // Match the design.md pseudocode shape: `if specCompliance.verdict ===
      // "FAIL":` followed by a `block` / `do NOT advance` directive.
      expect(body).toMatch(/specCompliance\.verdict[\s\S]{0,200}block/i);
      // Extract the specCompliance branch body — from the `if
      // specCompliance.verdict === "FAIL":` line up to (but not including)
      // the NEXT `if` line. This isolates the specCompliance-only handler
      // and asserts no `advisory:true` setter lives inside it. (The
      // codeQuality branch that follows IS allowed to set advisory:true —
      // we want to fail only if the specCompliance branch downgraded.)
      const branchMatch = body.match(
        /if\s+specCompliance\.verdict[^\n]*\n([\s\S]*?)(?=\n\s*if\s|\n\s*else)/,
      );
      expect(branchMatch).not.toBeNull();
      const branchBody = branchMatch![1];
      // The specCompliance handler must NOT contain an `advisory:true`
      // assignment / merge-state setter.
      expect(branchBody).not.toMatch(
        /\badvisory\s*[:=]\s*true\b/i,
      );
      // And it MUST contain a block directive.
      expect(branchBody).toMatch(/\bblock\b/i);
    },
  );

  it.each(phaseFiles)(
    "%s: anti-rationalization — only codeQuality.advisory is set, never specCompliance.advisory",
    (_name, body) => {
      // FR-M2 reverse test: every `advisory:true` setter must live inside
      // the codeQuality FAIL handler, never inside a specCompliance branch.
      // Strategy: extract the codeQuality.verdict FAIL handler body (from
      // `if codeQuality.verdict ...:` line up to next `if`/`else`) and
      // confirm it contains the advisory:true setter; then scan the WHOLE
      // file for any `specCompliance.<X>.advisory` assignment path which
      // would be a contract violation.
      const cqBranch = body.match(
        /if\s+codeQuality\.verdict[^\n]*\n([\s\S]*?)(?=\n\s*if\s|\n\s*else)/,
      );
      expect(cqBranch).not.toBeNull();
      // codeQuality branch sets advisory:true via merge-state under
      // verificationBlocks.<phase>.reviews.codeQuality
      expect(cqBranch![1]).toMatch(/\badvisory\s*[:=]\s*true\b/i);
      expect(cqBranch![1]).toMatch(
        /reviews\.codeQuality\.advisory\s*=\s*true/i,
      );
      // Reverse contract: no `verificationBlocks.<phase>.reviews.specCompliance.advisory = true`
      // path exists anywhere in the file (would silently downgrade
      // specCompliance, defeating FR-M2).
      expect(body).not.toMatch(
        /reviews\.specCompliance\.advisory\s*=\s*true/i,
      );
    },
  );
});
