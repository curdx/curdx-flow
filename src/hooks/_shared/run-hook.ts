/**
 * Shared hook runner — wraps every hook's main() with the unified envelope:
 *
 *   1. Optionally read JSON envelope from stdin (off for CLI-driven scripts
 *      such as update-spec-index that take argv instead).
 *   2. Invoke the user-supplied handler with the parsed `HookStdin` payload.
 *   3. If the handler returns a `HookOutput`, serialize it to stdout
 *      (newline-terminated, byte-equal to v6 baseline). If the handler
 *      returns `void`/`undefined`, emit nothing — handler owns its own
 *      side effects (used by stop-watcher and update-spec-index, which
 *      conditionally emit zero-or-many JSON payloads).
 *   4. Always exit 0 — even on caught errors (FR-8 / Failure Modes contract:
 *      a hook MUST NOT block the Claude Code session, regardless of fault).
 *
 * Error policy:
 *   Any throw inside `readStdinJson` or `handler` is caught here, logged to
 *   stderr with a `[hook]` prefix, and the process exits 0. Hooks that need
 *   per-site stderr context (e.g. `[quick-mode-guard] error: …`) can still
 *   throw — the wrapper preserves the message verbatim, only swapping the
 *   site-specific tag for a generic one. Hooks remain free to emit their own
 *   structured stderr inside the handler before throwing.
 *
 * Design choice — why a wrapper rather than each hook owning its try/catch:
 *   Pre-2.2, all 4 hooks ended in an identical 6-line `main().catch(...)`
 *   block that wrote `[<name>] error: ${msg}` to stderr and called
 *   `process.exit(0)`. Centralizing the boilerplate eliminates drift (e.g.,
 *   one hook accidentally `process.exit(1)` would silently break Claude
 *   Code sessions), and gives us a single seam to add structured logging /
 *   metrics later without touching every hook.
 *
 * NOT changed by this wrapper:
 *   - Hook business logic, stdout/stderr ordering, or exit timing.
 *   - The `readStdinJson` graceful path: empty stdin → `{}` (still default).
 *   - `process.exit(0)` calls inside handlers — handlers may short-circuit
 *     the wrapper at any point. The wrapper's try/catch only fires for
 *     uncaught errors, never for happy-path explicit exits.
 */
import path from "node:path";
import process from "node:process";
import { logHookError } from "./error-logger.js";
import { readStdinJson } from "./stdin.js";
import type { HookOutput, HookStdin } from "./types.js";

/**
 * Derive a logger-friendly hook name from `process.argv[1]`. Falls back to
 * `'unknown-hook'` if argv is empty (vitest harness, REPL, etc.).
 */
function deriveHookName(): string {
  const entry = process.argv[1];
  if (!entry) return "unknown-hook";
  return path.basename(entry).replace(/\.(mjs|js|ts)$/, "");
}

/**
 * Handler signature passed to `runHook`.
 *  - `stdin` is the parsed JSON envelope (may be `{}` for CLI scripts that
 *    skip stdin parsing or for empty stdin streams).
 *  - Return a `HookOutput` to have the wrapper emit it on stdout, or return
 *    `void`/`undefined` if the handler manages its own stdout writes.
 */
export type HookHandler = (stdin: HookStdin) => Promise<HookOutput | void>;

export interface RunHookOptions {
  /**
   * When `false`, skip stdin reading and pass `{}` to the handler. Used by
   * update-spec-index, which is argv-driven and would hang on TTY stdin.
   * Defaults to `true` (the standard Claude Code hook contract).
   */
  readStdin?: boolean;
}

export async function runHook(
  handler: HookHandler,
  options: RunHookOptions = {},
): Promise<void> {
  const { readStdin = true } = options;
  const hookName = deriveHookName();
  let stdinForCtx: HookStdin = {} as HookStdin;
  try {
    try {
      stdinForCtx = readStdin
        ? await readStdinJson<HookStdin>()
        : ({} as HookStdin);
    } catch (parseErr) {
      // stdin.ts already exits on parse failure, but if a future change
      // surfaces the throw instead, fan it out to the error log first.
      const e = parseErr instanceof Error ? parseErr : new Error(String(parseErr));
      logHookError(
        {
          hook: hookName,
          event: "stdin_parse",
          msg: e.message,
          stack: e.stack ?? "",
        },
        e,
      );
      throw e;
    }
    const output = await handler(stdinForCtx);
    if (output !== undefined && output !== null) {
      process.stdout.write(JSON.stringify(output) + "\n");
    }
    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack ?? "" : "";
    logHookError(
      {
        hook: hookName,
        event: "uncaught",
        msg,
        stack,
        ...(typeof stdinForCtx.cwd === "string" ? { cwd: stdinForCtx.cwd } : {}),
        ...(typeof stdinForCtx.transcript_path === "string"
          ? { transcript_path: stdinForCtx.transcript_path }
          : {}),
      },
      err instanceof Error ? err : undefined,
    );
    process.stderr.write(`[hook] ${msg}\n`);
    // FR-8: NEVER block the Claude session — exit 0 even on uncaught errors.
    process.exit(0);
  }
}
