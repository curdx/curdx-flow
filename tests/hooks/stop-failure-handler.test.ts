import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Task 3.1 — StopFailure observability hook unit tests.
//
// The hook is invoked directly via `spawnSync` rather than through the shared
// `runHook` helper because:
//   - StopFailure stdin shape is `{matcher: string}` (NOT the
//     `{cwd, hookEvent, ...}` shape `runHook` knows how to rewrite);
//   - the hook ALWAYS exits 0 (fail-open per FR-H5 / NFR-5) and the load-bearing
//     contract is the stderr text (`[StopFailure:<matcher>]` tag plus exact
//     `stop-failure-handler: malformed stdin` literal) — `runHook` swallows
//     stderr into a generic `[hook] <msg>` envelope, which would break the
//     site-specific tag assertion.
//
// Five paths exercised, mapped to `src/hooks/stop-failure-handler.ts`:
//   (1) known matcher rate_limit         → stderr `[StopFailure:rate_limit]`
//   (2) known matcher max_output_tokens  → stderr `[StopFailure:max_output_tokens]`
//   (3) known matcher server_error       → stderr `[StopFailure:server_error]`
//   (4) missing matcher field            → stderr falls back to `unknown`
//   (5) malformed stdin (non-JSON)       → stderr `malformed stdin`, exit 0
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT_FOR_BUNDLE = path.resolve(__dirname, "../..");
const HOOK_BUNDLE = path.join(
  REPO_ROOT_FOR_BUNDLE,
  "plugins/curdx-flow/hooks/scripts/stop-failure-handler.mjs",
);
const PLUGIN_ROOT = path.join(REPO_ROOT_FOR_BUNDLE, "plugins/curdx-flow");

interface SpawnHookResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Spawn the bundled stop-failure-handler with a custom stdin payload.
 *
 * `cwd` defaults to `os.tmpdir()` for cross-platform safety (AC-7.5);
 * the hook does not read cwd-scoped state, so any writable dir works.
 */
function spawnHook(stdin: string): SpawnHookResult {
  const result = spawnSync("node", [HOOK_BUNDLE], {
    input: stdin,
    cwd: tmpdir(),
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    },
    encoding: "utf8",
    timeout: 5000,
  });
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/** Normalize CRLF → LF for cross-platform stderr assertions (Windows GH runners). */
function norm(s: string): string {
  return s.replace(/\r\n/g, "\n");
}

describe("stop-failure-handler (StopFailure hook)", () => {
  it("(1): known matcher rate_limit → stderr contains [StopFailure:rate_limit], exit 0", () => {
    const stdin = JSON.stringify({ matcher: "rate_limit" });
    const r = spawnHook(stdin);
    expect(r.exitCode).toBe(0);
    expect(norm(r.stderr)).toContain("[StopFailure:rate_limit]");
  });

  it("(2): known matcher max_output_tokens → stderr contains [StopFailure:max_output_tokens], exit 0", () => {
    const stdin = JSON.stringify({ matcher: "max_output_tokens" });
    const r = spawnHook(stdin);
    expect(r.exitCode).toBe(0);
    expect(norm(r.stderr)).toContain("[StopFailure:max_output_tokens]");
  });

  it("(3): known matcher server_error → stderr contains [StopFailure:server_error], exit 0", () => {
    const stdin = JSON.stringify({ matcher: "server_error" });
    const r = spawnHook(stdin);
    expect(r.exitCode).toBe(0);
    expect(norm(r.stderr)).toContain("[StopFailure:server_error]");
  });

  it("(4): missing matcher field → stderr falls back to unknown, exit 0", () => {
    // Payload is valid JSON but lacks `matcher`. Per src/hooks/stop-failure-handler.ts
    // the matcher resolution defaults to the literal string "unknown" (NOT the
    // raw-echo path — that path is only for non-string matcher values present
    // but not in MATCHER_DESCRIPTIONS). Either way, the StopFailure tag must
    // be emitted to stderr (FR-H3) so log scrapers can filter on the prefix.
    const stdin = JSON.stringify({ some_other_field: "value" });
    const r = spawnHook(stdin);
    expect(r.exitCode).toBe(0);
    expect(norm(r.stderr)).toContain("[StopFailure:unknown]");
  });

  it("(5): malformed stdin (non-JSON) → stderr contains 'malformed stdin', exit 0", () => {
    // Fail-open contract (FR-H5 / NFR-5): JSON.parse throw must NOT propagate
    // up and crash the hook process — stderr gets the site-specific tag and
    // the hook exits 0 so Claude Code does not interpret StopFailure handler
    // failure as a hard stop signal.
    const stdin = "{ this is not json";
    const r = spawnHook(stdin);
    expect(r.exitCode).toBe(0);
    expect(norm(r.stderr)).toContain("stop-failure-handler: malformed stdin");
  });
});
