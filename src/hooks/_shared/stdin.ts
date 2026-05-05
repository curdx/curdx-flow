/**
 * Read JSON from stdin via async iterator.
 *
 * Contract (per design.md "Stdin/Stdout Contract"):
 *  - Empty stdin → return `{}` (graceful default).
 *  - Invalid JSON → log to stderr + throw (run-hook.ts central catch handles
 *    graceful exit per FR-8 — it calls logHookError to record the failure in
 *    ~/.claude/curdx-flow/errors.jsonl and then exits 0 so the Claude Code
 *    session is never blocked).
 *
 * Usage:
 *   const input = await readStdinJson<{ cwd?: string }>();
 */
import process from 'node:process';

export async function readStdinJson<T = unknown>(): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[hook] invalid stdin JSON: ${msg}\n`);
    throw e;
  }
}
