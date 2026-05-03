// tests/hooks/lib/_lib-helpers.ts
//
// Shared spawn helpers for lib unit tests. Each lib is invoked as a child
// `node` process pointing at its built bundle under
// `plugins/curdx-flow/hooks/scripts/lib/<name>.mjs`.
//
// Kept separate from `tests/hooks/_helpers.ts` (which is owned by the
// parallel sibling task 3.3 for hook smoke tests) to avoid race conditions
// during parallel batch execution.

import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir as osTmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

export interface RunLibResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  json?: unknown;
}

export interface RunLibOptions {
  input?: string;
  env?: Record<string, string>;
  cwd?: string;
}

/**
 * Spawn a lib bundle (`plugins/curdx-flow/hooks/scripts/lib/<libName>.mjs`)
 * with the provided argv. Returns exit code + captured stdout/stderr.
 * If stdout parses as JSON, exposes the parsed value as `json`.
 */
export function runLib(
  libName: string,
  args: string[],
  options: RunLibOptions = {},
): RunLibResult {
  const bundle = path.join(
    REPO_ROOT,
    "plugins",
    "curdx-flow",
    "hooks",
    "scripts",
    "lib",
    `${libName}.mjs`,
  );
  const env = { ...process.env, ...(options.env ?? {}) };
  const result = spawnSync("node", [bundle, ...args], {
    input: options.input,
    env,
    cwd: options.cwd ?? process.cwd(),
    encoding: "utf8",
    timeout: 5000,
  });
  let json: unknown;
  try {
    const trimmed = result.stdout.trim();
    if (trimmed.length > 0) {
      json = JSON.parse(trimmed);
    }
  } catch {
    // leave json undefined for non-JSON stdout libs
  }
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
    json,
  };
}

/**
 * Create a unique temp dir for a single test. Caller is responsible for
 * cleanup (typically via `rmSync(dir, { recursive: true, force: true })`
 * in a `finally` block).
 */
export function makeTmpDir(label: string): string {
  return mkdtempSync(path.join(osTmpdir(), `cflow-libtest-${label}-`));
}
