
import process from "node:process";
import { appendBrainEvent } from "./lib/project-brain.js";

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

    const trimmed = raw.trim();
  if (trimmed.length === 0) {
    process.exit(0);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    process.stderr.write("stop-failure-handler: malformed stdin\n");
    process.exit(0);
  }

  const matcher =
    typeof payload === "object" &&
    payload !== null &&
    "matcher" in payload &&
    typeof (payload as { matcher: unknown }).matcher === "string"
      ? (payload as { matcher: string }).matcher
      : "unknown";
  const cwd =
    typeof payload === "object" &&
    payload !== null &&
    "cwd" in payload &&
    typeof (payload as { cwd: unknown }).cwd === "string"
      ? (payload as { cwd: string }).cwd
      : undefined;

      const description =
    MATCHER_DESCRIPTIONS[matcher] ??
    `unrecognised matcher (echoed verbatim from stdin)`;

  if (cwd !== undefined) {
    appendBrainEvent(cwd, {
      type: "last-mile-decision",
      phase: "recovering",
      reason: `StopFailure ${matcher}: ${description}`,
    });
  }

  process.stderr.write(`[StopFailure:${matcher}] ${description}\n`);
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
