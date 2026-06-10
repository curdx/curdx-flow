/**
 * Shared hook runner. Always exits 0 — even on uncaught errors — because a
 * hook must never block the Claude Code session. Handlers returning a
 * `HookOutput` get it serialized to stdout; `void` handlers own their own
 * writes; explicit `process.exit(0)` inside a handler short-circuits the
 * wrapper.
 */
import path from "node:path";
import process from "node:process";
import { logHookError } from "./error-logger.js";
import { readStdinJson } from "./stdin.js";
import type { HookOutput, HookStdin } from "./types.js";

function deriveHookName(): string {
  const entry = process.argv[1];
  if (!entry) return "unknown-hook";
  return path.basename(entry).replace(/\.(mjs|js|ts)$/, "");
}

export type HookHandler = (stdin: HookStdin) => Promise<HookOutput | void>;

export interface RunHookOptions {
  /** `false` skips stdin and passes `{}` — argv-driven scripts would hang on TTY stdin. */
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
    // never block the Claude session — exit 0 even on uncaught errors
    process.exit(0);
  }
}
