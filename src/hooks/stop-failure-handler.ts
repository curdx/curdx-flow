// DO NOT MERGE INTO stop-watcher.ts — see design.md D3 (separate-file rationale).
//
// stop-watcher.ts is already 903 LOC after spec-A; StopFailure is observability-only,
// runs on a different event, and must not re-bloat the Stop hook entry. Keep it here.

/**
 * Stop hook — `StopFailure` event observability handler.
 *
 * Background (research.md): `StopFailure` is GA in Claude Code as of 2026-05.
 * It fires when the Stop hook itself errors out (e.g. Anthropic API 429,
 * billing fault, malformed request). The event is **observability-only**:
 *
 *   - stdout is ignored
 *   - exit code is ignored
 *   - the handler cannot block, retry, or redirect the session
 *
 * All this hook does is log a single line to **stderr** so a human debugging a
 * stalled loop can grep for `[StopFailure:<matcher>]` and learn why the Stop
 * hook upstream died. Anything fancier would be silently discarded.
 *
 * Stdin shape (from Anthropic hook spec):
 *   { matcher: "rate_limit" | "authentication_failed" | ... | "unknown",
 *     ...other envelope fields ignored }
 *
 * Matcher table mirrors research.md §"StopFailure GA verdict — DEFINITIVE"
 * (8 matchers). The `unknown` entry is the catch-all — but we still echo any
 * truly-unrecognised matcher verbatim (R4 mitigation: don't strict-enum, future
 * Claude Code releases may add matchers we haven't enumerated yet).
 *
 * Error policy (FR-H5 / NFR-5 / fail-open):
 *   ANY throw — malformed JSON, unreadable stdin, anything else — is caught,
 *   logged with a `stop-failure-handler:` prefix, and the process exits 0.
 *   This hook MUST NEVER block the Claude Code session, even on its own bugs.
 *
 * Why no `runHook` wrapper:
 *   `runHook` (used by the other 4 hooks) emits a generic `[hook] <msg>` on
 *   error. StopFailure observability wants a site-specific tag — humans grep
 *   for `[StopFailure:` in stderr and the malformed-stdin path is part of the
 *   contract (FR-H5 spelled out the exact stderr text). Direct stdin read +
 *   own try/catch keeps the output shape fully under this file's control.
 */
import process from "node:process";

import { buildCorrelationId } from "./_shared/correlation.ts";
import * as eventLog from "./_shared/error-logger.ts";

/**
 * 8-matcher human-readable description map. Source: research.md table.
 * Keep in sync with Anthropic's matcher list — adding a 9th matcher is a
 * 1-line addition here; unrecognised matchers fall through to the verbatim
 * echo path below (R4: don't strict-enum on a moving target).
 */
const MATCHER_DESCRIPTIONS: Readonly<Record<string, string>> = {
  rate_limit: "Anthropic API 429 — request throttled",
  authentication_failed: "Anthropic API 401 — credentials rejected",
  oauth_org_not_allowed: "Org-level OAuth deny — workspace not permitted",
  billing_error: "Account billing fault — payment / quota issue",
  invalid_request: "Malformed request from Claude — client-side bug",
  server_error: "Anthropic 5xx — upstream server error",
  max_output_tokens: "Hit response token limit — output truncated",
  unknown: "Catch-all — Claude Code did not classify the failure",
};

/**
 * Read all of stdin into a single UTF-8 string. Resolves with `""` on empty
 * stdin (CLI / test harness with no piped JSON).
 */
function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on("end", () =>
      resolve(Buffer.concat(chunks).toString("utf8")),
    );
    process.stdin.on("error", reject);
  });
}

async function main(): Promise<void> {
  let raw = "";
  try {
    raw = await readStdin();
  } catch {
    process.stderr.write("stop-failure-handler: stdin read failed\n");
    process.exit(0);
  }

  // Empty stdin (manual invocation, smoke test) → log nothing, exit clean.
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    process.exit(0);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    process.stderr.write("stop-failure-handler: malformed stdin\n");
    // Site 3: error path — malformed stdin. correlationId is unavailable
    // (StopFailure envelope has no spec/session context), so pass null/null.
    eventLog.logHookEvent({
      hook: "stop-failure-handler",
      event: "StopFailure",
      level: "error",
      kind: "unknown",
      msg: "malformed stdin",
      correlationId: buildCorrelationId(null, null),
    });
    process.exit(0);
  }

  const matcher =
    typeof payload === "object" &&
    payload !== null &&
    "matcher" in payload &&
    typeof (payload as { matcher: unknown }).matcher === "string"
      ? (payload as { matcher: string }).matcher
      : "unknown";

  // Echo unrecognised matchers verbatim (R4: don't strict-enum). Falls back
  // to the `unknown` description only if the field was missing or non-string.
  const description =
    MATCHER_DESCRIPTIONS[matcher] ??
    `unrecognised matcher (echoed verbatim from stdin)`;

  process.stderr.write(`[StopFailure:${matcher}] ${description}\n`);

  // Sites 1 & 2: matcher dispatch. rate_limit is the highest-signal matcher
  // (most common cause of stalled loops) and gets its own kind so analyze can
  // count throttling separately from the long-tail of other failure modes.
  if (matcher === "rate_limit") {
    eventLog.logHookEvent({
      hook: "stop-failure-handler",
      event: "StopFailure",
      level: "info",
      kind: "stop_failure_rate_limit",
      payload: { matcher, description },
      correlationId: buildCorrelationId(null, null),
    });
  } else {
    eventLog.logHookEvent({
      hook: "stop-failure-handler",
      event: "StopFailure",
      level: "info",
      kind: "stop_failure_other",
      payload: { matcher, description },
      correlationId: buildCorrelationId(null, null),
    });
  }

  process.exit(0);
}

main().catch((err) => {
  // Last-resort fail-open: any uncaught throw above (Promise rejection from
  // stdin stream, exotic runtime errors, etc.) lands here. FR-H5 contract:
  // log to stderr with the site tag, exit 0, never block the Claude session.
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`stop-failure-handler: ${msg}\n`);
  process.exit(0);
});
