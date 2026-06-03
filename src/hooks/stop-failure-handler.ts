import process from "node:process";
import { appendBrainEvent } from "./lib/project-brain.js";

const ERROR_TYPE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  rate_limit: "Anthropic API 429 — request throttled",
  authentication_failed: "Anthropic API 401 — credentials rejected",
  oauth_org_not_allowed: "Org-level OAuth deny — workspace not permitted",
  billing_error: "Account billing fault — payment / quota issue",
  invalid_request: "Malformed request from Claude — client-side bug",
  model_not_found: "Requested model unavailable",
  server_error: "Anthropic 5xx — upstream server error",
  max_output_tokens: "Hit response token limit — output truncated",
  unknown: "Catch-all — Claude Code did not classify the failure",
};

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

function readString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function extractErrorType(obj: Record<string, unknown>): string {
  for (const key of ["error_type", "errorType", "matcher"]) {
    const value = readString(obj, key);
    if (value) return value;
  }
  for (const value of Object.values(obj)) {
    if (
      typeof value === "string" &&
      value in ERROR_TYPE_DESCRIPTIONS &&
      value !== "unknown"
    ) {
      return value;
    }
  }
  return "unknown";
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

  if (typeof payload !== "object" || payload === null) {
    process.exit(0);
  }
  const obj = payload as Record<string, unknown>;

  const errorType = extractErrorType(obj);
  const cwd = readString(obj, "cwd");
  const description =
    ERROR_TYPE_DESCRIPTIONS[errorType] ??
    "unrecognised error_type (echoed verbatim from stdin)";

  if (cwd !== undefined) {
    appendBrainEvent(cwd, {
      type: "last-mile-decision",
      phase: "recovering",
      reason: `StopFailure ${errorType}: ${description}`,
    });
  }

  process.stderr.write(`[StopFailure:${errorType}] ${description}\n`);
  process.exit(0);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`stop-failure-handler: ${msg}\n`);
  process.exit(0);
});
