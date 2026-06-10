// Empty stdin → {}. Invalid JSON → stderr + throw; run-hook's central catch
// exits 0 so the Claude Code session is never blocked.
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
