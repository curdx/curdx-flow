import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const PLUGIN_ROOT = path.join(REPO_ROOT, "plugins/curdx-flow");
const HOOKS_DIR = path.join(PLUGIN_ROOT, "hooks/scripts");

export interface RunHookResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  json: unknown | undefined; // parsed JSON if stdout was a single JSON object
}

export interface RunHookOptions {
  /** Override cwd (defaults to REPO_ROOT, or fixture.cwd for invocation-spec fixtures) */
  cwd?: string;
  /** Extra env vars (merged on top of process.env) */
  env?: Record<string, string>;
  /** Extra argv tail (after fixture.args, if any) */
  args?: string[];
}

/**
 * Spawn one of the four v7 hook bundles with a fixture as input.
 *
 * The fixture file is interpreted in one of two ways:
 *   - **stdin fixtures** (load-spec-context, quick-mode-guard, stop-watcher): the
 *     entire file body is piped to stdin verbatim. argv is empty unless
 *     `options.args` is given.
 *   - **invocation-spec fixtures** (update-spec-index): the file is parsed as
 *     `{cwd, args}` and used to set the spawn cwd + argv. stdin is empty.
 *
 * Detection: if the fixture parses as JSON with a top-level `cwd` field and no
 * `hookEvent` field, it's treated as an invocation-spec.
 */
export function runHook(
  hookName: string,
  fixturePath: string,
  options: RunHookOptions = {},
): RunHookResult {
  const bundle = path.join(HOOKS_DIR, `${hookName}.mjs`);
  const fixtureBody = readFileSync(path.join(REPO_ROOT, fixturePath), "utf8");

  let stdin = fixtureBody;
  let cwd = options.cwd ?? REPO_ROOT;
  let args: string[] = options.args ?? [];

  // Try to detect invocation-spec format
  try {
    const parsed = JSON.parse(fixtureBody);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.cwd === "string" &&
      Array.isArray(parsed.args) &&
      typeof parsed.hookEvent !== "string"
    ) {
      // Invocation-spec format (update-spec-index): cwd + args, no stdin.
      stdin = "";
      cwd = options.cwd ?? parsed.cwd;
      args = [...parsed.args, ...(options.args ?? [])];
    } else if (
      options.cwd &&
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.cwd === "string"
    ) {
      // Stdin-fixture format (load-spec-context, quick-mode-guard, stop-watcher):
      // when the caller supplied an override cwd, rewrite the fixture's `cwd`
      // field so the hook sees the cross-platform temp dir created by
      // `createFixtureSpec()` (Bug 2 fix in v7.0.0-beta.1). The original
      // fixture JSON's `cwd` (e.g., "/tmp/curdx-fixture-spec") is irrelevant
      // on Windows; we substitute the runtime path here.
      parsed.cwd = options.cwd;
      stdin = JSON.stringify(parsed);
    }
  } catch {
    // Not JSON -> treated as raw stdin (e.g., malformed-input fixtures)
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    CURDX_CWD: cwd,
    ...options.env,
  };

  const result = spawnSync("node", [bundle, ...args], {
    input: stdin,
    cwd,
    env,
    encoding: "utf8",
    timeout: 5000,
  });

  // Bug 1 fix (v7.0.0-beta.1): on Windows, spawnSync may return `stdout`/`stderr`
  // as `undefined` (instead of "") when the child exits via uncaught exception
  // before producing output. Nullish-coalesce both before any string ops.
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  let json: unknown | undefined;
  const trimmed = stdout.trim();
  if (trimmed.length > 0) {
    try {
      json = JSON.parse(trimmed);
    } catch {
      json = undefined;
    }
  }

  return {
    exitCode: result.status ?? -1,
    stdout,
    stderr,
    json,
  };
}
