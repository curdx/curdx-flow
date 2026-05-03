/**
 * Read JSON from stdin via async iterator.
 *
 * Contract (per design.md "Stdin/Stdout Contract"):
 *  - Empty stdin → return `{}` (graceful default).
 *  - Invalid JSON → log to stderr + `process.exit(0)` (graceful skip;
 *    NEVER exit 1 — that would block the Claude Code session per FR-8).
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
    process.exit(0);
  }
}
